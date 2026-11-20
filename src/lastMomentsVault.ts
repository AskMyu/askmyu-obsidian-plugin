/**
 * The last moments of the week, in the vault (2026-11-13; BRIEF_FRONTEND_LAST_MOMENTS_20261112, the backend's shapes confirmed in
 * IMPL_BACKEND_PHASE1_20261112 §6.2): what the panes draw for it, with no host API, so the tests read it.
 *
 * The contract (its words and its readers) is `lastMoments.ts`, a byte-for-byte copy of shared's. The few helpers shared owns that are
 * used here (`draftWhen`, `clockWords`, `placeWords`, `whoWords`, `whoFor`) are copied below word for word, and
 * `tests/internal/lastMomentsParity.test.ts` holds them to shared's. Every door is one the vault already calls:
 *   what else falls on that day (`full_day`): Keep · Move it · Not a promise. Move it asks "Which day?" (the line's free days first, a
 *     date for another day) and answers `POST /myu/lines/answer {line_id, answer: {choice_id: "move", day: "YYYY-MM-DD"}}`; the answer's
 *     `draft` (the short message to the other person) shows under its readback, with Copy.
 *   "Add it?" (`answer_bears_on`, `report_bears_on`): Add it · No. Add it's answer carries the addition in the answer's own words
 *     (`draft: {to, in, thread_ref, text}`), shown with Copy and the one line saying where it goes.
 *   what has repeated, on a person's card (`noticed`, on the card or at the read's top level);
 *   they may ask about, on the prep (`may_ask`, three at most);
 *   your side of the work, on the weekly review (`your_side` at the top level of `GET /review/weekly`, or a section of the edition);
 *   Tell, on a promise someone else's decision affects (`check_promise`, `checkPromise.ts`): its message comes as an effect, read here.
 * Nothing is sent from the vault: a message is copied, and the person sends it.
 */

import { LAST_MOMENTS_WORDS, isBearsOnLine, mayAskFrom, repeatedFrom, yourWeekFrom, type MayAsk, type Repeated, type Source, type WeekGoal, type YourWeek } from './lastMoments';
import type { SpaceAnswer } from './wire';
import { CHECK_PROMISE_DRAFT_EFFECT, isCheckPromiseLine } from './checkPromise';

// ── the copies (shared `types/drafts.ts` and `types/webSend.ts`, word for word) ────────────

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const dayStart = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** When, as a person says it (the check's own rule): today, yesterday, a weekday within the week, else "12 March". */
export function draftWhen(ms: number | null | undefined, now: number): string {
  if (!ms || ms <= 0) return 'some time ago';
  const day = new Date(ms);
  const today = new Date(now);
  const ago = Math.round((dayStart(today) - dayStart(day)) / 86_400_000);
  if (ago === 0) return 'today';
  if (ago === 1) return 'yesterday';
  if (ago > 1 && ago < 7) return DAYS[day.getDay()];
  const dm = `${day.getDate()} ${MONTHS[day.getMonth()]}`;
  return day.getFullYear() === today.getFullYear() ? dm : `${dm} ${day.getFullYear()}`;
}

/** "02:10" in the person's own clock. */
export const clockWords = (at: string | number | null | undefined): string => {
  const ms = typeof at === 'number' ? at : at ? Date.parse(at) : NaN;
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export const SERVICE_LABELS: Record<string, string> = { slack: 'Slack', zulip: 'Zulip', github: 'GitHub', mail: 'mail', linear: 'Linear', jira: 'Jira', teams: 'Teams', microsoft: 'Microsoft', google: 'Google' };
const label = (service: string): string => SERVICE_LABELS[service.toLowerCase()] ?? service;

/** "in #platform on Slack", "in Slack", "on GitHub", "by mail" — the terminal's words, with the channel's name when there is one. */
export function placeWords(service: string, where?: string | null): string {
  const s = service.toLowerCase();
  const base: Record<string, string> = { slack: 'in Slack', zulip: 'in Zulip', github: 'on GitHub', mail: 'by mail' };
  const plain = base[s] ?? `in ${label(service)}`;
  if (!where) return plain;
  return s === 'mail' ? plain : `in ${where} on ${label(service)}`;
}

/** "Marcus", "Marcus and Lena", "Marcus, Lena and Priya"; "them" when only a conversation is named. */
export function whoWords(to: string[]): string {
  const n = to.map((x) => (x.includes('@') ? x : x.split(/\s+/)[0]));
  if (!n.length) return 'them';
  return n.length === 1 ? n[0] : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
}

/** The part of shared's `SendTarget` the copies read: who, as names, and the place's name. */
interface SendTarget {
  names: string[];
  where?: string | null;
}

/**
 * Who, for the dialog's sentence; null when the only recipient is the place itself (a question asked in #platform is answered in
 * #platform: `send_to.to` is the channel), so the sentence names the place once.
 */
export function whoFor(t: Pick<SendTarget, 'names' | 'where'>): string | null {
  const place = (t.where ?? '').trim().toLowerCase();
  const people = t.names.filter((n) => { const x = n.trim().toLowerCase(); return x && x !== place && !x.startsWith('#'); });
  return people.length ? whoWords(people) : null;
}

// ── the words the vault owns here (none the server sends, none the contract has) ─────────────

/** "today", "yesterday", "Monday", "12 March", as it follows "You told Sofia". */
const onWhen = (when: string | null): string => (!when ? '' : when === 'today' || when === 'yesterday' ? ` ${when}` : ` on ${when}`);
const upFirst = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export const LAST_MOMENTS_VAULT_WORDS = {
  /** Over the message a Move it came back with: "Myu's message to Priya:" (the web's and the terminal's words). */
  messageTo: (who: string | null): string => (who ? `Myu's message to ${who}:` : "Myu's message:"),
  /** Over the addition an Add it came back with, where it goes: "To prd-review in Slack", "On GitHub" (the web's words). */
  goesTo: (who: string | null, place: string): string => (who ? `To ${who} ${place}` : upFirst(place)),
  /** Under "Which day?": the date for a day the line did not offer. */
  anotherDay: 'Another day',
  /** "You told Sofia yesterday: “…”", made here only when the server sends the parts and not its own sentence. */
  told: (to: string | null, when: string | null, quote: string): string => `You told ${to ?? 'them'}${onWhen(when)}: “${quote}”`,
} as const;
const W = LAST_MOMENTS_VAULT_WORDS;

// ── readers ──────────────────────────────────────────────────

type Loose = Record<string, unknown>;
const obj = (v: unknown): Loose | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Loose) : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const norm = (s: string | null | undefined): string => (s ?? '').trim().toLowerCase();

/** The line's own choices with an id and words (the server's), in order. */
function served(choices: unknown): Array<{ id: string; label: string }> {
  return list(choices)
    .map(obj)
    .filter((c): c is Loose => !!c && !!str(c.id) && !!str(c.label))
    .map((c) => ({ id: str(c.id) as string, label: str(c.label) as string }));
}

// §4 What else falls on that day.

export type FullDayRole = 'keep' | 'move' | 'not_promise' | 'other';
export interface FullDayChoice {
  id: string;
  label: string;
  role: FullDayRole;
}

const fullDayRole = (id: string, words: string): FullDayRole => {
  const i = norm(id);
  const l = norm(words);
  const F = LAST_MOMENTS_WORDS.fullDay;
  if (i === 'keep' || l === norm(F.keep)) return 'keep';
  if (i === 'move' || i === 'move_it' || l === norm(F.move)) return 'move';
  if (i === 'not_promise' || i === 'not_a_promise' || l === norm(F.notPromise)) return 'not_promise';
  return 'other';
};

/** Keep · Move it · Not a promise: the server's own choices (known by id or by words), else the contract's words with the server's ids. */
export function fullDayChoices(line: { choices?: unknown }): FullDayChoice[] {
  const own = served(line.choices);
  if (own.length) return own.map((c) => ({ ...c, role: fullDayRole(c.id, c.label) }));
  const F = LAST_MOMENTS_WORDS.fullDay;
  return [
    { id: 'keep', label: F.keep, role: 'keep' },
    { id: 'move', label: F.move, role: 'move' },
    { id: 'not_promise', label: F.notPromise, role: 'not_promise' },
  ];
}

/** A day offered for "Move it" (the line's next free days first): the day as the answer carries it, and its words. */
export interface FreeDay {
  day: string;
  label: string;
}

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A day written `YYYY-MM-DD` that is a day of the calendar (what a date field gives, and what the answer carries). */
export function isDay(v: unknown): v is string {
  const m = typeof v === 'string' ? DAY_RE.exec(v.trim()) : null;
  if (!m) return false;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]);
}

/** "Monday 16 November", from a day written `YYYY-MM-DD` (the day alone, no zone in it). */
export function dayLabel(day: string): string {
  if (!isDay(day)) return day;
  const [y, m, d] = day.trim().split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${DAYS[date.getDay()]} ${d} ${MONTHS[m - 1]}`;
}

/** Today in the person's own calendar, as a date field writes it (the lower bound of "Another day"). */
export function todayIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Where a line keeps its free days: `free_days` (the backend's, 13 Nov), and the names the web also reads, on the line or its payload. */
const FREE_DAY_FIELDS = ['free_days', 'next_free_days', 'days', 'offer_days'];

/**
 * The days the line offers for "Move it", in its order: `'YYYY-MM-DD'`, or `{day | date, label | words}` (its own words when it gives
 * them, else "Monday 16 November"). None when it offers none; a day written twice shows once.
 */
export function freeDaysOf(line: unknown): FreeDay[] {
  const o = obj(line);
  const payload = obj(o?.payload);
  const raw = FREE_DAY_FIELDS.map((k) => o?.[k] ?? payload?.[k]).find((v) => Array.isArray(v));
  const out: FreeDay[] = [];
  for (const d of list(raw)) {
    const r = obj(d);
    const day = typeof d === 'string' ? d.trim() : r ? (str(r.day) ?? str(r.date)) : null;
    if (!day || !isDay(day) || out.some((x) => x.day === day)) continue;
    out.push({ day, label: (r ? (str(r.label) ?? str(r.words)) : null) ?? dayLabel(day) });
  }
  return out;
}

/** "Move it" with the day the person picked: the answer the backend confirmed (`{choice_id: "move", day}`). */
export const moveAnswer = (choiceId: string, day: string): SpaceAnswer => ({ choice_id: choiceId, day });

// §8 "Add it?".

export type BearsOnRole = 'add' | 'no' | 'other';
export interface BearsOnChoice {
  id: string;
  label: string;
  role: BearsOnRole;
}

/** Add it · No: the server's own choices (known by id or by words), else the contract's words with the server's ids. */
export function bearsOnChoices(line: { choices?: unknown }): BearsOnChoice[] {
  const A = LAST_MOMENTS_WORDS.addIt;
  const own = served(line.choices);
  if (own.length) {
    return own.map((c) => {
      const i = norm(c.id);
      const l = norm(c.label);
      const role: BearsOnRole = i === 'add' || i === 'add_it' || l === norm(A.add) ? 'add' : i === 'no' || l === norm(A.no) ? 'no' : 'other';
      return { ...c, role };
    });
  }
  return [
    { id: 'add', label: A.add, role: 'add' },
    { id: 'no', label: A.no, role: 'no' },
  ];
}

// §4, §8 The message an answer comes back with.

/** The message an answer carried, as the vault shows it: its words, the line over it, and who it is for. */
export interface AnswerDraft {
  text: string;
  /** "Myu's message to Priya:" after Move it; "To prd-review in Slack" after Add it, and after Tell. */
  lead: string;
  /** Who it is for, in words ("Priya"), for the box's label; null when the server names no one. */
  toName: string | null;
  /** The message's own readback, when it came as Tell's effect ("Here it is, to send."): said where the answer has none. */
  said: string | null;
  /** What must be seen with it, as the server wrote it (2026-11-19). */
  mustSee: string[];
}

/** The recipients of `draft.to`: names, or `{name, address}` (an address stands for a name it lacks). */
function recipients(v: unknown): string[] {
  return (Array.isArray(v) ? v : v ? [v] : [])
    .map((r) => (typeof r === 'string' ? r.trim() : (str(obj(r)?.name) ?? str(obj(r)?.address) ?? str(obj(r)?.email) ?? str(obj(r)?.id) ?? '')))
    .filter((x) => !!x);
}

/**
 * The message an answer comes back with (the backend, 13 Nov): "Move it" answers with the short message to the other person, "Add it"
 * with the addition in the answer's own words, as `draft: {to, in, text, thread_ref?}`. After Move it the line over it names who it is
 * for ("Myu's message to Priya:"); after Add it, where it goes ("To prd-review in Slack"; a channel named as the recipient is the place).
 * Tell, on a promise someone else's decision affects (kind `check_promise`), brings it as an effect instead: `{type:
 * "check_promise_draft", readback: "Here it is, to send.", draft}`, shown as Add it's is, its readback said over it.
 * The thread it goes into is never shown. Null when the answer carries none.
 * 2026-11-19 (build 18b): a draft carries `must_see` (what must be seen: "I can't send mail for you yet.", "To Carla Diaz at
 * carla@example.test.") and `connected` (false when nothing can send it). The line over it then never says it goes anywhere: none when
 * `must_see` says "To …" itself, "Myu's message to Carla:" when it cannot go.
 */
export function answerDraftOf(reply: unknown, line?: { kind?: string | null } | null): AnswerDraft | null {
  const o = obj(reply);
  const told = list(o?.effects).map(obj).find((e) => !!e && str(e.type) === CHECK_PROMISE_DRAFT_EFFECT) ?? null;
  const own = obj(o?.draft);
  const d = own ?? obj(told?.draft);
  const text = d ? (str(d.text) ?? str(d.draft)) : null;
  if (!d || !text) return null;
  const names = recipients(d.to ?? d.recipients);
  const service = str(d.in) ?? str(d.service);
  const where = str(d.where) ?? str(d.channel) ?? str(d.place) ?? names.find((n) => n.startsWith('#')) ?? null;
  const who = whoFor({ names, where });
  const placed = isBearsOnLine(line) || isCheckPromiseLine(line) || (!own && !!told);
  const mustSee = list(d.must_see).map(str).filter((x): x is string => !!x);
  const saysTo = mustSee.some((x) => /^To\s/.test(x));
  const lead = saysTo ? '' : placed && service && d.connected !== false ? W.goesTo(who, placeWords(service, where)) : W.messageTo(who);
  return { text, lead, toName: who, said: !own && told ? str(told.readback) : null, mustSee };
}

// §3 What has repeated.

const REPEATED_SECTIONS = new Set(['noticed', 'repeated', 'what_has_repeated']);

/** A card section that is "what has repeated" itself (drawn as its own part, not counted among the sections the pane cannot draw). */
export const isRepeatedSection = (s: unknown): boolean => REPEATED_SECTIONS.has(norm(str(obj(s)?.section_type)));

/**
 * "What has repeated" on a person's card: `noticed` on the card, or at the read's top level (the backend, 13 Nov), else in a section of
 * its own. Each sentence as the server gives it, with its sources. None when there is nothing.
 */
export function repeatedOf(read: unknown): Repeated[] {
  const own = repeatedFrom(read);
  if (own.length) return own;
  const o = obj(read);
  const card = obj(o?.card) ?? o;
  const section = list(card?.sections).map(obj).find((s) => !!s && isRepeatedSection(s));
  const data = obj(section?.data);
  return data ? repeatedFrom(data.noticed ?? data.items ?? data) : [];
}

// §5 They may ask about.

/** At most this many on the prep. */
export const MAY_ASK_SHOWN = 3;

/** "They may ask about" on the prep: the server's items, at most three. */
export const mayAskOf = (prep: unknown): MayAsk[] => mayAskFrom(prep).slice(0, MAY_ASK_SHOWN);

/** What the person already told them about it: the server's sentence, else made from who, when and the words. Null without words. */
export function toldWords(t: MayAsk['told'][number], now: number): string | null {
  if (t.sentence) return t.sentence;
  if (!t.quote) return null;
  return W.told(t.to, t.whenMs ? draftWhen(t.whenMs, now) : null, t.quote);
}

/** A step's day and time ("Monday 09:20", "Yesterday 14:02"); null without a time. */
export function stepWhen(ms: number | null, now: number): string | null {
  if (!ms) return null;
  const clock = clockWords(ms);
  return clock ? `${upFirst(draftWhen(ms, now))} ${clock}` : null;
}

// Sources, under what has repeated and what they may ask about.

/** A source's day in words ("Monday", "Yesterday", "12 March"); null when the server gives no time. */
export const sourceWhen = (s: Source, now: number): string | null => (s.whenMs ? upFirst(draftWhen(s.whenMs, now)) : null);

/** A web address the vault may open; anything else is not a link. */
export const webLink = (l: string | null | undefined): string | null => (l && /^https?:\/\//i.test(l.trim()) ? l.trim() : null);

// §1 Your side of the work.

const YOUR_SIDE_SECTIONS = new Set(['your_side', 'your_week', 'your_side_of_the_work']);

/** One of the weekly review's sections that is "your side of the work" itself (drawn by its own part, not with the others). */
export const isYourSideSection = (s: unknown): boolean => YOUR_SIDE_SECTIONS.has(norm(str(obj(s)?.section)));

/**
 * "Your side of the work" on the weekly review's read (`{edition, your_side?}`): at the top level (the backend, 13 Nov), on the edition,
 * or as a section of it. Null when the server sends none, or nothing in it is counted (the review then reads as before).
 */
export function yourWeekOf(edition: unknown, data?: unknown): YourWeek | null {
  const ed = obj(edition);
  const asSection = list(ed?.sections).map(obj).find((s) => !!s && isYourSideSection(s));
  const w = yourWeekFrom(data) ?? yourWeekFrom(ed) ?? (asSection ? yourWeekFrom({ your_side: asSection }) : null);
  return w && (w.counts.length > 0 || w.goals.length > 0) ? w : null;
}

/**
 * The weekly review as Today's "the week" shows it (the web's rule): the edition's sections but one that is "your side of the work",
 * and that part beside them. Nothing when there is no edition, it is not this week's or last week's (`fresh`, on its period), or it has
 * nothing to show; an edition whose only part is "your side of the work" shows.
 */
export function weekShown<E extends { period?: string; sections?: Array<{ section?: string }> }>(
  data: { edition?: E | null } | null | undefined,
  fresh: (period: string | undefined) => boolean,
): { edition: E; side: YourWeek | null } | null {
  const ed = data?.edition ?? null;
  if (!ed) return null;
  const side = yourWeekOf(ed, data);
  const sections = Array.isArray(ed.sections) ? ed.sections.filter((s) => !isYourSideSection(s)) : [];
  if ((!sections.length && !side) || !fresh(ed.period)) return null;
  return { edition: { ...ed, sections }, side };
}

/** One thing a count counted: its words, and who an open one waits on (the contract's `weekLines` words). */
export const weekItemWords = (i: { text: string; who: string | null }): string => `${i.text}${i.who ? ` · ${i.who}` : ''}`;

/** A goal beside the week: "Ship the import tool: 3" (no number when none was tied to it). */
export const goalWords = (g: WeekGoal): string => `${g.goal}${g.count > 0 ? `: ${g.count}` : ''}`;
