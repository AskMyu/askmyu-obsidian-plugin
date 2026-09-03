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
    private onDecision: (enabled: boolean) => void,
  ) {
    super(app);
  }

  override onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('myu-power-down');

    contentEl.createEl('h2', { text: 'Write a weekly review into your vault?' });

    contentEl.createEl('p', {
      cls: 'myu-prose',
      text:
        'Once a week, Myu can add a short section to your Periodic Notes weekly ' +
        'note — the movement it saw across your relationships, as counts. It goes ' +
        'between two markers and replaces itself each week; the rest of the note ' +
        'stays yours.',
    });

    contentEl.createEl('p', {
      cls: 'myu-prose',
      text:
        'Worth knowing before you say yes: this is the only thing Myu ever writes ' +
        'into your vault. Vault files sync through whatever you use — Dropbox, ' +
        'iCloud, Obsidian Sync — and land wherever that takes them. Anything ' +
        'written here leaves our reach permanently.',
    });

    contentEl.createEl('p', {
      cls: 'myu-prose myu-quiet',
      text:
        'It writes counts, not names. Turning this off stops future writes; ' +
        'anything already written is yours to keep or delete.',
    });

    new Setting(contentEl)
      .addButton((b) =>
        b.setButtonText('No, keep it out of my vault').onClick(() => {
          this.onDecision(false);
          this.close();
        }),
      )
      .addButton((b) =>
        b
          .setButtonText('Yes, write it')
          .setCta()
          .onClick(() => {
            this.onDecision(true);
            this.close();
          }),
      );
  }

  override onClose(): void {
    this.contentEl.empty();
  }
}
