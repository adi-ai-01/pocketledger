import { useState } from 'react';
import { ArrowLeft, ArrowUpRight, ArrowDownLeft, Banknote, CreditCard, CheckCircle2 } from 'lucide-react';
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
  const [paymentMethod, setPaymentMethod] = useState(editTxn?.paymentMethod || 'CASH');
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

    // If UPI selected in outgoing lend, prompt for UPI lifecycle verification
    if (direction === 'lend' && paymentMethod === 'UPI' && !isEdit) {
      setShowUpiModal(true);
      return;
    }

    // Direct save for Cash or Already Completed
    const payload = {
      type: direction,
      person: person.trim(),
      amount: parsedAmount,
      description: description.trim() || (direction === 'lend' ? 'Loan given' : 'Loan taken'),
      category,
      date,
      paymentMethod,
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
              onClick={() => setDirection('lend')}
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
              onClick={() => setDirection('borrow')}
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

          {matchingPerson?.upiId && (
            <p className="text-[11px] text-text-muted mt-1">
              Saved UPI: <span className="font-mono text-text-primary">{matchingPerson.upiId}</span>
            </p>
          )}
        </div>

        {/* Payment Method Selector */}
        <div>
          <label className="text-xs text-text-muted mb-1.5 block">Payment Method</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              {
                id: 'CASH',
                label: 'Cash',
                icon: Banknote,
                desc: 'Cash handed over',
              },
              {
                id: 'UPI',
                label: 'UPI App',
                icon: CreditCard,
                desc: 'Via UPI deep link',
              },
              {
                id: 'OTHER',
                label: 'Already Paid',
                icon: CheckCircle2,
                desc: 'Net banking/Card',
              },
            ].map((m) => {
              const Icon = m.icon;
              const isSelected = paymentMethod === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPaymentMethod(m.id)}
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
          <p className="text-[11px] text-text-muted mt-1.5">
            {paymentMethod === 'UPI' && direction === 'lend'
              ? 'Tapping Continue will let you verify and launch your UPI app with explicit reconciliation.'
              : paymentMethod === 'OTHER'
              ? 'Records the transaction in your ledger without initiating an external payment request.'
              : 'Records an in-person cash handover.'}
          </p>
        </div>

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
            ? paymentMethod === 'UPI'
              ? 'Proceed to UPI Verification'
              : 'Record Lending'
            : 'Record Borrowing'}
        </button>
      </form>

      {/* UPI Intent & Reconciliation Modal */}
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

