import type { DashboardAnalysisResult } from '@/lib/analyze';
import type { AiDashboardResult } from '@/analysis/useAiAnalysis';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { WidgetResult, DashboardScriptResult } from './WidgetResult';
import { LayoutDashboard, CheckCircle2 } from 'lucide-react';

export interface AnalysisResultsProps {
  results: DashboardAnalysisResult[];
  aiResults?: AiDashboardResult[];
  /** Pass true while AI analysis is in-flight to show per-card loading states. */
  isAiRunning?: boolean;
}

export function AnalysisResults({
  results,
  aiResults = [],
  isAiRunning = false,
}: AnalysisResultsProps) {
  if (results.length === 0) return null;

  const allViolations = [
    ...results.flatMap((r) => r.dashboardScript?.violations ?? []),
    ...results.flatMap((r) => r.widgets).flatMap((w) => w.violations),
  ];
  const totalErrors = allViolations.filter((v) => v.severity === 'error').length;
  const totalWarnings = allViolations.filter((v) => v.severity === 'warning').length;
  const totalScripts =
    results.filter((r) => r.dashboardScript).length +
    results.flatMap((r) => r.widgets).length;

  function getAiDashScript(dashOid: string) {
    return aiResults.find((r) => r.dashboardOid === dashOid)?.dashboardScript;
  }

  function getAiWidgetResult(dashOid: string, widgetOid: string) {
    return aiResults
      .find((r) => r.dashboardOid === dashOid)
      ?.widgets.find((w) => w.widgetOid === widgetOid)?.result;
  }

  function isAiLoadingScript(dashOid: string, widgetOid?: string) {
    if (!isAiRunning) return false;
    const dash = aiResults.find((r) => r.dashboardOid === dashOid);
    if (!widgetOid) return !dash?.dashboardScript;
    return !dash?.widgets.find((w) => w.widgetOid === widgetOid);
  }

  return (
    <div className="space-y-6">
      {/* Summary bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3">
        {totalErrors === 0 && totalWarnings === 0 ? (
          <span className="flex items-center gap-2 text-sm font-medium text-green-700">
            <CheckCircle2 className="h-4 w-4" />
            All clean — no issues found
          </span>
        ) : (
          <>
            <span className="text-sm text-muted-foreground">Found</span>
            {totalErrors > 0 && (
              <Badge variant="destructive">
                {totalErrors} error{totalErrors !== 1 ? 's' : ''}
              </Badge>
            )}
            {totalWarnings > 0 && (
              <Badge variant="warning">
                {totalWarnings} warning{totalWarnings !== 1 ? 's' : ''}
              </Badge>
            )}
            <span className="text-sm text-muted-foreground">
              across {totalScripts} script{totalScripts !== 1 ? 's' : ''}
            </span>
          </>
        )}
      </div>

      {/* Per-dashboard sections */}
      {results.map((dashResult) => {
        const scriptCount =
          (dashResult.dashboardScript ? 1 : 0) + dashResult.widgets.length;
        return (
          <section key={dashResult.dashboardOid} className="space-y-3">
            <div className="flex items-center gap-2">
              <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-medium text-sm">{dashResult.dashboardTitle}</h2>
              <Badge variant="secondary" className="ml-auto">
                {scriptCount} script{scriptCount !== 1 ? 's' : ''}
              </Badge>
            </div>

            {scriptCount === 0 ? (
              <p className="text-sm text-muted-foreground pl-6">
                No scripts found in this dashboard.
              </p>
            ) : (
              <div className="space-y-2">
                {dashResult.dashboardScript && (
                  <DashboardScriptResult
                    result={dashResult.dashboardScript}
                    aiResult={getAiDashScript(dashResult.dashboardOid)}
                    aiLoading={isAiLoadingScript(dashResult.dashboardOid)}
                  />
                )}
                {dashResult.widgets.map((widgetResult) => (
                  <WidgetResult
                    key={widgetResult.widgetOid}
                    result={widgetResult}
                    aiResult={getAiWidgetResult(
                      dashResult.dashboardOid,
                      widgetResult.widgetOid,
                    )}
                    aiLoading={isAiLoadingScript(
                      dashResult.dashboardOid,
                      widgetResult.widgetOid,
                    )}
                  />
                ))}
              </div>
            )}

            <Separator />
          </section>
        );
      })}
    </div>
  );
}
