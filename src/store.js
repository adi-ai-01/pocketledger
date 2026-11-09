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

/** Compute net lending balance for every person from transactions */
export function computeLendingBalances(transactions) {
  if (globalStoreCore) {
    const projectedTxns = globalStoreCore.getState().transactions;
    if (transactions === projectedTxns || !transactions) {
      return globalStoreCore.computeBalances();
    }
  }

  const tempCore = new StoreCore({
    initialState: {
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
  if (globalStoreCore) {
    const projectedTxns = globalStoreCore.getState().transactions;
    if (transactions === projectedTxns || !transactions) {
      return globalStoreCore.computeMonthlyAnalytics(year, month);
    }
  }

  const tempCore = new StoreCore({
    initialState: {
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
  const addPerson = useCallback((name, upiId) => globalStoreCore.addPerson(name, upiId), []);
  const updatePerson = useCallback((name, data) => globalStoreCore.updatePerson(name, data), []);

  // ── Pending Alarms ──
  const addPendingAlarm = useCallback((alarm) => globalStoreCore.addPendingAlarm(alarm), []);
  const removePendingAlarm = useCallback((id) => globalStoreCore.removePendingAlarm(id), []);
  const resolvePendingAlarm = useCallback((alarmId, confirmed) => globalStoreCore.resolvePendingAlarm(alarmId, confirmed), []);

  // ── Settings ──
  const updateSettings = useCallback((patch) => globalStoreCore.updateSettings(patch), []);

  // ── Backup / Restore ──
  const exportData = useCallback(() => globalStoreCore.exportData(), []);
  const importData = useCallback((jsonStr) => globalStoreCore.importData(jsonStr), []);
  const exportCSV = useCallback(() => globalStoreCore.exportCSV(), []);

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

  return {
    state,
    migrationStatus,
    hasRollbackBackup,
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
    updatePerson,
    addPendingAlarm,
    removePendingAlarm,
    resolvePendingAlarm,
    updateSettings,
    exportData,
    importData,
    exportCSV,
  };
}
