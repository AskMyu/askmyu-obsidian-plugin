/**
 * Weave Myu in — the recipes, rendered: every snippet as a code block with a
 * copy button, the text in view before it is copied. A pane, not a file:
 * nothing is written unless "Keep a copy in Myu/" is pressed, and that button
 * exists only while Myu's folder is on (the consent that lets Myu write).
 */

import { ItemView, MarkdownRenderer, WorkspaceLeaf } from 'obsidian';
import type AskMyuPlugin from '../main';
import { notifyError, notifyStatus } from '../notify';
import { weaveGuide } from '../vault/weaveRecipes';

export const WEAVE_VIEW_TYPE = 'askmyu-weave';

export class WeaveView extends ItemView {
  constructor(
    leaf: WorkspaceLeaf,
    private plugin: AskMyuPlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return WEAVE_VIEW_TYPE;
  }
  getDisplayText(): string {
    return 'Myu — weave Myu in';
  }
  override getIcon(): string {
    return 'puzzle';
  }

  override async onOpen(): Promise<void> {
    this.contentEl.addClass('myu-weave');
    await this.render();
  }

  async render(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    const s = this.plugin.settings;
    const folder = (s.materialize_folder || 'Myu').replace(/\/+$/, '');
    if (s.materialize_consented && s.materialize_enabled) {
      const top = root.createDiv({ cls: 'myu-sync-bar' });
      const keep = top.createEl('button', { cls: 'myu-affordance', text: `Keep a copy in ${folder}/` });
      keep.onclick = async () => {
        const path = await this.plugin.materializer.writeGuide(weaveGuide(folder, { asNote: true }));
        if (path) {
          notifyStatus(`Saved — ${path}.`);
          void this.plugin.app.workspace.openLinkText(path, '', true);
        } else {
          notifyError('Could not write the note — it may carry your own edits, which Myu will not overwrite.');
        }
      };
    }
    // `markdown-rendered` is what gives a bare render the reading view's look —
    // code blocks, headings, and the copy button in its corner.
    const body = root.createDiv({ cls: 'markdown-rendered myu-voice myu-weave-body' });
    await MarkdownRenderer.render(this.plugin.app, weaveGuide(folder), body, '', this);
    addCopyButtons(body);
  }
}

/**
 * Obsidian's reading view gives every code block a copy button; a bare render
 * may not. Where it is missing, add ours — same place, same job.
 */
export function addCopyButtons(body: HTMLElement): number {
  let added = 0;
  body.querySelectorAll('pre').forEach((pre) => {
    if (pre.querySelector('.copy-code-button')) return;
    const code = pre.querySelector('code');
    if (!code) return;
    const btn = pre.createEl('button', { cls: 'myu-affordance myu-copy-code', text: 'Copy', attr: { 'aria-label': 'Copy this snippet' } });
    btn.onclick = async () => {
      await navigator.clipboard.writeText(code.textContent ?? '');
      notifyStatus('Copied.');
    };
    added += 1;
  });
  return added;
}
