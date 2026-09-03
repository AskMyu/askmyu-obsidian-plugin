/**
 * The approving half of the 4-digit ceremony (fleet fix, 2026-08-22): the new
 * device shows a code; the person types it HERE, on the device that already
 * holds the key. The mDEK is ECDH-wrapped to the requester inside the unlock
 * machine — nothing raw crosses the wire, which is the whole reason the code
 * exists: possession of both screens is the proof.
 */

import { App, Modal, Setting } from 'obsidian';
import type AskMyuPlugin from '../main';
import { notifyError, notifyStatus } from '../notify';

export class ApproveDeviceModal extends Modal {
  private code = '';
  private working = false;

  constructor(
    app: App,
    private plugin: AskMyuPlugin,
    private requestId: string,
    private requesterPublicKey: string,
    private onFinished: () => void,
  ) {
    super(app);
  }

  override onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('myu-power-down');
    contentEl.createEl('h2', { text: 'Let this device in?' });
    contentEl.createEl('p', {
      cls: 'myu-prose',
      text:
        'The new device is showing a 4-digit code. Typing it here proves the ' +
        'same person is holding both screens — then it gets its own key ' +
        'custody, revocable from your device list any time.',
    });

    new Setting(contentEl).setName('The code on the new device').addText((t) => {
      t.setPlaceholder('0000').onChange((v) => (this.code = v.trim()));
    });

    new Setting(contentEl)
      .addButton((b) => b.setButtonText('Cancel').onClick(() => this.close()))
      .addButton((b) =>
        b
          .setButtonText('Approve')
          .setCta()
          .onClick(() => void this.approve(b.buttonEl)),
      );
  }

  override onClose(): void {
    this.contentEl.empty();
  }

  private async approve(button: HTMLButtonElement): Promise<void> {
    if (this.working || this.code.length !== 4) {
      if (this.code.length !== 4) notifyError('Four digits, from the new device’s screen.');
      return;
    }
    this.working = true;
    button.disabled = true;
    const outcome = await this.plugin.unlock.approvePendingDevice(this.requestId, this.code, this.requesterPublicKey);
    this.working = false;
    if (outcome === 'ok') {
      notifyStatus('Approved — the new device is unlocking now.');
      this.close();
      this.onFinished();
    } else if (outcome === 'bad_code') {
      notifyError('That code doesn’t match — read it again from the new device.');
      button.disabled = false;
    } else {
      notifyError('Approval failed — check the connection and try again.');
      button.disabled = false;
    }
  }
}
