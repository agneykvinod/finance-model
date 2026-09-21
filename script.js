// Expenses persist in localStorage under this key. Each entry: { id, description, amount, category, date }
// Older (v1.1) entries may be missing "date" — every function below tolerates that.
const STORAGE_KEY = 'ledger.expenses';

function loadExpenses() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Could not read saved expenses:', err);
    return [];
  }
}

function saveExpenses() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
  } catch (err) {
    console.error('Could not save expenses:', err);
  }
}

let expenses = loadExpenses();

const form = document.getElementById('expenseForm');
const descriptionInput = document.getElementById('description');
const amountInput = document.getElementById('amount');
const categoryInput = document.getElementById('category');
const expenseList = document.getElementById('expenseList');
const emptyState = document.getElementById('emptyState');
const totalValue = document.getElementById('totalValue');
const countValue = document.getElementById('countValue');
const dashMonthValue = document.getElementById('dashMonthValue');
const clearBtn = document.getElementById('clearBtn');

const monthTotal = document.getElementById('monthTotal');
const monthCount = document.getElementById('monthCount');
const monthAverage = document.getElementById('monthAverage');
const monthLargest = document.getElementById('monthLargest');
const monthTopCategory = document.getElementById('monthTopCategory');
const categoryChart = document.getElementById('categoryChart');
const moneyImpact = document.getElementById('moneyImpact');
const moneyImpactTitle = document.getElementById('moneyImpactTitle');
const moneyImpactText = document.getElementById('moneyImpactText');

let moneyImpactTimer;
const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatCurrency(amount) {
  return currencyFormatter.format(amount || 0);
}

// Returns a short display date, or a placeholder for older entries saved without one.
function formatDate(isoString) {
  if (!isoString) return 'No date';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return 'No date';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Makes text safe to place inside an innerHTML template (stops "<b>" or "<img ...>" typed
// into a description from being treated as real HTML).
function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function render() {
  // Rebuild the list from scratch — simplest way to keep DOM in sync with data.
  expenseList.innerHTML = '';

  if (expenses.length === 0) {
    emptyState.style.display = 'block';
  } else {
    emptyState.style.display = 'none';
  }

  expenses.forEach((expense) => {
    const li = document.createElement('li');
    li.className = 'expense-row';
    const category = expense.category || 'Other';
    li.innerHTML = `
      <div class="expense-info">
        <span class="expense-desc">${escapeHTML(expense.description)}</span>
        <span class="expense-meta">
          <span class="expense-category">${escapeHTML(category)}</span>
          <span class="dot">·</span>
          <span class="expense-date">${formatDate(expense.date)}</span>
        </span>
      </div>
      <div class="expense-side">
        <span class="expense-amount">${formatCurrency(expense.amount)}</span>
        <button class="remove-btn" data-id="${expense.id}" aria-label="Remove ${escapeHTML(expense.description)}">✕</button>
      </div>
    `;
    expenseList.appendChild(li);
  });

  const total = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  totalValue.textContent = formatCurrency(total);
  countValue.textContent = expenses.length;

  if (availableValue) {
    const incomeEntries = loadIncome();
    const totalIncome = incomeEntries.reduce(
      (sum, entry) => sum + Number(entry.amount || 0),
      0
    );
    const available = totalIncome - total;
    availableValue.textContent = formatCurrency(available);
    if (availableHint) {
      availableHint.textContent = totalIncome > 0
        ? (available >= 0 ? "Income minus recorded spending" : "Recorded spending exceeds income")
        : "Add income to see your available balance";
    }
  }

  renderAnalytics();
}

function renderAnalytics() {
  const now = new Date();

  // Entries without a valid date (older records) are excluded from "this month"
  // math but still show up in the transaction list and lifetime total above.
  const thisMonth = expenses.filter((e) => {
    if (!e.date) return false;
    const d = new Date(e.date);
    if (isNaN(d.getTime())) return false;
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });

  const total = thisMonth.reduce((sum, e) => sum + (e.amount || 0), 0);
  const count = thisMonth.length;
  const average = count > 0 ? total / count : 0;
  const largest = count > 0 ? Math.max(...thisMonth.map((e) => e.amount || 0)) : 0;

  // Sum spending per category, for both the "top category" stat and the chart below.
  const categoryTotals = {};
  thisMonth.forEach((e) => {
    const category = e.category || 'Other';
    categoryTotals[category] = (categoryTotals[category] || 0) + (e.amount || 0);
  });

  const sortedCategories = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);
  const topCategory = sortedCategories.length > 0 ? sortedCategories[0][0] : '—';

  dashMonthValue.textContent = formatCurrency(total);
  monthTotal.textContent = formatCurrency(total);
  monthCount.textContent = count;
  monthAverage.textContent = formatCurrency(average);
  monthLargest.textContent = formatCurrency(largest);
  monthTopCategory.textContent = topCategory;

  categoryChart.innerHTML = '';

  if (sortedCategories.length === 0) {
    categoryChart.innerHTML = '<p class="chart-empty">No expenses this month yet.</p>';
    return;
  }

  const highest = sortedCategories[0][1];

  sortedCategories.forEach(([category, amount]) => {
    const row = document.createElement('div');
    row.className = 'category-row';
    const widthPercent = highest > 0 ? Math.max((amount / highest) * 100, 4) : 0;
    row.innerHTML = `
      <span class="category-name">${escapeHTML(category)}</span>
      <span class="category-bar-track"><span class="category-bar-fill" style="width: ${widthPercent}%"></span></span>
      <span class="category-amount">${formatCurrency(amount)}</span>
    `;
    categoryChart.appendChild(row);
  });
}
function showMoneyImpact(expense) {
  const monthlyExpenses = expenses.filter((e) => {
    if (!e.date) return false;

    const d = new Date(e.date);

    if (isNaN(d.getTime())) return false;

    const now = new Date();

    return (
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear()
    );
  });

  const monthlyTotal = monthlyExpenses.reduce(
    (sum, e) => sum + (e.amount || 0),
    0
  );

  const categoryTotals = {};

  monthlyExpenses.forEach((e) => {
    const category = e.category || 'Other';

    categoryTotals[category] =
      (categoryTotals[category] || 0) + (e.amount || 0);
  });

  const category = expense.category || 'Other';

  const categoryTotal =
    categoryTotals[category] || 0;

  const percentage =
    monthlyTotal > 0
      ? ((categoryTotal / monthlyTotal) * 100).toFixed(1)
      : 0;

  const largestExpense =
    monthlyExpenses.length > 0
      ? Math.max(...monthlyExpenses.map((e) => e.amount || 0))
      : expense.amount;

  // Special message if this is the largest expense
  if (expense.amount >= largestExpense) {
    moneyImpactTitle.textContent = 'New largest expense';

    moneyImpactText.textContent =
      `${formatCurrency(expense.amount)} · ${category}`;
  } else {
    moneyImpactTitle.textContent =
      `${formatCurrency(expense.amount)} added`;

    moneyImpactText.textContent =
      `${category} is now ${percentage}% of your monthly spending.`;
  }

  moneyImpact.classList.add('show');

  clearTimeout(moneyImpactTimer);

  moneyImpactTimer = setTimeout(() => {
    moneyImpact.classList.remove('show');
  }, 4000);
         }

form.addEventListener('submit', (event) => {
  event.preventDefault();

  const description = descriptionInput.value.trim();
  const amount = parseFloat(amountInput.value);
  const category = categoryInput.value;

  if (!description || isNaN(amount) || amount <= 0) {
    return;
  }

  const newExpense = {
  id: Date.now(),
  description,
  amount,
  category,
  date: new Date().toISOString(),
};

expenses.push(newExpense);

form.reset();

showMoneyImpact(newExpense);
  descriptionInput.focus();
  saveExpenses();
  render();
});

expenseList.addEventListener('click', (event) => {
  const button = event.target.closest('.remove-btn');
  if (!button) return;

  const id = Number(button.dataset.id);
  expenses = expenses.filter((e) => e.id !== id);
  saveExpenses();
  render();
});

clearBtn.addEventListener('click', () => {
  if (expenses.length === 0) return;
  if (confirm('Clear all expenses?')) {
    expenses = [];
    saveExpenses();
    render();
  }
});

/* =================================
   INCOME + INCOME vs SPENDING
================================= */

// Income persists in localStorage under its own key. Each entry: { id, source, amount, date }
const INCOME_KEY = 'ledger.income';

function loadIncome() {
  try {
    const raw = localStorage.getItem(INCOME_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Could not read saved income:', err);
    return [];
  }
}

function saveIncome() {
  try {
    localStorage.setItem(INCOME_KEY, JSON.stringify(incomeEntries));
  } catch (err) {
    console.error('Could not save income:', err);
  }
}

let incomeEntries = loadIncome();

const incomeForm = document.getElementById('incomeForm');
const incomeSourceInput = document.getElementById('incomeSource');
const incomeAmountInput = document.getElementById('incomeAmount');
const incomeTotalEl = document.getElementById('incomeTotal');
const incomeListEl = document.getElementById('incomeList');

function renderIncome() {
  incomeListEl.innerHTML = '';

  if (incomeEntries.length === 0) {
    incomeListEl.innerHTML = '<p class="chart-empty">No income added yet.</p>';
  }

  incomeEntries.forEach((entry) => {
    const row = document.createElement('div');
    row.className = 'expense-row';
    row.innerHTML = `
      <div class="expense-info">
        <span class="expense-desc"></span>
        <span class="expense-meta">${formatDate(entry.date)}</span>
      </div>
      <div class="expense-side">
        <span class="expense-amount">${formatCurrency(entry.amount)}</span>
        <button class="remove-btn" type="button" data-id="${entry.id}">✕</button>
      </div>
    `;
    // textContent (not innerHTML) so a typed source name can never run as HTML.
    row.querySelector('.expense-desc').textContent = entry.source;
    row.querySelector('.remove-btn').setAttribute('aria-label', 'Remove ' + entry.source);
    incomeListEl.appendChild(row);
  });

  const totalIncome = incomeEntries.reduce((sum, e) => sum + (e.amount || 0), 0);
  incomeTotalEl.textContent = formatCurrency(totalIncome);
}

function updateMoneyAnalysis() {
  const income = incomeEntries.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const available = income - totalExpenses;

  document.getElementById('analysisIncome').textContent = formatCurrency(income);
  document.getElementById('analysisExpense').textContent = formatCurrency(totalExpenses);
  document.getElementById('analysisAvailable').textContent = formatCurrency(available);

  const result = document.getElementById('analysisResult');

  if (income === 0) {
    result.textContent = 'Add your income and expenses to see your financial position.';
  } else if (available < 0) {
    result.textContent = '⚠ Your spending is higher than your recorded income. Review your expenses.';
  } else if (totalExpenses / income >= 0.8) {
    result.textContent = '⚠ Most of your income is being spent. There may be room to optimise.';
  } else {
    result.textContent = '✓ You have a positive surplus. This can become the basis for your savings and investment plan.';
  }
}

incomeForm.addEventListener('submit', (event) => {
  event.preventDefault();

  const source = incomeSourceInput.value.trim();
  const amount = parseFloat(incomeAmountInput.value);

  if (!source || isNaN(amount) || amount <= 0) {
    return;
  }

  incomeEntries.push({
    id: Date.now(),
    source,
    amount,
    date: new Date().toISOString(),
  });

  incomeForm.reset();
  saveIncome();
  renderIncome();
  updateMoneyAnalysis();
  incomeSourceInput.focus();
});

incomeListEl.addEventListener('click', (event) => {
  const button = event.target.closest('.remove-btn');
  if (!button) return;

  const id = Number(button.dataset.id);
  incomeEntries = incomeEntries.filter((e) => e.id !== id);
  saveIncome();
  renderIncome();
  updateMoneyAnalysis();
});

renderIncome();
updateMoneyAnalysis();
render();

/* =========================================
   INVESTMENT PLANNER  (Insights page)
   Educational planning only. Nothing here is advice, and nothing here is live market data.
========================================= */

(function () {
  'use strict';

  /* -----------------------------------------------------------
     A. PLANNING RULES — edit these numbers to change the planner.
     ----------------------------------------------------------- */

  const ASSETS = ['equity', 'debt', 'gold', 'cash'];
  const ASSET_LABELS = { equity: 'Equity', debt: 'Debt', gold: 'Gold', cash: 'Cash / Liquid' };

  // Step 1 — starting allocation (%) for each risk profile. Each row must add up to 100.
  // Step 2 — the time horizon shifts percentage points between asset classes.
  // Step 3 — the goal shifts a few more points (or replaces the result entirely).
  // Every shift below adds up to 0, so the total stays 100. buildAllocation()
  // also re-normalises to exactly 100 as a safety net.
  const ALLOCATION_RULES = {
    base: {
      conservative: { equity: 20, debt: 50, gold: 10, cash: 20 },
      moderate:     { equity: 40, debt: 35, gold: 10, cash: 15 },
      growth:       { equity: 60, debt: 20, gold: 10, cash: 10 },
      aggressive:   { equity: 75, debt: 10, gold: 10, cash: 5 },
    },
    horizonShift: {
      lt3:     { equity: -20, debt: 10, gold: 0, cash: 10 },
      '3to5':  { equity: -10, debt: 7,  gold: 0, cash: 3 },
      '5to10': { equity: 0,   debt: 0,  gold: 0, cash: 0 },
      '10plus':{ equity: 10,  debt: -5, gold: 0, cash: -5 },
    },
    goalShift: {
      education:  { equity: -5, debt: 5 },
      house:      { equity: -5, debt: 5 },
      wealth:     {},
      retirement: { equity: 5, debt: -5 },
      custom:     {},
    },
    // A goal listed here ignores risk and horizon: an emergency fund should stay liquid.
    goalOverride: {
      emergency: { equity: 0, debt: 40, gold: 0, cash: 60 },
    },
  };

  // Hypothetical annual returns (%) per asset class, used ONLY to suggest starting
  // values for the projection. They are not forecasts and can be edited on screen.
  const ASSET_RETURN_ASSUMPTIONS = {
    equity: { lower: 7,   base: 11,  higher: 14 },
    debt:   { lower: 4.5, base: 6.5, higher: 8 },
    gold:   { lower: 3,   base: 7,   higher: 10 },
    cash:   { lower: 3,   base: 3.5, higher: 4 },
  };

  // While the reserve is incomplete, this share of the surplus is set aside for it
  // before calculating "Available to invest".
  const EMERGENCY_TOPUP_SHARE = 0.5;

  // "Years" input is pre-filled from the chosen horizon.
  const HORIZON_DEFAULT_YEARS = { lt3: 2, '3to5': 4, '5to10': 7, '10plus': 12 };

  const PROJECTION_YEARS = [5, 10, 15, 20];
  const PERCENT_OPTIONS = [20, 40, 60, 80];
  const RESERVE_OPTIONS = [3, 6, 9];
  const MAX_RATE = 30;

  const GOAL_LABELS = {
    emergency: 'Emergency Fund', education: 'Education', house: 'House / Car',
    wealth: 'Wealth Creation', retirement: 'Retirement', custom: 'Custom Goal',
  };
  const HORIZON_LABELS = { lt3: 'less than 3 years', '3to5': '3–5 years', '5to10': '5–10 years', '10plus': '10+ years' };
  const RISK_LABELS = { conservative: 'Conservative', moderate: 'Moderate', growth: 'Growth', aggressive: 'Aggressive' };

  /* -----------------------------------------------------------
     B. SAVED PLAN (localStorage key: ledger.investmentPlan)
     ----------------------------------------------------------- */

  const PLAN_KEY = 'ledger.investmentPlan';

  const DEFAULT_PLAN = {
    amountMode: 'percent',   // 'percent' | 'custom'
    percent: 40,             // one of PERCENT_OPTIONS
    customAmount: 0,
    goal: 'wealth',
    customGoalName: '',
    horizon: '5to10',
    risk: 'moderate',
    reserveMonths: 6,
    reserveSaved: 0,
    projMonthly: null,       // null = follow the planned monthly investment
    projYears: null,         // null = follow the time horizon
    rates: null,             // null = suggested from the allocation, else { lower, base, higher }
  };

  const finiteOr = (value, fallback) => (Number.isFinite(value) ? value : fallback);

  // Accepts whatever is in localStorage and returns a safe, complete plan.
  function sanitizePlan(raw) {
    const p = Object.assign({}, DEFAULT_PLAN);
    if (!raw || typeof raw !== 'object') return p;

    if (raw.amountMode === 'custom') p.amountMode = 'custom';
    if (PERCENT_OPTIONS.includes(raw.percent)) p.percent = raw.percent;
    p.customAmount = Math.max(0, finiteOr(Number(raw.customAmount), 0));
    if (Object.prototype.hasOwnProperty.call(GOAL_LABELS, raw.goal)) p.goal = raw.goal;
    if (typeof raw.customGoalName === 'string') p.customGoalName = raw.customGoalName.slice(0, 40);
    if (Object.prototype.hasOwnProperty.call(HORIZON_LABELS, raw.horizon)) p.horizon = raw.horizon;
    if (Object.prototype.hasOwnProperty.call(RISK_LABELS, raw.risk)) p.risk = raw.risk;
    if (RESERVE_OPTIONS.includes(raw.reserveMonths)) p.reserveMonths = raw.reserveMonths;
    p.reserveSaved = Math.max(0, finiteOr(Number(raw.reserveSaved), 0));

    if (raw.projMonthly !== null && raw.projMonthly !== undefined && Number.isFinite(Number(raw.projMonthly))) {
      p.projMonthly = Math.max(0, Number(raw.projMonthly));
    }
    if (raw.projYears !== null && raw.projYears !== undefined && Number.isFinite(Number(raw.projYears))) {
      p.projYears = Math.min(50, Math.max(1, Math.round(Number(raw.projYears))));
    }
    if (raw.rates && typeof raw.rates === 'object') {
      const r = ['lower', 'base', 'higher'].map((k) => Number(raw.rates[k]));
      if (r.every(Number.isFinite)) {
        p.rates = { lower: clampRate(r[0]), base: clampRate(r[1]), higher: clampRate(r[2]) };
      }
    }
    return p;
  }

  let plan = null; // filled in just below, once loadPlan() is defined

  function loadPlan() {
    try {
      const raw = localStorage.getItem(PLAN_KEY);
      return sanitizePlan(raw ? JSON.parse(raw) : null);
    } catch (err) {
      console.error('Could not read saved investment plan:', err);
      return sanitizePlan(null);
    }
  }

  function savePlan() {
    try {
      localStorage.setItem(PLAN_KEY, JSON.stringify(plan));
    } catch (err) {
      console.error('Could not save investment plan:', err);
    }
  }

  plan = loadPlan();

  /* -----------------------------------------------------------
     C. FORMATTING HELPERS
     ----------------------------------------------------------- */

  const inrWhole = new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0,
  });

  const fmt = (n) => inrWhole.format(Math.round(n || 0));

  // Compact Indian units for long projection figures, e.g. ₹12.40 L, ₹1.02 Cr.
  function fmtCompact(n) {
    const v = Math.round(n || 0);
    if (v >= 1e7) return '₹' + (v / 1e7).toFixed(2) + ' Cr';
    if (v >= 1e5) return '₹' + (v / 1e5).toFixed(2) + ' L';
    return fmt(v);
  }

  const fmtPct = (n) => (Math.round(n * 10) / 10).toString() + '%';

  function clampRate(n) {
    return Math.min(MAX_RATE, Math.max(0, Math.round(n * 10) / 10));
  }

  /* -----------------------------------------------------------
     D. CALCULATIONS (pure functions — no DOM)
     ----------------------------------------------------------- */

  function isThisMonth(iso) {
    if (!iso) return false;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return false;
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }

  // Reads the live Ledger data (the `expenses` and `incomeEntries` lists defined above).
  function getFigures() {
    const income = incomeEntries
      .filter((e) => isThisMonth(e.date))
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const spending = expenses
      .filter((e) => isThisMonth(e.date))
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const surplus = income - spending;
    return { income, spending, surplus, spendable: Math.max(0, surplus) };
  }

  function calcInvestment(p, spendable) {
    const requested = p.amountMode === 'custom' ? p.customAmount : (spendable * p.percent) / 100;
    const amount = Math.min(Math.round(requested), Math.floor(spendable));
    return { amount: Math.max(0, amount), capped: requested > spendable + 0.5 };
  }

  function calcEmergency(monthlyExpenses, p, spendable) {
    const target = Math.round(monthlyExpenses * p.reserveMonths);
    const saved = p.reserveSaved;
    const shortfall = Math.max(0, target - saved);
    const topUp = shortfall > 0 ? Math.min(shortfall, Math.floor(spendable * EMERGENCY_TOPUP_SHARE)) : 0;
    return {
      target,
      saved,
      shortfall,
      topUp,
      monthsToBuild: topUp > 0 ? Math.ceil(shortfall / topUp) : null,
      progress: target > 0 ? Math.min(1, saved / target) : 0,
    };
  }

  // Scales the values so they are whole numbers that add up to exactly `total`
  // (largest-remainder method). Used for both percentages and rupee amounts.
  function distribute(values, total) {
    const sum = values.reduce((s, v) => s + v, 0);
    if (sum <= 0 || total <= 0) return values.map(() => 0);
    const ideal = values.map((v) => (v * total) / sum);
    const result = ideal.map(Math.floor);
    let left = total - result.reduce((s, v) => s + v, 0);
    const order = ideal
      .map((v, i) => ({ i, frac: v - Math.floor(v) }))
      .sort((a, b) => b.frac - a.frac || a.i - b.i);
    for (let k = 0; left > 0; k = (k + 1) % order.length, left--) result[order[k].i] += 1;
    return result;
  }

  // Returns { equity, debt, gold, cash } as whole percentages that always total 100.
  function buildAllocation(risk, horizon, goal) {
    const override = ALLOCATION_RULES.goalOverride[goal];
    let raw;
    if (override) {
      raw = Object.assign({}, override);
    } else {
      const base = ALLOCATION_RULES.base[risk];
      const hShift = ALLOCATION_RULES.horizonShift[horizon] || {};
      const gShift = ALLOCATION_RULES.goalShift[goal] || {};
      raw = {};
      ASSETS.forEach((a) => {
        raw[a] = Math.max(0, (base[a] || 0) + (hShift[a] || 0) + (gShift[a] || 0));
      });
    }
    const pcts = distribute(ASSETS.map((a) => raw[a]), 100);
    const out = {};
    ASSETS.forEach((a, i) => { out[a] = pcts[i]; });
    return out;
  }

  // Splits a rupee amount across the allocation so the parts add up exactly.
  function splitAmount(amount, alloc) {
    const parts = distribute(ASSETS.map((a) => alloc[a]), Math.round(amount));
    const out = {};
    ASSETS.forEach((a, i) => { out[a] = parts[i]; });
    return out;
  }

  // Hypothetical blended annual return (%) for each scenario, weighted by the allocation.
  function suggestedRates(alloc) {
    const out = {};
    ['lower', 'base', 'higher'].forEach((s) => {
      const blended = ASSETS.reduce((sum, a) => sum + (alloc[a] / 100) * ASSET_RETURN_ASSUMPTIONS[a][s], 0);
      out[s] = clampRate(blended);
    });
    return out;
  }

  // SIP-style future value: a fixed amount invested at the start of every month,
  // compounded monthly at annualPct / 12.
  function sipFutureValue(monthly, annualPct, years) {
    const n = Math.round(years * 12);
    if (!(monthly > 0) || n <= 0) return 0;
    const r = annualPct / 100 / 12;
    if (r === 0) return monthly * n;
    return monthly * ((Math.pow(1 + r, n) - 1) / r) * (1 + r);
  }

  /* -----------------------------------------------------------
     E. DOM REFERENCES + SMALL UI HELPERS
     ----------------------------------------------------------- */

  const $ = (id) => document.getElementById(id);
  const page = $('insightsPage');
  if (!page) return; // Insights markup missing — leave the rest of the app untouched.

  function setIfNotFocused(input, value) {
    if (document.activeElement !== input) input.value = value;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  const readNumber = (input) => {
    const n = parseFloat(input.value);
    return Number.isFinite(n) ? n : null;
  };

  /* -----------------------------------------------------------
     F. RENDERING — planner sections 1–8 and 11
     ----------------------------------------------------------- */

  function renderSelections() {
    const selected = {
      percent: plan.amountMode === 'custom' ? 'custom' : String(plan.percent),
      goal: plan.goal,
      horizon: plan.horizon,
      risk: plan.risk,
      reserve: String(plan.reserveMonths),
    };
    page.querySelectorAll('.opt[data-group]').forEach((btn) => {
      const on = selected[btn.dataset.group] === btn.dataset.value;
      btn.classList.toggle('is-selected', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    $('plCustomAmountWrap').hidden = plan.amountMode !== 'custom';
    $('plGoalNameWrap').hidden = plan.goal !== 'custom';
  }

  function goalText() {
    if (plan.goal === 'custom' && plan.customGoalName.trim()) return plan.customGoalName.trim();
    return GOAL_LABELS[plan.goal];
  }

  function renderAllocation(alloc, amounts, monthly) {
    const list = $('plAllocation');
    list.innerHTML = '';
    ASSETS.forEach((a) => {
      const row = el('div', 'alloc-row');
      row.appendChild(el('span', 'alloc-name', ASSET_LABELS[a]));
      row.appendChild(el('span', 'alloc-value', alloc[a] + '% — ' + fmt(amounts[a])));
      const bar = el('span', 'alloc-bar');
      const fill = el('span', 'alloc-fill');
      fill.style.width = alloc[a] + '%';
      bar.appendChild(fill);
      row.appendChild(bar);
      list.appendChild(row);
    });
    const total = ASSETS.reduce((s, a) => s + alloc[a], 0);
    const totalRow = el('div', 'alloc-total');
    totalRow.appendChild(el('span', '', 'Total'));
    totalRow.appendChild(el('span', '', total + '% — ' + fmt(monthly)));
    list.appendChild(totalRow);

    $('plAllocationNote').textContent = plan.goal in ALLOCATION_RULES.goalOverride
      ? 'Illustrative allocation for an emergency fund, which stays mostly liquid regardless of risk profile or horizon. This is an educational estimate, not advice. Market investments carry risk and actual returns may vary.'
      : 'Illustrative allocation based on a ' + RISK_LABELS[plan.risk] + ' risk profile, a ' + HORIZON_LABELS[plan.horizon]
        + ' horizon and the goal "' + goalText() + '". This is an educational estimate, not advice. Market investments carry risk and actual returns may vary.';
  }

  function renderProjection(monthly, years, rates) {
    const wrap = $('plProjection');
    wrap.innerHTML = '';

    if (!(monthly > 0)) {
      wrap.appendChild(el('p', 'planner-note', 'Set a monthly investment above to see illustrative projections.'));
      return;
    }

    const horizons = [{ label: 'Your horizon · ' + years + (years === 1 ? ' year' : ' years'), years, primary: true }]
      .concat(PROJECTION_YEARS.map((y) => ({ label: y + ' years', years: y, primary: false })));

    horizons.forEach((h) => {
      const card = el('div', 'proj-card' + (h.primary ? ' proj-card--primary' : ''));
      const head = el('div', 'proj-head');
      head.appendChild(el('span', 'proj-years', h.label));
      head.appendChild(el('span', 'proj-invested', 'Invested ' + fmtCompact(monthly * Math.round(h.years * 12))));
      card.appendChild(head);

      const grid = el('div', 'proj-grid');
      [['Lower', 'lower'], ['Base', 'base'], ['Higher', 'higher']].forEach(([name, key]) => {
        const cell = el('div', 'proj-cell');
        cell.appendChild(el('span', 'proj-cell-label', name + ' · ' + fmtPct(rates[key]) + ' p.a.'));
        const value = el('strong', 'proj-cell-value', fmtCompact(sipFutureValue(monthly, rates[key], h.years)));
        value.title = fmt(sipFutureValue(monthly, rates[key], h.years));
        cell.appendChild(value);
        grid.appendChild(cell);
      });
      card.appendChild(grid);
      wrap.appendChild(card);
    });
  }

  function renderInsights(ctx) {
    const { fig, inv, em, available, alloc, monthly, years, rates } = ctx;
    const list = $('plInsights');
    list.innerHTML = '';
    const add = (text) => list.appendChild(el('li', '', text));

    if (fig.income === 0 && fig.spending === 0) {
      add('Add your income and expenses to see a summary based on your own numbers.');
    } else if (fig.surplus > 0) {
      add('Your current monthly surplus is ' + fmt(fig.surplus) + '.');
    } else {
      add('Your recorded expenses (' + fmt(fig.spending) + ') are ' + (fig.surplus === 0 ? 'equal to' : 'higher than')
        + ' your recorded income (' + fmt(fig.income) + ') this month, so there is no surplus to plan with.');
    }

    if (plan.amountMode === 'percent') {
      add('At a ' + plan.percent + '% investment rate, your planned monthly investment would be ' + fmt(inv.amount) + '.');
    } else {
      add('Your planned monthly investment is ' + fmt(inv.amount) + ' (a custom amount).');
    }

    if (em.target > 0) {
      add('Your emergency-fund target is ' + fmt(em.target) + ' based on ' + plan.reserveMonths + ' months of expenses.');
      if (em.shortfall > 0) {
        add('You have set aside ' + fmt(em.saved) + ', so ' + fmt(em.shortfall) + ' remains to reach the target.');
        if (available < inv.amount) {
          add('Available to invest after a reserve top-up is ' + fmt(available) + ', which is less than your planned investment.');
        }
      } else {
        add('Your emergency-fund target is currently covered.');
      }
    }

    if (inv.amount > 0) {
      add('Illustrative allocation: ' + ASSETS.map((a) => ASSET_LABELS[a] + ' ' + alloc[a] + '%').join(', ') + '.');
      const invested = monthly * Math.round(years * 12);
      add('Investing ' + fmt(monthly) + ' a month for ' + years + (years === 1 ? ' year' : ' years') + ' means ' + fmtCompact(invested)
        + ' invested. Under hypothetical assumptions of ' + fmtPct(rates.lower) + ', ' + fmtPct(rates.base) + ' and '
        + fmtPct(rates.higher) + ' a year, the illustrative value ranges from ' + fmtCompact(sipFutureValue(monthly, rates.lower, years))
        + ' to ' + fmtCompact(sipFutureValue(monthly, rates.higher, years)) + '. These are scenarios, not forecasts.');
    }
  }

  function renderPlanner() {
    const fig = getFigures();
    const inv = calcInvestment(plan, fig.spendable);
    const em = calcEmergency(fig.spending, plan, fig.spendable);
    const available = Math.max(0, fig.spendable - em.topUp);
    const alloc = buildAllocation(plan.risk, plan.horizon, plan.goal);
    const amounts = splitAmount(inv.amount, alloc);
    const suggested = suggestedRates(alloc);
    const rates = plan.rates || suggested;
    const monthly = plan.projMonthly !== null ? plan.projMonthly : inv.amount;
    const years = plan.projYears !== null ? plan.projYears : HORIZON_DEFAULT_YEARS[plan.horizon];

    renderSelections();

    // 1. Snapshot
    $('plIncome').textContent = fmt(fig.income);
    $('plExpenses').textContent = fmt(fig.spending);
    $('plSurplus').textContent = fmt(fig.surplus);
    $('plAvailable').textContent = fmt(available);
    $('plSnapshotNote').textContent =
      fig.income === 0 ? 'No income recorded this month. Add it on the Income page so the planner can use it.'
      : fig.spending === 0 ? 'No expenses recorded this month yet, so the surplus equals your income.'
      : 'Based on the income and expenses recorded this month. "Available to invest" is your surplus after setting aside part of it for any emergency-reserve shortfall.';

    // 2. Amount
    $('plAmount').textContent = fmt(inv.amount) + ' / month';
    setIfNotFocused($('plCustomAmount'), plan.customAmount ? String(plan.customAmount) : '');
    let amountNote;
    if (fig.spendable === 0) {
      amountNote = 'There is no monthly surplus to invest, so the planned amount is ₹0.';
    } else if (inv.capped) {
      amountNote = 'Capped at your monthly surplus of ' + fmt(fig.spendable) + '.';
    } else if (em.topUp > 0 && inv.amount > available) {
      amountNote = 'This is above your available-to-invest figure of ' + fmt(available) + ', which keeps ' + fmt(em.topUp)
        + ' aside for your emergency reserve. Building the reserve first can be considered.';
    } else {
      amountNote = plan.amountMode === 'percent'
        ? plan.percent + '% of your ' + fmt(fig.spendable) + ' monthly surplus.'
        : Math.round((inv.amount / fig.spendable) * 100) + '% of your ' + fmt(fig.spendable) + ' monthly surplus.';
    }
    $('plAmountNote').textContent = amountNote;

    // 3. Goal name
    setIfNotFocused($('plGoalName'), plan.customGoalName);

    // 6. Emergency fund
    setIfNotFocused($('plReserveSaved'), plan.reserveSaved ? String(plan.reserveSaved) : '');
    $('plReserveTarget').textContent = fmt(em.target);
    $('plReserveBar').style.width = Math.round(em.progress * 100) + '%';
    let reserveNote;
    if (em.target === 0) {
      reserveNote = 'Add expenses this month to calculate your emergency-fund target (monthly expenses × ' + plan.reserveMonths + ').';
    } else if (em.shortfall > 0) {
      reserveNote = 'You have ' + fmt(em.saved) + ' of ' + fmt(em.target) + ' set aside, so ' + fmt(em.shortfall)
        + ' is still needed. Building this reserve can be considered before increasing your investment allocation.'
        + (em.monthsToBuild ? ' Setting aside ' + fmt(em.topUp) + ' a month would take about ' + em.monthsToBuild + (em.monthsToBuild === 1 ? ' month.' : ' months.') : '')
        + ' This is an educational estimate, not financial advice.';
    } else {
      reserveNote = 'Your savings cover the ' + plan.reserveMonths + '-month target. This is an educational estimate, not financial advice.';
    }
    $('plReserveNote').textContent = reserveNote;

    // 7. Allocation
    renderAllocation(alloc, amounts, inv.amount);

    // 8. Projection inputs + results
    setIfNotFocused($('plProjMonthly'), String(monthly || ''));
    setIfNotFocused($('plProjYears'), String(years));
    setIfNotFocused($('plRateLower'), String(rates.lower));
    setIfNotFocused($('plRateBase'), String(rates.base));
    setIfNotFocused($('plRateHigher'), String(rates.higher));
    renderProjection(monthly, years, rates);

    // 11. Insight summary
    renderInsights({ fig, inv, em, available, alloc, monthly, years, rates });
  }

  /* -----------------------------------------------------------
     G. EVENTS — planner controls
     ----------------------------------------------------------- */

  page.addEventListener('click', (event) => {
    const opt = event.target.closest('.opt[data-group]');
    if (!opt) return;
    const group = opt.dataset.group;
    const value = opt.dataset.value;

    if (group === 'percent') {
      if (value === 'custom') {
        if (plan.amountMode !== 'custom' && plan.customAmount === 0) {
          plan.customAmount = calcInvestment(plan, getFigures().spendable).amount;
        }
        plan.amountMode = 'custom';
      } else {
        plan.amountMode = 'percent';
        plan.percent = Number(value);
      }
    } else if (group === 'goal') {
      plan.goal = value;
    } else if (group === 'horizon') {
      plan.horizon = value;
    } else if (group === 'risk') {
      plan.risk = value;
    } else if (group === 'reserve') {
      plan.reserveMonths = Number(value);
    }
    savePlan();
    renderPlanner();
  });

  $('plResetProjection').addEventListener('click', () => {
    plan.projMonthly = null;
    plan.projYears = null;
    plan.rates = null;
    savePlan();
    renderPlanner();
  });

  page.addEventListener('input', (event) => {
    const id = event.target.id;
    const n = readNumber(event.target);

    if (id === 'plCustomAmount') {
      plan.customAmount = n === null ? 0 : Math.max(0, n);
    } else if (id === 'plGoalName') {
      plan.customGoalName = event.target.value.slice(0, 40);
    } else if (id === 'plReserveSaved') {
      plan.reserveSaved = n === null ? 0 : Math.max(0, n);
    } else if (id === 'plProjMonthly') {
      plan.projMonthly = n === null ? null : Math.max(0, n);
    } else if (id === 'plProjYears') {
      plan.projYears = n === null ? null : Math.min(50, Math.max(1, Math.round(n)));
    } else if (id === 'plRateLower' || id === 'plRateBase' || id === 'plRateHigher') {
      const current = plan.rates || suggestedRates(buildAllocation(plan.risk, plan.horizon, plan.goal));
      const next = Object.assign({}, current);
      const key = id === 'plRateLower' ? 'lower' : id === 'plRateBase' ? 'base' : 'higher';
      if (n === null) return; // wait until the box holds a number
      next[key] = clampRate(n);
      plan.rates = next;
    } else {
      return;
    }
    savePlan();
    renderPlanner();
  });

  // When the custom amount box loses focus, show the value the planner actually used (capped at the surplus).
  $('plCustomAmount').addEventListener('change', () => {
    const inv = calcInvestment(plan, getFigures().spendable);
    plan.customAmount = inv.amount;
    $('plCustomAmount').value = inv.amount ? String(inv.amount) : '';
    savePlan();
    renderPlanner();
  });

  /* -----------------------------------------------------------
     H. MARKET & FUND RESEARCH
     -----------------------------------------------------------
     No live market data is used. The list below is DEMO DATA: made-up fund names
     and made-up numbers, so nothing here can be mistaken for a real product or a
     real price.

     To connect real data later, call
         window.LedgerMarketData.setProvider(async () => ({ source: 'live', updatedAt: '2026-01-31T10:00:00Z', funds: [...] }))
     with funds in the same shape as DEMO_FUNDS. Use only a public, keyless endpoint
     or your own server-side proxy. NEVER put a secret API key in this file: anything
     in GitHub Pages is readable by every visitor.
     ----------------------------------------------------------- */

  // Fields: name, category, risk, nav (₹), r1/r3/r5 (% — r3/r5 are annualised), expense (% p.a.), aum (₹ crore), benchmark.
  const DEMO_FUNDS = [
    { name: 'Sample Flexi Cap Fund',            category: 'Mutual Funds', risk: 'High',      nav: 84.12,  r1: 12.4, r3: 14.8, r5: 15.6, expense: 0.72, aum: 18250, benchmark: 'Demo Broad Market Index' },
    { name: 'Sample Large & Mid Cap Fund',      category: 'Mutual Funds', risk: 'High',      nav: 61.37,  r1: 15.1, r3: 16.2, r5: 17.0, expense: 0.81, aum: 9420,  benchmark: 'Demo Large & Mid Index' },
    { name: 'Sample Balanced Advantage Fund',   category: 'Mutual Funds', risk: 'Moderate',  nav: 47.90,  r1: 9.3,  r3: 10.6, r5: 11.2, expense: 0.68, aum: 6310,  benchmark: 'Demo Hybrid Index' },
    { name: 'Sample Large Cap Index Fund',      category: 'Index Funds',  risk: 'High',      nav: 152.66, r1: 11.2, r3: 13.5, r5: 14.4, expense: 0.18, aum: 21500, benchmark: 'Demo Large Cap 50 Index' },
    { name: 'Sample Next 50 Index Fund',        category: 'Index Funds',  risk: 'Very High', nav: 39.05,  r1: 17.8, r3: 15.9, r5: null, expense: 0.29, aum: 3120,  benchmark: 'Demo Next 50 Index' },
    { name: 'Sample Short Duration Debt Fund',  category: 'Debt Funds',   risk: 'Low',       nav: 28.44,  r1: 6.9,  r3: 6.3,  r5: 6.8,  expense: 0.35, aum: 4890,  benchmark: 'Demo Short Duration Debt Index' },
    { name: 'Sample Corporate Bond Fund',       category: 'Debt Funds',   risk: 'Moderate',  nav: 31.08,  r1: 7.4,  r3: 6.9,  r5: 7.2,  expense: 0.42, aum: 7260,  benchmark: 'Demo Corporate Bond Index' },
    { name: 'Sample Liquid Fund',               category: 'Debt Funds',   risk: 'Low',       nav: 1345.20,r1: 6.5,  r3: 5.8,  r5: 5.4,  expense: 0.20, aum: 12800, benchmark: 'Demo Liquid Index' },
    { name: 'Sample Gold ETF',                  category: 'Gold',         risk: 'Moderate',  nav: 62.15,  r1: 13.2, r3: 11.4, r5: 10.1, expense: 0.55, aum: 2350,  benchmark: 'Demo Domestic Gold Price' },
    { name: 'Sample Gold Fund of Fund',         category: 'Gold',         risk: 'Moderate',  nav: 19.73,  r1: 12.8, r3: 11.0, r5: null, expense: 0.15, aum: 940,   benchmark: 'Demo Domestic Gold Price' },
    { name: 'Sample Company A Ltd (stock)',     category: 'Stocks',       risk: 'Very High', nav: 1284.50,r1: 18.6, r3: 12.1, r5: 13.9, expense: null, aum: null,  benchmark: 'Demo Large Cap 50 Index' },
    { name: 'Sample Company B Ltd (stock)',     category: 'Stocks',       risk: 'Very High', nav: 412.30, r1: -4.2, r3: 8.7,  r5: 9.5,  expense: null, aum: null,  benchmark: 'Demo Large Cap 50 Index' },
  ];

  const MarketData = {
    // A provider is an async function returning { source: 'demo' | 'live', updatedAt: ISO string | null, funds: [...] }.
    provider: async function demoProvider() {
      return { source: 'demo', updatedAt: null, funds: DEMO_FUNDS };
    },
    setProvider(fn) {
      if (typeof fn !== 'function') return;
      this.provider = fn;
      loadFunds();
    },
  };
  window.LedgerMarketData = MarketData;

  let fundState = { source: 'demo', updatedAt: null, funds: DEMO_FUNDS, note: '' };

  async function loadFunds() {
    try {
      const result = await MarketData.provider();
      if (!result || !Array.isArray(result.funds)) throw new Error('Provider returned no funds list');
      fundState = {
        source: result.source === 'live' ? 'live' : 'demo',
        updatedAt: result.updatedAt || null,
        funds: result.funds,
        note: '',
      };
    } catch (err) {
      console.error('Fund data provider failed; showing demo data instead:', err);
      fundState = { source: 'demo', updatedAt: null, funds: DEMO_FUNDS, note: ' (The live data source could not be reached.)' };
    }
    renderFunds();
  }

  const PERIOD_LABELS = { r1: '1Y', r3: '3Y', r5: '5Y' };
  const FUND_PREVIEW_COUNT = 6;   // how many cards show before "Show all"
  let showAllFunds = false;

  const fmtReturn = (v) => (v === null || v === undefined ? '—' : (v > 0 ? '+' : '') + v.toFixed(1) + '%');
  const fmtNav = (v) => (v === null || v === undefined ? '—' : '₹' + Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const fmtExpense = (v) => (v === null || v === undefined ? '—' : v.toFixed(2) + '%');
  const fmtAum = (v) => (v === null || v === undefined ? '—' : '₹' + Number(v).toLocaleString('en-IN') + ' Cr');

  function metric(label, value, emphasis) {
    const box = el('div', 'fund-metric' + (emphasis ? ' fund-metric--on' : ''));
    box.appendChild(el('dt', '', label));
    box.appendChild(el('dd', '', value));
    return box;
  }

  function renderFunds() {
    const banner = $('fundBanner');
    if (fundState.source === 'live') {
      const when = fundState.updatedAt ? new Date(fundState.updatedAt) : null;
      banner.textContent = 'Last updated: ' + (when && !isNaN(when.getTime()) ? when.toLocaleString() : 'time not provided') + fundState.note;
      banner.classList.remove('data-banner--demo');
    } else {
      banner.textContent = 'Demo data — sample funds with made-up values for illustration. These are not real funds, prices or returns and are not live.' + fundState.note;
      banner.classList.add('data-banner--demo');
    }

    const query = $('fundSearch').value.trim().toLowerCase();
    const category = $('fundCategory').value;
    const risk = $('fundRisk').value;
    const period = $('fundPeriod').value;

    const shown = fundState.funds
      .filter((f) => category === 'all' || f.category === category)
      .filter((f) => risk === 'all' || f.risk === risk)
      .filter((f) => !query || (String(f.name) + ' ' + String(f.benchmark || '')).toLowerCase().includes(query))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));

    const visible = showAllFunds ? shown : shown.slice(0, FUND_PREVIEW_COUNT);
    $('fundCount').textContent = visible.length < shown.length
      ? 'Showing ' + visible.length + ' of ' + shown.length
      : shown.length + (shown.length === 1 ? ' item' : ' items') + ' shown';

    const list = $('fundList');
    list.innerHTML = '';

    if (shown.length === 0) {
      list.appendChild(el('p', 'planner-note', 'Nothing matches these filters.'));
      return;
    }

    visible.forEach((f) => {
      const card = el('article', 'fund-card');

      const head = el('div', 'fund-head');
      const titleBox = el('div', 'fund-title-box');
      titleBox.appendChild(el('h4', 'fund-name', f.name));
      const tags = el('div', 'fund-tags');
      tags.appendChild(el('span', 'tag', f.category));
      tags.appendChild(el('span', 'tag', f.risk + ' risk'));
      titleBox.appendChild(tags);
      head.appendChild(titleBox);
      if (fundState.source !== 'live') head.appendChild(el('span', 'tag tag--demo', 'Demo'));
      card.appendChild(head);

      const highlight = el('div', 'fund-highlight');
      highlight.appendChild(el('span', 'stat-label', PERIOD_LABELS[period] + ' return' + (period === 'r1' ? '' : ' (annualised)')));
      highlight.appendChild(el('strong', '', fmtReturn(f[period])));
      card.appendChild(highlight);

      const dl = el('dl', 'fund-metrics');
      dl.appendChild(metric('NAV / price', fmtNav(f.nav)));
      dl.appendChild(metric('1Y return', fmtReturn(f.r1), period === 'r1'));
      dl.appendChild(metric('3Y return', fmtReturn(f.r3), period === 'r3'));
      dl.appendChild(metric('5Y return', fmtReturn(f.r5), period === 'r5'));
      dl.appendChild(metric('Expense ratio', fmtExpense(f.expense)));
      dl.appendChild(metric('AUM', fmtAum(f.aum)));
      const bench = metric('Benchmark', f.benchmark || '—');
      bench.classList.add('fund-metric--wide');
      dl.appendChild(bench);
      card.appendChild(dl);

      list.appendChild(card);
    });

    if (shown.length > FUND_PREVIEW_COUNT) {
      const more = el('button', 'ghost-btn', showAllFunds ? 'Show fewer' : 'Show all ' + shown.length);
      more.type = 'button';
      more.id = 'fundMore';
      more.addEventListener('click', () => { showAllFunds = !showAllFunds; renderFunds(); });
      list.appendChild(more);
    }
  }

  ['fundSearch', 'fundCategory', 'fundRisk', 'fundPeriod'].forEach((id) => {
    $(id).addEventListener(id === 'fundSearch' ? 'input' : 'change', () => {
      showAllFunds = false;
      renderFunds();
    });
  });

  /* -----------------------------------------------------------
     I. START-UP
     ----------------------------------------------------------- */

  window.LedgerPlanner = { render: renderPlanner };

  try {
    renderPlanner();
    loadFunds();
  } catch (err) {
    // A planner problem must never stop the rest of Ledger from loading.
    console.error('Investment planner failed to start:', err);
  }
})();


/* =========================================
   MONEY HEALTH
   Local-only educational score based on Ledger data.
========================================= */
(function initMoneyHealth() {
  const healthPage = document.getElementById('healthPage');
  if (!healthPage) return;

  function healthMoney(value) {
    return typeof formatCurrency === 'function'
      ? formatCurrency(value)
      : '₹' + Number(value || 0).toLocaleString('en-IN');
  }

  function monthExpenses(items) {
    const now = new Date();
    return items.filter(e => {
      if (!e.date) return false;
      const d = new Date(e.date);
      return !isNaN(d.getTime()) && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
  }

  function calculateHealth() {
    const incomeEntries = typeof loadIncome === 'function' ? loadIncome() : [];
    const allExpenses = typeof loadExpenses === 'function' ? loadExpenses() : [];
    const currentExpenses = monthExpenses(allExpenses);
    const income = incomeEntries.reduce((s, e) => s + Number(e.amount || 0), 0);
    const spending = currentExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
    const surplus = income - spending;
    const savingsRate = income > 0 ? Math.max(0, Math.min(100, surplus / income * 100)) : 0;

    const categoryTotals = {};
    currentExpenses.forEach(e => {
      const c = e.category || 'Other';
      categoryTotals[c] = (categoryTotals[c] || 0) + Number(e.amount || 0);
    });
    const topCategory = Object.entries(categoryTotals).sort((a,b) => b[1] - a[1])[0];
    const concentration = spending > 0 && topCategory ? topCategory[1] / spending * 100 : 0;

    let reserveSaved = 0, reserveTarget = 0;
    try {
      const raw = localStorage.getItem('ledger.investmentPlan');
      const plan = raw ? JSON.parse(raw) : {};
      reserveSaved = Math.max(0, Number(plan.reserveSaved || 0));
      reserveTarget = spending * Math.max(3, Number(plan.reserveMonths || 6));
    } catch (_) {}

    const reserveCoverage = reserveTarget > 0 ? Math.min(100, reserveSaved / reserveTarget * 100) : 0;

    // Transparent 100-point educational model:
    // savings 40 + spending control 25 + reserve 20 + concentration 15.
    const savingsPoints = income > 0 ? Math.round(Math.min(40, Math.max(0, savingsRate / 25 * 40))) : 0;
    const spendingPoints = income > 0
      ? Math.round(Math.min(25, Math.max(0, surplus >= 0 ? 25 : 25 + surplus / Math.max(income, 1) * 25)))
      : 0;
    const reservePoints = reserveTarget > 0 ? Math.round(reserveCoverage / 100 * 20) : 0;
    const concentrationPoints = spending === 0
      ? 0
      : Math.round(Math.min(15, Math.max(0, (1 - Math.max(0, concentration - 25) / 75) * 15)));
    const score = Math.max(0, Math.min(100, savingsPoints + spendingPoints + reservePoints + concentrationPoints));

    const metrics = [
      {
        label: 'Savings rate',
        value: income > 0 ? Math.round(savingsRate) + '%' : '—',
        points: savingsPoints, max: 40,
        note: income > 0 ? 'Share of recorded income left after this month’s spending.' : 'Add income to calculate this.'
      },
      {
        label: 'Spending control',
        value: income > 0 ? (surplus >= 0 ? 'Within income' : 'Over income') : '—',
        points: spendingPoints, max: 25,
        note: income > 0 ? 'Compares this month’s recorded spending with income.' : 'Add income to calculate this.'
      },
      {
        label: 'Emergency reserve',
        value: reserveTarget > 0 ? Math.round(reserveCoverage) + '%' : 'Not set',
        points: reservePoints, max: 20,
        note: reserveTarget > 0 ? healthMoney(reserveSaved) + ' saved toward ' + healthMoney(reserveTarget) + '.' : 'Set emergency savings on the Investment Planner.'
      },
      {
        label: 'Spending concentration',
        value: topCategory ? Math.round(concentration) + '%' : '—',
        points: concentrationPoints, max: 15,
        note: topCategory ? topCategory[0] + ' is your largest category this month.' : 'Add expenses to see category concentration.'
      }
    ];

    const actions = [];
    if (!income) actions.push('Add your income so Ledger can measure your savings rate and available balance.');
    if (income && surplus < 0) {
      actions.push('Recorded spending is above income. Review your largest categories before increasing investments.');
    } else if (income && savingsRate < 20) {
      actions.push('Your recorded savings rate is below 20%. Review recurring and discretionary spending for possible room.');
    }
    if (reserveTarget > 0 && reserveCoverage < 100) {
      actions.push('Build the emergency reserve toward the target shown in your Investment Planner.');
    }
    if (topCategory && concentration > 45) {
      actions.push(topCategory[0] + ' represents ' + Math.round(concentration) + '% of this month’s spending. Check whether that concentration is intentional.');
    }
    if (!actions.length) actions.push('Keep recording transactions consistently so your score remains useful over time.');

    return { score, metrics, actions };
  }

  function renderHealth() {
    const data = calculateHealth();
    const score = document.getElementById('healthScore');
    const ring = document.getElementById('healthScoreRing');
    score.textContent = data.score;
    ring.style.setProperty('--health-progress', (data.score * 3.6) + 'deg');

    let title = data.score >= 80 ? 'Strong foundation'
      : data.score >= 60 ? 'Healthy, with room to improve'
      : data.score >= 40 ? 'Building your foundation'
      : 'Start with the basics';

    if (!data.metrics.some(m => m.points > 0)) title = 'Add your financial data';
    document.getElementById('healthScoreTitle').textContent = title;
    document.getElementById('healthScoreSummary').textContent =
      data.metrics.some(m => m.points > 0)
        ? 'Based on the income and expenses currently stored on this device.'
        : 'Record income and expenses to generate your first score.';

    const breakdown = document.getElementById('healthBreakdown');
    breakdown.innerHTML = '';
    data.metrics.forEach(m => {
      const row = document.createElement('article');
      row.className = 'health-metric';
      row.innerHTML =
        '<div class="health-metric-top"><div><strong>' + m.label + '</strong><span>' +
        m.note + '</span></div><b>' + m.value + '</b></div>' +
        '<div class="health-meter"><span style="width:' + ((m.points / m.max) * 100) + '%"></span></div>' +
        '<small>' + m.points + ' / ' + m.max + ' points</small>';
      breakdown.appendChild(row);
    });

    const actions = document.getElementById('healthActions');
    actions.innerHTML = '';
    data.actions.forEach((action, i) => {
      const row = document.createElement('div');
      row.className = 'health-action';
      row.innerHTML = '<span>0' + (i + 1) + '</span><p>' + action + '</p>';
      actions.appendChild(row);
    });
  }

  window.LedgerHealth = { render: renderHealth };
  renderHealth();
})();

/* =========================================
   PAGE NAVIGATION
   One visibility system for every page: the HTML `hidden` property.
========================================= */

const PAGE_IDS = {
  home: "homePage",
  income: "incomePage",
  insights: "insightsPage",
};

function openLedgerPage(pageName, button) {
  if (pageName === "ai") {
    window.location.href = "ai.html";
    return;
  }

  const selectedPage = document.getElementById(PAGE_IDS[pageName]);
  if (!selectedPage) {
    console.error("Ledger: page not found:", pageName);
    return;
  }

  document.querySelectorAll(".page-section").forEach(page => {
    page.hidden = true;
  });
  selectedPage.hidden = false;

  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.classList.remove("active");
    btn.removeAttribute("aria-current");
  });

  if (button) {
    button.classList.add("active");
    button.setAttribute("aria-current", "page");
  }

  if (pageName === "income") {
    updateMoneyAnalysis();
  }

  if (pageName === "insights") {
    if (window.LedgerPlanner) {
      try {
        window.LedgerPlanner.render();
      } catch (err) {
        console.error("Could not refresh the investment planner:", err);
      }
    }
    if (window.LedgerHealth && typeof window.LedgerHealth.render === "function") {
      window.LedgerHealth.render();
    }
  }

  window.scrollTo(0, 0);
}

// Insights Money Health card — keeps the compact card visible and reveals
// the existing detailed health breakdown only when the user asks for it.
document.addEventListener("DOMContentLoaded", () => {
  const card = document.getElementById("insightsHealthCard");
  const details = document.getElementById("insightsHealthDetails");
  if (!card || !details) return;

  card.addEventListener("click", (event) => {
    event.preventDefault();
    const expanded = card.getAttribute("aria-expanded") === "true";
    card.setAttribute("aria-expanded", expanded ? "false" : "true");
    details.hidden = expanded;

    if (!expanded && window.LedgerHealth && typeof window.LedgerHealth.render === "function") {
      window.LedgerHealth.render();
    }

    if (!expanded) {
      requestAnimationFrame(() => {
        details.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  });
});

// Delegated navigation keeps the buttons working even if the nav is
// re-rendered or the page structure changes later.
document.addEventListener("click", event => {
  const button = event.target.closest(".nav-btn");
  if (!button) return;
  event.preventDefault();
  openLedgerPage(button.dataset.page, button);
});



/* =========================================
   GOOGLE PAY / STATEMENT IMPORT
   Local-only importer: no account access,
   no network calls, no backend.
========================================= */
(function initStatementImporter() {
  const fileInput = document.getElementById('gpayFile');
  const pasteInput = document.getElementById('gpayPaste');
  const importBtn = document.getElementById('gpayImportBtn');
  const sampleBtn = document.getElementById('gpaySampleBtn');
  const status = document.getElementById('gpayImportStatus');
  const fileStatus = document.getElementById('gpayFileStatus') || status;
  const preview = document.getElementById('gpayImportPreview');
  if (!fileInput || !pasteInput || !importBtn) return;

  const money = value => '₹' + Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  const normalise = value => String(value ?? '').trim().toLowerCase().replace(/[\s_\-./]+/g, '');

  function parseAmount(value) {
    if (value === null || value === undefined) return null;
    const raw = String(value).replace(/₹/g, '').replace(/INR/gi, '').trim();
    if (!raw) return null;
    const negative = /^\s*\(.*\)\s*$/.test(raw) || /^-/.test(raw) || /\b(debit|paid|sent|payment)\b/i.test(raw);
    const cleaned = raw.replace(/[(),]/g, '').replace(/[^\d.-]/g, '');
    const n = Number(cleaned);
    if (!Number.isFinite(n) || n <= 0) return null;
    return negative ? -n : n;
  }

  function parseDate(value) {
    const raw = String(value || '').trim();
    if (!raw) return new Date().toISOString().slice(0, 10);
    const direct = new Date(raw);
    if (!Number.isNaN(direct.getTime())) return direct.toISOString().slice(0, 10);
    const m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m) {
      const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
      const d = new Date(year, Number(m[2]) - 1, Number(m[1]));
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
    return new Date().toISOString().slice(0, 10);
  }

  function categoryFor(description) {
    const text = String(description || '').toLowerCase();
    const rules = [
      ['Food', /swiggy|zomato|restaurant|cafe|coffee|food|pizza|bakery|hotel|eat/],
      ['Groceries', /grocery|grocer|supermarket|dmart|bigbasket|blinkit|zepto|instamart|milk|vegetable/],
      ['Fuel', /petrol|fuel|diesel|indianoil|bharat petroleum|hpcl|iocl|shell/],
      ['Bills', /electric|electricity|water bill|gas bill|recharge|mobile|internet|broadband|airtel|jio|vi |bsnl|utility/],
      ['Transport', /uber|ola|rapido|metro|bus|train|irctc|parking|toll|cab|auto/],
      ['Housing', /rent|housing|maintenance|apartment|hostel/],
      ['Leisure', /movie|cinema|netflix|spotify|prime video|game|gaming|bookmyshow|entertainment/]
    ];
    const hit = rules.find(([, pattern]) => pattern.test(text));
    return hit ? hit[0] : 'Other';
  }

  function splitCsvLine(line) {
    const out = [];
    let current = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && line[i + 1] === '"' && quoted) { current += '"'; i++; continue; }
      if (ch === '"') { quoted = !quoted; continue; }
      if (ch === ',' && !quoted) { out.push(current.trim()); current = ''; continue; }
      current += ch;
    }
    out.push(current.trim());
    return out;
  }

  function parseCsv(text) {
    const lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim());
    if (!lines.length) return [];
    const first = splitCsvLine(lines[0]);
    const looksLikeHeader = first.some(v => /date|amount|description|merchant|transaction|debit|credit|type|status/i.test(v));
    const headers = looksLikeHeader ? first.map(normalise) : [];
    const rows = [];

    for (let i = looksLikeHeader ? 1 : 0; i < lines.length; i++) {
      const cells = splitCsvLine(lines[i]);
      if (!cells.length) continue;
      if (headers.length) {
        const row = {};
        headers.forEach((h, index) => row[h] = cells[index] || '');
        rows.push(row);
      } else {
        rows.push({ raw: cells });
      }
    }
    return rows;
  }

  function firstValue(row, names) {
    for (const name of names) {
      const key = normalise(name);
      if (Object.prototype.hasOwnProperty.call(row, key) && String(row[key]).trim()) return row[key];
    }
    return '';
  }

  function rowToExpense(row) {
    let description = firstValue(row, [
      'description','merchant','merchant name','transaction details','transaction detail',
      'details','narration','payee','name','note','remarks'
    ]);
    let date = firstValue(row, ['date','transaction date','transactiondate','value date','timestamp']);
    let amountRaw = firstValue(row, ['amount','transaction amount','debit','paid','withdrawal','value']);
    let type = firstValue(row, ['type','transaction type','status']);

    if (row.raw) {
      const cells = row.raw;
      const dateCell = cells.find(c => /\d{1,4}[\/\-]\d{1,2}[\/\-]\d{1,4}/.test(c)) || cells[0];
      const amountCell = cells.find(c => /₹|INR|\d+[,.]?\d*\.\d{1,2}/.test(c));
      date = date || dateCell;
      amountRaw = amountRaw || amountCell;
      description = description || cells.filter(c => c !== dateCell && c !== amountCell).join(' ');
    }

    if (!description && !amountRaw) return null;
    let amount = parseAmount(amountRaw);
    if (amount !== null && amount > 0 && /debit|paid|payment|sent|withdrawal|purchase/i.test(String(type))) {
      amount = -Math.abs(amount);
    }
    if (amount === null) {
      const debit = parseAmount(firstValue(row, ['debit','paid','withdrawal']));
      const credit = parseAmount(firstValue(row, ['credit','received','deposit']));
      if (debit !== null) amount = -Math.abs(debit);
      else if (credit !== null) amount = Math.abs(credit);
    }
    if (amount === null || amount >= 0) return null; // Ledger import is expense-only.

    const cleanDescription = String(description || 'Google Pay transaction').replace(/\s+/g, ' ').trim().slice(0, 120);
    return {
      description: cleanDescription || 'Google Pay transaction',
      amount: Math.abs(amount),
      category: categoryFor(cleanDescription),
      date: parseDate(date)
    };
  }

  function parseJson(text) {
    const parsed = JSON.parse(text);
    const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed.transactions) ? parsed.transactions : [];
    return rows.map(item => ({
      description: item.description || item.merchant || item.name || item.details || item.narration || '',
      amount: item.amount ?? item.debit ?? item.paid ?? null,
      date: item.date || item.transactionDate || item.timestamp || '',
      type: item.type || ''
    })).map(rowToExpense).filter(Boolean);
  }

  function parseText(text) {
    const trimmed = String(text || '').trim();
    if (!trimmed) return [];
    if (/^\s*[\[{]/.test(trimmed)) {
      try { return parseJson(trimmed); } catch (_) {}
    }
    return parseCsv(trimmed).map(rowToExpense).filter(Boolean);
  }

  function fingerprint(item) {
    return [
      item.date,
      Number(item.amount).toFixed(2),
      String(item.description).toLowerCase().replace(/\s+/g, ' ').trim()
    ].join('|');
  }

  function loadExisting() {
    try {
      const raw = localStorage.getItem('ledger.expenses');
      const data = raw ? JSON.parse(raw) : [];
      return Array.isArray(data) ? data : [];
    } catch (_) {
      return [];
    }
  }

  function showPreview(items, duplicateCount) {
    preview.hidden = false;
    preview.innerHTML = '<p class="import-preview-title">Ready to import · ' + items.length + ' new expense' + (items.length === 1 ? '' : 's') + (duplicateCount ? ' · ' + duplicateCount + ' duplicate' + (duplicateCount === 1 ? '' : 's') + ' skipped' : '') + '</p>';
    items.slice(0, 5).forEach(item => {
      const row = document.createElement('div');
      row.className = 'import-preview-row';
      const left = document.createElement('span');
      left.textContent = item.description + ' · ' + item.category;
      const right = document.createElement('span');
      right.textContent = '-' + money(item.amount);
      row.append(left, right);
      preview.appendChild(row);
    });
    if (items.length > 5) {
      const more = document.createElement('p');
      more.className = 'planner-note';
      more.textContent = '+ ' + (items.length - 5) + ' more';
      preview.appendChild(more);
    }
  }

  function renderLedgerAfterImport() {
    if (typeof render === 'function') render();
    if (typeof updateMoneyAnalysis === 'function') updateMoneyAnalysis();
    if (window.LedgerHealth && typeof window.LedgerHealth.render === 'function') window.LedgerHealth.render();
    if (window.LedgerPlanner && typeof window.LedgerPlanner.render === 'function') window.LedgerPlanner.render();
  }

  function importText(text) {
    const parsed = parseText(text);
    if (!parsed.length) {
      status.textContent = 'No expense transactions were detected. Use a bank or Google Pay CSV/TXT/JSON export with date, merchant/description and debit/withdrawal/amount fields.';
      status.classList.add('is-error');
      preview.hidden = true;
      return;
    }

    const existing = loadExisting();
    const fingerprints = new Set(existing.map(fingerprint));
    const fresh = [];
    let duplicates = 0;

    parsed.forEach(item => {
      const key = fingerprint(item);
      if (fingerprints.has(key)) duplicates++;
      else { fingerprints.add(key); fresh.push(item); }
    });

    showPreview(fresh, duplicates);

    if (!fresh.length) {
      status.textContent = 'Nothing new to import. All detected transactions already exist in Ledger.';
      return;
    }

    const withIds = fresh.map(item => ({
      id: Date.now() + Math.random(),
      description: item.description,
      amount: Number(item.amount),
      category: item.category,
      date: item.date
    }));

    localStorage.setItem('ledger.expenses', JSON.stringify(existing.concat(withIds)));
    renderLedgerAfterImport();

    status.textContent = 'Imported ' + fresh.length + ' expense' + (fresh.length === 1 ? '' : 's') + (duplicates ? ' and skipped ' + duplicates + ' duplicate' + (duplicates === 1 ? '' : 's') : '') + '.';
    status.classList.remove('is-error');
  }

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    fileStatus.textContent = 'Reading ' + file.name + '…';
    fileStatus.classList.remove('is-error');
    preview.hidden = true;
    try {
      importText(await file.text());
    } catch (err) {
      fileStatus.textContent = 'Could not read this file. Please use CSV, TXT or JSON.';
      fileStatus.classList.add('is-error');
    }
  });

  importBtn.addEventListener('click', () => {
    const text = pasteInput.value.trim();
    if (!text) {
      status.textContent = 'Choose a file or paste a statement first.';
      status.classList.add('is-error');
      return;
    }
    importText(text);
  });

  sampleBtn.addEventListener('click', () => {
    pasteInput.value = [
      'Date,Description,Amount,Type',
      '2026-09-18,Swiggy,420,Debit',
      '2026-09-19,Indian Oil,2000,Debit',
      '2026-09-19,Metro,60,Debit'
    ].join('\n');
    status.textContent = 'Sample loaded. Tap Import transactions to add it.';
    status.classList.remove('is-error');
    preview.hidden = true;
  });
})();


/* ==========================================
   RECEIPT SCANNER
   Client-side OCR with Tesseract.js.
   Image/OCR text is kept in memory only.
========================================== */
(function initReceiptScanner() {
  const fileInput = document.getElementById('receiptFile');
  const progress = document.getElementById('receiptProgress');
  const progressLabel = document.getElementById('receiptProgressLabel');
  const progressValue = document.getElementById('receiptProgressValue');
  const progressBar = document.getElementById('receiptProgressBar');
  const preview = document.getElementById('receiptPreview');
  const image = document.getElementById('receiptImage');
  const result = document.getElementById('receiptResult');
  const status = document.getElementById('receiptStatus');
  const merchantInput = document.getElementById('receiptMerchant');
  const amountInput = document.getElementById('receiptAmount');
  const dateInput = document.getElementById('receiptDate');
  const categoryInput = document.getElementById('receiptCategory');
  const addBtn = document.getElementById('receiptAddBtn');
  const resetBtn = document.getElementById('receiptResetBtn');
  if (!fileInput || !addBtn) return;

  let worker = null;

  const money = value => '₹' + Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function setProgress(label, value) {
    const pct = Math.max(0, Math.min(100, Math.round(value)));
    progress.hidden = false;
    progressLabel.textContent = label;
    progressValue.textContent = pct + '%';
    progressBar.style.width = pct + '%';
  }

  function cleanText(text) {
    return String(text || '')
      .replace(/[\t ]+/g, ' ')
      .replace(/\n{2,}/g, '\n')
      .trim();
  }

  function parseMoneyFromText(text) {
    const lines = cleanText(text).split('\n').map(x => x.trim()).filter(Boolean);
    const moneyPatterns = [
      /(?:grand\s*total|net\s*total|amount\s*due|total\s*payable|total)\s*[:₹$€£]?\s*([\d,]+(?:\.\d{1,2})?)/ig,
      /(?:₹|INR)\s*([\d,]+(?:\.\d{1,2})?)/ig
    ];

    const candidates = [];
    for (const pattern of moneyPatterns) {
      let match;
      while ((match = pattern.exec(text))) {
        const value = Number(String(match[1]).replace(/,/g, ''));
        if (Number.isFinite(value) && value > 0) candidates.push(value);
      }
    }

    // Prefer the last total-like value because receipts often list item
    // prices before the final total.
    if (candidates.length) return candidates[candidates.length - 1];

    const numericLines = lines
      .map(line => line.match(/(?:₹|INR)?\s*([\d,]+\.\d{2})\s*$/i))
      .filter(Boolean)
      .map(match => Number(match[1].replace(/,/g, '')))
      .filter(value => Number.isFinite(value) && value > 0);

    return numericLines.length ? numericLines[numericLines.length - 1] : null;
  }

  function parseDateFromText(text) {
    const patterns = [
      /(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/,
      /(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (!match) continue;
      if (match.length === 4 && match[1].length === 4) {
        const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
        if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
      }
      if (match.length === 4) {
        const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
        const d = new Date(year, Number(match[2]) - 1, Number(match[1]));
        if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
      }
    }
    return today();
  }

  function guessMerchant(text) {
    const lines = cleanText(text).split('\n').map(x => x.trim()).filter(Boolean);
    const noise = /^(tax invoice|invoice|receipt|bill|date|time|cashier|gstin|gst|phone|mobile|tel|thank|thank you|total|subtotal|grand total|amount due|qty|price|description|item)$/i;
    const strong = /(restaurant|cafe|coffee|bakery|mart|market|store|supermarket|fuel|petrol|hotel|foods|pizza|swiggy|zomato|amazon|flipkart|dmart|bigbasket|blinkit|zepto|reliance|mcdonald|kfc|starbucks)/i;

    const candidate = lines.find(line =>
      line.length >= 3 &&
      line.length <= 60 &&
      !noise.test(line) &&
      !/^\d[\d\s+().-]{6,}$/.test(line) &&
      !/(?:₹|INR)\s*[\d,]+/i.test(line) &&
      !/\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/.test(line)
    );

    const strongCandidate = lines.find(line =>
      line.length >= 3 && line.length <= 60 && strong.test(line)
    );

    return strongCandidate || candidate || 'Receipt purchase';
  }

  function categoryFor(description, text) {
    const source = (String(description || '') + ' ' + String(text || '')).toLowerCase();
    const rules = [
      ['Food', /swiggy|zomato|restaurant|cafe|coffee|food|pizza|bakery|hotel|mcdonald|kfc/],
      ['Groceries', /grocery|grocer|supermarket|dmart|bigbasket|blinkit|zepto|instamart|mart|milk|vegetable/],
      ['Fuel', /petrol|fuel|diesel|indianoil|bharat petroleum|hpcl|iocl|shell/],
      ['Bills', /electric|electricity|water bill|gas bill|recharge|mobile|internet|broadband|airtel|jio|vi |bsnl|utility/],
      ['Transport', /uber|ola|rapido|metro|bus|train|irctc|parking|toll|cab|auto/],
      ['Housing', /rent|housing|maintenance|apartment|hostel/],
      ['Leisure', /movie|cinema|netflix|spotify|prime video|game|gaming|bookmyshow|entertainment/]
    ];
    const hit = rules.find(([, pattern]) => pattern.test(source));
    return hit ? hit[0] : 'Other';
  }

  function resetScanner() {
    fileInput.value = '';
    preview.hidden = true;
    result.hidden = true;
    progress.hidden = true;
    status.textContent = '';
    merchantInput.value = '';
    amountInput.value = '';
    dateInput.value = today();
    categoryInput.value = 'Other';
  }

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      status.textContent = 'Please choose an image receipt.';
      status.classList.add('is-error');
      return;
    }

    status.classList.remove('is-error');
    status.textContent = 'Preparing local OCR…';
    preview.hidden = false;
    image.src = URL.createObjectURL(file);
    result.hidden = true;
    setProgress('Loading OCR engine…', 5);

    try {
      if (!window.Tesseract) {
        throw new Error('OCR library did not load. Check your internet connection and reload the page.');
      }

      if (!worker) {
        worker = await Tesseract.createWorker('eng', 1, {
          logger: message => {
            if (message && typeof message.progress === 'number') {
              setProgress(message.status || 'Scanning receipt…', 5 + message.progress * 80);
            }
          }
        });
      }

      setProgress('Scanning receipt…', 15);
      const { data } = await worker.recognize(file);
      const text = cleanText(data.text);

      if (!text) {
        throw new Error('No readable text was found on this receipt.');
      }

      setProgress('Extracting fields…', 90);

      const merchant = guessMerchant(text);
      const amount = parseMoneyFromText(text);
      const date = parseDateFromText(text);
      const category = categoryFor(merchant, text);

      merchantInput.value = merchant;
      amountInput.value = amount || '';
      dateInput.value = date;
      categoryInput.value = category;
      result.hidden = false;
      setProgress('Scan complete', 100);

      const confidence = Number.isFinite(Number(data.confidence)) ? Math.round(Number(data.confidence)) : null;
      document.getElementById('receiptConfidence').textContent = confidence !== null ? confidence + '% OCR' : 'OCR';
      status.textContent = amount
        ? 'Receipt scanned. Review the extracted fields before adding.'
        : 'Receipt scanned, but the amount needs to be entered manually.';
    } catch (error) {
      console.error('Ledger receipt scanner:', error);
      status.textContent = error.message || 'Could not scan this receipt. Try a clearer, well-lit image.';
      status.classList.add('is-error');
      result.hidden = true;
    }
  });

  addBtn.addEventListener('click', () => {
    const description = merchantInput.value.trim() || 'Receipt purchase';
    const amount = Number(amountInput.value);
    const date = dateInput.value || today();
    const category = categoryInput.value || 'Other';

    if (!Number.isFinite(amount) || amount <= 0) {
      status.textContent = 'Enter a valid receipt amount before adding.';
      status.classList.add('is-error');
      amountInput.focus();
      return;
    }

    let expenses = [];
    try {
      const raw = localStorage.getItem('ledger.expenses');
      expenses = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(expenses)) expenses = [];
    } catch (_) {
      expenses = [];
    }

    const duplicate = expenses.some(item =>
      String(item.description || '').toLowerCase().trim() === description.toLowerCase() &&
      Number(item.amount || 0).toFixed(2) === amount.toFixed(2) &&
      String(item.date || '') === date
    );

    if (duplicate) {
      status.textContent = 'This receipt looks like it is already in Ledger.';
      status.classList.add('is-error');
      return;
    }

    expenses.push({
      id: Date.now() + Math.random(),
      description: description.slice(0, 120),
      amount,
      category,
      date
    });

    localStorage.setItem('ledger.expenses', JSON.stringify(expenses));
    if (typeof render === 'function') render();
    if (typeof updateMoneyAnalysis === 'function') updateMoneyAnalysis();
    if (window.LedgerHealth && typeof window.LedgerHealth.render === 'function') window.LedgerHealth.render();
    if (window.LedgerPlanner && typeof window.LedgerPlanner.render === 'function') window.LedgerPlanner.render();

    status.classList.remove('is-error');
    status.textContent = 'Added ' + description + ' · ' + money(amount) + ' to Ledger.';
    result.hidden = true;
  });

  resetBtn.addEventListener('click', resetScanner);
})();


/* ==========================================
   SMART IMPORT METHOD SWITCHER
========================================== */
(function initSmartImportTabs() {
  const buttons = document.querySelectorAll('[data-import-method]');
  const panels = document.querySelectorAll('[data-import-panel]');
  if (!buttons.length || !panels.length) return;

  function selectMethod(method) {
    buttons.forEach(button => {
      const active = button.dataset.importMethod === method;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    panels.forEach(panel => {
      panel.hidden = panel.dataset.importPanel !== method;
    });
  }

  buttons.forEach(button => {
    button.addEventListener('click', () => selectMethod(button.dataset.importMethod));
  });

  selectMethod('receipt');
})();
