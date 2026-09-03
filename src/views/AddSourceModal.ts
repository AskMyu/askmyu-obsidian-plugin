/**
 * Add an IMAP mailbox or CalDAV calendar from inside the vault — the full
 * control, not a mirror (parity ledger, 2026-08-25): both are plain
 * credential POSTs, so there is nothing web-only about them. Test before Add
 * is the whole UX: a wrong password should fail HERE, not as a silent sync
 * gap three hours later.
 *
 * The password goes to the SERVER (which needs it to poll the mailbox) over
 * the same authenticated channel the web form uses; it is never persisted in
 * the vault or plugin settings.
 */

import { App, Modal, Setting } from 'obsidian';
import type AskMyuPlugin from '../main';
import { notifyError, notifyStatus } from '../notify';

export class AddSourceModal extends Modal {
  private email = '';
  private password = '';
  private host = '';
  private port = 993;
  private ssl = true;
  private caldavUrl = '';
  private provider = 'caldav';
  private working = false;

  constructor(
    app: App,
    private plugin: AskMyuPlugin,
    private kind: 'imap' | 'caldav',
    private onFinished: () => void,
  ) {
    super(app);
  }

  override onOpen(): void {
    this.contentEl.addClass('myu-power-down');
    this.render();
  }

  override onClose(): void {
    this.password = '';
    this.contentEl.empty();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: this.kind === 'imap' ? 'Add an email account (IMAP)' : 'Add a calendar (CalDAV)' });
    contentEl.createEl('p', {
      cls: 'myu-prose myu-quiet',
      text:
        this.kind === 'imap'
          ? 'Any mailbox with IMAP — Fastmail, Proton via bridge, your own server. Myu reads it the way it reads Gmail.'
          : 'Any CalDAV calendar — Fastmail, iCloud, Nextcloud. Myu preps those meetings too.',
    });

    new Setting(contentEl).setName('Email').addText((t) => {
      t.setPlaceholder('you@fastmail.com').setValue(this.email).onChange((v) => (this.email = v.trim()));
      t.inputEl.type = 'email';
    });
    new Setting(contentEl).setName(this.kind === 'imap' ? 'Password (or app password)' : 'Password').addText((t) => {
      t.setPlaceholder('••••••••').onChange((v) => (this.password = v));
      t.inputEl.type = 'password';
    });

    if (this.kind === 'imap') {
      new Setting(contentEl).setName('IMAP host').addText((t) => {
        t.setPlaceholder('imap.fastmail.com').setValue(this.host).onChange((v) => (this.host = v.trim()));
      });
      new Setting(contentEl).setName('Port').addText((t) => {
        t.setPlaceholder('993').setValue(String(this.port)).onChange((v) => (this.port = Number(v.trim()) || 993));
      });
      new Setting(contentEl).setName('SSL').addToggle((t) => t.setValue(this.ssl).onChange((v) => (this.ssl = v)));
    } else {
      new Setting(contentEl).setName('CalDAV URL').addText((t) => {
        t.setPlaceholder('https://caldav.fastmail.com/dav/').setValue(this.caldavUrl).onChange((v) => (this.caldavUrl = v.trim()));
      });
    }

    new Setting(contentEl)
      .addButton((b) => b.setButtonText('Cancel').onClick(() => this.close()))
      .addButton((b) => b.setButtonText('Test connection').onClick(() => void this.test(b.buttonEl)))
      .addButton((b) => b.setButtonText('Add').setCta().onClick(() => void this.add(b.buttonEl)));
  }

  private complete(): boolean {
    if (!this.email || !this.password) return false;
    return this.kind === 'imap' ? !!this.host : !!this.caldavUrl;
  }

  private async test(button: HTMLButtonElement): Promise<void> {
    if (!this.complete() || this.working) {
      notifyError('Fill everything in first.');
      return;
    }
    this.working = true;
    button.textContent = 'Testing…';
    const res =
      this.kind === 'imap'
        ? await this.plugin.backend.testImapConnection(this.email, this.password, this.host, this.port, this.ssl)
        : await this.plugin.backend.testCalDavConnection(this.provider, this.email, this.password, this.caldavUrl);
    this.working = false;
    button.textContent = 'Test connection';
    if (res.ok) notifyStatus('Connection works.');
    else notifyError(`Connection failed (${res.error ?? res.status}). Check host and credentials.`);
  }

  private async add(button: HTMLButtonElement): Promise<void> {
    if (!this.complete() || this.working) {
      notifyError('Fill everything in first.');
      return;
    }
    this.working = true;
    button.disabled = true;
    const res =
      this.kind === 'imap'
        ? await this.plugin.backend.addImapConnection(this.email, this.password, this.host, this.port, this.ssl)
        : await this.plugin.backend.addCalDavAccount(this.provider, this.email, this.password, this.caldavUrl);
    this.working = false;
    if (res.ok) {
      notifyStatus(`${this.email} connected — Myu starts reading it now.`);
      this.close();
      this.onFinished();
    } else {
      button.disabled = false;
      notifyError(`Couldn't add it (${res.error ?? res.status}). Try Test connection first.`);
    }
  }
}
