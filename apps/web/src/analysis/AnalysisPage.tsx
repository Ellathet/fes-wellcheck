import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { WidgetResult, DashboardScriptResult } from './WidgetResult';
import { useAnalysis } from './useAnalysis';
import { useAiAnalysis, formatCost } from './useAiAnalysis';
import { useConnection } from '@/connection/ConnectionContext';
import {
  ArrowLeft,
  ShieldCheck,
  AlertCircle,
  LayoutDashboard,
  Loader2,
  CheckCircle2,
  Bot,
  Sparkles,
  Coins,
} from 'lucide-react';

export function AnalysisPage() {
  const navigate = useNavigate();
  const { config, mode, selectedDashboards, aiConfig } = useConnection();
  const { results, status, progress, error, run } = useAnalysis();
  const {
    aiResults,
    aiStatus,
    aiProgress,
    aiError,
    tokenEstimate,
    totalTokensUsed,
    computeEstimate,
    runAi,
  } = useAiAnalysis();

  useEffect(() => {
    if (!selectedDashboards.length) {
      navigate('/', { replace: true });
      return;
    }
    run(selectedDashboards, config, mode);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Compute token estimate once static analysis finishes
  useEffect(() => {
    if (status === 'done' && results.length > 0 && aiConfig.enabled && aiConfig.apiKey) {
      computeEstimate(results, aiConfig.model);
    }
  }, [status, results, aiConfig.enabled, aiConfig.apiKey, aiConfig.model, computeEstimate]);

  if (!selectedDashboards.length && status === 'idle') return null;

  const allViolations = [
    ...results.flatMap((r) => r.dashboardScript?.violations ?? []),
    ...results.flatMap((r) => r.widgets).flatMap((w) => w.violations),
  ];
  const totalViolations = allViolations.length;
  const totalErrors = allViolations.filter((v) => v.severity === 'error').length;
  const totalWarnings = totalViolations - totalErrors;
  const totalScripts =
    results.filter((r) => r.dashboardScript).length +
    results.flatMap((r) => r.widgets).length;
  const isStaticDone = status === 'done';
  const isAiRunning = aiStatus === 'running';
  const isAiDone = aiStatus === 'done';

  // Helper: look up AI result for a given script
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

  const canRunAi =
    isStaticDone &&
    aiConfig.enabled &&
    aiConfig.apiKey &&
    aiStatus === 'idle' &&
    totalScripts > 0;

  const missingKey = isStaticDone && aiConfig.enabled && !aiConfig.apiKey;

  return (
    <div className="min-h-screen px-4 pb-16 pt-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Wellcheck Analysis
            </h1>
            <p className="text-sm text-muted-foreground">
              {selectedDashboards.length} dashboard{selectedDashboards.length !== 1 ? 's' : ''} selected
            </p>
          </div>
        </div>

        {/* Static progress bar */}
        {status === 'running' && (
          <div className="flex items-center gap-3 rounded-lg border px-4 py-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
            Analysing dashboard {progress.current} of {progress.total}…
          </div>
        )}

        {/* Static summary */}
        {isStaticDone && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3">
            {totalViolations === 0 ? (
              <span className="flex items-center gap-2 text-sm font-medium text-green-700">
                <CheckCircle2 className="h-4 w-4" />
                All clean — no issues found
              </span>
            ) : (
              <>
                <span className="text-sm text-muted-foreground">Found</span>
                {totalErrors > 0 && (
                  <Badge variant="destructive">{totalErrors} error{totalErrors !== 1 ? 's' : ''}</Badge>
                )}
                {totalWarnings > 0 && (
                  <Badge variant="warning">{totalWarnings} warning{totalWarnings !== 1 ? 's' : ''}</Badge>
                )}
                <span className="text-sm text-muted-foreground">
                  across {totalScripts} script{totalScripts !== 1 ? 's' : ''}
                </span>
              </>
            )}
          </div>
        )}

        {status === 'error' && error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Analysis failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* ── AI section ───────────────────────────────────────────────────── */}

        {/* Token estimate + Run AI button */}
        {canRunAi && tokenEstimate && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 space-y-3">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">AI Analysis ready</span>
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Coins className="h-3.5 w-3.5" />
                ~{tokenEstimate.totalTokens.toLocaleString()} tokens estimated
              </span>
              <span className="flex items-center gap-1">
                <span className="font-medium text-foreground">
                  {formatCost(tokenEstimate.estimatedCostUsd)}
                </span>
                estimated cost
              </span>
              <span>{totalScripts} script{totalScripts !== 1 ? 's' : ''} to analyse</span>
            </div>
            <Button
              size="sm"
              className="gap-2"
              onClick={() => runAi(results, aiConfig)}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Run AI Analysis
            </Button>
          </div>
        )}

        {/* Missing API key warning */}
        {missingKey && (
          <Alert>
            <Bot className="h-4 w-4" />
            <AlertTitle>AI analysis is enabled but no API key is set</AlertTitle>
            <AlertDescription>
              Go back and enter your {aiConfig.provider === 'openai' ? 'OpenAI' : 'Google AI'} API key in the AI Settings panel.
            </AlertDescription>
          </Alert>
        )}

        {/* AI running progress */}
        {isAiRunning && (
          <div className="flex items-center gap-3 rounded-lg border border-primary/20 px-4 py-3 text-sm text-muted-foreground">
            <Bot className="h-4 w-4 text-primary shrink-0" />
            <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
            AI analysing script {aiProgress.current} of {aiProgress.total}…
            {totalTokensUsed > 0 && (
              <span className="ml-auto text-xs">{totalTokensUsed.toLocaleString()} tokens used</span>
            )}
          </div>
        )}

        {/* AI done summary */}
        {isAiDone && (
          <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
            <Bot className="h-4 w-4 text-primary shrink-0" />
            <span>
              AI analysis complete ·{' '}
              <span className="font-medium">{totalTokensUsed.toLocaleString()} tokens used</span>
            </span>
          </div>
        )}

        {/* AI error */}
        {aiStatus === 'error' && aiError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>AI analysis failed</AlertTitle>
            <AlertDescription>{aiError}</AlertDescription>
          </Alert>
        )}

        {/* Skeletons while first static results load */}
        {status === 'running' && results.length === 0 && (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        )}

        {/* Results */}
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
                      aiResult={getAiWidgetResult(dashResult.dashboardOid, widgetResult.widgetOid)}
                      aiLoading={isAiLoadingScript(dashResult.dashboardOid, widgetResult.widgetOid)}
                    />
                  ))}
                </div>
              )}

              <Separator />
            </section>
          );
        })}
      </div>
    </div>
  );
}
