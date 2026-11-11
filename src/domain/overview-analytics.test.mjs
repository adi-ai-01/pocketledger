/**
 * Regression Test Suite: PocketLedger Overview Analytics & Selector Reliability
 *
 * Verifies:
 * 1. A canonical ₹1 personal expense produces totalSpent: 1.
 * 2. computeMonthlyAnalytics() works when passed a freshly generated projected transaction array.
 * 3. Overview receives updated analytics after adding a transaction.
 * 4. StoreCore constructor preserves a supplied initialState.
 * 5. Independent StoreCore instances do not unintentionally share mutable state.
 * 6. Offline save -> refresh -> rehydration -> analytics still returns ₹1.
 * 7. Existing balances remain unchanged after a personal expense.
 * 8. Legacy v1 analytics remain compatible.
 * 9. Related balance selectors do not incorrectly fall back to empty state.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { StoreCore, PRIMARY_STORAGE_KEY } from './store-core.js';
import { computeMonthlyAnalytics, computeLendingBalances } from '../store.js';
import { EVENT_KINDS, PARTY_USER } from './ledger.js';

// Memory storage mock conforming to Web Storage API
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

describe('Overview Analytics & Selector Reliability', () => {

  test('1. A canonical ₹1 personal expense produces totalSpent: 1', () => {
    const fixtureRaw = fs.readFileSync(new URL('../../test-fixtures/pocketledger-v1-demo.json', import.meta.url), 'utf8');
    const storage = new MemoryStorage({ [PRIMARY_STORAGE_KEY]: fixtureRaw });
    const store = new StoreCore({ storage });
    store.executeMigration();

    // Nov 2026 has no expenses in the demo fixture initially
    const initialAnalytics = store.computeMonthlyAnalytics(2026, 10);
    assert.equal(initialAnalytics.totalSpent, 0);

    // Add QA personal expense of ₹1 paid by user on 10 Nov 2026
    const res = store.addTransaction({
      type: 'personal_expense',
      amount: 1,
      description: 'QA offline persistence',
      category: 'Other',
      paidBy: 'user',
      paymentMethod: 'CASH',
      date: '2026-11-10',
    });
    assert.equal(res.success, true);

    const analytics = store.computeMonthlyAnalytics(2026, 10);
    assert.equal(analytics.totalSpent, 1, 'Monthly spending must be exactly ₹1');
    assert.equal(analytics.byCategory['Other'], 1, 'Category breakdown must include ₹1 for Other');
    assert.equal(analytics.byDay[10], 1, 'Daily breakdown must record ₹1 on day 10');
    assert.equal(analytics.count, 1, 'Transaction count must be 1');
  });

  test('2. computeMonthlyAnalytics() works when passed a freshly generated projected transaction array', () => {
    const fixtureRaw = fs.readFileSync(new URL('../../test-fixtures/pocketledger-v1-demo.json', import.meta.url), 'utf8');
    const storage = new MemoryStorage({ [PRIMARY_STORAGE_KEY]: fixtureRaw });
    const store = new StoreCore({ storage });
    store.executeMigration();

    store.addTransaction({
      type: 'personal_expense',
      amount: 1,
      description: 'QA offline persistence',
      category: 'Other',
      paidBy: 'user',
      paymentMethod: 'CASH',
      date: '2026-11-10',
    });

    // Obtain freshly allocated projected transactions array
    const projectedTxns = store.getLegacyProjectedTransactions();
    assert.ok(Array.isArray(projectedTxns));

    // Pass the projected transaction array to computeMonthlyAnalytics wrapper
    const analytics = computeMonthlyAnalytics(projectedTxns, 2026, 10);
    assert.equal(analytics.totalSpent, 1, 'Projected array must evaluate to ₹1 spending without falling back to empty state');
    assert.equal(analytics.byCategory['Other'], 1);
    assert.equal(analytics.count, 1);
  });

  test('3. Overview receives updated analytics after adding a transaction', () => {
    const fixtureRaw = fs.readFileSync(new URL('../../test-fixtures/pocketledger-v1-demo.json', import.meta.url), 'utf8');
    const storage = new MemoryStorage({ [PRIMARY_STORAGE_KEY]: fixtureRaw });
    const store = new StoreCore({ storage });
    store.executeMigration();

    let notificationCount = 0;
    store.subscribe(() => {
      notificationCount++;
    });

    const beforeAnalytics = store.computeMonthlyAnalytics(2026, 10);
    assert.equal(beforeAnalytics.totalSpent, 0);

    // Add transaction
    store.addTransaction({
      type: 'personal_expense',
      amount: 1,
      description: 'QA offline persistence',
      category: 'Other',
      paidBy: 'user',
      paymentMethod: 'CASH',
      date: '2026-11-10',
    });

    assert.ok(notificationCount > 0, 'Store listeners must be notified');
    const afterAnalytics = store.computeMonthlyAnalytics(2026, 10);
    assert.equal(afterAnalytics.totalSpent, 1);
  });

  test('4. StoreCore constructor preserves a supplied initialState', () => {
    const customState = {
      schemaVersion: 2,
      transactions: [
        {
          id: 'tx_custom_1',
          kind: EVENT_KINDS.EXPENSE,
          payerId: PARTY_USER,
          totalAmountPaise: 5000,
          userSharePaise: 5000,
          allocations: [],
          date: '2026-11-15',
          category: 'Food',
        },
      ],
      people: [{ id: 'p1', name: 'Alice', upiId: 'alice@upi', isArchived: false }],
      categories: ['Food', 'Other'],
      settings: { currencySymbol: '₹', monthlyBudgetPaise: 1000000, theme: 'graphite' },
    };

    const standalone = new StoreCore({ initialState: customState, storage: null });
    assert.equal(standalone.state.transactions.length, 1);
    assert.equal(standalone.state.transactions[0].id, 'tx_custom_1');

    const analytics = standalone.computeMonthlyAnalytics(2026, 10);
    assert.equal(analytics.totalSpent, 50); // 5000 paise = ₹50
    assert.equal(analytics.byCategory['Food'], 50);
  });

  test('5. Independent StoreCore instances do not unintentionally share mutable state', () => {
    const customState = {
      schemaVersion: 2,
      transactions: [
        {
          id: 'tx_shared_base',
          kind: EVENT_KINDS.EXPENSE,
          payerId: PARTY_USER,
          totalAmountPaise: 1000,
          userSharePaise: 1000,
          allocations: [],
          date: '2026-11-01',
          category: 'Other',
        },
      ],
      people: [],
    };

    const storeA = new StoreCore({ initialState: customState, storage: null });
    const storeB = new StoreCore({ initialState: customState, storage: null });

    // Mutate storeA
    storeA.state.transactions.push({
      id: 'tx_only_in_a',
      kind: EVENT_KINDS.EXPENSE,
      payerId: PARTY_USER,
      totalAmountPaise: 2000,
      userSharePaise: 2000,
      allocations: [],
      date: '2026-11-02',
      category: 'Food',
    });

    assert.equal(storeA.state.transactions.length, 2);
    assert.equal(storeB.state.transactions.length, 1, 'storeB must remain untouched');
    assert.equal(customState.transactions.length, 1, 'original customState must remain untouched');
  });

  test('6. Offline save -> refresh -> rehydration -> analytics still returns ₹1', () => {
    const fixtureRaw = fs.readFileSync(new URL('../../test-fixtures/pocketledger-v1-demo.json', import.meta.url), 'utf8');
    const storage = new MemoryStorage({ [PRIMARY_STORAGE_KEY]: fixtureRaw });

    // First session: migration and offline save
    const storeSession1 = new StoreCore({ storage });
    storeSession1.executeMigration();
    storeSession1.addTransaction({
      type: 'personal_expense',
      amount: 1,
      description: 'QA offline persistence',
      category: 'Other',
      paidBy: 'user',
      paymentMethod: 'CASH',
      date: '2026-11-10',
    });

    // Verify written to storage
    const rawSaved = storage.getItem(PRIMARY_STORAGE_KEY);
    assert.ok(rawSaved, 'State must be written to storage');
    const parsed = JSON.parse(rawSaved);
    assert.equal(parsed.schemaVersion, 2);
    assert.equal(parsed.transactions.length, 7);

    // Second session: Simulate page refresh while offline (new StoreCore from same storage)
    const storeSession2 = new StoreCore({ storage });
    assert.equal(storeSession2.isV2(), true);
    assert.equal(storeSession2.state.transactions.length, 7);

    // Check analytics directly and via projected transactions
    const directAnalytics = storeSession2.computeMonthlyAnalytics(2026, 10);
    assert.equal(directAnalytics.totalSpent, 1, 'Rehydrated StoreCore must compute ₹1');

    const projectedTxns = storeSession2.getLegacyProjectedTransactions();
    const wrapperAnalytics = computeMonthlyAnalytics(projectedTxns, 2026, 10);
    assert.equal(wrapperAnalytics.totalSpent, 1, 'Wrapper analytics from projected txns must compute ₹1');
  });

  test('7. Existing balances remain unchanged after a personal expense', () => {
    const fixtureRaw = fs.readFileSync(new URL('../../test-fixtures/pocketledger-v1-demo.json', import.meta.url), 'utf8');
    const storage = new MemoryStorage({ [PRIMARY_STORAGE_KEY]: fixtureRaw });
    const store = new StoreCore({ storage });
    store.executeMigration();

    const balancesBefore = store.computeBalances();
    assert.equal(balancesBefore['Aarav Sharma'], 2250);
    assert.equal(balancesBefore['Diya Patel'], -900);
    assert.equal(balancesBefore['Rohan Verma'], 1200);
    assert.equal(balancesBefore['Ananya Iyer'], 2200);

    // Record solo personal expense
    store.addTransaction({
      type: 'personal_expense',
      amount: 1,
      description: 'QA offline persistence',
      category: 'Other',
      paidBy: 'user',
      paymentMethod: 'CASH',
      date: '2026-11-10',
    });

    const balancesAfter = store.computeBalances();
    assert.deepEqual(balancesAfter, balancesBefore, 'Peer balances must be completely invariant under solo personal expenses');
  });

  test('8. Legacy v1 analytics remain compatible', () => {
    const legacyTxns = [
      {
        id: 'legacy_1',
        type: 'give',
        person: '',
        amount: 75,
        category: 'Shopping',
        date: '2026-11-05',
      },
      {
        id: 'legacy_2',
        type: 'split',
        amount: 150,
        myShare: 50,
        splits: [{ person: 'Aarav Sharma', amount: 100 }],
        category: 'Food',
        date: '2026-11-08',
      },
    ];

    const analytics = computeMonthlyAnalytics(legacyTxns, 2026, 10);
    assert.equal(analytics.totalSpent, 125, 'Legacy personal expense + myShare must equal ₹125');
    assert.equal(analytics.byCategory['Shopping'], 75);
    assert.equal(analytics.byCategory['Food'], 50);
  });

  test('9. Related balance selectors do not incorrectly fall back to empty state', () => {
    const fixtureRaw = fs.readFileSync(new URL('../../test-fixtures/pocketledger-v1-demo.json', import.meta.url), 'utf8');
    const storage = new MemoryStorage({ [PRIMARY_STORAGE_KEY]: fixtureRaw });
    const store = new StoreCore({ storage });
    store.executeMigration();

    const projectedTxns = store.getLegacyProjectedTransactions();

    // Passing projected transactions to computeLendingBalances must resolve accurate balances, not {}
    const balances = computeLendingBalances(projectedTxns);
    assert.notDeepEqual(balances, {}, 'computeLendingBalances must not return empty object when passed transactions');
    assert.equal(balances['Aarav Sharma'], 2250);
    assert.equal(balances['Diya Patel'], -900);
    assert.equal(balances['Rohan Verma'], 1200);
    assert.equal(balances['Ananya Iyer'], 2200);

    // Omitting transactions must also use globalStoreCore accurately
    const directBalances = store.computeBalances();
    assert.equal(directBalances['Aarav Sharma'], 2250);
  });
});
