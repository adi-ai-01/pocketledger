/**
 * PocketLedger UPI QR & Phone Resolution Domain Module
 *
 * Implements strict, standard-compliant parsing of UPI payment URIs,
 * QR code validation, amount conflict detection, and phone number utilities.
 */

import { isValidUpiId } from './store-core.js';

/**
 * Parses and validates a raw UPI URI string (e.g. from QR code scan or deep link).
 * Standard format: upi://pay?pa=address@bank&pn=Payee%20Name&am=100.00&cu=INR&tn=Note
 *
 * @param {string} rawUri - The scanned or input string
 * @returns {object} { isValid: boolean, error?: string, upiId?: string, payeeName?: string, amount?: number|null, amountRupees?: number|null, currency?: string, note?: string, merchantCode?: string, rawUri: string }
 */
export function parseUpiUri(rawUri) {
  if (typeof rawUri !== 'string') {
    return { isValid: false, error: 'QR code content is empty or invalid', rawUri: '' };
  }

  const trimmed = rawUri.trim();
  if (!trimmed) {
    return { isValid: false, error: 'QR code content is empty', rawUri: '' };
  }

  // Bare UPI ID fallback (user pastes raw VPA e.g. rahul@oksbi)
  if (!/^upi:\/\/pay/i.test(trimmed)) {
    if (isValidUpiId(trimmed)) {
      return {
        isValid: true,
        upiId: trimmed,
        payeeName: '',
        amount: null,
        amountRupees: null,
        currency: 'INR',
        note: '',
        merchantCode: '',
        transactionRef: '',
        rawUri: trimmed,
      };
    }
    return {
      isValid: false,
      error: 'Unsupported URI scheme. Expected upi://pay?... or raw username@bank',
      rawUri: trimmed,
    };
  }

  try {
    // Replace upi:// with http:// temporarily to use standard URLSearchParams parser safely
    const normalizedUrl = trimmed.replace(/^upi:\/\/pay\?/i, 'http://localhost/?');
    const parsed = new URL(normalizedUrl);
    const params = parsed.searchParams;

    // Case-insensitive param lookup helper
    const getParam = (name) => {
      const lower = name.toLowerCase();
      for (const [key, val] of params.entries()) {
        if (key.toLowerCase() === lower) return val;
      }
      return null;
    };

    const paRaw = getParam('pa');
    if (!paRaw || !paRaw.trim()) {
      return {
        isValid: false,
        error: 'Missing payee address (pa parameter) in UPI QR code',
        rawUri: trimmed,
      };
    }

    const pa = paRaw.trim();
    if (!isValidUpiId(pa)) {
      return {
        isValid: false,
        error: `Invalid UPI ID format in payee address: '${pa}'. Expected username@bank`,
        rawUri: trimmed,
      };
    }

    const pn = (getParam('pn') || '').trim();
    const amStr = getParam('am');
    let amount = null;
    if (amStr !== null && amStr !== undefined && amStr.trim() !== '') {
      const parsedAmount = parseFloat(amStr.trim());
      if (Number.isNaN(parsedAmount) || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        return {
          isValid: false,
          error: `Invalid amount '${amStr}' in UPI QR code. Must be a positive finite number`,
          rawUri: trimmed,
        };
      }
      amount = Math.round(parsedAmount * 100) / 100;
    }

    const cu = (getParam('cu') || 'INR').trim().toUpperCase();
    const tn = (getParam('tn') || '').trim();
    const mc = (getParam('mc') || '').trim();
    const tr = (getParam('tr') || '').trim();

    return {
      isValid: true,
      upiId: pa,
      payeeName: pn,
      amount,
      amountRupees: amount,
      currency: cu,
      note: tn,
      merchantCode: mc,
      transactionRef: tr,
      rawUri: trimmed,
    };
  } catch (err) {
    return {
      isValid: false,
      error: `Failed to parse UPI QR code: ${err.message}`,
      rawUri: trimmed,
    };
  }
}

/**
 * Validates whether a phone number has reasonable digits and format.
 * Minimum 10 digits, supports +country code, spaces, hyphens, parentheses.
 */
export function isValidPhoneNumber(phone) {
  if (typeof phone !== 'string') return false;
  const trimmed = phone.trim();
  if (!trimmed) return false;

  // Extract pure digits
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return false;

  // Pattern check: optional leading +, then digits, spaces, hyphens, brackets
  return /^\+?[0-9\s\-()]{10,20}$/.test(trimmed);
}

/**
 * Cleans phone number for clipboard, directory or dialer assistance.
 * Normalizes +91 and leading 0 to standard 10-digit mobile number where applicable.
 */
export function cleanPhoneNumber(phone) {
  if (typeof phone !== 'string') return '';
  const trimmed = phone.trim();
  let digits = trimmed.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  return digits;
}

/**
 * Checks for amount conflict between QR code embedded amount and form amount.
 */
export function checkAmountConflict(formAmount, qrAmount) {
  if (!qrAmount || qrAmount <= 0) {
    return { hasConflict: false };
  }
  const parsedForm = parseFloat(formAmount);
  if (!Number.isFinite(parsedForm) || parsedForm <= 0) {
    return { hasConflict: false };
  }
  const diff = Math.abs(parsedForm - qrAmount);
  if (diff > 0.009) {
    return {
      hasConflict: true,
      formAmount: parsedForm,
      qrAmount,
      difference: diff,
    };
  }
  return { hasConflict: false };
}

/**
 * Standard Android launcher intent for Google Pay (India / Tez).
 * Uses standard Intent.ACTION_MAIN with CATEGORY_LAUNCHER for package com.google.android.apps.nbu.paisa.user.
 * Does not use any custom or undocumented scanner deep links.
 */
export const GPAY_PACKAGE_NAME = 'com.google.android.apps.nbu.paisa.user';
export const GPAY_LAUNCHER_INTENT =
  'intent://#Intent;package=com.google.android.apps.nbu.paisa.user;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end';

/**
 * Checks if the current client platform is Android.
 */
export function isAndroidClient(customUserAgent) {
  const ua = customUserAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  return typeof ua === 'string' && /android/i.test(ua);
}

/**
 * Returns the Google Pay launch target based on platform capabilities.
 *
 * NOTE ON ANDROID CHROME LIMITATION:
 * Android Chrome's ExternalNavigationHandler strictly enforces that intent:// URIs
 * can only launch activities registered with android.intent.category.BROWSABLE.
 * Google Pay's launcher activity only registers ACTION_MAIN / CATEGORY_LAUNCHER.
 * When a web browser attempts to launch GPAY_LAUNCHER_INTENT, Chrome rejects the non-browsable
 * activity and falls back to opening the Google Play Store (market://details?id=...).
 * Google Pay does not export any browsable deep link to open its main screen without a payee VPA.
 * Therefore, direct home-screen browser launching is blocked by Chromium's security sandbox.
 * We set isSupported: false to prevent sending the user to the Google Play Store,
 * providing honest manual instructions and the home-screen long-press shortcut instead.
 */
export function getGooglePayLaunchTarget(customUserAgent) {
  return {
    isSupported: false,
    intentUrl: null,
    method: 'MANUAL_LAUNCH',
    reason: 'Browser security boundary prevents direct launcher intent without payee VPA (would redirect to Play Store)',
  };
}
