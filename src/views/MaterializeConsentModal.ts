/**
 * P8 consent — the shared surface.
 *
 * Third consent class, after journal capture and meeting notes, and again its
 * own yes: this one is about Myu WRITING — plaintext markdown, in their vault,
 * syncing wherever the vault syncs. The exposure is named in as many words
 * (today this content exists only encrypted server-side), and so is the
 * interaction contract: "a shared surface, not a mirror" — edits here are
 * things you're saying to Myu, ticking a checkbox marks it done, everything
 * else is Myu's to regenerate.
 *
 * Power-down register: plain sentences, ordinary buttons, an easy no.
 */

import { App, Modal, Setting } from 'obsidian';
import type AskMyuPlugin from '../main';
import { notifyStatus } from '../notify';

export class MaterializeConsentModal extends Modal {
  private folder = 'Myu';
  private people = true;
  private today = true;
  private commitments = true;
  /** Set true by confirm(); read in onClose so the ladder can proceed to
      backfill whether the user said yes or "not now". */
  private accepted = false;

  constructor(
    app: App,
    private plugin: AskMyuPlugin,
    private onFinished: (accepted: boolean) => void,
  ) {
    super(app);
  }

  override onOpen(): void {
    const s = this.plugin.settings;
    this.folder = s.materialize_folder || 'Myu';
    this.people = s.materialize_people;
    this.today = s.materialize_today;
    this.commitments = s.materialize_commitments;
    this.render();
  }

  override onClose(): void {
    this.contentEl.empty();
    // Fires on BOTH paths — "Start writing" (this.accepted true) and "Not now"
    // (false) — so a caller chaining the sign-in ladder always resumes.
    this.onFinished(this.accepted);
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('myu-power-down');

    contentEl.createEl('h2', { text: 'Let Myu keep a folder in your vault?' });

    contentEl.createEl('p', {
      cls: 'myu-prose',
      text:
        'Myu keeps one folder in your vault, up to date: a page for each ' +
        'person and company, your journal, meetings, your calendar, today and ' +
        'the week, and any canvas you save. All plain markdown. Myu writes ' +
        'only in this folder — your own notes are never touched.',
    });

    contentEl.createEl('p', {
      cls: 'myu-prose',
      text:
        'Worth knowing: these files are plain text on your disk, and they sync ' +
        'wherever your vault syncs. Right now this content lives only on ' +
        'askMyu’s servers, encrypted. If you’d rather keep it that way, say no ' +
        '— nothing changes.',
    });

    contentEl.createEl('p', {
      cls: 'myu-prose',
      text:
        'You can tick a checkbox in these files to mark something done — Myu ' +
        'sees it. But don’t write notes in them: Myu rewrites these files, and ' +
        'your edits would be lost.',
    });

    contentEl.createEl('p', {
      cls: 'myu-prose myu-quiet',
      text:
        'Every file is marked `myu-generated: true`. You can turn writing off ' +
        'in settings, and “Remove everything Myu wrote” (Settings → askMyu → ' +
        'Your data) moves it all to the trash.',
    });

    new Setting(contentEl)
      .setName('Folder')
      .setDesc('Everything Myu writes lives under this path.')
      .addText((t) =>
        t.setPlaceholder('Myu').setValue(this.folder).onChange((v) => {
          this.folder = v;
        }),
      );

    new Setting(contentEl)
      .setName('People')
      .setDesc('A page per person — role, company, what Myu knows. A ready-made base makes it a table.')
      .addToggle((t) => t.setValue(this.people).onChange((v) => (this.people = v)));

    new Setting(contentEl)
      .setName('Today and the week')
      .setDesc('The brief and weekly review as files — embed `![[Myu/Today]]` in your daily template.')
      .addToggle((t) => t.setValue(this.today).onChange((v) => (this.today = v)));

    new Setting(contentEl)
      .setName('Commitments')
      .setDesc('Open commitments as real checkboxes your Tasks queries can see.')
      .addToggle((t) => t.setValue(this.commitments).onChange((v) => (this.commitments = v)));

    new Setting(contentEl)
      .addButton((b) => b.setButtonText('Not now').onClick(() => this.close()))
      .addButton((b) =>
        b
          .setButtonText('Start writing')
          .setCta()
          .onClick(() => void this.confirm()),
      );
  }

  private async confirm(): Promise<void> {
    const s = this.plugin.settings;
    s.materialize_consented = true;
    s.materialize_enabled = true;
    s.materialize_folder = this.folder.replace(/^\/+|\/+$/g, '').trim() || 'Myu';
    s.materialize_people = this.people;
    s.materialize_today = this.today;
    s.materialize_commitments = this.commitments;
    await this.plugin.saveSettings();

    notifyStatus(`Myu is filling ${s.materialize_folder}/ — watch it build.`);
    this.accepted = true;
    this.close(); // onClose fires onFinished(true)
  }
}
