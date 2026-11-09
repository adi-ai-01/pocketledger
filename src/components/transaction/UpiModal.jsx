import { useState, useEffect } from 'react';
import { X, ExternalLink, AlertTriangle, ShieldCheck, Check, RotateCcw, Clock } from 'lucide-react';
import { isValidUpiId } from '../../domain/store-core.js';

export default function UpiModal({
  isOpen,
  recipientName = '',
  recipientUpiId = '',
  amount = 0,
  note = '',
  ledgerTxnData = {},
  store,
  onComplete,
  onCancel,
}) {
  const [upiId, setUpiId] = useState(recipientUpiId);
  const [hasLaunched, setHasLaunched] = useState(false);
  const [showReconciliation, setShowReconciliation] = useState(false);
  const [attemptId, setAttemptId] = useState(null);
  const [selectedOutcome, setSelectedOutcome] = useState(null); // 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'UNKNOWN'
  const [errorMessage, setErrorMessage] = useState(null);
  const [isDebouncing, setIsDebouncing] = useState(false);

  useEffect(() => {
    setUpiId(recipientUpiId);
  }, [recipientUpiId]);

  // Detect return when user switches back from UPI app
  useEffect(() => {
    if (!hasLaunched) return;

    const onReturn = () => {
      setShowReconciliation(true);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        onReturn();
      }
    };

    window.addEventListener('focus', onReturn);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('focus', onReturn);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [hasLaunched]);

  if (!isOpen) return null;

  const handleLaunch = () => {
    if (isDebouncing) return;
    setIsDebouncing(true);

    if (!isValidUpiId(upiId)) {
      setErrorMessage(`Invalid UPI ID '${upiId}'. Format must be username@bank (e.g. rahul@okaxis)`);
      setIsDebouncing(false);
      return;
    }

    if (!amount || amount <= 0) {
      setErrorMessage('Payment amount must be greater than 0');
      setIsDebouncing(false);
      return;
    }

    // 1. Create and persist attempt in store before launching
    const res = store.createPaymentAttempt({
      personName: recipientName,
      upiId: upiId.trim(),
      amountRupees: amount,
      note: note || `PocketLedger payment to ${recipientName}`,
    });

    if (!res.success) {
      setErrorMessage(res.error || 'Failed to initiate UPI attempt');
      setIsDebouncing(false);
      return;
    }

    setAttemptId(res.attempt.id);
    setHasLaunched(true);

    // 2. Launch external UPI intent
    try {
      window.location.href = res.attempt.intentUrl;
    } catch (err) {
      setErrorMessage(`Could not trigger UPI intent: ${err.message}`);
    }

    setTimeout(() => setIsDebouncing(false), 2000);
  };

  const handleConfirmReconciliation = () => {
    if (!selectedOutcome) {
      setErrorMessage('Please select what happened in your UPI app');
      return;
    }
    if (!attemptId) {
      setErrorMessage('Attempt ID missing');
      return;
    }

    const recRes = store.reconcilePaymentAttempt(attemptId, {
      outcome: selectedOutcome,
      ledgerTxnData: {
        ...ledgerTxnData,
        paymentMethod: 'UPI',
      },
      notes: `Reconciled as ${selectedOutcome} by user prompt`,
    });

    if (!recRes.success) {
      setErrorMessage(recRes.error || 'Reconciliation failed');
      return;
    }

    onComplete({
      attempt: recRes.attempt,
      outcome: selectedOutcome,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-card border border-[var(--border-color)] rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-blue-500/15 flex items-center justify-center text-blue-400">
              <ExternalLink size={16} />
            </div>
            <h3 className="text-base font-bold text-text-primary">
              {!showReconciliation ? 'Initiate UPI Payment' : 'Reconcile UPI Payment'}
            </h3>
          </div>
          <button
            onClick={onCancel}
            className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5"
          >
            <X size={18} />
          </button>
        </div>

        {!showReconciliation ? (
          /* Step 1: Pre-launch details & confirmation */
          <div className="space-y-3.5">
            <div className="p-3.5 rounded-xl bg-secondary/50 border border-[var(--border-color)] space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-text-muted">Recipient</span>
                <span className="font-semibold text-text-primary">{recipientName}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-text-muted">Amount</span>
                <span className="font-bold text-text-primary text-sm">₹{amount.toLocaleString('en-IN')}</span>
              </div>
              <div>
                <label className="text-[11px] text-text-muted block mb-1">Recipient UPI ID</label>
                <input
                  placeholder="e.g. name@okhdfcbank"
                  value={upiId}
                  onChange={(e) => {
                    setUpiId(e.target.value);
                    setErrorMessage(null);
                  }}
                  className="!py-2 !text-xs w-full"
                />
              </div>
            </div>

            <p className="text-[11px] text-text-muted leading-relaxed">
              PocketLedger will record this payment attempt and launch your installed UPI app (Google Pay, PhonePe, Paytm, etc.).
            </p>

            {hasLaunched && (
              <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300 flex items-center justify-between">
                <span>App opened. Returned already?</span>
                <button
                  type="button"
                  onClick={() => setShowReconciliation(true)}
                  className="underline font-semibold ml-2"
                >
                  Verify now
                </button>
              </div>
            )}

            {errorMessage && (
              <p className="text-xs text-red-400 bg-red-500/10 p-2.5 rounded-lg border border-red-500/20">
                {errorMessage}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onCancel}
                className="btn btn-ghost flex-1 text-xs py-2.5"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDebouncing}
                onClick={handleLaunch}
                className="btn btn-primary flex-1 text-xs py-2.5 flex items-center justify-center gap-1.5"
              >
                <ExternalLink size={14} /> {hasLaunched ? 'Relaunch UPI' : 'Launch UPI App'}
              </button>
            </div>
          </div>
        ) : (
          /* Step 2: Post-return Reconciliation with explicit outcome selection */
          <div className="space-y-3.5">
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 space-y-1">
              <p className="font-semibold flex items-center gap-1.5">
                <AlertTriangle size={14} className="text-amber-400 flex-shrink-0" />
                Unverified App Return
              </p>
              <p className="text-[11px] text-amber-300/80 leading-snug">
                Returning to PocketLedger does not confirm bank debit. Please report the outcome shown in your UPI app:
              </p>
            </div>

            <div className="space-y-2">
              {[
                {
                  id: 'SUCCESS',
                  title: 'Payment Successful',
                  subtitle: 'Money debited & completed in UPI app. Records transaction.',
                  icon: Check,
                  color: 'border-emerald-500/40 text-emerald-400',
                },
                {
                  id: 'FAILED',
                  title: 'Payment Failed',
                  subtitle: 'Transaction declined or failed. No ledger entry created.',
                  icon: X,
                  color: 'border-rose-500/40 text-rose-400',
                },
                {
                  id: 'CANCELLED',
                  title: 'Cancelled in UPI App',
                  subtitle: 'Backed out without paying. No ledger entry created.',
                  icon: RotateCcw,
                  color: 'border-neutral-500/40 text-neutral-400',
                },
                {
                  id: 'UNKNOWN',
                  title: 'Pending / Uncertain',
                  subtitle: 'Bank processing or status unknown. Saved for later check.',
                  icon: Clock,
                  color: 'border-amber-500/40 text-amber-400',
                },
              ].map((opt) => {
                const Icon = opt.icon;
                const isSelected = selectedOutcome === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setSelectedOutcome(opt.id);
                      setErrorMessage(null);
                    }}
                    className={`w-full text-left p-3 rounded-xl border transition-all flex items-start gap-3 ${
                      isSelected
                        ? 'border-accent bg-accent/15'
                        : 'border-[var(--border-color)] bg-secondary/30 hover:border-accent/40'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full border flex items-center justify-center mt-0.5 flex-shrink-0 ${opt.color}`}>
                      <Icon size={12} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-bold ${isSelected ? 'text-text-primary' : 'text-text-secondary'}`}>
                        {opt.title}
                      </p>
                      <p className="text-[11px] text-text-muted leading-tight mt-0.5">
                        {opt.subtitle}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {errorMessage && (
              <p className="text-xs text-red-400 bg-red-500/10 p-2.5 rounded-lg border border-red-500/20">
                {errorMessage}
              </p>
            )}

            <button
              type="button"
              disabled={!selectedOutcome}
              onClick={handleConfirmReconciliation}
              className={`btn btn-primary w-full !py-2.5 text-xs font-semibold ${
                !selectedOutcome ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {selectedOutcome === 'SUCCESS' ? 'Confirm & Record in Ledger' : 'Confirm & Save Attempt'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

