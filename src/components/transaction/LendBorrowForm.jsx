import { useState } from 'react';
import { ArrowLeft, ArrowUpRight, ArrowDownLeft, Banknote, CreditCard, CheckCircle2, ExternalLink } from 'lucide-react';
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
      finalPaymentMethod = incomingMethod;
    }

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
            className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors mb-1"
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
              className={`h-[46px] px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                direction === 'lend'
                  ? 'border-accent bg-accent/15 text-text-primary'
                  : 'border-[var(--border-color)] bg-secondary/40 text-text-secondary hover:border-accent/40'
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
              className={`h-[46px] px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                direction === 'borrow'
                  ? 'border-accent bg-accent/15 text-text-primary'
                  : 'border-[var(--border-color)] bg-secondary/40 text-text-secondary hover:border-accent/40'
              }`}
            >
              <ArrowDownLeft size={16} className="text-rose-400" /> Borrow (You Owe Them)
            </button>
          </div>
        )}

        {/* Amount */}
        <div>
          <label className="text-xs font-medium text-text-secondary mb-1.5 block">
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
            className="w-full h-[52px] text-2xl font-bold text-center tracking-tight bg-secondary border border-[var(--border-color)] rounded-xl text-text-primary focus:border-accent outline-none"
            autoFocus
          />
        </div>

        {/* Person Selector */}
        <div>
          <label className="text-xs font-medium text-text-secondary mb-1.5 block">
            {direction === 'lend' ? 'Who are you lending to?' : 'Who are you borrowing from?'}
          </label>
          <input
            list="people-datalist"
            placeholder="Contact name (e.g. Vikram)"
            value={person}
            onChange={(e) => {
              setPerson(e.target.value);
              setErrorMessage(null);
            }}
            className="w-full h-[48px] px-3.5 bg-secondary border border-[var(--border-color)] rounded-xl text-text-primary text-sm focus:border-accent outline-none"
          />
          <datalist id="people-datalist">
            {people.map((p) => (
              <option key={p.id} value={p.name} />
            ))}
          </datalist>

          {matchingPerson?.upiId && direction === 'lend' && (
            <p className="text-xs text-text-muted mt-1.5">
              Recipient UPI: <span className="font-mono text-text-primary">{matchingPerson.upiId}</span>
            </p>
          )}
        </div>

        {/* Payment Channel & Recording Status Selection */}
        {direction === 'lend' ? (
          <div className="space-y-2">
            <label className="text-xs font-medium text-text-secondary block">Payment & Recording Option</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setOutgoingChannel('UPI_LAUNCH')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  outgoingChannel === 'UPI_LAUNCH'
                    ? 'border-accent bg-accent/15'
                    : 'border-[var(--border-color)] bg-secondary/40 hover:border-accent/40'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <ExternalLink size={14} className={outgoingChannel === 'UPI_LAUNCH' ? 'text-accent' : 'text-text-muted'} />
                  <span className="text-xs font-semibold text-text-primary">Launch UPI</span>
                </div>
                <p className="text-[11px] text-text-muted leading-tight">Pay via UPI app</p>
              </button>

              <button
                type="button"
                onClick={() => setOutgoingChannel('CASH')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  outgoingChannel === 'CASH'
                    ? 'border-accent bg-accent/15'
                    : 'border-[var(--border-color)] bg-secondary/40 hover:border-accent/40'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Banknote size={14} className={outgoingChannel === 'CASH' ? 'text-accent' : 'text-text-muted'} />
                  <span className="text-xs font-semibold text-text-primary">Cash</span>
                </div>
                <p className="text-[11px] text-text-muted leading-tight">Cash handed over</p>
              </button>

              <button
                type="button"
                onClick={() => setOutgoingChannel('ALREADY_COMPLETED')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  outgoingChannel === 'ALREADY_COMPLETED'
                    ? 'border-accent bg-accent/15'
                    : 'border-[var(--border-color)] bg-secondary/40 hover:border-accent/40'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <CheckCircle2 size={14} className={outgoingChannel === 'ALREADY_COMPLETED' ? 'text-accent' : 'text-text-muted'} />
                  <span className="text-xs font-semibold text-text-primary">Completed</span>
                </div>
                <p className="text-[11px] text-text-muted leading-tight">Already transferred</p>
              </button>
            </div>

            {/* Sub-selector for actual method when already completed */}
            {outgoingChannel === 'ALREADY_COMPLETED' && (
              <div className="p-3.5 rounded-xl bg-secondary/40 border border-[var(--border-color)] space-y-2 animate-fade-in">
                <label className="text-xs text-text-secondary block">Actual method used:</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'UPI', label: 'UPI' },
                    { id: 'OTHER', label: 'Net Banking' },
                    { id: 'CASH', label: 'Cash' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setCompletedMethod(m.id)}
                      className={`h-[40px] px-2 rounded-lg border text-xs font-medium transition-all ${
                        completedMethod === m.id
                          ? 'border-accent bg-accent/20 text-text-primary font-semibold'
                          : 'border-[var(--border-color)] bg-secondary/60 text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* INCOMING BORROW: strictly recorded money received */
          <div className="space-y-2">
            <label className="text-xs font-medium text-text-secondary block">How did you receive the money?</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'UPI', label: 'UPI Transfer', icon: CreditCard },
                { id: 'CASH', label: 'Cash', icon: Banknote },
                { id: 'OTHER', label: 'Bank / Other', icon: CreditCard },
              ].map((m) => {
                const Icon = m.icon;
                const isSelected = incomingMethod === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setIncomingMethod(m.id)}
                    className={`h-[46px] px-2 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
                      isSelected
                        ? 'border-accent bg-accent/15 text-text-primary font-semibold'
                        : 'border-[var(--border-color)] bg-secondary/40 text-text-secondary hover:border-accent/40'
                    }`}
                  >
                    <Icon size={14} /> {m.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Description */}
        <div>
          <label className="text-xs font-medium text-text-secondary mb-1.5 block">Description</label>
          <input
            placeholder={direction === 'lend' ? 'e.g. Loan for concert ticket' : 'e.g. Borrowed for cab'}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full h-[48px] px-3.5 bg-secondary border border-[var(--border-color)] rounded-xl text-text-primary text-sm focus:border-accent outline-none"
          />
        </div>

        {/* Category & Date Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1.5 block">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full h-[48px] px-3 bg-secondary border border-[var(--border-color)] rounded-xl text-text-primary text-sm focus:border-accent outline-none"
            >
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1.5 block">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full h-[48px] px-3 bg-secondary border border-[var(--border-color)] rounded-xl text-text-primary text-sm focus:border-accent outline-none"
            />
          </div>
        </div>

        {errorMessage && (
          <p className="text-xs text-rose-400 bg-rose-500/10 p-3 rounded-xl border border-rose-500/20">
            {errorMessage}
          </p>
        )}

        {/* Submit Button */}
        <button type="submit" className="btn btn-primary w-full h-[48px] mt-2 font-semibold rounded-xl">
          {isEdit
            ? 'Save Changes'
            : direction === 'lend'
            ? outgoingChannel === 'UPI_LAUNCH'
              ? 'Continue to UPI App'
              : 'Record Loan Given'
            : 'Record Loan Received'}
        </button>
      </form>

      {/* Outgoing UPI Modal (only for lend with UPI launch) */}
      {showUpiModal && store && (
        <UpiModal
          isOpen={showUpiModal}
          recipientName={person.trim()}
          recipientUpiId={matchingPerson?.upiId || ''}
          amount={parseFloat(amount) || 0}
          note={description.trim() || `PocketLedger loan to ${person.trim()}`}
          ledgerTxnData={{
            type: 'lend',
            person: person.trim(),
            amount: parseFloat(amount) || 0,
            description: description.trim() || 'Loan given via UPI',
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
