import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createClient, getDashboards } from '@wellcheck/sdk';
import type { Dashboard, SisenseConfig } from '@wellcheck/sdk';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ConnectionStatus = 'idle' | 'loading' | 'success' | 'error';

export interface ConnectionContextValue {
  // Form fields — persisted across navigation
  baseUrl: string;
  token: string;
  setBaseUrl: (url: string) => void;
  setToken: (token: string) => void;

  // Derived config (convenience)
  config: SisenseConfig;

  // Fetched dashboards
  dashboards: Dashboard[];
  connectionStatus: ConnectionStatus;
  connectionError: string | null;

  // Dashboard selection
  selectedOids: Set<string>;
  selectedDashboards: Dashboard[];
  toggleOid: (oid: string) => void;
  selectAll: () => void;
  clearAll: () => void;

  // Actions
  connect: () => Promise<void>;
  reset: () => void;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const ConnectionContext = createContext<ConnectionContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────────────────────

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [baseUrl, setBaseUrl] = useState('');
  const [token, setToken] = useState('');
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [selectedOids, setSelectedOids] = useState<Set<string>>(new Set());

  // Keep a stable ref to the latest config so connect() doesn't need it as a dep
  const configRef = useRef<SisenseConfig>({ baseUrl, token });
  configRef.current = { baseUrl: baseUrl.trim(), token: token.trim() };

  const connect = useCallback(async () => {
    setConnectionStatus('loading');
    setConnectionError(null);
    setDashboards([]);
    setSelectedOids(new Set());
    try {
      const client = createClient(configRef.current);
      const result = await getDashboards(client);
      setDashboards(result);
      setConnectionStatus('success');
    } catch (err) {
      setConnectionError(err instanceof Error ? err.message : 'Unknown error');
      setConnectionStatus('error');
    }
  }, []);

  const reset = useCallback(() => {
    setDashboards([]);
    setConnectionStatus('idle');
    setConnectionError(null);
    setSelectedOids(new Set());
  }, []);

  const toggleOid = useCallback((oid: string) => {
    setSelectedOids((prev) => {
      const next = new Set(prev);
      next.has(oid) ? next.delete(oid) : next.add(oid);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setDashboards((current) => {
      setSelectedOids(new Set(current.map((d) => d.oid)));
      return current;
    });
  }, []);

  const clearAll = useCallback(() => setSelectedOids(new Set()), []);

  const config = useMemo<SisenseConfig>(
    () => ({ baseUrl: baseUrl.trim(), token: token.trim() }),
    [baseUrl, token],
  );

  const selectedDashboards = useMemo(
    () => dashboards.filter((d) => selectedOids.has(d.oid)),
    [dashboards, selectedOids],
  );

  const value = useMemo<ConnectionContextValue>(
    () => ({
      baseUrl,
      token,
      setBaseUrl,
      setToken,
      config,
      dashboards,
      connectionStatus,
      connectionError,
      selectedOids,
      selectedDashboards,
      toggleOid,
      selectAll,
      clearAll,
      connect,
      reset,
    }),
    [
      baseUrl,
      token,
      config,
      dashboards,
      connectionStatus,
      connectionError,
      selectedOids,
      selectedDashboards,
      toggleOid,
      selectAll,
      clearAll,
      connect,
      reset,
    ],
  );

  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useConnection(): ConnectionContextValue {
  const ctx = useContext(ConnectionContext);
  if (!ctx) throw new Error('useConnection must be used inside <ConnectionProvider>');
  return ctx;
}
