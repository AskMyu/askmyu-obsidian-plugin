/**
 * Account deletion — the door out, from inside the vault (parity review
 * 2026-08-26).
 *
 * The webapp has had this in settings all along; the plugin never did, which
 * meant the one surface whose whole pitch is "your data, your keys, your off
 * switch" was the one surface with no off switch in it.
 *
 * Register: this is the only genuinely irreversible thing the plugin can do, so
 * it asks for the confirmation string by hand — the same string the webapp
 * asks for — and says plainly what it does NOT touch. Deleting the account does
 * not delete the vault: the user's own notes are theirs and stay where they
 * are, which is exactly the reassurance a local-first user wants at this
 * moment, and exactly the thing they would otherwise have to guess at.
 */

import { App, Modal, Setting } from 'obsidian';
import type AskMyuPlugin from '../main';
import { notifyError, notifyStatus } from '../notify';

/** The webapp's exact confirmation string — one contract, one spelling. */
const CONFIRMATION = 'DELETE';

export class DeleteAccountModal extends Modal {
  private typed = '';

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

    contentEl.createEl('h2', { text: 'Delete your askMyu account?' });
    contentEl.createEl('p', {
      cls: 'myu-prose',
      text:
        'Everything askMyu holds about you is deleted: your entries, the people ' +
        'and companies it built, its reads, and the key that opens them. This ' +
        'cannot be undone and there is no grace period.',
    });
    contentEl.createEl('p', {
      cls: 'myu-prose',
      text:
        'Your vault is untouched. Every note you wrote stays exactly where it ' +
        'is, including the folder Myu has been keeping — that folder simply ' +
        'stops changing. Delete it whenever you like; everything in it is ' +
        'marked myu-generated: true.',
    });

    new Setting(contentEl)
      .setName(`Type ${CONFIRMATION} to confirm`)
      .addText((t) => t.setPlaceholder(CONFIRMATION).onChange((v) => (this.typed = v.trim())));

    new Setting(contentEl)
      .addButton((b) => b.setButtonText('Keep my account').setCta().onClick(() => this.close()))
      .addButton((b) =>
        b
          .setButtonText('Delete everything')
          .setDestructive()
          .onClick(async () => {
            if (this.typed !== CONFIRMATION) {
              notifyError(`Type ${CONFIRMATION} exactly to confirm.`);
              return;
            }
            const res = await this.plugin.backend.deleteAccount(CONFIRMATION);
            if (!res.ok) {
              notifyError("Couldn't delete the account — check the connection and try again.");
              return;
            }
            this.close();
            // Local custody goes too: leaving a token and a wrapped blob behind
            // for an account that no longer exists is just litter that looks
            // like a working install.
            await this.plugin.unlock.disconnect();
            notifyStatus('Your account is deleted. Your vault is untouched.');
            this.onDone();
          }),
      );
  }

  override onClose(): void {
    this.contentEl.empty();
  }
}
