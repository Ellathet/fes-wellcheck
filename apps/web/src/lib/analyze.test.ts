import { describe, it, expect } from 'vitest';
import { analyzeWidgetScript, analyzeDashboardScript } from './analyze';

describe('analyzeWidgetScript — no-undefined-variable', () => {
  it('flags a variable that is never declared anywhere in the script', () => {
    const script = 'widget.on("processresult", function(se, ev) { breakby.indexOf("x"); });';
    const violations = analyzeWidgetScript(script, 'chart');
    expect(violations.some((v) => v.rule === 'no-undefined-variable' && v.message.includes('"breakby"'))).toBe(true);
  });

  it('does not flag $$get — it is a Sisense utility global', () => {
    const script = 'var item = se.metadata.panels[0].items[0]; var mask = $$get(item, "format.mask", {});';
    const violations = analyzeWidgetScript(script, 'chart');
    expect(violations.some((v) => v.rule === 'no-undefined-variable' && v.message.includes('"$$get"'))).toBe(false);
  });

  it('does not flag variables declared with var/let/const', () => {
    const script = 'var total = 0; total += 1; console.log(total);';
    const violations = analyzeWidgetScript(script, 'chart');
    expect(violations.some((v) => v.rule === 'no-undefined-variable')).toBe(false);
  });

  it('does not flag function parameters', () => {
    const script = 'args.result.forEach(function(row) { row.color = "red"; });';
    const violations = analyzeWidgetScript(script, 'chart');
    expect(violations.some((v) => v.rule === 'no-undefined-variable')).toBe(false);
  });

  it('does not flag arrow function parameters', () => {
    const script = 'var found = args.result.find(el => el.value > 0);';
    const violations = analyzeWidgetScript(script, 'chart');
    expect(violations.some((v) => v.rule === 'no-undefined-variable')).toBe(false);
  });

  it('does not flag implicit globals (assignment without declaration)', () => {
    const script = 'categories = ["A", "B"]; widget.title = categories[0];';
    const violations = analyzeWidgetScript(script, 'chart');
    expect(violations.some((v) => v.rule === 'no-undefined-variable')).toBe(false);
  });

  it('does not flag the identifier inside typeof (safe for undeclared vars)', () => {
    const script = 'if (typeof undeclaredCheck !== "undefined") { console.log("ok"); }';
    const violations = analyzeWidgetScript(script, 'chart');
    expect(violations.some((v) => v.rule === 'no-undefined-variable' && v.message.includes('"undeclaredCheck"'))).toBe(false);
  });

  it('does not flag property keys as undefined variables', () => {
    const script = 'var obj = { myKey: 1 }; console.log(obj.myProp);';
    const violations = analyzeWidgetScript(script, 'chart');
    expect(violations.some((v) => v.rule === 'no-undefined-variable' && v.message.includes('"myKey"'))).toBe(false);
    expect(violations.some((v) => v.rule === 'no-undefined-variable' && v.message.includes('"myProp"'))).toBe(false);
  });

  it('flags severity as error (variable used inside a callback that is never invoked at top level)', () => {
    // `breakby` is inside a callback — the runtime mock never calls it,
    // so only the static AST check catches it.
    const script = 'widget.on("processresult", function(se, ev) { breakby.indexOf("x"); });';
    const violations = analyzeWidgetScript(script, 'chart');
    const v = violations.find((v) => v.rule === 'no-undefined-variable');
    expect(v?.severity).toBe('error');
  });
});

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
  it('flags chart-specific args.result used in a pivot widget', () => {
    const script = 'args.result.forEach(function(r) { r.color = "red"; });';
    const violations = analyzeWidgetScript(script, 'pivot');
    expect(violations.some((v) => v.rule === 'no-wrong-widget-type')).toBe(true);
  });

  it('flags pivot-specific args.pivot used in a chart widget', () => {
    const script = 'console.log(args.pivot.rows);';
    const violations = analyzeWidgetScript(script, 'chart');
    expect(violations.some((v) => v.rule === 'no-wrong-widget-type')).toBe(true);
  });

  it('flags indicator-specific args.value used in a chart widget', () => {
    const script = 'var v = args.value;';
    const violations = analyzeWidgetScript(script, 'chart');
    expect(violations.some((v) => v.rule === 'no-wrong-widget-type')).toBe(true);
  });

  it('does not flag args.result in a chart widget', () => {
    const script = 'args.result.forEach(function(r) { r.color = "blue"; });';
    const violations = analyzeWidgetScript(script, 'chart');
    expect(violations.some((v) => v.rule === 'no-wrong-widget-type')).toBe(false);
  });

  it('does not flag generic code in an unknown widget type (e.g. blox)', () => {
    const script = 'widget.title = widget.title.toUpperCase();';
    const violations = analyzeWidgetScript(script, 'blox');
    expect(violations.some((v) => v.rule === 'no-wrong-widget-type')).toBe(false);
  });

  it('does not flag prism — it is a Sisense global available to all widget types', () => {
    const script = 'prism.setColor("red");';
    expect(analyzeWidgetScript(script, 'pivot').some((v) => v.rule === 'no-wrong-widget-type')).toBe(false);
    expect(analyzeWidgetScript(script, 'chart').some((v) => v.rule === 'no-wrong-widget-type')).toBe(false);
    expect(analyzeWidgetScript(script, 'blox').some((v) => v.rule === 'no-wrong-widget-type')).toBe(false);
  });

  it('does not flag $ (jQuery global bundled with Sisense)', () => {
    const script = '$("#widget").hide();';
    const violations = analyzeWidgetScript(script, 'chart');
    expect(violations.some((v) => v.rule === 'no-wrong-widget-type')).toBe(false);
  });

  it('does not treat $ as a runtime error', () => {
    const script = '$.ajax({ url: "/api" });';
    const violations = analyzeWidgetScript(script, 'pivot');
    expect(violations.some((v) => v.rule === 'syntax-error')).toBe(false);
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

describe('analyzeWidgetScript — no-metadata-override-in-script (widget.options writes)', () => {
  it('flags a direct widget.options property assignment', () => {
    const script = 'widget.options.drillTarget = null;';
    const violations = analyzeWidgetScript(script, 'chart');
    expect(violations.some((v) => v.rule === 'no-metadata-override-in-script')).toBe(true);
  });

  it('flags a nested widget.options chain assignment', () => {
    const script = 'widget.options.filters.panel = [];';
    const violations = analyzeWidgetScript(script, 'chart');
    expect(violations.some((v) => v.rule === 'no-metadata-override-in-script')).toBe(true);
  });

  it('does not flag reading widget.options', () => {
    const script = 'var target = widget.options.drillTarget;';
    const violations = analyzeWidgetScript(script, 'chart');
    expect(violations.some((v) => v.rule === 'no-metadata-override-in-script')).toBe(false);
  });

  it('flags widget.options write as a warning (not error)', () => {
    const script = 'widget.options.drillTarget = null;';
    const violations = analyzeWidgetScript(script, 'chart');
    const v = violations.find((v) => v.rule === 'no-metadata-override-in-script');
    expect(v?.severity).toBe('warning');
  });
});

describe('analyzeWidgetScript — no-unimpactful-code (discarded array-method results)', () => {
  it('flags a discarded .filter() result', () => {
    const script = 'args.result.filter(function(row) { return row.value > 0; });';
    const violations = analyzeWidgetScript(script, 'chart');
    expect(violations.some((v) => v.rule === 'no-unimpactful-code')).toBe(true);
  });

  it('flags a discarded .map() result on a real array', () => {
    const script = 'args.result.map(function(row) { return row.value; });';
    const violations = analyzeWidgetScript(script, 'chart');
    expect(violations.some((v) => v.rule === 'no-unimpactful-code')).toBe(true);
  });

  it('flags a discarded .find() result', () => {
    const script = 'args.result.find(function(row) { return row.value > 0; });';
    const violations = analyzeWidgetScript(script, 'chart');
    expect(violations.some((v) => v.rule === 'no-unimpactful-code')).toBe(true);
  });

  it('flags a discarded .reduce() result', () => {
    const script = 'args.result.reduce(function(acc, row) { return acc + row.value; }, 0);';
    const violations = analyzeWidgetScript(script, 'chart');
    expect(violations.some((v) => v.rule === 'no-unimpactful-code')).toBe(true);
  });

  it('flags a discarded .findIndex() result', () => {
    const script = 'args.result.findIndex(function(row) { return row.value > 100; });';
    const violations = analyzeWidgetScript(script, 'chart');
    expect(violations.some((v) => v.rule === 'no-unimpactful-code')).toBe(true);
  });

  it('does not flag .filter() when result is assigned', () => {
    const script = 'var filtered = args.result.filter(function(row) { return row.value > 0; });';
    const violations = analyzeWidgetScript(script, 'chart');
    expect(violations.some((v) => v.rule === 'no-unimpactful-code')).toBe(false);
  });

  it('does not flag .forEach() — side-effect only, no meaningful return value', () => {
    const script = 'args.result.forEach(function(row) { row.color = "red"; });';
    const violations = analyzeWidgetScript(script, 'chart');
    expect(violations.some((v) => v.rule === 'no-unimpactful-code')).toBe(false);
  });

  it('discarded result violations are warnings', () => {
    const script = 'args.result.filter(function(row) { return row.value > 0; });';
    const violations = analyzeWidgetScript(script, 'chart');
    const v = violations.find((v) => v.rule === 'no-unimpactful-code');
    expect(v?.severity).toBe('warning');
  });
});

describe('analyzeWidgetScript — no-wrong-widget-type (Highcharts in non-chart widgets)', () => {
  it('flags Highcharts API access in a pivot widget', () => {
    const script = 'var hc = Highcharts.chart("container", {});';
    const violations = analyzeWidgetScript(script, 'pivot');
    expect(violations.some((v) => v.rule === 'no-wrong-widget-type')).toBe(true);
  });

  it('flags Highcharts API access in an indicator widget', () => {
    const script = 'Highcharts.setOptions({ lang: { thousandsSep: "," } });';
    const violations = analyzeWidgetScript(script, 'indicator');
    expect(violations.some((v) => v.rule === 'no-wrong-widget-type')).toBe(true);
  });

  it('flags Highcharts API access in a richtext widget', () => {
    const script = 'var chart = new Highcharts.Chart({});';
    const violations = analyzeWidgetScript(script, 'richtext');
    expect(violations.some((v) => v.rule === 'no-wrong-widget-type')).toBe(true);
  });

  it('flags widget.getHighchartsChart() in a pivot widget', () => {
    const script = 'var hc = widget.getHighchartsChart();';
    const violations = analyzeWidgetScript(script, 'pivot');
    expect(violations.some((v) => v.rule === 'no-wrong-widget-type')).toBe(true);
  });

  it('flags widget.getHighchartsChart() in an indicator widget', () => {
    const script = 'widget.getHighchartsChart().series[0].update({});';
    const violations = analyzeWidgetScript(script, 'indicator');
    expect(violations.some((v) => v.rule === 'no-wrong-widget-type')).toBe(true);
  });

  it('does not flag Highcharts in a chart widget', () => {
    const script = 'var hc = widget.getHighchartsChart(); hc.reflow();';
    const violations = analyzeWidgetScript(script, 'chart');
    expect(violations.some((v) => v.rule === 'no-wrong-widget-type')).toBe(false);
  });

  it('does not flag Highcharts in an unknown widget type — be conservative', () => {
    const script = 'Highcharts.setOptions({});';
    const violations = analyzeWidgetScript(script, 'blox');
    expect(violations.some((v) => v.rule === 'no-wrong-widget-type')).toBe(false);
  });
});

describe('analyzeWidgetScript — no-unsafe-member-access (unguarded .find() result)', () => {
  it('flags property access on an unguarded _.find() result variable', () => {
    const script = [
      'var seriesToModify = _.find(ev.result.series, function(s) { return s.name === "A"; });',
      '_.each(seriesToModify.data, function(item) { item.y = 0; });',
    ].join('\n');
    const violations = analyzeWidgetScript(script, 'chart');
    expect(violations.some((v) => v.rule === 'no-unsafe-member-access')).toBe(true);
  });

  it('flags property access on an unguarded Array.prototype.find() result variable', () => {
    const script = [
      'var row = args.result.find(function(r) { return r.value > 100; });',
      'row.color = "red";',
    ].join('\n');
    const violations = analyzeWidgetScript(script, 'chart');
    expect(violations.some((v) => v.rule === 'no-unsafe-member-access')).toBe(true);
  });

  it('does not flag when the find result is guarded by an if statement', () => {
    const script = [
      'var seriesToModify = _.find(ev.result.series, function(s) { return s.name === "A"; });',
      'if (seriesToModify) { _.each(seriesToModify.data, function(item) { item.y = 0; }); }',
    ].join('\n');
    const violations = analyzeWidgetScript(script, 'chart');
    expect(violations.some((v) => v.rule === 'no-unsafe-member-access')).toBe(false);
  });

  it('does not flag when the find result is guarded by && (short-circuit)', () => {
    const script = [
      'var row = args.result.find(function(r) { return r.value > 100; });',
      'row && (row.color = "red");',
    ].join('\n');
    const violations = analyzeWidgetScript(script, 'chart');
    expect(violations.some((v) => v.rule === 'no-unsafe-member-access')).toBe(false);
  });

  it('does not flag .filter() — filter always returns an array, never undefined', () => {
    const script = [
      'var rows = args.result.filter(function(r) { return r.value > 0; });',
      'rows.forEach(function(r) { r.color = "blue"; });',
    ].join('\n');
    const violations = analyzeWidgetScript(script, 'chart');
    expect(violations.some((v) => v.rule === 'no-unsafe-member-access')).toBe(false);
  });

  it('flags with warning severity', () => {
    const script = [
      'var row = args.result.find(function(r) { return r.active; });',
      'row.color = "red";',
    ].join('\n');
    const violations = analyzeWidgetScript(script, 'chart');
    const v = violations.find((v) => v.rule === 'no-unsafe-member-access');
    expect(v?.severity).toBe('warning');
  });
});

describe('analyzeWidgetScript — no-wrong-widget-type (ev.result Highcharts config access)', () => {
  it('flags ev.result.yAxis in a chart widget', () => {
    const script = 'widget.on("processresult", function(se, ev) { ev.result.yAxis[0].reversed = true; });';
    const violations = analyzeWidgetScript(script, 'chart');
    expect(violations.some((v) => v.rule === 'no-wrong-widget-type')).toBe(true);
  });

  it('flags ev.result.xAxis in a chart widget', () => {
    const script = 'widget.on("processresult", function(se, ev) { ev.result.xAxis[0].categories = []; });';
    const violations = analyzeWidgetScript(script, 'chart');
    expect(violations.some((v) => v.rule === 'no-wrong-widget-type')).toBe(true);
  });

  it('flags ev.result.plotOptions in a chart widget', () => {
    const script = 'widget.on("processresult", function(se, ev) { ev.result.plotOptions.series.color = "red"; });';
    const violations = analyzeWidgetScript(script, 'chart');
    expect(violations.some((v) => v.rule === 'no-wrong-widget-type')).toBe(true);
  });

  it('does not flag ev.result.series — that is the valid data payload', () => {
    const script = 'widget.on("processresult", function(se, ev) { ev.result.series[0].data = []; });';
    const violations = analyzeWidgetScript(script, 'chart');
    expect(violations.some((v) => v.rule === 'no-wrong-widget-type')).toBe(false);
  });

  it('does not flag ev.result.yAxis in a non-chart widget (different context)', () => {
    const script = 'widget.on("processresult", function(se, ev) { ev.result.yAxis[0].reversed = true; });';
    const violations = analyzeWidgetScript(script, 'pivot');
    expect(violations.some((v) => v.rule === 'no-wrong-widget-type' && v.message.includes('yAxis'))).toBe(false);
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
