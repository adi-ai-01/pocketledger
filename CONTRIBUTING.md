# Contributing to PocketLedger

Thank you for your interest in contributing to PocketLedger! We welcome bug fixes, performance improvements, and feature enhancements that align with PocketLedger's offline-first, mathematically rigorous financial principles.

---

## 1. Prerequisites

- **Node.js**: Version 24 or newer (PocketLedger is developed with Node 24 via `fnm`).
- **npm**: Version 10 or newer.
- Modern web browser (Chrome, Edge, Firefox, or Safari).

---

## 2. Local Development Setup

1. **Fork and clone the repository**:
   ```bash
   git clone https://github.com/<your-username>/pocketledger.git
   cd pocketledger
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the local development server**:
   ```bash
   npm run dev
   ```
   Open `http://localhost:5173` in your browser.

4. **Run the domain test suite**:
   ```bash
   npm test
   ```

5. **Build for production**:
   ```bash
   npm run build
   ```

6. **Preview the production build**:
   ```bash
   npm run preview
   ```

---

## 3. Financial Correctness Principles

PocketLedger enforces strict accounting and mathematical standards. All contributions modifying transaction logic or calculations must adhere to these rules:

1. **Integer-Paise Arithmetic**:
   - Never store floating-point Rupees in database events or calculations.
   - Always convert Rupee inputs to integer Paise (`convertRupeesToPaise`) and use integer arithmetic (`paise / 100` only at UI boundaries).
2. **Exact Allocation Conservation**:
   - For all shared expenses, `userSharePaise + sum(allocations) === totalAmountPaise`.
   - Never silently swallow discrepancies or drop participant allocations.
3. **Chronological Validity**:
   - Repayments cannot exceed outstanding counterparty debt.
   - Mutations (edits and deletions) must pass `validateEventMutation` before modifying state.
4. **Zero Unconfirmed Auto-Debits**:
   - External payment intent handoffs (such as launching UPI apps or Google Pay) must NEVER record financial debits automatically. Financial records require explicit user verification and confirmation.

---

## 4. Testing & Code Quality

- PocketLedger uses Node.js's native test runner (`node:test` and `node:assert/strict`) located in `src/domain/*.test.mjs`.
- Always add regression tests for bug fixes and new domain features.
- Ensure all tests pass (`npm test`) and the production build completes without warnings (`npm run build`) before submitting a pull request.

---

## 5. Privacy & Sensitive Data Safeguards

- **Never commit real personal financial records, live LocalStorage dumps, or private backup files (`.json` or `.csv`).**
- Use synthetic names (e.g., Alice, Bob, Charlie) and rounded test figures in test fixtures and example files.
