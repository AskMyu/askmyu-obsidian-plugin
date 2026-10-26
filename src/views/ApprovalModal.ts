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
 *   0. (2026-10-26) your password for new devices, first, when the account has one: the door's copy is read once
 *      when the window opens, and the typed password opens it here — a wrong one says so and stays.
 *
 * Both work identically on desktop and in the mobile webview — no Electron-only
 * API touches this path (QA invariant 7). The phrase never leaves the process.
 */

import { DEVICE_PASSWORD_WORDS } from '../devicePassword';
import { App, Modal, Setting } from 'obsidian';
import type { UnlockMachine } from '../auth/UnlockMachine';
import { approvalFailureText } from './approvalCopy';

type Stage = 'choose' | 'waiting' | 'phrase' | 'done' | 'failed';

/** The door's rate limit, in words: the server's seconds when it gives them. */
export function rateLimitNote(retryAfter: number | undefined): string {
  if (typeof retryAfter === 'number' && retryAfter > 0) {
    const minutes = Math.ceil(retryAfter / 60);
    return `Too many tries with the password for new devices. Try again in ${minutes === 1 ? 'a minute' : `${minutes} minutes`}, or use one of the doors below.`;
  }
  return 'Too many tries with the password for new devices. Try again later, or use one of the doors below.';
}

export class ApprovalModal extends Modal {
  private stage: Stage;
  private message: string | null = null;
  /** The password for new devices: unknown until the door answered; then whether there is one, and what to say. */
  private hasPassword: boolean | null = null;
  private passwordNote: string | null = null;
  private passwordBusy = false;
  private password = '';
  private unobserve: (() => void) | null = null;

  constructor(
    app: App,
    private unlock: UnlockMachine,
    private onFinished: () => void,
    initialStage: 'choose' | 'phrase' = 'choose',
  ) {
    super(app);
    this.stage = initialStage;
  }

  override onOpen(): void {
    // Ask once whether the account has a password for new devices; the choose stage draws the field when it does.
    void this.unlock
      .hasDevicePassword()
      .then((known) => {
        this.hasPassword = known.has;
        if (known.rateLimited) this.passwordNote = rateLimitNote(known.retryAfter);
      })
      .catch(() => {
        this.hasPassword = false;
      })
      .then(() => this.render());
    // The approval lives on the machine: a request already in flight is shown
    // as it stands, and every move re-renders this window.
    if (this.unlock.approval?.status === 'pending') this.stage = 'waiting';
    this.unobserve = this.unlock.observeApproval(() => this.onApprovalMoved());
    this.render();
  }

  override onClose(): void {
    // Closing is not cancelling (2026-09-03): the poll keeps running on the
    // machine, the Today pane shows the same code, and an approval given on
    // the other device still lands. Cancel is a button, and only a button.
    this.unobserve?.();
    this.unobserve = null;
    this.contentEl.empty();
  }

  private onApprovalMoved(): void {
    const a = this.unlock.approval;
    if (!a) {
      if (this.unlock.current === 'unlocked') this.stage = 'done';
      else if (this.stage === 'waiting') this.stage = 'choose';
    } else if (a.status === 'pending') {
      this.stage = 'waiting';
    } else {
      this.stage = 'failed';
      this.message =
        a.status === 'failed'
          ? approvalFailureText(a.failure)
          : a.status === 'denied'
            ? 'That request was declined on the other device.'
            : 'The request timed out. You can start again.';
    }
    this.render();
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
        'Your notes are encrypted with a key that only your devices have. To give ' +
        'this device the key, approve it from a device where you are already ' +
        'signed in.',
    });

    if (this.hasPassword) this.renderPasswordField();
    else if (this.passwordNote) contentEl.createEl('p', { cls: 'myu-prose myu-warn', text: this.passwordNote });

    new Setting(contentEl)
      .setName('Approve from another device')
      .setDesc('Shows a 4-digit code here; you type it in askMyu on your phone or the web app.')
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

  /** The field and its Open button, above the two doors; the words are the shared ones every surface shows. */
  private renderPasswordField(): void {
    const { contentEl } = this;
    new Setting(contentEl)
      .setName(DEVICE_PASSWORD_WORDS.newDeviceField)
      .setDesc("Type it and you're in. Or use one of the two doors below.")
      .addText((t) => {
        t.inputEl.type = 'password';
        t.inputEl.addClass('myu-password-input');
        t.setValue(this.password).onChange((v) => {
          this.password = v;
        });
      })
      .addButton((b) => {
        b.setButtonText(this.passwordBusy ? DEVICE_PASSWORD_WORDS.working : DEVICE_PASSWORD_WORDS.open)
          .setCta()
          .onClick(() => void this.openWithPassword());
        if (this.passwordBusy) b.setDisabled(true);
      });
    if (this.passwordNote) contentEl.createEl('p', { cls: 'myu-prose myu-warn', text: this.passwordNote });
  }

  private async openWithPassword(): Promise<void> {
    if (this.passwordBusy) return;
    this.passwordBusy = true;
    this.passwordNote = null;
    this.render();
    const result = await this.unlock.unlockWithPassword(this.password);
    this.passwordBusy = false;
    if (result === 'ok') {
      this.password = '';
      this.stage = 'done';
    } else if (result === 'wrong_password') {
      this.passwordNote = DEVICE_PASSWORD_WORDS.wrong;
    } else if (result === 'no_password') {
      this.hasPassword = false;
      this.passwordNote = 'This account has no password for new devices. Use one of the doors below.';
    } else {
      this.passwordNote = "Couldn't reach askMyu just now. Try again in a moment.";
    }
    this.render();
  }

  private async beginApproval(): Promise<void> {
    this.stage = 'waiting';
    this.message = null;
    this.render();
    const pending = await this.unlock.beginApproval();
    if (!pending) {
      this.stage = 'failed';
      this.message = "Couldn't start the approval. Check your connection and try again.";
      this.render();
    }
    // From here the machine's observer drives the stage: waiting → done / failed.
  }

  private renderWaiting(): void {
    const { contentEl } = this;

    const approval = this.unlock.approval;
    if (approval?.status !== 'pending') {
      contentEl.createEl('p', { cls: 'myu-prose', text: 'Starting…' });
      return;
    }

    contentEl.createEl('p', {
      cls: 'myu-prose',
      text: 'In askMyu on your phone or the web app, approve this device and enter:',
    });

    // Mono for digits — the one type shift the register allows here.
    contentEl.createDiv({ cls: 'myu-code', text: approval.code });

    contentEl.createEl('p', {
      cls: 'myu-prose myu-quiet',
      text: 'Waiting for approval. You can close this — it finishes on its own, and the Today pane shows the same code.',
    });

    new Setting(contentEl).addButton((b) =>
      b.setButtonText('Cancel').onClick(() => {
        this.unlock.cancelApproval();
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
                    : "Couldn't reach askMyu just now. Try again in a moment.";
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
