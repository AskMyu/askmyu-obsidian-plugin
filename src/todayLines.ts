/**
 * Today's lines, shaped for the pane: one row per person, company or space, one line
 * per row, the rest behind a count.
 *
 * The backend writes many lines per subject (a warning and a slip for every stale
 * commitment, a wait for each one past the day's budget), so a row per LINE buries the
 * pane: a person with sixty commitments is sixty rows. The web's Today folds the same
 * way (`web/src/components/lines/LineStack.tsx`); these are the same rules, with no
 * host calls, so they can be tested without Obsidian.
 */

import type { MyuLineLite } from './transport/api';

/** How many "for you" rows show before the rest fold. A row that needs you is never folded. */
export const FOR_YOU_ROWS = 5;

/** The grey waiting line: said, saved for another day. */
export function isWaitingLine(line: MyuLineLite): boolean {
  return line.ask_kind === 'wait';
}

/** A line whose dot shows. A line with no `state` (an older server) counts as released. */
export function lineNeedsYou(line: MyuLineLite): boolean {
  return !!line.needs_you && (line.state ?? 'released') === 'released';
}

/** Lines with words, and the same words on the same row only once (the backend sometimes writes a line twice). */
export function dedupeLines(lines: MyuLineLite[]): MyuLineLite[] {
  const seen = new Set<string>();
  const out: MyuLineLite[] = [];
  for (const l of lines) {
    const text = (l.text ?? '').trim();
    if (!text) continue;
    const key = `${l.ask_kind ?? ''}|${text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(l);
  }
  return out;
}

/**
 * The line that speaks for the row: the first that is not a wait, in the server's order (R19c orders a
 * person's lines time-bound first, and the surfaces keep that order), else the first. Mirror of shared
 * `foldLines`.
 */
export function topLine(lines: MyuLineLite[]): MyuLineLite | undefined {
  return lines.find((l) => !isWaitingLine(l)) ?? lines[0];
}

export interface LineStack {
  /** The one line on the row. Null when everything here is waiting: the row shows only the count. */
  top: MyuLineLite | null;
  /** Everything else, lines that speak first, waits last. Shown only when the row is opened. */
  rest: MyuLineLite[];
  /** "3 more · 12 saved for tomorrow", or null when there is nothing else. */
  count: string | null;
}

/** One row's lines: the one that speaks now, and the rest behind a count. */
export function stackOf(lines: MyuLineLite[]): LineStack {
  const all = dedupeLines(lines);
  const first = topLine(all);
  if (!first) return { top: null, rest: [], count: null };
  const top = isWaitingLine(first) ? null : first;
  const others = all.filter((l) => l !== top);
  const waits = others.filter(isWaitingLine);
  const speaking = others.filter((l) => !isWaitingLine(l));
  const parts = [
    speaking.length > 0 ? `${speaking.length} more` : null,
    waits.length > 0 ? `${waits.length} saved for tomorrow` : null,
  ].filter((p): p is string => p !== null);
  return { top, rest: [...speaking, ...waits], count: parts.length ? parts.join(' · ') : null };
}

export interface SubjectGroup {
  /** `type:id`, or `other` for lines that sit on nothing with a name. */
  key: string;
  type: string;
  id: string;
  label: string;
  lines: MyuLineLite[];
  needsYou: boolean;
}

/** A role people are interviewed for, as the server names that subject: what a drafted interview debrief belongs to. */
export const ROLE_SUBJECT = 'debrief_role';

/** The draft's own choice, as the server names it ("Not an interview", whatever its words). */
const NOT_AN_INTERVIEW = 'not_interview';

/**
 * A drafted interview debrief's line (2026-10-06): the choice line Myu writes to the hiring manager when it finds an
 * interview on a calendar ("Send invites" or "Send now", "Not an interview", "Not this one", in the server's words).
 * The line is the draft: nothing is sent until it is answered, or, with the role's switch on, a few minutes after it
 * was seen. The server sends it about nothing with a name (no subject), so it is known by its own choice, never by a
 * label.
 */
export function isDraftLine(line: Pick<MyuLineLite, 'choices'>): boolean {
  return (line.choices ?? []).some((c) => c?.id === NOT_AN_INTERVIEW);
}

function fallbackLabel(type: string): string {
  return type === 'space' ? 'A space' : type === 'company' ? 'A company' : type === ROLE_SUBJECT ? 'Interview debrief' : 'Someone';
}

/**
 * Whether a row has a conversation to open ("talk about this ▸", the Today note's `talk ▸`). A drafted interview
 * debrief has none (its line is answered on the row), and neither has a row about nothing with a name.
 */
export function rowOpensConversation(g: Pick<SubjectGroup, 'type' | 'id'>): boolean {
  return !!g.id && g.type !== ROLE_SUBJECT;
}

/**
 * Lines grouped by what they are about, in order of first appearance. A line about nothing
 * that can be opened (no id) joins one quiet group at the end instead of a row each. A drafted
 * interview debrief is a row of its own, one per draft, named by its role when the server names it.
 */
export function groupBySubject(lines: MyuLineLite[]): SubjectGroup[] {
  const groups = new Map<string, SubjectGroup>();
  const other: MyuLineLite[] = [];
  for (const l of lines) {
    // The same words about two different people are two things: dedupe per row, below.
    if (!(l.text ?? '').trim()) continue;
    const s = l.subjects?.[0];
    const type = l.conversation?.subject_type ?? s?.type ?? 'person';
    const id = l.conversation?.subject_id ?? s?.id ?? '';
    // Each draft is its own decision, and it is seen (and so sent) only when its line shows: never behind a count.
    if (isDraftLine(l) && (!id || type === ROLE_SUBJECT)) {
      const key = `draft:${l.line_id}`;
      groups.set(key, { key, type: ROLE_SUBJECT, id, label: s?.label?.trim() || fallbackLabel(ROLE_SUBJECT), lines: [l], needsYou: lineNeedsYou(l) });
      continue;
    }
    if (!id) {
      other.push(l);
      continue;
    }
    const key = `${type}:${id}`;
    const g = groups.get(key);
    if (g) {
      g.lines.push(l);
      g.needsYou = g.needsYou || lineNeedsYou(l);
      if (g.label === fallbackLabel(type) && s?.label) g.label = s.label;
    } else {
      groups.set(key, { key, type, id, label: s?.label?.trim() || fallbackLabel(type), lines: [l], needsYou: lineNeedsYou(l) });
    }
  }
  const out = [...groups.values()];
  if (other.length) out.push({ key: 'other', type: '', id: '', label: 'Other', lines: other, needsYou: other.some(lineNeedsYou) });
  for (const g of out) g.lines = dedupeLines(g.lines);
  return out;
}

/**
 * Which rows show and which fold. Rows that need you come first and are never folded;
 * the rest keep the backend's order. At most `limit` rows show, unless more than that need you.
 */
export function foldRows(groups: SubjectGroup[], limit: number = FOR_YOU_ROWS): { shown: SubjectGroup[]; folded: SubjectGroup[] } {
  const ordered = [...groups.filter((g) => g.needsYou), ...groups.filter((g) => !g.needsYou)];
  const keep = Math.max(limit, ordered.filter((g) => g.needsYou).length);
  return { shown: ordered.slice(0, keep), folded: ordered.slice(keep) };
}
