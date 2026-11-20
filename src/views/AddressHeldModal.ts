/**
 * The one question at sign-in when the address a mailed link proved is held by a password account nobody confirmed
 * (2026-11-17, shared `addressHeld.ts`; the web's `AddressHeldQuestion`). The server's sentence each time; its two choices
 * in its words: "Enter its password" opens a field and "Open it", "Start my own account" answers at once. A wrong password
 * says the server's words and keeps the question; too many tries ends it on the server, so, like an ended question, it
 * leaves the server's words and only the way back. Always "Back to the start", which opens the plugin's sign-in window. Answered,
 * the window closes and the same sign-in goes once more (`addressHeldSignin.ts`).
 *
 * Counting: the plugin sends no analytics of its own (Obsidian's developer policies; invariant 9). The server counts
 * this door's answers.
 */

import { App, Modal, Setting } from 'obsidian';
import { ADDRESS_HELD_WORDS, addressHeldBody, addressHeldOutcome, type AddressHeld, type AddressHeldOutcome } from '../addressHeld';
import type { ApiResponse } from '../transport';

export interface AddressHeldDeps {
  held: AddressHeld;
  /** POST /auth/address-held (`api.answerAddressHeld`). */
  answer: (body: Record<string, string>) => Promise<ApiResponse<unknown>>;
  /** Answered: the same sign-in goes again. */
  answered: (againUrl?: string) => Promise<void> | void;
  /** The way back to the start: the plugin's sign-in window. */
  back: () => void;
}

/** What an answer came to. Nothing reached the server (offline, or the plugin's own pause): it did not go through. */
export function heardAnswer(res: Pick<ApiResponse<unknown>, 'status' | 'data' | 'error'> | null): AddressHeldOutcome {
  if (!res || res.status === 0 || res.error === 'paused') return addressHeldOutcome(0, null);
  return addressHeldOutcome(res.status, res.data);
}

export class AddressHeldModal extends Modal {
  /** "Enter its password" was pressed: the field is open. */
  private typing = false;
  /** The question has ended (too many tries, or too long): only the way back. */
  private ended = false;
  /** The server's words for the last answer. */
  private said: string | null = null;
  private password = '';
  private busy = false;

  constructor(
    app: App,
    private deps: AddressHeldDeps,
  ) {
    super(app);
  }

  override onOpen(): void {
    this.render();
  }

  override onClose(): void {
    this.contentEl.empty();
  }

  private choiceLabel(id: 'password' | 'start_own'): string {
    const sent = this.deps.held.choices.find((c) => c.id === id)?.label;
    return sent || (id === 'password' ? ADDRESS_HELD_WORDS.password : ADDRESS_HELD_WORDS.startOwn);
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('myu-power-down');

    if (this.deps.held.email) contentEl.createEl('h2', { text: this.deps.held.email });
    contentEl.createEl('p', { cls: 'myu-prose', text: this.deps.held.message });

    if (!this.ended) {
      if (this.typing) {
        new Setting(contentEl).setName(ADDRESS_HELD_WORDS.passwordField).addText((t) => {
          t.setValue(this.password).onChange((v) => (this.password = v));
          t.inputEl.type = 'password';
        });
      }
      const row = new Setting(contentEl);
      if (this.typing) {
        row.addButton((b) => b.setButtonText(ADDRESS_HELD_WORDS.open).setCta().onClick(() => void this.send('password')));
      } else {
        row.addButton((b) =>
          b
            .setButtonText(this.choiceLabel('password'))
            .setCta()
            .onClick(() => {
              this.typing = true;
              this.render();
            }),
        );
      }
      row.addButton((b) => b.setButtonText(this.choiceLabel('start_own')).onClick(() => void this.send('start_own')));
    }

    if (this.said) contentEl.createEl('p', { cls: 'myu-prose', text: this.said });

    const doors = contentEl.createDiv({ cls: 'myu-modal-doors' });
    const back = doors.createEl('button', { cls: 'myu-affordance', text: ADDRESS_HELD_WORDS.back });
    back.onclick = () => {
      this.close();
      this.deps.back();
    };
  }

  private async send(choice: 'password' | 'start_own'): Promise<void> {
    if (this.busy) return;
    if (choice === 'password' && !this.password) return;
    this.busy = true;
    const body = addressHeldBody(this.deps.held.held_token, choice, choice === 'password' ? this.password : undefined);
    const res = await this.deps.answer(body).catch(() => null);
    this.busy = false;
    const outcome = heardAnswer(res);
    if (outcome.kind === 'done') {
      this.close();
      await this.deps.answered(outcome.again_url);
      return;
    }
    this.said = outcome.message;
    // Too many wrong tries (2026-11-19): the server's wait. The question and the password as typed stay, to send again after the wait.
    if (outcome.kind !== 'wait') this.password = '';
    // Too many tries ends the question on the server (its token is gone), as an ended one does: only the way back.
    if (outcome.kind === 'too_many' || outcome.kind === 'expired') this.ended = true;
    this.render();
  }
}
