import { type FormEvent, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { DashboardList } from './DashboardList';
import { useConnection } from './ConnectionContext';
import {
  ShieldCheck, AlertCircle, ArrowRight, Loader2,
  Plug, Upload, FileJson, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function ConnectionPage() {
  const navigate = useNavigate();
  const {
    mode, setMode,
    baseUrl, setBaseUrl,
    token, setToken,
    dashboards,
    connectionStatus, connectionError,
    selectedOids, selectedDashboards,
    toggleOid, selectAll, clearAll,
    connect, loadFromFiles, reset,
  } = useConnection();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const isLoading = connectionStatus === 'loading';
  const isConnected = connectionStatus === 'success';

  // ─── Mode switch ────────────────────────────────────────────────────────────

  function handleModeSwitch(next: typeof mode) {
    if (next === mode) return;
    setMode(next);
    reset();
    setFileErrors([]);
    setPendingFiles([]);
  }

  // ─── API mode ───────────────────────────────────────────────────────────────

  function handleConnect(e: FormEvent) {
    e.preventDefault();
    connect();
  }

  // ─── File mode ──────────────────────────────────────────────────────────────

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    setPendingFiles(list);
    setFileErrors([]);
    const errors = await loadFromFiles(list);
    if (errors.length > 0) setFileErrors(errors.map((e) => e.message));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }

  // ─── Navigate ───────────────────────────────────────────────────────────────

  function handleAnalyse() {
    navigate('/analysis');
  }

  return (
    <div className="min-h-screen flex items-start justify-center pt-16 px-4 pb-16">
      <div className="w-full max-w-xl space-y-6">

        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Sisense Wellcheck</h1>
          <p className="text-sm text-muted-foreground">
            Analyse widget scripts across your dashboards for quality issues.
          </p>
        </div>

        {/* Mode tabs */}
        <div className="flex rounded-lg border p-1 gap-1 bg-muted/40">
          <button
            type="button"
            onClick={() => handleModeSwitch('api')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              mode === 'api'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Plug className="h-4 w-4" />
            Connect via API
          </button>
          <button
            type="button"
            onClick={() => handleModeSwitch('file')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              mode === 'file'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Upload className="h-4 w-4" />
            Upload files
          </button>
        </div>

        {/* ── API mode ── */}
        {mode === 'api' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Connect to Sisense</CardTitle>
              <CardDescription>Enter your instance URL and API token to get started.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleConnect} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="base-url">Sisense URL</Label>
                  <Input
                    id="base-url"
                    type="url"
                    placeholder="https://your-instance.sisense.com"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    required
                    disabled={isLoading}
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="api-token">API Token</Label>
                  <Input
                    id="api-token"
                    type="password"
                    placeholder="••••••••••••••••"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    required
                    disabled={isLoading}
                    autoComplete="off"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading || !baseUrl || !token}>
                  {isLoading ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Fetching dashboards…</>
                  ) : (
                    'Connect & fetch dashboards'
                  )}
                </Button>
              </form>

              {connectionStatus === 'error' && connectionError && (
                <Alert variant="destructive" className="mt-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Connection failed</AlertTitle>
                  <AlertDescription>{connectionError}</AlertDescription>
                </Alert>
              )}

              {(isLoading || isConnected) && (
                <>
                  <Separator className="my-4" />
                  <p className="text-sm font-medium mb-1">Select dashboards to analyse</p>
                  <DashboardList
                    dashboards={dashboards}
                    selected={selectedOids}
                    loading={isLoading}
                    onToggle={toggleOid}
                    onSelectAll={selectAll}
                    onClearAll={clearAll}
                  />
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── File mode ── */}
        {mode === 'file' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Upload dashboard files</CardTitle>
              <CardDescription>
                Export your dashboards from Sisense and drop the <code>.dash</code> or{' '}
                <code>.json</code> files here.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">

              {/* Drop zone */}
              <div
                role="button"
                tabIndex={0}
                aria-label="Upload dashboard files"
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                className={cn(
                  'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
                  dragOver
                    ? 'border-primary bg-primary/5'
                    : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/40',
                )}
              >
                <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm font-medium">Drop files here or click to browse</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Accepts <code>.dash</code> and <code>.json</code> — multiple files supported
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".dash,.json"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFiles(e.target.files)}
                />
              </div>

              {/* Selected file list */}
              {pendingFiles.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Selected files
                  </p>
                  {pendingFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <FileJson className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="flex-1 truncate">{f.name}</span>
                      <Badge variant="secondary" className="text-xs">
                        {(f.size / 1024).toFixed(0)} KB
                      </Badge>
                    </div>
                  ))}
                </div>
              )}

              {/* Loading state */}
              {isLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Parsing files…
                </div>
              )}

              {/* Parse errors */}
              {fileErrors.length > 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Some files could not be parsed</AlertTitle>
                  <AlertDescription>
                    <ul className="mt-1 space-y-0.5 list-disc list-inside text-xs">
                      {fileErrors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {/* Connection error */}
              {connectionStatus === 'error' && connectionError && fileErrors.length === 0 && (
                <Alert variant="destructive">
                  <X className="h-4 w-4" />
                  <AlertTitle>No dashboards loaded</AlertTitle>
                  <AlertDescription>{connectionError}</AlertDescription>
                </Alert>
              )}

              {/* Dashboard list */}
              {isConnected && (
                <>
                  <Separator />
                  <p className="text-sm font-medium">Select dashboards to analyse</p>
                  <DashboardList
                    dashboards={dashboards}
                    selected={selectedOids}
                    loading={false}
                    onToggle={toggleOid}
                    onSelectAll={selectAll}
                    onClearAll={clearAll}
                  />
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Analyse button — shared between both modes */}
        {isConnected && selectedDashboards.length > 0 && (
          <Button className="w-full" size="lg" onClick={handleAnalyse}>
            Analyse {selectedDashboards.length} dashboard{selectedDashboards.length !== 1 ? 's' : ''}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        )}

      </div>
    </div>
  );
}
