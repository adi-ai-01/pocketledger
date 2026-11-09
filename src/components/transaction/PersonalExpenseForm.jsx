import { useState } from 'react';
import { User, CreditCard, Banknote, HelpCircle, ArrowLeft } from 'lucide-react';

export default function PersonalExpenseForm({
  editTxn,
  people = [],
  categories = [],
  settings = {},
  onSave,
  onBack,
}) {
  const currency = settings.currency || '₹';
  const isEdit = !!editTxn;

  // Initial state derivation
  const initialPaidBy = editTxn?.payer && editTxn.payer !== 'user' ? 'other' : 'user';
  const initialOtherPerson = editTxn?.payer && editTxn.payer !== 'user'
    ? (editTxn.payerName || editTxn.person || '')
    : '';

  const [amount, setAmount] = useState(editTxn ? String(editTxn.amount) : '');
  const [description, setDescription] = useState(editTxn?.description || '');
  const [category, setCategory] = useState(editTxn?.category || (categories[0] || 'Food'));
  const [date, setDate] = useState(
    editTxn?.date ? editTxn.date.slice(0, 10) : new Date().toISOString().slice(0, 10)
  );
  const [payerMode, setPayerMode] = useState(initialPaidBy); // 'user' | 'other'
  const [otherPerson, setOtherPerson] = useState(initialOtherPerson);
  const [paymentMethod, setPaymentMethod] = useState(editTxn?.paymentMethod || 'CASH');
  const [errorMessage, setErrorMessage] = useState(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      setErrorMessage('Please enter a valid expense amount greater than 0');
      return;
    }

    if (payerMode === 'other' && !otherPerson.trim()) {
      setErrorMessage('Please specify who covered this expense for you');
      return;
    }

    const payload = {
      type: 'personal_expense',
      amount: parsedAmount,
      description: description.trim(),
      category,
      date,
      paidBy: payerMode === 'other' ? otherPerson.trim() : 'user',
      paymentMethod,
    };

    const res = onSave(payload);
    if (res && res.success === false) {
      setErrorMessage(res.error || 'Failed to save personal expense');
    }
  };

  return (
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

      {/* Amount Header */}
      <div>
        <label className="text-xs text-text-muted mb-1 block">Expense Amount ({currency})</label>
        <div className="relative">
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
      </div>

      {/* Payer Toggle */}
      <div>
        <label className="text-xs text-text-muted mb-1.5 block">Who paid the merchant?</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setPayerMode('user')}
            className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
              payerMode === 'user'
                ? 'border-accent bg-accent/15 text-text-primary'
                : 'border-[var(--border-color)] bg-secondary/40 text-text-muted hover:border-accent/40'
            }`}
          >
            <User size={15} /> I Paid (Self)
          </button>
          <button
            type="button"
            onClick={() => setPayerMode('other')}
            className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
              payerMode === 'other'
                ? 'border-accent bg-accent/15 text-text-primary'
                : 'border-[var(--border-color)] bg-secondary/40 text-text-muted hover:border-accent/40'
            }`}
          >
            <HelpCircle size={15} /> Someone Else Covered
          </button>
        </div>

        {payerMode === 'other' && (
          <div className="mt-2.5 p-3 rounded-xl bg-secondary/50 border border-[var(--border-color)] space-y-2">
            <label className="text-xs text-text-muted block">Who covered this for you?</label>
            <input
              list="people-datalist"
              placeholder="Friend's name (e.g. Rahul)"
              value={otherPerson}
              onChange={(e) => {
                setOtherPerson(e.target.value);
                setErrorMessage(null);
              }}
              className="!py-2 !text-sm"
            />
            <datalist id="people-datalist">
              {people.map((p) => (
                <option key={p.id} value={p.name} />
              ))}
            </datalist>
            <p className="text-[11px] text-amber-400/90 leading-tight">
              Notice: This increases your personal monthly spending and creates a ledger debt: you will owe {otherPerson || 'them'} this amount.
            </p>
          </div>
        )}
      </div>

      {/* Payment Method Selector (when user paid) */}
      {payerMode === 'user' && (
        <div>
          <label className="text-xs text-text-muted mb-1.5 block">Payment Method</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'CASH', label: 'Cash', icon: Banknote },
              { id: 'UPI', label: 'UPI', icon: CreditCard },
              { id: 'OTHER', label: 'Card / Net', icon: CreditCard },
            ].map((m) => {
              const Icon = m.icon;
              const isSelected = paymentMethod === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPaymentMethod(m.id)}
                  className={`py-2 px-2 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
                    isSelected
                      ? 'border-accent bg-accent/15 text-text-primary'
                      : 'border-[var(--border-color)] bg-secondary/40 text-text-muted hover:border-accent/40'
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
        <label className="text-xs text-text-muted mb-1 block">Description</label>
        <input
          placeholder="e.g. Coffee, Groceries, Metro card"
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
        {isEdit ? 'Save Changes' : 'Record Personal Expense'}
      </button>
    </form>
  );
}

