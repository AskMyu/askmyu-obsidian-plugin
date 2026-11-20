// Too many wrong tries (2026-11-19, BRIEF_BACKEND_TRIES_LIMIT_AND_JOURNAL_SEARCH §1): after ten wrong tries for one account (or thirty
// from one source) within fifteen minutes, the door refuses for up to fifteen minutes, even the right password or code, until the wait
// ends. The doors (the backend's fixed shape): POST /account/login, POST /auth/address-held (choice "password") and POST
// /auth/email-code/verify. HTTP 429, header `Retry-After: <seconds>`, body
// {"success":false,"error":"too_many_tries","retry_after":840,"message":"Too many tries. Try again in 14 minutes.","status_code":429}.
// It is apart from a question's own `too_many_attempts` (429 too: that question or code is gone; start again). Every surface shows the
// server's sentence (ours, made the same way from the seconds, where it sends none), keeps what the person typed, and leaves every other
// way in usable. Byte copies in packages/cli and packages/obsidian.

export const TOO_MANY_TRIES = 'too_many_tries';

/** When the answer gives no wait, the door's own window. */
export const TOO_MANY_TRIES_DEFAULT_SECONDS = 15 * 60;

/**
 * A refused try: 429 with `too_many_tries` (from `code`, `error` or `err`), and the seconds to wait (`retry_after_seconds`,
 * `retry_after`, `seconds`, `wait_seconds`, or the `Retry-After` header in seconds); null for any other answer. A 429 without the code
 * is a different limit (requests per minute) and is not this.
 */
export function tooManyTriesOf(status: number, body: unknown, retryAfterHeader?: string | null): { seconds: number } | null {
  if (status !== 429) return null;
  const b = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const codes = [b.code, b.error, b.err].filter((x): x is string => typeof x === 'string');
  if (!codes.includes(TOO_MANY_TRIES)) return null;
  const given = [b.retry_after_seconds, b.retry_after, b.seconds, b.wait_seconds, retryAfterHeader]
    .map((x) => (typeof x === 'string' && x.trim() ? Number(x) : x))
    .find((x): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0);
  return { seconds: Math.ceil(given ?? TOO_MANY_TRIES_DEFAULT_SECONDS) };
}

/** "Too many tries. Try again in 14 minutes." (whole minutes, rounded up); "… in a minute." at a minute or less: the server's words. */
export function tooManyTriesWords(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `Too many tries. Try again in ${minutes === 1 ? 'a minute' : `${minutes} minutes`}.`;
}

/** The sentence for a refused try (the server's `message`, ours where it sends none), or null for any other answer. */
export function tooManyTriesSaid(status: number, body: unknown, retryAfterHeader?: string | null): string | null {
  const t = tooManyTriesOf(status, body, retryAfterHeader);
  if (!t) return null;
  const said = body && typeof body === 'object' ? (body as Record<string, unknown>).message : null;
  return typeof said === 'string' && said.trim() ? said.trim() : tooManyTriesWords(t.seconds);
}
