import { useState, useRef } from 'react';
import { Download, Upload, DollarSign, Info, Palette, Check, AlertTriangle, ShieldCheck, RotateCcw } from 'lucide-react';
import { useTheme } from '../context/ThemeContext.jsx';

export default function SettingsTab({
  settings,
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
}) {
  const { theme, setTheme, themes } = useTheme();
  const [budget, setBudget] = useState(String(settings.monthlyBudget || ''));
  const [importStatus, setImportStatus] = useState(null);
  const [migrationFeedback, setMigrationFeedback] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [rollbackStatus, setRollbackStatus] = useState(null);
  const fileRef = useRef();

  const handleBudgetSave = () => {
    const val = parseFloat(budget) || 0;
    onUpdate({ monthlyBudget: val });
  };

  const handleExportJSON = () => {
    const data = onExportJSON();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pocketledger-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = () => {
    const data = onExportCSV();
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
    const dataToSave = rawBackup || onExportJSON();
    const blob = new Blob([dataToSave], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pocketledger-v1-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = onImport(reader.result);
      setImportStatus(result.success ? 'Data restored successfully!' : `Error: ${result.error}`);
      setTimeout(() => setImportStatus(null), 3000);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleTogglePreview = () => {
    if (!showPreview && onPreviewMigration) {
      const p = onPreviewMigration();
      setPreviewData(p);
    }
    setShowPreview(!showPreview);
  };

  const handleMigration = () => {
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

  const handleRollback = () => {
    if (!onRollbackMigration) return;
    if (window.confirm('Are you sure you want to rollback to the Schema v1 backup? Any transactions created after migration will be replaced by the pre-migration snapshot.')) {
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

  const themeBadges = {
    fantasy: { colors: ['#121216', '#c5a059', '#152e22', '#3e181c'], icon: '🐺' },
    elden: { colors: ['#08080a', '#e5c158', '#e4d7be', '#5c4c23'], icon: '✨' },
    cyber: { colors: ['#060714', '#00f0ff', '#a855f7', '#f43f5e'], icon: '⚡' },
    pixel: { colors: ['#1e1e1e', '#55ff55', '#4a3319', '#ffaa00'], icon: '⛏️' },
  };

  return (
    <div className="animate-fade-in transition-all duration-300">
      <header className="px-5 pt-6 pb-4">
        <h1 className="text-xl font-bold">Settings</h1>
      </header>

      <div className="px-5 space-y-4 mb-6">
        {/* ── Controlled Migration Banner (Schema Upgrade Available) ── */}
        {migrationStatus === 'AVAILABLE' && (
          <div className="theme-card p-5 border border-amber-500/40 bg-amber-500/10">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <AlertTriangle size={18} className="text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-semibold text-text-primary">Database Upgrade Available</h2>
                <p className="text-xs text-text-muted mt-1 leading-relaxed">
                  Upgrade your data to the Canonical v2 Financial Engine. Enables exact integer-paise accounting, repayment conservation, and ledger auditability.
                </p>

                {showPreview && previewData && (
                  <div className="mt-3 p-3 rounded-lg bg-black/20 text-xs space-y-1.5 border border-white/5">
                    <p className="font-semibold text-text-primary">Migration Summary:</p>
                    <p className="text-text-muted">Transactions to convert: {previewData.transactionCount}</p>
                    <p className="text-text-muted">People in directory: {previewData.peopleCount}</p>
                    {previewData.warnings && previewData.warnings.length > 0 && (
                      <p className="text-amber-400">Notice: {previewData.warnings.length} items flagged for review.</p>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 mt-3.5">
                  <button
                    onClick={handleMigration}
                    className="btn btn-primary text-xs px-3.5 py-1.5 flex items-center gap-1.5"
                  >
                    <ShieldCheck size={14} /> Upgrade Now
                  </button>
                  <button
                    onClick={handleTogglePreview}
                    className="btn btn-ghost text-xs px-3 py-1.5"
                  >
                    {showPreview ? 'Hide Preview' : 'View Preview'}
                  </button>
                  <button
                    onClick={handleDownloadV1Backup}
                    className="btn btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5 text-text-muted hover:text-text-primary"
                  >
                    <Download size={13} /> Download v1 Backup
                  </button>
                </div>

                {migrationFeedback && (
                  <p className={`text-xs mt-3 ${migrationFeedback.type === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>
                    {migrationFeedback.text}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Universal Theme Switcher (Step 2 & Step 4) ── */}
        <div className="theme-card p-5">
          <div className="flex items-center gap-2 mb-3.5">
            <Palette size={18} className="text-accent" />
            <h2 className="text-sm font-semibold">Visual Theme</h2>
          </div>
          <p className="text-xs text-text-muted mb-3 leading-relaxed">
            Select a custom aesthetic theme with curated colors, fonts, and iconography.
          </p>

          <div className="grid grid-cols-2 gap-3">
            {themes.map((t) => {
              const isSelected = theme === t.id;
              const badge = themeBadges[t.id];
              return (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all active:scale-95 ${
                    isSelected
                      ? 'border-accent bg-accent/15 shadow-[0_0_12px_var(--accent-glow)]'
                      : 'border-[var(--border-color)] bg-secondary/60 hover:border-accent/40'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-base">{badge?.icon}</span>
                    {isSelected && (
                      <span className="w-4 h-4 rounded-full bg-accent flex items-center justify-center text-[10px] text-white">
                        <Check size={11} strokeWidth={3} />
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-text-primary">{t.name}</p>
                    <p className="text-[10px] text-text-muted mt-0.5 line-clamp-1">{t.desc}</p>
                  </div>
                  {/* Color Swatch Preview */}
                  <div className="flex gap-1 mt-2.5">
                    {badge?.colors.map((c, i) => (
                      <span
                        key={i}
                        className="w-3.5 h-3.5 rounded-full border border-black/30"
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Monthly Budget */}
        <div className="theme-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <DollarSign size={16} className="text-accent" />
            <h2 className="text-sm font-semibold">Monthly Budget</h2>
          </div>
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="e.g. 15000"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              className="flex-1"
            />
            <button onClick={handleBudgetSave} className="btn btn-primary px-5">Save</button>
          </div>
        </div>

        {/* Backup & Restore */}
        <div className="theme-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Download size={16} className="text-accent" />
            <h2 className="text-sm font-semibold">Backup & Restore</h2>
          </div>
          <div className="space-y-2.5">
            <button onClick={handleExportJSON} className="btn btn-ghost w-full text-sm">
              <Download size={16} /> Export JSON Backup
            </button>
            <button onClick={handleExportCSV} className="btn btn-ghost w-full text-sm">
              <Download size={16} /> Export CSV
            </button>
            <button onClick={() => fileRef.current?.click()} className="btn btn-ghost w-full text-sm">
              <Upload size={16} /> Restore from Backup
            </button>
            <input ref={fileRef} type="file" accept=".json" onChange={handleImport} className="hidden" />

            {/* Rollback to pre-migration snapshot if available */}
            {hasRollbackBackup && (
              <div className="pt-2 border-t border-[var(--border-color)] space-y-2">
                <button
                  onClick={handleDownloadV1Backup}
                  className="btn btn-ghost w-full text-xs text-text-muted hover:text-text-primary"
                >
                  <Download size={14} /> Download Pre-Migration v1 Backup
                </button>
                <button
                  onClick={handleRollback}
                  className="btn btn-ghost w-full text-xs text-red-400 hover:text-red-300 border border-red-500/20"
                >
                  <RotateCcw size={14} /> Rollback to Schema v1 Backup
                </button>
              </div>
            )}
          </div>
          {importStatus && (
            <p className={`text-xs mt-2 ${importStatus.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}>
              {importStatus}
            </p>
          )}
          {rollbackStatus && (
            <p className={`text-xs mt-2 ${rollbackStatus.startsWith('Rollback failed') ? 'text-red-400' : 'text-emerald-400'}`}>
              {rollbackStatus}
            </p>
          )}
        </div>

        {/* About */}
        <div className="theme-card p-5">
          <div className="flex items-center gap-2 mb-2">
            <Info size={16} className="text-accent" />
            <h2 className="text-sm font-semibold">About</h2>
          </div>
          <p className="text-xs text-text-muted leading-relaxed">
            PocketLedger v2.0 — Offline-first expense & lending tracker PWA.
            All data is stored locally on your device.
          </p>
          <div className="mt-3 pt-3 border-t border-[var(--border-color)] text-xs text-text-muted space-y-1">
            <p className="flex items-center gap-1.5 font-medium text-text-primary">
              <ShieldCheck size={14} className="text-accent" />
              Engine: {migrationStatus === 'COMPLETED' ? 'Canonical v2 (Integer-paise Precision)' : 'Schema v1 (Legacy Mode)'}
            </p>
            <p>
              {migrationStatus === 'COMPLETED'
                ? 'All transactions and balance derivations are verified by the integer-paise financial engine.'
                : 'Domino state engine active. Upgrade to v2 available above.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
