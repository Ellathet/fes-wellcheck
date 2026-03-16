import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import MockAdapter from 'axios-mock-adapter';
import { createClient } from '../src/client.js';
import { getDashboards, getDashboard } from '../src/dashboards.js';
import { SisenseApiError, type Dashboard } from '../src/types.js';

const config = { baseUrl: 'https://sisense.example.com', token: 'test-token' };

const dashboardFixture: Dashboard = {
  oid: 'dash-1',
  title: 'Sales Overview',
};

const dashboardWithWidgetsFixture: Dashboard = {
  oid: 'dash-2',
  title: 'Marketing',
  widgets: [
    { oid: 'w-1', title: 'Revenue Chart', type: 'chart' },
    { oid: 'w-2', title: 'KPI', type: 'indicator', script: 'widget.title = "KPI";' },
  ],
};

describe('getDashboards', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter(createClient(config));
  });

  afterEach(() => {
    mock.restore();
  });

  it('returns a list of dashboards on success', async () => {
    const client = createClient(config);
    const adapter = new MockAdapter(client);
    adapter.onGet('/api/v1/dashboards').reply(200, [dashboardFixture, dashboardWithWidgetsFixture]);

    const result = await getDashboards(client);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(dashboardFixture);
    expect(result[1]).toEqual(dashboardWithWidgetsFixture);
  });

  it('returns an empty array when there are no dashboards', async () => {
    const client = createClient(config);
    const adapter = new MockAdapter(client);
    adapter.onGet('/api/v1/dashboards').reply(200, []);

    const result = await getDashboards(client);

    expect(result).toEqual([]);
  });

  it('throws SisenseApiError with status 401 on unauthorized', async () => {
    const client = createClient(config);
    const adapter = new MockAdapter(client);
    adapter.onGet('/api/v1/dashboards').reply(401, { message: 'Unauthorized' });

    await expect(getDashboards(client)).rejects.toThrow(SisenseApiError);
    await expect(getDashboards(client)).rejects.toMatchObject({
      status: 401,
      endpoint: '/api/v1/dashboards',
    });
  });

  it('throws SisenseApiError with status 0 on network error', async () => {
    const client = createClient(config);
    const adapter = new MockAdapter(client);
    adapter.onGet('/api/v1/dashboards').networkError();

    await expect(getDashboards(client)).rejects.toThrow(SisenseApiError);
    await expect(getDashboards(client)).rejects.toMatchObject({ status: 0 });
  });

  it('throws SisenseApiError with status 500 on server error', async () => {
    const client = createClient(config);
    const adapter = new MockAdapter(client);
    adapter.onGet('/api/v1/dashboards').reply(500);

    await expect(getDashboards(client)).rejects.toMatchObject({
      status: 500,
      endpoint: '/api/v1/dashboards',
    });
  });
});

describe('getDashboard', () => {
  it('returns a single dashboard by id', async () => {
    const client = createClient(config);
    const adapter = new MockAdapter(client);
    adapter.onGet('/api/v1/dashboards/dash-1').reply(200, dashboardFixture);

    const result = await getDashboard(client, 'dash-1');

    expect(result).toEqual(dashboardFixture);
  });

  it('includes widgets when the dashboard has them', async () => {
    const client = createClient(config);
    const adapter = new MockAdapter(client);
    adapter.onGet('/api/v1/dashboards/dash-2').reply(200, dashboardWithWidgetsFixture);

    const result = await getDashboard(client, 'dash-2');

    expect(result.widgets).toHaveLength(2);
    expect(result.widgets![0].type).toBe('chart');
  });

  it('throws SisenseApiError with status 404 when dashboard is not found', async () => {
    const client = createClient(config);
    const adapter = new MockAdapter(client);
    adapter.onGet('/api/v1/dashboards/missing').reply(404);

    await expect(getDashboard(client, 'missing')).rejects.toMatchObject({
      status: 404,
      endpoint: '/api/v1/dashboards/missing',
    });
  });

  it('throws SisenseApiError with the correct endpoint on server error', async () => {
    const client = createClient(config);
    const adapter = new MockAdapter(client);
    adapter.onGet('/api/v1/dashboards/dash-1').reply(503);

    await expect(getDashboard(client, 'dash-1')).rejects.toMatchObject({
      status: 503,
      endpoint: '/api/v1/dashboards/dash-1',
    });
  });

  it('throws SisenseApiError with status 0 on network error', async () => {
    const client = createClient(config);
    const adapter = new MockAdapter(client);
    adapter.onGet('/api/v1/dashboards/dash-1').networkError();

    await expect(getDashboard(client, 'dash-1')).rejects.toMatchObject({ status: 0 });
  });
});
