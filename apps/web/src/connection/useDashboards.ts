import { useState, useCallback } from 'react';
import { createClient, getDashboards } from '@wellcheck/sdk';
import type { Dashboard, SisenseConfig } from '@wellcheck/sdk';

export type ConnectionStatus = 'idle' | 'loading' | 'success' | 'error';

export interface UseDashboardsResult {
  dashboards: Dashboard[];
  status: ConnectionStatus;
  error: string | null;
  fetch: (config: SisenseConfig) => Promise<void>;
  reset: () => void;
}

export function useDashboards(): UseDashboardsResult {
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async (config: SisenseConfig) => {
    setStatus('loading');
    setError(null);
    setDashboards([]);
    try {
      const client = createClient(config);
      const result = await getDashboards(client);
      setDashboards(result);
      setStatus('success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      setStatus('error');
    }
  }, []);

  const reset = useCallback(() => {
    setDashboards([]);
    setStatus('idle');
    setError(null);
  }, []);

  return { dashboards, status, error, fetch, reset };
}
