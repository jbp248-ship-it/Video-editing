import React, { useState, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import HomePage from './components/HomePage';
import LeaksPage from './components/LeaksPage';
import WealthPage from './components/WealthPage';
import ActionPlanPage from './components/ActionPlanPage';
import OnboardingModal from './components/OnboardingModal';
import { parseCSV, analyzeTransactions, detectLeaks, generateActionPlan } from './utils/csvParser';
import { generateSampleTransactions } from './data/sampleData';

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [loading, setLoading] = useState(false);
  const [monthlyIncome, setMonthlyIncome] = useState(0);
  const [analysis, setAnalysis] = useState(null);
  const [leaks, setLeaks] = useState([]);
  const [actions, setActions] = useState([]);

  const handleOnboardingComplete = useCallback(async ({ monthlyIncome: income, csvFile, useDemo }) => {
    setLoading(true);
    setMonthlyIncome(income);

    try {
      let transactions;
      if (useDemo || !csvFile) {
        // Use sample data
        const sampleRows = generateSampleTransactions();
        // Simulate parsing by converting to the same format
        transactions = sampleRows.map(row => {
          const amount = parseFloat(String(row.Amount).replace(/[$,]/g, ''));
          const date = new Date(row.Date);
          return {
            date,
            month: date.toLocaleString('default', { month: 'short', year: 'numeric' }),
            description: row.Description,
            category: row.Category,
            amount: Math.abs(amount),
            isIncome: amount > 0 && (row.Category === 'Income'),
            isTransfer: row.Category === 'Transfers' || row.Category === 'Investment',
            merchant: row.Description,
            raw: row,
          };
        }).filter(t => !isNaN(t.date.getTime()));
      } else {
        transactions = await parseCSV(csvFile);
      }

      const analysisResult = analyzeTransactions(transactions, income);
      const leaksResult = detectLeaks(analysisResult);
      const actionsResult = generateActionPlan(leaksResult, analysisResult, income);

      setAnalysis(analysisResult);
      setLeaks(leaksResult);
      setActions(actionsResult);
      setShowOnboarding(false);
    } catch (err) {
      console.error('Analysis failed:', err);
      alert('Failed to analyze transactions. Please check your CSV format.');
    } finally {
      setLoading(false);
    }
  }, []);

  const renderPage = () => {
    switch (activeTab) {
      case 'home':
        return <HomePage analysis={analysis} monthlyIncome={monthlyIncome} />;
      case 'leaks':
        return <LeaksPage leaks={leaks} analysis={analysis} />;
      case 'wealth':
        return <WealthPage leaks={leaks} analysis={analysis} monthlyIncome={monthlyIncome} />;
      case 'plan':
        return <ActionPlanPage actions={actions} leaks={leaks} analysis={analysis} monthlyIncome={monthlyIncome} />;
      default:
        return <HomePage analysis={analysis} monthlyIncome={monthlyIncome} />;
    }
  };

  if (showOnboarding) {
    return <OnboardingModal onComplete={handleOnboardingComplete} />;
  }

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: '#0a0e17',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16, animation: 'pulse 1.5s infinite' }}>🔍</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: '#f1f5f9', marginBottom: 8 }}>
            Analyzing your finances...
          </div>
          <div style={{ fontSize: 13, color: '#64748b' }}>
            Scanning 6 months of transactions
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0a0e17' }}>
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        healthScore={analysis?.healthScore}
        hasData={!!analysis}
      />
      <main style={{ marginLeft: 260, flex: 1, minHeight: '100vh' }}>
        {renderPage()}
      </main>
    </div>
  );
}
