import { describe, it, expect } from 'vitest';
import MockAdapter from 'axios-mock-adapter';
import { createClient } from '../src/client.js';
import { getWidgets, getWidget } from '../src/widgets.js';
import { SisenseApiError, type Widget } from '../src/types.js';

const config = { baseUrl: 'https://sisense.example.com', token: 'test-token' };

const chartWidget: Widget = {
  oid: 'w-1',
  title: 'Revenue Chart',
  type: 'chart',
};

const indicatorWidget: Widget = {
  oid: 'w-2',
  title: 'Total Sales',
  type: 'indicator',
  script: 'widget.title = "Total: " + context.value;',
};

const pivotWidget: Widget = {
  oid: 'w-3',
  title: 'Pivot Table',
  type: 'pivot',
};

describe('getWidgets', () => {
  it('returns all widgets for a given dashboard', async () => {
    const client = createClient(config);
    const adapter = new MockAdapter(client);
    adapter
      .onGet('/api/v1/dashboards/dash-1/widgets')
      .reply(200, [chartWidget, indicatorWidget, pivotWidget]);

    const result = await getWidgets(client, 'dash-1');

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual(chartWidget);
    expect(result[1]).toEqual(indicatorWidget);
    expect(result[2]).toEqual(pivotWidget);
  });

  it('returns an empty array when the dashboard has no widgets', async () => {
    const client = createClient(config);
    const adapter = new MockAdapter(client);
    adapter.onGet('/api/v1/dashboards/dash-empty/widgets').reply(200, []);

    const result = await getWidgets(client, 'dash-empty');

    expect(result).toEqual([]);
  });

  it('includes the script field when a widget has one', async () => {
    const client = createClient(config);
    const adapter = new MockAdapter(client);
    adapter.onGet('/api/v1/dashboards/dash-1/widgets').reply(200, [indicatorWidget]);

    const result = await getWidgets(client, 'dash-1');

    expect(result[0].script).toBe('widget.title = "Total: " + context.value;');
  });

  it('returns undefined script when a widget has no script', async () => {
    const client = createClient(config);
    const adapter = new MockAdapter(client);
    adapter.onGet('/api/v1/dashboards/dash-1/widgets').reply(200, [chartWidget]);

    const result = await getWidgets(client, 'dash-1');

    expect(result[0].script).toBeUndefined();
  });

  it('throws SisenseApiError with status 404 when dashboard is not found', async () => {
    const client = createClient(config);
    const adapter = new MockAdapter(client);
    adapter.onGet('/api/v1/dashboards/missing/widgets').reply(404);

    await expect(getWidgets(client, 'missing')).rejects.toMatchObject({
      status: 404,
      endpoint: '/api/v1/dashboards/missing/widgets',
    });
  });

  it('throws SisenseApiError with status 401 on unauthorized', async () => {
    const client = createClient(config);
    const adapter = new MockAdapter(client);
    adapter.onGet('/api/v1/dashboards/dash-1/widgets').reply(401);

    await expect(getWidgets(client, 'dash-1')).rejects.toMatchObject({
      status: 401,
      endpoint: '/api/v1/dashboards/dash-1/widgets',
    });
  });

  it('throws SisenseApiError with status 0 on network error', async () => {
    const client = createClient(config);
    const adapter = new MockAdapter(client);
    adapter.onGet('/api/v1/dashboards/dash-1/widgets').networkError();

    await expect(getWidgets(client, 'dash-1')).rejects.toMatchObject({ status: 0 });
  });
});

describe('getWidget', () => {
  it('returns a single widget by dashboard id and widget id', async () => {
    const client = createClient(config);
    const adapter = new MockAdapter(client);
    adapter.onGet('/api/v1/dashboards/dash-1/widgets/w-1').reply(200, chartWidget);

    const result = await getWidget(client, 'dash-1', 'w-1');

    expect(result).toEqual(chartWidget);
  });

  it('returns a widget that includes a script', async () => {
    const client = createClient(config);
    const adapter = new MockAdapter(client);
    adapter.onGet('/api/v1/dashboards/dash-1/widgets/w-2').reply(200, indicatorWidget);

    const result = await getWidget(client, 'dash-1', 'w-2');

    expect(result.script).toBe('widget.title = "Total: " + context.value;');
    expect(result.type).toBe('indicator');
  });

  it('throws SisenseApiError with status 404 when widget is not found', async () => {
    const client = createClient(config);
    const adapter = new MockAdapter(client);
    adapter.onGet('/api/v1/dashboards/dash-1/widgets/missing').reply(404);

    await expect(getWidget(client, 'dash-1', 'missing')).rejects.toMatchObject({
      status: 404,
      endpoint: '/api/v1/dashboards/dash-1/widgets/missing',
    });
  });

  it('throws SisenseApiError with correct endpoint when the dashboard is not found', async () => {
    const client = createClient(config);
    const adapter = new MockAdapter(client);
    adapter.onGet('/api/v1/dashboards/missing-dash/widgets/w-1').reply(404);

    await expect(getWidget(client, 'missing-dash', 'w-1')).rejects.toMatchObject({
      endpoint: '/api/v1/dashboards/missing-dash/widgets/w-1',
    });
  });

  it('throws SisenseApiError with status 0 on network error', async () => {
    const client = createClient(config);
    const adapter = new MockAdapter(client);
    adapter.onGet('/api/v1/dashboards/dash-1/widgets/w-1').networkError();

    await expect(getWidget(client, 'dash-1', 'w-1')).rejects.toMatchObject({ status: 0 });
  });
});
