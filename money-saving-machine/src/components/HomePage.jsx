import React from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Treemap } from 'recharts';

const COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#f97316', '#14b8a6', '#6366f1', '#84cc16', '#a855f7'];

function formatCurrency(val) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val);
}

const CustomTreemapContent = ({ x, y, width, height, name, value, index }) => {
  if (width < 50 || height < 30) return null;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={4}
        style={{ fill: COLORS[index % COLORS.length], stroke: '#0a0e17', strokeWidth: 2, opacity: 0.85 }} />
      {width > 70 && height > 45 && (
        <>
          <text x={x + 8} y={y + 20} fill="#fff" fontSize={12} fontWeight={600}>{name}</text>
          <text x={x + 8} y={y + 36} fill="rgba(255,255,255,0.7)" fontSize={11}>{formatCurrency(value)}</text>
        </>
      )}
    </g>
  );
};

export default function HomePage({ analysis, monthlyIncome, allTransactions = [] }) {
  if (!analysis) return null;

  const { categoryBreakdown, monthlyTrend, budgetAnalysis, personality, monthlySpend, totalSpent, monthCount, healthScore } = analysis;

  // Compute excluded transactions (transfers, credit card payments, income)
  const excludedTransactions = allTransactions.filter(t => t.isTransfer || t.isIncome);
  const excludedByType = {};
  excludedTransactions.forEach(t => {
    const type = t.isIncome ? 'Income' : (t.category || 'Transfers');
    if (!excludedByType[type]) excludedByType[type] = { count: 0, total: 0 };
    excludedByType[type].count += 1;
    excludedByType[type].total += t.amount;
  });
  const excludedTypes = Object.entries(excludedByType).sort((a, b) => b[1].total - a[1].total);

  const treemapData = categoryBreakdown.slice(0, 12).map(c => ({
    name: c.name,
    value: Math.round(c.total),
  }));

  const leftover = monthlyIncome - monthlySpend;
  const leftoverPct = monthlyIncome ? ((leftover / monthlyIncome) * 100) : 0;

  return (
    <div style={styles.page} className="page-fade-in">
      <div style={styles.header}>
        <h1 style={styles.title}>My Financial Picture</h1>
        <p style={styles.subtitle}>{monthCount} months analyzed — {formatCurrency(totalSpent)} total spending</p>
      </div>

      {/* Top Stats Row */}
      <div style={styles.statsRow}>
        <StatCard label="Monthly Income" value={formatCurrency(monthlyIncome)} color="#10b981" />
        <StatCard label="Monthly Spending" value={formatCurrency(monthlySpend)} color="#ef4444" />
        <StatCard label="Monthly Leftover" value={formatCurrency(leftover)} color={leftover >= 0 ? '#10b981' : '#ef4444'} sub={`${leftoverPct.toFixed(1)}% of income`} />
        <StatCard label="Health Score" value={healthScore} color={healthScore >= 70 ? '#10b981' : healthScore >= 40 ? '#f59e0b' : '#ef4444'} sub="/100" large pulse />
      </div>

      {/* Spending Personality */}
      <div style={styles.personalityCard}>
        <div style={styles.personalityType}>{personality.type}</div>
        <div style={styles.personalityDesc}>{personality.desc || personality.description}</div>
      </div>

      {/* 50/30/20 Budget */}
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>50 / 30 / 20 Budget Rule</h3>
        <div style={styles.budgetGrid}>
          <BudgetBar label="Needs" actual={budgetAnalysis.needs.percentage} target={50} amount={budgetAnalysis.needs.amount / monthCount} color="#3b82f6" />
          <BudgetBar label="Wants" actual={budgetAnalysis.wants.percentage} target={30} amount={budgetAnalysis.wants.amount / monthCount} color="#8b5cf6" />
          <BudgetBar label="Savings" actual={budgetAnalysis.savings.percentage} target={20} amount={budgetAnalysis.savings.amount / monthCount} color="#10b981" />
        </div>
      </div>

      {/* Charts Row */}
      <div style={styles.chartsRow}>
        {/* Money Map */}
        <div style={{ ...styles.card, flex: 1.2 }}>
          <h3 style={styles.cardTitle}>Visual Money Map</h3>
          <ResponsiveContainer width="100%" height={300}>
            <Treemap
              data={treemapData}
              dataKey="value"
              aspectRatio={4 / 3}
              content={<CustomTreemapContent />}
            />
          </ResponsiveContainer>
        </div>

        {/* Category Breakdown Pie */}
        <div style={{ ...styles.card, flex: 0.8 }}>
          <h3 style={styles.cardTitle}>Category Split</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={categoryBreakdown.slice(0, 8)}
                dataKey="total"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={100}
                innerRadius={50}
                paddingAngle={2}
              >
                {categoryBreakdown.slice(0, 8).map((_, i) => (
                  <Cell key={i} fill={COLORS[i]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(val) => formatCurrency(val)}
                contentStyle={{ background: '#1a2235', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div style={styles.legendGrid}>
            {categoryBreakdown.slice(0, 8).map((c, i) => (
              <div key={c.name} style={styles.legendItem}>
                <div style={{ ...styles.legendDot, background: COLORS[i] }} />
                <span style={styles.legendLabel}>{c.name}</span>
                <span style={styles.legendValue}>{c.percentage.toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Monthly Trend */}
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>Monthly Spending Trend</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={monthlyTrend}>
            <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
            <Tooltip
              formatter={(val) => formatCurrency(val)}
              contentStyle={{ background: '#1a2235', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }}
            />
            <Bar dataKey="total" fill="#3b82f6" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Top Merchants */}
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>Top 10 Merchants</h3>
        <div style={styles.merchantList}>
          {analysis.merchantBreakdown.slice(0, 10).map((m, i) => (
            <div key={m.name} style={styles.merchantRow}>
              <span style={styles.merchantRank}>#{i + 1}</span>
              <span style={styles.merchantName}>{m.name}</span>
              <span style={styles.merchantCategory}>{m.category}</span>
              <span style={styles.merchantAmount}>{formatCurrency(m.total)}</span>
              <span style={styles.merchantMonthly}>{formatCurrency(m.monthly)}/mo</span>
            </div>
          ))}
        </div>
      </div>

      {/* Excluded from Analysis */}
      {excludedTransactions.length > 0 && (
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Excluded from Analysis</h3>
          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
            These {excludedTransactions.length} transactions ({formatCurrency(excludedTransactions.reduce((s, t) => s + t.amount, 0))} total) were filtered out to give you accurate spending numbers.
          </p>
          <div style={styles.excludedList}>
            {excludedTypes.map(([type, data]) => (
              <div key={type} style={styles.excludedRow}>
                <div style={styles.excludedIcon}>
                  {type === 'Income' ? '💵' : type === 'Transfers' ? '🔄' : type === 'Investment' ? '📈' : '💳'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={styles.excludedType}>{type}</div>
                  <div style={styles.excludedCount}>{data.count} transaction{data.count !== 1 ? 's' : ''}</div>
                </div>
                <div style={styles.excludedAmount}>{formatCurrency(data.total)}</div>
              </div>
            ))}
          </div>
          <div style={styles.excludedFooter}>
            These include transfers between accounts, credit card payments, investment contributions, and income deposits.
            They are excluded so your spending analysis reflects only actual expenses.
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color, sub, large, pulse }) {
  return (
    <div style={styles.statCard} className={pulse ? 'health-score-pulse' : ''}>
      <div style={styles.statLabel}>{label}</div>
      <div style={{ ...styles.statValue, color, fontSize: large ? 42 : 28 }}>{value}</div>
      {sub && <div style={styles.statSub}>{sub}</div>}
    </div>
  );
}

function BudgetBar({ label, actual, target, amount, color }) {
  const over = actual > target * 1.15;
  return (
    <div style={styles.budgetItem}>
      <div style={styles.budgetHeader}>
        <span style={styles.budgetLabel}>{label}</span>
        <span style={{ ...styles.budgetPct, color: over ? '#ef4444' : color }}>{actual.toFixed(0)}%</span>
        <span style={styles.budgetTarget}>target: {target}%</span>
        <span style={styles.budgetAmount}>{formatCurrency(amount)}/mo</span>
      </div>
      <div style={styles.barTrack}>
        <div style={{
          ...styles.barFill,
          width: `${Math.min(actual, 100)}%`,
          background: over ? '#ef4444' : color
        }} />
        <div style={{ ...styles.barMarker, left: `${target}%` }} />
      </div>
    </div>
  );
}

const styles = {
  page: { padding: '32px 40px', maxWidth: 1200 },
  header: { marginBottom: 28 },
  title: { fontSize: 28, fontWeight: 800, color: '#f1f5f9', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#64748b' },
  statsRow: { display: 'flex', gap: 16, marginBottom: 20 },
  statCard: {
    flex: 1, background: '#1a2235', borderRadius: 12, padding: '20px 24px',
    border: '1px solid #1e293b',
  },
  statLabel: { fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 },
  statValue: { fontSize: 28, fontWeight: 800, lineHeight: 1.1 },
  statSub: { fontSize: 12, color: '#64748b', marginTop: 4 },
  personalityCard: {
    background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(59,130,246,0.1))',
    borderRadius: 12, padding: '20px 24px', marginBottom: 20,
    border: '1px solid rgba(139,92,246,0.3)',
  },
  personalityType: { fontSize: 18, fontWeight: 700, color: '#8b5cf6', marginBottom: 6 },
  personalityDesc: { fontSize: 14, color: '#94a3b8', lineHeight: 1.5 },
  card: {
    background: '#1a2235', borderRadius: 12, padding: '24px',
    border: '1px solid #1e293b', marginBottom: 20,
  },
  cardTitle: { fontSize: 16, fontWeight: 700, color: '#f1f5f9', marginBottom: 20 },
  budgetGrid: { display: 'flex', flexDirection: 'column', gap: 16 },
  budgetItem: {},
  budgetHeader: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 },
  budgetLabel: { fontSize: 14, fontWeight: 600, color: '#f1f5f9', width: 70 },
  budgetPct: { fontSize: 14, fontWeight: 700, width: 40 },
  budgetTarget: { fontSize: 12, color: '#64748b' },
  budgetAmount: { fontSize: 13, color: '#94a3b8', marginLeft: 'auto' },
  barTrack: { height: 8, background: '#0f172a', borderRadius: 4, position: 'relative' },
  barFill: { height: '100%', borderRadius: 4, transition: 'width 0.5s' },
  barMarker: { position: 'absolute', top: -3, width: 2, height: 14, background: '#94a3b8', borderRadius: 1 },
  chartsRow: { display: 'flex', gap: 20, marginBottom: 20 },
  legendGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', marginTop: 8 },
  legendItem: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 },
  legendDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  legendLabel: { color: '#94a3b8', flex: 1 },
  legendValue: { color: '#f1f5f9', fontWeight: 600 },
  merchantList: { display: 'flex', flexDirection: 'column', gap: 2 },
  merchantRow: {
    display: 'flex', alignItems: 'center', gap: 16, padding: '10px 12px',
    borderRadius: 8, background: 'transparent',
  },
  merchantRank: { fontSize: 12, color: '#64748b', width: 28 },
  merchantName: { fontSize: 14, fontWeight: 600, color: '#f1f5f9', flex: 1 },
  merchantCategory: { fontSize: 12, color: '#64748b', width: 120 },
  merchantAmount: { fontSize: 14, fontWeight: 700, color: '#f1f5f9', width: 80, textAlign: 'right' },
  merchantMonthly: { fontSize: 12, color: '#94a3b8', width: 80, textAlign: 'right' },
  excludedList: { display: 'flex', flexDirection: 'column', gap: 4 },
  excludedRow: {
    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
    borderRadius: 8, background: 'rgba(100,116,139,0.06)',
  },
  excludedIcon: { fontSize: 18, width: 28, textAlign: 'center' },
  excludedType: { fontSize: 14, fontWeight: 600, color: '#f1f5f9' },
  excludedCount: { fontSize: 12, color: '#64748b' },
  excludedAmount: { fontSize: 14, fontWeight: 700, color: '#94a3b8', width: 90, textAlign: 'right' },
  excludedFooter: {
    marginTop: 12, fontSize: 12, color: '#64748b', lineHeight: 1.5,
    padding: '10px 12px', background: 'rgba(100,116,139,0.06)', borderRadius: 8,
  },
};
