import { AlertTriangle, Check, X } from 'lucide-react';
import { useState } from 'react';

export default function PendingBanner({ alarms, onResolve }) {
  const [expanded, setExpanded] = useState(false);

  if (!alarms || alarms.length === 0) return null;

  return (
    <div className="px-2 sm:px-0 mt-3 animate-fade-in">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full glass p-3.5 flex items-center gap-3 border border-amber-500/30 rounded-xl"
      >
        <div className="w-9 h-9 rounded-full bg-amber-500/15 flex items-center justify-center flex-shrink-0 animate-pulse-glow">
          <AlertTriangle size={18} className="text-amber-400" />
        </div>
        <div className="flex-1 text-left">
          <p className="text-sm font-semibold text-amber-300">{alarms.length} Pending Confirmation{alarms.length > 1 ? 's' : ''}</p>
          <p className="text-xs text-text-muted">Tap to review</p>
        </div>
      </button>

      {expanded && (
        <div className="mt-2 space-y-2 animate-fade-in">
          {alarms.map((alarm) => {
            const created = new Date(alarm.createdAt);
            const ago = Math.round((Date.now() - alarm.createdAt) / (1000 * 60 * 60));

            return (
              <div key={alarm.id} className="glass p-3.5 flex items-center gap-3 rounded-xl border border-[var(--border-color)]">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate text-text-primary">
                    {alarm.direction === 'gave' ? 'Gave' : 'Settled'} ₹{alarm.amount.toLocaleString('en-IN')} {alarm.direction === 'gave' ? 'to' : 'with'} {alarm.personName}
                  </p>
                  <p className="text-xs text-text-muted">
                    {ago < 1 ? 'Just now' : `${ago}h ago`} · Did they pay?
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => onResolve(alarm.id, true)}
                    className="w-9 h-9 rounded-full bg-emerald-500/15 flex items-center justify-center hover:bg-emerald-500/25 transition-colors"
                    title="Confirmed — they paid"
                    aria-label="Confirm paid"
                  >
                    <Check size={16} className="text-emerald-400" />
                  </button>
                  <button
                    onClick={() => onResolve(alarm.id, false)}
                    className="w-9 h-9 rounded-full bg-rose-500/15 flex items-center justify-center hover:bg-rose-500/25 transition-colors"
                    title="Dismiss — not paid"
                    aria-label="Dismiss alarm"
                  >
                    <X size={16} className="text-rose-400" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
