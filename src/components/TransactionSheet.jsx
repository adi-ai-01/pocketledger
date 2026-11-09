import { useState, useEffect } from 'react';
import { X, User, Users, ArrowUpRight, ArrowDownLeft, CheckCircle2 } from 'lucide-react';
import ActionSelector, { TRANSACTION_ACTIONS } from './transaction/ActionSelector.jsx';
import PersonalExpenseForm from './transaction/PersonalExpenseForm.jsx';
import SharedExpenseForm from './transaction/SharedExpenseForm.jsx';
import LendBorrowForm from './transaction/LendBorrowForm.jsx';
import RepaymentForm from './transaction/RepaymentForm.jsx';

export default function TransactionSheet({
  type,
  editTxn,
  people = [],
  categories = [],
  settings = {},
  balances = {},
  store,
  onSave,
  onClose,
  onAddPendingAlarm,
}) {
  const isEdit = !!editTxn;

  // Determine starting view:
  // If editing: detect action from transaction fields
  // If creating: if type is 'settle', go straight to repayment; if other legacy types, show action selector or direct view
  const determineInitialAction = () => {
    if (editTxn) {
      if (editTxn.action) return editTxn.action;
      if (editTxn.type === 'split' || editTxn.splits?.length > 0) return 'shared_expense';
      if (editTxn.type === 'settle') return 'repayment';
      if (editTxn.type === 'take') return 'borrow';
      if (editTxn.type === 'give') {
        return editTxn.person ? 'lend' : 'personal_expense';
      }
      return 'personal_expense';
    }

    if (type === 'settle' || type === 'repayment') return 'repayment';
    if (type === 'personal_expense') return 'personal_expense';
    if (type === 'shared_expense' || type === 'split') return 'shared_expense';
    if (type === 'lend') return 'lend';
    if (type === 'borrow') return 'borrow';

    // Default to selector for clear entry point
    return null;
  };

  const [currentAction, setCurrentAction] = useState(determineInitialAction);

  // Sync if type or editTxn changes
  useEffect(() => {
    setCurrentAction(determineInitialAction());
  }, [type, editTxn]);

  const actionMeta = TRANSACTION_ACTIONS.find((a) => a.id === currentAction);
  const ActionIcon = actionMeta?.icon;

  const getTitle = () => {
    if (isEdit) return `Edit ${actionMeta?.title || 'Transaction'}`;
    if (!currentAction) return 'New Transaction';
    return actionMeta?.title || 'New Transaction';
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="bottom-sheet max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="handle" />

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {ActionIcon && (
              <div className="w-7 h-7 rounded-lg bg-accent/15 flex items-center justify-center text-accent">
                <ActionIcon size={16} />
              </div>
            )}
            <h2 className="text-lg font-bold text-text-primary">
              {getTitle()}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-secondary transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* View 1: 5-Action Selector Entry Point */}
        {!currentAction && (
          <ActionSelector onSelectAction={(actId) => setCurrentAction(actId)} />
        )}

        {/* View 2: Personal Expense Form */}
        {currentAction === 'personal_expense' && (
          <PersonalExpenseForm
            editTxn={editTxn}
            people={people}
            categories={categories}
            settings={settings}
            onSave={onSave}
            onBack={isEdit ? null : () => setCurrentAction(null)}
          />
        )}

        {/* View 3: Shared Expense Form */}
        {currentAction === 'shared_expense' && (
          <SharedExpenseForm
            editTxn={editTxn}
            people={people}
            categories={categories}
            settings={settings}
            onSave={onSave}
            onBack={isEdit ? null : () => setCurrentAction(null)}
          />
        )}

        {/* View 4: Lend / Borrow Form */}
        {(currentAction === 'lend' || currentAction === 'borrow') && (
          <LendBorrowForm
            initialDirection={currentAction}
            editTxn={editTxn}
            people={people}
            categories={categories}
            settings={settings}
            store={store}
            onSave={onSave}
            onBack={isEdit ? null : () => setCurrentAction(null)}
          />
        )}

        {/* View 5: Repayment Form */}
        {currentAction === 'repayment' && (
          <RepaymentForm
            initialPerson={editTxn?.person || (type === 'settle' ? editTxn?.person : '')}
            initialAmount={editTxn?.amount}
            editTxn={editTxn}
            people={people}
            balances={balances}
            categories={categories}
            settings={settings}
            store={store}
            onSave={onSave}
            onBack={isEdit || type === 'settle' ? null : () => setCurrentAction(null)}
          />
        )}
      </div>
    </div>
  );
}
