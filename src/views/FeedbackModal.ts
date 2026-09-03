/**
 * Send feedback — the web's floating feedback button, as a modal. Category +
 * message → `POST /feedback/submit`. No screenshot: an Obsidian plugin does not
 * photograph the user's vault. The reply rating (👍/👎 under a Myu turn) uses
 * the same route with `category: myu_response`; see ChatView.
 */

import { App, Modal, Setting } from 'obsidian';
import type AskMyuPlugin from '../main';
import { notifyStatus } from '../notify';

const CATEGORIES: Array<[string, string]> = [['general', 'General'], ['bug', 'Something broke'], ['feature', 'An idea']];

export class FeedbackModal extends Modal {
  private category = 'general';
  private message = '';
  private problem: string | null = null;
  private busy = false;

  constructor(app: App, private plugin: AskMyuPlugin) { super(app); }

  override onOpen(): void { this.render(); }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('myu-power-down');
    contentEl.createEl('h2', { text: 'Send feedback to AskMyu' });
    contentEl.createEl('p', { cls: 'myu-prose myu-quiet', text: 'Goes to the team by email, with the plugin build number. Nothing from your vault is attached.' });
    new Setting(contentEl).setName('About').addDropdown((d) => {
      for (const [id, label] of CATEGORIES) d.addOption(id, label);
      d.setValue(this.category).onChange((v) => { this.category = v; });
    });
    const box = contentEl.createEl('textarea', { cls: 'myu-chat-input', attr: { rows: '6', placeholder: 'What happened, or what you wish happened\u2026', 'aria-label': 'Feedback' } });
    box.value = this.message;
    box.oninput = () => { this.message = box.value; };
    if (this.problem) contentEl.createDiv({ cls: 'myu-problem', text: this.problem });
    new Setting(contentEl)
      .addButton((b) => b.setButtonText('Not now').onClick(() => this.close()))
      .addButton((b) => b.setButtonText(this.busy ? 'Sending\u2026' : 'Send').setCta().setDisabled(this.busy).onClick(() => void this.send()));
  }

  private async send(): Promise<void> {
    if (!this.message.trim()) { this.problem = 'Say something first.'; this.render(); return; }
    this.busy = true; this.problem = null; this.render();
    const res = await this.plugin.sendFeedback({ message: this.message.trim(), category: this.category, surface: 'feedback_modal' }).catch(() => null);
    this.busy = false;
    if (res?.ok) { notifyStatus('Thank you \u2014 sent.'); this.close(); return; }
    this.problem = res?.data?.error === 'Rate limit exceeded' ? `Too many in a row \u2014 try again in ${res.data.retry_after_minutes ?? 60} minutes.` : res?.error || 'Could not send right now.';
    this.render();
  }

  override onClose(): void { this.contentEl.empty(); }
}
