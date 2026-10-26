/**
 * Turning "always keep" ON — the exposure warning, once.
 *
 * The per-save modal exists because a saved canvas is Myu's words about
 * people, in a file that syncs beyond anyone's reach. A standing switch does
 * not skip that yes; it asks it ONCE, informed, and then stops asking (R2: a
 * user-waivable default, waived knowingly). Power-down register.
 */

import { App, Modal, Setting } from 'obsidian';

export class AutoKeepModal extends Modal {
  private answered = false;

  constructor(app: App, private readonly onAnswer: (keep: boolean) => void) {
    super(app);
  }

  override onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('myu-power-down');
    contentEl.createEl('h2', { text: 'Save every canvas to your vault?' });
    contentEl.createEl('p', {
      cls: 'myu-prose',
      text:
        'While this is on, every canvas shown in this pane is saved to Myu/Canvas/. ' +
        'When Myu updates a canvas, its file is updated in place and your layout stays. A new canvas gets a new file. ' +
        'Canvases expire on the server within a day; the copy in your vault does not.',
    });
    contentEl.createEl('p', {
      cls: 'myu-prose myu-quiet',
      text:
        'Note: files in your vault sync with whatever sync service you use, and Myu cannot change ' +
        'or delete them once they are written. You can turn this off at any time. Files already saved stay in your vault.',
    });
    new Setting(contentEl)
      .addButton((b) => b.setButtonText('Not now').onClick(() => this.answer(false)))
      .addButton((b) => b.setButtonText('Save every canvas').setCta().onClick(() => this.answer(true)));
  }

  private answer(keep: boolean): void {
    this.answered = true;
    this.close();
    this.onAnswer(keep);
  }

  override onClose(): void {
    this.contentEl.empty();
    // Dismissed by escape/click-away: that is a no, said once.
    if (!this.answered) { this.answered = true; this.onAnswer(false); }
  }
}
