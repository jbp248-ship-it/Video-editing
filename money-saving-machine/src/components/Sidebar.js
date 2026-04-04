import React from 'react';

const navItems = [
  { id: 'home', label: 'My Financial Picture', icon: '🏠' },
  { id: 'leaks', label: 'Money Leaks', icon: '🔍' },
  { id: 'wealth', label: 'Build Wealth', icon: '🤖' },
  { id: 'plan', label: 'Action Plan', icon: '🎯' },
];

export default function Sidebar({ activeTab, setActiveTab, healthScore, hasData }) {
  return (
    <div style={styles.sidebar}>
      <div style={styles.brand}>
        <div style={styles.logo}>💸</div>
        <div>
          <div style={styles.brandName}>Money Machine</div>
          <div style={styles.brandSub}>Financial Audit Tool</div>
        </div>
      </div>

      {hasData && healthScore !== null && (
        <div style={styles.scoreCard}>
          <div style={styles.scoreLabel}>Health Score</div>
          <div style={{
            ...styles.scoreValue,
            color: healthScore >= 70 ? '#10b981' : healthScore >= 40 ? '#f59e0b' : '#ef4444'
          }}>
            {healthScore}
          </div>
          <div style={styles.scoreMax}>/100</div>
        </div>
      )}

      <nav style={styles.nav}>
        {navItems.map(item => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            style={{
              ...styles.navItem,
              ...(activeTab === item.id ? styles.navItemActive : {})
            }}
          >
            <span style={styles.navIcon}>{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div style={styles.footer}>
        <div style={styles.footerText}>Phase 1 — Desktop App</div>
        <div style={styles.footerVersion}>v1.0.0</div>
      </div>
    </div>
  );
}

const styles = {
  sidebar: {
    width: 260,
    minHeight: '100vh',
    background: '#111827',
    borderRight: '1px solid #1e293b',
    display: 'flex',
    flexDirection: 'column',
    padding: '24px 16px',
    position: 'fixed',
    left: 0,
    top: 0,
    bottom: 0,
    zIndex: 100,
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 32,
    padding: '0 8px',
  },
  logo: {
    fontSize: 28,
  },
  brandName: {
    fontSize: 18,
    fontWeight: 700,
    color: '#f1f5f9',
  },
  brandSub: {
    fontSize: 11,
    color: '#64748b',
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
  },
  scoreCard: {
    background: 'linear-gradient(135deg, #1a2235, #1e293b)',
    borderRadius: 12,
    padding: '20px 16px',
    marginBottom: 24,
    textAlign: 'center',
    border: '1px solid #334155',
  },
  scoreLabel: {
    fontSize: 11,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    marginBottom: 4,
  },
  scoreValue: {
    fontSize: 48,
    fontWeight: 800,
    lineHeight: 1,
    display: 'inline',
  },
  scoreMax: {
    fontSize: 16,
    color: '#64748b',
    display: 'inline',
  },
  nav: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    flex: 1,
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 16px',
    border: 'none',
    background: 'transparent',
    color: '#94a3b8',
    fontSize: 14,
    borderRadius: 8,
    transition: 'all 0.15s',
    textAlign: 'left',
    width: '100%',
  },
  navItemActive: {
    background: 'rgba(59, 130, 246, 0.15)',
    color: '#3b82f6',
    fontWeight: 600,
  },
  navIcon: {
    fontSize: 18,
  },
  footer: {
    padding: '16px 8px 0',
    borderTop: '1px solid #1e293b',
  },
  footerText: {
    fontSize: 11,
    color: '#64748b',
  },
  footerVersion: {
    fontSize: 11,
    color: '#475569',
  },
};
