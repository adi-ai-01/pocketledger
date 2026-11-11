# PocketLedger

PocketLedger is an offline-first, client-side personal finance manager, shared bill splitter, and peer lending ledger built with pure integer-paise mathematical precision.

Most personal expense apps either force users to surrender their financial privacy to cloud databases or fail when splitting shared bills due to floating-point rounding errors and ambiguous debt tracking. PocketLedger solves this with a double-entry canonical ledger that runs entirely in your local browser, requires zero accounts or servers, and preserves exact financial conservation down to a single paise.

---

## Features

- **Personal Expense Tracking**: Record solo everyday expenditures and personal expenses covered by counterparties, isolating your actual consumption from peer liabilities.
- **Lending & Borrowing (P2P)**: Track money lent to friends or borrowed from colleagues with running counterparty balances and clear debt directions.
- **Shared Expenses & Bill Splitting**: Split bills equally or with custom amounts across multiple participants with strict integer-paise conservation ($\text{User Share} + \sum \text{Allocations} = \text{Total Bill}$).
- **Repayments & Debt Settlements**: Automatically detects repayment direction (inflow vs outflow), blocks overpayment, and prevents chronological debt conflicts.
- **Universal Directory & Balance Management**: Search contacts by name, phone number, or UPI ID; view chronological person timelines; and enforce strict zero-balance contact archival rules.
- **Monthly Spending Analytics & Budgets**: Real-time spending breakdowns by category and calendar day, monthly budget tracking, and net peer balance summaries.
- **Payment Attempt Lifecycle**: Dedicated tracking for pending payments with explicit multi-state outcomes (`SUCCESS`, `FAILED`, `CANCELLED`, `UNKNOWN`) to prevent duplicate transactions.
- **Safe UPI & Google Pay Handoff**: Deep-link integration with native UPI apps (`upi://pay`) and phone-number assistance for Google Pay with zero automatic debits.
- **Database Backup, Restore & Migration**: One-click JSON backup export, formatted CSV export, automated pre-import safety backups, rollback controls, and automated v1-to-v2 legacy migration.
- **Offline PWA Reliability**: Service worker dynamically precaching application assets and typography for instant offline startup and zero-telemetry LocalStorage persistence.
- **Universal Graphite Design**: High-contrast, responsive fintech interface with tabular financial numerals and dark graphite surfaces.

---

## Important Financial Disclaimers

> [!IMPORTANT]
> **PocketLedger is a personal record-keeping ledger, NOT a bank or payment service provider.**
> - PocketLedger does not hold funds, process banking transactions, or verify bank account balances.
> - Handing off to Google Pay, PhonePe, Paytm, or BHIM does not constitute payment verification. PocketLedger cannot inspect whether an external bank transfer actually cleared.
> - Money debits are never recorded automatically upon returning from an external payment application. All completed payments require explicit user verification and confirmation.

---

## Screenshots

> *Screenshots of the Overview screen, universal contact directory, shared bill splitter, and graphite mobile interface will be added here prior to public showcase.*

---

## Getting Started

### Prerequisites

- **Node.js**: Version 24 or newer (tested on Node v24).
- **npm**: Version 10 or newer.

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd pocketledger
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the local Vite development server:
   ```bash
   npm run dev
   ```
   Open `http://localhost:5173` in your browser.

### Running Tests

Run the complete domain regression test suite using Node's native test runner:
```bash
npm test
```

### Production Build & Preview

Build the optimized production bundles:
```bash
npm run build
```

Preview the production build locally:
```bash
npm run preview
```

---

## Architecture Overview

PocketLedger enforces a strict boundary between headless financial calculations and presentation components:

- **`src/domain/ledger.js`**: Pure canonical v2 financial engine, event invariants (`validateEvent`), expense conservation laws (`validateExpenseConservation`), balance calculations, and chronological repayment conflict detectors.
- **`src/domain/store-core.js`**: Headless state manager handling Web Storage persistence, payment attempts, transaction mutations, and pre-import backups.
- **`src/domain/migrate-v1-to-v2.js`**: Safe bi-directional schema migration from legacy v1 structures to canonical v2 events.
- **`src/domain/transaction-routing.js`**: Sheet routing, action derivation, and event normalization for UI forms.
- **`src/domain/upi-qr.js`**: UPI URI parsing, phone-number cleaning, and platform detection for Google Pay handoffs.
- **`src/store.js`**: React hook (`useStore()`) subscribing to the `StoreCore` singleton.
- **`src/App.jsx`**: Main application shell, responsive layout centering, tab routing, and global alert banners.
- **`public/sw.js`**: PWA service worker managing offline Cache Storage for scripts, styles, and fonts.

For an in-depth breakdown of data models and financial algorithms, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Privacy & Local Data Storage

PocketLedger stores 100% of your financial records and contact information client-side in your browser's `localStorage`. No financial data is ever transmitted to PocketLedger creators, maintainers, or central servers.

For detailed information on browser storage keys, Google Fonts requests, and external payment app boundaries, see [docs/PRIVACY.md](docs/PRIVACY.md).

---

## Contributing & QA

- For contribution workflows and financial accuracy guidelines, see [CONTRIBUTING.md](CONTRIBUTING.md).
- For the full 38-scenario manual verification test plan, see [docs/QA-CHECKLIST.md](docs/QA-CHECKLIST.md).

---

## License

PocketLedger is open-source software licensed under the [MIT License](LICENSE).
Third-party component notices and licenses are documented in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
