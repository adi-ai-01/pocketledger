import { useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownLeft,
  Wallet,
  Users,
  AlertTriangle,
  ChevronRight,
  Plus,
  Clock,
  Sparkles,
  CreditCard,
  Scissors,
  CheckCircle2,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext.jsx';
import {
  StarkSigil,
  EldenRuneSeal,
  SRankBadge,
  PixelHeart,
  PixelSword,
  PixelChest,
  ArcaneWatermark,
} from './ThemeIcons.jsx';

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

  // ── Net Peer Balance (Exclusively derived from canonical balances) ──
  const totalOwedToMe = Object.values(balances).reduce((sum, v) => sum + (v > 0 ? v : 0), 0);
  const totalIOwe = Object.values(balances).reduce((sum, v) => sum + (v < 0 ? Math.abs(v) : 0), 0);
  const netPeerBalance = totalOwedToMe - totalIOwe;

  // ── Monthly Personal Spending ──
  const personalSpent = analytics?.totalSpent || 0;
  const hasBudget = budget > 0;
  const budgetPct = hasBudget ? Math.min((personalSpent / budget) * 100, 100) : 0;
  const topCat = analytics?.byCategory
    ? Object.entries(analytics.byCategory).sort((a, b) => b[1] - a[1])[0]
    : null;

  // ── Attention Items ──
  const attentionData = store?.getAttentionItems ? store.getAttentionItems() : null;
  const unresolvedUpiCount = attentionData?.unresolvedPayments?.length || 0;
  const pendingReviewCount = (attentionData?.pendingAlarms?.length || 0) + (attentionData?.migratedAlarms?.length || 0) + (attentionData?.unclassifiedEvents?.length || 0);
  const totalAttentionCount = unresolvedUpiCount + pendingReviewCount;

  // ── Recent Activity (Last 5 transactions from canonical projection) ──
  const projectedTxns = store?.getLegacyProjectedTransactions
    ? store.getLegacyProjectedTransactions()
    : transactions;
  const recentTxns = [...projectedTxns]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5);

  return (
    <div className="animate-fade-in transition-all duration-300 pb-12">
      {/* ── A. Header with Theme-Aware Branding & Iconography ── */}
      <header className="px-2 sm:px-0 pt-5 pb-3 flex items-center justify-between">
        <div>
          <p className="text-text-secondary text-xs uppercase tracking-wider font-semibold">
            {MONTHS[now.getMonth()]} {now.getFullYear()}
          </p>
          <h1
            className={`text-2xl font-bold mt-0.5 tracking-tight ${
              theme === 'cyber'
                ? 'text-[#00f0ff] drop-shadow-[0_0_12px_rgba(0,240,255,0.8)]'
                : theme === 'pixel'
                ? 'text-white drop-shadow-[2px_2px_0px_#000]'
                : theme === 'elden'
                ? 'text-[#f5eedc] drop-shadow-[0_0_8px_rgba(229,193,88,0.4)]'
                : 'text-text-primary'
            }`}
          >
            PocketLedger
          </h1>
        </div>

        {/* Right Header Element based on Active Theme */}
        <div>
          {theme === 'fantasy' && <StarkSigil className="w-9 h-9 text-[#8da6c4] hover:text-[#b4c7dc] transition-colors" />}
          {theme === 'elden' && <EldenRuneSeal className="w-10 h-10 text-[#e5c158] drop-shadow-[0_0_10px_rgba(229,193,88,0.6)]" />}
          {theme === 'cyber' && <SRankBadge />}
          {theme === 'pixel' && (
            <div className="flex flex-col items-end gap-1.5">
              <div className="flex items-center gap-2">
                <PixelHeart className="w-4 h-4" />
                <PixelSword className="w-4 h-4" />
              </div>
              <div className="flex items-center gap-1 text-[8px] font-mono text-[#80ff00]">
                <span className="text-[#888]">LVL</span>
                <div className="w-12 h-2 bg-[#142308] border border-[#3b5e17] rounded-[1px] overflow-hidden">
                  <div className="h-full bg-[#80ff00] w-3/4" />
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* ── D. Attention Items Section (Unresolved UPI / Pending Reviews) ── */}
      {totalAttentionCount > 0 && (
        <div className="px-2 sm:px-0 mb-4">
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-between gap-3 animate-fade-in">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={15} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-amber-300">
                  {totalAttentionCount} Actionable {totalAttentionCount === 1 ? 'Item' : 'Items'} Require Attention
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

      {/* ── B. Net Peer Balance Card ── */}
      <div className="mb-4 theme-card p-4 sm:p-5 space-y-4">
        {/* Section Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-accent" />
            <span className="text-xs font-bold text-accent uppercase tracking-wider">
              Net Peer Balance
            </span>
          </div>
          {onNavigateTab && (
            <button
              onClick={() => onNavigateTab('people')}
              className="text-xs text-text-muted hover:text-text-primary flex items-center gap-0.5 transition-colors"
            >
              <span>Manage People</span>
              <ChevronRight size={13} />
            </button>
          )}
        </div>

        {/* Combined Net Peer Amount */}
        <div>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-3xl sm:text-4xl font-extrabold tracking-tight tabular-nums ${
                netPeerBalance > 0.001
                  ? 'text-emerald-400'
                  : netPeerBalance < -0.001
                  ? 'text-rose-400'
                  : 'text-text-muted'
              }`}
            >
              {netPeerBalance === 0
                ? `${currency}0`
                : `${netPeerBalance > 0 ? '+' : '-'}${currency}${Math.abs(netPeerBalance).toLocaleString('en-IN')}`}
            </span>
            <span className="text-xs text-text-muted font-medium">
              {netPeerBalance > 0.001
                ? 'owed to you net'
                : netPeerBalance < -0.001
                ? 'you owe net'
                : 'all settled up'}
            </span>
          </div>
          <p className="text-[11px] text-text-muted mt-0.5">
            Combined balance with all counterparties. Never counts your bank deposits or asset wealth.
          </p>
        </div>

        {/* Distinct Two-Pillar Sub-Cards: Owed to you vs You owe */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          {/* Owed to you */}
          <div
            className="rounded-xl p-3 border transition-all"
            style={{
              backgroundColor: 'var(--owed-green-bg)',
              borderColor: theme === 'cyber' ? 'rgba(0,240,255,0.4)' : theme === 'pixel' ? '#555555' : 'rgba(74, 222, 128, 0.2)',
            }}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--owed-green-text)' }}>
                Owed to you
              </span>
              <TrendingUp size={13} style={{ color: 'var(--owed-green-text)' }} />
            </div>
            <span
              className="text-lg sm:text-xl font-bold tabular-nums"
              style={{ color: 'var(--owed-green-text)' }}
            >
              +{currency}{totalOwedToMe.toLocaleString('en-IN')}
            </span>
            <p className="text-[10px] text-text-muted mt-0.5">Receivables from others</p>
          </div>

          {/* You owe */}
          <div
            className="rounded-xl p-3 border transition-all"
            style={{
              backgroundColor: 'var(--owed-red-bg)',
              borderColor: theme === 'cyber' ? 'rgba(244,63,94,0.4)' : theme === 'pixel' ? '#555555' : 'rgba(248, 113, 113, 0.2)',
            }}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--owed-red-text)' }}>
                You owe
              </span>
              <TrendingDown size={13} style={{ color: 'var(--owed-red-text)' }} />
            </div>
            <span
              className="text-lg sm:text-xl font-bold tabular-nums"
              style={{ color: 'var(--owed-red-text)' }}
            >
              -{currency}{totalIOwe.toLocaleString('en-IN')}
            </span>
            <p className="text-[10px] text-text-muted mt-0.5">Payables to others</p>
          </div>
        </div>
      </div>

      {/* ── C. Monthly Spending Card (Personal Consumption Only) ── */}
      <div className="mb-4 theme-card p-4 sm:p-5 space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet size={16} className="text-accent" />
            <span className="text-xs font-bold text-accent uppercase tracking-wider">
              Monthly Personal Spending
            </span>
          </div>
          {topCat && (
            <span className="text-[11px] text-text-muted truncate max-w-[130px]">
              Top: <strong className="text-text-primary">{topCat[0]}</strong>
            </span>
          )}
        </div>

        <div>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-3xl font-extrabold tracking-tight tabular-nums ${
                theme === 'pixel'
                  ? 'text-[#ffaa00]'
                  : theme === 'elden'
                  ? 'text-[#e5c158]'
                  : theme === 'fantasy'
                  ? 'text-[#8da6c4]'
                  : 'text-text-primary'
              }`}
            >
              {currency}{personalSpent.toLocaleString('en-IN')}
            </span>
            <span className="text-xs text-text-muted font-medium">actual consumption</span>
          </div>
          <p className="text-[11px] text-text-muted mt-0.5">
            Reflects only your allocated share of expenses. Lending and transfers are excluded.
          </p>
        </div>

        {/* Budget Progress: Displayed ONLY when a monthly budget is configured */}
        {hasBudget ? (
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-xs text-text-secondary font-medium">
              <span>{budgetPct.toFixed(0)}% of monthly budget</span>
              <span>Budget: {currency}{budget.toLocaleString('en-IN')}</span>
            </div>

            {/* Theme-Specific Progress Bar */}
            {theme === 'elden' ? (
              <div className="w-full h-2.5 bg-[#121216] rounded-full p-0.5 border border-[#5c4c23] shadow-inner relative overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#b8861d] via-[#ffe17d] to-[#d4a034] shadow-[0_0_12px_rgba(229,193,88,0.7)] transition-all duration-700"
                  style={{ width: `${budgetPct}%` }}
                />
              </div>
            ) : theme === 'cyber' ? (
              <div className="w-full h-2.5 bg-[#0a0c24] rounded-full overflow-hidden border border-[#00f0ff]/40 shadow-[0_0_8px_rgba(0,240,255,0.3)]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#d946ef] via-[#a855f7] to-[#00f0ff] shadow-[0_0_10px_rgba(0,240,255,0.6)] transition-all duration-700"
                  style={{ width: `${budgetPct}%` }}
                />
              </div>
            ) : theme === 'pixel' ? (
              <div className="relative w-full h-3 bg-[#142308] border border-[#3b5e17] rounded-[2px] overflow-hidden">
                <div
                  className="h-full bg-[#7ecb2a] shadow-[inset_0_1px_0_#b7ff5a,inset_0_-1px_0_#437911] transition-all duration-700"
                  style={{ width: `${budgetPct}%` }}
                />
              </div>
            ) : (
              <div className="w-full h-2 bg-[#1e1e28] rounded-full overflow-hidden border border-[#2b3342]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#54687d] to-[#8da6c4] transition-all duration-700"
                  style={{ width: `${budgetPct}%` }}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="pt-1 flex items-center justify-between text-[11px] text-text-muted">
            <span>No monthly budget configured</span>
            {onNavigateTab && (
              <button
                onClick={() => onNavigateTab('settings')}
                className="text-accent/90 hover:text-accent hover:underline"
              >
                Set budget in Settings →
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── E. Recent Activity Section ── */}
      <div className="px-2 sm:px-0 mb-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold text-text-secondary uppercase tracking-wider">
            Recent Activity
          </h2>
          {projectedTxns.length > 0 && onNavigateTab && (
            <button
              onClick={() => onNavigateTab('history')}
              className="text-xs text-accent hover:underline flex items-center gap-0.5 font-semibold"
            >
              <span>View all in Activity</span>
              <ChevronRight size={13} />
            </button>
          )}
        </div>

        {recentTxns.length === 0 ? (
          /* F. Empty State */
          <div
            className={`p-7 text-center rounded-xl transition-all ${
              theme === 'elden'
                ? 'recent-card-elden'
                : theme === 'cyber'
                ? 'recent-card-cyber'
                : theme === 'pixel'
                ? 'recent-card-pixel'
                : 'recent-card-fantasy'
            }`}
          >
            {theme === 'cyber' && (
              <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none">
                <ArcaneWatermark className="w-40 h-40 text-[#00f0ff]" />
              </div>
            )}

            {theme === 'pixel' && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none opacity-40">
                <PixelChest className="w-8 h-8" />
              </div>
            )}

            <div className="relative z-10 space-y-2">
              <p className={`text-sm font-bold ${
                theme === 'elden' ? 'text-[#2c2215]' : theme === 'pixel' ? 'text-white' : 'text-text-primary'
              }`}>
                No transactions recorded yet
              </p>
              <p className={`text-xs max-w-xs mx-auto ${
                theme === 'elden' ? 'text-[#5a4832]' : theme === 'pixel' ? 'text-[#cccccc]' : 'text-text-muted'
              }`}>
                Use the + button or quick actions below to track your personal expenses, shared bills, or loans.
              </p>

              <div className="flex justify-center gap-2 pt-2">
                <button
                  onClick={() => onOpenSheet(null)}
                  className="btn btn-primary text-xs py-2 px-3 font-semibold flex items-center gap-1.5"
                >
                  <Plus size={14} /> Add First Transaction
                </button>
                {onNavigateTab && (
                  <button
                    onClick={() => onNavigateTab('people')}
                    className="btn btn-ghost text-xs py-2 px-3 border border-[var(--border-color)]"
                  >
                    Add Person
                  </button>
                )}
              </div>
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
              let bgColor = 'bg-secondary/80 border border-[var(--border-color)] text-text-muted';
              let sign = '';
              let displayAmt = txn.amount;

              if (isPE) {
                title = txn.description || 'Personal Expense';
                subtitle = txn.category ? `${txn.category} · Personal` : 'Personal Expense';
                Icon = CreditCard;
                color = 'text-text-primary';
                bgColor = 'bg-secondary border border-[var(--border-color)] text-text-muted';
                sign = '-';
              } else if (isSE) {
                title = txn.description || 'Shared Expense';
                subtitle = `Shared bill · Your share`;
                Icon = Scissors;
                color = 'text-accent';
                bgColor = 'bg-accent/15 border border-accent/30 text-accent';
                displayAmt = txn.myShare || txn.userShare || txn.amount;
                sign = '-';
              } else if (isL) {
                title = `You lent ${txn.person || 'someone'}`;
                subtitle = 'Loan to peer · Receivable';
                Icon = ArrowUpRight;
                color = 'text-emerald-400';
                bgColor = 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400';
                sign = '+';
              } else if (isB) {
                title = `You borrowed from ${txn.person || 'someone'}`;
                subtitle = 'Loan from peer · Payable';
                Icon = ArrowDownLeft;
                color = 'text-rose-400';
                bgColor = 'bg-rose-500/15 border border-rose-500/30 text-rose-400';
                sign = '-';
              } else if (isR) {
                if (txn.direction === 'inflow') {
                  title = `${txn.person || 'Peer'} paid you back`;
                  subtitle = 'Repayment received';
                  Icon = CheckCircle2;
                  color = 'text-emerald-400';
                  bgColor = 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400';
                  sign = '-';
                } else {
                  title = `You paid back ${txn.person || 'Peer'}`;
                  subtitle = 'Repayment sent';
                  Icon = CheckCircle2;
                  color = 'text-rose-400';
                  bgColor = 'bg-rose-500/15 border border-rose-500/30 text-rose-400';
                  sign = '+';
                }
              } else if (isAdj) {
                title = `Adjustment: ${txn.person || ''}`;
                subtitle = txn.description || 'Balance correction';
                Icon = AlertTriangle;
                color = 'text-amber-400';
                bgColor = 'bg-amber-500/15 border border-amber-500/30 text-amber-400';
                sign = txn.amount >= 0 ? '+' : '';
              } else {
                title = txn.description || txn.type;
                subtitle = txn.person ? `${txn.person} · Historical` : 'Historical entry';
                Icon = AlertTriangle;
                color = 'text-neutral-400';
                bgColor = 'bg-neutral-500/15 border border-neutral-500/30 text-neutral-400';
              }

              const d = new Date(txn.date);

              return (
                <div
                  key={txn.id}
                  onClick={() => onOpenSheet(txn.action || txn.type, txn)}
                  className="theme-card p-3.5 flex items-center gap-3.5 cursor-pointer hover:border-accent/40 active:scale-[0.99] transition-all"
                >
                  <div className={`w-9 h-9 rounded-xl ${bgColor} flex items-center justify-center flex-shrink-0`}>
                    <Icon size={16} className={color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-text-primary truncate">
                      {title}
                    </p>
                    <p className="text-[11px] text-text-muted truncate">
                      {d.getDate()} {MONTHS[d.getMonth()]} · {subtitle}
                    </p>
                  </div>
                  <span className={`text-xs font-bold ${color} whitespace-nowrap tabular-nums`}>
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
