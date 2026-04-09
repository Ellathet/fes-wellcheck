import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AnalysisResults } from '@/analysis/AnalysisResults';
import { useHistory } from './HistoryContext';
import { ArrowLeft, History, ShieldCheck, AlertCircle, Bot, TriangleAlert } from 'lucide-react';

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function HistoryEntryPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { entries } = useHistory();

  const entry = entries.find((e) => e.id === id);

  if (!entry) {
    return (
      <div className="min-h-screen px-4 pb-16 pt-8">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </div>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Entry not found</AlertTitle>
            <AlertDescription>
              This analysis is no longer in your history.
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 pb-16 pt-8">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" aria-label="Back" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Wellcheck Analysis
              <Badge variant="secondary" className="gap-1 font-normal text-xs ml-1">
                <History className="h-3 w-3" />
                History
              </Badge>
            </h1>
            <p className="text-sm text-muted-foreground truncate">
              {formatDate(entry.timestamp)} · {entry.dashboardTitles.join(', ')}
            </p>
          </div>
        </div>

        {/* AI results banner — shown when the stored entry includes AI results */}
        {entry.aiResults.length > 0 && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm space-y-1">
            <div className="flex items-center gap-3">
              <Bot className="h-4 w-4 text-primary shrink-0" />
              <span>This analysis includes AI results.</span>
            </div>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground pl-7">
              <TriangleAlert className="h-3 w-3 shrink-0" />
              AI findings are suggestions only and may not be 100% accurate. Always validate results before acting on them.
            </p>
          </div>
        )}

        <AnalysisResults
          results={entry.staticResults}
          aiResults={entry.aiResults}
        />

      </div>
    </div>
  );
}
