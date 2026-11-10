/**
 * PocketLedger Store Core & Integration Engine
 *
 * Implements pure state management, LocalStorage persistence, canonical v2 logic,
 * safe v1-to-v2 controlled migration, rollback verification, and a compatibility adapter
 * for legacy UI screens.
 */

import {
  PARTY_USER,
  EVENT_KINDS,
  computePersonBalance,
  computeAllBalances,
  computeMonthlyPersonalSpending,
  validateEvent,
  validateChronologicalRepayments,
  validateEventMutation,
  createEqualSplitExpense,
  sortEventsChronologically,
  computeEventBalanceDelta,
} from './ledger.js';

import {
  migrateV1ToV2,
  convertRupeesToPaise,
  extractCalendarDate,
  defaultIdGenerator,
} from './migrate-v1-to-v2.js';

export const PRIMARY_STORAGE_KEY = 'pocketledger_data';
export const BACKUP_STORAGE_KEY = 'pocketledger_v1_backup';

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Validates a UPI ID according to standard handle format (username@provider).
 */
export function isValidUpiId(upiId) {
  if (typeof upiId !== 'string') return false;
  const trimmed = upiId.trim();
  return /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(trimmed);
}

/**
 * Creates default Canonical Schema v2 state.
 */
export function defaultStateV2() {
  return {
    schemaVersion: 2,
    transactions: [],
    people: [],
    categories: ['Food', 'Transport', 'Shopping', 'Entertainment', 'Bills', 'Health', 'Education', 'Other'],
    paymentAttempts: [],
    pendingReviews: {
      unclassifiedTransactions: [],
      unverifiedSettlements: [],
      pendingAlarms: [],
      ambiguousPeople: [],
      inconsistentRecords: [],
      migratedAlarms: [],
    },
    settings: {
      currencySymbol: '₹',
      monthlyBudgetPaise: 0,
      theme: 'graphite',
    },
    _rawLegacyBackup: null,
  };
}

/**
 * Creates default Legacy Schema v1 state.
 */
export function defaultStateV1() {
  return {
    transactions: [],
    people: [],
    categories: ['Food', 'Transport', 'Shopping', 'Entertainment', 'Bills', 'Health', 'Education', 'Other'],
    pendingAlarms: [],
    settings: {
      currency: '₹',
      monthlyBudget: 0,
    },
  };
}

/**
 * Core Store Manager class (independently testable with any Storage mock).
 */
export class StoreCore {
  constructor({ storage = (typeof localStorage !== 'undefined' ? localStorage : null), idGenerator = defaultIdGenerator } = {}) {
    this.storage = storage;
    this.idGenerator = idGenerator;
    this.listeners = new Set();
    this.state = this.loadInitialState();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    for (const listener of this.listeners) {
      try {
        listener(this.getState());
      } catch (err) {
        console.error('Store listener error:', err);
      }
    }
  }

  loadInitialState() {
    if (!this.storage) return defaultStateV2();

    try {
      const raw = this.storage.getItem(PRIMARY_STORAGE_KEY);
      if (!raw) return defaultStateV2();

      const parsed = JSON.parse(raw);
      if (parsed && parsed.schemaVersion === 2) {
        return parsed;
      }
      // Detected Schema v1: keep raw v1 state intact
      return parsed;
    } catch {
      return defaultStateV2();
    }
  }

  saveCurrentState() {
    if (!this.storage) return;
    try {
      this.storage.setItem(PRIMARY_STORAGE_KEY, JSON.stringify(this.state));
    } catch (err) {
      console.warn('Storage quota exceeded or error saving state:', err);
    }
  }

  isV2() {
    return this.state && this.state.schemaVersion === 2;
  }

  getMigrationStatus() {
    if (!this.isV2()) {
      return 'AVAILABLE'; // v1 detected; migration available
    }
    return 'COMPLETED';
  }

  hasRollbackBackup() {
    if (!this.storage) return false;
    try {
      const backup = this.storage.getItem(BACKUP_STORAGE_KEY);
      return typeof backup === 'string' && backup.length > 0;
    } catch {
      return false;
    }
  }

  getRawV1Backup() {
    if (!this.storage) return null;
    try {
      return this.storage.getItem(BACKUP_STORAGE_KEY);
    } catch {
      return null;
    }
  }

  /**
   * Generates a preview of migration without modifying storage.
   */
  previewMigration() {
    if (this.isV2()) {
      return { isApplicable: false, reason: 'State is already schema version 2' };
    }

    const preview = migrateV1ToV2(this.state, { idGenerator: this.idGenerator });
    return {
      isApplicable: true,
      success: preview.success,
      transactionCount: preview.migratedState ? preview.migratedState.transactions.length : 0,
      peopleCount: preview.migratedState ? preview.migratedState.people.length : 0,
      warnings: preview.warnings,
      reviewItems: preview.reviewItems,
      validationErrors: preview.validationErrors,
    };
  }

  /**
   * Executes controlled migration with fail-safe rollback backup verification.
   */
  executeMigration() {
    if (this.isV2()) {
      return { success: true, message: 'Already schema version 2' };
    }

    if (!this.storage) {
      return { success: false, error: 'Storage unavailable' };
    }

    // 1. Prepare raw v1 JSON
    const rawV1String = JSON.stringify(this.state);

    // 2. Write raw v1 backup
    try {
      this.storage.setItem(BACKUP_STORAGE_KEY, rawV1String);
    } catch (err) {
      return { success: false, error: `Failed to create pre-migration backup: ${err.message}` };
    }

    // 3. Verify written backup matches exactly
    try {
      const readBack = this.storage.getItem(BACKUP_STORAGE_KEY);
      if (readBack !== rawV1String) {
        return { success: false, error: 'Pre-migration backup verification failed: read-back mismatch' };
      }
    } catch (err) {
      return { success: false, error: `Failed to verify backup: ${err.message}` };
    }

    // 4. In-memory dry run and migration
    const res = migrateV1ToV2(this.state, { idGenerator: this.idGenerator });
    if (!res.success || !res.migratedState) {
      return { success: false, error: `Migration validation failed: ${res.validationErrors.join(', ')}` };
    }

    // 5. Canonical validation of all migrated events
    for (const evt of res.migratedState.transactions) {
      const check = validateEvent(evt);
      if (!check.isValid) {
        return { success: false, error: `Migrated event '${evt.id}' is invalid: ${check.error}` };
      }
    }

    // 6. Chronological repayment validation
    const chronCheck = validateChronologicalRepayments(res.migratedState.transactions);
    if (!chronCheck.isValid) {
      // Repayment conflicts are recorded in reviews rather than failing migration
      res.migratedState.pendingReviews.repaymentConflicts = chronCheck.conflicts;
    }

    // 7. Commit migrated state to primary storage
    try {
      this.storage.setItem(PRIMARY_STORAGE_KEY, JSON.stringify(res.migratedState));
    } catch (err) {
      return { success: false, error: `Failed to persist migrated state: ${err.message}` };
    }

    // 8. Update in-memory state
    this.state = res.migratedState;
    this.notify();

    return {
      success: true,
      warnings: res.warnings,
      reviewItems: res.reviewItems,
    };
  }

  /**
   * Restores untouched pre-migration v1 state from backup.
   */
  rollbackMigration() {
    if (!this.storage) {
      return { success: false, error: 'Storage unavailable' };
    }

    let backupRaw;
    try {
      backupRaw = this.storage.getItem(BACKUP_STORAGE_KEY);
      if (!backupRaw) {
        return { success: false, error: 'No pre-migration backup found in storage' };
      }
      const parsed = JSON.parse(backupRaw);
      this.storage.setItem(PRIMARY_STORAGE_KEY, backupRaw);
      this.state = parsed;
      this.notify();
      return { success: true };
    } catch (err) {
      return { success: false, error: `Rollback failed: ${err.message}` };
    }
  }

  // ─────────────────────────────────────────────────────────
  // CANONICAL DERIVED QUERIES (Exclusively powered by new engine)
  // ─────────────────────────────────────────────────────────

  getCanonicalEvents() {
    if (this.isV2()) {
      return this.state.transactions || [];
    }
    // If v1, run in-memory dry-run migration to derive accurate canonical events
    const res = migrateV1ToV2(this.state, { idGenerator: this.idGenerator });
    return res.migratedState ? res.migratedState.transactions : [];
  }

  computeBalances() {
    const events = this.getCanonicalEvents();
    const balancesPaise = computeAllBalances(events);

    // Map person IDs to person display names for legacy UI consumption
    const nameMap = this.getPersonIdToNameMap();
    const result = {};

    // Initialize all known people in people directory to 0
    for (const name of nameMap.values()) {
      result[name] = 0;
    }

    for (const [pId, amountPaise] of Object.entries(balancesPaise)) {
      const displayName = nameMap.get(pId) || pId;
      result[displayName] = amountPaise / 100; // In Rupees
    }

    return result;
  }

  computeMonthlyAnalytics(year, month) {
    const events = this.getCanonicalEvents();
    // month is 0-indexed in Date (0-11); ledger engine expects 1-indexed (1-12)
    const monthNum = month + 1;
    const totalSpentPaise = computeMonthlyPersonalSpending(events, year, monthNum);

    const monthPrefix = `${year}-${String(monthNum).padStart(2, '0')}`;
    const byCategory = {};
    const byDay = {};

    for (const e of events) {
      if (e.kind === EVENT_KINDS.EXPENSE && typeof e.date === 'string' && e.date.startsWith(monthPrefix)) {
        const amt = (e.userSharePaise || 0) / 100;
        const cat = e.category || 'Other';
        byCategory[cat] = (byCategory[cat] || 0) + amt;

        const day = parseInt(e.date.slice(8, 10), 10);
        if (!isNaN(day)) {
          byDay[day] = (byDay[day] || 0) + amt;
        }
      }
    }

    return {
      totalSpent: totalSpentPaise / 100,
      byCategory,
      byDay,
      count: events.filter((e) => e.kind === EVENT_KINDS.EXPENSE && typeof e.date === 'string' && e.date.startsWith(monthPrefix)).length,
    };
  }

  getPersonIdToNameMap() {
    const map = new Map();
    if (this.isV2()) {
      for (const p of this.state.people || []) {
        map.set(p.id, p.name);
      }
    } else {
      for (const p of this.state.people || []) {
        if (p.id && p.name) map.set(p.id, p.name);
      }
    }
    return map;
  }

  getPersonNameToIdMap() {
    const map = new Map();
    if (this.isV2()) {
      for (const p of this.state.people || []) {
        map.set(p.name.trim(), p.id);
      }
    }
    return map;
  }

  getPersonHistory(personName) {
    if (!personName) return [];
    const legacyTxns = this.getLegacyProjectedTransactions();

    return legacyTxns
      .filter((t) => {
        if (t.person === personName) return true;
        if (Array.isArray(t.splits) && t.splits.some((s) => s.person === personName)) return true;
        return false;
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  // ─────────────────────────────────────────────────────────
  // LEGACY UI COMPATIBILITY ADAPTER
  // ─────────────────────────────────────────────────────────

  getLegacyProjectedTransactions() {
    if (!this.isV2()) {
      return this.state.transactions || [];
    }

    const idToName = this.getPersonIdToNameMap();
    const projected = [];

    for (const e of this.state.transactions || []) {
      const calendarDate = e.date || '2026-01-01';

      if (e.kind === EVENT_KINDS.EXPENSE) {
        if (e.payerId === PARTY_USER && Array.isArray(e.allocations) && e.allocations.length > 0) {
          projected.push({
            id: e.id,
            action: 'shared_expense',
            type: 'split',
            payer: 'user',
            payerName: 'You',
            person: e.allocations.map((a) => idToName.get(a.personId) || a.personId).join(', '),
            amount: e.totalAmountPaise / 100,
            myShare: e.userSharePaise / 100,
            userShare: e.userSharePaise / 100,
            splits: e.allocations.map((a) => ({
              person: idToName.get(a.personId) || a.personId,
              personId: a.personId,
              amount: a.amountPaise / 100,
            })),
            allocations: e.allocations.map((a) => ({
              person: idToName.get(a.personId) || a.personId,
              personId: a.personId,
              amount: a.amountPaise / 100,
            })),
            description: e.description,
            category: e.category || 'Other',
            paymentMethod: e.paymentMethod || 'OTHER',
            paymentAttemptId: e.metadata?.paymentAttemptId || null,
            reviewRequired: !!e.reviewRequired,
            date: calendarDate,
            createdAt: e.createdAt,
            rawKind: e.kind,
            rawEvent: e,
          });
        } else if (e.payerId !== PARTY_USER) {
          const payerDisplayName = idToName.get(e.payerId) || e.payerId;
          const isShared = Array.isArray(e.allocations) && e.allocations.length > 0;
          projected.push({
            id: e.id,
            action: isShared ? 'shared_expense' : 'personal_expense',
            type: isShared ? 'split' : 'take',
            payer: e.payerId,
            payerName: payerDisplayName,
            person: payerDisplayName,
            amount: (isShared ? e.totalAmountPaise : e.userSharePaise) / 100,
            myShare: e.userSharePaise / 100,
            userShare: e.userSharePaise / 100,
            splits: isShared ? e.allocations.map((a) => ({
              person: idToName.get(a.personId) || a.personId,
              personId: a.personId,
              amount: a.amountPaise / 100,
            })) : [],
            allocations: isShared ? e.allocations.map((a) => ({
              person: idToName.get(a.personId) || a.personId,
              personId: a.personId,
              amount: a.amountPaise / 100,
            })) : [],
            description: e.description,
            category: e.category || 'Other',
            paymentMethod: e.paymentMethod || 'OTHER',
            paymentAttemptId: e.metadata?.paymentAttemptId || null,
            reviewRequired: !!e.reviewRequired,
            date: calendarDate,
            createdAt: e.createdAt,
            rawKind: e.kind,
            rawEvent: e,
          });
        } else {
          projected.push({
            id: e.id,
            action: 'personal_expense',
            type: 'give',
            payer: 'user',
            payerName: 'You',
            person: '',
            amount: e.totalAmountPaise / 100,
            userShare: e.userSharePaise / 100,
            description: e.description,
            category: e.category || 'Other',
            paymentMethod: e.paymentMethod || 'OTHER',
            paymentAttemptId: e.metadata?.paymentAttemptId || null,
            reviewRequired: !!e.reviewRequired,
            date: calendarDate,
            createdAt: e.createdAt,
            rawKind: e.kind,
            rawEvent: e,
          });
        }
      } else if (e.kind === EVENT_KINDS.TRANSFER) {
        const isLend = e.fromPartyId === PARTY_USER;
        const targetId = isLend ? e.toPartyId : e.fromPartyId;
        const targetName = idToName.get(targetId) || targetId;
        projected.push({
          id: e.id,
          action: isLend ? 'lend' : 'borrow',
          type: isLend ? 'give' : 'take',
          person: targetName,
          personId: targetId,
          amount: e.amountPaise / 100,
          description: e.description,
          category: e.category || 'Other',
          paymentMethod: e.paymentMethod || 'OTHER',
          paymentAttemptId: e.metadata?.paymentAttemptId || null,
          reviewRequired: !!e.reviewRequired,
          date: calendarDate,
          createdAt: e.createdAt,
          rawKind: e.kind,
          rawEvent: e,
        });
      } else if (e.kind === EVENT_KINDS.REPAYMENT) {
        const isOutflow = e.fromPartyId === PARTY_USER;
        const targetId = isOutflow ? e.toPartyId : e.fromPartyId;
        const targetName = idToName.get(targetId) || targetId;
        projected.push({
          id: e.id,
          action: 'repayment',
          type: 'settle',
          person: targetName,
          personId: targetId,
          direction: isOutflow ? 'outflow' : 'inflow',
          amount: e.amountPaise / 100,
          description: e.description,
          category: e.category || 'Settlement',
          paymentMethod: e.paymentMethod || 'OTHER',
          paymentAttemptId: e.metadata?.paymentAttemptId || null,
          reviewRequired: !!e.reviewRequired,
          date: calendarDate,
          createdAt: e.createdAt,
          rawKind: e.kind,
          rawEvent: e,
        });
      } else if (e.kind === EVENT_KINDS.ADJUSTMENT) {
        const isPositive = e.fromPartyId === PARTY_USER;
        const targetId = isPositive ? e.toPartyId : e.fromPartyId;
        projected.push({
          id: e.id,
          action: 'adjustment',
          type: 'adjustment',
          person: idToName.get(targetId) || targetId,
          amount: (isPositive ? 1 : -1) * (e.amountPaise / 100),
          description: e.description,
          category: e.category || 'Adjustment',
          paymentMethod: e.paymentMethod || 'OTHER',
          paymentAttemptId: e.metadata?.paymentAttemptId || null,
          reviewRequired: !!e.reviewRequired,
          date: calendarDate,
          createdAt: e.createdAt,
          rawKind: e.kind,
          rawEvent: e,
        });
      } else if (e.kind === EVENT_KINDS.LEGACY_UNCLASSIFIED) {
        projected.push({
          id: e.id,
          action: 'unclassified',
          type: e.legacyType,
          person: idToName.get(e.personId) || e.metadata?.legacyPersonName || e.personId,
          amount: e.amountPaise / 100,
          description: e.description,
          category: e.category || 'Other',
          paymentMethod: e.paymentMethod || 'OTHER',
          paymentAttemptId: e.metadata?.paymentAttemptId || null,
          reviewRequired: e.reviewRequired !== false,
          date: calendarDate,
          createdAt: e.createdAt,
          rawKind: e.kind,
          rawEvent: e,
        });
      }
    }

    return projected;
  }

  getProjectedState() {
    if (!this.isV2()) {
      return this.state;
    }

    const projectedTransactions = this.getLegacyProjectedTransactions();

    return {
      schemaVersion: 2,
      isMigrated: true,
      transactions: projectedTransactions,
      people: (this.state.people || []).map((p) => ({
        id: p.id,
        name: p.name,
        upiId: p.upiId || '',
        isArchived: !!p.isArchived,
      })),
      categories: this.state.categories || [],
      pendingAlarms: (this.state.pendingReviews?.migratedAlarms || []).map((a) => ({
        id: a.id,
        txnId: a.txnId,
        personName: a.personName,
        amount: a.amountPaise / 100,
        direction: a.direction,
        createdAt: a.createdAt,
      })),
      settings: {
        currency: this.state.settings?.currencySymbol || '₹',
        monthlyBudget: (this.state.settings?.monthlyBudgetPaise || 0) / 100,
        theme: this.state.settings?.theme || 'graphite',
      },
      pendingReviews: this.state.pendingReviews,
      paymentAttempts: this.state.paymentAttempts || [],
    };
  }

  getState() {
    return this.getProjectedState();
  }

  // ─────────────────────────────────────────────────────────
  // MUTATION API (Preserving legacy UI contracts)
  // ─────────────────────────────────────────────────────────

  findOrCreatePerson(name, upiId = '') {
    const trimmed = (name || '').trim();
    if (!trimmed) return null;

    if (!this.isV2()) {
      let p = this.state.people.find((x) => x.name === trimmed);
      if (!p) {
        p = { id: this.idGenerator(), name: trimmed, upiId };
        this.state.people.push(p);
      }
      return p;
    }

    let p = this.state.people.find((x) => x.name.toLowerCase() === trimmed.toLowerCase());
    if (!p) {
      p = {
        id: this.idGenerator(),
        name: trimmed,
        upiId,
        isArchived: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      this.state.people.push(p);
    } else if (upiId && !p.upiId) {
      p.upiId = upiId;
    }
    return p;
  }

  addTransaction(legacyTxn) {
    if (!this.isV2()) {
      // Unmigrated legacy state path
      if (legacyTxn.type === 'personal_expense') {
        const isPaidByUser = !legacyTxn.paidBy || legacyTxn.paidBy === 'user';
        this.state.transactions.push({
          id: legacyTxn.id || uid(),
          type: isPaidByUser ? 'give' : 'take',
          person: isPaidByUser ? '' : legacyTxn.paidBy,
          amount: legacyTxn.amount,
          description: legacyTxn.description || '',
          category: legacyTxn.category || 'Other',
          date: legacyTxn.date || new Date().toISOString(),
          createdAt: Date.now(),
        });
        if (!isPaidByUser && legacyTxn.paidBy && !this.state.people.find((p) => p.name === legacyTxn.paidBy)) {
          this.state.people.push({ id: uid(), name: legacyTxn.paidBy, upiId: '' });
        }
        this.saveCurrentState();
        this.notify();
        return { success: true };
      }
      if (legacyTxn.type === 'shared_expense') {
        const splits = (legacyTxn.allocations || legacyTxn.splits || []).map((s) => ({ person: s.person, amount: s.amount }));
        this.state.transactions.push({
          id: legacyTxn.id || uid(),
          type: 'split',
          person: splits.map((s) => s.person).join(', '),
          amount: legacyTxn.amount,
          myShare: legacyTxn.userShare ?? legacyTxn.myShare ?? 0,
          splits,
          description: legacyTxn.description || '',
          category: legacyTxn.category || 'Other',
          date: legacyTxn.date || new Date().toISOString(),
          createdAt: Date.now(),
        });
        for (const sp of splits) {
          if (sp.person && !this.state.people.find((p) => p.name === sp.person)) {
            this.state.people.push({ id: uid(), name: sp.person, upiId: '' });
          }
        }
        this.saveCurrentState();
        this.notify();
        return { success: true };
      }
      if (legacyTxn.type === 'lend') {
        this.state.transactions.push({
          id: legacyTxn.id || uid(),
          type: 'give',
          person: legacyTxn.person,
          amount: legacyTxn.amount,
          description: legacyTxn.description || '',
          category: legacyTxn.category || 'Other',
          date: legacyTxn.date || new Date().toISOString(),
          createdAt: Date.now(),
        });
        if (legacyTxn.person && !this.state.people.find((p) => p.name === legacyTxn.person)) {
          this.state.people.push({ id: uid(), name: legacyTxn.person, upiId: '' });
        }
        this.saveCurrentState();
        this.notify();
        return { success: true };
      }
      if (legacyTxn.type === 'borrow') {
        this.state.transactions.push({
          id: legacyTxn.id || uid(),
          type: 'take',
          person: legacyTxn.person,
          amount: legacyTxn.amount,
          description: legacyTxn.description || '',
          category: legacyTxn.category || 'Other',
          date: legacyTxn.date || new Date().toISOString(),
          createdAt: Date.now(),
        });
        if (legacyTxn.person && !this.state.people.find((p) => p.name === legacyTxn.person)) {
          this.state.people.push({ id: uid(), name: legacyTxn.person, upiId: '' });
        }
        this.saveCurrentState();
        this.notify();
        return { success: true };
      }
      if (legacyTxn.type === 'repayment') {
        this.state.transactions.push({
          id: legacyTxn.id || uid(),
          type: 'settle',
          person: legacyTxn.person,
          amount: legacyTxn.amount,
          description: legacyTxn.description || '',
          category: legacyTxn.category || 'Settlement',
          date: legacyTxn.date || new Date().toISOString(),
          createdAt: Date.now(),
        });
        if (legacyTxn.person && !this.state.people.find((p) => p.name === legacyTxn.person)) {
          this.state.people.push({ id: uid(), name: legacyTxn.person, upiId: '' });
        }
        this.saveCurrentState();
        this.notify();
        return { success: true };
      }

      this.state.transactions.push({ ...legacyTxn, id: legacyTxn.id || uid(), createdAt: Date.now() });
      if (legacyTxn.person && !this.state.people.find((p) => p.name === legacyTxn.person)) {
        this.state.people.push({ id: uid(), name: legacyTxn.person, upiId: '' });
      }
      this.saveCurrentState();
      this.notify();
      return { success: true };
    }

    // Canonical v2 path
    const moneyConv = convertRupeesToPaise(legacyTxn.amount);
    if (!moneyConv.isValid) {
      return { success: false, error: `Invalid amount: ${moneyConv.error}` };
    }

    if (legacyTxn.paymentAttemptId) {
      const alreadyLinked = (this.state.transactions || []).some(
        (t) => t.metadata?.paymentAttemptId === legacyTxn.paymentAttemptId
      );
      if (alreadyLinked) {
        return {
          success: false,
          error: `Payment attempt '${legacyTxn.paymentAttemptId}' has already generated a ledger transaction`,
        };
      }
    }
    const amountPaise = moneyConv.amountPaise;
    const calendarDate = extractCalendarDate(legacyTxn.date);
    const eventId = legacyTxn.id || this.idGenerator();

    let newEvent;

    if (legacyTxn.type === 'personal_expense') {
      const isPaidByUser = !legacyTxn.paidBy || legacyTxn.paidBy === 'user' || legacyTxn.paidBy === PARTY_USER;
      let payerId = PARTY_USER;
      if (!isPaidByUser) {
        const person = this.findOrCreatePerson(legacyTxn.paidBy || legacyTxn.person);
        if (!person) return { success: false, error: 'Payer person is required' };
        payerId = person.id;
      }
      newEvent = {
        id: eventId,
        kind: EVENT_KINDS.EXPENSE,
        payerId,
        totalAmountPaise: amountPaise,
        userSharePaise: amountPaise,
        allocations: [],
        date: calendarDate,
        createdAt: Date.now(),
        description: legacyTxn.description || '',
        category: legacyTxn.category || 'Other',
        paymentMethod: legacyTxn.paymentMethod || 'OTHER',
        metadata: legacyTxn.paymentAttemptId ? { paymentAttemptId: legacyTxn.paymentAttemptId } : {},
      };
    } else if (legacyTxn.type === 'shared_expense') {
      const rawSplits = Array.isArray(legacyTxn.allocations) ? legacyTxn.allocations : (Array.isArray(legacyTxn.splits) ? legacyTxn.splits : []);
      const userShareConv = convertRupeesToPaise(legacyTxn.userShare ?? legacyTxn.myShare ?? 0);
      let userSharePaise = userShareConv.isValid ? userShareConv.amountPaise : 0;

      const isPaidByUser = !legacyTxn.payer || legacyTxn.payer === 'user' || legacyTxn.payer === PARTY_USER;
      let payerId = PARTY_USER;
      if (!isPaidByUser) {
        const p = this.findOrCreatePerson(legacyTxn.payer);
        if (!p) return { success: false, error: 'Payer person is required' };
        payerId = p.id;
      }

      const allocations = [];
      let allocationsSum = 0;

      for (const s of rawSplits) {
        const p = this.findOrCreatePerson(s.person);
        const sConv = convertRupeesToPaise(s.amount);
        const aPaise = sConv.isValid ? sConv.amountPaise : 0;
        allocations.push({
          personId: p.id,
          amountPaise: aPaise,
        });
        allocationsSum += aPaise;
      }

      // Check and enforce exact conservation
      const calculatedSum = userSharePaise + allocationsSum;
      const diff = calculatedSum - amountPaise;
      if (Math.abs(diff) <= 2) {
        userSharePaise = userSharePaise - diff; // reconcile residual
      } else if (diff !== 0) {
        return {
          success: false,
          error: `Shared expense does not conserve: sum of user share (₹${userSharePaise / 100}) and allocations (₹${allocationsSum / 100}) must equal total bill (₹${amountPaise / 100})`,
        };
      }

      newEvent = {
        id: eventId,
        kind: EVENT_KINDS.EXPENSE,
        payerId,
        totalAmountPaise: amountPaise,
        userSharePaise,
        allocations,
        date: calendarDate,
        createdAt: Date.now(),
        description: legacyTxn.description || '',
        category: legacyTxn.category || 'Other',
        paymentMethod: legacyTxn.paymentMethod || 'OTHER',
        metadata: legacyTxn.paymentAttemptId ? { paymentAttemptId: legacyTxn.paymentAttemptId } : {},
      };
    } else if (legacyTxn.type === 'lend') {
      const person = this.findOrCreatePerson(legacyTxn.person);
      if (!person) return { success: false, error: 'Lending requires a person' };
      newEvent = {
        id: eventId,
        kind: EVENT_KINDS.TRANSFER,
        fromPartyId: PARTY_USER,
        toPartyId: person.id,
        amountPaise,
        date: calendarDate,
        createdAt: Date.now(),
        description: legacyTxn.description || 'Lent money',
        category: legacyTxn.category || 'Other',
        paymentMethod: legacyTxn.paymentMethod || 'OTHER',
        metadata: legacyTxn.paymentAttemptId ? { paymentAttemptId: legacyTxn.paymentAttemptId } : {},
      };
    } else if (legacyTxn.type === 'borrow') {
      const person = this.findOrCreatePerson(legacyTxn.person);
      if (!person) return { success: false, error: 'Borrowing requires a person' };
      newEvent = {
        id: eventId,
        kind: EVENT_KINDS.TRANSFER,
        fromPartyId: person.id,
        toPartyId: PARTY_USER,
        amountPaise,
        date: calendarDate,
        createdAt: Date.now(),
        description: legacyTxn.description || 'Borrowed money',
        category: legacyTxn.category || 'Other',
        paymentMethod: legacyTxn.paymentMethod || 'OTHER',
        metadata: legacyTxn.paymentAttemptId ? { paymentAttemptId: legacyTxn.paymentAttemptId } : {},
      };
    } else if (legacyTxn.type === 'repayment') {
      const person = this.findOrCreatePerson(legacyTxn.person);
      if (!person) return { success: false, error: 'Repayment requires a person' };

      // Derive direction from person's current balance
      const currentBalancePaise = computePersonBalance(this.state.transactions, person.id);

      if (currentBalancePaise > 0) {
        // Person owes user: Inflow repayment
        if (amountPaise > currentBalancePaise) {
          return { success: false, error: `Repayment amount (₹${amountPaise / 100}) exceeds counterparty balance (₹${currentBalancePaise / 100})` };
        }
        newEvent = {
          id: eventId,
          kind: EVENT_KINDS.REPAYMENT,
          fromPartyId: person.id,
          toPartyId: PARTY_USER,
          amountPaise,
          date: calendarDate,
          createdAt: Date.now(),
          description: legacyTxn.description || 'Repayment',
          category: 'Settlement',
          paymentMethod: legacyTxn.paymentMethod || 'OTHER',
          metadata: legacyTxn.paymentAttemptId ? { paymentAttemptId: legacyTxn.paymentAttemptId } : {},
        };
      } else if (currentBalancePaise < 0) {
        // User owes person: Outflow repayment
        const userDebtPaise = Math.abs(currentBalancePaise);
        if (amountPaise > userDebtPaise) {
          return { success: false, error: `Repayment amount (₹${amountPaise / 100}) exceeds user debt (₹${userDebtPaise / 100})` };
        }
        newEvent = {
          id: eventId,
          kind: EVENT_KINDS.REPAYMENT,
          fromPartyId: PARTY_USER,
          toPartyId: person.id,
          amountPaise,
          date: calendarDate,
          createdAt: Date.now(),
          description: legacyTxn.description || 'Repayment',
          category: 'Settlement',
          paymentMethod: legacyTxn.paymentMethod || 'OTHER',
          metadata: legacyTxn.paymentAttemptId ? { paymentAttemptId: legacyTxn.paymentAttemptId } : {},
        };
      } else {
        return { success: false, error: 'Cannot record repayment: balance is already zero' };
      }
    } else if (legacyTxn.type === 'give') {
      const person = this.findOrCreatePerson(legacyTxn.person);
      newEvent = {
        id: eventId,
        kind: EVENT_KINDS.LEGACY_UNCLASSIFIED,
        legacyType: 'give',
        personId: person ? person.id : this.idGenerator(),
        amountPaise,
        date: calendarDate,
        createdAt: Date.now(),
        description: legacyTxn.description || '',
        category: legacyTxn.category || 'Other',
        paymentMethod: 'OTHER',
        reviewRequired: true,
      };
    } else if (legacyTxn.type === 'take') {
      const person = this.findOrCreatePerson(legacyTxn.person);
      newEvent = {
        id: eventId,
        kind: EVENT_KINDS.LEGACY_UNCLASSIFIED,
        legacyType: 'take',
        personId: person ? person.id : this.idGenerator(),
        amountPaise,
        date: calendarDate,
        createdAt: Date.now(),
        description: legacyTxn.description || '',
        category: legacyTxn.category || 'Other',
        paymentMethod: 'OTHER',
        reviewRequired: true,
      };
    } else if (legacyTxn.type === 'split') {
      const rawSplits = Array.isArray(legacyTxn.splits) ? legacyTxn.splits : [];
      const userShareConv = convertRupeesToPaise(legacyTxn.myShare || 0);
      let userSharePaise = userShareConv.isValid ? userShareConv.amountPaise : 0;

      const allocations = [];
      let allocationsSum = 0;

      for (const s of rawSplits) {
        const p = this.findOrCreatePerson(s.person);
        const sConv = convertRupeesToPaise(s.amount);
        const aPaise = sConv.isValid ? sConv.amountPaise : 0;
        allocations.push({
          personId: p.id,
          amountPaise: aPaise,
        });
        allocationsSum += aPaise;
      }

      // Check and enforce exact conservation
      const calculatedSum = userSharePaise + allocationsSum;
      const diff = calculatedSum - amountPaise;
      if (Math.abs(diff) <= 2) {
        userSharePaise = userSharePaise - diff; // reconcile residual
      }

      newEvent = {
        id: eventId,
        kind: EVENT_KINDS.EXPENSE,
        payerId: PARTY_USER,
        totalAmountPaise: amountPaise,
        userSharePaise,
        allocations,
        date: calendarDate,
        createdAt: Date.now(),
        description: legacyTxn.description || '',
        category: legacyTxn.category || 'Other',
        paymentMethod: 'OTHER',
      };
    } else if (legacyTxn.type === 'settle') {
      const person = this.findOrCreatePerson(legacyTxn.person);
      if (!person) return { success: false, error: 'Settlement requires a person' };

      // Derive direction from person's current balance
      const currentBalancePaise = computePersonBalance(this.state.transactions, person.id);

      if (currentBalancePaise > 0) {
        // Person owes user: Inflow repayment
        if (amountPaise > currentBalancePaise) {
          return { success: false, error: `Repayment amount (₹${amountPaise / 100}) exceeds counterparty balance (₹${currentBalancePaise / 100})` };
        }
        newEvent = {
          id: eventId,
          kind: EVENT_KINDS.REPAYMENT,
          fromPartyId: person.id,
          toPartyId: PARTY_USER,
          amountPaise,
          date: calendarDate,
          createdAt: Date.now(),
          description: legacyTxn.description || 'Settlement',
          category: 'Settlement',
          paymentMethod: 'OTHER',
        };
      } else if (currentBalancePaise < 0) {
        // User owes person: Outflow repayment
        const userDebtPaise = Math.abs(currentBalancePaise);
        if (amountPaise > userDebtPaise) {
          return { success: false, error: `Repayment amount (₹${amountPaise / 100}) exceeds user debt (₹${userDebtPaise / 100})` };
        }
        newEvent = {
          id: eventId,
          kind: EVENT_KINDS.REPAYMENT,
          fromPartyId: PARTY_USER,
          toPartyId: person.id,
          amountPaise,
          date: calendarDate,
          createdAt: Date.now(),
          description: legacyTxn.description || 'Settlement',
          category: 'Settlement',
          paymentMethod: 'OTHER',
        };
      } else {
        return { success: false, error: 'Cannot record settlement: balance is already zero' };
      }
    } else if (legacyTxn.type === 'adjustment') {
      const person = this.findOrCreatePerson(legacyTxn.person);
      if (!person) return { success: false, error: 'Adjustment requires a person' };

      const isPositive = legacyTxn.amount >= 0;
      newEvent = {
        id: eventId,
        kind: EVENT_KINDS.ADJUSTMENT,
        fromPartyId: isPositive ? PARTY_USER : person.id,
        toPartyId: isPositive ? person.id : PARTY_USER,
        amountPaise,
        date: calendarDate,
        createdAt: Date.now(),
        description: legacyTxn.description || 'Adjustment',
        category: 'Adjustment',
        paymentMethod: 'OTHER',
      };
    }

    if (!newEvent) {
      return { success: false, error: 'Unsupported transaction type' };
    }

    const val = validateEvent(newEvent);
    if (!val.isValid) {
      return { success: false, error: val.error };
    }

    // Chronological repayment check
    const mutationCheck = validateEventMutation(this.state.transactions, {
      type: 'INSERT',
      newEvent,
    });
    if (!mutationCheck.canApply) {
      return { success: false, error: mutationCheck.reason };
    }

    this.state.transactions.push(newEvent);
    this.saveCurrentState();
    this.notify();
    return { success: true, event: newEvent };
  }

  editTransaction(id, updates) {
    if (!this.isV2()) {
      const idx = this.state.transactions.findIndex((t) => t.id === id);
      if (idx !== -1) {
        this.state.transactions[idx] = { ...this.state.transactions[idx], ...updates, updatedAt: Date.now() };
        this.saveCurrentState();
        this.notify();
        return { success: true };
      }
      return { success: false, error: 'Transaction not found' };
    }

    const existingIndex = this.state.transactions.findIndex((e) => e.id === id);
    if (existingIndex === -1) {
      return { success: false, error: 'Transaction not found' };
    }

    const existingEvent = this.state.transactions[existingIndex];
    const moneyConv = updates.amount !== undefined ? convertRupeesToPaise(updates.amount) : null;
    const amountPaise = moneyConv && moneyConv.isValid ? moneyConv.amountPaise : existingEvent.amountPaise || existingEvent.totalAmountPaise;

    const updatedEvent = {
      ...existingEvent,
      description: updates.description !== undefined ? updates.description : existingEvent.description,
      category: updates.category !== undefined ? updates.category : existingEvent.category,
      date: updates.date ? extractCalendarDate(updates.date) : existingEvent.date,
      updatedAt: Date.now(),
    };

    if (existingEvent.kind === EVENT_KINDS.EXPENSE) {
      updatedEvent.totalAmountPaise = amountPaise;
      if (updates.myShare !== undefined) {
        const mConv = convertRupeesToPaise(updates.myShare);
        updatedEvent.userSharePaise = mConv.isValid ? mConv.amountPaise : updatedEvent.userSharePaise;
      }
    } else {
      updatedEvent.amountPaise = amountPaise;
    }

    const val = validateEvent(updatedEvent);
    if (!val.isValid) {
      return { success: false, error: val.error };
    }

    const mutationCheck = validateEventMutation(this.state.transactions, {
      type: 'EDIT',
      targetEventId: id,
      updatedEvent,
    });

    if (!mutationCheck.canApply) {
      return { success: false, error: mutationCheck.reason };
    }

    this.state.transactions[existingIndex] = updatedEvent;
    this.saveCurrentState();
    this.notify();
    return { success: true };
  }

  deleteTransaction(id) {
    if (!this.isV2()) {
      this.state.transactions = this.state.transactions.filter((t) => t.id !== id);
      this.saveCurrentState();
      this.notify();
      return { success: true };
    }

    const mutationCheck = validateEventMutation(this.state.transactions, {
      type: 'DELETE',
      targetEventId: id,
    });

    if (!mutationCheck.canApply) {
      return { success: false, error: mutationCheck.reason };
    }

    this.state.transactions = this.state.transactions.filter((e) => e.id !== id);
    this.saveCurrentState();
    this.notify();
    return { success: true };
  }

  addPerson(name, upiId = '') {
    const p = this.findOrCreatePerson(name, upiId);
    this.saveCurrentState();
    this.notify();
    return p;
  }

  updatePerson(nameOrId, data) {
    if (!nameOrId || !data) return { success: false, error: 'Person and update data are required' };
    const query = String(nameOrId).trim().toLowerCase();

    if (!this.isV2()) {
      const idx = (this.state.people || []).findIndex(
        (x) => (x.id && x.id.toLowerCase() === query) || (x.name && x.name.toLowerCase() === query)
      );
      if (idx !== -1) {
        const oldName = this.state.people[idx].name;
        this.state.people[idx] = { ...this.state.people[idx], ...data };
        if (data.name && data.name.trim() !== oldName) {
          for (const t of this.state.transactions || []) {
            if (t.person === oldName) t.person = data.name.trim();
          }
        }
        this.saveCurrentState();
        this.notify();
        return { success: true, person: this.state.people[idx] };
      }
      return { success: false, error: 'Person not found' };
    }

    const p = (this.state.people || []).find(
      (x) => (x.id && x.id.toLowerCase() === query) || (x.name && x.name.toLowerCase() === query)
    );
    if (!p) {
      return { success: false, error: 'Person not found' };
    }

    if (data.name && data.name.trim()) {
      p.name = data.name.trim();
    }
    if (data.upiId !== undefined) {
      const upi = (data.upiId || '').trim();
      if (upi && !isValidUpiId(upi)) {
        return { success: false, error: `Invalid UPI ID '${upi}'. Expected format username@bank (e.g. name@okhdfcbank)` };
      }
      p.upiId = upi;
    }
    p.updatedAt = Date.now();
    this.saveCurrentState();
    this.notify();
    return { success: true, person: p };
  }

  archivePerson(nameOrId) {
    if (!nameOrId) return { success: false, error: 'Person is required' };
    const query = String(nameOrId).trim().toLowerCase();
    const p = (this.state.people || []).find(
      (x) => (x.id && x.id.toLowerCase() === query) || (x.name && x.name.toLowerCase() === query)
    );
    if (!p) return { success: false, error: 'Person not found' };

    const balances = this.computeBalances();
    const balance = balances[p.name] || 0;
    if (Math.abs(balance) > 0.001) {
      return {
        success: false,
        error: `Cannot archive ${p.name}: active balance is ${balance > 0 ? '+' : '-'}${Math.abs(balance).toFixed(2)}. Settle all balances first.`,
      };
    }

    p.isArchived = true;
    p.updatedAt = Date.now();
    this.saveCurrentState();
    this.notify();
    return { success: true, person: p };
  }

  unarchivePerson(nameOrId) {
    if (!nameOrId) return { success: false, error: 'Person is required' };
    const query = String(nameOrId).trim().toLowerCase();
    const p = (this.state.people || []).find(
      (x) => (x.id && x.id.toLowerCase() === query) || (x.name && x.name.toLowerCase() === query)
    );
    if (!p) return { success: false, error: 'Person not found' };

    p.isArchived = false;
    p.updatedAt = Date.now();
    this.saveCurrentState();
    this.notify();
    return { success: true, person: p };
  }

  getPersonTimeline(nameOrId) {
    if (!nameOrId) return { person: null, currentBalanceRupees: 0, timeline: [] };
    const query = String(nameOrId).trim().toLowerCase();

    const p = (this.state.people || []).find(
      (x) => (x.id && x.id.toLowerCase() === query) || (x.name && x.name.toLowerCase() === query)
    );

    const personId = p ? p.id : nameOrId;
    const personName = p ? p.name : nameOrId;
    const balances = this.computeBalances();
    const currentBalanceRupees = balances[personName] || 0;

    if (this.isV2()) {
      const events = this.getCanonicalEvents();
      const sorted = sortEventsChronologically(events);
      let runningPaise = 0;
      const timeline = [];

      for (const event of sorted) {
        const deltaPaise = computeEventBalanceDelta(event, personId);
        const involves =
          deltaPaise !== 0 ||
          (event.kind === EVENT_KINDS.EXPENSE && (
            event.payerId === personId ||
            (Array.isArray(event.allocations) && event.allocations.some((a) => a.personId === personId))
          )) ||
          (event.kind === EVENT_KINDS.TRANSFER && (event.fromPartyId === personId || event.toPartyId === personId)) ||
          (event.kind === EVENT_KINDS.REPAYMENT && (event.fromPartyId === personId || event.toPartyId === personId)) ||
          (event.kind === EVENT_KINDS.ADJUSTMENT && (event.fromPartyId === personId || event.toPartyId === personId)) ||
          (event.kind === EVENT_KINDS.LEGACY_UNCLASSIFIED && event.personId === personId);

        if (involves) {
          runningPaise += deltaPaise;
          timeline.push({
            id: event.id,
            date: event.date,
            createdAt: event.createdAt,
            description: event.description,
            category: event.category || 'Other',
            paymentMethod: event.paymentMethod || 'OTHER',
            kind: event.kind,
            deltaPaise,
            deltaRupees: deltaPaise / 100,
            runningBalancePaise: runningPaise,
            runningBalanceRupees: runningPaise / 100,
            rawEvent: event,
          });
        }
      }

      return {
        person: p || { id: personId, name: personName, upiId: '' },
        currentBalanceRupees,
        timeline: timeline.reverse(),
      };
    }

    // Unmigrated legacy v1 path
    const txns = this.state.transactions || [];
    const sorted = [...txns].sort((a, b) => new Date(a.date) - new Date(b.date));
    let runningRupees = 0;
    const timeline = [];

    for (const t of sorted) {
      let delta = 0;
      const isDirect = t.person && t.person.toLowerCase() === query;
      const splitMatch = Array.isArray(t.splits) && t.splits.find((s) => s.person && s.person.toLowerCase() === query);

      if (t.type === 'give' && isDirect) delta = t.amount;
      else if (t.type === 'take' && isDirect) delta = -t.amount;
      else if (t.type === 'split' && splitMatch) delta = splitMatch.amount;
      else if (t.type === 'settle' && isDirect) {
        if (runningRupees > 0) delta = -Math.min(t.amount, runningRupees);
        else if (runningRupees < 0) delta = Math.min(t.amount, Math.abs(runningRupees));
      } else if (t.type === 'adjustment' && isDirect) delta = t.amount;

      if (isDirect || splitMatch) {
        runningRupees += delta;
        timeline.push({
          id: t.id,
          date: t.date ? t.date.slice(0, 10) : '2026-01-01',
          createdAt: t.createdAt || 0,
          description: t.description || t.type,
          category: t.category || 'Other',
          paymentMethod: t.paymentMethod || 'OTHER',
          kind: t.type,
          deltaRupees: delta,
          runningBalanceRupees,
          rawEvent: t,
        });
      }
    }

    return {
      person: p || { id: personId, name: personName, upiId: '' },
      currentBalanceRupees,
      timeline: timeline.reverse(),
    };
  }

  getPeopleDirectory() {
    const balances = this.computeBalances();
    const peopleList = this.state.people || [];
    const txns = this.getLegacyProjectedTransactions();

    const directory = [];
    const seenNames = new Set();

    for (const p of peopleList) {
      const normName = p.name.trim().toLowerCase();
      seenNames.add(normName);
      const bal = balances[p.name] ?? 0;

      const pHistory = txns.filter(
        (t) =>
          (t.person && t.person.toLowerCase() === normName) ||
          (Array.isArray(t.splits) && t.splits.some((s) => s.person && s.person.toLowerCase() === normName))
      );
      const lastTxn = pHistory.sort((a, b) => new Date(b.date) - new Date(a.date))[0] || null;

      directory.push({
        id: p.id,
        name: p.name,
        upiId: p.upiId || '',
        isArchived: !!p.isArchived,
        balanceRupees: bal,
        lastActivityDate: lastTxn ? lastTxn.date : null,
        transactionCount: pHistory.length,
      });
    }

    for (const [name, bal] of Object.entries(balances)) {
      const normName = name.trim().toLowerCase();
      if (!seenNames.has(normName)) {
        seenNames.add(normName);
        const pHistory = txns.filter(
          (t) =>
            (t.person && t.person.toLowerCase() === normName) ||
            (Array.isArray(t.splits) && t.splits.some((s) => s.person && s.person.toLowerCase() === normName))
        );
        const lastTxn = pHistory.sort((a, b) => new Date(b.date) - new Date(a.date))[0] || null;

        directory.push({
          id: name,
          name,
          upiId: '',
          isArchived: false,
          balanceRupees: bal,
          lastActivityDate: lastTxn ? lastTxn.date : null,
          transactionCount: pHistory.length,
        });
      }
    }

    return directory;
  }

  getAttentionItems() {
    const unresolvedPayments = this.getUnresolvedPaymentAttempts();
    const pendingAlarms = this.state.pendingAlarms || [];
    const migratedAlarms = (this.state.pendingReviews?.migratedAlarms || []).filter(
      (a) => a.reviewStatus === 'PENDING_USER_REVIEW'
    );
    const unclassifiedEvents = (this.state.transactions || []).filter(
      (t) => t.kind === EVENT_KINDS.LEGACY_UNCLASSIFIED && t.reviewRequired
    );

    const totalCount =
      unresolvedPayments.length + pendingAlarms.length + migratedAlarms.length + unclassifiedEvents.length;

    return {
      unresolvedPayments,
      pendingAlarms,
      migratedAlarms,
      unclassifiedEvents,
      totalCount,
    };
  }

  addPendingAlarm(alarm) {
    if (!this.isV2()) {
      this.state.pendingAlarms.push({ ...alarm, id: uid(), createdAt: Date.now() });
      this.saveCurrentState();
      this.notify();
      return;
    }

    const person = this.findOrCreatePerson(alarm.personName);
    const moneyConv = convertRupeesToPaise(alarm.amount || 0);

    const migratedAlarm = {
      id: uid(),
      txnId: null,
      personId: person ? person.id : null,
      personName: alarm.personName || '',
      amountPaise: moneyConv.isValid ? moneyConv.amountPaise : 0,
      direction: alarm.direction === 'gave' ? 'gave' : 'settled',
      createdAt: Date.now(),
      reviewStatus: 'PENDING_USER_REVIEW',
    };

    if (!this.state.pendingReviews) this.state.pendingReviews = {};
    if (!this.state.pendingReviews.migratedAlarms) this.state.pendingReviews.migratedAlarms = [];
    this.state.pendingReviews.migratedAlarms.push(migratedAlarm);

    this.saveCurrentState();
    this.notify();
  }

  removePendingAlarm(id) {
    if (!this.isV2()) {
      this.state.pendingAlarms = this.state.pendingAlarms.filter((a) => a.id !== id);
      this.saveCurrentState();
      this.notify();
      return;
    }

    if (this.state.pendingReviews?.migratedAlarms) {
      this.state.pendingReviews.migratedAlarms = this.state.pendingReviews.migratedAlarms.filter((a) => a.id !== id);
      this.saveCurrentState();
      this.notify();
    }
  }

  resolvePendingAlarm(alarmId, confirmed) {
    // In Phase 3: NEVER automatically create a settlement transaction from an alarm!
    // Simply mark the alarm as reviewed/dismissed.
    this.removePendingAlarm(alarmId);
  }

  updateSettings(patch) {
    if (!this.isV2()) {
      this.state.settings = { ...this.state.settings, ...patch };
      this.saveCurrentState();
      this.notify();
      return;
    }

    if (patch.currency !== undefined) {
      this.state.settings.currencySymbol = patch.currency;
    }
    if (patch.monthlyBudget !== undefined) {
      const bConv = convertRupeesToPaise(patch.monthlyBudget);
      this.state.settings.monthlyBudgetPaise = bConv.isValid ? bConv.amountPaise : 0;
    }
    if (patch.theme !== undefined) {
      this.state.settings.theme = patch.theme;
    }

    this.saveCurrentState();
    this.notify();
  }

  exportData() {
    return JSON.stringify(this.state, null, 2);
  }

  previewImport(jsonStr) {
    if (!jsonStr || typeof jsonStr !== 'string') {
      return { isValid: false, error: 'Empty or invalid file content' };
    }
    try {
      const parsed = JSON.parse(jsonStr);
      if (!parsed || typeof parsed !== 'object') {
        return { isValid: false, error: 'Import file must contain a JSON object' };
      }

      const isV2 = parsed.schemaVersion === 2;
      const txns = Array.isArray(parsed.transactions) ? parsed.transactions : [];
      const people = Array.isArray(parsed.people) ? parsed.people : [];
      const warnings = [];

      if (!isV2 && !Array.isArray(parsed.transactions)) {
        warnings.push('File does not specify transactions array; empty ledger will be initialized');
      }

      // Check transaction integrity
      let invalidTxnCount = 0;
      for (const t of txns) {
        if (!t || typeof t !== 'object') {
          invalidTxnCount++;
          continue;
        }
        if (isV2) {
          if (!t.kind) invalidTxnCount++;
        } else {
          if (!t.type) invalidTxnCount++;
        }
      }
      if (invalidTxnCount > 0) {
        warnings.push(`${invalidTxnCount} transaction record(s) contain missing or invalid schema fields`);
      }

      return {
        isValid: true,
        preview: {
          schemaVersion: isV2 ? 2 : 1,
          transactionCount: txns.length,
          peopleCount: people.length,
          warnings,
        },
        parsed,
      };
    } catch (err) {
      return { isValid: false, error: `JSON Parse Error: ${err.message}` };
    }
  }

  hasPreImportBackup() {
    if (!this.storage) return false;
    try {
      const backup = this.storage.getItem('pocketledger_pre_import_backup');
      return typeof backup === 'string' && backup.length > 0;
    } catch {
      return false;
    }
  }

  getPreImportBackup() {
    if (!this.storage) return null;
    try {
      return this.storage.getItem('pocketledger_pre_import_backup');
    } catch {
      return null;
    }
  }

  rollbackPreImport() {
    if (!this.storage) return { success: false, error: 'Storage unavailable' };
    try {
      const backupStr = this.storage.getItem('pocketledger_pre_import_backup');
      if (!backupStr) return { success: false, error: 'No pre-import backup found' };

      const parsed = JSON.parse(backupStr);
      this.state = parsed;
      this.saveCurrentState();
      this.notify();
      return { success: true, message: 'Restored pre-import snapshot successfully' };
    } catch (err) {
      return { success: false, error: `Failed to restore pre-import backup: ${err.message}` };
    }
  }

  markTransactionReviewed(eventId) {
    if (!this.isV2()) return { success: true };
    const e = (this.state.transactions || []).find((t) => t.id === eventId);
    if (!e) return { success: false, error: 'Transaction not found' };
    e.reviewRequired = false;
    e.updatedAt = Date.now();
    this.saveCurrentState();
    this.notify();
    return { success: true };
  }

  importData(jsonStr) {
    const val = this.previewImport(jsonStr);
    if (!val.isValid) {
      return { success: false, error: val.error };
    }

    // Preserve safety backup of current data before replacement
    if (this.storage) {
      try {
        const currentData = JSON.stringify(this.state);
        this.storage.setItem('pocketledger_pre_import_backup', currentData);
      } catch (err) {
        console.warn('Could not write pre-import safety backup:', err);
      }
    }

    const parsed = val.parsed;
    this.state = parsed;
    this.saveCurrentState();
    this.notify();

    return {
      success: true,
      message: parsed.schemaVersion === 2
        ? `Imported Canonical Schema v2 with ${parsed.transactions?.length || 0} transactions.`
        : `Imported Schema v1 data with ${parsed.transactions?.length || 0} transactions. Upgrade available in Settings.`,
    };
  }

  // ─────────────────────────────────────────────────────────
  // PAYMENT ATTEMPTS (UPI Lifecycle & Reconciliation)
  // ─────────────────────────────────────────────────────────

  createPaymentAttempt({ personId, personName, upiId, amountRupees, note = '', type = 'UPI' }) {
    if (type === 'UPI') {
      if (!isValidUpiId(upiId)) {
        return { success: false, error: `Invalid UPI ID format: '${upiId}'. Expected format: name@bank` };
      }
    }

    const conv = convertRupeesToPaise(amountRupees);
    if (!conv.isValid) {
      return { success: false, error: `Invalid amount: ${conv.error}` };
    }

    const attemptId = this.idGenerator();
    const amountFloat = conv.amountPaise / 100;
    const cleanUpiId = (upiId || '').trim();
    const cleanName = (personName || '').trim();
    const intentUrl = `upi://pay?pa=${encodeURIComponent(cleanUpiId)}&pn=${encodeURIComponent(cleanName)}&am=${amountFloat.toFixed(2)}&cu=INR&tn=${encodeURIComponent(note || 'PocketLedger')}`;

    const attempt = {
      id: attemptId,
      type,
      recipientPartyId: personId || null,
      recipientName: cleanName,
      recipientUpiId: cleanUpiId,
      amountPaise: conv.amountPaise,
      amountRupees: amountFloat,
      intentUrl,
      status: 'INITIATED',
      initiatedAt: Date.now(),
      reconciledAt: null,
      reconciliationNotes: '',
      eventId: null,
      isUnresolved: true,
      metadata: {},
    };

    if (!Array.isArray(this.state.paymentAttempts)) {
      this.state.paymentAttempts = [];
    }

    this.state.paymentAttempts.push(attempt);
    this.saveCurrentState();
    this.notify();

    return {
      success: true,
      attempt,
    };
  }

  getPaymentAttempts() {
    return this.state.paymentAttempts || [];
  }

  getUnresolvedPaymentAttempts() {
    return (this.state.paymentAttempts || []).filter((a) => a.isUnresolved);
  }

  reconcilePaymentAttempt(attemptId, { outcome, ledgerTxnData, notes = '' }) {
    const attempts = this.state.paymentAttempts || [];
    const attempt = attempts.find((a) => a.id === attemptId);
    if (!attempt) {
      return { success: false, error: `Payment attempt '${attemptId}' not found` };
    }

    if (!attempt.isUnresolved) {
      return { success: false, error: `Payment attempt '${attemptId}' has already been reconciled (status: ${attempt.status})` };
    }

    const normalizedOutcome = (outcome || '').toUpperCase();
    if (!['SUCCESS', 'FAILED', 'CANCELLED', 'UNKNOWN'].includes(normalizedOutcome)) {
      return { success: false, error: `Invalid reconciliation outcome '${outcome}'` };
    }

    attempt.reconciliationNotes = notes;

    if (normalizedOutcome === 'SUCCESS') {
      if (!ledgerTxnData) {
        return { success: false, error: 'Reconciling as SUCCESS requires ledger transaction data' };
      }

      const txnPayload = {
        ...ledgerTxnData,
        paymentAttemptId: attempt.id,
        paymentMethod: attempt.type,
      };

      const addResult = this.addTransaction(txnPayload);
      if (!addResult.success) {
        return { success: false, error: `Failed to create ledger transaction: ${addResult.error}` };
      }

      const createdTxn = this.state.transactions[this.state.transactions.length - 1];
      attempt.eventId = createdTxn ? createdTxn.id : null;
      attempt.status = 'COMPLETED';
      attempt.isUnresolved = false;
      attempt.reconciledAt = Date.now();
    } else if (normalizedOutcome === 'FAILED') {
      attempt.status = 'FAILED';
      attempt.isUnresolved = false;
      attempt.reconciledAt = Date.now();
    } else if (normalizedOutcome === 'CANCELLED') {
      attempt.status = 'CANCELLED';
      attempt.isUnresolved = false;
      attempt.reconciledAt = Date.now();
    } else if (normalizedOutcome === 'UNKNOWN') {
      attempt.status = 'UNKNOWN';
      attempt.isUnresolved = true;
      attempt.reconciledAt = Date.now();
    }

    this.saveCurrentState();
    this.notify();

    return {
      success: true,
      attempt,
    };
  }

  dismissPaymentAttempt(attemptId) {
    const attempts = this.state.paymentAttempts || [];
    const attempt = attempts.find((a) => a.id === attemptId);
    if (!attempt) return { success: false, error: 'Attempt not found' };

    attempt.isUnresolved = false;
    this.saveCurrentState();
    this.notify();
    return { success: true };
  }

  getPeopleWithBalances() {
    const balances = this.computeBalances();
    const nameToId = this.getPersonNameToIdMap();
    const peopleList = this.state.people || [];

    const result = [];
    for (const [name, balanceRupees] of Object.entries(balances)) {
      if (balanceRupees !== 0) {
        const personObj = peopleList.find((p) => p.name === name) || {};
        result.push({
          id: personObj.id || nameToId.get(name) || name,
          name,
          upiId: personObj.upiId || '',
          balanceRupees,
          balancePaise: Math.round(balanceRupees * 100),
        });
      }
    }

    return result.sort((a, b) => Math.abs(b.balanceRupees) - Math.abs(a.balanceRupees));
  }

  exportCSV() {
    const txns = this.getLegacyProjectedTransactions();
    const headers = ['id', 'type', 'person', 'amount', 'description', 'category', 'date', 'splits', 'myShare'];
    const rows = txns.map((t) =>
      headers
        .map((h) => {
          if (h === 'splits') return t.splits ? JSON.stringify(t.splits) : '';
          return String(t[h] ?? '');
        })
        .join(',')
    );
    return [headers.join(','), ...rows].join('\n');
  }
}
