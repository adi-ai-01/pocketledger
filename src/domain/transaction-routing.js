/**
 * PocketLedger Transaction Sheet Routing & Normalization Engine
 *
 * Pure domain module for sheet state resolution, action derivation,
 * transaction payload normalization (bridging legacy and canonical schemas),
 * and save operation dispatching.
 */

import { EVENT_KINDS, PARTY_USER } from './ledger.js';

/**
 * Resolves whether a sheet instance is in Edit Mode or Creation Mode.
 * By architectural rule, a sheet is only in edit mode when editTxn
 * represents an existing persisted transaction with a valid ID.
 */
export function isEditMode(editTxn) {
  return Boolean(editTxn && typeof editTxn === 'object' && editTxn.id);
}

/**
 * Normalizes an existing persisted transaction or canonical event into
 * standard fields required by UI forms.
 */
export function normalizeEditTxn(txn, people = []) {
  if (!isEditMode(txn)) return null;

  const kind = txn.kind || txn.rawKind || txn.rawEvent?.kind;
  let person = txn.person || '';
  let personId = txn.personId || '';
  let amount = txn.amount;
  let action = txn.action;

  if (kind) {
    if (kind === EVENT_KINDS.REPAYMENT) {
      action = action || 'repayment';
      const fromPartyId = txn.fromPartyId || txn.rawEvent?.fromPartyId;
      const toPartyId = txn.toPartyId || txn.rawEvent?.toPartyId;
      const isOutflow = fromPartyId === PARTY_USER;
      const targetId = isOutflow ? toPartyId : fromPartyId;
      personId = personId || targetId;
      const pObj = people.find((p) => p.id === targetId || p.name === targetId);
      person = person || pObj?.name || targetId;
      if (amount === undefined) {
        const amtPaise = txn.amountPaise ?? txn.rawEvent?.amountPaise;
        if (amtPaise !== undefined) amount = amtPaise / 100;
      }
    } else if (kind === EVENT_KINDS.TRANSFER) {
      const fromPartyId = txn.fromPartyId || txn.rawEvent?.fromPartyId;
      const toPartyId = txn.toPartyId || txn.rawEvent?.toPartyId;
      const isLend = fromPartyId === PARTY_USER;
      action = action || (isLend ? 'lend' : 'borrow');
      const targetId = isLend ? toPartyId : fromPartyId;
      personId = personId || targetId;
      const pObj = people.find((p) => p.id === targetId || p.name === targetId);
      person = person || pObj?.name || targetId;
      if (amount === undefined) {
        const amtPaise = txn.amountPaise ?? txn.rawEvent?.amountPaise;
        if (amtPaise !== undefined) amount = amtPaise / 100;
      }
    } else if (kind === EVENT_KINDS.EXPENSE) {
      const rawAllocations = txn.allocations || txn.rawEvent?.allocations;
      const rawSplits = txn.splits;
      const isShared = (Array.isArray(rawAllocations) && rawAllocations.length > 0) ||
                       (Array.isArray(rawSplits) && rawSplits.length > 0) ||
                       txn.type === 'split';
      action = action || (isShared ? 'shared_expense' : 'personal_expense');

      if (amount === undefined) {
        const totalPaise = txn.totalAmountPaise ?? txn.rawEvent?.totalAmountPaise;
        if (totalPaise !== undefined) amount = totalPaise / 100;
      }

      // Payer resolution
      const rawPayerId = txn.payerId || txn.rawEvent?.payerId;
      let payer = txn.payer;
      let payerId = txn.payerId;

      if (rawPayerId) {
        if (rawPayerId === PARTY_USER || rawPayerId === 'user') {
          payer = 'user';
          payerId = 'user';
        } else {
          const pObj = people.find((p) => p.id === rawPayerId || p.name === rawPayerId);
          payer = pObj?.name || rawPayerId;
          payerId = rawPayerId;
        }
      } else if (payer) {
        if (payer === 'user' || payer === PARTY_USER) {
          payer = 'user';
          payerId = 'user';
        } else {
          const pObj = people.find((p) => p.name.toLowerCase() === payer.toLowerCase() || p.id === payer);
          payer = pObj?.name || payer;
          payerId = pObj?.id || payer;
        }
      } else {
        payer = 'user';
        payerId = 'user';
      }

      let splits = [];
      if (isShared) {
        if (Array.isArray(rawSplits) && rawSplits.length > 0) {
          splits = rawSplits.map((s) => {
            const pObj = people.find((p) => (s.personId && p.id === s.personId) || p.name === s.person);
            return {
              personId: s.personId || pObj?.id || '',
              person: s.person || pObj?.name || '',
              amount: s.amount !== undefined ? s.amount : (s.amountPaise !== undefined ? s.amountPaise / 100 : 0),
            };
          });
        } else if (Array.isArray(rawAllocations) && rawAllocations.length > 0) {
          splits = rawAllocations.map((a) => {
            const pObj = people.find((p) => p.id === a.personId || p.name === a.personId);
            return {
              personId: a.personId,
              person: pObj?.name || a.personId,
              amount: a.amountPaise !== undefined ? a.amountPaise / 100 : (a.amount || 0),
            };
          });
        }
      }

      const rawUserSharePaise = txn.userSharePaise ?? txn.rawEvent?.userSharePaise;
      const userShare = txn.userShare !== undefined
        ? txn.userShare
        : (rawUserSharePaise !== undefined ? rawUserSharePaise / 100 : (txn.myShare !== undefined ? txn.myShare : 0));

      return {
        ...txn,
        action,
        amount,
        payer,
        payerId,
        payerName: payer === 'user' ? 'You' : payer,
        splits,
        allocations: splits,
        userShare,
        myShare: userShare,
      };
    } else if (kind === EVENT_KINDS.ADJUSTMENT) {
      const fromPartyId = txn.fromPartyId || txn.rawEvent?.fromPartyId;
      const toPartyId = txn.toPartyId || txn.rawEvent?.toPartyId;
      const isLend = fromPartyId === PARTY_USER;
      action = action || (isLend ? 'lend' : 'borrow');
      const targetId = isLend ? toPartyId : fromPartyId;
      personId = personId || targetId;
      const pObj = people.find((p) => p.id === targetId || p.name === targetId);
      person = person || pObj?.name || targetId;
      if (amount === undefined) {
        const amtPaise = txn.amountPaise ?? txn.rawEvent?.amountPaise;
        if (amtPaise !== undefined) amount = amtPaise / 100;
      }
    } else if (kind === EVENT_KINDS.LEGACY_UNCLASSIFIED) {
      const legacyType = txn.legacyType || txn.rawEvent?.legacyType;
      if (legacyType === 'give') action = action || (txn.personId ? 'lend' : 'personal_expense');
      else if (legacyType === 'take') action = action || 'borrow';
      else if (legacyType === 'settle') action = action || 'repayment';
      if (amount === undefined) {
        const amtPaise = txn.amountPaise ?? txn.rawEvent?.amountPaise;
        if (amtPaise !== undefined) amount = amtPaise / 100;
      }
    }
  }

  return {
    ...txn,
    action: action || txn.action,
    person,
    personId,
    amount,
  };
}

/**
 * Resolves the initial action view for TransactionSheet:
 * - When editing an existing persisted transaction with an ID, inspect persisted fields.
 * - When creating a new transaction, respect requested type or prefill action.
 */
export function resolveSheetAction(type, editTxn) {
  const isEdit = isEditMode(editTxn);

  if (isEdit) {
    // 1. Explicit action field
    if (editTxn.action) return editTxn.action;

    // 2. Canonical v2 event resolution
    if (editTxn.kind === EVENT_KINDS.REPAYMENT) {
      return 'repayment';
    }
    if (editTxn.kind === EVENT_KINDS.EXPENSE) {
      const hasAllocations = Array.isArray(editTxn.allocations) && editTxn.allocations.length > 0;
      const hasSplits = Array.isArray(editTxn.splits) && editTxn.splits.length > 0;
      return (hasAllocations || hasSplits) ? 'shared_expense' : 'personal_expense';
    }
    if (editTxn.kind === EVENT_KINDS.TRANSFER) {
      if (editTxn.fromPartyId === PARTY_USER) return 'lend';
      if (editTxn.toPartyId === PARTY_USER) return 'borrow';
      if (editTxn.type === 'give') return 'lend';
      if (editTxn.type === 'take') return 'borrow';
      return 'lend';
    }
    if (editTxn.kind === EVENT_KINDS.ADJUSTMENT) {
      return editTxn.fromPartyId === PARTY_USER ? 'lend' : 'borrow';
    }
    if (editTxn.kind === EVENT_KINDS.LEGACY_UNCLASSIFIED) {
      if (editTxn.legacyType === 'give') return editTxn.personId ? 'lend' : 'personal_expense';
      if (editTxn.legacyType === 'take') return 'borrow';
      if (editTxn.legacyType === 'settle') return 'repayment';
    }

    // 3. Legacy transaction resolution
    if (editTxn.type === 'split' || (Array.isArray(editTxn.splits) && editTxn.splits.length > 0)) {
      return 'shared_expense';
    }
    if (editTxn.type === 'settle' || editTxn.type === 'repayment') return 'repayment';
    if (editTxn.type === 'take' || editTxn.type === 'borrow') return 'borrow';
    if (editTxn.type === 'give') {
      return editTxn.person ? 'lend' : 'personal_expense';
    }
    if (editTxn.type === 'lend') return 'lend';
    if (editTxn.type === 'personal_expense') return 'personal_expense';
    if (editTxn.type === 'shared_expense') return 'shared_expense';

    return 'personal_expense';
  }

  // Creation mode: respect explicitly requested action type
  if (type === 'settle' || type === 'repayment') return 'repayment';
  if (type === 'personal_expense' || type === 'expense') return 'personal_expense';
  if (type === 'shared_expense' || type === 'split') return 'shared_expense';
  if (type === 'lend' || type === 'give') return 'lend';
  if (type === 'borrow' || type === 'take') return 'borrow';

  // If type wasn't explicitly specified, check if prefill requested an action
  if (editTxn && typeof editTxn === 'object') {
    if (editTxn.action) return editTxn.action;
    if (editTxn.type === 'settle' || editTxn.type === 'repayment') return 'repayment';
    if (editTxn.type === 'personal_expense') return 'personal_expense';
    if (editTxn.type === 'shared_expense' || editTxn.type === 'split') return 'shared_expense';
    if (editTxn.type === 'lend' || editTxn.type === 'give') return 'lend';
    if (editTxn.type === 'borrow' || editTxn.type === 'take') return 'borrow';
  }

  return null;
}

/**
 * Returns human-readable header title for the TransactionSheet modal.
 */
export function resolveSheetTitle(action, isEdit) {
  if (isEdit) {
    switch (action) {
      case 'repayment': return 'Edit Repayment';
      case 'lend': return 'Edit Loan';
      case 'borrow': return 'Edit Borrowing';
      case 'shared_expense': return 'Edit Shared Expense';
      case 'personal_expense': return 'Edit Personal Expense';
      default: return 'Edit Transaction';
    }
  }

  switch (action) {
    case 'repayment': return 'Record Repayment';
    case 'lend': return 'Lend Money';
    case 'borrow': return 'Borrow Money';
    case 'shared_expense': return 'Shared Expense';
    case 'personal_expense': return 'Personal Expense';
    default: return 'New Transaction';
  }
}

/**
 * Dispatches save from TransactionSheet to StoreCore:
 * - If sheet has an existing transaction with a valid ID, invokes store.editTransaction(id, txn).
 * - Otherwise (new transaction or creation prefill), invokes store.addTransaction(txn).
 */
export function dispatchTransactionSave(sheet, txn, store) {
  if (!store) {
    return { success: false, error: 'Store not available' };
  }

  const isEditing = isEditMode(sheet?.editTxn);
  if (isEditing) {
    return store.editTransaction(sheet.editTxn.id, txn);
  }
  return store.addTransaction(txn);
}
