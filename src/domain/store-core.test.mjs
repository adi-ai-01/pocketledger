import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  StoreCore,
  PRIMARY_STORAGE_KEY,
  BACKUP_STORAGE_KEY,
  defaultStateV1,
  defaultStateV2,
} from './store-core.js';
import { EVENT_KINDS, PARTY_USER } from './ledger.js';

// In-Memory Storage Mock satisfying Web Storage API
class MemoryStorage {
  constructor(initialData = {}) {
    this.store = new Map(Object.entries(initialData));
  }
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }
  setItem(key, value) {
    this.store.set(key, String(value));
  }
  removeItem(key) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

describe('StoreCore Integration & Migration Engine', () => {

  // 1. Loading an existing v1 dataset
  test('1. Loads an existing v1 dataset and leaves it unmigrated with migration status AVAILABLE', () => {
    const rawV1 = {
      transactions: [
        { id: 't1', type: 'give', person: 'Alice', amount: 500, date: '2026-11-01' },
      ],
      people: [{ id: 'p1', name: 'Alice' }],
      categories: ['Food'],
      settings: { currency: '₹', monthlyBudget: 10000 },
    };

    const storage = new MemoryStorage({ [PRIMARY_STORAGE_KEY]: JSON.stringify(rawV1) });
    const store = new StoreCore({ storage });

    assert.equal(store.isV2(), false);
    assert.equal(store.getMigrationStatus(), 'AVAILABLE');
    assert.equal(storage.getItem(PRIMARY_STORAGE_KEY), JSON.stringify(rawV1));
    assert.equal(storage.getItem(BACKUP_STORAGE_KEY), null);
  });

  // 2. Previewing migration without modifying LocalStorage
  test('2. Previewing migration computes metrics without modifying storage', () => {
    const rawV1 = {
      transactions: [
        { id: 't1', type: 'give', person: 'Alice', amount: 500, date: '2026-11-01' },
        { id: 't2', type: 'take', person: 'Bob', amount: 200, date: '2026-11-02' },
      ],
      people: [{ id: 'p1', name: 'Alice' }, { id: 'p2', name: 'Bob' }],
      categories: ['Food'],
      settings: { currency: '₹', monthlyBudget: 10000 },
    };

    const storage = new MemoryStorage({ [PRIMARY_STORAGE_KEY]: JSON.stringify(rawV1) });
    const store = new StoreCore({ storage });

    const preview = store.previewMigration();
    assert.equal(preview.isApplicable, true);
    assert.equal(preview.success, true);
    assert.equal(preview.transactionCount, 2);
    assert.equal(preview.peopleCount, 2);

    // Verify storage was untouched
    assert.equal(storage.getItem(PRIMARY_STORAGE_KEY), JSON.stringify(rawV1));
    assert.equal(storage.getItem(BACKUP_STORAGE_KEY), null);
  });

  // 3. Successful migration after explicit confirmation
  test('3. Successful migration creates backup, commits v2 state, and derives accurate balances', () => {
    const rawV1 = {
      transactions: [
        { id: 't1', type: 'give', person: 'Alice', amount: 500, date: '2026-11-01' },
        { id: 't2', type: 'settle', person: 'Alice', amount: 200, date: '2026-11-02' },
      ],
      people: [{ id: 'p1', name: 'Alice', upiId: 'alice@upi' }],
      categories: ['Food'],
      settings: { currency: '₹', monthlyBudget: 10000 },
    };

    const storage = new MemoryStorage({ [PRIMARY_STORAGE_KEY]: JSON.stringify(rawV1) });
    const store = new StoreCore({ storage });

    const result = store.executeMigration();
    assert.equal(result.success, true);
    assert.equal(store.isV2(), true);
    assert.equal(store.getMigrationStatus(), 'COMPLETED');

    // Backup was saved and matches original raw V1
    assert.equal(storage.getItem(BACKUP_STORAGE_KEY), JSON.stringify(rawV1));

    // Primary storage has schemaVersion 2
    const savedState = JSON.parse(storage.getItem(PRIMARY_STORAGE_KEY));
    assert.equal(savedState.schemaVersion, 2);

    // Balances are computed accurately
    const balances = store.computeBalances();
    assert.equal(balances['Alice'], 300); // 500 - 200 = 300
  });

  // 4. Failed migration leaves original data untouched
  test('4. Failed migration leaves original data untouched when transaction has unparseable corrupt amounts', () => {
    const corruptV1 = {
      transactions: [
        { id: 'bad-t', type: 'give', person: 'Alice', amount: NaN, date: '2026-11-01' },
      ],
      people: [{ id: 'p1', name: 'Alice' }],
      settings: {},
    };

    const storage = new MemoryStorage({ [PRIMARY_STORAGE_KEY]: JSON.stringify(corruptV1) });
    const store = new StoreCore({ storage });

    const result = store.executeMigration();
    assert.equal(result.success, false);
    assert.ok(result.error);

    // Primary storage remains the untouched original corrupt V1
    assert.equal(storage.getItem(PRIMARY_STORAGE_KEY), JSON.stringify(corruptV1));
    assert.equal(store.isV2(), false);
  });

  // 5. Backup verification failure
  test('5. Fails and aborts migration if backup cannot be verified', () => {
    const rawV1 = {
      transactions: [{ id: 't1', type: 'give', person: 'Alice', amount: 500, date: '2026-11-01' }],
      people: [{ id: 'p1', name: 'Alice' }],
      settings: {},
    };

    const storage = new MemoryStorage({ [PRIMARY_STORAGE_KEY]: JSON.stringify(rawV1) });
    // Sabotage setItem to corrupt backup
    const originalSetItem = storage.setItem.bind(storage);
    storage.setItem = (key, val) => {
      if (key === BACKUP_STORAGE_KEY) {
        originalSetItem(key, 'corrupted_backup_data');
      } else {
        originalSetItem(key, val);
      }
    };

    const store = new StoreCore({ storage });
    const result = store.executeMigration();

    assert.equal(result.success, false);
    assert.ok(result.error.includes('backup verification failed'));
    // Primary storage remains untouched
    assert.equal(storage.getItem(PRIMARY_STORAGE_KEY), JSON.stringify(rawV1));
  });

  // 6. Rollback to v1
  test('6. Rollback restores original raw v1 state from backup', () => {
    const rawV1 = {
      transactions: [{ id: 't1', type: 'give', person: 'Alice', amount: 500, date: '2026-11-01' }],
      people: [{ id: 'p1', name: 'Alice' }],
      settings: { currency: '₹' },
    };

    const storage = new MemoryStorage({ [PRIMARY_STORAGE_KEY]: JSON.stringify(rawV1) });
    const store = new StoreCore({ storage });

    // Migrate
    store.executeMigration();
    assert.equal(store.isV2(), true);
    assert.equal(store.hasRollbackBackup(), true);

    // Rollback
    const rollRes = store.rollbackMigration();
    assert.equal(rollRes.success, true);
    assert.equal(store.isV2(), false);
    assert.equal(storage.getItem(PRIMARY_STORAGE_KEY), JSON.stringify(rawV1));
  });

  // 7. Loading an existing v2 dataset
  test('7. Directly loads existing v2 dataset without running migration', () => {
    const v2State = defaultStateV2();
    v2State.transactions.push({
      id: 'e1',
      kind: EVENT_KINDS.TRANSFER,
      date: '2026-11-01',
      createdAt: 1000,
      fromPartyId: PARTY_USER,
      toPartyId: 'p-1',
      amountPaise: 40000,
    });
    v2State.people.push({
      id: 'p-1',
      name: 'Bob',
      upiId: 'bob@upi',
      isArchived: false,
      createdAt: 1000,
      updatedAt: 1000,
    });

    const storage = new MemoryStorage({ [PRIMARY_STORAGE_KEY]: JSON.stringify(v2State) });
    const store = new StoreCore({ storage });

    assert.equal(store.isV2(), true);
    assert.equal(store.getMigrationStatus(), 'COMPLETED');
    const balances = store.computeBalances();
    assert.equal(balances['Bob'], 400); // 40000 paise = ₹400
  });

  // 8. Reopening the application after migration
  test('8. Reopening the app by creating a new StoreCore instance retains v2 state', () => {
    const rawV1 = {
      transactions: [{ id: 't1', type: 'give', person: 'Alice', amount: 500, date: '2026-11-01' }],
      people: [{ id: 'p1', name: 'Alice' }],
      settings: {},
    };

    const storage = new MemoryStorage({ [PRIMARY_STORAGE_KEY]: JSON.stringify(rawV1) });
    const storeInstance1 = new StoreCore({ storage });
    storeInstance1.executeMigration();

    // App restarts: new store instance created with same storage
    const storeInstance2 = new StoreCore({ storage });
    assert.equal(storeInstance2.isV2(), true);
    assert.equal(storeInstance2.computeBalances()['Alice'], 500);
  });

  // 9. Existing UI store APIs & Compatibility Projection
  test('9. Existing UI store APIs (add, edit, delete, addPerson, updatePerson) work seamlessly', () => {
    const storage = new MemoryStorage();
    const store = new StoreCore({ storage }); // starts in v2 default

    // Add Person
    store.addPerson('Karan', 'karan@upi');
    assert.equal(store.getState().people.length, 1);
    assert.equal(store.getState().people[0].name, 'Karan');

    // Add Give Transaction via UI contract
    const addRes = store.addTransaction({
      type: 'give',
      person: 'Karan',
      amount: 1500,
      description: 'Dinner loan',
      category: 'Food',
      date: '2026-11-01',
    });
    assert.equal(addRes.success, true);
    assert.equal(store.computeBalances()['Karan'], 1500);

    // Edit Transaction
    const txnId = store.getState().transactions[0].id;
    const editRes = store.editTransaction(txnId, {
      amount: 1200,
      description: 'Dinner loan updated',
    });
    assert.equal(editRes.success, true);
    assert.equal(store.computeBalances()['Karan'], 1200);

    // Delete Transaction
    const delRes = store.deleteTransaction(txnId);
    assert.equal(delRes.success, true);
    assert.equal(store.computeBalances()['Karan'], 0);
  });

  // 10. Partial and full repayment with overpayment rejection
  test('10. Settle action correctly derives repayment direction and strictly rejects overpayment', () => {
    const storage = new MemoryStorage();
    const store = new StoreCore({ storage });

    store.addPerson('Rohan');

    // User lends ₹1,000 to Rohan (Rohan owes user ₹1,000)
    store.addTransaction({
      type: 'give',
      person: 'Rohan',
      amount: 1000,
      date: '2026-11-01',
    });
    assert.equal(store.computeBalances()['Rohan'], 1000);

    // Overpayment rejection: Rohan owes ₹1,000, but settlement is ₹1,200
    const overpaymentRes = store.addTransaction({
      type: 'settle',
      person: 'Rohan',
      amount: 1200,
      date: '2026-11-02',
    });
    assert.equal(overpaymentRes.success, false);
    assert.ok(overpaymentRes.error.includes('exceeds'));
    assert.equal(store.computeBalances()['Rohan'], 1000); // balance remains 1000

    // Valid partial repayment: Rohan pays ₹400
    const partialRes = store.addTransaction({
      type: 'settle',
      person: 'Rohan',
      amount: 400,
      date: '2026-11-02',
    });
    assert.equal(partialRes.success, true);
    assert.equal(store.computeBalances()['Rohan'], 600); // 1000 - 400 = 600

    // Valid remaining full repayment: Rohan pays ₹600
    const fullRes = store.addTransaction({
      type: 'settle',
      person: 'Rohan',
      amount: 600,
      date: '2026-11-03',
    });
    assert.equal(fullRes.success, true);
    assert.equal(store.computeBalances()['Rohan'], 0); // fully settled
  });

  // 11. Downstream repayment validation blocks historical edit/delete
  test('11. Downstream repayment validation blocks editing or deleting an earlier loan that invalidates repayments', () => {
    const storage = new MemoryStorage();
    const store = new StoreCore({ storage });

    store.addPerson('Vikram');

    // Nov 1: Loan ₹1,000
    store.addTransaction({
      id: 'loan-1',
      type: 'give',
      person: 'Vikram',
      amount: 1000,
      date: '2026-11-01',
    });

    // Nov 5: Full Repayment ₹1,000
    store.addTransaction({
      id: 'settle-1',
      type: 'settle',
      person: 'Vikram',
      amount: 1000,
      date: '2026-11-05',
    });

    assert.equal(store.computeBalances()['Vikram'], 0);

    // Attempt to delete loan-1: should fail because settle-1 would exceed balance
    const delRes = store.deleteTransaction('loan-1');
    assert.equal(delRes.success, false);
    assert.ok(delRes.error.includes('chronological repayment conflict'));

    // Attempt to edit loan-1 down to ₹500: should fail because settle-1 is ₹1,000
    const editRes = store.editTransaction('loan-1', { amount: 500 });
    assert.equal(editRes.success, false);
    assert.ok(editRes.error.includes('chronological repayment conflict'));
  });

  // 12. Pending alarms never generate duplicate settlements
  test('12. Resolving a pending alarm removes it from review queue without creating duplicate settlements', () => {
    const rawV1 = {
      transactions: [{ id: 't1', type: 'give', person: 'Alice', amount: 500, date: '2026-11-01' }],
      people: [{ id: 'p1', name: 'Alice' }],
      pendingAlarms: [
        { id: 'al-1', txnId: 't1', personName: 'Alice', amount: 500, direction: 'gave', createdAt: 1234 },
      ],
      settings: {},
    };

    const storage = new MemoryStorage({ [PRIMARY_STORAGE_KEY]: JSON.stringify(rawV1) });
    const store = new StoreCore({ storage });
    store.executeMigration();

    assert.equal(store.getState().transactions.length, 1);
    assert.equal(store.getState().pendingAlarms.length, 1);

    // Resolve alarm
    store.resolvePendingAlarm('al-1', true);

    // Alarm is cleared, and NO duplicate settle transaction was added!
    assert.equal(store.getState().pendingAlarms.length, 0);
    assert.equal(store.getState().transactions.length, 1);
    assert.equal(store.computeBalances()['Alice'], 500); // Alice still owes 500
  });

  // 13. Exporting and restoring v2 data
  test('13. Exporting and importing v2 JSON data works reliably', () => {
    const storage = new MemoryStorage();
    const store = new StoreCore({ storage });

    store.addPerson('Dev');
    store.addTransaction({
      type: 'give',
      person: 'Dev',
      amount: 800,
      date: '2026-11-01',
    });

    const exportedJson = store.exportData();
    const parsed = JSON.parse(exportedJson);
    assert.equal(parsed.schemaVersion, 2);

    const storage2 = new MemoryStorage();
    const store2 = new StoreCore({ storage: storage2 });
    const importRes = store2.importData(exportedJson);

    assert.equal(importRes.success, true);
    assert.equal(store2.isV2(), true);
    assert.equal(store2.computeBalances()['Dev'], 800);
  });
});
