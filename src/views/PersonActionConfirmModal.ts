/**
 * One yes for an action that changes who is in your people. Power-down
 * register: the safe door is the CTA-less one, the words say exactly what
 * happens (and, for "this is me", what does not).
 */

import { App, Modal, Setting } from 'obsidian';

export class PersonActionConfirmModal extends Modal {
  private answered = false;

  constructor(app: App, private readonly copy: { title: string; body: string; cta: string }, private readonly onAnswer: (yes: boolean) => void | Promise<void>) {
    super(app);
  }

  override onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('myu-power-down');
    contentEl.createEl('h2', { text: this.copy.title });
    contentEl.createEl('p', { cls: 'myu-prose', text: this.copy.body });
    new Setting(contentEl)
      .addButton((b) => b.setButtonText('Not now').onClick(() => this.answer(false)))
      .addButton((b) => b.setButtonText(this.copy.cta).setDestructive().onClick(() => this.answer(true)));
  }

  private answer(yes: boolean): void {
    this.answered = true;
    this.close();
    void this.onAnswer(yes);
  }

  override onClose(): void {
    this.contentEl.empty();
    if (!this.answered) { this.answered = true; void this.onAnswer(false); }
  }
}
