/**
 * Note metadata: the timestamp, the frontmatter veto, the content hash.
 *
 * TIMESTAMPS ARE THE POINT. A note written in March 2024 must arrive as March
 * 2024 — `now()` would file two years of someone's journal under today and
 * silently wreck every trend the product draws. Order of preference:
 *
 *   1. a `date`/`created` frontmatter field the user maintains,
 *   2. a date parsed from the filename (`2024-03-14.md` — the daily-note
 *      convention, and more truthful than mtime for a note edited years later),
 *   3. file mtime,
 *
 * and never the wall clock. This is the tone-rows lesson applied on day one.
 */

import type { App, TFile } from 'obsidian';

/** ISO-ish dates the daily-note world actually uses: 2024-03-14, 2024_03_14. */
const FILENAME_DATE = /(\d{4})[-_.](\d{2})[-_.](\d{2})/;

export interface NoteMeta {
  /** Epoch ms the note is ABOUT — never the capture time. */
  occurredAt: number;
  /** `myu: false` in frontmatter — a per-note veto that beats any allowlist. */
  vetoed: boolean;
}

export function readNoteMeta(app: App, file: TFile): NoteMeta {
  const cache = app.metadataCache.getFileCache(file);
  const fm = cache?.frontmatter;

  const vetoed = fm?.myu === false || fm?.myu === 'false';

  return { occurredAt: resolveOccurredAt(fm, file), vetoed };
}

function resolveOccurredAt(fm: Record<string, unknown> | undefined, file: TFile): number {
  for (const key of ['date', 'created', 'created_at']) {
    const parsed = parseDateValue(fm?.[key]);
    if (parsed !== null) return parsed;
  }

  const match = file.basename.match(FILENAME_DATE);
  if (match) {
    // Local noon, not midnight: a daily note is a day, and midnight lands on the
    // previous day in any timezone west of UTC once the server converts it.
    const [, y, m, d] = match;
    const local = new Date(Number(y), Number(m) - 1, Number(d), 12, 0, 0);
    if (!Number.isNaN(local.getTime())) return local.getTime();
  }

  return file.stat.mtime;
}

function parseDateValue(value: unknown): number | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Seconds vs milliseconds: anything below ~1e12 is seconds.
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    // Bare `YYYY-MM-DD` parses as UTC midnight in JS, which shifts the day for
    // most of the world. Pin it to local noon like the filename case.
    const dateOnly = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnly) {
      const [, y, m, d] = dateOnly;
      return new Date(Number(y), Number(m) - 1, Number(d), 12, 0, 0).getTime();
    }
    const parsed = Date.parse(trimmed);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

/**
 * Content hash, for skipping captures of notes that didn't actually change.
 *
 * Templater boilerplate means a "new" daily note is often byte-identical to the
 * template for hours; without this the quiescence timer would ship the same
 * empty scaffold every time the user tabbed through it.
 */
export async function hashContent(content: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Strip the frontmatter block before hashing and sending. It is vault plumbing
 * (aliases, cssclass, tags) rather than the user's writing, and letting it into
 * the hash means a Templater field that stamps `modified:` on every save turns
 * every save into a "change".
 */
export function stripFrontmatter(content: string): string {
  if (!content.startsWith('---')) return content;
  const end = content.indexOf('\n---', 3);
  if (end === -1) return content;
  return content.slice(content.indexOf('\n', end + 1) + 1).trimStart();
}
