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
  category: 'logic' | 'sisense-anti-pattern' | 'performance' | 'safety' | 'dead-code';
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
    { id: 'gpt-4.1-nano', label: 'GPT-4.1 Nano (fastest, cheapest)' },
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini (fast, cheap)' },
    { id: 'gpt-4.1', label: 'GPT-4.1 (best quality)' },
  ],
  gemini: [
    { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite (fastest, cheapest)' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (fast, cheap)' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (best quality)' },
  ],
};

export const DEFAULT_MODEL: Record<AiProvider, string> = {
  openai: 'gpt-4.1-mini',
  gemini: 'gemini-2.5-flash',
};

// ─── Cost table ($ per 1M tokens) ────────────────────────────────────────────

const COST_PER_M: Record<string, { input: number; output: number }> = {
  'gpt-4.1-nano':          { input: 0.10,  output: 0.40  },
  'gpt-4.1-mini':          { input: 0.40,  output: 1.60  },
  'gpt-4.1':               { input: 2.00,  output: 8.00  },
  'gemini-2.5-flash-lite': { input: 0.10,  output: 0.40  },
  'gemini-2.5-flash':      { input: 0.30,  output: 2.50  },
  'gemini-2.5-pro':        { input: 1.25,  output: 10.00 },
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

const SYSTEM_PROMPT = `You are a Sisense JavaScript script analyst specialising in widget and dashboard scripts that run inside the Sisense BI platform.

━━━ SISENSE RUNTIME ENVIRONMENT ━━━
These scripts execute inside Sisense, NOT in a browser or Node.js standalone context.
The following globals are ALWAYS injected by the Sisense runtime and must NEVER be flagged as undefined, undeclared, or missing an import:

  widget      — the current Sisense widget instance
  args        — event arguments (args.result, args.widget, args.dashboard, etc.)
  dashboard   — the parent Sisense dashboard instance
  panel       — the panel metadata object
  prism       — the global Sisense application object
  $, jQuery   — jQuery (bundled and injected by Sisense)
  $$get, $$set, $$clone — Sisense utility helpers
  moment      — date/time library
  _           — Lodash/Underscore utility library
  Highcharts  — charting library (available in chart-type widgets)
  d3          — data visualisation library

⚠️  Do NOT flag any of the above as "not defined", "missing import", "undeclared variable", or any similar generic JavaScript error. They are always present at runtime.

━━━ YOUR JOB ━━━
Identify issues NOT already caught by static analysis. Every violation must include a "category" field chosen from:
  "logic" | "sisense-anti-pattern" | "performance" | "safety" | "dead-code"

━━━ CATEGORIES IN DETAIL ━━━

1. logic
   Runtime logic errors: wrong index, off-by-one, stale closures, incorrect event handler registration, wrong conditional, etc.

2. sisense-anti-pattern  ← USE THIS CATEGORY FOR ALL SISENSE-SPECIFIC VIOLATIONS
   Scripts that mutate objects controlled by the Sisense panel UI cause unpredictable overwrites and data loss.
   Flag ANY write to the following as severity "error":
     • widget.metadata  or any sub-path  (e.g. widget.metadata.panels[0].items = [...])
     • widget.rawQuery  or  widget.query
     • widget.options.*  when modifying structural/data options (not cosmetic style)
     • panel.*  properties written from inside a widget script
   Flag widget-type mismatches as severity "warning":
     • Highcharts API calls (widget.getHighchartsChart(), series manipulation) inside a pivot, indicator, or richtext script
     • Pivot-specific APIs used inside a chart script

   ✅ These are FINE — do NOT flag them:
     args.result.forEach(row => { row.color = '#f00'; });   // result data manipulation
     widget.style = { ... };                                 // cosmetic style override
     widget.title = '...';                                   // title update

   ❌ These must be flagged as sisense-anti-pattern:
     widget.metadata.panels[0].items = [];    // metadata override
     widget.rawQuery = "SELECT ...";          // query override
     panel.items = [];                        // panel write

3. performance
   Expensive operations in hot paths: DOM queries inside beforerender loops, synchronous XHR, redundant widget.refresh() calls triggering re-render loops, etc.

4. safety
   Missing null/undefined guards that would throw at runtime, e.g. accessing args.result[0].value without checking args.result is non-empty.

5. dead-code
   Code with no observable effect: discarded map()/filter() return values, variables assigned but never read, unreachable branches, empty if/else blocks.

━━━ RESPONSE FORMAT ━━━
Respond ONLY with valid JSON in this exact shape — no markdown, no explanation outside the JSON:
{
  "violations": [
    {
      "severity": "error" | "warning" | "info",
      "category": "logic" | "sisense-anti-pattern" | "performance" | "safety" | "dead-code",
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
