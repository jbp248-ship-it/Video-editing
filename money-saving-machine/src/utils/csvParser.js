import Papa from 'papaparse';
import * as XLSX from 'xlsx';

// ── Main entry: auto-detect CSV vs Excel ──────────────────────────
export function parseFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'xlsx' || ext === 'xls') return parseExcel(file);
  return parseCSV(file);
}

export function parseCSV(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.data.length > 0) {
          console.log('CSV columns:', Object.keys(results.data[0]));
          console.log('Sample row:', results.data[0]);
        }
        const format = detectFormat(results.data[0] || {});
        console.log('Detected format:', format);
        const transactions = results.data.map(row => normalizeTransaction(row, format)).filter(Boolean);
        logSummary(transactions);
        resolve(transactions);
      },
      error: reject,
    });
  });
}

function parseExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        if (rows.length > 0) {
          console.log('Excel columns:', Object.keys(rows[0]));
          console.log('Sample row:', rows[0]);
        }
        const format = detectFormat(rows[0] || {});
        console.log('Detected format:', format);
        const transactions = rows.map(row => normalizeTransaction(row, format)).filter(Boolean);
        logSummary(transactions);
        resolve(transactions);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function logSummary(txns) {
  const income = txns.filter(t => t.isIncome).length;
  const transfers = txns.filter(t => t.isTransfer).length;
  const expenses = txns.filter(t => !t.isIncome && !t.isTransfer).length;
  console.log(`Parsed ${txns.length} transactions — Income: ${income}, Transfers: ${transfers}, Expenses: ${expenses}`);
}

// ── Format auto-detection ─────────────────────────────────────────
function detectFormat(row) {
  const keys = Object.keys(row).map(k => k.toLowerCase().trim());
  // Rocket Money
  if (keys.includes('original description') || keys.includes('account name'))
    return 'rocket_money';
  // Mint
  if (keys.includes('labels') || keys.includes('notes') && keys.includes('original description'))
    return 'mint';
  // Chase
  if (keys.includes('details') && keys.includes('posting date'))
    return 'chase';
  // Bank of America
  if (keys.includes('reference number'))
    return 'boa';
  // Capital One
  if (keys.includes('card no.') || keys.includes('card no'))
    return 'capital_one';
  // Wells Fargo (no headers sometimes)
  if (keys.length <= 5 && keys.some(k => k.match(/^\d/)))
    return 'wells_fargo';
  return 'generic';
}

// ── Column mapping per format ─────────────────────────────────────
function getColumns(row, format) {
  const get = (...candidates) => {
    for (const c of candidates) {
      const match = Object.keys(row).find(k => k.toLowerCase().trim() === c.toLowerCase());
      if (match && row[match] !== undefined && row[match] !== '') return row[match];
    }
    return '';
  };

  return {
    date: get('Date', 'Transaction Date', 'Posted Date', 'Posting Date', 'date'),
    description: get('Description', 'Name', 'Merchant', 'Original Description', 'Payee', 'description', 'DESCRIPTION'),
    category: get('Category', 'category'),
    amount: get('Amount', 'amount', 'AMOUNT'),
    credit: get('Credit', 'credit'),
    debit: get('Debit', 'debit'),
    type: get('Transaction Type', 'Type', 'Details', 'type'),
    accountName: get('Account Name', 'Account', 'account name'),
    // Rocket Money specific
    status: get('Status', 'status'),
    notes: get('Notes', 'Note', 'Memo', 'memo'),
  };
}

// ── Transaction normalization ─────────────────────────────────────
function normalizeTransaction(row, format) {
  const cols = getColumns(row, format);

  // Parse date
  const date = new Date(cols.date);
  if (isNaN(date.getTime())) return null;

  // Parse description
  const description = String(cols.description || '').trim();
  if (!description) return null;

  // Parse amount — handle multiple conventions
  // Key insight: In most CSVs, NEGATIVE = money out (expense), POSITIVE = money in (income/refund)
  // But some banks flip this. We detect and handle both.
  let amount;
  let isDebit; // true = money leaving your account

  if (cols.debit && cols.credit) {
    // Separate debit/credit columns (Chase, BoA)
    const debit = parseFloat(String(cols.debit).replace(/[$,()]/g, '')) || 0;
    const credit = parseFloat(String(cols.credit).replace(/[$,()]/g, '')) || 0;
    amount = debit > 0 ? debit : credit;
    isDebit = debit > 0;
  } else {
    const rawAmount = String(cols.amount);
    amount = parseFloat(rawAmount.replace(/[$,()]/g, ''));
    if (rawAmount.includes('(')) amount = Math.abs(amount); // parenthetical = expense
    if (isNaN(amount)) return null;

    // Determine direction: negative = expense in most formats
    // But in Rocket Money, expenses are positive and income is also positive with different category
    const typeLower = (cols.type || '').toLowerCase();
    if (typeLower === 'debit' || typeLower === 'sale' || typeLower === 'purchase') {
      isDebit = true;
      amount = Math.abs(amount);
    } else if (typeLower === 'credit' || typeLower === 'deposit' || typeLower === 'refund' || typeLower === 'return') {
      isDebit = false;
      amount = Math.abs(amount);
    } else if (amount < 0) {
      // Standard convention: negative = money out
      isDebit = true;
      amount = Math.abs(amount);
    } else {
      // Positive amount — could be income OR expense depending on format
      // Check category/description to decide
      const catLower = (cols.category || '').toLowerCase();
      const incomeHints = ['income', 'payroll', 'salary', 'deposit', 'direct deposit', 'refund', 'return', 'credit', 'reimbursement', 'cashback', 'interest'];
      const isLikelyIncome = incomeHints.some(h => catLower.includes(h) || description.toLowerCase().includes(h));
      isDebit = !isLikelyIncome;
    }
  }
  if (isNaN(amount) || amount === 0) return null;

  const descLower = description.toLowerCase();
  const catLower = (cols.category || '').toLowerCase();
  const typeLower = (cols.type || '').toLowerCase();

  // Income: money coming IN (paycheck, deposits, refunds from work)
  const isIncome = !isDebit || detectIncome(descLower, catLower, typeLower);
  // Transfer: money moving between YOUR accounts (not real spending)
  const isTransfer = !isIncome && detectTransfer(descLower, catLower, typeLower, cols.accountName);
  // Refund: money coming back from a purchase
  const isRefund = !isIncome && !isTransfer && !isDebit;

  console.log(`[${isIncome ? 'INCOME' : isTransfer ? 'XFER' : isRefund ? 'REFUND' : 'EXPENSE'}] $${amount.toFixed(2)} — ${description} (cat: ${cols.category}, type: ${cols.type})`);

  return {
    date,
    month: date.toLocaleString('default', { month: 'short', year: 'numeric' }),
    description: description,
    category: normalizeCategory(cols.category || 'Uncategorized'),
    amount,
    isIncome,
    isTransfer,
    isRefund,
    isDebit,
    isRecurring: false,
    merchant: extractMerchant(description),
    raw: row,
  };
}

// ── Income detection ──────────────────────────────────────────────
function detectIncome(desc, cat, type) {
  const incomeKeywords = [
    'income', 'payroll', 'salary', 'direct deposit', 'employer',
    'paycheck', 'wage', 'commission', 'dividend', 'interest earned',
    'tax refund', 'reimbursement', 'deposit', 'cashback', 'cash back',
    'rewards', 'venmo from', 'zelle from',
  ];
  const incomeCategories = ['income', 'payroll', 'salary', 'deposit', 'reimbursement'];
  const incomeTypes = ['credit', 'deposit', 'refund'];

  if (incomeCategories.some(k => cat === k || cat.includes(k))) return true;
  if (incomeTypes.some(k => type === k)) return true;
  if (incomeKeywords.some(k => desc.includes(k))) return true;
  return false;
}

// ── Transfer detection (the critical fix) ─────────────────────────
function detectTransfer(desc, cat, type, accountName) {
  // Category-based (most reliable for Rocket Money / Mint)
  const transferCategories = [
    'transfer', 'credit card payment', 'credit card', 'payment',
    'investment', 'investments', 'mortgage & rent', 'loan',
    'loans', 'debt payment', 'hide from budgets',
  ];
  if (transferCategories.some(c => cat === c || cat.includes(c))) return true;

  // Transaction type field
  if (type === 'transfer' || type === 'payment' || type === 'adjustment') return true;

  // Description-based patterns
  const transferPatterns = [
    // Credit card payments
    /credit card payment/i, /card payment/i, /payment to .*(card|credit)/i,
    /pay credit/i, /autopay.*card/i, /minimum payment/i,
    /statement balance/i, /paying credit/i,
    // Account-to-account transfers
    /transfer (to|from)/i, /online transfer/i, /internal transfer/i,
    /savings transfer/i, /checking transfer/i, /wire transfer/i,
    /account transfer/i, /xfer /i, /ach transfer/i,
    // Investment & retirement
    /ira (contribution|deposit)/i, /401[kK]/, /roth/i,
    /brokerage/i, /fidelity/i, /vanguard/i, /schwab/i,
    /ameritrade/i, /etrade/i, /robinhood.*transfer/i,
    /betterment/i, /wealthfront/i,
    // Loan payments (principal movement, not spending)
    /loan payment/i, /mortgage payment/i, /student loan/i,
    /auto loan/i, /car payment/i,
    // P2P over certain threshold often = rent/splits not real "spending"
    /venmo.*cashout/i, /cash app.*transfer/i,
  ];
  if (transferPatterns.some(p => p.test(desc))) return true;

  return false;
}

function extractMerchant(desc) {
  return desc
    .replace(/\b(payment|purchase|pos|debit|credit|ach|wire|transfer|online|recurring|autopay)\b/gi, '')
    .replace(/\d{4,}/g, '')
    .replace(/[*#]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join(' ');
}

function normalizeCategory(cat) {
  const map = {
    'food & drink': 'Food & Dining', 'food': 'Food & Dining',
    'dining': 'Food & Dining', 'restaurants': 'Food & Dining',
    'fast food': 'Food & Dining', 'coffee shops': 'Food & Dining',
    'groceries': 'Groceries', 'grocery': 'Groceries',
    'entertainment': 'Entertainment', 'amusement': 'Entertainment',
    'streaming': 'Subscriptions', 'subscription': 'Subscriptions', 'subscriptions': 'Subscriptions',
    'shopping': 'Shopping', 'clothing': 'Shopping', 'electronics': 'Shopping',
    'general merchandise': 'Shopping', 'merchandise': 'Shopping',
    'transportation': 'Transportation', 'transport': 'Transportation',
    'gas': 'Transportation', 'gas & fuel': 'Transportation',
    'auto': 'Transportation', 'car': 'Transportation', 'parking': 'Transportation',
    'ride share': 'Transportation', 'rideshare': 'Transportation',
    'utilities': 'Bills & Utilities', 'bills': 'Bills & Utilities',
    'bills & utilities': 'Bills & Utilities', 'phone': 'Bills & Utilities',
    'internet': 'Bills & Utilities', 'cable': 'Bills & Utilities',
    'electric': 'Bills & Utilities', 'water': 'Bills & Utilities',
    'mobile phone': 'Bills & Utilities', 'television': 'Bills & Utilities',
    'health': 'Health & Wellness', 'healthcare': 'Health & Wellness',
    'medical': 'Health & Wellness', 'fitness': 'Health & Wellness',
    'doctor': 'Health & Wellness', 'pharmacy': 'Health & Wellness',
    'travel': 'Travel', 'hotels': 'Travel', 'airlines': 'Travel', 'vacation': 'Travel',
    'housing': 'Housing', 'rent': 'Housing', 'mortgage': 'Housing', 'mortgage & rent': 'Housing',
    'insurance': 'Insurance', 'auto insurance': 'Insurance', 'life insurance': 'Insurance',
    'education': 'Education', 'tuition': 'Education', 'books': 'Education',
    'personal care': 'Personal Care', 'hair': 'Personal Care', 'spa': 'Personal Care',
    'pets': 'Pets', 'pet care': 'Pets', 'veterinary': 'Pets',
    'gifts': 'Gifts & Donations', 'gifts & donations': 'Gifts & Donations',
    'donations': 'Gifts & Donations', 'charity': 'Gifts & Donations',
    'income': 'Income', 'payroll': 'Income', 'salary': 'Income',
    'transfer': 'Transfers', 'credit card payment': 'Transfers',
    'credit card': 'Transfers', 'payment': 'Transfers',
    'investment': 'Transfers', 'investments': 'Transfers',
    'loan': 'Debt Payments', 'loans': 'Debt Payments',
    'fees': 'Fees & Charges', 'fees & charges': 'Fees & Charges',
    'fee': 'Fees & Charges', 'bank fee': 'Fees & Charges',
    'atm': 'Cash & ATM', 'cash': 'Cash & ATM', 'atm fee': 'Fees & Charges',
    'home': 'Home', 'home improvement': 'Home', 'home supplies': 'Home',
    'alcohol & bars': 'Food & Dining', 'bars': 'Food & Dining',
    'business services': 'Business', 'office supplies': 'Business',
    'taxes': 'Taxes', 'tax': 'Taxes',
    'kids': 'Kids', 'child care': 'Kids', 'baby': 'Kids',
    'uncategorized': 'Other', 'misc': 'Other', 'other': 'Other',
    'hide from budgets': 'Excluded',
  };
  return map[cat.toLowerCase().trim()] || cat;
}

// ── Analysis engine ───────────────────────────────────────────────
export function analyzeTransactions(transactions, monthlyIncome) {
  const expenses = transactions.filter(t => !t.isIncome && !t.isTransfer && !t.isRefund);
  const transfers = transactions.filter(t => t.isTransfer);
  const refunds = transactions.filter(t => t.isRefund);
  const income = transactions.filter(t => t.isIncome);

  const totalSpent = expenses.reduce((sum, t) => sum + t.amount, 0);
  const totalRefunds = refunds.reduce((sum, t) => sum + t.amount, 0);
  const netSpent = totalSpent - totalRefunds;

  const months = [...new Set(transactions.map(t => t.month))];
  const monthCount = Math.max(months.length, 1);
  const monthlySpend = netSpent / monthCount;

  // Category breakdown
  const categoryTotals = {};
  expenses.forEach(t => {
    if (t.category === 'Excluded' || t.category === 'Transfers') return;
    categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount;
  });

  const categoryBreakdown = Object.entries(categoryTotals)
    .map(([name, total]) => ({
      name, total,
      monthly: total / monthCount,
      percentage: netSpent > 0 ? (total / netSpent) * 100 : 0,
      transactions: expenses.filter(t => t.category === name),
    }))
    .sort((a, b) => b.total - a.total);

  // Merchant breakdown
  const merchantTotals = {};
  expenses.forEach(t => {
    if (t.category === 'Excluded' || t.category === 'Transfers') return;
    const m = t.merchant || t.description;
    if (!merchantTotals[m]) merchantTotals[m] = { total: 0, count: 0, category: t.category, months: new Set() };
    merchantTotals[m].total += t.amount;
    merchantTotals[m].count++;
    merchantTotals[m].months.add(t.month);
  });

  const merchantBreakdown = Object.entries(merchantTotals)
    .map(([name, data]) => ({
      name,
      total: data.total,
      monthly: data.total / monthCount,
      count: data.count,
      category: data.category,
      monthsActive: data.months.size,
      isRecurring: data.months.size >= Math.min(3, monthCount) && data.count >= Math.min(3, monthCount),
    }))
    .sort((a, b) => b.total - a.total);

  // Monthly trend
  const expenseMonths = [...new Set(expenses.map(t => t.month))];
  const monthlyTrend = expenseMonths.map(m => ({
    month: m,
    total: expenses.filter(t => t.month === m).reduce((s, t) => s + t.amount, 0),
  })).sort((a, b) => new Date('1 ' + a.month) - new Date('1 ' + b.month));

  // 50/30/20 analysis
  const needsCats = ['Housing', 'Groceries', 'Bills & Utilities', 'Utilities', 'Insurance', 'Transportation', 'Health & Wellness', 'Debt Payments'];
  const needsTotal = expenses.filter(t => needsCats.includes(t.category)).reduce((s, t) => s + t.amount, 0);
  const wantsTotal = netSpent - needsTotal;

  const incomeBase = monthlyIncome * monthCount || netSpent;
  const budgetAnalysis = {
    needs: { amount: needsTotal, percentage: (needsTotal / incomeBase) * 100, target: 50 },
    wants: { amount: wantsTotal, percentage: (wantsTotal / incomeBase) * 100, target: 30 },
    savings: {
      amount: Math.max(0, monthlyIncome * monthCount - netSpent),
      percentage: monthlyIncome ? ((monthlyIncome * monthCount - netSpent) / (monthlyIncome * monthCount)) * 100 : 0,
      target: 20,
    },
  };

  const healthScore = calculateHealthScore(budgetAnalysis, merchantBreakdown, monthlySpend, monthlyIncome);
  const personality = determinePersonality(categoryBreakdown, netSpent);

  return {
    totalSpent: netSpent, monthlySpend, monthCount, months,
    categoryBreakdown, merchantBreakdown, monthlyTrend, budgetAnalysis,
    healthScore, personality, expenses, transactions,
    excluded: { transfers, refunds, income },
  };
}

function calculateHealthScore(budget, merchants, monthlySpend, income) {
  let score = 50;
  if (budget.needs.percentage <= 55) score += 15;
  else if (budget.needs.percentage <= 65) score += 5;
  else score -= 10;
  if (budget.wants.percentage <= 35) score += 10;
  else if (budget.wants.percentage <= 45) score += 0;
  else score -= 10;
  if (budget.savings.percentage >= 20) score += 20;
  else if (budget.savings.percentage >= 10) score += 10;
  else if (budget.savings.percentage >= 0) score += 0;
  else score -= 15;
  const recurringCount = merchants.filter(m => m.isRecurring).length;
  if (recurringCount <= 5) score += 5;
  else if (recurringCount > 10) score -= 5;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function determinePersonality(categories, total) {
  const top = categories[0];
  if (!top) return { type: 'Balanced', desc: 'Your spending is well-distributed.' };
  const pct = top.percentage;
  const profiles = {
    'Food & Dining': { type: 'The Foodie', desc: `${pct.toFixed(0)}% of spending goes to dining — let's make sure it's not eating your wealth.` },
    'Shopping': { type: 'The Spender', desc: `${pct.toFixed(0)}% goes to shopping — let's redirect some into wealth.` },
    'Entertainment': { type: 'The Experience Seeker', desc: `${pct.toFixed(0)}% on entertainment — let's also invest in your future.` },
    'Travel': { type: 'The Explorer', desc: `${pct.toFixed(0)}% on travel — adventure and compound interest can coexist.` },
    'Subscriptions': { type: 'The Subscriber', desc: `${pct.toFixed(0)}% on subscriptions — some of these might be forgotten.` },
    'Transportation': { type: 'The Commuter', desc: `${pct.toFixed(0)}% on transportation — let's see if there are savings.` },
  };
  return profiles[top.name] || { type: 'The Optimizer', desc: `Your top category is ${top.name} at ${pct.toFixed(0)}%.` };
}

// ── Leak detection ────────────────────────────────────────────────
export function detectLeaks(analysis) {
  const leaks = [];
  const { merchantBreakdown, monthCount, expenses } = analysis;

  merchantBreakdown.filter(m => m.isRecurring).forEach(m => {
    leaks.push({
      type: 'subscription', merchant: m.name, category: m.category,
      monthlyAmount: m.monthly, annualAmount: m.monthly * 12,
      severity: m.monthly > 50 ? 'high' : m.monthly > 20 ? 'medium' : 'low',
      message: `Recurring: $${m.monthly.toFixed(2)}/mo for ${m.name}`,
      suggestion: `Review if you still use ${m.name}. Could save $${(m.monthly * 12).toFixed(0)}/yr.`,
    });
  });

  // Fee creep
  merchantBreakdown.filter(m => m.isRecurring && m.count >= 4).forEach(m => {
    const txns = expenses.filter(t => (t.merchant || t.description) === m.name).sort((a, b) => a.date - b.date);
    if (txns.length >= 2) {
      const first = txns[0].amount, last = txns[txns.length - 1].amount;
      if (last > first * 1.05) {
        leaks.push({
          type: 'fee_creep', merchant: m.name, category: m.category,
          monthlyAmount: last - first, annualAmount: (last - first) * 12,
          severity: (last - first) > 10 ? 'high' : 'medium',
          message: `${m.name} went from $${first.toFixed(2)} to $${last.toFixed(2)}`,
          suggestion: `${m.name} raised prices. Call to negotiate or switch.`,
        });
      }
    }
  });

  // Duplicates
  const groups = [
    { services: ['netflix', 'hulu', 'disney', 'hbo', 'max', 'peacock', 'paramount', 'apple tv', 'amazon prime video', 'youtube premium', 'crunchyroll'], label: 'streaming' },
    { services: ['spotify', 'apple music', 'tidal', 'pandora', 'youtube music', 'amazon music', 'deezer'], label: 'music streaming' },
    { services: ['icloud', 'google one', 'dropbox', 'onedrive'], label: 'cloud storage' },
    { services: ['doordash', 'uber eats', 'grubhub', 'postmates', 'instacart'], label: 'food delivery' },
  ];
  groups.forEach(({ services, label }) => {
    const found = merchantBreakdown.filter(m => services.some(s => m.name.toLowerCase().includes(s)));
    if (found.length > 1) {
      const total = found.reduce((s, m) => s + m.monthly, 0);
      leaks.push({
        type: 'duplicate', merchant: found.map(f => f.name).join(', '), category: label,
        monthlyAmount: total, annualAmount: total * 12, severity: 'high',
        message: `${found.length} overlapping ${label} services`,
        suggestion: `You have ${found.length} ${label} services ($${total.toFixed(2)}/mo). Keep just 1-2.`,
      });
    }
  });

  return leaks.sort((a, b) => b.annualAmount - a.annualAmount);
}

export function calculateRothProjection(monthlySavings, years = 30, rate = 0.07) {
  const monthly = [];
  let balance = 0;
  const monthlyRate = rate / 12;
  const totalMonths = years * 12;
  for (let m = 1; m <= totalMonths; m++) {
    balance = (balance + monthlySavings) * (1 + monthlyRate);
    if (m % 12 === 0) monthly.push({ year: m / 12, balance: Math.round(balance), contributed: monthlySavings * m, growth: Math.round(balance - monthlySavings * m) });
  }
  return { finalBalance: Math.round(balance), totalContributed: monthlySavings * totalMonths, totalGrowth: Math.round(balance - monthlySavings * totalMonths), timeline: monthly };
}

export function generateActionPlan(leaks, analysis, monthlyIncome) {
  const actions = leaks.map((leak, i) => ({
    id: i + 1,
    priority: leak.severity === 'high' ? 1 : leak.severity === 'medium' ? 2 : 3,
    title: `Cut ${leak.merchant}`, type: leak.type,
    monthlySavings: leak.monthlyAmount, annualSavings: leak.annualAmount,
    difficulty: leak.type === 'subscription' ? 'Easy' : 'Medium',
    action: leak.suggestion,
    automation: `Cancel ${leak.merchant} → Auto-transfer $${leak.monthlyAmount.toFixed(2)}/mo to Roth IRA on the 1st`,
  }));

  const { budgetAnalysis } = analysis;
  if (budgetAnalysis.wants.percentage > 35) {
    const excess = ((budgetAnalysis.wants.percentage - 30) / 100) * monthlyIncome;
    actions.push({
      id: actions.length + 1, priority: 1, title: 'Reduce "wants" spending', type: 'budget',
      monthlySavings: excess, annualSavings: excess * 12, difficulty: 'Medium',
      action: `Wants at ${budgetAnalysis.wants.percentage.toFixed(0)}% (target: 30%). Cut $${excess.toFixed(0)}/mo.`,
      automation: `Set wants budget at $${(monthlyIncome * 0.3).toFixed(0)} and auto-transfer the rest.`,
    });
  }
  return actions.sort((a, b) => a.priority - b.priority || b.annualSavings - a.annualSavings);
}

export function generateNegotiationScript(billName, currentAmount) {
  return `Hi, I've been a loyal ${billName} customer and I'd like to discuss my rate of $${currentAmount.toFixed(2)}/month.

1. "I found competitors offering similar service for less. Can you match or beat their rate?"

2. If no: "Is there a retention department I could speak with?"

3. If transferred: "I've been a customer for a while and I'd like to stay, but I need a better rate. What promotions are available?"

4. If still no: "Could you waive fees or give a temporary discount for 6 months?"

Tips:
- Call Tuesday or Wednesday (reps have more flexibility)
- Be polite but firm
- Have a competitor's offer ready
- Ask for a specific dollar amount`;
}
