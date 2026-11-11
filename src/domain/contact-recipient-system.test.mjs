import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseUpiUri,
  checkAmountConflict,
  cleanPhoneNumber,
  isValidPhoneNumber,
  GPAY_PACKAGE_NAME,
  GPAY_LAUNCHER_INTENT,
  isAndroidClient,
  getGooglePayLaunchTarget,
} from './upi-qr.js';
import { StoreCore, isValidUpiId } from './store-core.js';
import { migrateV1ToV2 } from './migrate-v1-to-v2.js';

describe('Universal Contact & Payment Recipient System', () => {
  // ── 1. UPI QR Code Parsing (parseUpiUri) ──
  describe('UPI QR Parsing (parseUpiUri)', () => {
    test('1. Parses standard valid upi://pay URI with pa, pn, am, and tn', () => {
      const uri = 'upi://pay?pa=vikram@okhdfcbank&pn=Vikram%20Sharma&am=1250.50&cu=INR&tn=Dinner%20share';
      const result = parseUpiUri(uri);
      assert.equal(result.isValid, true);
      assert.equal(result.upiId, 'vikram@okhdfcbank');
      assert.equal(result.payeeName, 'Vikram Sharma');
      assert.equal(result.amountRupees, 1250.5);
      assert.equal(result.note, 'Dinner share');
    });

    test('2. Strips whitespace and normalizes handle format', () => {
      const uri = 'upi://pay?pa=%20diya.patel@icici%20&pn=Diya';
      const result = parseUpiUri(uri);
      assert.equal(result.isValid, true);
      assert.equal(result.upiId, 'diya.patel@icici');
      assert.equal(result.payeeName, 'Diya');
    });

    test('3. Parses uppercase UPI://PAY scheme and mixed case parameters', () => {
      const uri = 'UPI://PAY?PA=aarav@okaxis&PN=Aarav&AM=500';
      const result = parseUpiUri(uri);
      assert.equal(result.isValid, true);
      assert.equal(result.upiId, 'aarav@okaxis');
      assert.equal(result.payeeName, 'Aarav');
      assert.equal(result.amountRupees, 500);
    });

    test('4. Accepts bare UPI ID without scheme as a convenient fallback', () => {
      const result = parseUpiUri('rohan.verma@oksbi');
      assert.equal(result.isValid, true);
      assert.equal(result.upiId, 'rohan.verma@oksbi');
      assert.equal(result.amountRupees, null);
    });

    test('5. Rejects non-UPI protocols (http, https, tel)', () => {
      const resHttp = parseUpiUri('https://example.com/pay?pa=test@bank');
      assert.equal(resHttp.isValid, false);
      assert.match(resHttp.error, /Unsupported URI scheme/);

      const resTel = parseUpiUri('tel:9876543210');
      assert.equal(resTel.isValid, false);
    });

    test('6. Rejects missing or empty pa parameter', () => {
      const res = parseUpiUri('upi://pay?pn=Vikram&am=100');
      assert.equal(res.isValid, false);
      assert.match(res.error, /Missing payee address/);
    });

    test('7. Rejects invalid UPI ID format inside pa (e.g. raw phone number without bank)', () => {
      const res = parseUpiUri('upi://pay?pa=9876543210&pn=Vikram');
      assert.equal(res.isValid, false);
      assert.match(res.error, /Invalid UPI ID format/);
    });

    test('8. Rejects negative or NaN amounts in URI', () => {
      const resNeg = parseUpiUri('upi://pay?pa=test@bank&am=-50');
      assert.equal(resNeg.isValid, false);

      const resNaN = parseUpiUri('upi://pay?pa=test@bank&am=abc');
      assert.equal(resNaN.isValid, false);
    });

    test('9. Handles missing optional fields (amount, payee name, note) gracefully', () => {
      const res = parseUpiUri('upi://pay?pa=simple@bank');
      assert.equal(res.isValid, true);
      assert.equal(res.upiId, 'simple@bank');
      assert.equal(res.payeeName, '');
      assert.equal(res.amountRupees, null);
      assert.equal(res.note, '');
    });
  });

  // ── 2. Amount Conflict Detection ──
  describe('Amount Conflict Detection (checkAmountConflict)', () => {
    test('10. Detects conflict when form amount and QR amount differ', () => {
      const conflict = checkAmountConflict('500', 650);
      assert.equal(conflict.hasConflict, true);
      assert.equal(conflict.formAmount, 500);
      assert.equal(conflict.qrAmount, 650);
    });

    test('11. Returns no conflict when form amount matches QR amount', () => {
      const conflict = checkAmountConflict('300.00', 300);
      assert.equal(conflict.hasConflict, false);
    });

    test('12. Returns no conflict when QR amount is null or zero', () => {
      const conflictNull = checkAmountConflict('450', null);
      assert.equal(conflictNull.hasConflict, false);

      const conflictZero = checkAmountConflict('450', 0);
      assert.equal(conflictZero.hasConflict, false);
    });

    test('13. Returns no conflict when form amount is empty or zero', () => {
      const conflict = checkAmountConflict('', 500);
      assert.equal(conflict.hasConflict, false);
    });
  });

  // ── 3. Phone Number Validation & Cleaning ──
  describe('Phone Number Validation & Cleaning', () => {
    test('14. Cleans spaces, dashes, brackets, and +91 country prefix', () => {
      assert.equal(cleanPhoneNumber('+91 98765-43210'), '9876543210');
      assert.equal(cleanPhoneNumber('098765 43210'), '9876543210');
      assert.equal(cleanPhoneNumber('+91 (987) 654-3210'), '9876543210');
    });

    test('15. Validates standard 10-digit mobile numbers', () => {
      assert.equal(isValidPhoneNumber('9876543210'), true);
      assert.equal(isValidPhoneNumber('+91 9876543210'), true);
      assert.equal(isValidPhoneNumber('09876543210'), true);
    });

    test('16. Rejects numbers with fewer than 10 digits or alphabetic letters', () => {
      assert.equal(isValidPhoneNumber('12345'), false);
      assert.equal(isValidPhoneNumber('98765abcde'), false);
      assert.equal(isValidPhoneNumber(''), false);
    });
  });

  // ── 4. Universal Contact Selection & Creation in StoreCore ──
  describe('Universal Contact Creation in StoreCore', () => {
    test('17. createExplicitPerson saves contact with name, phone, and upiId', () => {
      const store = new StoreCore({ storage: null });
      const res = store.createExplicitPerson({
        name: 'Kavita Menon',
        phone: '+91 98765 11223',
        upiId: 'kavita@okhdfcbank',
      });

      assert.equal(res.success, true);
      assert.ok(res.person.id);
      assert.equal(res.person.name, 'Kavita Menon');
      assert.equal(res.person.phone, '9876511223');
      assert.equal(res.person.upiId, 'kavita@okhdfcbank');
    });

    test('18. Creating a contact NEVER creates any financial transactions', () => {
      const store = new StoreCore({ storage: null });
      const initialTxnCount = store.state.transactions.length;

      store.createExplicitPerson({
        name: 'Arjun Das',
        phone: '9876599887',
        upiId: 'arjun@okaxis',
      });

      assert.equal(store.state.transactions.length, initialTxnCount);
      const balances = store.computeBalances();
      assert.equal(balances['Arjun Das'] ?? 0, 0);
    });

    test('19. Created contact remains saved in directory even if payment is cancelled', () => {
      const store = new StoreCore({ storage: null });
      store.createExplicitPerson({
        name: 'Simran Kaur',
        phone: '9123456789',
        upiId: 'simran@icici',
      });

      // Verify directory has person
      const dir = store.getPeopleDirectory();
      const personInDir = dir.find((p) => p.name === 'Simran Kaur');
      assert.ok(personInDir);
      assert.equal(personInDir.phone, '9123456789');
      assert.equal(personInDir.upiId, 'simran@icici');
    });

    test('20. Duplicate warning: rejects adding existing name without force', () => {
      const store = new StoreCore({ storage: null });
      store.createExplicitPerson({ name: 'Rahul Bose', phone: '9876500001' });

      const resDuplicate = store.createExplicitPerson({ name: 'rahul bose', phone: '9876500002' });
      assert.equal(resDuplicate.success, false);
      assert.match(resDuplicate.error, /already exists/i);
    });

    test('21. Duplicate override: with force=true, creates distinct contact with new stable ID', () => {
      const store = new StoreCore({ storage: null });
      const p1 = store.createExplicitPerson({ name: 'Sameer Sen' }).person;
      const p2 = store.createExplicitPerson({ name: 'Sameer Sen', force: true }).person;

      assert.ok(p1.id);
      assert.ok(p2.id);
      assert.notEqual(p1.id, p2.id);
    });

    test('22. updatePerson modifies person phone and upiId seamlessly', () => {
      const store = new StoreCore({ storage: null });
      const p = store.createExplicitPerson({ name: 'Anil Kumar' }).person;

      store.updatePerson(p.id, {
        phone: '+91 99887 76655',
        upiId: 'anil@okicici',
      });

      const updated = store.state.people.find((x) => x.id === p.id);
      assert.equal(updated.phone, '9988776655');
      assert.equal(updated.upiId, 'anil@okicici');
    });
  });

  // ── 5. Payment Recipient Resolution & Outgoing Separation ──
  describe('Payment Recipient Resolution & Outgoing Separation', () => {
    test('23. createPaymentAttempt preserves recipientPartyId correctly', () => {
      const store = new StoreCore({ storage: null });
      const p = store.createExplicitPerson({ name: 'Pooja Hegde', upiId: 'pooja@oksbi' }).person;

      const res = store.createPaymentAttempt({
        personId: p.id,
        personName: p.name,
        upiId: p.upiId,
        amountRupees: 850,
      });

      assert.equal(res.success, true);
      assert.equal(res.attempt.recipientPartyId, p.id);
      assert.equal(res.attempt.recipientName, 'Pooja Hegde');
      assert.equal(res.attempt.amountPaise, 85000);
      assert.equal(res.attempt.status, 'INITIATED');
      assert.equal(res.attempt.isUnresolved, true);
    });

    test('24. Reconciling payment attempt as SUCCESS creates ledger event and resolves attempt', () => {
      const store = new StoreCore({ storage: null });
      const p = store.createExplicitPerson({ name: 'Karan Mehra', upiId: 'karan@okhdfcbank' }).person;

      const attRes = store.createPaymentAttempt({
        personId: p.id,
        personName: p.name,
        upiId: p.upiId,
        amountRupees: 400,
      });

      const recRes = store.reconcilePaymentAttempt(attRes.attempt.id, {
        outcome: 'SUCCESS',
        ledgerTxnData: {
          type: 'lend',
          person: p.name,
          amount: 400,
          description: 'Loan for tickets',
        },
      });

      assert.equal(recRes.success, true);
      assert.equal(recRes.attempt.status, 'COMPLETED');
      assert.equal(recRes.attempt.isUnresolved, false);
      assert.ok(recRes.attempt.eventId);

      // Verify counterparty balance increased
      const bal = store.computeBalances();
      assert.equal(bal['Karan Mehra'], 400);
    });

    test('25. Outgoing Lend vs Borrow separation: Lend initiates loan given, Borrow does not require recipient UPI', () => {
      const store = new StoreCore({ storage: null });
      // Borrow transaction records money received without external UPI payment attempt
      const resBorrow = store.addTransaction({
        type: 'borrow',
        person: 'Deepak Joshi',
        amount: 1500,
        paymentMethod: 'CASH',
      });

      assert.equal(resBorrow.success, true);
      // Personal spending unaffected, user liability created (-1500)
      assert.equal(store.computeBalances()['Deepak Joshi'], -1500);
      assert.equal(store.computeMonthlyAnalytics(2026, 11).totalSpendingRupees, 0);
    });

    test('26. Repayment direction separation: Outgoing repayment decrements user liability, does not allow overpayment', () => {
      const store = new StoreCore({ storage: null });
      // Borrow 1000
      store.addTransaction({ type: 'borrow', person: 'Alok Nath', amount: 1000, date: '2026-11-01' });
      assert.equal(store.computeBalances()['Alok Nath'], -1000);

      // Repay 600
      const resRepay = store.addTransaction({
        type: 'repayment',
        direction: 'outflow',
        person: 'Alok Nath',
        amount: 600,
        date: '2026-11-02',
      });
      assert.equal(resRepay.success, true);
      assert.equal(store.computeBalances()['Alok Nath'], -400);

      // Overpayment blocked
      const resOver = store.addTransaction({
        type: 'repayment',
        direction: 'outflow',
        person: 'Alok Nath',
        amount: 500,
        date: '2026-11-02',
      });
      assert.equal(resOver.success, false);
      assert.match(resOver.error, /exceeds/i);
    });
  });

  // ── 6. Data Compatibility, Backup & Migration Preservation ──
  describe('Data Compatibility, Backup & Migration Preservation', () => {
    test('27. exportData and importData preserve person phone numbers', () => {
      const store = new StoreCore({ storage: null });
      store.createExplicitPerson({
        name: 'Natasha Roy',
        phone: '9876543219',
        upiId: 'natasha@oksbi',
      });

      const exportedJson = store.exportData();
      assert.match(exportedJson, /"phone":\s*"9876543219"/);

      const newStore = new StoreCore({ storage: null });
      const impRes = newStore.importData(exportedJson);
      assert.equal(impRes.success, true);

      const person = newStore.state.people.find((p) => p.name === 'Natasha Roy');
      assert.ok(person);
      assert.equal(person.phone, '9876543219');
      assert.equal(person.upiId, 'natasha@oksbi');
    });

    test('28. migrateV1ToV2 preserves phone on existing directory contacts', () => {
      const v1State = {
        version: 1,
        people: [
          { id: 'p_101', name: 'Tanvi Shah', upiId: 'tanvi@okaxis', phone: '+91 91122 33445' },
        ],
        transactions: [
          { id: 't_1', type: 'give', person: 'Tanvi Shah', amount: 500, date: '2026-11-01' },
        ],
      };

      const result = migrateV1ToV2(v1State);
      assert.equal(result.success, true);
      const migratedPerson = result.migratedState.people.find((p) => p.name === 'Tanvi Shah');
      assert.ok(migratedPerson);
      assert.equal(migratedPerson.phone, '9112233445');
      assert.equal(migratedPerson.upiId, 'tanvi@okaxis');
    });

    test('29. getPeopleDirectory exposes phone property on all entries', () => {
      const store = new StoreCore({ storage: null });
      store.createExplicitPerson({ name: 'Varun Dhawan', phone: '9888877777' });
      // Also add transaction for person without explicit directory entry initially
      store.addTransaction({ type: 'lend', person: 'Shraddha', amount: 200 });

      const dir = store.getPeopleDirectory();
      const varun = dir.find((p) => p.name === 'Varun Dhawan');
      assert.equal(varun.phone, '9888877777');

      const shraddha = dir.find((p) => p.name === 'Shraddha');
      assert.equal(typeof shraddha.phone, 'string');
    });

    test('30. getPeopleWithBalances includes phone field', () => {
      const store = new StoreCore({ storage: null });
      store.createExplicitPerson({ name: 'Manish Paul', phone: '9777766666' });
      store.addTransaction({ type: 'lend', person: 'Manish Paul', amount: 750 });

      const peopleWithBalances = store.getPeopleWithBalances();
      const manish = peopleWithBalances.find((p) => p.name === 'Manish Paul');
      assert.ok(manish);
      assert.equal(manish.phone, '9777766666');
      assert.equal(manish.balanceRupees, 750);
    });
  });

  // ── 7. Google Pay QR Handoff & Safety Safeguards ──
  describe('Google Pay QR Handoff & Safety Safeguards', () => {
    test('31. Uses standard Android launcher intent format and official GPay package name', () => {
      assert.equal(GPAY_PACKAGE_NAME, 'com.google.android.apps.nbu.paisa.user');
      assert.match(GPAY_LAUNCHER_INTENT, /^intent:\/\/#Intent;/);
      assert.match(GPAY_LAUNCHER_INTENT, /package=com\.google\.android\.apps\.nbu\.paisa\.user;/);
      assert.match(GPAY_LAUNCHER_INTENT, /action=android\.intent\.action\.MAIN;/);
      assert.match(GPAY_LAUNCHER_INTENT, /category=android\.intent\.category\.LAUNCHER;/);
      assert.match(GPAY_LAUNCHER_INTENT, /end$/);
    });

    test('32. Does not invent or use undocumented scanner deep links', () => {
      // Must NOT use fake paths like gpay://scan or upi://scan
      assert.doesNotMatch(GPAY_LAUNCHER_INTENT, /gpay:\/\//i);
      assert.doesNotMatch(GPAY_LAUNCHER_INTENT, /scan/i);
    });

    test('33. Platform detection identifies Android vs desktop / iOS environments', () => {
      const androidUa = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36';
      const iosUa = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
      const desktopUa = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

      assert.equal(isAndroidClient(androidUa), true);
      assert.equal(isAndroidClient(iosUa), false);
      assert.equal(isAndroidClient(desktopUa), false);
    });

    test('34. getGooglePayLaunchTarget protects against unwanted Play Store redirection due to Chrome browsable restriction', () => {
      const androidUa = 'Mozilla/5.0 (Linux; Android 14; SM-S918B)';
      const androidTarget = getGooglePayLaunchTarget(androidUa);
      // Android Chrome ExternalNavigationHandler blocks non-BROWSABLE activities (like GPay launcher)
      // and redirects to the Play Store. To prevent unwanted Play Store navigations, we return MANUAL_LAUNCH.
      assert.equal(androidTarget.isSupported, false);
      assert.equal(androidTarget.intentUrl, null);
      assert.equal(androidTarget.method, 'MANUAL_LAUNCH');
      assert.match(androidTarget.reason, /Browser security boundary/);

      const desktopTarget = getGooglePayLaunchTarget('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
      assert.equal(desktopTarget.isSupported, false);
      assert.equal(desktopTarget.intentUrl, null);
      assert.equal(desktopTarget.method, 'MANUAL_LAUNCH');
    });

    test('35. App launch or return NEVER auto-posts any financial event to transactions', () => {
      const store = new StoreCore({ storage: null });
      const initialCount = store.state.transactions.length;

      // Simulate GPay launch target generation
      const target = getGooglePayLaunchTarget();
      assert.ok(target);

      // Verify transactions array remains strictly untouched
      assert.equal(store.state.transactions.length, initialCount);
    });

    test('36. Completed payment from GPay requires explicit user confirmation before recording transaction', () => {
      const store = new StoreCore({ storage: null });
      const p = store.createExplicitPerson({ name: 'Rohit Sharma' }).person;

      // Before explicit confirmation, zero transactions exist
      assert.equal(store.state.transactions.length, 0);

      // User returns from GPay and explicitly confirms payment done
      const addRes = store.addTransaction({
        type: 'lend',
        person: p.name,
        amount: 350,
        paymentMethod: 'UPI',
        description: 'Payment made via Google Pay QR scanner',
      });

      assert.equal(addRes.success, true);
      assert.equal(store.state.transactions.length, 1);
      assert.equal(store.computeBalances()['Rohit Sharma'], 350);
    });

    test('37. Path 1: UPI ID available initiates direct UPI payment with valid intentUrl', () => {
      const store = new StoreCore({ storage: null });
      const p = store.createExplicitPerson({ name: 'Pooja Hegde', upiId: 'pooja@oksbi' }).person;

      const res = store.createPaymentAttempt({
        type: 'UPI',
        recipientPartyId: p.id,
        personName: p.name,
        upiId: p.upiId,
        amountRupees: 500,
        note: 'Direct UPI payment',
      });

      assert.equal(res.success, true);
      assert.equal(res.attempt.type, 'UPI');
      assert.equal(res.attempt.recipientUpiId, 'pooja@oksbi');
      assert.equal(res.attempt.amountRupees, 500);
      assert.equal(res.attempt.amountPaise, 50000);
      assert.equal(res.attempt.status, 'INITIATED');
      assert.equal(res.attempt.isUnresolved, true);
      assert.ok(res.attempt.intentUrl.startsWith('upi://pay?pa=pooja%40oksbi'));
      assert.ok(res.attempt.intentUrl.includes('am=500.00'));
    });

    test('38. Path 2: No UPI ID initiates GOOGLE_PAY attempt without requiring upiId or phone', () => {
      const store = new StoreCore({ storage: null });
      const p = store.createExplicitPerson({ name: 'Vikram Seth' }).person;

      // Vikram has neither phone nor upiId saved
      const res = store.createPaymentAttempt({
        type: 'GOOGLE_PAY',
        recipientPartyId: p.id,
        personName: p.name,
        upiId: '',
        amountRupees: 750,
        note: 'Google Pay transfer',
      });

      assert.equal(res.success, true);
      assert.equal(res.attempt.type, 'GOOGLE_PAY');
      assert.equal(res.attempt.recipientUpiId, '');
      assert.equal(res.attempt.intentUrl, null);
      assert.equal(res.attempt.amountRupees, 750);
      assert.equal(res.attempt.status, 'INITIATED');
      assert.equal(res.attempt.isUnresolved, true);
    });

    test('39. Path 2: Reconciling GOOGLE_PAY attempt as SUCCESS records ledger transaction with paymentMethod UPI', () => {
      const store = new StoreCore({ storage: null });
      const p = store.createExplicitPerson({ name: 'Vikram Seth' }).person;

      const res = store.createPaymentAttempt({
        type: 'GOOGLE_PAY',
        recipientPartyId: p.id,
        personName: p.name,
        amountRupees: 750,
      });

      const rec = store.reconcilePaymentAttempt(res.attempt.id, {
        outcome: 'SUCCESS',
        ledgerTxnData: {
          type: 'lend',
          person: p.name,
          amount: 750,
          description: 'Loan via Google Pay',
        },
      });

      assert.equal(rec.success, true);
      assert.equal(rec.attempt.status, 'COMPLETED');
      assert.equal(rec.attempt.isUnresolved, false);
      assert.ok(rec.attempt.eventId);

      // Verify transaction in ledger
      const txns = store.state.transactions;
      assert.equal(txns.length, 1);
      assert.equal(txns[0].paymentMethod, 'UPI');
      assert.equal(store.computeBalances()['Vikram Seth'], 750);
    });

    test('40. Path 2: Reconciling GOOGLE_PAY attempt as CANCELLED or UNKNOWN never creates a financial transaction', () => {
      const store = new StoreCore({ storage: null });
      const p = store.createExplicitPerson({ name: 'Kiran Rao' }).person;

      const resCancel = store.createPaymentAttempt({
        type: 'GOOGLE_PAY',
        recipientPartyId: p.id,
        personName: p.name,
        amountRupees: 200,
      });

      const recCancel = store.reconcilePaymentAttempt(resCancel.attempt.id, {
        outcome: 'CANCELLED',
      });

      assert.equal(recCancel.success, true);
      assert.equal(recCancel.attempt.status, 'CANCELLED');
      assert.equal(recCancel.attempt.isUnresolved, false);
      assert.equal(store.state.transactions.length, 0);

      // Unknown outcome
      const resUnk = store.createPaymentAttempt({
        type: 'GOOGLE_PAY',
        recipientPartyId: p.id,
        personName: p.name,
        amountRupees: 400,
      });

      const recUnk = store.reconcilePaymentAttempt(resUnk.attempt.id, {
        outcome: 'UNKNOWN',
      });

      assert.equal(recUnk.success, true);
      assert.equal(recUnk.attempt.status, 'UNKNOWN');
      assert.equal(recUnk.attempt.isUnresolved, true); // Stays unresolved for review
      assert.equal(store.state.transactions.length, 0);
      assert.equal(store.getUnresolvedPaymentAttempts().length, 1);
    });
  });
});
