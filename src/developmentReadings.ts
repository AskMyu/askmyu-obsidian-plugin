/**
 * The self card's two development sections (2026-10-29; BRIEF_WEB_DEVELOPMENT_READINGS_20261029) — the plugin's copy of
 * shared `types/developmentReadings.ts`, the same below this header (`tests/internal/developmentReadingsParity.test.ts`
 * holds it). The material in words, the levels, the rows, the headings; never "gap", "missing", "weak" or "lacking".
 * Pure.
 */

import { cardDayWords } from './cardDays';

/** Where a line or a skill came from: a kind of writing, how many, and since when. */
export interface DevelopmentMaterial {
  source_type?: string;
  count?: number;
  since?: string;
}

export interface WorkShapingLine {
  /** task / relational / cognitive. */
  kind?: string;
  text?: string;
  material?: DevelopmentMaterial[];
  /** A change point: shown with a small "new" mark. */
  change?: boolean;
}

export interface SkillShown {
  key?: string;
  name?: string;
  /** often / sometimes / once. */
  level?: string;
  /** The level in the server's words, when sent (shown in place of the level's own words). */
  level_text?: string;
  days?: number;
  material?: DevelopmentMaterial[];
  last_at?: string;
}

export interface RoleAskItem {
  key?: string;
  name?: string;
  /** often / sometimes / once / not_yet. */
  level?: string;
  /** The level in the server's words, when sent ("hasn't come up in what you've written" for not_yet). */
  level_text?: string;
}

export interface RoleAsks {
  role_title?: string;
  onet_code?: string;
  /** role_title / target_role / goal. */
  source?: string;
  items?: RoleAskItem[];
}

/** The role the person is aiming for, with what it asks for: shown in place of the next roles. */
export interface DevelopmentTarget {
  kind?: string;
  title?: string;
  onet_code?: string;
  items?: RoleAskItem[];
}

export const DEVELOPMENT_WORDS = {
  workShapingTitle: 'How you shape your work',
  skillsTitle: 'Skills your work shows',
  /** A skill the role asks for that has not shown in the person's writing. */
  notYet: 'hasn’t come up in what you’ve written',
  newMark: 'new',
  nextRoles: 'Roles people in your work often move to',
  asksFor: (role: string) => `What ${role} usually asks for`,
  targetAsks: (title: string) => `What ${title} asks for`,
  window: (days: number) => `Last ${days} days`,
  days: (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`,
  lastOn: (day: string) => `last on ${day}`,
} as const;

/** Each kind of writing in words, one and many. A kind not named here is left out (never a code on screen). */
const SOURCE_WORDS: Record<string, [string, string]> = {
  journal: ['entry', 'entries'],
  github_review: ['review you gave', 'reviews you gave'],
  github_pull_request: ['pull request', 'pull requests'],
  tracker_event: ['ticket', 'tickets'],
  retro: ['retro', 'retros'],
  email: ['mail you sent', 'mail you sent'],
  messaging: ['message you sent', 'messages you sent'],
};

const LEVELS = new Set(['often', 'sometimes', 'once']);

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const whole = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : null);
/** A list as sent, or none when the server sent something else. */
const list = <T,>(v: readonly T[] | null | undefined): readonly T[] => (Array.isArray(v) ? (v as readonly T[]) : []);

/**
 * The material in words: "3 entries · 1 review you gave, since 4 Sep" (the earliest `since`). Kinds not named in
 * words, or with no count, are left out; empty when nothing is left.
 */
export function materialWords(material: readonly DevelopmentMaterial[] | null | undefined, now: Date = new Date()): string {
  const parts: string[] = [];
  let since: string | null = null;
  for (const m of list(material)) {
    const words = SOURCE_WORDS[str(m?.source_type)];
    const n = whole(m?.count);
    if (!words || n === null) continue;
    parts.push(`${n} ${n === 1 ? words[0] : words[1]}`);
    const s = str(m?.since);
    if (s && (!since || s < since)) since = s;
  }
  if (!parts.length) return '';
  const day = since ? cardDayWords(since, { now }) : null;
  return `${parts.join(' · ')}${day ? `, since ${day}` : ''}`;
}

/** A level in words: often / sometimes / once as they are; not_yet as "hasn't come up in what you've written". */
export function levelWords(level: unknown): string | null {
  const l = str(level);
  if (l === 'not_yet') return DEVELOPMENT_WORDS.notYet;
  return LEVELS.has(l) ? l : null;
}

/** An item's level as shown: the server's `level_text` when sent, else the level in words. */
function shownLevel(item: { level?: unknown; level_text?: unknown } | null | undefined): string | null {
  return str(item?.level_text) || levelWords(item?.level);
}

/** A work-shaping line's rows: its words, the material under them, and whether it is new. Lines with no words go. */
export function workShapingRows(lines: readonly WorkShapingLine[] | null | undefined, now: Date = new Date()): Array<{ text: string; material: string; isNew: boolean }> {
  return list(lines)
    .map((l) => ({ text: str(l?.text), material: materialWords(l?.material, now), isNew: l?.change === true }))
    .filter((r) => !!r.text);
}

/** A skill's row: its name, then "often · 9 days · 7 entries · 4 pull requests · last on 27 Oct". Null with no name. */
export function skillRow(skill: SkillShown | null | undefined, now: Date = new Date()): { name: string; meta: string } | null {
  const name = str(skill?.name);
  if (!name) return null;
  const days = whole(skill?.days);
  const last = str(skill?.last_at) ? cardDayWords(str(skill?.last_at), { now }) : null;
  const meta = [shownLevel(skill), days !== null ? DEVELOPMENT_WORDS.days(days) : null, materialWords(skill?.material, now) || null, last ? DEVELOPMENT_WORDS.lastOn(last) : null]
    .filter(Boolean)
    .join(' · ');
  return { name, meta };
}

/** A role's items as rows: the name and the level in words. Items with no name or no known level go. */
export function roleAskRows(items: readonly RoleAskItem[] | null | undefined): Array<{ name: string; level: string; notYet: boolean }> {
  return list(items)
    .map((i) => ({ name: str(i?.name), level: shownLevel(i) ?? '', notYet: str(i?.level) === 'not_yet' }))
    .filter((r) => !!r.name && !!r.level);
}

/** The heading over what the person's role asks for: "What {role} usually asks for". Null with no title. */
export function asksForHeading(asks: Pick<RoleAsks, 'role_title'> | null | undefined): string | null {
  const r = str(asks?.role_title);
  return r ? DEVELOPMENT_WORDS.asksFor(r) : null;
}

/**
 * The heading over the role the person is aiming for (shown in place of the next roles, with the target's own items):
 * "What {target} asks for". Null with no title.
 */
export function targetHeading(target: Pick<DevelopmentTarget, 'title'> | null | undefined): string | null {
  const t = str(target?.title);
  return t ? DEVELOPMENT_WORDS.targetAsks(t) : null;
}
