/**
 * Tier A of the web's toasts, as Obsidian Notices (operator, 2026-08-29).
 *
 * The web toasts three kinds of thing. Per-action results the plugin already
 * mirrors at each action. Initiative cards it deliberately does NOT toast —
 * invariant 4, notify.ts: "Notice is never an initiative channel"; they land in
 * Today. This file is the third kind: something happened to your ACCOUNT or
 * SESSION, and you deserve to know. Same events, same words as the web
 * (useEncryptionSSE, useCareerSSE, EventHandler), read from the emitters:
 *
 *   DEVICE_TRANSFER_PENDING    {request_id, device_name}      → New Device Request  (persistent; click → Devices)
 *   DEVICE_TRANSFER_COMPLETED  {new_device_name}              → Transfer Completed
 *   DEVICE_TRANSFER_DENIED     {request_id}                   → Transfer Denied
 *   logout                     content = account id           → Logged Out + forget custody
 *   toast                      {type,title,content|message,duration,persistent} → as sent (server-authored)
 *   career_position_update     {role_title, company_name}     → Career position updated
 *   career_prediction_ready    {summary}                      → New career prediction available
 *
 * Not here: DEVICE_TRANSFER_APPROVED (the web subscribes; the backend never
 * emits it), and the messaging events (MESSAGE_INTERCEPTED etc. — a separate
 * stream this plugin does not open). Pure mapping, so the words are pinned.
 */

export interface LiveNotice {
  title: string;
  body?: string;
  kind: 'info' | 'success' | 'error';
  /** 0 = stays until dismissed (Notice semantics). */
  durationMs?: number;
  action?: 'open_devices' | 'open_person';
  /** For open_person. */
  relationshipId?: string;
  personName?: string;
  /** Same key within 30 minutes → not shown again (the web's per-type dedup for priority cards). */
  dedupeKey?: string;
}

/**
 * The web's TOAST_CARD_TYPES (lib/ToastDispatcher.ts): the relationship-health
 * cards that toast instead of landing in a panel. Everything else in
 * priority_card is a panel card — Today's business, not a Notice's.
 */
const TOAST_CARD_TYPES = new Set(['conflict_risk', 'burnout_warning', 'goal_at_risk', 'deadline_alert', 'unanswered_message', 'no_contact', 'communication_debt', 'sentiment_drop', 'engagement_decline', 'person_validation']);

export interface LiveNoticeDeps {
  accountId(): string | null;
  notify(notice: LiveNotice): void;
  openDevices(): void;
  openPerson?(relationshipId: string, name: string): void;
  /** A server-side logout for THIS account: forget custody, say why. */
  onRemoteLogout(reason: string): void;
}

/** Every event type this file listens on — exported so main.ts and the tests share one list. */
export const LIVE_NOTICE_EVENTS = [
  'DEVICE_TRANSFER_PENDING', 'DEVICE_TRANSFER_COMPLETED', 'DEVICE_TRANSFER_DENIED',
  'logout', 'toast', 'career_position_update', 'career_prediction_ready',
  // Relationship health (bucket 2, 2026-08-29) — only what the web shows under
  // its default "smart" mode: high/critical. Lower severities stay in the feed.
  'relationship_alert', 'priority_card',
] as const;

/**
 * NOT here, by doctrine (invariant 4 — Notice is never an initiative channel):
 * burnout_warning and goal_milestone. The web toasts them; in a vault they are
 * rows in Today ("noticed just now"), where a person meets them on their own
 * time. See main.ts → liveInsights.
 */

function str(v: unknown): string { return typeof v === 'string' ? v.trim() : ''; }

/** The Notice for one event — or null when it is not ours to show. */
export function liveNoticeFor(eventType: string, payload: Record<string, unknown>, accountId: string | null): LiveNotice | null {
  switch (eventType) {
    case 'DEVICE_TRANSFER_PENDING': {
      const device = str(payload.device_name) || 'A new device';
      return { title: 'New Device Request', body: `\u201c${device}\u201d wants to join your account`, kind: 'info', durationMs: 0, action: 'open_devices' };
    }
    case 'DEVICE_TRANSFER_COMPLETED': {
      const device = str(payload.new_device_name) || 'A device';
      return { title: 'Transfer Completed', body: `\u201c${device}\u201d was added by another device`, kind: 'info' };
    }
    case 'DEVICE_TRANSFER_DENIED':
      return { title: 'Transfer Denied', body: str(payload.reason) || 'The device transfer was denied', kind: 'error' };
    case 'logout': {
      // Broadcast on the account channel with the account id as content; the
      // web checks it is for the current user before acting. So do we.
      const target = str(payload.content);
      if (!target || !accountId || target !== accountId) return null;
      return { title: 'Logged Out', body: str(payload.reason) || 'Your session was ended by an administrator', kind: 'error', durationMs: 0 };
    }
    case 'toast': {
      const body = str(payload.content) || str(payload.message);
      const title = str(payload.title);
      if (!body && !title) return null;
      const type = str(payload.type);
      const kind: LiveNotice['kind'] = type === 'error' || type === 'warning' ? 'error' : type === 'success' ? 'success' : 'info';
      const persistent = payload.persistent === true;
      const duration = typeof payload.duration === 'number' && payload.duration > 0 ? payload.duration : undefined;
      return { title: title || body, body: title ? body : undefined, kind, durationMs: persistent ? 0 : duration };
    }
    case 'career_position_update': {
      const role = str(payload.role_title);
      if (!role) return null;
      const company = str(payload.company_name);
      return { title: 'Career position updated', body: role + (company ? ` at ${company}` : ''), kind: 'info' };
    }
    case 'relationship_alert': {
      // {alert_type, relationship_id, person_name, severity, message}. The web
      // toasts every severity but its smart mode shows only high; the LinkedIn
      // info alerts are pull-based on the card here anyway.
      const severity = str(payload.severity);
      if (severity !== 'high' && severity !== 'critical') return null;
      const name = str(payload.person_name);
      const message = str(payload.message) || `Relationship status change detected${name ? ` with ${name}` : ''}`;
      const rel = str(payload.relationship_id);
      return { title: name ? `\u26a0\ufe0f ${name}` : 'Relationship alert', body: message, kind: 'error', durationMs: 8000, ...(rel ? { action: 'open_person' as const, relationshipId: rel, personName: name } : {}), dedupeKey: `relationship_alert:${rel || name}:${str(payload.alert_type)}` };
    }
    case 'priority_card': {
      // {card_type, urgency, priority, card_data:{title, description}}. Toast-type
      // cards at critical/high, like the web's default mode; critical persists.
      const type = str(payload.card_type).replace(/_card$/, '');
      if (!TOAST_CARD_TYPES.has(type)) return null;
      const urgency = str(payload.urgency);
      const critical = urgency === 'critical' || urgency === 'immediate';
      if (!critical && urgency !== 'high' && urgency !== 'urgent') return null;
      const data = payload.card_data && typeof payload.card_data === 'object' ? (payload.card_data as Record<string, unknown>) : {};
      const title = str(data.title) || str(payload.title) || type.replace(/_/g, ' ');
      const body = str(data.description) || str(payload.description);
      const rel = str(data.relationship_id) || str(data.person_id);
      return { title, body: body || undefined, kind: critical ? 'error' : 'info', durationMs: critical ? 0 : 8000, ...(rel ? { action: 'open_person' as const, relationshipId: rel, personName: str(data.person_name) } : {}), dedupeKey: `priority_card:${type}` };
    }
    case 'career_prediction_ready': {
      const summary = str(payload.summary);
      if (!summary) return null;
      return { title: 'New career prediction available', body: summary.length > 60 ? summary.slice(0, 57) + '...' : summary, kind: 'info' };
    }
    default:
      return null;
  }
}

/** Subscribe every tier-A event; route to notify / devices / logout. */
export function registerLiveNotices(
  subscribe: (eventType: string, handler: (payload: Record<string, unknown>) => void) => unknown,
  deps: LiveNoticeDeps,
): void {
  const recent = new Map<string, number>();
  for (const eventType of LIVE_NOTICE_EVENTS) {
    subscribe(eventType, (payload) => {
      const notice = liveNoticeFor(eventType, payload ?? {}, deps.accountId());
      if (!notice) return;
      if (notice.dedupeKey) {
        const last = recent.get(notice.dedupeKey) ?? 0;
        if (Date.now() - last < 30 * 60 * 1000) return;
        recent.set(notice.dedupeKey, Date.now());
      }
      deps.notify(notice);
      if (eventType === 'logout') deps.onRemoteLogout(notice.body ?? 'logout');
    });
  }
}
