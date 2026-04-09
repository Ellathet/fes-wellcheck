import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AnalysisResults } from './AnalysisResults';
import { useAnalysis } from './useAnalysis';
import { useAiAnalysis, formatCost } from './useAiAnalysis';
import { useConnection } from '@/connection/ConnectionContext';
import { useHistory } from '@/history/HistoryContext';
import {
  ArrowLeft,
  ShieldCheck,
  AlertCircle,
  Loader2,
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
  const { save } = useHistory();

  // Stable ID for the current analysis run — assigned once on mount
  const historyIdRef = useRef<string>(Date.now().toString());

  useEffect(() => {
    if (!selectedDashboards.length) {
      navigate('/', { replace: true });
      return;
    }
    historyIdRef.current = Date.now().toString();
    run(selectedDashboards, config, mode);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Compute token estimate once static analysis finishes
  useEffect(() => {
    if (status === 'done' && results.length > 0 && aiConfig.enabled && aiConfig.apiKey) {
      computeEstimate(results, aiConfig.model);
    }
  }, [status, results, aiConfig.enabled, aiConfig.apiKey, aiConfig.model, computeEstimate]);

  // Save to history when static analysis completes
  useEffect(() => {
    if (status === 'done' && results.length > 0) {
      save({
        id: historyIdRef.current,
        timestamp: parseInt(historyIdRef.current, 10),
        dashboardTitles: results.map((r) => r.dashboardTitle),
        staticResults: results,
        aiResults: [],
      });
    }
  }, [status, results, save]);

  // Update history entry when AI analysis completes
  useEffect(() => {
    if (aiStatus === 'done' && aiResults.length > 0 && results.length > 0) {
      save({
        id: historyIdRef.current,
        timestamp: parseInt(historyIdRef.current, 10),
        dashboardTitles: results.map((r) => r.dashboardTitle),
        staticResults: results,
        aiResults,
      });
    }
  }, [aiStatus, aiResults, results, save]);

  if (!selectedDashboards.length && status === 'idle') return null;

  const totalScripts =
    results.filter((r) => r.dashboardScript).length +
    results.flatMap((r) => r.widgets).length;
  const isStaticDone = status === 'done';
  const isAiRunning = aiStatus === 'running';
  const isAiDone = aiStatus === 'done';

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

        {/* Static summary — shown once the first dashboard finishes */}

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
          <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm space-y-1">
            <div className="flex items-center gap-3">
              <Bot className="h-4 w-4 text-primary shrink-0" />
              <span>
                AI analysis complete ·{' '}
                <span className="font-medium">{totalTokensUsed.toLocaleString()} tokens used</span>
              </span>
            </div>
            <p className="text-xs text-muted-foreground pl-7">
              AI findings are suggestions only and may not be 100% accurate. Always validate results before acting on them.
            </p>
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

        <AnalysisResults
          results={results}
          aiResults={aiResults}
          isAiRunning={isAiRunning}
        />
      </div>
    </div>
  );
}
