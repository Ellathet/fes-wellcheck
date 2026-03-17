import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { WidgetResult, DashboardScriptResult } from './WidgetResult';
import { useAnalysis } from './useAnalysis';
import { useConnection } from '@/connection/ConnectionContext';
import {
  ArrowLeft,
  ShieldCheck,
  AlertCircle,
  LayoutDashboard,
  Loader2,
  CheckCircle2,
} from 'lucide-react';

export function AnalysisPage() {
  const navigate = useNavigate();
  const { config, selectedDashboards } = useConnection();
  const { results, status, progress, error, run } = useAnalysis();

  useEffect(() => {
    if (!selectedDashboards.length) {
      navigate('/', { replace: true });
      return;
    }
    run(selectedDashboards, config);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
  const isDone = status === 'done';

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

        {/* Progress / summary bar */}
        {status === 'running' && (
          <div className="flex items-center gap-3 rounded-lg border px-4 py-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
            Analysing dashboard {progress.current} of {progress.total}…
          </div>
        )}

        {isDone && (
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

        {/* Skeletons while first results load */}
        {status === 'running' && results.length === 0 && (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        )}

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
                    <DashboardScriptResult result={dashResult.dashboardScript} />
                  )}
                  {dashResult.widgets.map((widgetResult) => (
                    <WidgetResult key={widgetResult.widgetOid} result={widgetResult} />
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
