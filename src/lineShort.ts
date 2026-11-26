// A line shown short first (2026-11-19, the operator on his today list: "btw its better but now the items are rather long...."; the
// planning side's proposal, not yet confirmed by him, so it is one switch: `LINE_SHORT_ON`). Byte copies: packages/cli/src/lineShort.ts,
// packages/obsidian/src/lineShort.ts; one cut for every surface, so they all cut at the same place.
//
// A line's words show their first two lines, and no more than about 240 characters (cut at a word, with "…"); a quiet "read all"
// opens the rest in place. A line already that short shows whole, with nothing to open. Only the words are cut: the choices, and anything to press,
// stay under the short form. The server may later send a short form of its own; given, it is preferred. A question in the words is never
// cut (2026-11-24): only the words around it.

/** The one switch: false shows every line whole, as before. */
export const LINE_SHORT_ON = true;
/** How many lines of words show before "more". */
export const LINE_SHORT_LINES = 2;
/** No more than about this many characters show before "more". */
export const LINE_SHORT_CHARS = 240;
/**
 * The quiet word that opens the rest of a line's words in place: "read all", never "more", so it is not taken for a count ("31 more
 * are waiting" is rows; "1 more — show ▸" is a row's other lines; "read all" is this line's words).
 */
export const LINE_MORE_WORD = 'read all';

export interface LineShort {
  /** What shows first. */
  short: string;
  /** Whether there is more: "more" shows only then. */
  cut: boolean;
}

/**
 * What must be seen before a yes stays in the short form, after the first two lines and before "read all" (2026-11-19). The server's own
 * `must_see` (an array of sentences on a send line, and on a draft where a yes follows), in the order given; for a server that sends no
 * field, matched on the line's own words:
 *   · a send line that cannot go ("Connect mail to Myu, or use a coding tool that can send to mail, so this can go."; as cut it sat
 *     behind "read all" and the first thing he met was "Send it"); it leaves when the server sends that sentence as a field of its own;
 *   · how the message goes ("Goes by mail from Myu, with your name on it.", "Goes through your …");
 *   · the send's mode: "This is a trial setup…" (nothing really sent) and "‹name› will not get this here…" (only listed recipients).
 */
const MUST_SEE: readonly RegExp[] = [/so this can go\.$/, /^Goes (by mail from Myu|through your)\b/, /^This is a trial setup\b/, /\b(won't get it from here|will not get this here)\b/];

/**
 * Lines shown whole, never short (2026-11-19, the backend's renders for build 18): a send line's words are what the yes sends ("Send this
 * to Dana by mail, as you?", how it goes, who will not get it, then the message after a blank line); cut, the message itself went behind
 * "read all" and "Send it" came before the words it sends.
 */
export const LINE_WHOLE_KINDS: readonly string[] = ['send', 'send_many', 'send_batch'];

/**
 * A line's words, short: the server's own short form where it gives one, else the first two lines, at most about 240 characters; then
 * what must be seen before a yes (`mustSee`, the server's; else matched on the words). `cut`: some of the words are still not shown.
 * Its question is never cut (2026-11-24, the operator: a question shown short was not one he could answer): a row of the short form cut
 * inside a question runs on to the question's end, and a question past the short form comes right after it, before what must be seen.
 * Only the words around a question are cut; the choices under the words are not these words, and stay whole on every surface.
 */
export function lineShortForm(words: string | null | undefined, serverShort?: string | null, mustSee?: readonly unknown[] | null, kind?: string | null): LineShort {
  const whole = (words ?? '').trim();
  if (!LINE_SHORT_ON || (!!kind && LINE_WHOLE_KINDS.includes(kind))) return { short: whole, cut: false };
  const own = typeof serverShort === 'string' ? serverShort.trim() : '';
  const rows = whole.split('\n').map((r) => r.trim()).filter(Boolean);
  const shortOf = (own && own.length < whole.length ? own : cutOf(whole))
    .split('\n')
    .map((r) => toQuestionEnd(r, rows))
    .join('\n');
  // Each question not yet in sight, in the words' order; then what must be seen before a yes, right after the short form, before "read
  // all": the server's, in its order; else matched.
  const asking = rows.map(questionOf).filter((q): q is string => !!q);
  const given = Array.isArray(mustSee) ? mustSee.map((s) => (typeof s === 'string' ? s.trim() : '')).filter(Boolean) : null;
  const wanted = given ?? rows.filter((r) => MUST_SEE.some((m) => m.test(r)));
  const kept = [...new Set([...asking, ...wanted])].filter((r) => !shortOf.includes(r));
  const short = kept.length ? `${shortOf}\n${kept.join('\n')}` : shortOf;
  return { short, cut: rows.some((r) => !short.includes(r)) };
}

/**
 * A row's question: the row up to the end of its last sentence that asks, one that ends with a bare "?" ("“Ready?”" is someone's words,
 * quoted, not a question to him). What follows it in the same row is words like any other: a line parked for another day ends "… or drop
 * it? Three things need you today already; Myu will check this with you tomorrow.", and that last sentence may be cut. Null: it asks nothing.
 */
function questionOf(row: string): string | null {
  const t = row.trim();
  for (let i = t.length - 1; i >= 0; i--) if (t[i] === '?' && (i === t.length - 1 || /\s/.test(t[i + 1]))) return t.slice(0, i + 1);
  return null;
}

/** A row of the short form cut inside a question ("… tell James, or…"): run on to the question's end, "…" after it where its row goes on. */
function toQuestionEnd(row: string, rows: readonly string[]): string {
  if (!row.endsWith('…')) return row;
  const stem = row.slice(0, -1).trim();
  const from = rows.find((r) => r.length > stem.length && r.startsWith(stem));
  const question = from ? questionOf(from) : null;
  if (!from || !question || question.length <= stem.length) return row;
  const lead = /^\s*/.exec(row)?.[0] ?? '';
  return `${lead}${question}${from.length > question.length ? '…' : ''}`;
}

/** One row, or the first two rows of an item past the limit, cut at a word with "…" to `max` characters. */
function cutAt(text: string, max: number): string {
  if (text.length <= max) return text;
  const room = text.slice(0, max);
  const at = Math.max(room.lastIndexOf(' '), room.lastIndexOf('\n'));
  return `${(at > max / 2 ? room.slice(0, at) : room).trimEnd()}…`;
}

const heading = (row: string): boolean => row.trim().endsWith(':');
const bullet = (row: string): boolean => /^[•·\-*]\s/.test(row.trim());
/** An item's row at its usual one-line length, when the short form would otherwise run past the limit. */
const ONE_LINE_CHARS = LINE_SHORT_CHARS / 2;
/**
 * At most this many rows of the first item under a heading: a bulleted item runs to the next bullet, at most three rows; an unbulleted
 * one is at most two (2026-11-19: a check's finding is two rows, "It says…" and "You decided…", with the next finding right under it).
 */
const ITEM_ROWS_BULLETED = 3;
const ITEM_ROWS_PLAIN = 2;

/**
 * The first two lines of words, at most about 240 characters, cut at a word with "…". Never ending on a heading (2026-11-19, the
 * operator's screen: "That affects something you promised: read all" hid the thing itself), and never whole because of one (the same
 * evening: a document's check line, twelve rows, showed whole): a short form that would end on a heading runs on, past the headings
 * under it, to the end of the first item (the rows up to the next blank line, heading or bullet; at most three for a bulleted item, two
 * for an unbulleted one). Past the limit, each of
 * the item's rows is cut at one line's length. A line of headings only: as many rows as the limit holds.
 */
function cutOf(whole: string): string {
  const rows = whole.split('\n');
  let seen = 0;
  let end = rows.length;
  for (let i = 0; i < rows.length; i++) {
    if (!rows[i].trim()) continue;
    seen += 1;
    if (seen === LINE_SHORT_LINES) {
      end = i + 1;
      break;
    }
  }
  const short = rows.slice(0, end).join('\n').trimEnd();
  if (!short.endsWith(':')) return cutAt(short, LINE_SHORT_CHARS);
  // To the first item: past blank lines and the headings under this one.
  let first = end;
  while (first < rows.length && (!rows[first].trim() || heading(rows[first]))) first += 1;
  if (first >= rows.length) {
    // Headings only: as many rows as the limit holds (the first always).
    const kept: string[] = [];
    for (const r of rows.filter((x) => x.trim())) {
      if (kept.length && [...kept, r].join('\n').length > LINE_SHORT_CHARS) break;
      kept.push(r);
    }
    return cutAt(kept.join('\n').trimEnd(), LINE_SHORT_CHARS);
  }
  const rowsMax = bullet(rows[first]) ? ITEM_ROWS_BULLETED : ITEM_ROWS_PLAIN;
  let last = first + 1;
  while (last < rows.length && last - first < rowsMax && rows[last].trim() && !heading(rows[last]) && !bullet(rows[last])) last += 1;
  const taken = rows.slice(0, last);
  const joined = taken.join('\n').trimEnd();
  if (joined.length <= LINE_SHORT_CHARS) return joined;
  return taken.map((r, at) => (at >= first ? cutAt(r, ONE_LINE_CHARS) : r)).join('\n').trimEnd();
}
