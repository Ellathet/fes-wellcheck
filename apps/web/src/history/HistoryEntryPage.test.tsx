import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { HistoryProvider } from './HistoryContext';
import { HistoryEntryPage } from './HistoryEntryPage';
import type { HistoryEntry } from './useAnalysisHistory';

// ─── navigate mock ────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

// ─── fixtures ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'wellcheck-history';

function makeEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: 'entry-1',
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

function makeEntryWithViolations(): HistoryEntry {
  return makeEntry({
    id: 'entry-errors',
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
        ],
      },
    ],
    dashboardTitles: ['KPI Dashboard'],
  });
}

function renderPage(id: string, entries: HistoryEntry[] = []) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  return render(
    <MemoryRouter initialEntries={[`/history/${id}`]}>
      <HistoryProvider>
        <Routes>
          <Route path="/history/:id" element={<HistoryEntryPage />} />
        </Routes>
      </HistoryProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  mockNavigate.mockClear();
});

// ─── not found ────────────────────────────────────────────────────────────────

describe('HistoryEntryPage — not found', () => {
  it('shows an error alert when the entry id does not exist', () => {
    renderPage('nonexistent', []);
    expect(screen.getByText(/entry not found/i)).toBeInTheDocument();
  });

  it('shows the "no longer in history" description', () => {
    renderPage('nonexistent', [makeEntry()]);
    expect(screen.getByText(/no longer in your history/i)).toBeInTheDocument();
  });
});

// ─── header ───────────────────────────────────────────────────────────────────

describe('HistoryEntryPage — header', () => {
  it('shows the "Wellcheck Analysis" heading', () => {
    renderPage('entry-1', [makeEntry()]);
    expect(screen.getByText('Wellcheck Analysis')).toBeInTheDocument();
  });

  it('shows a History badge to distinguish from a live analysis', () => {
    renderPage('entry-1', [makeEntry()]);
    expect(screen.getByText('History')).toBeInTheDocument();
  });

  it('shows the dashboard title in the subtitle', () => {
    renderPage('entry-1', [makeEntry({ dashboardTitles: ['Sales Overview'] })]);
    // Title appears in both the subtitle <p> and the dashboard section <h2>
    expect(screen.getAllByText(/Sales Overview/).length).toBeGreaterThanOrEqual(1);
  });

  it('shows the analysis timestamp in the subtitle', () => {
    const ts = new Date('2024-11-01T10:30:00').getTime();
    renderPage('entry-1', [makeEntry({ timestamp: ts })]);
    expect(document.body.textContent).toMatch(/nov/i);
  });

  it('calls navigate(-1) when the back button is clicked', async () => {
    const user = userEvent.setup();
    renderPage('entry-1', [makeEntry()]);
    await user.click(screen.getByRole('button', { name: /back/i }));
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });
});

// ─── results rendering ────────────────────────────────────────────────────────

describe('HistoryEntryPage — results', () => {
  it('renders widget cards from the stored static results', () => {
    renderPage('entry-1', [makeEntry()]);
    expect(screen.getByText('Revenue Chart')).toBeInTheDocument();
  });

  it('shows the "Clean" badge for scripts with no violations', () => {
    renderPage('entry-1', [makeEntry()]);
    expect(screen.getAllByText('Clean').length).toBeGreaterThanOrEqual(1);
  });

  it('renders violation messages from the stored results', () => {
    renderPage('entry-errors', [makeEntryWithViolations()]);
    expect(screen.getByText(/Script modifies "widget.metadata"/)).toBeInTheDocument();
  });

  it('shows the violation count in the summary bar', () => {
    renderPage('entry-errors', [makeEntryWithViolations()]);
    // "1 error" appears in both the summary bar and the widget card
    expect(screen.getAllByText(/1 error/).length).toBeGreaterThanOrEqual(1);
  });

  it('shows "All clean" summary when there are no violations', () => {
    renderPage('entry-1', [makeEntry()]);
    expect(screen.getByText(/all clean/i)).toBeInTheDocument();
  });

  it('shows the dashboard section heading', () => {
    renderPage('entry-1', [makeEntry({ dashboardTitles: ['Sales Overview'] })]);
    expect(screen.getByText('Sales Overview')).toBeInTheDocument();
  });
});

// ─── AI banner ────────────────────────────────────────────────────────────────

describe('HistoryEntryPage — AI results banner', () => {
  it('does not show the AI banner when no AI results are stored', () => {
    renderPage('entry-1', [makeEntry({ aiResults: [] })]);
    expect(screen.queryByText(/includes ai results/i)).not.toBeInTheDocument();
  });

  it('shows the AI banner when the entry has stored AI results', () => {
    const entryWithAi = makeEntry({
      aiResults: [
        {
          dashboardOid: 'd-1',
          widgets: [
            {
              widgetOid: 'w-1',
              result: { violations: [], summary: 'All good.', tokensUsed: 100 },
            },
          ],
        },
      ],
    });
    renderPage('entry-1', [entryWithAi]);
    expect(screen.getByText(/includes ai results/i)).toBeInTheDocument();
  });
});
