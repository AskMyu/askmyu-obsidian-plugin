/**
 * Meeting-notes consent (P5.1) — its OWN yes, deliberately not a widening of
 * journal capture's.
 *
 * Different data class, said plainly: meeting notes carry other people's words,
 * and their content is processed server-side like every meeting source (Drive,
 * Gemini) — not end-to-end encrypted like journal capture. A consent screen
 * that blurred that distinction would be getting the yes under false pretences,
 * which is worse than not getting it.
 *
 * Power-down register: plain sentences, ordinary buttons, an easy no.
 */

import { App, Modal, Setting } from 'obsidian';
import type AskMyuPlugin from '../main';
import { notifyStatus } from '../notify';

export class MeetingConsentModal extends Modal {
  private folders = '';

  constructor(
    app: App,
    private plugin: AskMyuPlugin,
    private onFinished: () => void,
  ) {
    super(app);
  }

  override onOpen(): void {
    this.folders = this.plugin.settings.meeting_folders.join(', ');
    this.render();
  }

  override onClose(): void {
    this.contentEl.empty();
    if (!this.plugin.settings.meeting_consent_offered) {
      this.plugin.settings.meeting_consent_offered = true;
      void this.plugin.saveSettings();
    }
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('myu-power-down');

    contentEl.createEl('h2', { text: 'Share meeting notes with Myu?' });

    contentEl.createEl('p', {
      cls: 'myu-prose',
      text:
        'Notes in the folders you choose become meetings Myu understands: decisions, ' +
        'who owns what, and the read on each person deepen from what you already write.',
    });

    contentEl.createEl('p', {
      cls: 'myu-prose',
      text:
        'This is a different kind of sharing than your journal. Meeting notes carry ' +
        "other people's words, and their content is processed on askMyu's servers " +
        'like every meeting source — it is not end-to-end encrypted the way journal ' +
        'capture is. Say no and nothing changes.',
    });

    contentEl.createEl('p', {
      cls: 'myu-prose myu-quiet',
      text:
        'A note outside these folders can opt in with `myu-meeting: true` in its ' +
        'frontmatter; clearing the list stops the watching entirely.',
    });

    new Setting(contentEl)
      .setName('Meeting-notes folders')
      .setDesc('Comma-separated paths, e.g. Meetings, work/1-1s')
      .addText((t) =>
        t
          .setPlaceholder('Meetings')
          .setValue(this.folders)
          .onChange((v) => {
            this.folders = v;
          }),
      );

    new Setting(contentEl)
      .addButton((b) => b.setButtonText('Not now').onClick(() => this.close()))
      .addButton((b) =>
        b
          .setButtonText('Share these')
          .setCta()
          .onClick(() => void this.confirm()),
      );
  }

  private async confirm(): Promise<void> {
    const folders = this.folders
      .split(',')
      .map((f) => f.replace(/^\/+|\/+$/g, '').trim())
      .filter(Boolean);

    this.plugin.settings.meeting_folders = folders;
    await this.plugin.saveSettings();
    this.plugin.restartCapture();
    // The wedge: existing notes in these folders ingest NOW, not on next edit.
    void this.plugin.runMeetingBackfill();

    notifyStatus(
      folders.length === 0 ? 'No meeting folders shared. Myu reads none.' : `Sharing meeting notes from: ${folders.join(', ')}`,
    );
    this.close();
    this.onFinished();
  }
}
