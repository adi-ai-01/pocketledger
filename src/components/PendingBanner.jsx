import { AlertTriangle, Check, X } from 'lucide-react';
import { useState } from 'react';

export default function PendingBanner({ alarms, onResolve }) {
  const [expanded, setExpanded] = useState(false);

  if (!alarms || alarms.length === 0) return null;

  return (
    <div className="mt-3 animate-fade-in">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-3.5 flex items-center gap-3 bg-secondary/80 border border-amber-500/30 rounded-xl hover:bg-secondary transition-colors"
      >
        <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
          <AlertTriangle size={16} className="text-amber-400" />
        </div>
        <div className="flex-1 text-left min-w-0">
          <p className="text-sm font-semibold text-text-primary truncate">
            {alarms.length} Pending Confirmation{alarms.length > 1 ? 's' : ''}
          </p>
          <p className="text-xs text-text-secondary">Tap to review</p>
        </div>
      </button>

      {expanded && (
        <div className="mt-2 space-y-2 animate-fade-in">
          {alarms.map((alarm) => {
            const ago = Math.round((Date.now() - alarm.createdAt) / (1000 * 60 * 60));
            const amtRupees = alarm.amount !== undefined ? alarm.amount : (alarm.amountPaise !== undefined ? alarm.amountPaise / 100 : 0);

            return (
              <div key={alarm.id} className="p-3.5 flex items-center gap-3 rounded-xl bg-secondary/60 border border-[var(--border-color)]">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate text-text-primary">
                    {alarm.direction === 'gave' ? 'Gave' : 'Settled'} ₹{amtRupees.toLocaleString('en-IN')} {alarm.direction === 'gave' ? 'to' : 'with'} {alarm.personName}
                  </p>
                  <p className="text-xs text-text-muted">
                    {ago < 1 ? 'Just now' : `${ago}h ago`} · Did they pay?
                  </p>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => onResolve(alarm.id, true)}
                    className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center hover:bg-emerald-500/25 transition-colors"
                    title="Confirmed — they paid"
                    aria-label="Confirm paid"
                  >
                    <Check size={15} className="text-emerald-400" />
                  </button>
                  <button
                    onClick={() => onResolve(alarm.id, false)}
                    className="w-8 h-8 rounded-lg bg-rose-500/15 flex items-center justify-center hover:bg-rose-500/25 transition-colors"
                    title="Dismiss — not paid"
                    aria-label="Dismiss alarm"
                  >
                    <X size={15} className="text-rose-400" />
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
