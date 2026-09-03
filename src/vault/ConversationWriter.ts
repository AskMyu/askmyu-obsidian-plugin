/**
 * ConversationWriter (P6.3) — a chat thread, saved as a note. Vault module:
 * this file may write, views may not (invariant 3).
 *
 * Never automatic: the per-conversation `save` runs through an exposure modal
 * first, because a saved conversation is Myu's words about people, in a file
 * that syncs beyond anyone's reach — the same R2 calculus as every other write,
 * paid in the same coin: an explicit, informed yes per save.
 *
 * `myu-generated: true` frontmatter keeps the purge handle intact — everything
 * Myu ever wrote stays one search.
 */

import { normalizePath, type App } from 'obsidian';
import type { ChatTurn } from '../views/ChatView';

export type ConversationWriteOutcome =
  | { status: 'written'; path: string }
  | { status: 'nothing_to_write' }
  | { status: 'error'; message: string };

export class ConversationWriter {
  constructor(private app: App) {}

  /** Is this conversation already a note here? (`myu-journal-id` frontmatter — the export skips these.) */
  hasNoteFor(journalId: string): boolean {
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (!file.path.startsWith('Myu/Conversations/')) continue;
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
      if (fm?.['myu-journal-id'] === journalId) return true;
    }
    return false;
  }

  async write(turns: ChatTurn[], opts: { journalId?: string; date?: string } = {}): Promise<ConversationWriteOutcome> {
    const lines = renderConversation(turns);
    if (!lines) return { status: 'nothing_to_write' };
    const date = opts.date ?? new Date().toISOString().slice(0, 10);
    const slug = slugFrom(turns);

    try {
      if (!this.app.vault.getAbstractFileByPath('Myu')) await this.app.vault.createFolder('Myu');
      if (!this.app.vault.getAbstractFileByPath('Myu/Conversations')) {
        await this.app.vault.createFolder('Myu/Conversations');
      }

      let path = normalizePath(`Myu/Conversations/${date} ${slug}.md`);
      for (let i = 2; this.app.vault.getAbstractFileByPath(path); i++) {
        path = normalizePath(`Myu/Conversations/${date} ${slug} ${i}.md`);
      }

      const head = ['---', 'myu-generated: true', ...(opts.journalId ? [`myu-journal-id: ${opts.journalId}`] : []), `date: ${date}`, '---'];
      await this.app.vault.create(path, [...head, '', lines, ''].join('\n'));
      return { status: 'written', path };
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) };
    }
  }
}

/** Speakers as `**You:** / **Myu:**`; blocks flattened to their text. Exported for tests. */
export function renderConversation(turns: ChatTurn[]): string | null {
  const parts: string[] = [];
  for (const turn of turns) {
    const text =
      turn.text ??
      (turn.blocks ?? [])
        .map((b) => (b.text ?? (b.type === 'composition_offer' ? offerLine(b.composition_id, b.summary_text) : '')))
        .filter(Boolean)
        .join('\n\n');
    if (!text) continue;
    parts.push(`**${turn.role === 'user' ? 'You' : 'Myu'}:** ${text}`);
    if (turn.references?.length) {
      parts.push(turn.references.map((r) => `> [${r.id}] ${r.url ? `[${r.title || r.url}](${r.url})` : (r.title ?? 'source')}`).join('\n'));
    }
  }
  return parts.length ? parts.join('\n\n') : null;
}

/**
 * A canvas offer, in the note. Links into the vault's own canvas pane by deep
 * link — the first version wrote "on the web", a browser exit printed into
 * the user's vault, with an empty summary rendering as `offered:  —`
 * (operator's saved note, 2026-08-28).
 */
function offerLine(compositionId: string | undefined, summary: string | undefined): string {
  const what = summary?.trim() ? `a canvas: \u201c${summary.trim()}\u201d` : 'a canvas';
  const link = compositionId ? ` \u2014 [open it \u25b8](obsidian://myu-canvas?id=${encodeURIComponent(compositionId)})` : '';
  return `*(Myu offered ${what}${link})*`;
}

function slugFrom(turns: ChatTurn[]): string {
  const first = turns.find((t) => t.role === 'user')?.text ?? 'conversation';
  return (
    first
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .trim()
      .split(/\s+/)
      .slice(0, 6)
      .join(' ') || 'conversation'
  );
}
