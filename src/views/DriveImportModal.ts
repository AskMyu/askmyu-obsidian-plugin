/**
 * Meeting notes on Google Drive — the web's DriveImportSuggestionsCard and
 * "Import from Drive" button: suggestions (docs that look like meeting notes,
 * found beside your email) with Import / Dismiss, plus a paste-a-link import.
 * The vault's own notes stay the first source; this is the second door.
 */

import { App, Modal, Setting } from 'obsidian';
import type AskMyuPlugin from '../main';
import type { DriveSuggestion } from '../transport/api';
import { notifyStatus } from '../notify';

const FILE_ID_RE = /\/d\/([A-Za-z0-9_-]{10,})|[?&]id=([A-Za-z0-9_-]{10,})|^([A-Za-z0-9_-]{20,})$/;

export function driveFileId(input: string): string | null {
  const m = FILE_ID_RE.exec(input.trim());
  return m ? (m[1] || m[2] || m[3] || null) : null;
}

export class DriveImportModal extends Modal {
  private suggestions: DriveSuggestion[] | null = null;
  private problem: string | null = null;
  private pasted = '';

  constructor(app: App, private plugin: AskMyuPlugin) { super(app); }

  override async onOpen(): Promise<void> {
    this.render();
    const res = await this.plugin.backend.getDriveSuggestions(10).catch(() => null);
    this.suggestions = res?.ok ? (res.data?.suggestions ?? []) : [];
    if (!res?.ok) this.problem = 'Could not look at Drive right now.';
    this.render();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('myu-power-down');
    contentEl.createEl('h2', { text: 'Meeting notes on Google Drive' });
    contentEl.createEl('p', { cls: 'myu-prose myu-quiet', text: 'Docs beside your email that look like meeting notes. Importing makes a meeting Myu understands, like a note in your meetings folder.' });
    if (this.problem) contentEl.createDiv({ cls: 'myu-problem', text: this.problem });
    if (this.suggestions === null) contentEl.createEl('p', { cls: 'myu-quiet myu-thinking', text: 'Looking' });
    else if (this.suggestions.length === 0) contentEl.createEl('p', { cls: 'myu-quiet', text: 'Nothing suggested right now.' });
    for (const s of this.suggestions ?? []) {
      const row = new Setting(contentEl)
        .setName(s.source_email_subject || s.file_id)
        .setDesc([s.source_email_sender, s.source_email_date, s.meeting_signals?.join(', ')].filter(Boolean).join(' \u00b7 '));
      row.addButton((b) => b.setButtonText('Import').setCta().onClick(() => void this.importIds([s.file_id], s.id)));
      row.addButton((b) => b.setButtonText('Dismiss').onClick(async () => { await this.plugin.backend.dismissDriveSuggestion(s.id).catch(() => undefined); this.suggestions = (this.suggestions ?? []).filter((x) => x.id !== s.id); this.render(); }));
    }
    new Setting(contentEl)
      .setName('Or paste a Google Doc link')
      .addText((t) => t.setPlaceholder('https://docs.google.com/document/d/\u2026').setValue(this.pasted).onChange((v) => { this.pasted = v; }))
      .addButton((b) => b.setButtonText('Import').onClick(() => {
        const id = driveFileId(this.pasted);
        if (!id) { this.problem = 'That does not look like a Google Doc link.'; this.render(); return; }
        void this.importIds([id]);
      }));
  }

  private async importIds(fileIds: string[], suggestionId?: string): Promise<void> {
    this.problem = null;
    const res = await this.plugin.backend.importFromDrive(fileIds).catch(() => null);
    if (!res?.ok || res.data?.success === false) {
      this.problem = res?.data?.error === 'drive_not_connected' ? 'Google Drive is not connected \u2014 connect Google under Settings \u2192 askMyu \u2192 Connection.' : res?.data?.message || res?.error || 'Import failed.';
      this.render();
      return;
    }
    const results = res.data?.results ?? [];
    const imported = results.filter((r) => r.status === 'imported').length;
    const dup = results.filter((r) => r.status === 'duplicate').length;
    notifyStatus(imported ? `Imported ${imported} meeting${imported === 1 ? '' : 's'}${dup ? ` (${dup} already known)` : ''}.` : dup ? 'Already imported.' : results[0]?.message || 'Nothing imported.');
    if (suggestionId) this.suggestions = (this.suggestions ?? []).filter((x) => x.id !== suggestionId);
    if (imported) void this.plugin.materializer.refreshHistoryIfDue(true);
    this.render();
  }

  override onClose(): void { this.contentEl.empty(); }
}
