import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAnalysisHistory } from './useAnalysisHistory';
import type { HistoryEntry } from './useAnalysisHistory';

// ─── fixtures ─────────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: 'entry-1',
    timestamp: 1_700_000_000_000,
    dashboardTitles: ['Sales Overview'],
    staticResults: [
      {
        dashboardOid: 'd-1',
        dashboardTitle: 'Sales Overview',
        widgets: [
          {
            widgetOid: 'w-1',
            widgetTitle: 'Revenue Chart',
            widgetType: 'chart',
            script: 'args.result.forEach(function(row) { row.color = "red"; });',
            violations: [],
          },
        ],
      },
    ],
    aiResults: [],
    ...overrides,
  };
}

const STORAGE_KEY = 'wellcheck-history';

beforeEach(() => {
  localStorage.clear();
});

// ─── initialisation ───────────────────────────────────────────────────────────

describe('useAnalysisHistory — initialisation', () => {
  it('starts with an empty list when localStorage has no data', () => {
    const { result } = renderHook(() => useAnalysisHistory());
    expect(result.current.entries).toEqual([]);
  });

  it('hydrates from existing localStorage data on mount', () => {
    const existing = makeEntry({ id: 'hydrated' });
    localStorage.setItem(STORAGE_KEY, JSON.stringify([existing]));

    const { result } = renderHook(() => useAnalysisHistory());
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0]!.id).toBe('hydrated');
  });

  it('returns an empty list when localStorage contains invalid JSON', () => {
    localStorage.setItem(STORAGE_KEY, 'not-valid-json{{{');
    const { result } = renderHook(() => useAnalysisHistory());
    expect(result.current.entries).toEqual([]);
  });
});

// ─── save ─────────────────────────────────────────────────────────────────────

describe('useAnalysisHistory — save()', () => {
  it('prepends a new entry to the list', () => {
    const { result } = renderHook(() => useAnalysisHistory());

    act(() => { result.current.save(makeEntry({ id: 'a' })); });
    act(() => { result.current.save(makeEntry({ id: 'b' })); });

    expect(result.current.entries[0]!.id).toBe('b');
    expect(result.current.entries[1]!.id).toBe('a');
  });

  it('replaces an existing entry that shares the same id (upsert)', () => {
    const { result } = renderHook(() => useAnalysisHistory());

    act(() => { result.current.save(makeEntry({ id: 'same', dashboardTitles: ['Old'] })); });
    act(() => { result.current.save(makeEntry({ id: 'same', dashboardTitles: ['New'] })); });

    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0]!.dashboardTitles).toEqual(['New']);
  });

  it('persists the new entry to localStorage', () => {
    const { result } = renderHook(() => useAnalysisHistory());

    act(() => { result.current.save(makeEntry({ id: 'persisted' })); });

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as HistoryEntry[];
    expect(stored.some((e) => e.id === 'persisted')).toBe(true);
  });

  it('caps the list at 30 entries', () => {
    const { result } = renderHook(() => useAnalysisHistory());

    for (let i = 0; i < 35; i++) {
      act(() => { result.current.save(makeEntry({ id: `e-${i}` })); });
    }

    expect(result.current.entries).toHaveLength(30);
    // The 30 most-recently saved entries are kept (newest first)
    expect(result.current.entries[0]!.id).toBe('e-34');
  });
});

// ─── remove ───────────────────────────────────────────────────────────────────

describe('useAnalysisHistory — remove()', () => {
  it('removes the entry with the matching id', () => {
    const { result } = renderHook(() => useAnalysisHistory());

    act(() => { result.current.save(makeEntry({ id: 'keep' })); });
    act(() => { result.current.save(makeEntry({ id: 'delete-me' })); });
    act(() => { result.current.remove('delete-me'); });

    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0]!.id).toBe('keep');
  });

  it('is a no-op when the id does not exist', () => {
    const { result } = renderHook(() => useAnalysisHistory());
    act(() => { result.current.save(makeEntry({ id: 'x' })); });
    act(() => { result.current.remove('nonexistent'); });
    expect(result.current.entries).toHaveLength(1);
  });

  it('syncs the removal to localStorage', () => {
    const { result } = renderHook(() => useAnalysisHistory());
    act(() => { result.current.save(makeEntry({ id: 'gone' })); });
    act(() => { result.current.remove('gone'); });

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as HistoryEntry[];
    expect(stored.some((e) => e.id === 'gone')).toBe(false);
  });
});

// ─── clear ────────────────────────────────────────────────────────────────────

describe('useAnalysisHistory — clear()', () => {
  it('empties the entries list', () => {
    const { result } = renderHook(() => useAnalysisHistory());
    act(() => { result.current.save(makeEntry({ id: 'a' })); });
    act(() => { result.current.save(makeEntry({ id: 'b' })); });
    act(() => { result.current.clear(); });
    expect(result.current.entries).toEqual([]);
  });

  it('removes the localStorage key', () => {
    const { result } = renderHook(() => useAnalysisHistory());
    act(() => { result.current.save(makeEntry()); });
    act(() => { result.current.clear(); });
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
