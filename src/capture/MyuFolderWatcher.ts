/**
 * P8 — the read side of the shared surface.
 *
 * Watches `<materialize_folder>/` and ships the user's edits as INTERACTION
 * EVENTS — the vault's `canvas_interaction`. This module never writes to the
 * vault (invariant 3 stays whole): it reads, diffs, and talks to the server;
 * regeneration is MaterializationService's job.
 *
 * What it detects, v1:
 *  · checkbox flips on `%%myu-id%%` lines → `tick` / `untick` events;
 *  · any other change to a Myu file → one `edit` event carrying only the
 *    content hash (the file is Myu-generated; shipping the whole diff would
 *    be shipping our own text back with the user's edit buried inside it).
 *
 * Outcome handling:
 *  · `resolved` — the tick landed; remember it so regeneration keeps the box.
 *  · `restored` — a mis-click untick; server truth re-ticks on refresh.
 *  · `queued` / `absorbed` — the engine has it; nothing local to do.
 *
 * Same discipline as the other watchers: registration is gated (consent +
 * enabled + unlocked), debounced per file (ticks deserve snappier than the
 * 90s capture quiescence — a tick is deliberate, not mid-typing), and events
 * queue durably while offline.
 */

import { TFile, type App } from 'obsidian';
import type { AskMyuApi, VaultInteractionEvent } from '../transport/api';
import type { AskMyuSettings } from '../settings';
import { hashContent } from './noteMeta';
import { parseCheckboxes, meetingAdditions } from '../vault/myuFiles';

export interface MyuWatcherDeps {
  app: App;
  api: () => AskMyuApi;
  settings: () => AskMyuSettings;
  save: () => Promise<void>;
  canSend: () => boolean;
  /** Called after a `restored` outcome so the surface regenerates promptly. */
  onRestored: () => Promise<void>;
  /** Re-arm the writer's edit-hold once this file's edits have shipped. */
  rebaseline: (path: string) => Promise<void>;
  /** A decision/commitment the user typed under a meeting heading landed on the server: regenerate the note with ids. */
  onMeetingAdded: () => Promise<void>;
}

/** A tick is a deliberate act; five seconds of quiet is plenty. */
const TICK_DEBOUNCE_MS = 5 * 1000;

/** Text or target — never geometry. See shipCanvas. */
function canvasNodeMeaning(node: Record<string, unknown>): string {
  const parts = [
    typeof node.type === 'string' ? node.type : '',
    typeof node.text === 'string' ? node.text : '',
    typeof node.file === 'string' ? node.file : '',
    typeof node.url === 'string' ? node.url : '',
    typeof node.label === 'string' ? node.label : '',
  ];
  return parts.join('\u0000');
}

export class MyuFolderWatcher {
  private timers = new Map<string, number>();
  private active = false;

  constructor(private deps: MyuWatcherDeps) {}

  /** Register-once, active-gated — the same shape the other watchers use. */
  start(register: (event: string, fn: (file: TFile) => void) => void): void {
    const s = this.deps.settings();
    if (!s.materialize_consented || !s.materialize_enabled) return;
    if (this.active) return;
    this.active = true;

    register('modify', (file) => {
      // `.canvas` joins `.md` (P-CANVAS-2). The old filter was self-imposed:
      // vault events fire for every file type, so a canvas was always
      // watchable — nothing was ever listening.
      if (!this.active || !(file instanceof TFile)) return;
      if (file.extension !== 'md' && file.extension !== 'canvas') return;
      const folder = this.deps.settings().materialize_folder.replace(/\/+$/, '') || 'Myu';
      if (!file.path.startsWith(`${folder}/`) && file.path !== `${folder}.md`) return;

      const existing = this.timers.get(file.path);
      if (existing) window.clearTimeout(existing);
      this.timers.set(
        file.path,
        window.setTimeout(() => {
          this.timers.delete(file.path);
          void (file.extension === 'canvas' ? this.shipCanvas(file) : this.shipFile(file));
        }, TICK_DEBOUNCE_MS),
      );
    });
  }

  stop(): void {
    this.active = false;
    for (const timer of this.timers.values()) window.clearTimeout(timer);
    this.timers.clear();
  }

  /**
   * Diff one settled canvas against our per-node baseline.
   *
   * A canvas is edited constantly BY DESIGN — that is what it is for — so the
   * whole-file hash that guards markdown would put it in permanent hold. Per
   * node instead, and the meaning hash deliberately excludes x/y/width/height:
   * moving a card is handling, not meaning, and raising a signal for it would
   * bury the engine in noise the moment anyone tidied a board.
   *
   * K2 holds: this ships events and interprets nothing. What a deleted node
   * MEANS is the engine's call with context, per P8.3 — not a mapping table's,
   * here, in advance.
   */
  private async shipCanvas(file: TFile): Promise<void> {
    const s = this.deps.settings();
    const raw = await this.deps.app.vault.cachedRead(file);
    let nodes: Array<Record<string, unknown>> = [];
    try {
      const parsed = JSON.parse(raw) as { nodes?: Array<Record<string, unknown>> };
      nodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
    } catch {
      return; // mid-write or hand-broken JSON; the next settled event retries
    }

    const prefix = `${file.path}::`;
    const events: VaultInteractionEvent[] = [];
    const seen = new Set<string>();

    for (const node of nodes) {
      const id = typeof node.id === 'string' ? node.id : null;
      if (!id) continue;
      seen.add(id);
      const meaning = canvasNodeMeaning(node);
      const hash = await hashContent(meaning);
      const key = prefix + id;
      const before = s.myu_canvas_node_state[key];

      if (before === undefined) {
        // Never seen: either the user added it, or we wrote it and this is the
        // settling event for our own write. Record it; a node we wrote has the
        // same hash next time and never fires again.
        s.myu_canvas_node_state[key] = hash;
        continue;
      }
      if (before === hash) continue; // layout-only move, or no change at all
      s.myu_canvas_node_state[key] = hash;
      events.push({ myu_id: id, kind: 'edit', after: meaning.slice(0, 500), source_timestamp: Date.now(), content_hash: hash });
    }

    for (const key of Object.keys(s.myu_canvas_node_state)) {
      if (!key.startsWith(prefix)) continue;
      const id = key.slice(prefix.length);
      if (seen.has(id)) continue;
      delete s.myu_canvas_node_state[key];
      events.push({ myu_id: id, kind: 'delete', source_timestamp: Date.now() });
    }

    await this.deps.save();
    if (events.length > 0) await this.send(events, null);
  }

  /**
   * The part of a canvas node that carries MEANING — text, or the file it
   * points at. Geometry is excluded by construction, which is what makes
   * "moved it" and "changed it" different events rather than the same hash.
   */
  private async shipFile(file: TFile): Promise<void> {
    const s = this.deps.settings();
    const contents = await this.deps.app.vault.cachedRead(file);
    const hash = await hashContent(contents);
    if (s.myu_file_hashes[file.path] === hash) return; // our own write settling

    const events: VaultInteractionEvent[] = [];
    let sawCheckboxChange = false;

    // A Myu meeting note: bullets typed under Decisions / Commitments are the
    // web's "add decision" / "add commitment" — shipped once, then the note is
    // rewritten from server truth with ids, so they stop looking new.
    if (file.path.includes('/Meetings/')) {
      const meetingId = String(this.deps.app.metadataCache.getFileCache(file)?.frontmatter?.['myu-id'] ?? '');
      if (meetingId) await this.shipMeetingAdditions(file.path, meetingId, contents);
    }

    for (const box of parseCheckboxes(contents)) {
      const wasChecked = s.myu_checkbox_state[box.myuId] ?? false;
      if (box.checked === wasChecked) continue;
      sawCheckboxChange = true;
      events.push({
        myu_id: box.myuId,
        kind: box.checked ? 'tick' : 'untick',
        after: box.line,
        source_timestamp: Date.now(),
        content_hash: hash,
      });
    }

    if (!sawCheckboxChange) {
      events.push({
        myu_id: `file:${file.path}`,
        kind: 'edit',
        source_timestamp: Date.now(),
        content_hash: hash,
      });
    }

    await this.send(events, file.path);
  }

  private shippedAdditions = new Set<string>();
  private async shipMeetingAdditions(path: string, meetingId: string, contents: string): Promise<void> {
    if (!this.deps.canSend()) return;
    const added = meetingAdditions(contents);
    let landed = 0;
    for (const d of added.decisions) {
      const key = `${path}|d|${d}`;
      if (this.shippedAdditions.has(key)) continue;
      const res = await this.deps.api().addMeetingDecision(meetingId, d).catch(() => null);
      if (res?.ok) { this.shippedAdditions.add(key); landed++; }
    }
    for (const c of added.commitments) {
      const key = `${path}|c|${c.owner ?? ''}|${c.content}`;
      if (this.shippedAdditions.has(key)) continue;
      const res = await this.deps.api().addMeetingCommitment(meetingId, c.content, 'action_item', c.owner).catch(() => null);
      if (res?.ok) { this.shippedAdditions.add(key); landed++; }
    }
    if (landed > 0) void this.deps.onMeetingAdded();
  }

  private async send(events: VaultInteractionEvent[], path: string | null): Promise<void> {
    const s = this.deps.settings();
    if (!this.deps.canSend()) {
      s.vault_event_queue.push(...events);
      await this.deps.save();
      return;
    }

    const res = await this.deps.api().vaultInteraction(events);
    if (!res.ok) {
      s.vault_event_queue.push(...events);
      await this.deps.save();
      return;
    }

    let restored = false;
    for (const result of res.data?.results ?? []) {
      if (result.kind === 'tick' && result.outcome === 'resolved') {
        s.myu_checkbox_state[result.myu_id] = true;
      } else if (result.kind === 'untick') {
        if (result.outcome === 'restored') {
          s.myu_checkbox_state[result.myu_id] = true;
          restored = true;
        } else {
          s.myu_checkbox_state[result.myu_id] = false;
        }
      }
    }
    await this.deps.save();

    if (path) await this.deps.rebaseline(path);
    if (restored) await this.deps.onRestored();
  }

  /** Drain events queued while offline — rides the same retry interval. */
  async flushQueue(): Promise<void> {
    const s = this.deps.settings();
    if (s.vault_event_queue.length === 0 || !this.deps.canSend()) return;
    const events = s.vault_event_queue.splice(0, 100);
    await this.deps.save();
    await this.send(events, null);
  }
}
