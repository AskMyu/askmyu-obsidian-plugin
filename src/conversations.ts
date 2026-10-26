/**
 * Conversations, loaded and decrypted — the one place that knows the wire
 * shape of a journal thread. The chat pane's browser and the export-everything
 * action both read through here (K2: one engine, one path).
 *
 * Pasted text (2026-10-06) comes back beside a turn's typed words as
 * `pasted_blocks` (opened by the server; absent when it cannot be). A turn with
 * only pasted text is still a turn.
 */

import type { AskMyuApi } from './transport/api';
import { parseChatTurn } from './transport/api';
import { decryptWithKey } from './crypto/primitives';
import { parseWhen, firstPresent } from './vault/myuFiles';
import type { ChatTurn } from './views/ChatView';
import type { PastedBlockWire } from './wire';
import { cardLabel, readPastedBlocks } from './pastedText';

export interface ConversationDeps {
  backend: Pick<AskMyuApi, 'getJournalEntries' | 'getJournalChats'>;
  key: CryptoKey | null;
  accountId: string | null;
}

export interface ConversationHead {
  journalId: string;
  day: string;
  /** The typed words' start, or — with none — the first pasted block's label. */
  preview: string;
  /** The entry's pasted text (2026-10-06). */
  pasted?: PastedBlockWire[];
}

/** A row's preview: its typed words, else its first block's label. */
function previewOf(typed: string, pasted: readonly PastedBlockWire[]): string {
  const words = typed.trim();
  if (words) return words.slice(0, 90);
  return pasted[0] ? cardLabel(pasted[0]) : '';
}

async function readText(enc: unknown, plain: unknown, key: CryptoKey | null): Promise<string | null> {
  if (typeof enc === 'string' && enc && key) {
    try { return await decryptWithKey(enc, key); } catch { return null; }
  }
  return typeof plain === 'string' ? plain : '';
}

/** Every conversation the account has, newest first, with a decrypted preview. */
export async function listConversations(deps: ConversationDeps): Promise<ConversationHead[]> {
  if (!deps.accountId) return [];
  const res = await deps.backend.getJournalEntries(deps.accountId, 0, Date.now());
  const entries = Array.isArray(res.data?.entries) ? res.data.entries : [];
  const out: ConversationHead[] = [];
  for (const entry of entries) {
    const journalId = String(entry.journal_id ?? entry.id ?? '');
    if (!journalId) continue;
    const created = parseWhen(firstPresent(entry.timestamp, entry.occurred_at, entry.created_at, entry.created));
    const text = await readText(entry.encrypted_content, entry.content, deps.key);
    if (text === null) continue;
    // A paste-only entry is kept: its preview is its first block's label.
    const pasted = readPastedBlocks(entry.pasted_blocks);
    if (!text.trim() && pasted.length === 0) continue;
    out.push({ journalId, day: created ? created.toISOString().slice(0, 10) : '', preview: previewOf(text, pasted), ...(pasted.length ? { pasted } : {}) });
  }
  out.sort((a, b) => b.day.localeCompare(a.day));
  return out;
}

/**
 * One conversation as turns: the opening entry (if given) plus every stored chat, decrypted. The opening carries the
 * entry's pasted text; with no typed words its text is the day alone.
 */
export async function loadConversation(deps: ConversationDeps, journalId: string, opening?: { day: string; preview: string; pasted?: PastedBlockWire[] }, onOffer?: (offer: import('./transport/api').DeliveredOffer) => void): Promise<ChatTurn[]> {
  const turns: ChatTurn[] = [];
  if (opening) {
    const pasted = opening.pasted ?? [];
    // The preview of an entry with no typed words is its first block's label, which the card shows already.
    const typed = pasted.length > 0 && opening.preview === previewOf('', pasted) ? '' : opening.preview;
    turns.push({ role: 'user', text: typed ? `(${opening.day}) ${typed}` : `(${opening.day})`, ...(pasted.length ? { pasted } : {}) });
  }
  const res = await deps.backend.getJournalChats(journalId);
  // The trust-ladder ask still live here — re-served so a reopen restores it.
  if (onOffer && res.data?.offer) onOffer(res.data.offer);
  const chats = Array.isArray(res.data?.chats) ? res.data.chats : [];
  for (const chat of chats) {
    const content = await readText(chat.encrypted_content, chat.content, deps.key);
    if (content === null) continue;
    const pasted = readPastedBlocks(chat.pasted_blocks);
    if (!content.trim() && pasted.length === 0) continue;
    // Myu's replies are the blocks envelope; the user's turns are plain, with their pasted text beside them.
    const parsed = parseChatTurn({ content });
    if (parsed.blocks.length > 0 && content.trim().startsWith('{')) {
      turns.push({ role: 'myu', blocks: parsed.blocks, references: parsed.references });
    } else {
      const at = parseWhen(chat.timestamp);
      turns.push({ role: 'user', text: content, ...(pasted.length ? { pasted } : {}), ...(at ? { at: at.toISOString() } : {}) });
    }
  }
  return turns;
}
