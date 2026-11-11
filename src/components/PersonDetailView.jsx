import { useState } from 'react';
import {
  ArrowLeft,
  User,
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
  ExternalLink,
  Phone,
} from 'lucide-react';
import { isValidUpiId } from '../domain/store-core.js';
import { isValidPhoneNumber, cleanPhoneNumber } from '../domain/upi-qr.js';
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
  const [editPhone, setEditPhone] = useState('');
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
    setEditPhone(person.phone || '');
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
    const phoneTrimmed = editPhone.trim();
    if (phoneTrimmed && !isValidPhoneNumber(phoneTrimmed)) {
      setEditError('Please enter a valid phone number (10+ digits)');
      return;
    }
    const upiTrimmed = editUpi.trim();
    if (upiTrimmed && !isValidUpiId(upiTrimmed)) {
      setEditError(`Invalid UPI ID '${upiTrimmed}'. Format must be username@bank (e.g. name@okaxis)`);
      return;
    }

    const res = store.updatePerson(person.id || person.name, {
      name: editName.trim(),
      phone: cleanPhoneNumber(phoneTrimmed),
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
    <div className="space-y-6 animate-fade-in">
      {/* ── Top Navigation Bar ── */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors py-2 px-1"
          aria-label="Back to People"
        >
          <ArrowLeft size={16} />
          <span className="font-semibold">People</span>
        </button>

        <div className="flex items-center gap-2">
          {person.isArchived && (
            <span className="text-[10px] uppercase font-semibold tracking-wider px-2 py-0.5 rounded bg-neutral-500/20 text-neutral-400 border border-neutral-500/30">
              Archived
            </span>
          )}
          <button
            onClick={openEditModal}
            className="p-2 rounded-xl border border-[var(--border-color)] bg-secondary/40 text-text-muted hover:text-text-primary hover:border-accent/40 transition-all"
            title="Edit Person Details"
            aria-label="Edit Person"
          >
            <Edit2 size={15} />
          </button>
        </div>
      </div>

      {/* ── Person Header & Balance Card (Hero Surface) ── */}
      <div className="theme-card p-5 sm:p-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3.5">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-base font-semibold border ${
              isSettled
                ? 'bg-secondary border-[var(--border-color)] text-text-muted'
                : isOwedToUser
                ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                : 'bg-rose-500/10 border-rose-500/25 text-rose-400'
            }`}>
              {person.name ? person.name.charAt(0).toUpperCase() : <User size={20} />}
            </div>
            <div>
              <h1 className="text-xl font-bold text-text-primary leading-tight">{person.name}</h1>
              <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                {person.phone && (
                  <span className="flex items-center gap-1 text-xs text-text-secondary">
                    <Phone size={12} className="text-emerald-400" />
                    <span>{person.phone}</span>
                  </span>
                )}
                {person.upiId ? (
                  <button
                    onClick={handleCopyUpi}
                    className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-accent font-mono transition-colors group"
                  >
                    <span>{person.upiId}</span>
                    {copiedUpi ? (
                      <Check size={13} className="text-emerald-400" />
                    ) : (
                      <Copy size={13} className="text-text-muted group-hover:text-accent transition-colors" />
                    )}
                  </button>
                ) : (
                  <button
                    onClick={openEditModal}
                    className="text-xs text-accent hover:underline"
                  >
                    + Add UPI ID
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Clean Balance Display */}
        <div className="pt-2 border-t border-[var(--border-color)]/60">
          <span className="text-xs font-medium text-text-secondary">
            {isSettled
              ? 'Net balance'
              : isOwedToUser
              ? `${person.name} owes you`
              : `You owe ${person.name}`}
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className={`text-3xl sm:text-[34px] font-bold tracking-tight tabular-nums ${
              isSettled
                ? 'text-text-muted'
                : isOwedToUser
                ? 'text-emerald-400'
                : 'text-rose-400'
            }`}>
              {isSettled ? `${currency}0` : `${isOwedToUser ? '+' : '-'}${currency}${absBalance.toLocaleString('en-IN')}`}
            </span>
          </div>
        </div>

        {/* Context-Sensitive Actions */}
        <div className="pt-1">
          {isOwedToUser && (
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => onOpenSheet('settle', { person: person.name, amount: absBalance })}
                className="btn btn-primary text-xs !py-2.5 min-h-[46px] flex items-center justify-center gap-1.5 font-semibold"
              >
                <CheckCircle2 size={15} /> Record Repayment
              </button>
              <button
                onClick={() => onOpenSheet('give', { person: person.name })}
                className="btn btn-ghost text-xs !py-2.5 min-h-[46px] flex items-center justify-center gap-1.5 font-medium border border-[var(--border-color)]"
              >
                <ArrowUpRight size={15} /> Lend Money
              </button>
            </div>
          )}

          {isUserOwes && (
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => onOpenSheet('settle', { person: person.name, amount: absBalance })}
                className="btn btn-primary text-xs !py-2.5 min-h-[46px] flex items-center justify-center gap-1.5 font-semibold"
              >
                <CheckCircle2 size={15} /> Record Repayment
              </button>
              {person.upiId ? (
                <button
                  onClick={() => setShowUpiPayModal(true)}
                  className="btn btn-primary text-xs !py-2.5 min-h-[46px] flex items-center justify-center gap-1.5 font-semibold"
                >
                  <ExternalLink size={15} /> Pay via UPI
                </button>
              ) : (
                <button
                  onClick={() => onOpenSheet('take', { person: person.name })}
                  className="btn btn-ghost text-xs !py-2.5 min-h-[46px] flex items-center justify-center gap-1.5 font-medium border border-[var(--border-color)]"
                >
                  <ArrowDownLeft size={15} /> Borrow Money
                </button>
              )}
            </div>
          )}

          {isSettled && (
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => onOpenSheet('give', { person: person.name })}
                className="btn btn-ghost text-xs !py-2.5 flex items-center justify-center gap-1 font-medium border border-[var(--border-color)]"
              >
                <ArrowUpRight size={14} /> Lend
              </button>
              <button
                onClick={() => onOpenSheet('take', { person: person.name })}
                className="btn btn-ghost text-xs !py-2.5 flex items-center justify-center gap-1 font-medium border border-[var(--border-color)]"
              >
                <ArrowDownLeft size={14} /> Borrow
              </button>
              <button
                onClick={() => onOpenSheet('split', { person: person.name })}
                className="btn btn-ghost text-xs !py-2.5 flex items-center justify-center gap-1 font-medium border border-[var(--border-color)]"
              >
                <Plus size={14} /> Split
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Chronological Ledger Section ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-text-primary">
            Activity history
          </h2>
          <span className="text-xs text-text-secondary">
            {timeline.length} {timeline.length === 1 ? 'record' : 'records'}
          </span>
        </div>

        {timeline.length === 0 ? (
          <div className="py-8 text-center space-y-2">
            <Clock size={28} className="text-text-muted mx-auto opacity-40" />
            <p className="text-sm font-semibold text-text-secondary">No transactions recorded yet</p>
            <p className="text-xs text-text-muted max-w-xs mx-auto">
              Transactions involving {person.name} will appear here with running balances.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-color)]/60 border-y border-[var(--border-color)]/60">
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
                  className="w-full py-3.5 flex items-center justify-between gap-3 text-left hover:bg-secondary/30 transition-colors px-1 cursor-pointer"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-medium text-text-primary truncate">
                      {entry.description || entry.kind || 'Transaction'}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-text-muted mt-0.5">
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
                          <span>{entry.paymentMethod}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <span className={`text-[15px] font-semibold tabular-nums block ${
                      isPositive ? 'text-emerald-400' : isNegative ? 'text-rose-400' : 'text-text-muted'
                    }`}>
                      {isPositive ? `+${currency}${delta.toLocaleString('en-IN')}` : isNegative ? `-${currency}${Math.abs(delta).toLocaleString('en-IN')}` : `${currency}0`}
                    </span>
                    <span className="text-[11px] text-text-muted tabular-nums">
                      Bal: {runningBal === 0 ? '₹0' : `${runningBal > 0 ? '+' : '-'}${currency}${Math.abs(runningBal).toLocaleString('en-IN')}`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Person Management / Archival ── */}
      <div className="pt-2">
        <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/40 border border-[var(--border-color)]">
          <div>
            <span className="text-sm font-medium text-text-primary block">Contact status</span>
            <p className="text-xs text-text-secondary mt-0.5">
              {!isSettled && !person.isArchived
                ? `Active balance (${currency}${absBalance.toLocaleString('en-IN')}) must be settled to archive.`
                : person.isArchived
                ? 'Contact is currently archived.'
                : 'Archive contact to hide from active list.'}
            </p>
          </div>
          <button
            onClick={handleToggleArchive}
            disabled={!isSettled && !person.isArchived}
            className={`text-xs font-semibold flex items-center gap-1.5 !py-2 px-3 rounded-lg border transition-all ${
              person.isArchived
                ? 'border-accent bg-accent/15 text-text-primary hover:bg-accent/25'
                : isSettled
                ? 'border-[var(--border-color)] bg-secondary/60 text-text-secondary hover:text-text-primary'
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
      </div>

      {/* ── Edit Person Modal ── */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-card border border-[var(--border-color)] rounded-2xl w-full max-w-sm p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-semibold text-text-primary">Edit Person Details</h3>
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-text-secondary block mb-1.5">Name</label>
                <input
                  value={editName}
                  onChange={(e) => {
                    setEditName(e.target.value);
                    setEditError(null);
                  }}
                  className="w-full h-[50px] px-3.5 bg-secondary border border-[var(--border-color)] rounded-xl text-text-primary text-sm focus:border-accent outline-none"
                  placeholder="Person name"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs font-medium text-text-secondary block mb-1.5">Phone Number (optional)</label>
                <input
                  type="tel"
                  value={editPhone}
                  onChange={(e) => {
                    setEditPhone(e.target.value);
                    setEditError(null);
                  }}
                  className="w-full h-[50px] px-3.5 bg-secondary border border-[var(--border-color)] rounded-xl text-text-primary text-sm focus:border-accent outline-none"
                  placeholder="e.g. +91 98765 43210"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-text-secondary block mb-1.5">UPI ID (optional)</label>
                <input
                  value={editUpi}
                  onChange={(e) => {
                    setEditUpi(e.target.value);
                    setEditError(null);
                  }}
                  className="w-full h-[50px] px-3.5 bg-secondary border border-[var(--border-color)] rounded-xl text-text-primary text-sm font-mono focus:border-accent outline-none"
                  placeholder="e.g. name@okhdfcbank"
                />
              </div>

              {editError && (
                <p className="text-xs text-rose-400 bg-rose-500/10 p-3 rounded-xl border border-rose-500/20">
                  {editError}
                </p>
              )}

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="btn btn-ghost flex-1 text-xs !py-2.5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary flex-1 text-xs !py-2.5 font-semibold"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Outgoing UPI Modal for Pay via UPI ── */}
      {showUpiPayModal && store && (
        <UpiModal
          isOpen={showUpiPayModal}
          recipientId={person.id || null}
          recipientName={person.name}
          recipientUpiId={person.upiId || ''}
          recipientPhone={person.phone || ''}
          amount={absBalance}
          mode={person.upiId && isValidUpiId(person.upiId) ? 'DIRECT_UPI' : 'GOOGLE_PAY'}
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
