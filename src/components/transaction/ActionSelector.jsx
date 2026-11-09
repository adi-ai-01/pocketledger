import { User, Users, ArrowUpRight, ArrowDownLeft, CheckCircle2 } from 'lucide-react';

export const TRANSACTION_ACTIONS = [
  {
    id: 'personal_expense',
    title: 'Personal Expense',
    description: "Only your spending — paid by you or covered by someone else.",
    effect: 'Affects Personal Budget',
    icon: User,
    color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  },
  {
    id: 'shared_expense',
    title: 'Shared Expense',
    description: 'Split a group bill — you or another friend paid the merchant.',
    effect: 'Affects Budget & Receivables',
    icon: Users,
    color: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  },
  {
    id: 'lend',
    title: 'Lend Money',
    description: 'You gave money to someone — they owe you.',
    effect: 'Increases Peer Balance (They Owe)',
    icon: ArrowUpRight,
    color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  },
  {
    id: 'borrow',
    title: 'Borrow Money',
    description: 'You received money from someone — you owe them.',
    effect: 'Decreases Peer Balance (You Owe)',
    icon: ArrowDownLeft,
    color: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
  },
  {
    id: 'repayment',
    title: 'Record Repayment',
    description: 'Clear or partially pay down an existing outstanding debt.',
    effect: 'Reduces Outstanding Balance',
    icon: CheckCircle2,
    color: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  },
];

export default function ActionSelector({ onSelectAction }) {
  return (
    <div className="space-y-2.5 animate-fade-in">
      <p className="text-xs text-text-muted mb-2">
        Select the financial action that describes this transaction:
      </p>

      <div className="grid gap-2.5">
        {TRANSACTION_ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              onClick={() => onSelectAction(action.id)}
              className="w-full text-left p-3.5 rounded-xl border border-[var(--border-color)] bg-secondary/50 hover:bg-secondary/80 hover:border-accent/40 transition-all active:scale-[0.99] flex items-center gap-3.5 group"
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border ${action.color}`}>
                <Icon size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-text-primary group-hover:text-accent transition-colors">
                    {action.title}
                  </h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-text-muted border border-white/5 whitespace-nowrap">
                    {action.effect}
                  </span>
                </div>
                <p className="text-xs text-text-muted mt-0.5 leading-snug line-clamp-2">
                  {action.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

