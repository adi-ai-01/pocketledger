import {
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownLeft,
  Users,
  AlertTriangle,
  ChevronRight,
  Plus,
  CreditCard,
  Scissors,
  CheckCircle2,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext.jsx';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function HomeTab({
  analytics,
  balances = {},
  transactions = [],
  settings = {},
  people = [],
  store,
  onOpenSheet,
  onNavigateTab,
}) {
  const { theme } = useTheme();
  const currency = settings.currency || '₹';
  const budget = settings.monthlyBudget || 0;
  const now = new Date();

  // ── Net Peer Balance ──
  const totalOwedToMe = Object.values(balances).reduce((sum, v) => sum + (v > 0 ? v : 0), 0);
  const totalIOwe = Object.values(balances).reduce((sum, v) => sum + (v < 0 ? Math.abs(v) : 0), 0);
  const netPeerBalance = totalOwedToMe - totalIOwe;
  const areBalancesSettled = totalOwedToMe === 0 && totalIOwe === 0;

  // ── Monthly Personal Spending ──
  const personalSpent = analytics?.totalSpent || 0;
  const hasBudget = budget > 0;
  const budgetPct = hasBudget ? (personalSpent / budget) * 100 : 0;
  const remainingBudget = budget - personalSpent;
  const topCat = analytics?.byCategory
    ? Object.entries(analytics.byCategory).sort((a, b) => b[1] - a[1])[0]
    : null;

  // ── Attention Items ──
  const attentionData = store?.getAttentionItems ? store.getAttentionItems() : null;
  const unresolvedUpiCount = attentionData?.unresolvedPayments?.length || 0;
  const pendingReviewCount =
    (attentionData?.pendingAlarms?.length || 0) +
    (attentionData?.migratedAlarms?.length || 0) +
    (attentionData?.unclassifiedEvents?.length || 0);
  const totalAttentionCount = unresolvedUpiCount + pendingReviewCount;

  // ── Recent Activity (Last 5 transactions) ──
  const projectedTxns = store?.getLegacyProjectedTransactions
    ? store.getLegacyProjectedTransactions()
    : transactions;
  const recentTxns = [...projectedTxns]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5);

  return (
    <div className="animate-fade-in transition-all duration-200 pb-12">
      {/* ── 1. Minimal Header ── */}
      <header className="pt-4 pb-3 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold tracking-tight text-text-primary">
            PocketLedger
          </h1>
          <p className="text-xs text-text-muted mt-0.5">
            {MONTHS[now.getMonth()]} {now.getFullYear()}
          </p>
        </div>

        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[var(--border-color)] bg-secondary/50 text-[11px] text-text-muted font-medium">
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: 'var(--accent-color)' }}
          />
          <span className="capitalize">{theme}</span>
        </div>
      </header>

      {/* ── 2. Attention Items (Compact & Actionable) ── */}
      {totalAttentionCount > 0 && (
        <div className="mb-3.5">
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between gap-3 text-xs animate-fade-in">
            <div className="flex items-center gap-2.5 min-w-0">
              <AlertTriangle size={15} className="text-amber-400 flex-shrink-0" />
              <div className="min-w-0">
                <p className="font-semibold text-amber-300 truncate">
                  {totalAttentionCount} {totalAttentionCount === 1 ? 'item requires' : 'items require'} attention
                </p>
                <p className="text-[11px] text-amber-300/80 truncate">
                  {unresolvedUpiCount > 0 && `${unresolvedUpiCount} unverified UPI payment${unresolvedUpiCount > 1 ? 's' : ''}`}
                  {unresolvedUpiCount > 0 && pendingReviewCount > 0 && ' · '}
                  {pendingReviewCount > 0 && `${pendingReviewCount} legacy review item${pendingReviewCount > 1 ? 's' : ''}`}
                </p>
              </div>
            </div>

            {onNavigateTab && (
              <button
                onClick={() => onNavigateTab('settings')}
                className="text-xs font-semibold text-amber-300 hover:text-amber-200 underline whitespace-nowrap flex-shrink-0"
              >
                Review
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── 3. Net Peer Balance Card ── */}
      <div className="mb-3.5 theme-card p-4 sm:p-5 space-y-3.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-text-muted">Net peer balance</span>
          {onNavigateTab && (
            <button
              onClick={() => onNavigateTab('people')}
              className="text-xs text-text-muted hover:text-text-primary flex items-center gap-0.5 transition-colors"
            >
              <span>People</span>
              <ChevronRight size={13} />
            </button>
          )}
        </div>

        {areBalancesSettled ? (
          <div className="flex items-center gap-3 py-1">
            <div className="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 size={16} />
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-bold text-text-primary tabular-nums">
                {currency}0
              </p>
              <p className="text-xs text-text-muted">All peer debts are settled up</p>
            </div>
          </div>
        ) : (
          <>
            <div>
              <div className="flex items-baseline gap-2">
                <span
                  className={`text-2xl sm:text-3xl font-bold tracking-tight tabular-nums ${
                    netPeerBalance > 0.001
                      ? 'text-emerald-400'
                      : netPeerBalance < -0.001
                      ? 'text-rose-400'
                      : 'text-text-primary'
                  }`}
                >
                  {netPeerBalance > 0 ? '+' : '-'}{currency}{Math.abs(netPeerBalance).toLocaleString('en-IN')}
                </span>
                <span className="text-xs text-text-muted font-medium">
                  {netPeerBalance > 0.001
                    ? 'net owed to you'
                    : 'net you owe'}
                </span>
              </div>
            </div>

            {/* Two compact secondary figures: Owed to you vs You owe */}
            <div className="grid grid-cols-2 gap-2.5 pt-1 border-t border-[var(--border-color)]/60">
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/40">
                <div>
                  <p className="text-[11px] text-text-muted">Owed to you</p>
                  <p className="text-sm font-semibold text-emerald-400 tabular-nums">
                    +{currency}{totalOwedToMe.toLocaleString('en-IN')}
                  </p>
                </div>
                <TrendingUp size={14} className="text-emerald-400 opacity-80" />
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/40">
                <div>
                  <p className="text-[11px] text-text-muted">You owe</p>
                  <p className="text-sm font-semibold text-rose-400 tabular-nums">
                    -{currency}{totalIOwe.toLocaleString('en-IN')}
                  </p>
                </div>
                <TrendingDown size={14} className="text-rose-400 opacity-80" />
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── 4. Monthly Personal Spending Card ── */}
      <div className="mb-4 theme-card p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-text-muted">Monthly personal spending</span>
          {topCat && (
            <span className="text-[11px] text-text-muted">
              Top: <strong className="text-text-primary font-medium">{topCat[0]}</strong>
            </span>
          )}
        </div>

        <div>
          <span className="text-2xl sm:text-3xl font-bold tracking-tight text-text-primary tabular-nums">
            {currency}{personalSpent.toLocaleString('en-IN')}
          </span>
        </div>

        {hasBudget ? (
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-xs text-text-muted">
              <span>{budgetPct.toFixed(0)}% of {currency}{budget.toLocaleString('en-IN')} budget</span>
              <span className={remainingBudget < 0 ? 'text-rose-400 font-medium' : ''}>
                {remainingBudget >= 0
                  ? `${currency}${remainingBudget.toLocaleString('en-IN')} left`
                  : `${currency}${Math.abs(remainingBudget).toLocaleString('en-IN')} over`}
              </span>
            </div>
            <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  remainingBudget < 0 ? 'bg-rose-500' : 'bg-accent'
                }`}
                style={{ width: `${Math.min(budgetPct, 100)}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="pt-0.5 flex items-center justify-between text-[11px] text-text-muted">
            <span>No budget configured</span>
            {onNavigateTab && (
              <button
                onClick={() => onNavigateTab('settings')}
                className="text-text-muted hover:text-text-primary hover:underline transition-colors"
              >
                Set budget in Settings →
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── 5. Recent Activity Section ── */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-text-secondary">
            Recent activity
          </h2>
          {projectedTxns.length > 0 && onNavigateTab && (
            <button
              onClick={() => onNavigateTab('history')}
              className="text-xs text-accent hover:underline flex items-center gap-0.5 font-medium"
            >
              <span>View all</span>
              <ChevronRight size={13} />
            </button>
          )}
        </div>

        {recentTxns.length === 0 ? (
          <div className="theme-card p-6 text-center space-y-2">
            <p className="text-sm font-semibold text-text-secondary">
              No transactions recorded yet
            </p>
            <p className="text-xs text-text-muted max-w-xs mx-auto">
              Track personal expenses, shared bills, or loans with friends.
            </p>
            <div className="pt-2">
              <button
                onClick={() => onOpenSheet(null)}
                className="btn btn-primary text-xs py-2 px-3 font-semibold inline-flex items-center gap-1.5"
              >
                <Plus size={14} /> Add Transaction
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {recentTxns.map((txn) => {
              const isPE = txn.action === 'personal_expense' || (!txn.action && txn.type === 'give' && !txn.person);
              const isSE = txn.action === 'shared_expense' || txn.type === 'split';
              const isL = txn.action === 'lend' || (txn.type === 'give' && txn.person);
              const isB = txn.action === 'borrow' || (txn.type === 'take' && txn.person);
              const isR = txn.action === 'repayment' || txn.type === 'settle';
              const isAdj = txn.action === 'adjustment' || txn.type === 'adjustment';

              let title = txn.description || 'Transaction';
              let subtitle = '';
              let Icon = ArrowUpRight;
              let color = 'text-text-primary';
              let bgColor = 'bg-secondary/60 text-text-muted';
              let sign = '';
              let displayAmt = txn.amount;

              if (isPE) {
                title = txn.description || 'Personal expense';
                subtitle = txn.category ? `${txn.category} · Personal` : 'Personal expense';
                Icon = CreditCard;
                color = 'text-text-primary';
                bgColor = 'bg-secondary text-text-muted';
                sign = '-';
              } else if (isSE) {
                title = txn.description || 'Shared expense';
                subtitle = 'Shared bill · Your share';
                Icon = Scissors;
                color = 'text-accent';
                bgColor = 'bg-accent/10 text-accent';
                displayAmt = txn.myShare || txn.userShare || txn.amount;
                sign = '-';
              } else if (isL) {
                title = `You lent ${txn.person || 'someone'}`;
                subtitle = 'Loan to peer · Receivable';
                Icon = ArrowUpRight;
                color = 'text-emerald-400';
                bgColor = 'bg-emerald-500/10 text-emerald-400';
                sign = '+';
              } else if (isB) {
                title = `You borrowed from ${txn.person || 'someone'}`;
                subtitle = 'Loan from peer · Payable';
                Icon = ArrowDownLeft;
                color = 'text-rose-400';
                bgColor = 'bg-rose-500/10 text-rose-400';
                sign = '-';
              } else if (isR) {
                if (txn.direction === 'inflow') {
                  title = `${txn.person || 'Peer'} paid you back`;
                  subtitle = 'Repayment received';
                  Icon = CheckCircle2;
                  color = 'text-emerald-400';
                  bgColor = 'bg-emerald-500/10 text-emerald-400';
                  sign = '-';
                } else {
                  title = `You paid back ${txn.person || 'Peer'}`;
                  subtitle = 'Repayment sent';
                  Icon = CheckCircle2;
                  color = 'text-rose-400';
                  bgColor = 'bg-rose-500/10 text-rose-400';
                  sign = '+';
                }
              } else if (isAdj) {
                title = `Adjustment: ${txn.person || ''}`;
                subtitle = txn.description || 'Balance correction';
                Icon = AlertTriangle;
                color = 'text-amber-400';
                bgColor = 'bg-amber-500/10 text-amber-400';
                sign = txn.amount >= 0 ? '+' : '';
              } else {
                title = txn.description || txn.type;
                subtitle = txn.person ? `${txn.person} · Historical` : 'Historical entry';
                Icon = AlertTriangle;
                color = 'text-neutral-400';
                bgColor = 'bg-neutral-500/10 text-neutral-400';
              }

              const d = new Date(txn.date);

              return (
                <div
                  key={txn.id}
                  onClick={() => onOpenSheet(txn.action || txn.type, txn)}
                  className="theme-card p-3 flex items-center gap-3 cursor-pointer hover:border-accent/40 active:scale-[0.99] transition-all"
                >
                  <div className={`w-8 h-8 rounded-lg ${bgColor} flex items-center justify-center flex-shrink-0 border border-[var(--border-color)]`}>
                    <Icon size={15} className={color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-text-primary truncate">
                      {title}
                    </p>
                    <p className="text-[11px] text-text-muted truncate">
                      {d.getDate()} {MONTHS[d.getMonth()]} · {subtitle}
                    </p>
                  </div>
                  <span className={`text-xs font-semibold ${color} whitespace-nowrap tabular-nums`}>
                    {sign}{currency}{displayAmt.toLocaleString('en-IN')}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
