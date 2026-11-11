/**
 * PocketLedger Legacy Schema Migration Engine (v1 -> v2)
 *
 * Pure, side-effect-free migration module that transforms legacy (v1)
 * localStorage data into canonical (v2) integer-paise schema while
 * strictly preserving historical balance effects and identifying ambiguous items
 * for user review.
 */

import {
  PARTY_USER,
  EVENT_KINDS,
  MAX_AMOUNT_PAISE,
  validateEvent,
  validateExpenseConservation,
  computePersonBalance,
  isPositiveInteger,
} from './ledger.js';
import { cleanPhoneNumber } from './upi-qr.js';

/**
 * Default generator for stable IDs.
 */
export function defaultIdGenerator() {
  return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
}

/**
 * Extracts a calendar date string 'YYYY-MM-DD' from legacy date representations
 * without UTC timezone shifting.
 */
export function extractCalendarDate(rawDate, fallbackDate = '2026-01-01') {
  if (typeof rawDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(rawDate.trim())) {
    const candidate = rawDate.trim().slice(0, 10);
    const [y, m, d] = candidate.split('-').map(Number);
    const testDate = new Date(Date.UTC(y, m - 1, d));
    if (
      testDate.getUTCFullYear() === y &&
      testDate.getUTCMonth() === m - 1 &&
      testDate.getUTCDate() === d
    ) {
      return candidate;
    }
  }

  // If number timestamp
  if (typeof rawDate === 'number' && Number.isFinite(rawDate) && rawDate > 0) {
    const d = new Date(rawDate);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return fallbackDate;
}

/**
 * Converts a floating-point Rupee amount into non-negative integer paise.
 * Returns { amountPaise, isExact, isValid, error }
 */
export function convertRupeesToPaise(rupees) {
  if (typeof rupees !== 'number' || !Number.isFinite(rupees) || isNaN(rupees)) {
    return { amountPaise: 0, isExact: false, isValid: false, error: 'Amount is not a finite number' };
  }

  if (rupees < 0) {
    return { amountPaise: 0, isExact: false, isValid: false, error: 'Amount cannot be negative' };
  }

  const exactPaise = rupees * 100;
  const roundedPaise = Math.round(exactPaise);

  if (roundedPaise > MAX_AMOUNT_PAISE) {
    return { amountPaise: 0, isExact: false, isValid: false, error: `Amount exceeds maximum supported limit (${MAX_AMOUNT_PAISE} paise)` };
  }

  const isExact = Math.abs(exactPaise - roundedPaise) < 1e-5;

  return {
    amountPaise: roundedPaise,
    isExact,
    isValid: true,
    error: null,
  };
}

/**
 * Pure migration function from Schema v1 to Canonical Schema v2.
 *
 * @param {object} legacyState - Raw v1 state object
 * @param {object} [options]
 * @param {function} [options.idGenerator] - Custom ID generator for deterministic test runs
 * @param {string} [options.fallbackDate] - Fallback date for unparseable dates
 * @returns {object} Migration result { success, migratedState, warnings, reviewItems, validationErrors }
 */
export function migrateV1ToV2(legacyState, options = {}) {
  const idGen = typeof options.idGenerator === 'function' ? options.idGenerator : defaultIdGenerator;
  const fallbackDate = typeof options.fallbackDate === 'string' ? options.fallbackDate : '2026-01-01';
  const currentTimestamp = typeof options.now === 'number' && Number.isFinite(options.now) ? options.now : Date.now();

  const warnings = [];
  const validationErrors = [];
  const reviewItems = {
    unclassifiedTransactions: [],
    unverifiedSettlements: [],
    pendingAlarms: [],
    ambiguousPeople: [],
    inconsistentRecords: [],
  };

  // 1. Input Validation
  if (!legacyState || typeof legacyState !== 'object' || Array.isArray(legacyState)) {
    return {
      success: false,
      migratedState: null,
      warnings,
      reviewItems,
      validationErrors: ['Legacy state must be a non-null object'],
    };
  }

  // If already Schema v2
  if (legacyState.schemaVersion === 2) {
    return {
      success: true,
      migratedState: structuredClone(legacyState),
      warnings: ['State is already Schema v2; no migration needed'],
      reviewItems,
      validationErrors,
    };
  }

  const rawTxns = Array.isArray(legacyState.transactions) ? legacyState.transactions : [];
  const rawPeople = Array.isArray(legacyState.people) ? legacyState.people : [];
  const rawAlarms = Array.isArray(legacyState.pendingAlarms) ? legacyState.pendingAlarms : [];
  const rawPaymentAttempts = Array.isArray(legacyState.paymentAttempts) ? legacyState.paymentAttempts : [];

  // 2. Person Identity Migration
  const migratedPeople = [];
  const personNameToId = new Map(); // normalized name -> personId
  const seenNameCounts = new Map();

  // First pass: Process existing people directory
  for (const p of rawPeople) {
    if (!p || typeof p !== 'object') continue;
    const rawName = typeof p.name === 'string' ? p.name.trim() : '';
    if (!rawName) continue;

    const count = (seenNameCounts.get(rawName) || 0) + 1;
    seenNameCounts.set(rawName, count);

    const personId = typeof p.id === 'string' && p.id.trim() ? p.id.trim() : idGen();
    const upiId = typeof p.upiId === 'string' ? p.upiId.trim() : '';
    const rawPhone = typeof p.phone === 'string' ? p.phone.trim() : (typeof p.phoneNumber === 'string' ? p.phoneNumber.trim() : '');
    const phone = rawPhone ? cleanPhoneNumber(rawPhone) : '';

    if (!personNameToId.has(rawName)) {
      personNameToId.set(rawName, personId);
      migratedPeople.push({
        id: personId,
        name: rawName,
        upiId,
        phone,
        isArchived: typeof p.isArchived === 'boolean' ? p.isArchived : false,
        createdAt: typeof p.createdAt === 'number' && Number.isFinite(p.createdAt) ? p.createdAt : currentTimestamp,
        updatedAt: currentTimestamp,
      });
    } else {
      // Duplicate person record with same name
      const primaryId = personNameToId.get(rawName);
      warnings.push(`Duplicate person directory entry found for name '${rawName}'`);
      reviewItems.ambiguousPeople.push({
        name: rawName,
        primaryId,
        duplicateId: personId,
        upiId,
        phone,
        reason: 'Multiple entries in legacy people directory with identical display name',
      });
    }
  }

  // Second pass: Ensure all counterparties appearing in transactions have a Person record
  for (const txn of rawTxns) {
    if (!txn || typeof txn !== 'object') continue;

    const namesToCheck = [];
    if (txn.type === 'split' && Array.isArray(txn.splits)) {
      for (const s of txn.splits) {
        if (s && typeof s.person === 'string' && s.person.trim()) {
          namesToCheck.push(s.person.trim());
        }
      }
    } else if (txn.type === 'personal_expense') {
      const rawPayer = (typeof txn.paidBy === 'string' ? txn.paidBy.trim() : '') ||
                       (typeof txn.payer === 'string' ? txn.payer.trim() : '') ||
                       (typeof txn.person === 'string' ? txn.person.trim() : '');
      const isUser = !rawPayer ||
                     rawPayer.toLowerCase() === 'user' ||
                     rawPayer.toLowerCase() === 'you' ||
                     rawPayer === PARTY_USER;
      if (!isUser) {
        namesToCheck.push(rawPayer);
      }
    } else if (typeof txn.person === 'string' && txn.person.trim()) {
      namesToCheck.push(txn.person.trim());
    }

    for (const name of namesToCheck) {
      if (!personNameToId.has(name)) {
        const newId = idGen();
        personNameToId.set(name, newId);
        migratedPeople.push({
          id: newId,
          name,
          upiId: '',
          phone: '',
          isArchived: false,
          createdAt: typeof txn.createdAt === 'number' ? txn.createdAt : currentTimestamp,
          updatedAt: currentTimestamp,
        });
        warnings.push(`Created synthetic person record for '${name}' referenced in transactions`);
      }
    }
  }

  // 3. Transactions Migration
  const migratedTransactions = [];

  for (let i = 0; i < rawTxns.length; i++) {
    const txn = rawTxns[i];
    if (!txn || typeof txn !== 'object') {
      warnings.push(`Skipped null or non-object transaction at index ${i}`);
      continue;
    }

    const eventId = typeof txn.id === 'string' && txn.id.trim() ? txn.id.trim() : idGen();
    const calendarDate = extractCalendarDate(txn.date, fallbackDate);
    const createdAt = typeof txn.createdAt === 'number' && Number.isFinite(txn.createdAt) ? txn.createdAt : currentTimestamp;
    const description = typeof txn.description === 'string' ? txn.description : '';
    const category = typeof txn.category === 'string' ? txn.category : 'Other';

    // Money conversion
    // For legacy adjustments, amount may be negative in legacy schema to represent downward adjustment.
    // In canonical v2, amountPaise is always positive and direction is governed by fromPartyId/toPartyId.
    const isNegativeAdjustment = txn.type === 'adjustment' && typeof txn.amount === 'number' && txn.amount < 0;
    const rawAmountToConvert = isNegativeAdjustment ? Math.abs(txn.amount) : txn.amount;

    const moneyConv = convertRupeesToPaise(rawAmountToConvert);
    if (!moneyConv.isValid) {
      validationErrors.push(`Transaction '${eventId}' has invalid amount: ${moneyConv.error}`);
      reviewItems.inconsistentRecords.push({
        recordId: eventId,
        rawRecord: txn,
        reason: `Invalid amount: ${moneyConv.error}`,
      });
      continue;
    }
    if (!moneyConv.isExact) {
      warnings.push(`Transaction '${eventId}' amount had fractional paise; rounded to ${moneyConv.amountPaise}p`);
    }
    const amountPaise = moneyConv.amountPaise;

    switch (txn.type) {
      case 'give': {
        const personName = typeof txn.person === 'string' ? txn.person.trim() : '';

        // Empty or whitespace-only person represents a solo personal expense paid by user
        if (!personName) {
          const event = {
            id: eventId,
            kind: EVENT_KINDS.EXPENSE,
            payerId: PARTY_USER,
            totalAmountPaise: amountPaise,
            userSharePaise: amountPaise,
            allocations: [],
            date: calendarDate,
            createdAt,
            description,
            category,
            paymentMethod: txn.paymentMethod || 'OTHER',
            metadata: {
              originalType: 'give',
              ...(txn.paymentAttemptId ? { paymentAttemptId: txn.paymentAttemptId } : {}),
              ...(txn.metadata && typeof txn.metadata === 'object' ? txn.metadata : {}),
            },
          };
          migratedTransactions.push(event);
          break;
        }

        const personId = personNameToId.get(personName) || idGen();

        const event = {
          id: eventId,
          kind: EVENT_KINDS.LEGACY_UNCLASSIFIED,
          legacyType: 'give',
          personId,
          amountPaise,
          date: calendarDate,
          createdAt,
          description,
          category,
          paymentMethod: txn.paymentMethod || 'OTHER',
          reviewRequired: true,
          metadata: {
            originalType: 'give',
            legacyPersonName: personName,
            note: 'Legacy give: balance effect +amount preserved. Review required to classify as peer loan or personal expense.',
            ...(txn.paymentAttemptId ? { paymentAttemptId: txn.paymentAttemptId } : {}),
            ...(txn.metadata && typeof txn.metadata === 'object' ? txn.metadata : {}),
          },
        };

        migratedTransactions.push(event);
        reviewItems.unclassifiedTransactions.push({
          eventId,
          legacyType: 'give',
          personId,
          personName,
          amountPaise,
        });
        break;
      }

      case 'personal_expense': {
        const rawPayer = (typeof txn.paidBy === 'string' ? txn.paidBy.trim() : '') ||
                         (typeof txn.payer === 'string' ? txn.payer.trim() : '') ||
                         (typeof txn.person === 'string' ? txn.person.trim() : '');
        const isPaidByUser = !rawPayer ||
                             rawPayer.toLowerCase() === 'user' ||
                             rawPayer.toLowerCase() === 'you' ||
                             rawPayer === PARTY_USER;

        let payerId = PARTY_USER;
        if (!isPaidByUser) {
          payerId = personNameToId.get(rawPayer) ||
                    migratedPeople.find((p) => p.id === rawPayer || p.name === rawPayer)?.id ||
                    idGen();
        }

        const event = {
          id: eventId,
          kind: EVENT_KINDS.EXPENSE,
          payerId,
          totalAmountPaise: amountPaise,
          userSharePaise: amountPaise,
          allocations: [],
          date: calendarDate,
          createdAt,
          description,
          category,
          paymentMethod: txn.paymentMethod || 'OTHER',
          metadata: {
            originalType: 'personal_expense',
            ...(rawPayer ? { legacyPayer: rawPayer } : {}),
            ...(txn.paymentAttemptId ? { paymentAttemptId: txn.paymentAttemptId } : {}),
            ...(txn.metadata && typeof txn.metadata === 'object' ? txn.metadata : {}),
          },
        };

        migratedTransactions.push(event);
        break;
      }

      case 'take': {
        const personName = typeof txn.person === 'string' ? txn.person.trim() : '';
        const personId = personNameToId.get(personName) || idGen();

        const event = {
          id: eventId,
          kind: EVENT_KINDS.LEGACY_UNCLASSIFIED,
          legacyType: 'take',
          personId,
          amountPaise,
          date: calendarDate,
          createdAt,
          description,
          category,
          paymentMethod: txn.paymentMethod || 'OTHER',
          reviewRequired: true,
          metadata: {
            originalType: 'take',
            legacyPersonName: personName,
            note: 'Legacy take: balance effect -amount preserved. Review required to classify as peer borrowing or counterparty-paid expense.',
            ...(txn.paymentAttemptId ? { paymentAttemptId: txn.paymentAttemptId } : {}),
            ...(txn.metadata && typeof txn.metadata === 'object' ? txn.metadata : {}),
          },
        };

        migratedTransactions.push(event);
        reviewItems.unclassifiedTransactions.push({
          eventId,
          legacyType: 'take',
          personId,
          personName,
          amountPaise,
        });
        break;
      }

      case 'settle':
      case 'repayment': {
        const personName = typeof txn.person === 'string' ? txn.person.trim() : '';
        const personId = (txn.personId && migratedPeople.find((p) => p.id === txn.personId)?.id) ||
                         personNameToId.get(personName) ||
                         migratedPeople.find((p) => p.id === personName || p.name === personName)?.id ||
                         idGen();
        const rawDirection = typeof txn.direction === 'string' ? txn.direction.trim().toLowerCase() : '';

        if (rawDirection === 'inflow') {
          const event = {
            id: eventId,
            kind: EVENT_KINDS.REPAYMENT,
            fromPartyId: personId,
            toPartyId: PARTY_USER,
            amountPaise,
            date: calendarDate,
            createdAt,
            description: description || 'Repayment received',
            category: txn.category || 'Settlement',
            paymentMethod: txn.paymentMethod || 'OTHER',
            metadata: {
              originalType: txn.type || 'settle',
              legacyPersonName: personName,
              direction: 'inflow',
              ...(txn.paymentAttemptId ? { paymentAttemptId: txn.paymentAttemptId } : {}),
              ...(txn.metadata && typeof txn.metadata === 'object' ? txn.metadata : {}),
            },
          };
          migratedTransactions.push(event);
          break;
        }

        if (rawDirection === 'outflow') {
          const event = {
            id: eventId,
            kind: EVENT_KINDS.REPAYMENT,
            fromPartyId: PARTY_USER,
            toPartyId: personId,
            amountPaise,
            date: calendarDate,
            createdAt,
            description: description || 'Repayment sent',
            category: txn.category || 'Settlement',
            paymentMethod: txn.paymentMethod || 'OTHER',
            metadata: {
              originalType: txn.type || 'settle',
              legacyPersonName: personName,
              direction: 'outflow',
              ...(txn.paymentAttemptId ? { paymentAttemptId: txn.paymentAttemptId } : {}),
              ...(txn.metadata && typeof txn.metadata === 'object' ? txn.metadata : {}),
            },
          };
          migratedTransactions.push(event);
          break;
        }

        // Truly ambiguous legacy settlement without explicit direction:
        // Retain existing LEGACY_UNCLASSIFIED treatment, balance effect (-amount), and review items.
        const event = {
          id: eventId,
          kind: EVENT_KINDS.LEGACY_UNCLASSIFIED,
          legacyType: 'settle',
          personId,
          amountPaise,
          date: calendarDate,
          createdAt,
          description,
          category: txn.category || 'Settlement',
          paymentMethod: txn.paymentMethod || 'OTHER',
          reviewRequired: true,
          metadata: {
            originalType: txn.type || 'settle',
            legacyPersonName: personName,
            directionUnverified: true,
            note: 'Legacy settlement: balance effect -amount preserved. Direction unverified; review required to confirm inflow vs outflow.',
            ...(txn.paymentAttemptId ? { paymentAttemptId: txn.paymentAttemptId } : {}),
            ...(txn.metadata && typeof txn.metadata === 'object' ? txn.metadata : {}),
          },
        };

        migratedTransactions.push(event);
        reviewItems.unverifiedSettlements.push({
          eventId,
          personId,
          personName,
          amountPaise,
        });
        break;
      }

      case 'adjustment': {
        const personName = typeof txn.person === 'string' ? txn.person.trim() : '';
        const personId = personNameToId.get(personName) || idGen();

        // In legacy: balances[person] += amount.
        // If amount was positive, user gave/adjusted up (+).
        // If amount was negative, user adjusted down (-).
        let fromPartyId = PARTY_USER;
        let toPartyId = personId;
        let adjPaise = amountPaise;

        if (txn.amount < 0) {
          fromPartyId = personId;
          toPartyId = PARTY_USER;
          adjPaise = Math.abs(amountPaise);
        }

        const event = {
          id: eventId,
          kind: EVENT_KINDS.ADJUSTMENT,
          fromPartyId,
          toPartyId,
          amountPaise: adjPaise,
          date: calendarDate,
          createdAt,
          description,
          category: txn.category || 'Adjustment',
          paymentMethod: txn.paymentMethod || 'OTHER',
          metadata: {
            originalType: 'adjustment',
            legacyPersonName: personName,
            ...(txn.paymentAttemptId ? { paymentAttemptId: txn.paymentAttemptId } : {}),
            ...(txn.metadata && typeof txn.metadata === 'object' ? txn.metadata : {}),
          },
        };

        migratedTransactions.push(event);
        break;
      }

      case 'split': {
        const rawSplits = Array.isArray(txn.splits) ? txn.splits : [];
        const rawMyShare = typeof txn.myShare === 'number' ? txn.myShare : 0;

        const myShareConv = convertRupeesToPaise(rawMyShare);
        let userSharePaise = myShareConv.isValid ? myShareConv.amountPaise : 0;

        const allocations = [];
        let allocationsSum = 0;
        let splitError = false;

        for (const s of rawSplits) {
          if (!s || typeof s !== 'object') continue;
          const pName = typeof s.person === 'string' ? s.person.trim() : '';
          const pId = personNameToId.get(pName);
          const sConv = convertRupeesToPaise(s.amount);

          if (!pId || !sConv.isValid) {
            splitError = true;
            break;
          }

          allocations.push({
            personId: pId,
            amountPaise: sConv.amountPaise,
          });
          allocationsSum += sConv.amountPaise;
        }

        const calculatedSum = userSharePaise + allocationsSum;
        const diff = calculatedSum - amountPaise;

        // Check if conservation holds or can be reconciled with small rounding diff (<= 2 paise)
        if (!splitError && Math.abs(diff) <= 2) {
          if (diff !== 0) {
            // Absorb minor floating point residual into user share
            userSharePaise = userSharePaise - diff;
            warnings.push(`Adjusted userSharePaise by ${-diff}p for exact conservation in split '${eventId}'`);
          }

          const event = {
            id: eventId,
            kind: EVENT_KINDS.EXPENSE,
            payerId: PARTY_USER,
            totalAmountPaise: amountPaise,
            userSharePaise,
            allocations,
            date: calendarDate,
            createdAt,
            description,
            category,
            paymentMethod: txn.paymentMethod || 'OTHER',
            metadata: {
              originalType: 'split',
              ...(txn.paymentAttemptId ? { paymentAttemptId: txn.paymentAttemptId } : {}),
              ...(txn.metadata && typeof txn.metadata === 'object' ? txn.metadata : {}),
            },
          };

          const conservation = validateExpenseConservation(event);
          if (conservation.isValid) {
            migratedTransactions.push(event);
            break;
          }
        }

        // If split cannot be cleanly validated as canonical EXPENSE, preserve historical balance effects
        warnings.push(`Split transaction '${eventId}' has conservation variance of ${diff}p; preserved as unclassified legacy record`);
        reviewItems.inconsistentRecords.push({
          recordId: eventId,
          rawRecord: txn,
          reason: `Split conservation variance: allocations (${calculatedSum}p) != totalAmount (${amountPaise}p)`,
        });

        // Preserve individual balance effects by creating individual unclassified entries
        for (let sIdx = 0; sIdx < allocations.length; sIdx++) {
          const alloc = allocations[sIdx];
          migratedTransactions.push({
            id: `${eventId}_s${sIdx}`,
            kind: EVENT_KINDS.LEGACY_UNCLASSIFIED,
            legacyType: 'give',
            personId: alloc.personId,
            amountPaise: alloc.amountPaise,
            date: calendarDate,
            createdAt: createdAt + sIdx,
            description: `${description} (Split allocation)`,
            category,
            paymentMethod: txn.paymentMethod || 'OTHER',
            reviewRequired: true,
            metadata: {
              originalType: 'split',
              parentSplitId: eventId,
              ...(txn.metadata && typeof txn.metadata === 'object' ? txn.metadata : {}),
            },
          });
        }
        break;
      }

      default: {
        warnings.push(`Transaction '${eventId}' has unknown legacy type '${txn.type}'; preserved as raw record`);
        reviewItems.inconsistentRecords.push({
          recordId: eventId,
          rawRecord: txn,
          reason: `Unknown legacy type '${txn.type}'`,
        });
      }
    }
  }

  // 4. Pending Alarms Migration (Strictly for review; never auto-committed to ledger)
  const migratedPendingAlarms = [];
  for (const alarm of rawAlarms) {
    if (!alarm || typeof alarm !== 'object') continue;
    const alarmId = typeof alarm.id === 'string' && alarm.id.trim() ? alarm.id.trim() : idGen();
    const personName = typeof alarm.personName === 'string' ? alarm.personName.trim() : '';
    const personId = personNameToId.get(personName) || null;
    const conv = convertRupeesToPaise(alarm.amount);

    const migratedAlarm = {
      id: alarmId,
      txnId: typeof alarm.txnId === 'string' ? alarm.txnId : null,
      personId,
      personName,
      amountPaise: conv.isValid ? conv.amountPaise : 0,
      direction: alarm.direction === 'gave' ? 'gave' : 'settled',
      createdAt: typeof alarm.createdAt === 'number' ? alarm.createdAt : currentTimestamp,
      reviewStatus: 'PENDING_USER_REVIEW',
    };

    migratedPendingAlarms.push(migratedAlarm);
    reviewItems.pendingAlarms.push(migratedAlarm);
  }

  // 5. Payment Attempts Migration
  const migratedPaymentAttempts = [];
  for (let i = 0; i < rawPaymentAttempts.length; i++) {
    const att = rawPaymentAttempts[i];
    if (!att || typeof att !== 'object') {
      warnings.push(`Skipped invalid or non-object payment attempt at index ${i}`);
      continue;
    }

    const attemptId = typeof att.id === 'string' && att.id.trim() ? att.id.trim() : idGen();
    const cleanType = typeof att.type === 'string' && att.type.trim() ? att.type.trim() : 'UPI';
    const cleanRecipientName = typeof att.recipientName === 'string' ? att.recipientName.trim() : '';
    const cleanUpiId = typeof att.recipientUpiId === 'string' ? att.recipientUpiId.trim() : '';

    // Recipient Party ID resolution:
    // 1. If recipientPartyId is explicitly provided, verify/preserve it.
    // 2. If missing/null, resolve through exact match against existing contacts in migratedPeople.
    // 3. Do not generate synthetic people or guess ambiguous identities (seenNameCounts > 1).
    let recipientPartyId = null;
    if (typeof att.recipientPartyId === 'string' && att.recipientPartyId.trim()) {
      recipientPartyId = att.recipientPartyId.trim();
    } else if (cleanRecipientName) {
      if ((seenNameCounts.get(cleanRecipientName) || 0) <= 1) {
        recipientPartyId = personNameToId.get(cleanRecipientName) || null;
      }
    }

    // Money normalization:
    // If amountPaise is already a finite non-negative integer, preserve it.
    // Otherwise, convert from amountRupees or legacy amount.
    let amountPaise = 0;
    let amountRupees = 0;

    if (typeof att.amountPaise === 'number' && Number.isFinite(att.amountPaise) && att.amountPaise >= 0) {
      amountPaise = Math.round(att.amountPaise);
      amountRupees = typeof att.amountRupees === 'number' && Number.isFinite(att.amountRupees)
        ? att.amountRupees
        : amountPaise / 100;
    } else {
      const rawRupees = typeof att.amountRupees === 'number' && Number.isFinite(att.amountRupees)
        ? att.amountRupees
        : (typeof att.amount === 'number' && Number.isFinite(att.amount) ? att.amount : 0);
      const conv = convertRupeesToPaise(rawRupees);
      amountPaise = conv.isValid ? conv.amountPaise : 0;
      amountRupees = rawRupees;
    }

    const intentUrl = typeof att.intentUrl === 'string' ? att.intentUrl : '';

    // Preserve exact status, including unknown but valid custom status values
    const status = typeof att.status === 'string' && att.status.trim() ? att.status.trim() : 'INITIATED';

    const initiatedAt = typeof att.initiatedAt === 'number' && Number.isFinite(att.initiatedAt)
      ? att.initiatedAt
      : (typeof att.createdAt === 'number' && Number.isFinite(att.createdAt) ? att.createdAt : currentTimestamp);

    const reconciledAt = typeof att.reconciledAt === 'number' && Number.isFinite(att.reconciledAt)
      ? att.reconciledAt
      : null;

    const reconciliationNotes = typeof att.reconciliationNotes === 'string' ? att.reconciliationNotes : '';

    const eventId = typeof att.eventId === 'string' && att.eventId.trim() ? att.eventId.trim() : null;

    const isUnresolved = typeof att.isUnresolved === 'boolean'
      ? att.isUnresolved
      : (status === 'INITIATED' || status === 'UNKNOWN');

    const metadata = att.metadata && typeof att.metadata === 'object' && !Array.isArray(att.metadata)
      ? { ...att.metadata }
      : {};

    const migratedAttempt = {
      id: attemptId,
      type: cleanType,
      recipientPartyId,
      recipientName: cleanRecipientName,
      recipientUpiId: cleanUpiId,
      amountPaise,
      amountRupees,
      intentUrl,
      status,
      initiatedAt,
      reconciledAt,
      reconciliationNotes,
      eventId,
      isUnresolved,
      metadata,
    };

    migratedPaymentAttempts.push(migratedAttempt);
  }

  // 6. Settings Preservation
  const rawSettings = legacyState.settings && typeof legacyState.settings === 'object' ? legacyState.settings : {};
  const budgetConv = convertRupeesToPaise(rawSettings.monthlyBudget || 0);

  const migratedSettings = {
    currencySymbol: typeof rawSettings.currency === 'string' && rawSettings.currency.trim() ? rawSettings.currency.trim() : '₹',
    monthlyBudgetPaise: budgetConv.isValid ? budgetConv.amountPaise : 0,
    theme: 'graphite',
  };

  // Preserve any custom categories
  const categories = Array.isArray(legacyState.categories) && legacyState.categories.length > 0
    ? [...legacyState.categories]
    : ['Food', 'Transport', 'Shopping', 'Entertainment', 'Bills', 'Health', 'Education', 'Other'];

  // 7. Validation of Migrated State
  for (const event of migratedTransactions) {
    const val = validateEvent(event);
    if (!val.isValid) {
      validationErrors.push(`Migrated event '${event.id}' failed canonical validation: ${val.error}`);
    }
  }

  const success = validationErrors.length === 0;

  const migratedState = {
    schemaVersion: 2,
    transactions: migratedTransactions,
    people: migratedPeople,
    categories,
    paymentAttempts: migratedPaymentAttempts,
    pendingReviews: {
      ...reviewItems,
      migratedAlarms: migratedPendingAlarms,
    },
    settings: migratedSettings,
    _rawLegacyBackup: structuredClone(legacyState),
  };

  return {
    success,
    migratedState: success ? migratedState : null,
    warnings,
    reviewItems,
    validationErrors,
  };
}
