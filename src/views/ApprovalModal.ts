/**
 * Device approval — BLOCKED → UNLOCKED.
 *
 * Power-down register (warm, plain, unhurried): this is a presence/consent
 * moment, not a cockpit one. No accents, no chips, no cleverness. The user is
 * being asked to prove that this vault is theirs, and the copy says why in the
 * words a person would use.
 *
 * Two ways through, in the order most people will take them:
 *   1. approve on a device you're already signed in on (4 digits),
 *   2. your recovery phrase, if you can't reach one.
 *
 * Both work identically on desktop and in the mobile webview — no Electron-only
 * API touches this path (QA invariant 7). The phrase never leaves the process.
 */

import { App, Modal, Setting } from 'obsidian';
import type { UnlockMachine } from '../auth/UnlockMachine';

type Stage = 'choose' | 'waiting' | 'phrase' | 'done' | 'failed';

export class ApprovalModal extends Modal {
  private stage: Stage = 'choose';
  private code: string | null = null;
  private message: string | null = null;

  constructor(
    app: App,
    private unlock: UnlockMachine,
    private onFinished: () => void,
  ) {
    super(app);
  }

  override onOpen(): void {
    this.render();
  }

  override onClose(): void {
    // A modal dismissed mid-transfer must not leave a poll running against a
    // request nobody is watching.
    this.unlock.cancelApproval();
    this.contentEl.empty();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('myu-power-down');

    contentEl.createEl('h2', { text: 'Connect this vault to Myu' });

    switch (this.stage) {
      case 'choose':
        this.renderChoose();
        break;
      case 'waiting':
        this.renderWaiting();
        break;
      case 'phrase':
        this.renderPhrase();
        break;
      case 'done':
        this.renderDone();
        break;
      case 'failed':
        this.renderFailed();
        break;
    }
  }

  private renderChoose(): void {
    const { contentEl } = this;

    contentEl.createEl('p', {
      cls: 'myu-prose',
      text:
        'Your notes are encrypted with a key only your devices hold. To let this ' +
        'one read and write with that key, approve it from a device you are ' +
        'already signed in on.',
    });

    new Setting(contentEl)
      .setName('Approve from another device')
      .setDesc('Shows a 4-digit code here; you type it in AskMyu on your phone or the web app.')
      .addButton((b) =>
        b
          .setButtonText('Start')
          .setCta()
          .onClick(() => void this.beginApproval()),
      );

    new Setting(contentEl)
      .setName('Use your recovery phrase')
      .setDesc("The 12 words you saved when you set up encryption. Use this if you can't reach another device.")
      .addButton((b) =>
        b.setButtonText('Enter phrase').onClick(() => {
          this.stage = 'phrase';
          this.render();
        }),
      );
  }

  private async beginApproval(): Promise<void> {
    this.stage = 'waiting';
    this.code = null;
    this.message = null;
    this.render();

    const pending = await this.unlock.beginApproval();
    if (!pending) {
      this.stage = 'failed';
      this.message = "Couldn't start the approval. Check your connection and try again.";
      this.render();
      return;
    }

    this.code = pending.verificationCode;
    this.render();

    this.unlock.startPolling(pending.requestId, (outcome) => {
      if (outcome === 'approved') {
        this.stage = 'done';
      } else {
        this.stage = 'failed';
        this.message =
          outcome === 'denied'
            ? 'That request was declined on the other device.'
            : outcome === 'expired'
              ? 'The request timed out. You can start again.'
              : "Something went wrong finishing the handover. You can start again.";
      }
      this.render();
    });
  }

  private renderWaiting(): void {
    const { contentEl } = this;

    if (!this.code) {
      contentEl.createEl('p', { cls: 'myu-prose', text: 'Starting…' });
      return;
    }

    contentEl.createEl('p', {
      cls: 'myu-prose',
      text: 'In AskMyu on your phone or the web app, approve this device and enter:',
    });

    // Mono for digits — the one type shift the register allows here.
    contentEl.createDiv({ cls: 'myu-code', text: this.code });

    contentEl.createEl('p', {
      cls: 'myu-prose myu-quiet',
      text: 'Waiting for approval. You can leave this open — it finishes on its own.',
    });

    new Setting(contentEl).addButton((b) =>
      b.setButtonText('Cancel').onClick(() => {
        this.unlock.cancelApproval();
        this.stage = 'choose';
        this.render();
      }),
    );
  }

  private renderPhrase(): void {
    const { contentEl } = this;
    let phrase = '';

    contentEl.createEl('p', {
      cls: 'myu-prose',
      text: 'Enter your 12-word recovery phrase. It is used here and not stored.',
    });

    new Setting(contentEl).setName('Recovery phrase').addTextArea((t) => {
      t.setPlaceholder('Twelve words, separated by spaces').onChange((v) => {
        phrase = v;
      });
      t.inputEl.rows = 3;
      t.inputEl.addClass('myu-phrase-input');
    });

    if (this.message) contentEl.createEl('p', { cls: 'myu-prose myu-warn', text: this.message });

    new Setting(contentEl)
      .addButton((b) =>
        b.setButtonText('Back').onClick(() => {
          this.message = null;
          this.stage = 'choose';
          this.render();
        }),
      )
      .addButton((b) =>
        b
          .setButtonText('Unlock')
          .setCta()
          .onClick(async () => {
            const result = await this.unlock.unlockWithRecoveryPhrase(phrase);
            if (result === 'ok') {
              this.stage = 'done';
            } else {
              this.message =
                result === 'invalid_phrase'
                  ? "That phrase doesn't match this account. Check for typos or a missing word."
                  : result === 'no_recovery_key'
                    ? 'This account has no recovery phrase set up. Approve from another device instead.'
                    : "Couldn't reach AskMyu just now. Try again in a moment.";
            }
            this.render();
          }),
      );
  }

  private renderDone(): void {
    const { contentEl } = this;
    contentEl.createEl('p', {
      cls: 'myu-prose',
      text: 'Done — this vault is connected.',
    });
    contentEl.createEl('p', {
      cls: 'myu-prose myu-quiet',
      text:
        'Nothing is read yet. Next you choose which folders to share; until then ' +
        'Myu sees nothing from this vault.',
    });
    new Setting(contentEl).addButton((b) =>
      b
        .setButtonText('Close')
        .setCta()
        .onClick(() => {
          this.onFinished();
          this.close();
        }),
    );
  }

  private renderFailed(): void {
    const { contentEl } = this;
    contentEl.createEl('p', { cls: 'myu-prose myu-warn', text: this.message ?? 'That did not work.' });
    new Setting(contentEl)
      .addButton((b) =>
        b.setButtonText('Close').onClick(() => {
          this.close();
        }),
      )
      .addButton((b) =>
        b
          .setButtonText('Try again')
          .setCta()
          .onClick(() => {
            this.message = null;
            this.stage = 'choose';
            this.render();
          }),
      );
  }
}
