import { useState } from 'react';
import { ArrowLeft, ArrowUpRight, ArrowDownLeft, Banknote, CreditCard, CheckCircle2, ShieldCheck, ExternalLink } from 'lucide-react';
import UpiModal from './UpiModal.jsx';

export default function LendBorrowForm({
  initialDirection = 'lend', // 'lend' | 'borrow'
  editTxn,
  people = [],
  categories = [],
  settings = {},
  store,
  onSave,
  onBack,
}) {
  const currency = settings.currency || '₹';
  const isEdit = !!editTxn;

  const derivedInitialDirection = editTxn
    ? (editTxn.action === 'borrow' || editTxn.type === 'take' ? 'borrow' : 'lend')
    : initialDirection;

  const [direction, setDirection] = useState(derivedInitialDirection);
  const [person, setPerson] = useState(editTxn?.person || '');
  const [amount, setAmount] = useState(editTxn ? String(editTxn.amount) : '');
  const [description, setDescription] = useState(editTxn?.description || '');
  const [category, setCategory] = useState(editTxn?.category || (categories[0] || 'Other'));
  const [date, setDate] = useState(
    editTxn?.date ? editTxn.date.slice(0, 10) : new Date().toISOString().slice(0, 10)
  );

  // For Outgoing Lend: channel can be 'UPI_LAUNCH' | 'CASH' | 'ALREADY_COMPLETED'
  const [outgoingChannel, setOutgoingChannel] = useState(
    editTxn?.paymentMethod === 'CASH'
      ? 'CASH'
      : editTxn
      ? 'ALREADY_COMPLETED'
      : 'CASH'
  );

  // Actual payment method when already completed
  const [completedMethod, setCompletedMethod] = useState(editTxn?.paymentMethod || 'UPI');

  // For Incoming Borrow: method can be 'UPI' | 'CASH' | 'OTHER'
  const [incomingMethod, setIncomingMethod] = useState(editTxn?.paymentMethod || 'UPI');

  const [showUpiModal, setShowUpiModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  // Selected person details
  const matchingPerson = people.find((p) => p.name.toLowerCase() === person.trim().toLowerCase());
  const personUpiId = matchingPerson?.upiId || '';

  const handleSubmit = (e) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      setErrorMessage('Please enter a valid amount greater than 0');
      return;
    }

    if (!person.trim()) {
      setErrorMessage('Please select or enter the counterparty person');
      return;
    }

    // Determine final payment method and whether external app is needed
    let finalPaymentMethod = 'CASH';

    if (direction === 'lend') {
      if (outgoingChannel === 'UPI_LAUNCH') {
        finalPaymentMethod = 'UPI';
        // Launch external UPI intent via modal with return reconciliation
        if (!isEdit) {
          setShowUpiModal(true);
          return;
        }
      } else if (outgoingChannel === 'CASH') {
        finalPaymentMethod = 'CASH';
      } else if (outgoingChannel === 'ALREADY_COMPLETED') {
        finalPaymentMethod = completedMethod;
      }
    } else {
      // Borrowing: strictly incoming money received
      finalPaymentMethod = incomingMethod;
    }

    // Direct save without initiating external payment
    const payload = {
      type: direction,
      person: person.trim(),
      amount: parsedAmount,
      description: description.trim() || (direction === 'lend' ? 'Loan given' : 'Loan taken'),
      category,
      date,
      paymentMethod: finalPaymentMethod,
    };

    const res = onSave(payload);
    if (res && res.success === false) {
      setErrorMessage(res.error || 'Failed to record transaction');
    }
  };

  const handleUpiModalComplete = ({ outcome }) => {
    setShowUpiModal(false);
    if (outcome === 'SUCCESS') {
      // Transaction already recorded during UPI reconciliation
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4 animate-fade-in">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors mb-1"
          >
            <ArrowLeft size={14} /> Back to actions
          </button>
        )}

        {/* Direction Switcher (Lend vs Borrow) */}
        {!isEdit && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setDirection('lend');
                setErrorMessage(null);
              }}
              className={`py-2.5 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                direction === 'lend'
                  ? 'border-accent bg-accent/15 text-text-primary'
                  : 'border-[var(--border-color)] bg-secondary/40 text-text-muted hover:border-accent/40'
              }`}
            >
              <ArrowUpRight size={16} className="text-emerald-400" /> Lend (They Owe You)
            </button>
            <button
              type="button"
              onClick={() => {
                setDirection('borrow');
                setErrorMessage(null);
              }}
              className={`py-2.5 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                direction === 'borrow'
                  ? 'border-accent bg-accent/15 text-text-primary'
                  : 'border-[var(--border-color)] bg-secondary/40 text-text-muted hover:border-accent/40'
              }`}
            >
              <ArrowDownLeft size={16} className="text-rose-400" /> Borrow (You Owe Them)
            </button>
          </div>
        )}

        {/* Direction Indicator */}
        <div className={`p-2.5 rounded-xl border text-xs flex items-center gap-2 ${
          direction === 'lend'
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
            : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
        }`}>
          {direction === 'lend' ? (
            <>
              <ArrowUpRight size={15} />
              <span>Outgoing loan: You are giving money. Person will owe you.</span>
            </>
          ) : (
            <>
              <ArrowDownLeft size={15} />
              <span>Incoming loan: You received money. You will owe person.</span>
            </>
          )}
        </div>

        {/* Amount */}
        <div>
          <label className="text-xs text-text-muted mb-1 block">
            {direction === 'lend' ? 'Amount to Lend' : 'Amount to Borrow'} ({currency})
          </label>
          <input
            type="number"
            step="any"
            inputMode="decimal"
            placeholder="0"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setErrorMessage(null);
            }}
            className="!text-3xl !font-bold !py-3 text-center tracking-tight"
            autoFocus
          />
        </div>

        {/* Person Selector */}
        <div>
          <label className="text-xs text-text-muted mb-1 block">
            {direction === 'lend' ? 'Who are you lending to?' : 'Who are you borrowing from?'}
          </label>
          <input
            list="people-datalist"
            placeholder="Friend's name (e.g. Vikram)"
            value={person}
            onChange={(e) => {
              setPerson(e.target.value);
              setErrorMessage(null);
            }}
            className="!py-2.5 !text-sm w-full"
          />
          <datalist id="people-datalist">
            {people.map((p) => (
              <option key={p.id} value={p.name} />
            ))}
          </datalist>

          {matchingPerson?.upiId && direction === 'lend' && (
            <p className="text-[11px] text-text-muted mt-1">
              Recipient UPI: <span className="font-mono text-text-primary">{matchingPerson.upiId}</span>
            </p>
          )}
        </div>

        {/* Payment Channel & Recording Status Selection */}
        {direction === 'lend' ? (
          /* OUTGOING LEND: Explicit choice between UPI (Launch App), Cash, or Already Completed */
          <div className="space-y-2">
            <label className="text-xs text-text-muted block">Payment & Recording Option</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setOutgoingChannel('UPI_LAUNCH')}
                className={`py-2 px-2 rounded-xl border text-left transition-all ${
                  outgoingChannel === 'UPI_LAUNCH'
                    ? 'border-accent bg-accent/15'
                    : 'border-[var(--border-color)] bg-secondary/40 hover:border-accent/40'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <ExternalLink size={13} className={outgoingChannel === 'UPI_LAUNCH' ? 'text-accent' : 'text-text-muted'} />
                  <span className="text-xs font-bold text-text-primary">Launch UPI</span>
                </div>
                <p className="text-[10px] text-text-muted leading-tight">Pay via UPI app</p>
              </button>

              <button
                type="button"
                onClick={() => setOutgoingChannel('CASH')}
                className={`py-2 px-2 rounded-xl border text-left transition-all ${
                  outgoingChannel === 'CASH'
                    ? 'border-accent bg-accent/15'
                    : 'border-[var(--border-color)] bg-secondary/40 hover:border-accent/40'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Banknote size={13} className={outgoingChannel === 'CASH' ? 'text-accent' : 'text-text-muted'} />
                  <span className="text-xs font-bold text-text-primary">Cash</span>
                </div>
                <p className="text-[10px] text-text-muted leading-tight">Cash handed over</p>
              </button>

              <button
                type="button"
                onClick={() => setOutgoingChannel('ALREADY_COMPLETED')}
                className={`py-2 px-2 rounded-xl border text-left transition-all ${
                  outgoingChannel === 'ALREADY_COMPLETED'
                    ? 'border-accent bg-accent/15'
                    : 'border-[var(--border-color)] bg-secondary/40 hover:border-accent/40'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <CheckCircle2 size={13} className={outgoingChannel === 'ALREADY_COMPLETED' ? 'text-accent' : 'text-text-muted'} />
                  <span className="text-xs font-bold text-text-primary">Completed</span>
                </div>
                <p className="text-[10px] text-text-muted leading-tight">Already transferred</p>
              </button>
            </div>

            {/* Sub-selector for actual method when already completed */}
            {outgoingChannel === 'ALREADY_COMPLETED' && (
              <div className="p-3 rounded-xl bg-secondary/40 border border-[var(--border-color)] space-y-1.5 animate-fade-in">
                <label className="text-[11px] text-text-muted block">Actual method used outside PocketLedger:</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'UPI', label: 'UPI / QR' },
                    { id: 'OTHER', label: 'Net Banking' },
                    { id: 'CASH', label: 'Cash' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setCompletedMethod(m.id)}
                      className={`py-1.5 px-2 rounded-lg border text-xs font-medium transition-all ${
                        completedMethod === m.id
                          ? 'border-accent bg-accent/20 text-text-primary font-bold'
                          : 'border-white/10 text-text-muted hover:text-text-primary'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-text-muted leading-tight mt-1">
                  Records loan in ledger directly without launching external UPI intent.
                </p>
              </div>
            )}
          </div>
        ) : (
          /* INCOMING BORROW: Money received into user's possession */
          <div className="space-y-2">
            <label className="text-xs text-text-muted block">How did you receive this money?</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'UPI', label: 'UPI / QR', icon: CreditCard, desc: 'Received in UPI' },
                { id: 'CASH', label: 'Cash', icon: Banknote, desc: 'Received in cash' },
                { id: 'OTHER', label: 'Bank / Other', icon: ShieldCheck, desc: 'IMPS / NEFT' },
              ].map((m) => {
                const Icon = m.icon;
                const isSelected = incomingMethod === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setIncomingMethod(m.id)}
                    className={`py-2 px-2 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'border-accent bg-accent/15'
                        : 'border-[var(--border-color)] bg-secondary/40 hover:border-accent/40'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Icon size={14} className={isSelected ? 'text-accent' : 'text-text-muted'} />
                      <span className="text-xs font-bold text-text-primary">{m.label}</span>
                    </div>
                    <p className="text-[10px] text-text-muted leading-tight">{m.desc}</p>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-text-muted">
              Borrowing records money received into your possession. No outgoing UPI intent will be launched.
            </p>
          </div>
        )}

        {/* Description */}
        <div>
          <label className="text-xs text-text-muted mb-1 block">Description</label>
          <input
            placeholder={direction === 'lend' ? 'e.g. Loan for concert ticket' : 'e.g. Borrowed for rent'}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="!py-2.5 !text-sm"
          />
        </div>

        {/* Category & Date Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-text-muted mb-1 block">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="!py-2.5 !text-sm w-full"
            >
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-text-muted mb-1 block">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="!py-2.5 !text-sm w-full"
            />
          </div>
        </div>

        {errorMessage && (
          <p className="text-xs text-red-400 bg-red-500/10 p-2.5 rounded-lg border border-red-500/20">
            {errorMessage}
          </p>
        )}

        {/* Submit Button */}
        <button type="submit" className="btn btn-primary w-full mt-2 !py-3 font-semibold">
          {isEdit
            ? 'Save Changes'
            : direction === 'lend'
            ? outgoingChannel === 'UPI_LAUNCH'
              ? 'Proceed to UPI Verification'
              : 'Record Lending'
            : 'Record Borrowing (Money Received)'}
        </button>
      </form>

      {/* Outgoing UPI Intent & Reconciliation Modal */}
      {showUpiModal && store && (
        <UpiModal
          isOpen={showUpiModal}
          recipientName={person.trim()}
          recipientUpiId={personUpiId}
          amount={parseFloat(amount) || 0}
          note={description || 'PocketLedger loan'}
          ledgerTxnData={{
            type: 'lend',
            person: person.trim(),
            amount: parseFloat(amount) || 0,
            description: description.trim() || 'Lent via UPI',
            category,
            date,
          }}
          store={store}
          onComplete={handleUpiModalComplete}
          onCancel={() => setShowUpiModal(false)}
        />
      )}
    </>
  );
}
