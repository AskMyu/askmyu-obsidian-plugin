/**
 * The exposure warning shown when the user turns the weekly review on.
 *
 * This is the one place the plugin asks permission to put something on disk, and
 * the copy has to be honest about what that means rather than reassuring: vault
 * files sync, and where they end up is outside anybody's control once they do.
 * Power-down register — plain sentences, no accents, an easy no.
 */

import { App, Modal, Setting } from 'obsidian';

export class WeeklyReviewModal extends Modal {
  constructor(
    app: App,
    private onDecision: (enabled: boolean) => void | Promise<void>,
  ) {
    super(app);
  }

  override onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('myu-power-down');

    contentEl.createEl('h2', { text: 'Write a weekly review to your vault?' });

    contentEl.createEl('p', {
      cls: 'myu-prose',
      text:
        'Once a week, Myu can add a short section to your Periodic Notes weekly ' +
        'note: counts of what changed across your relationships. The section sits ' +
        'between two markers and is replaced each week. The rest of the note ' +
        'is not touched.',
    });

    contentEl.createEl('p', {
      cls: 'myu-prose',
      text:
        'Before you say yes: vault files sync through whatever service you use — ' +
        'Dropbox, iCloud, Obsidian Sync — and end up wherever that takes them. ' +
        'Once written, Myu cannot change or delete it.',
    });

    contentEl.createEl('p', {
      cls: 'myu-prose myu-quiet',
      text:
        'It writes counts, not names. Turning this off stops future updates. ' +
        'Anything already written stays in your vault for you to keep or delete.',
    });

    new Setting(contentEl)
      .addButton((b) =>
        b.setButtonText('No, keep it out of my vault').onClick(() => {
          void this.onDecision(false);
          this.close();
        }),
      )
      .addButton((b) =>
        b
          .setButtonText('Yes, write it')
          .setCta()
          .onClick(() => {
            void this.onDecision(true);
            this.close();
          }),
      );
  }

  override onClose(): void {
    this.contentEl.empty();
  }
}
