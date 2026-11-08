import { TrendingUp, TrendingDown, ArrowUpRight, ArrowDownLeft, Scissors, Wallet } from 'lucide-react';
import { useTheme } from '../context/ThemeContext.jsx';
import {
  StarkSigil,
  EldenRuneSeal,
  SRankBadge,
  CrossedSwords,
  MinecraftCrossedSwords,
  PixelHeart,
  PixelSword,
  PixelChest,
  ArcaneWatermark,
} from './ThemeIcons.jsx';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function HomeTab({ analytics, balances, transactions, settings, people, onOpenSheet }) {
  const { theme } = useTheme();
  const currency = settings.currency || '₹';
  const budget = settings.monthlyBudget || 0;
  const now = new Date();

  // Net lending totals (Domino Engine derived)
  const totalOwedToMe = Object.values(balances).reduce((s, v) => s + (v > 0 ? v : 0), 0);
  const totalIOwe = Object.values(balances).reduce((s, v) => s + (v < 0 ? Math.abs(v) : 0), 0);

  // Top spender category
  const topCat = Object.entries(analytics.byCategory).sort((a, b) => b[1] - a[1])[0];

  // Budget progress
  const budgetPct = budget > 0 ? Math.min((analytics.totalSpent / budget) * 100, 100) : (analytics.totalSpent > 0 ? 40 : 0);
  const budgetColor = budgetPct > 90 ? 'bg-red-500' : budgetPct > 60 ? 'bg-amber-500' : 'bg-emerald-500';

  // Recent transactions (last 5)
  const recentTxns = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);

  return (
    <div className="animate-fade-in transition-all duration-300">
      {/* ── Header with Theme-Specific Iconography ── */}
      <header className="px-5 pt-6 pb-4 flex items-center justify-between">
        <div>
          <p className="text-text-secondary text-xs uppercase tracking-wider font-medium">
            {MONTHS[now.getMonth()]} {now.getFullYear()}
          </p>
          <h1
            className={`text-2xl font-bold mt-1 tracking-tight ${
              theme === 'cyber'
                ? 'text-[#00f0ff] drop-shadow-[0_0_12px_rgba(0,240,255,0.8)]'
                : theme === 'pixel'
                ? 'text-white drop-shadow-[2px_2px_0px_#000]'
                : theme === 'elden'
                ? 'text-[#f3ead3] drop-shadow-[0_0_8px_rgba(229,193,88,0.4)]'
                : 'text-text-primary'
            }`}
          >
            PocketLedger
          </h1>
        </div>

        {/* Right Header Element based on Theme */}
        <div>
          {theme === 'fantasy' && <StarkSigil className="w-9 h-9 text-[#8f8776] hover:text-[#c5a059] transition-colors" />}
          {theme === 'elden' && <EldenRuneSeal className="w-10 h-10 text-[#e5c158] drop-shadow-[0_0_10px_rgba(229,193,88,0.6)]" />}
          {theme === 'cyber' && <SRankBadge />}
          {theme === 'pixel' && (
            <div className="flex flex-col items-end gap-1.5">
              <div className="flex items-center gap-2">
                <PixelHeart className="w-4 h-4" />
                <PixelSword className="w-4 h-4" />
              </div>
              <div className="flex items-center gap-1 text-[8px] font-mono text-[#80ff00]">
                <span className="text-[#888]">EX</span>
                <div className="w-14 h-2 bg-[#142308] border border-[#3b5e17] rounded-[1px] overflow-hidden">
                  <div className="h-full bg-[#80ff00] w-3/4" />
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* ── Smart Insights Card (Increased padding & breathing room) ── */}
      <div className="mx-5 mb-6 theme-card p-6 sm:p-7">
        {/* Card Header Tag */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Wallet size={16} className="text-accent" />
            <span className="text-xs font-semibold text-accent uppercase tracking-wider">
              Smart Insights
            </span>
          </div>

          {/* Pixel Theme: "I owe" badge in top-right */}
          {theme === 'pixel' && (
            <span className="text-[10px] text-[#ff5555] font-bold flex items-center gap-1">
              ↘ I owe
            </span>
          )}
        </div>

        {/* Spent + Budget Section */}
        <div className="mb-5">
          <div className="flex items-baseline gap-2.5">
            <span
              className={`text-3xl sm:text-4xl font-extrabold ${
                theme === 'pixel'
                  ? 'text-[#ffaa00] drop-shadow-[1px_1px_0_#000]'
                  : theme === 'elden'
                  ? 'text-[#e5c158] drop-shadow-[0_0_10px_rgba(229,193,88,0.5)]'
                  : theme === 'fantasy'
                  ? 'text-[#c5a059]'
                  : 'text-text-primary'
              }`}
            >
              {currency}{analytics.totalSpent.toLocaleString('en-IN')}
            </span>
            <span className="text-text-muted text-sm font-medium">spent</span>
          </div>

          {/* Theme-Specific Progress Bars */}
          <div className="mt-4">
            {theme === 'elden' ? (
              // Elden Golden Grace Rune Arc Bar
              <div className="w-full h-3 bg-[#121216] rounded-full p-0.5 border border-[#5c4c23] shadow-inner relative overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#b8861d] via-[#ffe17d] to-[#d4a034] shadow-[0_0_14px_rgba(229,193,88,0.7)] transition-all duration-700"
                  style={{ width: `${Math.max(budgetPct, 45)}%` }}
                />
              </div>
            ) : theme === 'cyber' ? (
              // Cyber Neon Magenta to Cyan Bar
              <div className="w-full h-2.5 bg-[#0a0c24] rounded-full overflow-hidden border border-[#00f0ff]/40 shadow-[0_0_8px_rgba(0,240,255,0.3)]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#d946ef] via-[#a855f7] to-[#00f0ff] shadow-[0_0_10px_rgba(0,240,255,0.6)] transition-all duration-700"
                  style={{ width: `${Math.max(budgetPct, 60)}%` }}
                />
              </div>
            ) : theme === 'pixel' ? (
              // Pixel Minecraft XP Level Bar
              <div className="relative w-full h-3.5 bg-[#142308] border-2 border-[#3b5e17] rounded-[2px] overflow-hidden">
                <div
                  className="h-full bg-[#7ecb2a] shadow-[inset_0_1px_0_#b7ff5a,inset_0_-1px_0_#437911] transition-all duration-700"
                  style={{ width: `${Math.max(budgetPct, 40)}%` }}
                />
                <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-[#80ff00] drop-shadow-[1px_1px_0_#000]">
                  1
                </span>
                <span className="absolute right-1 top-0 bottom-0 flex items-center text-[8px] text-[#ffaa00]">
                  {currency}{budget || 0}
                </span>
              </div>
            ) : (
              // Fantasy / Standard Progress Bar
              <div className="w-full h-2 bg-[#1e1e28] rounded-full overflow-hidden border border-[#3d372e]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#8c6f33] to-[#c5a059] transition-all duration-700"
                  style={{ width: `${Math.max(budgetPct, 25)}%` }}
                />
              </div>
            )}

            {budget > 0 && theme !== 'pixel' && (
              <div className="flex justify-between text-xs text-text-secondary mt-1.5 font-medium">
                <span>{budgetPct.toFixed(0)}% of budget</span>
                <span>{currency}{budget.toLocaleString('en-IN')}</span>
              </div>
            )}
          </div>
        </div>

        {/* Lending Overview Sub-Cards */}
        <div className="grid grid-cols-2 gap-3.5">
          {/* Owed to me */}
          <div
            className="rounded-xl p-3.5 border transition-all"
            style={{
              backgroundColor: 'var(--owed-green-bg)',
              borderColor: theme === 'cyber' ? 'rgba(0,240,255,0.4)' : theme === 'pixel' ? '#555555' : 'rgba(74, 222, 128, 0.2)',
            }}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <TrendingUp size={14} style={{ color: 'var(--owed-green-text)' }} />
                <span className="text-xs font-semibold" style={{ color: 'var(--owed-green-text)' }}>
                  Owed to me
                </span>
              </div>
              {theme === 'pixel' && <span className="text-xs text-[#55ff55]">↑↓</span>}
            </div>
            <span
              className="text-lg sm:text-xl font-bold"
              style={{ color: 'var(--owed-green-text)' }}
            >
              {currency}{totalOwedToMe.toLocaleString('en-IN')}
            </span>
          </div>

          {/* I owe */}
          <div
            className="rounded-xl p-3.5 border transition-all"
            style={{
              backgroundColor: 'var(--owed-red-bg)',
              borderColor: theme === 'cyber' ? 'rgba(244,63,94,0.4)' : theme === 'pixel' ? '#555555' : 'rgba(248, 113, 113, 0.2)',
            }}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <TrendingDown size={14} style={{ color: 'var(--owed-red-text)' }} />
                <span className="text-xs font-semibold" style={{ color: 'var(--owed-red-text)' }}>
                  I owe
                </span>
              </div>
              {theme === 'pixel' && <span className="text-xs text-[#ff5555]">₹↓</span>}
            </div>
            <span
              className="text-lg sm:text-xl font-bold"
              style={{ color: 'var(--owed-red-text)' }}
            >
              {currency}{totalIOwe.toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        {/* Top category */}
        {topCat && (
          <div className="mt-4 pt-3.5 border-t border-[var(--border-color)]">
            <p className="text-xs text-text-muted">
              Top category: <span className="text-text-primary font-medium">{topCat[0]}</span> — {currency}{topCat[1].toLocaleString('en-IN')}
            </p>
          </div>
        )}
      </div>

      {/* ── Quick Actions (Increased gap & quick bounce/scale effect) ── */}
      <div className="px-5 mb-7">
        <h2 className="text-sm font-semibold text-text-secondary mb-3.5">
          Quick Actions
        </h2>
        <div className="grid grid-cols-3 gap-4">
          {/* GIVE BUTTON */}
          <button
            onClick={() => onOpenSheet('give')}
            className="quick-action-btn active:scale-95 transition-transform"
            aria-label="Give Money"
          >
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                theme === 'cyber'
                  ? 'bg-[#00f0ff]/15 border border-[#00f0ff]/60 shadow-[0_0_12px_rgba(0,240,255,0.4)]'
                  : theme === 'elden'
                  ? 'bg-[#18181e] border-2 border-[#5c4c23] shadow-inner'
                  : theme === 'pixel'
                  ? 'bg-[#2b2b2b] border border-[#555]'
                  : 'bg-[#1e1e28] border border-[#3d372e] rounded-full'
              }`}
            >
              {theme === 'elden' ? (
                // Golden runic arrow for Elden
                <span className="text-xl font-bold text-[#e5c158] drop-shadow-[0_0_8px_rgba(229,193,88,0.8)]">↗</span>
              ) : theme === 'cyber' ? (
                // Neon rising arrow for Cyber
                <ArrowUpRight size={22} className="text-[#00f0ff] drop-shadow-[0_0_8px_#00f0ff]" />
              ) : theme === 'pixel' ? (
                <div className="flex flex-col items-center">
                  <span className="text-[#ff5555] text-xs font-bold leading-none">↗</span>
                  <span className="text-sm">🪙</span>
                </div>
              ) : (
                <div className="flex items-center justify-center text-base">
                  <span className="text-[#c5a059]">🤝</span>
                </div>
              )}
            </div>
            <span className="text-xs font-semibold text-text-primary">Give</span>
          </button>

          {/* TAKE BUTTON */}
          <button
            onClick={() => onOpenSheet('take')}
            className="quick-action-btn active:scale-95 transition-transform"
            aria-label="Take Money"
          >
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                theme === 'cyber'
                  ? 'bg-[#00f0ff]/15 border border-[#00f0ff]/60 shadow-[0_0_12px_rgba(0,240,255,0.4)]'
                  : theme === 'elden'
                  ? 'bg-[#18181e] border-2 border-[#5c4c23] shadow-inner'
                  : theme === 'pixel'
                  ? 'bg-[#2b2b2b] border border-[#555]'
                  : 'bg-[#1e1e28] border border-[#3d372e] rounded-full'
              }`}
            >
              {theme === 'elden' ? (
                // Golden downward runic arrow for Elden
                <span className="text-xl font-bold text-[#e5c158] drop-shadow-[0_0_8px_rgba(229,193,88,0.8)]">↙</span>
              ) : theme === 'cyber' ? (
                // Incoming energy arrow for Cyber
                <ArrowDownLeft size={22} className="text-[#00f0ff] drop-shadow-[0_0_8px_#00f0ff]" />
              ) : theme === 'pixel' ? (
                <div className="flex flex-col items-center">
                  <span className="text-[#55ff55] text-xs font-bold leading-none">↙</span>
                  <span className="text-sm">🪙</span>
                </div>
              ) : (
                <div className="flex items-center justify-center text-base">
                  <span className="text-[#c5a059]">🤲</span>
                </div>
              )}
            </div>
            <span className="text-xs font-semibold text-text-primary">Take</span>
          </button>

          {/* SPLIT BUTTON */}
          <button
            onClick={() => onOpenSheet('split')}
            className="quick-action-btn active:scale-95 transition-transform"
            aria-label="Split Expense"
          >
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                theme === 'cyber'
                  ? 'bg-[#a855f7]/20 border border-[#a855f7] shadow-[0_0_12px_rgba(168,85,247,0.5)]'
                  : theme === 'elden'
                  ? 'bg-[#18181e] border-2 border-[#5c4c23] shadow-inner'
                  : theme === 'pixel'
                  ? 'bg-[#2b2b2b] border border-[#555]'
                  : 'bg-[#1e1e28] border border-[#3d372e] rounded-full'
              }`}
            >
              {theme === 'elden' ? (
                // Crossed swords for Elden Ring theme (Step 4 instruction)
                <CrossedSwords className="w-6 h-6 text-[#e5c158] drop-shadow-[0_0_8px_rgba(229,193,88,0.8)]" />
              ) : theme === 'pixel' ? (
                // Crossed Minecraft diamond swords for Pixel theme (Step 4 instruction)
                <MinecraftCrossedSwords className="w-7 h-7" />
              ) : theme === 'cyber' ? (
                // Neon crystal dagger for Cyber theme
                <Scissors size={20} className="text-[#a855f7] drop-shadow-[0_0_8px_#a855f7]" />
              ) : (
                // Fantasy medieval sword/dagger
                <span className="text-base text-[#c5a059]">🗡️</span>
              )}
            </div>
            <span className="text-xs font-semibold text-text-primary">Split</span>
          </button>
        </div>
      </div>

      {/* ── Category Spending Breakdown ── */}
      {Object.keys(analytics.byCategory).length > 0 && (
        <div className="px-5 mb-7">
          <h2 className="text-sm font-semibold text-text-secondary mb-3.5">By Category</h2>
          <div className="space-y-3">
            {Object.entries(analytics.byCategory)
              .sort((a, b) => b[1] - a[1])
              .map(([cat, amt]) => {
                const pct = analytics.totalSpent > 0 ? (amt / analytics.totalSpent) * 100 : 0;
                return (
                  <div key={cat}>
                    <div className="flex justify-between text-xs mb-1.5 font-medium">
                      <span className="text-text-secondary">{cat}</span>
                      <span className="text-text-primary">{currency}{amt.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="w-full h-2 bg-[#1a1a24] rounded-full overflow-hidden border border-[var(--border-color)]">
                      <div
                        className="h-full rounded-full bg-accent transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* ── Recent Transactions Card (Increased padding & theme styling) ── */}
      <div className="px-5 mb-8">
        <h2 className="text-sm font-semibold text-text-secondary mb-3.5">Recent</h2>
        {recentTxns.length === 0 ? (
          <div
            className={`p-7 sm:p-8 text-center rounded-xl transition-all ${
              theme === 'elden'
                ? 'recent-card-elden'
                : theme === 'cyber'
                ? 'recent-card-cyber'
                : theme === 'pixel'
                ? 'recent-card-pixel'
                : 'recent-card-fantasy'
            }`}
          >
            {/* Cyber Arcane Watermark overlay */}
            {theme === 'cyber' && (
              <div className="absolute inset-0 flex items-center justify-center opacity-25 pointer-events-none">
                <ArcaneWatermark className="w-48 h-48 text-[#00f0ff]" />
              </div>
            )}

            {/* Pixel Theme Wooden Chest on right */}
            {theme === 'pixel' && (
              <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none">
                <PixelChest className="w-9 h-9" />
              </div>
            )}

            <div className="relative z-10">
              <p
                className={`text-sm font-semibold ${
                  theme === 'elden'
                    ? 'text-[#2c2215]'
                    : theme === 'pixel'
                    ? 'text-white'
                    : 'text-text-primary'
                }`}
              >
                No transactions yet
              </p>
              <p
                className={`text-xs mt-1.5 ${
                  theme === 'elden'
                    ? 'text-[#5a4832]'
                    : theme === 'pixel'
                    ? 'text-[#cccccc]'
                    : 'text-text-muted'
                }`}
              >
                Tap + to add your first
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {recentTxns.map((txn) => (
              <TxnCard key={txn.id} txn={txn} currency={currency} theme={theme} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TxnCard({ txn, currency, theme }) {
  const isGive = txn.type === 'give' || txn.type === 'split';
  const icon = isGive ? ArrowUpRight : ArrowDownLeft;
  const Icon = icon;
  const color = isGive ? 'text-red-400' : 'text-emerald-400';
  const bgColor = isGive ? 'bg-red-500/15' : 'bg-emerald-500/15';
  const sign = isGive ? '-' : '+';
  const displayAmt = txn.type === 'split' ? (txn.myShare || txn.amount) : txn.amount;
  const d = new Date(txn.date);

  return (
    <div className="theme-card p-4 flex items-center gap-3.5">
      <div className={`w-10 h-10 rounded-full ${bgColor} flex items-center justify-center flex-shrink-0`}>
        <Icon size={18} className={color} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{txn.description || txn.person || 'Transaction'}</p>
        <p className="text-xs text-text-muted">
          {txn.person || ''}{txn.person ? ' · ' : ''}
          {d.getDate()}{' '}
          {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]}
        </p>
      </div>
      <span className={`text-sm font-bold ${color} whitespace-nowrap`}>
        {sign}{currency}{displayAmt.toLocaleString('en-IN')}
      </span>
    </div>
  );
}
