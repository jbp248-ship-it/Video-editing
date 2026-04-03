import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Discovery from './pages/Discovery';
import Inventory from './pages/Inventory';
import PnL from './pages/PnL';
import Alerts from './pages/Alerts';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Discovery />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/pnl" element={<PnL />} />
        <Route path="/alerts" element={<Alerts />} />
      </Routes>
    </Layout>
  );
}
