/**
 * Backfill: preview, then Start — the bar Obsidian users hold (Readwise's
 * "x / y", Kindle's cancel): "N notes across M folders, oldest YYYY", the
 * people your links already name, a range, an honest estimate, and nothing
 * leaves until Start. The run itself lives in main.ts (status bar + cancel),
 * so closing this dialog changes nothing.
 *
 * It is also the largest single act of sharing the user will ever authorise
 * here, so the real numbers stay in it.
 */

import { App, Modal, Setting } from 'obsidian';
import type { TFile } from 'obsidian';
import type AskMyuPlugin from '../main';
import { backfillEstimate, rangeCutoff, surveyLine, type BackfillRange, type LinkedPerson } from '../capture/linkSurvey';

export class BackfillModal extends Modal {
  private range: BackfillRange = 'all';
  private people: LinkedPerson[] | null = null;

  constructor(
    app: App,
    private plugin: AskMyuPlugin,
    private files: TFile[],
    private oldest: number | null,
  ) {
    super(app);
  }

  override async onOpen(): Promise<void> {
    this.render();
    this.people = await this.plugin.linkSurvey().catch(() => []);
    this.render();
  }

  override onClose(): void {
    this.contentEl.empty();
  }

  private inRange(): TFile[] {
    const cutoff = rangeCutoff(this.range);
    return cutoff ? this.files.filter((f) => f.stat.mtime >= cutoff) : this.files;
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('myu-power-down');
    contentEl.createEl('h2', { text: 'Bring in what you have already written?' });

    const chosen = this.inRange();
    const folders = new Set(this.files.map((f) => f.path.split('/').slice(0, -1).join('/') || '/'));
    contentEl.createEl('p', { cls: 'myu-prose', text: describeScope(this.files.length, folders.size, this.oldest) });
    const line = this.people === null ? 'Looking at your links\u2026' : surveyLine(this.people);
    if (line) contentEl.createEl('p', { cls: 'myu-prose myu-quiet', text: line });

    new Setting(contentEl)
      .setName('How far back')
      .setDesc(`${chosen.length} ${chosen.length === 1 ? 'note' : 'notes'} \u00b7 ${backfillEstimate(chosen.length)}. Each note keeps its own date; every note is encrypted on this device before it leaves.`)
      .addDropdown((d) => d.addOption('90d', 'Last 90 days').addOption('1y', 'Last year').addOption('all', 'Everything').setValue(this.range).onChange((v) => { this.range = v as BackfillRange; this.render(); }));

    contentEl.createEl('p', { cls: 'myu-prose myu-quiet', text: 'Nothing leaves before you start it. It runs in the background \u2014 progress in the status bar, and a command to cancel. You can share only what you write from now on instead.' });

    new Setting(contentEl)
      .addButton((b) => b.setButtonText('Only from now on').onClick(() => { this.plugin.settings.backfill_done = true; void this.plugin.saveSettings(); this.close(); void this.plugin.refreshTodayNow(); }))
      .addButton((b) => b.setButtonText('Start').setCta().setDisabled(chosen.length === 0).onClick(() => { this.close(); void this.plugin.runBackfill(this.inRange()); }));
  }
}

export function describeScope(count: number, folders: number, oldest: number | null): string {
  if (count === 0) return 'There is nothing in the folders you shared yet.';
  const noun = count === 1 ? 'note' : 'notes';
  const where = `${count} ${noun} across ${folders} ${folders === 1 ? 'folder' : 'folders'}`;
  if (!oldest) return `${where}.`;
  return `${where}, oldest ${new Date(oldest).getFullYear()}.`;
}
