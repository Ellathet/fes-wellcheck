import { useState, useCallback } from 'react';
import type { DashboardAnalysisResult } from '@/lib/analyze';
import type { AiDashboardResult } from '@/analysis/useAiAnalysis';

export interface HistoryEntry {
  id: string;
  timestamp: number;
  dashboardTitles: string[];
  staticResults: DashboardAnalysisResult[];
  aiResults: AiDashboardResult[];
}

const STORAGE_KEY = 'wellcheck-history';
const MAX_ENTRIES = 30;

function loadEntries(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function persistEntries(entries: HistoryEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // localStorage might be full or unavailable
  }
}

export function useAnalysisHistory() {
  const [entries, setEntries] = useState<HistoryEntry[]>(loadEntries);

  const save = useCallback((entry: HistoryEntry) => {
    setEntries((prev) => {
      const filtered = prev.filter((e) => e.id !== entry.id);
      const updated = [entry, ...filtered].slice(0, MAX_ENTRIES);
      persistEntries(updated);
      return updated;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setEntries((prev) => {
      const updated = prev.filter((e) => e.id !== id);
      persistEntries(updated);
      return updated;
    });
  }, []);

  const clear = useCallback(() => {
    setEntries([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  return { entries, save, remove, clear };
}
