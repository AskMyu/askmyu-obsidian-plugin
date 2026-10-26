// People Myu isn't keeping track of yet (2026-10-03; BRIEF_WEB_MAIL_RELIEF_20261002 §1, the backend's
// IMPL_MAIL_RELIEF_20261002 Part 6, and the operator's decision of 2026-10-03: opening someone changes nothing — only
// "Keep track" brings them back). The server keeps people who were only on some of your emails "on the map": out of
// the people lists, still in search, no questions asked about them. The lists leave them out and carry
// `map: {count, line}`; `map=only` pages them, most recently seen first; every row carries `on_map`, a row on the map
// also `times_seen`; a search result and a person's card header carry `on_map` too. `POST /v2/relationships/keep` is
// the one way back ("Keep track"); opening a card or a page does nothing to it. The plugin's copy of shared
// `types/mapFold.ts` (it imports types only); `tests/internal/mapFoldParity.test.ts` holds the two together.

import type { MapFold, MapRowLike } from './wire';

/** The page the fold reads at a time. */
export const MAP_FOLD_PAGE = 50;

/** The object form of a person's pronouns for "keeping track of her": the three common sets; anyone else is "them". */
export function objectPronoun(pronouns: string | null | undefined): string {
  const p = (pronouns ?? '').trim().toLowerCase();
  if (p === 'she/her') return 'her';
  if (p === 'he/him') return 'him';
  return 'them';
}

/** The words the clients write themselves; the fold's own line comes from the server (`map.line`). */
export const MAP_FOLD_WORDS = {
  /** The one control on a folded row (the name sits beside it). */
  keep: 'Keep track',
  /** The same control on a person's card. */
  keepOf: (first: string) => `Keep track of ${first}`,
  /** The first line inside the fold. */
  intro: 'These people were on your emails, but Myu isn’t keeping track of them. Pick anyone you want it to keep track of.',
  /** The mark on a search result for a person on the map. */
  mark: 'not keeping track yet',
  /** The state on a person's card. */
  cardState: (first: string, pronouns?: string | null) =>
    `${first} has been on a few of your emails. Myu isn’t keeping track of ${objectPronoun(pronouns)} yet.`,
  /** How often they were on your mail. */
  onEmails: (n: number) => (n === 1 ? 'on 1 email' : `on ${n} emails`),
  /** The day they were last seen, as a person says it: "2 Oct", or "2 Oct 2024" in another year. */
  lastSeen: (when: string | null | undefined, now: Date = new Date()): string => {
    if (!when) return '';
    const parsed = Date.parse(when);
    const d = Number.isNaN(parsed) ? new Date(when.replace(' ', 'T')) : new Date(parsed);
    if (Number.isNaN(d.getTime())) return '';
    const sameYear = d.getFullYear() === now.getFullYear();
    return d.toLocaleDateString(undefined, sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
  },
  more: 'More ▸',
  showing: (shown: number, total: number) => `Showing ${shown} of ${total}`,
  /** After the last one was taken. */
  empty: 'That’s everyone.',
  /** After "Keep track" went through. */
  kept: (first: string) => `Myu is keeping track of ${first} now.`,
  /** A "Keep track" the server refused or that did not go through. */
  failed: 'Myu couldn’t do that just now. Try again.',
} as const;

/** The line at the foot of the people list: the server's words when anyone is on the map, nothing otherwise. */
export function foldLine(map: MapFold | null | undefined): string | null {
  if (!map || !(map.count > 0)) return null;
  return map.line?.trim() || `${map.count} more people from your mail`;
}

/** A row the server marked as on the map: a search result, a v2 row, a card header. */
export function isOnMap(row: { on_map?: boolean | null } | null | undefined): boolean {
  return row?.on_map === true;
}

export function mapRowId(row: MapRowLike): string {
  return row.relationship_id ?? row.id ?? '';
}

export function mapRowName(row: MapRowLike): string {
  return row.primary_name ?? row.name ?? row.email_primary ?? row.email ?? 'Someone';
}

export function mapRowCompany(row: MapRowLike): string | null {
  return row.company_name ?? row.organization ?? row.stated_company ?? null;
}

export function mapRowAddress(row: MapRowLike): string | null {
  return row.email_primary ?? row.email ?? null;
}

export function timesSeen(row: MapRowLike): number {
  return row.times_seen ?? row.mention_count ?? 0;
}

/** "on 6 emails, last 12 Mar 2024" / "on 1 email, last 30 Sep" — the row's meta. */
export function seenWords(row: MapRowLike, now: Date = new Date()): string {
  const times = MAP_FOLD_WORDS.onEmails(timesSeen(row));
  const last = MAP_FOLD_WORDS.lastSeen(row.last_seen, now);
  return last ? `${times}, last ${last}` : times;
}

/** The row's second line: company · address · on N emails, last …, the parts that are known. */
export function mapRowMeta(row: MapRowLike, now: Date = new Date()): string {
  return [mapRowCompany(row), mapRowAddress(row), seenWords(row, now)].filter(Boolean).join(' · ');
}

/** The query the fold reads with. */
export function foldQuery(offset: number, limit: number = MAP_FOLD_PAGE): { map: 'only'; limit: number; offset: number } {
  return { map: 'only', limit, offset };
}

/** Whether a next page remains: fewer rows loaded than the fold's count, and the last page was full. */
export function foldHasMore(loaded: number, count: number, lastPage: number, limit: number = MAP_FOLD_PAGE): boolean {
  return loaded < count && lastPage >= limit;
}

/** The body "Keep track" posts. */
export function keepBody(relationshipId: string): { relationship_id: string } {
  return { relationship_id: relationshipId };
}

/**
 * The fold after one person left it ("Keep track"): one fewer, the line's number brought down with it (the lists read
 * again afterwards and the server's words take over).
 */
export function foldAfterOneLeft(map: MapFold | null | undefined): MapFold | null {
  if (!map) return null;
  const count = Math.max(0, map.count - 1);
  if (count === 0) return { count: 0, line: null };
  const line = map.line ? map.line.replace(String(map.count), String(count)) : null;
  return { count, line };
}

/** The rows without the one that left. */
export function withoutRow<T extends MapRowLike>(rows: T[], relationshipId: string): T[] {
  return rows.filter((r) => mapRowId(r) !== relationshipId);
}

/** The first name, for the words on the card and after "Keep track". */
export function mapRowFirst(row: MapRowLike): string {
  const name = mapRowName(row).trim();
  return name.split(/\s+/)[0] || name;
}

/** The first name out of a display name (a card header). */
export function firstNameOf(name: string | null | undefined): string {
  const n = (name ?? '').trim();
  return n.split(/\s+/)[0] || 'them';
}
