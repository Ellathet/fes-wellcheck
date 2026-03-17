import { useState, useCallback } from 'react';
import { createClient, getDashboard, getWidgets } from '@wellcheck/sdk';
import type { Dashboard, SisenseConfig } from '@wellcheck/sdk';
import { analyzeWidgetScript, analyzeDashboardScript } from '@/lib/analyze';
import type { DashboardAnalysisResult } from '@/lib/analyze';

export type AnalysisStatus = 'idle' | 'running' | 'done' | 'error';

export interface UseAnalysisResult {
  results: DashboardAnalysisResult[];
  status: AnalysisStatus;
  progress: { current: number; total: number };
  error: string | null;
  run: (dashboards: Dashboard[], config: SisenseConfig) => Promise<void>;
}

export function useAnalysis(): UseAnalysisResult {
  const [results, setResults] = useState<DashboardAnalysisResult[]>([]);
  const [status, setStatus] = useState<AnalysisStatus>('idle');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (dashboards: Dashboard[], config: SisenseConfig) => {
    setStatus('running');
    setResults([]);
    setError(null);
    setProgress({ current: 0, total: dashboards.length });

    const client = createClient(config);
    const analysisResults: DashboardAnalysisResult[] = [];

    try {
      for (let i = 0; i < dashboards.length; i++) {
        const { oid, title } = dashboards[i]!;
        setProgress({ current: i + 1, total: dashboards.length });

        // Fetch both in parallel — the full dashboard (for its script)
        // and the widget list (for widget scripts).
        const [fullDashboard, widgets] = await Promise.all([
          getDashboard(client, oid),
          getWidgets(client, oid),
        ]);

        const dashboardScript =
          fullDashboard.script?.trim()
            ? {
                script: fullDashboard.script,
                violations: analyzeDashboardScript(fullDashboard.script),
              }
            : undefined;

        const widgetResults = widgets
          .filter((w) => Boolean(w.script?.trim()))
          .map((widget) => ({
            widgetOid: widget.oid,
            widgetTitle: widget.title,
            widgetType: widget.type,
            script: widget.script!,
            violations: analyzeWidgetScript(widget.script!, widget.type),
          }));

        analysisResults.push({
          dashboardOid: oid,
          dashboardTitle: title,
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
