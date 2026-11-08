/**
 * PocketLedger Financial Calculation Engine
 *
 * Side-effect-free, pure domain module for canonical accounting,
 * chronological balance derivation, equal integer-paise split distribution,
 * expense conservation validation, and historical repayment conflict detection.
 */

// ─────────────────────────────────────────────────────────────
// CONSTANTS & CONSTRAINTS
// ─────────────────────────────────────────────────────────────

export const PARTY_USER = 'USER';

/**
 * Maximum monetary amount supported (100 Crore INR = 10^9 INR = 10^11 Paise).
 * Well within Number.MAX_SAFE_INTEGER (9 * 10^15).
 */
export const MAX_AMOUNT_PAISE = 100_000_000_000;

export const EVENT_KINDS = Object.freeze({
  EXPENSE: 'EXPENSE',
  TRANSFER: 'TRANSFER',
  REPAYMENT: 'REPAYMENT',
  ADJUSTMENT: 'ADJUSTMENT',
  LEGACY_UNCLASSIFIED: 'LEGACY_UNCLASSIFIED',
});

export const PAYMENT_METHODS = Object.freeze({
  UPI: 'UPI',
  CASH: 'CASH',
  OTHER: 'OTHER',
});

// ─────────────────────────────────────────────────────────────
// VALIDATION UTILITIES
// ─────────────────────────────────────────────────────────────

/**
 * Checks if a value is a strictly positive integer within the supported paise range.
 */
export function isPositiveInteger(value) {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= MAX_AMOUNT_PAISE
  );
}

/**
 * Checks if a value is a non-negative integer within the supported paise range.
 */
export function isNonNegativeInteger(value) {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_AMOUNT_PAISE
  );
}

/**
 * Validates 'YYYY-MM-DD' calendar date strings.
 */
export function isValidDateString(dateStr) {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return false;
  }
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * Validates that an expense's allocations and userShare sum exactly to totalAmount.
 * Invariant: userSharePaise + sum(allocations[i].amountPaise) === totalAmountPaise
 */
export function validateExpenseConservation(expense) {
  if (!expense || typeof expense !== 'object') {
    return { isValid: false, sumPaise: 0, expectedTotalPaise: 0, diffPaise: 0, reason: 'Expense must be an object' };
  }

  const expectedTotalPaise = expense.totalAmountPaise;
  const userSharePaise = expense.userSharePaise;
  const allocations = Array.isArray(expense.allocations) ? expense.allocations : [];

  if (!isPositiveInteger(expectedTotalPaise)) {
    return { isValid: false, sumPaise: 0, expectedTotalPaise: 0, diffPaise: 0, reason: 'totalAmountPaise must be a positive integer' };
  }
  if (!isNonNegativeInteger(userSharePaise)) {
    return { isValid: false, sumPaise: 0, expectedTotalPaise, diffPaise: 0, reason: 'userSharePaise must be a non-negative integer' };
  }

  let allocationsSum = 0;
  for (let i = 0; i < allocations.length; i++) {
    const alloc = allocations[i];
    if (!alloc || !isNonNegativeInteger(alloc.amountPaise)) {
      return { isValid: false, sumPaise: 0, expectedTotalPaise, diffPaise: 0, reason: `Allocation at index ${i} has invalid amountPaise` };
    }
    allocationsSum += alloc.amountPaise;
  }

  const sumPaise = userSharePaise + allocationsSum;
  const diffPaise = sumPaise - expectedTotalPaise;

  return {
    isValid: sumPaise === expectedTotalPaise,
    sumPaise,
    expectedTotalPaise,
    diffPaise,
    reason: sumPaise === expectedTotalPaise ? null : `Sum (${sumPaise}p) does not match totalAmountPaise (${expectedTotalPaise}p)`,
  };
}

/**
 * Validates the structural, typing, and financial constraints of any canonical event.
 * Returns { isValid: boolean, error?: string }
 */
export function validateEvent(event) {
  if (!event || typeof event !== 'object') {
    return { isValid: false, error: 'Event must be a non-null object' };
  }

  if (typeof event.id !== 'string' || !event.id.trim()) {
    return { isValid: false, error: 'Event requires a non-empty string id' };
  }

  if (!isValidDateString(event.date)) {
    return { isValid: false, error: `Invalid date format '${event.date}'; expected YYYY-MM-DD` };
  }

  if (typeof event.createdAt !== 'number' || !Number.isFinite(event.createdAt)) {
    return { isValid: false, error: 'Event requires a finite numeric createdAt timestamp' };
  }

  switch (event.kind) {
    case EVENT_KINDS.EXPENSE: {
      if (typeof event.payerId !== 'string' || !event.payerId.trim()) {
        return { isValid: false, error: 'Expense requires a non-empty string payerId' };
      }
      if (!Array.isArray(event.allocations)) {
        return { isValid: false, error: 'Expense requires an allocations array' };
      }
      const seenPersonIds = new Set();
      for (let i = 0; i < event.allocations.length; i++) {
        const alloc = event.allocations[i];
        if (!alloc || typeof alloc !== 'object') {
          return { isValid: false, error: `Expense allocation at index ${i} must be an object` };
        }
        if (typeof alloc.personId !== 'string' || !alloc.personId.trim()) {
          return { isValid: false, error: `Expense allocation at index ${i} requires a non-empty string personId` };
        }
        if (alloc.personId === PARTY_USER) {
          return { isValid: false, error: `Expense allocation cannot contain PARTY_USER ('${PARTY_USER}'); use userSharePaise instead` };
        }
        if (seenPersonIds.has(alloc.personId)) {
          return { isValid: false, error: `Duplicate allocation for personId '${alloc.personId}' in expense` };
        }
        seenPersonIds.add(alloc.personId);
      }
      const conservation = validateExpenseConservation(event);
      if (!conservation.isValid) {
        return { isValid: false, error: `Expense conservation violation: ${conservation.reason}` };
      }
      return { isValid: true };
    }

    case EVENT_KINDS.TRANSFER:
    case EVENT_KINDS.REPAYMENT:
    case EVENT_KINDS.ADJUSTMENT: {
      if (typeof event.fromPartyId !== 'string' || !event.fromPartyId.trim()) {
        return { isValid: false, error: `${event.kind} requires a non-empty fromPartyId` };
      }
      if (typeof event.toPartyId !== 'string' || !event.toPartyId.trim()) {
        return { isValid: false, error: `${event.kind} requires a non-empty toPartyId` };
      }
      if (event.fromPartyId === event.toPartyId) {
        return { isValid: false, error: `${event.kind} cannot have identical fromPartyId and toPartyId` };
      }
      if (event.fromPartyId !== PARTY_USER && event.toPartyId !== PARTY_USER) {
        return { isValid: false, error: `${event.kind} must involve PARTY_USER as either fromPartyId or toPartyId` };
      }
      if (!isPositiveInteger(event.amountPaise)) {
        return { isValid: false, error: `${event.kind} requires a positive integer amountPaise` };
      }
      return { isValid: true };
    }

    case EVENT_KINDS.LEGACY_UNCLASSIFIED: {
      if (!['give', 'take', 'settle'].includes(event.legacyType)) {
        return { isValid: false, error: `Invalid legacyType '${event.legacyType}'` };
      }
      if (typeof event.personId !== 'string' || !event.personId.trim()) {
        return { isValid: false, error: 'LEGACY_UNCLASSIFIED requires a non-empty personId' };
      }
      if (!isPositiveInteger(event.amountPaise)) {
        return { isValid: false, error: 'LEGACY_UNCLASSIFIED requires a positive integer amountPaise' };
      }
      return { isValid: true };
    }

    default:
      return { isValid: false, error: `Unknown event kind '${event.kind}'` };
  }
}

// ─────────────────────────────────────────────────────────────
// MONETARY ALLOCATION / EXACT INTEGER-PAISE SPLITTING
// ─────────────────────────────────────────────────────────────

/**
 * Evenly divides an integer total amount in paise across N participants.
 * Deterministic remainder rule: Quotient q = floor(T / N), remainder r = T % N.
 * The first r participants receive q + 1 paise; the remaining receive q paise.
 * Invariant: sum(shares) === totalAmountPaise
 */
export function allocateEqualShares(totalAmountPaise, participantCount) {
  if (!isPositiveInteger(totalAmountPaise)) {
    throw new TypeError(`totalAmountPaise must be a positive integer, got ${totalAmountPaise}`);
  }
  if (!Number.isInteger(participantCount) || participantCount <= 0) {
    throw new TypeError(`participantCount must be a positive integer, got ${participantCount}`);
  }

  const baseQuotient = Math.floor(totalAmountPaise / participantCount);
  const remainder = totalAmountPaise % participantCount;

  const shares = new Array(participantCount);
  for (let i = 0; i < participantCount; i++) {
    shares[i] = i < remainder ? baseQuotient + 1 : baseQuotient;
  }

  return shares;
}

/**
 * Creates a canonical EXPENSE event with exact integer-paise equal allocations.
 * By convention, the payer receives the first share (including remainder paise if any).
 */
export function createEqualSplitExpense({
  id,
  date,
  createdAt = Date.now(),
  description = '',
  category = 'Other',
  paymentMethod = PAYMENT_METHODS.CASH,
  totalAmountPaise,
  payerId,
  counterpartyPersonIds = [],
}) {
  const uniqueCounterparties = Array.from(new Set(counterpartyPersonIds.filter(Boolean)));
  const totalParticipants = uniqueCounterparties.length + 1; // Counterparties + User
  const shares = allocateEqualShares(totalAmountPaise, totalParticipants);

  let userSharePaise = 0;
  const allocations = [];

  if (payerId === PARTY_USER) {
    // User is payer: gets first share (includes remainder paise)
    userSharePaise = shares[0];
    for (let i = 0; i < uniqueCounterparties.length; i++) {
      allocations.push({
        personId: uniqueCounterparties[i],
        amountPaise: shares[i + 1],
      });
    }
  } else {
    // Counterparty is payer: that counterparty gets first share
    const otherCounterparties = uniqueCounterparties.filter((p) => p !== payerId);
    // Sort counterparties for determinism
    otherCounterparties.sort();

    // Payer counterparty gets share 0
    allocations.push({
      personId: payerId,
      amountPaise: shares[0],
    });

    // User gets share 1
    userSharePaise = shares[1];

    // Remaining counterparties get subsequent shares
    for (let i = 0; i < otherCounterparties.length; i++) {
      allocations.push({
        personId: otherCounterparties[i],
        amountPaise: shares[i + 2],
      });
    }
  }

  const event = {
    id,
    kind: EVENT_KINDS.EXPENSE,
    date,
    createdAt,
    description,
    category,
    paymentMethod,
    payerId,
    totalAmountPaise,
    userSharePaise,
    allocations,
  };

  const validation = validateEvent(event);
  if (!validation.isValid) {
    throw new Error(`Generated invalid split expense: ${validation.error}`);
  }

  return event;
}

// ─────────────────────────────────────────────────────────────
// CHRONOLOGICAL EVENT SORTING
// ─────────────────────────────────────────────────────────────

/**
 * Pure function that sorts events chronologically:
 * 1. Calendar date ascending ('YYYY-MM-DD')
 * 2. createdAt timestamp ascending
 * 3. id localeCompare ascending (deterministic tie-breaker)
 */
export function sortEventsChronologically(events) {
  if (!Array.isArray(events)) return [];
  return [...events].sort((a, b) => {
    if (a.date !== b.date) {
      return a.date.localeCompare(b.date);
    }
    if (a.createdAt !== b.createdAt) {
      return a.createdAt - b.createdAt;
    }
    return String(a.id).localeCompare(String(b.id));
  });
}

// ─────────────────────────────────────────────────────────────
// BALANCE DERIVATION (DOMINO ENGINE)
// ─────────────────────────────────────────────────────────────

/**
 * Computes the delta in balance for a specific counterparty personId resulting from an event.
 * Sign convention:
 * + positive: person owes user
 * - negative: user owes person
 * 0: no balance change
 */
export function computeEventBalanceDelta(event, personId) {
  if (!event || !personId || personId === PARTY_USER) return 0;

  switch (event.kind) {
    case EVENT_KINDS.EXPENSE: {
      if (event.payerId === PARTY_USER) {
        // User paid: check if personId is allocated
        if (Array.isArray(event.allocations)) {
          const match = event.allocations.find((a) => a.personId === personId);
          return match ? match.amountPaise : 0;
        }
        return 0;
      }
      if (event.payerId === personId) {
        // Counterparty paid: user owes them the user's consumed share
        return -event.userSharePaise;
      }
      // Another third party paid: user-centric balance holds no claim
      return 0;
    }

    case EVENT_KINDS.TRANSFER: {
      // Lending: User -> Person (Person owes user)
      if (event.fromPartyId === PARTY_USER && event.toPartyId === personId) {
        return event.amountPaise;
      }
      // Borrowing: Person -> User (User owes person)
      if (event.fromPartyId === personId && event.toPartyId === PARTY_USER) {
        return -event.amountPaise;
      }
      return 0;
    }

    case EVENT_KINDS.REPAYMENT: {
      // Inflow Repayment: Person -> User (Reduces what person owes user)
      if (event.fromPartyId === personId && event.toPartyId === PARTY_USER) {
        return -event.amountPaise;
      }
      // Outflow Repayment: User -> Person (Reduces what user owes person)
      if (event.fromPartyId === PARTY_USER && event.toPartyId === personId) {
        return event.amountPaise;
      }
      return 0;
    }

    case EVENT_KINDS.ADJUSTMENT: {
      if (event.fromPartyId === PARTY_USER && event.toPartyId === personId) {
        return event.amountPaise;
      }
      if (event.fromPartyId === personId && event.toPartyId === PARTY_USER) {
        return -event.amountPaise;
      }
      return 0;
    }

    case EVENT_KINDS.LEGACY_UNCLASSIFIED: {
      if (event.personId === personId) {
        if (event.legacyType === 'give') return event.amountPaise;
        if (event.legacyType === 'take') return -event.amountPaise;
        if (event.legacyType === 'settle') return -event.amountPaise;
      }
      return 0;
    }

    default:
      return 0;
  }
}

/**
 * Computes a single counterparty's net balance in integer paise from all ledger events.
 */
export function computePersonBalance(events, personId) {
  if (!Array.isArray(events) || !personId) return 0;
  let balance = 0;
  for (let i = 0; i < events.length; i++) {
    balance += computeEventBalanceDelta(events[i], personId);
  }
  return balance;
}

/**
 * Computes net balances for all counterparties appearing in the given events.
 * Returns { [personId]: balancePaise }
 */
export function computeAllBalances(events) {
  if (!Array.isArray(events)) return {};

  const counterparties = new Set();
  for (const e of events) {
    if (!e) continue;
    if (e.payerId && e.payerId !== PARTY_USER) counterparties.add(e.payerId);
    if (e.fromPartyId && e.fromPartyId !== PARTY_USER) counterparties.add(e.fromPartyId);
    if (e.toPartyId && e.toPartyId !== PARTY_USER) counterparties.add(e.toPartyId);
    if (e.personId && e.personId !== PARTY_USER) counterparties.add(e.personId);
    if (Array.isArray(e.allocations)) {
      for (const a of e.allocations) {
        if (a.personId && a.personId !== PARTY_USER) counterparties.add(a.personId);
      }
    }
  }

  const balances = {};
  for (const personId of counterparties) {
    balances[personId] = computePersonBalance(events, personId);
  }
  return balances;
}

// ─────────────────────────────────────────────────────────────
// MONTHLY PERSONAL CONSUMPTION SPENDING
// ─────────────────────────────────────────────────────────────

/**
 * Computes strictly personal consumption spending in integer paise for a given calendar year and month (1-12).
 * Only EXPENSE userSharePaise is counted.
 * Transfers, Repayments, Adjustments, and Unclassified Legacy events are isolated and have zero impact.
 */
export function computeMonthlyPersonalSpending(events, year, month) {
  if (!Array.isArray(events) || !Number.isInteger(year) || !Number.isInteger(month)) return 0;

  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
  let totalSpentPaise = 0;

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e && e.kind === EVENT_KINDS.EXPENSE && typeof e.date === 'string' && e.date.startsWith(monthPrefix)) {
      totalSpentPaise += e.userSharePaise || 0;
    }
  }

  return totalSpentPaise;
}

// ─────────────────────────────────────────────────────────────
// CHRONOLOGICAL REPAYMENT & MUTATION VALIDATION
// ─────────────────────────────────────────────────────────────

/**
 * Analyzes an ordered sequence of events and validates that no historical repayment
 * exceeds the outstanding balance at that specific point in time.
 *
 * Inflow repayment (Person -> User): Requires running balance R_P > 0 and amount <= R_P.
 * Outflow repayment (User -> Person): Requires running balance R_P < 0 and amount <= |R_P|.
 */
export function validateChronologicalRepayments(events) {
  const sorted = sortEventsChronologically(events);
  const runningBalances = {};
  const conflicts = [];

  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i];

    if (e.kind === EVENT_KINDS.REPAYMENT) {
      if (e.fromPartyId && e.fromPartyId !== PARTY_USER && e.toPartyId === PARTY_USER) {
        // Inflow repayment received from counterparty
        const personId = e.fromPartyId;
        const currentDebt = runningBalances[personId] || 0;

        if (currentDebt <= 0) {
          conflicts.push({
            eventId: e.id,
            personId,
            direction: 'INFLOW',
            repaymentAmountPaise: e.amountPaise,
            availableDebtPaise: Math.max(0, currentDebt),
            reason: `Inflow repayment of ${e.amountPaise}p received when counterparty debt is ${currentDebt}p (not in debt)`,
          });
        } else if (e.amountPaise > currentDebt) {
          conflicts.push({
            eventId: e.id,
            personId,
            direction: 'INFLOW',
            repaymentAmountPaise: e.amountPaise,
            availableDebtPaise: currentDebt,
            reason: `Inflow repayment of ${e.amountPaise}p exceeds counterparty debt of ${currentDebt}p`,
          });
        }
      } else if (e.fromPartyId === PARTY_USER && e.toPartyId && e.toPartyId !== PARTY_USER) {
        // Outflow repayment sent to counterparty
        const personId = e.toPartyId;
        const currentDebt = runningBalances[personId] || 0; // Negative means user owes person

        if (currentDebt >= 0) {
          conflicts.push({
            eventId: e.id,
            personId,
            direction: 'OUTFLOW',
            repaymentAmountPaise: e.amountPaise,
            availableDebtPaise: Math.max(0, -currentDebt),
            reason: `Outflow repayment of ${e.amountPaise}p sent when user owes ${currentDebt}p (user does not owe person)`,
          });
        } else if (e.amountPaise > Math.abs(currentDebt)) {
          conflicts.push({
            eventId: e.id,
            personId,
            direction: 'OUTFLOW',
            repaymentAmountPaise: e.amountPaise,
            availableDebtPaise: Math.abs(currentDebt),
            reason: `Outflow repayment of ${e.amountPaise}p exceeds user debt of ${Math.abs(currentDebt)}p`,
          });
        }
      }
    }

    // Update running balance for all participants in this event
    const counterpartiesInEvent = new Set();
    if (e.payerId && e.payerId !== PARTY_USER) counterpartiesInEvent.add(e.payerId);
    if (e.fromPartyId && e.fromPartyId !== PARTY_USER) counterpartiesInEvent.add(e.fromPartyId);
    if (e.toPartyId && e.toPartyId !== PARTY_USER) counterpartiesInEvent.add(e.toPartyId);
    if (e.personId && e.personId !== PARTY_USER) counterpartiesInEvent.add(e.personId);
    if (Array.isArray(e.allocations)) {
      for (const a of e.allocations) {
        if (a.personId && a.personId !== PARTY_USER) counterpartiesInEvent.add(a.personId);
      }
    }

    for (const p of counterpartiesInEvent) {
      const delta = computeEventBalanceDelta(e, p);
      runningBalances[p] = (runningBalances[p] || 0) + delta;
    }
  }

  return {
    isValid: conflicts.length === 0,
    conflicts,
  };
}

/**
 * Validates whether editing, deleting, or inserting an event would cause any
 * past or future repayments to become invalid.
 */
export function validateEventMutation(existingEvents, mutation) {
  if (!Array.isArray(existingEvents) || !mutation || typeof mutation !== 'object') {
    return { canApply: false, conflicts: [], reason: 'Invalid parameters' };
  }

  let simulatedEvents;

  if (mutation.type === 'DELETE') {
    if (!mutation.targetEventId) {
      return { canApply: false, conflicts: [], reason: 'DELETE mutation requires targetEventId' };
    }
    simulatedEvents = existingEvents.filter((e) => e.id !== mutation.targetEventId);
  } else if (mutation.type === 'EDIT') {
    if (!mutation.targetEventId || !mutation.updatedEvent) {
      return { canApply: false, conflicts: [], reason: 'EDIT mutation requires targetEventId and updatedEvent' };
    }
    const eventValidation = validateEvent(mutation.updatedEvent);
    if (!eventValidation.isValid) {
      return { canApply: false, conflicts: [], reason: `Updated event is invalid: ${eventValidation.error}` };
    }
    simulatedEvents = existingEvents.map((e) => (e.id === mutation.targetEventId ? mutation.updatedEvent : e));
  } else if (mutation.type === 'INSERT') {
    if (!mutation.newEvent) {
      return { canApply: false, conflicts: [], reason: 'INSERT mutation requires newEvent' };
    }
    const eventValidation = validateEvent(mutation.newEvent);
    if (!eventValidation.isValid) {
      return { canApply: false, conflicts: [], reason: `New event is invalid: ${eventValidation.error}` };
    }
    simulatedEvents = [...existingEvents, mutation.newEvent];
  } else {
    return { canApply: false, conflicts: [], reason: `Unknown mutation type '${mutation.type}'` };
  }

  const check = validateChronologicalRepayments(simulatedEvents);
  return {
    canApply: check.isValid,
    conflicts: check.conflicts,
    reason: check.isValid ? null : `Mutation creates ${check.conflicts.length} chronological repayment conflict(s)`,
  };
}

