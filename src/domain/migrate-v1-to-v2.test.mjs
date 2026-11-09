import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  migrateV1ToV2,
  extractCalendarDate,
  convertRupeesToPaise,
} from './migrate-v1-to-v2.js';
import {
  computePersonBalance,
  computeAllBalances,
  computeMonthlyPersonalSpending,
  EVENT_KINDS,
  PARTY_USER,
} from './ledger.js';

// Legacy balance calculator from store.js to verify exact balance parity
function legacyComputeLendingBalances(transactions) {
  const balances = {};
  for (const txn of transactions) {
    if (txn.type === 'give') {
      balances[txn.person] = (balances[txn.person] || 0) + txn.amount;
    } else if (txn.type === 'take') {
      balances[txn.person] = (balances[txn.person] || 0) - txn.amount;
    } else if (txn.type === 'split') {
      if (txn.splits) {
        for (const s of txn.splits) {
          balances[s.person] = (balances[s.person] || 0) + s.amount;
        }
      }
    } else if (txn.type === 'settle') {
      balances[txn.person] = (balances[txn.person] || 0) - txn.amount;
    } else if (txn.type === 'adjustment') {
      balances[txn.person] = (balances[txn.person] || 0) + txn.amount;
    }
  }
  return balances;
}

describe('PocketLedger Legacy Data Migration Engine (v1 -> v2)', () => {

  // Test 1: Helper unit tests (Date extraction and Paise conversion)
  test('1. Helper functions handle date strings, timestamps, and rupee amounts safely', () => {
    // Dates without UTC shift
    assert.equal(extractCalendarDate('2026-11-08T18:25:27.000Z'), '2026-11-08');
    assert.equal(extractCalendarDate('2026-11-08'), '2026-11-08');
    assert.equal(extractCalendarDate('invalid-date', '2026-01-01'), '2026-01-01');

    // Money conversions
    const valid = convertRupeesToPaise(500.50);
    assert.equal(valid.amountPaise, 50050);
    assert.equal(valid.isExact, true);
    assert.equal(valid.isValid, true);

    const fractional = convertRupeesToPaise(12.3456);
    assert.equal(fractional.amountPaise, 1235);
    assert.equal(fractional.isExact, false);
    assert.equal(fractional.isValid, true);

    const negative = convertRupeesToPaise(-100);
    assert.equal(negative.isValid, false);

    const nonNumber = convertRupeesToPaise(NaN);
    assert.equal(nonNumber.isValid, false);
  });

  // Test 2: Empty legacy state
  test('2. Migrates empty legacy state cleanly with sensible defaults', () => {
    const emptyV1 = {
      transactions: [],
      people: [],
      categories: ['Food', 'Transport'],
      pendingAlarms: [],
      settings: { currency: '₹', monthlyBudget: 0 },
    };

    const res = migrateV1ToV2(emptyV1);
    assert.equal(res.success, true);
    assert.equal(res.migratedState.schemaVersion, 2);
    assert.equal(res.migratedState.transactions.length, 0);
    assert.equal(res.migratedState.people.length, 0);
    assert.equal(res.migratedState.settings.currencySymbol, '₹');
    assert.equal(res.migratedState.settings.monthlyBudgetPaise, 0);
    assert.deepEqual(res.migratedState._rawLegacyBackup, emptyV1);
  });

  // Test 3: Migration of all five legacy transaction types
  test('3. Migrates all 5 legacy transaction types preserving exact balance effects', () => {
    const legacyState = {
      transactions: [
        {
          id: 'txn-give',
          type: 'give',
          person: 'Rahul',
          amount: 600,
          date: '2026-11-01',
          createdAt: 1000,
          description: 'Auto fare loan',
          category: 'Transport',
        },
        {
          id: 'txn-take',
          type: 'take',
          person: 'Sneha',
          amount: 400,
          date: '2026-11-02',
          createdAt: 2000,
          description: 'Borrowed for groceries',
          category: 'Food',
        },
        {
          id: 'txn-settle',
          type: 'settle',
          person: 'Rahul',
          amount: 200,
          date: '2026-11-03',
          createdAt: 3000,
          description: 'Rahul cash return',
          category: 'Settlement',
        },
        {
          id: 'txn-adjustment',
          type: 'adjustment',
          person: 'Sneha',
          amount: 150,
          date: '2026-11-04',
          createdAt: 4000,
          description: 'Manual adjustment',
          category: 'Adjustment',
        },
        {
          id: 'txn-split',
          type: 'split',
          person: 'Rahul, Priya',
          amount: 900,
          myShare: 300,
          splits: [
            { person: 'Rahul', amount: 300 },
            { person: 'Priya', amount: 300 },
          ],
          date: '2026-11-05',
          createdAt: 5000,
          description: 'Team Lunch',
          category: 'Food',
        },
      ],
      people: [
        { id: 'p-rahul', name: 'Rahul', upiId: 'rahul@upi' },
        { id: 'p-sneha', name: 'Sneha', upiId: 'sneha@upi' },
      ],
      categories: ['Food', 'Transport'],
      settings: { currency: '₹', monthlyBudget: 15000 },
    };

    let idCounter = 1;
    const testIdGen = () => `gen_id_${idCounter++}`;

    const res = migrateV1ToV2(legacyState, { idGenerator: testIdGen });
    assert.equal(res.success, true);
    const { migratedState, reviewItems } = res;

    // Verify people: Rahul, Sneha, and Priya (Priya was created from split!)
    assert.equal(migratedState.people.length, 3);
    const rahul = migratedState.people.find((p) => p.name === 'Rahul');
    const sneha = migratedState.people.find((p) => p.name === 'Sneha');
    const priya = migratedState.people.find((p) => p.name === 'Priya');
    assert.ok(rahul && sneha && priya);

    // Verify transactions
    assert.equal(migratedState.transactions.length, 5);

    // 1. Give: LEGACY_UNCLASSIFIED
    const giveEvt = migratedState.transactions.find((t) => t.id === 'txn-give');
    assert.equal(giveEvt.kind, EVENT_KINDS.LEGACY_UNCLASSIFIED);
    assert.equal(giveEvt.legacyType, 'give');
    assert.equal(giveEvt.amountPaise, 60000);
    assert.equal(giveEvt.personId, rahul.id);

    // 2. Take: LEGACY_UNCLASSIFIED
    const takeEvt = migratedState.transactions.find((t) => t.id === 'txn-take');
    assert.equal(takeEvt.kind, EVENT_KINDS.LEGACY_UNCLASSIFIED);
    assert.equal(takeEvt.legacyType, 'take');
    assert.equal(takeEvt.amountPaise, 40000);
    assert.equal(takeEvt.personId, sneha.id);

    // 3. Settle: LEGACY_UNCLASSIFIED, flagged for direction review
    const settleEvt = migratedState.transactions.find((t) => t.id === 'txn-settle');
    assert.equal(settleEvt.kind, EVENT_KINDS.LEGACY_UNCLASSIFIED);
    assert.equal(settleEvt.legacyType, 'settle');
    assert.equal(settleEvt.amountPaise, 20000);
    assert.equal(settleEvt.metadata.directionUnverified, true);
    assert.equal(reviewItems.unverifiedSettlements.length, 1);

    // 4. Adjustment: ADJUSTMENT
    const adjEvt = migratedState.transactions.find((t) => t.id === 'txn-adjustment');
    assert.equal(adjEvt.kind, EVENT_KINDS.ADJUSTMENT);
    assert.equal(adjEvt.fromPartyId, PARTY_USER);
    assert.equal(adjEvt.toPartyId, sneha.id);
    assert.equal(adjEvt.amountPaise, 15000);

    // 5. Split: Canonical EXPENSE
    const splitEvt = migratedState.transactions.find((t) => t.id === 'txn-split');
    assert.equal(splitEvt.kind, EVENT_KINDS.EXPENSE);
    assert.equal(splitEvt.payerId, PARTY_USER);
    assert.equal(splitEvt.totalAmountPaise, 90000);
    assert.equal(splitEvt.userSharePaise, 30000);
    assert.equal(splitEvt.allocations.length, 2);

    // Check balance parity against legacy calculation:
    // Legacy calculation:
    // Rahul: give 600 - settle 200 + split 300 = +700
    // Sneha: take -400 + adjustment +150 = -250
    // Priya: split 300 = +300
    const legacyBalances = legacyComputeLendingBalances(legacyState.transactions);
    assert.equal(legacyBalances['Rahul'], 700);
    assert.equal(legacyBalances['Sneha'], -250);
    assert.equal(legacyBalances['Priya'], 300);

    // New engine balances in integer paise
    const newRahulBal = computePersonBalance(migratedState.transactions, rahul.id);
    const newSnehaBal = computePersonBalance(migratedState.transactions, sneha.id);
    const newPriyaBal = computePersonBalance(migratedState.transactions, priya.id);

    assert.equal(newRahulBal, 70000); // 700.00 INR
    assert.equal(newSnehaBal, -25000); // -250.00 INR
    assert.equal(newPriyaBal, 30000); // 300.00 INR
  });

  // Test 4: Handling Counterparties Missing from Directory
  test('4. Correctly creates Person records for names present in transactions but missing from directory', () => {
    const legacyState = {
      transactions: [
        {
          id: 't-1',
          type: 'give',
          person: 'Aarav',
          amount: 250,
          date: '2026-11-01',
        },
      ],
      people: [], // Aarav is not in directory!
      categories: [],
      settings: {},
    };

    const res = migrateV1ToV2(legacyState);
    assert.equal(res.success, true);
    assert.equal(res.migratedState.people.length, 1);
    assert.equal(res.migratedState.people[0].name, 'Aarav');
    assert.equal(res.migratedState.transactions[0].personId, res.migratedState.people[0].id);
    assert.equal(computePersonBalance(res.migratedState.transactions, res.migratedState.people[0].id), 25000);
  });

  // Test 5: Duplicate Names in Directory
  test('5. Detects duplicate names in directory without silent merging and flags for review', () => {
    const legacyState = {
      transactions: [],
      people: [
        { id: 'p-1', name: 'Vikram', upiId: 'vikram@okaxis' },
        { id: 'p-2', name: 'Vikram', upiId: 'vikram@paytm' }, // Duplicate entry!
      ],
      settings: {},
    };

    const res = migrateV1ToV2(legacyState);
    assert.equal(res.success, true);
    assert.equal(res.reviewItems.ambiguousPeople.length, 1);
    assert.equal(res.reviewItems.ambiguousPeople[0].name, 'Vikram');
  });

  // Test 6: Preserving Pending Alarms Without Auto-Committing
  test('6. Preserves pending alarms for user review and never auto-commits them to transactions', () => {
    const legacyState = {
      transactions: [
        {
          id: 't-1',
          type: 'give',
          person: 'Kavita',
          amount: 500,
          date: '2026-11-01',
        },
      ],
      people: [{ id: 'p-kavita', name: 'Kavita' }],
      pendingAlarms: [
        {
          id: 'alarm-1',
          txnId: 't-1',
          personName: 'Kavita',
          amount: 500,
          direction: 'gave',
          createdAt: 1234567,
        },
      ],
      settings: {},
    };

    const res = migrateV1ToV2(legacyState);
    assert.equal(res.success, true);
    // Verified: Only the original 1 transaction exists in transactions (alarm was NOT auto-committed!)
    assert.equal(res.migratedState.transactions.length, 1);
    assert.equal(res.migratedState.pendingReviews.migratedAlarms.length, 1);
    assert.equal(res.migratedState.pendingReviews.migratedAlarms[0].amountPaise, 50000);
    assert.equal(res.reviewItems.pendingAlarms.length, 1);
  });

  // Test 7: Handling Inconsistent Legacy Splits
  test('7. Handles split with conservation discrepancy by preserving balance effects and flagging', () => {
    const legacyState = {
      transactions: [
        {
          id: 'bad-split',
          type: 'split',
          person: 'Rohan',
          amount: 1000, // Total 1000
          myShare: 100,  // My share 100
          splits: [{ person: 'Rohan', amount: 500 }], // 100 + 500 = 600 !== 1000! 400 discrepancy
          date: '2026-11-01',
        },
      ],
      people: [{ id: 'p-rohan', name: 'Rohan' }],
      settings: {},
    };

    const res = migrateV1ToV2(legacyState);
    assert.equal(res.success, true);
    // Flagged for user review
    assert.equal(res.reviewItems.inconsistentRecords.length, 1);
    // Balance effect of Rohan (+500) is preserved as unclassified allocation
    const rohanId = res.migratedState.people[0].id;
    assert.equal(computePersonBalance(res.migratedState.transactions, rohanId), 50000);
  });

  // Test 8: Determinism with Injected ID Generator
  test('8. Migration is completely deterministic and repeatable with injected ID generator', () => {
    const legacyState = {
      transactions: [
        { id: 't-1', type: 'give', person: 'Deepak', amount: 300, date: '2026-11-01' },
      ],
      people: [],
      settings: { monthlyBudget: 5000 },
    };

    let counterA = 0;
    const genA = () => `id_${++counterA}`;

    let counterB = 0;
    const genB = () => `id_${++counterB}`;

    const fixedNow = 1794200000000;
    const resA = migrateV1ToV2(legacyState, { idGenerator: genA, now: fixedNow });
    const resB = migrateV1ToV2(legacyState, { idGenerator: genB, now: fixedNow });

    assert.deepEqual(resA.migratedState, resB.migratedState);
  });

  // Test 9: Realistic Complex Mixed Dataset Parity
  test('9. Full realistic dataset verifies exact balance parity across all counterparties', () => {
    const complexLegacyState = {
      transactions: [
        { id: 't1', type: 'give', person: 'Alice', amount: 1500, date: '2026-10-01' },
        { id: 't2', type: 'take', person: 'Bob', amount: 800, date: '2026-10-02' },
        { id: 't3', type: 'split', person: 'Alice, Charlie', amount: 1200, myShare: 400, splits: [{ person: 'Alice', amount: 400 }, { person: 'Charlie', amount: 400 }], date: '2026-10-05' },
        { id: 't4', type: 'settle', person: 'Alice', amount: 1000, date: '2026-10-10' },
        { id: 't5', type: 'adjustment', person: 'Bob', amount: -200, date: '2026-10-12' }, // Bob owes user 200 less / user owes 200 more (-800 - 200 = -1000)
        { id: 't6', type: 'give', person: 'Charlie', amount: 600, date: '2026-10-15' },
        { id: 't7', type: 'settle', person: 'Charlie', amount: 1000, date: '2026-10-20' }, // 400 + 600 - 1000 = 0
      ],
      people: [
        { id: 'p-alice', name: 'Alice', upiId: 'alice@upi' },
        { id: 'p-bob', name: 'Bob', upiId: 'bob@upi' },
        { id: 'p-charlie', name: 'Charlie' },
      ],
      categories: ['Food', 'Transport', 'Bills'],
      settings: {
        currency: '₹',
        monthlyBudget: 25000,
        theme: 'elden',
      },
      pendingAlarms: [
        { id: 'al-1', txnId: 't1', personName: 'Alice', amount: 1500, direction: 'gave', createdAt: 12345 },
      ],
    };

    // Calculate legacy balances
    const legacyBalances = legacyComputeLendingBalances(complexLegacyState.transactions);
    assert.equal(legacyBalances['Alice'], 900); // 1500 + 400 - 1000 = 900
    assert.equal(legacyBalances['Bob'], -1000); // -800 - 200 = -1000
    assert.equal(legacyBalances['Charlie'], 0); // 400 + 600 - 1000 = 0

    // Run migration
    const res = migrateV1ToV2(complexLegacyState);
    assert.equal(res.success, true);
    const { migratedState } = res;

    // Check settings
    assert.equal(migratedState.settings.currencySymbol, '₹');
    assert.equal(migratedState.settings.monthlyBudgetPaise, 2500000); // ₹25,000 = 2,500,000 paise
    assert.equal(migratedState.settings.theme, 'elden');

    // Check balances derived by new calculation engine
    const aliceId = migratedState.people.find((p) => p.name === 'Alice').id;
    const bobId = migratedState.people.find((p) => p.name === 'Bob').id;
    const charlieId = migratedState.people.find((p) => p.name === 'Charlie').id;

    const newAliceBal = computePersonBalance(migratedState.transactions, aliceId);
    const newBobBal = computePersonBalance(migratedState.transactions, bobId);
    const newCharlieBal = computePersonBalance(migratedState.transactions, charlieId);

    // Assert exact parity with legacy:
    assert.equal(newAliceBal, 90000);   // ₹900.00
    assert.equal(newBobBal, -100000);  // -₹1,000.00
    assert.equal(newCharlieBal, 0);    // ₹0.00
  });

  // Test 10: Idempotent migration
  test('10. Running migration on an already-migrated v2 state is a safe no-op', () => {
    const v2State = {
      schemaVersion: 2,
      transactions: [],
      people: [],
      categories: ['Food'],
      settings: { currencySymbol: '₹', monthlyBudgetPaise: 0, theme: 'cyber' },
    };

    const res = migrateV1ToV2(v2State);
    assert.equal(res.success, true);
    assert.equal(res.migratedState.schemaVersion, 2);
    assert.equal(res.warnings[0].includes('already Schema v2'), true);
  });
});

