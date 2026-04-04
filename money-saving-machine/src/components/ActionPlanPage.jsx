import React, { useState } from 'react';
import { generateNegotiationScript, calculateRothProjection } from '../utils/csvParser';

function formatCurrency(val) {
  if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
  if (val >= 1000) return `$${(val / 1000).toFixed(0)}k`;
  return `$${Math.round(val)}`;
}

export default function ActionPlanPage({ actions, leaks, analysis, monthlyIncome }) {
  const [completedActions, setCompletedActions] = useState(new Set());
  const [savingsGoal, setSavingsGoal] = useState(500);

  const totalMonthlySavings = actions.reduce((s, a) => s + a.monthlySavings, 0);
  const totalAnnualSavings = actions.reduce((s, a) => s + a.annualSavings, 0);
  const completedSavings = actions
    .filter((_, i) => completedActions.has(i))
    .reduce((s, a) => s + a.monthlySavings, 0);

  // Goal tracking
  let runningTotal = 0;
  const actionsToGoal = [];
  for (const a of actions) {
    runningTotal += a.monthlySavings;
    actionsToGoal.push(a);
    if (runningTotal >= savingsGoal) break;
  }

  const projection30yr = calculateRothProjection(totalMonthlySavings, 30, 0.07);

  const toggleAction = (i) => {
    const next = new Set(completedActions);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setCompletedActions(next);
  };

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Action Plan</h1>
        <p style={styles.subtitle}>Your personalized roadmap — ranked by savings impact</p>
      </div>

      {/* Summary Banner */}
      <div style={styles.banner}>
        <div style={styles.bannerLeft}>
          <div style={styles.bannerStat}>
            <div style={styles.bannerLabel}>Total Monthly Savings</div>
            <div style={{ ...styles.bannerValue, color: '#10b981' }}>${Math.round(totalMonthlySavings)}/mo</div>
          </div>
          <div style={styles.bannerDivider} />
          <div style={styles.bannerStat}>
            <div style={styles.bannerLabel}>Annual Savings</div>
            <div style={{ ...styles.bannerValue, color: '#3b82f6' }}>{formatCurrency(totalAnnualSavings)}/yr</div>
          </div>
          <div style={styles.bannerDivider} />
          <div style={styles.bannerStat}>
            <div style={styles.bannerLabel}>30-Year Roth IRA</div>
            <div style={{ ...styles.bannerValue, color: '#8b5cf6' }}>{formatCurrency(projection30yr.finalBalance)}</div>
          </div>
        </div>
      </div>

      {/* Progress */}
      <div style={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={styles.cardTitle}>Progress</h3>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#10b981' }}>
            {completedActions.size}/{actions.length} completed — ${Math.round(completedSavings)}/mo saved
          </span>
        </div>
        <div style={styles.progressTrack}>
          <div style={{
            ...styles.progressFill,
            width: `${actions.length > 0 ? (completedActions.size / actions.length) * 100 : 0}%`
          }} />
        </div>
      </div>

      {/* Savings Goal */}
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>🎯 Savings Goal</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
          <span style={{ fontSize: 13, color: '#94a3b8' }}>I want to save</span>
          <div style={styles.goalInput}>
            <span style={{ color: '#64748b' }}>$</span>
            <input
              type="number"
              value={savingsGoal}
              onChange={e => setSavingsGoal(Number(e.target.value))}
              style={styles.input}
            />
            <span style={{ color: '#64748b', fontSize: 13 }}>/mo</span>
          </div>
        </div>
        {savingsGoal > 0 && (
          <div style={styles.goalResult}>
            {runningTotal >= savingsGoal ? (
              <p>
                Do these <span style={{ color: '#10b981', fontWeight: 700 }}>{actionsToGoal.length} things</span> and
                you'll hit <span style={{ color: '#10b981', fontWeight: 700 }}>${savingsGoal}/mo</span>:
                {actionsToGoal.map(a => a.title).join(' → ')}
              </p>
            ) : (
              <p>
                All {actions.length} actions combined save ${Math.round(totalMonthlySavings)}/mo.
                You'll need to find an additional ${savingsGoal - Math.round(totalMonthlySavings)}/mo from budget cuts.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Action Items */}
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>Do These This Week</h3>
        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
          Ranked by annual savings impact — highest first
        </p>

        {actions.map((action, i) => (
          <ActionRow
            key={i}
            action={action}
            index={i}
            completed={completedActions.has(i)}
            onToggle={() => toggleAction(i)}
          />
        ))}
      </div>

      {/* Quick Wins vs. Big Moves */}
      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ ...styles.card, flex: 1 }}>
          <h3 style={styles.cardTitle}>⚡ Quick Wins (Easy)</h3>
          <p style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>Cancel online in 2 minutes</p>
          {actions.filter(a => a.difficulty === 'Easy').map((a, i) => (
            <div key={i} style={styles.quickWinRow}>
              <span style={styles.quickWinName}>{a.title}</span>
              <span style={styles.quickWinAmount}>${Math.round(a.monthlySavings)}/mo</span>
            </div>
          ))}
        </div>
        <div style={{ ...styles.card, flex: 1 }}>
          <h3 style={styles.cardTitle}>💪 Big Moves (Worth the Effort)</h3>
          <p style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>Requires a phone call or switch</p>
          {actions.filter(a => a.difficulty !== 'Easy').map((a, i) => (
            <div key={i} style={styles.quickWinRow}>
              <span style={styles.quickWinName}>{a.title}</span>
              <span style={styles.quickWinAmount}>${Math.round(a.monthlySavings)}/mo</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ActionRow({ action, index, completed, onToggle }) {
  const [expanded, setExpanded] = useState(false);
  const [showScript, setShowScript] = useState(false);
  const script = generateNegotiationScript(action.title.replace('Cut ', ''), action.monthlySavings);

  return (
    <div style={{
      ...styles.actionRow,
      opacity: completed ? 0.5 : 1,
    }}>
      <div style={styles.actionMain} onClick={() => setExpanded(!expanded)}>
        <button onClick={(e) => { e.stopPropagation(); onToggle(); }} style={styles.checkbox}>
          {completed ? '✅' : '⬜'}
        </button>
        <div style={{
          ...styles.priorityBadge,
          background: action.priority === 1 ? 'rgba(239,68,68,0.15)' : action.priority === 2 ? 'rgba(245,158,11,0.15)' : 'rgba(59,130,246,0.15)',
          color: action.priority === 1 ? '#ef4444' : action.priority === 2 ? '#f59e0b' : '#3b82f6',
        }}>
          #{index + 1}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{
            ...styles.actionTitle,
            textDecoration: completed ? 'line-through' : 'none',
          }}>{action.title}</div>
          <div style={styles.actionSub}>{action.difficulty} — {action.type}</div>
        </div>
        <div style={styles.actionSavings}>
          <div style={styles.actionMonthly}>${Math.round(action.monthlySavings)}/mo</div>
          <div style={styles.actionAnnual}>{formatCurrency(action.annualSavings)}/yr</div>
        </div>
        <span style={styles.expandArrow}>{expanded ? '▼' : '▶'}</span>
      </div>

      {expanded && (
        <div style={styles.actionExpanded}>
          <div style={styles.actionStep}>
            <strong style={{ color: '#f1f5f9' }}>How to execute:</strong>
            <p style={{ marginTop: 6 }}>{action.action}</p>
          </div>
          <div style={styles.actionStep}>
            <strong style={{ color: '#f1f5f9' }}>Automation:</strong>
            <p style={{ marginTop: 6 }}>{action.automation}</p>
          </div>
          <button
            style={styles.scriptBtn}
            onClick={() => setShowScript(!showScript)}
          >
            📞 {showScript ? 'Hide' : 'Show'} Negotiation Script
          </button>
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
  banner: {
    background: 'linear-gradient(135deg, rgba(16,185,129,0.1), rgba(59,130,246,0.1))',
    border: '1px solid rgba(16,185,129,0.2)', borderRadius: 12,
    padding: '24px 32px', marginBottom: 20,
  },
  bannerLeft: { display: 'flex', alignItems: 'center', gap: 32 },
  bannerStat: {},
  bannerLabel: { fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 },
  bannerValue: { fontSize: 24, fontWeight: 800 },
  bannerDivider: { width: 1, height: 40, background: '#1e293b' },
  card: {
    background: '#1a2235', borderRadius: 12, padding: '24px',
    border: '1px solid #1e293b', marginBottom: 16,
  },
  cardTitle: { fontSize: 16, fontWeight: 700, color: '#f1f5f9', marginBottom: 4 },
  progressTrack: { height: 8, background: '#0f172a', borderRadius: 4 },
  progressFill: {
    height: '100%', borderRadius: 4, background: 'linear-gradient(90deg, #10b981, #3b82f6)',
    transition: 'width 0.4s ease',
  },
  goalInput: {
    display: 'flex', alignItems: 'center', gap: 6,
    background: '#0f172a', borderRadius: 8, padding: '8px 12px',
    border: '1px solid #334155',
  },
  input: {
    background: 'transparent', border: 'none', outline: 'none',
    color: '#f1f5f9', fontSize: 18, fontWeight: 700, width: 80,
    textAlign: 'center',
  },
  goalResult: {
    padding: '12px 16px', background: 'rgba(16,185,129,0.08)',
    borderRadius: 8, border: '1px solid rgba(16,185,129,0.2)',
    fontSize: 13, color: '#94a3b8', lineHeight: 1.6,
  },
  actionRow: {
    borderBottom: '1px solid #1e293b', paddingBottom: 8, marginBottom: 8,
  },
  actionMain: {
    display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', cursor: 'pointer',
  },
  checkbox: {
    background: 'transparent', border: 'none', fontSize: 18, cursor: 'pointer', padding: 0,
  },
  priorityBadge: {
    fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20,
  },
  actionTitle: { fontSize: 14, fontWeight: 600, color: '#f1f5f9' },
  actionSub: { fontSize: 11, color: '#64748b' },
  actionSavings: { textAlign: 'right' },
  actionMonthly: { fontSize: 14, fontWeight: 700, color: '#10b981' },
  actionAnnual: { fontSize: 11, color: '#64748b' },
  expandArrow: { fontSize: 10, color: '#64748b', width: 16 },
  actionExpanded: { padding: '12px 0 8px 48px' },
  actionStep: { fontSize: 13, color: '#94a3b8', marginBottom: 12, lineHeight: 1.5 },
  scriptBtn: {
    background: 'rgba(59,130,246,0.15)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)',
    borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600,
  },
  scriptBox: {
    background: '#0f172a', borderRadius: 8, padding: 16, marginTop: 12,
    fontSize: 12, color: '#94a3b8', lineHeight: 1.6, whiteSpace: 'pre-wrap',
    border: '1px solid #1e293b', fontFamily: 'inherit',
  },
  quickWinRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '8px 0', borderBottom: '1px solid #1e293b',
  },
  quickWinName: { fontSize: 13, color: '#f1f5f9' },
  quickWinAmount: { fontSize: 13, fontWeight: 700, color: '#10b981' },
};
