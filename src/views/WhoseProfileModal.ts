/**
 * Whose LinkedIn profile is this? (2026-10-15.) The profile a pasted address names is in another name than the
 * account's, so before it goes on the account the person says whether it is theirs. Closed without an answer is no.
 * The words are the web's (`PROFILE_STEP_WORDS.linkedin`, @askmyu/shared newcomer.ts), copied: the plugin takes only
 * types from the shared package.
 */

import { App, Modal, Setting } from 'obsidian';

export const WHOSE_PROFILE_WORDS = {
  whose: (name: string) => `This profile belongs to ${name}. Is that you?`,
  itsMe: "Yes, that's me",
  notMe: "No, that's someone else",
  notMine: (name: string) =>
    `Nothing was added: that is ${name}'s profile, not yours. Paste the address of your own profile, which looks like linkedin.com/in/your-name.`,
} as const;

export class WhoseProfileModal extends Modal {
  private answered = false;

  constructor(app: App, private readonly profileName: string, private readonly onAnswer: (yes: boolean) => void) {
    super(app);
  }

  override onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('myu-power-down');
    contentEl.createEl('h2', { text: 'Add your LinkedIn profile' });
    contentEl.createEl('p', { cls: 'myu-prose', text: WHOSE_PROFILE_WORDS.whose(this.profileName) });
    new Setting(contentEl)
      .addButton((b) => b.setButtonText(WHOSE_PROFILE_WORDS.notMe).onClick(() => this.answer(false)))
      .addButton((b) => b.setButtonText(WHOSE_PROFILE_WORDS.itsMe).setCta().onClick(() => this.answer(true)));
  }

  private answer(yes: boolean): void {
    this.answered = true;
    this.close();
    this.onAnswer(yes);
  }

  override onClose(): void {
    this.contentEl.empty();
    if (!this.answered) {
      this.answered = true;
      this.onAnswer(false);
    }
  }
}
