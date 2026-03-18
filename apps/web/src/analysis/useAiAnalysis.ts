import { useState, useCallback } from 'react';
import { aiAnalyzeScript, estimateTotalTokens, formatCost } from '@/lib/aiAnalyze';
import type { AiConfig, AiScriptResult, TokenEstimate } from '@/lib/aiAnalyze';
import type { DashboardAnalysisResult, WellcheckViolation } from '@/lib/analyze';

export type AiStatus = 'idle' | 'running' | 'done' | 'error';

export interface AiWidgetResult {
  widgetOid: string;
  result: AiScriptResult;
}

export interface AiDashboardResult {
  dashboardOid: string;
  dashboardScript?: AiScriptResult;
  widgets: AiWidgetResult[];
}

export interface UseAiAnalysisResult {
  aiResults: AiDashboardResult[];
  aiStatus: AiStatus;
  aiProgress: { current: number; total: number };
  aiError: string | null;
  tokenEstimate: TokenEstimate | null;
  totalTokensUsed: number;
  computeEstimate: (staticResults: DashboardAnalysisResult[], model: string) => void;
  runAi: (staticResults: DashboardAnalysisResult[], config: AiConfig) => Promise<void>;
}

type ScriptEntry = {
  dashboardOid: string;
  widgetOid?: string;
  script: string;
  title: string;
  widgetType?: string;
  violations: WellcheckViolation[];
};

function collectScripts(staticResults: DashboardAnalysisResult[]): ScriptEntry[] {
  const entries: ScriptEntry[] = [];
  for (const r of staticResults) {
    if (r.dashboardScript) {
      entries.push({
        dashboardOid: r.dashboardOid,
        script: r.dashboardScript.script,
        title: `${r.dashboardTitle} — dashboard script`,
        violations: r.dashboardScript.violations,
      });
    }
    for (const w of r.widgets) {
      entries.push({
        dashboardOid: r.dashboardOid,
        widgetOid: w.widgetOid,
        script: w.script,
        title: w.widgetTitle,
        widgetType: w.widgetType,
        violations: w.violations,
      });
    }
  }
  return entries;
}

export function useAiAnalysis(): UseAiAnalysisResult {
  const [aiResults, setAiResults] = useState<AiDashboardResult[]>([]);
  const [aiStatus, setAiStatus] = useState<AiStatus>('idle');
  const [aiProgress, setAiProgress] = useState({ current: 0, total: 0 });
  const [aiError, setAiError] = useState<string | null>(null);
  const [tokenEstimate, setTokenEstimate] = useState<TokenEstimate | null>(null);
  const [totalTokensUsed, setTotalTokensUsed] = useState(0);

  const computeEstimate = useCallback(
    (staticResults: DashboardAnalysisResult[], model: string) => {
      const scripts = collectScripts(staticResults);
      setTokenEstimate(estimateTotalTokens(scripts, model));
    },
    [],
  );

  const runAi = useCallback(async (
    staticResults: DashboardAnalysisResult[],
    config: AiConfig,
  ) => {
    const scripts = collectScripts(staticResults);
    if (scripts.length === 0) return;

    setAiStatus('running');
    setAiResults([]);
    setAiError(null);
    setAiProgress({ current: 0, total: scripts.length });
    setTotalTokensUsed(0);

    // Build a mutable map: dashboardOid → AiDashboardResult
    const resultMap = new Map<string, AiDashboardResult>(
      staticResults.map((r) => [r.dashboardOid, { dashboardOid: r.dashboardOid, widgets: [] }]),
    );

    let tokensAccum = 0;

    try {
      for (let i = 0; i < scripts.length; i++) {
        const entry = scripts[i]!;
        setAiProgress({ current: i + 1, total: scripts.length });

        const scriptResult = await aiAnalyzeScript(
          entry.script,
          { widgetType: entry.widgetType, title: entry.title },
          entry.violations,
          config,
        );

        tokensAccum += scriptResult.tokensUsed;
        setTotalTokensUsed(tokensAccum);

        const dashResult = resultMap.get(entry.dashboardOid)!;
        if (entry.widgetOid) {
          dashResult.widgets.push({ widgetOid: entry.widgetOid, result: scriptResult });
        } else {
          dashResult.dashboardScript = scriptResult;
        }

        // Emit incremental results as each script finishes
        setAiResults(Array.from(resultMap.values()));
      }

      setAiStatus('done');
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Unknown AI error');
      setAiStatus('error');
    }
  }, []);

  return {
    aiResults,
    aiStatus,
    aiProgress,
    aiError,
    tokenEstimate,
    totalTokensUsed,
    computeEstimate,
    runAi,
  };
}

export { formatCost };
