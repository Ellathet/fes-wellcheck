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
    | 'no-metadata-override-in-script'
    | 'no-unsafe-member-access';
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

/**
 * Returns true when node is a member-expression chain that starts with
 * obj.prop (e.g. widget.options, widget.options.filters, widget.options.x.y).
 */
function startsWithChain(node: Node, obj: string, prop: string): boolean {
  if (node.type !== 'MemberExpression') return false;
  const mem = node as unknown as MemberExpression;
  if (mem.computed) return false;
  if (identName(mem.object as Node) === obj && identName(mem.property as Node) === prop) {
    return true;
  }
  return startsWithChain(mem.object as Node, obj, prop);
}

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

      // panel.* assignment
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

      // widget.options.* assignment — structural options belong in the panel UI
      if (left.type === 'MemberExpression' && startsWithChain(left, 'widget', 'options')) {
        violations.push(violation(
          'no-metadata-override-in-script', 'warning',
          'Script modifies "widget.options" via assignment. Structural options should be configured through the Sisense panel UI, not overridden in scripts.',
          source, node as unknown as Node,
        ));
      }
    },
  });

  return violations;
}

// ─── Rule: no-wrong-widget-type ───────────────────────────────────────────────

// Widget types that are known to NOT use the Highcharts rendering engine.
// chart/gauge/map widgets DO use Highcharts; unknown types (blox, custom, …)
// get no flag — we err on the side of fewer false positives.
const NON_HIGHCHARTS_WIDGET_TYPES = new Set(['pivot', 'indicator', 'richtext']);

function checkWrongWidgetType(
  source: string,
  ast: acorn.Program,
  widgetType: string,
): WellcheckViolation[] {
  const violations: WellcheckViolation[] = [];

  // args.* API mismatches
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

  // In chart widgets: ev.result contains processed data (series arrays), NOT
  // the Highcharts options/config. Properties like yAxis, xAxis, plotOptions
  // must be accessed via ev.options (beforerender) or widget.getHighchartsChart().
  if (widgetType === 'chart') {
    const HIGHCHARTS_OPTIONS_PROPS = new Set([
      'yAxis', 'xAxis', 'plotOptions', 'legend', 'tooltip', 'pane',
    ]);

    walk.simple(ast, {
      MemberExpression(node) {
        const n = node as unknown as MemberExpression;
        if (n.computed) return;
        const prop = identName(n.property as Node);
        if (!prop || !HIGHCHARTS_OPTIONS_PROPS.has(prop)) return;

        // Check if object is ev.result (two-level chain)
        if (
          n.object.type === 'MemberExpression' &&
          identName((n.object as unknown as MemberExpression).property as Node) === 'result' &&
          identName((n.object as unknown as MemberExpression).object as Node) === 'ev'
        ) {
          violations.push(violation(
            'no-wrong-widget-type', 'error',
            `"ev.result.${prop}" is not valid — "ev.result" contains the processed data payload, not the Highcharts configuration. ` +
            `Use "ev.options.${prop}" inside a "beforerender" handler, or "widget.getHighchartsChart().${prop}" in a "domready" handler.`,
            source, node as unknown as Node,
          ));
        }
      },
    });
  }

  // Highcharts API used inside a non-chart widget
  if (NON_HIGHCHARTS_WIDGET_TYPES.has(widgetType)) {
    walk.simple(ast, {
      // Highcharts.* — any access to the Highcharts namespace
      MemberExpression(node) {
        const n = node as unknown as MemberExpression;
        if (!n.computed && identName(n.object as Node) === 'Highcharts') {
          violations.push(violation(
            'no-wrong-widget-type', 'error',
            `"Highcharts" is a chart-specific API and cannot be used in a "${widgetType}" widget.`,
            source, node as unknown as Node,
          ));
        }
      },

      // widget.getHighchartsChart() — chart-only method
      CallExpression(node) {
        const n = node as unknown as acorn.CallExpression;
        if (
          n.callee.type === 'MemberExpression' &&
          identName((n.callee as unknown as MemberExpression).object as Node) === 'widget' &&
          !(n.callee as unknown as MemberExpression).computed &&
          identName((n.callee as unknown as MemberExpression).property as Node) === 'getHighchartsChart'
        ) {
          violations.push(violation(
            'no-wrong-widget-type', 'error',
            `"widget.getHighchartsChart()" is only available in chart widgets, not in a "${widgetType}" widget.`,
            source, node as unknown as Node,
          ));
        }
      },
    });
  }

  return violations;
}

// ─── Rule: no-unimpactful-code ────────────────────────────────────────────────

// Methods that always produce a new value — discarding the return value is
// almost certainly a bug (the caller forgot to assign or use the result).
const RESULT_PRODUCING_METHODS = new Set([
  'map', 'filter', 'find', 'findIndex', 'reduce', 'reduceRight',
  'flat', 'flatMap', 'slice', 'concat',
]);

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

    // [].map(...) — mapping over an empty array literal is always a no-op
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

    ExpressionStatement(node) {
      const n = node as unknown as acorn.ExpressionStatement;

      // Standalone member-expression: `console.lo` (no call / assignment)
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

      // Discarded result of a result-producing array method:
      // `args.result.filter(fn)` without assigning the returned array is a bug.
      if (n.expression.type === 'CallExpression') {
        const call = n.expression as unknown as acorn.CallExpression;
        if (call.callee.type === 'MemberExpression') {
          const mem = call.callee as unknown as MemberExpression;
          const methodName = !mem.computed ? identName(mem.property as Node) : null;
          if (methodName && RESULT_PRODUCING_METHODS.has(methodName)) {
            violations.push(violation(
              'no-unimpactful-code', 'warning',
              `The return value of ".${methodName}()" is discarded — assign it to a variable or the call has no effect.`,
              source, node as unknown as Node,
            ));
          }
        }
      }
    },
  });

  return violations;
}

// ─── Rule: no-unsafe-member-access ────────────────────────────────────────────
//
// Detects variables that are assigned from `.find()` or `_.find()` — both can
// return `undefined` — and then have their properties accessed without any
// null/undefined guard in the script.
//
// Limitation: the guard check is script-wide (not scope/flow sensitive).
// A guard anywhere in the script suppresses the warning for that variable.
// This trades a few false negatives for zero false positives on guarded code.

function checkUnsafeMemberAccess(source: string, ast: acorn.Program): WellcheckViolation[] {
  const violations: WellcheckViolation[] = [];

  // Step 1 — Collect variables assigned from .find() or _.find().
  // Both `_.find(arr, fn)` and `arr.find(fn)` are captured because both have
  // a callee that is a MemberExpression whose property is `find`.
  const findResultVars = new Set<string>();

  walk.simple(ast, {
    VariableDeclarator(node) {
      const n = node as unknown as acorn.VariableDeclarator;
      if (!n.init || n.init.type !== 'CallExpression') return;
      if (n.id.type !== 'Identifier') return;
      const call = n.init as unknown as acorn.CallExpression;
      if (
        call.callee.type === 'MemberExpression' &&
        identName((call.callee as unknown as MemberExpression).property as Node) === 'find'
      ) {
        findResultVars.add((n.id as unknown as acorn.Identifier).name);
      }
    },
  });

  if (findResultVars.size === 0) return violations;

  // Step 2 — Collect variable names that appear in guard positions
  // (IfStatement test, ConditionalExpression test, LogicalExpression left-hand side).
  // Any occurrence counts — this is the intentional conservative trade-off.
  const guardedVars = new Set<string>();

  const collectIdents = (node: Node) => {
    walk.simple(node, {
      Identifier(id) {
        guardedVars.add((id as unknown as acorn.Identifier).name);
      },
    });
  };

  walk.simple(ast, {
    IfStatement(node) {
      collectIdents((node as unknown as acorn.IfStatement).test as unknown as Node);
    },
    ConditionalExpression(node) {
      collectIdents((node as unknown as acorn.ConditionalExpression).test as unknown as Node);
    },
    LogicalExpression(node) {
      const n = node as unknown as acorn.LogicalExpression;
      // Only the left side of && / || / ?? acts as a guard for the right side.
      collectIdents(n.left as unknown as Node);
    },
  });

  // Step 3 — Flag member accesses on unguarded find-result variables.
  // Track which (variable, property) pairs we have already reported to avoid
  // duplicate violations when the same access appears multiple times.
  const reported = new Set<string>();

  walk.simple(ast, {
    MemberExpression(node) {
      const n = node as unknown as MemberExpression;
      const objName = identName(n.object as Node);
      if (!objName || !findResultVars.has(objName)) return;
      if (guardedVars.has(objName)) return;

      const propName = !n.computed ? (identName(n.property as Node) ?? '?') : '?';
      const key = `${objName}.${propName}`;
      if (reported.has(key)) return;
      reported.add(key);

      violations.push(violation(
        'no-unsafe-member-access', 'warning',
        `"${objName}" may be undefined — ".find()" returns undefined when no element matches. ` +
        `Add a null check before accessing ".${propName}": if (${objName}) { ... }`,
        source, node as unknown as Node,
      ));
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
    ...checkUnsafeMemberAccess(script, ast),
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
