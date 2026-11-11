import { useState, useEffect } from 'react';
import { X, User, Users, ArrowUpRight, ArrowDownLeft, CheckCircle2 } from 'lucide-react';
import {
  isEditMode,
  resolveSheetAction,
  normalizeEditTxn,
  resolveSheetTitle,
} from '../domain/transaction-routing.js';
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
  const isEdit = isEditMode(editTxn);
  const normalizedEditTxn = isEdit ? normalizeEditTxn(editTxn, people) : null;
  const prefillData = !isEdit && editTxn ? editTxn : null;

  const [currentAction, setCurrentAction] = useState(() => resolveSheetAction(type, editTxn));

  // Sync if type or editTxn changes
  useEffect(() => {
    setCurrentAction(resolveSheetAction(type, editTxn));
  }, [type, editTxn]);

  const actionMeta = TRANSACTION_ACTIONS.find((a) => a.id === currentAction);
  const ActionIcon = actionMeta?.icon;

  const title = resolveSheetTitle(currentAction, isEdit);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="bottom-sheet max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="handle" />

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            {ActionIcon && (
              <ActionIcon size={20} className="text-accent flex-shrink-0" />
            )}
            <h2 className="text-lg font-semibold text-text-primary">
              {title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-secondary/40 transition-colors"
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
            editTxn={normalizedEditTxn}
            initialAmount={prefillData?.amount}
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
            editTxn={normalizedEditTxn}
            initialPerson={prefillData?.person}
            initialAmount={prefillData?.amount}
            people={people}
            balances={balances}
            categories={categories}
            settings={settings}
            store={store}
            onSave={onSave}
            onBack={isEdit ? null : () => setCurrentAction(null)}
          />
        )}

        {/* View 4: Lend / Borrow Form */}
        {(currentAction === 'lend' || currentAction === 'borrow') && (
          <LendBorrowForm
            initialDirection={currentAction}
            initialPerson={prefillData?.person}
            initialAmount={prefillData?.amount}
            editTxn={normalizedEditTxn}
            people={people}
            balances={balances}
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
            initialPerson={normalizedEditTxn?.person || prefillData?.person || ''}
            initialAmount={normalizedEditTxn?.amount ?? prefillData?.amount ?? ''}
            editTxn={normalizedEditTxn}
            people={people}
            balances={balances}
            categories={categories}
            settings={settings}
            store={store}
            onSave={onSave}
            onBack={isEdit || type === 'settle' || type === 'repayment' ? null : () => setCurrentAction(null)}
          />
        )}
      </div>
    </div>
  );
}
