import { useState, useEffect } from 'react';
import {
  CreditCard,
  Banknote,
  CheckCircle2,
  Phone,
  AtSign,
  Copy,
  Check,
  AlertCircle,
  ExternalLink,
  Edit2,
  Plus,
} from 'lucide-react';
import { isValidUpiId } from '../../domain/store-core.js';
import { cleanPhoneNumber } from '../../domain/upi-qr.js';

export default function PaymentRecipientResolver({
  person = null, // { id, name, phone, upiId }
  amount = '',
  onAmountChange,
  channel = 'UPI', // 'UPI' | 'CASH' | 'ALREADY_COMPLETED'
  onChannelChange,
  completedMethod = 'UPI',
  onCompletedMethodChange,
  resolvedUpiId = '',
  onResolvedUpiIdChange,
  store = null,
  onLaunchUpi,
  currency = '₹',
}) {
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [isManualUpiOpen, setIsManualUpiOpen] = useState(false);
  const [saveToContact, setSaveToContact] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  const contactUpi = person?.upiId || '';
  const contactPhone = person?.phone || '';

  // Synchronize initial resolved UPI ID with contact UPI if empty
  useEffect(() => {
    if (!resolvedUpiId && contactUpi) {
      onResolvedUpiIdChange(contactUpi);
    }
  }, [contactUpi, resolvedUpiId, onResolvedUpiIdChange]);

  const hasValidUpi = Boolean(resolvedUpiId && isValidUpiId(resolvedUpiId));

  const handleCopyPhone = (numberToCopy) => {
    const cleaned = cleanPhoneNumber(numberToCopy);
    if (!cleaned) return;
    navigator.clipboard.writeText(cleaned);
    setCopiedPhone(true);
    setTimeout(() => setCopiedPhone(false), 2000);
  };

  const handleInitiateDirectUpi = () => {
    setErrorMsg(null);
    if (!person || !person.name) {
      setErrorMsg('Please select a recipient first');
      return;
    }

    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      setErrorMsg('Please enter a valid payment amount greater than 0');
      return;
    }

    if (!hasValidUpi) {
      setErrorMsg('Valid UPI ID is required (e.g. username@bank)');
      return;
    }

    // Save to person directory if requested
    if (saveToContact && person && store?.updatePerson && resolvedUpiId !== person.upiId) {
      store.updatePerson(person.id || person.name, { upiId: resolvedUpiId });
    }

    if (onLaunchUpi) {
      onLaunchUpi({ mode: 'DIRECT_UPI' });
    }
  };

  const handleInitiateGooglePay = () => {
    setErrorMsg(null);
    if (!person || !person.name) {
      setErrorMsg('Please select a recipient first');
      return;
    }

    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      setErrorMsg('Please enter a valid payment amount greater than 0');
      return;
    }

    if (onLaunchUpi) {
      onLaunchUpi({ mode: 'GOOGLE_PAY' });
    }
  };

  return (
    <div className="space-y-3 pt-2">
      {/* Payment Channel Selector */}
      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1.5">
          Payment Method
        </label>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => {
              onChannelChange('UPI');
              setErrorMsg(null);
            }}
            className={`py-2 px-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 border transition ${
              channel === 'UPI'
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-700'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5 shrink-0" />
            <span>Pay via UPI</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onChannelChange('CASH');
              setErrorMsg(null);
            }}
            className={`py-2 px-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 border transition ${
              channel === 'CASH'
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-700'
            }`}
          >
            <Banknote className="w-3.5 h-3.5 shrink-0" />
            <span>Cash</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onChannelChange('ALREADY_COMPLETED');
              setErrorMsg(null);
            }}
            className={`py-2 px-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 border transition ${
              channel === 'ALREADY_COMPLETED'
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-700'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span>Completed</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* UPI Flow: Two Clear Paths */}
      {channel === 'UPI' && (
        <div className="p-3.5 rounded-xl bg-zinc-900 border border-zinc-800 space-y-3">
          {/* ═════════════════════════════════════════════════════════ */}
          {/* PATH 1: UPI ID Available                                 */}
          {/* ═════════════════════════════════════════════════════════ */}
          {hasValidUpi && !isManualUpiOpen ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                  <AtSign className="w-3.5 h-3.5 text-emerald-400" />
                  Recipient UPI ID
                </span>
                <button
                  type="button"
                  onClick={() => setIsManualUpiOpen(true)}
                  className="text-xs text-zinc-400 hover:text-emerald-400 flex items-center gap-1 transition"
                >
                  <Edit2 className="w-3 h-3" />
                  <span>Change</span>
                </button>
              </div>

              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between">
                <span className="text-xs font-mono text-zinc-200">{resolvedUpiId}</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 flex items-center gap-1 pointer-events-none">
                  <Check className="w-3 h-3" /> Ready
                </span>
              </div>

              {/* Save to contact checkbox if different */}
              {person && resolvedUpiId !== contactUpi && (
                <label className="flex items-center gap-2 cursor-pointer text-[11px] text-zinc-400">
                  <input
                    type="checkbox"
                    checked={saveToContact}
                    onChange={(e) => setSaveToContact(e.target.checked)}
                    className="rounded border-zinc-700 text-emerald-500 focus:ring-0 bg-zinc-950"
                  />
                  <span>Save this UPI ID to {person.name}&rsquo;s contact</span>
                </label>
              )}

              {/* Action Button: Pay via UPI App */}
              <button
                type="button"
                onClick={handleInitiateDirectUpi}
                className="w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-950/40"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>
                  Pay {amount ? `${currency}${amount}` : ''} via UPI App
                </span>
              </button>
            </div>
          ) : isManualUpiOpen ? (
            /* User is manually entering or changing UPI ID */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                  <AtSign className="w-3.5 h-3.5 text-emerald-400" />
                  Enter Recipient UPI ID
                </span>
                <button
                  type="button"
                  onClick={() => setIsManualUpiOpen(false)}
                  className="text-xs text-zinc-400 hover:text-zinc-200 transition"
                >
                  Cancel
                </button>
              </div>

              <div className="relative flex items-center">
                <input
                  type="text"
                  value={resolvedUpiId}
                  onChange={(e) => {
                    onResolvedUpiIdChange(e.target.value.trim());
                    setErrorMsg(null);
                  }}
                  placeholder="username@bank (e.g. rahul@okaxis)"
                  autoFocus
                  className="w-full h-10 px-3 pr-20 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500 outline-none font-mono"
                />
                {resolvedUpiId && isValidUpiId(resolvedUpiId) ? (
                  <span className="absolute right-2 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 flex items-center gap-1 pointer-events-none">
                    <Check className="w-3 h-3" /> Valid
                  </span>
                ) : resolvedUpiId ? (
                  <span className="absolute right-2 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/20 pointer-events-none">
                    Format
                  </span>
                ) : null}
              </div>

              {person && resolvedUpiId && resolvedUpiId !== contactUpi && (
                <label className="flex items-center gap-2 cursor-pointer text-[11px] text-zinc-400">
                  <input
                    type="checkbox"
                    checked={saveToContact}
                    onChange={(e) => setSaveToContact(e.target.checked)}
                    className="rounded border-zinc-700 text-emerald-500 focus:ring-0 bg-zinc-950"
                  />
                  <span>Save this UPI ID to {person.name}&rsquo;s contact</span>
                </label>
              )}

              {hasValidUpi ? (
                <button
                  type="button"
                  onClick={handleInitiateDirectUpi}
                  className="w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-950/40"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Pay {amount ? `${currency}${amount}` : ''} via UPI App</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleInitiateGooglePay}
                  className="w-full h-11 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-xs flex items-center justify-center gap-2 transition"
                >
                  <CreditCard className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Open Google Pay Without UPI ID</span>
                </button>
              )}
            </div>
          ) : (
            /* ═════════════════════════════════════════════════════════ */
            /* PATH 2: No UPI ID Available (Open Google Pay)             */
            /* ═════════════════════════════════════════════════════════ */
            <div className="space-y-3">
              <div className="space-y-1">
                <span className="text-xs font-semibold text-zinc-200">
                  No UPI ID saved for {person?.name || 'recipient'}
                </span>
                <p className="text-[11px] text-zinc-400 leading-snug">
                  Open Google Pay to send payment using their phone number, QR code, or contact name.
                </p>
              </div>

              {/* Display Phone if available with 1-tap Copy */}
              {contactPhone && (
                <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 text-zinc-300">
                    <Phone className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="font-mono text-xs">{contactPhone}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyPhone(contactPhone)}
                    className="py-1 px-2.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-[11px] font-medium border border-zinc-700 flex items-center gap-1 transition"
                  >
                    {copiedPhone ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" /> Copy Phone
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Prominent Action Button: Open Google Pay */}
              <button
                type="button"
                onClick={handleInitiateGooglePay}
                className="w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-950/40"
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>Open Google Pay</span>
              </button>

              {/* Option to enter UPI ID manually */}
              <div className="pt-1 text-center">
                <button
                  type="button"
                  onClick={() => setIsManualUpiOpen(true)}
                  className="text-[11px] text-zinc-400 hover:text-emerald-400 inline-flex items-center gap-1 transition"
                >
                  <Plus className="w-3 h-3" />
                  <span>Enter UPI ID instead</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Completed Payment Method Selection */}
      {channel === 'ALREADY_COMPLETED' && (
        <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2">
          <label className="block text-xs font-medium text-zinc-400">
            Payment Method Used Outside App
          </label>
          <div className="grid grid-cols-4 gap-2">
            {['UPI', 'NETBANKING', 'CARD', 'OTHER'].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onCompletedMethodChange(m)}
                className={`py-1.5 px-2 rounded-lg text-xs font-medium border transition ${
                  completedMethod === m
                    ? 'bg-zinc-800 text-emerald-400 border-emerald-500/30'
                    : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                {m === 'NETBANKING' ? 'NetBank' : m}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
