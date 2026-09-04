/**
 * Correcting a person — the vault's answer to the webapp's PersonEditSheet
 * (parity review 2026-08-26).
 *
 * The webapp's rule holds here verbatim: **edit facts, correct inferences,
 * never hand-edit readings.** Three distinct things, three different doors:
 *
 *   facts       — name, role, company, email. The user asserts these; Myu
 *                 takes them as given.
 *   inferences  — a memory Myu extracted that is wrong. Correcting one keeps
 *                 the original, down-weighted, and records the correction as a
 *                 user_edit observation, so the model learns rather than
 *                 forgets. Deleting removes it outright.
 *   readings    — Myu's prose. NOT editable, here or on the web. A read is an
 *                 argument from evidence; editing the conclusion while leaving
 *                 the evidence would produce a person-page that lies to the
 *                 engine that wrote it.
 *
 * Why this is a modal and not an edit of the file: `Myu/People/<name>.md` is
 * REGENERATED from server truth. A correction typed into the note would be
 * overwritten on the next pass — worse, it would look like it worked until it
 * silently didn't. Corrections have to land at the source, and the file
 * follows.
 */

import { App, Modal, Setting } from 'obsidian';
import type AskMyuPlugin from '../main';
import { notifyError, notifyStatus } from '../notify';

export interface EditableMemory {
  memory_id: string;
  text: string;
  date?: string;
}

export class PersonEditModal extends Modal {
  private fields: Record<string, string | string[] | null> = {};

  constructor(
    app: App,
    private plugin: AskMyuPlugin,
    private relationshipId: string,
    private displayName: string,
    private memories: EditableMemory[],
    private onChanged: () => void,
    private linkedinUrl: string | null = null,
  ) {
    super(app);
  }

  override onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('myu-power-down');

    contentEl.createEl('h2', { text: `Correct what Myu knows about ${this.displayName}` });
    contentEl.createEl('p', {
      cls: 'myu-prose',
      text:
        'These go to Myu, not to the note — the note is rewritten from what Myu ' +
        'knows, so this is the end that sticks.',
    });

    new Setting(contentEl).setName('Facts').setHeading();
    this.textField(contentEl, 'Name', 'primary_name', this.displayName);
    this.textField(contentEl, 'Role', 'stated_role');
    this.textField(contentEl, 'Company', 'stated_company');
    this.textField(contentEl, 'Email', 'email_primary');
    this.textField(contentEl, 'Anything Myu should know', 'context_note');

    if (this.memories.length > 0) {
      new Setting(contentEl).setName('Things Myu believes').setHeading();
      contentEl.createEl('p', {
        cls: 'myu-prose',
        text:
          'Correcting one keeps the original as a down-weighted memory and ' +
          'records your correction, so Myu learns the difference. Deleting ' +
          'removes it entirely.',
      });
      for (const memory of this.memories.slice(0, 12)) this.memoryRow(contentEl, memory);
    }

    new Setting(contentEl).setName('This person').setHeading();
    new Setting(contentEl)
      .setName('Merge into\u2026')
      .setDesc('This is a duplicate of someone else Myu knows.')
      .addButton((b) => b.setButtonText('Choose who stays').onClick(() => { this.close(); this.plugin.mergePerson({ id: this.relationshipId, name: this.displayName }); }));
    new Setting(contentEl)
      .setName('This is me')
      .setDesc('Myu made a person out of you.')
      .addButton((b) => b.setButtonText('That\u2019s me').onClick(() => { this.close(); this.plugin.markPersonAsSelf({ id: this.relationshipId, name: this.displayName }); }));
    if (this.linkedinUrl) {
      new Setting(contentEl)
        .setName('LinkedIn')
        .setDesc(this.linkedinUrl)
        .addButton((b) => b.setButtonText('Unlink').onClick(async () => {
          const res = await this.plugin.backend.setRelationshipLinkedIn(this.relationshipId, null);
          if (res.ok) { notifyStatus('LinkedIn link removed.'); this.linkedinUrl = null; this.onChanged(); this.close(); }
          else notifyError(res.data?.error || "Couldn\u2019t unlink.");
        }));
    }
    new Setting(contentEl)
      .setName('Archive')
      .setDesc('Myu stops surfacing them. Reversible, and nothing is deleted.')
      .addButton((b) =>
        b.setButtonText('Archive').onClick(async () => {
          const res = await this.plugin.backend.archiveRelationship(this.relationshipId, 'archive');
          if (res.ok) {
            notifyStatus(`${this.displayName} archived.`);
            this.close();
            this.onChanged();
          } else notifyError("Couldn't archive them.");
        }),
      );

    new Setting(contentEl)
      .setName('Forget entirely')
      .setDesc('Deletes them and everything Myu derived from them. Cannot be undone.')
      .addButton((b) =>
        b.setButtonText('Forget').setDestructive().onClick(async () => {
          const res = await this.plugin.backend.purgeRelationship(this.relationshipId);
          if (res.ok) {
            notifyStatus(`Myu has forgotten ${this.displayName}.`);
            this.close();
            this.onChanged();
          } else notifyError("Couldn't forget them.");
        }),
      );

    new Setting(contentEl)
      .addButton((b) => b.setButtonText('Close').onClick(() => this.close()))
      .addButton((b) =>
        b.setButtonText('Save facts').setCta().onClick(() => void this.saveFacts()),
      );
  }

  private textField(host: HTMLElement, label: string, key: string, placeholder = ''): void {
    new Setting(host)
      .setName(label)
      .addText((t) =>
        t.setPlaceholder(placeholder).onChange((v) => {
          // Empty means "clear it" — the endpoint reads explicit null that way.
          this.fields[key] = v.trim() === '' ? null : v.trim();
        }),
      );
  }

  private memoryRow(host: HTMLElement, memory: EditableMemory): void {
    let correction = '';
    const row = new Setting(host).setName(memory.text.slice(0, 120)).setDesc(memory.date ?? '');
    row.addText((t) => t.setPlaceholder('What is actually true?').onChange((v) => (correction = v.trim())));
    row.addButton((b) =>
      b.setButtonText('Correct').onClick(async () => {
        if (!correction) {
          notifyError('Say what is actually true first.');
          return;
        }
        const res = await this.plugin.backend.editRelationshipMemory(memory.memory_id, 'correct', correction);
        if (res.ok) {
          notifyStatus('Corrected — Myu keeps both and weights yours.');
          this.onChanged();
        } else notifyError("Couldn't record that correction.");
      }),
    );
    row.addButton((b) =>
      b.setButtonText('Delete').setDestructive().onClick(async () => {
        const res = await this.plugin.backend.editRelationshipMemory(memory.memory_id, 'delete');
        if (res.ok) {
          notifyStatus('Deleted.');
          this.onChanged();
        } else notifyError("Couldn't delete that.");
      }),
    );
  }

  private async saveFacts(): Promise<void> {
    const touched = Object.keys(this.fields);
    if (touched.length === 0) {
      this.close();
      return;
    }
    const res = await this.plugin.backend.updateRelationshipProfile(this.relationshipId, this.fields);
    if (!res.ok) {
      notifyError("Couldn't save those — check the connection and try again.");
      return;
    }
    this.close();
    notifyStatus('Saved. Myu’s note for them updates on the next sync.');
    this.onChanged();
  }

  override onClose(): void {
    this.contentEl.empty();
  }
}
