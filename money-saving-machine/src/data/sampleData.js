// 6 months of realistic sample transaction data for demo purposes
export function generateSampleTransactions() {
  const merchants = {
    'Housing': [
      { name: 'Rent Payment', min: 1800, max: 1800 },
    ],
    'Groceries': [
      { name: 'Whole Foods', min: 40, max: 180 },
      { name: 'Trader Joes', min: 25, max: 95 },
      { name: 'Costco', min: 80, max: 250 },
    ],
    'Food & Dining': [
      { name: 'Chipotle', min: 10, max: 18 },
      { name: 'Starbucks', min: 5, max: 9 },
      { name: 'DoorDash', min: 15, max: 55 },
      { name: 'Uber Eats', min: 18, max: 48 },
      { name: 'Local Restaurant', min: 25, max: 85 },
    ],
    'Subscriptions': [
      { name: 'Netflix', min: 17, max: 17, recurring: true },
      { name: 'Spotify Premium', min: 11, max: 11, recurring: true },
      { name: 'Hulu', min: 18, max: 18, recurring: true },
      { name: 'Disney Plus', min: 14, max: 14, recurring: true },
      { name: 'YouTube Premium', min: 14, max: 14, recurring: true },
      { name: 'HBO Max', min: 16, max: 16, recurring: true },
      { name: 'Amazon Prime', min: 15, max: 15, recurring: true },
      { name: 'iCloud Storage', min: 3, max: 3, recurring: true },
      { name: 'Google One', min: 3, max: 3, recurring: true },
      { name: 'ChatGPT Plus', min: 20, max: 20, recurring: true },
      { name: 'Adobe Creative', min: 55, max: 55, recurring: true },
      { name: 'Gym Membership', min: 50, max: 50, recurring: true },
    ],
    'Transportation': [
      { name: 'Shell Gas Station', min: 35, max: 65 },
      { name: 'Uber', min: 8, max: 35 },
      { name: 'Car Insurance', min: 165, max: 165, recurring: true },
    ],
    'Shopping': [
      { name: 'Amazon', min: 10, max: 200 },
      { name: 'Target', min: 15, max: 120 },
      { name: 'Best Buy', min: 30, max: 300 },
    ],
    'Bills & Utilities': [
      { name: 'Electric Bill', min: 85, max: 145, recurring: true },
      { name: 'Internet - Xfinity', min: 80, max: 80, recurring: true },
      { name: 'Phone - T-Mobile', min: 75, max: 75, recurring: true },
      { name: 'Water Bill', min: 35, max: 55, recurring: true },
    ],
    'Entertainment': [
      { name: 'Movie Theater', min: 15, max: 40 },
      { name: 'Concert Tickets', min: 50, max: 200 },
      { name: 'Gaming - Steam', min: 10, max: 60 },
    ],
    'Health & Wellness': [
      { name: 'CVS Pharmacy', min: 10, max: 45 },
      { name: 'Doctor Copay', min: 30, max: 30 },
    ],
    'Personal Care': [
      { name: 'Haircut', min: 25, max: 40 },
      { name: 'Skin Care Products', min: 15, max: 60 },
    ],
    'Insurance': [
      { name: 'Health Insurance', min: 350, max: 350, recurring: true },
    ],
  };

  const transactions = [];
  const now = new Date();

  for (let monthOffset = 5; monthOffset >= 0; monthOffset--) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    Object.entries(merchants).forEach(([category, items]) => {
      items.forEach(item => {
        if (item.recurring) {
          // Recurring: once per month, slight fee creep on some
          let amount = item.min;
          if (['Internet - Xfinity', 'Adobe Creative'].includes(item.name) && monthOffset <= 2) {
            amount = item.min * 1.08; // 8% price increase in recent months
          }
          const day = Math.min(Math.floor(Math.random() * 5) + 1, daysInMonth);
          transactions.push({
            Date: `${month + 1}/${day}/${year}`,
            Description: item.name,
            Category: category,
            Amount: `-${amount.toFixed(2)}`
          });
        } else {
          // Variable: random occurrences
          const occurrences = category === 'Food & Dining'
            ? Math.floor(Math.random() * 6) + 2
            : category === 'Groceries'
            ? Math.floor(Math.random() * 3) + 1
            : Math.random() > 0.4 ? Math.floor(Math.random() * 3) + 1 : 0;

          for (let i = 0; i < occurrences; i++) {
            const day = Math.floor(Math.random() * daysInMonth) + 1;
            const amount = item.min + Math.random() * (item.max - item.min);
            transactions.push({
              Date: `${month + 1}/${day}/${year}`,
              Description: item.name,
              Category: category,
              Amount: `-${amount.toFixed(2)}`
            });
          }
        }
      });
    });

    // Add income
    transactions.push({
      Date: `${month + 1}/1/${year}`,
      Description: 'Payroll Direct Deposit',
      Category: 'Income',
      Amount: '2750.00'
    });
    transactions.push({
      Date: `${month + 1}/15/${year}`,
      Description: 'Payroll Direct Deposit',
      Category: 'Income',
      Amount: '2750.00'
    });
  }

  return transactions;
}
