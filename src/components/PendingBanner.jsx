import { AlertTriangle, Check, X } from 'lucide-react';
import { useState } from 'react';

export default function PendingBanner({ alarms, onResolve }) {
  const [expanded, setExpanded] = useState(false);

  if (!alarms || alarms.length === 0) return null;

  return (
    <div className="mx-5 mt-4 animate-fade-in">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full glass p-3.5 flex items-center gap-3 border-amber/30"
      >
        <div className="w-9 h-9 rounded-full bg-amber/15 flex items-center justify-center flex-shrink-0 animate-pulse-glow">
          <AlertTriangle size={18} className="text-amber" />
        </div>
        <div className="flex-1 text-left">
          <p className="text-sm font-semibold text-amber">{alarms.length} Pending Confirmation{alarms.length > 1 ? 's' : ''}</p>
          <p className="text-xs text-text-muted">Tap to review</p>
        </div>
      </button>

      {expanded && (
        <div className="mt-2 space-y-2 animate-fade-in">
          {alarms.map((alarm) => {
            const created = new Date(alarm.createdAt);
            const ago = Math.round((Date.now() - alarm.createdAt) / (1000 * 60 * 60));

            return (
              <div key={alarm.id} className="glass p-3.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {alarm.direction === 'gave' ? 'Gave' : 'Settled'} ₹{alarm.amount.toLocaleString('en-IN')} {alarm.direction === 'gave' ? 'to' : 'with'} {alarm.personName}
                  </p>
                  <p className="text-xs text-text-muted">
                    {ago < 1 ? 'Just now' : `${ago}h ago`} · Did they pay?
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => onResolve(alarm.id, true)}
                    className="w-9 h-9 rounded-full bg-green/15 flex items-center justify-center"
                    title="Confirmed — they paid"
                  >
                    <Check size={16} className="text-green" />
                  </button>
                  <button
                    onClick={() => onResolve(alarm.id, false)}
                    className="w-9 h-9 rounded-full bg-red/15 flex items-center justify-center"
                    title="Dismiss — not paid"
                  >
                    <X size={16} className="text-red" />
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
