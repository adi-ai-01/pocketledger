import { useState } from 'react';
import { User, ChevronRight, ArrowUpRight, ArrowDownLeft, Plus, ExternalLink, Phone } from 'lucide-react';
import { getPersonHistory, uid } from '../store.js';

export default function LendingsTab({ balances, people, transactions, settings, onOpenSheet, onAddPerson, onUpdatePerson, onAddTransaction }) {
  const currency = settings.currency || '₹';
  const [expandedPerson, setExpandedPerson] = useState(null);
  const [showAddPerson, setShowAddPerson] = useState(false);
  const [newPersonName, setNewPersonName] = useState('');
  const [newPersonUpi, setNewPersonUpi] = useState('');
  const [adjustModal, setAdjustModal] = useState(null); // { personName }
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustNote, setAdjustNote] = useState('');

  // Build sorted list of people with balances
  const peopleWithBalances = people
    .map((p) => ({ ...p, balance: balances[p.name] || 0 }))
    .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));

  // People who appear in balances but not in people list
  const extraPeople = Object.keys(balances)
    .filter((name) => !people.find((p) => p.name === name))
    .map((name) => ({ id: name, name, balance: balances[name] || 0 }));

  const allPeople = [...peopleWithBalances, ...extraPeople];

  const handleAddPerson = () => {
    if (newPersonName.trim()) {
      onAddPerson(newPersonName.trim(), newPersonUpi.trim());
      setNewPersonName('');
      setNewPersonUpi('');
      setShowAddPerson(false);
    }
  };

  const handleAdjust = () => {
    if (!adjustAmount || !adjustModal) return;
    const amt = parseFloat(adjustAmount);
    if (isNaN(amt)) return;
    onAddTransaction({
      type: 'adjustment',
      person: adjustModal.personName,
      amount: amt,
      description: adjustNote || 'Manual balance adjustment',
      category: 'Adjustment',
      date: new Date().toISOString(),
    });
    setAdjustModal(null);
    setAdjustAmount('');
    setAdjustNote('');
  };

  const openGPay = (upiId, amount, name) => {
    // GPay deep link / UPI intent
    const url = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(name)}&am=${Math.abs(amount)}&cu=INR`;
    window.location.href = url;
  };

  return (
    <div className="animate-fade-in">
      <header className="px-5 pt-6 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Lendings</h1>
          <p className="text-text-muted text-xs mt-0.5">Tap a person to expand</p>
        </div>
        <button
          onClick={() => setShowAddPerson(true)}
          className="btn btn-ghost text-sm py-2 px-3"
        >
          <Plus size={16} /> Add
        </button>
      </header>

      {/* People list */}
      <div className="px-5 space-y-2.5 mb-6">
        {allPeople.length === 0 && (
          <div className="glass p-8 text-center">
            <User size={32} className="text-text-muted mx-auto mb-2" />
            <p className="text-text-muted text-sm">No people yet</p>
            <p className="text-text-muted text-xs mt-1">They'll appear when you add transactions</p>
          </div>
        )}
        {allPeople.map((person) => {
          const isExpanded = expandedPerson === person.name;
          const balance = person.balance;
          const isPositive = balance > 0;
          const isZero = balance === 0;
          const history = isExpanded ? getPersonHistory(transactions, person.name).slice(0, 8) : [];
          const personData = people.find((p) => p.name === person.name);

          return (
            <div key={person.name} className="glass overflow-hidden">
              <button
                onClick={() => setExpandedPerson(isExpanded ? null : person.name)}
                className="w-full p-4 flex items-center gap-3 text-left"
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                  isZero ? 'bg-surface-3 text-text-muted' :
                  isPositive ? 'bg-green/15 text-green' : 'bg-red/15 text-red'
                }`}>
                  {person.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{person.name}</p>
                  <p className="text-xs text-text-muted">
                    {isZero ? 'Settled' : isPositive ? 'owes you' : 'you owe'}
                  </p>
                </div>
                <span className={`text-sm font-bold ${
                  isZero ? 'text-text-muted' :
                  isPositive ? 'text-green' : 'text-red'
                }`}>
                  {isZero ? 'Settled' : `${isPositive ? '+' : '-'}${currency}${Math.abs(balance).toLocaleString('en-IN')}`}
                </span>
                <ChevronRight size={16} className={`text-text-muted transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
              </button>

              {/* Expanded panel */}
              {isExpanded && (
                <div className="border-t border-border px-4 py-3 animate-fade-in">
                  {/* Actions row */}
                  <div className="flex gap-2 mb-3">
                    <button
                      onClick={() => onOpenSheet('settle', { person: person.name, amount: Math.abs(balance) })}
                      className="btn btn-ghost text-xs py-1.5 px-3 flex-1"
                    >
                      Settle
                    </button>
                    <button
                      onClick={() => setAdjustModal({ personName: person.name })}
                      className="btn btn-ghost text-xs py-1.5 px-3 flex-1"
                    >
                      Adjust
                    </button>
                    {personData?.upiId && (
                      <button
                        onClick={() => openGPay(personData.upiId, balance, person.name)}
                        className="btn btn-primary text-xs py-1.5 px-3 flex-1"
                      >
                        <ExternalLink size={12} /> Pay
                      </button>
                    )}
                  </div>

                  {/* UPI ID */}
                  {personData?.upiId && (
                    <p className="text-xs text-text-muted mb-2">UPI: {personData.upiId}</p>
                  )}

                  {/* Mini history */}
                  {history.length > 0 ? (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-text-secondary">Recent</p>
                      {history.map((txn) => {
                        const d = new Date(txn.date);
                        const isOut = txn.type === 'give' || txn.type === 'split' || txn.type === 'adjustment';
                        return (
                          <div key={txn.id} className="flex items-center justify-between py-1.5">
                            <div className="flex items-center gap-2">
                              <div className={`w-1.5 h-1.5 rounded-full ${isOut ? 'bg-red' : 'bg-green'}`} />
                              <span className="text-xs text-text-secondary truncate max-w-[140px]">
                                {txn.description || txn.type}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-text-muted">
                                {d.getDate()}/{d.getMonth() + 1}
                              </span>
                              <span className={`text-xs font-medium ${isOut ? 'text-red' : 'text-green'}`}>
                                {isOut ? '-' : '+'}{currency}{(txn.type === 'split' ? (txn.myShare || txn.amount) : txn.amount).toLocaleString('en-IN')}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-text-muted">No transaction history</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add Person Sheet */}
      {showAddPerson && (
        <div className="overlay" onClick={() => setShowAddPerson(false)}>
          <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="handle" />
            <h2 className="text-lg font-bold mb-4">Add Person</h2>
            <div className="space-y-3">
              <input
                placeholder="Name"
                value={newPersonName}
                onChange={(e) => setNewPersonName(e.target.value)}
                autoFocus
              />
              <input
                placeholder="UPI ID (optional)"
                value={newPersonUpi}
                onChange={(e) => setNewPersonUpi(e.target.value)}
              />
              <button onClick={handleAddPerson} className="btn btn-primary w-full">Add Person</button>
            </div>
          </div>
        </div>
      )}

      {/* Adjust Balance Modal */}
      {adjustModal && (
        <div className="overlay" onClick={() => setAdjustModal(null)}>
          <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="handle" />
            <h2 className="text-lg font-bold mb-1">Adjust Balance</h2>
            <p className="text-text-muted text-sm mb-4">For {adjustModal.personName}</p>
            <div className="space-y-3">
              <input
                type="number"
                placeholder="Amount (+ they owe more, - they owe less)"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                autoFocus
              />
              <input
                placeholder="Note (optional)"
                value={adjustNote}
                onChange={(e) => setAdjustNote(e.target.value)}
              />
              <button onClick={handleAdjust} className="btn btn-primary w-full">Apply Adjustment</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
