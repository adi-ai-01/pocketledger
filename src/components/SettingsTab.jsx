import { useState, useRef } from 'react';
import { Download, Upload, DollarSign, Info, Palette, Check } from 'lucide-react';
import { useTheme } from '../context/ThemeContext.jsx';

export default function SettingsTab({ settings, onUpdate, onExportJSON, onExportCSV, onImport }) {
  const { theme, setTheme, themes } = useTheme();
  const [budget, setBudget] = useState(String(settings.monthlyBudget || ''));
  const [importStatus, setImportStatus] = useState(null);
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
          </div>
          {importStatus && (
            <p className={`text-xs mt-2 ${importStatus.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}>
              {importStatus}
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
            PocketLedger v1.0 — Offline-first expense & lending tracker PWA.
            All data is stored locally on your device.
          </p>
          <p className="text-xs text-text-muted mt-2 leading-relaxed">
            Domino State Engine: All balances and analytics are dynamically computed
            from your transaction history.
          </p>
        </div>
      </div>
    </div>
  );
}
