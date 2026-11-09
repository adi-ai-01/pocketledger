# PocketLedger — Manual QA Test Checklist & Verification Guide

This manual QA checklist provides step-by-step test scenarios and expected results for validating all core capabilities of PocketLedger.

---

## 1. QA Test Environment Setup

### Prerequisites
- Node.js environment configured via `fnm`.
- Project build verified with `npm run build`.
- Start local test server:
  ```bash
  npm run preview -- --port 4173
  ```
- **Test Fixture**: `test-fixtures/pocketledger-v1-demo.json` (Realistic legacy v1 sample data with multiple counterparties, all transaction types, a pending alarm, and budget settings).

### Test Viewports
- **Mobile**: ~390 × 844 (iPhone 12/13/14/15 size)
- **Desktop**: ~1440 × 900

---

## 2. Test Suites

### Suite 1: Overview & Dashboard

| Step # | Test Action | Expected Result | Pass/Fail |
|---|---|---|---|
| 1.1 | Open app on fresh state or load demo data. | Header shows current month/year, PocketLedger logo, and active theme badge. | [ ] |
| 1.2 | Inspect **Net Peer Balance** hero card. | Shows combined peer balance (e.g., `+₹5,650`), clearly labeled "Net peer balance" (never "net worth"). Distinct sub-cards for **Owed to you** (green/positive) and **You owe** (red/negative). | [ ] |
| 1.3 | Inspect **Monthly Personal Spending** card. | Shows only user's personal consumption share (never gross bill or loans). Shows budget progress percentage and visual progress bar if monthly budget > 0. | [ ] |
| 1.4 | Inspect **Attention Items Banner** (when alarms or unverified UPI attempts exist). | Displays amber alert banner with count of actionable items (e.g., "1 Actionable Item Requires Attention") with a direct "Review" shortcut button to Settings. | [ ] |
| 1.5 | Inspect **Recent Activity** list. | Shows up to 5 most recent transactions with directional icons and clear descriptions: "You lent...", "You borrowed...", "Personal Expense", "Shared bill". | [ ] |

---

### Suite 2: Transaction Creation (5 Canonical Workflows)

| Step # | Test Action | Expected Result | Pass/Fail |
|---|---|---|---|
| 2.1 | Click the **+ FAB** button. | Opens bottom sheet showing **Action Selector** with 5 clear options: Personal Expense, Shared Expense, Lend Money, Borrow Money, Record Repayment. | [ ] |
| 2.2 | **Personal Expense (Paid by User)**: Select Personal Expense, enter ₹450, category "Food", description "Coffee & Sandwich", paid by "You". Save. | Personal spending increases by ₹450. No counterparties are affected. Peer balances remain unchanged. | [ ] |
| 2.3 | **Personal Expense (Covered by Friend)**: Select Personal Expense, enter ₹300, choose paid by "Someone else", enter "Aarav Sharma". Save. | Personal spending increases by ₹300. You now owe Aarav ₹300 (your peer liability increases). | [ ] |
| 2.4 | **Shared Expense (Equal Split)**: Select Shared Expense, total bill ₹1200, category "Food", participants: Aarav Sharma and Diya Patel. Select "Equal Split". Save. | Equal 3-way split: Your share is ₹400, Aarav owes ₹400, Diya owes ₹400. Conservation holds exactly ($400 + 400 + 400 = 1200$). Personal spending increases by only ₹400. | [ ] |
| 2.5 | **Shared Expense (Custom Split)**: Select Shared Expense, total ₹1000, your share ₹500, participant "Rohan Verma" ₹500. Save. | Exact custom split recorded. Personal spending increases by ₹500; Rohan owes ₹500. | [ ] |
| 2.6 | **Lend Money (Outgoing loan)**: Select Lend Money, person "Rohan Verma", amount ₹1500, channel "Cash". Save. | Rohan's receivable increases by ₹1500. Personal spending does NOT increase. | [ ] |
| 2.7 | **Borrow Money (Incoming loan)**: Select Borrow Money, person "Aarav Sharma", amount ₹800, method "Bank Transfer". Save. | Your liability to Aarav increases by ₹800. Personal spending does NOT increase. | [ ] |
| 2.8 | **Record Repayment**: Select Record Repayment, select a person with outstanding debt. | App automatically detects direction (whether they owe you or you owe them). Pre-fills outstanding amount. Blocks overpayment beyond existing debt with clear validation message. | [ ] |

---

### Suite 3: UPI Payment Lifecycle & Reconciliation

| Step # | Test Action | Expected Result | Pass/Fail |
|---|---|---|---|
| 3.1 | In Lend Money or Repayment (outgoing), choose payment channel **UPI App Intent**. Save. | Modal displays UPI details and simulated external app launch intent (`upi://pay?...`). | [ ] |
| 3.2 | Upon return from external app, choose outcome: **Succeeded**. | Modal confirms transaction and creates single ledger event. Payment attempt is marked `COMPLETED` and linked to the ledger transaction. | [ ] |
| 3.3 | Initiate another UPI payment, but choose **Check Later** or close modal without confirmation. | Ledger event is NOT created. Unresolved payment attempt is logged in state. | [ ] |
| 3.4 | Check top banner on Overview tab. | **Unresolved UPI Attempts** banner appears. Clicking "Reconcile" allows marking Success/Failed/Cancelled. | [ ] |
| 3.5 | In Activity tab, switch to **Payment Attempts** view. | Shows log of external intents distinguishable from finalized ledger events. Status chips (`COMPLETED`, `PENDING`, `CANCELLED`) displayed clearly. | [ ] |

---

### Suite 4: People & Directory Management

| Step # | Test Action | Expected Result | Pass/Fail |
|---|---|---|---|
| 4.1 | Navigate to **People** tab. | Shows contacts count, active balances count, search bar, and filter tabs (All, Owed to you, You owe, Settled). | [ ] |
| 4.2 | Click **Add Person**, enter Name "Kavita Rao", UPI ID "kavita@okhdfcbank". Save. | Contact created and listed in directory with ₹0 settled balance. | [ ] |
| 4.3 | Enter invalid UPI ID format (e.g., `invalid_handle_without_at`). | Validation error message displayed: requires format `username@bank`. | [ ] |
| 4.4 | Click on a contact (e.g., "Aarav Sharma"). | Opens **Person Detail View** showing running balance hero card, timeline of all shared transactions, and action buttons. | [ ] |
| 4.5 | Click **Copy UPI ID**. | Copies UPI handle to clipboard and shows brief success confirmation toast/indicator. | [ ] |
| 4.6 | Attempt to **Archive** a person who has non-zero balance. | Action is blocked with alert: "Cannot archive person with active non-zero balance. Settle balance first." | [ ] |
| 4.7 | Settle person's balance to ₹0, then click **Archive**. | Contact is archived. In People directory, contact is hidden from active list and moved to "Archived" view. | [ ] |

---

### Suite 5: Activity Feed & Transaction Detail Inspection

| Step # | Test Action | Expected Result | Pass/Fail |
|---|---|---|---|
| 5.1 | Navigate to **Activity** tab. | Displays newest-first list grouped by month (e.g., "Oct 2026", "Nov 2026") with total event count. | [ ] |
| 5.2 | Use **Search Bar** to type a contact name or description. | List filters in real time to matching entries only. | [ ] |
| 5.3 | Use **Type Filter** (Personal Expense, Shared Expense, Lent, Borrowed, Repayment, Adjustment, Legacy). | Filters list strictly to selected transaction kind. | [ ] |
| 5.4 | Click on a transaction row. | Opens **Transaction Detail Modal** with full metadata: total amount, personal share, participants breakdown, date, category, payment method. | [ ] |
| 5.5 | Click **Edit Transaction** inside detail modal. | Opens transaction edit sheet. Modifying amount or category updates the event cleanly. | [ ] |
| 5.6 | Attempt to delete or reduce an earlier loan event that has a downstream repayment dependent on it. | Accounting engine dependency check catches conflict and displays clear explanation: "Cannot delete/edit transaction due to historical balance dependency." | [ ] |

---

### Suite 6: Settings, Data Management & Migration Recovery

| Step # | Test Action | Expected Result | Pass/Fail |
|---|---|---|---|
| 6.1 | Navigate to **Settings** tab. | Displays Preferences, Data Management, Financial Engine & Recovery, and Legacy Review Queue sections. | [ ] |
| 6.2 | Change **Currency Symbol** (e.g., `$`, `€`, `₹`) and update **Monthly Consumption Budget**. Click Save. | Success message displayed. Currency symbol and budget update immediately across all tabs. | [ ] |
| 6.3 | Click **Export Data (JSON)**. | Downloads `pocketledger-backup-[date].json` containing full persisted state. | [ ] |
| 6.4 | Click **Export CSV**. | Downloads formatted CSV spreadsheet of ledger history. | [ ] |
| 6.5 | **Safe Import Flow**: Click Import Backup, upload `test-fixtures/pocketledger-v1-demo.json`. | App does NOT overwrite state immediately. Opens **Preview Modal** displaying: detected schema version, transaction count, people count, integrity warnings. | [ ] |
| 6.6 | Confirm import. | Pre-import safety snapshot is automatically created (`pocketledger_pre_import_backup`). Demo v1 state is loaded into storage. | [ ] |
| 6.7 | In Financial Engine section, observe migration status: **Available**. Click **Preview Migration**. | Shows conversion metrics: transactions to convert, directory counterparties, pending alarms to preserve for review. | [ ] |
| 6.8 | Click **Execute Migration to v2**. | State upgrades to Canonical v2. Safety backup of v1 state is preserved (`pocketledger_v1_backup`). Status badge updates to "Canonical v2". | [ ] |
| 6.9 | Inspect **Legacy Review Queue** section. | Shows migrated alarms requiring review (e.g., Ananya Iyer ticket confirmation) and unclassified legacy events with "Mark Reviewed" buttons. | [ ] |
| 6.10 | Click **Rollback to Legacy v1**. | Complete zero-data-loss rollback restores original raw v1 dataset from backup. | [ ] |

---

### Suite 7: Visual Polish & 4 Distinct Themes

| Step # | Test Action | Expected Result | Pass/Fail |
|---|---|---|---|
| 7.1 | Switch to **Fantasy Theme** (🐺 House Stark). | Palette switches to cold slate & iron (`#0f1115`), icy silver text (`#e6ebf2`), cold steel accents (`#8da6c4`), Stark Direwolf sigil, cold forged card overlays. | [ ] |
| 7.2 | Switch to **Elden Theme** (✨ Golden Grace). | Palette switches to dark obsidian stone (`#08080a`), warm parchment cream text (`#f5eedc`), sacred Grace gold accents (`#e5c158`), Elden Rune seal, parchment textures. | [ ] |
| 7.3 | Switch to **Cyber Theme** (⚡ Solo Leveling HUD). | Palette switches to deep space void (`#060714`), holographic white (`#f0f6fc`), electric cyan/purple neon accents (`#00f0ff`), S-Rank Hunter Badge, Arcane Watermark. | [ ] |
| 7.4 | Switch to **Pixel Theme** (⛏️ Minecraft 8-Bit Retro). | Palette switches to Minecraft GUI stone bevels (`#2b2b2b`), emerald green accents (`#55ff55`), XP bar, Spawn Egg FAB. **Headings use 8-bit retro font, while body copy, inputs, numbers, and notes remain cleanly legible in high-contrast monospace.** | [ ] |
| 7.5 | Test on Desktop (1440×900). | Content is centered within `max-w-3xl` container; Tab bar centered at bottom; FAB stays aligned near centered container. | [ ] |
| 7.6 | Test on Mobile (390×844). | Full width layout; no horizontal overflow; bottom bar respects `env(safe-area-inset-bottom)`. | [ ] |

---

### Suite 8: Offline PWA Reliability

| Step # | Test Action | Expected Result | Pass/Fail |
|---|---|---|---|
| 8.1 | Open Chrome/Edge DevTools → Application → Service Workers. | Service worker `sw.js` is registered, active, and running. | [ ] |
| 8.2 | Check Cache Storage in DevTools. | Cache named `pocketledger-v2-[version]` contains `/index.html`, `/manifest.json`, icons, and the actual compiled hashed `index-*.js` and `index-*.css` bundles. | [ ] |
| 8.3 | Toggle **Offline** mode in Network tab (or disconnect WiFi/Ethernet). | App continues to operate without network errors. | [ ] |
| 8.4 | While still offline, **Reload the page** (`Ctrl+R` / `Cmd+R`). | App shell and compiled JS/CSS load instantly from Cache Storage. All data, themes, and views remain fully operational. | [ ] |
| 8.5 | Verify external payment intents (e.g. `upi://`) while offline. | Service worker does NOT attempt to cache `upi://` schemes or external payment links. | [ ] |

---

## 3. QA Sign-Off Summary

- **Test Run Date**: ____________________
- **Tester Name**: ____________________
- **Build Version / Commit**: `97acfc9`
- **Total Test Cases**: 38
- **Passed**: ____ / 38
- **Failed**: ____ / 38
- **Blockers / Notes**:

