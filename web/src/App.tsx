import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { OpsPage } from './pages/OpsPage';
import { FindPage } from './pages/FindPage';
import { OPS_ENABLED } from './lib/data';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/find" element={<FindPage />} />
        <Route path="/" element={OPS_ENABLED ? <OpsPage /> : <Navigate to="/find" replace />} />
        <Route path="*" element={<Navigate to={OPS_ENABLED ? '/' : '/find'} replace />} />
      </Routes>
    </BrowserRouter>
  );
}
