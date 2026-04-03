import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Discovery from './pages/Discovery';
import Inventory from './pages/Inventory';
import PnL from './pages/PnL';
import Alerts from './pages/Alerts';
import Settings from './pages/Settings';

export default function App() {
  return (
    <Layout>
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
