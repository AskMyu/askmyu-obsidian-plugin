/**
 * Plugin settings — shape, defaults, and the persistence seam.
 *
 * Everything here lands in the vault's `.obsidian/plugins/askmyu/data.json`,
 * which co-installed plugins can read. That constrains what may live here:
 *
 *   · the plugin token — accepted, disclosed, revocable (plan §Accepted risks);
 *   · the WRAPPED mDEK — ciphertext whose key is on the server, useless alone;
 *   · the allowlist and queue — the user's own configuration and their own
 *     already-encrypted payloads.
 *
 * What must never appear: a raw key, a recovery phrase, or note plaintext.
 * `redactForLog()` at the bottom exists so a support dump can be pasted into a
 * ticket without leaking the token.
 */

import type { PersistedAuth } from './auth/UnlockMachine';

/** One entry in the durable offline queue. Payloads are already encrypted. */
export interface QueuedCapture {
  external_id: string;
  encrypted_content: string;
  encryption_version: number;
  occurred_at: number;
  entity_hints: string[];
  previous_external_id?: string;
  queued_at: number;
  attempts: number;
}

export interface AskMyuSettings extends PersistedAuth {
  /** Backend base URL. Local dev points this at the docker stack. */
  base_url: string;
  /** Event-service URL override. Empty = derived from base_url (`<origin>/sse/get`). */
  sse_url: string;

  /**
   * Stable per-vault id, generated once and persisted here (REVIEW M3). The
   * external_id key is `<vault_id>:<path>`, NOT `<vault-folder-name>:<path>` —
   * renaming the vault folder must not re-key every note and duplicate the
   * whole vault server-side. Lives in the vault's own plugin data, so it
   * survives renames.
   */
  vault_id: string;

  /**
   * Folders (vault-relative, no trailing slash) and tags the user has shared.
   * EMPTY IS THE DEFAULT AND IT IS LOAD-BEARING: the vault watcher is not
   * registered while both are empty (QA invariant 2 — fail closed structurally,
   * not by an `if` inside a handler).
   */
  allowlist_folders: string[];
  allowlist_tags: string[];

  /** First-run consent has been shown and answered. Nothing is read before this. */
  consent_completed: boolean;

  /** Seconds of quiet after the last edit before a note is captured. */
  quiescence_seconds: number;

  /** external_id → content hash of the last successful capture. Skips no-ops. */
  capture_hashes: Record<string, string>;

  /** Durable, encrypted-only queue for captures made while offline or relocked. */
  queue: QueuedCapture[];

  /** B4: the single opt-in that permits a vault write. Off, and it stays off. */
  weekly_review_enabled: boolean;
  weekly_review_folder: string;

  /**
   * SECOND allowlist — meeting-notes folders (P5.1). Its own consent, its own
   * modal: meeting notes are a different data class than journal capture (they
   * carry other people's words and are processed server-side like every meeting
   * source), so saying yes to one must never imply yes to the other. A note
   * outside these folders can still opt IN with `myu-meeting: true` frontmatter.
   */
  meeting_folders: string[];
  /** Where person pages live (P5.4). Read-only index; never written into. */
  people_folders: string[];
  /** external_id → content hash of the last successfully ingested meeting note. */
  meeting_hashes: Record<string, string>;

  /** Mirror-edition periods the user has been pointed at (P4.4). */
  monthly_seen: Record<string, boolean>;

  /**
   * P8 — the shared surface. Its own consent
   * class, third after journal + meetings: Myu WRITES here, plaintext on disk,
   * and edits here are things the user is saying to Myu. All off until the
   * ceremony. `materialize_folder` is configurable because vault people are
   * opinionated about structure (Readwise/Granola both allow it).
   */
  materialize_consented: boolean;
  /**
   * The canvas pane's switch: keep EVERY canvas it shows in Myu/Canvas/,
   * automatically. Default off. Turning it on runs the exposure warning once —
   * the standing yes (R2) that replaces the per-save modal. While on, the
   * per-save button is hidden; the switch itself stays visible, on.
   */
  auto_keep_canvas: boolean;
  materialize_enabled: boolean;
  /** Latches true once the write-consent modal has been SHOWN (either outcome),
      so the sign-in ladder offers it exactly once and never re-nags a user who
      said no. Distinct from _consented (said yes). */
  materialize_offered: boolean;
  materialize_folder: string;
  materialize_people: boolean;
  materialize_today: boolean;
  materialize_commitments: boolean;
  /** P8.9 — server-side history down into the vault. Same consent umbrella:
      it is the user's own data, on the paper they chose. */
  materialize_meetings_history: boolean;
  materialize_journal_history: boolean;
  /** Myu/Days/ + the month grid — the web calendar's month view as paper. */
  materialize_calendar: boolean;
  /** Sync Myu's folder when the vault opens (default on). The sync button in Today is always there. */
  sync_on_open: boolean;
  /** myu-id → checked state as of OUR last write. The tick-diff baseline. */
  myu_checkbox_state: Record<string, boolean>;
  /**
   * `<canvas path>::<node id>` → hash of that node's MEANING as of our last
   * write (P-CANVAS-2). Per-node, exactly like myu_checkbox_state is per-id:
   * a canvas is edited constantly by design, so a whole-file baseline would
   * put it in permanent hold. Layout is excluded from the hash on purpose —
   * moving a card is handling, not meaning, and must never raise a signal.
   */
  myu_canvas_node_state: Record<string, string>;
  /** vault path → content hash at our last write. Edit-hold: a file whose
      current hash differs has unshipped human edits — don't regenerate it
      until the watcher has shipped them. */
  myu_file_hashes: Record<string, string>;
  /** Interaction events observed while offline; drained with the queues. */
  vault_event_queue: Array<{
    myu_id: string;
    kind: 'tick' | 'untick' | 'edit' | 'add' | 'delete';
    before?: string;
    after?: string;
    source_timestamp: number;
    content_hash?: string;
  }>;
  /** Epoch ms of the last full people materialization (daily ratchet). */
  last_people_materialize: number;
  /** Epoch ms of the last cheap history sweep (meetings/journal/calendar). */
  last_history_materialize: number;
  /** day → people with memories minted that day (fed by the people pass,
      consumed by the Days weave). Capped at 90 days. */
  memories_by_day: Record<string, string[]>;
  /** Epoch ms of the last open-sync (full pass on vault open). Throttles it. */
  last_open_sync: number;
  /** Server time of the last /vault/changes read (0 = never; the next sync is a first sync). */
  vault_changes_since: number;
  /** Per entity, the `changed_at` we last wrote — a card with the same stamp is skipped. */
  myu_entity_changed_at: Record<string, number>;

  /** P9 — signed up here, recovery not hardened yet. Drives the prompt row. */
  recovery_pending: boolean;

  /** Drives MockApi instead of the real backend, for building before it lands. */
  use_mock_backend: boolean;

  /** First-enable welcome shown once — never re-opens on later enables. */
  first_run_shown: boolean;
  /** The setup checklist in Today: hidden by the user (settings keeps every door). */
  setup_hidden: boolean;
  /** Backfill ran, or the person chose "only from now on" — the row is done. */
  backfill_done: boolean;
  /** The meeting-notes consent was answered (either way) — the row is done. */
  meeting_consent_offered: boolean;

  /** Last obsidian:// action received, stamped for support diagnostics —
      "did the deep link even reach the plugin?" is otherwise unanswerable. */
  last_protocol: string;

  /** Opt-in visual identity: Myu's own accents (shared with the webapp),
      scoped to MYU SURFACES ONLY. Off = pure Obsidian theme (the
      vault-culture default — a plugin that ignores the user's theme reads as
      a foreign object; one that offers its look as a CHOICE reads as a
      product). */
}

export const DEFAULT_SETTINGS: AskMyuSettings = {
  token: null,
  device_id: null,
  wrapped_mdek: null,
  session_token: null,
  account_id: null,
  background_work_consented: null,

  base_url: 'https://myu.askmyu.com/api',
  sse_url: '',

  vault_id: '',

  allowlist_folders: [],
  allowlist_tags: [],
  consent_completed: false,

  // 90 seconds. Vault-culture finding: daily notes are edited continuously all
  // day, so anything shorter captures a half-written sentence over and over.
  quiescence_seconds: 90,

  capture_hashes: {},
  queue: [],

  weekly_review_enabled: false,
  weekly_review_folder: '',

  meeting_folders: [],
  people_folders: ['People'],
  meeting_hashes: {},

  monthly_seen: {},

  materialize_consented: false,
  auto_keep_canvas: false,
  materialize_enabled: false,
  materialize_offered: false,
  materialize_folder: 'Myu',
  materialize_people: true,
  materialize_today: true,
  materialize_commitments: true,
  materialize_meetings_history: true,
  materialize_journal_history: true,
  materialize_calendar: true,
  sync_on_open: true,
  myu_checkbox_state: {},
  myu_canvas_node_state: {},
  myu_file_hashes: {},
  vault_event_queue: [],
  last_people_materialize: 0,
  last_history_materialize: 0,
  memories_by_day: {},
  last_open_sync: 0,
  vault_changes_since: 0,
  myu_entity_changed_at: {},

  recovery_pending: false,

  use_mock_backend: false,

  first_run_shown: false,
  setup_hidden: false,
  backfill_done: false,
  meeting_consent_offered: false,
  last_protocol: '',

};

/**
 * Merge stored plugin data over the defaults, repairing structure. BRAT users
 * upgrade constantly and data.json is user-editable: a missing field must fall
 * to its default, an unknown field must survive (a DOWNGRADE must not lose a
 * newer build's state), and a structural field that arrives null or mistyped
 * must reset rather than brick unlock on the first `.push` — custody fields
 * (token, wrapped_mdek, …) are scalars and pass through untouched.
 */
export function normalizeSettings(raw: unknown): AskMyuSettings {
  const stored = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const merged = Object.assign({}, DEFAULT_SETTINGS, stored) as Record<string, unknown>;

  // Prod moved off `api.askmyu.com` (2026-08-26): the backend answers at
  // `myu.askmyu.com/api`, same origin as the web app. A stored base_url is
  // sticky — it lives in data.json and would outlive the default forever — so
  // rewrite the one dead host rather than leaving installs pointed at nothing.
  // Only that exact host: an operator running a custom or local backend keeps
  // whatever they set.
  if (typeof merged.base_url === 'string' && merged.base_url.includes('://api.askmyu.com')) {
    merged.base_url = merged.base_url.replace('://api.askmyu.com', '://myu.askmyu.com');
  }
  for (const [key, fallback] of Object.entries(DEFAULT_SETTINGS)) {
    const value = merged[key];
    if (Array.isArray(fallback)) {
      if (!Array.isArray(value)) merged[key] = [...fallback];
    } else if (fallback !== null && typeof fallback === 'object') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) merged[key] = { ...fallback };
    }
  }
  return merged as unknown as AskMyuSettings;
}

/** Safe to paste into a support ticket. */
export function redactForLog(settings: AskMyuSettings): Record<string, unknown> {
  return {
    ...settings,
    token: settings.token ? `${settings.token.slice(0, 4)}…(${settings.token.length} chars)` : null,
    session_token: settings.session_token ? 'present' : null,
    wrapped_mdek: settings.wrapped_mdek ? `ciphertext(${settings.wrapped_mdek.length})` : null,
    capture_hashes: `${Object.keys(settings.capture_hashes).length} notes`,
    meeting_hashes: `${Object.keys(settings.meeting_hashes).length} meeting notes`,
    queue: `${settings.queue.length} queued`,
  };
}
