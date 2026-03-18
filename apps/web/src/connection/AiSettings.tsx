import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useConnection } from './ConnectionContext';
import { AI_MODELS } from '@/lib/aiAnalyze';
import { Bot, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function AiSettings() {
  const { aiConfig, setAiConfig } = useConnection();
  const [showKey, setShowKey] = useState(false);

  const models = AI_MODELS[aiConfig.provider];

  return (
    <Card className={aiConfig.enabled ? '' : 'opacity-90'}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-semibold">AI Analysis</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="ai-toggle" className="text-xs text-muted-foreground cursor-pointer">
              {aiConfig.enabled ? 'Enabled' : 'Disabled'}
            </Label>
            <Switch
              id="ai-toggle"
              checked={aiConfig.enabled}
              onCheckedChange={(checked) => setAiConfig({ enabled: checked })}
            />
          </div>
        </div>
        <CardDescription className="text-xs">
          Run an AI agent to catch logic errors and Sisense anti-patterns beyond static analysis.
        </CardDescription>
      </CardHeader>

      {aiConfig.enabled && (
        <CardContent className="pt-0 space-y-4">
          {/* Provider selector */}
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            {(['openai', 'gemini'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setAiConfig({ provider: p })}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  aiConfig.provider === p
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {p === 'openai' ? 'ChatGPT (OpenAI)' : 'Gemini (Google)'}
              </button>
            ))}
          </div>

          {/* Model selector */}
          <div className="space-y-1.5">
            <Label className="text-xs">Model</Label>
            <Select
              value={aiConfig.model}
              onValueChange={(model) => setAiConfig({ model })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent>
                {models.map((m) => (
                  <SelectItem key={m.id} value={m.id} className="text-xs">
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* API Key */}
          <div className="space-y-1.5">
            <Label htmlFor="ai-api-key" className="text-xs">
              {aiConfig.provider === 'openai' ? 'OpenAI API Key' : 'Google AI API Key'}
            </Label>
            <div className="relative">
              <Input
                id="ai-api-key"
                type={showKey ? 'text' : 'password'}
                value={aiConfig.apiKey}
                onChange={(e) => setAiConfig({ apiKey: e.target.value })}
                placeholder={aiConfig.provider === 'openai' ? 'sk-...' : 'AIza...'}
                className="h-8 text-xs pr-8 font-mono"
                autoComplete="off"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-8 w-8"
                onClick={() => setShowKey((v) => !v)}
                tabIndex={-1}
              >
                {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Your key is used only in the browser and never sent to our servers.
            </p>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
