import { describe, it, expect } from 'vitest';
import { analyzeWidgetScript, analyzeDashboardScript } from './analyze';

describe('analyzeWidgetScript — no-metadata-override-in-script', () => {
  it('flags widget.metadata access', () => {
    const script = 'widget.metadata.panels[0].items = [];';
    const violations = analyzeWidgetScript(script, 'chart');
    const match = violations.find((v) => v.rule === 'no-metadata-override-in-script');
    expect(match).toBeDefined();
    expect(match?.severity).toBe('error');
  });

  it('flags widget.rawQuery access', () => {
    const script = 'widget.rawQuery = "SELECT 1";';
    const violations = analyzeWidgetScript(script, 'chart');
    expect(violations.some((v) => v.rule === 'no-metadata-override-in-script')).toBe(true);
  });

  it('flags widget.query access', () => {
    const script = 'var q = widget.query;';
    const violations = analyzeWidgetScript(script, 'pivot');
    expect(violations.some((v) => v.rule === 'no-metadata-override-in-script')).toBe(true);
  });

  it('flags panel property assignment', () => {
    const script = 'panel.title = "new title";';
    const violations = analyzeWidgetScript(script, 'chart');
    expect(violations.some((v) => v.rule === 'no-metadata-override-in-script')).toBe(true);
  });

  it('does not flag safe data manipulation', () => {
    const script = 'args.result.forEach(function(row) { row.color = "#ff0000"; });';
    const violations = analyzeWidgetScript(script, 'chart');
    expect(violations.some((v) => v.rule === 'no-metadata-override-in-script')).toBe(false);
  });

  it('includes the line number when detectable', () => {
    const script = 'var x = 1;\nwidget.metadata.panels = [];';
    const violations = analyzeWidgetScript(script, 'chart');
    const match = violations.find((v) => v.rule === 'no-metadata-override-in-script');
    expect(match?.line).toBe(2);
  });
});

describe('analyzeWidgetScript — no-wrong-widget-type', () => {
  it('flags chart-specific API used in a pivot widget', () => {
    const script = 'prism.setColor("red");';
    const violations = analyzeWidgetScript(script, 'pivot');
    expect(violations.some((v) => v.rule === 'no-wrong-widget-type')).toBe(true);
  });

  it('flags pivot-specific API used in a chart widget', () => {
    const script = 'console.log(args.pivot.rows);';
    const violations = analyzeWidgetScript(script, 'chart');
    expect(violations.some((v) => v.rule === 'no-wrong-widget-type')).toBe(true);
  });

  it('flags indicator-specific API used in a chart widget', () => {
    const script = 'var v = args.value;';
    const violations = analyzeWidgetScript(script, 'chart');
    expect(violations.some((v) => v.rule === 'no-wrong-widget-type')).toBe(true);
  });

  it('does not flag chart API used in a chart widget', () => {
    const script = 'prism.setColor("blue");';
    const violations = analyzeWidgetScript(script, 'chart');
    expect(violations.some((v) => v.rule === 'no-wrong-widget-type')).toBe(false);
  });

  it('does not flag generic code in an unknown widget type', () => {
    const script = 'widget.title = widget.title.toUpperCase();';
    const violations = analyzeWidgetScript(script, 'richtext');
    expect(violations.some((v) => v.rule === 'no-wrong-widget-type')).toBe(false);
  });
});

describe('analyzeWidgetScript — no-unimpactful-code', () => {
  it('flags mapping over an empty array literal', () => {
    const script = 'var result = [].map(function(x) { return x; });';
    const violations = analyzeWidgetScript(script, 'chart');
    expect(violations.some((v) => v.rule === 'no-unimpactful-code')).toBe(true);
  });

  it('flags empty if-blocks', () => {
    const script = 'if (widget.title) {}';
    const violations = analyzeWidgetScript(script, 'chart');
    expect(violations.some((v) => v.rule === 'no-unimpactful-code')).toBe(true);
  });

  it('does not flag productive code', () => {
    const script = 'args.result.forEach(function(row) { row.color = "red"; });';
    const violations = analyzeWidgetScript(script, 'chart');
    expect(violations.some((v) => v.rule === 'no-unimpactful-code')).toBe(false);
  });

  it('unimpactful code violations are warnings, not errors', () => {
    const script = 'if (true) {}';
    const violations = analyzeWidgetScript(script, 'chart');
    const match = violations.find((v) => v.rule === 'no-unimpactful-code');
    expect(match?.severity).toBe('warning');
  });

  it('flags a standalone member-expression statement that does nothing', () => {
    const script = '(function() {\n\tconsole.lo\n})()';
    const violations = analyzeWidgetScript(script, 'indicator');
    expect(violations.some((v) => v.rule === 'no-unimpactful-code')).toBe(true);
  });

  it('does not flag a member expression that is called', () => {
    const script = 'console.log("hello");';
    const violations = analyzeWidgetScript(script, 'chart');
    expect(violations.some((v) => v.rule === 'no-unimpactful-code')).toBe(false);
  });
});

describe('analyzeDashboardScript', () => {
  it('flags metadata override in a dashboard script', () => {
    const script = 'widget.metadata.panels[0].items = [];';
    const violations = analyzeDashboardScript(script);
    expect(violations.some((v) => v.rule === 'no-metadata-override-in-script')).toBe(true);
  });

  it('flags unimpactful code in a dashboard script', () => {
    const script = 'if (dashboard.title) {}';
    const violations = analyzeDashboardScript(script);
    expect(violations.some((v) => v.rule === 'no-unimpactful-code')).toBe(true);
  });

  it('never raises no-wrong-widget-type (dashboard scripts have no widget type context)', () => {
    const script = 'prism.setColor("red"); args.pivot.rows = [];';
    const violations = analyzeDashboardScript(script);
    expect(violations.some((v) => v.rule === 'no-wrong-widget-type')).toBe(false);
  });

  it('returns no violations for a clean dashboard script', () => {
    const script = `
      dashboard.on('widgetloaded', function(e, widget) {
        widget.title = widget.title.toUpperCase();
      });
    `;
    expect(analyzeDashboardScript(script)).toHaveLength(0);
  });

  it('returns no violations for an empty script', () => {
    expect(analyzeDashboardScript('')).toHaveLength(0);
  });
});

describe('script validation — syntax errors', () => {
  it('flags a syntax error in a widget script', () => {
    const violations = analyzeWidgetScript('if (', 'chart');
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe('syntax-error');
    expect(violations[0].severity).toBe('error');
    expect(violations[0].message).toMatch(/syntax error/i);
  });

  it('flags a syntax error in a dashboard script', () => {
    const violations = analyzeDashboardScript('function {');
    expect(violations[0].rule).toBe('syntax-error');
  });

  it('does not run other checks when the script is invalid', () => {
    const violations = analyzeWidgetScript('widget.metadata.panels = [; bad js', 'chart');
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe('syntax-error');
  });
});

describe('script validation — runtime errors', () => {
  it('flags calling an undefined method (e.g. console.lo())', () => {
    const violations = analyzeWidgetScript('console.lo()', 'chart');
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe('syntax-error');
    expect(violations[0].message).toMatch(/runtime error/i);
  });

  it('flags calling a method on undefined', () => {
    const violations = analyzeWidgetScript('var x = undefined; x.doSomething();', 'chart');
    expect(violations[0].rule).toBe('syntax-error');
    expect(violations[0].message).toMatch(/runtime error/i);
  });

  it('does not flag mere property access that evaluates to undefined', () => {
    // console.lo (without calling it) is valid — evaluates to undefined silently
    const violations = analyzeWidgetScript('(function() { console.lo })()', 'chart');
    expect(violations.every((v) => v.rule !== 'syntax-error')).toBe(true);
  });

  it('returns no violations for a valid, runnable script', () => {
    const violations = analyzeWidgetScript('var x = 1;', 'chart');
    expect(violations.every((v) => v.rule !== 'syntax-error')).toBe(true);
  });
});

describe('analyzeWidgetScript — clean scripts', () => {
  it('returns no violations for an empty script', () => {
    expect(analyzeWidgetScript('', 'chart')).toHaveLength(0);
  });

  it('returns no violations for a benign colour-setting script', () => {
    const script = `
      args.result.forEach(function(row) {
        if (row.value > 100) {
          row.color = '#e74c3c';
        } else {
          row.color = '#2ecc71';
        }
      });
    `;
    expect(analyzeWidgetScript(script, 'chart')).toHaveLength(0);
  });

  it('can produce multiple violations in one script', () => {
    const script = 'widget.metadata.panels = []; var x = args.pivot.rows;';
    const violations = analyzeWidgetScript(script, 'chart');
    expect(violations.length).toBeGreaterThanOrEqual(2);
  });
});
