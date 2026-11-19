/**
 * The check against what the person decided, promised and was told (2026-11-10, BRIEF_FRONTEND_THE_CHECK_20261110; the backend's
 * `POST /myu/check`, a line of kind `check`, and `RecordWords.java`). One layout for every place it shows: `myu_check` and `myu check`
 * in the terminal, the line in the coding tool and in `myu today`, and the web's line. Contradictions first, each as the two sets of
 * exact words with who and when; then what bears on it and is not mentioned; then what Myu cannot tell and who would know; then what
 * was compared. None of our names for the parts (decision, told, settled, entry, claim, record) is ever shown: the sentences below are
 * the operator's table, word for word, and the backend's own where it composes them. Pure, no imports, so the CLI keeps a byte-for-byte
 * copy (`packages/cli/src/checkWords.ts`, held by its test).
 */

/** Something on the person's side the thing is read against: its exact words, who, when, and where it came from. */
export interface CheckEntry {
  id?: string | null;
  /** decision | told | promise | ask | agreement | in_your_name | did */
  kind?: string | null;
  /** me | them | both | group: whose it is. */
  owner?: string | null;
  quote: string;
  /** The other person's name, as the server has it (the first name is shown). */
  who?: string | null;
  when_ms?: number | null;
  link?: string | null;
}

/** What the thing says, word for word, and where in it ("page 4", "Limits, lines 12–40"). */
export interface CheckClaim {
  quote: string;
  where?: string | null;
}

export interface CheckAnswer {
  contradicts?: Array<{ claim: CheckClaim; entry: CheckEntry; why?: string | null }> | null;
  bears?: Array<{ entry: CheckEntry; why?: string | null }> | null;
  unknown?: Array<{ claim: CheckClaim; who_would_know?: string[] | null; code?: string | null }> | null;
  compared?: { entries?: number | null; since_ms?: number | null } | null;
  limited?: { pages?: number | null; checked_chars?: number | null; of_chars?: number | null } | null;
  /** The server's own sentences, laid out its way: shown only when the parts above are not there. */
  words?: string | null;
  /** A long thing: read later, and told as a line. */
  queued?: boolean | null;
  check_id?: string | null;
  link?: string | null;
  already?: boolean | null;
  /**
   * Someone else's decision read against the record (the backend, 13 Nov: `RecordCheck.touchRead`): who decided, what it touches, and the
   * person's own promises it affects. The server lays these out in its own words ("Hannah decided, today: “…”", "That affects something
   * you promised:", "It also touches:"), which this layout does not know, so such a line is shown in the server's words.
   */
  decider?: string | null;
  touches?: unknown[] | null;
  promises?: unknown[] | null;
}

/** A line about a promise someone else's decision affects (13 Nov): Tell <name> · Let it go · Keep it, the person's own to answer. */
export const CHECK_PROMISE_KIND = 'check_promise';
export const isCheckPromiseLine = (line: { kind?: string | null } | null | undefined): boolean => line?.kind === CHECK_PROMISE_KIND;
/** The choices when the server sends none of its own (it always does; these are its words). */
export const CHECK_PROMISE_CHOICES = [
  { id: 'tell', label: 'Tell them' },
  { id: 'let_go', label: 'Let it go' },
  { id: 'keep', label: 'Keep it' },
] as const;
/** What Tell comes back with: an effect of this type carrying `draft: {to, in, thread_ref, text}` and its `readback`. */
export const CHECK_PROMISE_DRAFT_EFFECT = 'check_promise_draft';

export const CHECK_WORDS = {
  intro: 'Myu checked this against what you have decided, promised and been told.',
  nothing: 'Nothing in this goes against what you decided, promised or were told.',
  related: 'Related, and not mentioned in it:',
  cannotTell: 'Myu cannot tell, and who to ask:',
  notInCode: 'Myu has not confirmed this in the code.',
  queued: 'Myu is reading it against what you decided, promised and were told, and will tell you what it finds.',
  lead: {
    decided: 'This says one thing; you decided another:',
    decidedOther: 'This says one thing; it was decided otherwise:',
    youSaid: 'This says one thing; you said another:',
    told: 'This says one thing; you were told another:',
    promised: 'This says one thing; you promised another:',
    agreed: 'This says one thing; you agreed another:',
    asked: 'This says one thing; you were asked another:',
    youAsked: 'This says one thing; you asked another:',
    did: 'This says one thing; your agent did another:',
  },
  /** "a decision / a told entry, in a list" */
  listDecided: 'Decided',
  listTold: 'You were told',
  listYouTold: (name: string): string => `You told ${name}`,
} as const;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** The first name, as a person says it. */
export function checkFirstName(name: string | null | undefined): string | null {
  const n = (name ?? '').trim();
  if (!n) return null;
  return n.includes('@') ? n.split('@')[0] : n.split(/\s+/)[0];
}

const mine = (owner: string | null | undefined): boolean => owner === 'me' || owner === 'both';

/**
 * Who said it, as a person reads it: "You decided", "Jonah decided", "Your team decided", "Jonah told you", "You told Marcus",
 * "You promised Priya", "Priya promised you", "You agreed with Priya", "Priya asked you", "You asked Priya", "Your agent".
 * `RecordWords.who` word for word.
 */
export function checkWho(kind: string | null | undefined, owner: string | null | undefined, name: string | null | undefined): string {
  const n = checkFirstName(name);
  const me = mine(owner);
  switch (kind ?? 'promise') {
    case 'decision':
      return owner === 'group' ? 'Your team decided' : me || !n ? 'You decided' : `${n} decided`;
    case 'told':
      return me ? (n ? `You told ${n}` : 'You said') : n ? `${n} told you` : 'You were told';
    case 'ask':
      return me ? (n ? `${n} asked you` : 'You were asked') : n ? `You asked ${n}` : 'You asked';
    case 'agreement':
      return n ? `You agreed with ${n}` : 'You agreed';
    case 'did':
      return n ?? 'Your agent';
    default:
      return me ? (n ? `You promised ${n}` : 'You promised') : n ? `${n} promised you` : 'You were promised';
  }
}

const dayStart = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** When, as a person says it: today, yesterday, a weekday within the week, else "12 March" (with the year when not this one). */
export function checkWhen(ms: number | null | undefined, now: number): string {
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

/** The month a count goes back to: "March", or "March 2025" from another year. */
export function checkSince(ms: number | null | undefined, now: number): string | null {
  if (!ms || ms <= 0) return null;
  const d = new Date(ms);
  return d.getFullYear() === new Date(now).getFullYear() ? MONTHS[d.getMonth()] : `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** The lead of a finding, by what the person's side holds. */
export function checkLead(kind: string | null | undefined, owner: string | null | undefined): string {
  const L = CHECK_WORDS.lead;
  const me = mine(owner) || owner === 'group';
  switch (kind ?? '') {
    case 'decision':
      return me ? L.decided : L.decidedOther;
    case 'told':
      return mine(owner) ? L.youSaid : L.told;
    case 'agreement':
      return L.agreed;
    case 'ask':
      return mine(owner) ? L.asked : L.youAsked;
    case 'did':
      return L.did;
    default:
      return L.promised;
  }
}

/** "You decided, 12 March: “a sliding two-minute window”" */
export const checkRecordLine = (e: CheckEntry, now: number): string => `${checkWho(e.kind, e.owner, e.who)}, ${checkWhen(e.when_ms, now)}: “${e.quote}”`;

/** "It says: “limits reset at midnight” (page 4)" */
export const checkItSays = (c: CheckClaim): string => (c.where?.trim() ? `It says: “${c.quote}” (${c.where.trim()})` : `It says: “${c.quote}”`);

/** "ask Jonah or Mira" */
export function checkAsk(names: string[] | null | undefined): string {
  const n = (names ?? []).map((x) => checkFirstName(x) ?? x).filter(Boolean);
  if (!n.length) return 'nobody you have worked with would know';
  return `ask ${n.length === 1 ? n[0] : `${n.slice(0, -1).join(', ')} or ${n[n.length - 1]}`}`;
}

/** "Checked against 212 things since March." */
export function checkCompared(n: number, since: string | null): string {
  const things = `${n} ${n === 1 ? 'thing' : 'things'}`;
  return since ? `Checked against ${things} since ${since}.` : `Checked against ${things}.`;
}

/** "Myu checked the first 20 pages." */
export const checkLimited = (pages: number): string => `Myu checked the first ${pages} ${pages === 1 ? 'page' : 'pages'}.`;

/** Whether the answer carries its parts (else only the server's words, or nothing yet). */
export const hasCheckParts = (a: CheckAnswer | null | undefined): boolean =>
  !!a && (Array.isArray(a.contradicts) || Array.isArray(a.bears) || Array.isArray(a.unknown) || !!a.compared);

/**
 * Whether this layout says all of it: a check of the person's own words, with its parts. Someone else's decision (who decided, what it
 * touches, the promises it affects) is said in the server's own words.
 */
export const checkLaidOutHere = (a: CheckAnswer | null | undefined): boolean =>
  hasCheckParts(a) && !a?.decider && !Array.isArray(a?.touches) && !Array.isArray(a?.promises);

/**
 * The answer as the person reads it, one string per line ('' between the parts). Contradictions first, grouped under their lead;
 * with none, "Nothing in this goes against …". The opening sentence only when there is something to say beyond that.
 */
export function checkLines(a: CheckAnswer | null | undefined, now: number): string[] {
  if (!a) return [];
  if (a.queued && !hasCheckParts(a)) return [a.words?.trim() || CHECK_WORDS.queued];
  if (!hasCheckParts(a)) return (a.words ?? '').split('\n');
  const contradicts = (a.contradicts ?? []).filter((f) => f?.claim?.quote && f?.entry?.quote);
  const bears = (a.bears ?? []).filter((b) => b?.entry?.quote);
  const unknown = (a.unknown ?? []).filter((u) => u?.claim?.quote);
  const out: string[] = [];
  if (contradicts.length || bears.length || unknown.length) out.push(CHECK_WORDS.intro, '');
  if (contradicts.length) {
    const leads: string[] = [];
    const by = new Map<string, typeof contradicts>();
    for (const f of contradicts) {
      const lead = checkLead(f.entry.kind, f.entry.owner);
      if (!by.has(lead)) {
        by.set(lead, []);
        leads.push(lead);
      }
      by.get(lead)!.push(f);
    }
    leads.forEach((lead, i) => {
      if (i) out.push('');
      out.push(lead);
      for (const f of by.get(lead)!) out.push(` • ${checkItSays(f.claim)}`, `   ${checkRecordLine(f.entry, now)}`);
    });
  } else {
    out.push(CHECK_WORDS.nothing);
  }
  if (bears.length) out.push('', CHECK_WORDS.related, ...bears.map((b) => ` • ${checkRecordLine(b.entry, now)}`));
  if (unknown.length) {
    out.push('', CHECK_WORDS.cannotTell);
    for (const u of unknown) {
      const said = u.claim.where?.trim() ? `“${u.claim.quote}” (${u.claim.where.trim()})` : `“${u.claim.quote}”`;
      out.push(` • ${said}: ${u.code ? CHECK_WORDS.notInCode : checkAsk(u.who_would_know)}`);
    }
  }
  const compared = checkCompared(a.compared?.entries ?? 0, checkSince(a.compared?.since_ms, now));
  const pages = a.limited?.pages;
  out.push('', pages ? `${compared} ${checkLimited(pages)}` : compared);
  return out;
}

/** The same, as one text. */
export const checkText = (a: CheckAnswer | null | undefined, now: number): string => checkLines(a, now).join('\n');

/**
 * A line as the person reads it: one of kind `check` (or `check_promise`) carrying the parts of the person's own check gets this layout,
 * after the server's "About “…”:" when it leads; any other line, someone else's decision, or one without its parts, its own words.
 */
export function checkLineText(line: { kind?: string | null; text?: string | null; check?: CheckAnswer | null }, now: number): string {
  if ((line.kind !== 'check' && line.kind !== CHECK_PROMISE_KIND) || !checkLaidOutHere(line.check)) return line.text ?? '';
  const first = (line.text ?? '').split('\n')[0].trim();
  return [...(/^About “.+”:$/.test(first) ? [first] : []), ...checkLines(line.check, now)].join('\n');
}

/** A row of what was decided or told between two people, as the card and the prep carry it (the server's `said` is RecordWords.who). */
export interface CheckRecordRow {
  kind?: string | null;
  text?: string | null;
  quote?: string | null;
  said?: string | null;
  /** The day it was said, YYYY-MM-DD. */
  when?: string | null;
  commitment_id?: string | null;
}

/** On the card and in the prep: "Decided" / "You were told" / "You told Marcus", the exact words, who when it was someone else, the day. */
export function checkRecordRow(r: CheckRecordRow, now: number): { label: string; text: string; sub: string | null; right: string | null } {
  const said = (r.said ?? '').trim();
  const label = r.kind === 'decided' ? CHECK_WORDS.listDecided : /^You told /.test(said) ? said : CHECK_WORDS.listTold;
  const words = (r.quote ?? '').trim() || (r.text ?? '').trim();
  const sub = said && said !== label && !/^(You|Your team)\b/.test(said) ? said : null;
  const ms = r.when ? Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(r.when) ? `${r.when}T12:00:00` : r.when) : NaN;
  return { label, text: words ? `“${words}”` : '', sub, right: Number.isFinite(ms) ? checkWhen(ms, now) : null };
}

/** "Decided" / "You were told" / "You told Marcus": a row's label in a list of what was decided and told. */
export function checkListLabel(kind: string | null | undefined, owner: string | null | undefined, name: string | null | undefined): string {
  if (kind === 'decision') return CHECK_WORDS.listDecided;
  const n = checkFirstName(name);
  return mine(owner) && n ? CHECK_WORDS.listYouTold(n) : CHECK_WORDS.listTold;
}
