import { useState } from 'react';
import { ArrowLeft, CheckCircle2, ArrowDownLeft, ArrowUpRight, AlertCircle, Banknote, CreditCard, ShieldCheck, ExternalLink } from 'lucide-react';
import UpiModal from './UpiModal.jsx';

export default function RepaymentForm({
  initialPerson = '',
  initialAmount = '',
  editTxn,
  people = [],
  balances = {},
  categories = [],
  settings = {},
  store,
  onSave,
  onBack,
}) {
  const currency = settings.currency || '₹';
  const isEdit = !!editTxn;

  // Find people with active non-zero balances
  const peopleWithBalances = Object.entries(balances)
    .filter(([_, bal]) => Math.abs(bal) > 0.01)
    .map(([name, bal]) => {
      const pObj = people.find((p) => p.name === name);
      return {
        name,
        balance: bal,
        upiId: pObj?.upiId || '',
      };
    })
    .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));

  // Selected person
  const defaultPerson = editTxn?.person || initialPerson || peopleWithBalances[0]?.name || '';
  const [selectedPerson, setSelectedPerson] = useState(defaultPerson);

  // Compute selected person balance
  const activeBalance = balances[selectedPerson] || 0;
  const absDebt = Math.abs(activeBalance);

  // Automatically determine direction:
  // activeBalance > 0 -> They owe user -> Inflow: "They paid me back"
  // activeBalance < 0 -> User owes them -> Outflow: "I paid them back"
  const isTheyPaidMe = activeBalance > 0;

  // Amount
  const [amount, setAmount] = useState(() => {
    if (editTxn) return String(editTxn.amount);
    if (initialAmount) return String(initialAmount);
    return absDebt > 0 ? String(absDebt) : '';
  });

  const [description, setDescription] = useState(
    editTxn?.description || (isTheyPaidMe ? 'Repayment received' : 'Repayment sent')
  );
  const [date, setDate] = useState(
    editTxn?.date ? editTxn.date.slice(0, 10) : new Date().toISOString().slice(0, 10)
  );

  // For Outgoing Repayment (!isTheyPaidMe): channel can be 'UPI_LAUNCH' | 'CASH' | 'ALREADY_COMPLETED'
  const [outgoingChannel, setOutgoingChannel] = useState(
    editTxn?.paymentMethod === 'CASH'
      ? 'CASH'
      : editTxn
      ? 'ALREADY_COMPLETED'
      : 'CASH'
  );

  // Actual payment method when already completed
  const [completedMethod, setCompletedMethod] = useState(editTxn?.paymentMethod || 'UPI');

  // For Incoming Repayment (isTheyPaidMe): method can be 'UPI' | 'CASH' | 'OTHER'
  const [incomingMethod, setIncomingMethod] = useState(editTxn?.paymentMethod || 'UPI');

  const [showUpiModal, setShowUpiModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  // When selected person changes, update prefilled amount and description if not in edit mode
  const handlePersonChange = (newPerson) => {
    setSelectedPerson(newPerson);
    const newBal = balances[newPerson] || 0;
    const newAbs = Math.abs(newBal);
    if (!isEdit) {
      setAmount(newAbs > 0 ? String(newAbs) : '');
      setDescription(newBal > 0 ? 'Repayment received' : 'Repayment sent');
    }
    setErrorMessage(null);
  };

  const amountFloat = parseFloat(amount) || 0;
  const isOverpayment = amountFloat > absDebt + 0.01;
  const remainingDebt = Math.max(0, Math.round((absDebt - amountFloat) * 100) / 100);

  const matchingPerson = people.find((p) => p.name.toLowerCase() === selectedPerson.trim().toLowerCase());
  const recipientUpiId = matchingPerson?.upiId || '';

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!selectedPerson.trim()) {
      setErrorMessage('Please select a person with an outstanding balance');
      return;
    }

    if (!amountFloat || amountFloat <= 0) {
      setErrorMessage('Please enter a valid repayment amount greater than 0');
      return;
    }

    if (isOverpayment) {
      setErrorMessage(
        `Repayment amount (${currency}${amountFloat}) exceeds outstanding balance (${currency}${absDebt}). Overpayment is not allowed.`
      );
      return;
    }

    // Determine final payment method and whether external app is needed
    let finalPaymentMethod = 'CASH';

    if (!isTheyPaidMe) {
      // Outgoing repayment
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
      // Incoming repayment
      finalPaymentMethod = incomingMethod;
    }

    const payload = {
      type: 'settle',
      action: 'repayment',
      person: selectedPerson.trim(),
      amount: amountFloat,
      direction: isTheyPaidMe ? 'inflow' : 'outflow',
      description: description.trim() || (isTheyPaidMe ? 'Repayment received' : 'Repayment sent'),
      category: 'Settlement',
      date,
      paymentMethod: finalPaymentMethod,
    };

    const res = onSave(payload);
    if (res && res.success === false) {
      setErrorMessage(res.error || 'Failed to record repayment');
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

        {/* Person Selector */}
        <div>
          <label className="text-xs font-medium text-text-secondary mb-1.5 block">
            Select Contact
          </label>
          {peopleWithBalances.length > 0 ? (
            <select
              value={selectedPerson}
              onChange={(e) => handlePersonChange(e.target.value)}
              className="w-full h-[48px] px-3 bg-secondary border border-[var(--border-color)] rounded-xl text-text-primary text-sm focus:border-accent outline-none"
            >
              {peopleWithBalances.map((p) => {
                const isPositive = p.balance > 0;
                return (
                  <option key={p.name} value={p.name}>
                    {p.name} · {isPositive ? `Owes you ${currency}${p.balance.toLocaleString('en-IN')}` : `You owe ${currency}${Math.abs(p.balance).toLocaleString('en-IN')}`}
                  </option>
                );
              })}
            </select>
          ) : (
            <div>
              <p className="text-xs text-text-muted mb-2">No contacts with outstanding debt found.</p>
              <input
                placeholder="Person name"
                value={selectedPerson}
                onChange={(e) => setSelectedPerson(e.target.value)}
                className="w-full h-[48px] px-3.5 bg-secondary border border-[var(--border-color)] rounded-xl text-text-primary text-sm focus:border-accent outline-none"
              />
            </div>
          )}
        </div>

        {/* Direction Card */}
        {selectedPerson && (
          <div className={`p-3.5 rounded-xl border flex items-center gap-3 ${
            isTheyPaidMe
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
          }`}>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
              isTheyPaidMe ? 'bg-emerald-500/20' : 'bg-rose-500/20'
            }`}>
              {isTheyPaidMe ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">
                  {isTheyPaidMe ? 'They Paid Me Back' : 'I Paid Them Back'}
                </span>
                <span className="text-xs font-semibold tabular-nums">
                  Debt: {currency}{absDebt.toLocaleString('en-IN')}
                </span>
              </div>
              <p className="text-xs text-text-secondary leading-tight mt-0.5">
                {isTheyPaidMe
                  ? `${selectedPerson} is clearing money they owe you.`
                  : `You are clearing money you owe ${selectedPerson}.`}
              </p>
            </div>
          </div>
        )}

        {/* Amount */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-text-secondary">Repayment Amount ({currency})</label>
            {absDebt > 0 && amountFloat !== absDebt && (
              <button
                type="button"
                onClick={() => setAmount(String(absDebt))}
                className="text-xs text-accent font-semibold underline"
              >
                Pay Full ({currency}{absDebt})
              </button>
            )}
          </div>
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

        {/* Remaining Debt Indicator */}
        <div className={`p-3.5 rounded-xl border text-xs flex items-center justify-between ${
          isOverpayment
            ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
            : remainingDebt === 0
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
            : 'bg-secondary/40 border-[var(--border-color)] text-text-secondary'
        }`}>
          <div className="flex items-center gap-2">
            {isOverpayment ? (
              <AlertCircle size={15} className="text-rose-400 flex-shrink-0" />
            ) : remainingDebt === 0 ? (
              <CheckCircle2 size={15} className="text-emerald-400 flex-shrink-0" />
            ) : null}
            <span>
              {isOverpayment
                ? `Exceeds balance by ${currency}${(amountFloat - absDebt).toFixed(2)}`
                : remainingDebt === 0
                ? 'Balance will be fully settled (₹0 remaining)'
                : `Remaining balance after payment: ${currency}${remainingDebt}`}
            </span>
          </div>
        </div>

        {/* Payment Channel Selection */}
        {!isTheyPaidMe ? (
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
                  <ShieldCheck size={14} className={outgoingChannel === 'ALREADY_COMPLETED' ? 'text-accent' : 'text-text-muted'} />
                  <span className="text-xs font-semibold text-text-primary">Completed</span>
                </div>
                <p className="text-[11px] text-text-muted leading-tight">Paid outside app</p>
              </button>
            </div>

            {outgoingChannel === 'ALREADY_COMPLETED' && (
              <div className="p-3.5 rounded-xl bg-secondary/40 border border-[var(--border-color)] space-y-2 animate-fade-in">
                <span className="text-xs text-text-secondary block">How did you pay previously?</span>
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
          <div className="space-y-2">
            <label className="text-xs font-medium text-text-secondary block">How did you receive this repayment?</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'UPI', label: 'UPI Received', icon: CreditCard },
                { id: 'CASH', label: 'Cash Received', icon: Banknote },
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
            placeholder={isTheyPaidMe ? 'e.g. Repayment received' : 'e.g. Repaid loan'}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full h-[48px] px-3.5 bg-secondary border border-[var(--border-color)] rounded-xl text-text-primary text-sm focus:border-accent outline-none"
          />
        </div>

        {/* Date */}
        <div>
          <label className="text-xs font-medium text-text-secondary mb-1.5 block">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full h-[48px] px-3 bg-secondary border border-[var(--border-color)] rounded-xl text-text-primary text-sm focus:border-accent outline-none"
          />
        </div>

        {errorMessage && (
          <p className="text-xs text-rose-400 bg-rose-500/10 p-3 rounded-xl border border-rose-500/20">
            {errorMessage}
          </p>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isOverpayment}
          className={`btn btn-primary w-full h-[48px] mt-2 font-semibold rounded-xl ${
            isOverpayment ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {isEdit
            ? 'Save Changes'
            : !isTheyPaidMe && outgoingChannel === 'UPI_LAUNCH'
            ? 'Continue to UPI App'
            : 'Record Repayment'}
        </button>
      </form>

      {/* Outgoing UPI Modal */}
      {showUpiModal && store && (
        <UpiModal
          isOpen={showUpiModal}
          recipientName={selectedPerson.trim()}
          recipientUpiId={recipientUpiId}
          amount={amountFloat}
          note={description.trim() || `PocketLedger repayment to ${selectedPerson.trim()}`}
          ledgerTxnData={{
            type: 'settle',
            action: 'repayment',
            person: selectedPerson.trim(),
            amount: amountFloat,
            direction: 'outflow',
            description: description.trim() || 'Repayment sent via UPI',
            category: 'Settlement',
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
