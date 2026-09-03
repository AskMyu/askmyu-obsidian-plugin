/**
 * Conversations, loaded and decrypted — the one place that knows the wire
 * shape of a journal thread. The chat pane's browser and the export-everything
 * action both read through here (K2: one engine, one path).
 */

import type { AskMyuApi } from './transport/api';
import { parseChatTurn } from './transport/api';
import { decryptWithKey } from './crypto/primitives';
import { parseWhen, firstPresent } from './vault/myuFiles';
import type { ChatTurn } from './views/ChatView';

export interface ConversationDeps {
  backend: Pick<AskMyuApi, 'getJournalEntries' | 'getJournalChats'>;
  key: CryptoKey | null;
  accountId: string | null;
}

export interface ConversationHead { journalId: string; day: string; preview: string }

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
    if (text === null || !text.trim()) continue;
    out.push({ journalId, day: created ? created.toISOString().slice(0, 10) : '', preview: text.trim().slice(0, 90) });
  }
  out.sort((a, b) => b.day.localeCompare(a.day));
  return out;
}

/** One conversation as turns: the opening entry (if given) plus every stored chat, decrypted. */
export async function loadConversation(deps: ConversationDeps, journalId: string, opening?: { day: string; preview: string }, onOffer?: (offer: import('./transport/api').DeliveredOffer) => void): Promise<ChatTurn[]> {
  const turns: ChatTurn[] = [];
  if (opening) turns.push({ role: 'user', text: `(${opening.day}) ${opening.preview}` });
  const res = await deps.backend.getJournalChats(journalId);
  // The trust-ladder ask still live here — re-served so a reopen restores it.
  if (onOffer && res.data?.offer) onOffer(res.data.offer);
  const chats = Array.isArray(res.data?.chats) ? res.data.chats : [];
  for (const chat of chats) {
    const content = await readText(chat.encrypted_content, chat.content, deps.key);
    if (content === null || !content.trim()) continue;
    // Myu's replies are the blocks envelope; the user's turns are plain.
    const parsed = parseChatTurn({ content });
    if (parsed.blocks.length > 0 && content.trim().startsWith('{')) {
      turns.push({ role: 'myu', blocks: parsed.blocks, references: parsed.references });
    } else {
      turns.push({ role: 'user', text: content });
    }
  }
  return turns;
}
