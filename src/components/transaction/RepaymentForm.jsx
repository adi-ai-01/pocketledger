import { useState, useEffect } from 'react';
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
      setErrorMessage('Please enter a valid repayment amount');
      return;
    }

    if (absDebt <= 0.01) {
      setErrorMessage(`${selectedPerson} has no outstanding balance in your ledger`);
      return;
    }

    if (isOverpayment) {
      setErrorMessage(
        `Overpayment blocked: Repayment of ${currency}${amountFloat} exceeds the outstanding debt of ${currency}${absDebt}.`
      );
      return;
    }

    // Determine final payment method and whether external app is needed
    let finalPaymentMethod = 'CASH';

    if (!isTheyPaidMe) {
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
      // Repayment received: strictly incoming money
      finalPaymentMethod = incomingMethod;
    }

    const payload = {
      type: 'repayment',
      person: selectedPerson.trim(),
      amount: amountFloat,
      description: description.trim() || (isTheyPaidMe ? 'Repayment received' : 'Repayment sent'),
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
            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors mb-1"
          >
            <ArrowLeft size={14} /> Back to actions
          </button>
        )}

        {/* Counterparty Person Picker */}
        <div>
          <label className="text-xs text-text-muted mb-1 block">Counterparty Person</label>
          {peopleWithBalances.length > 0 ? (
            <select
              value={selectedPerson}
              onChange={(e) => handlePersonChange(e.target.value)}
              className="!py-2.5 !text-sm w-full font-medium"
            >
              {peopleWithBalances.map((p) => {
                const balText = p.balance > 0
                  ? `owes you ${currency}${p.balance.toLocaleString('en-IN')}`
                  : `you owe ${currency}${Math.abs(p.balance).toLocaleString('en-IN')}`;
                return (
                  <option key={p.name} value={p.name}>
                    {p.name} ({balText})
                  </option>
                );
              })}
            </select>
          ) : (
            <div className="p-3 rounded-xl bg-secondary/40 border border-[var(--border-color)] text-xs text-text-muted">
              No active debts found. You can enter any contact name below:
              <input
                placeholder="Person name"
                value={selectedPerson}
                onChange={(e) => setSelectedPerson(e.target.value)}
                className="mt-2 !py-2 !text-sm w-full"
              />
            </div>
          )}
        </div>

        {/* Direction Card (Auto-derived and strictly locked) */}
        {selectedPerson && (
          <div className={`p-3.5 rounded-xl border flex items-center gap-3 ${
            isTheyPaidMe
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
          }`}>
            <div className={`w-8 h-8 rounded-full border flex items-center justify-center flex-shrink-0 ${
              isTheyPaidMe ? 'border-emerald-500/40 bg-emerald-500/20' : 'border-rose-500/40 bg-rose-500/20'
            }`}>
              {isTheyPaidMe ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider">
                  {isTheyPaidMe ? 'They Paid Me Back' : 'I Paid Them Back'}
                </span>
                <span className="text-[11px] font-semibold">
                  Total Debt: {currency}{absDebt.toLocaleString('en-IN')}
                </span>
              </div>
              <p className="text-[11px] text-text-muted leading-tight mt-0.5">
                {isTheyPaidMe
                  ? `${selectedPerson} is clearing money they owe you.`
                  : `You are clearing money you owe ${selectedPerson}.`}
              </p>
            </div>
          </div>
        )}

        {/* Amount */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-text-muted">Repayment Amount ({currency})</label>
            {absDebt > 0 && amountFloat !== absDebt && (
              <button
                type="button"
                onClick={() => setAmount(String(absDebt))}
                className="text-xs text-accent font-medium underline"
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
            className="!text-3xl !font-bold !py-3 text-center tracking-tight"
            autoFocus
          />
        </div>

        {/* Remaining Debt Indicator */}
        <div className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
          isOverpayment
            ? 'bg-red-500/10 border-red-500/30 text-red-400'
            : remainingDebt === 0
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
            : 'bg-secondary/40 border-[var(--border-color)] text-text-muted'
        }`}>
          <div className="flex items-center gap-2">
            {isOverpayment ? (
              <AlertCircle size={15} className="text-red-400" />
            ) : remainingDebt === 0 ? (
              <CheckCircle2 size={15} className="text-emerald-400" />
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

        {/* Payment Channel & Recording Status Selection */}
        {!isTheyPaidMe ? (
          /* OUTGOING REPAYMENT: Explicit choice between UPI (Launch App), Cash, or Already Completed */
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
                  <ShieldCheck size={13} className={outgoingChannel === 'ALREADY_COMPLETED' ? 'text-accent' : 'text-text-muted'} />
                  <span className="text-xs font-bold text-text-primary">Completed</span>
                </div>
                <p className="text-[10px] text-text-muted leading-tight">Paid outside app</p>
              </button>
            </div>

            {/* Sub-selector for Already Completed to record actual payment method */}
            {outgoingChannel === 'ALREADY_COMPLETED' && (
              <div className="p-2.5 rounded-xl bg-secondary/60 border border-[var(--border-color)] space-y-1.5 animate-fade-in">
                <span className="text-[11px] text-text-muted block">How did you pay previously?</span>
                <div className="grid grid-cols-3 gap-1.5">
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
                  Records repayment directly in ledger without launching external UPI intent.
                </p>
              </div>
            )}
          </div>
        ) : (
          /* INCOMING REPAYMENT: Money received into user's possession */
          <div className="space-y-2">
            <label className="text-xs text-text-muted block">How did you receive this repayment?</label>
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
              Records money received into your possession. No outgoing UPI intent will be launched.
            </p>
          </div>
        )}

        {/* Description & Date Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-text-muted mb-1 block">Description</label>
            <input
              placeholder="e.g. Settle dinner loan"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="!py-2.5 !text-sm w-full"
            />
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

        {/* Submit */}
        <button
          type="submit"
          disabled={isOverpayment || amountFloat <= 0}
          className={`btn btn-primary w-full mt-2 !py-3 font-semibold ${
            isOverpayment || amountFloat <= 0 ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {isEdit
            ? 'Save Changes'
            : !isTheyPaidMe
            ? outgoingChannel === 'UPI_LAUNCH'
              ? 'Proceed to UPI Verification'
              : 'Record Repayment'
            : 'Record Repayment (Money Received)'}
        </button>
      </form>

      {/* Outgoing UPI Modal */}
      {showUpiModal && store && (
        <UpiModal
          isOpen={showUpiModal}
          recipientName={selectedPerson.trim()}
          recipientUpiId={recipientUpiId}
          amount={amountFloat}
          note={description || 'Repayment'}
          ledgerTxnData={{
            type: 'repayment',
            person: selectedPerson.trim(),
            amount: amountFloat,
            description: description.trim() || 'Repayment via UPI',
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

