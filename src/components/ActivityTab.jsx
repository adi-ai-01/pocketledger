import { useState, useMemo } from 'react';
import {
  Search,
  ArrowUpRight,
  ArrowDownLeft,
  Scissors,
  CheckCircle2,
  AlertTriangle,
  CreditCard,
  X,
  ExternalLink,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import TransactionDetailModal from './TransactionDetailModal.jsx';

const EVENT_TYPE_OPTIONS = [
  { id: 'all', label: 'All Types' },
  { id: 'personal_expense', label: 'Personal Expense' },
  { id: 'shared_expense', label: 'Shared Expense' },
  { id: 'lend', label: 'Lent' },
  { id: 'borrow', label: 'Borrowed' },
  { id: 'repayment', label: 'Repayment' },
  { id: 'adjustment', label: 'Adjustment' },
  { id: 'legacy', label: 'Legacy/Review' },
];

const DATE_RANGE_OPTIONS = [
  { id: 'all', label: 'All Time' },
  { id: 'this_month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' },
  { id: 'last_90', label: 'Last 90 Days' },
];

export default function ActivityTab({
  transactions = [],
  settings = {},
  people = [],
  store,
  onOpenSheet,
  onEdit,
  onDelete,
}) {
  const currency = settings.currency || '₹';
  const [activeView, setActiveView] = useState('LEDGER'); // 'LEDGER' | 'PAYMENT_ATTEMPTS'
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [personFilter, setPersonFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [selectedTxn, setSelectedTxn] = useState(null);
  const [attemptStatusFilter, setAttemptStatusFilter] = useState('ALL'); // 'ALL' | 'UNRESOLVED' | 'COMPLETED' | 'OTHER'

  // Get canonical projected transactions from store
  const allTxns = useMemo(() => {
    if (store?.getLegacyProjectedTransactions) {
      return store.getLegacyProjectedTransactions();
    }
    return transactions || [];
  }, [store, transactions]);

  // Payment attempts
  const allAttempts = useMemo(() => {
    if (store?.getPaymentAttempts) {
      return store.getPaymentAttempts();
    }
    return [];
  }, [store]);

  // Unique list of people for the person dropdown
  const uniquePeople = useMemo(() => {
    const set = new Set();
    for (const t of allTxns) {
      if (t.person) {
        for (const p of t.person.split(', ')) {
          if (p.trim()) set.add(p.trim());
        }
      }
    }
    for (const p of people) {
      if (p.name) set.add(p.name);
    }
    return Array.from(set).sort();
  }, [allTxns, people]);

  // Filtered & Chronologically Sorted Transactions (Newest first)
  const filteredTxns = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    return [...allTxns]
      .filter((t) => {
        // Type filter
        if (typeFilter !== 'all') {
          if (typeFilter === 'personal_expense') {
            const isPE = t.action === 'personal_expense' || (!t.action && t.type === 'give' && !t.person);
            if (!isPE) return false;
          } else if (typeFilter === 'shared_expense') {
            const isSE = t.action === 'shared_expense' || t.type === 'split';
            if (!isSE) return false;
          } else if (typeFilter === 'lend') {
            const isL = t.action === 'lend' || (t.type === 'give' && t.person);
            if (!isL) return false;
          } else if (typeFilter === 'borrow') {
            const isB = t.action === 'borrow' || (t.type === 'take' && t.person);
            if (!isB) return false;
          } else if (typeFilter === 'repayment') {
            const isR = t.action === 'repayment' || t.type === 'settle';
            if (!isR) return false;
          } else if (typeFilter === 'adjustment') {
            const isA = t.action === 'adjustment' || t.type === 'adjustment';
            if (!isA) return false;
          } else if (typeFilter === 'legacy') {
            const isLeg = t.rawKind === 'LEGACY_UNCLASSIFIED' || t.action === 'unclassified' || t.reviewRequired;
            if (!isLeg) return false;
          }
        }

        // Person filter
        if (personFilter !== 'all') {
          if (!t.person || !t.person.toLowerCase().includes(personFilter.toLowerCase())) {
            return false;
          }
        }

        // Date filter
        if (dateFilter !== 'all') {
          const tDate = new Date(t.date);
          if (dateFilter === 'this_month') {
            if (tDate.getFullYear() !== currentYear || tDate.getMonth() !== currentMonth) {
              return false;
            }
          } else if (dateFilter === 'last_month') {
            const lastMonthDate = new Date(currentYear, currentMonth - 1, 1);
            if (
              tDate.getFullYear() !== lastMonthDate.getFullYear() ||
              tDate.getMonth() !== lastMonthDate.getMonth()
            ) {
              return false;
            }
          } else if (dateFilter === 'last_90') {
            const ninetyDaysAgo = new Date();
            ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
            if (tDate < ninetyDaysAgo) return false;
          }
        }

        // Search text filter
        if (search.trim()) {
          const q = search.toLowerCase();
          const matchDesc = t.description && t.description.toLowerCase().includes(q);
          const matchPerson = t.person && t.person.toLowerCase().includes(q);
          const matchCat = t.category && t.category.toLowerCase().includes(q);
          const matchMethod = t.paymentMethod && t.paymentMethod.toLowerCase().includes(q);
          if (!matchDesc && !matchPerson && !matchCat && !matchMethod) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        // Chronological sort: newest first
        const dateDiff = new Date(b.date) - new Date(a.date);
        if (dateDiff !== 0) return dateDiff;
        const createdDiff = (b.createdAt || 0) - (a.createdAt || 0);
        if (createdDiff !== 0) return createdDiff;
        return String(b.id || '').localeCompare(String(a.id || ''));
      });
  }, [allTxns, typeFilter, personFilter, dateFilter, search]);

  // Group transactions by month for readable presentation
  const groupedTxns = useMemo(() => {
    const groups = [];
    const map = new Map();

    for (const t of filteredTxns) {
      const d = new Date(t.date);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

      if (!map.has(key)) {
        const groupObj = { key, label, items: [] };
        map.set(key, groupObj);
        groups.push(groupObj);
      }
      map.get(key).items.push(t);
    }

    return groups;
  }, [filteredTxns]);

  // Filtered payment attempts
  const filteredAttempts = useMemo(() => {
    return allAttempts
      .filter((att) => {
        if (attemptStatusFilter === 'UNRESOLVED') return att.isUnresolved;
        if (attemptStatusFilter === 'COMPLETED') return att.status === 'COMPLETED';
        if (attemptStatusFilter === 'OTHER') return att.status === 'FAILED' || att.status === 'CANCELLED';
        return true;
      })
      .sort((a, b) => (b.initiatedAt || 0) - (a.initiatedAt || 0));
  }, [allAttempts, attemptStatusFilter]);

  const handleEditTxn = (txn) => {
    setSelectedTxn(null);
    if (onEdit) onEdit(txn);
  };

  const handleOpenLinkedTxn = (eventId) => {
    const target = allTxns.find((t) => t.id === eventId || t.eventId === eventId);
    if (target) {
      setSelectedTxn(target);
    }
  };

  return (
    <div className="w-full pt-5 sm:pt-6 pb-28 sm:pb-32 space-y-6 animate-fade-in">
      {/* ── Screen Header & View Toggle ── */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] sm:text-[28px] font-bold tracking-tight text-text-primary leading-tight">
            Activity
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            {filteredTxns.length} {filteredTxns.length === 1 ? 'transaction' : 'transactions'} in ledger
          </p>
        </div>

        {/* View Switcher: Ledger vs Payment Attempts */}
        <div className="flex items-center p-1 rounded-xl bg-secondary border border-[var(--border-color)] self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveView('LEDGER')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeView === 'LEDGER'
                ? 'bg-card text-text-primary shadow-sm'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Ledger
          </button>
          <button
            type="button"
            onClick={() => setActiveView('PAYMENT_ATTEMPTS')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeView === 'PAYMENT_ATTEMPTS'
                ? 'bg-card text-text-primary shadow-sm'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <span>Payment Attempts ({allAttempts.length})</span>
            {allAttempts.some((a) => a.isUnresolved) && (
              <span className="w-2 h-2 rounded-full bg-amber-400" />
            )}
          </button>
        </div>
      </header>

      {activeView === 'LEDGER' ? (
        <>
          {/* ── Search & Filter Controls ── */}
          <div className="space-y-3">
            {/* Search Input */}
            <div className="relative flex items-center">
              <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              <input
                type="text"
                placeholder="Search descriptions, people, categories..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-[48px] pl-11 pr-10 bg-secondary border border-[var(--border-color)] rounded-xl text-text-primary text-sm focus:border-accent outline-none placeholder:text-text-muted"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary p-1 flex items-center justify-center"
                  aria-label="Clear search"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Filter Dropdowns Bar */}
            <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full h-[44px] px-2.5 sm:px-3 bg-secondary border border-[var(--border-color)] rounded-xl text-text-primary text-xs font-medium focus:border-accent outline-none"
              >
                {EVENT_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>

              <select
                value={personFilter}
                onChange={(e) => setPersonFilter(e.target.value)}
                className="w-full h-[44px] px-2.5 sm:px-3 bg-secondary border border-[var(--border-color)] rounded-xl text-text-primary text-xs font-medium focus:border-accent outline-none"
              >
                <option value="all">All People</option>
                {uniquePeople.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>

              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="w-full h-[44px] px-2.5 sm:px-3 bg-secondary border border-[var(--border-color)] rounded-xl text-text-primary text-xs font-medium focus:border-accent outline-none"
              >
                {DATE_RANGE_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* ── Grouped Activity List ── */}
          <div className="space-y-6">
            {groupedTxns.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <Clock size={32} className="text-text-muted mx-auto opacity-40" />
                <p className="text-sm font-semibold text-text-secondary">No matching activity found</p>
                <p className="text-xs text-text-muted max-w-xs mx-auto">
                  Try adjusting your filters or search terms.
                </p>
                {(typeFilter !== 'all' || personFilter !== 'all' || dateFilter !== 'all' || search) && (
                  <button
                    onClick={() => {
                      setTypeFilter('all');
                      setPersonFilter('all');
                      setDateFilter('all');
                      setSearch('');
                    }}
                    className="btn btn-ghost text-xs !py-2 px-3 mx-auto mt-2"
                  >
                    Reset Filters
                  </button>
                )}
              </div>
            ) : (
              groupedTxns.map((group) => (
                <div key={group.key} className="space-y-2">
                  <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider px-1">
                    {group.label}
                  </h3>

                  <div className="divide-y divide-[var(--border-color)]/60 border-y border-[var(--border-color)]/60">
                    {group.items.map((txn) => {
                      const isPE = txn.action === 'personal_expense' || (!txn.action && txn.type === 'give' && !txn.person);
                      const isSE = txn.action === 'shared_expense' || txn.type === 'split';
                      const isL = txn.action === 'lend' || (txn.type === 'give' && txn.person);
                      const isB = txn.action === 'borrow' || (txn.type === 'take' && txn.person);
                      const isR = txn.action === 'repayment' || txn.type === 'settle';
                      const isAdj = txn.action === 'adjustment' || txn.type === 'adjustment';
                      const isLeg = txn.rawKind === 'LEGACY_UNCLASSIFIED' || txn.reviewRequired;

                      const d = new Date(txn.date);
                      const dayNumber = d.getDate();
                      const totalAmt = txn.amount || 0;
                      const userShareAmt = txn.userShare ?? txn.myShare ?? (isPE ? totalAmt : 0);

                      let displayTitle = txn.description;
                      let subtitle = '';
                      let amountSign = '';
                      let amountColor = 'text-text-primary';
                      let Icon = CreditCard;

                      if (isPE) {
                        displayTitle = txn.description || 'Personal Expense';
                        subtitle = txn.category || 'Personal';
                        amountSign = '-';
                        amountColor = 'text-text-primary';
                        Icon = CreditCard;
                      } else if (isSE) {
                        displayTitle = txn.description || 'Shared Expense';
                        subtitle = txn.person ? `with ${txn.person}` : 'Shared bill';
                        amountSign = '-';
                        amountColor = 'text-accent';
                        Icon = Scissors;
                      } else if (isL) {
                        displayTitle = `You lent ${txn.person || 'someone'}`;
                        subtitle = txn.description || 'Loan given';
                        amountSign = '+';
                        amountColor = 'text-emerald-400';
                        Icon = ArrowUpRight;
                      } else if (isB) {
                        displayTitle = `You borrowed from ${txn.person || 'someone'}`;
                        subtitle = txn.description || 'Loan taken';
                        amountSign = '-';
                        amountColor = 'text-rose-400';
                        Icon = ArrowDownLeft;
                      } else if (isR) {
                        Icon = CheckCircle2;
                        if (txn.direction === 'inflow') {
                          displayTitle = `${txn.person || 'Contact'} paid you back`;
                          subtitle = 'Repayment received';
                          amountSign = '-';
                          amountColor = 'text-emerald-400';
                        } else {
                          displayTitle = `You paid back ${txn.person || 'Contact'}`;
                          subtitle = 'Repayment sent';
                          amountSign = '+';
                          amountColor = 'text-rose-400';
                        }
                      } else if (isAdj) {
                        displayTitle = `Adjustment: ${txn.person || ''}`;
                        subtitle = txn.description || 'Manual correction';
                        amountSign = totalAmt >= 0 ? '+' : '';
                        amountColor = 'text-amber-400';
                        Icon = AlertTriangle;
                      } else if (isLeg) {
                        displayTitle = `Historical: ${txn.description || txn.type}`;
                        subtitle = txn.person || 'Legacy unclassified';
                        amountColor = 'text-neutral-400';
                        Icon = AlertTriangle;
                      }

                      return (
                        <div
                          key={txn.id}
                          onClick={() => setSelectedTxn(txn)}
                          className="w-full h-[60px] flex items-center justify-between gap-3 text-left hover:bg-secondary/30 transition-colors px-1 cursor-pointer"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <Icon size={20} className="text-text-muted flex-shrink-0" />

                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="text-[15px] font-medium text-text-primary truncate">
                                  {displayTitle}
                                </p>
                                {txn.reviewRequired && (
                                  <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30 flex-shrink-0">
                                    Review
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 text-xs text-text-muted mt-0.5 truncate">
                                <span>{dayNumber} {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]}</span>
                                <span>·</span>
                                <span className="truncate">{subtitle}</span>
                                {txn.paymentMethod && txn.paymentMethod !== 'OTHER' && (
                                  <>
                                    <span>·</span>
                                    <span>{txn.paymentMethod}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="text-right flex-shrink-0 ml-3">
                            <div className={`text-[15px] font-semibold ${amountColor} tabular-nums`}>
                              {amountSign}{currency}{(isSE ? userShareAmt : totalAmt).toLocaleString('en-IN')}
                            </div>
                            {isSE && totalAmt !== userShareAmt && (
                              <p className="text-[11px] text-text-muted tabular-nums">
                                Bill: {currency}{totalAmt.toLocaleString('en-IN')}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      ) : (
        /* ── Payment Attempts Subview ── */
        <div className="space-y-4">
          <div className="p-3.5 rounded-xl bg-secondary/60 border border-[var(--border-color)] text-xs text-text-secondary space-y-1">
            <p className="font-semibold flex items-center gap-1.5 text-text-primary">
              <ShieldCheck size={15} className="text-accent" /> External Payment Intent Log
            </p>
            <p className="text-xs text-text-muted leading-relaxed">
              Payment attempts track external payment intents (such as launching UPI apps). They never mutate your ledger until explicitly confirmed and reconciled.
            </p>
          </div>

          {/* Status Filters */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
            {[
              { id: 'ALL', label: 'All Attempts' },
              { id: 'UNRESOLVED', label: 'Pending Verification' },
              { id: 'COMPLETED', label: 'Reconciled / Completed' },
              { id: 'OTHER', label: 'Failed / Cancelled' },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setAttemptStatusFilter(f.id)}
                className={`py-1.5 px-3 rounded-lg text-xs font-medium border transition-all whitespace-nowrap ${
                  attemptStatusFilter === f.id
                    ? 'border-accent bg-accent/20 text-text-primary font-semibold'
                    : 'border-[var(--border-color)] bg-secondary/40 text-text-secondary hover:text-text-primary'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Attempts List */}
          <div>
            {filteredAttempts.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <Clock size={32} className="text-text-muted mx-auto opacity-40" />
                <p className="text-sm font-semibold text-text-secondary">No payment attempts found</p>
                <p className="text-xs text-text-muted">
                  External payment attempts initiated through UPI will appear here.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border-color)]/60 border-y border-[var(--border-color)]/60">
                {filteredAttempts.map((att) => {
                  const isCompleted = att.status === 'COMPLETED';
                  const isUnresolved = att.isUnresolved;
                  const isCancelled = att.status === 'CANCELLED';

                  return (
                    <div
                      key={att.id}
                      className="py-3.5 flex items-start justify-between gap-3 text-left hover:bg-secondary/30 transition-colors px-1"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-mono uppercase font-semibold px-2 py-0.5 rounded border ${
                            isCompleted ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' :
                            isUnresolved ? 'bg-amber-500/10 text-amber-300 border-amber-500/25' :
                            isCancelled ? 'bg-neutral-500/10 text-neutral-400 border-neutral-500/25' :
                            'bg-rose-500/10 text-rose-400 border-rose-500/25'
                          }`}>
                            {att.status}
                          </span>
                          <span className="text-xs font-mono text-text-muted">
                            #{att.id.slice(-6)}
                          </span>
                        </div>
                        <h4 className="text-[15px] font-medium text-text-primary mt-1 truncate">
                          {att.recipientName || 'Contact'}
                        </h4>
                        {att.recipientUpiId && (
                          <p className="text-xs font-mono text-text-muted mt-0.5 truncate">
                            {att.recipientUpiId}
                          </p>
                        )}
                        {att.reconciliationNotes && (
                          <p className="text-xs text-text-muted italic mt-1">
                            Note: {att.reconciliationNotes}
                          </p>
                        )}
                      </div>

                      <div className="text-right flex-shrink-0">
                        <span className="text-[15px] font-semibold text-text-primary tabular-nums">
                          {currency}{att.amountRupees ? att.amountRupees.toLocaleString('en-IN') : '0'}
                        </span>
                        <p className="text-xs text-text-muted mt-0.5">
                          {new Date(att.initiatedAt).toLocaleDateString()}
                        </p>
                        {isCompleted && att.eventId && (
                          <button
                            type="button"
                            onClick={() => handleOpenLinkedTxn(att.eventId)}
                            className="text-xs text-accent hover:underline flex items-center gap-1 font-medium mt-1 ml-auto"
                          >
                            <ExternalLink size={12} /> View Event
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Transaction Detail Modal ── */}
      {selectedTxn && (
        <TransactionDetailModal
          isOpen={!!selectedTxn}
          txn={selectedTxn}
          settings={settings}
          store={store}
          onClose={() => setSelectedTxn(null)}
          onEdit={handleEditTxn}
          onDelete={onDelete}
        />
      )}
    </div>
  );
}
