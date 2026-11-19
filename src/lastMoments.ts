/**
 * The last moments of Dan's week, and two loose ends from the invitation (2026-11-12, BRIEF_FRONTEND_LAST_MOMENTS_20261112, against
 * BRIEF_BACKEND_LAST_MOMENTS_20261112): the week counted, several messages under one yes, what has repeated with a person, what else
 * falls on that day, prep that expects the question, the invitation that carries a question, the page an invited person lands on, and
 * "Add it?". What the web and the terminal share: the words a person reads that the server does not send, the shapes the backend's brief
 * names, and lenient readers. Pure; the terminal keeps a byte-for-byte copy (`cli/src/lastMoments.ts`).
 *
 * The backend's handback (13 Nov, `IMPL_BACKEND_PHASE1_20261112` §6.2) confirmed the shapes read here; the readers stay lenient.
 */

/** Every sentence a person reads here that the server does not send (both briefs' tables, word for word). */
export const LAST_MOMENTS_WORDS = {
  week: {
    line: 'Myu: your week.',
    /** "Your week, 9 to 13 November". */
    title: (range: string) => `Your week, ${range}`,
    yourSide: 'Your side of the work',
    goals: 'Your goals',
    last: 'The week before',
  },
  send: {
    /** The yes box for several: "Send these 3, as you?" */
    ask: (n: number) => `Send these ${n}, as you?`,
    /** Where the box cannot take one out. */
    all: 'Send all',
    change: 'Let me change one',
    none: 'None',
  },
  repeated: 'What has repeated',
  mayAsk: 'They may ask about',
  fullDay: { keep: 'Keep', move: 'Move it', notPromise: 'Not a promise', whichDay: 'Which day?' },
  addIt: { add: 'Add it', no: 'No' },
  invite: {
    /** Before an invitation that carries a question goes: the inviter sees it, and can take it out. */
    willSay: 'The invitation will say you have a question for them.',
    takeOut: 'Take that out',
    putBack: 'Keep it in',
    /** After "Send it yourself" on "Myu has no connection with Ana": the question's own words, to copy. */
    sendYourself: 'To send it yourself, here are the words:',
  },
} as const;

/** The doors (the backend's brief names the week's, the send's, the card's and the landing page's; the rest are ASSUMED). */
export const LAST_MOMENTS_DOORS = {
  /** The weekly review that exists, any past week: `GET /review/weekly?week=YYYY-MM-DD` (the week's Monday). */
  week: (week?: string | null) => `/review/weekly${week ? `?week=${encodeURIComponent(week)}` : ''}`,
  send: '/myu/send',
  landing: (token: string) => `/invites/landing?token=${encodeURIComponent(token)}`,
} as const;

/** The most messages under one yes (the backend's `send.batch_max`). */
export const SEND_BATCH_MAX = 6;

/**
 * The line kinds this brief adds. The backend's handback (13 Nov, §6.2) confirmed the first of each list; the others are kept so a renamed
 * kind still draws. "Myu has no connection with Ana" (`pair_no_connection`: Invite · Send it yourself · Not now) is the person's own to
 * answer; "Your question reached Ana." and the one saying it was not delivered are told, with nothing to answer.
 */
export const LAST_MOMENTS_LINE_KINDS = {
  fullDay: ['full_day', 'promise_full_day'],
  answerBearsOn: ['answer_bears_on', 'add_answer'],
  reportBearsOn: ['report_bears_on', 'add_report'],
  sendMany: ['send_many', 'send_batch'],
  noConnection: ['pair_no_connection'],
  questionReached: ['invite_question_reached'],
  questionNotDelivered: ['invite_question_not_delivered'],
} as const;

const kindIn = (list: readonly string[], line: { kind?: string | null } | null | undefined): boolean => !!line?.kind && list.includes(line.kind);
export const isFullDayLine = (l: { kind?: string | null } | null | undefined): boolean => kindIn(LAST_MOMENTS_LINE_KINDS.fullDay, l);
export const isBearsOnLine = (l: { kind?: string | null } | null | undefined): boolean =>
  kindIn(LAST_MOMENTS_LINE_KINDS.answerBearsOn, l) || kindIn(LAST_MOMENTS_LINE_KINDS.reportBearsOn, l);
export const isNoConnectionLine = (l: { kind?: string | null } | null | undefined): boolean => kindIn(LAST_MOMENTS_LINE_KINDS.noConnection, l);

// ── readers ───────────────────────────────────────────────────

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** A source: the exact words, when, and where they are. */
export interface Source {
  quote: string;
  whenMs: number | null;
  link: string | null;
}
export function sourceFrom(raw: unknown): Source | null {
  const o = obj(raw);
  const quote = o ? (str(o.quote) ?? str(o.words) ?? str(o.text)) : null;
  return o && quote ? { quote, whenMs: num(o.when_ms) ?? num(o.at_ms), link: str(o.link) ?? str(o.url) } : null;
}
const sources = (v: unknown): Source[] => list(v).map(sourceFrom).filter((s): s is Source => !!s);

// §1 The week, counted.

/** One count of "your side of the work": its sentence (the server's), and the things it counted, each opening to where it is. */
export interface WeekCount {
  key: string;
  /** Null when the server gives the sentence alone. */
  count: number | null;
  sentence: string;
  items: Array<{ text: string; link: string | null; who: string | null }>;
}
/** A goal beside the week: the entries tied to it (a count and one example with its link). */
export interface WeekGoal {
  goal: string;
  count: number;
  example: { text: string; link: string | null } | null;
}
export interface YourWeek {
  /** "9 to 13 November", from the server's `range` (`{from_day, to_day}`, or words). */
  range: string | null;
  counts: WeekCount[];
  goals: WeekGoal[];
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/**
 * A week's days as words: "9 to 13 November", "30 November to 4 December", "29 December 2025 to 2 January 2026". From two days written
 * `YYYY-MM-DD` (the server's `range.from_day` and `to_day`, in the person's own zone); null when either cannot be read.
 */
export function weekRangeWords(fromDay: unknown, toDay: unknown): string | null {
  const day = (v: unknown) => {
    const m = typeof v === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim()) : null;
    const month = m ? Number(m[2]) : 0;
    return m && month >= 1 && month <= 12 ? { y: Number(m[1]), m: month, d: Number(m[3]) } : null;
  };
  const a = day(fromDay);
  const b = day(toDay);
  if (!a || !b) return null;
  const end = `${b.d} ${MONTHS[b.m - 1]}`;
  if (a.y !== b.y) return `${a.d} ${MONTHS[a.m - 1]} ${a.y} to ${end} ${b.y}`;
  return a.m === b.m ? `${a.d} to ${end}` : `${a.d} ${MONTHS[a.m - 1]} to ${end}`;
}

/**
 * "Your side of the work" from the weekly review (the backend's handback, 13 Nov: `your_side: {range: {from_ms, to_ms, from_day, to_day},
 * counts: [{key, count, sentence, items: [{id, text, link, who?, at_ms, state?}], parts}], goals: [{goal_id, goal, count, example: {text,
 * link, source, at_ms}}]}` at the top level of `GET /review/weekly`; a server that sends `sentences: [..]` alone still draws). A count of
 * zero is left out.
 */
export function yourWeekFrom(res: unknown): YourWeek | null {
  const o = obj(res);
  const side = obj(o?.your_side) ?? obj(obj(o?.review)?.your_side) ?? obj(obj(o?.sections)?.your_side);
  if (!side) return null;
  const counts: WeekCount[] = list(side.counts)
    .map((c) => {
      const r = obj(c);
      const sentence = r ? (str(r.sentence) ?? str(r.text)) : null;
      if (!r || !sentence) return null;
      return {
        key: str(r.key) ?? sentence,
        count: num(r.count),
        sentence,
        items: list(r.items).map((i) => obj(i)).filter((i): i is Record<string, unknown> => !!i && !!(str(i.text) ?? str(i.words)))
          .map((i) => ({ text: (str(i.text) ?? str(i.words)) as string, link: str(i.link), who: str(i.who) ?? str(i.waits_on) })),
      };
    })
    // A count of zero is left out; a sentence with no number is kept.
    .filter((c): c is WeekCount => !!c && c.count !== 0);
  // A server that sends the sentences alone.
  for (const sRaw of list(side.sentences)) {
    const sentence = str(sRaw);
    if (sentence && !counts.some((c) => c.sentence === sentence)) counts.push({ key: sentence, count: null, sentence, items: [] });
  }
  const goals: WeekGoal[] = list(side.goals)
    .map((g) => {
      const r = obj(g);
      const goal = r ? (str(r.goal) ?? str(r.text) ?? str(r.title)) : null;
      if (!r || !goal) return null;
      const ex = obj(r.example);
      return { goal, count: num(r.count) ?? 0, example: ex && str(ex.text) ? { text: str(ex.text) as string, link: str(ex.link) } : null };
    })
    .filter((g): g is WeekGoal => !!g);
  const range = obj(side.range);
  return { range: str(side.range) ?? (range ? weekRangeWords(range.from_day, range.to_day) : null) ?? str(o?.range), counts, goals };
}

/** The week as the terminal prints it: its title, then each count on its own line with the open ones named under it. */
export function weekLines(w: YourWeek, rangeFallback: string): string[] {
  const out = [LAST_MOMENTS_WORDS.week.title(w.range ?? rangeFallback)];
  for (const c of w.counts) {
    out.push(`  ${c.sentence}`);
    for (const i of c.items) out.push(`      ${i.text}${i.who ? ` · ${i.who}` : ''}`);
  }
  if (w.goals.length) {
    out.push('', `  ${LAST_MOMENTS_WORDS.week.goals}`);
    for (const g of w.goals) out.push(`    ${g.goal}: ${g.count}${g.example ? ` · ${g.example.text}` : ''}`);
  }
  return out;
}

// §2 Several messages under one yes.

/** One message of several, as the person approves it: to whom, where, the exact words, the border's sentence for it. */
export interface SendItem {
  to: string;
  where: string | null;
  words: string;
  /** The server's sentence for this one ("the first is a promise from you"), when it has one. */
  note: string | null;
}
/** Each message's outcome after the one yes ("Sent 2. 1 not sent: …" is the server's sentence for all). */
export interface SendOutcome {
  index: number;
  sent: boolean;
  said: string | null;
}
export function sendOutcomesFrom(res: unknown): { said: string | null; outcomes: SendOutcome[] } {
  const o = obj(res);
  return {
    said: str(o?.said) ?? str(o?.readback) ?? str(obj(o?.readback)?.text),
    outcomes: list(o?.results ?? o?.messages)
      .map((r, i) => {
        const x = obj(r);
        return x ? { index: num(x.index) ?? i, sent: x.sent === true || x.status === 'sent' || x.ok === true, said: str(x.said) ?? str(x.reason) ?? str(x.error) } : null;
      })
      .filter((x): x is SendOutcome => !!x),
  };
}

// §3 What has repeated.

export interface Repeated {
  text: string;
  count: number | null;
  sinceMs: number | null;
  sources: Source[];
}
/** `noticed: [{text, count, since, sources: [{quote, when_ms, link}]}]` on the card's read and on what an agent reads about a person. */
export function repeatedFrom(res: unknown): Repeated[] {
  const o = obj(res);
  const raw = o?.noticed ?? obj(o?.card)?.noticed ?? (Array.isArray(res) ? res : []);
  return list(raw)
    .map((n) => {
      const r = obj(n);
      const text = r ? str(r.text) : null;
      return r && text ? { text, count: num(r.count), sinceMs: num(r.since) ?? num(r.since_ms), sources: sources(r.sources) } : null;
    })
    .filter((n): n is Repeated => !!n);
}

// §5 Prep that expects the question.

export interface MayAsk {
  text: string;
  /** What happened, in order, with times. */
  steps: Array<{ text: string; atMs: number | null }>;
  /** What the person already told each of them about it: "You told Sofia on Monday: “…”" (the server's sentence, else made here). */
  told: Array<{ sentence: string | null; to: string | null; whenMs: number | null; quote: string | null }>;
  sources: Source[];
}
/** `may_ask: [{text, steps: [{text, at_ms}], told: [{sentence?, to, when_ms, quote}], sources}]` on the prep (ASSUMED shape). */
export function mayAskFrom(res: unknown): MayAsk[] {
  const o = obj(res);
  const raw = o?.may_ask ?? obj(o?.prep)?.may_ask;
  return list(raw)
    .map((m) => {
      const r = obj(m);
      const text = r ? (str(r.text) ?? str(r.title)) : null;
      if (!r || !text) return null;
      return {
        text,
        steps: list(r.steps).map((s) => obj(s)).filter((s): s is Record<string, unknown> => !!s && !!str(s.text)).map((s) => ({ text: str(s.text) as string, atMs: num(s.at_ms) })),
        told: list(r.told).map((t) => obj(t)).filter((t): t is Record<string, unknown> => !!t).map((t) => ({ sentence: str(t.sentence), to: str(t.to), whenMs: num(t.when_ms), quote: str(t.quote) })),
        sources: sources(r.sources),
      };
    })
    .filter((m): m is MayAsk => !!m);
}

/** The short form for the line before a meeting in a session: each item's first sentence, then "more in the prep". */
export function mayAskShort(items: MayAsk[]): string | null {
  if (!items.length) return null;
  const first = (t: string): string => (t.match(/^[^.!?]*[.!?]/)?.[0] ?? t).trim();
  return `${LAST_MOMENTS_WORDS.mayAsk}: ${items.map((i) => first(i.text)).join(' · ')} (more in the prep)`;
}

// §7 The page an invited person lands on.

export interface LandingWords {
  heading: string | null;
  /** "{inviter} uses askMyu at work and is inviting you to use it too." */
  intro: string | null;
  sections: Array<{ heading: string; bullets: string[] }>;
  closing: string | null;
  /** "{inviter} has a question for you.", when there is one. */
  question: string | null;
}
/** The landing page's grouped words (the backend's handback, 13 Nov: `words: {heading, intro, sections: [{heading, bullets}], closing, question?}`). */
export function landingWordsFrom(res: unknown): LandingWords | null {
  const o = obj(res);
  const w = obj(o?.words) ?? o;
  if (!w) return null;
  const sections = list(w.sections)
    .map((s) => obj(s))
    .filter((s): s is Record<string, unknown> => !!s)
    .map((s) => ({ heading: str(s.heading) ?? '', bullets: list(s.bullets).map(str).filter((b): b is string => !!b) }))
    .filter((s) => s.heading || s.bullets.length);
  const heading = str(w.heading) ?? str(w.title);
  if (!heading && !sections.length) return null;
  return { heading, intro: str(w.intro), sections, closing: str(w.closing), question: str(w.question) };
}
