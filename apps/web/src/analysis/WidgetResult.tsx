import { useState } from 'react';
import type { WidgetAnalysisResult, ScriptAnalysisResult, WellcheckViolation } from '@/lib/analyze';
import type { AiScriptResult, AiViolation } from '@/lib/aiAnalyze';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { CodeBlock, InlineCode } from '@/components/ui/code-block';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertTriangle,
  XCircle,
  CheckCircle2,
  Code2,
  FileCode2,
  ChevronDown,
  ChevronRight,
  Bot,
  Info,
  Loader2,
  TriangleAlert,
} from 'lucide-react';

const RULE_LABELS: Record<WellcheckViolation['rule'], string> = {
  'syntax-error': 'Syntax / runtime error',
  'no-undefined-variable': 'Undefined variable',
  'no-wrong-widget-type': 'Wrong widget type',
  'no-unimpactful-code': 'Unimpactful code',
  'no-metadata-override-in-script': 'Metadata override',
};

function ViolationRow({ violation }: { violation: WellcheckViolation }) {
  const isError = violation.severity === 'error';
  return (
    <Alert variant={isError ? 'destructive' : 'warning'} className="py-3">
      {isError ? <XCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
      <AlertDescription className="pl-1">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <Badge variant={isError ? 'destructive' : 'warning'} className="font-mono text-[10px]">
            {RULE_LABELS[violation.rule]}
          </Badge>
          {violation.line !== undefined && (
            <span className="text-xs text-muted-foreground">line {violation.line}</span>
          )}
        </div>
        <p className="text-sm">{violation.message}</p>
        {violation.snippet && <InlineCode>{violation.snippet}</InlineCode>}
      </AlertDescription>
    </Alert>
  );
}

// ─── AI violation row ────────────────────────────────────────────────────────

function AiViolationRow({ violation }: { violation: AiViolation }) {
  const isError = violation.severity === 'error';
  const isInfo = violation.severity === 'info';
  return (
    <Alert variant={isError ? 'destructive' : isInfo ? 'default' : 'warning'} className="py-3">
      {isError ? (
        <XCircle className="h-4 w-4" />
      ) : isInfo ? (
        <Info className="h-4 w-4" />
      ) : (
        <AlertTriangle className="h-4 w-4" />
      )}
      <AlertDescription className="pl-1">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <Badge variant="secondary" className="font-mono text-[10px] gap-1">
            <Bot className="h-2.5 w-2.5" />
            AI
          </Badge>
          {violation.line !== undefined && (
            <span className="text-xs text-muted-foreground">line {violation.line}</span>
          )}
        </div>
        <p className="text-sm">{violation.message}</p>
        {violation.suggestion && (
          <p className="text-xs text-muted-foreground mt-1 italic">{violation.suggestion}</p>
        )}
      </AlertDescription>
    </Alert>
  );
}

// ─── AI results section ───────────────────────────────────────────────────────

function AiResultSection({ result, loading }: { result?: AiScriptResult; loading?: boolean }) {
  if (loading) {
    return (
      <div className="space-y-2 pt-1">
        <Separator />
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          AI analysis in progress…
        </div>
        <Skeleton className="h-12 w-full rounded-md" />
      </div>
    );
  }

  if (!result) return null;

  const hasFindings = result.violations.length > 0;

  return (
    <div className="space-y-2 pt-1">
      <Separator />
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Bot className="h-3.5 w-3.5 text-primary" />
        <span className="font-medium text-foreground">AI analysis</span>
        {result.tokensUsed > 0 && (
          <span className="ml-auto">{result.tokensUsed.toLocaleString()} tokens used</span>
        )}
      </div>
      <p className="flex items-center gap-1 text-[11px] text-muted-foreground/70 italic">
        <TriangleAlert className="h-3 w-3 shrink-0" />
        AI results may not be 100% accurate, always review manually.
      </p>
      {hasFindings ? (
        result.violations.map((v, i) => <AiViolationRow key={i} violation={v} />)
      ) : (
        <p className="text-xs text-muted-foreground italic">{result.summary}</p>
      )}
    </div>
  );
}

// ─── Script card ─────────────────────────────────────────────────────────────

function ScriptCard({
  icon,
  title,
  badge,
  script,
  violations,
  aiResult,
  aiLoading,
}: {
  icon: React.ReactNode;
  title: string;
  badge?: React.ReactNode;
  script: string;
  violations: WellcheckViolation[];
  aiResult?: AiScriptResult;
  aiLoading?: boolean;
}) {
  const [scriptOpen, setScriptOpen] = useState(false);
  const errors = violations.filter((v) => v.severity === 'error').length;
  const warnings = violations.filter((v) => v.severity === 'warning').length;
  const aiErrors = aiResult?.violations.filter((v) => v.severity === 'error').length ?? 0;
  const aiWarnings = aiResult?.violations.filter((v) => v.severity !== 'error').length ?? 0;
  const clean = violations.length === 0;

  // Lines flagged by any violation — used to highlight them in the code view
  const flaggedLines = violations.flatMap((v) => (v.line !== undefined ? [v.line] : []));

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {icon}
            <CardTitle className="text-sm font-medium truncate">{title}</CardTitle>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
            {badge}
            {clean ? (
              <Badge variant="success" className="gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Clean
              </Badge>
            ) : (
              <>
                {errors > 0 && (
                  <Badge variant="destructive">
                    {errors} error{errors !== 1 ? 's' : ''}
                  </Badge>
                )}
                {warnings > 0 && (
                  <Badge variant="warning">
                    {warnings} warning{warnings !== 1 ? 's' : ''}
                  </Badge>
                )}
              </>
            )}
            {/* AI badges */}
            {aiLoading && (
              <Badge variant="secondary" className="gap-1">
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                AI
              </Badge>
            )}
            {!aiLoading && aiResult && (aiErrors + aiWarnings) > 0 && (
              <Badge variant="outline" className="gap-1 text-primary border-primary/30">
                <Bot className="h-2.5 w-2.5" />
                {aiErrors + aiWarnings} AI
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-2">
        {/* Static violations */}
        {!clean && (
          <>
            {violations.map((violation, i) => (
              <ViolationRow key={i} violation={violation} />
            ))}
          </>
        )}

        {/* AI results section */}
        <AiResultSection result={aiResult} loading={aiLoading} />

        {/* Collapsible syntax-highlighted script */}
        <Collapsible open={scriptOpen} onOpenChange={setScriptOpen}>
          <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors select-none w-full text-left mt-2">
            {scriptOpen ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            )}
            {scriptOpen ? 'Hide script' : 'Show script'}
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <CodeBlock
              code={script}
              highlightLines={flaggedLines}
              data-testid="script-content"
            />
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}

export function DashboardScriptResult({
  result,
  aiResult,
  aiLoading,
}: {
  result: ScriptAnalysisResult;
  aiResult?: AiScriptResult;
  aiLoading?: boolean;
}) {
  return (
    <ScriptCard
      icon={<FileCode2 className="h-4 w-4 text-muted-foreground shrink-0" />}
      title="Dashboard script"
      badge={
        <Badge variant="outline" className="font-mono text-[10px]">
          dashboard
        </Badge>
      }
      script={result.script}
      violations={result.violations}
      aiResult={aiResult}
      aiLoading={aiLoading}
    />
  );
}

export function WidgetResult({
  result,
  aiResult,
  aiLoading,
}: {
  result: WidgetAnalysisResult;
  aiResult?: AiScriptResult;
  aiLoading?: boolean;
}) {
  return (
    <ScriptCard
      icon={<Code2 className="h-4 w-4 text-muted-foreground shrink-0" />}
      title={result.widgetTitle}
      badge={
        <Badge variant="secondary" className="font-mono text-[10px]">
          {result.widgetType}
        </Badge>
      }
      script={result.script}
      violations={result.violations}
      aiResult={aiResult}
      aiLoading={aiLoading}
    />
  );
}
