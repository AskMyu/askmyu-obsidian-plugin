/**
 * Where a memory came from — the web's SourceDetailModal: `GET /card/source-detail`
 * for one email / journal entry, with the memories Myu drew from it.
 */

import { App, Modal } from 'obsidian';
import type AskMyuPlugin from '../main';
import { cardDayWords } from '../cardDays';

/** The kind of source in words, as the web's modal names it (2026-10-06: the code, "gmail", was printed). */
const SOURCE_KIND_WORDS: Record<string, string> = {
  gmail: 'Gmail',
  email: 'Email',
  upload: 'Uploaded email',
  manual_upload: 'Uploaded email',
  journal_entry: 'Journal',
  journal_chat: 'Chat',
  calendar_event: 'Calendar',
};

export class SourceDetailModal extends Modal {
  constructor(app: App, private plugin: AskMyuPlugin, private sourceType: string, private sourceId: string) { super(app); }

  override async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.addClass('myu-power-down');
    contentEl.createEl('h2', { text: 'Where this came from' });
    const wait = contentEl.createEl('p', { cls: 'myu-quiet myu-thinking', text: 'Looking' });
    const res = await this.plugin.backend.getSourceDetail(this.sourceType, this.sourceId).catch(() => null);
    wait.remove();
    const d = res?.data?.detail;
    if (!res?.ok || !d) { contentEl.createEl('p', { cls: 'myu-problem', text: res?.data?.error === 'unsupported_source_type' ? 'Myu cannot show this kind of source yet.' : 'Could not load the source.' }); return; }
    contentEl.createDiv({ cls: 'myu-claim', text: d.title || SOURCE_KIND_WORDS[this.sourceType] || 'A source' });
    // The day in the card's words ("28 Sep"), the kind in words — never a code.
    const meta = [d.subtitle, cardDayWords(d.timestamp) ?? '', d.source_type ? SOURCE_KIND_WORDS[d.source_type] ?? '' : ''].filter(Boolean).join(' \u00b7 ');
    if (meta) contentEl.createDiv({ cls: 'myu-quiet', text: meta });
    if (d.memories?.length) {
      const zone = contentEl.createDiv({ cls: 'myu-zone' });
      zone.createDiv({ cls: 'myu-whisper', text: 'what Myu noted from it' });
      for (const m of d.memories) {
        const row = zone.createDiv({ cls: 'myu-row' });
        if (cardDayWords(m.memory_date)) row.createSpan({ cls: 'myu-time', text: cardDayWords(m.memory_date) ?? '' });
        row.createSpan({ cls: 'myu-row-title', text: m.content });
      }
    }
    for (const [label, list] of [['commitments', d.tasks?.map((t) => t.title)], ['events', d.events?.map((e) => e.title)]] as const) {
      if (!list?.length) continue;
      const zone = contentEl.createDiv({ cls: 'myu-zone' });
      zone.createDiv({ cls: 'myu-whisper', text: label });
      for (const t of list) zone.createDiv({ cls: 'myu-row' }).createSpan({ cls: 'myu-row-title', text: t });
    }
  }

  override onClose(): void { this.contentEl.empty(); }
}
