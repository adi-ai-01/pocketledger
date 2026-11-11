import { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Minus, Users, Check, AlertCircle } from 'lucide-react';
import { allocateEqualShares } from '../../domain/ledger.js';
import { convertRupeesToPaise } from '../../domain/migrate-v1-to-v2.js';
import ContactPicker from './ContactPicker.jsx';

export default function SharedExpenseForm({
  editTxn,
  initialPerson = '',
  initialAmount = '',
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

  // Form inputs
  const [totalAmount, setTotalAmount] = useState(() => (editTxn ? String(editTxn.amount) : initialAmount ? String(initialAmount) : ''));
  const [description, setDescription] = useState(editTxn?.description || '');
  const [category, setCategory] = useState(editTxn?.category || (categories[0] || 'Food'));
  const [date, setDate] = useState(
    editTxn?.date ? editTxn.date.slice(0, 10) : new Date().toISOString().slice(0, 10)
  );

  // Payer state
  const initialPayerName = editTxn?.payer && editTxn.payer !== 'user'
    ? (editTxn.payerName || editTxn.person || '')
    : 'user';
  const initialPayerObj = people.find((p) => p.name.toLowerCase() === initialPayerName.toLowerCase());

  const [payer, setPayer] = useState(initialPayerName);
  const [payerId, setPayerId] = useState(editTxn?.payerId || initialPayerObj?.id || (initialPayerName === 'user' ? 'user' : ''));
  const [isPayerNew, setIsPayerNew] = useState(false);

  // Split mode: 'equal' | 'custom'
  const [splitMode, setSplitMode] = useState('equal');

  // Participants list (excluding user)
  const [participants, setParticipants] = useState(() => {
    if (editTxn?.splits && editTxn.splits.length > 0) {
      return editTxn.splits.map((s) => {
        const matchingPerson = people.find((p) => (s.personId && p.id === s.personId) || p.name === s.person);
        return {
          person: s.person || matchingPerson?.name || '',
          personId: s.personId || matchingPerson?.id || '',
          amount: String(s.amount || ''),
          isNew: false,
        };
      });
    }
    if (initialPerson) {
      const matchingPerson = people.find((p) => p.name.toLowerCase() === initialPerson.trim().toLowerCase());
      return [{ person: matchingPerson?.name || initialPerson, personId: matchingPerson?.id || '', amount: '', isNew: false }];
    }
    return [{ person: '', personId: '', amount: '', isNew: false }];
  });

  const [userShare, setUserShare] = useState(() => {
    if (editTxn?.myShare !== undefined || editTxn?.userShare !== undefined) {
      return String(editTxn.userShare ?? editTxn.myShare);
    }
    return '';
  });

  const [errorMessage, setErrorMessage] = useState(null);

  // Calculation metrics
  const totalFloat = parseFloat(totalAmount) || 0;
  const userShareFloat = parseFloat(userShare) || 0;
  const participantsSumFloat = participants.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
  const allocatedTotalFloat = Math.round((userShareFloat + participantsSumFloat) * 100) / 100;
  const remainingFloat = Math.round((totalFloat - allocatedTotalFloat) * 100) / 100;

  // Pure integer paise equal split algorithm
  const applyEqualSplit = (totalVal = totalAmount, participantList = participants) => {
    const tFloat = parseFloat(totalVal) || 0;
    if (tFloat <= 0) {
      setUserShare('');
      setParticipants(participantList.map((p) => ({ ...p, amount: '' })));
      return;
    }

    const activeParticipants = participantList.filter((p) => p.person && p.person.trim());
    const count = activeParticipants.length + 1; // + 1 for user

    const conv = convertRupeesToPaise(tFloat);
    if (!conv.isValid) return;

    try {
      const shares = allocateEqualShares(conv.amountPaise, count);
      setUserShare(String(shares[0] / 100));

      let shareIdx = 1;
      const nextParticipants = participantList.map((p) => {
        if (!p.person || !p.person.trim()) {
          return { ...p, amount: '' };
        }
        const sPaise = shares[shareIdx++] || 0;
        return { ...p, amount: String(sPaise / 100) };
      });
      setParticipants(nextParticipants);
      setErrorMessage(null);
    } catch {
      // fallback
    }
  };

  const handleTotalChange = (val) => {
    setTotalAmount(val);
    setErrorMessage(null);
    if (splitMode === 'equal') {
      applyEqualSplit(val, participants);
    }
  };

  const handleParticipantPersonChange = (index, personObj) => {
    const next = [...participants];
    next[index] = { ...next[index], ...personObj };
    setParticipants(next);
    setErrorMessage(null);
    if (splitMode === 'equal') {
      applyEqualSplit(totalAmount, next);
    }
  };

  const addParticipant = () => {
    const next = [...participants, { person: '', personId: '', amount: '', isNew: false }];
    setParticipants(next);
  };

  const removeParticipant = (index) => {
    let next;
    if (participants.length <= 1) {
      next = [{ person: '', personId: '', amount: '', isNew: false }];
    } else {
      next = participants.filter((_, i) => i !== index);
    }
    setParticipants(next);
    setErrorMessage(null);
    if (splitMode === 'equal') {
      applyEqualSplit(totalAmount, next);
    }
  };

  const handleSelectEqualMode = () => {
    setSplitMode('equal');
    applyEqualSplit(totalAmount, participants);
  };

  const handleSelectCustomMode = () => {
    setSplitMode('custom');
  };

  const handleParticipantAmountChange = (index, val) => {
    const next = [...participants];
    next[index] = { ...next[index], amount: val };
    setParticipants(next);
    if (splitMode === 'equal') {
      setSplitMode('custom');
    }
    setErrorMessage(null);
  };

  const handleUserShareChange = (val) => {
    setUserShare(val);
    if (splitMode === 'equal') {
      setSplitMode('custom');
    }
    setErrorMessage(null);
  };

  const fillRemainingIntoUserShare = () => {
    const newShare = Math.max(0, Math.round((userShareFloat + remainingFloat) * 100) / 100);
    setUserShare(String(newShare));
    if (splitMode === 'equal') {
      setSplitMode('custom');
    }
    setErrorMessage(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!totalFloat || totalFloat <= 0) {
      setErrorMessage('Please enter a valid total bill amount greater than 0');
      return;
    }

    const filledParticipants = participants.filter(
      (p) => (p.person && p.person.trim()) || (parseFloat(p.amount) > 0)
    );

    if (filledParticipants.length === 0) {
      setErrorMessage('Please add at least one other participant to split the bill with');
      return;
    }

    // Validate each participant row
    for (let i = 0; i < filledParticipants.length; i++) {
      const p = filledParticipants[i];
      const trimmedName = (p.person || '').trim();
      if (!trimmedName) {
        setErrorMessage(`Participant #${i + 1} requires a valid contact name`);
        return;
      }
      if (!p.personId && !p.isNew) {
        const exact = people.find((x) => x.name.toLowerCase() === trimmedName.toLowerCase());
        if (!exact) {
          setErrorMessage(
            `Please select an existing contact for "${trimmedName}" or choose "Add as new contact"`
          );
          return;
        }
      }
      const pAmt = parseFloat(p.amount) || 0;
      if (pAmt <= 0) {
        setErrorMessage(
          `Allocation for "${trimmedName}" must be greater than ${currency}0. Remove unused participants or enter an amount.`
        );
        return;
      }
    }

    // Payer validation
    if (payer !== 'user' && !payer.trim()) {
      setErrorMessage('Please select who paid the merchant');
      return;
    }
    if (payer !== 'user' && !payerId && !isPayerNew) {
      const exactPayer = people.find((x) => x.name.toLowerCase() === payer.trim().toLowerCase());
      if (!exactPayer) {
        setErrorMessage(
          `Please select an existing contact for payer "${payer}" or choose "Add as new contact"`
        );
        return;
      }
    }

    // Conservation check
    if (Math.abs(remainingFloat) > 0.01) {
      setErrorMessage(
        `Allocations do not sum to total bill: Allocated ${currency}${allocatedTotalFloat} of ${currency}${totalFloat}. Remaining difference: ${currency}${remainingFloat}`
      );
      return;
    }

    const mappedAllocations = filledParticipants.map((p) => {
      const exact = people.find((x) => x.name.toLowerCase() === p.person.trim().toLowerCase());
      return {
        person: p.person.trim(),
        personId: p.personId || exact?.id || undefined,
        amount: parseFloat(p.amount) || 0,
      };
    });

    const exactPayerObj = people.find((x) => x.name.toLowerCase() === payer.trim().toLowerCase());
    const resolvedPayerId = payer.trim() === 'user' ? 'user' : (payerId || exactPayerObj?.id || undefined);

    const payload = {
      type: 'shared_expense',
      amount: totalFloat,
      payer: payer.trim() === 'user' ? 'user' : (exactPayerObj?.name || payer.trim()),
      payerId: resolvedPayerId,
      userShare: userShareFloat,
      allocations: mappedAllocations,
      description: description.trim() || 'Shared Expense',
      category,
      date,
    };

    const res = onSave(payload);
    if (res && res.success === false) {
      setErrorMessage(res.error || 'Failed to save shared expense');
    }
  };

  return (
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

      {/* Total Bill Input */}
      <div>
        <label className="text-xs font-medium text-text-secondary mb-1.5 block">
          Total Bill Amount ({currency})
        </label>
        <input
          type="number"
          step="any"
          inputMode="decimal"
          placeholder="0"
          value={totalAmount}
          onChange={(e) => handleTotalChange(e.target.value)}
          className="w-full h-[52px] text-2xl font-bold text-center tracking-tight bg-secondary border border-[var(--border-color)] rounded-xl text-text-primary focus:border-accent outline-none"
          autoFocus
        />
      </div>

      {/* Payer Selection */}
      <div>
        <label className="text-xs font-medium text-text-secondary mb-1.5 block">Who paid the merchant?</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              setPayer('user');
              setPayerId('user');
              setIsPayerNew(false);
            }}
            className={`h-[46px] px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
              payer === 'user'
                ? 'border-accent bg-accent/15 text-text-primary'
                : 'border-[var(--border-color)] bg-secondary/40 text-text-secondary hover:border-accent/40'
            }`}
          >
            I Paid (You)
          </button>
          <button
            type="button"
            onClick={() => {
              if (payer === 'user') {
                const first = people[0];
                setPayer(first?.name || '');
                setPayerId(first?.id || '');
                setIsPayerNew(!first);
              }
            }}
            className={`h-[46px] px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
              payer !== 'user'
                ? 'border-accent bg-accent/15 text-text-primary'
                : 'border-[var(--border-color)] bg-secondary/40 text-text-secondary hover:border-accent/40'
            }`}
          >
            Someone Else Paid
          </button>
        </div>

        {payer !== 'user' && (
          <div className="mt-2.5">
            <ContactPicker
              value={{ person: payer, personId: payerId, isNew: isPayerNew }}
              onChange={({ person, personId, isNew }) => {
                setPayer(person);
                setPayerId(personId);
                setIsPayerNew(isNew);
                setErrorMessage(null);
              }}
              people={people}
              balances={balances}
              currency={currency}
              placeholder="Name of payer (e.g. Alice)"
            />
          </div>
        )}
      </div>

      {/* Split Mode Selector */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-text-secondary">Split Mode</label>
          <div className="flex p-0.5 rounded-lg bg-secondary border border-[var(--border-color)]">
            <button
              type="button"
              onClick={handleSelectEqualMode}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                splitMode === 'equal' ? 'bg-card text-text-primary shadow-sm' : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              Equal Split
            </button>
            <button
              type="button"
              onClick={handleSelectCustomMode}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                splitMode === 'custom' ? 'bg-card text-text-primary shadow-sm' : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              Custom Amounts
            </button>
          </div>
        </div>

        {/* User Share Row */}
        <div className="p-3.5 rounded-xl bg-secondary/40 border border-[var(--border-color)] flex items-center justify-between">
          <span className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
            <Users size={14} className="text-accent" /> Your Personal Share
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-text-muted">{currency}</span>
            <input
              type="number"
              step="any"
              placeholder="0"
              value={userShare}
              onChange={(e) => handleUserShareChange(e.target.value)}
              className="w-24 h-[42px] px-2.5 text-sm text-right font-bold bg-secondary border border-[var(--border-color)] rounded-lg text-text-primary focus:border-accent outline-none"
            />
          </div>
        </div>

        {/* Participants Rows */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-text-secondary">Other Participants</label>
            <button
              type="button"
              onClick={addParticipant}
              className="text-xs text-accent font-semibold flex items-center gap-1 hover:underline"
            >
              <Plus size={13} /> Add Person
            </button>
          </div>

          {participants.map((sp, idx) => (
            <div key={idx} className="flex items-start gap-2">
              <ContactPicker
                value={{ person: sp.person, personId: sp.personId, isNew: sp.isNew }}
                onChange={(pObj) => handleParticipantPersonChange(idx, pObj)}
                people={people}
                balances={balances}
                currency={currency}
                placeholder="Contact name"
                excludePersonIds={participants.filter((_, i) => i !== idx).map((p) => p.personId).filter(Boolean)}
              />
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  placeholder="0"
                  value={sp.amount}
                  onChange={(e) => handleParticipantAmountChange(idx, e.target.value)}
                  className="w-24 h-[48px] px-2.5 text-sm text-right font-medium bg-secondary border border-[var(--border-color)] rounded-xl text-text-primary focus:border-accent outline-none"
                />
              </div>
              {participants.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeParticipant(idx)}
                  className="p-3 rounded-xl text-rose-400 hover:bg-rose-500/10 transition-colors flex-shrink-0"
                >
                  <Minus size={15} />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Conservation & Remaining Balance Indicator */}
        <div className={`p-3.5 rounded-xl border text-xs flex items-center justify-between transition-colors ${
          Math.abs(remainingFloat) <= 0.01
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
            : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
        }`}>
          <div className="flex items-center gap-2">
            {Math.abs(remainingFloat) <= 0.01 ? (
              <Check size={16} className="text-emerald-400 flex-shrink-0" />
            ) : (
              <AlertCircle size={16} className="text-amber-400 flex-shrink-0" />
            )}
            <span>
              {Math.abs(remainingFloat) <= 0.01
                ? `Exact Split Conserved: ${currency}${totalFloat}`
                : `Unallocated: ${currency}${remainingFloat}`}
            </span>
          </div>

          {Math.abs(remainingFloat) > 0.01 && (
            <button
              type="button"
              onClick={fillRemainingIntoUserShare}
              className="text-xs underline font-semibold text-text-primary hover:text-accent"
            >
              Assign to me
            </button>
          )}
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="text-xs font-medium text-text-secondary mb-1.5 block">Description</label>
        <input
          placeholder="e.g. Dinner, Trip expenses"
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
      <button
        type="submit"
        disabled={Math.abs(remainingFloat) > 0.01}
        className={`btn btn-primary w-full h-[48px] mt-2 font-semibold rounded-xl ${
          Math.abs(remainingFloat) > 0.01 ? 'opacity-50 cursor-not-allowed' : ''
        }`}
      >
        {isEdit ? 'Save Changes' : 'Record Shared Expense'}
      </button>
    </form>
  );
}
