/**
 * Regression Test Suite: PocketLedger Repayment Flow & Action Routing
 *
 * Verifies:
 * 1. Distinction between creation prefill data and transaction edit mode.
 * 2. Action routing and title resolution for settle/repayment vs personal expense.
 * 3. Form parameter normalization (prefilling person & balance without edit mode).
 * 4. Save dispatch logic (store.addTransaction vs store.editTransaction).
 * 5. Full financial flow for Aarav Sharma (+₹3,050 -> +₹2,550 on ₹500 repayment).
 * 6. Invariance of monthly personal spending during repayments.
 * 7. Canonical v2 event editing resolution (REPAYMENT, EXPENSE, TRANSFER).
 * 8. Error retention and non-closure on failed transactions (e.g. overpayment).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  StoreCore,
  PRIMARY_STORAGE_KEY,
  BACKUP_STORAGE_KEY,
  defaultStateV1,
} from './store-core.js';
import { EVENT_KINDS, PARTY_USER, computeMonthlyPersonalSpending } from './ledger.js';
import { migrateV1ToV2 } from './migrate-v1-to-v2.js';
import {
  isEditMode,
  resolveSheetAction,
  resolveSheetTitle,
  normalizeEditTxn,
  dispatchTransactionSave,
} from './transaction-routing.js';

describe('PocketLedger Repayment Flow & Sheet Routing Regression Suite', () => {
  // Test helper: mock memory storage conforming to Web Storage API
  const createMockStorage = (initialData = null) => {
    const store = new Map();
    if (initialData && typeof initialData === 'object') {
      if (initialData.schemaVersion !== undefined || initialData.transactions !== undefined) {
        store.set(PRIMARY_STORAGE_KEY, JSON.stringify(initialData));
      } else {
        for (const [k, v] of Object.entries(initialData)) {
          store.set(k, typeof v === 'string' ? v : JSON.stringify(v));
        }
      }
    }
    return {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, val) => store.set(key, String(val)),
      removeItem: (key) => store.delete(key),
      clear: () => store.clear(),
    };
  };

  test('1. openSheet("settle", { person: "Aarav Sharma", amount: 3050 }) resolves to NEW repayment, NOT Edit Personal Expense', () => {
    const prefillData = { person: 'Aarav Sharma', amount: 3050 };

    // Prefill data lacks an ID, so isEditMode must be false
    assert.equal(isEditMode(prefillData), false);

    // Resolves to repayment, not personal_expense
    const action = resolveSheetAction('settle', prefillData);
    assert.equal(action, 'repayment');

    // Title reflects creation of a repayment
    const title = resolveSheetTitle(action, false);
    assert.equal(title, 'Record Repayment');
    assert.notEqual(title, 'Edit Personal Expense');
    assert.notEqual(title, 'Edit Repayment');
  });

  test('2. Repayment form parameters receive the correct person and amount without entering edit mode', () => {
    const prefillData = { person: 'Aarav Sharma', amount: 3050 };
    const people = [{ id: 'p_aarav', name: 'Aarav Sharma', upiId: 'aarav@upi' }];

    const normalized = normalizeEditTxn(prefillData, people);
    // Because it is NOT edit mode (no ID), normalized editTxn must be null
    assert.equal(normalized, null);

    // Initial parameters derived for RepaymentForm:
    const initialPerson = normalized?.person || prefillData?.person || '';
    const initialAmount = normalized?.amount ?? prefillData?.amount ?? '';

    assert.equal(initialPerson, 'Aarav Sharma');
    assert.equal(initialAmount, 3050);
  });

  test('3. Saving a prefilled repayment invokes addTransaction, NOT editTransaction', () => {
    const sheet = {
      type: 'settle',
      editTxn: { person: 'Aarav Sharma', amount: 3050 },
    };

    let addCalled = false;
    let editCalled = false;

    const mockStore = {
      addTransaction: (payload) => {
        addCalled = true;
        return { success: true };
      },
      editTransaction: (id, payload) => {
        editCalled = true;
        return { success: true };
      },
    };

    const txnPayload = {
      type: 'settle',
      action: 'repayment',
      person: 'Aarav Sharma',
      amount: 500,
      paymentMethod: 'CASH',
    };

    const res = dispatchTransactionSave(sheet, txnPayload, mockStore);
    assert.equal(res.success, true);
    assert.equal(addCalled, true, 'Expected addTransaction to be invoked');
    assert.equal(editCalled, false, 'editTransaction must NOT be invoked for prefill');
  });

  test('4, 5 & 6. End-to-end ledger repayment: Aarav balance drops from +₹3,050 to +₹2,550 and personal spending is unchanged', () => {
    const storage = createMockStorage();
    let idCounter = 1;
    const store = new StoreCore({
      storage,
      idGenerator: () => `test_id_${idCounter++}`,
    });

    // Create Aarav Sharma
    const aarav = store.addPerson('Aarav Sharma', 'aarav@okaxis');

    // Simulate pre-existing balance of +₹3,050 (e.g. loan of ₹3,050)
    store.addTransaction({
      type: 'give',
      person: 'Aarav Sharma',
      amount: 3050,
      date: '2026-11-01',
      description: 'Initial loan',
      paymentMethod: 'CASH',
    });

    // Initial check: Aarav owes user ₹3,050
    assert.equal(store.computeBalances()['Aarav Sharma'], 3050);

    // Initial personal spending check
    const spendingBefore = computeMonthlyPersonalSpending(store.getCanonicalEvents(), 2026, 11);
    assert.equal(spendingBefore, 0, 'Lending must not count toward personal spending');

    // Also check store.computeMonthlyAnalytics
    const analyticsBefore = store.computeMonthlyAnalytics(2026, 11);
    assert.equal(analyticsBefore.totalSpent, 0);

    // Now record repayment of ₹500 via the exact payload generated by RepaymentForm
    const sheet = {
      type: 'settle',
      editTxn: { person: 'Aarav Sharma', amount: 3050 },
    };

    const repaymentPayload = {
      type: 'settle',
      action: 'repayment',
      person: 'Aarav Sharma',
      amount: 500,
      direction: 'inflow',
      description: 'Partial cash repayment',
      category: 'Settlement',
      date: '2026-11-10',
      paymentMethod: 'CASH',
    };

    const saveRes = dispatchTransactionSave(sheet, repaymentPayload, store);
    assert.equal(saveRes.success, true);

    // Verify resulting canonical event
    const events = store.getCanonicalEvents();
    const repaymentEvent = events.find((e) => e.kind === EVENT_KINDS.REPAYMENT);
    assert.ok(repaymentEvent, 'A canonical REPAYMENT event must be created');
    assert.equal(repaymentEvent.fromPartyId, aarav.id);
    assert.equal(repaymentEvent.toPartyId, PARTY_USER);
    assert.equal(repaymentEvent.amountPaise, 50000); // ₹500 = 50,000 paise
    assert.equal(repaymentEvent.paymentMethod, 'CASH');

    // Verify balance changed exactly from +₹3,050 to +₹2,550
    const balances = store.computeBalances();
    assert.equal(balances['Aarav Sharma'], 2550);

    // Verify personal spending remains completely unchanged
    const spendingAfter = computeMonthlyPersonalSpending(store.getCanonicalEvents(), 2026, 11);
    assert.equal(spendingAfter, 0, 'Repayment must have ZERO effect on personal spending');

    const analyticsAfter = store.computeMonthlyAnalytics(2026, 11);
    assert.equal(analyticsAfter.totalSpent, 0);
  });

  test('7. Editing an actual existing transaction with an ID invokes editTransaction with that ID', () => {
    const existingTxn = {
      id: 'tx_existing_999',
      type: 'give',
      person: 'Aarav Sharma',
      amount: 1000,
    };

    assert.equal(isEditMode(existingTxn), true);

    let capturedId = null;
    let editPayload = null;

    const mockStore = {
      addTransaction: () => {
        assert.fail('addTransaction should not be called');
      },
      editTransaction: (id, payload) => {
        capturedId = id;
        editPayload = payload;
        return { success: true };
      },
    };

    const sheet = {
      type: 'give',
      editTxn: existingTxn,
    };

    const updates = { amount: 1500, description: 'Updated loan' };
    const res = dispatchTransactionSave(sheet, updates, mockStore);

    assert.equal(res.success, true);
    assert.equal(capturedId, 'tx_existing_999');
    assert.equal(editPayload.amount, 1500);
  });

  test('8. Editing canonical v2 events correctly resolves to respective workflows', () => {
    const people = [
      { id: 'p_aarav', name: 'Aarav Sharma' },
      { id: 'p_diya', name: 'Diya Patel' },
    ];

    // Canonical REPAYMENT
    const canonicalRepayment = {
      id: 'rep_1',
      kind: EVENT_KINDS.REPAYMENT,
      fromPartyId: 'p_aarav',
      toPartyId: PARTY_USER,
      amountPaise: 50000,
      description: 'Cash settlement',
      paymentMethod: 'CASH',
    };
    assert.equal(resolveSheetAction(null, canonicalRepayment), 'repayment');
    assert.equal(resolveSheetTitle('repayment', true), 'Edit Repayment');
    const normRep = normalizeEditTxn(canonicalRepayment, people);
    assert.equal(normRep.person, 'Aarav Sharma');
    assert.equal(normRep.amount, 500);

    // Canonical TRANSFER (Lend: USER -> Counterparty)
    const canonicalLend = {
      id: 'transfer_1',
      kind: EVENT_KINDS.TRANSFER,
      fromPartyId: PARTY_USER,
      toPartyId: 'p_aarav',
      amountPaise: 120000,
    };
    assert.equal(resolveSheetAction(null, canonicalLend), 'lend');
    assert.equal(resolveSheetTitle('lend', true), 'Edit Loan');
    const normLend = normalizeEditTxn(canonicalLend, people);
    assert.equal(normLend.person, 'Aarav Sharma');
    assert.equal(normLend.amount, 1200);

    // Canonical TRANSFER (Borrow: Counterparty -> USER)
    const canonicalBorrow = {
      id: 'transfer_2',
      kind: EVENT_KINDS.TRANSFER,
      fromPartyId: 'p_diya',
      toPartyId: PARTY_USER,
      amountPaise: 80000,
    };
    assert.equal(resolveSheetAction(null, canonicalBorrow), 'borrow');
    assert.equal(resolveSheetTitle('borrow', true), 'Edit Borrowing');
    const normBorrow = normalizeEditTxn(canonicalBorrow, people);
    assert.equal(normBorrow.person, 'Diya Patel');
    assert.equal(normBorrow.amount, 800);

    // Canonical EXPENSE (Solo personal expense)
    const canonicalSoloExpense = {
      id: 'exp_1',
      kind: EVENT_KINDS.EXPENSE,
      payerId: PARTY_USER,
      totalAmountPaise: 35000,
      userSharePaise: 35000,
      allocations: [],
    };
    assert.equal(resolveSheetAction(null, canonicalSoloExpense), 'personal_expense');
    assert.equal(resolveSheetTitle('personal_expense', true), 'Edit Personal Expense');
    const normSolo = normalizeEditTxn(canonicalSoloExpense, people);
    assert.equal(normSolo.amount, 350);

    // Canonical EXPENSE (Shared expense with allocations)
    const canonicalSharedExpense = {
      id: 'exp_2',
      kind: EVENT_KINDS.EXPENSE,
      payerId: PARTY_USER,
      totalAmountPaise: 90000,
      userSharePaise: 30000,
      allocations: [
        { personId: 'p_aarav', amountPaise: 30000 },
        { personId: 'p_diya', amountPaise: 30000 },
      ],
    };
    assert.equal(resolveSheetAction(null, canonicalSharedExpense), 'shared_expense');
    assert.equal(resolveSheetTitle('shared_expense', true), 'Edit Shared Expense');
    const normShared = normalizeEditTxn(canonicalSharedExpense, people);
    assert.equal(normShared.amount, 900);
    assert.equal(normShared.payer, 'user');
    assert.equal(normShared.payerId, 'user');
    assert.equal(normShared.userShare, 300);
    assert.equal(normShared.splits.length, 2);
    assert.equal(normShared.splits[0].person, 'Aarav Sharma');
    assert.equal(normShared.splits[0].amount, 300);
  });

  test('9. Failed store operations retain error details and return error result for UI display', () => {
    const storage = createMockStorage();
    const store = new StoreCore({ storage });

    store.addPerson('Aarav Sharma');
    store.addTransaction({
      type: 'give',
      person: 'Aarav Sharma',
      amount: 1000,
      date: '2026-11-01',
    });

    const sheet = {
      type: 'settle',
      editTxn: { person: 'Aarav Sharma', amount: 1000 },
    };

    // Attempt an overpayment of ₹1,500 when debt is only ₹1,000
    const overpaymentPayload = {
      type: 'settle',
      person: 'Aarav Sharma',
      amount: 1500,
      date: '2026-11-10',
    };

    const res = dispatchTransactionSave(sheet, overpaymentPayload, store);

    // Operation must fail and supply readable error message
    assert.equal(res.success, false);
    assert.ok(res.error, 'Error message must be present');
    assert.ok(res.error.toLowerCase().includes('exceeds'), 'Error must specify amount exceeds balance');

    // Balance must remain unchanged
    assert.equal(store.computeBalances()['Aarav Sharma'], 1000);
  });

  // ─────────────────────────────────────────────────────────────
  // REPAYMENT DIRECTION & MIGRATION SPECIFICATION REGRESSION TESTS
  // ─────────────────────────────────────────────────────────────

  test('10. Test A: Inflow repayment from person with positive balance (+₹3,050 -> +₹2,550)', () => {
    const storage = createMockStorage(defaultStateV1());
    let idCount = 1;
    const store = new StoreCore({ storage, idGenerator: () => `id_${idCount++}` });

    // Setup: Unmigrated v1 state with loan of ₹3,050 to Aarav Sharma
    store.addPerson('Aarav Sharma');
    store.addTransaction({
      type: 'give',
      person: 'Aarav Sharma',
      amount: 3050,
      date: '2026-11-01',
      description: 'Lent for travel',
      paymentMethod: 'CASH',
    });

    assert.equal(store.isV2(), false, 'Store should be in unmigrated legacy v1 state');
    assert.equal(store.computeBalances()['Aarav Sharma'], 3050);

    // Inflow repayment: Aarav pays user ₹500
    const res = store.addTransaction({
      type: 'settle',
      action: 'repayment',
      person: 'Aarav Sharma',
      amount: 500,
      direction: 'inflow',
      description: 'Partial repayment received',
      date: '2026-11-10',
      paymentMethod: 'CASH',
    });
    assert.equal(res.success, true);

    // Dynamic projection in unmigrated state derives canonical REPAYMENT event
    const events = store.getCanonicalEvents();
    const repaymentEvt = events.find((e) => e.kind === EVENT_KINDS.REPAYMENT);
    assert.ok(repaymentEvt, 'Must project a canonical REPAYMENT event');
    assert.equal(repaymentEvt.toPartyId, PARTY_USER);
    assert.notEqual(repaymentEvt.fromPartyId, PARTY_USER);
    assert.equal(repaymentEvt.amountPaise, 50000);
    assert.equal(repaymentEvt.metadata.direction, 'inflow');

    // Balance changes from +₹3,050 to +₹2,550
    assert.equal(store.computeBalances()['Aarav Sharma'], 2550);

    // Migration execution persists this state cleanly
    const migRes = store.executeMigration();
    assert.equal(migRes.success, true);
    assert.equal(store.computeBalances()['Aarav Sharma'], 2550);
  });

  test('11. Test B: Outflow repayment to person with negative balance (-₹1,300 -> -₹1,000)', () => {
    const storage = createMockStorage(defaultStateV1());
    let idCount = 1;
    const store = new StoreCore({ storage, idGenerator: () => `id_${idCount++}` });

    // Setup: Unmigrated v1 state where user owes Diya Patel ₹1,300
    store.addPerson('Diya Patel');
    store.addTransaction({
      type: 'take',
      person: 'Diya Patel',
      amount: 1300,
      date: '2026-11-01',
      description: 'Borrowed from Diya',
      paymentMethod: 'CASH',
    });

    assert.equal(store.isV2(), false);
    assert.equal(store.computeBalances()['Diya Patel'], -1300);

    // Outflow repayment: User pays Diya ₹300
    const res = store.addTransaction({
      type: 'settle',
      action: 'repayment',
      person: 'Diya Patel',
      amount: 300,
      direction: 'outflow',
      description: 'Repayment sent',
      date: '2026-11-10',
      paymentMethod: 'CASH',
    });
    assert.equal(res.success, true);

    // Dynamic projection in unmigrated state derives canonical REPAYMENT event
    const events = store.getCanonicalEvents();
    const repaymentEvt = events.find((e) => e.kind === EVENT_KINDS.REPAYMENT);
    assert.ok(repaymentEvt, 'Must project a canonical REPAYMENT event');
    assert.equal(repaymentEvt.fromPartyId, PARTY_USER);
    assert.notEqual(repaymentEvt.toPartyId, PARTY_USER);
    assert.equal(repaymentEvt.amountPaise, 30000);
    assert.equal(repaymentEvt.metadata.direction, 'outflow');

    // Expected balance is -₹1,000 (NOT -₹1,600!)
    assert.equal(store.computeBalances()['Diya Patel'], -1000);

    // After migration execution, balance remains strictly -₹1,000
    const migRes = store.executeMigration();
    assert.equal(migRes.success, true);
    assert.equal(store.computeBalances()['Diya Patel'], -1000);
  });

  test('12. Test C: Ambiguous legacy settlement without direction remains LEGACY_UNCLASSIFIED', () => {
    const legacyState = {
      people: [{ id: 'p_diya', name: 'Diya Patel' }],
      transactions: [
        {
          id: 'txn_ambig',
          type: 'settle',
          person: 'Diya Patel',
          amount: 450,
          description: 'Historical ambiguous settlement',
          date: '2026-10-14',
          createdAt: 1791999900000,
        },
      ],
    };

    const res = migrateV1ToV2(legacyState, { idGenerator: () => 'evt_1' });
    assert.equal(res.success, true);

    const migratedEvt = res.migratedState.transactions.find((t) => t.id === 'txn_ambig');
    assert.ok(migratedEvt);
    assert.equal(migratedEvt.kind, EVENT_KINDS.LEGACY_UNCLASSIFIED);
    assert.equal(migratedEvt.legacyType, 'settle');
    assert.equal(migratedEvt.reviewRequired, true);
    assert.equal(migratedEvt.metadata.directionUnverified, true);
    assert.equal(migratedEvt.amountPaise, 45000);

    // Must be flagged in review items
    assert.equal(res.reviewItems.unverifiedSettlements.length, 1);
    assert.equal(res.reviewItems.unverifiedSettlements[0].eventId, 'txn_ambig');
    assert.equal(res.reviewItems.unverifiedSettlements[0].amountPaise, 45000);
  });

  test('13. Test D: All existing fixture balances remain identical to QA expectations', () => {
    const fixtureRaw = fs.readFileSync(new URL('../../test-fixtures/pocketledger-v1-demo.json', import.meta.url), 'utf8');
    const storage = createMockStorage();
    const store = new StoreCore({ storage });

    store.importData(fixtureRaw);
    assert.equal(store.isV2(), false, 'Imported fixture starts in unmigrated state');

    // Expected QA fixture balances in unmigrated state
    const balancesV1 = store.computeBalances();
    assert.equal(balancesV1['Aarav Sharma'], 2250);
    assert.equal(balancesV1['Diya Patel'], -900);
    assert.equal(balancesV1['Rohan Verma'], 1200);
    assert.equal(balancesV1['Ananya Iyer'], 2200);

    // Expected QA fixture balances after formal migration execution
    const migRes = store.executeMigration();
    assert.equal(migRes.success, true);
    assert.equal(store.isV2(), true);

    const balancesV2 = store.computeBalances();
    assert.equal(balancesV2['Aarav Sharma'], 2250);
    assert.equal(balancesV2['Diya Patel'], -900);
    assert.equal(balancesV2['Rohan Verma'], 1200);
    assert.equal(balancesV2['Ananya Iyer'], 2200);
  });

  test('14. Test E: Monthly personal spending is unaffected by either repayment direction', () => {
    const storage = createMockStorage();
    const store = new StoreCore({ storage });

    store.addPerson('Aarav Sharma');
    store.addPerson('Diya Patel');

    // 1. Record personal expense of ₹300
    store.addTransaction({
      type: 'personal_expense',
      amount: 300,
      paidBy: 'user',
      category: 'Food',
      description: 'Groceries',
      date: '2026-11-05',
    });

    // Nov 2026 personal spending must be exactly ₹300
    const spendInitial = computeMonthlyPersonalSpending(store.getCanonicalEvents(), 2026, 11);
    assert.equal(spendInitial, 30000);
    assert.equal(store.computeMonthlyAnalytics(2026, 10).totalSpent, 300);

    // 2. Add an inflow repayment of ₹500 from Aarav Sharma
    store.addTransaction({
      type: 'settle',
      action: 'repayment',
      person: 'Aarav Sharma',
      amount: 500,
      direction: 'inflow',
      date: '2026-11-08',
      paymentMethod: 'CASH',
    });

    // Nov 2026 personal spending remains exactly ₹300
    const spendAfterInflow = computeMonthlyPersonalSpending(store.getCanonicalEvents(), 2026, 11);
    assert.equal(spendAfterInflow, 30000, 'Inflow repayment must not alter personal spending');
    assert.equal(store.computeMonthlyAnalytics(2026, 10).totalSpent, 300);

    // 3. Add an outflow repayment of ₹300 to Diya Patel
    store.addTransaction({
      type: 'settle',
      action: 'repayment',
      person: 'Diya Patel',
      amount: 300,
      direction: 'outflow',
      date: '2026-11-10',
      paymentMethod: 'CASH',
    });

    // Nov 2026 personal spending remains exactly ₹300
    const spendAfterOutflow = computeMonthlyPersonalSpending(store.getCanonicalEvents(), 2026, 11);
    assert.equal(spendAfterOutflow, 30000, 'Outflow repayment must not alter personal spending');
    assert.equal(store.computeMonthlyAnalytics(2026, 10).totalSpent, 300);
  });

  test('15. Test F: Full test sequence: Fixture -> Borrow ₹400 -> Repay ₹300 -> Parity across all contacts', () => {
    const fixtureRaw = fs.readFileSync(new URL('../../test-fixtures/pocketledger-v1-demo.json', import.meta.url), 'utf8');
    const storage = createMockStorage();
    const store = new StoreCore({ storage });

    // Step 1: Load fixture with Diya Patel at -₹900
    store.importData(fixtureRaw);
    assert.equal(store.computeBalances()['Diya Patel'], -900);
    assert.equal(store.computeBalances()['Aarav Sharma'], 2250);
    assert.equal(store.computeBalances()['Rohan Verma'], 1200);
    assert.equal(store.computeBalances()['Ananya Iyer'], 2200);

    // Step 2: Borrow ₹400 from Diya (balance becomes -₹1,300)
    const borrowRes = store.addTransaction({
      type: 'borrow',
      person: 'Diya Patel',
      amount: 400,
      description: 'Emergency cab fare',
      date: '2026-11-09',
    });
    assert.equal(borrowRes.success, true);
    assert.equal(store.computeBalances()['Diya Patel'], -1300);

    // Step 3: Repay Diya ₹300 (balance becomes -₹1,000)
    const repayRes = store.addTransaction({
      type: 'settle',
      action: 'repayment',
      person: 'Diya Patel',
      amount: 300,
      direction: 'outflow',
      description: 'Repayment sent',
      date: '2026-11-10',
      paymentMethod: 'CASH',
    });
    assert.equal(repayRes.success, true);

    // Step 4: Verify balances across all contacts in unmigrated state
    const balancesAfter = store.computeBalances();
    assert.equal(balancesAfter['Diya Patel'], -1000, 'Diya Patel balance must be -₹1,000');
    assert.equal(balancesAfter['Aarav Sharma'], 2250, 'Aarav Sharma balance must remain +₹2,250');
    assert.equal(balancesAfter['Rohan Verma'], 1200, 'Rohan Verma balance must remain +₹1,200');
    assert.equal(balancesAfter['Ananya Iyer'], 2200, 'Ananya Iyer balance must remain +₹2,200');

    // Step 5: Verify migration execution preserves these exact balances and canonical event structure
    const migRes = store.executeMigration();
    assert.equal(migRes.success, true);

    const balancesFinal = store.computeBalances();
    assert.equal(balancesFinal['Diya Patel'], -1000);
    assert.equal(balancesFinal['Aarav Sharma'], 2250);
    assert.equal(balancesFinal['Rohan Verma'], 1200);
    assert.equal(balancesFinal['Ananya Iyer'], 2200);

    // Verify canonical repayment event in v2 storage
    const v2Events = store.getCanonicalEvents();
    const diyaRepayment = v2Events.find(
      (e) => e.kind === EVENT_KINDS.REPAYMENT && e.amountPaise === 30000
    );
    assert.ok(diyaRepayment);
    assert.equal(diyaRepayment.fromPartyId, PARTY_USER);
    const diyaPerson = store.state.people.find((p) => p.name === 'Diya Patel');
    assert.equal(diyaRepayment.toPartyId, diyaPerson.id);
  });

  test('16. Test G: Zero-balance settlement rejection prevents invalid repayments', () => {
    const storage = createMockStorage();
    const store = new StoreCore({ storage });

    store.addPerson('Vikram Rao');
    assert.equal(store.computeBalances()['Vikram Rao'] || 0, 0);

    // Attempting to record a repayment for a contact whose balance is ₹0
    const zeroRes = store.addTransaction({
      type: 'settle',
      action: 'repayment',
      person: 'Vikram Rao',
      amount: 100,
      description: 'Zero balance repayment',
      date: '2026-11-10',
    });

    assert.equal(zeroRes.success, false);
    assert.equal(zeroRes.error, 'Cannot record settlement: balance is already zero');
    assert.equal(store.state.transactions.length, 0);
    assert.equal(store.computeBalances()['Vikram Rao'] || 0, 0);
  });

  test('17. Test H: Pending migrated alarms visibility in attention items & state and resolution', () => {
    const storage = createMockStorage();
    const store = new StoreCore({ storage });

    store.addPerson('Ananya Iyer');

    // Add a pending alarm in canonical v2
    store.addPendingAlarm({
      personName: 'Ananya Iyer',
      amount: 500,
      direction: 'gave',
    });

    // Check getState and attention items
    const stateAlarms = store.getState().pendingAlarms;
    assert.equal(stateAlarms.length, 1);
    assert.equal(stateAlarms[0].personName, 'Ananya Iyer');
    assert.equal(stateAlarms[0].amount, 500);

    const attention = store.getAttentionItems();
    assert.equal(attention.migratedAlarms.length, 1);
    assert.equal(attention.migratedAlarms[0].personName, 'Ananya Iyer');

    // Resolving the alarm removes it from pending review
    const alarmId = stateAlarms[0].id;
    store.resolvePendingAlarm(alarmId, true);

    assert.equal(store.getState().pendingAlarms.length, 0);
    assert.equal(store.getAttentionItems().migratedAlarms.length, 0);
  });
});
