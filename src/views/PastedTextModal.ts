/**
 * A chip, opened (pasted text, 2026-10-06): its text, read-only and scrollable, with "Put back in message" and
 * "Remove". Put back adds the text to the end of the typed words, after a blank line when there are some; it is held,
 * with the reason under it, when that would take the message over its limit. What each does is the composer's: it
 * owns the box, and puts the focus and the caret back there.
 */

import { App, Modal } from 'obsidian';
import type { PastedBlockWire } from '../wire';
import { PASTE_WORDS, canPutBack, chipLabel } from '../pastedText';

let reasonIds = 0;

export class PastedTextModal extends Modal {
  constructor(
    app: App,
    private chip: PastedBlockWire,
    /** Its number in the box, when there are several. */
    private n: number | undefined,
    /** The typed words in the box now, for Put back's limit. */
    private typed: string,
    private on: { putBack: () => void; remove: () => void },
  ) {
    super(app);
  }

  override onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.setTitle(chipLabel(this.chip, this.n));
    contentEl.createDiv({ cls: 'myu-pasted-text myu-pasted-sheet', text: this.chip.text, attr: { tabindex: '0' } });
    const check = canPutBack(this.typed, this.chip);
    const acts = contentEl.createDiv({ cls: 'modal-button-container' });
    const putBack = acts.createEl('button', { cls: 'mod-cta', text: PASTE_WORDS.putBack });
    putBack.disabled = !check.ok;
    putBack.onclick = () => {
      this.close();
      this.on.putBack();
    };
    const remove = acts.createEl('button', { text: PASTE_WORDS.remove });
    remove.onclick = () => {
      this.close();
      this.on.remove();
    };
    if (!check.ok) {
      const id = `myu-pasted-why-${++reasonIds}`;
      contentEl.createDiv({ cls: 'myu-pasted-hint', text: PASTE_WORDS.putBackTooLong(check.length), attr: { id } });
      putBack.setAttr('aria-describedby', id);
    }
  }

  override onClose(): void {
    this.contentEl.empty();
  }
}
