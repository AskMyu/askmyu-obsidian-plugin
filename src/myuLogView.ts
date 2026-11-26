/**
 * Myu's log, redrawn (the release after 0.5.5) — the plugin's one adapter for the server's answer (`GET /myu/log`, the shape in shared
 * `types/myuLog.ts`). The web and the phone read it with shared `logViewOf`; the plugin may take only TYPES from shared, so the same
 * reading and the same words live here, typed against the vendored shape, and `tests/internal/myuLogParity.test.ts` (monorepo-only)
 * holds them to shared's. An answer without `groups` is today's server, drawn as before.
 *
 * Times and days are his own: the answer's `zone`, else this computer's (`logZone`), never UTC.
 */

import type { MyuLogItemLite, MyuLogResult } from './transport/api';

/**
 * The words the redrawn log adds (shared `MYU_LOG_WORDS`, INTERIM). The headings and the folded rows are the server's, drawn as sent; a
 * row carries no kind tag (planning, 25 Nov: the words under a heading already say it), so the kinds' words are the web's alone.
 */
export const MYU_LOG_WORDS = {
  today: 'Today',
  yesterday: 'Yesterday',
  emptyToday: 'Nothing yet today.',
  /** The heading over rows whose heading the answer did not name. */
  other: 'Other',
} as const;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad2 = (n: number) => String(n).padStart(2, '0');

// ── His zone (shared's) ──

/** His zone: the answer's (a zone this runtime knows), else this computer's. */
export function logZone(answerZone?: string | null): string {
  const z = typeof answerZone === 'string' ? answerZone.trim() : '';
  if (z) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: z });
      return z;
    } catch {
      // Not a zone this runtime knows: this computer's.
    }
  }
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

const zoneFormats = new Map<string, Intl.DateTimeFormat>();
function zoneParts(at: Date, zone: string): { y: number; m: number; d: number; h: number; min: number } {
  let f = zoneFormats.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    zoneFormats.set(zone, f);
  }
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(at)) p[x.type] = x.value;
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour) % 24, min: Number(p.minute) };
}

/** The day (YYYY-MM-DD) an instant falls on, in a zone: the note's name. */
export function zoneDay(at: Date, zone: string): string {
  const p = zoneParts(at, zone);
  return `${p.y}-${pad2(p.m)}-${pad2(p.d)}`;
}

/** The hour and minute (HH:MM, 24-hour) of an instant, in a zone, as the note has always written them. */
export function zoneTime(at: Date, zone: string): string {
  const p = zoneParts(at, zone);
  return `${pad2(p.h)}:${pad2(p.min)}`;
}

export function dayShift(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
}

/** The instant a day (YYYY-MM-DD) begins in a zone. */
export function zoneMidnight(day: string, zone: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  const wall = Date.UTC(y, m - 1, d);
  let t = wall;
  for (let i = 0; i < 3; i++) {
    const p = zoneParts(new Date(t), zone);
    const off = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) - wall;
    if (off === 0) break;
    t -= off;
  }
  return new Date(t);
}

const isDay = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** A day in words from another day: «Today», «Yesterday», «Mon 23 Nov» (and the year when not this one). */
export function logDayOfDay(day: string, today: string): string {
  if (!isDay(day) || !isDay(today)) return '';
  const [y, m, d] = day.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  const gap = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86400000);
  if (gap === 0) return MYU_LOG_WORDS.today;
  if (gap === -1) return MYU_LOG_WORDS.yesterday;
  const year = y === ty ? '' : ` ${y}`;
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTHS[m - 1]}${year}`;
}

/** The day on a row, in his zone: «Today», «Yesterday», «Mon 23 Nov» (and the year when it is not this one). */
export function logDayWords(at: string | Date, now: Date = new Date(), zone: string = logZone()): string {
  const d = typeof at === 'string' ? new Date(at) : at;
  if (Number.isNaN(d.getTime())) return '';
  return logDayOfDay(zoneDay(d, zone), zoneDay(now, zone));
}

// ── Words from someone else, written safely into his vault ──

/**
 * A row's words can come from someone's message (the read's findings, 25 Nov), and so can a heading's: written as one line that can
 * never begin a heading, a quote, a list, a rule, a fence or a table, never embed a note or a picture (`![[…]]`, `![…](…)`), never open a
 * comment (`%%`), a formula (`$$`) or markup (`<`), and never make a tag. It reads the same; the marks are escaped, not removed.
 */
/* eslint-disable no-control-regex -- the first pattern is there to find control characters */
export function noteText(s: string | null | undefined): string {
  let t = (typeof s === 'string' ? s : '')
    .replace(/[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  t = t
    .replace(/</g, '&lt;')
    .replace(/!\[/g, '!\\[')
    .replace(/%%/g, '%\\%')
    .replace(/\$\$/g, '$\\$')
    .replace(/#(?=[^\s#]|$)/g, '\\#');
  if (/^[#>*+\-=_~`|]/.test(t)) t = `\\${t}`;
  else t = t.replace(/^(\d+)([.)])(\s|$)/, '$1\\$2$3');
  return t;
}
/* eslint-enable no-control-regex -- noteText's control-character pattern ends here */

// ── Reading the answer (shared `logViewOf`) ──

/** The redrawn log, or today's flat rows (the server's `groups`). */
export function isGroupedLog(res: { groups?: unknown } | null | undefined): res is { groups: Array<{ id: string; title: string }> } {
  return !!res && Array.isArray(res.groups);
}

export interface LogViewRow {
  id: string;
  day: string;
  time: string;
  text: string;
  folded: boolean;
  quiet: boolean;
  under: boolean;
}
export interface LogViewSection {
  id: string;
  title: string;
  rows: LogViewRow[];
}

/**
 * The server's headings in its order, each with its rows as sent (one row per fold id, the first page's), a day on each row unless one
 * day, in his zone; an answer under the row it answers only when that row is just above; rows naming no known heading under «Other».
 */
export function logViewOf(
  res: Pick<MyuLogResult, 'groups'> & { items?: MyuLogItemLite[] | null; zone?: string | null },
  opts: { oneDay?: boolean; now?: Date; time?: (d: Date, zone: string) => string; zone?: string } = {},
): LogViewSection[] {
  const now = opts.now ?? new Date();
  const zone = logZone(opts.zone ?? res.zone);
  // A row's time: 24-hour, in his zone, as the server's own sentences say it («at 15:51»; the real-door check, 25 Nov).
  const time = opts.time ?? zoneTime;
  const today = zoneDay(now, zone);
  const sections: LogViewSection[] = (res.groups ?? []).map((g) => ({ id: g.id, title: g.title, rows: [] }));
  const byId = new Map(sections.map((s) => [s.id, s]));
  const other: LogViewSection = { id: '', title: MYU_LOG_WORDS.other, rows: [] };
  const folds = new Set<string>();
  for (const it of res.items ?? []) {
    // One row per fold id, the first page's, as sent (shared `logViewOf`).
    if (it.fold) {
      if (folds.has(it.receipt_id)) continue;
      folds.add(it.receipt_id);
    }
    const at = new Date(it.at ?? '');
    const folded = !!it.fold;
    const section = byId.get(it.group ?? '') ?? other;
    const above = section.rows[section.rows.length - 1];
    // The folded row's own day, narrowed by `isDay` (no assertion: the mirror's vendored types make one "unnecessary", 25 Nov).
    const foldDay = it.fold?.day;
    const day = opts.oneDay
      ? ''
      : folded && isDay(foldDay)
        ? logDayOfDay(foldDay, today)
        : Number.isNaN(at.getTime())
          ? ''
          : logDayOfDay(zoneDay(at, zone), today);
    section.rows.push({
      id: it.receipt_id,
      day,
      time: folded || Number.isNaN(at.getTime()) ? '' : time(at, zone),
      text: it.text ?? '',
      folded,
      quiet: folded || !!it.quiet,
      under: !!it.answers && !!above && above.id === it.answers,
    });
  }
  return [...sections, other].filter((s) => s.rows.length > 0);
}
