import { useState } from 'react';
import {
  Home,
  Users,
  Clock,
  Settings,
  Plus,
  Castle,
  Shield,
  Hourglass,
  Sparkles,
} from 'lucide-react';
import { useStore, computeLendingBalances, computeMonthlyAnalytics } from './store.js';
import { useTheme } from './context/ThemeContext.jsx';
import HomeTab from './components/HomeTab.jsx';
import LendingsTab from './components/LendingsTab.jsx';
import HistoryTab from './components/HistoryTab.jsx';
import SettingsTab from './components/SettingsTab.jsx';
import TransactionSheet from './components/TransactionSheet.jsx';
import PendingBanner from './components/PendingBanner.jsx';
import UnresolvedAttemptsBanner from './components/transaction/UnresolvedAttemptsBanner.jsx';
import { ArcaneWatermark } from './components/ThemeIcons.jsx';

export default function App() {
  const store = useStore();
  const { theme } = useTheme();
  const [tab, setTab] = useState('home');
  const [sheet, setSheet] = useState(null); // null | { type: 'give'|'take'|'split'|'settle', editTxn? }

  // Derived data (Domino Engine — unchanged)
  const balances = computeLendingBalances(store.state.transactions);
  const now = new Date();
  const analytics = computeMonthlyAnalytics(store.state.transactions, now.getFullYear(), now.getMonth());

  const openSheet = (type, editTxn) => setSheet({ type, editTxn });
  const closeSheet = () => setSheet(null);

  // Theme-aware Tab Bar Icons
  const renderTabIcon = (rawId, isActive) => {
    const iconSize = 20;
    const id = rawId === 'people' ? 'lendings' : rawId === 'activity' ? 'history' : rawId;

    if (theme === 'pixel') {
      const pixelIcons = {
        home: <span className="text-base leading-none">🏡</span>,
        lendings: <span className="text-base leading-none">🧔</span>,
        history: <span className="text-base leading-none">📖</span>,
        settings: <span className="text-base leading-none">♦️</span>, // Redstone for settings (Step 4)
      };
      return (
        <div className="flex flex-col items-center">
          {pixelIcons[id]}
          {isActive && <span className="w-2.5 h-0.5 bg-[#55ff55] mt-1" />}
        </div>
      );
    }

    if (theme === 'fantasy') {
      const fantasyIcons = {
        home: <Castle size={iconSize} />,
        lendings: <Shield size={iconSize} />,
        history: <Hourglass size={iconSize} />,
        settings: (
          <div className="relative">
            <Settings size={iconSize} />
            <Sparkles size={10} className="absolute -top-1 -right-1 text-[#c5a059]" />
          </div>
        ),
      };
      return fantasyIcons[id];
    }

    if (theme === 'elden') {
      const eldenIcons = {
        home: (
          <div className="flex flex-col items-center">
            <Home size={iconSize} className={isActive ? 'text-[#e5c158]' : ''} />
            {isActive && <span className="w-1.5 h-1.5 rounded-full bg-[#e5c158] shadow-[0_0_6px_#e5c158] mt-1" />}
          </div>
        ),
        lendings: <Users size={iconSize} />,
        history: <Clock size={iconSize} />,
        settings: (
          <div className="relative">
            <Settings size={iconSize} />
            <Sparkles size={10} className="absolute -top-1 -right-1 text-[#e5c158]" />
          </div>
        ),
      };
      return eldenIcons[id];
    }

    // Cyber
    const cyberIcons = {
      home: <Home size={iconSize} />,
      lendings: <Users size={iconSize} />,
      history: <Clock size={iconSize} />,
      settings: (
        <div className="relative">
          <Settings size={iconSize} />
          <Sparkles size={10} className="absolute -top-1 -right-1 text-[#00f0ff]" />
        </div>
      ),
    };
    return (
      <div className="flex flex-col items-center">
        {cyberIcons[id]}
        {isActive && (
          <span className="w-4 h-0.5 bg-[#00f0ff] shadow-[0_0_8px_#00f0ff] rounded-full mt-1" />
        )}
      </div>
    );
  };

  const tabs = [
    { id: 'home', label: 'Overview' },
    { id: 'people', label: 'People' },
    { id: 'history', label: 'Activity' },
    { id: 'settings', label: 'Settings' },
  ];

  return (
    <div className="flex flex-col min-h-dvh bg-primary text-primary transition-all duration-300">
      {/* Pending alarms banner */}
      <div className="max-w-3xl mx-auto w-full">
        <PendingBanner alarms={store.state.pendingAlarms} onResolve={store.resolvePendingAlarm} />
      </div>

      {/* Unresolved UPI payment attempts banner */}
      <div className="max-w-3xl mx-auto w-full">
        <UnresolvedAttemptsBanner
          attempts={store.getUnresolvedPaymentAttempts ? store.getUnresolvedPaymentAttempts() : []}
          onReconcile={(id, data) => store.reconcilePaymentAttempt(id, data)}
          onDismiss={(id) => store.dismissPaymentAttempt(id)}
        />
      </div>

      {/* Main content with smooth fade-in navigation & responsive desktop centering */}
      <main className="flex-1 overflow-y-auto pb-28">
        <div className="max-w-3xl mx-auto w-full px-2 sm:px-4">
          <div key={tab} className="animate-fade-in transition-all duration-300">
          {(tab === 'home' || tab === 'overview') && (
            <HomeTab
              analytics={analytics}
              balances={balances}
              transactions={store.state.transactions}
              settings={store.state.settings}
              people={store.state.people}
              store={store}
              onOpenSheet={openSheet}
              onNavigateTab={setTab}
            />
          )}
          {(tab === 'people' || tab === 'lendings') && (
            <LendingsTab
              balances={balances}
              people={store.state.people}
              transactions={store.state.transactions}
              settings={store.state.settings}
              store={store}
              onOpenSheet={openSheet}
              onAddPerson={store.addPerson}
              onUpdatePerson={store.updatePerson}
              onAddTransaction={store.addTransaction}
              onNavigateTab={setTab}
            />
          )}
          {(tab === 'history' || tab === 'activity') && (
            <HistoryTab
              transactions={store.state.transactions}
              settings={store.state.settings}
              people={store.state.people}
              store={store}
              onOpenSheet={openSheet}
              onEdit={(txn) => openSheet(txn.type, txn)}
              onDelete={store.deleteTransaction}
            />
          )}
          {tab === 'settings' && (
            <SettingsTab
              settings={store.state.settings}
              onUpdate={store.updateSettings}
              onExportJSON={store.exportData}
              onExportCSV={store.exportCSV}
              onImport={store.importData}
              migrationStatus={store.migrationStatus}
              hasRollbackBackup={store.hasRollbackBackup}
              onPreviewMigration={store.previewMigration}
              onExecuteMigration={store.executeMigration}
              onRollbackMigration={store.rollbackMigration}
              onGetRawV1Backup={store.getRawV1Backup}
              store={store}
            />
          )}
          </div>
        </div>
      </main>

      {/* FAB with theme-specific aesthetics (Step 4) */}
      {tab !== 'settings' && (
        <button
          onClick={() => openSheet(null)}
          className="theme-fab transition-transform active:scale-90"
          aria-label="New transaction"
        >
          {theme === 'fantasy' && (
            <>
              {/* Crown on top of FAB button */}
              <span className="absolute -top-3 text-sm text-[#8da6c4] drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                👑
              </span>
              <Plus size={24} className="text-[#8da6c4]" strokeWidth={2.5} />
            </>
          )}

          {theme === 'elden' && (
            <Plus
              size={26}
              className="text-[#e5c158] drop-shadow-[0_0_10px_rgba(229,193,88,0.9)]"
              strokeWidth={2.5}
            />
          )}

          {theme === 'cyber' && (
            <>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40 animate-spin-slow">
                <ArcaneWatermark className="w-14 h-14 text-[#00f0ff]" />
              </div>
              <Plus
                size={24}
                className="text-white relative z-10 drop-shadow-[0_0_8px_#00f0ff]"
                strokeWidth={2.5}
              />
            </>
          )}

          {theme === 'pixel' && (
            <Plus
              size={24}
              className="text-[#ffe655] drop-shadow-[1px_1px_0_#000]"
              strokeWidth={3}
            />
          )}
        </button>
      )}

      {/* Tab bar with centered desktop layout */}
      <nav className="tab-bar fixed bottom-0 inset-x-0 z-30 transition-all duration-300">
        <div className="max-w-md mx-auto w-full flex items-center justify-around px-2">
          {tabs.map((t) => {
            const isActive =
              tab === t.id ||
              (t.id === 'home' && tab === 'overview') ||
              (t.id === 'people' && tab === 'lendings') ||
              (t.id === 'history' && tab === 'activity');
            return (
              <button
                key={t.id}
                className={`tab-item ${isActive ? 'active' : ''}`}
                onClick={() => setTab(t.id)}
                aria-label={t.label}
              >
                {renderTabIcon(t.id, isActive)}
                <span className="mt-0.5">{t.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Transaction bottom sheet */}
      {sheet && (
        <TransactionSheet
          type={sheet.type}
          editTxn={sheet.editTxn}
          people={store.state.people}
          categories={store.state.categories}
          settings={store.state.settings}
          balances={balances}
          store={store}
          onSave={(txn) => {
            if (sheet.editTxn) {
              store.editTransaction(sheet.editTxn.id, txn);
            } else {
              store.addTransaction(txn);
            }
            closeSheet();
          }}
          onClose={closeSheet}
          onAddPendingAlarm={store.addPendingAlarm}
        />
      )}
    </div>
  );
}
