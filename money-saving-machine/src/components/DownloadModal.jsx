import React from 'react';

const GITHUB_RELEASES_URL = 'https://github.com/money-saving-machine/releases/latest';

export default function DownloadModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Close button */}
        <button style={styles.closeBtn} onClick={onClose} aria-label="Close">
          &times;
        </button>

        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerIcon}>💸</div>
          <h2 style={styles.title}>Get Money Saving Machine</h2>
          <p style={styles.subtitle}>
            Install the desktop app for the best experience — faster performance,
            offline access, and native system integration.
          </p>
        </div>

        {/* Download options */}
        <div style={styles.options}>
          {/* Windows */}
          <a
            href={GITHUB_RELEASES_URL + '/download/Money-Saving-Machine-Setup.exe'}
            style={styles.primaryBtn}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span style={styles.btnIcon}>🪟</span>
            <div>
              <div style={styles.btnLabel}>Download for Windows</div>
              <div style={styles.btnSub}>.exe installer — Windows 10+</div>
            </div>
          </a>

          {/* Mac */}
          <a
            href={GITHUB_RELEASES_URL + '/download/Money-Saving-Machine.dmg'}
            style={styles.secondaryBtn}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span style={styles.btnIcon}>🍎</span>
            <div>
              <div style={styles.btnLabel}>Download for Mac</div>
              <div style={styles.btnSub}>.dmg installer — macOS 11+</div>
            </div>
          </a>

          {/* Browser */}
          <button style={styles.tertiaryBtn} onClick={onClose}>
            <span style={styles.btnIcon}>🌐</span>
            <div>
              <div style={styles.btnLabel}>Continue in Browser</div>
              <div style={styles.btnSub}>You're already here — no install needed</div>
            </div>
            <span style={styles.activeBadge}>Active</span>
          </button>
        </div>

        {/* Features */}
        <div style={styles.features}>
          <div style={styles.featuresTitle}>Why go desktop?</div>
          <div style={styles.featureGrid}>
            {[
              { icon: '⚡', text: 'Faster CSV processing' },
              { icon: '📴', text: 'Works offline' },
              { icon: '🔒', text: 'Data stays on your machine' },
              { icon: '🖥️', text: 'Native OS notifications' },
            ].map((f, i) => (
              <div key={i} style={styles.featureItem}>
                <span style={styles.featureIcon}>{f.icon}</span>
                <span style={styles.featureText}>{f.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* System requirements */}
        <div style={styles.sysReq}>
          <div style={styles.sysReqTitle}>System Requirements</div>
          <div style={styles.sysReqText}>
            Windows 10+ or macOS 11+ &bull; 4 GB RAM &bull; 200 MB disk space
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.7)',
    backdropFilter: 'blur(6px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    animation: 'fadeIn 0.2s ease',
  },
  modal: {
    background: '#111827',
    border: '1px solid #1e293b',
    borderRadius: 16,
    padding: '32px',
    maxWidth: 480,
    width: '90vw',
    position: 'relative',
    boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
  },
  closeBtn: {
    position: 'absolute',
    top: 12,
    right: 16,
    background: 'none',
    border: 'none',
    color: '#64748b',
    fontSize: 28,
    cursor: 'pointer',
    lineHeight: 1,
    padding: 4,
  },
  header: {
    textAlign: 'center',
    marginBottom: 28,
  },
  headerIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  title: {
    margin: 0,
    fontSize: 22,
    fontWeight: 700,
    color: '#f1f5f9',
  },
  subtitle: {
    margin: '8px 0 0',
    fontSize: 13,
    color: '#94a3b8',
    lineHeight: 1.5,
  },
  options: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    marginBottom: 24,
  },

  // Primary — Windows
  primaryBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '14px 18px',
    borderRadius: 10,
    border: 'none',
    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
    color: '#fff',
    fontSize: 14,
    cursor: 'pointer',
    textDecoration: 'none',
    transition: 'transform 0.15s, box-shadow 0.15s',
  },
  // Secondary — Mac
  secondaryBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '14px 18px',
    borderRadius: 10,
    border: '1px solid #334155',
    background: '#1e293b',
    color: '#f1f5f9',
    fontSize: 14,
    cursor: 'pointer',
    textDecoration: 'none',
    transition: 'transform 0.15s',
  },
  // Tertiary — Browser
  tertiaryBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '14px 18px',
    borderRadius: 10,
    border: '1px solid #1e293b',
    background: 'transparent',
    color: '#94a3b8',
    fontSize: 14,
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
    position: 'relative',
  },
  btnIcon: {
    fontSize: 22,
    flexShrink: 0,
  },
  btnLabel: {
    fontWeight: 600,
    marginBottom: 2,
  },
  btnSub: {
    fontSize: 11,
    opacity: 0.7,
  },
  activeBadge: {
    marginLeft: 'auto',
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: '#10b981',
    border: '1px solid #10b981',
    borderRadius: 6,
    padding: '2px 8px',
  },

  // Features
  features: {
    background: '#0f172a',
    borderRadius: 10,
    padding: '16px 18px',
    marginBottom: 16,
  },
  featuresTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: 12,
  },
  featureGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 10,
  },
  featureItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  featureIcon: {
    fontSize: 16,
  },
  featureText: {
    fontSize: 13,
    color: '#cbd5e1',
  },

  // System requirements
  sysReq: {
    textAlign: 'center',
  },
  sysReqTitle: {
    fontSize: 10,
    fontWeight: 600,
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: 4,
  },
  sysReqText: {
    fontSize: 11,
    color: '#475569',
  },
};
