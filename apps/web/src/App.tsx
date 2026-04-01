import { Routes, Route, Navigate } from 'react-router-dom';
import { ConnectionProvider } from '@/connection/ConnectionContext';
import { ConnectionPage } from '@/connection/ConnectionPage';
import { AnalysisPage } from '@/analysis/AnalysisPage';
import { HistoryProvider } from '@/history/HistoryContext';
import { HistorySheet } from '@/history/HistorySheet';
import { HistoryEntryPage } from '@/history/HistoryEntryPage';

export default function App() {
  return (
    <HistoryProvider>
      <ConnectionProvider>
        <div className="min-h-screen bg-background">
          <Routes>
            <Route path="/" element={<ConnectionPage />} />
            <Route path="/analysis" element={<AnalysisPage />} />
            <Route path="/history/:id" element={<HistoryEntryPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <HistorySheet />
        </div>
      </ConnectionProvider>
    </HistoryProvider>
  );
}
