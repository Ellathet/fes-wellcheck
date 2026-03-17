import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WidgetResult, DashboardScriptResult } from './WidgetResult';
import type { WidgetAnalysisResult, ScriptAnalysisResult } from '@/lib/analyze';

const cleanWidget: WidgetAnalysisResult = {
  widgetOid: 'w-1',
  widgetTitle: 'Revenue Chart',
  widgetType: 'chart',
  script: 'args.result.forEach(function(row) { row.color = "red"; });',
  violations: [],
};

const widgetWithViolations: WidgetAnalysisResult = {
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
};

const cleanDashboardScript: ScriptAnalysisResult = {
  script: 'dashboard.on("widgetloaded", function(e, w) { w.title = w.title; });',
  violations: [],
};

describe('WidgetResult — script collapse', () => {
  it('hides the script by default', () => {
    render(<WidgetResult result={cleanWidget} />);
    expect(screen.queryByTestId('script-content')).not.toBeInTheDocument();
  });

  it('shows "Show script" toggle button', () => {
    render(<WidgetResult result={cleanWidget} />);
    expect(screen.getByText('Show script')).toBeInTheDocument();
  });

  it('reveals the script after clicking "Show script"', async () => {
    const user = userEvent.setup();
    render(<WidgetResult result={cleanWidget} />);
    await user.click(screen.getByText('Show script'));
    const block = screen.getByTestId('script-content');
    expect(block).toBeInTheDocument();
    // The syntax highlighter renders the code as coloured spans — check the
    // full text content contains the key identifiers rather than exact match.
    expect(block.textContent).toContain('args.result');
  });

  it('switches label to "Hide script" when open', async () => {
    const user = userEvent.setup();
    render(<WidgetResult result={cleanWidget} />);
    await user.click(screen.getByText('Show script'));
    expect(screen.getByText('Hide script')).toBeInTheDocument();
  });

  it('collapses the script again after clicking "Hide script"', async () => {
    const user = userEvent.setup();
    render(<WidgetResult result={cleanWidget} />);
    await user.click(screen.getByText('Show script'));
    await user.click(screen.getByText('Hide script'));
    expect(screen.queryByTestId('script-content')).not.toBeInTheDocument();
  });

  it('shows violation rows when there are violations', () => {
    render(<WidgetResult result={widgetWithViolations} />);
    expect(screen.getByText(/Script modifies "widget.metadata"/)).toBeInTheDocument();
  });

  it('shows the Clean badge when there are no violations', () => {
    render(<WidgetResult result={cleanWidget} />);
    expect(screen.getByText('Clean')).toBeInTheDocument();
  });

  it('shows error count badge when there are errors', () => {
    render(<WidgetResult result={widgetWithViolations} />);
    expect(screen.getByText('1 error')).toBeInTheDocument();
  });

  it('displays the widget type badge', () => {
    render(<WidgetResult result={cleanWidget} />);
    expect(screen.getByText('chart')).toBeInTheDocument();
  });
});

describe('DashboardScriptResult — script collapse', () => {
  it('hides the script by default', () => {
    render(<DashboardScriptResult result={cleanDashboardScript} />);
    expect(screen.queryByTestId('script-content')).not.toBeInTheDocument();
  });

  it('reveals the script after clicking "Show script"', async () => {
    const user = userEvent.setup();
    render(<DashboardScriptResult result={cleanDashboardScript} />);
    await user.click(screen.getByText('Show script'));
    expect(screen.getByTestId('script-content').textContent).toContain('widgetloaded');
  });

  it('displays the "dashboard" type badge', () => {
    render(<DashboardScriptResult result={cleanDashboardScript} />);
    expect(screen.getByText('dashboard')).toBeInTheDocument();
  });

  it('shows the title "Dashboard script"', () => {
    render(<DashboardScriptResult result={cleanDashboardScript} />);
    expect(screen.getByText('Dashboard script')).toBeInTheDocument();
  });
});
