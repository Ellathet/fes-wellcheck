import { Routes, Route, Navigate } from 'react-router-dom';
import { ConnectionProvider } from '@/connection/ConnectionContext';
import { ConnectionPage } from '@/connection/ConnectionPage';
import { AnalysisPage } from '@/analysis/AnalysisPage';

export default function App() {
  return (
    <ConnectionProvider>
      <div className="min-h-screen bg-background">
        <Routes>
          <Route path="/" element={<ConnectionPage />} />
          <Route path="/analysis" element={<AnalysisPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </ConnectionProvider>
  );
}
