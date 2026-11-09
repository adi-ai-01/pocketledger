import { useState } from 'react';
import {
  ArrowLeft,
  User,
  CreditCard,
  Edit2,
  Archive,
  RotateCcw,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  CheckCircle2,
  Clock,
  Copy,
  Check,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { isValidUpiId } from '../domain/store-core.js';
import UpiModal from './transaction/UpiModal.jsx';

export default function PersonDetailView({
  personName,
  personId,
  store,
  settings = {},
  onBack,
  onOpenSheet,
}) {
  const currency = settings.currency || '₹';
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState(personName || '');
  const [editUpi, setEditUpi] = useState('');
  const [editError, setEditError] = useState(null);
  const [showUpiPayModal, setShowUpiPayModal] = useState(false);

  // Fetch timeline and person details from store
  const timelineData = store.getPersonTimeline ? store.getPersonTimeline(personId || personName) : null;
  const person = timelineData?.person || { id: personId, name: personName, upiId: '', isArchived: false };
  const currentBalance = timelineData?.currentBalanceRupees ?? (store.computeBalances ? (store.computeBalances()[person.name] || 0) : 0);
  const timeline = timelineData?.timeline || [];

  const isOwedToUser = currentBalance > 0.001;
  const isUserOwes = currentBalance < -0.001;
  const isSettled = !isOwedToUser && !isUserOwes;
  const absBalance = Math.abs(currentBalance);

  const handleCopyUpi = () => {
    if (!person.upiId) return;
    try {
      navigator.clipboard.writeText(person.upiId);
      setCopiedUpi(true);
      setTimeout(() => setCopiedUpi(false), 2000);
    } catch {
      // Fallback
    }
  };

  const openEditModal = () => {
    setEditName(person.name || '');
    setEditUpi(person.upiId || '');
    setEditError(null);
    setShowEditModal(true);
  };

  const handleSaveEdit = (e) => {
    e.preventDefault();
    if (!editName.trim()) {
      setEditError('Person name cannot be empty');
      return;
    }
    const upiTrimmed = editUpi.trim();
    if (upiTrimmed && !isValidUpiId(upiTrimmed)) {
      setEditError(`Invalid UPI ID '${upiTrimmed}'. Expected format: username@bank (e.g. name@okaxis)`);
      return;
    }

    const res = store.updatePerson(person.id || person.name, {
      name: editName.trim(),
      upiId: upiTrimmed,
    });

    if (res && res.success === false) {
      setEditError(res.error || 'Failed to update person');
      return;
    }

    setShowEditModal(false);
  };

  const handleToggleArchive = () => {
    if (person.isArchived) {
      store.unarchivePerson(person.id || person.name);
    } else {
      const res = store.archivePerson(person.id || person.name);
      if (res && res.success === false) {
        alert(res.error || 'Cannot archive person');
      }
    }
  };

  return (
    <div className="animate-fade-in space-y-4 pb-12">
      {/* Top Navigation Bar */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors py-2 px-1 -ml-1 active:scale-95"
          aria-label="Back to People"
        >
          <ArrowLeft size={16} />
          <span className="font-semibold">People</span>
        </button>

        <div className="flex items-center gap-2">
          {person.isArchived && (
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-neutral-500/20 text-neutral-400 border border-neutral-500/30">
              Archived
            </span>
          )}
          <button
            onClick={openEditModal}
            className="p-1.5 rounded-lg border border-[var(--border-color)] bg-secondary/40 text-text-muted hover:text-text-primary hover:border-accent/40 transition-all"
            title="Edit Person Details"
            aria-label="Edit Person"
          >
            <Edit2 size={14} />
          </button>
        </div>
      </div>

      {/* Person Header Card */}
      <div className="theme-card p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3.5">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-bold border ${
              isSettled
                ? 'bg-secondary border-[var(--border-color)] text-text-muted'
                : isOwedToUser
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                : 'bg-rose-500/15 border-rose-500/30 text-rose-400'
            }`}>
              {person.name ? person.name.charAt(0).toUpperCase() : <User size={20} />}
            </div>
            <div>
              <h1 className="text-lg font-bold text-text-primary leading-snug">{person.name}</h1>
              {person.upiId ? (
                <button
                  onClick={handleCopyUpi}
                  className="flex items-center gap-1.5 text-xs text-text-muted hover:text-accent font-mono mt-0.5 transition-colors group"
                >
                  <span>{person.upiId}</span>
                  {copiedUpi ? (
                    <Check size={12} className="text-emerald-400" />
                  ) : (
                    <Copy size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </button>
              ) : (
                <button
                  onClick={openEditModal}
                  className="text-[11px] text-accent/80 hover:text-accent hover:underline mt-0.5"
                >
                  + Add UPI ID
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Hero Balance Box */}
        <div className={`p-4 rounded-xl border text-center space-y-1 transition-all ${
          isSettled
            ? 'bg-secondary/40 border-[var(--border-color)]'
            : isOwedToUser
            ? 'bg-emerald-500/10 border-emerald-500/25'
            : 'bg-rose-500/10 border-rose-500/25'
        }`}>
          <span className="text-[11px] font-semibold tracking-wider uppercase text-text-muted">
            {isSettled
              ? 'Net Balance'
              : isOwedToUser
              ? `${person.name} owes you`
              : `You owe ${person.name}`}
          </span>
          <div className="flex items-center justify-center gap-1.5">
            <span className={`text-3xl font-extrabold tracking-tight tabular-nums ${
              isSettled
                ? 'text-text-muted'
                : isOwedToUser
                ? 'text-emerald-400'
                : 'text-rose-400'
            }`}>
              {isSettled ? `${currency}0` : `${isOwedToUser ? '+' : '-'}${currency}${absBalance.toLocaleString('en-IN')}`}
            </span>
          </div>
          <p className="text-[11px] text-text-muted">
            {isSettled
              ? 'All shared debts and payments are fully settled'
              : isOwedToUser
              ? 'Counterparty has an outstanding debt to pay back'
              : 'You have an outstanding liability to clear'}
          </p>
        </div>

        {/* Context-Sensitive Actions based strictly on direction */}
        <div className="space-y-2 pt-1">
          {isOwedToUser && (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onOpenSheet('settle', { person: person.name, amount: absBalance })}
                className="btn btn-primary text-xs py-2.5 px-3 flex items-center justify-center gap-1.5 font-semibold"
              >
                <CheckCircle2 size={14} /> Record Repayment
              </button>
              <button
                onClick={() => onOpenSheet('give', { person: person.name })}
                className="btn btn-ghost text-xs py-2.5 px-3 flex items-center justify-center gap-1.5 font-medium border border-[var(--border-color)]"
              >
                <ArrowUpRight size={14} /> Lend Money
              </button>
            </div>
          )}

          {isUserOwes && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => onOpenSheet('settle', { person: person.name, amount: absBalance })}
                  className="btn btn-primary text-xs py-2.5 px-3 flex items-center justify-center gap-1.5 font-semibold"
                >
                  <CheckCircle2 size={14} /> Record Repayment
                </button>
                {person.upiId ? (
                  <button
                    onClick={() => setShowUpiPayModal(true)}
                    className="btn btn-accent text-xs py-2.5 px-3 flex items-center justify-center gap-1.5 font-semibold bg-accent/20 border border-accent/40 text-text-primary hover:bg-accent/30"
                  >
                    <ExternalLink size={14} className="text-accent" /> Pay via UPI
                  </button>
                ) : (
                  <button
                    onClick={() => onOpenSheet('take', { person: person.name })}
                    className="btn btn-ghost text-xs py-2.5 px-3 flex items-center justify-center gap-1.5 font-medium border border-[var(--border-color)]"
                  >
                    <ArrowDownLeft size={14} /> Borrow Money
                  </button>
                )}
              </div>
            </div>
          )}

          {isSettled && (
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => onOpenSheet('give', { person: person.name })}
                className="btn btn-ghost text-xs py-2 px-2 flex items-center justify-center gap-1 font-medium border border-[var(--border-color)]"
              >
                <ArrowUpRight size={13} /> Lend
              </button>
              <button
                onClick={() => onOpenSheet('take', { person: person.name })}
                className="btn btn-ghost text-xs py-2 px-2 flex items-center justify-center gap-1 font-medium border border-[var(--border-color)]"
              >
                <ArrowDownLeft size={13} /> Borrow
              </button>
              <button
                onClick={() => onOpenSheet('split', { person: person.name })}
                className="btn btn-ghost text-xs py-2 px-2 flex items-center justify-center gap-1 font-medium border border-[var(--border-color)]"
              >
                <Plus size={13} /> Split
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Chronological Transaction History Section */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
            History with {person.name}
          </h2>
          <span className="text-[11px] text-text-muted">
            {timeline.length} {timeline.length === 1 ? 'event' : 'events'}
          </span>
        </div>

        {timeline.length === 0 ? (
          <div className="theme-card p-6 text-center space-y-2">
            <Clock size={28} className="text-text-muted mx-auto opacity-40" />
            <p className="text-xs font-semibold text-text-secondary">No transactions recorded yet</p>
            <p className="text-[11px] text-text-muted max-w-xs mx-auto">
              Transactions involving {person.name} will appear here with running balances.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {timeline.map((entry) => {
              const delta = entry.deltaRupees;
              const isPositive = delta > 0.001;
              const isNegative = delta < -0.001;
              const runningBal = entry.runningBalanceRupees;
              const d = new Date(entry.date);
              const formattedDate = `${d.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]} ${d.getFullYear()}`;

              return (
                <div
                  key={entry.id}
                  onClick={() => onOpenSheet(entry.kind || 'settle', entry.rawEvent || entry)}
                  className="theme-card p-3.5 hover:border-accent/40 cursor-pointer transition-all active:scale-[0.99] flex flex-col gap-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-text-primary truncate">
                        {entry.description || entry.kind || 'Transaction'}
                      </p>
                      <div className="flex items-center gap-2 text-[11px] text-text-muted mt-0.5">
                        <span>{formattedDate}</span>
                        {entry.category && (
                          <>
                            <span>·</span>
                            <span>{entry.category}</span>
                          </>
                        )}
                        {entry.paymentMethod && entry.paymentMethod !== 'OTHER' && (
                          <>
                            <span>·</span>
                            <span className="font-mono text-[10px] bg-secondary/80 px-1 py-0.2 rounded border border-[var(--border-color)]">
                              {entry.paymentMethod}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0">
                      <span className={`text-xs font-bold ${
                        isPositive ? 'text-emerald-400' : isNegative ? 'text-rose-400' : 'text-text-muted'
                      }`}>
                        {isPositive ? `+${currency}${delta.toLocaleString('en-IN')}` : isNegative ? `-${currency}${Math.abs(delta).toLocaleString('en-IN')}` : `${currency}0`}
                      </span>
                    </div>
                  </div>

                  {/* Running Balance Indicator */}
                  <div className="pt-2 border-t border-[var(--border-color)]/60 flex items-center justify-between text-[11px]">
                    <span className="text-text-muted">Balance after event:</span>
                    <span className={`font-semibold ${
                      runningBal > 0.001
                        ? 'text-emerald-400/90'
                        : runningBal < -0.001
                        ? 'text-rose-400/90'
                        : 'text-text-muted'
                    }`}>
                      {runningBal === 0
                        ? '₹0 (Settled)'
                        : `${runningBal > 0 ? '+' : '-'}${currency}${Math.abs(runningBal).toLocaleString('en-IN')}`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Person Management / Archival Box */}
      <div className="pt-2">
        <div className="p-4 rounded-xl border border-[var(--border-color)] bg-secondary/20 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-text-secondary">Person Status</span>
            <button
              onClick={handleToggleArchive}
              disabled={!isSettled && !person.isArchived}
              className={`text-xs font-semibold flex items-center gap-1.5 py-1.5 px-3 rounded-lg border transition-all ${
                person.isArchived
                  ? 'border-accent bg-accent/15 text-text-primary hover:bg-accent/25'
                  : isSettled
                  ? 'border-neutral-500/30 text-text-muted hover:text-text-primary hover:border-neutral-500/60'
                  : 'border-white/5 text-text-muted/40 cursor-not-allowed'
              }`}
            >
              {person.isArchived ? (
                <>
                  <RotateCcw size={13} /> Unarchive
                </>
              ) : (
                <>
                  <Archive size={13} /> Archive
                </>
              )}
            </button>
          </div>
          {!isSettled && !person.isArchived && (
            <p className="text-[11px] text-text-muted leading-tight">
              Archiving is restricted while there is an active balance ({currency}{absBalance.toLocaleString('en-IN')}). Settle all balances first.
            </p>
          )}
          {isSettled && !person.isArchived && (
            <p className="text-[11px] text-text-muted leading-tight">
              Archiving hides this person from the active contacts list while preserving historical records.
            </p>
          )}
        </div>
      </div>

      {/* Edit Person Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-card border border-[var(--border-color)] rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-text-primary">Edit Person Details</h3>
            <form onSubmit={handleSaveEdit} className="space-y-3">
              <div>
                <label className="text-xs text-text-muted block mb-1">Name</label>
                <input
                  value={editName}
                  onChange={(e) => {
                    setEditName(e.target.value);
                    setEditError(null);
                  }}
                  className="!py-2.5 !text-sm w-full"
                  placeholder="Person name"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs text-text-muted block mb-1">UPI ID (optional)</label>
                <input
                  value={editUpi}
                  onChange={(e) => {
                    setEditUpi(e.target.value);
                    setEditError(null);
                  }}
                  className="!py-2.5 !text-sm w-full font-mono"
                  placeholder="e.g. name@okhdfcbank"
                />
              </div>

              {editError && (
                <p className="text-xs text-red-400 bg-red-500/10 p-2.5 rounded-lg border border-red-500/20">
                  {editError}
                </p>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="btn btn-ghost flex-1 text-xs py-2.5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary flex-1 text-xs py-2.5 font-semibold"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Outgoing UPI Modal for Pay via UPI */}
      {showUpiPayModal && store && (
        <UpiModal
          isOpen={showUpiPayModal}
          recipientName={person.name}
          recipientUpiId={person.upiId}
          amount={absBalance}
          note={`PocketLedger repayment to ${person.name}`}
          ledgerTxnData={{
            type: 'repayment',
            person: person.name,
            amount: absBalance,
            description: `Repayment to ${person.name} via UPI`,
            date: new Date().toISOString().slice(0, 10),
          }}
          store={store}
          onComplete={() => setShowUpiPayModal(false)}
          onCancel={() => setShowUpiPayModal(false)}
        />
      )}
    </div>
  );
}
