/**
 * The post: the meeting's page after the meeting is the meeting's record (2026-10-30; BRIEF_WEB_MEETING_POST_20261030)
 * — the plugin's copy of shared `types/meetingPost.ts`, the same below this header
 * (`tests/internal/meetingPostParity.test.ts` holds it). The fixed words every surface uses (the server's own words win
 * where it sends them; never a side; never "gap", "lacking", "missing") and the pure pieces drawn from the payload: what
 * wrote the record, Yours, the folds' lines, a list item's state after, since last time's rows, the card's Between you,
 * a past meeting in a line. Pure.
 */

import type { AfterItem, PostSource, PrepAfter, PrepHistoryRow, PrepListItem, SinceLastRow } from './prep';
import type { BetweenRow } from './cards';
import { checkRecordRow } from './checkWords';

export const MEETING_POST_WORDS = {
  openNotes: 'Open the notes ▸',
  yours: 'Yours',
  toDo: 'To do',
  todoCount: (n: number) => `${n} to do`,
  covered: (done: number, total: number) => `${done} of ${total} covered`,
  cameUpFromNotes: 'came up · from the notes',
  didntComeUp: 'didn’t come up',
  carriedTo: (date: string) => `Carried to ${date}`,
  drop: 'Drop',
  decided: 'Decided',
  owes: (first: string) => `${first} owes`,
  theyOwe: 'They owe',
  owedByOthers: 'Owed by others',
  countPeople: (n: number, m: number) => `${n} · ${m} ${m === 1 ? 'person' : 'people'}`,
  items: (n: number) => `${n} ${n === 1 ? 'item' : 'items'}`,
  cameUp: 'Came up',
  topics: (n: number) => `${n} ${n === 1 ? 'topic' : 'topics'}`,
  room: 'The room',
  roomCount: (n: number) => `${n} people · who said what`,
  turns: (n: number) => `${n} ${n === 1 ? 'turn' : 'turns'}`,
  talkTime: (pct: number) => `${pct}% of the talk`,
  yourNotes: 'Your notes',
  lines: (n: number) => `${n} ${n === 1 ? 'line' : 'lines'}`,
  more: 'more ▾',
  less: 'less ▴',
  yesterday: 'Yesterday',
  older: (n: number) => `+ ${n} older ▸`,
  pastFrom: (from: string, to: string) => `past, from ${from} to ${to}`,
  between: 'Between you',
  pastOneOnOnes: 'Past 1:1s',
  youOwe: 'You owe',
  youOwed: 'You owed',
  due: (day: string) => `due ${day}`,
  open: 'open',
  done: 'done',
  past: 'past',
  noNotes: 'no notes',
  decisions: (n: number) => `${n} ${n === 1 ? 'decision' : 'decisions'}`,
  actions: (n: number) => `${n} ${n === 1 ? 'action' : 'actions'}`,
  yoursCount: (n: number) => `${n} yours`,
  /** The server's line when nothing at all was written (it sends its own; this is the same words). */
  nothing: 'Nothing was written for this one yet. Notes from Drive come in when it syncs. Tick what came up, or write a line.',
} as const;

/** What wrote a record, as the source line names it ("Notes by Gemini"), and in a past meeting's row ("notes by Gemini"). */
const SOURCE_WORDS: Record<string, string> = {
  google_drive: 'Notes by Gemini',
  gemini: 'Notes by Gemini',
  fireflies: 'Notes by Fireflies',
  otter: 'Notes by Otter',
  typed: 'Your notes',
  capture: 'Your notes',
  paste: 'Pasted notes',
};

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const list = <T,>(v: readonly T[] | null | undefined): readonly T[] => (Array.isArray(v) ? (v as readonly T[]) : []);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * An instant or a calendar day as a moment to read in local time. A due date is a calendar day: sent as a day, or as
 * that day's midnight UTC ("2026-11-02T00:00:00Z"), it is that day wherever the person is, never the day before.
 */
function dayMoment(s: string): number {
  const day = /^(\d{4}-\d{2}-\d{2})(?:T00:00(?::00(?:\.0+)?)?Z)?$/.exec(s);
  return Date.parse(day ? `${day[1]}T12:00:00` : s);
}

/** "30 Oct" from an instant or a calendar day; the words as they are when they are not a date. */
export function postDate(v: unknown): string {
  const s = str(v);
  if (!s) return '';
  const t = dayMoment(s);
  if (!Number.isFinite(t)) return s;
  const d = new Date(t);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "Thu 29 Oct". */
export function postDay(v: unknown): string {
  const s = str(v);
  const t = dayMoment(s);
  if (!Number.isFinite(t)) return s;
  const d = new Date(t);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** What wrote it, in words: "Notes by Gemini"; a title the server sends wins; a kind not named here, none. */
export function sourceWords(source: Pick<PostSource, 'kind' | 'title'> | string | null | undefined): string | null {
  if (!source) return null;
  if (typeof source === 'string') return SOURCE_WORDS[source] ?? null;
  return str(source.title) || SOURCE_WORDS[str(source.kind)] || null;
}

/** The source line: "Notes by Gemini · 30 Oct", one per source. */
export function sourceLines(after: Pick<PrepAfter, 'sources'> | null | undefined): Array<{ text: string; meeting_id: string | null }> {
  return list(after?.sources)
    .map((s) => {
      const name = sourceWords(s);
      if (!name) return null;
      const day = postDate(s.at);
      return { text: day ? `${name} · ${day}` : name, meeting_id: str(s.meeting_id) || null };
    })
    .filter((x): x is { text: string; meeting_id: string | null } => !!x);
}

/**
 * The page after a meeting has its record in: a to-do of yours, a decision or something owed from it, or a source other than the
 * person's own typing (a recorder's notes, a pasted transcript). Until then the page is the person's ticks, carry, notes
 * and Myu's one line. Every surface asks this one question the same way.
 */
export function postHasRecord(after: PrepAfter | null | undefined): boolean {
  if (!after) return false;
  // The server sends Yours on every after page (2026-10-30, IMPL_MEETING_POST): it is the record only with a to-do in it.
  if (list(after.yours?.todo).length > 0 || list(after.decided).length > 0 || list(after.owed).length > 0) return true;
  return list(after.sources).some((s) => !!str(s?.kind) && str(s.kind) !== 'typed');
}

/** "Yours · 3 to do · 2 of 3 covered" (the parts there are). */
export function yoursLabel(after: Pick<PrepAfter, 'yours'> | null | undefined, items?: readonly PrepListItem[]): string {
  const W = MEETING_POST_WORDS;
  const todo = list(after?.yours?.todo).length;
  const cov = after?.yours?.covered ?? (items && items.length ? { done: items.filter((i) => i.done || !!str(i.covered_by)).length, total: items.length } : null);
  return [W.yours, todo ? W.todoCount(todo) : null, cov && cov.total ? W.covered(cov.done, cov.total) : null].filter(Boolean).join(' · ');
}

/** A list item after the meeting: ticked by the person, found in the notes, or not come up (with where it went). */
export function postItemState(item: PrepListItem): { kind: 'ticked' | 'notes' | 'carried' | 'not'; text: string | null; drop: boolean } {
  const W = MEETING_POST_WORDS;
  if (item.done || str(item.covered_by) === 'user') return { kind: 'ticked', text: null, drop: false };
  if (str(item.covered_by) === 'notes') return { kind: 'notes', text: W.cameUpFromNotes, drop: false };
  const date = str(item.carried_to?.date);
  if (date) return { kind: 'carried', text: `${W.didntComeUp} · ${W.carriedTo(date)}`, drop: !!str(item.carried_to?.item_id) };
  return { kind: 'not', text: W.didntComeUp, drop: false };
}

/** A to-do row: its words, its source under it, its date on the right. */
export function todoRow(item: AfterItem): { text: string; sub: string | null; right: string | null } {
  return { text: str(item.text), sub: str(item.source) || null, right: str(item.when) ? postDay(item.when) : null };
}

export type FoldKey = 'decided' | 'owed' | 'came_up' | 'room' | 'notes';

/**
 * The folded sections after the meeting, each one line with its count, in order: Decided · 2; Reid owes · 3 · due 2 Nov
 * (a 1:1) or Owed by others · 22 · 8 people (a group); Came up · 7 topics; The room · 9 people · who said what (a group);
 * Your notes · 2 lines. A section with nothing in it is left out.
 */
export function postFolds(
  after: PrepAfter | null | undefined,
  meeting: { kind?: string | null; firstName?: string | null },
): Array<{ key: FoldKey; label: string; count: string }> {
  const W = MEETING_POST_WORDS;
  if (!after) return [];
  const out: Array<{ key: FoldKey; label: string; count: string }> = [];
  const decided = after.counts?.decided ?? list(after.decided).length;
  if (decided > 0) out.push({ key: 'decided', label: W.decided, count: String(decided) });
  const owed = list(after.owed);
  const owedCount = after.counts?.owed_by_others ?? owed.reduce((n, o) => n + (o.count || list(o.items).length), 0);
  const oneOnOne = meeting.kind === 'one_on_one';
  if (owedCount > 0) {
    if (oneOnOne && owed.length <= 1) {
      const due = owed.flatMap((o) => list(o.items)).map((i) => str(i.when)).filter(Boolean).sort()[0];
      const first = str(meeting.firstName) || str(owed[0]?.owner_name).split(/\s+/)[0] || '';
      out.push({ key: 'owed', label: first ? W.owes(first) : W.owedByOthers, count: [String(owedCount), due ? W.due(postDate(due)) : null].filter(Boolean).join(' · ') });
    } else {
      const people = owed.filter((o) => o.owner !== 'both' && o.owner !== 'group').length || owed.length;
      out.push({ key: 'owed', label: W.owedByOthers, count: W.countPeople(owedCount, people) });
    }
  }
  const topics = after.counts?.topics ?? list(after.came_up).length;
  if (topics > 0) out.push({ key: 'came_up', label: W.cameUp, count: W.topics(topics) });
  const room = after.room?.count ?? list(after.room?.people).length;
  if (!oneOnOne && room > 0) out.push({ key: 'room', label: W.room, count: W.roomCount(room) });
  const notes = after.counts?.notes_lines ?? str(after.notes?.text).split('\n').filter((l) => l.trim()).length;
  if (notes > 0) out.push({ key: 'notes', label: W.yourNotes, count: W.lines(notes) });
  return out;
}

/** One person's row in Owed by others: the name, "3 items", the gist. */
export function owedRow(o: { owner_name?: string | null; count?: number; gist?: string | null; items?: readonly AfterItem[] }): { name: string; count: string; gist: string | null } {
  const n = o.count || list(o.items).length;
  return { name: str(o.owner_name), count: MEETING_POST_WORDS.items(n), gist: str(o.gist) || null };
}

/** A row of since last time: DECIDED / {FIRST} OWES / YOU OWED / YOU OWE, the words, the source under, the state on the right. */
export function sinceLastRow(row: SinceLastRow, first: string): { label: string; text: string; sub: string | null; right: string | null; done: boolean } {
  const W = MEETING_POST_WORDS;
  const label = row.kind === 'decided' ? W.decided : row.kind === 'they_owe' ? (first ? W.owes(first) : W.theyOwe) : row.kind === 'you_owed' ? W.youOwed : W.youOwe;
  const state = str(row.state);
  let right: string | null = null;
  if (row.kind === 'decided') right = str(row.when) ? postDate(row.when) : null;
  else if (state === 'done') {
    const proof = [str(row.proof?.source), row.proof?.at ? postDate(row.proof.at) : ''].filter(Boolean).join(', ');
    right = proof ? `${W.done} · ${proof}` : W.done;
  } else if (state === 'past') right = W.past;
  else right = [str(row.when) ? W.due(postDate(row.when)) : null, W.open].filter(Boolean).join(' · ');
  return { label, text: str(row.text), sub: str(row.source) || null, right, done: state === 'done' };
}

/** The meeting since last time came from: "1:1, 29 Oct · notes by Gemini". */
export function sinceLastMeeting(meeting: { title?: string | null; at?: string | null; source?: string | null } | null | undefined): string | null {
  if (!meeting) return null;
  const src = str(meeting.source);
  const srcWords = (SOURCE_WORDS[src] ?? src).replace(/^Notes by/, 'notes by').replace(/^Your notes/, 'your notes').replace(/^Pasted notes/, 'pasted notes');
  const head = [str(meeting.title), meeting.at ? postDate(meeting.at) : ''].filter(Boolean).join(', ');
  return [head, srcWords].filter(Boolean).join(' · ') || null;
}

/** A Between you row: YOU OWE / {FIRST} OWES, the words, the source and the meeting under, the date on the right. */
export function betweenRow(row: BetweenRow, first: string): { label: string; text: string; sub: string | null; right: string | null } {
  const W = MEETING_POST_WORDS;
  const meeting = row.meeting ? [str(row.meeting.title), row.meeting.at ? postDate(row.meeting.at) : ''].filter(Boolean).join(', ') : '';
  const sub = [str(row.source), meeting].filter(Boolean).join(' · ') || null;
  // What was decided, what the person was told (2026-11-10, BRIEF_FRONTEND_THE_CHECK §4): the check's own words for it.
  if (row.kind === 'decided' || row.kind === 'told') {
    const r = checkRecordRow(row, Date.now());
    return { label: r.label, text: r.text, sub: [r.sub, sub].filter(Boolean).join(' · ') || null, right: r.right };
  }
  const when = str(row.when);
  const right = when ? (/^\d{4}-\d{2}-\d{2}/.test(when) ? W.due(postDay(when)) : when) : null;
  return { label: row.kind === 'they_owe' ? (first ? W.owes(first) : W.theyOwe) : W.youOwe, text: str(row.text), sub, right };
}

/** "+ 4 older ▸ past, from January to March". */
export function olderLine(older: { count?: number; note?: string | null } | null | undefined): string | null {
  const n = older?.count ?? 0;
  if (!n) return null;
  return [MEETING_POST_WORDS.older(n), str(older?.note)].filter(Boolean).join(' ');
}

/** A past meeting in a line: "Thu 29 Oct · 2 of 3 covered · 2 decisions · 7 actions · notes by Gemini" (or "no notes"). */
export function pastMeetingWords(row: PrepHistoryRow): string {
  const W = MEETING_POST_WORDS;
  const cov = row.covered ?? (row.items_total ? { done: row.items_done ?? 0, total: row.items_total } : null);
  const src = str(row.source);
  const srcWords = !src || src === 'none' ? W.noNotes : (SOURCE_WORDS[src] ?? src).replace(/^Notes by/, 'notes by').replace(/^Your notes/, 'your notes').replace(/^Pasted notes/, 'pasted notes');
  return [
    row.starts_at ? postDay(row.starts_at) : null,
    cov && cov.total ? W.covered(cov.done, cov.total) : null,
    row.decisions ? W.decisions(row.decisions) : null,
    row.actions ? W.actions(row.actions) : null,
    srcWords,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * A meeting record's counts in a calendar or a list: "2 decisions · 16 actions · 5 yours", from the one ledger (the
 * extractor's own counts only when a server sends no ledger's).
 */
export function meetingRecordCounts(m: { decisions?: unknown; actions?: number; actions_yours?: number; decision_count?: number; action_item_count?: number }): string {
  const W = MEETING_POST_WORDS;
  // A list row's `decisions` is the ledger's count; a record read in full carries its decisions as a list instead.
  const ledgerDecisions = typeof m.decisions === 'number' ? m.decisions : null;
  const ledger = typeof m.actions === 'number' || ledgerDecisions !== null;
  const decisions = ledger ? ledgerDecisions ?? 0 : m.decision_count ?? 0;
  const actions = ledger ? m.actions ?? 0 : m.action_item_count ?? 0;
  const yours = ledger ? m.actions_yours ?? 0 : 0;
  return [decisions ? W.decisions(decisions) : null, actions ? W.actions(actions) : null, yours ? W.yoursCount(yours) : null].filter(Boolean).join(' · ');
}

/** A Yesterday row's count: "· 2 of 3 covered". */
export function yesterdayCount(row: { covered?: { done: number; total: number } | null }): string | null {
  return row.covered && row.covered.total ? MEETING_POST_WORDS.covered(row.covered.done, row.covered.total) : null;
}

/** Where a fold's open or shut is remembered, per meeting page (a per-viewer convenience). */
export function foldMemoryKey(eventId: string, key: string): string {
  return `askmyu.postFold.${eventId}.${key}`;
}
