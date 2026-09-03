/**
 * Add a login alias (V046) — parity review 2026-08-26.
 *
 * Deliberately does not offer a "verify" control: verification happens by
 * clicking a link in an email, and a vault cannot open mail. The modal says
 * what will happen instead of implying the plugin can finish the job.
 */

import { App, Modal, Setting } from 'obsidian';
import type AskMyuPlugin from '../main';
import { notifyError, notifyStatus } from '../notify';

export class AddAccountEmailModal extends Modal {
  private email = '';

  constructor(
    app: App,
    private plugin: AskMyuPlugin,
    private onDone: () => void,
  ) {
    super(app);
  }

  override onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('myu-power-down');

    contentEl.createEl('h2', { text: 'Add an email address' });
    contentEl.createEl('p', {
      cls: 'myu-prose',
      text:
        'Myu emails this address a link. Click it and the address can sign you ' +
        'in too — useful when work and personal mail both reach you.',
    });

    new Setting(contentEl)
      .setName('Address')
      .addText((t) => t.setPlaceholder('you@work.com').onChange((v) => (this.email = v.trim())));

    new Setting(contentEl)
      .addButton((b) => b.setButtonText('Cancel').onClick(() => this.close()))
      .addButton((b) =>
        b
          .setButtonText('Send the link')
          .setCta()
          .onClick(async () => {
            if (!this.email.includes('@')) {
              notifyError('That does not look like an email address.');
              return;
            }
            const res = await this.plugin.backend.addAccountEmail(this.email);
            if (!res.ok) {
              notifyError("Couldn't add that address — it may already be in use.");
              return;
            }
            this.close();
            notifyStatus(`Link sent to ${this.email}. Click it to finish.`);
            this.onDone();
          }),
      );
  }

  override onClose(): void {
    this.contentEl.empty();
  }
}
