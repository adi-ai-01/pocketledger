import { useState, useRef } from 'react';
import {
  Download,
  Upload,
  FileText,
  RotateCcw,
  ChevronRight,
  ChevronDown,
  ShieldCheck,
  AlertTriangle,
  X,
} from 'lucide-react';

const CURRENCY_OPTIONS = [
  { symbol: '₹', label: '₹ · Indian Rupee (INR)' },
  { symbol: '$', label: '$ · US Dollar (USD)' },
  { symbol: '€', label: '€ · Euro (EUR)' },
  { symbol: '£', label: '£ · British Pound (GBP)' },
  { symbol: '¥', label: '¥ · Japanese Yen (JPY)' },
  { symbol: 'AED', label: 'AED · UAE Dirham' },
  { symbol: 'CAD', label: 'CAD · Canadian Dollar' },
  { symbol: 'AUD', label: 'AUD · Australian Dollar' },
];

export default function SettingsTab({
  settings = {},
  onUpdate,
  onExportJSON,
  onExportCSV,
  onImport,
  migrationStatus = 'COMPLETED',
  hasRollbackBackup = false,
  onPreviewMigration,
  onExecuteMigration,
  onRollbackMigration,
  onGetRawV1Backup,
  store,
}) {
  // Preferences State
  const [currency, setCurrency] = useState(settings.currency || '₹');
  const [budget, setBudget] = useState(String(settings.monthlyBudget || ''));
  const [prefSavedMessage, setPrefSavedMessage] = useState(null);

  // Import State
  const [importPreview, setImportPreview] = useState(null);
  const [importStatus, setImportStatus] = useState(null);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const fileRef = useRef(null);

  // Migration & Recovery State
  const [migrationFeedback, setMigrationFeedback] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [showMigrationPreview, setShowMigrationPreview] = useState(false);
  const [rollbackStatus, setRollbackStatus] = useState(null);

  // Review Items State
  const pendingAlarms = store?.state?.pendingAlarms || [];
  const migratedAlarms = (store?.state?.pendingReviews?.migratedAlarms || []).filter(
    (a) => a.reviewStatus === 'PENDING_USER_REVIEW'
  );
  const unclassifiedEvents = (store?.state?.transactions || []).filter(
    (t) => t.kind === 'LEGACY_UNCLASSIFIED' && t.reviewRequired
  );
  const totalReviewItems = pendingAlarms.length + migratedAlarms.length + unclassifiedEvents.length;

  // ── Handlers: Preferences ──
  const handleCurrencyChange = (newCurrency) => {
    setCurrency(newCurrency);
    const parsedBudget = parseFloat(budget) || 0;
    if (onUpdate) {
      onUpdate({
        currency: newCurrency,
        monthlyBudget: Math.max(0, parsedBudget),
      });
    }
    setPrefSavedMessage('Currency updated');
    setTimeout(() => setPrefSavedMessage(null), 2500);
  };

  const handleSaveBudget = (e) => {
    e?.preventDefault();
    const parsedBudget = parseFloat(budget) || 0;
    if (onUpdate) {
      onUpdate({
        currency,
        monthlyBudget: Math.max(0, parsedBudget),
      });
    }
    setPrefSavedMessage('Spending limit saved');
    setTimeout(() => setPrefSavedMessage(null), 2500);
  };

  // ── Handlers: Export ──
  const handleExportJSON = () => {
    const data = onExportJSON ? onExportJSON() : (store?.exportData ? store.exportData() : '');
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pocketledger-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = () => {
    const data = onExportCSV ? onExportCSV() : (store?.exportCSV ? store.exportCSV() : '');
    const blob = new Blob([data], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pocketledger-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadV1Backup = () => {
    const rawBackup = onGetRawV1Backup ? onGetRawV1Backup() : null;
    const dataToSave = rawBackup || (onExportJSON ? onExportJSON() : '');
    const blob = new Blob([dataToSave], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pocketledger-previous-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Handlers: Safe Import ──
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const jsonContent = String(reader.result || '');
      const val = store?.previewImport
        ? store.previewImport(jsonContent)
        : { isValid: true, preview: { schemaVersion: 2, transactionCount: 0, peopleCount: 0, warnings: [] }, parsed: null };

      if (!val.isValid) {
        setImportStatus({ type: 'error', text: `Import failed: ${val.error}` });
        return;
      }

      setImportPreview({
        rawJson: jsonContent,
        preview: val.preview,
      });
      setShowImportConfirm(true);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExecuteImport = () => {
    if (!importPreview?.rawJson) return;

    const res = onImport ? onImport(importPreview.rawJson) : (store?.importData ? store.importData(importPreview.rawJson) : { success: false });

    if (res.success) {
      setImportStatus({
        type: 'success',
        text: res.message || 'Backup restored successfully.',
      });
    } else {
      setImportStatus({
        type: 'error',
        text: `Import failed: ${res.error}`,
      });
    }

    setShowImportConfirm(false);
    setImportPreview(null);
    setTimeout(() => setImportStatus(null), 5000);
  };

  const handleRollbackPreImport = () => {
    if (store?.rollbackPreImport) {
      const res = store.rollbackPreImport();
      if (res.success) {
        setImportStatus({ type: 'success', text: 'Pre-import backup restored.' });
      } else {
        setImportStatus({ type: 'error', text: res.error || 'Failed to restore pre-import backup.' });
      }
      setTimeout(() => setImportStatus(null), 4000);
    }
  };

  // ── Handlers: Migration & Rollback ──
  const handleToggleMigrationPreview = () => {
    if (!showMigrationPreview && onPreviewMigration) {
      setPreviewData(onPreviewMigration());
    }
    setShowMigrationPreview(!showMigrationPreview);
  };

  const handleExecuteMigration = () => {
    if (!onExecuteMigration) return;
    try {
      const res = onExecuteMigration();
      if (res.success) {
        setMigrationFeedback({
          type: 'success',
          text: 'Database update completed successfully.',
        });
      } else {
        setMigrationFeedback({
          type: 'error',
          text: `Update failed: ${res.error}`,
        });
      }
    } catch (err) {
      setMigrationFeedback({
        type: 'error',
        text: `Update error: ${err.message}`,
      });
    }
  };

  const handleRollbackV1 = () => {
    if (!onRollbackMigration) return;
    if (window.confirm('Restore database from the pre-update backup? Any transactions recorded after the update will be replaced.')) {
      const res = onRollbackMigration();
      if (res.success) {
        setRollbackStatus('Database restored from previous backup.');
        setTimeout(() => setRollbackStatus(null), 4000);
      } else {
        setRollbackStatus(`Restore failed: ${res.error}`);
        setTimeout(() => setRollbackStatus(null), 4000);
      }
    }
  };

  // ── Handlers: Legacy Review ──
  const handleResolveAlarm = (alarmId) => {
    if (store?.resolvePendingAlarm) {
      store.resolvePendingAlarm(alarmId, false);
    }
  };

  const handleMarkTransactionReviewed = (id) => {
    if (store?.markTransactionReviewed) {
      store.markTransactionReviewed(id);
    }
  };

  return (
    <div className="w-full pt-5 sm:pt-6 pb-28 sm:pb-32 space-y-7 animate-fade-in">
      {/* ── Page Header ── */}
      <header className="mb-6">
        <h1 className="text-[26px] sm:text-[28px] font-bold tracking-tight text-text-primary leading-tight">
          Settings
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Preferences and data management
        </p>
      </header>

      {/* ── 1. Preferences Section ── */}
      <section className="space-y-5">
        <h2 className="text-base font-semibold text-text-primary">
          Preferences
        </h2>

        {/* Currency Control */}
        <div>
          <label htmlFor="currency-select" className="text-sm font-medium text-text-secondary block mb-2">
            Currency
          </label>
          <div className="relative">
            <select
              id="currency-select"
              value={currency}
              onChange={(e) => handleCurrencyChange(e.target.value)}
              className="w-full h-[48px] px-3.5 pr-10 bg-secondary border border-[var(--border-color)] rounded-xl text-text-primary text-sm font-medium focus:border-accent outline-none appearance-none cursor-pointer"
            >
              {CURRENCY_OPTIONS.map((opt) => (
                <option key={opt.symbol} value={opt.symbol}>
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDown size={18} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          </div>
        </div>

        {/* Monthly Spending Limit Control */}
        <div>
          <label htmlFor="budget-input" className="text-sm font-medium text-text-secondary block mb-2">
            Monthly spending limit
          </label>
          <form onSubmit={handleSaveBudget} className="flex items-center gap-2.5">
            <div className="relative flex-1">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-text-muted">
                {currency}
              </span>
              <input
                id="budget-input"
                type="number"
                min="0"
                placeholder="0 (no limit set)"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                className="w-full h-[48px] pl-9 pr-3.5 bg-secondary border border-[var(--border-color)] rounded-xl text-text-primary text-sm tabular-nums focus:border-accent outline-none"
              />
            </div>
            <button
              type="submit"
              className="h-[48px] w-[84px] flex-shrink-0 btn btn-primary text-sm font-semibold rounded-xl"
            >
              Save
            </button>
          </form>
        </div>

        {prefSavedMessage && (
          <p className="text-xs text-emerald-400 font-medium">
            {prefSavedMessage}
          </p>
        )}
      </section>

      <hr className="border-t border-[var(--border-color)]/60 my-1" />

      {/* ── 2. Data and Backups Section ── */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-text-primary">
          Data and backups
        </h2>

        <div className="divide-y divide-[var(--border-color)]/60 border-y border-[var(--border-color)]/60">
          {/* Row 1: Backup ledger */}
          <button
            type="button"
            onClick={handleExportJSON}
            className="w-full h-[60px] flex items-center justify-between text-left hover:bg-secondary/30 transition-colors px-1"
          >
            <div className="flex items-center gap-3 min-w-0">
              <Download size={20} className="text-text-muted flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-[15px] font-medium text-text-primary truncate">Backup ledger</p>
                <p className="text-xs text-text-muted truncate">Download complete JSON ledger backup</p>
              </div>
            </div>
            <ChevronRight size={18} className="text-text-muted flex-shrink-0 ml-3" />
          </button>

          {/* Row 2: Export transactions */}
          <button
            type="button"
            onClick={handleExportCSV}
            className="w-full h-[60px] flex items-center justify-between text-left hover:bg-secondary/30 transition-colors px-1"
          >
            <div className="flex items-center gap-3 min-w-0">
              <FileText size={20} className="text-text-muted flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-[15px] font-medium text-text-primary truncate">Export transactions</p>
                <p className="text-xs text-text-muted truncate">Download transaction history as CSV</p>
              </div>
            </div>
            <ChevronRight size={18} className="text-text-muted flex-shrink-0 ml-3" />
          </button>

          {/* Row 3: Restore backup */}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full h-[60px] flex items-center justify-between text-left hover:bg-secondary/30 transition-colors px-1"
          >
            <div className="flex items-center gap-3 min-w-0">
              <Upload size={20} className="text-text-muted flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-[15px] font-medium text-text-primary truncate">Restore backup</p>
                <p className="text-xs text-text-muted truncate">Import JSON backup with safety preview</p>
              </div>
            </div>
            <ChevronRight size={18} className="text-text-muted flex-shrink-0 ml-3" />
          </button>

          {/* Pre-import rollback row if safety backup exists */}
          {store?.hasPreImportBackup && store.hasPreImportBackup() && (
            <button
              type="button"
              onClick={handleRollbackPreImport}
              className="w-full h-[60px] flex items-center justify-between text-left hover:bg-secondary/30 transition-colors px-1"
            >
              <div className="flex items-center gap-3 min-w-0">
                <RotateCcw size={20} className="text-amber-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[15px] font-medium text-amber-300 truncate">Restore pre-import backup</p>
                  <p className="text-xs text-text-muted truncate">Revert to the state before the last import</p>
                </div>
              </div>
              <ChevronRight size={18} className="text-amber-400 flex-shrink-0 ml-3" />
            </button>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".json"
          onChange={handleFileSelect}
          className="hidden"
        />

        {importStatus && (
          <p className={`text-xs p-3 rounded-lg border ${
            importStatus.type === 'error'
              ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
              : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
          }`}>
            {importStatus.text}
          </p>
        )}
      </section>

      {/* ── 3. Recovery Section (shown only when relevant) ── */}
      {(migrationStatus === 'AVAILABLE' || hasRollbackBackup || totalReviewItems > 0) && (
        <>
          <hr className="border-t border-[var(--border-color)]/60 my-1" />

          <section className="space-y-4">
            <h2 className="text-base font-semibold text-text-primary">
              Recovery
            </h2>

            {/* Database Update Available */}
            {migrationStatus === 'AVAILABLE' && (
              <div className="p-4 rounded-xl bg-secondary/40 border border-amber-500/30 space-y-3">
                <div className="flex items-center gap-2 text-amber-300 text-sm font-semibold">
                  <AlertTriangle size={16} /> Database update available
                </div>
                <p className="text-xs text-text-secondary leading-relaxed">
                  An update is ready to upgrade your ledger data. A pre-update safety backup will be created automatically.
                </p>

                {showMigrationPreview && previewData && (
                  <div className="p-3 rounded-lg bg-secondary/80 text-xs space-y-1 border border-[var(--border-color)]">
                    <p className="text-text-secondary">Transactions to update: {previewData.transactionCount}</p>
                    <p className="text-text-secondary">Directory contacts: {previewData.peopleCount}</p>
                    {previewData.warnings?.length > 0 && (
                      <p className="text-amber-400">{previewData.warnings.length} items flagged for review.</p>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleExecuteMigration}
                    className="btn btn-primary text-xs !py-2 px-3.5 font-medium flex items-center gap-1.5"
                  >
                    <ShieldCheck size={14} /> Update now
                  </button>
                  <button
                    type="button"
                    onClick={handleToggleMigrationPreview}
                    className="btn btn-ghost text-xs !py-2 px-3 font-medium"
                  >
                    {showMigrationPreview ? 'Hide summary' : 'View summary'}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadV1Backup}
                    className="btn btn-ghost text-xs !py-2 px-3 font-medium text-text-muted hover:text-text-primary"
                  >
                    <Download size={13} /> Download backup
                  </button>
                </div>

                {migrationFeedback && (
                  <p className={`text-xs mt-2 ${migrationFeedback.type === 'error' ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {migrationFeedback.text}
                  </p>
                )}
              </div>
            )}

            {/* Pre-update Backup Available */}
            {hasRollbackBackup && (
              <div className="p-4 rounded-xl bg-secondary/40 border border-[var(--border-color)] space-y-3">
                <p className="text-sm font-medium text-text-primary">
                  Previous backup available
                </p>
                <p className="text-xs text-text-secondary leading-relaxed">
                  A backup created before the last database update is stored locally on this device.
                </p>

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleDownloadV1Backup}
                    className="btn btn-ghost text-xs !py-2 px-3 font-medium"
                  >
                    <Download size={13} /> Download backup
                  </button>
                  <button
                    type="button"
                    onClick={handleRollbackV1}
                    className="btn btn-ghost text-xs !py-2 px-3 text-rose-400 hover:text-rose-300 border-rose-500/20 font-medium"
                  >
                    <RotateCcw size={13} /> Restore previous data
                  </button>
                </div>

                {rollbackStatus && (
                  <p className="text-xs text-emerald-400 bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/20">
                    {rollbackStatus}
                  </p>
                )}
              </div>
            )}

            {/* Records Requiring Review */}
            {totalReviewItems > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={16} className="text-amber-400" />
                    <h3 className="text-sm font-semibold text-text-primary">
                      Records requiring review
                    </h3>
                  </div>
                  <span className="text-xs font-medium text-amber-400">
                    {totalReviewItems} {totalReviewItems === 1 ? 'item' : 'items'}
                  </span>
                </div>
                <p className="text-xs text-text-secondary">
                  Historical transactions that require confirmation.
                </p>

                <div className="space-y-2 pt-1">
                  {[...pendingAlarms, ...migratedAlarms].map((alarm) => (
                    <div
                      key={alarm.id}
                      className="p-3.5 rounded-xl bg-secondary/50 border border-[var(--border-color)] flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-text-primary truncate">
                          {alarm.personName || 'Contact'}: {currency}{alarm.amount || (alarm.amountPaise ? alarm.amountPaise / 100 : 0)}
                        </p>
                        <p className="text-[11px] text-text-muted">
                          {alarm.direction === 'settled' ? 'Settlement intent' : 'Lending intent'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleResolveAlarm(alarm.id)}
                        className="btn btn-ghost text-xs !py-1 px-2.5 text-text-muted hover:text-text-primary"
                      >
                        Dismiss
                      </button>
                    </div>
                  ))}

                  {unclassifiedEvents.map((evt) => (
                    <div
                      key={evt.id}
                      className="p-3.5 rounded-xl bg-secondary/50 border border-[var(--border-color)] flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-text-primary truncate">
                          {evt.description || 'Historical record'}: {currency}{evt.amountPaise / 100}
                        </p>
                        <p className="text-[11px] text-text-muted">
                          Type: {evt.legacyType} · Date: {evt.date}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleMarkTransactionReviewed(evt.id)}
                        className="btn btn-ghost text-xs !py-1 px-2.5 border-amber-500/30 text-amber-300 hover:bg-amber-500/10"
                      >
                        Confirm
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </>
      )}

      {/* ── 4. About / Privacy ── */}
      <div className="pt-6 text-center text-xs text-text-muted">
        <p className="font-medium text-text-secondary">PocketLedger</p>
        <p className="mt-0.5">All financial records are stored locally on your device.</p>
      </div>

      {/* ── Import Confirmation & Preview Modal ── */}
      {showImportConfirm && importPreview && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-card border border-[var(--border-color)] rounded-2xl w-full max-w-sm p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-text-primary">Confirm Ledger Import</h3>
              <button
                type="button"
                onClick={() => {
                  setShowImportConfirm(false);
                  setImportPreview(null);
                }}
                className="p-1 rounded-lg text-text-muted hover:text-text-primary"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-secondary/50 border border-[var(--border-color)] space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-text-muted">Transactions to Import</span>
                <span className="font-medium text-text-primary">{importPreview.preview.transactionCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">People in Directory</span>
                <span className="font-medium text-text-primary">{importPreview.preview.peopleCount}</span>
              </div>
            </div>

            {importPreview.preview.warnings.length > 0 && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 space-y-1">
                <p className="font-semibold">Notice:</p>
                {importPreview.preview.warnings.map((w, idx) => (
                  <p key={idx} className="text-[11px] leading-snug">{w}</p>
                ))}
              </div>
            )}

            <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-200 leading-relaxed">
              <ShieldCheck size={14} className="inline mr-1 text-blue-300" />
              A safety backup of your active ledger will be created automatically before replacement.
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowImportConfirm(false);
                  setImportPreview(null);
                }}
                className="btn btn-ghost flex-1 text-xs !py-2.5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteImport}
                className="btn btn-primary flex-1 text-xs !py-2.5 font-medium"
              >
                Confirm & Restore
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
