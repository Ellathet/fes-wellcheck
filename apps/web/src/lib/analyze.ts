// ─── Public types ────────────────────────────────────────────────────────────

export interface WellcheckViolation {
  rule:
    | 'syntax-error'
    | 'no-wrong-widget-type'
    | 'no-unimpactful-code'
    | 'no-metadata-override-in-script';
  severity: 'error' | 'warning';
  message: string;
  line?: number;
  snippet?: string;
}

export interface ScriptAnalysisResult {
  script: string;
  violations: WellcheckViolation[];
}

export interface WidgetAnalysisResult {
  widgetOid: string;
  widgetTitle: string;
  widgetType: string;
  script: string;
  violations: WellcheckViolation[];
}

export interface DashboardAnalysisResult {
  dashboardOid: string;
  dashboardTitle: string;
  dashboardScript?: ScriptAnalysisResult;
  widgets: WidgetAnalysisResult[];
}

// ─── Sisense API surface per widget type ─────────────────────────────────────

interface ApiDescriptor {
  pattern: RegExp;
  label: string;
}

const WIDGET_APIS: Record<string, ApiDescriptor[]> = {
  chart: [
    // `prism` as a standalone identifier (not a property key like obj.prism)
    { pattern: /(?<!\.)\bprism\b/, label: 'prism' },
    { pattern: /\bargs\.result\b/, label: 'args.result' },
    { pattern: /\bargs\.entries\b/, label: 'args.entries' },
  ],
  pivot: [
    { pattern: /\bargs\.pivot\b/, label: 'args.pivot' },
    { pattern: /\bargs\.rows\b/, label: 'args.rows' },
    { pattern: /\bargs\.columns\b/, label: 'args.columns' },
  ],
  indicator: [
    { pattern: /\bargs\.value\b/, label: 'args.value' },
    { pattern: /\bargs\.secondary\b/, label: 'args.secondary' },
  ],
};

// ─── Core scanner ─────────────────────────────────────────────────────────────

/**
 * Run a regex over the full script and emit one violation per match.
 * The regex is always run in global mode; flags other than `g` are preserved.
 */
function scanScript(
  script: string,
  pattern: RegExp,
  makeViolation: (line: number, snippet: string, match: RegExpExecArray) => WellcheckViolation,
): WellcheckViolation[] {
  const violations: WellcheckViolation[] = [];
  const lines = script.split('\n');
  const re = new RegExp(pattern.source, 'g' + pattern.flags.replace(/g/g, ''));
  let m: RegExpExecArray | null;

  while ((m = re.exec(script)) !== null) {
    const lineNum = script.slice(0, m.index).split('\n').length;
    const snippet = lines[lineNum - 1]?.trim() ?? '';
    violations.push(makeViolation(lineNum, snippet, m));
    if (m[0].length === 0) re.lastIndex++;
  }

  return violations;
}

// ─── Rule: no-metadata-override-in-script ────────────────────────────────────

function checkMetadataOverride(script: string): WellcheckViolation[] {
  const violations: WellcheckViolation[] = [];

  violations.push(
    ...scanScript(
      script,
      /\bwidget\.(metadata|rawQuery|query)\b/,
      (line, snippet, m) => ({
        rule: 'no-metadata-override-in-script',
        severity: 'error',
        message: `Script accesses "widget.${m[1]}" which should be managed through the Sisense panel UI, not via scripts.`,
        line,
        snippet,
      }),
    ),
  );

  violations.push(
    ...scanScript(
      script,
      /\bpanel\.\w+\s*=/,
      (line, snippet) => ({
        rule: 'no-metadata-override-in-script',
        severity: 'error',
        message:
          'Script modifies a "panel" property via assignment. Panel structure should be managed through the Sisense UI.',
        line,
        snippet,
      }),
    ),
  );

  return violations;
}

// ─── Rule: no-wrong-widget-type ───────────────────────────────────────────────

function checkWrongWidgetType(script: string, widgetType: string): WellcheckViolation[] {
  const violations: WellcheckViolation[] = [];

  for (const [type, apis] of Object.entries(WIDGET_APIS)) {
    if (type === widgetType) continue;

    for (const { pattern, label } of apis) {
      violations.push(
        ...scanScript(script, pattern, (line, snippet) => ({
          rule: 'no-wrong-widget-type',
          severity: 'error',
          message: `"${label}" is a ${type}-widget API but this widget is of type "${widgetType}".`,
          line,
          snippet,
        })),
      );
    }
  }

  return violations;
}

// ─── Rule: no-unimpactful-code ────────────────────────────────────────────────

function checkUnimpactfulCode(script: string): WellcheckViolation[] {
  const violations: WellcheckViolation[] = [];

  // Empty if-block: if (...) {}
  violations.push(
    ...scanScript(
      script,
      /\bif\s*\([^)]*\)\s*\{\s*\}/,
      (line, snippet) => ({
        rule: 'no-unimpactful-code',
        severity: 'warning',
        message: 'Empty if-block has no effect.',
        line,
        snippet,
      }),
    ),
  );

  // Mapping over an empty array literal: [].map(
  violations.push(
    ...scanScript(
      script,
      /\[\s*\]\.map\s*\(/,
      (line, snippet) => ({
        rule: 'no-unimpactful-code',
        severity: 'warning',
        message: 'Mapping over an empty array literal has no effect.',
        line,
        snippet,
      }),
    ),
  );

  // Standalone member-expression statement (reads a property but does nothing
  // with the result).  Matches lines that are just `something.property` or
  // `something.property.chain` with no assignment, call, or operator.
  // Pattern: a line whose only content is word-chars, dots, and brackets.
  violations.push(
    ...scanScript(
      script,
      /^\s*([\w$][\w$.[\]'"]*)\s*;?\s*$/m,
      (line, snippet, m) => {
        const expr = m[1];
        // Must contain a dot to be a member expression (skip plain identifiers
        // and number/string literals, which are less likely to be mistakes).
        if (!expr.includes('.')) return null as unknown as WellcheckViolation;
        return {
          rule: 'no-unimpactful-code',
          severity: 'warning',
          message: `"${expr}" is a standalone expression that has no effect — did you mean to call it or assign its value?`,
          line,
          snippet,
        };
      },
    ).filter(Boolean),
  );

  return violations;
}

// ─── Script validation ────────────────────────────────────────────────────────

const SISENSE_MOCK_GLOBALS = [
  'widget', 'args', 'dashboard', 'panel', 'prism', 'context', 'queryResult',
] as const;

/**
 * Creates a recursive Proxy that returns itself for any property access or
 * function call.  This lets Sisense scripts do unlimited chaining
 * (`widget.metadata.panels[0].items = []`, `prism.setColor("red")`, …)
 * without ever throwing — while code that touches real browser globals that
 * do NOT have the property (e.g. `console.lo()`) will still throw correctly.
 */
function createDeepMock(): unknown {
  const mock = new Proxy(
    // Use a function as the target so the proxy is also callable.
    function deepMock() { return mock; } as object,
    {
      get(_target, prop: string | symbol) {
        if (typeof prop === 'symbol') return undefined;
        // Return undefined for `then` so Promises don't treat this as a thenable.
        if (prop === 'then') return undefined;
        return mock;
      },
      apply() { return mock; },
    },
  );
  return mock;
}

/**
 * Validate the script in two passes:
 *
 * 1. **Syntax check** — `new Function()` parses the code without running it.
 * 2. **Runtime check** — execute the script with deep-proxy Sisense globals so
 *    genuine runtime errors surface (e.g. `console.lo()` → TypeError) while
 *    legitimate Sisense patterns (deep chaining, method calls) pass through.
 *
 * Note: errors hidden inside callbacks that are never invoked at the top level
 * (e.g. `args.result.forEach(cb)`) cannot be detected this way.
 */
function validateScript(script: string): WellcheckViolation | null {
  let fn: (...args: unknown[]) => unknown;

  // Pass 1 — syntax
  try {
    // eslint-disable-next-line no-new-func
    fn = new Function(...SISENSE_MOCK_GLOBALS, script) as typeof fn;
  } catch (e) {
    if (e instanceof SyntaxError) {
      return { rule: 'syntax-error', severity: 'error', message: `Syntax error: ${e.message}` };
    }
    return null;
  }

  // Pass 2 — runtime with deep-proxy mocks for every Sisense global
  const mock = createDeepMock();
  try {
    fn(mock, mock, mock, mock, mock, mock, mock);
    return null;
  } catch (e) {
    return {
      rule: 'syntax-error',
      severity: 'error',
      message: `Runtime error: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function analyzeWidgetScript(script: string, widgetType: string): WellcheckViolation[] {
  if (!script.trim()) return [];

  const invalid = validateScript(script);
  if (invalid) return [invalid];

  return [
    ...checkMetadataOverride(script),
    ...checkWrongWidgetType(script, widgetType),
    ...checkUnimpactfulCode(script),
  ];
}

/**
 * Dashboard-level scripts have no widget type context —
 * `no-wrong-widget-type` does not apply.
 */
export function analyzeDashboardScript(script: string): WellcheckViolation[] {
  if (!script.trim()) return [];

  const invalid = validateScript(script);
  if (invalid) return [invalid];

  return [
    ...checkMetadataOverride(script),
    ...checkUnimpactfulCode(script),
  ];
}
