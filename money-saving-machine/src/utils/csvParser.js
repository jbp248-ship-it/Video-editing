import Papa from 'papaparse';

export function parseCSV(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const transactions = results.data
          .map(row => normalizeTransaction(row))
          .filter(t => t !== null);
        resolve(transactions);
      },
      error: (error) => reject(error)
    });
  });
}

function normalizeTransaction(row) {
  const dateStr = row['Date'] || row['date'] || row['Transaction Date'] || row['Posted Date'] || '';
  const description = row['Description'] || row['description'] || row['Name'] || row['Merchant'] || row['Original Description'] || '';
  const category = row['Category'] || row['category'] || row['Type'] || 'Uncategorized';
  const amountRaw = row['Amount'] || row['amount'] || row['Debit'] || '0';

  const amount = parseFloat(String(amountRaw).replace(/[$,]/g, ''));
  if (isNaN(amount) || !description) return null;

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return null;

  return {
    date,
    month: date.toLocaleString('default', { month: 'short', year: 'numeric' }),
    description: description.trim(),
    category: normalizeCategory(category.trim()),
    amount: Math.abs(amount),
    isIncome: amount > 0 && (category.toLowerCase().includes('income') || category.toLowerCase().includes('payroll')),
    isRecurring: false,
    merchant: extractMerchant(description),
    raw: row
  };
}

function extractMerchant(desc) {
  return desc
    .replace(/\b(payment|purchase|pos|debit|credit|ach|wire|transfer)\b/gi, '')
    .replace(/\d{4,}/g, '')
    .replace(/[*#]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join(' ');
}

function normalizeCategory(cat) {
  const map = {
    'food & drink': 'Food & Dining',
    'food': 'Food & Dining',
    'dining': 'Food & Dining',
    'restaurants': 'Food & Dining',
    'groceries': 'Groceries',
    'grocery': 'Groceries',
    'entertainment': 'Entertainment',
    'streaming': 'Subscriptions',
    'subscription': 'Subscriptions',
    'subscriptions': 'Subscriptions',
    'shopping': 'Shopping',
    'transportation': 'Transportation',
    'transport': 'Transportation',
    'gas': 'Transportation',
    'auto': 'Transportation',
    'car': 'Transportation',
    'utilities': 'Utilities',
    'bills': 'Bills & Utilities',
    'bills & utilities': 'Bills & Utilities',
    'health': 'Health & Wellness',
    'healthcare': 'Health & Wellness',
    'medical': 'Health & Wellness',
    'fitness': 'Health & Wellness',
    'travel': 'Travel',
    'housing': 'Housing',
    'rent': 'Housing',
    'mortgage': 'Housing',
    'insurance': 'Insurance',
    'education': 'Education',
    'personal care': 'Personal Care',
    'pets': 'Pets',
    'gifts': 'Gifts & Donations',
    'donations': 'Gifts & Donations',
    'income': 'Income',
    'payroll': 'Income',
    'transfer': 'Transfers',
  };
  return map[cat.toLowerCase()] || cat;
}

export function analyzeTransactions(transactions, monthlyIncome) {
  const expenses = transactions.filter(t => !t.isIncome);
  const totalSpent = expenses.reduce((sum, t) => sum + t.amount, 0);
  const months = [...new Set(expenses.map(t => t.month))];
  const monthCount = Math.max(months.length, 1);
  const monthlySpend = totalSpent / monthCount;

  // Category breakdown
  const categoryTotals = {};
  expenses.forEach(t => {
    categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount;
  });

  const categoryBreakdown = Object.entries(categoryTotals)
    .map(([name, total]) => ({
      name,
      total,
      monthly: total / monthCount,
      percentage: (total / totalSpent) * 100,
      transactions: expenses.filter(t => t.category === name)
    }))
    .sort((a, b) => b.total - a.total);

  // Merchant breakdown
  const merchantTotals = {};
  expenses.forEach(t => {
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
      isRecurring: data.months.size >= 3 && data.count >= 3
    }))
    .sort((a, b) => b.total - a.total);

  // Monthly trend
  const monthlyTrend = months.map(m => {
    const monthExpenses = expenses.filter(t => t.month === m);
    const monthTotal = monthExpenses.reduce((s, t) => s + t.amount, 0);
    return { month: m, total: monthTotal };
  }).sort((a, b) => a.month.localeCompare(b.month));

  // 50/30/20 analysis
  const needs = ['Housing', 'Groceries', 'Utilities', 'Bills & Utilities', 'Insurance', 'Transportation', 'Health & Wellness'];
  const savings = ['Transfers']; // transfers to savings
  const needsTotal = expenses.filter(t => needs.includes(t.category)).reduce((s, t) => s + t.amount, 0);
  const savingsTotal = expenses.filter(t => savings.includes(t.category)).reduce((s, t) => s + t.amount, 0);
  const wantsTotal = totalSpent - needsTotal - savingsTotal;

  const incomeBase = monthlyIncome * monthCount || totalSpent;
  const budgetAnalysis = {
    needs: { amount: needsTotal, percentage: (needsTotal / incomeBase) * 100, target: 50 },
    wants: { amount: wantsTotal, percentage: (wantsTotal / incomeBase) * 100, target: 30 },
    savings: {
      amount: Math.max(0, (monthlyIncome * monthCount) - totalSpent),
      percentage: monthlyIncome ? ((monthlyIncome * monthCount - totalSpent) / (monthlyIncome * monthCount)) * 100 : 0,
      target: 20
    }
  };

  // Financial health score
  const healthScore = calculateHealthScore(budgetAnalysis, merchantBreakdown, monthlySpend, monthlyIncome);

  // Spending personality
  const personality = determinePersonality(categoryBreakdown, totalSpent);

  return {
    totalSpent,
    monthlySpend,
    monthCount,
    months,
    categoryBreakdown,
    merchantBreakdown,
    monthlyTrend,
    budgetAnalysis,
    healthScore,
    personality,
    expenses,
    transactions
  };
}

function calculateHealthScore(budget, merchants, monthlySpend, income) {
  let score = 50;

  // Budget adherence
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

  // Recurring subscription load
  const recurringCount = merchants.filter(m => m.isRecurring).length;
  if (recurringCount <= 5) score += 5;
  else if (recurringCount > 10) score -= 5;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function determinePersonality(categories, total) {
  const top = categories[0];
  if (!top) return { type: 'Balanced', description: 'Your spending is well-distributed.' };

  const pct = top.percentage;
  const profiles = {
    'Food & Dining': { type: 'The Foodie', desc: `${pct.toFixed(0)}% of spending goes to dining. You love great food — let's make sure it's not eating your wealth.` },
    'Shopping': { type: 'The Spender', desc: `${pct.toFixed(0)}% goes to shopping. You enjoy treating yourself — let's redirect some of that energy into wealth.` },
    'Entertainment': { type: 'The Experience Seeker', desc: `${pct.toFixed(0)}% on entertainment. You invest in experiences — let's also invest in your future.` },
    'Travel': { type: 'The Explorer', desc: `${pct.toFixed(0)}% on travel. Adventure is calling — and so is compound interest.` },
    'Subscriptions': { type: 'The Subscriber', desc: `${pct.toFixed(0)}% on subscriptions. Convenience is king for you — but some of these might be forgotten.` },
    'Transportation': { type: 'The Commuter', desc: `${pct.toFixed(0)}% on transportation. Getting around isn't cheap — let's see if there are savings.` },
  };

  return profiles[top.name] || { type: 'The Optimizer', desc: `Your top category is ${top.name} at ${pct.toFixed(0)}%. Let's find ways to optimize.` };
}

export function detectLeaks(analysis) {
  const leaks = [];
  const { merchantBreakdown, monthCount } = analysis;

  // Recurring subscriptions
  merchantBreakdown.filter(m => m.isRecurring).forEach(m => {
    leaks.push({
      type: 'subscription',
      merchant: m.name,
      monthlyAmount: m.monthly,
      annualAmount: m.monthly * 12,
      severity: m.monthly > 50 ? 'high' : m.monthly > 20 ? 'medium' : 'low',
      message: `Recurring charge: $${m.monthly.toFixed(2)}/mo for ${m.name}`,
      suggestion: `Review if you still use ${m.name}. Could save $${(m.monthly * 12).toFixed(0)}/yr.`
    });
  });

  // Fee creep detection
  merchantBreakdown.filter(m => m.isRecurring && m.count >= 4).forEach(m => {
    const txns = analysis.expenses
      .filter(t => (t.merchant || t.description) === m.name)
      .sort((a, b) => a.date - b.date);
    if (txns.length >= 2) {
      const first = txns[0].amount;
      const last = txns[txns.length - 1].amount;
      if (last > first * 1.05) {
        leaks.push({
          type: 'fee_creep',
          merchant: m.name,
          monthlyAmount: last - first,
          annualAmount: (last - first) * 12,
          severity: (last - first) > 10 ? 'high' : 'medium',
          message: `Price increased: ${m.name} went from $${first.toFixed(2)} to $${last.toFixed(2)}`,
          suggestion: `${m.name} raised prices by $${(last - first).toFixed(2)}/mo. Call to negotiate or find an alternative.`
        });
      }
    }
  });

  // Duplicate/overlapping services
  const streamingServices = ['netflix', 'hulu', 'disney', 'hbo', 'max', 'peacock', 'paramount', 'apple tv', 'amazon prime', 'youtube premium', 'crunchyroll', 'discovery'];
  const musicServices = ['spotify', 'apple music', 'tidal', 'pandora', 'youtube music', 'amazon music', 'deezer'];
  const cloudServices = ['icloud', 'google one', 'dropbox', 'onedrive', 'box'];
  const foodDelivery = ['doordash', 'ubereats', 'uber eats', 'grubhub', 'postmates', 'instacart'];

  [
    { services: streamingServices, label: 'streaming' },
    { services: musicServices, label: 'music streaming' },
    { services: cloudServices, label: 'cloud storage' },
    { services: foodDelivery, label: 'food delivery' }
  ].forEach(({ services, label }) => {
    const found = merchantBreakdown.filter(m =>
      services.some(s => m.name.toLowerCase().includes(s))
    );
    if (found.length > 1) {
      const totalMonthly = found.reduce((s, m) => s + m.monthly, 0);
      leaks.push({
        type: 'duplicate',
        merchant: found.map(f => f.name).join(', '),
        monthlyAmount: totalMonthly,
        annualAmount: totalMonthly * 12,
        severity: 'high',
        message: `${found.length} overlapping ${label} services: ${found.map(f => f.name).join(', ')}`,
        suggestion: `You have ${found.length} ${label} services ($${totalMonthly.toFixed(2)}/mo). Consider keeping just 1-2.`
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
    if (m % 12 === 0) {
      monthly.push({
        year: m / 12,
        balance: Math.round(balance),
        contributed: monthlySavings * m,
        growth: Math.round(balance - monthlySavings * m)
      });
    }
  }

  return {
    finalBalance: Math.round(balance),
    totalContributed: monthlySavings * totalMonths,
    totalGrowth: Math.round(balance - monthlySavings * totalMonths),
    timeline: monthly
  };
}

export function generateActionPlan(leaks, analysis, monthlyIncome) {
  const actions = leaks.map((leak, i) => ({
    id: i + 1,
    priority: leak.severity === 'high' ? 1 : leak.severity === 'medium' ? 2 : 3,
    title: `Cut ${leak.merchant}`,
    type: leak.type,
    monthlySavings: leak.monthlyAmount,
    annualSavings: leak.annualAmount,
    difficulty: leak.type === 'subscription' ? 'Easy' : 'Medium',
    action: leak.suggestion,
    automation: `Cancel ${leak.merchant} → Set up auto-transfer of $${leak.monthlyAmount.toFixed(2)}/mo to your Roth IRA on the 1st of each month`
  }));

  // Add budget-based recommendations
  const { budgetAnalysis } = analysis;
  if (budgetAnalysis.wants.percentage > 35) {
    const excess = ((budgetAnalysis.wants.percentage - 30) / 100) * monthlyIncome;
    actions.push({
      id: actions.length + 1,
      priority: 1,
      title: 'Reduce "wants" spending',
      type: 'budget',
      monthlySavings: excess,
      annualSavings: excess * 12,
      difficulty: 'Medium',
      action: `Your "wants" spending is ${budgetAnalysis.wants.percentage.toFixed(0)}% (target: 30%). Reducing by $${excess.toFixed(0)}/mo puts you on track.`,
      automation: `Set a monthly "wants" budget of $${(monthlyIncome * 0.3).toFixed(0)} and auto-transfer the rest to savings.`
    });
  }

  return actions.sort((a, b) => a.priority - b.priority || b.annualSavings - a.annualSavings);
}

export function generateNegotiationScript(billName, currentAmount) {
  return `Hi, I've been a loyal ${billName} customer and I'd like to discuss my current rate of $${currentAmount.toFixed(2)}/month.

1. "I've been reviewing my budget and found competitors offering similar service for less. I'd love to stay with ${billName} — can you match or beat [competitor rate]?"

2. If they say no: "Is there a retention department I could speak with? I'm seriously considering switching."

3. If transferred: "I appreciate your help. I've been a customer for [X years] and I'd like to stay, but I need a better rate to justify it. What promotions or loyalty discounts are available?"

4. If still no: "Could you at least waive any fees or give me a temporary discount for the next 6 months while I evaluate my options?"

Key tips:
- Call on a Tuesday or Wednesday (less busy, reps have more flexibility)
- Be polite but firm — you're a customer they want to keep
- Have a competitor's offer ready to reference
- Ask for a specific dollar amount you want to pay`;
}
