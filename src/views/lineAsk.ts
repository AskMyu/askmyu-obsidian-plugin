/**
 * One of Myu's questions outside a space, drawn with its buttons (2026-09-25): the Today pane's
 * rows and the opening question of a person's chat both use this. The rules (which buttons, what
 * they answer, what a reply shows) are `lineAnswers.ts`; this only draws them.
 */

import type { MyuLineLite } from '../transport/api';
import { LINE_ANSWER_WORDS, lineButtons, showEstimate, type LineButton, type LineDraft, type LineUi } from '../lineAnswers';
import { lineIdAttr } from '../linesSeenWatch';

/**
 * R19: the message an answer wrote ("Write a message to Sam"), in a box the person can edit, with
 * Copy and the link it is about. Nothing is sent from the vault.
 */
export function renderLineDraft(host: HTMLElement, draft: LineDraft): void {
  const wrap = host.createDiv({ cls: 'myu-line-draft' });
  const box = wrap.createEl('textarea', { cls: 'myu-line-draft-box' });
  box.value = draft.text;
  box.setAttr('rows', String(Math.min(9, Math.max(3, Math.ceil(draft.text.length / 45)))));
  box.setAttr('aria-label', draft.to_name ? `Your message to ${draft.to_name}` : 'Your message');
  const acts = wrap.createDiv({ cls: 'myu-mrow-acts myu-line-draft-acts' });
  const copy = acts.createEl('button', { cls: 'myu-aff', text: LINE_ANSWER_WORDS.copy });
  let failed: HTMLElement | null = null;
  copy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(box.value);
      copy.setText(LINE_ANSWER_WORDS.copied);
      failed?.remove();
      failed = null;
      window.setTimeout(() => copy.setText(LINE_ANSWER_WORDS.copy), 2500);
    } catch {
      // The words are selected, so the person can copy them with the keyboard.
      box.focus?.();
      box.select?.();
      failed ??= wrap.createDiv({ cls: 'myu-quiet myu-line-note', text: LINE_ANSWER_WORDS.copyFailed });
    }
  };
  box.oninput = () => copy.setText(LINE_ANSWER_WORDS.copy);
  if (draft.url) acts.createEl('a', { cls: 'myu-line-link', text: draft.label, href: draft.url, attr: { target: '_blank', rel: 'noopener' } });
}

/** Notes and links an answer left under the line (a consent opened, the invite's file, the event, a message). */
function renderAfter(host: HTMLElement, ui: LineUi): void {
  for (const n of ui.notes ?? []) host.createDiv({ cls: 'myu-quiet myu-line-note', text: n });
  for (const l of ui.links ?? []) {
    const row = host.createDiv({ cls: 'myu-quiet myu-line-note' });
    if (l.text) row.createSpan({ text: `${l.text} ` });
    row.createEl('a', { cls: 'myu-line-link', text: l.label, href: l.url, attr: { target: '_blank', rel: 'noopener' } });
  }
  if (ui.draft) renderLineDraft(host, ui.draft);
}

/**
 * The line, then its buttons (the quiet way out as quiet text). Answered here, it is replaced
 * by what Myu said back. `showText: false` when the words are already on screen (the chat's turn).
 */
export function renderLineAsk(
  host: HTMLElement,
  line: MyuLineLite,
  ui: LineUi,
  on: { press: (button: LineButton) => void },
  opts: { showText?: boolean } = {},
): void {
  if (ui.said !== undefined && ui.said !== null) {
    if (ui.said) host.createDiv({ cls: ui.good ? 'myu-done myu-line-said' : 'myu-quiet myu-line-said', text: ui.said });
    renderAfter(host, ui);
    return;
  }
  if (opts.showText !== false) {
    const cls = line.ask_kind === 'tell' ? 'myu-done' : line.ask_kind === 'wait' ? 'myu-quiet' : 'myu-line';
    // The words carry the line's id: in view for a second, the line is reported as seen (linesSeenWatch.ts).
    const el = host.createDiv({ cls, text: (line.text ?? '').trim(), attr: lineIdAttr(line.line_id) });
    // "One tap to answer." only where a tap answers it.
    if (showEstimate(line)) el.createSpan({ cls: 'myu-est', text: (line.est ?? '').trim() });
  }
  if (ui.note) host.createDiv({ cls: 'myu-quiet myu-line-note', text: ui.note });
  const buttons = lineButtons(line);
  if (buttons.length > 0) {
    const acts = host.createDiv({ cls: 'myu-mrow-acts myu-line-choices' });
    for (const b of buttons) {
      const el = acts.createEl('button', { cls: b.quiet ? 'myu-aff myu-line-quiet' : 'myu-aff', text: b.label });
      el.disabled = !!ui.busy;
      el.onclick = () => on.press(b);
    }
  }
  renderAfter(host, ui);
}
