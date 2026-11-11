/**
 * Regression Test Suite: PocketLedger v1 -> v2 Migration Data Preservation
 *
 * Verifies that the v1 -> v2 database schema update preserves:
 * 1. Payment attempts (all statuses, amounts, timestamps, notes, party IDs, event links).
 * 2. Contact metadata (archival status, creation timestamps, stable IDs).
 * 3. Transaction metadata (payment methods, paymentAttemptId links, custom metadata).
 * 4. Ancillary state (custom categories, currency, budget, theme normalization to graphite, alarms).
 * 5. Store preview metrics and executeMigration / rollback integration.
 * 6. Historical demo fixture balance parity.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  StoreCore,
  PRIMARY_STORAGE_KEY,
  BACKUP_STORAGE_KEY,
} from './store-core.js';
import { EVENT_KINDS, PARTY_USER, computePersonBalance } from './ledger.js';
import { migrateV1ToV2 } from './migrate-v1-to-v2.js';

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

// Programmatic enhanced legacy fixture covering all supported statuses, types, and metadata
const createEnhancedLegacyFixture = () => ({
  people: [
    {
      id: 'p_aarav',
      name: 'Aarav Sharma',
      upiId: 'aarav@okhdfcbank',
      isArchived: false,
      createdAt: 1700000000000,
    },
    {
      id: 'p_diya',
      name: 'Diya Patel',
      upiId: 'diya@okaxis',
      isArchived: true, // Archived contact
      createdAt: 1700000010000,
    },
    {
      id: 'p_rohan',
      name: 'Rohan Verma',
      upiId: 'rohan@icici',
      isArchived: false,
      createdAt: 1700000020000,
    },
    {
      id: 'p_ananya',
      name: 'Ananya Iyer',
      upiId: 'ananya@paytm',
      isArchived: false,
      createdAt: 1700000030000,
    },
  ],
  transactions: [
    // 1. give (loan with custom metadata & paymentMethod)
    {
      id: 'tx_give_1',
      type: 'give',
      person: 'Aarav Sharma',
      amount: 1000,
      description: 'Travel loan',
      category: 'Transport',
      paymentMethod: 'UPI',
      paymentAttemptId: 'att_completed_1',
      date: '2026-10-01',
      createdAt: 1700000100000,
      metadata: { memo: 'Train booking', tag: 'trip' },
    },
    // 2. take (borrow with custom metadata & paymentMethod)
    {
      id: 'tx_take_1',
      type: 'take',
      person: 'Rohan Verma',
      amount: 500,
      description: 'Borrowed for lunch',
      category: 'Food',
      paymentMethod: 'CASH',
      date: '2026-10-02',
      createdAt: 1700000200000,
      metadata: { memo: 'Office canteen' },
    },
    // 3. personal_expense (user paid with metadata)
    {
      id: 'tx_pe_1',
      type: 'personal_expense',
      paidBy: 'user',
      amount: 350,
      description: 'Book purchase',
      category: 'Education',
      paymentMethod: 'UPI',
      date: '2026-10-03',
      createdAt: 1700000300000,
      metadata: { isbn: '978-3-16-148410-0' },
    },
    // 4. settle (inflow repayment with metadata)
    {
      id: 'tx_settle_1',
      type: 'settle',
      direction: 'inflow',
      person: 'Aarav Sharma',
      amount: 400,
      description: 'Aarav partial return',
      category: 'Settlement',
      paymentMethod: 'UPI',
      date: '2026-10-04',
      createdAt: 1700000400000,
      metadata: { ref: 'UPI-REF-12345' },
    },
    // 5. adjustment (upward adjustment with metadata)
    {
      id: 'tx_adj_1',
      type: 'adjustment',
      person: 'Rohan Verma',
      amount: 100,
      description: 'Correction for lunch',
      category: 'Adjustment',
      paymentMethod: 'OTHER',
      date: '2026-10-05',
      createdAt: 1700000500000,
      metadata: { auditReason: 'Rounded bill share' },
    },
    // 6. split (shared expense with metadata)
    {
      id: 'tx_split_1',
      type: 'split',
      amount: 1200,
      myShare: 400,
      splits: [
        { person: 'Aarav Sharma', amount: 400 },
        { person: 'Rohan Verma', amount: 400 },
      ],
      description: 'Dinner split',
      category: 'Food',
      paymentMethod: 'UPI',
      date: '2026-10-06',
      createdAt: 1700000600000,
      metadata: { venue: 'Pizzeria' },
    },
  ],
  paymentAttempts: [
    // 1. CANCELLED attempt: missing recipientPartyId, should resolve to Aarav
    {
      id: 'att_cancelled_1',
      type: 'UPI',
      recipientPartyId: null,
      recipientName: 'Aarav Sharma',
      recipientUpiId: 'aarav@okhdfcbank',
      amountRupees: 250,
      amountPaise: 25000,
      intentUrl: 'upi://pay?pa=aarav%40okhdfcbank&pn=Aarav%20Sharma&am=250.00&cu=INR',
      status: 'CANCELLED',
      initiatedAt: 1700000700000,
      reconciledAt: 1700000710000,
      reconciliationNotes: 'User dismissed UPI app prompt',
      eventId: null,
      isUnresolved: false,
      metadata: { appChosen: 'gpay' },
    },
    // 2. INITIATED unresolved attempt: explicit recipientPartyId
    {
      id: 'att_initiated_1',
      type: 'UPI',
      recipientPartyId: 'p_rohan',
      recipientName: 'Rohan Verma',
      recipientUpiId: 'rohan@icici',
      amountRupees: 500,
      amountPaise: 50000,
      intentUrl: 'upi://pay?pa=rohan%40icici&pn=Rohan%20Verma&am=500.00&cu=INR',
      status: 'INITIATED',
      initiatedAt: 1700000800000,
      reconciledAt: null,
      reconciliationNotes: '',
      eventId: null,
      isUnresolved: true,
      metadata: { launchedVia: 'phonepe' },
    },
    // 3. COMPLETED attempt linked to transaction tx_give_1
    {
      id: 'att_completed_1',
      type: 'UPI',
      recipientPartyId: 'p_aarav',
      recipientName: 'Aarav Sharma',
      recipientUpiId: 'aarav@okhdfcbank',
      amountRupees: 1000,
      amountPaise: 100000,
      intentUrl: 'upi://pay?pa=aarav%40okhdfcbank&pn=Aarav%20Sharma&am=1000.00&cu=INR',
      status: 'COMPLETED',
      initiatedAt: 1700000090000,
      reconciledAt: 1700000100000,
      reconciliationNotes: 'Payment verified via SMS',
      eventId: 'tx_give_1',
      isUnresolved: false,
      metadata: { bankRef: 'HDFC-889900' },
    },
    // 4. FAILED attempt
    {
      id: 'att_failed_1',
      type: 'UPI',
      recipientPartyId: null,
      recipientName: 'Ananya Iyer',
      recipientUpiId: 'ananya@paytm',
      amountRupees: 150,
      amountPaise: 15000,
      intentUrl: 'upi://pay?pa=ananya%40paytm&pn=Ananya%20Iyer&am=150.00&cu=INR',
      status: 'FAILED',
      initiatedAt: 1700000900000,
      reconciledAt: 1700000920000,
      reconciliationNotes: 'Bank server timeout',
      eventId: null,
      isUnresolved: false,
      metadata: { errorCode: 'U30' },
    },
    // 5. UNKNOWN attempt with an unknown merchant (must NOT generate a person)
    {
      id: 'att_unknown_1',
      type: 'UPI',
      recipientPartyId: null,
      recipientName: 'Unknown Merchant',
      recipientUpiId: 'merchant@upi',
      amount: 80, // Legacy rupee-only field
      intentUrl: 'upi://pay?pa=merchant%40upi&pn=Unknown%20Merchant&am=80.00&cu=INR',
      status: 'UNKNOWN',
      initiatedAt: 1700001000000,
      reconciledAt: 1700001050000,
      reconciliationNotes: 'Awaiting bank settlement confirmation',
      eventId: null,
      isUnresolved: true,
      metadata: { gatewayId: 'GW-99' },
    },
  ],
  pendingAlarms: [
    {
      id: 'alarm_1',
      txnId: 'tx_give_1',
      personName: 'Aarav Sharma',
      amount: 1000,
      direction: 'gave',
      createdAt: 1700000105000,
    },
  ],
  categories: ['Food', 'Transport', 'Education', 'Settlement', 'Adjustment', 'Crypto', 'Gadgets'],
  settings: {
    currency: '₹',
    monthlyBudget: 35000,
    theme: 'elden', // Legacy theme to be normalized to universal graphite
  },
});

describe('PocketLedger v1 -> v2 Migration Data Preservation', () => {

  test('1. Payment attempts: All 5 attempts survive migration with exact statuses, amounts, timestamps and links', () => {
    const fixture = createEnhancedLegacyFixture();
    const res = migrateV1ToV2(fixture);
    assert.equal(res.success, true);

    const attempts = res.migratedState.paymentAttempts;
    assert.ok(Array.isArray(attempts));
    assert.equal(attempts.length, 5, 'All 5 payment attempts must survive migration');

    // Attempt 1: CANCELLED
    const attCancelled = attempts.find((a) => a.id === 'att_cancelled_1');
    assert.ok(attCancelled);
    assert.equal(attCancelled.status, 'CANCELLED');
    assert.equal(attCancelled.isUnresolved, false);
    assert.equal(attCancelled.amountPaise, 25000);
    assert.equal(attCancelled.amountRupees, 250);
    assert.equal(attCancelled.recipientName, 'Aarav Sharma');
    assert.equal(attCancelled.recipientPartyId, 'p_aarav', 'Recipient party ID must resolve to Aarav Sharma without synthesis');
    assert.equal(attCancelled.reconciliationNotes, 'User dismissed UPI app prompt');
    assert.equal(attCancelled.metadata.appChosen, 'gpay');

    // Attempt 2: INITIATED unresolved
    const attInitiated = attempts.find((a) => a.id === 'att_initiated_1');
    assert.ok(attInitiated);
    assert.equal(attInitiated.status, 'INITIATED');
    assert.equal(attInitiated.isUnresolved, true);
    assert.equal(attInitiated.amountPaise, 50000);
    assert.equal(attInitiated.amountRupees, 500);
    assert.equal(attInitiated.recipientPartyId, 'p_rohan');
    assert.equal(attInitiated.reconciledAt, null);

    // Attempt 3: COMPLETED linked to tx_give_1
    const attCompleted = attempts.find((a) => a.id === 'att_completed_1');
    assert.ok(attCompleted);
    assert.equal(attCompleted.status, 'COMPLETED');
    assert.equal(attCompleted.isUnresolved, false);
    assert.equal(attCompleted.eventId, 'tx_give_1');
    assert.equal(attCompleted.reconciledAt, 1700000100000);

    // Attempt 4: FAILED
    const attFailed = attempts.find((a) => a.id === 'att_failed_1');
    assert.ok(attFailed);
    assert.equal(attFailed.status, 'FAILED');
    assert.equal(attFailed.isUnresolved, false);
    assert.equal(attFailed.recipientPartyId, 'p_ananya');

    // Attempt 5: UNKNOWN with unknown merchant (legacy amount normalized to paise & rupees)
    const attUnknown = attempts.find((a) => a.id === 'att_unknown_1');
    assert.ok(attUnknown);
    assert.equal(attUnknown.status, 'UNKNOWN');
    assert.equal(attUnknown.isUnresolved, true);
    assert.equal(attUnknown.amountPaise, 8000);
    assert.equal(attUnknown.amountRupees, 80);
    assert.equal(attUnknown.recipientPartyId, null, 'Unknown recipient must NOT generate a party ID');

    // Crucial: Unknown merchant must NOT create a synthetic person in people directory
    assert.equal(
      res.migratedState.people.some((p) => p.name === 'Unknown Merchant'),
      false,
      'Payment attempts must NOT generate synthetic people in the directory'
    );
    assert.equal(res.migratedState.people.length, 4);
  });

  test('2. People: Archived status, creation timestamps, and stable IDs are preserved', () => {
    const fixture = createEnhancedLegacyFixture();
    const res = migrateV1ToV2(fixture);
    assert.equal(res.success, true);

    const people = res.migratedState.people;
    assert.equal(people.length, 4);

    // Diya Patel was archived in v1
    const diya = people.find((p) => p.id === 'p_diya');
    assert.ok(diya);
    assert.equal(diya.name, 'Diya Patel');
    assert.equal(diya.isArchived, true, 'isArchived must be strictly preserved as true');
    assert.equal(diya.createdAt, 1700000010000, 'Original createdAt must be preserved');

    // Aarav Sharma
    const aarav = people.find((p) => p.id === 'p_aarav');
    assert.ok(aarav);
    assert.equal(aarav.isArchived, false);
    assert.equal(aarav.createdAt, 1700000000000);
  });

  test('3. Transactions: Payment methods, paymentAttemptId links, and custom metadata are preserved', () => {
    const fixture = createEnhancedLegacyFixture();
    const res = migrateV1ToV2(fixture);
    assert.equal(res.success, true);

    const txns = res.migratedState.transactions;
    assert.equal(txns.length, 6);

    // Give transaction
    const txGive = txns.find((t) => t.id === 'tx_give_1');
    assert.ok(txGive);
    assert.equal(txGive.paymentMethod, 'UPI');
    assert.equal(txGive.metadata.paymentAttemptId, 'att_completed_1');
    assert.equal(txGive.metadata.memo, 'Train booking');
    assert.equal(txGive.metadata.tag, 'trip');

    // Take transaction
    const txTake = txns.find((t) => t.id === 'tx_take_1');
    assert.ok(txTake);
    assert.equal(txTake.paymentMethod, 'CASH');
    assert.equal(txTake.metadata.memo, 'Office canteen');

    // Personal expense
    const txPE = txns.find((t) => t.id === 'tx_pe_1');
    assert.ok(txPE);
    assert.equal(txPE.paymentMethod, 'UPI');
    assert.equal(txPE.metadata.isbn, '978-3-16-148410-0');

    // Settle transaction
    const txSettle = txns.find((t) => t.id === 'tx_settle_1');
    assert.ok(txSettle);
    assert.equal(txSettle.kind, EVENT_KINDS.REPAYMENT);
    assert.equal(txSettle.paymentMethod, 'UPI');
    assert.equal(txSettle.metadata.ref, 'UPI-REF-12345');

    // Adjustment transaction
    const txAdj = txns.find((t) => t.id === 'tx_adj_1');
    assert.ok(txAdj);
    assert.equal(txAdj.kind, EVENT_KINDS.ADJUSTMENT);
    assert.equal(txAdj.paymentMethod, 'OTHER');
    assert.equal(txAdj.metadata.auditReason, 'Rounded bill share');

    // Split transaction
    const txSplit = txns.find((t) => t.id === 'tx_split_1');
    assert.ok(txSplit);
    assert.equal(txSplit.kind, EVENT_KINDS.EXPENSE);
    assert.equal(txSplit.paymentMethod, 'UPI');
    assert.equal(txSplit.metadata.venue, 'Pizzeria');
  });

  test('4. Ancillary state: Categories, currency, budget, theme normalization to graphite, and alarms', () => {
    const fixture = createEnhancedLegacyFixture();
    const res = migrateV1ToV2(fixture);
    assert.equal(res.success, true);

    const { settings, categories, pendingReviews } = res.migratedState;

    // Theme normalized to universal graphite
    assert.equal(settings.theme, 'graphite');
    assert.equal(settings.currencySymbol, '₹');
    assert.equal(settings.monthlyBudgetPaise, 3500000); // ₹35,000 = 3,500,000 paise

    // Categories preserved
    assert.ok(categories.includes('Crypto'));
    assert.ok(categories.includes('Gadgets'));

    // Alarms preserved in pendingReviews
    assert.equal(pendingReviews.migratedAlarms.length, 1);
    const alarm = pendingReviews.migratedAlarms[0];
    assert.equal(alarm.id, 'alarm_1');
    assert.equal(alarm.txnId, 'tx_give_1');
    assert.equal(alarm.personId, 'p_aarav');
    assert.equal(alarm.amountPaise, 100000);
  });

  test('5. StoreCore Integration: previewMigration, executeMigration, getPaymentAttempts, and rollbackMigration', () => {
    const fixture = createEnhancedLegacyFixture();
    const storage = new MemoryStorage({
      [PRIMARY_STORAGE_KEY]: JSON.stringify(fixture),
    });
    const store = new StoreCore({ storage });

    assert.equal(store.isV2(), false);

    // 1. previewMigration reports all 5 metrics accurately
    const preview = store.previewMigration();
    assert.equal(preview.isApplicable, true);
    assert.equal(preview.success, true);
    assert.equal(preview.transactionCount, 6);
    assert.equal(preview.peopleCount, 4);
    assert.equal(preview.paymentAttemptsCount, 5);
    assert.equal(preview.unresolvedPaymentAttemptsCount, 2);
    assert.equal(preview.pendingAlarmsCount, 1);

    // 2. executeMigration commits v2 state and preserves payment attempts
    const migRes = store.executeMigration();
    assert.equal(migRes.success, true);
    assert.equal(store.isV2(), true);

    // Payment attempts exposed by store
    const attempts = store.getPaymentAttempts();
    assert.equal(attempts.length, 5);
    const unresolved = store.getUnresolvedPaymentAttempts();
    assert.equal(unresolved.length, 2);

    // Person archive status preserved
    const people = store.state.people;
    const diya = people.find((p) => p.name === 'Diya Patel');
    assert.equal(diya.isArchived, true);

    // Theme normalized in store
    assert.equal(store.state.settings.theme, 'graphite');

    // 3. Rollback restores untouched raw v1 state exactly
    const rollRes = store.rollbackMigration();
    assert.equal(rollRes.success, true);
    assert.equal(store.isV2(), false);

    // Raw v1 state has original 5 payment attempts
    assert.equal(store.state.paymentAttempts.length, 5);
    assert.equal(store.state.settings.theme, 'elden');
    assert.equal(store.state.people.find((p) => p.name === 'Diya Patel').isArchived, true);
  });

  test('6. Demo fixture parity: pocketledger-v1-demo.json migrates with exact historical balances', () => {
    const fixtureRaw = fs.readFileSync(new URL('../../test-fixtures/pocketledger-v1-demo.json', import.meta.url), 'utf8');
    const storage = new MemoryStorage({
      [PRIMARY_STORAGE_KEY]: fixtureRaw,
    });
    const store = new StoreCore({ storage });

    assert.equal(store.isV2(), false);

    // Preview checks
    const preview = store.previewMigration();
    assert.equal(preview.success, true);
    assert.equal(preview.transactionCount, 6);
    assert.equal(preview.peopleCount, 4);
    assert.equal(preview.paymentAttemptsCount, 0); // Demo fixture has no payment attempts

    // Migration execution
    const migRes = store.executeMigration();
    assert.equal(migRes.success, true);
    assert.equal(store.isV2(), true);

    // Exact balances check
    const balances = store.computeBalances();
    assert.equal(balances['Aarav Sharma'], 2250, 'Aarav Sharma must have balance +₹2,250');
    assert.equal(balances['Diya Patel'], -900, 'Diya Patel must have balance -₹900');
    assert.equal(balances['Rohan Verma'], 1200, 'Rohan Verma must have balance +₹1,200');
    assert.equal(balances['Ananya Iyer'], 2200, 'Ananya Iyer must have balance +₹2,200');
  });

  test('7. Restored backup regression: Migration preview review item breakdown reports exact distinct review counts', () => {
    const fixtureRaw = fs.readFileSync(new URL('../../test-fixtures/pocketledger-v1-demo.json', import.meta.url), 'utf8');
    const restoredBackup = JSON.parse(fixtureRaw);

    // 8 transactions:
    // Original demo has 6 transactions (txn_v1_001 to txn_v1_006)
    // - txn_v1_001: 'give' -> unclassified (1)
    // - txn_v1_002: 'take' -> unclassified (2)
    // - txn_v1_003: 'split'
    // - txn_v1_004: 'settle' without direction -> unverified settlement (1)
    // - txn_v1_005: 'adjustment'
    // - txn_v1_006: 'give' -> unclassified (3)
    // Add 2 QA test transactions to form the exact restored backup of 8 transactions:
    restoredBackup.transactions.push({
      id: 'txn_v1_007',
      type: 'give',
      person: 'Aarav Sharma',
      amount: 500,
      description: 'Lending test transaction',
      category: 'Other',
      date: '2026-10-25T10:00:00.000Z',
      createdAt: 1792900000000,
    }); // -> unclassified (4)
    restoredBackup.transactions.push({
      id: 'txn_v1_008',
      type: 'settle',
      direction: 'outflow',
      person: 'Diya Patel',
      amount: 300,
      description: 'You paid back Diya Patel',
      category: 'Settlement',
      paymentMethod: 'Cash',
      date: '2026-10-26T10:00:00.000Z',
      createdAt: 1792950000000,
    }); // -> canonical repayment (not unclassified/unverified)

    // 3 payment attempts: 2 CANCELLED, 1 INITIATED (unresolved)
    restoredBackup.paymentAttempts = [
      {
        id: 'att_qa_1',
        type: 'UPI',
        status: 'CANCELLED',
        isUnresolved: false,
        amountRupees: 500,
        amountPaise: 50000,
        recipientName: 'Aarav Sharma',
        recipientPartyId: 'person_01',
      },
      {
        id: 'att_qa_2',
        type: 'UPI',
        status: 'CANCELLED',
        isUnresolved: false,
        amountRupees: 300,
        amountPaise: 30000,
        recipientName: 'Diya Patel',
        recipientPartyId: 'person_02',
      },
      {
        id: 'att_qa_3',
        type: 'UPI',
        status: 'INITIATED',
        isUnresolved: true,
        amountRupees: 500,
        amountPaise: 50000,
        recipientName: 'Rohan Verma',
        recipientPartyId: 'person_03',
      },
    ];

    // 4 people: person_01 (Aarav), person_02 (Diya), person_03 (Rohan), person_04 (Ananya)
    // 1 pending alarm: alarm_demo_01 (Ananya Iyer, ₹2,200)

    const storage = new MemoryStorage({
      [PRIMARY_STORAGE_KEY]: JSON.stringify(restoredBackup),
    });
    const store = new StoreCore({ storage });

    assert.equal(store.isV2(), false);

    const preview = store.previewMigration();

    // Verify backup inventory
    assert.equal(preview.transactionCount, 8, 'Must have 8 transactions');
    assert.equal(preview.peopleCount, 4, 'Must have 4 people');
    assert.equal(preview.paymentAttemptsCount, 3, 'Must preserve 3 payment attempts');
    assert.equal(preview.unresolvedPaymentAttemptsCount, 1, 'Must have 1 unresolved payment attempt');

    // Verify exact required review item counts
    assert.equal(preview.pendingAlarmsCount, 1, 'Pending alarms must be exactly 1');
    assert.equal(preview.unclassifiedTransactionsCount, 4, 'Unclassified legacy transactions must be exactly 4');
    assert.equal(preview.unverifiedSettlementsCount, 1, 'Unverified settlements must be exactly 1');
    assert.equal(preview.ambiguousPeopleCount, 0, 'Ambiguous people must be 0');
    assert.equal(preview.inconsistentRecordsCount, 0, 'Inconsistent records must be 0');
    assert.equal(preview.otherReviewItemsCount, 0, 'Other review items must be 0');
    assert.equal(preview.historicalReviewCount, 5, 'Historical review count excluding pending alarms must be 5');
    assert.equal(preview.reviewItemsCount, 6, 'Distinct total review items must be 6 (never double-counted to 7)');

    // Ensure distinct non-overlapping invariant
    assert.equal(preview.reviewItemsCount, preview.pendingAlarmsCount + preview.historicalReviewCount);
    assert.equal(preview.pendingAlarmsCount + preview.reviewItemsCount, 7, 'Prior buggy summation produced 7 by double-counting alarm');
  });
});
