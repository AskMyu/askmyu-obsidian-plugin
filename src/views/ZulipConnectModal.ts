/**
 * Connect Zulip — the web's ZulipConnectionCard form: realm URL, bot email,
 * API key → `POST /zulip/connect`. The key is sent once and never stored here.
 */

import { App, Modal, Setting } from 'obsidian';
import type AskMyuPlugin from '../main';
import { notifyStatus } from '../notify';

export class ZulipConnectModal extends Modal {
  private realm = '';
  private email = '';
  private apiKey = '';
  private problem: string | null = null;
  private busy = false;

  constructor(app: App, private plugin: AskMyuPlugin, private onDone: () => void) { super(app); }

  override onOpen(): void { this.render(); }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('myu-power-down');
    contentEl.createEl('h2', { text: 'Connect a Zulip organization' });
    contentEl.createEl('p', { cls: 'myu-prose myu-quiet', text: 'In Zulip, open your personal settings and copy the API key. Myu reads the streams you are in; the key is sent once and kept on the server, never in this vault.' });
    new Setting(contentEl).setName('Realm URL').addText((t) => t.setPlaceholder('https://yourorg.zulipchat.com').setValue(this.realm).onChange((v) => { this.realm = v; }));
    new Setting(contentEl).setName('Email').addText((t) => t.setPlaceholder('you@yourorg.com').setValue(this.email).onChange((v) => { this.email = v; }));
    new Setting(contentEl).setName('API key').addText((t) => { t.inputEl.type = 'password'; t.setValue(this.apiKey).onChange((v) => { this.apiKey = v; }); });
    if (this.problem) contentEl.createDiv({ cls: 'myu-problem', text: this.problem });
    new Setting(contentEl)
      .addButton((b) => b.setButtonText('Not now').onClick(() => this.close()))
      .addButton((b) => b.setButtonText(this.busy ? 'Connecting\u2026' : 'Connect').setCta().setDisabled(this.busy).onClick(() => void this.connect()));
  }

  private async connect(): Promise<void> {
    const realm = this.realm.trim().replace(/\/$/, '');
    if (!realm || !this.email.trim() || !this.apiKey.trim()) { this.problem = 'All three are needed.'; this.render(); return; }
    this.busy = true; this.problem = null; this.render();
    const res = await this.plugin.backend.zulipConnect(/^https?:\/\//.test(realm) ? realm : `https://${realm}`, this.email.trim(), this.apiKey.trim()).catch(() => null);
    this.busy = false;
    if (res?.ok && res.data?.success !== false) { notifyStatus(`Connected ${res.data?.realm_name || 'Zulip'}.`); this.close(); this.onDone(); return; }
    this.problem = res?.data?.error || res?.error || 'Zulip did not accept that.';
    this.render();
  }

  override onClose(): void { this.apiKey = ''; this.contentEl.empty(); }
}
