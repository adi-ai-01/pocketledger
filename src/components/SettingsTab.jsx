import { useState, useRef } from 'react';
import {
  Palette,
  Check,
  DollarSign,
  Download,
  Upload,
  AlertTriangle,
  ShieldCheck,
  RotateCcw,
  Info,
  Clock,
  FileText,
  AlertCircle,
  HelpCircle,
  CheckCircle2,
  X,
  Coins,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext.jsx';

const CURRENCY_OPTIONS = ['₹', '$', '€', '£', '¥', 'AED', 'CAD', 'AUD'];

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
  const { theme, setTheme, themes } = useTheme();

  // Preferences State
  const [currency, setCurrency] = useState(settings.currency || '₹');
  const [budget, setBudget] = useState(String(settings.monthlyBudget || ''));
  const [prefSavedMessage, setPrefSavedMessage] = useState(null);

  // Import State
  const [importPreview, setImportPreview] = useState(null); // { isValid, preview, parsed, rawJson }
  const [importStatus, setImportStatus] = useState(null);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const fileRef = useRef();

  // Migration State
  const [migrationFeedback, setMigrationFeedback] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [showMigrationPreview, setShowMigrationPreview] = useState(false);
  const [rollbackStatus, setRollbackStatus] = useState(null);

  // Review Items State
  const attentionData = store?.getAttentionItems ? store.getAttentionItems() : null;
  const pendingAlarms = store?.state?.pendingAlarms || [];
  const migratedAlarms = (store?.state?.pendingReviews?.migratedAlarms || []).filter(
    (a) => a.reviewStatus === 'PENDING_USER_REVIEW'
  );
  const unclassifiedEvents = (store?.state?.transactions || []).filter(
    (t) => t.kind === 'LEGACY_UNCLASSIFIED' && t.reviewRequired
  );

  const themePalettes = {
    fantasy: ['#0b0d12', '#60a5fa', '#242c3d'],
    elden: ['#0a0a0c', '#d4af37', '#2d2a22'],
    cyber: ['#070913', '#38bdf8', '#818cf8'],
    pixel: ['#121214', '#22c55e', '#2a2a30'],
  };

  // ── Handlers: Preferences ──
  const handleSavePreferences = () => {
    const parsedBudget = parseFloat(budget) || 0;
    if (onUpdate) {
      onUpdate({
        currency,
        monthlyBudget: Math.max(0, parsedBudget),
      });
    }
    setPrefSavedMessage('Preferences updated successfully!');
    setTimeout(() => setPrefSavedMessage(null), 3000);
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
    a.download = `pocketledger-v1-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Handlers: Safe Import with Validation & Confirmation ──
  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const jsonContent = reader.result;
      const val = store?.previewImport
        ? store.previewImport(jsonContent)
        : { isValid: true, preview: { schemaVersion: 2, transactionCount: 0, peopleCount: 0, warnings: [] }, parsed: null };

      if (!val.isValid) {
        setImportStatus({ type: 'error', text: `Import validation failed: ${val.error}` });
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
        text: res.message || 'Data restored successfully! Pre-import snapshot safely retained.',
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
        setImportStatus({ type: 'success', text: 'Restored pre-import snapshot successfully.' });
      } else {
        setImportStatus({ type: 'error', text: res.error || 'Failed to rollback' });
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
          text: 'Upgrade complete! Your database is now operating with the Canonical v2 Financial Engine.',
        });
      } else {
        setMigrationFeedback({
          type: 'error',
          text: `Upgrade failed: ${res.error}`,
        });
      }
    } catch (err) {
      setMigrationFeedback({
        type: 'error',
        text: `Upgrade error: ${err.message}`,
      });
    }
  };

  const handleRollbackV1 = () => {
    if (!onRollbackMigration) return;
    if (window.confirm('Are you sure you want to rollback to the Schema v1 snapshot? Any transactions created after migration will be replaced by the pre-migration snapshot.')) {
      const res = onRollbackMigration();
      if (res.success) {
        setRollbackStatus('Database restored to Schema v1 snapshot successfully.');
        setTimeout(() => setRollbackStatus(null), 4000);
      } else {
        setRollbackStatus(`Rollback failed: ${res.error}`);
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
    <div className="animate-fade-in transition-all duration-300 pb-16">
      <header className="px-2 sm:px-0 pt-5 pb-4">
        <h1 className="text-xl font-bold tracking-tight text-text-primary">Settings</h1>
        <p className="text-xs text-text-muted mt-0.5">Preferences, backups, and migration recovery</p>
      </header>

      <div className="px-2 sm:px-0 space-y-4">
        {/* ── SECTION 1: PREFERENCES ── */}
        <div className="theme-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Coins size={16} className="text-accent" />
            <h2 className="text-xs font-bold text-accent uppercase tracking-wider">
              Preferences
            </h2>
          </div>

          {/* Currency Selection */}
          <div className="space-y-1.5">
            <label className="text-xs text-text-muted block">Currency Symbol</label>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
              {CURRENCY_OPTIONS.map((sym) => (
                <button
                  key={sym}
                  type="button"
                  onClick={() => setCurrency(sym)}
                  className={`py-2 rounded-xl border text-xs font-bold transition-all ${
                    currency === sym
                      ? 'border-accent bg-accent/20 text-text-primary'
                      : 'border-[var(--border-color)] bg-secondary/40 text-text-muted hover:border-accent/40'
                  }`}
                >
                  {sym}
                </button>
              ))}
            </div>
          </div>

          {/* Monthly Budget */}
          <div className="space-y-1.5">
            <label className="text-xs text-text-muted block">Monthly Consumption Budget ({currency})</label>
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="e.g. 15000 (0 for no limit)"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                className="flex-1 !py-2.5 !text-sm"
              />
              <button
                type="button"
                onClick={handleSavePreferences}
                className="btn btn-primary px-4 text-xs font-semibold"
              >
                Save
              </button>
            </div>
            <p className="text-[10px] text-text-muted">
              Applies only to your personal consumption. Gross lending and transfers are excluded.
            </p>
          </div>

          {prefSavedMessage && (
            <p className="text-xs text-emerald-400 bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/20">
              {prefSavedMessage}
            </p>
          )}

          {/* Visual Theme Selector */}
          <div className="space-y-2 pt-2 border-t border-[var(--border-color)]/60">
            <div className="flex items-center gap-1.5">
              <Palette size={14} className="text-accent" />
              <span className="text-xs font-bold text-text-secondary">Visual Theme</span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {themes.map((t) => {
                const isSelected = theme === t.id;
                const palette = themePalettes[t.id] || [];
                return (
                  <button
                    key={t.id}
                    onClick={() => setTheme(t.id)}
                    className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all active:scale-95 ${
                      isSelected
                        ? 'border-accent bg-accent/15'
                        : 'border-[var(--border-color)] bg-secondary/40 hover:border-accent/40'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex gap-1.5">
                        {palette.map((color, i) => (
                          <span
                            key={i}
                            className="w-3 h-3 rounded-full border border-black/20"
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                      {isSelected && (
                        <span className="w-4 h-4 rounded-full bg-accent flex items-center justify-center text-[10px] text-white">
                          <Check size={11} strokeWidth={3} />
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-text-primary">{t.name}</p>
                      <p className="text-[10px] text-text-muted line-clamp-1">{t.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── SECTION 2: DATA MANAGEMENT & BACKUPS ── */}
        <div className="theme-card p-5 space-y-3.5">
          <div className="flex items-center gap-2">
            <Download size={16} className="text-accent" />
            <h2 className="text-xs font-bold text-accent uppercase tracking-wider">
              Data Management
            </h2>
          </div>
          <p className="text-xs text-text-muted leading-relaxed">
            All data resides offline in your device storage. You can export complete backups anytime.
          </p>

          <div className="space-y-2">
            <button
              onClick={handleExportJSON}
              className="btn btn-ghost w-full text-xs py-2.5 flex items-center justify-center gap-2 border border-[var(--border-color)]"
            >
              <Download size={14} /> Export JSON Ledger Backup
            </button>

            <button
              onClick={handleExportCSV}
              className="btn btn-ghost w-full text-xs py-2.5 flex items-center justify-center gap-2 border border-[var(--border-color)]"
            >
              <FileText size={14} /> Export CSV Spreadsheet
            </button>

            <button
              onClick={() => fileRef.current?.click()}
              className="btn btn-primary w-full text-xs py-2.5 flex items-center justify-center gap-2 font-semibold"
            >
              <Upload size={14} /> Import & Restore Backup
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          {/* Pre-import Rollback if safety backup exists */}
          {store?.hasPreImportBackup && store.hasPreImportBackup() && (
            <div className="pt-2 border-t border-[var(--border-color)] space-y-1">
              <button
                onClick={handleRollbackPreImport}
                className="btn btn-ghost w-full text-xs py-2 text-text-muted hover:text-text-primary border border-white/5"
              >
                <RotateCcw size={13} /> Restore Pre-Import Safety Snapshot
              </button>
            </div>
          )}

          {importStatus && (
            <p className={`text-xs p-2.5 rounded-lg border ${
              importStatus.type === 'error'
                ? 'bg-red-500/10 text-red-400 border-red-500/20'
                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
            }`}>
              {importStatus.text}
            </p>
          )}
        </div>

        {/* ── SECTION 3: MIGRATION & DISASTER RECOVERY ── */}
        <div className="theme-card p-5 space-y-3.5">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-accent" />
            <h2 className="text-xs font-bold text-accent uppercase tracking-wider">
              Financial Engine & Recovery
            </h2>
          </div>

          <div className="p-3.5 rounded-xl bg-secondary/50 border border-[var(--border-color)] space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-text-primary">Engine Architecture</span>
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                migrationStatus === 'COMPLETED'
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                  : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
              }`}>
                {migrationStatus === 'COMPLETED' ? 'Canonical v2' : 'Schema v1 Active'}
              </span>
            </div>
            <p className="text-[11px] text-text-muted leading-relaxed">
              {migrationStatus === 'COMPLETED'
                ? 'All financial calculations execute with exact integer-paise precision, chronological repayment validation, and conservation invariants.'
                : 'Your database is currently running legacy schema v1. An automated, non-destructive upgrade to canonical v2 is ready.'}
            </p>
          </div>

          {/* Upgrade Banner when v1 is active */}
          {migrationStatus === 'AVAILABLE' && (
            <div className="p-4 rounded-xl border border-amber-500/40 bg-amber-500/10 space-y-3">
              <div className="flex items-center gap-2 text-amber-300 text-xs font-bold">
                <AlertTriangle size={15} /> Database Upgrade Ready
              </div>
              <p className="text-[11px] text-amber-200/90 leading-relaxed">
                Upgrading converts transactions into canonical events with exact integer precision. A pre-migration backup is automatically verified before state modification.
              </p>

              {showMigrationPreview && previewData && (
                <div className="p-3 rounded-lg bg-black/30 text-xs space-y-1 border border-white/5">
                  <p className="text-text-muted">Transactions to convert: {previewData.transactionCount}</p>
                  <p className="text-text-muted">Directory counterparties: {previewData.peopleCount}</p>
                  {previewData.warnings?.length > 0 && (
                    <p className="text-amber-400">{previewData.warnings.length} items flagged for review.</p>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleExecuteMigration}
                  className="btn btn-primary text-xs py-2 px-3 font-semibold flex items-center gap-1.5"
                >
                  <ShieldCheck size={14} /> Upgrade Now
                </button>
                <button
                  onClick={handleToggleMigrationPreview}
                  className="btn btn-ghost text-xs py-2 px-3 border border-[var(--border-color)]"
                >
                  {showMigrationPreview ? 'Hide Preview' : 'View Preview'}
                </button>
                <button
                  onClick={handleDownloadV1Backup}
                  className="btn btn-ghost text-xs py-2 px-3 text-text-muted hover:text-text-primary"
                >
                  <Download size={13} /> Download v1 Backup
                </button>
              </div>

              {migrationFeedback && (
                <p className={`text-xs ${migrationFeedback.type === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>
                  {migrationFeedback.text}
                </p>
              )}
            </div>
          )}

          {/* Rollback Options when v1 backup is retained */}
          {hasRollbackBackup && (
            <div className="space-y-2 pt-2 border-t border-[var(--border-color)]">
              <button
                onClick={handleDownloadV1Backup}
                className="btn btn-ghost w-full text-xs py-2 text-text-muted hover:text-text-primary border border-white/5"
              >
                <Download size={13} /> Download Original Pre-Migration Backup
              </button>
              <button
                onClick={handleRollbackV1}
                className="btn btn-ghost w-full text-xs py-2 text-red-400 hover:text-red-300 border border-red-500/20"
              >
                <RotateCcw size={13} /> Rollback to Schema v1 Backup
              </button>
            </div>
          )}

          {rollbackStatus && (
            <p className="text-xs text-emerald-400 bg-emerald-500/10 p-2.5 rounded-lg border border-emerald-500/20">
              {rollbackStatus}
            </p>
          )}
        </div>

        {/* ── SECTION 4: LEGACY DATA REVIEW ── */}
        {(pendingAlarms.length > 0 || migratedAlarms.length > 0 || unclassifiedEvents.length > 0) && (
          <div className="theme-card p-5 space-y-3.5 border border-amber-500/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-amber-400" />
                <h2 className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                  Legacy Data Review Queue
                </h2>
              </div>
              <span className="text-[11px] font-bold text-amber-400">
                {pendingAlarms.length + migratedAlarms.length + unclassifiedEvents.length} items
              </span>
            </div>
            <p className="text-xs text-text-muted leading-relaxed">
              Historical records requiring user confirmation. Old Give/Take transactions are never silently inferred as expenses or loans.
            </p>

            <div className="space-y-2 pt-1">
              {/* Alarms awaiting review */}
              {[...pendingAlarms, ...migratedAlarms].map((alarm) => (
                <div
                  key={alarm.id}
                  className="p-3 rounded-xl bg-secondary/40 border border-[var(--border-color)] flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-bold text-text-primary truncate">
                      {alarm.personName || 'Contact'}: {currency}{alarm.amount || (alarm.amountPaise ? alarm.amountPaise / 100 : 0)}
                    </p>
                    <p className="text-[10px] text-text-muted">
                      Alarm record: {alarm.direction === 'settled' ? 'Settlement intent' : 'Lending intent'}
                    </p>
                  </div>
                  <button
                    onClick={() => handleResolveAlarm(alarm.id)}
                    className="btn btn-ghost text-xs py-1 px-2.5 border border-[var(--border-color)] text-text-muted hover:text-text-primary"
                  >
                    Dismiss
                  </button>
                </div>
              ))}

              {/* Unclassified events */}
              {unclassifiedEvents.map((evt) => (
                <div
                  key={evt.id}
                  className="p-3 rounded-xl bg-secondary/40 border border-[var(--border-color)] flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-bold text-text-primary truncate">
                      {evt.description || 'Historical Record'}: {currency}{evt.amountPaise / 100}
                    </p>
                    <p className="text-[10px] text-text-muted">
                      Type: {evt.legacyType} · Date: {evt.date}
                    </p>
                  </div>
                  <button
                    onClick={() => handleMarkTransactionReviewed(evt.id)}
                    className="btn btn-ghost text-xs py-1 px-2.5 border border-amber-500/30 text-amber-300 hover:bg-amber-500/10"
                  >
                    Mark Reviewed
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── SECTION 5: ABOUT ── */}
        <div className="theme-card p-5 space-y-2">
          <div className="flex items-center gap-2">
            <Info size={16} className="text-accent" />
            <h2 className="text-xs font-bold text-accent uppercase tracking-wider">
              About PocketLedger
            </h2>
          </div>
          <p className="text-xs text-text-muted leading-relaxed">
            PocketLedger v2.0 — Offline-first personal expense tracker & peer ledger.
            Engineered with strict zero-loss integer-paise accounting and verifiable repayment conservation.
          </p>
        </div>
      </div>

      {/* ── Import Confirmation & Preview Modal ── */}
      {showImportConfirm && importPreview && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-card border border-[var(--border-color)] rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-text-primary">Confirm Ledger Import</h3>
              <button
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
                <span className="text-text-muted">Schema Version</span>
                <span className="font-bold text-text-primary">v{importPreview.preview.schemaVersion}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Transactions to Import</span>
                <span className="font-bold text-text-primary">{importPreview.preview.transactionCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">People in Directory</span>
                <span className="font-bold text-text-primary">{importPreview.preview.peopleCount}</span>
              </div>
            </div>

            {importPreview.preview.warnings.length > 0 && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 space-y-1">
                <p className="font-bold">Warnings:</p>
                {importPreview.preview.warnings.map((w, idx) => (
                  <p key={idx} className="text-[11px] leading-snug">{w}</p>
                ))}
              </div>
            )}

            <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-200 leading-relaxed">
              <ShieldCheck size={14} className="inline mr-1 text-blue-300" />
              A safety backup of your active ledger data will be created automatically before replacement.
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => {
                  setShowImportConfirm(false);
                  setImportPreview(null);
                }}
                className="btn btn-ghost flex-1 text-xs py-2.5"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteImport}
                className="btn btn-primary flex-1 text-xs py-2.5 font-semibold"
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
