import React, { useState } from 'react';
import { generateNegotiationScript } from '../utils/csvParser';

function formatCurrency(val) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val);
}

const severityColors = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#3b82f6',
};

const typeLabels = {
  subscription: 'Recurring Subscription',
  fee_creep: 'Price Increase',
  duplicate: 'Overlapping Services',
};

export default function LeaksPage({ leaks, analysis }) {
  const [expandedLeak, setExpandedLeak] = useState(null);
  const [showScript, setShowScript] = useState(null);

  if (!leaks || leaks.length === 0) {
    return (
      <div style={styles.page}>
        <h1 style={styles.title}>Money Leaks</h1>
        <div style={styles.emptyState}>
          <span style={{ fontSize: 48 }}>🎉</span>
          <p style={{ color: '#94a3b8', marginTop: 12 }}>No significant leaks detected! Your spending is tight.</p>
        </div>
      </div>
    );
  }

  const totalMonthlyLeaks = leaks.reduce((s, l) => s + l.monthlyAmount, 0);
  const totalAnnualLeaks = leaks.reduce((s, l) => s + l.annualAmount, 0);

  const subscriptions = leaks.filter(l => l.type === 'subscription');
  const feeCreep = leaks.filter(l => l.type === 'fee_creep');
  const duplicates = leaks.filter(l => l.type === 'duplicate');

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Money Leaks</h1>
        <p style={styles.subtitle}>Every place you're bleeding money</p>
      </div>

      {/* Summary Banner */}
      <div style={styles.banner}>
        <div style={styles.bannerIcon}>🚨</div>
        <div>
          <div style={styles.bannerTitle}>
            You're leaking <span style={{ color: '#ef4444' }}>{formatCurrency(totalMonthlyLeaks)}/mo</span>
          </div>
          <div style={styles.bannerSub}>
            That's <span style={{ color: '#ef4444', fontWeight: 700 }}>{formatCurrency(totalAnnualLeaks)}/year</span> — enough to max out a Roth IRA
          </div>
        </div>
      </div>

      {/* Leak Type Summary */}
      <div style={styles.typeSummary}>
        <TypeBadge icon="🔄" label="Subscriptions" count={subscriptions.length} amount={subscriptions.reduce((s, l) => s + l.monthlyAmount, 0)} />
        <TypeBadge icon="📈" label="Price Increases" count={feeCreep.length} amount={feeCreep.reduce((s, l) => s + l.monthlyAmount, 0)} />
        <TypeBadge icon="👯" label="Overlapping" count={duplicates.length} amount={duplicates.reduce((s, l) => s + l.monthlyAmount, 0)} />
      </div>

      {/* Subscription Graveyard */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <h3 style={styles.cardTitle}>💀 Subscription Graveyard</h3>
          <span style={styles.cardCount}>{subscriptions.length} active</span>
        </div>
        <p style={styles.cardDesc}>Kill-it priority scores based on cost vs. likely usage</p>

        {subscriptions.map((leak, i) => (
          <LeakRow
            key={i}
            leak={leak}
            index={i}
            expanded={expandedLeak === `sub-${i}`}
            onToggle={() => setExpandedLeak(expandedLeak === `sub-${i}` ? null : `sub-${i}`)}
            showScript={showScript === `sub-${i}`}
            onToggleScript={() => setShowScript(showScript === `sub-${i}` ? null : `sub-${i}`)}
          />
        ))}
      </div>

      {/* Fee Creep */}
      {feeCreep.length > 0 && (
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <h3 style={styles.cardTitle}>📈 Fee Creep Detected</h3>
            <span style={styles.cardCount}>{feeCreep.length} increases</span>
          </div>
          <p style={styles.cardDesc}>These services quietly raised your prices</p>

          {feeCreep.map((leak, i) => (
            <LeakRow
              key={i}
              leak={leak}
              index={i}
              expanded={expandedLeak === `fee-${i}`}
              onToggle={() => setExpandedLeak(expandedLeak === `fee-${i}` ? null : `fee-${i}`)}
              showScript={showScript === `fee-${i}`}
              onToggleScript={() => setShowScript(showScript === `fee-${i}` ? null : `fee-${i}`)}
            />
          ))}
        </div>
      )}

      {/* Duplicates */}
      {duplicates.length > 0 && (
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <h3 style={styles.cardTitle}>👯 Overlapping Services</h3>
            <span style={styles.cardCount}>{duplicates.length} groups</span>
          </div>
          <p style={styles.cardDesc}>You're paying for similar things multiple times</p>

          {duplicates.map((leak, i) => (
            <LeakRow
              key={i}
              leak={leak}
              index={i}
              expanded={expandedLeak === `dup-${i}`}
              onToggle={() => setExpandedLeak(expandedLeak === `dup-${i}` ? null : `dup-${i}`)}
              showScript={showScript === `dup-${i}`}
              onToggleScript={() => setShowScript(showScript === `dup-${i}` ? null : `dup-${i}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TypeBadge({ icon, label, count, amount }) {
  return (
    <div style={styles.typeBadge}>
      <span style={{ fontSize: 20 }}>{icon}</span>
      <div>
        <div style={styles.typeBadgeLabel}>{label}</div>
        <div style={styles.typeBadgeValue}>{count} found — {formatCurrency(amount)}/mo</div>
      </div>
    </div>
  );
}

function LeakRow({ leak, index, expanded, onToggle, showScript, onToggleScript }) {
  const killScore = leak.monthlyAmount > 50 ? 10 : leak.monthlyAmount > 20 ? 7 : leak.monthlyAmount > 10 ? 5 : 3;
  const script = generateNegotiationScript(leak.merchant, leak.monthlyAmount);

  return (
    <div style={styles.leakRow}>
      <div style={styles.leakMain} onClick={onToggle}>
        <div style={styles.leakLeft}>
          <div style={{
            ...styles.severityDot,
            background: severityColors[leak.severity]
          }} />
          <div>
            <div style={styles.leakMerchant}>{leak.merchant}</div>
            <div style={styles.leakType}>{typeLabels[leak.type]}</div>
          </div>
        </div>
        <div style={styles.leakRight}>
          <div style={styles.leakAmount}>{formatCurrency(leak.monthlyAmount)}/mo</div>
          <div style={styles.leakAnnual}>{formatCurrency(leak.annualAmount)}/yr</div>
        </div>
        <div style={{
          ...styles.killBadge,
          background: killScore >= 8 ? 'rgba(239,68,68,0.15)' : killScore >= 5 ? 'rgba(245,158,11,0.15)' : 'rgba(59,130,246,0.15)',
          color: killScore >= 8 ? '#ef4444' : killScore >= 5 ? '#f59e0b' : '#3b82f6',
        }}>
          Kill: {killScore}/10
        </div>
        <span style={styles.expandArrow}>{expanded ? '▼' : '▶'}</span>
      </div>

      {expanded && (
        <div style={styles.leakExpanded}>
          <p style={styles.leakMessage}>{leak.message}</p>
          <p style={styles.leakSuggestion}>{leak.suggestion}</p>
          <div style={styles.leakActions}>
            <button style={styles.btnPrimary} onClick={(e) => { e.stopPropagation(); }}>
              ✂️ Add to Action Plan
            </button>
            <button style={styles.btnSecondary} onClick={(e) => { e.stopPropagation(); onToggleScript(); }}>
              📞 Get Negotiation Script
            </button>
          </div>
          {showScript && (
            <pre style={styles.scriptBox}>{script}</pre>
          )}
        </div>
      )}
    </div>
  );
}

const styles = {
  page: { padding: '32px 40px', maxWidth: 1000 },
  header: { marginBottom: 24 },
  title: { fontSize: 28, fontWeight: 800, color: '#f1f5f9', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#64748b' },
  emptyState: { textAlign: 'center', padding: 80 },
  banner: {
    display: 'flex', alignItems: 'center', gap: 16,
    background: 'linear-gradient(135deg, rgba(239,68,68,0.1), rgba(239,68,68,0.05))',
    border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12,
    padding: '20px 24px', marginBottom: 20,
  },
  bannerIcon: { fontSize: 32 },
  bannerTitle: { fontSize: 18, fontWeight: 700, color: '#f1f5f9' },
  bannerSub: { fontSize: 13, color: '#94a3b8', marginTop: 2 },
  typeSummary: { display: 'flex', gap: 12, marginBottom: 20 },
  typeBadge: {
    flex: 1, display: 'flex', alignItems: 'center', gap: 12,
    background: '#1a2235', borderRadius: 10, padding: '14px 16px',
    border: '1px solid #1e293b',
  },
  typeBadgeLabel: { fontSize: 13, fontWeight: 600, color: '#f1f5f9' },
  typeBadgeValue: { fontSize: 12, color: '#64748b' },
  card: {
    background: '#1a2235', borderRadius: 12, padding: '24px',
    border: '1px solid #1e293b', marginBottom: 16,
  },
  cardHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  cardTitle: { fontSize: 16, fontWeight: 700, color: '#f1f5f9' },
  cardCount: { fontSize: 12, color: '#64748b', background: '#0f172a', padding: '4px 10px', borderRadius: 20 },
  cardDesc: { fontSize: 12, color: '#64748b', marginBottom: 16 },
  leakRow: {
    borderBottom: '1px solid #1e293b',
    paddingBottom: 8,
    marginBottom: 8,
  },
  leakMain: {
    display: 'flex', alignItems: 'center', gap: 16, padding: '8px 0',
    cursor: 'pointer',
  },
  leakLeft: { display: 'flex', alignItems: 'center', gap: 12, flex: 1 },
  severityDot: { width: 10, height: 10, borderRadius: '50%', flexShrink: 0 },
  leakMerchant: { fontSize: 14, fontWeight: 600, color: '#f1f5f9' },
  leakType: { fontSize: 11, color: '#64748b' },
  leakRight: { textAlign: 'right', width: 110 },
  leakAmount: { fontSize: 14, fontWeight: 700, color: '#ef4444' },
  leakAnnual: { fontSize: 11, color: '#64748b' },
  killBadge: {
    fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, whiteSpace: 'nowrap',
  },
  expandArrow: { fontSize: 10, color: '#64748b', width: 16 },
  leakExpanded: {
    padding: '12px 0 8px 22px',
  },
  leakMessage: { fontSize: 13, color: '#94a3b8', marginBottom: 8 },
  leakSuggestion: { fontSize: 13, color: '#f1f5f9', marginBottom: 12 },
  leakActions: { display: 'flex', gap: 8, marginBottom: 8 },
  btnPrimary: {
    background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600,
  },
  btnSecondary: {
    background: 'rgba(59,130,246,0.15)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)',
    borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600,
  },
  scriptBox: {
    background: '#0f172a', borderRadius: 8, padding: 16, marginTop: 8,
    fontSize: 12, color: '#94a3b8', lineHeight: 1.6, whiteSpace: 'pre-wrap',
    border: '1px solid #1e293b', fontFamily: 'inherit',
  },
};
