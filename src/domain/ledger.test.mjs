import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  PARTY_USER,
  EVENT_KINDS,
  MAX_AMOUNT_PAISE,
  allocateEqualShares,
  createEqualSplitExpense,
  validateExpenseConservation,
  validateEvent,
  sortEventsChronologically,
  computeEventBalanceDelta,
  computePersonBalance,
  computeAllBalances,
  computeMonthlyPersonalSpending,
  validateChronologicalRepayments,
  validateEventMutation,
} from './ledger.js';

describe('PocketLedger Financial Calculation Engine', () => {

  // 1. User-paid personal expense
  test('1. User-paid solo personal expense increases personal spending without affecting peer balances', () => {
    // User buys groceries for ₹500 (50,000 paise)
    const expense = {
      id: 'exp-1',
      kind: EVENT_KINDS.EXPENSE,
      date: '2026-11-01',
      createdAt: 1000,
      description: 'Solo groceries',
      payerId: PARTY_USER,
      totalAmountPaise: 50000,
      userSharePaise: 50000,
      allocations: [],
    };

    assert.equal(validateEvent(expense).isValid, true);
    assert.equal(computePersonBalance([expense], 'person-alice'), 0);
    assert.equal(computeMonthlyPersonalSpending([expense], 2026, 11), 50000);
  });

  // 2. Counterparty-paid personal expense
  test('2. Counterparty-paid personal expense increases personal spending and creates user liability', () => {
    // Sneha pays ₹800 (80,000 paise) for user's personal medicine
    const expense = {
      id: 'exp-2',
      kind: EVENT_KINDS.EXPENSE,
      date: '2026-11-02',
      createdAt: 2000,
      description: 'User medicine paid by Sneha',
      payerId: 'person-sneha',
      totalAmountPaise: 80000,
      userSharePaise: 80000,
      allocations: [{ personId: 'person-sneha', amountPaise: 0 }],
    };

    assert.equal(validateEvent(expense).isValid, true);
    // User owes Sneha ₹800 (-80,000 paise)
    assert.equal(computePersonBalance([expense], 'person-sneha'), -80000);
    // Personal spending is strictly user's consumption share
    assert.equal(computeMonthlyPersonalSpending([expense], 2026, 11), 80000);
  });

  // 3. User-paid shared expense
  test('3. User-paid shared expense increases spending by user share and creates receivables for others', () => {
    // User pays ₹1,500 (150,000 paise) dinner for User, Alice, and Bob (₹500 each)
    const expense = {
      id: 'exp-3',
      kind: EVENT_KINDS.EXPENSE,
      date: '2026-11-03',
      createdAt: 3000,
      description: 'Dinner at Social',
      payerId: PARTY_USER,
      totalAmountPaise: 150000,
      userSharePaise: 50000,
      allocations: [
        { personId: 'person-alice', amountPaise: 50000 },
        { personId: 'person-bob', amountPaise: 50000 },
      ],
    };

    assert.equal(validateEvent(expense).isValid, true);
    assert.equal(computeMonthlyPersonalSpending([expense], 2026, 11), 50000);
    assert.equal(computePersonBalance([expense], 'person-alice'), 50000);
    assert.equal(computePersonBalance([expense], 'person-bob'), 50000);
  });

  // 4. Counterparty-paid shared expense
  test('4. Counterparty-paid shared expense conserves total, increases user spending, owes payer, leaves third parties unchanged', () => {
    // Alice pays ₹1,500 (150,000 paise) dinner for Alice, Bob, and User (₹500 each)
    const expense = {
      id: 'exp-4',
      kind: EVENT_KINDS.EXPENSE,
      date: '2026-11-04',
      createdAt: 4000,
      description: 'Dinner paid by Alice',
      payerId: 'person-alice',
      totalAmountPaise: 150000,
      userSharePaise: 50000,
      allocations: [
        { personId: 'person-alice', amountPaise: 50000 },
        { personId: 'person-bob', amountPaise: 50000 },
      ],
    };

    // Validates full conservation: 50000 + 50000 + 50000 === 150000
    assert.equal(validateExpenseConservation(expense).isValid, true);
    assert.equal(validateEvent(expense).isValid, true);

    // User personal spending is +₹500
    assert.equal(computeMonthlyPersonalSpending([expense], 2026, 11), 50000);

    // User owes Alice ₹500
    assert.equal(computePersonBalance([expense], 'person-alice'), -50000);

    // User holds NO claim on Bob; Bob's balance with user remains 0
    assert.equal(computePersonBalance([expense], 'person-bob'), 0);
  });

  // 5. Lending
  test('5. Direct lending creates counterparty receivable with zero personal spending impact', () => {
    // User lends ₹2,000 (200,000 paise) cash to Rahul
    const loan = {
      id: 'transfer-1',
      kind: EVENT_KINDS.TRANSFER,
      date: '2026-11-05',
      createdAt: 5000,
      description: 'Loan to Rahul',
      fromPartyId: PARTY_USER,
      toPartyId: 'person-rahul',
      amountPaise: 200000,
    };

    assert.equal(validateEvent(loan).isValid, true);
    assert.equal(computePersonBalance([loan], 'person-rahul'), 200000);
    assert.equal(computeMonthlyPersonalSpending([loan], 2026, 11), 0);
  });

  // 6. Borrowing
  test('6. Direct borrowing creates liability with zero personal spending impact', () => {
    // User borrows ₹1,000 (100,000 paise) from Sneha
    const borrow = {
      id: 'transfer-2',
      kind: EVENT_KINDS.TRANSFER,
      date: '2026-11-06',
      createdAt: 6000,
      description: 'Borrowed from Sneha',
      fromPartyId: 'person-sneha',
      toPartyId: PARTY_USER,
      amountPaise: 100000,
    };

    assert.equal(validateEvent(borrow).isValid, true);
    assert.equal(computePersonBalance([borrow], 'person-sneha'), -100000);
    assert.equal(computeMonthlyPersonalSpending([borrow], 2026, 11), 0);
  });

  // 7. Full repayment
  test('7. Full repayment restores balance to zero in both directions', () => {
    // Inflow: Rahul owes ₹2,000, pays back ₹2,000
    const loan = {
      id: 'l-1',
      kind: EVENT_KINDS.TRANSFER,
      date: '2026-11-01',
      createdAt: 1000,
      fromPartyId: PARTY_USER,
      toPartyId: 'person-rahul',
      amountPaise: 200000,
    };
    const repaymentInflow = {
      id: 'r-1',
      kind: EVENT_KINDS.REPAYMENT,
      date: '2026-11-05',
      createdAt: 2000,
      fromPartyId: 'person-rahul',
      toPartyId: PARTY_USER,
      amountPaise: 200000,
    };

    assert.equal(computePersonBalance([loan, repaymentInflow], 'person-rahul'), 0);
    assert.equal(computeMonthlyPersonalSpending([loan, repaymentInflow], 2026, 11), 0);

    // Outflow: User owes Sneha ₹1,000, user pays back ₹1,000
    const borrow = {
      id: 'b-1',
      kind: EVENT_KINDS.TRANSFER,
      date: '2026-11-01',
      createdAt: 1000,
      fromPartyId: 'person-sneha',
      toPartyId: PARTY_USER,
      amountPaise: 100000,
    };
    const repaymentOutflow = {
      id: 'r-2',
      kind: EVENT_KINDS.REPAYMENT,
      date: '2026-11-05',
      createdAt: 2000,
      fromPartyId: PARTY_USER,
      toPartyId: 'person-sneha',
      amountPaise: 100000,
    };

    assert.equal(computePersonBalance([borrow, repaymentOutflow], 'person-sneha'), 0);
    assert.equal(computeMonthlyPersonalSpending([borrow, repaymentOutflow], 2026, 11), 0);
  });

  // 8. Partial repayment in both directions
  test('8. Partial repayments correctly decrement remaining debt in both directions', () => {
    // Inflow: Rahul owes ₹2,000, pays ₹750
    const loan = {
      id: 'l-2',
      kind: EVENT_KINDS.TRANSFER,
      date: '2026-11-01',
      createdAt: 1000,
      fromPartyId: PARTY_USER,
      toPartyId: 'person-rahul',
      amountPaise: 200000,
    };
    const partialInflow = {
      id: 'r-3',
      kind: EVENT_KINDS.REPAYMENT,
      date: '2026-11-03',
      createdAt: 2000,
      fromPartyId: 'person-rahul',
      toPartyId: PARTY_USER,
      amountPaise: 75000,
    };

    assert.equal(computePersonBalance([loan, partialInflow], 'person-rahul'), 125000);

    // Outflow: User owes Sneha ₹1,000, user pays ₹350
    const borrow = {
      id: 'b-2',
      kind: EVENT_KINDS.TRANSFER,
      date: '2026-11-01',
      createdAt: 1000,
      fromPartyId: 'person-sneha',
      toPartyId: PARTY_USER,
      amountPaise: 100000,
    };
    const partialOutflow = {
      id: 'r-4',
      kind: EVENT_KINDS.REPAYMENT,
      date: '2026-11-03',
      createdAt: 2000,
      fromPartyId: PARTY_USER,
      toPartyId: 'person-sneha',
      amountPaise: 35000,
    };

    assert.equal(computePersonBalance([borrow, partialOutflow], 'person-sneha'), -65000);
  });

  // 9. Overpayment
  test('9. Repayments exceeding available historical debt are detected and flagged as conflicts', () => {
    // Rahul owes ₹500, but repayment is recorded for ₹600
    const loan = {
      id: 'l-3',
      kind: EVENT_KINDS.TRANSFER,
      date: '2026-11-01',
      createdAt: 1000,
      fromPartyId: PARTY_USER,
      toPartyId: 'person-rahul',
      amountPaise: 50000,
    };
    const overRepayment = {
      id: 'r-5',
      kind: EVENT_KINDS.REPAYMENT,
      date: '2026-11-05',
      createdAt: 2000,
      fromPartyId: 'person-rahul',
      toPartyId: PARTY_USER,
      amountPaise: 60000,
    };

    const validation = validateChronologicalRepayments([loan, overRepayment]);
    assert.equal(validation.isValid, false);
    assert.equal(validation.conflicts.length, 1);
    assert.equal(validation.conflicts[0].direction, 'INFLOW');
    assert.equal(validation.conflicts[0].repaymentAmountPaise, 60000);
    assert.equal(validation.conflicts[0].availableDebtPaise, 50000);
  });

  // 10. Equal split with remainder paise
  test('10. Equal splitting divides integer paise exactly with deterministic remainder distribution', () => {
    // ₹100 (10,000 paise) split 3 ways: 10000 / 3 = 3333 r 1
    // First participant receives 3334, others receive 3333
    const shares3 = allocateEqualShares(10000, 3);
    assert.deepEqual(shares3, [3334, 3333, 3333]);
    assert.equal(shares3.reduce((a, b) => a + b, 0), 10000);

    // ₹100 (10,000 paise) split 7 ways: 10000 / 7 = 1428 r 4
    // First 4 get 1429, last 3 get 1428
    const shares7 = allocateEqualShares(10000, 7);
    assert.deepEqual(shares7, [1429, 1429, 1429, 1429, 1428, 1428, 1428]);
    assert.equal(shares7.reduce((a, b) => a + b, 0), 10000);

    // createEqualSplitExpense test
    const splitExp = createEqualSplitExpense({
      id: 'split-1',
      date: '2026-11-01',
      payerId: PARTY_USER,
      totalAmountPaise: 10000,
      counterpartyPersonIds: ['p-alice', 'p-bob'],
    });

    assert.equal(splitExp.userSharePaise, 3334);
    assert.equal(splitExp.allocations[0].amountPaise, 3333);
    assert.equal(splitExp.allocations[1].amountPaise, 3333);
    assert.equal(validateExpenseConservation(splitExp).isValid, true);
  });

  // 11. Invalid expense conservation
  test('11. Expense conservation validation rejects discrepancies', () => {
    const invalidExp = {
      id: 'bad-exp',
      kind: EVENT_KINDS.EXPENSE,
      date: '2026-11-01',
      createdAt: 1000,
      payerId: PARTY_USER,
      totalAmountPaise: 10000,
      userSharePaise: 5000,
      allocations: [{ personId: 'p-1', amountPaise: 4999 }], // 5000 + 4999 = 9999 !== 10000
    };

    const check = validateExpenseConservation(invalidExp);
    assert.equal(check.isValid, false);
    assert.equal(check.diffPaise, -1);
    assert.equal(validateEvent(invalidExp).isValid, false);
  });

  // 12. Unclassified legacy events
  test('12. Unclassified legacy events preserve historical balance effects without affecting personal spending', () => {
    const legacyGive = {
      id: 'leg-1',
      kind: EVENT_KINDS.LEGACY_UNCLASSIFIED,
      legacyType: 'give',
      personId: 'p-legacy',
      amountPaise: 45000, // ₹450
      date: '2025-05-10',
      createdAt: 100,
    };
    const legacyTake = {
      id: 'leg-2',
      kind: EVENT_KINDS.LEGACY_UNCLASSIFIED,
      legacyType: 'take',
      personId: 'p-legacy-2',
      amountPaise: 20000, // ₹200
      date: '2025-05-11',
      createdAt: 200,
    };
    const legacySettle = {
      id: 'leg-3',
      kind: EVENT_KINDS.LEGACY_UNCLASSIFIED,
      legacyType: 'settle',
      personId: 'p-legacy',
      amountPaise: 15000, // ₹150
      date: '2025-05-12',
      createdAt: 300,
    };

    assert.equal(computePersonBalance([legacyGive, legacySettle], 'p-legacy'), 30000); // 45000 - 15000
    assert.equal(computePersonBalance([legacyTake], 'p-legacy-2'), -20000);
    // Personal spending is strictly zero for legacy unclassified events
    assert.equal(computeMonthlyPersonalSpending([legacyGive, legacyTake, legacySettle], 2025, 5), 0);
  });

  // 13. Chronological repayment invalidation
  test('13. Repayment made before a loan occurred is flagged as chronologically invalid', () => {
    // Repayment on Nov 1, loan on Nov 5
    const repaymentPremature = {
      id: 'r-early',
      kind: EVENT_KINDS.REPAYMENT,
      date: '2026-11-01',
      createdAt: 1000,
      fromPartyId: 'p-rahul',
      toPartyId: PARTY_USER,
      amountPaise: 50000,
    };
    const loanLater = {
      id: 'l-later',
      kind: EVENT_KINDS.TRANSFER,
      date: '2026-11-05',
      createdAt: 2000,
      fromPartyId: PARTY_USER,
      toPartyId: 'p-rahul',
      amountPaise: 50000,
    };

    const result = validateChronologicalRepayments([repaymentPremature, loanLater]);
    assert.equal(result.isValid, false);
    assert.equal(result.conflicts[0].eventId, 'r-early');
  });

  // 14. Edit/deletion validation
  test('14. Editing or deleting historical loan that invalidates downstream repayment is rejected', () => {
    const loan = {
      id: 'orig-loan',
      kind: EVENT_KINDS.TRANSFER,
      date: '2026-11-01',
      createdAt: 1000,
      fromPartyId: PARTY_USER,
      toPartyId: 'p-rahul',
      amountPaise: 100000, // ₹1,000
    };
    const repayment = {
      id: 'rep-full',
      kind: EVENT_KINDS.REPAYMENT,
      date: '2026-11-05',
      createdAt: 2000,
      fromPartyId: 'p-rahul',
      toPartyId: PARTY_USER,
      amountPaise: 100000, // ₹1,000
    };

    const history = [loan, repayment];
    assert.equal(validateChronologicalRepayments(history).isValid, true);

    // Test 14a: Deleting the loan makes downstream repayment invalid
    const deleteCheck = validateEventMutation(history, {
      type: 'DELETE',
      targetEventId: 'orig-loan',
    });
    assert.equal(deleteCheck.canApply, false);
    assert.equal(deleteCheck.conflicts.length, 1);

    // Test 14b: Editing loan down to ₹400 makes ₹1,000 repayment invalid
    const editedLoan = { ...loan, amountPaise: 40000 };
    const editCheck = validateEventMutation(history, {
      type: 'EDIT',
      targetEventId: 'orig-loan',
      updatedEvent: editedLoan,
    });
    assert.equal(editCheck.canApply, false);
    assert.equal(editCheck.conflicts.length, 1);

    // Test 14c: Editing loan up to ₹1,500 is completely valid
    const increasedLoan = { ...loan, amountPaise: 150000 };
    const validEditCheck = validateEventMutation(history, {
      type: 'EDIT',
      targetEventId: 'orig-loan',
      updatedEvent: increasedLoan,
    });
    assert.equal(validEditCheck.canApply, true);
  });

  // 15. Unrelated person's balance remaining unchanged
  test('15. Events involving person A strictly produce zero balance delta for person B', () => {
    const loanToA = {
      id: 'l-a',
      kind: EVENT_KINDS.TRANSFER,
      date: '2026-11-01',
      createdAt: 1000,
      fromPartyId: PARTY_USER,
      toPartyId: 'p-alice',
      amountPaise: 50000,
    };
    const repaymentFromA = {
      id: 'r-a',
      kind: EVENT_KINDS.REPAYMENT,
      date: '2026-11-02',
      createdAt: 2000,
      fromPartyId: 'p-alice',
      toPartyId: PARTY_USER,
      amountPaise: 20000,
    };

    assert.equal(computeEventBalanceDelta(loanToA, 'p-bob'), 0);
    assert.equal(computeEventBalanceDelta(repaymentFromA, 'p-bob'), 0);
    assert.equal(computePersonBalance([loanToA, repaymentFromA], 'p-bob'), 0);
  });

  // 16. Deterministic sorting
  test('16. sortEventsChronologically correctly applies calendar date, createdAt, and ID tie-breaks', () => {
    const e1 = { id: 'evt-c', date: '2026-11-05', createdAt: 2000 };
    const e2 = { id: 'evt-a', date: '2026-11-01', createdAt: 3000 };
    const e3 = { id: 'evt-b', date: '2026-11-05', createdAt: 1000 };
    const e4 = { id: 'evt-d', date: '2026-11-05', createdAt: 2000 }; // Tie with e1 on date & createdAt, id tie-break: 'evt-c' < 'evt-d'

    const sorted = sortEventsChronologically([e1, e2, e3, e4]);
    assert.deepEqual(sorted.map((e) => e.id), ['evt-a', 'evt-b', 'evt-c', 'evt-d']);
  });

  // 17. Repeated calculations producing identical results (idempotence)
  test('17. Balance and spending calculations are pure, immutable, and idempotent', () => {
    const events = [
      {
        id: 'ev-1',
        kind: EVENT_KINDS.EXPENSE,
        date: '2026-11-01',
        createdAt: 1000,
        payerId: PARTY_USER,
        totalAmountPaise: 90000,
        userSharePaise: 30000,
        allocations: [{ personId: 'p-1', amountPaise: 60000 }],
      },
      {
        id: 'ev-2',
        kind: EVENT_KINDS.TRANSFER,
        date: '2026-11-02',
        createdAt: 2000,
        fromPartyId: PARTY_USER,
        toPartyId: 'p-2',
        amountPaise: 40000,
      },
    ];

    const snapshot = JSON.stringify(events);

    const run1Balances = computeAllBalances(events);
    const run1Spending = computeMonthlyPersonalSpending(events, 2026, 11);

    const run2Balances = computeAllBalances(events);
    const run2Spending = computeMonthlyPersonalSpending(events, 2026, 11);

    assert.deepEqual(run1Balances, run2Balances);
    assert.equal(run1Spending, run2Spending);
    // Verify inputs were not mutated
    assert.equal(JSON.stringify(events), snapshot);
  });

  // 18. Positive and negative adjustments
  test('18. Positive and negative adjustments shift counterparty balance without personal spending impact', () => {
    // Positive adjustment: User -> Person (person owes user ₹100 / 10,000 paise more)
    const posAdj = {
      id: 'adj-1',
      kind: EVENT_KINDS.ADJUSTMENT,
      date: '2026-11-01',
      createdAt: 1000,
      description: 'Manual positive adjustment',
      fromPartyId: PARTY_USER,
      toPartyId: 'p-1',
      amountPaise: 10000,
    };
    assert.equal(validateEvent(posAdj).isValid, true);
    assert.equal(computePersonBalance([posAdj], 'p-1'), 10000);
    assert.equal(computeMonthlyPersonalSpending([posAdj], 2026, 11), 0);

    // Negative adjustment: Person -> User (person owes user ₹40 / 4,000 paise less)
    const negAdj = {
      id: 'adj-2',
      kind: EVENT_KINDS.ADJUSTMENT,
      date: '2026-11-02',
      createdAt: 2000,
      description: 'Manual negative adjustment',
      fromPartyId: 'p-1',
      toPartyId: PARTY_USER,
      amountPaise: 4000,
    };
    assert.equal(validateEvent(negAdj).isValid, true);
    assert.equal(computePersonBalance([posAdj, negAdj], 'p-1'), 6000); // 10000 - 4000 = 6000
    assert.equal(computeMonthlyPersonalSpending([posAdj, negAdj], 2026, 11), 0);
  });

  // 19. Zero, negative and fractional-paise amounts
  test('19. Zero, negative, and fractional-paise amounts are rejected by validation and split allocation', () => {
    const baseTransfer = {
      id: 'tr-test',
      kind: EVENT_KINDS.TRANSFER,
      date: '2026-11-01',
      createdAt: 1000,
      fromPartyId: PARTY_USER,
      toPartyId: 'p-1',
    };

    // Zero amount
    const zeroTransfer = { ...baseTransfer, amountPaise: 0 };
    assert.equal(validateEvent(zeroTransfer).isValid, false);

    // Negative amount
    const negTransfer = { ...baseTransfer, amountPaise: -5000 };
    assert.equal(validateEvent(negTransfer).isValid, false);

    // Fractional paise
    const fracTransfer = { ...baseTransfer, amountPaise: 50.75 };
    assert.equal(validateEvent(fracTransfer).isValid, false);

    // Split allocation rejection
    assert.throws(() => allocateEqualShares(0, 2), TypeError);
    assert.throws(() => allocateEqualShares(-1000, 2), TypeError);
    assert.throws(() => allocateEqualShares(100.5, 2), TypeError);
    assert.throws(() => allocateEqualShares(1000, 0), TypeError);
    assert.throws(() => allocateEqualShares(1000, -2), TypeError);
    assert.throws(() => allocateEqualShares(1000, 2.5), TypeError);
  });

  // 20. NaN and Infinity
  test('20. NaN and Infinity are rejected by validation and split allocation', () => {
    const baseTransfer = {
      id: 'tr-nan',
      kind: EVENT_KINDS.TRANSFER,
      date: '2026-11-01',
      createdAt: 1000,
      fromPartyId: PARTY_USER,
      toPartyId: 'p-1',
    };

    assert.equal(validateEvent({ ...baseTransfer, amountPaise: NaN }).isValid, false);
    assert.equal(validateEvent({ ...baseTransfer, amountPaise: Infinity }).isValid, false);
    assert.equal(validateEvent({ ...baseTransfer, amountPaise: -Infinity }).isValid, false);

    assert.throws(() => allocateEqualShares(NaN, 2), TypeError);
    assert.throws(() => allocateEqualShares(Infinity, 2), TypeError);
    assert.throws(() => allocateEqualShares(1000, NaN), TypeError);
    assert.throws(() => allocateEqualShares(1000, Infinity), TypeError);
  });

  // 21. Amount exceeding MAX_AMOUNT_PAISE
  test('21. Amounts exceeding MAX_AMOUNT_PAISE are rejected', () => {
    const hugeTransfer = {
      id: 'tr-huge',
      kind: EVENT_KINDS.TRANSFER,
      date: '2026-11-01',
      createdAt: 1000,
      fromPartyId: PARTY_USER,
      toPartyId: 'p-1',
      amountPaise: MAX_AMOUNT_PAISE + 1,
    };
    assert.equal(validateEvent(hugeTransfer).isValid, false);
    assert.throws(() => allocateEqualShares(MAX_AMOUNT_PAISE + 1, 2), TypeError);

    // MAX_AMOUNT_PAISE exactly is valid
    const maxTransfer = { ...hugeTransfer, amountPaise: MAX_AMOUNT_PAISE };
    assert.equal(validateEvent(maxTransfer).isValid, true);
  });

  // 22. Invalid or missing party references
  test('22. Invalid, empty, identical, or non-user party references are rejected', () => {
    const baseTransfer = {
      id: 'tr-party',
      kind: EVENT_KINDS.TRANSFER,
      date: '2026-11-01',
      createdAt: 1000,
      amountPaise: 5000,
    };

    // Missing fromPartyId
    assert.equal(validateEvent({ ...baseTransfer, toPartyId: 'p-1' }).isValid, false);
    assert.equal(validateEvent({ ...baseTransfer, fromPartyId: '', toPartyId: 'p-1' }).isValid, false);
    assert.equal(validateEvent({ ...baseTransfer, fromPartyId: '   ', toPartyId: 'p-1' }).isValid, false);

    // Missing toPartyId
    assert.equal(validateEvent({ ...baseTransfer, fromPartyId: PARTY_USER }).isValid, false);
    assert.equal(validateEvent({ ...baseTransfer, fromPartyId: PARTY_USER, toPartyId: '' }).isValid, false);

    // Identical parties
    assert.equal(validateEvent({ ...baseTransfer, fromPartyId: PARTY_USER, toPartyId: PARTY_USER }).isValid, false);
    assert.equal(validateEvent({ ...baseTransfer, fromPartyId: 'p-1', toPartyId: 'p-1' }).isValid, false);

    // Neither party is user (third party to third party is disallowed in user-centric ledger)
    assert.equal(validateEvent({ ...baseTransfer, fromPartyId: 'p-alice', toPartyId: 'p-bob' }).isValid, false);
  });

  // 23. Invalid expense payer and duplicate allocations
  test('23. Invalid expense payer, non-array allocations, duplicate allocations, and USER in allocations are rejected', () => {
    const baseExpense = {
      id: 'exp-check',
      kind: EVENT_KINDS.EXPENSE,
      date: '2026-11-01',
      createdAt: 1000,
      totalAmountPaise: 10000,
      userSharePaise: 5000,
    };

    // Missing/empty payerId
    assert.equal(validateEvent({ ...baseExpense, payerId: '', allocations: [{ personId: 'p-1', amountPaise: 5000 }] }).isValid, false);
    assert.equal(validateEvent({ ...baseExpense, payerId: '   ', allocations: [{ personId: 'p-1', amountPaise: 5000 }] }).isValid, false);

    // Non-array allocations
    assert.equal(validateEvent({ ...baseExpense, payerId: PARTY_USER, allocations: null }).isValid, false);
    assert.equal(validateEvent({ ...baseExpense, payerId: PARTY_USER, allocations: 'not-array' }).isValid, false);

    // Allocations containing PARTY_USER
    assert.equal(validateEvent({
      ...baseExpense,
      payerId: PARTY_USER,
      allocations: [{ personId: PARTY_USER, amountPaise: 5000 }],
    }).isValid, false);

    // Duplicate allocations for same personId
    assert.equal(validateEvent({
      ...baseExpense,
      payerId: PARTY_USER,
      allocations: [
        { personId: 'p-alice', amountPaise: 2500 },
        { personId: 'p-alice', amountPaise: 2500 }, // Duplicate!
      ],
    }).isValid, false);

    // Empty personId inside allocation
    assert.equal(validateEvent({
      ...baseExpense,
      payerId: PARTY_USER,
      allocations: [{ personId: '', amountPaise: 5000 }],
    }).isValid, false);
  });

  // 24. Invalid repayment direction
  test('24. Repayments attempted in the wrong direction or when no debt exists are flagged as conflicts', () => {
    // Case A: User attempts outflow repayment to Alice when user does not owe Alice (debt is 0)
    const unowedOutflow = {
      id: 'rep-unowed-out',
      kind: EVENT_KINDS.REPAYMENT,
      date: '2026-11-01',
      createdAt: 1000,
      fromPartyId: PARTY_USER,
      toPartyId: 'p-alice',
      amountPaise: 5000,
    };
    const checkA = validateChronologicalRepayments([unowedOutflow]);
    assert.equal(checkA.isValid, false);
    assert.equal(checkA.conflicts.length, 1);
    assert.equal(checkA.conflicts[0].direction, 'OUTFLOW');

    // Case B: Alice owes user ₹500, but user attempts outflow repayment to Alice
    const loanToAlice = {
      id: 'loan-alice',
      kind: EVENT_KINDS.TRANSFER,
      date: '2026-11-01',
      createdAt: 1000,
      fromPartyId: PARTY_USER,
      toPartyId: 'p-alice',
      amountPaise: 50000,
    };
    const invalidOutflow = {
      id: 'rep-inv-out',
      kind: EVENT_KINDS.REPAYMENT,
      date: '2026-11-02',
      createdAt: 2000,
      fromPartyId: PARTY_USER,
      toPartyId: 'p-alice',
      amountPaise: 10000,
    };
    const checkB = validateChronologicalRepayments([loanToAlice, invalidOutflow]);
    assert.equal(checkB.isValid, false);
    assert.equal(checkB.conflicts[0].direction, 'OUTFLOW');

    // Case C: User owes Bob ₹500, but Bob attempts inflow repayment to user
    const borrowFromBob = {
      id: 'borrow-bob',
      kind: EVENT_KINDS.TRANSFER,
      date: '2026-11-01',
      createdAt: 1000,
      fromPartyId: 'p-bob',
      toPartyId: PARTY_USER,
      amountPaise: 50000,
    };
    const invalidInflow = {
      id: 'rep-inv-in',
      kind: EVENT_KINDS.REPAYMENT,
      date: '2026-11-02',
      createdAt: 2000,
      fromPartyId: 'p-bob',
      toPartyId: PARTY_USER,
      amountPaise: 10000,
    };
    const checkC = validateChronologicalRepayments([borrowFromBob, invalidInflow]);
    assert.equal(checkC.isValid, false);
    assert.equal(checkC.conflicts[0].direction, 'INFLOW');
  });

  // 25. Extensive repeated calculations without mutation across large mixed histories
  test('25. Extensive calculations across a multi-event history run repeatedly with zero mutations', () => {
    const complexHistory = [
      {
        id: 'c-1',
        kind: EVENT_KINDS.EXPENSE,
        date: '2026-11-01',
        createdAt: 100,
        payerId: PARTY_USER,
        totalAmountPaise: 30000,
        userSharePaise: 10000,
        allocations: [
          { personId: 'p-1', amountPaise: 10000 },
          { personId: 'p-2', amountPaise: 10000 },
        ],
      },
      {
        id: 'c-2',
        kind: EVENT_KINDS.TRANSFER,
        date: '2026-11-02',
        createdAt: 200,
        fromPartyId: PARTY_USER,
        toPartyId: 'p-1',
        amountPaise: 15000,
      },
      {
        id: 'c-3',
        kind: EVENT_KINDS.TRANSFER,
        date: '2026-11-03',
        createdAt: 300,
        fromPartyId: 'p-3',
        toPartyId: PARTY_USER,
        amountPaise: 40000,
      },
      {
        id: 'c-4',
        kind: EVENT_KINDS.REPAYMENT,
        date: '2026-11-04',
        createdAt: 400,
        fromPartyId: 'p-1',
        toPartyId: PARTY_USER,
        amountPaise: 20000, // p-1 owed 10000 + 15000 = 25000; pays 20000; remaining 5000
      },
      {
        id: 'c-5',
        kind: EVENT_KINDS.ADJUSTMENT,
        date: '2026-11-05',
        createdAt: 500,
        fromPartyId: PARTY_USER,
        toPartyId: 'p-2',
        amountPaise: 5000, // p-2 owed 10000; now owes 15000
      },
      {
        id: 'c-6',
        kind: EVENT_KINDS.REPAYMENT,
        date: '2026-11-06',
        createdAt: 600,
        fromPartyId: PARTY_USER,
        toPartyId: 'p-3',
        amountPaise: 25000, // user owed 40000; pays 25000; remaining debt 15000
      },
    ];

    const deepClone = JSON.stringify(complexHistory);

    for (let iteration = 0; iteration < 10; iteration++) {
      const allBalances = computeAllBalances(complexHistory);
      assert.equal(allBalances['p-1'], 5000);
      assert.equal(allBalances['p-2'], 15000);
      assert.equal(allBalances['p-3'], -15000);

      const spending = computeMonthlyPersonalSpending(complexHistory, 2026, 11);
      assert.equal(spending, 10000);

      const repaymentCheck = validateChronologicalRepayments(complexHistory);
      assert.equal(repaymentCheck.isValid, true);
    }

    assert.equal(JSON.stringify(complexHistory), deepClone);
  });
});

