import { useState, useMemo } from 'react';
import {
  LayoutDashboard,
  Users,
  Receipt,
  Settings,
  Plus,
} from 'lucide-react';
import { useStore } from './store.js';
import HomeTab from './components/HomeTab.jsx';
import LendingsTab from './components/LendingsTab.jsx';
import HistoryTab from './components/HistoryTab.jsx';
import SettingsTab from './components/SettingsTab.jsx';
import TransactionSheet from './components/TransactionSheet.jsx';
import PendingBanner from './components/PendingBanner.jsx';
import UnresolvedAttemptsBanner from './components/transaction/UnresolvedAttemptsBanner.jsx';
import { dispatchTransactionSave } from './domain/transaction-routing.js';

export default function App() {
  const store = useStore();
  const [tab, setTab] = useState('home');
  const [sheet, setSheet] = useState(null); // null | { type: 'give'|'take'|'split'|'settle', editTxn? }

  // Derived data
  const balances = store.computeBalances();
  const now = new Date();
  const analytics = store.computeMonthlyAnalytics(now.getFullYear(), now.getMonth());

  // Pending review & migrated alarms consolidation
  const attentionData = store.getAttentionItems ? store.getAttentionItems() : null;
  const pendingAlarmsList = useMemo(() => {
    const list = [];
    const seen = new Set();
    const addAlarm = (a) => {
      if (!a || seen.has(a.id)) return;
      if (a.reviewStatus && a.reviewStatus !== 'PENDING_USER_REVIEW') return;
      seen.add(a.id);
      list.push({
        id: a.id,
        txnId: a.txnId,
        personName: a.personName,
        amount: a.amount !== undefined ? a.amount : (a.amountPaise !== undefined ? a.amountPaise / 100 : 0),
        direction: a.direction,
        createdAt: a.createdAt,
      });
    };

    if (attentionData?.pendingAlarms) attentionData.pendingAlarms.forEach(addAlarm);
    if (attentionData?.migratedAlarms) attentionData.migratedAlarms.forEach(addAlarm);
    if (store.state?.pendingAlarms) store.state.pendingAlarms.forEach(addAlarm);
    if (store.state?.pendingReviews?.migratedAlarms) store.state.pendingReviews.migratedAlarms.forEach(addAlarm);

    return list;
  }, [attentionData, store.state]);

  const openSheet = (type, editTxn) => setSheet({ type, editTxn });
  const closeSheet = () => setSheet(null);

  // Modern, unified tab icons across all themes
  const renderTabIcon = (rawId, isActive) => {
    const id = rawId === 'people' ? 'people' : rawId === 'activity' ? 'history' : rawId;
    const iconSize = 20;

    const icons = {
      home: LayoutDashboard,
      people: Users,
      history: Receipt,
      settings: Settings,
    };

    const IconComponent = icons[id] || LayoutDashboard;

    return (
      <div className="flex flex-col items-center">
        <IconComponent size={iconSize} strokeWidth={isActive ? 2.2 : 1.75} />
        {isActive && (
          <span
            className="w-1 h-1 rounded-full mt-1"
            style={{ backgroundColor: 'var(--accent-color)' }}
          />
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
    <div className="flex flex-col min-h-dvh bg-primary text-primary transition-all duration-200">
      {/* Pending alarms banner */}
      <div className="max-w-2xl mx-auto w-full px-5 sm:px-6">
        <PendingBanner alarms={pendingAlarmsList} onResolve={store.resolvePendingAlarm} />
      </div>

      {/* Unresolved UPI payment attempts banner */}
      <div className="max-w-2xl mx-auto w-full px-5 sm:px-6">
        <UnresolvedAttemptsBanner
          attempts={store.getUnresolvedPaymentAttempts ? store.getUnresolvedPaymentAttempts() : []}
          onReconcile={(id, data) => store.reconcilePaymentAttempt(id, data)}
          onDismiss={(id) => store.dismissPaymentAttempt(id)}
        />
      </div>

      {/* Main content with responsive desktop centering */}
      <main className="flex-1 w-full overflow-y-auto overflow-x-hidden pb-24">
        <div className="max-w-2xl mx-auto w-full px-5 sm:px-6">
          <div key={tab} className="animate-fade-in w-full min-w-0">
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

      {/* Clean, professional FAB */}
      {tab !== 'settings' && (
        <button
          onClick={() => openSheet(null)}
          className="theme-fab transition-transform active:scale-95"
          aria-label="New transaction"
        >
          <Plus size={22} strokeWidth={2.4} />
        </button>
      )}

      {/* Tab bar with centered layout */}
      <nav className="tab-bar fixed bottom-0 inset-x-0 z-30 transition-all duration-200">
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
            const res = dispatchTransactionSave(sheet, txn, store);
            if (res && res.success === false) {
              return res;
            }
            closeSheet();
            return res;
          }}
          onClose={closeSheet}
          onAddPendingAlarm={store.addPendingAlarm}
        />
      )}
    </div>
  );
}
