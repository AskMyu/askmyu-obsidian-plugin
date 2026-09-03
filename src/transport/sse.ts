/**
 * SSE client — the pane goes live, the same way the web does it.
 *
 * This uses `event-source-polyfill`, the SAME dependency the web's
 * `EventSourceManager` uses, because native `EventSource` cannot send
 * `Authorization: Bearer <token>`. It replaced a hand-rolled fetch-stream
 * reader on 2026-08-31: that version re-implemented framing, reconnection and
 * liveness by hand, and its retry loop could stop for the rest of a session —
 * a server restart left the vault silent, and a device asking to join was
 * never announced. Two clients, one reconnect implementation, is the point.
 *
 * **The SSEMsgEvent envelope unwrap is here from day one.** The backend's
 * `emitEventDirect` wraps every payload as `{eventType, content: "<json
 * string>"}`; the web read fields as if payloads were flat, so its whole live
 * layer was silently inert until 2026-08-18. This client is not born with that
 * bug: `content` that parses to a JSON object REPLACES the envelope; plain-text
 * `content` (a toast) passes through untouched.
 *
 * Liveness is never assumed: `isConnected` reports a stream that is actually
 * open (not merely wanted), and `ensure()` lets an ambient watchdog re-open a
 * dead one. Callers still treat this as best-effort — anything that must not be
 * missed is polled as well.
 */

import { EventSourcePolyfill } from 'event-source-polyfill';

export type SSEHandler = (payload: Record<string, unknown>) => void;

/** No traffic for this long → assume the stream is dead and reconnect. The server heartbeats every 30s. */
const HEARTBEAT_TIMEOUT_MS = 90_000;
const BACKOFF_START_MS = 2_000;
const BACKOFF_MAX_MS = 60_000;
/** A refused stream (the server wants encryption set up first) is not a network blip — wait longer. */
const REFUSED_BACKOFF_MS = 5 * 60_000;

/**
 * What a failed connection means. 401/403: the server refused this session —
 * back off for a long time, not a flaky network. 428: the beta-terms gate
 * (2026-09-02) — the session is fine, the account has not agreed; STOP, and
 * let the plugin restart the stream after acceptance. Anything else: retry.
 */
export function sseErrorPlan(status: number | undefined): 'gated' | 'refused' | 'retry' {
  if (status === 428) return 'gated';
  if (status === 401 || status === 403) return 'refused';
  return 'retry';
}

export class SSEClient {
  private listeners = new Map<string, Set<SSEHandler>>();
  private source: EventSourcePolyfill | null = null;
  private reconnectTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private backoffMs = BACKOFF_START_MS;
  private desired = false;
  /** A stream is OPEN right now (not merely wanted). */
  private connected = false;
  private lastContactAt = 0;
  private url: string | null = null;
  private token: string | null = null;
  /** Stopped by a 428: no reconnect until `start()` is called again. */
  private gated = false;
  /** The plugin's ear for the gate — it shows the screen; the stream just stops. */
  onGated: (() => void) | null = null;

  /** Connect (or re-target) the stream. Safe to call repeatedly. */
  start(url: string, token: string): void {
    this.url = url;
    this.token = token;
    this.desired = true;
    this.gated = false;
    this.backoffMs = BACKOFF_START_MS;
    this.open();
  }

  /** Stop and stay stopped (relock, disconnect, unload). */
  stop(): void {
    this.desired = false;
    this.connected = false;
    this.closeSource();
    this.clearTimers();
  }

  /** We WANT a stream (start called, stop not). Not proof of one. */
  get isRunning(): boolean {
    return this.desired;
  }

  /** A stream is open right now. */
  get isConnected(): boolean {
    return this.connected;
  }

  /** ms since the last byte from the server (Infinity when never). */
  get sinceLastContactMs(): number {
    return this.lastContactAt === 0 ? Number.POSITIVE_INFINITY : Date.now() - this.lastContactAt;
  }

  /**
   * Watchdog entry point: reconnect NOW if the stream is down. A live socket is
   * not something to take on faith.
   */
  ensure(): void {
    if (!this.desired || this.connected) return;
    this.clearTimers();
    this.backoffMs = BACKOFF_START_MS;
    this.open();
  }

  subscribe(eventType: string, handler: SSEHandler): () => void {
    let set = this.listeners.get(eventType);
    if (!set) {
      set = new Set();
      this.listeners.set(eventType, set);
    }
    set.add(handler);
    return () => set?.delete(handler);
  }

  // ── stream ────────────────────────────────────────────────────────────────

  private open(): void {
    if (!this.desired || !this.url || !this.token || this.gated) return;
    this.closeSource();
    // Nothing may leave this method without either a live stream or a retry
    // armed — the previous implementation could throw its way out of both.
    try {
      const source = new EventSourcePolyfill(this.url, {
        headers: { Authorization: `Bearer ${this.token}` },
        // The polyfill's own staleness watch; ours below is the backstop.
        heartbeatTimeout: HEARTBEAT_TIMEOUT_MS,
      });
      this.source = source;

      source.onopen = () => {
        if (source !== this.source) return;
        this.connected = true;
        this.backoffMs = BACKOFF_START_MS;
        this.lastContactAt = Date.now();
        this.armHeartbeat();
      };
      // Real events ride the default `message` name; heartbeats are named.
      source.onmessage = (event) => {
        if (source !== this.source) return;
        const data = (event as MessageEvent).data;
        this.dispatch('message', typeof data === 'string' ? data : '');
      };
      source.addEventListener('heartbeat', () => {
        if (source !== this.source) return;
        this.lastContactAt = Date.now();
        this.armHeartbeat();
      });
      source.onerror = (event: unknown) => {
        if (source !== this.source) return;
        this.connected = false;
        const status = (event as { status?: number } | null)?.status;
        this.closeSource();
        const plan = sseErrorPlan(status);
        if (plan === 'gated') {
          // Would loop on the short backoff otherwise (plan review, 2026-09-01).
          this.gated = true;
          this.onGated?.();
          return;
        }
        if (plan === 'refused') this.backoffMs = REFUSED_BACKOFF_MS;
        this.scheduleReconnect();
      };
    } catch {
      this.connected = false;
      this.scheduleReconnect();
    }
  }

  private closeSource(): void {
    const source = this.source;
    this.source = null;
    if (!source) return;
    try {
      source.close();
    } catch {
      // Already closed by the polyfill — nothing to do.
    }
  }

  private dispatch(eventName: string, data: string): void {
    // Any traffic proves the stream is alive.
    this.lastContactAt = Date.now();
    this.armHeartbeat();
    if (eventName === 'heartbeat') return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }
    if (!parsed || typeof parsed !== 'object' || !('eventType' in parsed)) return;

    const { eventType, ...rest } = parsed as { eventType: string } & Record<string, unknown>;

    // The envelope unwrap — see the header. Only when `content` is itself a
    // JSON OBJECT string; plain text passes through untouched.
    let payload: Record<string, unknown> = rest;
    const inner = rest.content;
    if (typeof inner === 'string' && inner.trimStart().startsWith('{')) {
      try {
        const innerParsed = JSON.parse(inner);
        if (innerParsed && typeof innerParsed === 'object' && !Array.isArray(innerParsed)) {
          payload = innerParsed as Record<string, unknown>;
        }
      } catch {
        // Not JSON after all — leave the envelope as-is.
      }
    }

    for (const handler of this.listeners.get(eventType) ?? []) {
      try {
        handler(payload);
      } catch {
        // One handler's throw must not kill the stream loop.
      }
    }
  }

  // ── liveness ──────────────────────────────────────────────────────────────

  private armHeartbeat(): void {
    if (this.heartbeatTimer !== null) window.clearTimeout(this.heartbeatTimer);
    this.heartbeatTimer = window.setTimeout(() => {
      // Quiet too long — kill and reconnect; the ambient poll covers meanwhile.
      this.connected = false;
      this.closeSource();
      this.scheduleReconnect();
    }, HEARTBEAT_TIMEOUT_MS);
  }

  private scheduleReconnect(): void {
    if (!this.desired || this.reconnectTimer !== null) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, this.backoffMs);
    this.backoffMs = Math.min(this.backoffMs * 2, BACKOFF_MAX_MS);
  }

  private clearTimers(): void {
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    if (this.heartbeatTimer !== null) window.clearTimeout(this.heartbeatTimer);
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
  }
}

/**
 * The event service lives at `<origin>/sse/get` (the backend is
 * `<origin>/api`) — the same relationship every deployment profile in
 * `eas.json` encodes. Overridable in settings for exotic stacks.
 */
export function deriveSseUrl(baseUrl: string, accountId: string): string {
  const origin = baseUrl.replace(/\/api\/?$/, '');
  return `${origin}/sse/get?account_id=${encodeURIComponent(accountId)}`;
}
