/**
 * The day a promise is due, or its next check falls on (2026-11-20, the backend's build 19b2). A deadline given as a day is kept as the
 * END of that day in the person's own zone ("due the 20th" in New York is 2026-11-21T04:59:59Z; in Tokyo, 2026-11-20T14:59:59Z), and
 * the server sends the day itself as `due_day` ("2026-11-20") beside it. The day named is `due_day` when the server sends it; else the
 * instant's day in the viewer's own zone. Never the instant's first ten characters, never its UTC day. Where a client must say late or
 * overdue itself, it compares days, and a day is late only from the day after it. The terminal and Obsidian hold byte copies of this
 * file (their tests hold them).
 */

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A plain day `YYYY-MM-DD`, or null. */
export function plainDay(raw: unknown): string | null {
  const s = typeof raw === 'string' ? raw.trim() : '';
  return DAY.test(s) ? s : null;
}

/** The day (`YYYY-MM-DD`) an instant falls on in `zone`, the viewer's own when not given. A plain day is that day. Null when unreadable. */
export function dayInZone(instant: unknown, zone?: string): string | null {
  const own = plainDay(instant);
  if (own) return own;
  const ms = typeof instant === 'number' ? instant : typeof instant === 'string' && instant.trim() ? Date.parse(instant.trim()) : NaN;
  if (!Number.isFinite(ms)) return null;
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(ms);
  const part = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const day = `${part('year')}-${part('month')}-${part('day')}`;
  return DAY.test(day) ? day : null;
}

/** The day it is due (or checked): the server's `due_day` when it sends one, else the instant's day in the viewer's zone. */
export function dueDayOf(dueDay: unknown, instant: unknown, zone?: string): string | null {
  return plainDay(dueDay) ?? dayInZone(instant, zone);
}

/** Today in the viewer's zone, `YYYY-MM-DD`. */
export function todayIn(zone?: string, now: number = Date.now()): string {
  return dayInZone(now, zone) ?? new Date(now).toISOString().slice(0, 10);
}

/** Whole days from `today` to `day` (0 the same day, 1 tomorrow, -1 yesterday). */
export function daysFromToday(day: string, today: string): number {
  const at = (d: string) => {
    const m = DAY.exec(d);
    return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : NaN;
  };
  return Math.round((at(day) - at(today)) / 86_400_000);
}

/** Late (or overdue) only from the day after its day: today, in the viewer's zone, is after it. */
export function isPastDay(day: string | null | undefined, today: string): boolean {
  return !!day && DAY.test(day) && day < today;
}

/**
 * A day as a moment for a formatter that takes one and reads it in the viewer's zone (`toLocaleDateString`, `getDate`): noon of that
 * day there, so it names that day wherever the viewer is. NaN for anything but a plain day.
 */
export function dayNoonMs(day: string | null | undefined): number {
  const m = DAY.exec((day ?? '').trim());
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12).getTime() : NaN;
}

/**
 * The day fields the server sends beside an instant (19b3, the planning side's rule): `due_day` beside a promise's deadline under any
 * name (`due`, `due_at`, `deadline`, `when`), `next_check_day` beside a next check. A door that already serves a day keeps it.
 */
export const DAY_FIELDS = { deadline: 'due_day', nextCheck: 'next_check_day' } as const;

/** The day field `dayField` on one object, when the server sends it as a plain day; else null. One path for every day field. */
export function sentDay(obj: unknown, dayField: string): string | null {
  return obj && typeof obj === 'object' ? plainDay((obj as Record<string, unknown>)[dayField]) : null;
}

/** The day of one object's instant: its day field when sent, else the instant's day in the viewer's zone (a plain day is that day). */
export function dayOfField(obj: unknown, instantField: string, dayField: string, zone?: string): string | null {
  const o = obj && typeof obj === 'object' ? (obj as Record<string, unknown>) : null;
  return o ? dueDayOf(o[dayField], o[instantField], zone) : null;
}
