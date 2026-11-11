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

  // ── Attention Items (Legacy review items requiring Settings review) ──
  const attentionData = store?.getAttentionItems ? store.getAttentionItems() : null;
  const pendingReviewCount =
    (attentionData?.pendingAlarms?.length || 0) +
    (attentionData?.migratedAlarms?.length || 0) +
    (attentionData?.unclassifiedEvents?.length || 0);

  // ── Recent Activity (Last 5 transactions) ──
  const projectedTxns = store?.getLegacyProjectedTransactions
    ? store.getLegacyProjectedTransactions()
    : transactions;
  const recentTxns = [...projectedTxns]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5);

  return (
    <div className="w-full pt-5 sm:pt-6 pb-28 sm:pb-32 space-y-6 animate-fade-in">
      {/* ── 1. Page Header ── */}
      <header className="mb-6">
        <h1 className="text-[26px] sm:text-[28px] font-bold tracking-tight text-text-primary leading-tight">
          PocketLedger
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          {MONTHS[now.getMonth()]} {now.getFullYear()} financial overview
        </p>
      </header>

      {/* ── 2. Actionable Attention Banner (Only for review items that navigate to Settings) ── */}
      {pendingReviewCount > 0 && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-between gap-3 text-xs animate-fade-in">
          <div className="flex items-center gap-2.5 min-w-0">
            <AlertTriangle size={16} className="text-amber-400 flex-shrink-0" />
            <div className="min-w-0">
              <p className="font-semibold text-text-primary truncate">
                {pendingReviewCount} {pendingReviewCount === 1 ? 'item requires' : 'items require'} review
              </p>
              <p className="text-[11px] text-text-secondary truncate">
                {pendingReviewCount} legacy review {pendingReviewCount === 1 ? 'item' : 'items'} in Settings
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
      )}

      {/* ── 3. Net Peer Balance Card (Hero Surface) ── */}
      <div className="p-4 sm:p-5 rounded-2xl bg-secondary/30 border border-[var(--border-color)]/80 space-y-3.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-text-secondary">
            Net peer balance
          </span>
          {onNavigateTab && (
            <button
              onClick={() => onNavigateTab('people')}
              className="text-xs text-text-secondary hover:text-text-primary flex items-center gap-1 font-medium transition-colors"
            >
              <span>People</span>
              <ChevronRight size={14} />
            </button>
          )}
        </div>

        {areBalancesSettled ? (
          <div className="py-1">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl sm:text-[34px] font-bold tracking-tight text-text-primary tabular-nums">
                {currency}0
              </span>
              <span className="text-xs text-text-muted font-medium">settled</span>
            </div>
            <p className="text-xs text-text-secondary mt-0.5">
              All peer balances are fully settled
            </p>
          </div>
        ) : (
          <div className="space-y-3.5">
            <div>
              <div className="flex items-baseline gap-2.5">
                <span
                  className={`text-3xl sm:text-[34px] font-bold tracking-tight tabular-nums ${
                    netPeerBalance > 0.001
                      ? 'text-emerald-400'
                      : netPeerBalance < -0.001
                      ? 'text-rose-400'
                      : 'text-text-primary'
                  }`}
                >
                  {netPeerBalance > 0 ? '+' : '-'}{currency}{Math.abs(netPeerBalance).toLocaleString('en-IN')}
                </span>
                <span className="text-xs text-text-secondary font-medium">
                  {netPeerBalance > 0.001 ? 'net owed to you' : 'net you owe'}
                </span>
              </div>
            </div>

            {/* Two compact secondary figures */}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[var(--border-color)]/60">
              <div className="p-3 rounded-xl bg-secondary/40 flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-text-secondary">Owed to you</p>
                  <p className="text-base font-semibold text-emerald-400 tabular-nums mt-0.5">
                    +{currency}{totalOwedToMe.toLocaleString('en-IN')}
                  </p>
                </div>
                <TrendingUp size={16} className="text-emerald-400 opacity-80" />
              </div>

              <div className="p-3 rounded-xl bg-secondary/40 flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-text-secondary">You owe</p>
                  <p className="text-base font-semibold text-rose-400 tabular-nums mt-0.5">
                    -{currency}{totalIOwe.toLocaleString('en-IN')}
                  </p>
                </div>
                <TrendingDown size={16} className="text-rose-400 opacity-80" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── 4. Monthly Personal Spending ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-text-primary">
            Monthly spending
          </h2>
          {topCat && (
            <span className="text-xs text-text-secondary">
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
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between text-xs text-text-secondary">
              <span>{budgetPct.toFixed(0)}% of {currency}{budget.toLocaleString('en-IN')} limit</span>
              <span className={remainingBudget < 0 ? 'text-rose-400 font-medium' : ''}>
                {remainingBudget >= 0
                  ? `${currency}${remainingBudget.toLocaleString('en-IN')} remaining`
                  : `${currency}${Math.abs(remainingBudget).toLocaleString('en-IN')} over limit`}
              </span>
            </div>
            <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  remainingBudget < 0 ? 'bg-rose-500' : 'bg-accent'
                }`}
                style={{ width: `${Math.min(budgetPct, 100)}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="pt-0.5 flex items-center justify-between text-xs text-text-muted">
            <span>Personal expenses this month</span>
            {onNavigateTab && (
              <button
                onClick={() => onNavigateTab('settings')}
                className="text-text-secondary hover:text-text-primary hover:underline transition-colors"
              >
                Set limit in Settings →
              </button>
            )}
          </div>
        )}
      </section>

      <hr className="border-t border-[var(--border-color)]/60 my-1" />

      {/* ── 5. Recent Activity ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-text-primary">
            Recent activity
          </h2>
          {projectedTxns.length > 0 && onNavigateTab && (
            <button
              onClick={() => onNavigateTab('history')}
              className="text-xs text-accent hover:underline flex items-center gap-1 font-medium"
            >
              <span>View all</span>
              <ChevronRight size={14} />
            </button>
          )}
        </div>

        {recentTxns.length === 0 ? (
          <div className="py-8 text-center space-y-1.5">
            <p className="text-sm font-medium text-text-secondary">
              No transactions recorded yet
            </p>
            <p className="text-xs text-text-muted max-w-xs mx-auto">
              Track personal expenses, shared bills, or loans with contacts.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-color)]/60 border-y border-[var(--border-color)]/60">
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
              let sign = '';
              let displayAmt = txn.amount;

              if (isPE) {
                title = txn.description || 'Personal expense';
                subtitle = txn.category ? `${txn.category} · Personal` : 'Personal expense';
                Icon = CreditCard;
                color = 'text-text-primary';
                sign = '-';
              } else if (isSE) {
                title = txn.description || 'Shared expense';
                subtitle = 'Shared bill · Your share';
                Icon = Scissors;
                color = 'text-accent';
                displayAmt = txn.myShare || txn.userShare || txn.amount;
                sign = '-';
              } else if (isL) {
                title = `You lent ${txn.person || 'someone'}`;
                subtitle = 'Loan to contact · Receivable';
                Icon = ArrowUpRight;
                color = 'text-emerald-400';
                sign = '+';
              } else if (isB) {
                title = `You borrowed from ${txn.person || 'someone'}`;
                subtitle = 'Loan from contact · Payable';
                Icon = ArrowDownLeft;
                color = 'text-rose-400';
                sign = '-';
              } else if (isR) {
                if (txn.direction === 'inflow') {
                  title = `${txn.person || 'Contact'} paid you back`;
                  subtitle = 'Repayment received';
                  Icon = CheckCircle2;
                  color = 'text-emerald-400';
                  sign = '-';
                } else {
                  title = `You paid back ${txn.person || 'Contact'}`;
                  subtitle = 'Repayment sent';
                  Icon = CheckCircle2;
                  color = 'text-rose-400';
                  sign = '+';
                }
              } else if (isAdj) {
                title = `Adjustment: ${txn.person || ''}`;
                subtitle = txn.description || 'Balance correction';
                Icon = AlertTriangle;
                color = 'text-amber-400';
                sign = txn.amount >= 0 ? '+' : '';
              } else {
                title = txn.description || txn.type;
                subtitle = txn.person ? `${txn.person} · Historical` : 'Historical entry';
                Icon = AlertTriangle;
                color = 'text-neutral-400';
              }

              const d = new Date(txn.date);

              return (
                <div
                  key={txn.id}
                  onClick={() => onOpenSheet(txn.action || txn.type, txn)}
                  className="w-full h-[60px] flex items-center justify-between gap-3 text-left hover:bg-secondary/30 transition-colors px-1 cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon size={20} className="text-text-muted flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[15px] font-medium text-text-primary truncate">
                        {title}
                      </p>
                      <p className="text-xs text-text-muted truncate">
                        {d.getDate()} {MONTHS[d.getMonth()]} · {subtitle}
                      </p>
                    </div>
                  </div>
                  <span className={`text-[15px] font-semibold ${color} whitespace-nowrap tabular-nums flex-shrink-0 ml-3`}>
                    {sign}{currency}{displayAmt.toLocaleString('en-IN')}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
