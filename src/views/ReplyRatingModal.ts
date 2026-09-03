/**
 * 👍/👎 on a Myu reply — the web's JournalRatingModal: the thumb sets the
 * rating, a note is optional, the conversation is attached so the team can
 * see what was rated. Unlike the web, no screenshot (a plugin does not
 * photograph the vault), and what is sent is SAID, with the attachment as a
 * switch the person can flip before sending.
 */

import { App, Modal, Setting } from 'obsidian';
import type AskMyuPlugin from '../main';
import type { ChatTurn } from './ChatView';
import { formatConversationAttachment, type AttachedCanvas } from './feedbackAttachment';
import { notifyStatus } from '../notify';

export class ReplyRatingModal extends Modal {
  private note = '';
  private attach = true;
  private busy = false;
  private problem: string | null = null;

  constructor(
    app: App,
    private plugin: AskMyuPlugin,
    private rating: 1 | -1,
    private journalId: string,
    private turns: ChatTurn[],
    private onSubmitted: () => void,
  ) { super(app); }

  override onOpen(): void { this.render(); }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('myu-power-down');
    contentEl.createEl('h2', { text: this.rating === 1 ? 'What worked?' : 'What was off?' });
    const box = contentEl.createEl('textarea', { cls: 'myu-chat-input', attr: { rows: '4', placeholder: 'Optional \u2014 anything to add?', 'aria-label': 'Your note' } });
    box.value = this.note;
    box.oninput = () => { this.note = box.value; };

    // The web auto-attaches; here it is a switch — and the switch is the disclosure.
    new Setting(contentEl)
      .setName('Attach this conversation and its canvas')
      .setDesc(`${this.turns.length} turn${this.turns.length === 1 ? '' : 's'} as text \u2014 decrypted, so the team can read what you rated \u2014 plus the canvas this conversation made. Off: only the rating and your optional comments.`)
      .addToggle((t) => t.setValue(this.attach).onChange((v) => { this.attach = v; }));
    if (this.problem) contentEl.createDiv({ cls: 'myu-problem', text: this.problem });
    new Setting(contentEl)
      .addButton((b) => b.setButtonText('Not now').onClick(() => this.close()))
      .addButton((b) => b.setButtonText(this.busy ? 'Sending\u2026' : 'Send').setCta().setDisabled(this.busy).onClick(() => void this.send()));
  }

  private async send(): Promise<void> {
    this.busy = true; this.problem = null; this.render();
    const attachments = this.attach ? formatConversationAttachment(this.turns, this.journalId, new Date(), await this.gatherCanvases()) : undefined;
    const res = await this.plugin.sendFeedback({ message: this.note.trim(), category: 'myu_response', rating: this.rating, surface: 'chat', journalId: this.journalId, attachments }).catch(() => null);
    this.busy = false;
    if (res?.ok) { notifyStatus('Thanks \u2014 feedback recorded.'); this.onSubmitted(); this.close(); return; }
    this.problem = res?.data?.error === 'attachment_too_large' ? 'Attachment too large \u2014 try without the conversation.' : res?.data?.error === 'Rate limit exceeded' ? `Too many in a row \u2014 try again in ${res.data.retry_after_minutes ?? 60} minutes.` : res?.error || 'Something went wrong. Please try again.';
    this.render();
  }

  /** Only the canvas this conversation made — the web's linked composition (operator, 2026-08-30: not the pane's). */
  private async gatherCanvases(): Promise<AttachedCanvas[]> {
    const linked = await this.plugin.backend.getCompositionForJournal(this.journalId).catch(() => null);
    const linkedSpec = linked?.data?.composition;
    const linkedId = linked?.data?.composition_id || (linkedSpec && typeof linkedSpec.id === 'string' ? linkedSpec.id : '');
    return linkedSpec && linkedId ? [{ id: linkedId, spec: linkedSpec, source: 'Linked to journal' }] : [];
  }

  override onClose(): void { this.contentEl.empty(); }
}
