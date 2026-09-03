/**
 * CanvasExporter (P5.5) — a Myu composition, saved as an Obsidian `.canvas`.
 *
 * Lives in the `vault/` module because it WRITES (invariant 3: write capability
 * stays here, never in a view), and every write is opt-in behind an exposure
 * modal: a canvas file syncs wherever the vault syncs, permanently outside our
 * reach — the same R2 calculus as the weekly review, said before the write.
 *
 * Mapping, honest about its own limits:
 *   text-shaped components  → text nodes (verbatim)
 *   person components       → FILE nodes pointing at the matching People/ page
 *                             when the index resolves one — their note becomes
 *                             part of the canvas — else a text node
 *   containers              → canvas groups around their children
 *   charts (recharts bar/line/area) → a STATIC SVG SNAPSHOT written into
 *                             assets/ and file-noded — labeled as a snapshot,
 *                             dated, so it never pretends to be live; the
 *                             open-live link stays for everything else
 *   interactive/vega/unknown → one text summary + an `open live → web` link
 *
 * Layout is a deterministic column flow — canvas nodes need x/y and this is a
 * materialization, not a design tool. No cleverness.
 *
 * Every export writes a sibling `.md` stub with `myu-generated: true`
 * frontmatter: `.canvas` files can't carry frontmatter, and the stub is the
 * purge handle — "find everything Myu ever wrote" must stay one search.
 */

import { normalizePath, TFile, type App } from 'obsidian';
import type { CompositionComponentLite, CompositionSpecLite } from '../wire';
import { buildCompositionMarkdown, componentMarkdown } from './myuFiles';

// Obsidian's .canvas JSON (JSONCanvas 1.0 subset).
type CanvasNode = {
  id: string;
  type: 'text' | 'file' | 'link' | 'group';
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  file?: string;
  url?: string;
  label?: string;
};

/**
 * A node as it exists ON DISK, which is a superset of what we emit: JSON Canvas
 * is an open spec that keeps growing, and Obsidian writes fields we never
 * produce — `color`, `styleAttributes` (1.9+), and whatever lands next. We do
 * not model them; we must not destroy them. See CONTENT_KEYS / mergeCanvas.
 *
 * Deliberately NOT an index signature on CanvasNode itself: `Omit<CanvasNode,
 * 'x' | 'y'>` in the builder would collapse every declared field into it and
 * the layout code would lose its types.
 */
type StoredCanvasNode = CanvasNode & Record<string, unknown>;

/**
 * The only keys `toNode` ever emits as CONTENT. Everything else on a node —
 * geometry, colour, style, spec fields added after this was written — belongs
 * to the user and to Obsidian.
 *
 * Kept as an explicit list because the merge is a subtraction: preserving the
 * user's node and removing exactly our keys is safe as the spec grows;
 * rebuilding from ours and re-adding the few we happen to know is not.
 */
const CONTENT_KEYS = ['type', 'text', 'file', 'url', 'label'] as const;

const COLUMN_WIDTH = 360;
const GUTTER = 40;
const COLUMNS = 3;

/**
 * Merge fresh server content into a canvas the user has been living in.
 *
 * **Content is ours; layout, edges and anything we cannot prove is ours are
 * theirs.** Concretely:
 *  · a node still in the composition keeps ITS position and size and takes
 *    OUR new text — geometry is the user's, wording is the server's;
 *  · every edge survives. We generate none (`edges: []`), so every arrow on
 *    the board was drawn by hand, and hand-drawn arrows are the most
 *    expensive thing on a canvas to lose;
 *  · **every node not in the fresh composition is KEPT.**
 *
 * That last rule is deliberately conservative, and it is worth being honest
 * about the cost. A node absent from the fresh spec is either one of ours the
 * server has dropped, or one the user added — and nothing in the file tells
 * the two apart, because JSON Canvas has no authorship field and adding a
 * custom key risks Obsidian stripping it on save. So we do not guess. The
 * asymmetry decides it: deleting something the user made is unrecoverable,
 * while a stale Myu node is visible, obvious and one keystroke to remove.
 * Same reasoning as edit-hold — when in doubt, keep.
 */
export function mergeCanvas(
  existingJson: string,
  fresh: { nodes: CanvasNode[]; edges: never[] },
): { nodes: StoredCanvasNode[]; edges: unknown[] } {
  let existing: { nodes?: StoredCanvasNode[]; edges?: unknown[] };
  try {
    existing = JSON.parse(existingJson) as { nodes?: StoredCanvasNode[]; edges?: unknown[] };
  } catch {
    // Unparseable — hand-edited into invalid JSON, or truncated mid-sync.
    // Merging into nonsense would be worse than starting clean, and the
    // caller writes the result rather than deleting anything.
    return { nodes: fresh.nodes, edges: [] };
  }

  const previous = Array.isArray(existing.nodes) ? existing.nodes : [];
  const byId = new Map(previous.map((node) => [node.id, node]));
  const freshIds = new Set(fresh.nodes.map((node) => node.id));

  const merged: StoredCanvasNode[] = fresh.nodes.map((node) => {
    const before = byId.get(node.id);
    if (!before) return node;
    // START FROM THEIRS, then overlay only what is ours.
    //
    // The reverse — start from fresh, copy back the four geometry fields — is
    // what this did first, and it silently deleted every `color`, every
    // `styleAttributes`, and every JSON Canvas field invented after the day it
    // was written, on every single re-export. A user who colour-codes their
    // canvas would watch it go grey each time the composition refreshed.
    //
    // Subtracting our keys keeps the merge correct as the spec grows: a field
    // we have never heard of is, by construction, not ours.
    const kept: Record<string, unknown> = { ...before };
    for (const key of CONTENT_KEYS) delete kept[key];
    const ours: Record<string, unknown> = {};
    for (const key of CONTENT_KEYS) {
      const value = (node as unknown as Record<string, unknown>)[key];
      if (value !== undefined) ours[key] = value;
    }
    return { ...kept, ...ours } as unknown as StoredCanvasNode;
  });

  for (const node of previous) {
    if (!freshIds.has(node.id)) merged.push(node);
  }

  return { nodes: merged, edges: Array.isArray(existing.edges) ? existing.edges : [] };
}

export interface CanvasExport {
  canvas: { nodes: CanvasNode[]; edges: never[] };
  /** Person pages the export linked to — listed in the stub for provenance. */
  linkedPages: string[];
}

/**
 * Pure builder — exported for the acceptance tests, because "deterministic
 * layout, groups wrap their children, unknown types degrade to a link" are
 * properties provable without a vault.
 */
export function buildCanvas(
  spec: CompositionSpecLite,
  resolvePersonPath: (name: string) => string | null,
  webUrl: string,
  chartAssetPath?: (componentId: string) => string | null,
): CanvasExport {
  const nodes: CanvasNode[] = [];
  const linkedPages: string[] = [];
  const positioned = new Map<string, CanvasNode>();

  const containers = spec.components.filter((c) => c.type === 'container');
  const childIds = new Set(
    containers.flatMap((c) => (Array.isArray(c.data?.child_ids) ? (c.data?.child_ids as string[]) : [])),
  );

  // Flow order: grouped children render consecutively (so their group's box is
  // one rectangle), then the ungrouped rest, in spec order throughout.
  const flowOrder: CompositionComponentLite[] = [];
  for (const container of containers) {
    for (const id of (container.data?.child_ids as string[] | undefined) ?? []) {
      const child = spec.components.find((c) => c.id === id);
      if (child && child.type !== 'container') flowOrder.push(child);
    }
  }
  for (const component of spec.components) {
    if (component.type === 'container' || childIds.has(component.id)) continue;
    flowOrder.push(component);
  }

  let column = 0;
  const columnBottoms = Array.from({ length: COLUMNS }, () => 0);

  const place = (node: Omit<CanvasNode, 'x' | 'y'>): CanvasNode => {
    const x = column * (COLUMN_WIDTH + GUTTER);
    const y = columnBottoms[column];
    columnBottoms[column] += node.height + GUTTER;
    column = (column + 1) % COLUMNS;
    const placed = { ...node, x, y };
    nodes.push(placed);
    return placed;
  };

  for (const component of flowOrder) {
    const node = toNode(component, resolvePersonPath, webUrl, chartAssetPath);
    if (node.type === 'file' && node.file) linkedPages.push(node.file);
    positioned.set(component.id, place(node));
  }

  // Groups: a bounding box around wherever their children landed. Children of
  // a container flowed consecutively, so the box is tight in practice.
  for (const container of containers) {
    const children = ((container.data?.child_ids as string[] | undefined) ?? [])
      .map((id) => positioned.get(id))
      .filter((n): n is CanvasNode => !!n);
    if (children.length === 0) continue;

    const minX = Math.min(...children.map((n) => n.x));
    const minY = Math.min(...children.map((n) => n.y));
    const maxX = Math.max(...children.map((n) => n.x + n.width));
    const maxY = Math.max(...children.map((n) => n.y + n.height));
    const pad = 20;
    nodes.push({
      id: `group-${container.id}`,
      type: 'group',
      x: minX - pad,
      y: minY - pad,
      width: maxX - minX + pad * 2,
      height: maxY - minY + pad * 2,
      label: container.label ?? (typeof container.data?.label === 'string' ? (container.data.label) : undefined),
    });
  }

  return { canvas: { nodes, edges: [] }, linkedPages };
}

function toNode(
  component: CompositionComponentLite,
  resolvePersonPath: (name: string) => string | null,
  webUrl: string,
  chartAssetPath?: (componentId: string) => string | null,
): Omit<CanvasNode, 'x' | 'y'> {
  const data = component.data ?? {};

  // Chart with a written SVG snapshot → file node. The writer decided whether
  // this chart's data was renderable; a missing path falls through to the
  // honest open-live link below.
  if (component.type === 'chart') {
    const assetPath = chartAssetPath?.(component.id) ?? null;
    if (assetPath) {
      return { id: component.id, type: 'file', file: assetPath, width: COLUMN_WIDTH, height: 220 };
    }
  }

  // Person → the user's own page for that person, when they keep one.
  if (component.type === 'person_card' || component.type === 'person') {
    const name =
      (typeof data.name === 'string' && data.name) ||
      (typeof data.display_name === 'string' && data.display_name) ||
      component.label ||
      '';
    const path = name ? resolvePersonPath(name) : null;
    if (path) {
      return { id: component.id, type: 'file', file: path, width: COLUMN_WIDTH, height: 120 };
    }
    return { id: component.id, type: 'text', text: name || 'Person', width: COLUMN_WIDTH, height: 80 };
  }

  // Text-shaped: anything carrying renderable text.
  const text =
    (typeof data.text === 'string' && data.text) ||
    (typeof data.content === 'string' && data.content) ||
    (typeof data.summary === 'string' && data.summary) ||
    null;
  if (text) {
    return { id: component.id, type: 'text', text, width: COLUMN_WIDTH, height: estimateHeight(text) };
  }

  // Anything unrecognised: render its DATA, in the node, using the same floor
  // the reading pane uses. This used to be a link out to the web app — a
  // browser exit baked into the user's canvas, against the modality's
  // north-star metric. A card the reader can actually read beats a card that
  // tells them to go somewhere else, and `webUrl` stays available on the
  // composition's stub note for anyone who does want the live version.
  const generic = componentMarkdown(component, 3).trim();
  if (generic) {
    return { id: component.id, type: 'text', text: generic, width: COLUMN_WIDTH, height: estimateHeight(generic) };
  }

  // Genuinely empty — no data at all. Name it and take up no room.
  const label = component.label ?? component.type.replace(/_/g, ' ');
  return { id: component.id, type: 'text', text: `**${label}**`, width: COLUMN_WIDTH, height: 60 };
}

/**
 * A recharts config → static SVG snapshot. Pure, deterministic, exported for
 * tests. Renders bar / line / area with numeric y-values; anything else
 * (pie, vega-lite, malformed rows) returns null and the caller keeps the
 * honest open-live link. Labeled a snapshot with its date IN the image, so a
 * canvas found in six months can't be mistaken for live data.
 */
export interface RechartsConfigLite {
  type?: string;
  data?: Array<Record<string, unknown>>;
  x_key?: string;
  y_key?: string;
  color?: string;
}

export function chartToSvg(
  title: string,
  config: RechartsConfigLite | undefined,
  snapshotDate: string,
): string | null {
  if (!config || !Array.isArray(config.data) || config.data.length === 0) return null;
  const kind = config.type;
  if (kind !== 'bar' && kind !== 'line' && kind !== 'area') return null;
  const yKey = config.y_key ?? '';
  const xKey = config.x_key ?? '';
  const values = config.data.map((row) => Number(row[yKey]));
  if (values.some((v) => !Number.isFinite(v))) return null;

  const W = 360;
  const H = 220;
  const PAD = { top: 34, right: 12, bottom: 26, left: 12 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const yFor = (v: number) => PAD.top + plotH - ((v - min) / span) * plotH;
  const color = typeof config.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(config.color)
    ? config.color
    : 'var(--color-accent, #b8860b)';

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="sans-serif">`,
    `<text x="${PAD.left}" y="18" font-size="13" fill="currentColor">${escapeXml(title)}</text>`,
    `<text x="${W - PAD.right}" y="18" font-size="9" fill="currentColor" opacity="0.55" text-anchor="end">snapshot · ${escapeXml(snapshotDate)}</text>`,
    `<line x1="${PAD.left}" y1="${yFor(Math.max(min, 0))}" x2="${W - PAD.right}" y2="${yFor(Math.max(min, 0))}" stroke="currentColor" opacity="0.25"/>`,
  ];

  if (kind === 'bar') {
    const step = plotW / values.length;
    const barW = Math.max(4, step * 0.6);
    values.forEach((v, i) => {
      const x = PAD.left + i * step + (step - barW) / 2;
      const y0 = yFor(Math.max(v, 0));
      const y1 = yFor(Math.min(v, 0));
      parts.push(`<rect x="${x.toFixed(1)}" y="${y0.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(1, y1 - y0).toFixed(1)}" fill="${color}"/>`);
    });
  } else {
    const step = values.length > 1 ? plotW / (values.length - 1) : 0;
    const points = values.map((v, i) => `${(PAD.left + i * step).toFixed(1)},${yFor(v).toFixed(1)}`);
    if (kind === 'area') {
      const base = yFor(Math.max(min, 0)).toFixed(1);
      parts.push(`<polygon points="${PAD.left},${base} ${points.join(' ')} ${(PAD.left + (values.length - 1) * step).toFixed(1)},${base}" fill="${color}" opacity="0.25"/>`);
    }
    parts.push(`<polyline points="${points.join(' ')}" fill="none" stroke="${color}" stroke-width="2"/>`);
    const last = points[points.length - 1].split(',');
    parts.push(`<circle cx="${last[0]}" cy="${last[1]}" r="3" fill="${color}"/>`);
  }

  // First and last x labels only — legible beats exhaustive at 360px.
  if (xKey && config.data.length > 1) {
    const firstLabel = String(config.data[0][xKey] ?? '');
    const lastLabel = String(config.data[config.data.length - 1][xKey] ?? '');
    parts.push(`<text x="${PAD.left}" y="${H - 8}" font-size="9" fill="currentColor" opacity="0.6">${escapeXml(firstLabel)}</text>`);
    parts.push(`<text x="${W - PAD.right}" y="${H - 8}" font-size="9" fill="currentColor" opacity="0.6" text-anchor="end">${escapeXml(lastLabel)}</text>`);
  }

  parts.push('</svg>');
  return parts.join('\n');
}

function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[ch] as string);
}

/** Rough text-node height: enough not to clip, deterministic, never measured. */
function estimateHeight(text: string): number {
  const lines = Math.max(1, Math.ceil(text.length / 45) + (text.match(/\n/g)?.length ?? 0));
  return Math.min(600, 40 + lines * 24);
}

// ── the write (vault module — the only place allowed to) ────────────────────

export type CanvasWriteOutcome =
  | { status: 'written'; canvasPath: string }
  | { status: 'error'; message: string };

export class CanvasExporter {
  constructor(private app: App) {}

  /**
   * The canvas already saved for this composition, if there is one.
   *
   * `.canvas` files carry no frontmatter, which is why every export writes a
   * sibling `.md` stub — and that stub's `myu-composition-id` is what makes
   * this lookup possible at all. The stub was built as a purge handle; it
   * turns out to be the join key too.
   */
  private findExistingCanvas(compositionId: string): string | null {
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (!file.path.startsWith('Myu/Canvas/')) continue;
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (fm?.['myu-composition-id'] !== compositionId) continue;
      const canvasPath = file.path.replace(/\.md$/, '.canvas');
      if (this.app.vault.getAbstractFileByPath(canvasPath)) return canvasPath;
    }
    return null;
  }

  /**
   * The same composition, as an ORDINARY MARKDOWN NOTE.
   *
   * A `.canvas` is the spatial form and needs Obsidian to read it. This is the
   * portable one: prose, lists, tables, `[[wikilinks]]` and a mermaid block —
   * greppable, diffable, readable in any editor, and still readable years after
   * this plugin is gone. That last property is the whole argument: what
   * survives uninstalling us.
   *
   * Uses the SAME builder as the reading pane, so the note and the pane can
   * never disagree — one mechanism, two outputs, the pattern the weekly review
   * established.
   */
  async writeMarkdown(
    spec: CompositionSpecLite,
    resolvePersonName: (name: string) => string | null,
    webUrl: string,
  ): Promise<CanvasWriteOutcome> {
    const date = new Date().toISOString().slice(0, 10);
    const subject = (spec.summary_text ?? 'composition')
      .replace(/[\\/:*?"<>|#^[\]]/g, '')
      .slice(0, 60)
      .trim();
    const path = normalizePath(`Myu/Canvas/${date} ${subject || 'composition'}.md`);

    try {
      if (!this.app.vault.getAbstractFileByPath('Myu')) await this.app.vault.createFolder('Myu');
      if (!this.app.vault.getAbstractFileByPath('Myu/Canvas')) await this.app.vault.createFolder('Myu/Canvas');

      const body = buildCompositionMarkdown(spec, resolvePersonName);
      // `myu-generated: true` is the purge handle — "find everything Myu ever
      // wrote" stays one search, even for a note the user asked for.
      // Deliberately NO `myu-id`: this is a snapshot the user requested, not a
      // surface Myu maintains, so nothing may ever regenerate over it.
      const head = ['---', 'type: myu-canvas', 'myu-generated: true', `captured: ${date}`, '---', ''].join('\n');
      const foot = ['', '---', '', `*Snapshot taken ${date}. [Open the live canvas ▸](${webUrl})*`, ''].join('\n');

      await this.app.vault.create(path, head + body + foot);
      return { status: 'written', canvasPath: path };
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) };
    }
  }

  async write(
    spec: CompositionSpecLite,
    resolvePersonPath: (name: string) => string | null,
    webUrl: string,
  ): Promise<CanvasWriteOutcome> {
    const date = new Date().toISOString().slice(0, 10);
    const subject = (spec.summary_text ?? 'composition').replace(/[\\/:*?"<>|]/g, '').slice(0, 60).trim();
    const base = normalizePath(`Myu/Canvas/${date} ${subject}`);

    try {
      const folder = 'Myu/Canvas';
      if (!this.app.vault.getAbstractFileByPath('Myu')) await this.app.vault.createFolder('Myu');
      if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);

      // Chart snapshots first: render what's renderable into assets/, then
      // hand buildCanvas the resolver so those charts become file nodes. A
      // chart whose data doesn't render stays an open-live link — honest.
      const chartPaths = new Map<string, string>();
      for (const component of spec.components) {
        if (component.type !== 'chart') continue;
        const data = component.data ?? {};
        const title =
          (typeof data.title === 'string' && data.title) || component.label || 'Chart';
        const svg = chartToSvg(title, data.recharts_config as RechartsConfigLite | undefined, date);
        if (!svg) continue;
        const assetsFolder = `${folder}/assets`;
        if (!this.app.vault.getAbstractFileByPath(assetsFolder)) {
          await this.app.vault.createFolder(assetsFolder);
        }
        const assetPath = await this.freePath(
          normalizePath(`${assetsFolder}/${date} ${component.id}`),
          'svg',
        );
        await this.app.vault.create(assetPath, svg);
        chartPaths.set(component.id, assetPath);
      }

      const { canvas, linkedPages } = buildCanvas(
        spec,
        resolvePersonPath,
        webUrl,
        (id) => chartPaths.get(id) ?? null,
      );
      // P-CANVAS-2: re-exporting the SAME composition merges into the canvas
      // that already exists instead of leaving a pile of near-duplicates.
      // The merge rule is the whole liveness story, and it is one sentence:
      // CONTENT IS OURS, LAYOUT AND EDGES ARE THEIRS.
      const existingPath = this.findExistingCanvas(spec.id);
      if (existingPath) {
        const existingFile = this.app.vault.getAbstractFileByPath(existingPath);
        if (existingFile instanceof TFile) {
          const merged = mergeCanvas(await this.app.vault.cachedRead(existingFile), canvas);
          await this.app.vault.process(existingFile, () => JSON.stringify(merged, null, 2));
          return { status: 'written', canvasPath: existingPath };
        }
      }

      const canvasPath = await this.freePath(base, 'canvas');
      await this.app.vault.create(canvasPath, JSON.stringify(canvas, null, 2));

      // The provenance stub — the purge handle. `.canvas` has no frontmatter,
      // so the stub carries it: `myu-generated: true` keeps "everything Myu
      // ever wrote" a one-search question.
      const stubPath = await this.freePath(base, 'md');
      const stub = [
        '---',
        'myu-generated: true',
        `myu-composition-id: ${spec.id}`,
        `date: ${date}`,
        '---',
        '',
        `Saved from Myu — [[${canvasPath}|open the canvas]].`,
        linkedPages.length ? `\nLinks to: ${linkedPages.map((p) => `[[${p}]]`).join(', ')}` : '',
        '',
      ].join('\n');
      await this.app.vault.create(stubPath, stub);

      return { status: 'written', canvasPath };
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) };
    }
  }

  /** `name.ext`, `name 2.ext`, … — an export never overwrites an existing file. */
  private async freePath(base: string, ext: string): Promise<string> {
    let candidate = `${base}.${ext}`;
    for (let i = 2; this.app.vault.getAbstractFileByPath(candidate); i++) {
      candidate = `${base} ${i}.${ext}`;
    }
    return candidate;
  }
}
