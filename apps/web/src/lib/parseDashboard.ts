import type { Dashboard, Widget } from '@wellcheck/sdk';

// ─── Raw Sisense export shapes ────────────────────────────────────────────────
// Sisense exports dashboards as `.dash` files (JSON).  Field names vary
// slightly between versions, so we accept every known alias.

interface RawWidget {
  oid?: string;
  _id?: string;
  title?: string;
  name?: string;
  type?: string;
  subtype?: string;
  script?: string;
}

interface RawDashboard {
  oid?: string;
  _id?: string;
  title?: string;
  name?: string;
  script?: string;
  widgets?: RawWidget[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function widgetId(raw: RawWidget): string {
  return raw.oid ?? raw._id ?? crypto.randomUUID();
}

function dashboardId(raw: RawDashboard): string {
  return raw.oid ?? raw._id ?? crypto.randomUUID();
}

/**
 * Normalise a Sisense widget type string to the coarse type used by the
 * wellcheck rules.  Sisense often uses compound strings like "chart/column"
 * or "pivot2"; we map them to the canonical "chart", "pivot", "indicator",
 * etc. that our WIDGET_APIS table understands.
 */
function normaliseWidgetType(raw: string | undefined): string {
  if (!raw) return 'unknown';
  const lower = raw.toLowerCase();
  if (lower.startsWith('chart')) return 'chart';
  if (lower.includes('pivot')) return 'pivot';
  if (lower === 'indicator' || lower.startsWith('indicator')) return 'indicator';
  if (lower === 'tablewidget') return 'table';
  if (lower === 'richtext') return 'richtext';
  return lower;
}

function parseWidget(raw: RawWidget): Widget {
  return {
    oid: widgetId(raw),
    title: raw.title ?? raw.name ?? 'Untitled Widget',
    type: normaliseWidgetType(raw.subtype ?? raw.type),
    script: raw.script?.trim() || undefined,
  };
}

function parseSingleDashboard(raw: RawDashboard): Dashboard {
  return {
    oid: dashboardId(raw),
    title: raw.title ?? raw.name ?? 'Untitled Dashboard',
    script: raw.script?.trim() || undefined,
    widgets: (raw.widgets ?? []).map(parseWidget),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export class DashboardParseError extends Error {
  readonly filename: string;

  constructor(filename: string, message: string) {
    super(`${filename}: ${message}`);
    this.name = 'DashboardParseError';
    this.filename = filename;
  }
}

/**
 * Parse a raw JavaScript object (already JSON.parsed) into one or more
 * `Dashboard` objects.  A file may contain a single dashboard object or an
 * array of them.
 */
export function parseDashboardJson(raw: unknown, filename = 'file'): Dashboard[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => parseSingleDashboard(item as RawDashboard));
  }
  if (raw !== null && typeof raw === 'object') {
    return [parseSingleDashboard(raw as RawDashboard)];
  }
  throw new DashboardParseError(filename, 'Expected a JSON object or array');
}

/**
 * Read and parse a `File` (`.dash` or `.json`) into `Dashboard[]`.
 * Throws `DashboardParseError` when the file is not valid JSON or has an
 * unexpected shape.
 */
export async function parseDashboardFile(file: File): Promise<Dashboard[]> {
  let text: string;
  try {
    text = await file.text();
  } catch {
    throw new DashboardParseError(file.name, 'Could not read file');
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new DashboardParseError(file.name, 'File is not valid JSON');
  }

  return parseDashboardJson(raw, file.name);
}

/**
 * Parse multiple files in parallel and merge all resulting dashboards into a
 * single flat list.  If any file fails, its error is collected and returned
 * alongside successfully parsed dashboards so the user sees partial results.
 */
export async function parseDashboardFiles(
  files: File[],
): Promise<{ dashboards: Dashboard[]; errors: DashboardParseError[] }> {
  const settled = await Promise.allSettled(files.map(parseDashboardFile));

  const dashboards: Dashboard[] = [];
  const errors: DashboardParseError[] = [];

  for (const result of settled) {
    if (result.status === 'fulfilled') {
      dashboards.push(...result.value);
    } else {
      errors.push(
        result.reason instanceof DashboardParseError
          ? result.reason
          : new DashboardParseError('unknown', String(result.reason)),
      );
    }
  }

  return { dashboards, errors };
}
