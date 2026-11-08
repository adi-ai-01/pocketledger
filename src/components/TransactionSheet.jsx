import { useState, useEffect } from 'react';
import { X, ArrowUpRight, ArrowDownLeft, Scissors, Plus, Minus, Bell } from 'lucide-react';

export default function TransactionSheet({ type, editTxn, people, categories, settings, onSave, onClose, onAddPendingAlarm }) {
  const isEdit = !!editTxn;
  const currency = settings.currency || '₹';

  // Form state
  const [txnType, setTxnType] = useState(editTxn?.type || type || 'give');
  const [person, setPerson] = useState(editTxn?.person || '');
  const [amount, setAmount] = useState(editTxn ? String(editTxn.amount) : '');
  const [description, setDescription] = useState(editTxn?.description || '');
  const [category, setCategory] = useState(editTxn?.category || 'Other');
  const [date, setDate] = useState(editTxn?.date ? editTxn.date.slice(0, 10) : new Date().toISOString().slice(0, 10));

  // Split-specific
  const [splitPeople, setSplitPeople] = useState(
    editTxn?.splits || [{ person: '', amount: 0 }]
  );
  const [myShare, setMyShare] = useState(editTxn?.myShare ? String(editTxn.myShare) : '');

  // Pending alarm
  const [wantPending, setWantPending] = useState(false);

  // Settle mode from Lendings tab
  useEffect(() => {
    if (type === 'settle' && editTxn?.person) {
      setPerson(editTxn.person);
      setAmount(String(editTxn.amount || ''));
      setTxnType('settle');
    }
  }, [type, editTxn]);

  const handleSave = () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;

    if (txnType === 'split') {
      const validSplits = splitPeople.filter((s) => s.person && s.amount > 0);
      if (validSplits.length === 0) return;
      onSave({
        type: 'split',
        person: validSplits.map((s) => s.person).join(', '),
        amount: amt,
        myShare: parseFloat(myShare) || 0,
        splits: validSplits,
        description,
        category,
        date: new Date(date).toISOString(),
      });
    } else {
      if (!person.trim()) return;
      onSave({
        type: txnType,
        person: person.trim(),
        amount: amt,
        description,
        category,
        date: new Date(date).toISOString(),
      });

      // If pending alarm was requested
      if (wantPending && (txnType === 'give' || txnType === 'settle')) {
        onAddPendingAlarm({
          personName: person.trim(),
          amount: amt,
          direction: txnType === 'give' ? 'gave' : 'settled',
        });
      }
    }
  };

  // Split helpers
  const addSplitPerson = () => setSplitPeople([...splitPeople, { person: '', amount: 0 }]);
  const removeSplitPerson = (idx) => setSplitPeople(splitPeople.filter((_, i) => i !== idx));
  const updateSplit = (idx, field, val) => {
    const next = [...splitPeople];
    next[idx] = { ...next[idx], [field]: field === 'amount' ? parseFloat(val) || 0 : val };
    setSplitPeople(next);
  };

  const splitEvenly = () => {
    const total = parseFloat(amount) || 0;
    if (total <= 0 || splitPeople.length === 0) return;
    const numParts = splitPeople.filter((s) => s.person).length + 1; // +1 for me
    const each = Math.round((total / numParts) * 100) / 100;
    setSplitPeople(splitPeople.map((s) => ({ ...s, amount: each })));
    setMyShare(String(each));
  };

  const typeLabel = { give: 'Give', take: 'Take', split: 'Split', settle: 'Settle' };
  const typeIcon = { give: ArrowUpRight, take: ArrowDownLeft, split: Scissors, settle: ArrowDownLeft };
  const TypeIcon = typeIcon[txnType] || ArrowUpRight;

  // Person autocomplete options
  const personOptions = people.map((p) => p.name);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="handle" />

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <TypeIcon size={20} className="text-accent" />
            {isEdit ? 'Edit' : typeLabel[txnType] || 'New'} Transaction
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-surface-3">
            <X size={18} className="text-text-muted" />
          </button>
        </div>

        {/* Type switcher (only for new transactions) */}
        {!isEdit && txnType !== 'settle' && (
          <div className="flex gap-2 mb-4">
            {['give', 'take', 'split'].map((t) => (
              <button
                key={t}
                onClick={() => setTxnType(t)}
                className={`chip flex-1 justify-center py-2 ${
                  txnType === t ? 'bg-accent/20 text-accent font-semibold' : 'bg-surface-3 text-text-secondary'
                }`}
              >
                {typeLabel[t]}
              </button>
            ))}
          </div>
        )}

        <div className="space-y-3.5">
          {/* Amount */}
          <div>
            <label className="text-xs text-text-muted mb-1 block">Amount ({currency})</label>
            <input
              type="number"
              inputMode="decimal"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="!text-2xl !font-bold !py-4 text-center"
              autoFocus
            />
          </div>

          {/* Person (for non-split) */}
          {txnType !== 'split' && (
            <div>
              <label className="text-xs text-text-muted mb-1 block">
                {txnType === 'give' ? 'To whom' : txnType === 'take' ? 'From whom' : 'Person'}
              </label>
              <input
                list="people-list"
                placeholder="Person name"
                value={person}
                onChange={(e) => setPerson(e.target.value)}
              />
              <datalist id="people-list">
                {personOptions.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </div>
          )}

          {/* Split people */}
          {txnType === 'split' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-text-muted">Split with</label>
                <div className="flex gap-2">
                  <button onClick={splitEvenly} className="text-xs text-accent font-medium">Even Split</button>
                  <button onClick={addSplitPerson} className="text-xs text-accent font-medium flex items-center gap-0.5">
                    <Plus size={12} /> Add
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                {splitPeople.map((sp, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <input
                      list="people-list"
                      placeholder="Name"
                      value={sp.person}
                      onChange={(e) => updateSplit(idx, 'person', e.target.value)}
                      className="flex-1 !py-2.5 !text-sm"
                    />
                    <input
                      type="number"
                      placeholder="Amount"
                      value={sp.amount || ''}
                      onChange={(e) => updateSplit(idx, 'amount', e.target.value)}
                      className="w-24 !py-2.5 !text-sm"
                    />
                    {splitPeople.length > 1 && (
                      <button onClick={() => removeSplitPerson(idx)} className="p-1.5 rounded-lg hover:bg-surface-3">
                        <Minus size={14} className="text-red" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <datalist id="people-list">
                {personOptions.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
              <div className="mt-2">
                <label className="text-xs text-text-muted mb-1 block">My share</label>
                <input
                  type="number"
                  placeholder="Your share amount"
                  value={myShare}
                  onChange={(e) => setMyShare(e.target.value)}
                  className="!py-2.5 !text-sm"
                />
              </div>
            </div>
          )}

          {/* Description */}
          <div>
            <label className="text-xs text-text-muted mb-1 block">Description</label>
            <input
              placeholder="What was it for?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Category */}
          <div>
            <label className="text-xs text-text-muted mb-1 block">Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Date */}
          <div>
            <label className="text-xs text-text-muted mb-1 block">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          {/* Pending Alarm toggle */}
          {!isEdit && (txnType === 'give' || txnType === 'settle') && (
            <button
              onClick={() => setWantPending(!wantPending)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                wantPending ? 'border-amber bg-amber/10' : 'border-border'
              }`}
            >
              <Bell size={18} className={wantPending ? 'text-amber' : 'text-text-muted'} />
              <div className="text-left flex-1">
                <p className="text-sm font-medium">Pending Alarm</p>
                <p className="text-xs text-text-muted">
                  {txnType === 'give'
                    ? "Remind me to confirm they paid back"
                    : "Remind me to confirm payment was received"}
                </p>
              </div>
              <div className={`w-10 h-6 rounded-full relative transition-colors ${wantPending ? 'bg-amber' : 'bg-surface-3'}`}>
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${wantPending ? 'left-5' : 'left-1'}`} />
              </div>
            </button>
          )}

          {/* Save */}
          <button onClick={handleSave} className="btn btn-primary w-full mt-2">
            {isEdit ? 'Save Changes' : `${typeLabel[txnType] || 'Add'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
