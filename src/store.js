import { useState, useCallback, useEffect } from 'react';
import {
  StoreCore,
  PRIMARY_STORAGE_KEY,
  BACKUP_STORAGE_KEY,
  uid,
  isValidUpiId,
} from './domain/store-core.js';

// Global singleton instance backed by window.localStorage
const defaultStorage = typeof window !== 'undefined' ? window.localStorage : null;
export const globalStoreCore = new StoreCore({ storage: defaultStorage });

function extractPeopleFromTransactions(transactions = []) {
  const peopleMap = new Map();
  if (globalStoreCore?.state?.people) {
    for (const p of globalStoreCore.state.people) {
      if (p?.id) peopleMap.set(p.id, p);
    }
  }
  for (const t of transactions || []) {
    if (!t) continue;
    const raw = t.rawEvent || t;
    const personId = t.personId || raw.personId || (raw.fromPartyId && raw.fromPartyId !== 'USER' ? raw.fromPartyId : (raw.toPartyId && raw.toPartyId !== 'USER' ? raw.toPartyId : null));
    const personName = t.person || t.payerName || t.personName;
    if (personId && personName && personId !== 'USER') {
      peopleMap.set(personId, { id: personId, name: personName, upiId: t.upiId || '' });
    }
    if (Array.isArray(t.splits)) {
      for (const s of t.splits) {
        if (s?.personId && s?.person) {
          peopleMap.set(s.personId, { id: s.personId, name: s.person, upiId: s.upiId || '' });
        }
      }
    }
    if (Array.isArray(raw.allocations)) {
      for (const a of raw.allocations) {
        if (a?.personId && a?.person) {
          peopleMap.set(a.personId, { id: a.personId, name: a.person, upiId: a.upiId || '' });
        }
      }
    }
  }
  return [...peopleMap.values()];
}

/** Compute net lending balance for every person from transactions */
export function computeLendingBalances(transactions) {
  if (!transactions && globalStoreCore) {
    return globalStoreCore.computeBalances();
  }

  const isV2 = Array.isArray(transactions) && transactions.some((t) => t?.kind || t?.rawEvent);
  const canonicalTxns = isV2 ? transactions.map((t) => t.rawEvent || t) : (transactions || []);

  const tempCore = new StoreCore({
    initialState: isV2 ? {
      schemaVersion: 2,
      transactions: canonicalTxns,
      people: extractPeopleFromTransactions(transactions),
    } : {
      version: 1,
      transactions: transactions || [],
      people: [],
    },
    storage: null,
  });
  return tempCore.computeBalances();
}

/** Monthly analytics — spending by category, daily totals, totals */
export function computeMonthlyAnalytics(transactions, year, month) {
  if (!transactions && globalStoreCore) {
    return globalStoreCore.computeMonthlyAnalytics(year, month);
  }

  const isV2 = Array.isArray(transactions) && transactions.some((t) => t?.kind || t?.rawEvent);
  const canonicalTxns = isV2 ? transactions.map((t) => t.rawEvent || t) : (transactions || []);

  const tempCore = new StoreCore({
    initialState: isV2 ? {
      schemaVersion: 2,
      transactions: canonicalTxns,
      people: extractPeopleFromTransactions(transactions),
    } : {
      version: 1,
      transactions: transactions || [],
      people: [],
    },
    storage: null,
  });
  return tempCore.computeMonthlyAnalytics(year, month);
}

/** Get all transactions involving a specific person */
export function getPersonHistory(transactions, personName) {
  if (!personName) return [];
  return (transactions || [])
    .filter((t) => {
      if (t.person === personName) return true;
      if (Array.isArray(t.splits) && t.splits.some((s) => s.person === personName)) return true;
      return false;
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

export { uid, isValidUpiId, PRIMARY_STORAGE_KEY, BACKUP_STORAGE_KEY };

/**
 * React hook to consume PocketLedger state powered by StoreCore
 */
export function useStore() {
  const [state, setState] = useState(() => globalStoreCore.getState());
  const [migrationStatus, setMigrationStatus] = useState(() => globalStoreCore.getMigrationStatus());
  const [hasRollbackBackup, setHasRollbackBackup] = useState(() => globalStoreCore.hasRollbackBackup());

  useEffect(() => {
    // Initial sync
    setState(globalStoreCore.getState());
    setMigrationStatus(globalStoreCore.getMigrationStatus());
    setHasRollbackBackup(globalStoreCore.hasRollbackBackup());

    const unsubscribe = globalStoreCore.subscribe(() => {
      setState(globalStoreCore.getState());
      setMigrationStatus(globalStoreCore.getMigrationStatus());
      setHasRollbackBackup(globalStoreCore.hasRollbackBackup());
    });
    return unsubscribe;
  }, []);

  // ── Transaction CRUD ──
  const addTransaction = useCallback((txn) => globalStoreCore.addTransaction(txn), []);
  const editTransaction = useCallback((id, updates) => globalStoreCore.editTransaction(id, updates), []);
  const deleteTransaction = useCallback((id) => globalStoreCore.deleteTransaction(id), []);

  // ── People ──
  const addPerson = useCallback((name, upiId, phone) => globalStoreCore.addPerson(name, upiId, phone), []);
  const createExplicitPerson = useCallback((data) => globalStoreCore.createExplicitPerson(data), []);
  const updatePerson = useCallback((name, data) => globalStoreCore.updatePerson(name, data), []);
  const archivePerson = useCallback((nameOrId) => globalStoreCore.archivePerson(nameOrId), []);
  const unarchivePerson = useCallback((nameOrId) => globalStoreCore.unarchivePerson(nameOrId), []);
  const getPersonTimeline = useCallback((nameOrId) => globalStoreCore.getPersonTimeline(nameOrId), []);
  const getPeopleDirectory = useCallback(() => globalStoreCore.getPeopleDirectory(), []);
  const getAttentionItems = useCallback(() => globalStoreCore.getAttentionItems(), []);

  // ── Pending Alarms ──
  const addPendingAlarm = useCallback((alarm) => globalStoreCore.addPendingAlarm(alarm), []);
  const removePendingAlarm = useCallback((id) => globalStoreCore.removePendingAlarm(id), []);
  const resolvePendingAlarm = useCallback((alarmId, confirmed) => globalStoreCore.resolvePendingAlarm(alarmId, confirmed), []);

  // ── Settings ──
  const updateSettings = useCallback((patch) => globalStoreCore.updateSettings(patch), []);

  // ── Backup / Restore ──
  const exportData = useCallback(() => globalStoreCore.exportData(), []);
  const importData = useCallback((jsonStr) => globalStoreCore.importData(jsonStr), []);
  const previewImport = useCallback((jsonStr) => globalStoreCore.previewImport(jsonStr), []);
  const hasPreImportBackup = useCallback(() => globalStoreCore.hasPreImportBackup(), []);
  const getPreImportBackup = useCallback(() => globalStoreCore.getPreImportBackup(), []);
  const rollbackPreImport = useCallback(() => globalStoreCore.rollbackPreImport(), []);
  const exportCSV = useCallback(() => globalStoreCore.exportCSV(), []);
  const markTransactionReviewed = useCallback((id) => globalStoreCore.markTransactionReviewed(id), []);

  // ── Controlled Migration ──
  const previewMigration = useCallback(() => globalStoreCore.previewMigration(), []);
  const executeMigration = useCallback(() => globalStoreCore.executeMigration(), []);
  const rollbackMigration = useCallback(() => globalStoreCore.rollbackMigration(), []);
  const getRawV1Backup = useCallback(() => globalStoreCore.getRawV1Backup(), []);

  // ── Payment Attempts & Balances ──
  const createPaymentAttempt = useCallback((p) => globalStoreCore.createPaymentAttempt(p), []);
  const getPaymentAttempts = useCallback(() => globalStoreCore.getPaymentAttempts(), []);
  const getUnresolvedPaymentAttempts = useCallback(() => globalStoreCore.getUnresolvedPaymentAttempts(), []);
  const reconcilePaymentAttempt = useCallback((id, data) => globalStoreCore.reconcilePaymentAttempt(id, data), []);
  const dismissPaymentAttempt = useCallback((id) => globalStoreCore.dismissPaymentAttempt(id), []);
  const getPeopleWithBalances = useCallback(() => globalStoreCore.getPeopleWithBalances(), []);

  // ── Canonical Calculations ──
  const computeBalances = useCallback(() => globalStoreCore.computeBalances(), []);
  const computeMonthlyAnalytics = useCallback((year, month) => globalStoreCore.computeMonthlyAnalytics(year, month), []);

  return {
    state,
    migrationStatus,
    hasRollbackBackup,
    computeBalances,
    computeMonthlyAnalytics,
    previewMigration,
    executeMigration,
    rollbackMigration,
    getRawV1Backup,
    createPaymentAttempt,
    getPaymentAttempts,
    getUnresolvedPaymentAttempts,
    reconcilePaymentAttempt,
    dismissPaymentAttempt,
    getPeopleWithBalances,
    addTransaction,
    editTransaction,
    deleteTransaction,
    addPerson,
    createExplicitPerson,
    updatePerson,
    archivePerson,
    unarchivePerson,
    getPersonTimeline,
    getPeopleDirectory,
    getAttentionItems,
    addPendingAlarm,
    removePendingAlarm,
    resolvePendingAlarm,
    updateSettings,
    exportData,
    importData,
    previewImport,
    hasPreImportBackup,
    getPreImportBackup,
    rollbackPreImport,
    markTransactionReviewed,
    exportCSV,
  };
}
