import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import type { Node, MemberExpression, AssignmentExpression, Identifier } from 'acorn';

// ─── Public types ────────────────────────────────────────────────────────────

export interface WellcheckViolation {
  rule:
    | 'syntax-error'
    | 'no-undefined-variable'
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

// ─── AST helpers ─────────────────────────────────────────────────────────────

/** Resolve a node's 1-based line number from the source string. */
function lineOf(source: string, node: Node): number {
  return source.slice(0, node.start).split('\n').length;
}

/** Extract the trimmed source line that contains a node. */
function snippetOf(source: string, node: Node): string {
  const line = lineOf(source, node);
  return source.split('\n')[line - 1]?.trim() ?? '';
}

function violation(
  rule: WellcheckViolation['rule'],
  severity: WellcheckViolation['severity'],
  message: string,
  source: string,
  node: Node,
): WellcheckViolation {
  return { rule, severity, message, line: lineOf(source, node), snippet: snippetOf(source, node) };
}

/** Return the name of an Identifier node, or null for any other node type. */
function identName(node: Node): string | null {
  return node.type === 'Identifier' ? (node as Identifier).name : null;
}

// ─── Sisense API surface per widget type ─────────────────────────────────────
//
// Only `args.*` properties are widget-type-specific.
// Globals like `prism`, `widget`, `dashboard`, `$`, `jQuery` are available
// in ALL Sisense widget scripts and must never be flagged as wrong-type.

interface ApiDescriptor {
  /** Matches `obj.prop` as a member expression (e.g. args.result). */
  member: [string, string];
  label: string;
}

const WIDGET_APIS: Record<string, ApiDescriptor[]> = {
  chart: [
    { member: ['args', 'result'],  label: 'args.result' },
    { member: ['args', 'entries'], label: 'args.entries' },
  ],
  pivot: [
    { member: ['args', 'pivot'],   label: 'args.pivot' },
    { member: ['args', 'rows'],    label: 'args.rows' },
    { member: ['args', 'columns'], label: 'args.columns' },
  ],
  indicator: [
    { member: ['args', 'value'],     label: 'args.value' },
    { member: ['args', 'secondary'], label: 'args.secondary' },
  ],
};

// ─── Script validation (syntax + runtime) ────────────────────────────────────

/**
 * A recursive Proxy that returns itself for any property access or call.
 * Sisense scripts may chain deeply (`widget.metadata.panels[0].items = []`,
 * `prism.setColor("red")`, …) — the proxy lets all of that through.
 * Code that touches real browser globals that lack the property (e.g.
 * `console.lo()`) still throws correctly because `console` is the real object.
 */
function createDeepMock(): unknown {
  // eslint-disable-next-line prefer-const
  let mock: unknown;
  mock = new Proxy(
    function deepMock() { return mock; } as object,
    {
      get(_t, prop: string | symbol) {
        if (typeof prop === 'symbol') return undefined;
        if (prop === 'then') return undefined; // don't look like a Promise
        return mock;
      },
      apply() { return mock; },
    },
  );
  return mock;
}

// ─── Known globals ─────────────────────────────────────────────────────────
//
// Any identifier that appears in a script but is NOT declared locally and NOT
// in this set will be flagged by the `no-undefined-variable` rule.

const KNOWN_GLOBALS = new Set([
  // ── ECMAScript built-ins ──────────────────────────────────────────────────
  'undefined', 'null', 'NaN', 'Infinity', 'globalThis',
  'Object', 'Array', 'Function', 'Boolean', 'Number', 'String', 'Symbol', 'BigInt',
  'Math', 'Date', 'RegExp', 'JSON', 'Intl',
  'Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError',
  'URIError', 'EvalError', 'AggregateError',
  'Map', 'Set', 'WeakMap', 'WeakSet', 'WeakRef',
  'Promise', 'Proxy', 'Reflect',
  'ArrayBuffer', 'SharedArrayBuffer', 'DataView',
  'Int8Array', 'Uint8Array', 'Uint8ClampedArray',
  'Int16Array', 'Uint16Array', 'Int32Array', 'Uint32Array',
  'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite',
  'decodeURI', 'decodeURIComponent', 'encodeURI', 'encodeURIComponent',
  'escape', 'unescape', 'eval',
  // ── Browser globals ───────────────────────────────────────────────────────
  'window', 'self', 'document', 'navigator', 'location', 'history',
  'screen', 'frames', 'top', 'parent', 'opener',
  'console', 'alert', 'confirm', 'prompt',
  'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
  'requestAnimationFrame', 'cancelAnimationFrame', 'queueMicrotask',
  'fetch', 'XMLHttpRequest', 'WebSocket',
  'localStorage', 'sessionStorage', 'indexedDB',
  'performance', 'crypto',
  'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'TouchEvent',
  'Element', 'HTMLElement', 'Node', 'NodeList',
  'URL', 'URLSearchParams', 'FormData', 'Headers', 'Request', 'Response',
  'Blob', 'File', 'FileReader',
  'MutationObserver', 'IntersectionObserver', 'ResizeObserver',
  'AbortController', 'AbortSignal',
  'postMessage', 'structuredClone',
  // ── Sisense widget script globals ─────────────────────────────────────────
  // Core injected variables
  'widget', 'args', 'dashboard', 'panel', 'prism', 'context', 'queryResult',
  // jQuery (Sisense bundles it)
  '$', 'jQuery',
  // Sisense utility helpers
  '$$get', '$$set', '$$clone',
  // Commonly bundled libraries
  'moment',       // date/time
  '_',            // Lodash / Underscore
  'Highcharts',   // chart engine
  'd3',           // data-viz
  'angular',      // AngularJS (older Sisense versions)
  'Sisense',      // top-level Sisense namespace
  'BloX',         // BloX widget API
]);

// ─── Rule: no-undefined-variable ─────────────────────────────────────────────

/**
 * Collect every name that is *locally declared* in the script so that
 * legitimate references don't generate false positives.
 *
 * Strategy: gather all binding names globally (ignoring block scope).
 * This trades precision for simplicity — it avoids false positives from
 * variables declared in inner scopes while still catching truly missing names.
 */
function collectDeclaredNames(ast: acorn.Program): Set<string> {
  const names = new Set<string>();

  function addPattern(node: Node) {
    if (node.type === 'Identifier') {
      names.add((node as unknown as acorn.Identifier).name);
    } else if (node.type === 'ObjectPattern') {
      for (const prop of (node as unknown as acorn.ObjectPattern).properties) {
        if (prop.type === 'RestElement') addPattern(prop.argument as Node);
        else addPattern((prop as unknown as acorn.Property).value as Node);
      }
    } else if (node.type === 'ArrayPattern') {
      for (const el of (node as unknown as acorn.ArrayPattern).elements) {
        if (el) addPattern(el as Node);
      }
    } else if (node.type === 'RestElement') {
      addPattern((node as unknown as acorn.RestElement).argument as Node);
    } else if (node.type === 'AssignmentPattern') {
      addPattern((node as unknown as acorn.AssignmentPattern).left as Node);
    }
  }

  walk.simple(ast, {
    VariableDeclarator(node) {
      addPattern((node as unknown as acorn.VariableDeclarator).id as Node);
    },
    FunctionDeclaration(node) {
      const n = node as unknown as acorn.FunctionDeclaration;
      if (n.id) names.add(n.id.name);
      n.params.forEach((p) => addPattern(p as Node));
    },
    FunctionExpression(node) {
      const n = node as unknown as acorn.FunctionExpression;
      if (n.id) names.add(n.id.name); // named function expression
      n.params.forEach((p) => addPattern(p as Node));
    },
    ArrowFunctionExpression(node) {
      (node as unknown as acorn.ArrowFunctionExpression).params.forEach((p) =>
        addPattern(p as Node),
      );
    },
    CatchClause(node) {
      const param = (node as unknown as acorn.CatchClause).param;
      if (param) addPattern(param as Node);
    },
    // `foo = bar` without var/let/const creates an implicit global —
    // treat the LHS as declared so it doesn't generate a false positive.
    AssignmentExpression(node) {
      const lhs = (node as unknown as acorn.AssignmentExpression).left;
      if (lhs.type === 'Identifier') {
        names.add((lhs as unknown as acorn.Identifier).name);
      }
    },
  });

  return names;
}

function checkUndefinedVariables(source: string, ast: acorn.Program): WellcheckViolation[] {
  const violations: WellcheckViolation[] = [];
  const declared = collectDeclaredNames(ast);

  walk.ancestor(ast, {
    Identifier(node, _state, ancestors) {
      const name = (node as unknown as acorn.Identifier).name;

      // Already known — nothing to report.
      if (KNOWN_GLOBALS.has(name) || declared.has(name)) return;

      // acorn-walk's ancestor() includes the current node as the last element
      // of the ancestors array, so the true parent is at length - 2.
      const parent = ancestors[ancestors.length - 2] as Node | undefined;
      if (!parent) return;

      switch (parent.type) {
        // obj.PROP — property key, not a reference
        case 'MemberExpression': {
          const mem = parent as unknown as acorn.MemberExpression;
          if (!mem.computed && mem.property === (node as unknown as Node)) return;
          break;
        }
        // { KEY: val } — object literal key
        case 'Property': {
          const prop = parent as unknown as acorn.Property;
          if (prop.key === (node as unknown as Node) && !prop.shorthand && !prop.computed) return;
          break;
        }
        // var/let/const NAME = ... — declaration site
        case 'VariableDeclarator':
          if ((parent as unknown as acorn.VariableDeclarator).id === (node as unknown as Node)) return;
          break;
        // function NAME() {} — declaration site
        case 'FunctionDeclaration':
        case 'FunctionExpression':
          if ((parent as unknown as acorn.Function).id === (node as unknown as Node)) return;
          break;
        // LABEL: ... / break LABEL / continue LABEL — not a value reference
        case 'LabeledStatement':
        case 'BreakStatement':
        case 'ContinueStatement':
          return;
        // typeof NAME — safe even for undeclared variables
        case 'UnaryExpression':
          if ((parent as unknown as acorn.UnaryExpression).operator === 'typeof') return;
          break;
        // import { NAME } / export { NAME } — not a runtime reference
        case 'ImportSpecifier':
        case 'ExportSpecifier':
        case 'ImportDefaultSpecifier':
        case 'ImportNamespaceSpecifier':
          return;
      }

      violations.push(violation(
        'no-undefined-variable',
        'error',
        `"${name}" is not defined — it will throw a ReferenceError at runtime.`,
        source,
        node as unknown as Node,
      ));
    },
  });

  return violations;
}

// All variables that Sisense injects into every widget/dashboard script scope.
// $ and jQuery come from the jQuery version bundled with Sisense.
const SISENSE_GLOBAL_NAMES = [
  'widget', 'args', 'dashboard', 'panel', 'prism', 'context', 'queryResult',
  '$', 'jQuery',
] as const;

/**
 * Execute the script with deep-proxy mocks for every Sisense global to catch
 * errors that only appear at runtime (e.g. `console.lo()`).
 *
 * Note: errors hidden inside callbacks that are never invoked at the top level
 * cannot be detected this way — use `checkUndefinedVariables` for those.
 */
function validateScriptRuntime(script: string): WellcheckViolation | null {
  let fn: (...args: unknown[]) => unknown;
  try {
    // eslint-disable-next-line no-new-func
    fn = new Function(...SISENSE_GLOBAL_NAMES, script) as typeof fn;
  } catch {
    return null; // syntax errors are already handled by Acorn
  }

  const mock = createDeepMock();
  try {
    fn(mock, mock, mock, mock, mock, mock, mock, mock, mock);
    return null;
  } catch (e) {
    return {
      rule: 'syntax-error',
      severity: 'error',
      message: `Runtime error: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

// ─── Rule: no-metadata-override-in-script ────────────────────────────────────

function checkMetadataOverride(source: string, ast: acorn.Program): WellcheckViolation[] {
  const violations: WellcheckViolation[] = [];
  const BLOCKED_PROPS = new Set(['metadata', 'rawQuery', 'query']);

  walk.simple(ast, {
    MemberExpression(node) {
      const n = node as unknown as MemberExpression;
      if (
        identName(n.object as Node) === 'widget' &&
        !n.computed &&
        BLOCKED_PROPS.has(identName(n.property as Node) ?? '')
      ) {
        const prop = identName(n.property as Node)!;
        violations.push(violation(
          'no-metadata-override-in-script', 'error',
          `Script accesses "widget.${prop}" which should be managed through the Sisense panel UI, not via scripts.`,
          source, node as unknown as Node,
        ));
      }
    },

    AssignmentExpression(node) {
      const n = node as unknown as AssignmentExpression;
      const left = n.left as Node;
      if (
        left.type === 'MemberExpression' &&
        identName((left as unknown as MemberExpression).object as Node) === 'panel'
      ) {
        violations.push(violation(
          'no-metadata-override-in-script', 'error',
          'Script modifies a "panel" property via assignment. Panel structure should be managed through the Sisense UI.',
          source, node as unknown as Node,
        ));
      }
    },
  });

  return violations;
}

// ─── Rule: no-wrong-widget-type ───────────────────────────────────────────────

function checkWrongWidgetType(
  source: string,
  ast: acorn.Program,
  widgetType: string,
): WellcheckViolation[] {
  const violations: WellcheckViolation[] = [];

  for (const [type, apis] of Object.entries(WIDGET_APIS)) {
    if (type === widgetType) continue;

    for (const api of apis) {
      const [obj, prop] = api.member;
      walk.simple(ast, {
        MemberExpression(node) {
          const n = node as unknown as MemberExpression;
          if (
            !n.computed &&
            identName(n.object as Node) === obj &&
            identName(n.property as Node) === prop
          ) {
            violations.push(violation(
              'no-wrong-widget-type', 'error',
              `"${api.label}" is a ${type}-widget API but this widget is of type "${widgetType}".`,
              source, node as unknown as Node,
            ));
          }
        },
      });
    }
  }

  return violations;
}

// ─── Rule: no-unimpactful-code ────────────────────────────────────────────────

function checkUnimpactfulCode(source: string, ast: acorn.Program): WellcheckViolation[] {
  const violations: WellcheckViolation[] = [];

  walk.simple(ast, {
    // Empty if-block: if (...) {}
    IfStatement(node) {
      const n = node as unknown as acorn.IfStatement;
      if (n.consequent.type === 'BlockStatement' && n.consequent.body.length === 0) {
        violations.push(violation(
          'no-unimpactful-code', 'warning',
          'Empty if-block has no effect.',
          source, node as unknown as Node,
        ));
      }
    },

    // [].map(...)
    CallExpression(node) {
      const n = node as unknown as acorn.CallExpression;
      if (
        n.callee.type === 'MemberExpression' &&
        (n.callee as unknown as MemberExpression).object.type === 'ArrayExpression' &&
        ((n.callee as unknown as MemberExpression).object as unknown as acorn.ArrayExpression).elements.length === 0 &&
        identName((n.callee as unknown as MemberExpression).property as Node) === 'map'
      ) {
        violations.push(violation(
          'no-unimpactful-code', 'warning',
          'Mapping over an empty array literal has no effect.',
          source, node as unknown as Node,
        ));
      }
    },

    // Standalone member-expression statement: `console.lo` (no call / assignment)
    ExpressionStatement(node) {
      const n = node as unknown as acorn.ExpressionStatement;
      if (n.expression.type === 'MemberExpression') {
        const mem = n.expression as unknown as MemberExpression;
        const label = !mem.computed && identName(mem.property as Node)
          ? `${identName(mem.object as Node) ?? '?'}.${identName(mem.property as Node)}`
          : null;
        violations.push(violation(
          'no-unimpactful-code', 'warning',
          `${label ? `"${label}"` : 'A member expression'} is a standalone expression that has no effect — did you mean to call it or assign its value?`,
          source, node as unknown as Node,
        ));
      }
    },
  });

  return violations;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Shared analysis pipeline.
 *
 * Order of operations:
 * 1. Syntax check via Acorn — abort immediately on parse error.
 * 2. Static AST checks — always run (including `no-undefined-variable`).
 * 3. Runtime validation — skipped when undefined variables are already found,
 *    because they would surface as a generic ReferenceError that is less
 *    informative than the precise static report.
 */
function runChecks(
  script: string,
  extraChecks: (ast: acorn.Program) => WellcheckViolation[],
): WellcheckViolation[] {
  // 1. Syntax
  let ast: acorn.Program;
  try {
    ast = acorn.parse(script, { ecmaVersion: 2020, sourceType: 'script' });
  } catch (e) {
    return [{
      rule: 'syntax-error',
      severity: 'error',
      message: `Syntax error: ${e instanceof Error ? e.message : String(e)}`,
    }];
  }

  // 2. Static checks
  const undefs = checkUndefinedVariables(script, ast);
  const staticViolations = [...undefs, ...extraChecks(ast)];

  // 3. Runtime — only when no undefined variables detected
  if (undefs.length === 0) {
    const runtimeViolation = validateScriptRuntime(script);
    if (runtimeViolation) return [runtimeViolation, ...staticViolations];
  }

  return staticViolations;
}

export function analyzeWidgetScript(script: string, widgetType: string): WellcheckViolation[] {
  if (!script.trim()) return [];
  return runChecks(script, (ast) => [
    ...checkMetadataOverride(script, ast),
    ...checkWrongWidgetType(script, ast, widgetType),
    ...checkUnimpactfulCode(script, ast),
  ]);
}

/**
 * Dashboard-level scripts have no widget type context —
 * `no-wrong-widget-type` does not apply.
 */
export function analyzeDashboardScript(script: string): WellcheckViolation[] {
  if (!script.trim()) return [];
  return runChecks(script, (ast) => [
    ...checkMetadataOverride(script, ast),
    ...checkUnimpactfulCode(script, ast),
  ]);
}
