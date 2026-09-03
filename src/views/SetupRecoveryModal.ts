/**
 * P9 — the recovery ceremony, in the vault.
 *
 * Twelve words, generated on this device with the same BIP-39 machinery the
 * web uses, shown ONCE, never persisted, never sent. What ships is the mDEK
 * wrapped under the phrase-derived KEK — ciphertext, to the same endpoint the
 * web ceremony uses, so either side's phrase unlocks on the other.
 *
 * The confirmation step asks for two of the twelve back. Not security theater:
 * the failure this ceremony exists to prevent is "I thought I wrote it down,"
 * and typing two words is the cheapest proof of a real copy.
 *
 * Power-down register: plain sentences, an easy exit, no countdown.
 */

import { App, FileSystemAdapter, Modal, Platform, Setting } from 'obsidian';
import type AskMyuPlugin from '../main';
import { generatePhrase } from '../crypto/recovery';
import { notifyError, notifyStatus } from '../notify';

export class SetupRecoveryModal extends Modal {
  private phrase = '';
  private stage: 'show' | 'confirm' = 'show';
  /** How they secured the phrase — the finish button speaks to the door they
      actually took ('file' saves shouldn't be asked about password managers). */
  private securedVia: 'manager' | 'file' | null = null;
  private checkIndexes: [number, number] = [2, 8];
  private answers: [string, string] = ['', ''];
  private working = false;

  constructor(
    app: App,
    private plugin: AskMyuPlugin,
    private onFinished: () => void,
    /** 'genesis' = signup's key-birth step (the web's t=0 sequence, made
        visible because this client has no passkey); 'harden' = adding a
        phrase to an already-keyed account. */
    private mode: 'harden' | 'genesis' = 'harden',
  ) {
    super(app);
  }

  override onOpen(): void {
    this.phrase = generatePhrase();
    const first = Math.floor(Math.random() * 6);
    const second = 6 + Math.floor(Math.random() * 6);
    this.checkIndexes = [first, second];
    this.render();
  }

  override onClose(): void {
    // The phrase lives only in this modal's memory; closing forgets it.
    this.phrase = '';
    this.contentEl.empty();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('myu-power-down');

    if (this.stage === 'show') {
      contentEl.createEl('h2', { text: this.mode === 'genesis' ? 'Your keys — and the twelve words that back them' : 'Your recovery phrase' });
      contentEl.createEl('p', {
        cls: 'myu-prose',
        text:
          this.mode === 'genesis'
            ? 'Your notes get their own key, created on this device. These twelve ' +
              'words are its backup — the only way in if this device is lost. ' +
              'Write them down somewhere real; they are shown once and never ' +
              'leave this device.'
            : 'Twelve words that can unlock your notes if this device is lost. ' +
              'Write them down somewhere real — paper beats pixels. They are shown ' +
              'once and never leave this device.',
      });

      const grid = contentEl.createDiv({ cls: 'myu-recovery-grid' });
      this.phrase.split(' ').forEach((word, i) => {
        const cell = grid.createDiv({ cls: 'myu-recovery-word' });
        cell.createSpan({ cls: 'myu-quiet', text: `${i + 1}. ` });
        cell.createSpan({ text: word });
      });

      // The easy path for the password-manager crowd. The phrase must NEVER
      // land in the vault or plugin data (the passively-readable surfaces the
      // whole custody design defends) — a manager's encrypted store is the
      // one local place it belongs. Clipboard is overwritten after 90s so the
      // phrase doesn't outlive the paste in clipboard history.
      const copy = contentEl.createEl('button', {
        cls: 'myu-affordance',
        text: 'Copy for your password manager',
      });
      copy.onclick = async () => {
        await navigator.clipboard.writeText(this.phrase);
        this.securedVia = 'manager';
        copy.textContent = 'Copied — paste it into your manager now';
        copy.disabled = true;
        const snapshot = this.phrase;
        window.setTimeout(() => {
          void navigator.clipboard.readText().then((current) => {
            if (current === snapshot) return navigator.clipboard.writeText('');
          }).catch(() => undefined);
        }, 90_000);
        this.renderButtons();
      };

      // Save-to-file — the same affordance the web's RecoveryPhraseModal
      // (download) and mobile (share sheet) already offer; the plugin matches
      // the product rather than inventing a stricter rule (2026-08-22). One
      // vault-specific guard on top: the destination may not be inside the
      // vault, because the vault syncs and this phrase must not.
      if (Platform.isDesktopApp) {
        const saveBtn = contentEl.createEl('button', { cls: 'myu-affordance', text: 'Save to a file' });
        saveBtn.onclick = () => void this.saveToFile(saveBtn);
      }


      this.renderButtons();
      return;
    }

    contentEl.createEl('h2', { text: 'Prove the paper' });
    contentEl.createEl('p', {
      cls: 'myu-prose',
      text: 'Two of your twelve, from what you wrote — not from memory of the screen.',
    });

    const [a, b] = this.checkIndexes;
    new Setting(contentEl).setName(`Word ${a + 1}`).addText((t) => {
      t.onChange((v) => (this.answers[0] = v.trim().toLowerCase()));
    });
    new Setting(contentEl).setName(`Word ${b + 1}`).addText((t) => {
      t.onChange((v) => (this.answers[1] = v.trim().toLowerCase()));
    });

    new Setting(contentEl)
      .addButton((btn) =>
        btn.setButtonText('Show the words again').onClick(() => {
          this.stage = 'show';
          this.render();
        }),
      )
      .addButton((btn) =>
        btn
          .setButtonText('Finish')
          .setCta()
          .onClick(() => void this.finish(btn.buttonEl)),
      );
  }

  /** Desktop-only OS save dialog — the web download button's plugin twin. */
  private async saveToFile(button: HTMLButtonElement): Promise<void> {
    try {
      const w = window as unknown as { require?: (m: string) => unknown };
      const electron = w.require?.('electron') as
        | { remote?: { dialog?: { showSaveDialog: (o: unknown) => Promise<{ canceled: boolean; filePath?: string }> } } }
        | undefined;
      const dialog = electron?.remote?.dialog;
      const fs = w.require?.('fs') as { writeFileSync: (p: string, c: string) => void } | undefined;
      if (!dialog || !fs) {
        notifyError('Saving needs the desktop app — copy the phrase instead.');
        return;
      }

      const result = await dialog.showSaveDialog({
        title: 'Save your recovery phrase (not inside your vault)',
        defaultPath: 'askmyu-recovery-phrase.txt',
      });
      if (result.canceled || !result.filePath) return;

      const adapter = this.app.vault.adapter;
      const vaultBase = adapter instanceof FileSystemAdapter ? adapter.getBasePath() : null;
      if (vaultBase && result.filePath.startsWith(vaultBase)) {
        notifyError('Not inside your vault — it syncs, and this phrase must never sync. Pick somewhere else.');
        return;
      }

      const lines = [
        'askMyu recovery phrase',
        `Saved ${new Date().toISOString().slice(0, 10)}`,
        '',
        this.phrase,
        '',
        'These twelve words unlock your askMyu notes if every signed-in device is lost.',
        'Anyone holding them can read your notes. Best homes: your password manager,',
        'a printed page, an offline drive. Avoid cloud-synced folders.',
        '',
      ];
      fs.writeFileSync(result.filePath, lines.join('\n'));

      this.securedVia = 'file';
      button.textContent = 'Saved';
      button.disabled = true;
      notifyStatus('Saved. Treat the file like a key.');
      // The save IS the securing act — a durable artifact, verified written.
      // Requiring a second "the file is safe — finish" click stranded a real
      // user in genesis_pending twice (2026-08-22, 2026-08-24): the natural
      // mental model is saved = done. Finish right here. The copy path keeps
      // its explicit finish — a clipboard proves nothing durable. On failure,
      // finish() re-enables and the rendered CTA row offers the retry.
      await this.finish(button);
      // finish() re-enables the button only on failure — surface the CTA row
      // (with its own retry finish) instead of leaving a dead-looking modal.
      if (!button.disabled) this.renderButtons();
    } catch {
      notifyError("Couldn't save — copy the phrase instead.");
    }
  }

  /** The show-stage buttons; re-rendered when `copied` flips. */
  private buttonRow: HTMLElement | null = null;

  private renderButtons(): void {
    this.buttonRow?.remove();
    const row = new Setting(this.contentEl);
    this.buttonRow = row.settingEl;
    row.addButton((b) => b.setButtonText('Not now').onClick(() => this.close()));
    if (this.securedVia) {
      row.addButton((b) =>
        b
          .setButtonText(this.securedVia === 'manager' ? 'It’s in my password manager — finish' : 'The file is safe — finish')
          .setCta()
          .onClick(() => void this.finish(b.buttonEl)),
      );
    }
    row.addButton((b) =>
      b
        .setButtonText(this.securedVia ? 'I also wrote it down' : 'I wrote it down')
        .onClick(() => {
          this.stage = 'confirm';
          this.render();
        }),
    );
  }

  private async finish(button: HTMLButtonElement): Promise<void> {
    if (this.working) return;
    // The two-word retype proves PAPER — it only applies on the confirm stage.
    // The manager/file doors arrive here from the show stage with an
    // attestation instead, and empty answers there are not a failure.
    if (this.stage === 'confirm') {
      const words = this.phrase.split(' ');
      const [a, b] = this.checkIndexes;
      if (this.answers[0] !== words[a] || this.answers[1] !== words[b]) {
        notifyError("Those don't match — check the paper.");
        return;
      }
    }

    this.working = true;
    button.disabled = true;
    button.textContent = 'Saving…';

    const outcome =
      this.mode === 'genesis'
        ? await this.plugin.unlock.completeGenesis(this.phrase)
        : await this.plugin.unlock.setupRecoveryPhrase(this.phrase);
    this.working = false;

    if (outcome === 'ok' || outcome === 'unlocked') {
      this.plugin.settings.recovery_pending = false;
      await this.plugin.saveSettings();
      notifyStatus(
        this.mode === 'genesis'
          ? 'Keys created. The phrase on paper is their only backup.'
          : 'Recovery is set. The phrase on paper is now the only copy.',
      );
      this.close();
      this.onFinished();
    } else if (outcome === 'locked') {
      notifyError('Unlock first, then set up recovery.');
      this.close();
    } else {
      notifyError("Couldn't save the recovery key. Check the connection and try again.");
      button.disabled = false;
      button.textContent = 'Finish';
    }
  }
}
