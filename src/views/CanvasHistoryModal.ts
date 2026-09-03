/**
 * "Past canvases" — the web's History panel (toolbar → paged list → pick opens
 * it), as an Obsidian fuzzy suggester. The same `/composition/history` the
 * save modal's picker reads; here the pick OPENS the canvas in the pane.
 * Expired rows are shown but marked — the server has dropped them, and saying
 * so beats a silent gap in the list (R7).
 */

import { App, FuzzySuggestModal, type FuzzyMatch } from 'obsidian';
import type AskMyuPlugin from '../main';
import type { CompositionHistoryRow } from '../transport/api';

function whenOf(v: unknown): string {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isFinite(n) ? new Date(n).toISOString().slice(0, 10) : '';
}

export class CanvasHistoryModal extends FuzzySuggestModal<CompositionHistoryRow> {
  private rows: CompositionHistoryRow[] = [];

  constructor(app: App, private plugin: AskMyuPlugin) {
    super(app);
    this.setPlaceholder('Open a past canvas\u2026');
  }

  override async onOpen(): Promise<void> {
    super.onOpen();
    const res = await this.plugin.backend.getCompositionHistory(50).catch(() => null);
    this.rows = (res?.data?.compositions ?? []).filter((r) => r.composition_id || r.id);
    this.inputEl.dispatchEvent(new Event('input'));
  }

  getItems(): CompositionHistoryRow[] { return this.rows; }

  getItemText(row: CompositionHistoryRow): string {
    return [row.summary_text, row.subject_name, whenOf(row.created_at)].filter(Boolean).join(' ');
  }

  override renderSuggestion(match: FuzzyMatch<CompositionHistoryRow>, el: HTMLElement): void {
    const r = match.item;
    el.createDiv({ text: r.summary_text || r.subject_name || 'Untitled canvas' });
    const meta = [r.subject_name && r.summary_text ? r.subject_name : '', whenOf(r.created_at), r.is_expired ? 'expired on the server' : ''].filter(Boolean).join(' \u00b7 ');
    if (meta) el.createDiv({ cls: 'myu-quiet', text: meta });
  }

  onChooseItem(row: CompositionHistoryRow): void {
    const id = String(row.composition_id ?? row.id ?? '');
    if (id) void this.plugin.openCanvas(id);
  }
}
