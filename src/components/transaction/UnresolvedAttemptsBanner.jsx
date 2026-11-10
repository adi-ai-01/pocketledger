import { useState } from 'react';
import { Clock, ExternalLink, X, Check, RotateCcw } from 'lucide-react';

export default function UnresolvedAttemptsBanner({ attempts = [], onReconcile, onDismiss }) {
  const [selectedAttempt, setSelectedAttempt] = useState(null);
  const [outcome, setOutcome] = useState(null);

  if (!attempts || attempts.length === 0) return null;

  const handleConfirm = (attemptId) => {
    if (!outcome) return;
    onReconcile(attemptId, { outcome, notes: 'Reconciled from unresolved attempts banner' });
    setSelectedAttempt(null);
    setOutcome(null);
  };

  return (
    <div className="mt-3 mb-2 animate-fade-in space-y-2">
      {attempts.map((att) => {
        const isExpanded = selectedAttempt === att.id;
        return (
          <div
            key={att.id}
            className="p-3.5 rounded-xl border border-blue-500/30 bg-secondary/80 text-xs text-text-secondary space-y-2.5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <Clock size={16} className="text-accent flex-shrink-0" />
                <span className="font-semibold text-text-primary truncate">
                  Pending UPI Attempt: ₹{att.amountRupees} to {att.recipientName}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAttempt(isExpanded ? null : att.id)}
                className="text-xs font-semibold text-accent hover:underline flex-shrink-0 ml-2"
              >
                {isExpanded ? 'Hide' : 'Reconcile'}
              </button>
            </div>

            {isExpanded && (
              <div className="p-3.5 rounded-xl bg-secondary border border-[var(--border-color)] space-y-3 animate-fade-in">
                <p className="text-xs text-text-secondary">
                  Did this payment to <span className="text-text-primary font-medium">{att.recipientName}</span> ({att.recipientUpiId}) succeed in your UPI app?
                </p>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setOutcome('SUCCESS')}
                    className={`py-2 px-2.5 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                      outcome === 'SUCCESS' ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300' : 'border-[var(--border-color)] bg-secondary/60 text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    <Check size={14} /> Succeeded
                  </button>
                  <button
                    type="button"
                    onClick={() => setOutcome('FAILED')}
                    className={`py-2 px-2.5 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                      outcome === 'FAILED' ? 'border-rose-500 bg-rose-500/20 text-rose-300' : 'border-[var(--border-color)] bg-secondary/60 text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    <X size={14} /> Failed
                  </button>
                  <button
                    type="button"
                    onClick={() => setOutcome('CANCELLED')}
                    className={`py-2 px-2.5 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                      outcome === 'CANCELLED' ? 'border-neutral-500 bg-neutral-500/20 text-neutral-300' : 'border-[var(--border-color)] bg-secondary/60 text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    <RotateCcw size={14} /> Cancelled
                  </button>
                  <button
                    type="button"
                    onClick={() => setOutcome('UNKNOWN')}
                    className={`py-2 px-2.5 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                      outcome === 'UNKNOWN' ? 'border-amber-500 bg-amber-500/20 text-amber-300' : 'border-[var(--border-color)] bg-secondary/60 text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    <Clock size={14} /> Check Later
                  </button>
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    disabled={!outcome}
                    onClick={() => handleConfirm(att.id)}
                    className={`btn btn-primary flex-1 text-xs !py-2.5 ${!outcome ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    Submit Outcome
                  </button>
                  <button
                    type="button"
                    onClick={() => onDismiss(att.id)}
                    className="btn btn-ghost text-xs !py-2.5 text-text-muted"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

