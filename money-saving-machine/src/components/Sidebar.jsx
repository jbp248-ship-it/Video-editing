import React, { useState, useEffect } from 'react';
import DownloadModal from './DownloadModal';

const navItems = [
  { id: 'home', label: 'My Financial Picture', icon: '🏠' },
  { id: 'leaks', label: 'Money Leaks', icon: '🔍' },
  { id: 'wealth', label: 'Build Wealth', icon: '🤖' },
  { id: 'plan', label: 'Action Plan', icon: '🎯' },
];

export default function Sidebar({ activeTab, setActiveTab, healthScore, hasData }) {
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [pwaInstalled, setPwaInstalled] = useState(false);

  // Detect if running inside Electron (hide download button if already in desktop app)
  const isElectron = typeof window !== 'undefined' &&
    (window.navigator.userAgent.includes('Electron') || window.__ELECTRON__);

  // Listen for the PWA beforeinstallprompt event
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // Detect if already installed as PWA
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    if (mediaQuery.matches) {
      setPwaInstalled(true);
    }
    const onChange = (e) => setPwaInstalled(e.matches);
    mediaQuery.addEventListener('change', onChange);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      mediaQuery.removeEventListener('change', onChange);
    };
  }, []);

  const handlePwaInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    if (result.outcome === 'accepted') {
      setPwaInstalled(true);
    }
    setDeferredPrompt(null);
  };

  return (
    <div style={styles.sidebar}>
      <div style={styles.brand}>
        <div style={styles.logo}>💸</div>
        <div>
          <div style={styles.brandName} className="sidebar-brand-gradient">Money Machine</div>
          <div style={styles.brandSub}>Financial Audit Tool</div>
        </div>
      </div>

      {hasData && healthScore !== null && (
        <div style={styles.scoreCard}>
          <div style={styles.scoreLabel}>Health Score</div>
          <div className="health-score-pulse" style={{
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

      {/* Download / Install section — only shown in browser, not in Electron */}
      {!isElectron && (
        <div style={styles.downloadSection}>
          {/* PWA install button — shown only when the browser offers it */}
          {deferredPrompt && !pwaInstalled && (
            <button style={styles.pwaBtn} onClick={handlePwaInstall}>
              <span style={styles.pwaIcon}>📲</span>
              <div>
                <div style={styles.pwaLabel}>Install App</div>
                <div style={styles.pwaSub}>Add to your desktop instantly</div>
              </div>
            </button>
          )}

          {pwaInstalled && (
            <div style={styles.pwaInstalled}>
              <span>✅</span>
              <span style={styles.pwaInstalledText}>App installed</span>
            </div>
          )}

          {/* Desktop download button */}
          <button style={styles.downloadBtn} onClick={() => setShowDownloadModal(true)}>
            <div style={styles.downloadBtnInner}>
              <span style={styles.downloadIcon}>⬇️</span>
              <div>
                <div style={styles.downloadLabel}>Download Desktop App</div>
                <div style={styles.downloadSub}>Available for Windows &amp; Mac</div>
              </div>
            </div>
          </button>
        </div>
      )}

      <div style={styles.footer}>
        <div style={styles.footerText}>Phase 1 — Desktop App</div>
        <div style={styles.footerVersion}>v1.0.0</div>
      </div>

      <DownloadModal
        isOpen={showDownloadModal}
        onClose={() => setShowDownloadModal(false)}
      />
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
    cursor: 'pointer',
  },
  navItemActive: {
    background: 'rgba(59, 130, 246, 0.15)',
    color: '#3b82f6',
    fontWeight: 600,
  },
  navIcon: {
    fontSize: 18,
  },

  /* ---- Download section ---- */
  downloadSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    marginBottom: 16,
  },

  // Desktop download button
  downloadBtn: {
    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
    border: 'none',
    borderRadius: 10,
    padding: 2,          // thin gradient border trick
    cursor: 'pointer',
    width: '100%',
  },
  downloadBtnInner: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
    borderRadius: 9,
    padding: '12px 14px',
  },
  downloadIcon: {
    fontSize: 20,
    flexShrink: 0,
  },
  downloadLabel: {
    fontSize: 13,
    fontWeight: 700,
    color: '#fff',
  },
  downloadSub: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 1,
  },

  // PWA install button
  pwaBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 14px',
    borderRadius: 10,
    border: '1px solid #334155',
    background: '#1e293b',
    color: '#f1f5f9',
    fontSize: 13,
    cursor: 'pointer',
    width: '100%',
    textAlign: 'left',
    transition: 'border-color 0.15s',
  },
  pwaIcon: {
    fontSize: 18,
    flexShrink: 0,
  },
  pwaLabel: {
    fontWeight: 600,
    fontSize: 13,
    color: '#f1f5f9',
  },
  pwaSub: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 1,
  },
  pwaInstalled: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 14px',
    borderRadius: 10,
    border: '1px solid #1e3a2f',
    background: 'rgba(16, 185, 129, 0.08)',
  },
  pwaInstalledText: {
    fontSize: 12,
    color: '#10b981',
    fontWeight: 600,
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
