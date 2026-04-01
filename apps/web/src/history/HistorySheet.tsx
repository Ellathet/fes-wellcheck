import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { WidgetResult, DashboardScriptResult } from '@/analysis/WidgetResult';
import { useHistory } from './HistoryContext';
import type { HistoryEntry } from './useAnalysisHistory';
import type { AiDashboardResult } from '@/analysis/useAiAnalysis';
import {
  History,
  ArrowLeft,
  LayoutDashboard,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
} from 'lucide-react';

// ─── helpers ──────────────────────────────────────────────────────────────────

function countViolations(entry: HistoryEntry) {
  const all = [
    ...entry.staticResults.flatMap((r) => r.dashboardScript?.violations ?? []),
    ...entry.staticResults.flatMap((r) => r.widgets).flatMap((w) => w.violations),
  ];
  return {
    errors: all.filter((v) => v.severity === 'error').length,
    warnings: all.filter((v) => v.severity === 'warning').length,
    total: all.length,
  };
}

function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getAiDashScript(aiResults: AiDashboardResult[], dashOid: string) {
  return aiResults.find((r) => r.dashboardOid === dashOid)?.dashboardScript;
}

function getAiWidgetResult(
  aiResults: AiDashboardResult[],
  dashOid: string,
  widgetOid: string,
) {
  return aiResults
    .find((r) => r.dashboardOid === dashOid)
    ?.widgets.find((w) => w.widgetOid === widgetOid)?.result;
}

// ─── Entry list item ──────────────────────────────────────────────────────────

function EntryListItem({
  entry,
  onSelect,
  onRemove,
}: {
  entry: HistoryEntry;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const { errors, warnings, total } = countViolations(entry);

  return (
    <div
      role="listitem"
      className="relative rounded-lg border bg-card hover:bg-accent/50 transition-colors group"
    >
      {/* Clickable area — takes up the full row except the delete button */}
      <button
        onClick={onSelect}
        className="w-full text-left p-3 pr-10 block"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3 shrink-0" />
            <span>{formatDate(entry.timestamp)}</span>
          </div>
          <p className="text-sm font-medium truncate">
            {entry.dashboardTitles.length === 1
              ? entry.dashboardTitles[0]
              : `${entry.dashboardTitles[0]} +${entry.dashboardTitles.length - 1} more`}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {total === 0 ? (
              <Badge variant="success" className="gap-1 text-[10px]">
                <CheckCircle2 className="h-2.5 w-2.5" />
                Clean
              </Badge>
            ) : (
              <>
                {errors > 0 && (
                  <Badge variant="destructive" className="gap-1 text-[10px]">
                    <XCircle className="h-2.5 w-2.5" />
                    {errors} error{errors !== 1 ? 's' : ''}
                  </Badge>
                )}
                {warnings > 0 && (
                  <Badge variant="warning" className="gap-1 text-[10px]">
                    <AlertTriangle className="h-2.5 w-2.5" />
                    {warnings} warning{warnings !== 1 ? 's' : ''}
                  </Badge>
                )}
              </>
            )}
            {entry.aiResults.length > 0 && (
              <Badge variant="secondary" className="text-[10px]">AI</Badge>
            )}
          </div>
        </div>
      </button>

      {/* Delete button — absolutely positioned to avoid nesting inside the row button */}
      <Button
        variant="ghost"
        size="icon"
        aria-label="Remove from history"
        className="absolute right-1.5 top-1/2 -translate-y-1/2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
        onClick={onRemove}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

// ─── Detail view ──────────────────────────────────────────────────────────────

function EntryDetailView({
  entry,
  onBack,
}: {
  entry: HistoryEntry;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 mb-4 shrink-0">
        <Button variant="ghost" size="icon" aria-label="Go back" className="h-7 w-7" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">
            {entry.dashboardTitles.join(', ')}
          </p>
          <p className="text-xs text-muted-foreground">{formatDate(entry.timestamp)}</p>
        </div>
      </div>

      <ScrollArea className="flex-1 -mx-6 px-6">
        <div className="space-y-6 pb-6">
          {entry.staticResults.map((dashResult) => {
            const scriptCount =
              (dashResult.dashboardScript ? 1 : 0) + dashResult.widgets.length;
            return (
              <section key={dashResult.dashboardOid} className="space-y-3">
                <div className="flex items-center gap-2">
                  <LayoutDashboard className="h-4 w-4 text-muted-foreground shrink-0" />
                  <h3 className="font-medium text-sm">{dashResult.dashboardTitle}</h3>
                  <Badge variant="secondary" className="ml-auto text-[10px]">
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
                        aiResult={getAiDashScript(entry.aiResults, dashResult.dashboardOid)}
                      />
                    )}
                    {dashResult.widgets.map((widgetResult) => (
                      <WidgetResult
                        key={widgetResult.widgetOid}
                        result={widgetResult}
                        aiResult={getAiWidgetResult(
                          entry.aiResults,
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
      </ScrollArea>
    </div>
  );
}

// ─── Sheet + floating trigger ─────────────────────────────────────────────────

export function HistorySheet() {
  const { entries, remove, clear } = useHistory();
  const [open, setOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<HistoryEntry | null>(null);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setSelectedEntry(null);
  }

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setOpen(true)}
        title="Analysis history"
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors text-sm font-medium"
      >
        <History className="h-4 w-4" />
        History
        {entries.length > 0 && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-foreground text-primary text-[10px] font-bold leading-none">
            {entries.length > 99 ? '99+' : entries.length}
          </span>
        )}
      </button>

      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-6">
          {selectedEntry ? (
            <EntryDetailView
              entry={selectedEntry}
              onBack={() => setSelectedEntry(null)}
            />
          ) : (
            <>
              <SheetHeader className="shrink-0 mb-4">
                <SheetTitle className="flex items-center gap-2">
                  <History className="h-5 w-5" />
                  Analysis History
                </SheetTitle>
                <SheetDescription>
                  {entries.length === 0
                    ? 'No past analyses yet.'
                    : `${entries.length} saved ${entries.length !== 1 ? 'analyses' : 'analysis'}`}
                </SheetDescription>
              </SheetHeader>

              {entries.length === 0 ? (
                <div className="flex flex-1 items-center justify-center">
                  <p className="text-sm text-muted-foreground text-center">
                    Run an analysis to see it here.
                  </p>
                </div>
              ) : (
                <>
                  <ScrollArea className="flex-1 -mx-6 px-6">
                    <div className="space-y-2 pb-4">
                      {entries.map((entry) => (
                        <EntryListItem
                          key={entry.id}
                          entry={entry}
                          onSelect={() => setSelectedEntry(entry)}
                          onRemove={() => remove(entry.id)}
                        />
                      ))}
                    </div>
                  </ScrollArea>

                  <div className="shrink-0 pt-3 border-t">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive gap-1.5 w-full"
                      onClick={clear}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Clear all history
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
