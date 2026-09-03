/**
 * Request my data archive — the web's Download-your-data, in the vault.
 *
 * What the vault export cannot hold (account, devices, keys, consents) the
 * server can: an encrypted zip, link by email when it is ready, passphrase
 * shown ONCE and never stored. Same words as the web, same one-time-ness.
 */

import { App, Modal, Setting } from 'obsidian';
import type AskMyuPlugin from '../main';

export class DataExportModal extends Modal {
  private passphrase: string | null = null;
  private problem: string | null = null;
  private busy = false;

  constructor(app: App, private plugin: AskMyuPlugin) { super(app); }

  override onOpen(): void { this.render(); }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('myu-power-down');
    contentEl.createEl('h2', { text: 'Download your data' });

    if (this.passphrase) {
      contentEl.createEl('p', { cls: 'myu-prose', text: 'Your archive is being prepared. The download link is delivered by email when it is ready.' });
      contentEl.createEl('p', { cls: 'myu-prose', text: 'Save this passphrase. It unlocks the zip, it is shown only once, and it is never stored \u2014 not here, not on the server.' });
      const box = contentEl.createDiv({ cls: 'myu-code myu-passphrase' });
      for (const word of this.passphrase.split(/\s+/)) box.createSpan({ cls: 'myu-passphrase-word', text: word });
      new Setting(contentEl)
        .addButton((b) => b.setButtonText('Copy passphrase').setCta().onClick(async () => {
          try { await navigator.clipboard.writeText(this.passphrase ?? ''); b.setButtonText('Copied'); } catch { b.setButtonText('Copy failed \u2014 write it down'); }
        }))
        .addButton((b) => b.setButtonText('Done').onClick(() => this.close()));
      return;
    }

    contentEl.createEl('p', { cls: 'myu-prose', text: 'Everything the server holds about you \u2014 journal, people, memories, meetings, commitments, account details \u2014 as one encrypted zip.' });
    contentEl.createEl('p', { cls: 'myu-prose myu-quiet', text: 'The link is emailed when the archive is ready. You will get a passphrase that unlocks it; it is shown once. One request per day.' });
    if (this.problem) contentEl.createDiv({ cls: 'myu-problem', text: this.problem });
    new Setting(contentEl)
      .addButton((b) => b.setButtonText('Not now').onClick(() => this.close()))
      .addButton((b) => b.setButtonText(this.busy ? 'Requesting\u2026' : 'Request my archive').setCta().setDisabled(this.busy).onClick(() => void this.request()));
  }

  private async request(): Promise<void> {
    this.busy = true; this.problem = null; this.render();
    const res = await this.plugin.backend.requestDataExport().catch(() => null);
    this.busy = false;
    const pass = res?.data?.passphrase;
    if (res?.ok && typeof pass === 'string' && pass) { this.passphrase = pass; }
    else { this.problem = res?.data?.message || res?.error || 'Could not request the archive right now.'; }
    this.render();
  }

  override onClose(): void { this.passphrase = null; this.contentEl.empty(); }
}
