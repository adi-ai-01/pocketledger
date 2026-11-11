import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  StoreCore,
  PRIMARY_STORAGE_KEY,
  BACKUP_STORAGE_KEY,
  defaultStateV1,
  defaultStateV2,
  isValidUpiId,
} from './store-core.js';
import { EVENT_KINDS, PARTY_USER, allocateEqualShares } from './ledger.js';

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

  // 14. Phase 4: Personal Expense (Self-Paid vs Covered by Counterparty)
  test('14. Phase 4: Personal Expense workflows update spending and counterparties correctly', () => {
    const storage = new MemoryStorage();
    const store = new StoreCore({ storage });

    store.addPerson('Aarav');

    // Case A: User-paid solo personal expense
    const resA = store.addTransaction({
      type: 'personal_expense',
      amount: 450,
      description: 'Groceries',
      category: 'Food',
      date: '2026-11-02',
      paidBy: 'user',
      paymentMethod: 'CASH',
    });
    assert.equal(resA.success, true);
    // Spending increases by ₹450
    assert.equal(store.computeMonthlyAnalytics(2026, 10).totalSpent, 450);
    // Aarav balance unaffected
    assert.equal(store.computeBalances()['Aarav'], 0);

    // Case B: Counterparty-paid personal expense (Aarav paid for user's medicine)
    const resB = store.addTransaction({
      type: 'personal_expense',
      amount: 600,
      description: 'Prescription medicine',
      category: 'Health',
      date: '2026-11-03',
      paidBy: 'Aarav',
      paymentMethod: 'OTHER',
    });
    assert.equal(resB.success, true);
    // Personal spending increases by ₹600 (total ₹1,050)
    assert.equal(store.computeMonthlyAnalytics(2026, 10).totalSpent, 1050);
    // User owes Aarav ₹600 (Aarav balance is -600)
    assert.equal(store.computeBalances()['Aarav'], -600);
  });

  // 15. Phase 4: Shared Expense (Equal split & User paid)
  test('15. Phase 4: Shared Expense with equal split creates receivables and conserves total', () => {
    const storage = new MemoryStorage();
    const store = new StoreCore({ storage });

    store.addPerson('Bob');
    store.addPerson('Charlie');

    // ₹1,200 dinner split equally between User, Bob, Charlie (₹400 each)
    const res = store.addTransaction({
      type: 'shared_expense',
      amount: 1200,
      payer: 'user',
      userShare: 400,
      allocations: [
        { person: 'Bob', amount: 400 },
        { person: 'Charlie', amount: 400 },
      ],
      description: 'Team Dinner',
      category: 'Food',
      date: '2026-11-04',
    });
    assert.equal(res.success, true);
    // Personal spending = user's share (₹400)
    assert.equal(store.computeMonthlyAnalytics(2026, 10).totalSpent, 400);
    // Receivables created for others
    assert.equal(store.computeBalances()['Bob'], 400);
    assert.equal(store.computeBalances()['Charlie'], 400);
  });

  // 16. Phase 4: Shared Expense with Custom Split & Third-Party Payer
  test('16. Phase 4: Shared Expense custom split enforces conservation and isolates non-user debts', () => {
    const storage = new MemoryStorage();
    const store = new StoreCore({ storage });

    store.addPerson('Pooja');
    store.addPerson('Ravi');

    // Case A: Discrepancy rejected when shares do not sum to total bill
    const failRes = store.addTransaction({
      type: 'shared_expense',
      amount: 1000,
      payer: 'user',
      userShare: 300,
      allocations: [{ person: 'Pooja', amount: 500 }], // 300 + 500 = 800 != 1000
      date: '2026-11-05',
    });
    assert.equal(failRes.success, false);
    assert.ok(failRes.error.includes('conserve'));

    // Case B: Pooja paid ₹1,500 total bill: Pooja's share ₹500, Ravi's share ₹500, User's share ₹500
    const passRes = store.addTransaction({
      type: 'shared_expense',
      amount: 1500,
      payer: 'Pooja',
      userShare: 500,
      allocations: [
        { person: 'Pooja', amount: 500 },
        { person: 'Ravi', amount: 500 },
      ],
      description: 'Weekend Cabin Rental',
      category: 'Entertainment',
      date: '2026-11-05',
    });
    assert.equal(passRes.success, true);
    // User spending is ₹500
    assert.equal(store.computeMonthlyAnalytics(2026, 10).totalSpent, 500);
    // User owes Pooja ₹500
    assert.equal(store.computeBalances()['Pooja'], -500);
    // Ravi's balance with user is 0 (Ravi owes Pooja directly, outside user's ledger)
    assert.equal(store.computeBalances()['Ravi'], 0);
  });

  // 17. Phase 4: Lend Money and Borrow Money
  test('17. Phase 4: Lend and Borrow journeys update peer debt without affecting personal spending', () => {
    const storage = new MemoryStorage();
    const store = new StoreCore({ storage });

    store.addPerson('Karan');
    store.addPerson('Meera');

    // Lend ₹2,000 to Karan
    const lendRes = store.addTransaction({
      type: 'lend',
      person: 'Karan',
      amount: 2000,
      description: 'Advance loan',
      date: '2026-11-06',
      paymentMethod: 'CASH',
    });
    assert.equal(lendRes.success, true);
    assert.equal(store.computeBalances()['Karan'], 2000);

    // Borrow ₹1,500 from Meera
    const borrowRes = store.addTransaction({
      type: 'borrow',
      person: 'Meera',
      amount: 1500,
      description: 'Short loan from Meera',
      date: '2026-11-06',
      paymentMethod: 'UPI',
    });
    assert.equal(borrowRes.success, true);
    assert.equal(store.computeBalances()['Meera'], -1500);

    // Personal spending remains 0 for lending/borrowing transfers
    assert.equal(store.computeMonthlyAnalytics(2026, 10).totalSpent, 0);
  });

  // 18. Phase 4: Repayment Journey with Overpayment Guard
  test('18. Phase 4: Repayment determines direction automatically and blocks overpayment', () => {
    const storage = new MemoryStorage();
    const store = new StoreCore({ storage });

    store.addPerson('Arjun');

    // Lend ₹1,000 to Arjun
    store.addTransaction({
      type: 'lend',
      person: 'Arjun',
      amount: 1000,
      date: '2026-11-01',
    });
    assert.equal(store.computeBalances()['Arjun'], 1000);

    // Attempt overpayment of ₹1,200
    const overRes = store.addTransaction({
      type: 'repayment',
      person: 'Arjun',
      amount: 1200,
      date: '2026-11-02',
    });
    assert.equal(overRes.success, false);
    assert.ok(overRes.error.includes('exceeds'));

    // Partial repayment of ₹400
    const partRes = store.addTransaction({
      type: 'repayment',
      person: 'Arjun',
      amount: 400,
      date: '2026-11-02',
    });
    assert.equal(partRes.success, true);
    assert.equal(store.computeBalances()['Arjun'], 600);

    // Full remaining repayment of ₹600
    const fullRes = store.addTransaction({
      type: 'repayment',
      person: 'Arjun',
      amount: 600,
      date: '2026-11-03',
    });
    assert.equal(fullRes.success, true);
    assert.equal(store.computeBalances()['Arjun'], 0);

    // Additional repayment when balance is 0 is rejected
    const zeroRes = store.addTransaction({
      type: 'repayment',
      person: 'Arjun',
      amount: 100,
      date: '2026-11-04',
    });
    assert.equal(zeroRes.success, false);
  });

  // 19. Phase 4: UPI Payment Attempt Lifecycle & Reconciliation
  test('19. Phase 4: UPI payment attempt validates handle, tracks attempt, and reconciles distinctly', () => {
    const storage = new MemoryStorage();
    const store = new StoreCore({ storage });

    store.addPerson('Suresh', 'suresh@upi');

    // A: Invalid UPI handle rejected
    assert.equal(isValidUpiId('not-a-upi-id'), false);
    assert.equal(isValidUpiId('suresh@okicici'), true);

    const invalidAttempt = store.createPaymentAttempt({
      personName: 'Suresh',
      upiId: 'invalid-upi',
      amountRupees: 500,
    });
    assert.equal(invalidAttempt.success, false);
    assert.ok(invalidAttempt.error.includes('Invalid UPI ID'));

    // B: Valid attempt created with INITIATED status
    const initRes = store.createPaymentAttempt({
      personId: store.getState().people[0].id,
      personName: 'Suresh',
      upiId: 'suresh@okaxis',
      amountRupees: 500,
      note: 'Lending for lunch',
    });
    assert.equal(initRes.success, true);
    const attemptId = initRes.attempt.id;
    assert.equal(initRes.attempt.status, 'INITIATED');
    assert.equal(initRes.attempt.isUnresolved, true);
    assert.ok(initRes.attempt.intentUrl.startsWith('upi://pay?pa=suresh%40okaxis'));

    // C: Reconciliation as FAILED or CANCELLED produces zero ledger mutations
    const cancelRes = store.reconcilePaymentAttempt(attemptId, {
      outcome: 'CANCELLED',
      notes: 'User cancelled in Google Pay',
    });
    assert.equal(cancelRes.success, true);
    assert.equal(cancelRes.attempt.status, 'CANCELLED');
    assert.equal(cancelRes.attempt.isUnresolved, false);
    assert.equal(store.getState().transactions.length, 0); // No transaction added!

    // D: Duplicate reconciliation on already-settled attempt is rejected
    const dupRes = store.reconcilePaymentAttempt(attemptId, { outcome: 'SUCCESS' });
    assert.equal(dupRes.success, false);
    assert.ok(dupRes.error.includes('already been reconciled'));

    // E: Successful reconciliation creates ledger event with linked attemptId
    const initRes2 = store.createPaymentAttempt({
      personName: 'Suresh',
      upiId: 'suresh@okaxis',
      amountRupees: 750,
    });
    const attempt2Id = initRes2.attempt.id;

    const successRes = store.reconcilePaymentAttempt(attempt2Id, {
      outcome: 'SUCCESS',
      ledgerTxnData: {
        type: 'lend',
        person: 'Suresh',
        amount: 750,
        description: 'Lend via UPI',
        date: '2026-11-07',
      },
      notes: 'Confirmed in bank SMS',
    });
    assert.equal(successRes.success, true);
    assert.equal(successRes.attempt.status, 'COMPLETED');
    assert.equal(successRes.attempt.isUnresolved, false);
    assert.ok(successRes.attempt.eventId);

    // Ledger balance updated
    assert.equal(store.computeBalances()['Suresh'], 750);
  });

  // 20. Phase 4: People with Balances Helper
  test('20. Phase 4: getPeopleWithBalances sorts active counterparties correctly', () => {
    const storage = new MemoryStorage();
    const store = new StoreCore({ storage });

    store.addPerson('Alice');
    store.addPerson('Bob');
    store.addPerson('Charlie'); // zero balance

    store.addTransaction({ type: 'lend', person: 'Alice', amount: 300, date: '2026-11-01' });
    store.addTransaction({ type: 'borrow', person: 'Bob', amount: 800, date: '2026-11-01' });

    const active = store.getPeopleWithBalances();
    assert.equal(active.length, 2);
    // Bob has |balance| = 800, Alice has |balance| = 300
    assert.equal(active[0].name, 'Bob');
    assert.equal(active[0].balanceRupees, -800);
    assert.equal(active[1].name, 'Alice');
    assert.equal(active[1].balanceRupees, 300);
  });

  // 21. Phase 4: Payment Attempt Idempotency & Distinction
  test('21. Phase 4: Payment attempt deduplication prevents multiple transactions per attempt and preserves distinct statuses', () => {
    const storage = new MemoryStorage();
    const store = new StoreCore({ storage });

    store.addPerson('Vikram', 'vikram@okaxis');

    const initRes = store.createPaymentAttempt({
      personName: 'Vikram',
      upiId: 'vikram@okaxis',
      amountRupees: 500,
    });
    const attemptId = initRes.attempt.id;

    // Successful reconciliation creates exactly 1 transaction
    const recRes = store.reconcilePaymentAttempt(attemptId, {
      outcome: 'SUCCESS',
      ledgerTxnData: {
        type: 'lend',
        person: 'Vikram',
        amount: 500,
        date: '2026-11-08',
      },
    });
    assert.equal(recRes.success, true);
    assert.equal(store.getState().transactions.length, 1);

    // Direct attempt to add another transaction with the same paymentAttemptId is rejected
    const dupTxnRes = store.addTransaction({
      type: 'lend',
      person: 'Vikram',
      amount: 500,
      date: '2026-11-08',
      paymentAttemptId: attemptId,
    });
    assert.equal(dupTxnRes.success, false);
    assert.ok(dupTxnRes.error.includes('already generated a ledger transaction'));
    assert.equal(store.getState().transactions.length, 1);

    // UNKNOWN outcome preserves unresolved state for subsequent verification
    const initRes2 = store.createPaymentAttempt({
      personName: 'Vikram',
      upiId: 'vikram@okaxis',
      amountRupees: 200,
    });
    const attempt2Id = initRes2.attempt.id;

    const unkRes = store.reconcilePaymentAttempt(attempt2Id, {
      outcome: 'UNKNOWN',
      notes: 'Bank pending',
    });
    assert.equal(unkRes.success, true);
    assert.equal(unkRes.attempt.status, 'UNKNOWN');
    assert.equal(unkRes.attempt.isUnresolved, true);
    assert.equal(store.getUnresolvedPaymentAttempts().some((a) => a.id === attempt2Id), true);
    // No ledger event was created
    assert.equal(store.getState().transactions.length, 1);
  });

  // 22. Phase 5: Person Archival Enforces Zero-Balance Domain Invariant
  test('22. Phase 5: Person archival enforces zero-balance domain rule and unarchive restores status', () => {
    const storage = new MemoryStorage();
    const store = new StoreCore({ storage });

    const p = store.addPerson('Divya', 'divya@okhdfcbank');
    assert.equal(p.isArchived, false);

    // Initial balance is 0: Archiving succeeds
    const arch1 = store.archivePerson('Divya');
    assert.equal(arch1.success, true);
    assert.equal(store.getState().people.find((x) => x.name === 'Divya').isArchived, true);

    // Unarchive
    const unarch = store.unarchivePerson('Divya');
    assert.equal(unarch.success, true);
    assert.equal(store.getState().people.find((x) => x.name === 'Divya').isArchived, false);

    // Give loan of ₹500 to Divya
    store.addTransaction({
      type: 'lend',
      person: 'Divya',
      amount: 500,
      date: '2026-11-01',
    });
    assert.equal(store.computeBalances()['Divya'], 500);

    // Attempting to archive while balance is active must be rejected
    const blockedArch = store.archivePerson('Divya');
    assert.equal(blockedArch.success, false);
    assert.ok(blockedArch.error.includes('active balance'));
    assert.equal(store.getState().people.find((x) => x.name === 'Divya').isArchived, false);

    // Settle balance back to 0
    store.addTransaction({
      type: 'repayment',
      person: 'Divya',
      amount: 500,
      date: '2026-11-02',
    });
    assert.equal(store.computeBalances()['Divya'], 0);

    // Now archiving succeeds
    const arch2 = store.archivePerson('Divya');
    assert.equal(arch2.success, true);
    assert.equal(store.getState().people.find((x) => x.name === 'Divya').isArchived, true);
  });

  // 23. Phase 5: Person Timeline Running Balance & Directory Last Activity
  test('23. Phase 5: Person timeline derives running balance chronologically and directory aggregates activity', () => {
    const storage = new MemoryStorage();
    const store = new StoreCore({ storage });

    store.addPerson('Aditi', 'aditi@axis');

    // Event 1: Lend ₹1,000 on 2026-11-01
    store.addTransaction({
      type: 'lend',
      person: 'Aditi',
      amount: 1000,
      date: '2026-11-01',
      description: 'First loan',
    });

    // Event 2: Aditi repays ₹400 on 2026-11-03
    store.addTransaction({
      type: 'repayment',
      person: 'Aditi',
      amount: 400,
      date: '2026-11-03',
      description: 'Partial return',
    });

    // Event 3: Lend another ₹500 on 2026-11-05
    store.addTransaction({
      type: 'lend',
      person: 'Aditi',
      amount: 500,
      date: '2026-11-05',
      description: 'Second loan',
    });

    const res = store.getPersonTimeline('Aditi');
    assert.equal(res.currentBalanceRupees, 1100);
    // Timeline is reversed for display (newest first)
    assert.equal(res.timeline.length, 3);

    // Newest: Second loan (running balance 1100)
    assert.equal(res.timeline[0].description, 'Second loan');
    assert.equal(res.timeline[0].deltaRupees, 500);
    assert.equal(res.timeline[0].runningBalanceRupees, 1100);

    // Middle: Partial return (running balance 600)
    assert.equal(res.timeline[1].description, 'Partial return');
    assert.equal(res.timeline[1].deltaRupees, -400);
    assert.equal(res.timeline[1].runningBalanceRupees, 600);

    // Oldest: First loan (running balance 1000)
    assert.equal(res.timeline[2].description, 'First loan');
    assert.equal(res.timeline[2].deltaRupees, 1000);
    assert.equal(res.timeline[2].runningBalanceRupees, 1000);

    // Directory check
    const dir = store.getPeopleDirectory();
    const aditiEntry = dir.find((x) => x.name === 'Aditi');
    assert.ok(aditiEntry);
    assert.equal(aditiEntry.balanceRupees, 1100);
    assert.equal(aditiEntry.transactionCount, 3);
    assert.equal(aditiEntry.lastActivityDate, '2026-11-05');

    // Attention items check
    const att = store.getAttentionItems();
    assert.equal(typeof att.totalCount, 'number');
  });

  // 24. Phase 6: Safe Import Validation, Preview, and Safety Backup Verification
  test('24. Phase 6: Safe import preview validates structure, creates pre-import safety backup, and supports rollback', () => {
    const storage = new MemoryStorage();
    const store = new StoreCore({ storage });

    // Populate current active ledger with 1 transaction
    store.addPerson('Kavya');
    store.addTransaction({
      type: 'personal_expense',
      amount: 250,
      description: 'Books',
      category: 'Education',
      date: '2026-11-01',
    });
    assert.equal(store.getState().transactions.length, 1);

    // Case A: Invalid JSON string is rejected with clear error
    const badRes = store.previewImport('{ not valid json');
    assert.equal(badRes.isValid, false);
    assert.ok(badRes.error.includes('JSON Parse Error'));

    // Case B: Valid v2 JSON preview counts records and flags warnings if any
    const validV2Json = JSON.stringify({
      schemaVersion: 2,
      transactions: [
        {
          id: 't-101',
          kind: 'EXPENSE',
          payerId: 'USER',
          totalAmountPaise: 50000,
          userSharePaise: 50000,
          allocations: [],
          date: '2026-11-02',
          createdAt: Date.now(),
        },
      ],
      people: [{ id: 'p-1', name: 'Rohan', upiId: '' }],
    });

    const preview = store.previewImport(validV2Json);
    assert.equal(preview.isValid, true);
    assert.equal(preview.preview.schemaVersion, 2);
    assert.equal(preview.preview.transactionCount, 1);
    assert.equal(preview.preview.peopleCount, 1);
    assert.equal(preview.preview.warnings.length, 0);

    // Case C: Executing import creates safety backup and updates active state
    assert.equal(store.hasPreImportBackup(), false);
    const impRes = store.importData(validV2Json);
    assert.equal(impRes.success, true);
    assert.equal(store.hasPreImportBackup(), true);
    assert.equal(store.getState().transactions.length, 1);
    assert.equal(store.getState().people[0].name, 'Rohan');

    // Case D: Rollback restores pre-import active ledger (Books transaction)
    const rollRes = store.rollbackPreImport();
    assert.equal(rollRes.success, true);
    assert.equal(store.getState().transactions.length, 1);
    assert.equal(store.getState().transactions[0].description, 'Books');

    // Case E: Mark legacy unclassified event as reviewed
    store.state.transactions.push({
      id: 'legacy-unclass-1',
      kind: 'LEGACY_UNCLASSIFIED',
      legacyType: 'give',
      personId: 'p-kavya',
      amountPaise: 10000,
      date: '2026-10-01',
      createdAt: Date.now(),
      reviewRequired: true,
    });
    const revRes = store.markTransactionReviewed('legacy-unclass-1');
    assert.equal(revRes.success, true);
    const updatedEvt = store.state.transactions.find((t) => t.id === 'legacy-unclass-1');
    assert.equal(updatedEvt.reviewRequired, false);
  });

  // 25. Shared Expense QA Fix: Equal Split with Demo Fixture & Contact Retention
  test('25. Phase 7: Shared expense equal split divides ₹900 three ways, preserves contact identities, updates balances, and isolates user spending', () => {
    const fixtureRaw = fs.readFileSync(new URL('../../test-fixtures/pocketledger-v1-demo.json', import.meta.url), 'utf8');
    const storage = new MemoryStorage();
    const store = new StoreCore({ storage });

    // Load fixture and migrate to v2
    store.importData(fixtureRaw);
    const migRes = store.executeMigration();
    assert.equal(migRes.success, true);

    const dirBefore = store.getPeopleDirectory();
    assert.equal(dirBefore.length, 4);

    const aaravBefore = dirBefore.find((p) => p.name === 'Aarav Sharma');
    const rohanBefore = dirBefore.find((p) => p.name === 'Rohan Verma');
    const diyaBefore = dirBefore.find((p) => p.name === 'Diya Patel');
    const ananyaBefore = dirBefore.find((p) => p.name === 'Ananya Iyer');

    assert.equal(aaravBefore.balanceRupees, 2250);
    assert.equal(rohanBefore.balanceRupees, 1200);
    assert.equal(diyaBefore.balanceRupees, -900);
    assert.equal(ananyaBefore.balanceRupees, 2200);

    // Intended QA test: ₹900 bill split equally among User, Aarav Sharma, Rohan Verma (₹300 each)
    const res = store.addTransaction({
      type: 'shared_expense',
      amount: 900,
      payer: 'user',
      userShare: 300,
      allocations: [
        { person: 'Aarav Sharma', personId: aaravBefore.id, amount: 300 },
        { person: 'Rohan Verma', personId: rohanBefore.id, amount: 300 },
      ],
      description: 'Celebration Dinner',
      category: 'Food',
      date: '2026-11-10',
    });
    assert.equal(res.success, true);

    // Verify people directory strictly contains original 4 people (no duplicate Aarav / Rohan)
    const dirAfter = store.getPeopleDirectory();
    assert.equal(dirAfter.length, 4, 'Must not create duplicate contacts');
    assert.deepEqual(
      dirAfter.map((p) => p.name).sort(),
      ['Aarav Sharma', 'Ananya Iyer', 'Diya Patel', 'Rohan Verma']
    );

    // Verify balances updated by exact ₹300 for participants; others unchanged
    const aaravAfter = dirAfter.find((p) => p.name === 'Aarav Sharma');
    const rohanAfter = dirAfter.find((p) => p.name === 'Rohan Verma');
    const diyaAfter = dirAfter.find((p) => p.name === 'Diya Patel');
    const ananyaAfter = dirAfter.find((p) => p.name === 'Ananya Iyer');

    assert.equal(aaravAfter.balanceRupees, 2550); // 2250 + 300 = 2550
    assert.equal(rohanAfter.balanceRupees, 1500); // 1200 + 300 = 1500
    assert.equal(diyaAfter.balanceRupees, -900);  // unchanged
    assert.equal(ananyaAfter.balanceRupees, 2200); // unchanged

    // Verify monthly personal spending counts strictly user share (₹300)
    const analytics = store.computeMonthlyAnalytics(2026, 10); // Nov 2026
    assert.equal(analytics.totalSpent, 300, 'Only user share (₹300) must count toward personal spending');

    // Verify projected transaction in Activity
    const txns = store.getLegacyProjectedTransactions();
    const lastTxn = txns[txns.length - 1];
    assert.equal(lastTxn.action, 'shared_expense');
    assert.equal(lastTxn.amount, 900);
    assert.equal(lastTxn.userShare, 300);
    assert.equal(lastTxn.splits.length, 2);
    assert.equal(lastTxn.splits[0].personId, aaravBefore.id);
    assert.equal(lastTxn.splits[0].amount, 300);
    assert.equal(lastTxn.splits[1].personId, rohanBefore.id);
    assert.equal(lastTxn.splits[1].amount, 300);
  });

  // 26. Shared Expense QA Fix: Zero-value and negative allocations are rejected
  test('26. Phase 7: Zero-value allocations are rejected and do not create people or transactions', () => {
    const storage = new MemoryStorage();
    const store = new StoreCore({ storage });

    store.addPerson('Aarav Sharma');
    store.addPerson('Rohan Verma');
    assert.equal(store.state.people.length, 2);

    // Attempt to save with zero-amount allocation
    const res = store.addTransaction({
      type: 'shared_expense',
      amount: 900,
      payer: 'user',
      userShare: 900,
      allocations: [
        { person: 'Aarav', amount: 0 },
        { person: 'Rohan', amount: 0 },
      ],
      description: 'Zero split test',
      category: 'Food',
      date: '2026-11-10',
    });

    assert.equal(res.success, false);
    assert.ok(res.error.includes('greater than ₹0'));

    // Verify no new people ('Aarav' or 'Rohan') were added to state.people
    assert.equal(store.state.people.length, 2);
    assert.deepEqual(
      store.state.people.map((p) => p.name).sort(),
      ['Aarav Sharma', 'Rohan Verma']
    );

    // Verify no transaction was recorded
    assert.equal(store.state.transactions.length, 0);
  });

  // 27. Shared Expense QA Fix: Equal Split Integer Allocation Reactivity
  test('27. Phase 7: Equal split divides amounts deterministically across participant count changes', () => {
    // ₹900 with 3 participants (User + 2) -> 300 each (30,000 paise)
    const shares3 = allocateEqualShares(90000, 3);
    assert.deepEqual(shares3, [30000, 30000, 30000]);

    // ₹900 with 2 participants (User + 1) -> 450 each (45,000 paise)
    const shares2 = allocateEqualShares(90000, 2);
    assert.deepEqual(shares2, [45000, 45000]);

    // ₹900 with 4 participants (User + 3) -> 225 each (22,500 paise)
    const shares4 = allocateEqualShares(90000, 4);
    assert.deepEqual(shares4, [22500, 22500, 22500, 22500]);

    // ₹100 split 3 ways -> 10000 paise / 3: 3334, 3333, 3333 (first gets remainder paise)
    const sharesRem = allocateEqualShares(10000, 3);
    assert.deepEqual(sharesRem, [3334, 3333, 3333]);
    assert.equal(sharesRem.reduce((a, b) => a + b, 0), 10000);
  });

  // 28. Shared Expense Editing: Editing description, category, and date preserves total, allocations, and user share
  test('28. Shared Expense Editing: Editing description, category, and date preserves total, allocations, and user share', () => {
    const storage = new MemoryStorage();
    const store = new StoreCore({ storage });

    store.addPerson('Bob');
    store.addPerson('Charlie');

    const addRes = store.addTransaction({
      type: 'shared_expense',
      amount: 1200,
      payer: 'user',
      userShare: 400,
      allocations: [
        { person: 'Bob', amount: 400 },
        { person: 'Charlie', amount: 400 },
      ],
      description: 'Original Team Dinner',
      category: 'Food',
      date: '2026-11-04',
    });
    assert.equal(addRes.success, true);
    const txnId = store.state.transactions[0].id;

    // Edit only metadata
    const editRes = store.editTransaction(txnId, {
      description: 'Updated Team Dinner',
      category: 'Entertainment',
      date: '2026-11-05',
    });
    assert.equal(editRes.success, true);

    const updatedEvent = store.state.transactions[0];
    assert.equal(updatedEvent.description, 'Updated Team Dinner');
    assert.equal(updatedEvent.category, 'Entertainment');
    assert.equal(updatedEvent.date, '2026-11-05');
    assert.equal(updatedEvent.totalAmountPaise, 120000);
    assert.equal(updatedEvent.userSharePaise, 40000);
    assert.equal(updatedEvent.allocations.length, 2);
    assert.equal(updatedEvent.allocations[0].amountPaise, 40000);
    assert.equal(updatedEvent.allocations[1].amountPaise, 40000);

    // Personal spending and peer balances remain preserved
    assert.equal(store.computeMonthlyAnalytics(2026, 10).totalSpent, 400);
    const balances = store.computeBalances();
    assert.equal(balances['Bob'], 400);
    assert.equal(balances['Charlie'], 400);
  });

  // 29. Shared Expense Editing: Changing total amount with updated allocations updates all participants and conserves
  test('29. Shared Expense Editing: Changing total amount with updated allocations updates all participants and conserves', () => {
    const storage = new MemoryStorage();
    const store = new StoreCore({ storage });

    store.addPerson('Bob');
    store.addPerson('Charlie');

    const addRes = store.addTransaction({
      type: 'shared_expense',
      amount: 1200,
      payer: 'user',
      userShare: 400,
      allocations: [
        { person: 'Bob', amount: 400 },
        { person: 'Charlie', amount: 400 },
      ],
      description: 'Team Dinner',
      category: 'Food',
      date: '2026-11-04',
    });
    assert.equal(addRes.success, true);
    const txnId = store.state.transactions[0].id;

    // Scale bill up from ₹1,200 to ₹1,800 (₹600 each)
    const editRes = store.editTransaction(txnId, {
      amount: 1800,
      userShare: 600,
      allocations: [
        { person: 'Bob', amount: 600 },
        { person: 'Charlie', amount: 600 },
      ],
    });
    assert.equal(editRes.success, true);

    const updatedEvent = store.state.transactions[0];
    assert.equal(updatedEvent.totalAmountPaise, 180000);
    assert.equal(updatedEvent.userSharePaise, 60000);
    assert.equal(updatedEvent.allocations[0].amountPaise, 60000);
    assert.equal(updatedEvent.allocations[1].amountPaise, 60000);
    assert.equal(
      updatedEvent.userSharePaise + updatedEvent.allocations.reduce((sum, a) => sum + a.amountPaise, 0),
      180000
    );

    assert.equal(store.computeMonthlyAnalytics(2026, 10).totalSpent, 600);
    const balances = store.computeBalances();
    assert.equal(balances['Bob'], 600);
    assert.equal(balances['Charlie'], 600);
  });

  // 30. Shared Expense Editing: Changing user's share alone with conserving allocations updates personal spending and peer balances
  test('30. Shared Expense Editing: Changing user\'s share alone with conserving allocations updates personal spending and peer balances', () => {
    const storage = new MemoryStorage();
    const store = new StoreCore({ storage });

    store.addPerson('Bob');
    store.addPerson('Charlie');

    const addRes = store.addTransaction({
      type: 'shared_expense',
      amount: 1200,
      payer: 'user',
      userShare: 400,
      allocations: [
        { person: 'Bob', amount: 400 },
        { person: 'Charlie', amount: 400 },
      ],
      description: 'Team Lunch',
      category: 'Food',
      date: '2026-11-04',
    });
    assert.equal(addRes.success, true);
    const txnId = store.state.transactions[0].id;

    // User only pays ₹200; Bob and Charlie take ₹500 each (total ₹1,200 conserved)
    const editRes = store.editTransaction(txnId, {
      amount: 1200,
      userShare: 200,
      allocations: [
        { person: 'Bob', amount: 500 },
        { person: 'Charlie', amount: 500 },
      ],
    });
    assert.equal(editRes.success, true);

    const updatedEvent = store.state.transactions[0];
    assert.equal(updatedEvent.totalAmountPaise, 120000);
    assert.equal(updatedEvent.userSharePaise, 20000);
    assert.equal(updatedEvent.allocations[0].amountPaise, 50000);
    assert.equal(updatedEvent.allocations[1].amountPaise, 50000);

    // Personal spending dropped to ₹200
    assert.equal(store.computeMonthlyAnalytics(2026, 10).totalSpent, 200);
    // Peer receivables increased to ₹500 each
    const balances = store.computeBalances();
    assert.equal(balances['Bob'], 500);
    assert.equal(balances['Charlie'], 500);
  });

  // 31. Shared Expense Editing: Changing participant allocations preserves exact conservation and updates balances
  test('31. Shared Expense Editing: Changing participant allocations preserves exact conservation and updates balances', () => {
    const storage = new MemoryStorage();
    const store = new StoreCore({ storage });

    store.addPerson('Bob');
    store.addPerson('Charlie');

    const addRes = store.addTransaction({
      type: 'shared_expense',
      amount: 1200,
      payer: 'user',
      userShare: 400,
      allocations: [
        { person: 'Bob', amount: 400 },
        { person: 'Charlie', amount: 400 },
      ],
      description: 'Team Lunch',
      category: 'Food',
      date: '2026-11-04',
    });
    assert.equal(addRes.success, true);
    const txnId = store.state.transactions[0].id;

    // Reallocate shares: Bob ₹600, Charlie ₹200, User ₹400
    const editRes = store.editTransaction(txnId, {
      amount: 1200,
      userShare: 400,
      allocations: [
        { person: 'Bob', amount: 600 },
        { person: 'Charlie', amount: 200 },
      ],
    });
    assert.equal(editRes.success, true);

    const updatedEvent = store.state.transactions[0];
    assert.equal(updatedEvent.allocations[0].amountPaise, 60000);
    assert.equal(updatedEvent.allocations[1].amountPaise, 20000);
    assert.equal(updatedEvent.userSharePaise, 40000);

    assert.equal(store.computeMonthlyAnalytics(2026, 10).totalSpent, 400);
    const balances = store.computeBalances();
    assert.equal(balances['Bob'], 600);
    assert.equal(balances['Charlie'], 200);
  });

  // 32. Shared Expense Editing: Adding and removing participants where supported by existing UI
  test('32. Shared Expense Editing: Adding and removing participants where supported by existing UI', () => {
    const storage = new MemoryStorage();
    const store = new StoreCore({ storage });

    store.addPerson('Bob');
    store.addPerson('Charlie');

    // Start with 2 participants: Bob ₹400, Charlie ₹400, User ₹400 (total ₹1,200)
    const addRes = store.addTransaction({
      type: 'shared_expense',
      amount: 1200,
      payer: 'user',
      userShare: 400,
      allocations: [
        { person: 'Bob', amount: 400 },
        { person: 'Charlie', amount: 400 },
      ],
      description: 'Dinner Party',
      category: 'Food',
      date: '2026-11-04',
    });
    assert.equal(addRes.success, true);
    const txnId = store.state.transactions[0].id;

    // Step A: Add participant David (split ₹1,200 four ways -> ₹300 each)
    const addParticipantRes = store.editTransaction(txnId, {
      amount: 1200,
      userShare: 300,
      allocations: [
        { person: 'Bob', amount: 300 },
        { person: 'Charlie', amount: 300 },
        { person: 'David', amount: 300 },
      ],
    });
    assert.equal(addParticipantRes.success, true);

    const eventWithDavid = store.state.transactions[0];
    assert.equal(eventWithDavid.allocations.length, 3);
    const balancesAfterAdd = store.computeBalances();
    assert.equal(balancesAfterAdd['Bob'], 300);
    assert.equal(balancesAfterAdd['Charlie'], 300);
    assert.equal(balancesAfterAdd['David'], 300);
    assert.equal(store.computeMonthlyAnalytics(2026, 10).totalSpent, 300);

    // Step B: Remove Charlie (leaving User, Bob, David at ₹400 each)
    const removeCharlieRes = store.editTransaction(txnId, {
      amount: 1200,
      userShare: 400,
      allocations: [
        { person: 'Bob', amount: 400 },
        { person: 'David', amount: 400 },
      ],
    });
    assert.equal(removeCharlieRes.success, true);

    const eventWithoutCharlie = store.state.transactions[0];
    assert.equal(eventWithoutCharlie.allocations.length, 2);
    const balancesAfterRemove = store.computeBalances();
    assert.equal(balancesAfterRemove['Bob'], 400);
    assert.equal(balancesAfterRemove['David'], 400);
    assert.equal(balancesAfterRemove['Charlie'] || 0, 0);
    assert.equal(store.computeMonthlyAnalytics(2026, 10).totalSpent, 400);
  });

  // 33. Shared Expense Editing: Removing all participants safely converts to solo user expense
  test('33. Shared Expense Editing: Removing all participants safely converts to solo user expense', () => {
    const storage = new MemoryStorage();
    const store = new StoreCore({ storage });

    store.addPerson('Bob');

    const addRes = store.addTransaction({
      type: 'shared_expense',
      amount: 800,
      payer: 'user',
      userShare: 400,
      allocations: [{ person: 'Bob', amount: 400 }],
      description: 'Groceries',
      category: 'Food',
      date: '2026-11-04',
    });
    assert.equal(addRes.success, true);
    const txnId = store.state.transactions[0].id;
    assert.equal(store.computeBalances()['Bob'], 400);

    // Remove Bob entirely -> User absorbs whole ₹800
    const editRes = store.editTransaction(txnId, {
      amount: 800,
      userShare: 800,
      allocations: [],
    });
    assert.equal(editRes.success, true);

    const updatedEvent = store.state.transactions[0];
    assert.equal(updatedEvent.allocations.length, 0);
    assert.equal(updatedEvent.userSharePaise, 80000);
    assert.equal(updatedEvent.totalAmountPaise, 80000);

    assert.equal(store.computeBalances()['Bob'] || 0, 0);
    assert.equal(store.computeMonthlyAnalytics(2026, 10).totalSpent, 800);
  });

  // 34. Shared Expense Editing: Repeated consecutive edits maintain exact conservation and stability
  test('34. Shared Expense Editing: Repeated consecutive edits maintain exact conservation and stability', () => {
    const storage = new MemoryStorage();
    const store = new StoreCore({ storage });

    store.addPerson('Bob');
    store.addPerson('Charlie');

    const addRes = store.addTransaction({
      type: 'shared_expense',
      amount: 900,
      payer: 'user',
      userShare: 300,
      allocations: [
        { person: 'Bob', amount: 300 },
        { person: 'Charlie', amount: 300 },
      ],
      description: 'Trip Gas',
      category: 'Transport',
      date: '2026-11-04',
    });
    assert.equal(addRes.success, true);
    const txnId = store.state.transactions[0].id;

    // Edit 1: change total to ₹1,500
    const res1 = store.editTransaction(txnId, {
      amount: 1500,
      userShare: 500,
      allocations: [
        { person: 'Bob', amount: 500 },
        { person: 'Charlie', amount: 500 },
      ],
    });
    assert.equal(res1.success, true);
    assert.equal(store.computeBalances()['Bob'], 500);

    // Edit 2: custom split (Bob ₹700, Charlie ₹300, User ₹500)
    const res2 = store.editTransaction(txnId, {
      amount: 1500,
      userShare: 500,
      allocations: [
        { person: 'Bob', amount: 700 },
        { person: 'Charlie', amount: 300 },
      ],
    });
    assert.equal(res2.success, true);
    assert.equal(store.computeBalances()['Bob'], 700);
    assert.equal(store.computeBalances()['Charlie'], 300);

    // Edit 3: change payer to Bob (Bob paid ₹1,500 total; User share ₹500, Bob share ₹700, Charlie share ₹300)
    const bobObj = store.state.people.find((p) => p.name === 'Bob');
    const res3 = store.editTransaction(txnId, {
      amount: 1500,
      payerId: bobObj.id,
      userShare: 500,
      allocations: [
        { person: 'Bob', amount: 700 },
        { person: 'Charlie', amount: 300 },
      ],
    });
    assert.equal(res3.success, true);
    // User owes Bob ₹500 (balance -₹500)
    assert.equal(store.computeBalances()['Bob'], -500);
    assert.equal(store.computeMonthlyAnalytics(2026, 10).totalSpent, 500);

    // Edit 4: return to user paid, total ₹1,200 (₹400 each)
    const res4 = store.editTransaction(txnId, {
      amount: 1200,
      payerId: 'user',
      userShare: 400,
      allocations: [
        { person: 'Bob', amount: 400 },
        { person: 'Charlie', amount: 400 },
      ],
    });
    assert.equal(res4.success, true);
    assert.equal(store.computeBalances()['Bob'], 400);
    assert.equal(store.computeBalances()['Charlie'], 400);
    assert.equal(store.computeMonthlyAnalytics(2026, 10).totalSpent, 400);
  });

  // 35. Shared Expense Editing: Conservation invariant enforcement & non-conserving rejection
  test('35. Shared Expense Editing: Conservation invariant enforcement & non-conserving rejection', () => {
    const storage = new MemoryStorage();
    const store = new StoreCore({ storage });

    store.addPerson('Bob');

    const addRes = store.addTransaction({
      type: 'shared_expense',
      amount: 1000,
      payer: 'user',
      userShare: 500,
      allocations: [{ person: 'Bob', amount: 500 }],
      description: 'Coffee',
      category: 'Food',
      date: '2026-11-04',
    });
    assert.equal(addRes.success, true);
    const txnId = store.state.transactions[0].id;

    // Case A: Allocations sum exceeds total bill (500 + 600 = 1,100 != 1,000)
    const failA = store.editTransaction(txnId, {
      amount: 1000,
      userShare: 500,
      allocations: [{ person: 'Bob', amount: 600 }],
    });
    assert.equal(failA.success, false);
    assert.ok(failA.error.includes('conserve'));

    // Case B: Allocations sum less than total bill (500 + 400 = 900 != 1,000)
    const failB = store.editTransaction(txnId, {
      amount: 1000,
      userShare: 500,
      allocations: [{ person: 'Bob', amount: 400 }],
    });
    assert.equal(failB.success, false);
    assert.ok(failB.error.includes('conserve'));

    // Case C: Changing total amount without updating allocations
    const failC = store.editTransaction(txnId, {
      amount: 1500,
    });
    assert.equal(failC.success, false);
    assert.ok(failC.error.includes('conservation'));

    // Case D: Zero allocation amount
    const failD = store.editTransaction(txnId, {
      amount: 1000,
      userShare: 1000,
      allocations: [{ person: 'Bob', amount: 0 }],
    });
    assert.equal(failD.success, false);
    assert.ok(failD.error.includes('greater than ₹0'));

    // Verify original transaction remains completely untouched
    const evt = store.state.transactions[0];
    assert.equal(evt.totalAmountPaise, 100000);
    assert.equal(evt.userSharePaise, 50000);
    assert.equal(evt.allocations[0].amountPaise, 50000);
  });

  // 36. Shared Expense Editing: Chronological repayment safeguard - rejection when edit creates conflict
  test('36. Shared Expense Editing: Chronological repayment safeguard - rejection when edit creates conflict', () => {
    const storage = new MemoryStorage();
    const store = new StoreCore({ storage });

    store.addPerson('Bob');
    const bobObj = store.state.people.find((p) => p.name === 'Bob');

    // 2026-11-01: Shared expense where user pays ₹1,000 (User ₹500, Bob ₹500). Bob owes user ₹500.
    const expenseRes = store.addTransaction({
      type: 'shared_expense',
      amount: 1000,
      payer: 'user',
      userShare: 500,
      allocations: [{ person: 'Bob', amount: 500 }],
      description: 'Shared Groceries',
      category: 'Food',
      date: '2026-11-01',
    });
    assert.equal(expenseRes.success, true);
    const expenseId = store.state.transactions[0].id;
    assert.equal(store.computeBalances()['Bob'], 500);

    // 2026-11-02: Bob repays user ₹500 in full
    const repayRes = store.addTransaction({
      type: 'repayment',
      person: 'Bob',
      personId: bobObj.id,
      amount: 500,
      date: '2026-11-02',
      direction: 'INFLOW',
    });
    assert.equal(repayRes.success, true);
    // Bob balance is now ₹0
    assert.equal(store.computeBalances()['Bob'], 0);

    // 2026-11-03: User attempts to edit the 2026-11-01 shared expense to reduce Bob's share from ₹500 to ₹300
    // (User share increases to ₹700).
    // This creates a chronological conflict: Bob repaid ₹500 on 2026-11-02, but would only owe ₹300!
    const editRes = store.editTransaction(expenseId, {
      amount: 1000,
      userShare: 700,
      allocations: [{ person: 'Bob', amount: 300 }],
    });

    assert.equal(editRes.success, false);
    assert.ok(editRes.error.includes('chronological repayment conflict'));
  });

  // 37. Shared Expense Editing: Original state and balances remain untouched after a rejected edit
  test('37. Shared Expense Editing: Original state and balances remain untouched after a rejected edit', () => {
    const storage = new MemoryStorage();
    const store = new StoreCore({ storage });

    store.addPerson('Bob');
    const bobObj = store.state.people.find((p) => p.name === 'Bob');

    const expenseRes = store.addTransaction({
      type: 'shared_expense',
      amount: 1000,
      payer: 'user',
      userShare: 500,
      allocations: [{ person: 'Bob', amount: 500 }],
      description: 'Dinner',
      category: 'Food',
      date: '2026-11-01',
    });
    assert.equal(expenseRes.success, true);
    const expenseId = store.state.transactions[0].id;

    store.addTransaction({
      type: 'repayment',
      person: 'Bob',
      personId: bobObj.id,
      amount: 500,
      date: '2026-11-02',
      direction: 'INFLOW',
    });
    assert.equal(store.computeBalances()['Bob'], 0);
    assert.equal(store.computeMonthlyAnalytics(2026, 10).totalSpent, 500);

    // Attempt invalid edit
    const failedEdit = store.editTransaction(expenseId, {
      amount: 1000,
      userShare: 700,
      allocations: [{ person: 'Bob', amount: 300 }],
    });
    assert.equal(failedEdit.success, false);

    // Verify all aspects of store state remain pristine
    assert.equal(store.state.transactions.length, 2);
    const originalExpense = store.state.transactions.find((t) => t.id === expenseId);
    assert.equal(originalExpense.totalAmountPaise, 100000);
    assert.equal(originalExpense.userSharePaise, 50000);
    assert.equal(originalExpense.allocations[0].amountPaise, 50000);

    // Balances and monthly analytics completely unaltered
    assert.equal(store.computeBalances()['Bob'], 0);
    assert.equal(store.computeMonthlyAnalytics(2026, 10).totalSpent, 500);
  });
});
