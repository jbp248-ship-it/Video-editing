import { useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import Discovery from './pages/Discovery';
import Inventory from './pages/Inventory';
import PnL from './pages/PnL';
import Alerts from './pages/Alerts';
import Settings from './pages/Settings';

function SettingsRedirect() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Only redirect from the root path on first load
    if (location.pathname !== '/') return;

    fetch('/api/settings')
      .then((r) => r.json())
      .then((data) => {
        const allEmpty =
          !data.ANTHROPIC_API_KEY &&
          !data.SEATGEEK_CLIENT_ID &&
          !data.TICKETMASTER_API_KEY;
        if (allEmpty) {
          navigate('/settings', { replace: true });
        }
      })
      .catch(() => {});
  }, [navigate, location.pathname]);

  return null;
}

export default function App() {
  return (
    <Layout>
      <SettingsRedirect />
      <Routes>
        <Route path="/" element={<Discovery />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/pnl" element={<PnL />} />
        <Route path="/alerts" element={<Alerts />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Layout>
  );
}
