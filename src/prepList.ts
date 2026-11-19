/**
 * The prep as Myu's brief, with the person's list inside it (2026-10-29; BRIEF_WEB_PREP_NOTES_20261029) — the plugin's
 * copy of shared `types/prepList.ts`, the same below this header (`tests/internal/prepListParity.test.ts` holds it).
 * The fixed words every surface uses (no model writes any of them; never a side, never "Skip"), and the pure pieces
 * they draw from the payloads: a Today row's items, "{n} to cover", "On the list for {day}.", the list's count before /
 * during / after, a person's line, strip and rows, Myu's offers on a reply, the history link. Pure.
 */

import type { PrepCardV2, PrepLineRef, PrepListItem, PrepPerson, PrepState } from './prep';
import { checkRecordRow } from './checkWords';

export const PREP_LIST_WORDS = {
  addPlaceholder: 'Add an item to your list',
  add: 'Add',
  privateNotes: 'Your private notes for this meeting.',
  listLabel: 'To cover',
  addLink: '+ add',
  notesLabel: 'Notes',
  notesPlaceholder: 'What’s said and decided, as you go. Only you see this.',
  savedAsYouType: 'Saved as you type',
  quiet: 'Myu won’t interrupt. Ask it in the chat if you need it.',
  done: 'Done ▸',
  join: 'Join the call ▸',
  now: 'NOW',
  myuPrep: 'Myu’s prep',
  show: 'show ▸',
  hide: 'hide ▾',
  open: 'Open ▸',
  laterThisWeek: 'Later this week',
  fromLastTime: 'from last time',
  drop: 'Drop',
  remove: 'Remove',
  fromNotes: 'From your notes',
  myuReading: 'Myu’s reading',
  yes: 'Yes ▸',
  addsToList: 'adds it to your list',
  onYourList: 'on your list',
  reading: 'Reading your notes and the calendar for this meeting…',
  readingLong: 'Taking longer than usual. Your list is saved.',
  readingFailed: 'Couldn’t read this meeting this time. Try again ▸',
  personMore: 'more ▾',
  personLess: 'less ▴',
  fullCard: 'Full card ▸',
  since: 'Since last time',
  room: 'The room',
  beforeYouGo: 'Before you go in',
  labels: {
    changed: 'Changed',
    youOwe: 'You owe',
    theyOwe: (first: string) => `${first} owes`,
    thread: 'Open thread',
    worksBest: 'Works best',
    lastTime: 'Last time',
    planned: 'What’s planned',
    documents: 'Documents',
    setUpEmail: 'The email that set it up',
    notReplied: 'Hasn’t replied',
    history: 'History',
  },
  covered: (n: number, m: number) => `${n} of ${m}`,
  coveredAfter: (n: number, m: number) => `${n} of ${m} covered`,
  carriedTo: (date: string) => `Carried to ${date}`,
  onTheListFor: (day: string) => `On the list for ${day}.`,
  toCover: (n: number) => `${n} to cover`,
  more: (n: number) => `+${n} more`,
  plus: (text: string) => `+ ${text}`,
  openCount: (n: number) => `${n} open`,
  pastMeetings: (first: string) => `Past 1:1s with ${first} ▸`,
  pastSeries: (meeting: string) => `Earlier ${meeting} ▸`,
} as const;

/** How many items a Today row shows; the page holds the whole list. */
export const TODAY_ROW_ITEMS = 3;
/** How long the notes wait after the last key before they are saved. */
export const NOTES_SAVE_MS = 800;
/** When the brief's waiting line says it is taking longer than usual. */
export const READING_LONG_MS = 20_000;
/** How soon the page reads again while Myu is still reading (the meeting's line update reads it sooner). */
export const READING_POLL_MS = 4_000;

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const list = <T,>(v: readonly T[] | null | undefined): readonly T[] => (Array.isArray(v) ? (v as readonly T[]) : []);

/** The first name: "Reid Okafor" → "Reid". */
export function prepFirstName(name: unknown): string {
  return str(name).split(/\s+/)[0] ?? '';
}

/** One time format everywhere: "2:00 pm". */
export function prepTimeWords(d: Date): string {
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? 'am' : 'pm'}`;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/**
 * The meeting's day as "On the list for {day}." says it: "today", "tomorrow", the weekday within the week ahead
 * ("Thursday"), else "12 November". Null without a start.
 */
export function prepDayWord(startsAt: unknown, now: Date = new Date()): string | null {
  const t = Date.parse(str(startsAt));
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  const days = Math.round((startOfDay(d) - startOfDay(now)) / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days > 1 && days < 7) return WEEKDAYS[d.getDay()];
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** The when under the title: "Thursday 29 October · 2:00 pm". Empty without a start. */
export function prepWhenWords(startsAt: unknown): string {
  const t = Date.parse(str(startsAt));
  if (!Number.isFinite(t)) return '';
  const d = new Date(t);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} · ${prepTimeWords(d)}`;
}

/** The items a Today row shows (at most three, in their order) and how many more the page holds. */
export function todayRowItems(items: readonly PrepListItem[] | null | undefined, count?: number | null): { shown: PrepListItem[]; more: number } {
  const all = [...list(items)].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const shown = all.slice(0, TODAY_ROW_ITEMS);
  const total = typeof count === 'number' && count >= all.length ? count : all.length;
  return { shown, more: Math.max(0, total - shown.length) };
}

/** "· 2 to cover" on a row's title: the items not ticked yet, when the row knows them all; else the count. Null at none. */
export function toCoverWords(items: readonly PrepListItem[] | null | undefined, count?: number | null): string | null {
  const all = list(items);
  const total = typeof count === 'number' && count >= all.length ? count : all.length;
  const open = total === all.length ? all.filter((i) => !i.done).length : total - all.filter((i) => i.done).length;
  return open > 0 ? PREP_LIST_WORDS.toCover(open) : null;
}

/** The meeting's state as the page draws it (a card from before the state reads as before). */
export function prepStateOf(prep: Pick<PrepCardV2, 'state'> | null | undefined): PrepState {
  const s = prep?.state;
  return s === 'now' || s === 'after' ? s : 'before';
}

/** The list's count beside its label: "2 of 3" during the meeting, "2 of 3 covered" after; nothing before. */
export function prepCoveredLabel(prep: Pick<PrepCardV2, 'state' | 'items' | 'covered'>): string | null {
  const state = prepStateOf(prep);
  if (state === 'before') return null;
  const items = list(prep.items);
  const total = prep.covered?.total ?? items.length;
  const done = prep.covered?.done ?? items.filter((i) => i.done).length;
  if (!total) return null;
  return state === 'now' ? PREP_LIST_WORDS.covered(done, total) : PREP_LIST_WORDS.coveredAfter(done, total);
}

/**
 * The quiet words after an item: "from last time" for a carried one; after the meeting, an item with no tick says where
 * it went ("Carried to 12 Nov", with Drop beside it) when the server says so.
 */
export function prepItemNote(item: PrepListItem, state: PrepState): { text: string; drop: boolean } | null {
  if (state === 'after' && !item.done) {
    const date = str(item.carried_to?.date);
    return date ? { text: PREP_LIST_WORDS.carriedTo(date), drop: !!str(item.carried_to?.item_id) } : null;
  }
  return item.source === 'carried' ? { text: PREP_LIST_WORDS.fromLastTime, drop: false } : null;
}

/** The list in a new order: the item at `from` moved to `to`, every position renumbered from 0. */
export function moveItem<T extends PrepListItem>(items: readonly T[], from: number, to: number): T[] {
  const out = [...items];
  if (from < 0 || from >= out.length || to < 0 || to >= out.length || from === to) return out;
  const [it] = out.splice(from, 1);
  out.splice(to, 0, it);
  return out.map((i, n) => ({ ...i, position: n }));
}

/**
 * The question inside the prep is the list's own ("What do you want to cover with Reid? Add as many as you like."):
 * typed words with no choices (it has no Skip). The page's brief carries that question and the list's add answers it,
 * so the page does not draw it twice; any other question (who someone reports to, an open one) is drawn as before.
 */
export function prepAskIsList(ask: Pick<PrepLineRef, 'input' | 'choices' | 'select' | 'kind'> | null | undefined): boolean {
  if (!ask) return false;
  // The server names the question's kind; a card from before it reads as before.
  if (str(ask.kind)) return ask.kind === 'want';
  return ask.select !== 'many' && ask.input === 'text' && list(ask.choices).length === 0;
}

/** What the brief's place says while Myu reads: reading, taking longer (after ~20 s), or couldn't; null when done. */
export function prepReadingStage(prep: Pick<PrepCardV2, 'reading' | 'reading_failed'>, waitedMs: number): 'reading' | 'long' | 'failed' | null {
  if (prep.reading_failed) return 'failed';
  if (!prep.reading) return null;
  return waitedMs >= READING_LONG_MS ? 'long' : 'reading';
}

/** A person's open items in rows, then what changed, then how they like to work: one fact per row, its source under it. */
export interface PrepPersonRow {
  key: string;
  label: string;
  text: string;
  sub: string | null;
}

/** A person's rows when open: CHANGED, YOU OWE / {FIRST} OWES / OPEN THREAD, WORKS BEST. None for a thin person. */
export function prepPersonRows(p: PrepPerson): PrepPersonRow[] {
  if (p.thin) return [];
  const W = PREP_LIST_WORDS.labels;
  const first = prepFirstName(p.name) || p.name;
  const rows: PrepPersonRow[] = [];
  list(p.changed).forEach((c, i) => {
    const text = str(c?.text);
    if (text) rows.push({ key: `changed-${i}`, label: W.changed, text, sub: str(c?.source) || null });
  });
  list(p.open).forEach((o, i) => {
    const text = str(o?.text);
    if (!text) return;
    const label = o.kind === 'you_owe' ? W.youOwe : o.kind === 'they_owe' ? W.theyOwe(first) : W.thread;
    rows.push({ key: `open-${i}`, label, text, sub: str(o?.when) || null });
  });
  // What was decided between them and what the person was told (2026-11-10, BRIEF_FRONTEND_THE_CHECK §4), in the check's words.
  for (const [kind, of] of [['decided', p.decided], ['told', p.told]] as const) {
    list(of).forEach((r, i) => {
      const w = checkRecordRow({ ...r, kind }, Date.now());
      if (w.text) rows.push({ key: `${kind}-${i}`, label: w.label, text: w.text, sub: [w.sub, w.right].filter(Boolean).join(' · ') || null });
    });
  }
  // How they like to work: the server's sentence, or {text, source} (the brief's shape).
  const wb = p.works_best as unknown;
  const wbText = typeof wb === 'string' ? str(wb) : wb && typeof wb === 'object' ? str((wb as { text?: unknown }).text) : '';
  const wbSource = wb && typeof wb === 'object' ? str((wb as { source?: unknown }).source) : '';
  if (wbText) rows.push({ key: 'works-best', label: W.worksBest, text: wbText, sub: wbSource || null });
  return rows;
}

/** "3 open" beside the line, when more is open than the line says. */
export function prepPersonStrip(p: PrepPerson): string | null {
  const open = list(p.open);
  const n = typeof p.open_count === 'number' ? p.open_count : open.length;
  const line = str(p.line);
  const says = p.line_kind === 'open' || (p.line_kind === 'changed' && open.length > 0 && line.includes(str(open[0]?.text))) ? 1 : 0;
  return n > says ? PREP_LIST_WORDS.openCount(n) : null;
}

/** The person's line: the server's when sent; null for the name alone. */
export function prepPersonLine(p: PrepPerson): string | null {
  return str(p.line) || null;
}

/** Myu's offers on a reply in a meeting's conversation (`list_offers`): the phrases, at most three, no repeats. */
export function listOffersOf(reply: unknown): string[] {
  const raw = reply && typeof reply === 'object' ? (reply as { list_offers?: unknown }).list_offers : null;
  const out: string[] = [];
  for (const o of Array.isArray(raw) ? raw : []) {
    const t = str(o && typeof o === 'object' ? (o as { text?: unknown }).text : o);
    if (t && !out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
    if (out.length === 3) break;
  }
  return out;
}

/**
 * The history behind a meeting, as the door takes it: "Past 1:1s with Reid ▸" for a 1:1 with a known person
 * (`relationship_id`), else "Earlier Roadmap sync ▸" for a recurring meeting (`event_series`). Null for neither.
 */
export function prepHistoryLink(prep: Pick<PrepCardV2, 'kind' | 'people' | 'title' | 'event_series'>): { relationship_id?: string; event_series?: string; label: string } | null {
  if (prep.kind === 'one_on_one') {
    const p = list(prep.people).find((x) => !!str(x?.relationship_id));
    const first = prepFirstName(p?.name);
    if (p && first) return { relationship_id: str(p.relationship_id), label: PREP_LIST_WORDS.pastMeetings(first) };
  }
  const series = str(prep.event_series);
  const title = str(prep.title);
  return series && title ? { event_series: series, label: PREP_LIST_WORDS.pastSeries(title) } : null;
}

/**
 * Where taking a suggestion puts it: before and during the meeting, this meeting; after it, the suggestion's own
 * target (the next meeting, or the person or series it waits for), else this meeting.
 */
export function prepSuggestionTarget(
  meeting: { event_id: string; occurrence_key?: string | null },
  suggestion: { target?: { event_id?: string | null; occurrence_key?: string | null; relationship_id?: string | null; series_id?: string | null } | null },
): { event_id?: string; occurrence_key?: string | null; relationship_id?: string; series_id?: string } {
  const t = suggestion.target;
  if (t && str(t.event_id)) return { event_id: str(t.event_id), occurrence_key: str(t.occurrence_key) || null };
  if (t && str(t.relationship_id)) return { relationship_id: str(t.relationship_id) };
  if (t && str(t.series_id)) return { series_id: str(t.series_id) };
  return { event_id: meeting.event_id, occurrence_key: meeting.occurrence_key ?? null };
}

/** A past meeting's row in the history: "Thu 15 Oct · 2 of 3 covered", or the day alone with no list. */
export function prepHistoryRowWords(row: { starts_at?: string | null; items_total?: number; items_done?: number }): string {
  const t = Date.parse(str(row.starts_at));
  const d = Number.isFinite(t) ? new Date(t) : null;
  const day = d ? `${WEEKDAYS[d.getDay()].slice(0, 3)} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}` : '';
  const total = row.items_total ?? 0;
  const covered = total > 0 ? PREP_LIST_WORDS.coveredAfter(row.items_done ?? 0, total) : '';
  return [day, covered].filter(Boolean).join(' · ');
}
