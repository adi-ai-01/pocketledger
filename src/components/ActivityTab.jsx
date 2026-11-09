import { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  ArrowUpRight,
  ArrowDownLeft,
  Scissors,
  CheckCircle2,
  AlertTriangle,
  CreditCard,
  User,
  Calendar,
  X,
  ExternalLink,
  Clock,
  ShieldCheck,
  RotateCcw,
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
        // May contain multiple names in shared expense
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
          const matchPerson =
            (t.person && t.person.toLowerCase().includes(personFilter.toLowerCase())) ||
            (Array.isArray(t.allocations) && t.allocations.some((a) => (a.person || a.personId).toLowerCase() === personFilter.toLowerCase())) ||
            (Array.isArray(t.splits) && t.splits.some((s) => (s.person || s.personId).toLowerCase() === personFilter.toLowerCase()));
          if (!matchPerson) return false;
        }

        // Date filter
        if (dateFilter !== 'all') {
          const d = new Date(t.date);
          if (dateFilter === 'this_month') {
            if (d.getFullYear() !== currentYear || d.getMonth() !== currentMonth) return false;
          } else if (dateFilter === 'last_month') {
            const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
            const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
            if (d.getFullYear() !== lastMonthYear || d.getMonth() !== lastMonth) return false;
          } else if (dateFilter === 'last_90') {
            const diffDays = (now - d) / (1000 * 60 * 60 * 24);
            if (diffDays > 90) return false;
          }
        }

        // Search query
        if (search.trim()) {
          const q = search.trim().toLowerCase();
          const inDesc = (t.description || '').toLowerCase().includes(q);
          const inPerson = (t.person || '').toLowerCase().includes(q);
          const inCategory = (t.category || '').toLowerCase().includes(q);
          if (!inDesc && !inPerson && !inCategory) return false;
        }

        return true;
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [allTxns, typeFilter, personFilter, dateFilter, search]);

  // Group transactions by month for readable presentation
  const groupedTxns = useMemo(() => {
    const map = {};
    for (const txn of filteredTxns) {
      const d = new Date(txn.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]} ${d.getFullYear()}`;
      if (!map[key]) map[key] = { key, label, items: [] };
      map[key].items.push(txn);
    }
    return Object.values(map);
  }, [filteredTxns]);

  // Filtered payment attempts
  const filteredAttempts = useMemo(() => {
    return [...allAttempts]
      .filter((a) => {
        if (attemptStatusFilter === 'UNRESOLVED') return a.isUnresolved;
        if (attemptStatusFilter === 'COMPLETED') return a.status === 'COMPLETED';
        if (attemptStatusFilter === 'OTHER') return a.status === 'FAILED' || a.status === 'CANCELLED';
        return true;
      })
      .sort((a, b) => (b.initiatedAt || 0) - (a.initiatedAt || 0));
  }, [allAttempts, attemptStatusFilter]);

  const handleEditTxn = (txn) => {
    if (onOpenSheet) {
      onOpenSheet(txn.action || txn.type, txn);
    } else if (onEdit) {
      onEdit(txn);
    }
  };

  const handleOpenLinkedTxn = (eventId) => {
    const match = allTxns.find((t) => t.id === eventId);
    if (match) {
      setSelectedTxn(match);
    }
  };

  return (
    <div className="animate-fade-in pb-16">
      {/* ── Screen Header ── */}
      <header className="px-2 sm:px-0 pt-5 pb-3">
        <h1 className="text-xl font-bold tracking-tight text-text-primary">Activity</h1>
        <p className="text-xs text-text-muted mt-0.5">
          {allTxns.length} ledger {allTxns.length === 1 ? 'event' : 'events'} recorded
        </p>

        {/* Segmented View Switcher: Ledger Activity vs Payment Attempts */}
        <div className="grid grid-cols-2 gap-1.5 p-1 bg-secondary/60 rounded-xl border border-[var(--border-color)] mt-3">
          <button
            type="button"
            onClick={() => setActiveView('LEDGER')}
            className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
              activeView === 'LEDGER'
                ? 'bg-accent/20 border border-accent/40 text-text-primary shadow-sm'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            Ledger Events ({allTxns.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveView('PAYMENT_ATTEMPTS')}
            className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
              activeView === 'PAYMENT_ATTEMPTS'
                ? 'bg-accent/20 border border-accent/40 text-text-primary shadow-sm'
                : 'text-text-muted hover:text-text-primary'
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
          <div className="px-2 sm:px-0 space-y-2.5 mb-4">
            {/* Search Input */}
            <div className="relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              <input
                type="text"
                placeholder="Search descriptions, people, categories..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="!py-2.5 !pl-9 !pr-9 !text-xs w-full bg-secondary/50 rounded-xl border border-[var(--border-color)]"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary p-0.5"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Filter Dropdowns Bar */}
            <div className="grid grid-cols-3 gap-2">
              {/* Event Type Filter */}
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="!py-2 !text-[11px] bg-secondary/60 rounded-xl border border-[var(--border-color)] font-medium"
              >
                {EVENT_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>

              {/* Person Filter */}
              <select
                value={personFilter}
                onChange={(e) => setPersonFilter(e.target.value)}
                className="!py-2 !text-[11px] bg-secondary/60 rounded-xl border border-[var(--border-color)] font-medium"
              >
                <option value="all">All People</option>
                {uniquePeople.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>

              {/* Date Filter */}
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="!py-2 !text-[11px] bg-secondary/60 rounded-xl border border-[var(--border-color)] font-medium"
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
          <div className="px-2 sm:px-0 space-y-5">
            {groupedTxns.length === 0 ? (
              <div className="theme-card p-8 text-center space-y-2">
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
                    className="btn btn-ghost text-xs py-1.5 px-3 mx-auto mt-2 border border-[var(--border-color)]"
                  >
                    Reset Filters
                  </button>
                )}
              </div>
            ) : (
              groupedTxns.map((group) => (
                <div key={group.key} className="space-y-2">
                  <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider px-1">
                    {group.label}
                  </h3>

                  <div className="space-y-2">
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

                      // Display label & semantics
                      let displayTitle = txn.description;
                      let subtitle = '';
                      let amountSign = '';
                      let amountColor = 'text-text-primary';

                      if (isPE) {
                        displayTitle = txn.description || 'Personal Expense';
                        subtitle = txn.category || 'Consumption';
                        amountSign = '-';
                        amountColor = 'text-text-primary';
                      } else if (isSE) {
                        displayTitle = txn.description || 'Shared Expense';
                        subtitle = txn.person ? `with ${txn.person}` : 'Shared bill';
                        amountSign = '-';
                        amountColor = 'text-text-primary';
                      } else if (isL) {
                        displayTitle = `You lent ${txn.person || 'someone'}`;
                        subtitle = txn.description || 'Loan given';
                        amountSign = '+';
                        amountColor = 'text-emerald-400';
                      } else if (isB) {
                        displayTitle = `You borrowed from ${txn.person || 'someone'}`;
                        subtitle = txn.description || 'Loan taken';
                        amountSign = '-';
                        amountColor = 'text-rose-400';
                      } else if (isR) {
                        if (txn.direction === 'inflow') {
                          displayTitle = `${txn.person || 'Counterparty'} paid you back`;
                          subtitle = 'Repayment received';
                          amountSign = '-';
                          amountColor = 'text-emerald-400';
                        } else {
                          displayTitle = `You paid back ${txn.person || 'Counterparty'}`;
                          subtitle = 'Repayment sent';
                          amountSign = '+';
                          amountColor = 'text-rose-400';
                        }
                      } else if (isAdj) {
                        displayTitle = `Adjustment: ${txn.person || ''}`;
                        subtitle = txn.description || 'Manual correction';
                        amountSign = totalAmt >= 0 ? '+' : '';
                        amountColor = 'text-amber-400';
                      } else if (isLeg) {
                        displayTitle = `Historical: ${txn.description || txn.type}`;
                        subtitle = txn.person || 'Legacy unclassified';
                        amountColor = 'text-neutral-400';
                      }

                      return (
                        <div
                          key={txn.id}
                          onClick={() => setSelectedTxn(txn)}
                          className="theme-card p-3.5 flex items-center gap-3.5 cursor-pointer hover:border-accent/40 active:scale-[0.99] transition-all"
                        >
                          {/* Semantic Icon Avatar */}
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border ${
                            isPE ? 'bg-secondary border-[var(--border-color)] text-text-muted' :
                            isSE ? 'bg-accent/15 border-accent/30 text-accent' :
                            isL ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' :
                            isB ? 'bg-rose-500/15 border-rose-500/30 text-rose-400' :
                            isR ? 'bg-blue-500/15 border-blue-500/30 text-blue-400' :
                            'bg-neutral-500/15 border-neutral-500/30 text-neutral-400'
                          }`}>
                            {isPE ? <CreditCard size={16} /> :
                             isSE ? <Scissors size={16} /> :
                             isL ? <ArrowUpRight size={16} /> :
                             isB ? <ArrowDownLeft size={16} /> :
                             isR ? <CheckCircle2 size={16} /> :
                             <AlertTriangle size={16} />}
                          </div>

                          {/* Info Column */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-xs font-bold text-text-primary truncate">
                                {displayTitle}
                              </p>
                              {txn.reviewRequired && (
                                <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30 flex-shrink-0">
                                  Review
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-text-muted mt-0.5 truncate">
                              <span>{dayNumber} {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]}</span>
                              <span>·</span>
                              <span className="truncate">{subtitle}</span>
                              {txn.paymentMethod && txn.paymentMethod !== 'OTHER' && (
                                <>
                                  <span>·</span>
                                  <span className="font-mono text-[9px] bg-secondary px-1 py-0.2 rounded border border-[var(--border-color)]">
                                    {txn.paymentMethod}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Amount Column */}
                          <div className="text-right flex-shrink-0">
                            <div className={`text-xs font-bold ${amountColor} tabular-nums`}>
                              {amountSign}{currency}{(isSE ? userShareAmt : totalAmt).toLocaleString('en-IN')}
                            </div>
                            {isSE && totalAmt !== userShareAmt && (
                              <p className="text-[9px] text-text-muted tabular-nums">
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
        <div className="px-2 sm:px-0 space-y-4">
          <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300 space-y-1">
            <p className="font-semibold flex items-center gap-1.5 text-blue-400">
              <ShieldCheck size={14} /> External Payment Intent Log
            </p>
            <p className="text-[11px] text-blue-200/80 leading-relaxed">
              Payment attempts track external payment intents (such as launching UPI apps). They never mutate your financial ledger until explicitly confirmed and reconciled.
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
                    ? 'border-accent bg-accent/20 text-text-primary font-bold'
                    : 'border-[var(--border-color)] bg-secondary/30 text-text-muted hover:text-text-primary'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Attempts List */}
          <div className="space-y-2.5">
            {filteredAttempts.length === 0 ? (
              <div className="theme-card p-8 text-center space-y-2">
                <Clock size={32} className="text-text-muted mx-auto opacity-40" />
                <p className="text-sm font-semibold text-text-secondary">No payment attempts found</p>
                <p className="text-xs text-text-muted">
                  External payment attempts initiated through UPI will appear here.
                </p>
              </div>
            ) : (
              filteredAttempts.map((att) => {
                const isCompleted = att.status === 'COMPLETED';
                const isUnresolved = att.isUnresolved;
                const isCancelled = att.status === 'CANCELLED';
                const isFailed = att.status === 'FAILED';

                return (
                  <div
                    key={att.id}
                    className="theme-card p-4 space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-mono uppercase font-bold px-2 py-0.5 rounded-full border ${
                            isCompleted ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                            isUnresolved ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' :
                            isCancelled ? 'bg-neutral-500/20 text-neutral-400 border-neutral-500/30' :
                            'bg-rose-500/20 text-rose-400 border-rose-500/30'
                          }`}>
                            {att.status}
                          </span>
                          <span className="text-xs font-mono text-text-muted">
                            #{att.id.slice(-6)}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-text-primary mt-1">
                          {att.recipientName || 'Counterparty'}
                        </h4>
                        {att.recipientUpiId && (
                          <p className="text-[11px] font-mono text-text-muted mt-0.5">
                            {att.recipientUpiId}
                          </p>
                        )}
                      </div>

                      <div className="text-right">
                        <span className="text-sm font-bold text-text-primary">
                          {currency}{att.amountRupees ? att.amountRupees.toLocaleString('en-IN') : '0'}
                        </span>
                        <p className="text-[10px] text-text-muted mt-0.5">
                          {new Date(att.initiatedAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    {att.reconciliationNotes && (
                      <p className="text-[11px] text-text-muted italic border-t border-[var(--border-color)]/50 pt-1.5">
                        Note: {att.reconciliationNotes}
                      </p>
                    )}

                    {/* Action Link: Link to ledger event if completed */}
                    {isCompleted && att.eventId && (
                      <div className="pt-1 border-t border-[var(--border-color)]/50 flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleOpenLinkedTxn(att.eventId)}
                          className="text-xs text-accent hover:underline flex items-center gap-1 font-semibold"
                        >
                          <ExternalLink size={12} /> View Linked Ledger Event
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
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

