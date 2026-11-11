import { useState, useEffect } from 'react';
import {
  X,
  ExternalLink,
  AlertTriangle,
  Check,
  RotateCcw,
  Clock,
  Phone,
  Copy,
  Lightbulb,
  CreditCard,
} from 'lucide-react';
import { isValidUpiId } from '../../domain/store-core.js';
import { cleanPhoneNumber } from '../../domain/upi-qr.js';

export default function UpiModal({
  isOpen,
  recipientId = null,
  recipientName = '',
  recipientUpiId = '',
  recipientPhone = '',
  amount = 0,
  mode = 'DIRECT_UPI', // 'DIRECT_UPI' | 'GOOGLE_PAY'
  note = '',
  ledgerTxnData = {},
  store,
  onComplete,
  onCancel,
}) {
  const activeMode = mode || (recipientUpiId && isValidUpiId(recipientUpiId) ? 'DIRECT_UPI' : 'GOOGLE_PAY');
  const [upiId, setUpiId] = useState(recipientUpiId);
  const [hasLaunched, setHasLaunched] = useState(false);
  const [showReconciliation, setShowReconciliation] = useState(false);
  const [attemptId, setAttemptId] = useState(null);
  const [selectedOutcome, setSelectedOutcome] = useState(null); // 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'UNKNOWN'
  const [errorMessage, setErrorMessage] = useState(null);
  const [isDebouncing, setIsDebouncing] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);

  // Fallback to store contact phone if not passed
  const contactPhone = recipientPhone || (store?.state?.people?.find(
    (p) => p.name === recipientName || (recipientId && p.id === recipientId)
  )?.phone || '');

  useEffect(() => {
    setUpiId(recipientUpiId);
  }, [recipientUpiId]);

  // For GOOGLE_PAY mode: automatically initiate a persistent payment attempt on open
  useEffect(() => {
    if (isOpen && activeMode === 'GOOGLE_PAY' && !attemptId && store && recipientName && amount > 0) {
      const res = store.createPaymentAttempt({
        type: 'GOOGLE_PAY',
        recipientPartyId: recipientId,
        personName: recipientName,
        upiId: '',
        amountRupees: amount,
        note: note || `PocketLedger payment to ${recipientName}`,
      });
      if (res.success) {
        setAttemptId(res.attempt.id);
      }
    }
  }, [isOpen, activeMode, attemptId, store, recipientId, recipientName, amount, note]);

  // Detect app switch / return when user returns to PocketLedger
  useEffect(() => {
    if (!hasLaunched && activeMode === 'DIRECT_UPI') return;

    const onReturn = () => {
      if (activeMode === 'DIRECT_UPI') {
        setShowReconciliation(true);
      }
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
  }, [hasLaunched, activeMode]);

  if (!isOpen) return null;

  const handleCopyPhone = (numberToCopy) => {
    const cleaned = cleanPhoneNumber(numberToCopy);
    if (!cleaned) return;
    navigator.clipboard.writeText(cleaned);
    setCopiedPhone(true);
    setTimeout(() => setCopiedPhone(false), 2000);
  };

  const handleLaunchDirectUpi = () => {
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
      type: 'UPI',
      recipientPartyId: recipientId,
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

    // 2. Launch external UPI intent (browsable NPCI standard)
    try {
      window.location.href = res.attempt.intentUrl;
    } catch (err) {
      setErrorMessage(`Could not trigger UPI intent: ${err.message}`);
    }

    setTimeout(() => setIsDebouncing(false), 2000);
  };

  const handleConfirmReconciliation = () => {
    if (!selectedOutcome) {
      setErrorMessage('Please select what happened with your payment');
      return;
    }
    if (!attemptId) {
      setErrorMessage('Payment attempt reference missing');
      return;
    }

    const recRes = store.reconcilePaymentAttempt(attemptId, {
      outcome: selectedOutcome,
      ledgerTxnData: {
        ...ledgerTxnData,
        paymentMethod: 'UPI',
      },
      notes: `Reconciled as ${selectedOutcome} via ${activeMode === 'GOOGLE_PAY' ? 'Google Pay handoff' : 'UPI intent'}`,
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
      <div className="bg-card border border-[var(--border-color)] rounded-2xl w-full max-w-sm p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {activeMode === 'GOOGLE_PAY' ? (
              <CreditCard size={18} className="text-emerald-400" />
            ) : (
              <ExternalLink size={18} className="text-accent" />
            )}
            <h3 className="text-base font-semibold text-text-primary">
              {activeMode === 'GOOGLE_PAY'
                ? 'Pay via Google Pay'
                : !showReconciliation
                ? 'Initiate UPI Payment'
                : 'Reconcile UPI Payment'}
            </h3>
          </div>
          <button
            onClick={onCancel}
            className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-secondary/40"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* PATH 2: GOOGLE PAY HANDOFF (When UPI ID is not available) */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {activeMode === 'GOOGLE_PAY' ? (
          <div className="space-y-4">
            {/* Payment Details Card */}
            <div className="p-4 rounded-xl bg-secondary/50 border border-[var(--border-color)] space-y-2.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-text-muted">Recipient</span>
                <span className="font-semibold text-text-primary">{recipientName}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-text-muted">Amount to Pay</span>
                <span className="font-bold text-emerald-400 text-base tabular-nums">
                  ₹{Number(amount).toLocaleString('en-IN')}
                </span>
              </div>

              {contactPhone && (
                <div className="pt-2 border-t border-[var(--border-color)] flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                    <Phone size={13} className="text-emerald-400" />
                    <span className="font-mono">{contactPhone}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyPhone(contactPhone)}
                    className="py-1 px-2.5 rounded-lg bg-secondary text-xs font-medium text-text-primary border border-[var(--border-color)] hover:bg-secondary/80 flex items-center gap-1 transition"
                  >
                    {copiedPhone ? (
                      <>
                        <Check size={12} className="text-emerald-400" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy size={12} /> Copy Phone
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Honest instructions with Android shortcut guidance */}
            <div className="p-3.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs space-y-2">
              <p className="font-medium text-zinc-200">How to pay in Google Pay:</p>
              <ol className="text-zinc-400 space-y-1.5 list-decimal list-inside text-[11px] leading-relaxed">
                <li>Switch to the Google Pay app on your device.</li>
                <li>Find <strong>{recipientName}</strong> by phone number, QR code, or contact list.</li>
                <li>Send exactly <strong>₹{Number(amount).toLocaleString('en-IN')}</strong>.</li>
              </ol>

              <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-300 flex items-start gap-2">
                <Lightbulb size={14} className="text-emerald-400 shrink-0 mt-0.5" />
                <div className="leading-snug">
                  <span className="font-semibold">Quick Shortcut:</span> Long-press the Google Pay app icon on your home screen and tap <strong>&ldquo;Scan any QR code&rdquo;</strong>, or swipe down for Android&rsquo;s <strong>Quick Settings QR scanner</strong>.
                </div>
              </div>
            </div>

            {/* Reconciliation outcome prompt */}
            <div className="space-y-2 pt-1">
              <label className="text-xs font-semibold text-text-primary block">
                Confirm what happened in Google Pay:
              </label>

              <div className="space-y-2">
                {[
                  {
                    id: 'SUCCESS',
                    title: 'Payment Completed',
                    subtitle: 'Money sent in Google Pay. Records transaction in ledger.',
                    icon: Check,
                    color: 'border-emerald-500/40 text-emerald-400',
                  },
                  {
                    id: 'CANCELLED',
                    title: 'Cancelled / Did Not Pay',
                    subtitle: 'Backed out or cancelled. No ledger entry created.',
                    icon: RotateCcw,
                    color: 'border-neutral-500/40 text-neutral-400',
                  },
                  {
                    id: 'UNKNOWN',
                    title: 'Unsure / Still Pending',
                    subtitle: 'Payment pending or status unknown. Saved for later check.',
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
                          ? 'border-emerald-500 bg-emerald-500/15'
                          : 'border-[var(--border-color)] bg-secondary/30 hover:border-emerald-500/40'
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-full border flex items-center justify-center mt-0.5 shrink-0 ${opt.color}`}
                      >
                        <Icon size={12} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-xs font-semibold ${
                            isSelected ? 'text-text-primary' : 'text-text-secondary'
                          }`}
                        >
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
            </div>

            {errorMessage && (
              <p className="text-xs text-rose-400 bg-rose-500/10 p-3 rounded-xl border border-rose-500/20">
                {errorMessage}
              </p>
            )}

            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                onClick={onCancel}
                className="btn btn-ghost flex-1 text-xs !py-2.5"
              >
                Close
              </button>
              <button
                type="button"
                disabled={!selectedOutcome}
                onClick={handleConfirmReconciliation}
                className={`btn btn-primary flex-1 text-xs !py-2.5 font-semibold ${
                  !selectedOutcome ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {selectedOutcome === 'SUCCESS'
                  ? 'Confirm & Record'
                  : selectedOutcome === 'CANCELLED'
                  ? 'Confirm Cancelled'
                  : selectedOutcome === 'UNKNOWN'
                  ? 'Save for Review'
                  : 'Select Outcome'}
              </button>
            </div>
          </div>
        ) : !showReconciliation ? (
          /* ═══════════════════════════════════════════════════════════ */
          /* PATH 1: DIRECT UPI PAYMENT (When UPI ID is available)      */
          /* ═══════════════════════════════════════════════════════════ */
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-secondary/50 border border-[var(--border-color)] space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="text-text-muted">Recipient</span>
                <span className="font-medium text-text-primary">{recipientName}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-text-muted">Amount</span>
                <span className="font-semibold text-text-primary text-sm tabular-nums">
                  ₹{Number(amount).toLocaleString('en-IN')}
                </span>
              </div>
              <div>
                <label className="text-xs text-text-secondary block mb-1.5">Recipient UPI ID</label>
                <input
                  placeholder="e.g. name@okhdfcbank"
                  value={upiId}
                  onChange={(e) => {
                    setUpiId(e.target.value);
                    setErrorMessage(null);
                  }}
                  className="w-full h-[48px] px-3 bg-secondary border border-[var(--border-color)] rounded-xl text-text-primary text-sm font-mono focus:border-accent outline-none"
                />
              </div>
            </div>

            <p className="text-xs text-text-muted leading-relaxed">
              PocketLedger will record this payment attempt and launch your installed UPI application.
            </p>

            {hasLaunched && (
              <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300 flex items-center justify-between">
                <span>App opened. Returned already?</span>
                <button
                  type="button"
                  onClick={() => setShowReconciliation(true)}
                  className="underline font-semibold ml-2 hover:text-blue-200"
                >
                  Verify now
                </button>
              </div>
            )}

            {errorMessage && (
              <p className="text-xs text-rose-400 bg-rose-500/10 p-3 rounded-xl border border-rose-500/20">
                {errorMessage}
              </p>
            )}

            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                onClick={onCancel}
                className="btn btn-ghost flex-1 text-xs !py-2.5"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDebouncing}
                onClick={handleLaunchDirectUpi}
                className="btn btn-primary flex-1 text-xs !py-2.5 flex items-center justify-center gap-1.5 font-semibold"
              >
                <ExternalLink size={14} /> {hasLaunched ? 'Relaunch UPI' : 'Launch UPI App'}
              </button>
            </div>
          </div>
        ) : (
          /* Step 2: Post-return Reconciliation for Direct UPI */
          <div className="space-y-4">
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 space-y-1">
              <p className="font-semibold flex items-center gap-1.5">
                <AlertTriangle size={15} className="text-amber-400 shrink-0" />
                Unverified App Return
              </p>
              <p className="text-xs text-amber-300/80 leading-snug">
                Returning to PocketLedger does not confirm bank debit. Please confirm the outcome shown in your UPI app:
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
                    <div
                      className={`w-5 h-5 rounded-full border flex items-center justify-center mt-0.5 shrink-0 ${opt.color}`}
                    >
                      <Icon size={12} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-xs font-semibold ${
                          isSelected ? 'text-text-primary' : 'text-text-secondary'
                        }`}
                      >
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
              <p className="text-xs text-rose-400 bg-rose-500/10 p-3 rounded-xl border border-rose-500/20">
                {errorMessage}
              </p>
            )}

            <button
              type="button"
              disabled={!selectedOutcome}
              onClick={handleConfirmReconciliation}
              className={`btn btn-primary w-full h-[48px] text-xs font-semibold rounded-xl ${
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
