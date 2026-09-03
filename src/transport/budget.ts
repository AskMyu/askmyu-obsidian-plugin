/**
 * The request budget — the plugin's promise to the server and to the WAF in
 * front of it (2026-09-03: an unlock plus a vault sync sent ~4,800 requests in
 * two minutes, tripped the backend's per-minute tier, then AWS WAF's 2,000 per
 * five minutes per IP, which then refused the web app too).
 *
 * Three rules, all pure so they can be pinned:
 *  · A token bucket over EVERY call — a small burst is fine, a stream is paced.
 *  · A 429 pauses that endpoint for exactly Retry-After (header or body),
 *    60 s when the server said nothing. Other endpoints carry on.
 *  · A bare 403 — no `{"err":"enc"}` body — is the WAF: pause everything,
 *    long and flat; it clears when the trailing five-minute count drops.
 *
 * A caller that would wait longer than `maxWaitMs` gets a synthetic 429 with
 * `error: 'paused'` and never touches the network — the panes already know
 * how to say "asked for a pause".
 */

export interface BudgetOptions {
  /** Sustained rate, requests per second. */
  perSecond?: number;
  /** How many may go at once before pacing bites. */
  burst?: number;
  /** A 429 without Retry-After pauses the endpoint this long. */
  defaultPauseMs?: number;
  /** A bare 403 pauses everything this long. */
  wafPauseMs?: number;
  /** Longest a caller waits before getting a synthetic 429 instead. */
  maxWaitMs?: number;
  now?: () => number;
}

export const WAF_PAUSE_MS = 5 * 60 * 1000;

export class RequestBudget {
  private tokens: number;
  private lastRefill: number;
  private readonly perSecond: number;
  private readonly burst: number;
  private readonly defaultPauseMs: number;
  private readonly wafPauseMs: number;
  private readonly maxWaitMs: number;
  private readonly now: () => number;
  private pausedUntil = new Map<string, number>();
  private allPausedUntil = 0;
  /** Serialises acquirers so two callers cannot both take the last token. */
  private queue: Promise<void> = Promise.resolve();

  constructor(opts: BudgetOptions = {}) {
    this.perSecond = opts.perSecond ?? 5;
    this.burst = opts.burst ?? 10;
    this.defaultPauseMs = opts.defaultPauseMs ?? 60_000;
    this.wafPauseMs = opts.wafPauseMs ?? WAF_PAUSE_MS;
    this.maxWaitMs = opts.maxWaitMs ?? 30_000;
    this.now = opts.now ?? (() => Date.now());
    this.tokens = this.burst;
    this.lastRefill = this.now();
  }

  /** The endpoint a path belongs to — the path without its query. */
  static keyOf(path: string): string {
    const q = path.indexOf('?');
    return q === -1 ? path : path.slice(0, q);
  }

  /** ms until `path` may go: the later of its own pause and the global one, then the bucket. */
  waitFor(path: string): number {
    const t = this.now();
    const key = RequestBudget.keyOf(path);
    const pause = Math.max(this.pausedUntil.get(key) ?? 0, this.allPausedUntil) - t;
    if (pause > 0) return pause;
    this.refill(t);
    if (this.tokens >= 1) return 0;
    return Math.ceil(((1 - this.tokens) / this.perSecond) * 1000);
  }

  /**
   * Wait for a turn, then take it. Resolves `ok` when the call may go, or
   * `paused` (with the wait it would have needed) when that wait exceeds the cap.
   */
  acquire(path: string, sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => window.setTimeout(r, ms))): Promise<{ ok: true } | { ok: false; retryAfterMs: number }> {
    const turn = this.queue.then(async () => {
      const wait = this.waitFor(path);
      if (wait > this.maxWaitMs) return { ok: false as const, retryAfterMs: wait };
      if (wait > 0) await sleep(wait);
      // A pause may have landed while sleeping: check once more, then take a token.
      const again = this.waitFor(path);
      if (again > this.maxWaitMs) return { ok: false as const, retryAfterMs: again };
      if (again > 0) await sleep(again);
      this.refill(this.now());
      this.tokens = Math.max(0, this.tokens - 1);
      return { ok: true as const };
    });
    this.queue = turn.then(() => undefined, () => undefined);
    return turn;
  }

  /**
   * The server said 429: that endpoint rests for Retry-After, or the default
   * when it said nothing. An EXPLICIT zero is a third case (backend,
   * 2026-09-03): the request behind the 429 is invalidated (`next_action:
   * "request_new_transfer"`) — waiting is the wrong move, so no rest at all.
   */
  pause(path: string, retryAfterMs: number | null): void {
    if (retryAfterMs === 0) return;
    const ms = retryAfterMs && retryAfterMs > 0 ? retryAfterMs : this.defaultPauseMs;
    this.pausedUntil.set(RequestBudget.keyOf(path), this.now() + ms);
  }

  /** A bare 403 — the WAF: everything rests, long and flat. */
  pauseAll(ms = this.wafPauseMs): void {
    this.allPausedUntil = Math.max(this.allPausedUntil, this.now() + ms);
  }

  /** Whether anything is resting right now — the status bar can say so. */
  pausedMs(path?: string): number {
    const t = this.now();
    const own = path ? (this.pausedUntil.get(RequestBudget.keyOf(path)) ?? 0) : 0;
    return Math.max(0, Math.max(own, this.allPausedUntil) - t);
  }

  private refill(t: number): void {
    const elapsed = Math.max(0, t - this.lastRefill);
    this.tokens = Math.min(this.burst, this.tokens + (elapsed / 1000) * this.perSecond);
    this.lastRefill = t;
  }
}

/** Retry-After from the header (seconds or an HTTP date) or the body's `retry_after` seconds. */
export function retryAfterMs(headers: Record<string, string> | undefined, body: unknown, now: number = Date.now()): number | null {
  const header = headers ? (headers['retry-after'] ?? headers['Retry-After']) : undefined;
  if (typeof header === 'string' && header.trim()) {
    const secs = Number(header.trim());
    if (Number.isFinite(secs)) return Math.max(0, Math.round(secs * 1000));
    const when = Date.parse(header);
    if (Number.isFinite(when)) return Math.max(0, when - now);
  }
  if (body && typeof body === 'object') {
    const v = (body as { retry_after?: unknown }).retry_after;
    if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.round(v * 1000));
    if (typeof v === 'string' && Number.isFinite(Number(v))) return Math.max(0, Math.round(Number(v) * 1000));
  }
  return null;
}
