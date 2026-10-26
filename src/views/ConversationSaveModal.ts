/**
 * The exposure warning before a conversation is written into the vault (P6.3).
 * Power-down register; an easy no; the yes is per-save, never remembered.
 */

import { App, Modal, Setting } from 'obsidian';

export class ConversationSaveModal extends Modal {
  constructor(
    app: App,
    private onConfirm: () => void | Promise<void>,
  ) {
    super(app);
  }

  override onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('myu-power-down');

    contentEl.createEl('h2', { text: 'Save this conversation to your vault?' });
    contentEl.createEl('p', {
      cls: 'myu-prose',
      text:
        'It is saved as a note in Myu/Conversations/. The note includes what Myu said about you ' +
        'and the people you discussed. It syncs wherever your vault syncs, and Myu cannot ' +
        'delete it later. Conversations are only saved when you choose to save them.',
    });

    new Setting(contentEl)
      .addButton((b) => b.setButtonText('Not now').onClick(() => this.close()))
      .addButton((b) =>
        b
          .setButtonText('Save it')
          .setCta()
          .onClick(() => {
            this.close();
            void this.onConfirm();
          }),
      );
  }

  override onClose(): void {
    this.contentEl.empty();
  }
}
