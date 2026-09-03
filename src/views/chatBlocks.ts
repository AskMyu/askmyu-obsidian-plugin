/**
 * One chat block → DOM. Its own module so the rendering can be tested without
 * standing up an ItemView, the way cardSections.ts is for cards.
 *
 * Replies are MARKDOWN. The synthesis writes bold, lists, tables and links,
 * and the web renders them with ReactMarkdown. The first version of the chat
 * pane painted `block.text` as plain text — every `**` and `|` shown literally,
 * a six-column table arriving as a wall of pipes (operator, 2026-08-28: "we
 * need better formatting for the chat out stuff"). Obsidian's own
 * MarkdownRenderer gives bold, lists, tables, links, mermaid and the user's
 * theme for nothing; the canvas pane already used it. Now the chat does too.
 */

import { MarkdownRenderer, type App, type Component } from 'obsidian';
import type { ChatBlock, SourceReferenceLite } from '../wire';
import { componentMarkdown } from '../vault/myuFiles';

export interface ChatBlockHost {
  /** What on this canvas needs an answer — shown under the row so the tab is not invisible furniture. */
  asksFor?: (compositionId: string) => string | null;
  /** Render the canvas HERE, in the thread. Returns false when the spec is not loaded yet. */
  inlineCanvas?: (parent: HTMLElement, compositionId: string) => boolean;
  app: App;
  /** The Component owning the render's lifecycle (the view), so Obsidian tears down what it mounts. */
  component: Component;
  openCanvas(compositionId: string): void;
  saveCanvas(compositionId: string): void;
  /** The web app's origin, for the optional "view on web" door. */
  webOrigin: string;
  /** The canvas pane's "always keep" switch — while on, opening the canvas keeps it, so no per-save button. */
  autoKeep?: boolean;
}

/** The web's "Sources" footer: `[id]` · icon by source type · title as a link. */
export function renderReferences(parent: HTMLElement, references: SourceReferenceLite[] | undefined): void {
  if (!references?.length) return;
  const box = parent.createDiv({ cls: 'myu-chat-sources' });
  box.createDiv({ cls: 'myu-whisper', text: 'Sources' });
  for (const ref of references) {
    const row = box.createDiv({ cls: 'myu-chat-source' });
    row.createSpan({ cls: 'myu-mono', text: `[${ref.id}]` });
    const type = typeof ref.source_type === 'string' ? ref.source_type : '';
    row.createSpan({ text: type === 'news' ? '\ud83d\udcf0' : type === 'wiki' ? '\ud83d\udcd6' : type.startsWith('linkedin') ? '\ud83d\udcbc' : '\ud83c\udf10' });
    const title = (typeof ref.title === 'string' && ref.title.trim()) || (typeof ref.url === 'string' ? ref.url : 'source');
    if (typeof ref.url === 'string' && ref.url) {
      const a = row.createEl('a', { text: title, href: ref.url });
      a.setAttr('target', '_blank');
      a.setAttr('rel', 'noopener');
    } else {
      row.createSpan({ text: title });
    }
  }
}

export function renderChatBlock(parent: HTMLElement, block: ChatBlock, host: ChatBlockHost): void {
  if (block.type === 'composition_offer' && block.composition_id) {
    // The canvas is conversational content: render it in the thread when we
    // have it, and fall back to the row only while it is still loading.
    if (host.inlineCanvas?.(parent, block.composition_id)) return;
    const row = parent.createDiv({ cls: 'myu-chat-offer' });
    if (block.summary_text) row.createDiv({ cls: 'myu-claim', text: block.summary_text });
    const asks = host.asksFor?.(block.composition_id);
    if (asks) row.createDiv({ cls: 'myu-quiet', text: asks });
    const actions = row.createDiv({ cls: 'myu-mirror-actions' });
    const compositionId = block.composition_id;
    // The half-canvas: OPEN it beside the conversation, which is what the
    // webapp does when a journal has a composition. Read-only and stored
    // nowhere — "save to vault ▸" beside it is still the durable form.
    // Offered first because reading it is the common act; saving is the
    // deliberate one (P-CANVAS-1, 2026-08-26).
    const open = actions.createEl('button', { cls: `myu-affordance${asks ? ' myu-cta' : ''}`, text: 'Open canvas' });
    open.onclick = () => host.openCanvas(compositionId);
    if (!host.autoKeep) {
      const save = actions.createEl('button', { cls: 'myu-affordance', text: 'Save to vault' });
      save.onclick = () => host.saveCanvas(compositionId);
    }
    const web = actions.createEl('a', { cls: 'myu-affordance', text: 'View on web', href: `${host.webOrigin}/dashboard` });
    web.setAttr('target', '_blank');
    web.setAttr('rel', 'noopener');
    return;
  }

  // Every other block type the web's registry knows — insight_card, chart,
  // data_table, quick_stats, action_card, question, suggestion, separator,
  // diagram, board_deliberation, plain text — becomes markdown through ONE
  // path and renders through Obsidian. Never a crash, never a silent drop.
  const md = chatBlockMarkdown(block);
  if (!md) return;
  const cls = block.type === 'conversational' ? 'myu-voice myu-chat-block myu-md markdown-rendered' : `myu-claim myu-chat-block myu-md markdown-rendered myu-block-${block.type}`;
  const el = parent.createDiv({ cls });
  void MarkdownRenderer.render(host.app, md, el, '', host.component);
}

function s(v: unknown): string { return typeof v === 'string' ? v.trim() : ''; }
function list(v: unknown): string[] { return Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : s((x as Record<string, unknown>)?.text) || s((x as Record<string, unknown>)?.label))).filter(Boolean) : []; }
function cell(v: unknown): string { return v === null || v === undefined ? '' : String(typeof v === 'object' ? JSON.stringify(v) : v).replace(/\|/g, '\\|').replace(/\n/g, ' '); }

/**
 * A chat block → markdown. Exported and pure so every web block type is
 * pinned. Shapes from packages/shared/src/types/contentBlocks.ts and the
 * board flow (HybridAssistantChatFlow): read, not guessed.
 */
export function chatBlockMarkdown(block: ChatBlock): string | null {
  const b = block as unknown as Record<string, unknown>;
  switch (block.type) {
    case 'conversational':
    case 'text':
      return s(b.text) || null;
    case 'question': {
      const q = s(b.text) || s(b.question);
      const opts = list(b.options);
      return q ? [`> ${q}`, ...(opts.length ? ['', ...opts.map((o) => `- ${o}`)] : [])].join('\n') : null;
    }
    case 'suggestion': {
      const t = s(b.text) || s(b.summary);
      return t ? `\u2192 ${t}` : null;
    }
    case 'insight_card': {
      const title = s(b.title);
      const body = s(b.summary) || s(b.text);
      if (!title && !body) return null;
      return [title ? `**${title}**` : '', body].filter(Boolean).join('\n\n');
    }
    case 'action_card': {
      const title = s(b.title);
      const desc = s(b.description);
      const facts = [s(b.due_date) && `due ${s(b.due_date)}`, s(b.estimated_effort) && `effort: ${s(b.estimated_effort)}`, list(b.related_people).length ? `with ${list(b.related_people).join(', ')}` : ''].filter(Boolean);
      if (!title && !desc && facts.length === 0) return null;
      return [title ? `**${title}**` : '', desc, ...facts.map((f) => `- ${f}`)].filter(Boolean).join('\n');
    }
    case 'data_table': {
      const columns = Array.isArray(b.columns) ? (b.columns as Array<Record<string, unknown>>) : [];
      const rows = Array.isArray(b.rows) ? (b.rows as Array<Record<string, unknown>>) : Array.isArray(b.data) ? (b.data as Array<Record<string, unknown>>) : [];
      if (columns.length === 0 || rows.length === 0) return s(b.title) ? `**${s(b.title)}**` : null;
      const keys = columns.map((c) => s(c.key) || s(c.label));
      const head = `| ${columns.map((c) => s(c.label) || s(c.key)).join(' | ')} |`;
      const sep = `| ${columns.map(() => '---').join(' | ')} |`;
      const body = rows.map((r) => `| ${keys.map((k) => cell(r[k])).join(' | ')} |`);
      return [s(b.title) ? `**${s(b.title)}**\n` : '', head, sep, ...body].filter((x) => x !== '').join('\n');
    }
    case 'quick_stats': {
      const stats = Array.isArray(b.stats) ? (b.stats as Array<Record<string, unknown>>) : [];
      const rows = stats.filter((st) => s(st.label)).map((st) => `- **${s(st.label)}** \u2014 ${cell(st.value)}${s(st.trend_label) ? ` *(${s(st.trend_label)})*` : ''}`);
      if (rows.length === 0) return null;
      return [s(b.title) ? `**${s(b.title)}**\n` : '', ...rows].filter((x) => x !== '').join('\n');
    }
    case 'chart': {
      // ChartBlock: {chart_type, title, subtitle, data: {labels[], datasets[{label, data[]}]}} → a table.
      const data = (b.data ?? {}) as Record<string, unknown>;
      const labels = Array.isArray(data.labels) ? (data.labels as unknown[]) : [];
      const sets = Array.isArray(data.datasets) ? (data.datasets as Array<Record<string, unknown>>) : [];
      const title = [s(b.title) && `**${s(b.title)}**`, s(b.subtitle) && `*${s(b.subtitle)}*`].filter(Boolean).join('\n');
      if (labels.length === 0 || sets.length === 0) return title || null;
      const head = `| ${s(b.x_axis_label) || ''} | ${sets.map((d, i) => s(d.label) || `Series ${i + 1}`).join(' | ')} |`;
      const sep = `| --- | ${sets.map(() => '---').join(' | ')} |`;
      const rows = labels.map((l, i) => `| ${cell(l)} | ${sets.map((d) => cell(Array.isArray(d.data) ? (d.data as unknown[])[i] : '')).join(' | ')} |`);
      return [...(title ? [title, ''] : []), head, sep, ...rows].join('\n');
    }
    case 'diagram': {
      const source = s(b.source) || s(b.mermaid);
      if (!source) return s(b.caption) || s(b.title) || null;
      return [s(b.title) ? `**${s(b.title)}**\n` : '', '```mermaid', source, '```', s(b.caption) ? `\n*${s(b.caption)}*` : ''].filter((x) => x !== '').join('\n');
    }
    case 'separator':
      return s(b.label) ? `---\n*${s(b.label)}*` : '---';
    case 'board_deliberation': {
      // The web's BoardDeliberation: "Your Board Weighs In" → each advisor;
      // synthesis → Points of Agreement / Key Tensions / The bottom line /
      // Suggested Next Steps; then Gut Check. Same headings, same order.
      const advisors = Array.isArray(b.advisors) ? (b.advisors as Array<Record<string, unknown>>) : [];
      const syn = (b.synthesis ?? {}) as Record<string, unknown>;
      const out: string[] = ['### Your Board Weighs In'];
      for (const a of advisors) {
        const who = s(a.advisor_type).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) || 'Advisor';
        const take = s(a.content) || s(a.summary);
        if (take) out.push('', `**${who}**${s(a.to) ? ` \u2192 ${s(a.to)}` : ''}`, '', take);
      }
      const section = (key: string, title: string) => { const items = list(syn[key]); if (items.length) out.push('', `**${title}**`, ...items.map((i) => `- ${i}`)); };
      section('agreements', 'Points of Agreement');
      section('tensions', 'Key Tensions');
      if (s(syn.crux)) out.push('', '**The bottom line**', '', s(syn.crux));
      section('next_steps', 'Suggested Next Steps');
      if (s(b.gut_check)) out.push('', `> [!question] Gut Check\n> ${s(b.gut_check)}`);
      return out.length > 1 ? out.join('\n') : null;
    }
    default: {
      // Unknown to the chat but maybe known to the canvas — the composition
      // renderer covers fifty shapes and has a data-walking floor. K2.
      if (s(b.text)) return s(b.text);
      const { type, id, ...data } = b;
      const md = componentMarkdown({ id: typeof id === 'string' ? id : 'block', type: String(type), data }, 3).trim();
      return md || null;
    }
  }
}

/** Related journal entries under a first reply — the web's "similar entries" list. */
export function renderRelatedEntries(parent: HTMLElement, entries: Array<{ journal_id?: string; content_preview?: string }> | undefined, onOpen: (journalId: string) => void): void {
  const rows = (entries ?? []).filter((e) => typeof e.journal_id === 'string' && e.journal_id);
  if (rows.length === 0) return;
  const box = parent.createDiv({ cls: 'myu-chat-related' });
  box.createDiv({ cls: 'myu-whisper', text: 'Related entries' });
  for (const e of rows) {
    const preview = s(e.content_preview) || e.journal_id!;
    const btn = box.createEl('button', { cls: 'myu-chat-related-row', text: preview.length > 120 ? preview.slice(0, 117) + '\u2026' : preview });
    btn.onclick = () => onOpen(e.journal_id!);
  }
}
