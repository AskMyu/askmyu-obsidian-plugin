/**
 * The chart description (2026-10-28; CHART_CONTRACT_20261028) — the plugin's word-for-word copy of shared
 * `types/chartSpec.ts` (the plugin imports shared types only; `tests/internal/chartSpecParity.test.ts` holds the copy).
 * The reader that checks a chart against its type, the table a chart falls back to, a heatmap's grid and shading, a
 * box plot's scale, small-multiple panels. Pure; imports nothing.
 */

export type ChartType =
  | 'bar'
  | 'line'
  | 'area'
  | 'composed'
  | 'pie'
  | 'scatter'
  | 'radar'
  | 'radial_bar'
  | 'funnel'
  | 'treemap'
  | 'sankey'
  | 'heatmap'
  | 'box_plot';

export const CHART_TYPES: readonly ChartType[] = ['bar', 'line', 'area', 'composed', 'pie', 'scatter', 'radar', 'radial_bar', 'funnel', 'treemap', 'sankey', 'heatmap', 'box_plot'];

/** The types drawn from rows (`data` with `x_key` / `y_key` or `series`). */
const ROW_TYPES: ReadonlySet<string> = new Set(['bar', 'line', 'area', 'composed', 'pie', 'scatter', 'radar', 'radial_bar', 'funnel', 'treemap']);

export interface ChartSeries {
  key: string;
  label?: string;
  /** `composed`: how this series is drawn. */
  kind?: 'bar' | 'line' | 'area';
  /** Series with the same value stack. */
  stack?: string;
}

export interface ChartRange {
  low_key: string;
  high_key: string;
  label?: string;
}

export interface ChartReferenceLine {
  y?: number;
  x?: string | number;
  label?: string;
}

export interface ChartFacet {
  key: string;
  order?: string[];
  columns?: number;
}

export interface HeatmapCell {
  row: string;
  column: string;
  value: number | null;
  [field: string]: unknown;
}

export interface BoxPlotGroup {
  label: string;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  outliers?: number[];
  n?: number;
  [field: string]: unknown;
}

export interface ChartDescription {
  type: ChartType;
  data?: Array<Record<string, unknown>>;
  x_key?: string;
  y_key?: string;
  series?: ChartSeries[];
  stacked?: boolean;
  horizontal?: boolean;
  range?: ChartRange;
  reference_lines?: ChartReferenceLine[];
  x_label?: string;
  y_label?: string;
  unit?: string;
  y_scale?: 'linear' | 'log';
  facet?: ChartFacet;
  /** Never sent now; a stored chart's colour is ignored (the surfaces colour charts to their own look). */
  color?: string;
  donut?: boolean;
  max?: number;
  size_key?: string;
  label_key?: string;
  group_key?: string;
  cells?: HeatmapCell[];
  rows?: string[];
  columns?: string[];
  value_label?: string;
  diverging?: boolean;
  groups?: BoxPlotGroup[];
}

/** The limits a surface keeps to when the backend did not (a safety net; the backend enforces them before sending). */
export const CHART_LIMITS = { series: 6, rows: 500, pieSlices: 8, heatmapSide: 40, boxGroups: 12, panels: 12 } as const;

/** The surfaces' words around a chart; the chart's own words are the server's. */
export const CHART_WORDS = {
  other: 'Other',
  from: 'From',
  to: 'To',
  amount: 'Amount',
  lowest: 'Lowest',
  lowerQuarter: 'Lower quarter',
  middle: 'Middle',
  upperQuarter: 'Upper quarter',
  highest: 'Highest',
  count: 'Values',
  outliers: 'Far out',
  fewer: 'fewer',
  more: 'more',
  below: 'below',
  above: 'above',
} as const;

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const rowsOf = (v: unknown): Array<Record<string, unknown>> => (Array.isArray(v) ? v.filter(isObj) : []);

/** The numeric series a row-based chart draws: `series` as sent, else `y_key` alone. */
export function chartSeries(desc: Pick<ChartDescription, 'series' | 'y_key' | 'y_label'>): ChartSeries[] {
  const given = Array.isArray(desc.series) ? desc.series.filter((s) => isObj(s) && !!str(s.key)) : [];
  if (given.length) return given.slice(0, CHART_LIMITS.series).map((s) => ({ ...s, key: str(s.key), label: str(s.label) || str(s.key) }));
  const y = str(desc.y_key);
  return y ? [{ key: y, label: str(desc.y_label) || y }] : [];
}

/** Whether a sankey's flows go round in a circle (a flow chart cannot draw one). */
function hasCycle(links: Array<{ from: string; to: string }>): boolean {
  const next = new Map<string, string[]>();
  for (const l of links) next.set(l.from, [...(next.get(l.from) ?? []), l.to]);
  const state = new Map<string, 1 | 2>();
  const visit = (n: string): boolean => {
    if (state.get(n) === 1) return true;
    if (state.get(n) === 2) return false;
    state.set(n, 1);
    for (const m of next.get(n) ?? []) if (visit(m)) return true;
    state.set(n, 2);
    return false;
  };
  return [...next.keys()].some((n) => visit(n));
}

/**
 * The description, checked against its type: the fields the type needs, numbers where numbers go. Null when it
 * cannot be drawn (an unknown type, nothing to draw, a shape that does not fit); the surface then shows the words and
 * the table. A legacy description (no `series`) keeps today's reading: any other numeric field on the rows of a bar
 * or line chart is one more series.
 */
export function readChart(raw: unknown): ChartDescription | null {
  if (!isObj(raw)) return null;
  const type = str(raw.type) as ChartType;
  if (!CHART_TYPES.includes(type)) return null;
  const desc = { ...raw, type } as ChartDescription;
  if (ROW_TYPES.has(type)) {
    const data = rowsOf(raw.data).slice(0, CHART_LIMITS.rows);
    const x = str(raw.x_key);
    if (!data.length || !x || !data.some((r) => r[x] !== undefined && r[x] !== null)) return null;
    let series = chartSeries(desc);
    if (!Array.isArray(raw.series) && (type === 'bar' || type === 'line') && !raw.range && !raw.facet) {
      // Today's reading of a legacy chart: the other numeric fields are series too.
      const extra = Object.keys(data[0]).filter((k) => k !== x && k !== str(raw.y_key) && typeof data[0][k] === 'number');
      series = [...series, ...extra.map((k) => ({ key: k, label: k }))].slice(0, CHART_LIMITS.series);
    }
    const range = isObj(raw.range) && str(raw.range.low_key) && str(raw.range.high_key) ? (raw.range as unknown as ChartRange) : undefined;
    if (!series.length && !range) return null;
    const numeric = (k: string) => data.some((r) => num(r[k]) !== null);
    if (series.some((s) => !numeric(s.key))) return null;
    if (range && (!numeric(range.low_key) || !numeric(range.high_key))) return null;
    if (type === 'scatter' && !data.some((r) => num(r[x]) !== null)) return null;
    if (type === 'composed' && !Array.isArray(raw.series)) return null;
    const out: ChartDescription = { ...desc, data, x_key: x, series, range };
    if (out.y_scale === 'log' && series.some((s) => data.some((r) => (num(r[s.key]) ?? 1) <= 0))) out.y_scale = 'linear';
    if (type === 'pie') out.data = pieSlices(data, x, series[0].key);
    return out;
  }
  if (type === 'sankey') {
    const data = rowsOf(raw.data)
      .map((r) => ({ ...r, from: str(r.from), to: str(r.to), value: num(r.value) ?? 0 }))
      .filter((r) => r.from && r.to && r.from !== r.to && r.value > 0)
      .slice(0, CHART_LIMITS.rows);
    if (!data.length || hasCycle(data)) return null;
    return { ...desc, data };
  }
  if (type === 'heatmap') {
    const cells = rowsOf(raw.cells)
      .map((c) => ({ ...c, row: str(c.row), column: str(c.column), value: num(c.value) }))
      .filter((c) => c.row && c.column);
    if (!cells.length || !cells.some((c) => c.value !== null)) return null;
    return { ...desc, cells };
  }
  // box_plot
  const groups = rowsOf(raw.groups)
    .map((g) => ({ ...g, label: str(g.label), min: num(g.min), q1: num(g.q1), median: num(g.median), q3: num(g.q3), max: num(g.max) }))
    .filter((g): g is BoxPlotGroup => !!g.label && [g.min, g.q1, g.median, g.q3, g.max].every((v) => v !== null) && g.min! <= g.q1! && g.q1! <= g.median! && g.median! <= g.q3! && g.q3! <= g.max!)
    .map((g) => ({ ...g, outliers: Array.isArray(g.outliers) ? (g.outliers as unknown[]).map(num).filter((v): v is number => v !== null) : undefined }))
    .slice(0, CHART_LIMITS.boxGroups);
  if (!groups.length) return null;
  return { ...desc, groups };
}

/** At most 8 slices: the 7 largest and the rest summed as "Other" (the backend does this; a safety net here). */
function pieSlices(data: Array<Record<string, unknown>>, x: string, y: string): Array<Record<string, unknown>> {
  if (data.length <= CHART_LIMITS.pieSlices) return data;
  const sorted = [...data].sort((a, b) => (num(b[y]) ?? 0) - (num(a[y]) ?? 0));
  const rest = sorted.slice(CHART_LIMITS.pieSlices - 1).reduce((s, r) => s + (num(r[y]) ?? 0), 0);
  return [...sorted.slice(0, CHART_LIMITS.pieSlices - 1), { [x]: CHART_WORDS.other, [y]: rest }];
}

/** A value as the surfaces show it: up to two decimals, no trailing zeros, the unit after it when there is one. */
export function chartValue(v: unknown, unit?: string): string {
  const n = num(v);
  if (n === null) return v === null || v === undefined ? '' : String(v);
  const s = Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
  const u = str(unit);
  return u ? (u === '%' ? `${s}%` : `${s} ${u}`) : s;
}

/** A field name as a column heading: "hours_in_meetings" → "Hours in meetings". */
export function chartHeading(key: string): string {
  const s = key.replace(/_/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/**
 * The table a chart falls back to, on any surface: the rows (the category first, then every other field in the order
 * it first appears; a series' own label as its heading), a heatmap's grid, a box plot's five numbers per group, a
 * flow's from / to / amount. Reads what it can of a description it could not draw (an unknown type still has rows).
 */
export function chartTable(raw: unknown): { columns: string[]; rows: string[][] } {
  const empty = { columns: [], rows: [] };
  if (!isObj(raw)) return empty;
  const type = str(raw.type);
  const unit = str(raw.unit);
  if (type === 'heatmap' || (!Array.isArray(raw.data) && Array.isArray(raw.cells))) {
    const grid = heatmapGrid(raw);
    if (!grid.rows.length) return empty;
    return { columns: ['', ...grid.columns], rows: grid.rows.map((r) => [r, ...grid.columns.map((c) => chartValue(grid.value(r, c), unit))]) };
  }
  if (type === 'box_plot' || (!Array.isArray(raw.data) && Array.isArray(raw.groups))) {
    const groups = rowsOf(raw.groups);
    if (!groups.length) return empty;
    const withN = groups.some((g) => num(g.n) !== null);
    const withOut = groups.some((g) => Array.isArray(g.outliers) && g.outliers.length);
    return {
      columns: ['', CHART_WORDS.lowest, CHART_WORDS.lowerQuarter, CHART_WORDS.middle, CHART_WORDS.upperQuarter, CHART_WORDS.highest, ...(withOut ? [CHART_WORDS.outliers] : []), ...(withN ? [CHART_WORDS.count] : [])],
      rows: groups.map((g) => [
        str(g.label),
        ...['min', 'q1', 'median', 'q3', 'max'].map((k) => chartValue(g[k], unit)),
        ...(withOut ? [Array.isArray(g.outliers) ? (g.outliers as unknown[]).map((o) => chartValue(o, unit)).join(', ') : ''] : []),
        ...(withN ? [chartValue(g.n)] : []),
      ]),
    };
  }
  const data = rowsOf(raw.data).slice(0, CHART_LIMITS.rows);
  if (!data.length) return empty;
  if (type === 'sankey') {
    return { columns: [CHART_WORDS.from, CHART_WORDS.to, str(raw.value_label) ? chartHeading(str(raw.value_label)) : CHART_WORDS.amount], rows: data.map((r) => [str(r.from), str(r.to), chartValue(r.value, unit)]) };
  }
  const x = str(raw.x_key);
  const keys: string[] = [];
  for (const r of data) for (const k of Object.keys(r)) if (!keys.includes(k)) keys.push(k);
  const ordered = x && keys.includes(x) ? [x, ...keys.filter((k) => k !== x)] : keys;
  const labels = new Map<string, string>();
  if (Array.isArray(raw.series)) for (const s of raw.series) if (isObj(s) && str(s.key) && str(s.label)) labels.set(str(s.key), str(s.label));
  const heading = (k: string) => labels.get(k) ?? (k === x && str(raw.x_label) ? str(raw.x_label) : k === str(raw.y_key) && str(raw.y_label) ? str(raw.y_label) : chartHeading(k));
  return { columns: ordered.map(heading), rows: data.map((r) => ordered.map((k) => chartValue(r[k], typeof r[k] === 'number' ? unit : undefined))) };
}

/**
 * A heatmap's grid: its rows and columns in the order given (else the order the cells arrive in), each square's value
 * (undefined where there is no cell, null where the cell has no value), and the lowest and highest values.
 */
export function heatmapGrid(raw: unknown): { rows: string[]; columns: string[]; value: (row: string, column: string) => number | null | undefined; min: number; max: number } {
  const cells = isObj(raw) ? rowsOf(raw.cells) : [];
  const seen = (pick: (c: Record<string, unknown>) => string) => {
    const out: string[] = [];
    for (const c of cells) {
      const v = pick(c);
      if (v && !out.includes(v)) out.push(v);
    }
    return out;
  };
  const given = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
  const rowsGiven = isObj(raw) ? given(raw.rows) : [];
  const colsGiven = isObj(raw) ? given(raw.columns) : [];
  const rows = (rowsGiven.length ? rowsGiven : seen((c) => str(c.row))).slice(0, CHART_LIMITS.heatmapSide);
  const columns = (colsGiven.length ? colsGiven : seen((c) => str(c.column))).slice(0, CHART_LIMITS.heatmapSide);
  const at = new Map<string, number | null>();
  for (const c of cells) at.set(`${str(c.row)}\u0000${str(c.column)}`, num(c.value));
  const values = [...at.values()].filter((v): v is number => v !== null);
  return {
    rows,
    columns,
    value: (r, c) => (at.has(`${r}\u0000${c}`) ? at.get(`${r}\u0000${c}`)! : undefined),
    min: values.length ? Math.min(...values) : 0,
    max: values.length ? Math.max(...values) : 0,
  };
}

/**
 * How strongly a heatmap square is shaded, 0 to 1, and to which side: one colour from the lowest value to the highest,
 * or (diverging) two colours meeting at zero, each as strong as its distance from zero allows.
 */
export function heatmapShade(value: number, min: number, max: number, diverging = false): { strength: number; side: 'low' | 'high' } {
  if (diverging) {
    const reach = Math.max(Math.abs(min), Math.abs(max)) || 1;
    return { strength: Math.min(1, Math.abs(value) / reach), side: value < 0 ? 'low' : 'high' };
  }
  const span = max - min;
  return { strength: span > 0 ? (value - min) / span : 1, side: 'high' };
}

/** A box plot's scale: from the lowest value (an outlier included) to the highest. */
export function boxPlotDomain(groups: readonly BoxPlotGroup[]): [number, number] {
  const all = groups.flatMap((g) => [g.min, g.max, ...(g.outliers ?? [])]).filter((v) => Number.isFinite(v));
  if (!all.length) return [0, 1];
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  return lo === hi ? [lo - 1, hi + 1] : [lo, hi];
}

/** The numbers a row-based chart draws on its value axis, stacked series summed per row. */
function rowValues(desc: ChartDescription): number[] {
  const data = desc.data ?? [];
  const series = desc.series ?? chartSeries(desc);
  const out: number[] = [];
  for (const r of data) {
    const stacks = new Map<string, number>();
    for (const s of series) {
      const v = num(r[s.key]);
      if (v === null) continue;
      const stack = s.stack ?? (desc.stacked ? 'all' : null);
      if (stack !== null) stacks.set(stack, (stacks.get(stack) ?? 0) + v);
      else out.push(v);
    }
    out.push(...stacks.values());
    if (desc.range) for (const k of [desc.range.low_key, desc.range.high_key]) if (num(r[k]) !== null) out.push(num(r[k])!);
  }
  for (const l of desc.reference_lines ?? []) if (num(l.y) !== null) out.push(l.y!);
  return out;
}

/**
 * Small multiples: one panel per value of the facet's key (its `order`, else first appearance; at most 12), each the
 * same chart over its own part of the data, with one scale shared by all (`domain`: the value axis of a row-based
 * chart, a heatmap's shading, a box plot's axis) so the panels compare at a glance.
 */
export function facetPanels(desc: ChartDescription): { panels: Array<{ label: string; desc: ChartDescription }>; domain: [number, number] | null } {
  const key = str(desc.facet?.key);
  const items: Array<Record<string, unknown>> = desc.type === 'heatmap' ? (desc.cells ?? []) : desc.type === 'box_plot' ? (desc.groups ?? []) : (desc.data ?? []);
  if (!key) return { panels: [{ label: '', desc }], domain: null };
  const seen: string[] = [];
  for (const it of items) {
    const v = it[key] === undefined || it[key] === null ? '' : String(it[key]);
    if (v && !seen.includes(v)) seen.push(v);
  }
  const order = (desc.facet?.order ?? []).map(str).filter((v) => seen.includes(v));
  const labels = [...order, ...seen.filter((v) => !order.includes(v))].slice(0, CHART_LIMITS.panels);
  const rest: ChartDescription = { ...desc };
  delete rest.facet;
  const part = (label: string) => items.filter((it) => String(it[key] ?? '') === label);
  const panels = labels.map((label): { label: string; desc: ChartDescription } => ({
    label,
    desc: { ...rest, ...(desc.type === 'heatmap' ? { cells: part(label) as HeatmapCell[] } : desc.type === 'box_plot' ? { groups: part(label) as BoxPlotGroup[] } : { data: part(label) }) },
  }));
  let domain: [number, number] | null = null;
  if (desc.type === 'heatmap') {
    // Every cell of every panel: two panels' squares share a row and a column.
    const values = (desc.cells ?? []).map((c) => num(c.value)).filter((v): v is number => v !== null);
    if (values.length) domain = [Math.min(...values), Math.max(...values)];
  } else if (desc.type === 'box_plot') {
    domain = boxPlotDomain(desc.groups ?? []);
  } else if (ROW_TYPES.has(desc.type) && desc.type !== 'pie' && desc.type !== 'treemap' && desc.type !== 'funnel') {
    const values = rowValues(desc);
    if (values.length) domain = [Math.min(0, ...values), Math.max(...values)];
  }
  return { panels, domain };
}
