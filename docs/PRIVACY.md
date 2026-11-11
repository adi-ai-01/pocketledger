# Privacy & Data Storage Policy

PocketLedger is designed as an offline-first, client-side personal finance and peer-debt tracking application. Because this software handles personal financial records and peer balance information, this document transparently describes how data is stored, what network requests occur, and the security boundaries of browser storage.

---

## 1. Where Your Data Is Stored

All financial records, directory contacts, running balances, categories, and settings are stored **locally within your web browser** using the Web Storage API (`localStorage`).

PocketLedger utilizes three storage keys in your browser:

| Key | Purpose |
|---|---|
| `pocketledger_data` | The active database, containing canonical financial transactions, contacts, categories, user settings, payment attempt logs, and review queues. |
| `pocketledger_v1_backup` | An automated snapshot created before executing the database migration from legacy v1 to canonical v2 schema, allowing complete one-click rollback. |
| `pocketledger_pre_import_backup` | An automated safety snapshot created immediately before importing external JSON data, protecting against data corruption or unintended overwrites. |

---

## 2. Serverless Architecture & Network Requests

### No PocketLedger Backend
PocketLedger does not operate any backend servers, central databases, user accounts, authentication services, or cloud storage. **Your financial records, amounts, notes, and contacts are never sent to PocketLedger creators, maintainers, or servers.**

### External Network Requests
PocketLedger only makes external network requests for static assets required to run the user interface:

1. **Web Fonts**: The application loads the open-source `Inter` font family from Google Fonts (`fonts.googleapis.com` and `fonts.gstatic.com`). When requesting font stylesheets and font files, your browser communicates with Google servers under Google's standard privacy policies.
2. **Hosting Provider**: When you access a hosted deployment of PocketLedger, your browser communicates with the hosting provider (e.g., GitHub Pages, Cloudflare Pages, Netlify) to download HTML, JavaScript, CSS, and web manifest files. Hosting providers standardly log HTTP request metadata such as IP addresses.

### Telemetry & Analytics
PocketLedger contains **zero telemetry, zero analytics scripts, zero third-party advertising trackers, and zero crash-reporting SDKs**.

---

## 3. Offline Service Worker & Caching

PocketLedger includes a Progressive Web App (PWA) service worker (`public/sw.js`).

- The service worker caches static assets (compiled JavaScript, CSS, application HTML, icons, manifest, and font files) in browser Cache Storage to allow the app to load and function completely offline.
- The service worker **never stores, logs, or intercepts financial transactions or user contacts**.
- External payment schemes (such as `upi://`) are explicitly bypassed by the service worker and handed directly to the host operating system.

---

## 4. Payment Intent Handoff & External Payment Apps

When initiating an outgoing UPI payment or launching Google Pay:
- PocketLedger formats a standard UPI payment URI (`upi://pay?pa=...`) or provides phone-number assistance to hand off the payment intent to the native operating system.
- The payment transaction itself occurs entirely inside your external UPI banking app (such as Google Pay, PhonePe, Paytm, or BHIM) over your bank's secure network.
- **PocketLedger cannot view, access, or verify bank account credentials, UPI PINs, bank balances, or whether an actual financial debit completed.**
- PocketLedger does not receive webhook confirmations or callback confirmations from banks. You must explicitly verify the transaction outcome and record it in PocketLedger.
- External payment applications are governed by their respective privacy policies and terms of service.

---

## 5. Data Durability, Browser Clearing & Multi-Device Limitations

1. **No Automatic Multi-Device Synchronization**: Because PocketLedger stores data exclusively in your local browser profile, your records do not automatically synchronize across multiple devices, across different browsers on the same device, or between standard and private/incognito browsing windows.
2. **Clearing Browser Data**: Clearing browser storage, wiping site data, or uninstalling your browser will permanently delete your PocketLedger records unless you have exported a manual backup file.
3. **Storage Security Boundaries**: Standard browser `localStorage` is not hardware-encrypted banking storage. Anyone with physical access to your device or administrative access to your browser profile can inspect local storage keys through browser developer tools. Do not use PocketLedger on untrusted, shared public computers.

---

## 6. Backups & Exported Files

PocketLedger provides manual backup and export features in the Settings tab:
- **JSON Backup (`.json`)**: Exports your complete ledger database in plaintext format.
- **CSV Export (`.csv`)**: Exports your transaction history as a plaintext spreadsheet.

> [!WARNING]
> Exported backup files contain your unencrypted financial transactions, amounts, counterparty names, and phone numbers. Store exported backup files in a secure location (such as an encrypted drive or private password manager).
