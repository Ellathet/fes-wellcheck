import { useState, useCallback } from 'react';
import { createClient, getDashboard, getWidgets } from '@wellcheck/sdk';
import type { Dashboard, SisenseConfig } from '@wellcheck/sdk';
import { analyzeWidgetScript, analyzeDashboardScript } from '@/lib/analyze';
import type { DashboardAnalysisResult } from '@/lib/analyze';
import type { ConnectionMode } from '@/connection/ConnectionContext';

export type AnalysisStatus = 'idle' | 'running' | 'done' | 'error';

export interface UseAnalysisResult {
  results: DashboardAnalysisResult[];
  status: AnalysisStatus;
  progress: { current: number; total: number };
  error: string | null;
  run: (dashboards: Dashboard[], config: SisenseConfig, mode: ConnectionMode) => Promise<void>;
}

export function useAnalysis(): UseAnalysisResult {
  const [results, setResults] = useState<DashboardAnalysisResult[]>([]);
  const [status, setStatus] = useState<AnalysisStatus>('idle');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (
    dashboards: Dashboard[],
    config: SisenseConfig,
    mode: ConnectionMode,
  ) => {
    setStatus('running');
    setResults([]);
    setError(null);
    setProgress({ current: 0, total: dashboards.length });

    const client = mode === 'api' ? createClient(config) : null;
    const analysisResults: DashboardAnalysisResult[] = [];

    try {
      for (let i = 0; i < dashboards.length; i++) {
        const dashboard = dashboards[i]!;
        setProgress({ current: i + 1, total: dashboards.length });

        let scriptSource: string | undefined;
        let widgetList: Dashboard['widgets'];

        if (mode === 'file') {
          // File mode — scripts and widgets are already embedded in the
          // parsed Dashboard object; no network call needed.
          scriptSource = dashboard.script;
          widgetList = dashboard.widgets ?? [];
        } else {
          // API mode — fetch the full dashboard (for its script) and the
          // widget list (for widget scripts) in parallel.
          const [fullDashboard, widgets] = await Promise.all([
            getDashboard(client!, dashboard.oid),
            getWidgets(client!, dashboard.oid),
          ]);
          scriptSource = fullDashboard.script;
          widgetList = widgets;
        }

        const dashboardScript = scriptSource?.trim()
          ? { script: scriptSource, violations: analyzeDashboardScript(scriptSource) }
          : undefined;

        const widgetResults = (widgetList ?? [])
          .filter((w) => Boolean(w.script?.trim()))
          .map((widget) => ({
            widgetOid: widget.oid,
            widgetTitle: widget.title,
            widgetType: widget.type,
            script: widget.script!,
            violations: analyzeWidgetScript(widget.script!, widget.type),
          }));

        analysisResults.push({
          dashboardOid: dashboard.oid,
          dashboardTitle: dashboard.title,
          dashboardScript,
          widgets: widgetResults,
        });
      }

      setResults(analysisResults);
      setStatus('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error during analysis');
      setStatus('error');
    }
  }, []);

  return { results, status, progress, error, run };
}
