import type { SisenseClient } from './client.js';
import { SisenseApiError, type Dashboard } from './types.js';

export async function getDashboards(client: SisenseClient): Promise<Dashboard[]> {
  try {
    const { data } = await client.get<Dashboard[]>('/api/v1/dashboards');
    return data;
  } catch (error) {
    throw new SisenseApiError(
      'Failed to fetch dashboards',
      getStatus(error),
      '/api/v1/dashboards',
    );
  }
}

export async function getDashboard(client: SisenseClient, id: string): Promise<Dashboard> {
  try {
    const { data } = await client.get<Dashboard>(`/api/v1/dashboards/${id}`);
    return data;
  } catch (error) {
    throw new SisenseApiError(
      `Failed to fetch dashboard ${id}`,
      getStatus(error),
      `/api/v1/dashboards/${id}`,
    );
  }
}

function getStatus(error: unknown): number {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof (error as { response?: { status?: number } }).response?.status === 'number'
  ) {
    return (error as { response: { status: number } }).response.status;
  }
  return 0;
}
