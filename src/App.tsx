import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import AltcoinMonitor from './pages/AltcoinMonitor';
import NGXValuation from './pages/NGXValuation';
import CryptoValuation from './pages/CryptoValuation';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/altcoin-monitor" element={<AltcoinMonitor />} />
        <Route path="/ngx-valuation" element={<NGXValuation />} />
        <Route path="/crypto-valuation" element={<CryptoValuation />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </BrowserRouter>
  );
}
