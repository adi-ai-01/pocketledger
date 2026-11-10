import { useState, useMemo } from 'react';
import {
  Users,
  Search,
  Plus,
  ChevronRight,
  X,
  Archive,
  UserPlus,
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
    });
  }, [directory, filter, showArchived, searchQuery]);

  // Handler for adding a new person
  const handleAddPerson = (e) => {
    e.preventDefault();
    setAddError(null);

    const trimmedName = newPersonName.trim();
    if (!trimmedName) {
      setAddError('Person name cannot be empty');
      return;
    }

    // Check duplicate name
    const exists = people.some((p) => p.name.toLowerCase() === trimmedName.toLowerCase());
    if (exists) {
      setAddError(`A contact named '${trimmedName}' already exists.`);
      return;
    }

    // Validate UPI ID if provided
    const trimmedUpi = newPersonUpi.trim();
    if (trimmedUpi && !isValidUpiId(trimmedUpi)) {
      setAddError(`Invalid UPI ID '${trimmedUpi}'. Format must be username@bank (e.g. name@okaxis)`);
      return;
    }

    if (onAddPerson) {
      const res = onAddPerson({ name: trimmedName, upiId: trimmedUpi });
      if (res && res.success === false) {
        setAddError(res.error || 'Failed to add person');
        return;
      }
    }

    setNewPersonName('');
    setNewPersonUpi('');
    setShowAddModal(false);
  };

  // If a person is currently selected, drill down into PersonDetailView
  if (selectedPerson) {
    return (
      <div className="w-full pt-4 sm:pt-5 pb-28 sm:pb-32 animate-fade-in">
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
    <div className="w-full pt-5 sm:pt-6 pb-28 sm:pb-32 space-y-6 animate-fade-in">
      {/* ── Screen Header ── */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-[26px] sm:text-[28px] font-bold tracking-tight text-text-primary leading-tight">
            People
          </h1>
          <p className="text-sm text-text-secondary mt-0.5">
            {counts.all} {counts.all === 1 ? 'contact' : 'contacts'} · {counts.owedToMe + counts.iOwe} active balances
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="h-[38px] px-3.5 rounded-xl bg-accent text-white text-xs font-semibold flex items-center gap-1.5 hover:opacity-90 active:opacity-85 transition-opacity"
          aria-label="Add Person"
        >
          <Plus size={15} /> Add Person
        </button>
      </header>

      {/* ── Search Bar ── */}
      <div>
        <div className="relative flex items-center">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          <input
            type="text"
            placeholder="Search by name or UPI handle..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-[48px] pl-11 pr-10 bg-secondary border border-[var(--border-color)] rounded-xl text-text-primary text-sm focus:border-accent outline-none placeholder:text-text-muted"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary p-1 flex items-center justify-center"
              aria-label="Clear search"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* ── Filter Pills Bar ── */}
      <div>
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
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
                className={`h-[34px] px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-all whitespace-nowrap flex-shrink-0 ${
                  isActive
                    ? 'border-accent bg-accent/15 text-text-primary font-semibold'
                    : 'border-[var(--border-color)] bg-secondary/40 text-text-secondary hover:text-text-primary'
                }`}
              >
                <span>{tab.label}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  isActive ? 'bg-accent/30 text-text-primary font-bold' : 'bg-white/5 text-text-muted'
                }`}>
                  {tab.count}
                </span>
              </button>
            );
          })}

          {/* Archived Toggle Button */}
          {counts.archived > 0 && (
            <button
              onClick={() => setShowArchived(!showArchived)}
              className={`h-[34px] px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-all whitespace-nowrap flex-shrink-0 ${
                showArchived
                  ? 'border-accent bg-accent/20 text-text-primary font-bold'
                  : 'border-[var(--border-color)] bg-secondary/30 text-text-secondary hover:text-text-primary'
              }`}
            >
              <Archive size={13} />
              <span>Archived ({counts.archived})</span>
            </button>
          )}
        </div>
      </div>

      {/* ── People Directory List ── */}
      <div>
        {filteredPeople.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <Users size={28} className="text-text-muted mx-auto opacity-40" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-text-secondary">
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
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-color)]/60 border-y border-[var(--border-color)]/60">
            {filteredPeople.map((person) => {
              const bal = person.balanceRupees;
              const isOwed = bal > 0.001;
              const isOwe = bal < -0.001;
              const isZero = !isOwed && !isOwe;
              const absBal = Math.abs(bal);

              return (
                <div
                  key={person.id || person.name}
                  onClick={() => setSelectedPerson(person)}
                  className="w-full h-[60px] flex items-center justify-between gap-3 text-left hover:bg-secondary/30 transition-colors px-1 cursor-pointer"
                >
                  {/* Initials Avatar */}
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-semibold flex-shrink-0 border ${
                      isZero
                        ? 'bg-secondary border-[var(--border-color)] text-text-muted'
                        : isOwed
                        ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                        : 'bg-rose-500/10 border-rose-500/25 text-rose-400'
                    }`}
                  >
                    {person.name ? person.name.charAt(0).toUpperCase() : '?'}
                  </div>

                  {/* Name & Subtitle */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-[15px] font-medium text-text-primary truncate">
                        {person.name}
                      </p>
                      {person.isArchived && (
                        <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-neutral-500/20 text-neutral-400 font-semibold border border-neutral-500/30">
                          Archived
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-text-muted truncate">
                      {person.lastActivityDate ? (
                        <span>Last: {person.lastActivityDate}</span>
                      ) : (
                        <span>{person.transactionCount > 0 ? `${person.transactionCount} transactions` : 'No transactions'}</span>
                      )}
                      {person.upiId && (
                        <>
                          <span>·</span>
                          <span className="font-mono text-[11px] text-text-muted">{person.upiId}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Balance & Direction Badge */}
                  <div className="text-right flex-shrink-0">
                    <div className={`text-[15px] font-semibold tabular-nums ${
                      isZero
                        ? 'text-text-muted'
                        : isOwed
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    }`}>
                      {isZero ? `${currency}0` : `${isOwed ? '+' : '-'}${currency}${absBal.toLocaleString('en-IN')}`}
                    </div>
                    <p className="text-[11px] text-text-muted">
                      {isZero ? 'Settled' : isOwed ? 'owes you' : 'you owe'}
                    </p>
                  </div>

                  <ChevronRight size={18} className="text-text-muted flex-shrink-0 ml-1" />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Add Person Modal ── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-card border border-[var(--border-color)] rounded-2xl w-full max-w-sm p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-text-primary">Add New Person</h3>
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

            <form onSubmit={handleAddPerson} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-text-secondary block mb-1.5">Full Name</label>
                <input
                  value={newPersonName}
                  onChange={(e) => {
                    setNewPersonName(e.target.value);
                    setAddError(null);
                  }}
                  className="w-full h-[50px] px-3.5 bg-secondary border border-[var(--border-color)] rounded-xl text-text-primary text-sm focus:border-accent outline-none"
                  placeholder="e.g. Vikram Sharma"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs font-medium text-text-secondary block mb-1.5">UPI ID (optional)</label>
                <input
                  value={newPersonUpi}
                  onChange={(e) => {
                    setNewPersonUpi(e.target.value);
                    setAddError(null);
                  }}
                  className="w-full h-[50px] px-3.5 bg-secondary border border-[var(--border-color)] rounded-xl text-text-primary text-sm font-mono focus:border-accent outline-none"
                  placeholder="e.g. vikram@okhdfcbank"
                />
                <p className="text-[11px] text-text-muted mt-1.5">
                  Allows external UPI payment launching for outgoing repayments.
                </p>
              </div>

              {addError && (
                <p className="text-xs text-rose-400 bg-rose-500/10 p-3 rounded-xl border border-rose-500/20">
                  {addError}
                </p>
              )}

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setAddError(null);
                  }}
                  className="btn btn-ghost flex-1 text-xs !py-2.5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary flex-1 text-xs !py-2.5 font-semibold"
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
