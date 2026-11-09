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

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-card border border-[var(--border-color)] rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
              isPersonalExpense
                ? 'bg-amber-500/15 text-amber-400'
                : isSharedExpense
                ? 'bg-accent/15 text-accent'
                : isLend
                ? 'bg-emerald-500/15 text-emerald-400'
                : isBorrow
                ? 'bg-rose-500/15 text-rose-400'
                : isRepayment
                ? 'bg-blue-500/15 text-blue-400'
                : 'bg-neutral-500/15 text-neutral-400'
            }`}>
              {isPersonalExpense ? <CreditCard size={18} /> :
               isSharedExpense ? <Scissors size={18} /> :
               isLend ? <ArrowUpRight size={18} /> :
               isBorrow ? <ArrowDownLeft size={18} /> :
               isRepayment ? <CheckCircle2 size={18} /> :
               <AlertTriangle size={18} />}
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-text-muted">
                {isPersonalExpense ? 'Personal Expense' :
                 isSharedExpense ? 'Shared Expense' :
                 isLend ? 'Money Lent' :
                 isBorrow ? 'Money Borrowed' :
                 isRepayment ? 'Repayment' :
                 isAdjustment ? 'Balance Adjustment' :
                 'Legacy Transaction'}
              </span>
              <h2 className="text-base font-bold text-text-primary leading-tight">
                {txn.description || 'Transaction Details'}
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Mutation Error / Conflict Alert */}
        {mutationError && (
          <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300 space-y-1 animate-fade-in">
            <p className="font-bold flex items-center gap-1.5 text-red-400">
              <ShieldAlert size={14} /> Operation Blocked by Accounting Engine
            </p>
            <p className="leading-relaxed">{mutationError}</p>
          </div>
        )}

        {/* Primary Amount Card */}
        <div className="p-4 rounded-xl bg-secondary/50 border border-[var(--border-color)] text-center space-y-1">
          <span className="text-[11px] text-text-muted uppercase tracking-wider font-semibold">
            {isSharedExpense ? 'Your Share / Consumption' : 'Amount'}
          </span>
          <div className="text-3xl font-extrabold text-text-primary tabular-nums">
            {currency}{(isSharedExpense ? userShare : totalAmount).toLocaleString('en-IN')}
          </div>
          {isSharedExpense && (
            <p className="text-xs text-text-muted">
              Total bill paid to merchant: <strong className="text-text-primary tabular-nums">{currency}{totalAmount.toLocaleString('en-IN')}</strong>
            </p>
          )}
        </div>

        {/* Core Metadata Grid */}
        <div className="space-y-2.5 text-xs">
          <div className="p-3 rounded-xl border border-[var(--border-color)] bg-secondary/25 space-y-2">
            {/* Date */}
            <div className="flex justify-between items-center">
              <span className="text-text-muted flex items-center gap-1.5">
                <Calendar size={13} /> Date
              </span>
              <span className="font-semibold text-text-primary">{txn.date}</span>
            </div>

            {/* Category */}
            <div className="flex justify-between items-center">
              <span className="text-text-muted">Category</span>
              <span className="font-medium text-text-primary">{txn.category || 'Other'}</span>
            </div>

            {/* Payment Method */}
            <div className="flex justify-between items-center">
              <span className="text-text-muted">Payment Method</span>
              <span className="font-mono text-text-primary bg-secondary/80 px-1.5 py-0.5 rounded border border-[var(--border-color)] text-[11px]">
                {txn.paymentMethod || 'Not specified'}
              </span>
            </div>

            {/* Counterparty / Payer */}
            {txn.person && (
              <div className="flex justify-between items-center">
                <span className="text-text-muted flex items-center gap-1.5">
                  <User size={13} /> Counterparty
                </span>
                <span className="font-semibold text-text-primary">{txn.person}</span>
              </div>
            )}

            {txn.payerName && isSharedExpense && (
              <div className="flex justify-between items-center">
                <span className="text-text-muted">Paid by</span>
                <span className="font-semibold text-text-primary">{txn.payerName}</span>
              </div>
            )}
          </div>

          {/* Shared Expense Participant Allocations */}
          {isSharedExpense && Array.isArray(txn.allocations || txn.splits) && (txn.allocations || txn.splits).length > 0 && (
            <div className="p-3 rounded-xl border border-[var(--border-color)] bg-secondary/25 space-y-2">
              <span className="font-semibold text-text-secondary flex items-center gap-1.5">
                <Users size={13} /> Participant Breakdown
              </span>
              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between text-[11px] text-text-muted">
                  <span>You (Your share)</span>
                  <span className="font-semibold text-text-primary">{currency}{userShare.toLocaleString('en-IN')}</span>
                </div>
                {(txn.allocations || txn.splits).map((alloc, idx) => (
                  <div key={idx} className="flex justify-between text-[11px] text-text-muted">
                    <span>{alloc.person || alloc.personId}</span>
                    <span className="font-semibold text-text-primary">{currency}{alloc.amount.toLocaleString('en-IN')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Linked UPI Payment Attempt Details */}
          {linkedAttempt && (
            <div className="p-3 rounded-xl border border-blue-500/30 bg-blue-500/10 space-y-1.5">
              <div className="flex items-center justify-between text-blue-300 font-semibold">
                <span className="flex items-center gap-1.5">
                  <ExternalLink size={13} /> Linked Payment Attempt
                </span>
                <span className="text-[10px] font-mono uppercase bg-blue-500/20 px-1.5 py-0.5 rounded border border-blue-500/40">
                  {linkedAttempt.status}
                </span>
              </div>
              <p className="text-[11px] text-blue-200/80">
                Attempt ID: <span className="font-mono">{linkedAttempt.id}</span>
              </p>
              {linkedAttempt.recipientUpiId && (
                <p className="text-[11px] text-blue-200/80">
                  Recipient UPI: <span className="font-mono">{linkedAttempt.recipientUpiId}</span>
                </p>
              )}
            </div>
          )}

          {/* Legacy Unclassified Review Card */}
          {isLegacy && (
            <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 space-y-2">
              <div className="flex items-center gap-1.5 text-amber-300 font-semibold">
                <AlertTriangle size={14} /> Historical Review Item
              </div>
              <p className="text-[11px] text-amber-200/80 leading-snug">
                This record was preserved from legacy data without altering historical balance effects.
              </p>
              {txn.reviewRequired && (
                <button
                  type="button"
                  onClick={handleMarkReviewed}
                  className="btn btn-ghost text-xs py-1.5 px-2.5 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20"
                >
                  Mark as Reviewed
                </button>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        {!deleteConfirm ? (
          <div className="flex gap-2 pt-2 border-t border-[var(--border-color)]">
            <button
              type="button"
              onClick={() => {
                onClose();
                onEdit(txn);
              }}
              className="btn btn-ghost flex-1 text-xs py-2.5 flex items-center justify-center gap-1.5 border border-[var(--border-color)]"
            >
              <Edit2 size={13} /> Edit
            </button>
            <button
              type="button"
              onClick={() => setDeleteConfirm(true)}
              className="btn btn-ghost flex-1 text-xs py-2.5 flex items-center justify-center gap-1.5 text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/40"
            >
              <Trash2 size={13} /> Delete
            </button>
          </div>
        ) : (
          <div className="p-3 rounded-xl border border-red-500/30 bg-red-500/10 space-y-2.5 animate-fade-in pt-2">
            <p className="text-xs font-bold text-red-400">
              Confirm Deletion?
            </p>
            <p className="text-[11px] text-red-300/80 leading-snug">
              This will permanently delete this ledger event and re-verify downstream balances.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirm(false)}
                className="btn btn-ghost flex-1 text-xs py-2"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="btn btn-primary flex-1 text-xs py-2 !bg-red-600 hover:!bg-red-700 !border-red-600"
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

