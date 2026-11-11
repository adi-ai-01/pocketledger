import { useState, useMemo } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ArrowDownLeft,
  ArrowUpRight,
  AlertCircle,
  Banknote,
  CreditCard,
} from 'lucide-react';
import UpiModal from './UpiModal.jsx';
import ContactPicker from './ContactPicker.jsx';
import PaymentRecipientResolver from './PaymentRecipientResolver.jsx';

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
  const isEdit = Boolean(editTxn && editTxn.id);

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

  // Default person selection
  const defaultPerson = editTxn?.person || initialPerson || peopleWithBalances[0]?.name || '';
  const [selectedPerson, setSelectedPerson] = useState(defaultPerson);

  const initialPersonObj = useMemo(() => {
    const q = defaultPerson.trim().toLowerCase();
    if (!q) return null;
    return people.find((p) => p.name.trim().toLowerCase() === q) || { name: defaultPerson, id: '' };
  }, [people, defaultPerson]);

  const [selectedPersonObj, setSelectedPersonObj] = useState(initialPersonObj);
  const [resolvedUpiId, setResolvedUpiId] = useState(initialPersonObj?.upiId || '');

  // Compute selected person balance
  const activeBalance = balances[selectedPerson] || 0;
  const absDebt = Math.abs(activeBalance);
  const isZeroBalance = !isEdit && Boolean(selectedPerson && absDebt <= 0.01);

  // Automatically determine direction:
  // activeBalance > 0 -> They owe user -> Inflow: "They paid me back"
  // activeBalance < 0 -> User owes them -> Outflow: "I paid them back"
  // For editing an existing repayment, respect stored direction or canonical party
  const isTheyPaidMe = editTxn?.direction
    ? editTxn.direction === 'inflow'
    : editTxn?.toPartyId === 'USER'
    ? true
    : editTxn?.fromPartyId === 'USER'
    ? false
    : activeBalance > 0;

  // Amount
  const [amount, setAmount] = useState(() => {
    if (isEdit && editTxn) return String(editTxn.amount);
    if (initialAmount !== undefined && initialAmount !== null && initialAmount !== '') {
      return String(initialAmount);
    }
    return absDebt > 0 ? String(absDebt) : '';
  });

  const [description, setDescription] = useState(
    editTxn?.description || (isTheyPaidMe ? 'Repayment received' : 'Repayment sent')
  );
  const [date, setDate] = useState(
    editTxn?.date ? editTxn.date.slice(0, 10) : new Date().toISOString().slice(0, 10)
  );

  // For Outgoing Repayment (!isTheyPaidMe): channel can be 'UPI' | 'CASH' | 'ALREADY_COMPLETED'
  const [outgoingChannel, setOutgoingChannel] = useState(() => {
    if (editTxn?.paymentMethod === 'CASH') return 'CASH';
    if (editTxn) return 'ALREADY_COMPLETED';
    return 'UPI';
  });

  // Actual payment method when already completed
  const [completedMethod, setCompletedMethod] = useState(editTxn?.paymentMethod || 'UPI');

  // For Incoming Repayment (isTheyPaidMe): method can be 'UPI' | 'CASH' | 'OTHER'
  const [incomingMethod, setIncomingMethod] = useState(editTxn?.paymentMethod || 'UPI');

  const [showUpiModal, setShowUpiModal] = useState(false);
  const [upiLaunchMode, setUpiLaunchMode] = useState('DIRECT_UPI');
  const [errorMessage, setErrorMessage] = useState(null);

  // When selected person changes, update prefilled amount and description if not in edit mode
  const handleContactChange = (contact) => {
    setSelectedPerson(contact.name);
    setSelectedPersonObj(contact);
    if (contact.upiId) {
      setResolvedUpiId(contact.upiId);
    }
    const newBal = balances[contact.name] || 0;
    const newAbs = Math.abs(newBal);
    if (!isEdit) {
      setAmount(newAbs > 0 ? String(newAbs) : '');
      setDescription(newBal > 0 ? 'Repayment received' : 'Repayment sent');
    }
    setErrorMessage(null);
  };

  const amountFloat = parseFloat(amount) || 0;
  const isOverpayment = !isEdit && absDebt > 0 && amountFloat > absDebt + 0.01;
  const remainingDebt = Math.max(0, Math.round((absDebt - amountFloat) * 100) / 100);

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if (!selectedPerson.trim()) {
      setErrorMessage('Please select a person with an outstanding balance');
      return;
    }

    if (isZeroBalance) {
      setErrorMessage(`No repayment is currently due. ${selectedPerson} is already fully settled.`);
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
      if (outgoingChannel === 'UPI' || outgoingChannel === 'UPI_LAUNCH') {
        finalPaymentMethod = 'UPI';
        if (!isEdit) {
          setUpiLaunchMode(resolvedUpiId && isValidUpiId(resolvedUpiId) ? 'DIRECT_UPI' : 'GOOGLE_PAY');
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

        {/* Universal Contact Picker */}
        <div>
          <ContactPicker
            label="Select Contact"
            placeholder="Search or add contact (by name or phone)..."
            value={selectedPersonObj || selectedPerson}
            onChange={handleContactChange}
            people={people}
            balances={balances}
            currency={currency}
            store={store}
            required
          />
        </div>

        {/* Direction Card */}
        {selectedPerson && (
          isZeroBalance ? (
            <div className="p-3.5 rounded-xl border border-[var(--border-color)] bg-secondary/50 flex items-center gap-3 text-text-secondary animate-fade-in">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-secondary border border-[var(--border-color)] text-emerald-400">
                <CheckCircle2 size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-text-primary">
                    Already Settled
                  </span>
                  <span className="text-xs font-semibold tabular-nums text-text-muted">
                    Balance: {currency}0
                  </span>
                </div>
                <p className="text-xs text-text-muted leading-tight mt-0.5">
                  No repayment is currently due. You and {selectedPerson} are completely settled up.
                </p>
              </div>
            </div>
          ) : (
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
          )
        )}

        {/* Amount */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-text-secondary">Repayment Amount ({currency})</label>
            {!isZeroBalance && absDebt > 0 && amountFloat !== absDebt && (
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
            disabled={isZeroBalance}
            onChange={(e) => {
              setAmount(e.target.value);
              setErrorMessage(null);
            }}
            className={`w-full h-[52px] text-2xl font-bold text-center tracking-tight bg-secondary border border-[var(--border-color)] rounded-xl text-text-primary focus:border-accent outline-none ${
              isZeroBalance ? 'opacity-40 cursor-not-allowed' : ''
            }`}
            autoFocus={!isZeroBalance}
          />
        </div>

        {/* Remaining Debt Indicator */}
        {!isZeroBalance && (
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
        )}

        {/* Payment Resolution: Outgoing vs Incoming */}
        {!isZeroBalance && (
          !isTheyPaidMe ? (
            <PaymentRecipientResolver
              person={selectedPersonObj || { name: selectedPerson, id: '', upiId: resolvedUpiId }}
              amount={amount}
              onAmountChange={(newAmt) => setAmount(newAmt)}
              channel={outgoingChannel}
              onChannelChange={(ch) => setOutgoingChannel(ch)}
              completedMethod={completedMethod}
              onCompletedMethodChange={(m) => setCompletedMethod(m)}
              resolvedUpiId={resolvedUpiId}
              onResolvedUpiIdChange={(upi) => setResolvedUpiId(upi)}
              store={store}
              currency={currency}
              onLaunchUpi={(opts) => {
                setUpiLaunchMode(opts?.mode || (resolvedUpiId && isValidUpiId(resolvedUpiId) ? 'DIRECT_UPI' : 'GOOGLE_PAY'));
                setShowUpiModal(true);
              }}
            />
          ) : (
            /* Incoming repayment: method received */
            <div className="space-y-2">
              <label className="text-xs font-medium text-text-secondary block">How did you receive the payment?</label>
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
          )
        )}

        {/* Description & Date */}
        <div>
          <label className="text-xs font-medium text-text-secondary mb-1.5 block">Description</label>
          <input
            placeholder={isTheyPaidMe ? 'Repayment received' : 'Repayment sent'}
            value={description}
            disabled={isZeroBalance}
            onChange={(e) => setDescription(e.target.value)}
            className={`w-full h-[48px] px-3.5 bg-secondary border border-[var(--border-color)] rounded-xl text-text-primary text-sm focus:border-accent outline-none ${
              isZeroBalance ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          />
        </div>

        <div>
          <label className="text-xs font-medium text-text-secondary mb-1.5 block">Date</label>
          <input
            type="date"
            value={date}
            disabled={isZeroBalance}
            onChange={(e) => setDate(e.target.value)}
            className={`w-full h-[48px] px-3 bg-secondary border border-[var(--border-color)] rounded-xl text-text-primary text-sm focus:border-accent outline-none ${
              isZeroBalance ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          />
        </div>

        {errorMessage && (
          <p className="text-xs text-rose-400 bg-rose-500/10 p-3 rounded-xl border border-rose-500/20">
            {errorMessage}
          </p>
        )}

        {/* Submit Button */}
        {(isTheyPaidMe || outgoingChannel !== 'UPI' || isZeroBalance) && (
          <button
            type="submit"
            disabled={isOverpayment || isZeroBalance || amountFloat <= 0}
            className="btn btn-primary w-full h-[48px] mt-2 font-semibold rounded-xl disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isEdit
              ? 'Save Changes'
              : isZeroBalance
              ? 'Already Settled (No Repayment Due)'
              : isTheyPaidMe
              ? 'Record Repayment Received'
              : 'Record Repayment Paid'}
          </button>
        )}
      </form>

      {/* Outgoing UPI Modal (only for outgoing repayment with UPI) */}
      {showUpiModal && store && (
        <UpiModal
          isOpen={showUpiModal}
          recipientId={selectedPersonObj?.id || null}
          recipientName={selectedPerson.trim()}
          recipientUpiId={resolvedUpiId || ''}
          recipientPhone={selectedPersonObj?.phone || ''}
          amount={amountFloat}
          mode={upiLaunchMode}
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
