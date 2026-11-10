import { useState } from 'react';
import {
  X,
  Calendar,
  CreditCard,
  User,
  Users,
  ArrowUpRight,
  ArrowDownLeft,
  Scissors,
  CheckCircle2,
  Trash2,
  Edit2,
  AlertTriangle,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';

export default function TransactionDetailModal({
  isOpen,
  txn,
  settings = {},
  store,
  onClose,
  onEdit,
  onDelete,
}) {
  if (!isOpen || !txn) return null;

  const currency = settings.currency || '₹';
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [mutationError, setMutationError] = useState(null);

  // Derive semantic properties
  const isPersonalExpense = txn.action === 'personal_expense' || (!txn.action && txn.type === 'give' && !txn.person);
  const isSharedExpense = txn.action === 'shared_expense' || txn.type === 'split';
  const isLend = txn.action === 'lend' || (txn.type === 'give' && txn.person);
  const isBorrow = txn.action === 'borrow' || (txn.type === 'take' && txn.person);
  const isRepayment = txn.action === 'repayment' || txn.type === 'settle';
  const isAdjustment = txn.action === 'adjustment' || txn.type === 'adjustment';
  const isLegacy = txn.rawKind === 'LEGACY_UNCLASSIFIED' || txn.reviewRequired;

  // Amount & shares
  const totalAmount = txn.amount || txn.totalAmount || 0;
  const userShare = txn.userShare ?? txn.myShare ?? (isPersonalExpense ? totalAmount : 0);

  // Look up linked payment attempt if available
  const attempts = store?.getPaymentAttempts ? store.getPaymentAttempts() : [];
  const linkedAttemptId = txn.paymentAttemptId || txn.metadata?.paymentAttemptId;
  const linkedAttempt = linkedAttemptId ? attempts.find((a) => a.id === linkedAttemptId) : null;

  const handleDelete = () => {
    setMutationError(null);
    const res = store?.deleteTransaction ? store.deleteTransaction(txn.id) : onDelete(txn.id);

    if (res && res.success === false) {
      setMutationError(res.error || 'Cannot delete transaction due to historical balance dependency.');
      setDeleteConfirm(false);
      return;
    }

    onClose();
  };

  const handleMarkReviewed = () => {
    if (store?.markTransactionReviewed) {
      store.markTransactionReviewed(txn.id);
      onClose();
    }
  };

  let Icon = CreditCard;
  let categoryLabel = 'Personal Expense';
  if (isSharedExpense) {
    Icon = Scissors;
    categoryLabel = 'Shared Expense';
  } else if (isLend) {
    Icon = ArrowUpRight;
    categoryLabel = 'Money Lent';
  } else if (isBorrow) {
    Icon = ArrowDownLeft;
    categoryLabel = 'Money Borrowed';
  } else if (isRepayment) {
    Icon = CheckCircle2;
    categoryLabel = 'Repayment';
  } else if (isAdjustment) {
    Icon = AlertTriangle;
    categoryLabel = 'Balance Adjustment';
  } else if (isLegacy) {
    Icon = AlertTriangle;
    categoryLabel = 'Historical Record';
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-card border border-[var(--border-color)] rounded-2xl w-full max-w-md p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Icon size={20} className="text-text-muted flex-shrink-0" />
            <div>
              <span className="text-[11px] uppercase font-semibold tracking-wider text-text-muted">
                {categoryLabel}
              </span>
              <h2 className="text-base font-semibold text-text-primary leading-tight">
                {txn.description || 'Transaction Details'}
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-secondary/40"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Mutation Error / Conflict Alert */}
        {mutationError && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 space-y-1 animate-fade-in">
            <p className="font-semibold flex items-center gap-1.5 text-rose-400">
              <ShieldAlert size={14} /> Operation Blocked by Accounting Engine
            </p>
            <p className="leading-relaxed">{mutationError}</p>
          </div>
        )}

        {/* Primary Amount Card */}
        <div className="p-5 rounded-xl bg-secondary/50 border border-[var(--border-color)] text-center space-y-1">
          <span className="text-xs text-text-secondary font-medium">
            {isSharedExpense ? 'Your Share' : 'Amount'}
          </span>
          <div className="text-3xl sm:text-[34px] font-bold text-text-primary tabular-nums">
            {currency}{(isSharedExpense ? userShare : totalAmount).toLocaleString('en-IN')}
          </div>
          {isSharedExpense && (
            <p className="text-xs text-text-muted mt-1">
              Total bill paid to merchant: <strong className="text-text-primary tabular-nums">{currency}{totalAmount.toLocaleString('en-IN')}</strong>
            </p>
          )}
        </div>

        {/* Core Metadata */}
        <div className="divide-y divide-[var(--border-color)]/60 border-y border-[var(--border-color)]/60 text-xs">
          {/* Date */}
          <div className="flex justify-between items-center py-2.5">
            <span className="text-text-muted flex items-center gap-1.5">
              <Calendar size={14} /> Date
            </span>
            <span className="font-medium text-text-primary">{txn.date}</span>
          </div>

          {/* Category */}
          <div className="flex justify-between items-center py-2.5">
            <span className="text-text-muted">Category</span>
            <span className="font-medium text-text-primary">{txn.category || 'Other'}</span>
          </div>

          {/* Payment Method */}
          <div className="flex justify-between items-center py-2.5">
            <span className="text-text-muted">Payment Method</span>
            <span className="font-mono text-text-primary bg-secondary px-2 py-0.5 rounded border border-[var(--border-color)] text-xs">
              {txn.paymentMethod || 'Not specified'}
            </span>
          </div>

          {/* Counterparty / Payer */}
          {txn.person && (
            <div className="flex justify-between items-center py-2.5">
              <span className="text-text-muted flex items-center gap-1.5">
                <User size={14} /> Contact
              </span>
              <span className="font-medium text-text-primary">{txn.person}</span>
            </div>
          )}

          {txn.payerName && isSharedExpense && (
            <div className="flex justify-between items-center py-2.5">
              <span className="text-text-muted">Paid by</span>
              <span className="font-medium text-text-primary">{txn.payerName}</span>
            </div>
          )}
        </div>

        {/* Shared Expense Participant Allocations */}
        {isSharedExpense && Array.isArray(txn.allocations || txn.splits) && (txn.allocations || txn.splits).length > 0 && (
          <div className="p-3.5 rounded-xl border border-[var(--border-color)] bg-secondary/30 space-y-2 text-xs">
            <span className="font-semibold text-text-secondary flex items-center gap-1.5">
              <Users size={14} /> Participant Breakdown
            </span>
            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between text-xs text-text-secondary">
                <span>You (Your share)</span>
                <span className="font-medium text-text-primary tabular-nums">{currency}{userShare.toLocaleString('en-IN')}</span>
              </div>
              {(txn.allocations || txn.splits).map((alloc, idx) => (
                <div key={idx} className="flex justify-between text-xs text-text-muted">
                  <span>{alloc.person || alloc.personId}</span>
                  <span className="font-medium text-text-primary tabular-nums">{currency}{alloc.amount.toLocaleString('en-IN')}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Linked UPI Payment Attempt Details */}
        {linkedAttempt && (
          <div className="p-3.5 rounded-xl border border-blue-500/25 bg-blue-500/10 space-y-1.5 text-xs">
            <div className="flex items-center justify-between text-blue-300 font-semibold">
              <span className="flex items-center gap-1.5">
                <ExternalLink size={14} /> Linked Payment Attempt
              </span>
              <span className="text-[10px] font-mono uppercase bg-blue-500/20 px-2 py-0.5 rounded border border-blue-500/30">
                {linkedAttempt.status}
              </span>
            </div>
            <p className="text-xs text-text-secondary">
              Attempt ID: <span className="font-mono text-text-primary">{linkedAttempt.id}</span>
            </p>
            {linkedAttempt.recipientUpiId && (
              <p className="text-xs text-text-secondary">
                Recipient UPI: <span className="font-mono text-text-primary">{linkedAttempt.recipientUpiId}</span>
              </p>
            )}
          </div>
        )}

        {/* Legacy Unclassified Review Card */}
        {isLegacy && (
          <div className="p-3.5 rounded-xl border border-amber-500/25 bg-amber-500/10 space-y-2 text-xs">
            <div className="flex items-center gap-1.5 text-amber-300 font-semibold">
              <AlertTriangle size={14} /> Historical Review Item
            </div>
            <p className="text-xs text-text-secondary leading-snug">
              This record was preserved from legacy data without altering historical balance effects.
            </p>
            {txn.reviewRequired && (
              <button
                type="button"
                onClick={handleMarkReviewed}
                className="btn btn-ghost text-xs !py-1.5 px-3 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20"
              >
                Mark as Reviewed
              </button>
            )}
          </div>
        )}

        {/* Action Buttons */}
        {!deleteConfirm ? (
          <div className="flex gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => {
                onClose();
                onEdit(txn);
              }}
              className="btn btn-ghost flex-1 text-xs !py-2.5 flex items-center justify-center gap-1.5"
            >
              <Edit2 size={14} /> Edit
            </button>
            <button
              type="button"
              onClick={() => setDeleteConfirm(true)}
              className="btn btn-ghost flex-1 text-xs !py-2.5 flex items-center justify-center gap-1.5 text-rose-400 hover:text-rose-300 border-rose-500/20 hover:border-rose-500/40"
            >
              <Trash2 size={14} /> Delete
            </button>
          </div>
        ) : (
          <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 space-y-3 animate-fade-in">
            <p className="text-xs font-semibold text-rose-400">
              Confirm Deletion?
            </p>
            <p className="text-xs text-rose-300/80 leading-snug">
              This will permanently delete this ledger event and recalculate downstream balances.
            </p>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setDeleteConfirm(false)}
                className="btn btn-ghost flex-1 text-xs !py-2"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="btn btn-primary flex-1 text-xs !py-2 !bg-rose-600 hover:!bg-rose-700 !border-rose-600"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
