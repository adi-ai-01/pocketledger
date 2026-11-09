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
      theme: 'fantasy',
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
            type: 'split',
            person: e.allocations.map((a) => idToName.get(a.personId) || a.personId).join(', '),
            amount: e.totalAmountPaise / 100,
            myShare: e.userSharePaise / 100,
            splits: e.allocations.map((a) => ({
              person: idToName.get(a.personId) || a.personId,
              amount: a.amountPaise / 100,
            })),
            description: e.description,
            category: e.category || 'Other',
            date: calendarDate,
            createdAt: e.createdAt,
          });
        } else if (e.payerId !== PARTY_USER) {
          projected.push({
            id: e.id,
            type: 'take',
            person: idToName.get(e.payerId) || e.payerId,
            amount: e.userSharePaise / 100,
            description: e.description,
            category: e.category || 'Other',
            date: calendarDate,
            createdAt: e.createdAt,
          });
        } else {
          projected.push({
            id: e.id,
            type: 'give',
            person: '',
            amount: e.totalAmountPaise / 100,
            description: e.description,
            category: e.category || 'Other',
            date: calendarDate,
            createdAt: e.createdAt,
          });
        }
      } else if (e.kind === EVENT_KINDS.TRANSFER) {
        const isLend = e.fromPartyId === PARTY_USER;
        const targetId = isLend ? e.toPartyId : e.fromPartyId;
        projected.push({
          id: e.id,
          type: isLend ? 'give' : 'take',
          person: idToName.get(targetId) || targetId,
          amount: e.amountPaise / 100,
          description: e.description,
          category: e.category || 'Other',
          date: calendarDate,
          createdAt: e.createdAt,
        });
      } else if (e.kind === EVENT_KINDS.REPAYMENT) {
        const targetId = e.fromPartyId === PARTY_USER ? e.toPartyId : e.fromPartyId;
        projected.push({
          id: e.id,
          type: 'settle',
          person: idToName.get(targetId) || targetId,
          amount: e.amountPaise / 100,
          description: e.description,
          category: e.category || 'Settlement',
          date: calendarDate,
          createdAt: e.createdAt,
        });
      } else if (e.kind === EVENT_KINDS.ADJUSTMENT) {
        const isPositive = e.fromPartyId === PARTY_USER;
        const targetId = isPositive ? e.toPartyId : e.fromPartyId;
        projected.push({
          id: e.id,
          type: 'adjustment',
          person: idToName.get(targetId) || targetId,
          amount: (isPositive ? 1 : -1) * (e.amountPaise / 100),
          description: e.description,
          category: e.category || 'Adjustment',
          date: calendarDate,
          createdAt: e.createdAt,
        });
      } else if (e.kind === EVENT_KINDS.LEGACY_UNCLASSIFIED) {
        projected.push({
          id: e.id,
          type: e.legacyType,
          person: idToName.get(e.personId) || e.metadata?.legacyPersonName || e.personId,
          amount: e.amountPaise / 100,
          description: e.description,
          category: e.category || 'Other',
          date: calendarDate,
          createdAt: e.createdAt,
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
        theme: this.state.settings?.theme || 'fantasy',
      },
      pendingReviews: this.state.pendingReviews,
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
    const amountPaise = moneyConv.amountPaise;
    const calendarDate = extractCalendarDate(legacyTxn.date);
    const eventId = legacyTxn.id || this.idGenerator();

    let newEvent;

    if (legacyTxn.type === 'give') {
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

  updatePerson(name, data) {
    if (!this.isV2()) {
      const idx = this.state.people.findIndex((p) => p.name === name);
      if (idx !== -1) {
        this.state.people[idx] = { ...this.state.people[idx], ...data };
        this.saveCurrentState();
        this.notify();
      }
      return;
    }

    const p = this.state.people.find((x) => x.name === name);
    if (p) {
      if (data.name) p.name = data.name.trim();
      if (data.upiId !== undefined) p.upiId = (data.upiId || '').trim();
      p.updatedAt = Date.now();
      this.saveCurrentState();
      this.notify();
    }
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

  importData(jsonStr) {
    try {
      const parsed = JSON.parse(jsonStr);
      if (!parsed || typeof parsed !== 'object') {
        return { success: false, error: 'Invalid JSON data' };
      }

      if (parsed.schemaVersion === 2) {
        // Direct v2 import
        this.state = parsed;
        this.saveCurrentState();
        this.notify();
        return { success: true, message: 'Imported Canonical Schema v2 successfully' };
      }

      // Imported v1 data: store as v1 so controlled migration can be triggered
      this.state = parsed;
      this.saveCurrentState();
      this.notify();
      return { success: true, message: 'Imported Schema v1 data. Migration available in Settings.' };
    } catch (e) {
      return { success: false, error: e.message };
    }
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
