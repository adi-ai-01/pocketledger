import { useState, useMemo } from 'react';
import {
  Users,
  Search,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronRight,
  X,
  CreditCard,
  Archive,
  UserPlus,
  Clock,
} from 'lucide-react';
import { isValidUpiId } from '../domain/store-core.js';
import PersonDetailView from './PersonDetailView.jsx';

export default function PeopleTab({
  people = [],
  balances = {},
  transactions = [],
  settings = {},
  store,
  onOpenSheet,
  onAddPerson,
  onUpdatePerson,
  onAddTransaction,
  onNavigateTab,
}) {
  const currency = settings.currency || '₹';
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState('ALL'); // 'ALL' | 'OWED_TO_ME' | 'I_OWE' | 'SETTLED'
  const [showArchived, setShowArchived] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newPersonName, setNewPersonName] = useState('');
  const [newPersonUpi, setNewPersonUpi] = useState('');
  const [addError, setAddError] = useState(null);

  // Get canonical directory from store
  const directory = useMemo(() => {
    if (store?.getPeopleDirectory) {
      return store.getPeopleDirectory();
    }
    // Fallback using props
    const list = people.map((p) => ({
      ...p,
      balanceRupees: balances[p.name] || 0,
      isArchived: !!p.isArchived,
      lastActivityDate: null,
      transactionCount: 0,
    }));
    return list;
  }, [store, people, balances, transactions]);

  // Aggregate counts for filter pills
  const counts = useMemo(() => {
    let all = 0;
    let owedToMe = 0;
    let iOwe = 0;
    let settled = 0;
    let archived = 0;

    for (const p of directory) {
      if (p.isArchived) {
        archived++;
        continue;
      }
      all++;
      if (p.balanceRupees > 0.001) owedToMe++;
      else if (p.balanceRupees < -0.001) iOwe++;
      else settled++;
    }

    return { all, owedToMe, iOwe, settled, archived };
  }, [directory]);

  // Filtered list
  const filteredPeople = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return directory.filter((p) => {
      // Archive toggle filter
      if (showArchived) {
        if (!p.isArchived) return false;
      } else {
        if (p.isArchived) return false;
      }

      // Tab filter (applies only in active list)
      if (!showArchived) {
        if (filter === 'OWED_TO_ME' && p.balanceRupees <= 0.001) return false;
        if (filter === 'I_OWE' && p.balanceRupees >= -0.001) return false;
        if (filter === 'SETTLED' && Math.abs(p.balanceRupees) > 0.001) return false;
      }

      // Search query filter
      if (q) {
        const matchName = p.name && p.name.toLowerCase().includes(q);
        const matchUpi = p.upiId && p.upiId.toLowerCase().includes(q);
        if (!matchName && !matchUpi) return false;
      }

      return true;
    }).sort((a, b) => {
      // Sort by absolute balance descending first, then alphabetically
      const absDiff = Math.abs(b.balanceRupees) - Math.abs(a.balanceRupees);
      if (absDiff !== 0) return absDiff;
      return a.name.localeCompare(b.name);
    });
  }, [directory, searchQuery, filter, showArchived]);

  const handleAddPerson = (e) => {
    e.preventDefault();
    const cleanName = newPersonName.trim();
    if (!cleanName) {
      setAddError('Please enter a person name');
      return;
    }

    const cleanUpi = newPersonUpi.trim();
    if (cleanUpi && !isValidUpiId(cleanUpi)) {
      setAddError(`Invalid UPI ID '${cleanUpi}'. Expected format: username@bank (e.g. rahul@okaxis)`);
      return;
    }

    if (store?.addPerson) {
      store.addPerson(cleanName, cleanUpi);
    } else if (onAddPerson) {
      onAddPerson(cleanName, cleanUpi);
    }

    setNewPersonName('');
    setNewPersonUpi('');
    setAddError(null);
    setShowAddModal(false);
  };

  // If a person is currently selected, render the dedicated PersonDetailView
  if (selectedPerson) {
    return (
      <div className="px-5 pt-3">
        <PersonDetailView
          personName={selectedPerson.name}
          personId={selectedPerson.id}
          store={store}
          settings={settings}
          onBack={() => setSelectedPerson(null)}
          onOpenSheet={onOpenSheet}
        />
      </div>
    );
  }

  return (
    <div className="animate-fade-in pb-16">
      {/* ── Screen Header ── */}
      <header className="px-2 sm:px-0 pt-5 pb-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-text-primary">People</h1>
          <p className="text-xs text-text-muted mt-0.5">
            {counts.all} {counts.all === 1 ? 'contact' : 'contacts'} · {counts.owedToMe + counts.iOwe} active balances
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="btn btn-primary text-xs py-2 px-3 flex items-center gap-1.5 font-semibold"
          aria-label="Add Person"
        >
          <Plus size={15} /> Add Person
        </button>
      </header>

      {/* ── Search Bar ── */}
      <div className="px-2 sm:px-0 mb-3">
        <div className="relative">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          <input
            type="text"
            placeholder="Search by name or UPI handle..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="!py-2.5 !pl-9 !pr-9 !text-xs w-full bg-secondary/50 rounded-xl border border-[var(--border-color)] placeholder:text-text-muted"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary p-0.5"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* ── Filter Pills Bar ── */}
      <div className="px-2 sm:px-0 mb-4">
        <div className="flex items-center justify-between gap-1 overflow-x-auto no-scrollbar pb-1">
          <div className="flex items-center gap-1.5">
            {[
              { id: 'ALL', label: 'All', count: counts.all },
              { id: 'OWED_TO_ME', label: 'Owed to you', count: counts.owedToMe },
              { id: 'I_OWE', label: 'You owe', count: counts.iOwe },
              { id: 'SETTLED', label: 'Settled', count: counts.settled },
            ].map((tab) => {
              const isActive = !showArchived && filter === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setShowArchived(false);
                    setFilter(tab.id);
                  }}
                  className={`text-xs py-1.5 px-2.5 rounded-lg border font-medium flex items-center gap-1.5 transition-all whitespace-nowrap ${
                    isActive
                      ? 'border-accent bg-accent/15 text-text-primary font-bold'
                      : 'border-[var(--border-color)] bg-secondary/30 text-text-muted hover:text-text-primary'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    isActive ? 'bg-accent/30 text-text-primary font-bold' : 'bg-white/5 text-text-muted'
                  }`}>
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Archived Toggle Button */}
          {counts.archived > 0 && (
            <button
              onClick={() => setShowArchived(!showArchived)}
              className={`text-xs py-1.5 px-2.5 rounded-lg border font-medium flex items-center gap-1.5 transition-all whitespace-nowrap ml-1 ${
                showArchived
                  ? 'border-accent bg-accent/20 text-text-primary font-bold'
                  : 'border-[var(--border-color)] bg-secondary/20 text-text-muted hover:text-text-primary'
              }`}
            >
              <Archive size={12} />
              <span>Archived ({counts.archived})</span>
            </button>
          )}
        </div>
      </div>

      {/* ── People Directory List ── */}
      <div className="px-2 sm:px-0 space-y-2">
        {filteredPeople.length === 0 ? (
          <div className="theme-card p-8 text-center space-y-3">
            <Users size={32} className="text-text-muted mx-auto opacity-40" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-text-secondary">
                {searchQuery
                  ? `No people matching "${searchQuery}"`
                  : showArchived
                  ? 'No archived contacts'
                  : filter === 'OWED_TO_ME'
                  ? 'Nobody owes you money right now'
                  : filter === 'I_OWE'
                  ? 'You do not owe anyone money'
                  : filter === 'SETTLED'
                  ? 'No settled contacts yet'
                  : 'No contacts added yet'}
              </p>
              <p className="text-xs text-text-muted max-w-xs mx-auto">
                {searchQuery
                  ? 'Try searching with a different name or clear the query.'
                  : 'Add friends and counterparties to manage shared bills, lending, and repayments.'}
              </p>
            </div>
            {!searchQuery && !showArchived && (
              <button
                onClick={() => setShowAddModal(true)}
                className="btn btn-primary text-xs py-2 px-3 mx-auto flex items-center gap-1.5 mt-2"
              >
                <UserPlus size={14} /> Add First Contact
              </button>
            )}
          </div>
        ) : (
          filteredPeople.map((person) => {
            const bal = person.balanceRupees;
            const isOwed = bal > 0.001;
            const isOwe = bal < -0.001;
            const isZero = !isOwed && !isOwe;
            const absBal = Math.abs(bal);

            return (
              <div
                key={person.id || person.name}
                onClick={() => setSelectedPerson(person)}
                className="theme-card p-3.5 flex items-center gap-3.5 cursor-pointer hover:border-accent/40 active:scale-[0.99] transition-all"
              >
                {/* Initials Avatar */}
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 border ${
                    isZero
                      ? 'bg-secondary border-[var(--border-color)] text-text-muted'
                      : isOwed
                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                      : 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                  }`}
                >
                  {person.name ? person.name.charAt(0).toUpperCase() : '?'}
                </div>

                {/* Name & Subtitle */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold text-text-primary truncate">
                      {person.name}
                    </p>
                    {person.isArchived && (
                      <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-neutral-500/20 text-neutral-400 font-bold border border-neutral-500/30">
                        Archived
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-text-muted mt-0.5 truncate">
                    {person.lastActivityDate ? (
                      <span>Last: {person.lastActivityDate}</span>
                    ) : (
                      <span>{person.transactionCount > 0 ? `${person.transactionCount} transactions` : 'No transactions'}</span>
                    )}
                    {person.upiId && (
                      <>
                        <span>·</span>
                        <span className="font-mono text-[10px] text-text-muted/80">{person.upiId}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Balance & Direction Badge */}
                <div className="text-right flex-shrink-0">
                  <div className={`text-sm font-bold tabular-nums ${
                    isZero
                      ? 'text-text-muted'
                      : isOwed
                      ? 'text-emerald-400'
                      : 'text-rose-400'
                  }`}>
                    {isZero ? `${currency}0` : `${isOwed ? '+' : '-'}${currency}${absBal.toLocaleString('en-IN')}`}
                  </div>
                  <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">
                    {isZero ? 'Settled' : isOwed ? 'owes you' : 'you owe'}
                  </p>
                </div>

                <ChevronRight size={16} className="text-text-muted flex-shrink-0" />
              </div>
            );
          })
        )}
      </div>

      {/* ── Add Person Modal ── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-card border border-[var(--border-color)] rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-text-primary">Add New Person</h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setAddError(null);
                }}
                className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddPerson} className="space-y-3.5">
              <div>
                <label className="text-xs text-text-muted block mb-1">Full Name</label>
                <input
                  value={newPersonName}
                  onChange={(e) => {
                    setNewPersonName(e.target.value);
                    setAddError(null);
                  }}
                  className="!py-2.5 !text-sm w-full"
                  placeholder="e.g. Vikram Sharma"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs text-text-muted block mb-1">UPI ID (optional)</label>
                <input
                  value={newPersonUpi}
                  onChange={(e) => {
                    setNewPersonUpi(e.target.value);
                    setAddError(null);
                  }}
                  className="!py-2.5 !text-sm w-full font-mono"
                  placeholder="e.g. vikram@okhdfcbank"
                />
                <p className="text-[10px] text-text-muted mt-1">
                  Allows seamless external UPI payment launching for outgoing repayments.
                </p>
              </div>

              {addError && (
                <p className="text-xs text-red-400 bg-red-500/10 p-2.5 rounded-lg border border-red-500/20">
                  {addError}
                </p>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setAddError(null);
                  }}
                  className="btn btn-ghost flex-1 text-xs py-2.5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary flex-1 text-xs py-2.5 font-semibold"
                >
                  Save Person
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
