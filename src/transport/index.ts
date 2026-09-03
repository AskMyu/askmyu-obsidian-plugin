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

export { assertEncrypted, PlaintextRefusedError } from './assertEncrypted';

export interface TransportOptions {
  /** Backend base URL, e.g. https://myu.askmyu.com/api */
  baseUrl: string;
  /** Session token from the token→session exchange. Null before connect. */
  authToken: string | null;
  /** Called when the backend says the session is gone, so auth can relock. */
  onUnauthorized?: () => void;
  /**
   * Called on 428 — the beta-terms gate (2026-09-02). The session is fine; the
   * account has not agreed to the current terms. The body is the 428 payload
   * (`terms_required`, `terms_version`, `urls`). A screen, never a re-mint.
   */
  onTermsRequired?: (body: unknown) => void;
}

export interface ApiResponse<T = Record<string, unknown>> {
  status: number;
  ok: boolean;
  data: T | null;
  /** Backend error code (`invalid_token`, `token_used`, …) when present. */
  error: string | null;
}

export type { EncryptedJournalPayload } from './assertEncrypted';

export class Transport {
  private opts: TransportOptions;

  constructor(opts: TransportOptions) {
    this.opts = opts;
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

  /**
   * Authenticated POST. Every backend call in the plugin goes through here.
   *
   * `throw: false` on requestUrl so 4xx/5xx come back as responses — Obsidian's
   * default throws, which would turn every expected 401 into an unhandled
   * rejection in a background interval.
   */
  async post<T = Record<string, unknown>>(
    path: string,
    body: Record<string, unknown> = {},
    opts: { anonymous?: boolean; headers?: Record<string, string> } = {},
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = this.baseHeaders({ 'Content-Type': 'application/json', ...(opts.headers ?? {}) });
    if (!opts.anonymous && this.opts.authToken) {
      headers['Authorization'] = `Bearer ${this.opts.authToken}`;
    }

    let res: RequestUrlResponse;
    try {
      res = await requestUrl({
        url: `${this.opts.baseUrl}${path}`,
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        throw: false,
      });
    } catch (err) {
      // Genuinely offline, DNS failure, TLS refusal. Not an auth problem —
      // callers (the queue especially) must be able to tell those apart.
      return { status: 0, ok: false, data: null, error: networkErrorCode(err) };
    }

    if (res.status === 401) this.opts.onUnauthorized?.();

    const data = parseJson<T>(res);
    if (res.status === 428) this.opts.onTermsRequired?.(data);
    return {
      status: res.status,
      ok: res.status >= 200 && res.status < 300,
      data,
      error: errorCodeOf(data) ?? (res.status >= 400 ? `http_${res.status}` : null),
    };
  }

  /**
   * Authenticated POST with a caller-assembled binary body (the resume upload's
   * hand-built multipart — requestUrl has no FormData). Same auth, same error
   * taxonomy as post().
   */
  async postRaw<T = Record<string, unknown>>(path: string, body: ArrayBuffer, contentType: string): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = this.baseHeaders({ 'Content-Type': contentType });
    if (this.opts.authToken) headers['Authorization'] = `Bearer ${this.opts.authToken}`;
    let res: RequestUrlResponse;
    try {
      res = await requestUrl({ url: `${this.opts.baseUrl}${path}`, method: 'POST', headers, body, throw: false });
    } catch (err) {
      return { status: 0, ok: false, data: null, error: networkErrorCode(err) };
    }
    if (res.status === 401) this.opts.onUnauthorized?.();
    const data = parseJson<T>(res);
    if (res.status === 428) this.opts.onTermsRequired?.(data);
    return {
      status: res.status,
      ok: res.status >= 200 && res.status < 300,
      data,
      error: errorCodeOf(data) ?? (res.status >= 400 ? `http_${res.status}` : null),
    };
  }

  /**
   * Authenticated GET. The card and relationship endpoints are query-param GETs
   * rather than POSTs, so the adapter has to speak both.
   */
  async get<T = Record<string, unknown>>(
    path: string,
    opts?: { headers?: Record<string, string> },
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = this.baseHeaders({ ...opts?.headers });
    if (this.opts.authToken) headers['Authorization'] = `Bearer ${this.opts.authToken}`;

    let res: RequestUrlResponse;
    try {
      res = await requestUrl({ url: `${this.opts.baseUrl}${path}`, method: 'GET', headers, throw: false });
    } catch (err) {
      return { status: 0, ok: false, data: null, error: networkErrorCode(err) };
    }

    if (res.status === 401) this.opts.onUnauthorized?.();
    const data = parseJson<T>(res);
    if (res.status === 428) this.opts.onTermsRequired?.(data);
    return {
      status: res.status,
      ok: res.status >= 200 && res.status < 300,
      data,
      error: errorCodeOf(data) ?? (res.status >= 400 ? `http_${res.status}` : null),
    };
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
