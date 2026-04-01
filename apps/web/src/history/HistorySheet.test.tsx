import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});
import { HistoryProvider } from './HistoryContext';
import { HistorySheet } from './HistorySheet';
import type { HistoryEntry } from './useAnalysisHistory';

// ─── fixtures ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'wellcheck-history';

function makeEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: 'e-1',
    timestamp: new Date('2024-11-01T10:30:00').getTime(),
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

function makeEntryWithViolations(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return makeEntry({
    id: 'e-errors',
    staticResults: [
      {
        dashboardOid: 'd-2',
        dashboardTitle: 'KPI Dashboard',
        widgets: [
          {
            widgetOid: 'w-2',
            widgetTitle: 'KPI Widget',
            widgetType: 'indicator',
            script: 'widget.metadata.panels = [];',
            violations: [
              {
                rule: 'no-metadata-override-in-script',
                severity: 'error',
                message: 'Script modifies "widget.metadata"',
                line: 1,
                snippet: 'widget.metadata',
              },
            ],
          },
          {
            widgetOid: 'w-3',
            widgetTitle: 'Trend Chart',
            widgetType: 'chart',
            script: 'var x = 1;',
            violations: [
              {
                rule: 'no-unimpactful-code',
                severity: 'warning',
                message: '"x" is declared but never used',
                line: 1,
                snippet: 'var x = 1',
              },
            ],
          },
        ],
      },
    ],
    dashboardTitles: ['KPI Dashboard'],
    ...overrides,
  });
}

function seedLocalStorage(entries: HistoryEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function renderSheet(seedEntries?: HistoryEntry[]) {
  if (seedEntries) seedLocalStorage(seedEntries);
  return render(
    <MemoryRouter>
      <HistoryProvider>
        <HistorySheet />
      </HistoryProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  mockNavigate.mockClear();
});

// ─── floating trigger ─────────────────────────────────────────────────────────

describe('HistorySheet — floating trigger button', () => {
  it('renders the floating "History" button', () => {
    renderSheet();
    expect(screen.getByRole('button', { name: /history/i })).toBeInTheDocument();
  });

  it('does not show a count badge when there are no entries', () => {
    renderSheet();
    const btn = screen.getByRole('button', { name: /history/i });
    // the badge text is a number; confirm there's no digit rendered inside the button
    expect(btn.textContent).not.toMatch(/\d/);
  });

  it('shows the entry count badge when entries exist', () => {
    renderSheet([makeEntry({ id: 'a' }), makeEntry({ id: 'b' })]);
    const btn = screen.getByRole('button', { name: /history/i });
    expect(btn.textContent).toContain('2');
  });

  it('opens the sheet on click', async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.click(screen.getByRole('button', { name: /history/i }));
    expect(screen.getByText('Analysis History')).toBeInTheDocument();
  });
});

// ─── empty state ──────────────────────────────────────────────────────────────

describe('HistorySheet — empty state', () => {
  it('shows an empty-state message when there are no saved analyses', async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.click(screen.getByRole('button', { name: /history/i }));
    expect(screen.getByText(/run an analysis to see it here/i)).toBeInTheDocument();
  });

  it('shows 0 saved analyses in the description', async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.click(screen.getByRole('button', { name: /history/i }));
    expect(screen.getByText(/no past analyses yet/i)).toBeInTheDocument();
  });
});

// ─── list view ────────────────────────────────────────────────────────────────

describe('HistorySheet — list view', () => {
  it('lists each saved entry by dashboard title', async () => {
    const user = userEvent.setup();
    renderSheet([
      makeEntry({ id: 'a', dashboardTitles: ['Alpha'] }),
      makeEntry({ id: 'b', dashboardTitles: ['Beta'] }),
    ]);
    await user.click(screen.getByRole('button', { name: /history/i }));
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('shows "Clean" badge for entries with no violations', async () => {
    const user = userEvent.setup();
    renderSheet([makeEntry()]);
    await user.click(screen.getByRole('button', { name: /history/i }));
    // There will be two "Clean" elements: the sheet heading area and the badge
    const badges = screen.getAllByText('Clean');
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it('shows error badge for entries with errors', async () => {
    const user = userEvent.setup();
    renderSheet([makeEntryWithViolations()]);
    await user.click(screen.getByRole('button', { name: /history/i }));
    expect(screen.getByText(/1 error/i)).toBeInTheDocument();
  });

  it('shows warning badge for entries with warnings', async () => {
    const user = userEvent.setup();
    renderSheet([makeEntryWithViolations()]);
    await user.click(screen.getByRole('button', { name: /history/i }));
    expect(screen.getByText(/1 warning/i)).toBeInTheDocument();
  });

  it('shows the count of saved analyses in the sheet description', async () => {
    const user = userEvent.setup();
    renderSheet([makeEntry({ id: 'a' }), makeEntry({ id: 'b' })]);
    await user.click(screen.getByRole('button', { name: /history/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/2 saved analyses/i)).toBeInTheDocument();
  });

  it('uses singular "analysis" for exactly one entry', async () => {
    const user = userEvent.setup();
    renderSheet([makeEntry()]);
    await user.click(screen.getByRole('button', { name: /history/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/1 saved analysis/i)).toBeInTheDocument();
  });

  it('abbreviates the title when multiple dashboards are in one entry', async () => {
    const user = userEvent.setup();
    renderSheet([makeEntry({ dashboardTitles: ['Alpha', 'Beta', 'Gamma'] })]);
    await user.click(screen.getByRole('button', { name: /history/i }));
    expect(screen.getByText(/alpha \+2 more/i)).toBeInTheDocument();
  });
});

// ─── navigation on click ──────────────────────────────────────────────────────

describe('HistorySheet — navigation', () => {
  it('navigates to /history/:id and closes the sheet when an entry is clicked', async () => {
    const user = userEvent.setup();
    renderSheet([makeEntry({ id: 'abc123', dashboardTitles: ['Sales Overview'] })]);
    await user.click(screen.getByRole('button', { name: /history/i }));
    await user.click(screen.getAllByText('Sales Overview')[0]!);
    expect(mockNavigate).toHaveBeenCalledWith('/history/abc123');
  });

  it('closes the sheet after navigation', async () => {
    const user = userEvent.setup();
    renderSheet([makeEntry({ id: 'x' })]);
    await user.click(screen.getByRole('button', { name: /history/i }));
    await user.click(screen.getAllByText('Sales Overview')[0]!);
    // Sheet closes — the dialog role should no longer be present
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });
});

// ─── delete single entry ──────────────────────────────────────────────────────

describe('HistorySheet — removing an entry', () => {
  it('removes the entry from the list after clicking its delete button', async () => {
    const user = userEvent.setup();
    renderSheet([
      makeEntry({ id: 'a', dashboardTitles: ['Alpha'] }),
      makeEntry({ id: 'b', dashboardTitles: ['Beta'] }),
    ]);
    await user.click(screen.getByRole('button', { name: /history/i }));

    const [deleteAlpha] = screen.getAllByRole('button', { name: /remove from history/i });
    await user.click(deleteAlpha!);

    await waitFor(() => expect(screen.queryByText('Alpha')).not.toBeInTheDocument());
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('removes the deleted entry from localStorage', async () => {
    const user = userEvent.setup();
    renderSheet([makeEntry({ id: 'gone', dashboardTitles: ['Gone'] })]);
    await user.click(screen.getByRole('button', { name: /history/i }));

    await user.click(screen.getByRole('button', { name: /remove from history/i }));

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as HistoryEntry[];
    expect(stored.some((e) => e.id === 'gone')).toBe(false);
  });
});

// ─── clear all ────────────────────────────────────────────────────────────────

describe('HistorySheet — clear all history', () => {
  it('shows the "Clear all history" button when entries exist', async () => {
    const user = userEvent.setup();
    renderSheet([makeEntry()]);
    await user.click(screen.getByRole('button', { name: /history/i }));
    expect(screen.getByRole('button', { name: /clear all history/i })).toBeInTheDocument();
  });

  it('removes all entries after clicking "Clear all history"', async () => {
    const user = userEvent.setup();
    renderSheet([makeEntry({ id: 'a' }), makeEntry({ id: 'b' })]);
    await user.click(screen.getByRole('button', { name: /history/i }));
    await user.click(screen.getByRole('button', { name: /clear all history/i }));
    expect(screen.getByText(/run an analysis to see it here/i)).toBeInTheDocument();
  });

  it('clears localStorage after clearing all history', async () => {
    const user = userEvent.setup();
    renderSheet([makeEntry()]);
    await user.click(screen.getByRole('button', { name: /history/i }));
    await user.click(screen.getByRole('button', { name: /clear all history/i }));
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
