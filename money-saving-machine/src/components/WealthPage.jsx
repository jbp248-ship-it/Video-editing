import React, { useState, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { calculateRothProjection } from '../utils/csvParser';

function formatCurrency(val) {
  if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
  if (val >= 1000) return `$${(val / 1000).toFixed(0)}k`;
  return `$${val.toFixed(0)}`;
}

export default function WealthPage({ leaks, analysis, monthlyIncome }) {
  const totalLeaks = leaks.reduce((s, l) => s + l.monthlyAmount, 0);
  const [monthlySavings, setMonthlySavings] = useState(Math.round(totalLeaks));
  const [returnRate, setReturnRate] = useState(7);
  const [years, setYears] = useState(30);

  // Sliders for "what if"
  const [diningCut, setDiningCut] = useState(0);
  const [shoppingCut, setShoppingCut] = useState(0);
  const [subsCut, setSubsCut] = useState(0);

  const diningMonthly = analysis?.categoryBreakdown.find(c => c.name === 'Food & Dining')?.monthly || 0;
  const shoppingMonthly = analysis?.categoryBreakdown.find(c => c.name === 'Shopping')?.monthly || 0;
  const subsMonthly = analysis?.categoryBreakdown.find(c => c.name === 'Subscriptions')?.monthly || 0;

  const whatIfSavings = Math.round(
    monthlySavings +
    (diningMonthly * diningCut / 100) +
    (shoppingMonthly * shoppingCut / 100) +
    (subsMonthly * subsCut / 100)
  );

  const projection = useMemo(
    () => calculateRothProjection(whatIfSavings, years, returnRate / 100),
    [whatIfSavings, years, returnRate]
  );

  // Multi-rate comparison
  const rates = [7, 10, 12];
  const multiRate = useMemo(() => {
    return rates.map(r => ({
      rate: r,
      ...calculateRothProjection(whatIfSavings, years, r / 100)
    }));
  }, [whatIfSavings, years]);

  const comparisonData = useMemo(() => {
    const result = [];
    for (let y = 1; y <= years; y++) {
      const row = { year: y, spent: whatIfSavings * 12 * y };
      rates.forEach(r => {
        const p = calculateRothProjection(whatIfSavings, y, r / 100);
        row[`invested_${r}`] = p.finalBalance;
      });
      result.push(row);
    }
    return result;
  }, [whatIfSavings, years]);

  // Emergency fund
  const monthlyExpenses = analysis?.monthlySpend || 0;
  const emergencyTarget = monthlyExpenses * 6;
  const monthsToEmergency = whatIfSavings > 0 ? Math.ceil(emergencyTarget / whatIfSavings) : Infinity;

  // Debt payoff (simplified)
  const leftover = monthlyIncome - (analysis?.monthlySpend || 0);

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Build Wealth</h1>
        <p style={styles.subtitle}>Redirect your savings into compound growth</p>
      </div>

      {/* Top Stats */}
      <div style={styles.statsRow}>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>Monthly Savings to Invest</div>
          <div style={{ ...styles.statValue, color: '#10b981' }}>${whatIfSavings}</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>{years}-Year Roth IRA Projection (7%)</div>
          <div style={{ ...styles.statValue, color: '#3b82f6' }}>{formatCurrency(projection.finalBalance)}</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>Total Growth (Interest Earned)</div>
          <div style={{ ...styles.statValue, color: '#8b5cf6' }}>{formatCurrency(projection.totalGrowth)}</div>
        </div>
      </div>

      {/* Main Projection Chart */}
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>Roth IRA Growth: Spending It vs. Investing It</h3>
        <ResponsiveContainer width="100%" height={350}>
          <AreaChart data={comparisonData}>
            <defs>
              <linearGradient id="grad7" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="grad10" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="grad12" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="year" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false}
              tickFormatter={v => `${v}yr`} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false}
              tickFormatter={formatCurrency} />
            <Tooltip
              formatter={(val, name) => {
                const labels = { spent: 'Just Spending', invested_7: 'Invested @ 7%', invested_10: 'Invested @ 10%', invested_12: 'Invested @ 12%' };
                return [formatCurrency(val), labels[name] || name];
              }}
              contentStyle={{ background: '#1a2235', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }}
            />
            <Legend />
            <Area type="monotone" dataKey="spent" stroke="#64748b" fill="none" strokeDasharray="5 5" name="Just Spending" />
            <Area type="monotone" dataKey="invested_7" stroke="#3b82f6" fill="url(#grad7)" name="Invested @ 7%" />
            <Area type="monotone" dataKey="invested_10" stroke="#10b981" fill="url(#grad10)" name="Invested @ 10%" />
            <Area type="monotone" dataKey="invested_12" stroke="#8b5cf6" fill="url(#grad12)" name="Invested @ 12%" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* What-If Sliders */}
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>🎛️ "What If" Simulator</h3>
        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
          Adjust the sliders and watch your 30-year projection update in real time
        </p>

        <div style={styles.sliderGrid}>
          <SliderRow
            label="Base savings (from leaks)"
            value={monthlySavings}
            onChange={setMonthlySavings}
            min={0} max={2000} step={10}
            suffix="/mo"
          />
          {diningMonthly > 0 && (
            <SliderRow
              label={`Cut Dining (${formatCurrency(diningMonthly)}/mo)`}
              value={diningCut}
              onChange={setDiningCut}
              min={0} max={100} step={5}
              suffix="%"
              savings={diningMonthly * diningCut / 100}
            />
          )}
          {shoppingMonthly > 0 && (
            <SliderRow
              label={`Cut Shopping (${formatCurrency(shoppingMonthly)}/mo)`}
              value={shoppingCut}
              onChange={setShoppingCut}
              min={0} max={100} step={5}
              suffix="%"
              savings={shoppingMonthly * shoppingCut / 100}
            />
          )}
          {subsMonthly > 0 && (
            <SliderRow
              label={`Cut Subscriptions (${formatCurrency(subsMonthly)}/mo)`}
              value={subsCut}
              onChange={setSubsCut}
              min={0} max={100} step={5}
              suffix="%"
              savings={subsMonthly * subsCut / 100}
            />
          )}
          <SliderRow
            label="Return rate"
            value={returnRate}
            onChange={setReturnRate}
            min={4} max={15} step={0.5}
            suffix="%"
          />
          <SliderRow
            label="Investment horizon"
            value={years}
            onChange={setYears}
            min={5} max={40} step={1}
            suffix=" years"
          />
        </div>

        <div style={styles.projectionResult}>
          <span>If you redirect </span>
          <span style={{ color: '#10b981', fontWeight: 800, fontSize: 20 }}>${whatIfSavings}/mo</span>
          <span> to a Roth IRA starting today, you'd have </span>
          <span style={{ color: '#3b82f6', fontWeight: 800, fontSize: 20 }}>{formatCurrency(projection.finalBalance)}</span>
          <span> in {years} years</span>
        </div>
      </div>

      {/* Automation Playbook */}
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>🤖 Automation Playbook</h3>
        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
          Set it and forget it — make your savings work automatically
        </p>

        <div style={styles.automationSteps}>
          <AutomationStep
            num={1}
            title="Open a Roth IRA (if you haven't)"
            desc="Recommended: Fidelity, Vanguard, or Charles Schwab — all have $0 minimums and no fees"
          />
          <AutomationStep
            num={2}
            title="Cancel identified leaks"
            desc={`Kill the ${leaks.length} subscriptions/services flagged in Money Leaks to free up $${Math.round(totalLeaks)}/mo`}
          />
          <AutomationStep
            num={3}
            title="Set up automatic transfer"
            desc={`Schedule $${whatIfSavings}/mo auto-transfer from checking to your Roth IRA on the 1st of each month`}
          />
          <AutomationStep
            num={4}
            title="Choose your investments"
            desc="For hands-off: pick a target-date fund or S&P 500 index fund (like FXAIX or VOO)"
          />
          <AutomationStep
            num={5}
            title="Set and forget"
            desc={`Your $${whatIfSavings}/mo builds to ${formatCurrency(projection.finalBalance)} in ${years} years — without thinking about it`}
          />
        </div>
      </div>

      {/* Emergency Fund */}
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>🛡️ Emergency Fund Calculator</h3>
        <div style={styles.emergencyGrid}>
          <div style={styles.emergencyItem}>
            <div style={styles.emergencyLabel}>Monthly Expenses</div>
            <div style={styles.emergencyValue}>{formatCurrency(monthlyExpenses)}</div>
          </div>
          <div style={styles.emergencyItem}>
            <div style={styles.emergencyLabel}>6-Month Target</div>
            <div style={{ ...styles.emergencyValue, color: '#f59e0b' }}>{formatCurrency(emergencyTarget)}</div>
          </div>
          <div style={styles.emergencyItem}>
            <div style={styles.emergencyLabel}>Time to Build (at ${whatIfSavings}/mo)</div>
            <div style={styles.emergencyValue}>
              {monthsToEmergency === Infinity ? 'N/A' : `${monthsToEmergency} months`}
            </div>
          </div>
        </div>
        <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 12 }}>
          Build your emergency fund first, then redirect savings to your Roth IRA for maximum compound growth.
        </p>
      </div>
    </div>
  );
}

function SliderRow({ label, value, onChange, min, max, step, suffix, savings }) {
  return (
    <div style={styles.sliderRow}>
      <div style={styles.sliderHeader}>
        <span style={styles.sliderLabel}>{label}</span>
        <span style={styles.sliderValue}>{typeof value === 'number' && suffix === '/mo' ? `$${value}` : value}{suffix}</span>
        {savings > 0 && <span style={styles.sliderSavings}>+${Math.round(savings)}/mo</span>}
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={styles.slider}
      />
    </div>
  );
}

function AutomationStep({ num, title, desc }) {
  return (
    <div style={styles.autoStep}>
      <div style={styles.autoNum}>{num}</div>
      <div>
        <div style={styles.autoTitle}>{title}</div>
        <div style={styles.autoDesc}>{desc}</div>
      </div>
    </div>
  );
}

const styles = {
  page: { padding: '32px 40px', maxWidth: 1100 },
  header: { marginBottom: 24 },
  title: { fontSize: 28, fontWeight: 800, color: '#f1f5f9', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#64748b' },
  statsRow: { display: 'flex', gap: 16, marginBottom: 20 },
  statCard: {
    flex: 1, background: '#1a2235', borderRadius: 12, padding: '20px 24px',
    border: '1px solid #1e293b',
  },
  statLabel: { fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 },
  statValue: { fontSize: 28, fontWeight: 800, lineHeight: 1.1 },
  card: {
    background: '#1a2235', borderRadius: 12, padding: '24px',
    border: '1px solid #1e293b', marginBottom: 20,
  },
  cardTitle: { fontSize: 16, fontWeight: 700, color: '#f1f5f9', marginBottom: 8 },
  sliderGrid: { display: 'flex', flexDirection: 'column', gap: 20 },
  sliderRow: {},
  sliderHeader: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 },
  sliderLabel: { fontSize: 13, color: '#94a3b8', flex: 1 },
  sliderValue: { fontSize: 14, fontWeight: 700, color: '#f1f5f9' },
  sliderSavings: { fontSize: 12, fontWeight: 600, color: '#10b981', background: 'rgba(16,185,129,0.15)', padding: '2px 8px', borderRadius: 12 },
  slider: {
    width: '100%', height: 6, appearance: 'none', background: '#0f172a',
    borderRadius: 3, outline: 'none', accentColor: '#3b82f6',
  },
  projectionResult: {
    marginTop: 24, padding: '20px 24px',
    background: 'linear-gradient(135deg, rgba(59,130,246,0.1), rgba(16,185,129,0.05))',
    borderRadius: 10, border: '1px solid rgba(59,130,246,0.2)',
    fontSize: 15, color: '#94a3b8', lineHeight: 1.8, textAlign: 'center',
  },
  automationSteps: { display: 'flex', flexDirection: 'column', gap: 12 },
  autoStep: { display: 'flex', gap: 16, alignItems: 'flex-start' },
  autoNum: {
    width: 32, height: 32, borderRadius: '50%', background: 'rgba(59,130,246,0.15)',
    color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 14, fontWeight: 700, flexShrink: 0,
  },
  autoTitle: { fontSize: 14, fontWeight: 600, color: '#f1f5f9', marginBottom: 2 },
  autoDesc: { fontSize: 13, color: '#94a3b8', lineHeight: 1.5 },
  emergencyGrid: { display: 'flex', gap: 24 },
  emergencyItem: {},
  emergencyLabel: { fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 },
  emergencyValue: { fontSize: 24, fontWeight: 800, color: '#f1f5f9' },
};
