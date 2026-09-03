/**
 * P8 — the writers behind the shared surface.
 *
 * Everything under `<materialize_folder>/` is MYU'S side of a conversation:
 * regenerated as things change, gated on one standing consent, marked
 * `myu-generated: true` (the purge handle) and `myu-id` (the join key). The
 * user's side of the conversation is the watcher (MyuFolderWatcher) shipping
 * their edits back as interaction events — never a sync, always a signal.
 *
 * Write rules, in order of importance:
 *  1. NOTHING here runs before `materialize_consented && materialize_enabled`.
 *  2. Edit-hold: a file whose on-disk hash differs from `myu_file_hashes` has
 *     human edits the watcher hasn't shipped yet — skip it this round rather
 *     than clobber an unshipped tick.
 *  3. Idempotent: content identical → no write (sync clients hate no-op churn).
 *  4. The starter Base is written ONCE and never regenerated — after creation
 *     it is the user's file; their column tweaks survive.
 *
 * First-run choreography: `materializeAll` reports progress through a callback
 * ("6 of 38 · Jim's file just appeared") that TodayView renders as a pane row —
 * a folder visibly filling is regime-3 honesty applied to day one.
 */

import { normalizePath, TFile, type App } from 'obsidian';
import type { AskMyuApi, EntityHeadline, VaultCommitment, WeeklyEdition } from '../transport/api';
import type { AskMyuSettings } from '../settings';
import { hashContent } from '../capture/noteMeta';
import { decryptWithKey } from '../crypto/primitives';
import { isWeeklyEditionFresh } from './WeeklyReviewWriter';
import { firstPresent, parseWhen, flattenMemoryPayload, buildSelfMarkdown, type JournalDayEntry, buildDayMarkdown, buildMonthCalendarMarkdown, buildMeetingHistoryMarkdown, buildJournalDayMarkdown, buildCompanyMarkdown,
  buildCommitmentsMarkdown,
  buildPeopleBase,
  buildCompaniesBase,
  buildPersonMarkdown,
  safeFirstNameAlias,
  buildTodayMarkdown,
  buildWeekMarkdown,
  sanitizeName,
} from './myuFiles';

export interface MaterializeDeps {
  app: App;
  api: () => AskMyuApi;
  settings: () => AskMyuSettings;
  save: () => Promise<void>;
  canRun: () => boolean;
  /** Person-page lookup so person files can backlink to THEIR page (P5.4). */
  findTheirPage: (name: string) => string | null;
  /** Progress line for the first-run choreography; null clears it. */
  onProgress: (line: string | null) => void;
  /** The unlocked mDEK, or null — journal history decrypts client-side. */
  contentKey: () => CryptoKey | null;
}

/** How stale the full people sweep may get before the ambient tick redoes it. */
const PEOPLE_SWEEP_MS = 24 * 60 * 60 * 1000;
/** The CHEAP history passes (3–4 requests total) can afford half-hourly —
    "once a day" read as staleness for a companion (operator, 2026-08-25).
    The heavy N+1 passes (people/companies/memories) stay on the daily ratchet. */
const HISTORY_SWEEP_MS = 30 * 60 * 1000;

export class MaterializationService {
  constructor(private deps: MaterializeDeps) {}

  private get folder(): string {
    return this.deps.settings().materialize_folder.replace(/\/+$/, '') || 'Myu';
  }

  private enabled(): boolean {
    const s = this.deps.settings();
    return s.materialize_consented && s.materialize_enabled && this.deps.canRun();
  }

  /**
   * The full sweep — consent lands here, and the daily ratchet re-runs it.
   * Progressive by design: files appear one by one as each card returns.
   */
  async materializeAll(): Promise<{ people: number; skipped: number }> {
    if (!this.enabled()) return { people: 0, skipped: 0 };
    const s = this.deps.settings();

    await this.writeBaseOnce();
    await this.refreshAmbient();

    // Myu/Me.md — the SELF (operator, 2026-08-25: "what about the self?").
    const selfCard = await this.deps.api().getSelfCard().catch(() => null);
    await this.writeHeld(`${this.folder}/Me.md`, buildSelfMarkdown(selfCard?.data?.card ?? null));

    let people = 0;
    let skipped = 0;
    if (s.materialize_people) {
      const listed = await this.deps.api().listEntities('person');
      const entities = listed.data?.entities ?? [];
      const commitments = s.materialize_commitments ? await this.fetchCommitments() : [];
      const byOwner = groupByOwner(commitments);

      const allNames = entities.map((e) => e.display_name);
      for (let i = 0; i < entities.length; i++) {
        const entity = entities[i];
        this.deps.onProgress(
          `Myu is writing your people — ${i + 1} of ${entities.length} · ${entity.display_name}`,
        );
        const wrote = await this.writePerson(entity, byOwner.get(entity.entity_id) ?? [], allNames);
        if (wrote === 'written') people++;
        else if (wrote === 'held') skipped++;
      }
      s.last_people_materialize = Date.now();
      await this.deps.save();
    }

    if (s.materialize_people) {
      // Companies ride the same consent and ratchet as people — they are the
      // same data class (server-derived relationship intelligence on paper).
      await this.materializeCompanies();
    }

    // P8.9 — history DOWN-sync: the vault is home, so the account's past
    // (meetings from any source, journals from any surface) lives here too.
    if (s.materialize_meetings_history) await this.materializeMeetingHistory(true);
    if (s.materialize_journal_history) await this.materializeJournalHistory(true);
    if (s.materialize_calendar) await this.materializeCalendar();
    s.last_history_materialize = Date.now();
    await this.deps.save();

    this.deps.onProgress(null);
    return { people, skipped };
  }

  /** Myu/Meetings/ — server-side meeting history, newest first, capped per
      pass (a full corpus lands over a few ambient ticks; no silent drop —
      the cap is logged through the progress line). */
  private async materializeMeetingHistory(fullRefresh = false): Promise<void> {
    const PAGE = 200;
    const listed = await this.deps.api().listMeetings(PAGE, 0);
    const rawMeetings = listed.data?.meetings;
    const meetings = Array.isArray(rawMeetings) ? rawMeetings : [];
    for (let i = 0; i < meetings.length; i++) {
      const row = meetings[i];
      const id = String(row.meeting_id ?? '');
      if (!id) continue;
      const title = String(row.title ?? row.meeting_title ?? 'Meeting');
      const whenDate = parseWhen(firstPresent(row.meeting_date, row.occurred_at, row.created_at));
      const when = whenDate ? whenDate.toISOString().slice(0, 10) : '';
      const name = sanitizeName(`${when ? `${when} ` : ''}${title}`.trim() || id);
      const path = `${this.folder}/Meetings/${name}.md`;

      // The LIST rows are thin — summaries at best. The substance (key
      // points, decisions, commitments, notes, transcript) needs the detail
      // endpoint: one GET per meeting, so it runs for NEW files always and
      // for existing ones only on the daily full pass / Sync now — the
      // half-hourly tier stays cheap.
      const exists = this.deps.app.vault.getAbstractFileByPath(normalizePath(path)) !== null;
      let meeting = row;
      if (!exists || fullRefresh) {
        this.deps.onProgress(`Myu is writing your meeting history — ${i + 1} of ${meetings.length} · ${title}`);
        const detail = await this.deps.api().getMeetingDetail(id).catch(() => null);
        const d = detail?.data as Record<string, unknown> | null | undefined;
        const full = d?.meeting;
        if (full && typeof full === 'object') {
          // The rich fields are SIBLINGS of `meeting` in the envelope, not
          // inside it (live, 2026-08-25: merging only `meeting` dropped
          // key_points/decisions/commitments — "still only summaries").
          meeting = {
            ...row,
            ...(full as Record<string, unknown>),
            key_points: d?.key_points,
            decisions: d?.decisions,
            commitments: d?.commitments,
            participation: d?.participation,
          };
        }
        await this.writeHeld(path, buildMeetingHistoryMarkdown(meeting));
      }
    }
    const total = (listed.data?.count as number | undefined) ?? meetings.length;
    if (total > meetings.length) {
      this.deps.onProgress(`Meeting history: ${meetings.length} of ${total} this pass — the rest follow on later passes`);
    }
  }

  /** The memories payload, flattened and DECRYPTED: rows carry `content` or
      E2EE `encrypted_content` — only a device with custody can open those,
      which makes the vault page RICHER than a session-less surface, not
      thinner. Returns builder-ready {memory_text, created_at} rows. */
  private async resolveMemories(raw: unknown): Promise<Array<{ memory_text?: string; created_at?: string }>> {
    const rows = flattenMemoryPayload(raw);
    const key = this.deps.contentKey();
    const out: Array<{ memory_text?: string; created_at?: string }> = [];
    for (const row of rows) {
      let text = (row.content ?? '').trim();
      if (!text && typeof row.encrypted_content === 'string' && row.encrypted_content && key) {
        try {
          text = (await decryptWithKey(row.encrypted_content, key)).trim();
        } catch {
          continue;
        }
      }
      if (!text) continue;
      out.push({ memory_text: text, created_at: row.memory_date });
    }
    return out;
  }

  /** day → people with memories minted that day. Fed by the people pass
      (data we already fetch), consumed by the Days weave — the web calendar's
      relationships mode, vault-style. Kept in settings, capped at 90 days. */
  private recordMemoryDays(name: string, memories: Array<{ created_at?: string }>): void {
    const s = this.deps.settings();
    const map = s.memories_by_day;
    const cutoff = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    for (const m of memories) {
      const day = String(m.created_at ?? '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < cutoff) continue;
      const names = map[day] ?? [];
      if (!names.includes(name)) names.push(name);
      map[day] = names;
    }
    for (const day of Object.keys(map)) {
      if (day < cutoff) delete map[day];
    }
  }

  /** Myu/Days/ + Myu/Calendar.md — the web's month view, as paper. Window:
      30 days back, 60 forward, plus any day that has a meeting or journal on
      file. The daily-note template snippet embeds Days/{{date}} — which is
      the ONE integration surface the base Calendar plugin has (its grid IS
      daily notes). */
  private async materializeCalendar(): Promise<void> {
    const now = new Date();
    const start = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
    const end = new Date(now.getTime() + 60 * 86400000).toISOString().slice(0, 10);
    const res = await this.deps.api().getCalendarEvents(start, end);
    const rawEvents = (res.data as { events?: unknown })?.events;
    const events = (Array.isArray(rawEvents) ? (rawEvents as Array<Record<string, unknown>>) : []).filter(
      (e) => e.status !== 'cancelled',
    );
    const byDay = new Map<string, Array<{ title?: string; start_time?: string; all_day?: boolean; event_id?: string }>>();
    for (const e of events) {
      const day = String(e.start_time ?? '').slice(0, 10);
      if (!day) continue;
      const bucket = byDay.get(day) ?? [];
      bucket.push({ title: String(e.title ?? e.summary ?? 'Busy'), start_time: String(e.start_time ?? ''), all_day: e.all_day === true, event_id: String(e.event_id ?? '') || undefined });
      byDay.set(day, bucket);
    }

    // Meetings + journal presence by day, from what's already on paper.
    const meetingsByDay = new Map<string, string[]>();
    const journalDays = new Set<string>();
    const folder = this.folder;
    for (const file of this.deps.app.vault.getMarkdownFiles()) {
      if (file.path.startsWith(`${folder}/Meetings/`)) {
        const day = file.basename.slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
          const bucket = meetingsByDay.get(day) ?? [];
          bucket.push(`Meetings/${file.basename}`);
          meetingsByDay.set(day, bucket);
        }
      } else if (file.path.startsWith(`${folder}/Journal/`)) {
        journalDays.add(file.basename);
      }
    }

    const allDays = new Set<string>([...byDay.keys(), ...meetingsByDay.keys(), ...journalDays, ...Object.keys(this.deps.settings().memories_by_day)]);
    const busy = new Map<string, number>();
    let i = 0;
    for (const day of allDays) {
      i++;
      this.deps.onProgress(`Myu is writing your calendar — day ${i} of ${allDays.size}`);
      const dayEvents = (byDay.get(day) ?? []).sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''));
      const meetings = meetingsByDay.get(day) ?? [];
      const hasJournal = journalDays.has(day);
      const memoryPeople = (this.deps.settings().memories_by_day[day] ?? []).map((n) => sanitizeName(n));
      busy.set(day, dayEvents.length + meetings.length + (hasJournal ? 1 : 0) + (memoryPeople.length > 0 ? 1 : 0));
      await this.writeHeld(`${folder}/Days/${day}.md`, buildDayMarkdown(day, dayEvents, meetings, hasJournal, memoryPeople));
    }

    const months = [
      { year: now.getUTCFullYear(), month: now.getUTCMonth() },
      { year: now.getUTCMonth() === 11 ? now.getUTCFullYear() + 1 : now.getUTCFullYear(), month: (now.getUTCMonth() + 1) % 12 },
    ];
    await this.writeHeld(`${folder}/Calendar.md`, buildMonthCalendarMarkdown(months, busy));
  }

  /** Myu/Journal/ — one file per day, DECRYPTED with this vault's key.
      Plaintext-on-paper is exactly what the materialize consent granted. */
  private async materializeJournalHistory(fullRefresh = false): Promise<void> {
    const s = this.deps.settings();
    const accountId = s.account_id;
    const key = this.deps.contentKey();
    if (!accountId || !key) return;
    const res = await this.deps.api().getJournalEntries(accountId, 0, Date.now());
    const rawEntries = res.data?.entries;
    const entries = Array.isArray(rawEntries) ? rawEntries : [];
    const byDay = new Map<string, JournalDayEntry[]>();
    const recentCutoff = Date.now() - 7 * 86400000;
    for (const entry of entries) {
      const created = parseWhen(firstPresent(entry.date, entry.timestamp, entry.occurred_at, entry.created_at, entry.created));
      if (!created) continue;
      const day = created.toISOString().slice(0, 10);
      const time = created.toISOString().slice(11, 16);
      let text = '';
      const enc = entry.encrypted_content;
      if (typeof enc === 'string' && enc) {
        try {
          text = await decryptWithKey(enc, key);
        } catch {
          continue; // a foreign-device epoch or corrupt blob — skip, never crash the sweep
        }
      } else if (typeof entry.content === 'string') {
        text = entry.content;
      }
      if (!text.trim()) continue;
      const journalId = String(entry.journal_id ?? entry.id ?? '') || undefined;

      // The entry is a conversation SEED — weave the chats that grew from it.
      // Chat fetches are one GET per entry, so: recent week always (that's
      // where conversations are alive), everything on the daily/Sync-now pass.
      let turns: JournalDayEntry['turns'];
      if (journalId && (fullRefresh || created.getTime() >= recentCutoff)) {
        const chatsRes = await this.deps.api().getJournalChats(journalId).catch(() => null);
        const chats = Array.isArray(chatsRes?.data?.chats) ? chatsRes.data.chats : [];
        const collected: NonNullable<JournalDayEntry['turns']> = [];
        for (const chat of chats) {
          let content = typeof chat.content === 'string' ? chat.content : '';
          const chatEnc = chat.encrypted_content;
          if (typeof chatEnc === 'string' && chatEnc) {
            try {
              content = await decryptWithKey(chatEnc, key);
            } catch {
              continue;
            }
          }
          if (!content.trim()) continue;
          // Role from chatter_id (the reliable signal the web uses), not a
          // brace heuristic (audit 2026-08-25): an agent turn is anything not
          // authored by the account.
          const isUser = String(chat.chatter_id ?? '') === accountId;
          if (!isUser && content.trim().startsWith('{')) {
            try {
              const parsed = JSON.parse(content) as { content?: Array<{ text?: string }> };
              const textBlocks = (parsed.content ?? []).map((b) => b.text ?? '').filter(Boolean);
              if (textBlocks.length > 0) collected.push({ role: 'myu', text: textBlocks.join('\n') });
              continue;
            } catch {
              // fall through — plain text that happens to start with a brace
            }
          }
          collected.push({ role: isUser ? 'you' : 'myu', text: content });
        }
        if (collected.length > 0) turns = collected;
      }

      const bucket = byDay.get(day) ?? [];
      bucket.push({ time, text, journalId, turns });
      byDay.set(day, bucket);
    }
    let i = 0;
    for (const [day, dayEntries] of byDay) {
      i++;
      this.deps.onProgress(`Myu is writing your journal — day ${i} of ${byDay.size}`);
      dayEntries.sort((a, b) => a.time.localeCompare(b.time));
      await this.writeHeld(`${this.folder}/Journal/${day}.md`, buildJournalDayMarkdown(day, dayEntries));
    }
  }

  /** Myu/Companies/ — org pages with wikilinked people. Person-pass sibling. */
  private async materializeCompanies(): Promise<void> {
    const listed = await this.deps.api().listEntities('company');
    const rawCompanies = listed.data?.entities;
    const companies = Array.isArray(rawCompanies) ? rawCompanies : [];
    if (companies.length === 0) return;
    const peopleListed = await this.deps.api().listEntities('person');
    const people = peopleListed.data?.entities ?? [];

    for (let i = 0; i < companies.length; i++) {
      const entity = companies[i];
      this.deps.onProgress(
        `Myu is writing your companies — ${i + 1} of ${companies.length} · ${entity.display_name}`,
      );
      const cardRes = await this.deps.api().getCard('company', entity.entity_id);
      const card = cardRes.ok ? cardRes.data?.card ?? null : null;
      const memRes = await this.deps.api().getRelationshipMemories(entity.entity_id).catch(() => null);
      const companyMemories = await this.resolveMemories(memRes?.data?.memories);
      const theirPeople = people
        .filter((p) => (p.organization ?? '').toLowerCase() === entity.display_name.toLowerCase())
        .map((p) => sanitizeName(p.display_name));
      const md = buildCompanyMarkdown(entity, card, theirPeople, companyMemories, `${this.folder}/People`);
      await this.writeHeld(`${this.folder}/Companies/${sanitizeName(entity.display_name)}.md`, md);
    }
  }

  /** The cheap refresh the 5-minute ambient tick can afford: Today, Week, rollup. */
  async refreshAmbient(): Promise<void> {
    if (!this.enabled()) return;
    const s = this.deps.settings();

    if (s.materialize_today) {
      await this.writeToday();
      await this.writeWeek();
    }
    if (s.materialize_commitments) {
      await this.writeCommitmentsRollup();
    }
    if (s.materialize_people && Date.now() - s.last_people_materialize > PEOPLE_SWEEP_MS) {
      // The daily ratchet rides the ambient tick, deliberately without
      // progress lines — choreography is for first-run, not maintenance.
      void this.materializePeopleQuietly();
    }
    void this.refreshHistoryIfDue();
  }

  /** The half-hourly tier: meetings, journal, calendar — cheap enough to be
      fresh. Also nudged by SSE (brief_ready) so a new day's intelligence
      lands without waiting out the ratchet. */
  async refreshHistoryIfDue(force = false): Promise<void> {
    if (!this.enabled()) return;
    const s = this.deps.settings();
    if (!force && Date.now() - s.last_history_materialize < HISTORY_SWEEP_MS) return;
    s.last_history_materialize = Date.now();
    await this.deps.save();
    if (s.materialize_meetings_history) await this.materializeMeetingHistory();
    if (s.materialize_journal_history) await this.materializeJournalHistory();
    if (s.materialize_calendar) await this.materializeCalendar();
  }

  /** Regenerate exactly one commitment's surfaces — the watcher calls this
      after a 'restored' outcome so server truth reappears promptly. */
  async refreshCommitmentSurfaces(): Promise<void> {
    if (!this.enabled()) return;
    const s = this.deps.settings();
    if (s.materialize_commitments) await this.writeCommitmentsRollup();
  }

  // ── individual writers ─────────────────────────────────────────────────────

  /**
   * Does anything in the vault already answer to this name?
   *
   * `getFirstLinkpathDest` is the same resolver Obsidian uses for `[[name]]`,
   * so this asks the exact question that matters: would an alias steal a link
   * that already goes somewhere? The person's OWN generated page is excluded —
   * once the alias is written the name resolves to us, and without this the
   * alias would be added and removed on alternating passes.
   */
  private nameIsTaken(name: string, ownPath: string): boolean {
    const dest = this.deps.app.metadataCache.getFirstLinkpathDest?.(name, '');
    if (!dest) return false;
    return normalizePath(dest.path) !== normalizePath(ownPath);
  }

  private async writePerson(
    entity: EntityHeadline,
    commitments: VaultCommitment[],
    allDisplayNames: string[] = [],
  ): Promise<'written' | 'held' | 'unchanged' | 'error'> {
    const s = this.deps.settings();
    const cardRes = await this.deps.api().getCard('person', entity.entity_id);
    const card = cardRes.data?.card ?? null;
    const open = commitments.filter((c) => c.status === 'open');
    // The memory layer rides along — the entity id IS the relationship id on
    // person cards, the same key the web's memory panel uses.
    const memoriesRes = await this.deps.api().getRelationshipMemories(entity.entity_id).catch(() => null);
    const memories = await this.resolveMemories(memoriesRes?.data?.memories);
    this.recordMemoryDays(entity.display_name, memories);
    const path = `${this.folder}/People/${sanitizeName(entity.display_name)}.md`;
    const aliases = safeFirstNameAlias(entity.display_name, allDisplayNames, (name) =>
      this.nameIsTaken(name, path),
    );
    const md = buildPersonMarkdown(
      entity,
      card,
      open,
      (id) => s.myu_checkbox_state[id] ?? false,
      this.deps.findTheirPage(entity.display_name)?.replace(/\.md$/, '').split('/').pop() ?? null,
      memories,
      aliases,
    );
    const outcome = await this.writeHeld(path, md);
    if (outcome === 'written') {
      for (const c of open) s.myu_checkbox_state[c.commitment_id] = false;
      await this.deps.save();
    }
    return outcome;
  }

  /** entities_changed: the people list moved on the server — re-list now, not on the ratchet. Never more than once a minute. */
  private lastPeopleRefresh = 0;
  async refreshPeople(): Promise<void> {
    if (!this.enabled() || !this.deps.settings().materialize_people) return;
    if (Date.now() - this.lastPeopleRefresh < 60_000) return;
    this.lastPeopleRefresh = Date.now();
    await this.materializePeopleQuietly();
  }

  private async materializePeopleQuietly(): Promise<void> {
    const s = this.deps.settings();
    const listed = await this.deps.api().listEntities('person');
    const commitments = s.materialize_commitments ? await this.fetchCommitments() : [];
    const byOwner = groupByOwner(commitments);
    const entities = listed.data?.entities ?? [];
    const allNames = entities.map((e) => e.display_name);
    for (const entity of entities) {
      await this.writePerson(entity, byOwner.get(entity.entity_id) ?? [], allNames);
    }
    s.last_people_materialize = Date.now();
    await this.deps.save();
  }

  private async writeToday(): Promise<void> {
    const res = await this.deps.api().getBrief();
    const brief = (res.data as {
      brief?: { date?: string; sections?: Array<{ title?: string; items?: Array<{ text?: string }> }> };
    } | null)?.brief;
    if (!brief) return;
    const date = brief.date ?? new Date().toISOString().slice(0, 10);
    const sections = (brief.sections ?? []).map((section) => ({
      title: section.title,
      items: (section.items ?? []).map((i) => i.text ?? '').filter(Boolean),
    }));
    await this.writeHeld(`${this.folder}/Today.md`, buildTodayMarkdown(date, sections));
  }

  private async writeWeek(): Promise<void> {
    const res = await this.deps.api().getWeeklyReview().catch(() => null);
    const edition = res?.data?.edition as WeeklyEdition | undefined;
    if (!edition || !isWeeklyEditionFresh(edition)) return;
    await this.writeHeld(`${this.folder}/Week.md`, buildWeekMarkdown(edition));
  }

  private async writeCommitmentsRollup(): Promise<void> {
    const s = this.deps.settings();
    const open = (await this.fetchCommitments()).filter((c) => c.status === 'open');
    const md = buildCommitmentsMarkdown(open, (id) => s.myu_checkbox_state[id] ?? false);
    const outcome = await this.writeHeld(`${this.folder}/Commitments.md`, md);
    if (outcome === 'written') {
      for (const c of open) s.myu_checkbox_state[c.commitment_id] = false;
      await this.deps.save();
    }
  }

  /**
   * The person is gone from Myu (merged away, or marked as you): their note
   * goes to the TRASH — so the action reads as done in the vault, not only on
   * the server — never deleted, per the plugin guidelines (trash() for
   * user-initiated removals, so it is recoverable).
   */
  async retirePersonNote(entityId: string): Promise<boolean> {
    const folder = normalizePath(`${this.folder}/People`);
    for (const file of this.deps.app.vault.getMarkdownFiles()) {
      if (!file.path.startsWith(`${folder}/`)) continue;
      const fm = this.deps.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
      if (fm?.['myu-id'] !== entityId) continue;
      // FileManager.trashFile respects the user's own deletion preference
      // (system trash vs .trash folder); Vault.trash(file, true) overrode it.
      await this.deps.app.fileManager.trashFile(file);
      return true;
    }
    return false;
  }

  private async writeBaseOnce(): Promise<void> {
    await this.ensureFolder(this.folder);
    for (const [name, build] of [
      ['People.base', () => buildPeopleBase(`${this.folder}/People`)],
      ['Companies.base', () => buildCompaniesBase(`${this.folder}/Companies`)],
    ] as const) {
      const path = normalizePath(`${this.folder}/${name}`);
      if (this.deps.app.vault.getAbstractFileByPath(path)) continue;
      await this.deps.app.vault.create(path, build());
    }
  }

  private async fetchCommitments(): Promise<VaultCommitment[]> {
    const res = await this.deps.api().listVaultCommitments();
    return res.data?.commitments ?? [];
  }

  // ── write mechanics ────────────────────────────────────────────────────────

  /** Write with edit-hold + no-op suppression; updates the hash baseline. */
  private async writeHeld(rawPath: string, content: string): Promise<'written' | 'held' | 'unchanged' | 'error'> {
    const s = this.deps.settings();
    const path = normalizePath(rawPath);
    try {
      const existing = this.deps.app.vault.getAbstractFileByPath(path);
      const newHash = await hashContent(content);

      if (existing instanceof TFile) {
        const current = await this.deps.app.vault.cachedRead(existing);
        const currentHash = await hashContent(current);
        if (currentHash === newHash) return 'unchanged';
        const baseline = s.myu_file_hashes[path];
        if (baseline && baseline !== currentHash) {
          // Human edits the watcher hasn't shipped — hold this round.
          return 'held';
        }
        await this.deps.app.vault.process(existing, () => content);
      } else {
        const folder = path.slice(0, path.lastIndexOf('/'));
        if (folder) await this.ensureFolder(folder);
        await this.deps.app.vault.create(path, content);
      }

      s.myu_file_hashes[path] = newHash;
      await this.deps.save();
      return 'written';
    } catch {
      return 'error';
    }
  }

  /** After the watcher ships a file's edits, re-arm the hold with disk truth. */
  async rebaseline(path: string): Promise<void> {
    const s = this.deps.settings();
    const file = this.deps.app.vault.getAbstractFileByPath(normalizePath(path));
    if (file instanceof TFile) {
      s.myu_file_hashes[normalizePath(path)] = await hashContent(await this.deps.app.vault.cachedRead(file));
      await this.deps.save();
    }
  }

  private async ensureFolder(folder: string): Promise<void> {
    const parts = folder.split('/');
    let current = '';
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!this.deps.app.vault.getAbstractFileByPath(normalizePath(current))) {
        await this.deps.app.vault.createFolder(normalizePath(current)).catch(() => undefined);
      }
    }
  }
}

function groupByOwner(commitments: VaultCommitment[]): Map<string, VaultCommitment[]> {
  const map = new Map<string, VaultCommitment[]>();
  for (const c of commitments) {
    const key = c.owner_relationship_id;
    if (!key) continue;
    const list = map.get(key) ?? [];
    list.push(c);
    map.set(key, list);
  }
  return map;
}
