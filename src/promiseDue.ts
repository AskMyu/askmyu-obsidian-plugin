// A promise's due time, in words (2026-11-25, the urgency piece). `GET /commitments` items carry, for a promise due at a time of day,
// `due_time` ("15:00", 24-hour, in his own zone) beside `due_day`; and for one tied to a meeting, `due_event` {event_id, title,
// starts_at}. The server writes the same promise on the prep card in its own `when` words, and these are its forms word for word (the
// backend's of 25 Nov, every example held by a test), so a promise reads the same on the card and in a list of promises:
//   ahead             «by 15:00 today» · «by 15:00 tomorrow» · «by 15:00 on Friday» · «by 15:00 on 2 Dec» · «by 15:00 on 2 Dec 2027»
//   past              «was due at 15:00 today» · «was due at 15:00 yesterday» · «was due at 15:00 on Monday» · «… on 2 Dec» · «… on 2 Dec 2025»
//   a meeting, ahead  «at Daily Sync (10:00 today)» · «at Weekly review (10:00 on Thursday)» · «at Board review (10:00 on 2 Dec 2027)»
//   a meeting, past   «was due at Daily Sync (10:00 today)» · «was due at Weekly review (10:00 yesterday)»
// Today, tomorrow and yesterday by his calendar day; a weekday within seven days either way; otherwise the date, with the year only when it
// is not this year. A promise due on a day only, or served by an older server (no `due_time`, no `due_event`): null, and it keeps today's
// words. A meeting with no title of its own (`due_event.title` null) is «your meeting», the server's own word for it («at your meeting
// (10:00 today)»). Drawn in his zone (`promiseZone`: the zone the `/commitments` answer names, else the zone he set here, else the device's);
// past or ahead judged by the instant (`due`, the real instant for a timed promise; a meeting's `starts_at`), so a space item, whose day and
// time are reckoned in the zone of whoever promised it, is drawn as sent and judged by when it falls. Copies: packages/obsidian/src/promiseDue.ts, byte for byte; packages/cli/src/promiseDue.ts, but for the import's ending.

import { daysFromToday, dayInZone, plainDay, todayIn } from './dueDay';

/** INTERIM words, the operator's to settle: the server's forms of 25 Nov, word for word. */
export const PROMISE_DUE_WORDS = {
  /** Due at a time, still ahead: «by 15:00 today». */
  by: (time: string, day: string) => `by ${time} ${day}`,
  /** Due at a time that has passed: «was due at 15:00 yesterday». */
  wasDue: (time: string, day: string) => `was due at ${time} ${day}`,
  /** Tied to a meeting still ahead: «at Daily Sync (10:00 today)». */
  at: (meeting: string, time: string, day: string) => `at ${meeting} (${time} ${day})`,
  /** Tied to a meeting that has started: «was due at Daily Sync (10:00 today)». */
  wasDueAt: (meeting: string, time: string, day: string) => `was due at ${meeting} (${time} ${day})`,
  today: 'today',
  tomorrow: 'tomorrow',
  yesterday: 'yesterday',
  /** Within seven days, either way: «on Friday». */
  onWeekday: (weekday: string) => `on ${weekday}`,
  /** Further: «on 2 Dec»; in another year, «on 2 Dec 2027». */
  onDate: (day: number, month: string, year: number | null) => `on ${day} ${month}${year === null ? '' : ` ${year}`}`,
  /** A meeting served with no title of its own (`title` null): the server's own word, settled with it on 25 Nov. */
  aMeeting: 'your meeting',
} as const;

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** What a promise carries that names its due time (the `/commitments` item's fields; an older server sends neither of the new two). */
export interface PromiseDueServed {
  due?: string | null;
  due_day?: string | null;
  /** "15:00": 24-hour, in his own zone; only on a promise due at a time. */
  due_time?: string | null;
  /** The meeting a promise is tied to. */
  due_event?: { event_id?: string | null; title?: string | null; starts_at?: string | number | null } | null;
}

/** «today», «tomorrow», «yesterday», «on Friday», «on 2 Dec», «on 2 Dec 2027»: a plain day as the forms say it, from `today`. Pure. */
export function promiseDayWords(day: string, today: string): string {
  const W = PROMISE_DUE_WORDS;
  const n = daysFromToday(day, today);
  if (n === 0) return W.today;
  if (n === 1) return W.tomorrow;
  if (n === -1) return W.yesterday;
  const [y, m, d] = day.split('-').map(Number);
  if (Math.abs(n) < 7) return W.onWeekday(WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]);
  return W.onDate(d, MONTHS[m - 1], day.slice(0, 4) === today.slice(0, 4) ? null : y);
}

/** "15:00" from a served time of day ("15:00", "9:05"); null when it is not one. */
function timeOfDay(raw: unknown): string | null {
  const m = typeof raw === 'string' ? /^(\d{1,2}):(\d{2})$/.exec(raw.trim()) : null;
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

/** An instant's time of day, "10:00", in `zone` (the viewer's own when not given). */
function clockIn(ms: number, zone?: string): string | null {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(ms);
  const part = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return timeOfDay(`${part('hour')}:${part('minute')}`);
}

/** This century, in ms: an instant outside it (seconds sent as ms, a slip) is taken as absent. */
const CENTURY_MS: readonly [number, number] = [Date.UTC(2000, 0, 1), Date.UTC(2100, 0, 1)];
const instantMs = (raw: unknown): number | null => {
  const ms = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() ? Date.parse(raw.trim()) : NaN;
  return Number.isFinite(ms) && ms >= CENTURY_MS[0] && ms < CENTURY_MS[1] ? ms : null;
};

/** Whether `zone` is an IANA zone this runtime knows. */
function isZone(zone: unknown): zone is string {
  if (typeof zone !== 'string' || !zone.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * The zone a promise's time is judged and drawn in, on every surface (2026-11-25, the read's finding; the backend's word): the zone the
 * `/commitments` answer names at its top (`zone`: the account's, the one every due day is reckoned in); else the zone he set here (the
 * terminal's `myu settings set timezone`, the app's own setting); else undefined, the device's own. Pure.
 */
export function promiseZone(served: unknown, set?: string | null): string | undefined {
  const zone = served && typeof served === 'object' ? (served as { zone?: unknown }).zone : null;
  if (isZone(zone)) return zone;
  return isZone(set) ? set : undefined;
}

/** What the words are made of: a meeting's (title, its start's time and day), or a time of day and its day; past or ahead. */
interface DueAt {
  meeting: string | null;
  time: string;
  day: string;
  past: boolean;
}

function dueAt(c: PromiseDueServed | null | undefined, now: number, zone?: string): DueAt | null {
  if (!c) return null;
  const at = instantMs(c.due_event?.starts_at);
  const clock = at === null ? null : clockIn(at, zone);
  const meetingDay = at === null ? null : dayInZone(at, zone);
  if (at !== null && clock && meetingDay) {
    const title = typeof c.due_event?.title === 'string' && c.due_event.title.trim() ? c.due_event.title.trim() : PROMISE_DUE_WORDS.aMeeting;
    return { meeting: title, time: clock, day: meetingDay, past: at <= now };
  }
  const time = timeOfDay(c.due_time);
  const day = time ? (plainDay(c.due_day) ?? dayInZone(c.due, zone)) : null;
  if (!time || !day) return null;
  // Past by its instant (`due`), where served; else by his own calendar and clock: a day before today, or today at or after its time (23:30
  // seen at 00:10: yesterday, past).
  const due = instantMs(c.due);
  const today = todayIn(zone, now);
  const past = due !== null ? due <= now : day < today || (day === today && (clockIn(now, zone) ?? '') >= time);
  return { meeting: null, time, day, past };
}

/**
 * The day the words name (`YYYY-MM-DD`): the meeting's day for a promise tied to one, else the promise's own day (the server's `due_day`,
 * else its instant's day in `zone`). Null where there are no words to say (`promiseDueWords` null). Pure.
 */
export function promiseDueDay(c: PromiseDueServed | null | undefined, now: number = Date.now(), zone?: string): string | null {
  return dueAt(c, now, zone)?.day ?? null;
}

/**
 * A promise's due time in words, in his zone (`zone`: the viewer's own when not given), by the server's forms above; null for a promise due
 * on a day only, or from an older server, which keeps today's words. Pure.
 */
export function promiseDueWords(c: PromiseDueServed | null | undefined, now: number = Date.now(), zone?: string): string | null {
  const d = dueAt(c, now, zone);
  if (!d) return null;
  const W = PROMISE_DUE_WORDS;
  const day = promiseDayWords(d.day, todayIn(zone, now));
  if (d.meeting !== null) return d.past ? W.wasDueAt(d.meeting, d.time, day) : W.at(d.meeting, d.time, day);
  return d.past ? W.wasDue(d.time, day) : W.by(d.time, day);
}

/**
 * How long until a promise row's words next change (ms, at least 0): its due instant or its meeting's start still ahead («by» → «was due»),
 * or midnight in his zone (every day word moves on); null when there are no promises. For a surface's timer, as the lines have at their ends.
 * Pure.
 */
export function msToNextDueChange(items: ReadonlyArray<PromiseDueServed> | null | undefined, now: number = Date.now(), zone?: string): number | null {
  if (!items || !items.length) return null;
  const clock = clockIn(now, zone);
  const [h, m] = (clock ?? '00:00').split(':').map(Number);
  let next = (24 * 60 - (h * 60 + m)) * 60_000 - (now % 60_000);
  for (const c of items) {
    const at = instantMs(c.due_event?.starts_at) ?? (timeOfDay(c.due_time) ? instantMs(c.due) : null);
    if (at !== null && at > now && at - now < next) next = at - now;
  }
  return Math.max(0, next);
}
