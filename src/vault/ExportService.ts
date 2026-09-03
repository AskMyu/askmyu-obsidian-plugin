/**
 * Export everything — "file over app", as an action.
 *
 * Runs every materialization surface regardless of the user's toggles, saves
 * every conversation as a note (skipping the ones already here), keeps every
 * canvas that has not expired, and leaves `Myu/Export.md`: what landed, what
 * could not, what was never vault material, and what happens on uninstall.
 * Vault module: it writes; views may not (invariant 3).
 */

import { normalizePath, TFile, type App } from 'obsidian';
import type AskMyuPlugin from '../main';
import { listConversations, loadConversation } from '../conversations';
import { buildExportManifest, type ExportSummary } from './myuFiles';

export class ExportService {
  constructor(private app: App, private plugin: AskMyuPlugin) {}

  async exportEverything(progress: (line: string) => void): Promise<ExportSummary> {
    const s = this.plugin.settings;
    const date = new Date().toISOString().slice(0, 10);

    // 1. Every surface on, once — the user's toggles are restored after.
    const keep = { people: s.materialize_people, commitments: s.materialize_commitments, meetings: s.materialize_meetings_history, journal: s.materialize_journal_history, calendar: s.materialize_calendar };
    Object.assign(s, { materialize_people: true, materialize_commitments: true, materialize_meetings_history: true, materialize_journal_history: true, materialize_calendar: true });
    progress('Export \u2014 writing people, companies, journal, meetings, calendar, commitments\u2026');
    let people = 0;
    try { ({ people } = await this.plugin.materializer.materializeAll()); }
    finally { Object.assign(s, { materialize_people: keep.people, materialize_commitments: keep.commitments, materialize_meetings_history: keep.meetings, materialize_journal_history: keep.journal, materialize_calendar: keep.calendar }); }

    // 2. Every conversation, as a note.
    const deps = { backend: this.plugin.backend, key: this.plugin.keys.get(), accountId: s.account_id };
    const heads = await listConversations(deps);
    const conversations = { saved: 0, alreadyThere: 0, failed: 0 };
    for (const [i, head] of heads.entries()) {
      progress(`Export \u2014 conversations ${i + 1} of ${heads.length}`);
      if (this.plugin.conversationWriter.hasNoteFor(head.journalId)) { conversations.alreadyThere++; continue; }
      try {
        const turns = await loadConversation(deps, head.journalId, { day: head.day, preview: head.preview });
        const outcome = await this.plugin.conversationWriter.write(turns, { journalId: head.journalId, date: head.day || date });
        if (outcome.status === 'written') conversations.saved++; else if (outcome.status === 'error') conversations.failed++;
      } catch { conversations.failed++; }
    }

    // 3. Every canvas that still exists on the server.
    const history = await this.plugin.backend.getCompositionHistory(200).catch(() => null);
    const rows = history?.data?.compositions ?? [];
    const canvases = { kept: 0, expired: 0, failed: 0 };
    for (const [i, row] of rows.entries()) {
      progress(`Export \u2014 canvases ${i + 1} of ${rows.length}`);
      if (row.is_expired) { canvases.expired++; continue; }
      const id = String(row.composition_id ?? row.id ?? '');
      if (!id) continue;
      const outcome = await this.plugin.exportComposition(id, 'canvas', { quiet: true });
      if (outcome.status === 'written') canvases.kept++; else canvases.failed++;
    }

    // 4. The receipt.
    const summary: ExportSummary = {
      date, people, conversations, canvases,
      surfaces: [
        '**Me** \u2192 `Myu/Me.md`', '**People** and **Companies** \u2192 `Myu/People/`, `Myu/Companies/` (+ `People.base`, `Companies.base`)',
        '**Journal** (every surface, decrypted) \u2192 `Myu/Journal/`', '**Meetings** \u2192 `Myu/Meetings/`',
        '**Calendar** \u2192 `Myu/Calendar.md`, `Myu/Days/`', '**Commitments** \u2192 `Myu/Commitments.md`', '**Today / Week** \u2192 `Myu/Today.md`, `Myu/Week.md`',
      ],
    };
    const path = normalizePath('Myu/Export.md');
    const existing = this.app.vault.getAbstractFileByPath(path);
    const md = buildExportManifest(summary);
    if (existing instanceof TFile) await this.app.vault.process(existing, () => md);
    else await this.app.vault.create(path, md);
    progress('');
    return summary;
  }
}
