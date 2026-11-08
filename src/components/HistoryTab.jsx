import { useState, useMemo } from 'react';
import { Search, ArrowUpRight, ArrowDownLeft, Scissors, Trash2, Edit3, Filter, ChevronDown } from 'lucide-react';

const TYPE_LABELS = { give: 'Give', take: 'Take', split: 'Split', settle: 'Settle', adjustment: 'Adjust' };
const TYPE_COLORS = {
  give: { text: 'text-red', bg: 'bg-red/10', icon: ArrowUpRight },
  take: { text: 'text-green', bg: 'bg-green/10', icon: ArrowDownLeft },
  split: { text: 'text-accent', bg: 'bg-accent/10', icon: Scissors },
  settle: { text: 'text-green', bg: 'bg-green/10', icon: ArrowDownLeft },
  adjustment: { text: 'text-amber', bg: 'bg-amber/10', icon: Edit3 },
};

export default function HistoryTab({ transactions, settings, onEdit, onDelete }) {
  const currency = settings.currency || '₹';
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [showFilter, setShowFilter] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const sorted = useMemo(() => {
    let filtered = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
    if (filterType !== 'all') filtered = filtered.filter((t) => t.type === filterType);
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter((t) =>
        (t.description || '').toLowerCase().includes(q) ||
        (t.person || '').toLowerCase().includes(q) ||
        (t.category || '').toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [transactions, search, filterType]);

  // Group by month
  const grouped = useMemo(() => {
    const map = {};
    for (const txn of sorted) {
      const d = new Date(txn.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]} ${d.getFullYear()}`;
      if (!map[key]) map[key] = { key, label, items: [] };
      map[key].items.push(txn);
    }
    return Object.values(map);
  }, [sorted]);

  const handleDelete = (id) => {
    onDelete(id);
    setDeleteConfirm(null);
  };

  return (
    <div className="animate-fade-in">
      <header className="px-5 pt-6 pb-3">
        <h1 className="text-xl font-bold">History</h1>
        <p className="text-text-muted text-xs mt-0.5">{transactions.length} transactions</p>
      </header>

      {/* Search + Filter */}
      <div className="px-5 mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 !py-2.5 !text-sm"
          />
        </div>
        <button
          onClick={() => setShowFilter(!showFilter)}
          className={`btn btn-ghost py-2 px-3 ${filterType !== 'all' ? '!border-accent !text-accent' : ''}`}
        >
          <Filter size={16} />
          <ChevronDown size={12} />
        </button>
      </div>

      {/* Filter chips */}
      {showFilter && (
        <div className="px-5 mb-3 flex gap-2 flex-wrap animate-fade-in">
          {['all', 'give', 'take', 'split', 'settle', 'adjustment'].map((type) => (
            <button
              key={type}
              onClick={() => { setFilterType(type); setShowFilter(false); }}
              className={`chip ${filterType === type ? 'bg-accent/20 text-accent' : 'bg-surface-3 text-text-secondary'}`}
            >
              {type === 'all' ? 'All' : TYPE_LABELS[type]}
            </button>
          ))}
        </div>
      )}

      {/* Transaction list */}
      <div className="px-5 mb-6">
        {grouped.length === 0 && (
          <div className="glass p-8 text-center">
            <p className="text-text-muted text-sm">No transactions found</p>
          </div>
        )}
        {grouped.map((group) => (
          <div key={group.key} className="mb-5">
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">{group.label}</h3>
            <div className="space-y-2">
              {group.items.map((txn) => {
                const tc = TYPE_COLORS[txn.type] || TYPE_COLORS.give;
                const Icon = tc.icon;
                const d = new Date(txn.date);
                const displayAmt = txn.type === 'split' ? (txn.myShare || txn.amount) : txn.amount;
                const isOut = txn.type === 'give' || txn.type === 'split';

                return (
                  <div key={txn.id} className="glass p-3.5 flex items-center gap-3 group">
                    <div className={`w-9 h-9 rounded-full ${tc.bg} flex items-center justify-center flex-shrink-0`}>
                      <Icon size={16} className={tc.text} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{txn.description || TYPE_LABELS[txn.type]}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {txn.person && <span className="text-xs text-text-muted">{txn.person}</span>}
                        {txn.category && <span className="text-xs text-text-muted">· {txn.category}</span>}
                        <span className="text-xs text-text-muted">· {d.getDate()}/{d.getMonth() + 1}</span>
                      </div>
                    </div>
                    <span className={`text-sm font-semibold ${isOut ? 'text-red' : 'text-green'} whitespace-nowrap`}>
                      {isOut ? '-' : '+'}{currency}{displayAmt.toLocaleString('en-IN')}
                    </span>

                    {/* Edit / Delete */}
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => onEdit(txn)} className="p-1.5 rounded-lg hover:bg-surface-3">
                        <Edit3 size={14} className="text-text-muted" />
                      </button>
                      <button onClick={() => setDeleteConfirm(txn.id)} className="p-1.5 rounded-lg hover:bg-surface-3">
                        <Trash2 size={14} className="text-red" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="handle" />
            <h2 className="text-lg font-bold mb-2">Delete Transaction?</h2>
            <p className="text-text-secondary text-sm mb-4">
              This will permanently remove this transaction and recalculate all affected balances (Domino Engine).
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="btn btn-ghost flex-1">Cancel</button>
              <button onClick={() => handleDelete(deleteConfirm)} className="btn btn-danger flex-1">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
