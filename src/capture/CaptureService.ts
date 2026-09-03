/**
 * The capture pipeline (B1 + B2).
 *
 *   vault event → allowlist → frontmatter veto → ~90s quiescence → hash diff
 *   → wikilink hints → encrypt under the mDEK → upsert by external_id
 *
 * Three things here are load-bearing and easy to get wrong:
 *
 * **The watcher is not registered while the allowlist is empty** (QA invariant
 * 2). Not "registered and returns early" — never wired at all. A guard inside a
 * handler is one bad edit away from reading a vault nobody consented to share;
 * an unregistered handler cannot fire. `start()` is the only place that decides,
 * and it decides by looking at the allowlist.
 *
 * **Quiescence, not debounce-per-keystroke.** Vault notes are living documents
 * edited all day. We wait for the note to go quiet (~90s) and then capture the
 * whole thing, upserting by `external_id`, so one note remains one entry no
 * matter how many times it is touched.
 *
 * **Encryption happens here, before the payload exists.** Plaintext never enters
 * a queue entry, a log line, or a request. The transport asserts it again at the
 * chokepoint (invariant 1); belt and braces, on purpose.
 */

import type { App, TAbstractFile, TFile } from 'obsidian';
import { TFile as TFileClass } from 'obsidian';
import type { AskMyuApi } from '../transport/api';
import type { EncryptedJournalPayload } from '../transport/index';
import type { AskMyuSettings, QueuedCapture } from '../settings';
import type { KeyHolder } from '../crypto/KeyHolder';
import { encryptWithKey } from '../crypto/primitives';
import { extractEntityHints } from './wikilinks';
import { hashContent, readNoteMeta, stripFrontmatter } from './noteMeta';

const ENCRYPTION_VERSION = 1;

/** Vault events arrive per keystroke-ish; this collapses them per file. */
type PendingTimers = Map<string, number>;

export interface CaptureDeps {
  app: App;
  api: AskMyuApi;
  keys: KeyHolder;
  settings: () => AskMyuSettings;
  save: () => Promise<void>;
  /** True only in UNLOCKED — capture pauses in every other state. */
  canCapture: () => boolean;
  /** Surfaces "paused, offline" style status in settings/Today. */
  onStatus?: (status: string) => void;
}

export class CaptureService {
  private timers: PendingTimers = new Map();
  private registered = false;
  /** REVIEW M1: at most one flushQueue drain in flight. */
  private flushing = false;
  /** REVIEW M2: gate the (register-once) watcher handlers on capture liveness. */
  private active = false;
  private everRegistered = false;

  constructor(private deps: CaptureDeps) {}

  get isWatching(): boolean {
    return this.registered;
  }

  /**
   * Register the vault watcher — but ONLY if something is shared. Returns
   * whether it registered, so callers can render honest status.
   */
  start(register: (event: 'modify' | 'create' | 'rename' | 'delete', fn: (...args: never[]) => void) => void): boolean {
    const { allowlist_folders, allowlist_tags } = this.deps.settings();
    if (allowlist_folders.length === 0 && allowlist_tags.length === 0) {
      // Invariant 2, structurally: nothing shared, so the watcher is never
      // registered in the first place.
      return false;
    }

    // Register the vault handlers EXACTLY ONCE (REVIEW M2). Re-starting after a
    // stop() used to re-register, stacking a duplicate handler set every
    // lock/unlock/consent cycle. The handlers instead gate on `active`, which
    // stop() clears — so after a stop the still-live handlers are inert, and a
    // later start re-activates them without a second registration.
    if (!this.everRegistered) {
      const onChange = (file: TAbstractFile) => {
        if (this.active && file instanceof TFileClass) this.scheduleCapture(file);
      };
      const onRename = (file: TAbstractFile, oldPath: string) => {
        if (this.active && file instanceof TFileClass) this.scheduleCapture(file, oldPath);
      };
      register('modify', onChange);
      register('create', onChange);
      register('rename', onRename);
      this.everRegistered = true;
    }

    this.active = true;
    this.registered = true;
    return true;
  }

  /** Called when the allowlist empties or the plugin unloads. */
  stop(): void {
    for (const timer of this.timers.values()) window.clearTimeout(timer);
    this.timers.clear();
    this.registered = false;
    // Handlers stay registered with Obsidian (it owns their unload teardown) but
    // become inert — capture does nothing until the next start() (REVIEW M2).
    this.active = false;
  }

  // ── the pipeline ──────────────────────────────────────────────────────────

  private scheduleCapture(file: TFile, previousPath?: string): void {
    if (file.extension !== 'md') return;
    if (!this.isShared(file)) return;

    const existing = this.timers.get(file.path);
    if (existing) window.clearTimeout(existing);

    const wait = Math.max(10, this.deps.settings().quiescence_seconds) * 1000;
    const timer = window.setTimeout(() => {
      this.timers.delete(file.path);
      void this.capture(file, previousPath);
    }, wait);

    this.timers.set(file.path, timer);
  }

  /**
   * Allowlist test. Folder match is prefix-on-path-segments (so `Daily` matches
   * `Daily/2026-08-10.md` but never `DailyPlanning/…`), tag match consults the
   * metadata cache so both frontmatter and inline tags count.
   */
  isShared(file: TFile): boolean {
    const { allowlist_folders, allowlist_tags } = this.deps.settings();

    for (const folder of allowlist_folders) {
      if (file.path === folder || file.path.startsWith(`${folder}/`)) return true;
    }

    if (allowlist_tags.length) {
      const cache = this.deps.app.metadataCache.getFileCache(file);
      const tags = new Set<string>();
      for (const t of cache?.tags ?? []) tags.add(t.tag.replace(/^#/, '').toLowerCase());
      // Frontmatter `tags:` is a list in most vaults and a bare string in some.
      const fmTags: unknown = cache?.frontmatter?.tags;
      if (Array.isArray(fmTags)) {
        for (const t of fmTags) if (typeof t === 'string') tags.add(t.replace(/^#/, '').toLowerCase());
      } else if (typeof fmTags === 'string') {
        tags.add(fmTags.replace(/^#/, '').toLowerCase());
      }

      for (const wanted of allowlist_tags) if (tags.has(wanted.replace(/^#/, '').toLowerCase())) return true;
    }

    return false;
  }

  /** One note → one upsert. Safe to call directly (backfill does). */
  async capture(file: TFile, previousPath?: string): Promise<'sent' | 'queued' | 'skipped' | 'vetoed'> {
    const meta = readNoteMeta(this.deps.app, file);
    if (meta.vetoed) return 'vetoed';

    const raw = await this.deps.app.vault.cachedRead(file);
    const body = stripFrontmatter(raw);
    if (body.trim().length === 0) return 'skipped';

    const settings = this.deps.settings();
    const externalId = this.externalId(file.path);
    const hash = await hashContent(body);

    // Unchanged since the last successful capture — the Templater-boilerplate
    // case, and the "opened a note and closed it" case.
    if (settings.capture_hashes[externalId] === hash) return 'skipped';

    const key = this.deps.keys.get();
    if (!key) {
      // Locked. We cannot encrypt, and we will not hold plaintext waiting for a
      // key, so this note is simply captured later — the hash isn't recorded, so
      // the next edit (or the next unlock sweep) picks it up.
      this.deps.onStatus?.('paused — locked');
      return 'skipped';
    }

    const payload: EncryptedJournalPayload = {
      encrypted_content: await encryptWithKey(body, key),
      encryption_version: ENCRYPTION_VERSION,
      source_type: 'obsidian',
      external_id: externalId,
      occurred_at: meta.occurredAt,
      entity_hints: extractEntityHints(body),
      no_response: true,
      ...(previousPath ? { previous_external_id: this.externalId(previousPath) } : {}),
    };

    const res = await this.deps.api.upsertJournal(payload);
    if (res.ok) {
      settings.capture_hashes[externalId] = hash;
      await this.deps.save();
      return 'sent';
    }

    // Offline or a server blip: keep the ciphertext, retry later. Auth failures
    // are not queued — a revoked token means the user's decision, not a retry.
    if (res.error === 'offline' || res.error === 'network_error' || res.status >= 500) {
      await this.enqueue(payload);
      return 'queued';
    }
    return 'skipped';
  }

  // ── queue ─────────────────────────────────────────────────────────────────

  private async enqueue(payload: EncryptedJournalPayload): Promise<void> {
    const settings = this.deps.settings();
    // One entry per note: a queued note edited again replaces its own entry
    // rather than stacking revisions nobody will read.
    const existing = settings.queue.findIndex((q) => q.external_id === payload.external_id);
    const entry: QueuedCapture = {
      external_id: payload.external_id,
      encrypted_content: payload.encrypted_content,
      encryption_version: payload.encryption_version,
      occurred_at: payload.occurred_at,
      entity_hints: payload.entity_hints ?? [],
      previous_external_id: payload.previous_external_id,
      queued_at: Date.now(),
      attempts: 0,
    };

    if (existing >= 0) settings.queue[existing] = entry;
    else settings.queue.push(entry);

    await this.deps.save();
    this.deps.onStatus?.(`${settings.queue.length} waiting to send`);
  }

  /**
   * Drain the queue. Called on unlock, on a timer, and from settings.
   * Stops at the first network failure — draining 200 entries against a dead
   * connection just burns battery.
   */
  async flushQueue(): Promise<{ sent: number; remaining: number }> {
    const settings = this.deps.settings();
    // Re-entrancy guard (REVIEW M1): flushQueue fires from a 10-min interval, on
    // every unlock, a command, and settings — with no guard, two overlapping
    // runs both read queue[0] and both shift(), dropping a different, never-sent
    // entry. One flush at a time; a concurrent caller no-ops.
    if (this.flushing) {
      return { sent: 0, remaining: settings.queue.length };
    }
    if (!settings.queue.length || !this.deps.canCapture()) {
      return { sent: 0, remaining: settings.queue.length };
    }

    this.flushing = true;
    try {
      return await this.drainQueue(settings);
    } finally {
      this.flushing = false;
    }
  }

  private async drainQueue(settings: AskMyuSettings): Promise<{ sent: number; remaining: number }> {
    let sent = 0;
    while (settings.queue.length > 0) {
      const entry = settings.queue[0];
      const res = await this.deps.api.upsertJournal({
        encrypted_content: entry.encrypted_content,
        encryption_version: entry.encryption_version,
        source_type: 'obsidian',
        external_id: entry.external_id,
        occurred_at: entry.occurred_at,
        entity_hints: entry.entity_hints,
        no_response: true,
        ...(entry.previous_external_id ? { previous_external_id: entry.previous_external_id } : {}),
      });

      if (res.ok) {
        settings.queue.shift();
        sent += 1;
        continue;
      }

      if (res.error === 'offline' || res.error === 'network_error') break;

      entry.attempts += 1;
      // Five failures that aren't network failures mean the payload itself is
      // the problem. Drop it rather than retry forever — and say so, because a
      // silently discarded note is worse than a visible one.
      if (entry.attempts >= 5) {
        settings.queue.shift();
        this.deps.onStatus?.(`Gave up sending one note after ${entry.attempts} tries.`);
      } else {
        break;
      }
    }

    await this.deps.save();
    return { sent, remaining: settings.queue.length };
  }

  // ── backfill ──────────────────────────────────────────────────────────────

  /** What a backfill would cover, for the scope confirmation. Reads no content. */
  surveyBackfill(): { files: TFile[]; oldest: number | null } {
    const files = this.deps.app.vault.getMarkdownFiles().filter((f) => this.isShared(f));
    const oldest = files.reduce<number | null>((min, f) => (min === null || f.stat.mtime < min ? f.stat.mtime : min), null);
    return { files, oldest };
  }

  /**
   * Bring in the vault's history — the acquisition wedge: months or years of
   * existing journal, so Myu has substrate on day one instead of a cold start.
   *
   * Sequential and yielding, not a parallel storm: this runs on someone's laptop
   * while they work, and a thousand-note vault should be invisible, not a fan.
   */
  async backfill(files: TFile[], onProgress?: (done: number, total: number) => void, shouldStop?: () => boolean): Promise<{ sent: number; skipped: number; stopped: boolean }> {
    let sent = 0;
    let skipped = 0;
    let stopped = false;

    for (let i = 0; i < files.length; i++) {
      if (!this.deps.canCapture()) break;
      if (shouldStop?.()) { stopped = true; break; }
      const result = await this.capture(files[i]);
      if (result === 'sent' || result === 'queued') sent += 1;
      else skipped += 1;

      onProgress?.(i + 1, files.length);
      // Breathe between notes so typing stays smooth.
      await new Promise((r) => window.setTimeout(r, 60));
    }

    return { sent, skipped, stopped };
  }

  /** The shared notes' text + mtime, for the link survey. Reads from Obsidian's cache; capped so a huge vault stays quick. */
  async sharedNotesForSurvey(limit = 600): Promise<Array<{ text: string; mtime: number }>> {
    const files = this.surveyBackfill().files.sort((a, b) => b.stat.mtime - a.stat.mtime).slice(0, limit);
    const out: Array<{ text: string; mtime: number }> = [];
    for (const f of files) {
      try { out.push({ text: await this.deps.app.vault.cachedRead(f), mtime: f.stat.mtime }); } catch { /* unreadable: skip */ }
    }
    return out;
  }

  /**
   * `external_id` — stable per note, per vault. The vault name scopes it so two
   * vaults with a `Daily/2026-08-10.md` don't collide into one entry.
   */
  private externalId(path: string): string {
    // Stable vault id, not the folder name (REVIEW M3) — a rename must not
    // re-key every note. Falls back to the name only if the id is somehow
    // unset (it is minted at load), preserving old behavior rather than
    // producing an empty prefix.
    const vaultId = this.deps.settings().vault_id || this.deps.app.vault.getName();
    return `${vaultId}:${path}`;
  }
}
