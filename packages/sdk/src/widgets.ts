import type { SisenseClient } from './client.js';
import { SisenseApiError, type Widget } from './types.js';

export async function getWidgets(client: SisenseClient, dashboardId: string): Promise<Widget[]> {
  try {
    const { data } = await client.get<Widget[]>(`/api/v1/dashboards/${dashboardId}/widgets`);
    return data;
  } catch (error) {
    throw new SisenseApiError(
      `Failed to fetch widgets for dashboard ${dashboardId}`,
      getStatus(error),
      `/api/v1/dashboards/${dashboardId}/widgets`,
    );
  }
}

export async function getWidget(
  client: SisenseClient,
  dashboardId: string,
  widgetId: string,
): Promise<Widget> {
  try {
    const { data } = await client.get<Widget>(
      `/api/v1/dashboards/${dashboardId}/widgets/${widgetId}`,
    );
    return data;
  } catch (error) {
    throw new SisenseApiError(
      `Failed to fetch widget ${widgetId}`,
      getStatus(error),
      `/api/v1/dashboards/${dashboardId}/widgets/${widgetId}`,
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
