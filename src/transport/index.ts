/**
 * The transport adapter — the ONLY network path in this plugin.
 *
 * `requestUrl` rather than `fetch` for two reasons, both hard: our origin is
 * `app://obsidian.md`, so `fetch` hits CORS on every call; and on mobile
 * Obsidian there is no other way out at all. Using it here once means no caller
 * ever has to think about it.
 *
 * QA INVARIANT 1 LIVES HERE. "Nothing leaves unencrypted" is asserted at this
 * chokepoint rather than trusted to each caller: `postJournal` refuses a payload
 * that carries plaintext or lacks ciphertext, and it is the only function that
 * can reach the journal endpoints. A future caller that forgets to encrypt gets
 * an exception, not a silent leak — the cross-review lesson, applied from day
 * one.
 */

import { requestUrl, type RequestUrlResponse } from 'obsidian';
import { assertEncrypted, type EncryptedJournalPayload } from './assertEncrypted';
import { RequestBudget, retryAfterMs } from './budget';

export { assertEncrypted, PlaintextRefusedError } from './assertEncrypted';

export interface TransportOptions {
  /** Backend base URL, e.g. https://myu.askmyu.com/api */
  baseUrl: string;
  /** Session token from the token→session exchange. Null before connect. */
  authToken: string | null;
  /**
   * Called when the backend says the session is gone (401). May re-mint one;
   * resolve `true` when it did, and the request that saw the 401 is sent once
   * more, on the new session. Every request refused while a recovery is in
   * flight waits for THAT recovery — never starts its own (live, 2026-09-03:
   * a burst of settings fetches after a session died each re-minted a session
   * of its own; the key was escrowed to one while the transport kept another,
   * and every call after that was refused until a restart).
   */
  onUnauthorized?: () => Promise<boolean> | boolean | void;
  /**
   * Called on 403 `{"err":"enc"}` — the encryption gate: this session holds
   * no escrowed key. May re-escrow; resolve `true` when it did, and the
   * refused request is sent once more. Same single-flight rule.
   */
  onEncryptionBlocked?: () => Promise<boolean> | boolean | void;
  /**
   * Called on 428 — the beta-terms gate (2026-09-02). The session is fine; the
   * account has not agreed to the current terms. The body is the 428 payload
   * (`terms_required`, `terms_version`, `urls`). A screen, never a re-mint.
   */
  onTermsRequired?: (body: unknown) => void;
  /** The request budget — one per transport; tests hand in a fast one. */
  budget?: RequestBudget;
}

export interface ApiResponse<T = Record<string, unknown>> {
  status: number;
  ok: boolean;
  data: T | null;
  /** Backend error code (`invalid_token`, `token_used`, …) when present. */
  error: string | null;
}

export type { EncryptedJournalPayload } from './assertEncrypted';

/** The two walls a request can hit that a fresh session or a fresh escrow clears. */
type Recovery = 'session' | 'escrow';

/**
 * The WAF's 403 is BARE: no JSON, or JSON that names no error. The backend's
 * own refusals always say why (`{"err":"enc"}`, `{"error":"..."}`), and those
 * must never rest the whole plugin.
 */
export function isWafRefusal(status: number, data: unknown): boolean {
  if (status !== 403) return false;
  if (!data || typeof data !== 'object') return true;
  const d = data as Record<string, unknown>;
  return !('err' in d) && !('error' in d);
}

/** A 403 from the encryption gate, as distinct from any other forbidden. */
export function isEncryptionBlocked(status: number, data: unknown): boolean {
  return status === 403 && !!data && typeof data === 'object' && (data as { err?: unknown }).err === 'enc';
}

export class Transport {
  private opts: TransportOptions;
  /** One recovery in flight per kind; every request refused by that wall awaits it. */
  private recoveries = new Map<Recovery, Promise<boolean>>();
  /** Every call takes a turn here — see budget.ts for the three rules. */
  readonly budget: RequestBudget;

  constructor(opts: TransportOptions) {
    this.opts = opts;
    this.budget = opts.budget ?? new RequestBudget();
  }

  setAuthToken(token: string | null): void {
    this.opts.authToken = token;
  }

  get isAuthed(): boolean {
    return !!this.opts.authToken;
  }

  setBaseUrl(baseUrl: string): void {
    this.opts.baseUrl = baseUrl;
  }

  /**
   * The frontend origin for this stack, sent as the Origin header on every
   * request — exactly what a browser at the web app sends. The backend derives
   * OAuth redirect URIs and magic-link landing URLs from it
   * (ServletUtility.extractOriginFromRequest, priority 1); requestUrl sends no
   * Origin of its own, so without this the server falls back to proxy headers
   * and can build a callback Google has never heard of (redirect_uri_mismatch).
   */
  private origin(): string {
    try {
      return new URL(this.opts.baseUrl).origin;
    } catch {
      return '';
    }
  }

  private baseHeaders(extra: Record<string, string> = {}): Record<string, string> {
    const origin = this.origin();
    return { ...(origin ? { Origin: origin } : {}), ...extra };
  }

  /** Headers for one send — read at send time, so a retry carries the session a recovery minted. */
  private headersFor(extra: Record<string, string>, authed: boolean): Record<string, string> {
    const headers = this.baseHeaders(extra);
    if (authed && this.opts.authToken) headers['Authorization'] = `Bearer ${this.opts.authToken}`;
    return headers;
  }

  /** Which recovery a refused answer calls for, if any. */
  private recoveryFor(status: number, data: unknown): Recovery | null {
    if (status === 401) return 'session';
    if (isEncryptionBlocked(status, data)) return 'escrow';
    return null;
  }

  /** Run the recovery for `kind`, or join the one already running. */
  private recover(kind: Recovery): Promise<boolean> {
    const running = this.recoveries.get(kind);
    if (running) return running;
    const hook = kind === 'session' ? this.opts.onUnauthorized : this.opts.onEncryptionBlocked;
    const recovery = Promise.resolve()
      .then(() => hook?.())
      .then(
        (recovered) => recovered === true,
        () => false,
      )
      .finally(() => {
        this.recoveries.delete(kind);
      });
    this.recoveries.set(kind, recovery);
    return recovery;
  }

  /**
   * Send; if the answer is a wall a recovery can clear, wait for the (shared)
   * recovery and send ONCE more. `send` builds the request when called, so
   * the second send carries whatever the recovery changed. Anonymous requests
   * never recover: there is no session to mend.
   *
   * `throw: false` on requestUrl so 4xx/5xx come back as responses — Obsidian's
   * default throws, which would turn every expected 401 into an unhandled
   * rejection in a background interval.
   */
  private async exchange<T>(path: string, send: () => Promise<RequestUrlResponse>, authed: boolean): Promise<ApiResponse<T>> {
    // The budget first: a resting endpoint, a WAF pause, or an empty bucket
    // is waited out here — or, past the cap, answered as a pause without a
    // byte on the wire.
    const turn = await this.budget.acquire(path);
    if (!turn.ok) {
      return { status: 429, ok: false, data: { retry_after: Math.ceil(turn.retryAfterMs / 1000) } as unknown as T, error: 'paused' };
    }
    let res: RequestUrlResponse;
    try {
      res = await send();
    } catch (err) {
      // Genuinely offline, DNS failure, TLS refusal. Not an auth problem —
      // callers (the queue especially) must be able to tell those apart.
      return { status: 0, ok: false, data: null, error: networkErrorCode(err) };
    }
    let data = parseJson<T>(res);
    const kind = authed ? this.recoveryFor(res.status, data) : null;
    if (kind && (await this.recover(kind))) {
      const again = await this.budget.acquire(path);
      if (!again.ok) return { status: 429, ok: false, data: null, error: 'paused' };
      try {
        res = await send();
      } catch (err) {
        return { status: 0, ok: false, data: null, error: networkErrorCode(err) };
      }
      data = parseJson<T>(res);
    }
    this.noteRefusal(path, res, data);
    if (res.status === 428) this.opts.onTermsRequired?.(data);
    return {
      status: res.status,
      ok: res.status >= 200 && res.status < 300,
      data,
      error: errorCodeOf(data) ?? (res.status >= 400 ? `http_${res.status}` : null),
    };
  }

  /**
   * What a refusal means for the budget: 429 rests that endpoint for exactly
   * Retry-After; a bare 403 (not the encryption gate) is the WAF and rests
   * everything.
   */
  private noteRefusal(path: string, res: RequestUrlResponse, data: unknown): void {
    if (res.status === 429) this.budget.pause(path, retryAfterMs(res.headers, data));
    else if (isWafRefusal(res.status, data)) this.budget.pauseAll();
  }

  /** Authenticated POST. Every backend call in the plugin goes through here. */
  async post<T = Record<string, unknown>>(
    path: string,
    body: Record<string, unknown> = {},
    opts: { anonymous?: boolean; headers?: Record<string, string> } = {},
  ): Promise<ApiResponse<T>> {
    const authed = !opts.anonymous && !!this.opts.authToken;
    return this.exchange<T>(
      path,
      () =>
        requestUrl({
          url: `${this.opts.baseUrl}${path}`,
          method: 'POST',
          headers: this.headersFor({ 'Content-Type': 'application/json', ...(opts.headers ?? {}) }, authed),
          body: JSON.stringify(body),
          throw: false,
        }),
      authed,
    );
  }

  /**
   * Authenticated POST with a caller-assembled binary body (the resume upload's
   * hand-built multipart — requestUrl has no FormData). Same auth, same error
   * taxonomy as post().
   */
  async postRaw<T = Record<string, unknown>>(path: string, body: ArrayBuffer, contentType: string): Promise<ApiResponse<T>> {
    const authed = !!this.opts.authToken;
    return this.exchange<T>(
      path,
      () => requestUrl({ url: `${this.opts.baseUrl}${path}`, method: 'POST', headers: this.headersFor({ 'Content-Type': contentType }, authed), body, throw: false }),
      authed,
    );
  }

  /**
   * Authenticated GET. The card and relationship endpoints are query-param GETs
   * rather than POSTs, so the adapter has to speak both.
   */
  async get<T = Record<string, unknown>>(
    path: string,
    opts?: { headers?: Record<string, string> },
  ): Promise<ApiResponse<T>> {
    const authed = !!this.opts.authToken;
    return this.exchange<T>(
      path,
      () => requestUrl({ url: `${this.opts.baseUrl}${path}`, method: 'GET', headers: this.headersFor({ ...opts?.headers }, authed), throw: false }),
      authed,
    );
  }

  /**
   * The only way to send a journal entry. Asserts the invariant before the
   * request is built, so a violation can't reach the wire even in a mock.
   */
  async postJournal<T = Record<string, unknown>>(
    path: string,
    payload: EncryptedJournalPayload,
  ): Promise<ApiResponse<T>> {
    assertEncrypted(payload);
    return this.post<T>(path, payload as unknown as Record<string, unknown>);
  }
}

function parseJson<T>(res: RequestUrlResponse): T | null {
  try {
    return (res.json ?? null) as T | null;
  } catch {
    return null;
  }
}

function errorCodeOf(data: unknown): string | null {
  if (data && typeof data === 'object' && 'error' in data) {
    const code = (data as { error?: unknown }).error;
    if (typeof code === 'string') return code;
  }
  return null;
}

function networkErrorCode(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return /net::|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|Failed to fetch/i.test(message) ? 'offline' : 'network_error';
}
