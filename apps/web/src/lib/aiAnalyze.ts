import { ChatOpenAI } from '@langchain/openai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { WellcheckViolation } from './analyze';

// ─── Public types ─────────────────────────────────────────────────────────────

export type AiProvider = 'openai' | 'gemini';

export interface AiConfig {
  enabled: boolean;
  provider: AiProvider;
  model: string;
  apiKey: string;
}

export interface AiViolation {
  severity: 'error' | 'warning' | 'info';
  message: string;
  suggestion?: string;
  line?: number;
}

export interface AiScriptResult {
  violations: AiViolation[];
  summary: string;
  tokensUsed: number;
}

export interface AiDashboardResult {
  dashboardOid: string;
  dashboardScript?: AiScriptResult;
  widgets: Array<{ widgetOid: string; result: AiScriptResult }>;
  totalTokens: number;
}

// ─── Default models per provider ─────────────────────────────────────────────

export const AI_MODELS: Record<AiProvider, { id: string; label: string }[]> = {
  openai: [
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini (fast, cheap)' },
    { id: 'gpt-4o', label: 'GPT-4o (best quality)' },
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
  ],
  gemini: [
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (fast, cheap)' },
    { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro (best quality)' },
    { id: 'gemini-2.0-flash-thinking-exp-01-21', label: 'Gemini 2.0 Flash Thinking' },
  ],
};

export const DEFAULT_MODEL: Record<AiProvider, string> = {
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.0-flash',
};

// ─── Cost table ($ per 1M tokens) ────────────────────────────────────────────

const COST_PER_M: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini':   { input: 0.15,  output: 0.60  },
  'gpt-4o':        { input: 2.50,  output: 10.00 },
  'gpt-4.1-mini':  { input: 0.40,  output: 1.60  },
  'gemini-2.0-flash':                          { input: 0.075, output: 0.30  },
  'gemini-1.5-pro':                            { input: 1.25,  output: 5.00  },
  'gemini-2.0-flash-thinking-exp-01-21':       { input: 0,     output: 0     },
};

// ─── Token estimation ─────────────────────────────────────────────────────────

const PROMPT_OVERHEAD = 300; // system prompt + JSON framing per script

/** Rough token count: 1 token ≈ 4 characters (OpenAI rule of thumb). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4) + PROMPT_OVERHEAD;
}

export interface TokenEstimate {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

export function estimateTotalTokens(
  scripts: { script: string }[],
  model: string,
): TokenEstimate {
  const inputTokens = scripts.reduce((acc, s) => acc + estimateTokens(s.script), 0);
  // Rough output estimate: ~200 tokens per script
  const outputTokens = scripts.length * 200;
  const costs = COST_PER_M[model] ?? { input: 0.50, output: 2.00 };
  const estimatedCostUsd =
    (inputTokens / 1_000_000) * costs.input +
    (outputTokens / 1_000_000) * costs.output;
  return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, estimatedCostUsd };
}

export function formatCost(usd: number): string {
  if (usd < 0.001) return '< $0.001';
  if (usd < 0.01) return `~$${usd.toFixed(3)}`;
  return `~$${usd.toFixed(2)}`;
}

// ─── LangChain model factory ──────────────────────────────────────────────────

function createModel(config: AiConfig) {
  if (config.provider === 'openai') {
    return new ChatOpenAI({
      model: config.model,
      apiKey: config.apiKey,
      temperature: 0,
    });
  }
  return new ChatGoogleGenerativeAI({
    model: config.model,
    apiKey: config.apiKey,
    temperature: 0,
  });
}

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a Sisense JavaScript script analyst.
You review widget and dashboard scripts that run inside Sisense dashboards.

Sisense globals available in every script:
- widget, args, dashboard, panel, prism (Sisense API)
- $, jQuery (jQuery)
- $$get, $$set, $$clone (Sisense helpers)
- moment, _, Highcharts, d3 (bundled libraries)

Your job: identify issues NOT already caught by static analysis.
Focus on:
1. Logic errors (e.g. wrong index, off-by-one, stale closures)
2. Sisense-specific anti-patterns (modifying metadata/query via script, wrong widget-type API usage)
3. Performance concerns (expensive operations in hot loops, redundant re-renders)
4. Missing null/undefined guards that could throw at runtime
5. Dead code or unreachable branches

Respond ONLY with valid JSON in this exact shape:
{
  "violations": [
    {
      "severity": "error" | "warning" | "info",
      "message": "<concise description of the issue>",
      "suggestion": "<optional: how to fix it>",
      "line": <optional: 1-based line number>
    }
  ],
  "summary": "<1-2 sentence overall assessment>"
}

If the script looks fine, return an empty violations array and a positive summary.
Do not repeat issues already listed in the static analysis results.`;

// ─── Core analysis function ───────────────────────────────────────────────────

export async function aiAnalyzeScript(
  script: string,
  context: { widgetType?: string; title: string },
  existingViolations: WellcheckViolation[],
  aiConfig: AiConfig,
): Promise<AiScriptResult> {
  const model = createModel(aiConfig);

  const staticSummary =
    existingViolations.length === 0
      ? 'Static analysis found no issues.'
      : existingViolations
          .map((v) => `- [${v.severity}] ${v.rule}: ${v.message}`)
          .join('\n');

  const userMessage = `Script context:
- Title: ${context.title}
- Type: ${context.widgetType ?? 'dashboard'}

Static analysis results (do NOT repeat these):
${staticSummary}

Script:
\`\`\`javascript
${script}
\`\`\``;

  const response = await model.invoke([
    new SystemMessage(SYSTEM_PROMPT),
    new HumanMessage(userMessage),
  ]);

  const raw = typeof response.content === 'string'
    ? response.content
    : JSON.stringify(response.content);

  // Strip markdown fences if model wrapped the JSON
  const jsonText = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();

  let parsed: { violations?: AiViolation[]; summary?: string };
  try {
    parsed = JSON.parse(jsonText) as typeof parsed;
  } catch {
    // Gracefully handle non-JSON responses
    parsed = { violations: [], summary: raw.slice(0, 200) };
  }

  const tokensUsed =
    (response.usage_metadata?.input_tokens ?? estimateTokens(script)) +
    (response.usage_metadata?.output_tokens ?? 100);

  return {
    violations: parsed.violations ?? [],
    summary: parsed.summary ?? '',
    tokensUsed,
  };
}
