/**
 * MeetingCapture (P5.2) — vault meeting notes enter the meeting pipeline.
 *
 * Rides the SAME quiescence discipline as journal capture (notes are living
 * documents; capture waits for quiet, hash-diffs, re-sends on change — the
 * server treats a changed hash as re-extraction). It registers its own watcher
 * with the same constants rather than piggybacking CaptureService's handlers,
 * because the two allowlists are different consents: a note can be in one, the
 * other, both, or neither, and each pipeline must answer only to its own.
 *
 * A note qualifies via `meeting_folders` OR `myu-meeting: true` frontmatter
 * (the escape hatch for a meeting note that lives outside any folder).
 *
 * PLAINTEXT by design and by disclosed consent (BWI-1): meeting content is
 * processed server-side like every meeting source. This is exactly why it is a
 * SECOND consent and not a widening of the first — and why this module does not
 * touch the mDEK. `occurred_at_ms` is required and never now(): frontmatter
 * date → filename date → file ctime (the note is ABOUT a meeting that happened
 * at a time; wall clock is the one answer that is always wrong).
 *
 * Shape notes:
 *   title           — first H1, else filename with a leading date stripped
 *   wikilink_names  — every [[..]] target, aliases split on `|`, deduped;
 *                     the person-page index's aliases ride along (P5.4) so the
 *                     backend resolver sees the user's own alias list
 *   external_id     — vault path. RENAME CAVEAT (v1, in the README): a renamed
 *                     note mints a new meeting.
 */

import type { App, TAbstractFile, TFile } from 'obsidian';
import { TFile as TFileClass } from 'obsidian';
import type { AskMyuApi, MeetingNotePayload } from '../transport/api';
import type { AskMyuSettings } from '../settings';
import { hashContent, stripFrontmatter } from './noteMeta';
import { extractEntityHints } from './wikilinks';
import type { PersonPageIndex } from '../people/PersonPageIndex';

const FILENAME_DATE = /(\d{4})[-_.](\d{2})[-_.](\d{2})/;

export interface MeetingCaptureDeps {
  app: App;
  api: AskMyuApi;
  settings: () => AskMyuSettings;
  save: () => Promise<void>;
  canCapture: () => boolean;
  /** P5.4's index — aliases enrich wikilink_names. Optional: works without it. */
  personIndex?: () => PersonPageIndex | null;
}

export class MeetingCapture {
  private timers = new Map<string, number>();
  private registered = false;

  constructor(private deps: MeetingCaptureDeps) {}

  get isWatching(): boolean {
    return this.registered;
  }

  /**
   * Register the watcher — ONLY when the meeting allowlist is non-empty
   * (invariant 2 applies to this pipeline exactly as it does to journal
   * capture; the frontmatter opt-in alone doesn't watch the whole vault).
   */
  start(register: (event: 'modify' | 'create', fn: (...args: never[]) => void) => void): boolean {
    if (this.registered) return true;
    if (this.deps.settings().meeting_folders.length === 0) return false;

    const onChange = (file: TAbstractFile) => {
      if (file instanceof TFileClass) this.schedule(file);
    };
    register('modify', onChange);
    register('create', onChange);
    this.registered = true;
    return true;
  }

  stop(): void {
    for (const timer of this.timers.values()) window.clearTimeout(timer);
    this.timers.clear();
    this.registered = false;
  }

  /** Folder allowlist OR the per-note frontmatter opt-in. */
  qualifies(file: TFile): boolean {
    if (file.extension !== 'md') return false;

    for (const folder of this.deps.settings().meeting_folders) {
      if (file.path === folder || file.path.startsWith(`${folder}/`)) return true;
    }

    const fm = this.deps.app.metadataCache.getFileCache(file)?.frontmatter;
    return fm?.['myu-meeting'] === true || fm?.['myu-meeting'] === 'true';
  }

  private schedule(file: TFile): void {
    if (!this.qualifies(file)) return;

    const existing = this.timers.get(file.path);
    if (existing) window.clearTimeout(existing);

    const wait = Math.max(10, this.deps.settings().quiescence_seconds) * 1000;
    this.timers.set(
      file.path,
      window.setTimeout(() => {
        this.timers.delete(file.path);
        void this.capture(file);
      }, wait),
    );
  }

  /** One note → one ingest. Safe to call directly (the command does). */
  async capture(file: TFile): Promise<'sent' | 'skipped' | 'unchanged' | 'refused'> {
    if (!this.deps.canCapture()) return 'skipped';

    const raw = await this.deps.app.vault.cachedRead(file);
    // Content ships VERBATIM including frontmatter-stripped body — Tasks
    // checkboxes intact, since owners/due-dates are extraction material.
    const body = stripFrontmatter(raw);
    if (body.trim().length === 0) return 'skipped';

    const settings = this.deps.settings();
    const hash = await hashContent(body);
    if (settings.meeting_hashes[file.path] === hash) return 'unchanged';

    const payload: MeetingNotePayload = {
      external_id: file.path,
      title: this.titleOf(file, body),
      occurred_at_ms: this.occurredAt(file),
      content: body,
      wikilink_names: this.namesOf(body),
    };

    const res = await this.deps.api.ingestMeetingNote(payload);
    if (res.ok) {
      // Hash stamps on ACK, not on artifacts: extraction is async server-side,
      // and the server's own hash stamps only on extraction success — so a
      // failed extraction retries free on our next re-send.
      settings.meeting_hashes[file.path] = hash;
      await this.deps.save();
      return 'sent';
    }
    // 400s (size cap, missing time) are the payload's fault, not the network's:
    // retrying identical bytes would loop. Leave the hash unstamped so the next
    // EDIT retries, and report refused so callers can say why.
    return res.status === 400 ? 'refused' : 'skipped';
  }

  /** First H1 wins; else the filename with a leading date stripped. */
  private titleOf(file: TFile, body: string): string {
    const h1 = body.match(/^#\s+(.+)$/m);
    if (h1) return h1[1].trim();
    return file.basename.replace(FILENAME_DATE, '').replace(/^[\s\-–—·]+/, '').trim() || file.basename;
  }

  private occurredAt(file: TFile): number {
    const fm = this.deps.app.metadataCache.getFileCache(file)?.frontmatter;
    for (const key of ['date', 'created']) {
      const value = fm?.[key];
      if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getTime();
      if (typeof value === 'string') {
        const dateOnly = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (dateOnly) return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 12).getTime();
        const parsed = Date.parse(value);
        if (!Number.isNaN(parsed)) return parsed;
      }
    }
    const named = file.basename.match(FILENAME_DATE);
    if (named) return new Date(Number(named[1]), Number(named[2]) - 1, Number(named[3]), 12).getTime();
    return file.stat.ctime;
  }

  /**
   * Wikilink targets, enriched with the person-page index's aliases so the
   * backend resolver sees the user's own alias list. Deduped case-insensitively
   * and capped client-side at the server's 50 — over-cap names would just be
   * dropped there, and we'd rather drop the aliases than the primaries.
   */
  private namesOf(body: string): string[] {
    const primaries = extractEntityHints(body);
    const seen = new Set(primaries.map((n) => n.toLowerCase()));
    const out = [...primaries];

    const index = this.deps.personIndex?.();
    if (index) {
      for (const name of primaries) {
        for (const alias of index.aliasesFor(name)) {
          const key = alias.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            out.push(alias);
          }
        }
      }
    }
    return out.slice(0, 50);
  }

  // ── backfill (the acquisition wedge, meeting-side) ─────────────────────────

  /**
   * What a meeting backfill would cover. The GAP this closes (found
   * 2026-08-23 by the preload test question): journal had a backfill sweep
   * from day one, but the folder the acquisition story is actually ABOUT —
   * existing Meetings/ notes — only ever ingested on EDIT. A preloaded vault
   * sat cold. The backend's ingest rate limit was sized for exactly this
   * burst; now a client sends it.
   */
  surveyBackfill(): { files: TFile[]; oldest: number | null } {
    const files = this.deps.app.vault.getMarkdownFiles().filter((f) => this.qualifies(f));
    const oldest = files.reduce<number | null>(
      (min, f) => (min === null || f.stat.mtime < min ? f.stat.mtime : min),
      null,
    );
    return { files, oldest };
  }

  /** Sequential and yielding, like the journal sweep — a laptop, not a fan. */
  async backfill(
    files: TFile[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<{ sent: number; skipped: number }> {
    let sent = 0;
    let skipped = 0;
    for (let i = 0; i < files.length; i++) {
      if (!this.deps.canCapture()) break;
      const result = await this.capture(files[i]);
      if (result === 'sent') sent += 1;
      else skipped += 1;
      onProgress?.(i + 1, files.length);
      await new Promise((r) => window.setTimeout(r, 120));
    }
    return { sent, skipped };
  }
}
