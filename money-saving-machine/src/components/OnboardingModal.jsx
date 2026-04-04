import React, { useState, useRef } from 'react';

export default function OnboardingModal({ onComplete }) {
  const [step, setStep] = useState(1);
  const [income, setIncome] = useState('');
  const [csvFile, setCsvFile] = useState(null);
  const [useDemo, setUseDemo] = useState(false);
  const fileRef = useRef();

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) setCsvFile(file);
  };

  const handleComplete = () => {
    const monthlyIncome = parseFloat(income) || 5500;
    onComplete({ monthlyIncome, csvFile, useDemo });
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        {step === 1 && (
          <>
            <div style={styles.stepIcon}>💸</div>
            <h2 style={styles.title}>Money Saving Machine</h2>
            <p style={styles.desc}>
              Upload your bank/Rocket Money CSV and get a complete financial audit with
              actionable steps to cut waste and build wealth.
            </p>
            <div style={styles.features}>
              <Feature icon="🏠" text="See where every dollar goes" />
              <Feature icon="🔍" text="Find hidden money leaks" />
              <Feature icon="🤖" text="Get an automation playbook" />
              <Feature icon="📈" text="Project Roth IRA growth" />
            </div>
            <button style={styles.btnPrimary} onClick={() => setStep(2)}>
              Get Started
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <div style={styles.stepIcon}>💰</div>
            <h2 style={styles.title}>What's your take-home income?</h2>
            <p style={styles.desc}>Monthly after taxes. Used to calculate your 50/30/20 budget split.</p>
            <div style={styles.inputGroup}>
              <span style={styles.inputPrefix}>$</span>
              <input
                type="number"
                placeholder="5,500"
                value={income}
                onChange={e => setIncome(e.target.value)}
                style={styles.input}
                autoFocus
              />
              <span style={styles.inputSuffix}>/month</span>
            </div>
            <button style={styles.btnPrimary} onClick={() => setStep(3)}>
              Continue
            </button>
            <button style={styles.btnGhost} onClick={() => { setIncome('5500'); setStep(3); }}>
              Skip (use $5,500 default)
            </button>
          </>
        )}

        {step === 3 && (
          <>
            <div style={styles.stepIcon}>📄</div>
            <h2 style={styles.title}>Upload your transactions</h2>
            <p style={styles.desc}>
              Export a CSV from Rocket Money, your bank, or any finance app. We'll analyze the last 6 months.
            </p>

            <div
              style={styles.dropZone}
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file) setCsvFile(file);
              }}
            >
              {csvFile ? (
                <>
                  <span style={{ fontSize: 24 }}>✅</span>
                  <div style={styles.fileName}>{csvFile.name}</div>
                  <div style={styles.fileSize}>{(csvFile.size / 1024).toFixed(1)} KB</div>
                </>
              ) : (
                <>
                  <span style={{ fontSize: 32 }}>📁</span>
                  <div style={{ color: '#94a3b8', marginTop: 8 }}>Click or drop your CSV here</div>
                  <div style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>Supports Rocket Money, Mint, bank exports</div>
                </>
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
            </div>

            <button
              style={{
                ...styles.btnPrimary,
                opacity: csvFile ? 1 : 0.5,
              }}
              onClick={handleComplete}
              disabled={!csvFile && !useDemo}
            >
              Analyze My Finances
            </button>

            <div style={styles.divider}>
              <span style={styles.dividerLine} />
              <span style={styles.dividerText}>or</span>
              <span style={styles.dividerLine} />
            </div>

            <button
              style={styles.btnDemo}
              onClick={() => { setUseDemo(true); setTimeout(handleComplete, 100); }}
            >
              🎮 Use Demo Data (6 months of realistic transactions)
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Feature({ icon, text }) {
  return (
    <div style={styles.feature}>
      <span style={{ fontSize: 20 }}>{icon}</span>
      <span style={{ color: '#94a3b8', fontSize: 14 }}>{text}</span>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000, backdropFilter: 'blur(8px)',
  },
  modal: {
    background: '#1a2235', borderRadius: 16, padding: '40px 48px',
    maxWidth: 480, width: '90%', border: '1px solid #334155',
    textAlign: 'center', boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
  },
  stepIcon: { fontSize: 48, marginBottom: 16 },
  title: { fontSize: 24, fontWeight: 800, color: '#f1f5f9', marginBottom: 8 },
  desc: { fontSize: 14, color: '#94a3b8', lineHeight: 1.6, marginBottom: 24 },
  features: {
    display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32,
    textAlign: 'left', padding: '0 16px',
  },
  feature: { display: 'flex', alignItems: 'center', gap: 12 },
  inputGroup: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginBottom: 24,
    background: '#0f172a', borderRadius: 12, padding: '12px 20px',
    border: '1px solid #334155',
  },
  inputPrefix: { color: '#64748b', fontSize: 24, fontWeight: 600 },
  input: {
    background: 'transparent', border: 'none', outline: 'none',
    color: '#f1f5f9', fontSize: 32, fontWeight: 800, width: 150,
    textAlign: 'center',
  },
  inputSuffix: { color: '#64748b', fontSize: 14 },
  btnPrimary: {
    width: '100%', padding: '14px 24px', borderRadius: 10,
    background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#fff',
    border: 'none', fontSize: 16, fontWeight: 700,
    cursor: 'pointer', transition: 'transform 0.1s',
  },
  btnGhost: {
    width: '100%', padding: '12px 24px', borderRadius: 10,
    background: 'transparent', color: '#64748b',
    border: 'none', fontSize: 13, cursor: 'pointer', marginTop: 8,
  },
  btnDemo: {
    width: '100%', padding: '14px 24px', borderRadius: 10,
    background: 'rgba(139,92,246,0.15)', color: '#8b5cf6',
    border: '1px solid rgba(139,92,246,0.3)', fontSize: 14, fontWeight: 600,
    cursor: 'pointer',
  },
  dropZone: {
    border: '2px dashed #334155', borderRadius: 12, padding: '32px 24px',
    marginBottom: 20, cursor: 'pointer', transition: 'border-color 0.2s',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
  },
  fileName: { fontSize: 14, fontWeight: 600, color: '#f1f5f9', marginTop: 8 },
  fileSize: { fontSize: 12, color: '#64748b' },
  divider: { display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' },
  dividerLine: { flex: 1, height: 1, background: '#1e293b' },
  dividerText: { fontSize: 12, color: '#64748b' },
};
