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
    contentEl.createEl('h2', { text: 'Keep every canvas in your vault?' });
    contentEl.createEl('p', {
      cls: 'myu-prose',
      text:
        'While this is on, every canvas this pane shows is saved into Myu/Canvas/ \u2014 ' +
        'the same composition updates its file in place and keeps your layout; a new one gets a new file. ' +
        'Canvases Myu makes expire on the server within a day; the vault copy is the one that lasts.',
    });
    contentEl.createEl('p', {
      cls: 'myu-prose myu-quiet',
      text:
        'Worth knowing: vault files sync through whatever you use, and anything written here ' +
        'leaves Myu\u2019s reach permanently. Turn the switch off any time; files already kept stay yours.',
    });
    new Setting(contentEl)
      .addButton((b) => b.setButtonText('Not now').onClick(() => this.answer(false)))
      .addButton((b) => b.setButtonText('Keep every canvas').setCta().onClick(() => this.answer(true)));
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
