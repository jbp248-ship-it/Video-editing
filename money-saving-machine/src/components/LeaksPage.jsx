import React, { useState } from 'react';
import { Treemap, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { generateNegotiationScript } from '../utils/csvParser';

const COLORS = ['#ef4444', '#f97316', '#f59e0b', '#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#ec4899', '#6366f1', '#14b8a6'];
const SEV = { high: '#ef4444', medium: '#f59e0b', low: '#3b82f6' };

function fmt(val) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val);
}

function TreemapCell({ x, y, width, height, name, value, severity, index }) {
  if (width < 4 || height < 4) return null;
  const color = severity ? SEV[severity] : COLORS[index % COLORS.length];
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={6}
        style={{ fill: color, stroke: '#0a0e17', strokeWidth: 3, opacity: 0.85, cursor: 'pointer' }} />
      {width > 60 && height > 40 && (
        <>
          <text x={x + 10} y={y + 22} fill="#fff" fontSize={13} fontWeight={700}>
            {name?.length > 18 ? name.slice(0, 16) + '...' : name}
          </text>
          <text x={x + 10} y={y + 40} fill="rgba(255,255,255,0.8)" fontSize={12}>{fmt(value)}/mo</text>
        </>
      )}
      {width > 40 && width <= 60 && height > 30 && (
        <text x={x + 6} y={y + 20} fill="#fff" fontSize={10} fontWeight={600}>{fmt(value)}</text>
      )}
    </g>
  );
}

export default function LeaksPage({ leaks, analysis }) {
  const [expandedLeak, setExpandedLeak] = useState(null);
  const [showScript, setShowScript] = useState(null);

  if (!leaks || leaks.length === 0) {
    return (
      <div style={st.page}><h1 style={st.title}>Money Leaks</h1>
        <div style={st.empty}><span style={{ fontSize: 48 }}>🎉</span>
          <p style={{ color: '#94a3b8', marginTop: 12 }}>No leaks detected!</p></div></div>
    );
  }

  const totalMonthly = leaks.reduce((a, l) => a + l.monthlyAmount, 0);
  const totalAnnual = leaks.reduce((a, l) => a + l.annualAmount, 0);
  const subs = leaks.filter(l => l.type === 'subscription');
  const creep = leaks.filter(l => l.type === 'fee_creep');
  const dupes = leaks.filter(l => l.type === 'duplicate');

  const treemapData = leaks.map((l, i) => ({
    name: l.merchant, value: Math.round(l.monthlyAmount), severity: l.severity, index: i,
  }));

  const catGroups = {};
  leaks.forEach(l => {
    const cat = l.category || l.type;
    if (!catGroups[cat]) catGroups[cat] = { total: 0, items: [] };
    catGroups[cat].total += l.monthlyAmount;
    catGroups[cat].items.push(l);
  });
  const innerRing = Object.entries(catGroups).map(([name, d]) => ({ name, value: Math.round(d.total) }));
  const outerRing = leaks.map(l => ({ name: l.merchant, value: Math.round(l.monthlyAmount) }));

  const barData = [...leaks].sort((a, b) => b.monthlyAmount - a.monthlyAmount).slice(0, 15).map(l => ({
    name: l.merchant.length > 20 ? l.merchant.slice(0, 18) + '...' : l.merchant,
    amount: Math.round(l.monthlyAmount), fill: SEV[l.severity],
  }));

  const gaugePct = Math.min(100, (totalMonthly / 500) * 100);
  const gaugeColor = gaugePct > 70 ? '#ef4444' : gaugePct > 40 ? '#f59e0b' : '#10b981';

  return (
    <div style={st.page} className="page-fade-in">
      <div style={st.header}>
        <h1 style={st.title}>Money Leaks</h1>
        <p style={st.subtitle}>Visualize exactly where you're bleeding money</p>
      </div>

      {/* Meter + Summary */}
      <div style={st.meterRow}>
        <div style={st.meterCard}>
          <div style={st.meterLabel}>LEAK METER</div>
          <svg width="200" height="120" viewBox="0 0 200 120">
            <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#1e293b" strokeWidth="14" strokeLinecap="round" />
            <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke={gaugeColor} strokeWidth="14" strokeLinecap="round"
              strokeDasharray={`${gaugePct * 2.51} 251`} style={{ transition: 'stroke-dasharray 1s ease' }} />
            <text x="100" y="85" textAnchor="middle" fill="#f1f5f9" fontSize="28" fontWeight="800">{fmt(totalMonthly)}</text>
            <text x="100" y="105" textAnchor="middle" fill="#64748b" fontSize="12">per month</text>
          </svg>
        </div>
        <div style={st.summaryCard}>
          <SummaryRow icon="🔴" value={`${fmt(totalMonthly)}/mo`} label="Total Monthly Leaks" />
          <SummaryRow icon="💸" value={`${fmt(totalAnnual)}/yr`} label="Annual Waste" />
          <SummaryRow icon="📊" value={`${leaks.length}`} label="Leaks Found" />
        </div>
        <div style={st.typeCol}>
          {subs.length > 0 && <TypeBadge icon="🔄" label="Subscriptions" count={subs.length} amount={subs.reduce((a, l) => a + l.monthlyAmount, 0)} />}
          {creep.length > 0 && <TypeBadge icon="📈" label="Price Increases" count={creep.length} amount={creep.reduce((a, l) => a + l.monthlyAmount, 0)} />}
          {dupes.length > 0 && <TypeBadge icon="👯" label="Overlapping" count={dupes.length} amount={dupes.reduce((a, l) => a + l.monthlyAmount, 0)} />}
        </div>
      </div>

      {/* Treemap */}
      <div style={st.card}>
        <h3 style={st.cardTitle}>🗺️ Leak Map — Where Your Money Bleeds</h3>
        <p style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>Block size = dollar amount. Red = high priority.</p>
        <ResponsiveContainer width="100%" height={320}>
          <Treemap data={treemapData} dataKey="value" aspectRatio={4 / 3} content={<TreemapCell />}>
            <Tooltip content={({ payload }) => {
              if (!payload?.[0]) return null;
              const d = payload[0].payload;
              return <div style={st.tip}><div style={{ fontWeight: 700 }}>{d.name}</div><div>{fmt(d.value)}/mo — {fmt(d.value * 12)}/yr</div></div>;
            }} />
          </Treemap>
        </ResponsiveContainer>
      </div>

      {/* Charts Row */}
      <div style={st.chartsRow}>
        <div style={{ ...st.card, flex: 1 }}>
          <h3 style={st.cardTitle}>🎯 Category Breakdown</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={innerRing} dataKey="value" cx="50%" cy="50%" outerRadius={60} innerRadius={30} paddingAngle={3}>
                {innerRing.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Pie data={outerRing} dataKey="value" cx="50%" cy="50%" outerRadius={110} innerRadius={70} paddingAngle={2}>
                {outerRing.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} opacity={0.7} />)}
              </Pie>
              <Tooltip formatter={v => fmt(v)} contentStyle={st.tipStyle} />
            </PieChart>
          </ResponsiveContainer>
          <div style={st.legendGrid}>
            {outerRing.map((item, i) => (
              <div key={i} style={st.legendItem}>
                <div style={{ ...st.legendDot, background: COLORS[i % COLORS.length] }} />
                <span style={st.legendLabel}>{item.name}</span>
                <span style={st.legendValue}>{fmt(item.value)}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ ...st.card, flex: 1.2 }}>
          <h3 style={st.cardTitle}>📊 Cost Ranking</h3>
          <ResponsiveContainer width="100%" height={Math.max(barData.length * 36 + 20, 200)}>
            <BarChart data={barData} layout="vertical" margin={{ left: 10, right: 20 }}>
              <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} width={130} />
              <Tooltip formatter={v => fmt(v)} contentStyle={st.tipStyle} />
              <Bar dataKey="amount" radius={[0, 6, 6, 0]} barSize={20}>
                {barData.map((e, i) => <Cell key={i} fill={e.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Detail List */}
      <div style={st.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <h3 style={st.cardTitle}>💀 Subscription Graveyard</h3>
          <span style={st.badge}>{leaks.length} found</span>
        </div>
        <p style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>Kill-it scores based on cost. Expand for details & negotiation scripts.</p>
        {leaks.map((leak, i) => {
          const kill = leak.monthlyAmount > 50 ? 10 : leak.monthlyAmount > 20 ? 7 : leak.monthlyAmount > 10 ? 5 : 3;
          const exp = expandedLeak === i;
          const scr = showScript === i;
          return (
            <div key={i} style={st.leakRow}>
              <div style={st.leakMain} onClick={() => setExpandedLeak(exp ? null : i)}>
                <div style={{ ...st.sevDot, background: SEV[leak.severity] }} />
                <div style={{ flex: 1 }}>
                  <div style={st.leakName}>{leak.merchant}</div>
                  <div style={st.leakType}>{leak.type === 'subscription' ? 'Recurring' : leak.type === 'fee_creep' ? 'Price Increase' : 'Overlapping'}</div>
                </div>
                <div style={{ textAlign: 'right', width: 100 }}>
                  <div style={{ color: '#ef4444', fontWeight: 700, fontSize: 14 }}>{fmt(leak.monthlyAmount)}/mo</div>
                  <div style={{ color: '#64748b', fontSize: 11 }}>{fmt(leak.annualAmount)}/yr</div>
                </div>
                <div style={{ ...st.killBadge, background: kill >= 8 ? 'rgba(239,68,68,0.15)' : kill >= 5 ? 'rgba(245,158,11,0.15)' : 'rgba(59,130,246,0.15)', color: kill >= 8 ? '#ef4444' : kill >= 5 ? '#f59e0b' : '#3b82f6' }}>
                  Kill: {kill}/10
                </div>
                <span style={{ fontSize: 10, color: '#64748b', width: 16 }}>{exp ? '▼' : '▶'}</span>
              </div>
              {exp && (
                <div style={st.leakExp}>
                  <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 8 }}>{leak.message}</p>
                  <p style={{ fontSize: 13, color: '#f1f5f9', marginBottom: 12 }}>{leak.suggestion}</p>
                  <button style={st.scriptBtn} onClick={() => setShowScript(scr ? null : i)}>
                    📞 {scr ? 'Hide' : 'Show'} Negotiation Script
                  </button>
                  {scr && <pre style={st.scriptBox}>{generateNegotiationScript(leak.merchant, leak.monthlyAmount)}</pre>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SummaryRow({ icon, value, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ fontSize: 20 }}>{icon}</span>
      <div><div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>{value}</div>
        <div style={{ fontSize: 11, color: '#64748b' }}>{label}</div></div>
    </div>
  );
}

function TypeBadge({ icon, label, count, amount }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#1a2235', borderRadius: 10, padding: '10px 14px', border: '1px solid #1e293b' }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <div><div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>{label}</div>
        <div style={{ fontSize: 12, color: '#64748b' }}>{count} — {fmt(amount)}/mo</div></div>
    </div>
  );
}

const st = {
  page: { padding: '32px 40px', maxWidth: 1100 },
  header: { marginBottom: 24 },
  title: { fontSize: 28, fontWeight: 800, color: '#f1f5f9', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#64748b' },
  empty: { textAlign: 'center', padding: 80 },
  meterRow: { display: 'flex', gap: 16, marginBottom: 20 },
  meterCard: { background: 'linear-gradient(135deg, rgba(239,68,68,0.08), rgba(239,68,68,0.03))', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 12, padding: '20px 24px', textAlign: 'center', width: 240 },
  meterLabel: { fontSize: 11, color: '#64748b', letterSpacing: '1px', marginBottom: 8 },
  summaryCard: { flex: 1, background: '#1a2235', borderRadius: 12, padding: '16px 20px', border: '1px solid #1e293b', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12 },
  typeCol: { display: 'flex', flexDirection: 'column', gap: 8 },
  card: { background: '#1a2235', borderRadius: 12, padding: 24, border: '1px solid #1e293b', marginBottom: 20 },
  cardTitle: { fontSize: 16, fontWeight: 700, color: '#f1f5f9', marginBottom: 8 },
  badge: { fontSize: 12, color: '#64748b', background: '#0f172a', padding: '4px 10px', borderRadius: 20 },
  chartsRow: { display: 'flex', gap: 20, marginBottom: 20 },
  tip: { background: '#1a2235', border: '1px solid #334155', borderRadius: 8, padding: '8px 12px', color: '#f1f5f9', fontSize: 13 },
  tipStyle: { background: '#1a2235', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' },
  legendGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', marginTop: 8 },
  legendItem: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 },
  legendDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  legendLabel: { color: '#94a3b8', flex: 1 },
  legendValue: { color: '#f1f5f9', fontWeight: 600 },
  leakRow: { borderBottom: '1px solid #1e293b', paddingBottom: 8, marginBottom: 8 },
  leakMain: { display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', cursor: 'pointer' },
  sevDot: { width: 10, height: 10, borderRadius: '50%', flexShrink: 0 },
  leakName: { fontSize: 14, fontWeight: 600, color: '#f1f5f9' },
  leakType: { fontSize: 11, color: '#64748b' },
  killBadge: { fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, whiteSpace: 'nowrap' },
  leakExp: { padding: '12px 0 8px 22px' },
  scriptBtn: { background: 'rgba(59,130,246,0.15)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600 },
  scriptBox: { background: '#0f172a', borderRadius: 8, padding: 16, marginTop: 12, fontSize: 12, color: '#94a3b8', lineHeight: 1.6, whiteSpace: 'pre-wrap', border: '1px solid #1e293b', fontFamily: 'inherit' },
};
