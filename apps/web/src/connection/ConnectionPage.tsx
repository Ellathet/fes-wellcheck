import { type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { DashboardList } from './DashboardList';
import { useConnection } from './ConnectionContext';
import { ShieldCheck, AlertCircle, ArrowRight, Loader2 } from 'lucide-react';

export function ConnectionPage() {
  const navigate = useNavigate();
  const {
    baseUrl, setBaseUrl,
    token, setToken,
    dashboards,
    connectionStatus, connectionError,
    selectedOids, selectedDashboards,
    toggleOid, selectAll, clearAll,
    connect,
  } = useConnection();

  const isLoading = connectionStatus === 'loading';
  const isConnected = connectionStatus === 'success';

  function handleConnect(e: FormEvent) {
    e.preventDefault();
    connect();
  }

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

        {/* Connection form */}
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
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Fetching dashboards…
                  </>
                ) : (
                  'Connect & fetch dashboards'
                )}
              </Button>
            </form>

            {/* Error state */}
            {connectionStatus === 'error' && connectionError && (
              <Alert variant="destructive" className="mt-4">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Connection failed</AlertTitle>
                <AlertDescription>{connectionError}</AlertDescription>
              </Alert>
            )}

            {/* Dashboard list */}
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

        {/* Analyse button */}
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
