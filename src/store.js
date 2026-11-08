import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'pocketledger_data';

// ──────────────────────────────────────────────
// Default state
// ──────────────────────────────────────────────
const defaultState = () => ({
  transactions: [],    // master list — single source of truth
  people: [],          // [{ id, name, upiId? }]
  categories: ['Food', 'Transport', 'Shopping', 'Entertainment', 'Bills', 'Health', 'Education', 'Other'],
  pendingAlarms: [],   // [{ id, txnId, personName, amount, direction, createdAt }]
  settings: {
    currency: '₹',
    monthlyBudget: 0,
  },
});

// ──────────────────────────────────────────────
// Persistence
// ──────────────────────────────────────────────
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    // Merge with defaults so new fields are always present
    const def = defaultState();
    return { ...def, ...parsed, settings: { ...def.settings, ...(parsed.settings || {}) } };
  } catch {
    return defaultState();
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* storage full — silently fail */ }
}

// ──────────────────────────────────────────────
// Domino Engine — derived computations
// ──────────────────────────────────────────────

/** Compute net lending balance for every person from transactions */
export function computeLendingBalances(transactions) {
  const balances = {};
  for (const txn of transactions) {
    if (txn.type === 'give') {
      // I gave money to someone → they owe me
      balances[txn.person] = (balances[txn.person] || 0) + txn.amount;
    } else if (txn.type === 'take') {
      // I took/received money from someone → I owe them
      balances[txn.person] = (balances[txn.person] || 0) - txn.amount;
    } else if (txn.type === 'split') {
      // Split: each person's share is added as "they owe me"
      if (txn.splits) {
        for (const s of txn.splits) {
          balances[s.person] = (balances[s.person] || 0) + s.amount;
        }
      }
    } else if (txn.type === 'settle') {
      // Settlement — they paid me back (reduces what they owe)
      balances[txn.person] = (balances[txn.person] || 0) - txn.amount;
    } else if (txn.type === 'adjustment') {
      // Manual balance adjustment
      balances[txn.person] = (balances[txn.person] || 0) + txn.amount;
    }
  }
  return balances;
}

/** Monthly analytics — spending by category, daily totals, totals */
export function computeMonthlyAnalytics(transactions, year, month) {
  const monthTxns = transactions.filter((t) => {
    const d = new Date(t.date);
    return d.getFullYear() === year && d.getMonth() === month && (t.type === 'give' || t.type === 'split');
  });

  let totalSpent = 0;
  const byCategory = {};
  const byDay = {};

  for (const txn of monthTxns) {
    const amt = txn.type === 'split' ? (txn.myShare || 0) : txn.amount;
    totalSpent += amt;
    const cat = txn.category || 'Other';
    byCategory[cat] = (byCategory[cat] || 0) + amt;
    const day = new Date(txn.date).getDate();
    byDay[day] = (byDay[day] || 0) + amt;
  }

  return { totalSpent, byCategory, byDay, count: monthTxns.length };
}

/** Get all transactions involving a specific person */
export function getPersonHistory(transactions, personName) {
  return transactions
    .filter((t) => {
      if (t.person === personName) return true;
      if (t.splits && t.splits.some((s) => s.person === personName)) return true;
      return false;
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

// ──────────────────────────────────────────────
// UUID helper
// ──────────────────────────────────────────────
export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ──────────────────────────────────────────────
// Hook
// ──────────────────────────────────────────────
export function useStore() {
  const [state, setState] = useState(loadState);

  // Persist on every change
  useEffect(() => { saveState(state); }, [state]);

  const update = useCallback((fn) => {
    setState((prev) => {
      const next = fn(structuredClone(prev));
      return next;
    });
  }, []);

  // ── Transaction CRUD ──
  const addTransaction = useCallback((txn) => {
    update((s) => {
      s.transactions.push({ ...txn, id: uid(), createdAt: Date.now() });
      // Auto-add person to people list
      if (txn.person && !s.people.find((p) => p.name === txn.person)) {
        s.people.push({ id: uid(), name: txn.person });
      }
      if (txn.splits) {
        for (const sp of txn.splits) {
          if (!s.people.find((p) => p.name === sp.person)) {
            s.people.push({ id: uid(), name: sp.person });
          }
        }
      }
      return s;
    });
  }, [update]);

  const editTransaction = useCallback((id, updates) => {
    update((s) => {
      const idx = s.transactions.findIndex((t) => t.id === id);
      if (idx !== -1) s.transactions[idx] = { ...s.transactions[idx], ...updates, updatedAt: Date.now() };
      return s;
    });
  }, [update]);

  const deleteTransaction = useCallback((id) => {
    update((s) => {
      s.transactions = s.transactions.filter((t) => t.id !== id);
      return s;
    });
  }, [update]);

  // ── People ──
  const addPerson = useCallback((name, upiId) => {
    update((s) => {
      if (!s.people.find((p) => p.name === name)) {
        s.people.push({ id: uid(), name, upiId: upiId || '' });
      }
      return s;
    });
  }, [update]);

  const updatePerson = useCallback((name, data) => {
    update((s) => {
      const idx = s.people.findIndex((p) => p.name === name);
      if (idx !== -1) s.people[idx] = { ...s.people[idx], ...data };
      return s;
    });
  }, [update]);

  // ── Pending Alarms ──
  const addPendingAlarm = useCallback((alarm) => {
    update((s) => {
      s.pendingAlarms.push({ ...alarm, id: uid(), createdAt: Date.now() });
      return s;
    });
  }, [update]);

  const removePendingAlarm = useCallback((id) => {
    update((s) => {
      s.pendingAlarms = s.pendingAlarms.filter((a) => a.id !== id);
      return s;
    });
  }, [update]);

  const resolvePendingAlarm = useCallback((alarmId, confirmed) => {
    update((s) => {
      const alarm = s.pendingAlarms.find((a) => a.id === alarmId);
      if (!alarm) return s;
      if (confirmed) {
        // Add a settle transaction
        s.transactions.push({
          id: uid(),
          type: 'settle',
          person: alarm.personName,
          amount: alarm.amount,
          description: 'Payment confirmed (was pending)',
          category: 'Settlement',
          date: new Date().toISOString(),
          createdAt: Date.now(),
        });
      }
      s.pendingAlarms = s.pendingAlarms.filter((a) => a.id !== alarmId);
      return s;
    });
  }, [update]);

  // ── Settings ──
  const updateSettings = useCallback((patch) => {
    update((s) => {
      s.settings = { ...s.settings, ...patch };
      return s;
    });
  }, [update]);

  // ── Backup / Restore ──
  const exportData = useCallback(() => {
    return JSON.stringify(state, null, 2);
  }, [state]);

  const importData = useCallback((jsonStr) => {
    try {
      const parsed = JSON.parse(jsonStr);
      const def = defaultState();
      const merged = { ...def, ...parsed, settings: { ...def.settings, ...(parsed.settings || {}) } };
      setState(merged);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }, []);

  const exportCSV = useCallback(() => {
    const headers = ['id', 'type', 'person', 'amount', 'description', 'category', 'date', 'splits', 'myShare'];
    const rows = state.transactions.map((t) =>
      headers.map((h) => {
        if (h === 'splits') return t.splits ? JSON.stringify(t.splits) : '';
        return String(t[h] ?? '');
      }).join(',')
    );
    return [headers.join(','), ...rows].join('\n');
  }, [state]);

  return {
    state,
    addTransaction,
    editTransaction,
    deleteTransaction,
    addPerson,
    updatePerson,
    addPendingAlarm,
    removePendingAlarm,
    resolvePendingAlarm,
    updateSettings,
    exportData,
    importData,
    exportCSV,
  };
}
