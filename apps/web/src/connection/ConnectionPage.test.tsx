import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ConnectionProvider } from './ConnectionContext';
import { ConnectionPage } from './ConnectionPage';

vi.mock('@wellcheck/sdk', () => ({
  createClient: vi.fn(() => ({})),
  getDashboards: vi.fn(),
}));

import { getDashboards } from '@wellcheck/sdk';

const mockDashboards = [
  { oid: 'd-1', title: 'Sales Overview' },
  { oid: 'd-2', title: 'Marketing KPIs', widgets: [{ oid: 'w-1', title: 'Chart', type: 'chart' }] },
  { oid: 'd-3', title: 'Finance Report' },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <ConnectionProvider>
        <ConnectionPage />
      </ConnectionProvider>
    </MemoryRouter>,
  );
}

describe('ConnectionPage — mode tabs', () => {
  it('shows the API form by default', () => {
    renderPage();
    expect(screen.getByLabelText(/sisense url/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/api token/i)).toBeInTheDocument();
  });

  it('switches to the file upload tab', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /upload files/i }));
    expect(screen.queryByLabelText(/sisense url/i)).not.toBeInTheDocument();
    expect(screen.getByText(/drop files here/i)).toBeInTheDocument();
  });

  it('switches back to the API tab', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /upload files/i }));
    await user.click(screen.getByRole('button', { name: /connect via api/i }));
    expect(screen.getByLabelText(/sisense url/i)).toBeInTheDocument();
  });
});

describe('ConnectionPage — connection form (API mode)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the URL and token inputs', () => {
    renderPage();
    expect(screen.getByLabelText(/sisense url/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/api token/i)).toBeInTheDocument();
  });

  it('disables the submit button when inputs are empty', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /connect & fetch/i })).toBeDisabled();
  });

  it('enables the submit button when both inputs are filled', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText(/sisense url/i), 'https://example.com');
    await user.type(screen.getByLabelText(/api token/i), 'my-token');
    expect(screen.getByRole('button', { name: /connect & fetch/i })).toBeEnabled();
  });
});

describe('ConnectionPage — dashboard list (API mode)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows skeleton loaders while fetching', async () => {
    vi.mocked(getDashboards).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(mockDashboards), 200)),
    );
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText(/sisense url/i), 'https://example.com');
    await user.type(screen.getByLabelText(/api token/i), 'token');
    await user.click(screen.getByRole('button', { name: /connect & fetch/i }));
    expect(screen.getByTestId('dashboard-list-loading')).toBeInTheDocument();
  });

  it('shows the dashboard list after a successful fetch', async () => {
    vi.mocked(getDashboards).mockResolvedValue(mockDashboards);
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText(/sisense url/i), 'https://example.com');
    await user.type(screen.getByLabelText(/api token/i), 'token');
    await user.click(screen.getByRole('button', { name: /connect & fetch/i }));
    await waitFor(() => expect(screen.getByTestId('dashboard-list')).toBeInTheDocument());
    expect(screen.getByText('Sales Overview')).toBeInTheDocument();
    expect(screen.getByText('Marketing KPIs')).toBeInTheDocument();
    expect(screen.getByText('Finance Report')).toBeInTheDocument();
  });

  it('shows an error alert when the fetch fails', async () => {
    vi.mocked(getDashboards).mockRejectedValue(new Error('Unauthorized'));
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText(/sisense url/i), 'https://example.com');
    await user.type(screen.getByLabelText(/api token/i), 'bad-token');
    await user.click(screen.getByRole('button', { name: /connect & fetch/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByText(/unauthorized/i)).toBeInTheDocument();
  });
});

describe('ConnectionPage — dashboard selection', () => {
  beforeEach(() => {
    vi.mocked(getDashboards).mockResolvedValue(mockDashboards);
  });

  async function connectAndWait(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText(/sisense url/i), 'https://example.com');
    await user.type(screen.getByLabelText(/api token/i), 'token');
    await user.click(screen.getByRole('button', { name: /connect & fetch/i }));
    await waitFor(() => screen.getByTestId('dashboard-list'));
  }

  it('starts with no dashboards selected', async () => {
    const user = userEvent.setup();
    renderPage();
    await connectAndWait(user);
    expect(screen.getByText('0 of 3 selected')).toBeInTheDocument();
  });

  it('selects a dashboard when its checkbox is clicked', async () => {
    const user = userEvent.setup();
    renderPage();
    await connectAndWait(user);
    await user.click(screen.getByLabelText('Sales Overview'));
    expect(screen.getByText('1 of 3 selected')).toBeInTheDocument();
  });

  it('shows the Analyse button only when at least one dashboard is selected', async () => {
    const user = userEvent.setup();
    renderPage();
    await connectAndWait(user);
    expect(screen.queryByRole('button', { name: /analyse/i })).not.toBeInTheDocument();
    await user.click(screen.getByLabelText('Sales Overview'));
    expect(screen.getByRole('button', { name: /analyse 1 dashboard/i })).toBeInTheDocument();
  });

  it('selects all dashboards with Select all', async () => {
    const user = userEvent.setup();
    renderPage();
    await connectAndWait(user);
    await user.click(screen.getByRole('button', { name: /select all/i }));
    expect(screen.getByText('3 of 3 selected')).toBeInTheDocument();
  });

  it('deselects all dashboards with Deselect all', async () => {
    const user = userEvent.setup();
    renderPage();
    await connectAndWait(user);
    await user.click(screen.getByRole('button', { name: /select all/i }));
    await user.click(screen.getByRole('button', { name: /deselect all/i }));
    expect(screen.getByText('0 of 3 selected')).toBeInTheDocument();
  });

  it('shows plural label when multiple dashboards are selected', async () => {
    const user = userEvent.setup();
    renderPage();
    await connectAndWait(user);
    await user.click(screen.getByLabelText('Sales Overview'));
    await user.click(screen.getByLabelText('Finance Report'));
    expect(screen.getByRole('button', { name: /analyse 2 dashboards/i })).toBeInTheDocument();
  });
});

describe('ConnectionPage — state persistence', () => {
  it('retains the dashboard list after a successful connect', async () => {
    vi.mocked(getDashboards).mockResolvedValue(mockDashboards);
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText(/sisense url/i), 'https://example.com');
    await user.type(screen.getByLabelText(/api token/i), 'token');
    await user.click(screen.getByRole('button', { name: /connect & fetch/i }));
    await waitFor(() => screen.getByTestId('dashboard-list'));
    expect(screen.getByText('Sales Overview')).toBeInTheDocument();
    expect(screen.getByText('Finance Report')).toBeInTheDocument();
  });
});
