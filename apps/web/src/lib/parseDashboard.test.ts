import { describe, it, expect } from 'vitest';
import { parseDashboardJson, DashboardParseError } from './parseDashboard';

const MINIMAL_WIDGET = {
  oid: 'w1',
  title: 'My Widget',
  type: 'chart',
  script: 'args.result.forEach(function(r) { r.color = "red"; });',
};

const MINIMAL_DASHBOARD = {
  oid: 'd1',
  title: 'Sales Overview',
  script: 'dashboard.on("loaded", function() {});',
  widgets: [MINIMAL_WIDGET],
};

describe('parseDashboardJson — single dashboard', () => {
  it('parses a minimal dashboard object', () => {
    const [d] = parseDashboardJson(MINIMAL_DASHBOARD);
    expect(d.oid).toBe('d1');
    expect(d.title).toBe('Sales Overview');
    expect(d.script).toContain('dashboard.on');
    expect(d.widgets).toHaveLength(1);
  });

  it('parses widget fields correctly', () => {
    const [d] = parseDashboardJson(MINIMAL_DASHBOARD);
    const w = d.widgets![0]!;
    expect(w.oid).toBe('w1');
    expect(w.title).toBe('My Widget');
    expect(w.type).toBe('chart');
    expect(w.script).toBeTruthy();
  });

  it('accepts _id as a fallback identifier', () => {
    const raw = { _id: 'abc', title: 'Test', widgets: [{ _id: 'ww1', title: 'W', type: 'pivot' }] };
    const [d] = parseDashboardJson(raw);
    expect(d.oid).toBe('abc');
    expect(d.widgets![0]!.oid).toBe('ww1');
  });

  it('normalises compound widget types', () => {
    const raw = { oid: 'd', title: 'D', widgets: [{ oid: 'w', title: 'W', subtype: 'chart/column' }] };
    const [d] = parseDashboardJson(raw);
    expect(d.widgets![0]!.type).toBe('chart');
  });

  it('normalises pivot2 to pivot', () => {
    const raw = { oid: 'd', title: 'D', widgets: [{ oid: 'w', title: 'W', type: 'pivot2' }] };
    const [d] = parseDashboardJson(raw);
    expect(d.widgets![0]!.type).toBe('pivot');
  });

  it('uses name as title fallback', () => {
    const raw = { oid: 'd', name: 'Named Dashboard', widgets: [] };
    const [d] = parseDashboardJson(raw);
    expect(d.title).toBe('Named Dashboard');
  });

  it('returns undefined script for empty/whitespace script fields', () => {
    const raw = { oid: 'd', title: 'D', script: '   ', widgets: [] };
    const [d] = parseDashboardJson(raw);
    expect(d.script).toBeUndefined();
  });

  it('handles a dashboard with no widgets gracefully', () => {
    const raw = { oid: 'd', title: 'D' };
    const [d] = parseDashboardJson(raw);
    expect(d.widgets).toEqual([]);
  });

  it('generates an oid when none is provided', () => {
    const raw = { title: 'No ID' };
    const [d] = parseDashboardJson(raw);
    expect(d.oid).toBeTruthy();
  });
});

describe('parseDashboardJson — array of dashboards', () => {
  it('parses an array and returns multiple dashboards', () => {
    const raw = [
      { oid: 'd1', title: 'D1', widgets: [] },
      { oid: 'd2', title: 'D2', widgets: [] },
    ];
    const result = parseDashboardJson(raw);
    expect(result).toHaveLength(2);
    expect(result[0]!.oid).toBe('d1');
    expect(result[1]!.oid).toBe('d2');
  });
});

describe('parseDashboardJson — error handling', () => {
  it('throws DashboardParseError for primitive input', () => {
    expect(() => parseDashboardJson('not an object', 'test.dash')).toThrow(DashboardParseError);
    expect(() => parseDashboardJson(42, 'test.dash')).toThrow(DashboardParseError);
  });

  it('includes the filename in the error', () => {
    try {
      parseDashboardJson('bad', 'my-dashboard.dash');
    } catch (e) {
      expect(e).toBeInstanceOf(DashboardParseError);
      expect((e as DashboardParseError).filename).toBe('my-dashboard.dash');
      expect((e as DashboardParseError).message).toContain('my-dashboard.dash');
    }
  });
});
