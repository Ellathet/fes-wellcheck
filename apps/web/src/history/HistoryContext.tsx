import { createContext, useContext, type ReactNode } from 'react';
import { useAnalysisHistory, type HistoryEntry } from './useAnalysisHistory';

interface HistoryContextValue {
  entries: HistoryEntry[];
  save: (entry: HistoryEntry) => void;
  remove: (id: string) => void;
  clear: () => void;
}

const HistoryContext = createContext<HistoryContextValue | null>(null);

export function HistoryProvider({ children }: { children: ReactNode }) {
  const history = useAnalysisHistory();
  return <HistoryContext.Provider value={history}>{children}</HistoryContext.Provider>;
}

export function useHistory(): HistoryContextValue {
  const ctx = useContext(HistoryContext);
  if (!ctx) throw new Error('useHistory must be used within HistoryProvider');
  return ctx;
}
