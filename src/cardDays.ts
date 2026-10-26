/**
 * A day on a card, in the words the server writes (2026-10-06): "28 Sep", with the year when it is not this year
 * ("28 Sep 2025"). The server's own lines read so ("Understood back to 1 Mar 2024", Recent activity's "(22 Oct)"), and a
 * card used to set them beside the browser's "Sep 28" (or en-GB's "28 Sept"). Read right, too: a day alone is that day
 * wherever the reader is, and a stamp with no zone is the server's UTC (read as local, it was a day off west of UTC).
 * The terminal and Obsidian mirror this file (their tests hold the copies).
 */

/** The months' fixed words (a locale's words never match the server's). */
const MONTH_WORDS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * A card's stamp in epoch ms: a number (ms; seconds below 1e11), a digit string (ms with 11 or more digits, seconds with 9
 * or 10), a day alone ("2026-09-28", its midnight UTC), a stamp with no zone ("2026-09-28 19:24:06.9", the server's UTC)
 * or one with its zone. Null when unreadable.
 */
export function cardStampMs(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? (raw < 1e11 ? raw * 1000 : raw) : null;
  const s = String(raw).trim();
  const ms = /^\d{11,}$/.test(s)
    ? Number(s)
    : /^\d{9,10}$/.test(s)
      ? Number(s) * 1000
      : /^\d{4}-\d{2}-\d{2}$/.test(s)
        ? Date.parse(`${s}T00:00:00Z`)
        : /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)
          ? Date.parse(`${s.replace(' ', 'T')}Z`)
          : Date.parse(s.replace(/^(\d{4}-\d{2}-\d{2}) /, '$1T'));
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

/**
 * A card's day in words: "28 Sep", or "28 Sep 2025" outside this year. A stamp is the reader's day; a day alone
 * ("2026-09-28") is that day; with `utc`, a stamp that stands for a day (kept as its midnight UTC: a due day, a day read
 * from an email) is its UTC day. Null when unreadable.
 */
export function cardDayWords(raw: unknown, opts: { utc?: boolean; now?: Date } = {}): string | null {
  const ms = cardStampMs(raw);
  if (ms == null) return null;
  const d = new Date(ms);
  const now = opts.now ?? new Date();
  const utc = opts.utc || (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.trim()));
  const day = utc ? d.getUTCDate() : d.getDate();
  const month = utc ? d.getUTCMonth() : d.getMonth();
  const year = utc ? d.getUTCFullYear() : d.getFullYear();
  // "This year" is the reader's, whichever way the day is read (around New Year, UTC's year is not theirs).
  const thisYear = now.getFullYear();
  return `${day} ${MONTH_WORDS[month]}${year === thisYear ? '' : ` ${year}`}`;
}

/** A month and its year ("Mar 2024"): a role's start, kept as the 1st of its month in UTC. Null when unreadable. */
export function cardMonthWords(raw: unknown): string | null {
  const ms = cardStampMs(raw);
  if (ms == null) return null;
  const d = new Date(ms);
  return `${MONTH_WORDS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
