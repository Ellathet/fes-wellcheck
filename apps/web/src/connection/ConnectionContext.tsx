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
import { parseDashboardFiles, type DashboardParseError } from '@/lib/parseDashboard';
import { type AiConfig, type AiProvider, DEFAULT_MODEL } from '@/lib/aiAnalyze';

export type { AiConfig, AiProvider };

// ─── Types ───────────────────────────────────────────────────────────────────

export type ConnectionMode = 'api' | 'file';
export type ConnectionStatus = 'idle' | 'loading' | 'success' | 'error';

export interface ConnectionContextValue {
  // Active mode
  mode: ConnectionMode;
  setMode: (mode: ConnectionMode) => void;

  // API mode — form fields persisted across navigation
  baseUrl: string;
  token: string;
  setBaseUrl: (url: string) => void;
  setToken: (token: string) => void;
  config: SisenseConfig;

  // Shared state
  dashboards: Dashboard[];
  connectionStatus: ConnectionStatus;
  connectionError: string | null;

  // Dashboard selection
  selectedOids: Set<string>;
  selectedDashboards: Dashboard[];
  toggleOid: (oid: string) => void;
  selectAll: () => void;
  clearAll: () => void;

  // AI configuration
  aiConfig: AiConfig;
  setAiConfig: (patch: Partial<AiConfig>) => void;

  // Actions
  connect: () => Promise<void>;
  loadFromFiles: (files: File[]) => Promise<DashboardParseError[]>;
  reset: () => void;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const ConnectionContext = createContext<ConnectionContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────────────────────

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ConnectionMode>('api');
  const [baseUrl, setBaseUrl] = useState('');
  const [token, setToken] = useState('');
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [selectedOids, setSelectedOids] = useState<Set<string>>(new Set());
  const [aiConfig, setAiConfigState] = useState<AiConfig>({
    enabled: false,
    provider: 'openai',
    model: DEFAULT_MODEL['openai'],
    apiKey: '',
  });

  const setAiConfig = useCallback((patch: Partial<AiConfig>) => {
    setAiConfigState((prev) => {
      const next = { ...prev, ...patch };
      // When provider changes, reset model to that provider's default
      if (patch.provider && patch.provider !== prev.provider) {
        next.model = DEFAULT_MODEL[patch.provider];
      }
      return next;
    });
  }, []);

  const configRef = useRef<SisenseConfig>({ baseUrl, token });
  configRef.current = { baseUrl: baseUrl.trim(), token: token.trim() };

  // ─── API mode action ──────────────────────────────────────────────────────

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

  // ─── File mode action ─────────────────────────────────────────────────────

  /**
   * Parse uploaded files, load all resulting dashboards, and auto-select them.
   * Returns any per-file parse errors so the UI can surface them.
   */
  const loadFromFiles = useCallback(async (files: File[]): Promise<DashboardParseError[]> => {
    setConnectionStatus('loading');
    setConnectionError(null);
    setDashboards([]);
    setSelectedOids(new Set());

    const { dashboards: parsed, errors } = await parseDashboardFiles(files);

    if (parsed.length === 0) {
      setConnectionStatus('error');
      setConnectionError('No valid dashboards found in the uploaded files.');
    } else {
      setDashboards(parsed);
      setSelectedOids(new Set(parsed.map((d) => d.oid)));
      setConnectionStatus('success');
    }

    return errors;
  }, []);

  // ─── Shared selection actions ─────────────────────────────────────────────

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
      mode, setMode,
      baseUrl, token, setBaseUrl, setToken, config,
      dashboards, connectionStatus, connectionError,
      selectedOids, selectedDashboards,
      toggleOid, selectAll, clearAll,
      aiConfig, setAiConfig,
      connect, loadFromFiles, reset,
    }),
    [
      mode, baseUrl, token, config,
      dashboards, connectionStatus, connectionError,
      selectedOids, selectedDashboards,
      toggleOid, selectAll, clearAll,
      aiConfig, setAiConfig,
      connect, loadFromFiles, reset,
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
