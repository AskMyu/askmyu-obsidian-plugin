/**
 * Canvas export — pick a composition + the exposure warning, one modal.
 *
 * Opened WITH an id (the chat offer row, the canvas pane) it skips straight to
 * the warning. Opened WITHOUT one (the command) it OFFERS the account's recent
 * compositions to pick from — nobody is asked to know an id. The first version
 * asked for exactly that, and with the field empty the buttons did nothing at
 * all: a silent no-op, the thing R7 forbids (operator, 2026-08-28: "clicking
 * As a canvas or as a note doesnt do anything. i dont know what the id or url
 * is"). Pasting a web canvas URL still works, demoted to the fallback it is.
 * Power-down register.
 */

import { App, Modal, Setting } from 'obsidian';
import type AskMyuPlugin from '../main';
import type { CompositionHistoryRow } from '../transport/api';

export class CanvasExportModal extends Modal {
  private input = '';
  private selected: string | null = null;
  private rows: CompositionHistoryRow[] | null = null;
  private listEl: HTMLElement | null = null;
  private problemEl: HTMLElement | null = null;
  /** Resolves when the picker has loaded — tests await it; the UI never does. */
  ready: Promise<void> = Promise.resolve();

  constructor(
    app: App,
    private plugin: AskMyuPlugin,
    /** Pre-supplied id (the chat offer, the canvas pane) skips the picker. */
    private compositionId?: string,
  ) {
    super(app);
  }

  override onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('myu-power-down');

    contentEl.createEl('h2', { text: 'Save this canvas to your vault?' });

    contentEl.createEl('p', {
      cls: 'myu-prose',
      text:
        'You can save it two ways, both into Myu/Canvas/. As a canvas: keeps the layout and ' +
        'opens in Obsidian\u2019s own canvas editor. As a note: plain markdown ' +
        '(text, lists, tables, diagrams) that any editor can open, ' +
        'even without this plugin.',
    });

    contentEl.createEl('p', {
      cls: 'myu-prose myu-quiet',
      text: 'Either way, people mentioned in it link to their pages in your vault.',
    });

    contentEl.createEl('p', {
      cls: 'myu-prose myu-quiet',
      text:
        'Note: files in your vault sync with whatever sync service you use, and Myu cannot ' +
        'change or delete them once written. Charts are saved as a dated snapshot ' +
        '(a table in a note, a picture on a canvas); they do not update.',
    });

    if (!this.compositionId) {
      contentEl.createEl('h3', { text: 'Which canvas?' });
      this.listEl = contentEl.createDiv({ cls: 'myu-pick-list' });
      this.listEl.createEl('p', { cls: 'myu-quiet myu-thinking', text: 'Finding your canvases' });
      this.ready = this.loadRows();

      new Setting(contentEl)
        .setName('Or paste a web canvas URL')
        .setDesc('If you are looking at one on the web right now.')
        .addText((t) =>
          t.setPlaceholder('https://myu.askmyu.com/… or an id').onChange((v) => {
            this.input = v.trim();
            this.clearProblem();
          }),
        );
    }

    this.problemEl = contentEl.createDiv({ cls: 'myu-problem' });

    new Setting(contentEl)
      .addButton((b) => b.setButtonText('Not now').onClick(() => this.close()))
      .addButton((b) => b.setButtonText('As a note').onClick(() => this.go('markdown')))
      .addButton((b) => b.setButtonText('As a canvas').setCta().onClick(() => this.go('canvas')));
  }

  private async loadRows(): Promise<void> {
    const res = await this.plugin.backend.getCompositionHistory(20).catch(() => null);
    const all = Array.isArray(res?.data?.compositions) ? res.data.compositions : [];
    // Expired rows cannot be fetched — offering them would be a button that
    // fails. Newest first, as the server sends them.
    this.rows = all.filter((r) => !r.is_expired && (r.composition_id || r.id));
    this.renderRows();
  }

  private renderRows(): void {
    const host = this.listEl;
    if (!host) return;
    host.empty();
    if (this.rows === null) return;
    if (this.rows.length === 0) {
      host.createEl('p', {
        cls: 'myu-quiet',
        text: 'No canvases yet. Ask Myu for a canvas in chat. When Myu offers one, you can save it from there.',
      });
      return;
    }
    for (const row of this.rows) {
      const id = String(row.composition_id ?? row.id);
      const item = host.createEl('button', {
        cls: 'myu-pick-row' + (this.selected === id ? ' is-selected' : ''),
        text: row.summary_text || row.subject_name || 'Untitled canvas',
      });
      const meta = [row.subject_name && row.summary_text ? row.subject_name : '', whenOf(row.created_at)].filter(Boolean).join(' \u00b7 ');
      if (meta) item.createSpan({ cls: 'myu-whisper', text: meta });
      item.onclick = () => {
        this.selected = id;
        this.clearProblem();
        this.renderRows();
      };
    }
  }

  private go(format: 'markdown' | 'canvas'): void {
    const id = this.compositionId ?? this.selected ?? extractId(this.input);
    if (!id) {
      // Never a silent no-op. Say what is missing, where they are looking.
      this.problemEl?.setText(
        this.rows && this.rows.length > 0
          ? 'Pick a canvas above first.'
          : 'Nothing to save yet. Ask Myu for a canvas in chat, then save it from there.',
      );
      return;
    }
    this.close();
    void this.plugin.exportComposition(id, format);
  }

  private clearProblem(): void {
    this.problemEl?.setText('');
  }

  override onClose(): void {
    this.contentEl.empty();
  }
}

function whenOf(value: unknown): string {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(n) ? new Date(n).toISOString().slice(0, 10) : '';
}

/** Accepts a bare id or a canvas URL carrying `?id=` / a trailing id segment. */
function extractId(input: string): string | null {
  if (!input) return null;
  try {
    const url = new URL(input);
    const fromQuery = url.searchParams.get('id') ?? url.searchParams.get('composition_id');
    if (fromQuery) return fromQuery;
    const segments = url.pathname.split('/').filter(Boolean);
    return segments[segments.length - 1] ?? null;
  } catch {
    return input; // not a URL — treat as the id itself
  }
}
