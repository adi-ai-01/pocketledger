# PocketLedger Architecture & Domain Engine

This document details the architectural design, financial accounting principles, and codebase structure of PocketLedger for developers and contributors.

---

## 1. High-Level System Architecture

PocketLedger is built with a strict separation between **pure, headless financial domain logic** and **React user interface components**:

```
pocketledger/
├── public/
│   ├── sw.js                 # Offline PWA service worker with Cache Storage
│   └── manifest.json         # Web App Manifest
├── src/
│   ├── domain/               # Pure domain modules (Zero UI dependencies, 100% testable)
│   │   ├── ledger.js         # Canonical v2 ledger primitives, invariants & validators
│   │   ├── store-core.js     # Headless storage state manager & business transaction orchestrator
│   │   ├── migrate-v1-to-v2.js # Bi-directional schema migration & rollback engine
│   │   ├── transaction-routing.js # Sheet routing, action derivation & event normalizer
│   │   └── upi-qr.js         # UPI URI parsing, phone cleaning & Google Pay handoff helpers
│   ├── components/           # React 19 UI presentation components
│   │   ├── HomeTab.jsx       # Overview, monthly personal spending & net peer balance hero
│   │   ├── PeopleTab.jsx     # Directory, contact search, balances & contact archival
│   │   ├── PersonDetailView.jsx # Person transaction timeline & individual settlements
│   │   ├── HistoryTab.jsx    # Complete activity stream & category filtering
│   │   ├── SettingsTab.jsx   # Currency, monthly budget, backup import/export & v1->v2 migration
│   │   ├── TransactionSheet.jsx # Bottom sheet container for creation & editing
│   │   ├── PendingBanner.jsx # Top-level alert banner for legacy pending review alarms
│   │   └── transaction/      # Specialized action forms & input sub-components
│   │       ├── ActionSelector.jsx          # Action launcher for the 5 transaction journeys
│   │       ├── PersonalExpenseForm.jsx     # Direct solo and counterparty-covered spending
│   │       ├── SharedExpenseForm.jsx       # Equal and custom split bill workflow
│   │       ├── LendBorrowForm.jsx          # Outgoing lending and incoming borrowing flows
│   │       ├── RepaymentForm.jsx           # Inflow/outflow debt settlements
│   │       ├── ContactPicker.jsx           # Universal contact search & inline creation
│   │       ├── PaymentRecipientResolver.jsx# Outgoing payment method & UPI/GPay resolution
│   │       ├── UpiModal.jsx                # UPI intent launcher & reconciliation modal
│   │       └── UnresolvedAttemptsBanner.jsx# Global reconciliation banner for pending payments
│   ├── store.js              # React hook (`useStore()`) wrapping the headless `StoreCore`
│   ├── App.jsx               # App container, global banners, tab navigation & modal host
│   └── main.jsx              # Vite React entry point
```

---

## 2. The Canonical Financial Ledger (`src/domain/ledger.js`)

PocketLedger enforces double-entry, integer-paise mathematical precision to guarantee that floating-point rounding errors cannot corrupt personal spending or debt records.

### A. The Integer-Paise Standard
All monetary figures stored in canonical v2 events are positive integers representing **Indian Paise** (1 Rupee = 100 Paise).
- ₹10.50 is stored as `1050`.
- All splits, additions, and subtractions operate strictly with integer math (`Math.round`, `Math.floor`, `allocateEqualShares`).
- Floating-point Rupee values are only produced at the UI boundary for user presentation and input.

### B. Canonical Event Kinds (`EVENT_KINDS`)
Every financial transaction in the canonical v2 ledger is an immutable record adhering to one of five event kinds:

1. **`EXPENSE`**:
   - Represents a consumer expenditure at a merchant.
   - Fields: `totalAmountPaise`, `userSharePaise`, `payerId`, `allocations: [{ personId, amountPaise }]`.
   - **Personal Expense**: When `allocations` is empty and `userSharePaise === totalAmountPaise`.
   - **Shared Expense**: When one party pays the merchant, and the bill is split among participants.

2. **`TRANSFER`**:
   - Direct transfer of money between the user (`PARTY_USER = 'USER'`) and a counterparty (`personId`).
   - Fields: `fromPartyId`, `toPartyId`, `amountPaise`.
   - **Lend Money**: `fromPartyId === 'USER'`, `toPartyId === personId`. Increases user receivable.
   - **Borrow Money**: `fromPartyId === personId`, `toPartyId === 'USER'`. Increases user liability.

3. **`REPAYMENT`**:
   - A directional financial settlement that decreases an existing outstanding balance between parties.
   - Fields: `fromPartyId`, `toPartyId`, `amountPaise`.
   - **Inflow Repayment**: Counterparty pays user, reducing a positive receivable.
   - **Outflow Repayment**: User pays counterparty, reducing a negative payable.

4. **`ADJUSTMENT`**:
   - Manual balance reconciliation or debt forgiveness.
   - Fields: `fromPartyId`, `toPartyId`, `amountPaise`.

5. **`LEGACY_UNCLASSIFIED`**:
   - Preserved legacy v1 records whose financial direction or counterparty was ambiguous during migration.
   - Placed in a review queue without mutating user balances until explicitly confirmed.

---

## 3. Financial Invariants & Conservation Laws

### A. Expense Conservation Law (`validateExpenseConservation`)
For every `EXPENSE` event, the sum of the user's personal share and all participant allocations must strictly equal the total merchant charge:

$$\text{totalAmountPaise} = \text{userSharePaise} + \sum_{i=1}^{n} \text{allocations}[i].\text{amountPaise}$$

When splitting an odd paise amount equally (e.g. ₹100 split 3 ways $\to$ 10,000 paise / 3), `allocateEqualShares` assigns the integer remainder to the first participant to maintain exact conservation down to the single paise.

### B. Ledger Balance Conventions (`computePersonBalance`)
The net balance between the user and a counterparty is computed purely from transaction history:

- **$\text{Balance} > 0$ (Receivable)**: The counterparty owes money to the user (green in UI).
- **$\text{Balance} < 0$ (Payable)**: The user owes money to the counterparty (rose in UI).
- **$\text{Balance} = 0$ (Settled)**: Neither party owes the other.

Balance contributions by event kind:
- User pays shared expense: $+\text{allocation}[i].\text{amountPaise}$ for each participant.
- Counterparty pays shared expense: $-\text{userSharePaise}$ owed to the counterparty. Non-user shares remain outside the user's ledger.
- Lend Money: $+\text{amountPaise}$ to counterparty balance.
- Borrow Money: $-\text{amountPaise}$ to counterparty balance.
- Repayment received: $-\text{amountPaise}$ (reduces counterparty debt).
- Repayment sent: $+\text{amountPaise}$ (reduces user debt).

### C. Repayment Chronology Safeguards (`validateChronologicalRepayments`)
Repayments cannot occur in a vacuum or exceed the debt accumulated up to that point in time:
- An inflow repayment cannot exceed the counterparty's debt at that timestamp.
- An outflow repayment cannot exceed the user's debt to that counterparty at that timestamp.
- **Mutation Invariant (`validateEventMutation`)**: When editing or deleting an earlier transaction (e.g., editing a past shared expense to reduce a friend's share), StoreCore simulates the modified ledger timeline. If the proposed change would cause any subsequent repayment to exceed available debt, the mutation is strictly rejected without altering the original transaction.

---

## 4. Headless State Orchestrator (`src/domain/store-core.js`)

`StoreCore` is an isolated JavaScript class managing storage persistence, indexing, and transactional operations:

- **Storage Portability**: Accepts any Web Storage API compatible backend (`localStorage` in browsers, or `MemoryStorage` in tests).
- **Listener Pattern**: Supports reactive UI bindings via `subscribe(listener)` and `notify()`.
- **Payment Attempt Lifecycle (`paymentAttempts`)**:
  - `createPaymentAttempt()` creates an isolated attempt (`INITIATED`) without booking a financial event.
  - `reconcilePaymentAttempt(attemptId, { outcome, ledgerTxnData })` only writes a transaction to the ledger when the outcome is confirmed as `SUCCESS`. If marked `FAILED`, `CANCELLED`, or `UNKNOWN`, no ledger debit is recorded.
- **Safety Backups**:
  - Automatically takes a pre-migration backup (`pocketledger_v1_backup`) before running `executeMigration()`.
  - Automatically takes a pre-import safety backup (`pocketledger_pre_import_backup`) before running `importData()`.

---

## 5. React Integration (`src/store.js` & `src/App.jsx`)

1. **`useStore()` Hook**:
   - Bridges `StoreCore` into React state using `useState` and `useEffect` subscription.
   - Exposes stable memoized callbacks (`addTransaction`, `editTransaction`, `deleteTransaction`, `computeBalances`, `computeMonthlyAnalytics`).
2. **`normalizeEditTxn()` (`src/domain/transaction-routing.js`)**:
   - Bridges canonical v2 events and projected transactions into uniform props consumed by UI forms (`PersonalExpenseForm`, `SharedExpenseForm`, `LendBorrowForm`, `RepaymentForm`).
   - Normalizes `payer`, `payerId`, `splits`, `allocations`, and `userShare`.
3. **Banner Hierarchy**:
   - **`PendingBanner`**: Displays pending legacy review alarms requiring user confirmation.
   - **`UnresolvedAttemptsBanner`**: Provides global inline reconciliation for pending UPI payments across all tabs.
   - **`HomeTab` Actionable Attention Banner**: Summarizes review items in Settings, eliminating duplicate alerts on the Overview screen.

---

## 6. Offline PWA & Service Worker (`public/sw.js`)

- **Service Worker Strategy**: Cache-first for compiled static assets (`index-*.js`, `index-*.css`, `manifest.json`, icons) and runtime caching for Google Fonts.
- **External Protocol Protection**: Service worker strictly ignores and passes through non-HTTP protocols (e.g. `upi://` schemes).
- **Cache Invalidation**: Cache storage versioning (`pocketledger-v2-[version]`) purges stale bundles automatically on activation.
