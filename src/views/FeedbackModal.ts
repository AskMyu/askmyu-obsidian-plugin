/**
 * Send feedback — the web's floating feedback button, as a modal. Category +
 * message → `POST /feedback/submit`. No picture of the vault is taken: an
 * Obsidian plugin does not photograph the user's notes. The reply rating
 * (👍/👎 under a Myu turn) uses the same route with `category: myu_response`;
 * see ChatView.
 *
 * Files (2026-10-14, the operator's decision): "Add a file" opens the computer's
 * own picker, several files at a time; each goes by email with the message and
 * nowhere else. Which picks can go, the caps and every word on screen are
 * `feedbackFiles.ts` (shared's rule, held equal by a test). The files are read
 * to base64 only when the report goes; one that will not read is left out and
 * named in a notice, and the report goes without it. A server from before
 * files takes the message and drops them: the modal says so and closes as on
 * success. A 413 is the modal's problem line.
 */

import { App, Modal, Setting } from 'obsidian';
import type AskMyuPlugin from '../main';
import { notifyError, notifyStatus } from '../notify';
import { FEEDBACK_FILE_WORDS, contentTypeOf, fileRefusalWords, fileSizeWords, filesWentThrough, takeFiles, type FeedbackFile } from '../feedbackFiles';

const CATEGORIES: Array<[string, string]> = [['general', 'General'], ['bug', 'Something broke'], ['feature', 'An idea']];

/** A picked file as the modal keeps it: shared's pick, and the File itself to read when the report goes. */
interface KeptFile { name: string; size: number; type: string | null; file: Blob }

/** The file's bytes as base64, no data-URL prefix (the web's `readBase64`). */
export function readFileBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(r.error ?? new Error('read failed'));
    r.onload = () => {
      const s = typeof r.result === 'string' ? r.result : '';
      const comma = s.indexOf(',');
      resolve(comma >= 0 ? s.slice(comma + 1) : s);
    };
    r.readAsDataURL(file);
  });
}

export class FeedbackModal extends Modal {
  private category = 'general';
  private message = '';
  private problem: string | null = null;
  private busy = false;
  private files: KeptFile[] = [];
  /** The last pick's refusals, in words, under the list until the next pick. */
  private refusals: string[] = [];
  private filesEl: HTMLElement | null = null;

  constructor(app: App, private plugin: AskMyuPlugin) { super(app); }

  override onOpen(): void { this.render(); }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('myu-power-down');
    contentEl.createEl('h2', { text: 'Send feedback to askMyu' });
    contentEl.createEl('p', { cls: 'myu-prose myu-quiet', text: 'Goes to the team by email, with the plugin build number. Nothing from your vault is attached unless you add a file.' });
    new Setting(contentEl).setName('About').addDropdown((d) => {
      for (const [id, label] of CATEGORIES) d.addOption(id, label);
      d.setValue(this.category).onChange((v) => { this.category = v; });
    });
    const box = contentEl.createEl('textarea', { cls: 'myu-chat-input', attr: { rows: '6', placeholder: 'What happened, or what you wish happened…', 'aria-label': 'Feedback' } });
    box.value = this.message;
    box.oninput = () => { this.message = box.value; };
    this.filesEl = contentEl.createDiv({ cls: 'myu-fb-files' });
    this.paintFiles();
    if (this.problem) contentEl.createDiv({ cls: 'myu-problem', text: this.problem });
    new Setting(contentEl)
      .addButton((b) => b.setButtonText('Not now').onClick(() => this.close()))
      .addButton((b) => b.setButtonText(this.busy ? 'Sending…' : 'Send').setCta().setDisabled(this.busy).onClick(() => void this.send()));
  }

  /**
   * The files block alone: each kept file with its size and its remove button, "Add a file", the caps, and the
   * last pick's refusals. Drawn on its own so a pick never redraws the message box under the person's caret.
   */
  private paintFiles(): void {
    const el = this.filesEl;
    if (!el) return;
    el.empty();
    for (const f of this.files) {
      const row = el.createDiv({ cls: 'myu-fb-file' });
      row.createSpan({ cls: 'myu-fb-file-name', text: f.name });
      row.createSpan({ cls: 'myu-fb-file-size', text: `· ${fileSizeWords(f.size)}` });
      const remove = row.createEl('button', { cls: 'myu-fb-file-remove', text: '×', attr: { 'aria-label': FEEDBACK_FILE_WORDS.removeFile(f.name) } });
      remove.disabled = this.busy;
      remove.onclick = () => this.removeFile(f);
    }
    const add = el.createEl('button', { cls: 'myu-fb-add', text: FEEDBACK_FILE_WORDS.addFile });
    add.disabled = this.busy;
    add.onclick = () => this.pick();
    el.createEl('p', { cls: 'myu-prose myu-quiet', text: `${FEEDBACK_FILE_WORDS.caps} ${FEEDBACK_FILE_WORDS.byEmail}` });
    for (const line of this.refusals) el.createEl('p', { cls: 'myu-prose myu-quiet myu-fb-refused', text: line });
  }

  /** The computer's own picker, several files at a time, through an input that is never shown. */
  private pick(): void {
    const input = this.contentEl.createEl('input', { type: 'file', cls: 'myu-fb-file-input', attr: { tabindex: '-1', 'aria-hidden': 'true' } });
    input.multiple = true;
    input.addEventListener('change', () => {
      this.addPicked(Array.from(input.files ?? []));
      input.remove();
    });
    input.addEventListener('cancel', () => input.remove());
    input.click();
  }

  /** The files just picked: the ones that can go join the list, in the order picked; the others are said. */
  addPicked(picked: readonly File[]): void {
    const { taken, refused } = takeFiles(this.files, picked.map((file): KeptFile => ({ file, name: file.name || 'file', size: file.size, type: file.type || null })));
    this.files = [...this.files, ...taken];
    this.refusals = fileRefusalWords(refused);
    this.paintFiles();
  }

  private removeFile(f: KeptFile): void {
    this.files = this.files.filter((k) => k !== f);
    this.refusals = [];
    this.paintFiles();
  }

  /** The kept files as they go on the wire, and the names of those that would not read (left out). */
  private async readFiles(): Promise<{ files: FeedbackFile[]; unread: string[] }> {
    const files: FeedbackFile[] = [];
    const unread: string[] = [];
    for (const f of this.files) {
      try {
        files.push({ name: f.name, content_type: contentTypeOf(f.name, f.type), size_bytes: f.size, base64: await readFileBase64(f.file) });
      } catch {
        unread.push(f.name);
      }
    }
    return { files, unread };
  }

  private async send(): Promise<void> {
    if (!this.message.trim()) { this.problem = 'Write something first.'; this.render(); return; }
    this.busy = true; this.problem = null; this.render();
    const { files, unread } = await this.readFiles();
    const res = await this.plugin.sendFeedback({ message: this.message.trim(), category: this.category, surface: 'feedback_modal', ...(files.length ? { attachments: { files } } : {}) }).catch(() => null);
    this.busy = false;
    if (res?.ok) {
      if (filesWentThrough(files.length, res.data)) notifyStatus('Thank you — sent.');
      else notifyError(FEEDBACK_FILE_WORDS.filesNotTaken);
      if (unread.length) notifyError(FEEDBACK_FILE_WORDS.couldNotRead(unread));
      this.close();
      return;
    }
    this.problem = res?.status === 413 || res?.error === 'attachment_too_large'
      ? FEEDBACK_FILE_WORDS.tooBigToSend
      : res?.data?.error === 'Rate limit exceeded' ? `Too many messages in a row. Try again in ${res.data.retry_after_minutes ?? 60} minutes.` : res?.error || 'Could not send right now.';
    this.render();
  }

  override onClose(): void { this.contentEl.empty(); }
}
