import { User, Users, ArrowUpRight, ArrowDownLeft, CheckCircle2, ChevronRight } from 'lucide-react';

export const TRANSACTION_ACTIONS = [
  {
    id: 'personal_expense',
    title: 'Personal Expense',
    description: 'Direct personal spending for yourself.',
    icon: User,
  },
  {
    id: 'shared_expense',
    title: 'Shared Expense',
    description: 'Split a shared bill among contacts.',
    icon: Users,
  },
  {
    id: 'lend',
    title: 'Lend Money',
    description: 'Money you lent to a contact.',
    icon: ArrowUpRight,
  },
  {
    id: 'borrow',
    title: 'Borrow Money',
    description: 'Money you borrowed from a contact.',
    icon: ArrowDownLeft,
  },
  {
    id: 'repayment',
    title: 'Record Repayment',
    description: 'Settle or pay down an outstanding balance.',
    icon: CheckCircle2,
  },
];

export default function ActionSelector({ onSelectAction }) {
  return (
    <div className="space-y-2 animate-fade-in">
      <p className="text-xs text-text-secondary mb-3">
        Select transaction type:
      </p>

      <div className="divide-y divide-[var(--border-color)]/60 border-y border-[var(--border-color)]/60">
        {TRANSACTION_ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              onClick={() => onSelectAction(action.id)}
              className="w-full h-[60px] flex items-center justify-between text-left hover:bg-secondary/30 transition-colors px-1 group"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <Icon size={18} className="text-text-muted group-hover:text-accent transition-colors flex-shrink-0" />
                <div className="min-w-0">
                  <h3 className="text-[15px] font-medium text-text-primary group-hover:text-accent transition-colors truncate">
                    {action.title}
                  </h3>
                  <p className="text-xs text-text-muted truncate">
                    {action.description}
                  </p>
                </div>
              </div>
              <ChevronRight size={18} className="text-text-muted group-hover:text-accent transition-colors flex-shrink-0 ml-2" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
