import type { Dashboard } from '@wellcheck/sdk';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { LayoutDashboard } from 'lucide-react';

interface DashboardListProps {
  dashboards: Dashboard[];
  selected: Set<string>;
  loading: boolean;
  onToggle: (oid: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
}

export function DashboardList({
  dashboards,
  selected,
  loading,
  onToggle,
  onSelectAll,
  onClearAll,
}: DashboardListProps) {
  if (loading) {
    return (
      <div className="space-y-3 mt-4" data-testid="dashboard-list-loading">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (dashboards.length === 0) return null;

  const allSelected = selected.size === dashboards.length;

  return (
    <div className="mt-4 space-y-3" data-testid="dashboard-list">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {selected.size} of {dashboards.length} selected
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={allSelected ? onClearAll : onSelectAll}
            className="text-xs text-primary hover:underline underline-offset-2"
          >
            {allSelected ? 'Deselect all' : 'Select all'}
          </button>
        </div>
      </div>

      <ScrollArea className="h-72 rounded-md border">
        <div className="p-3 space-y-1">
          {dashboards.map((dashboard) => {
            const isChecked = selected.has(dashboard.oid);
            return (
              <label
                key={dashboard.oid}
                htmlFor={`dashboard-${dashboard.oid}`}
                className="flex items-center gap-3 rounded-md px-3 py-2.5 cursor-pointer hover:bg-accent transition-colors"
              >
                <Checkbox
                  id={`dashboard-${dashboard.oid}`}
                  checked={isChecked}
                  onCheckedChange={() => onToggle(dashboard.oid)}
                />
                <LayoutDashboard className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium flex-1 truncate">{dashboard.title}</span>
                {dashboard.widgets && (
                  <Badge variant="secondary" className="shrink-0">
                    {dashboard.widgets.length} widget{dashboard.widgets.length !== 1 ? 's' : ''}
                  </Badge>
                )}
              </label>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
