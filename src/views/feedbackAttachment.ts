/**
 * What a reply rating attaches — the web's `feedbackAttachments.ts`
 * (`formatJournalForEmail` / `buildJournalSummary`), shape for shape, so the
 * team's mailbox reads the same whichever client sent it. Built from the
 * turns on screen (already decrypted here); the person sees it named before
 * it goes, and can leave it out.
 *
 * conversation.txt is written by the formatter every client uses (pasted text,
 * 2026-10-06; the plugin's copy, `feedbackTranscript.ts`): each turn under a
 * header with its time, which the readers need to see a turn at all, and a
 * turn's pasted text as labelled, indented blocks.
 */

import type { ChatTurn } from './ChatView';
import { chatBlockMarkdown } from './chatBlocks';
import { formatConversationTranscript } from '../feedbackTranscript';

function turnText(turn: ChatTurn): string {
  if (turn.text) return turn.text;
  return (turn.blocks ?? []).map((b) => chatBlockMarkdown(b)).filter(Boolean).join('\n\n');
}

export interface AttachedCanvas { id: string; spec: unknown; source: string }

const COMPOSITION_JSON_CAP = 100_000;

/** The web's `formatCompositionForEmail`: the spec as JSON, capped per canvas. */
export function formatCompositionAttachment(canvas: AttachedCanvas): string {
  const lines = [`--- Canvas Composition (${canvas.source}) ---`, `ID: ${canvas.id}`];
  try {
    const json = JSON.stringify(canvas.spec, null, 2);
    lines.push(json.length > COMPOSITION_JSON_CAP ? json.slice(0, COMPOSITION_JSON_CAP) + '\n... [truncated]' : json);
  } catch { lines.push('(could not serialize composition)'); }
  return lines.join('\n');
}

export function formatConversationAttachment(turns: ChatTurn[], journalId: string, now = new Date(), canvases: AttachedCanvas[] = []): { attached_content: string; attached_summary: string } {
  const first = turns[0]?.role === 'user' ? turns[0] : null;
  const opening = first ? turnText(first) : '';
  const rest = first ? turns.slice(1) : turns;
  // A turn's time when it is known, else the attachment's. Pasted text is the person's turn's (`pasted`), never
  // `blocks`, which are Myu's content.
  const ts = (turn: ChatTurn | null): string => turn?.at || now.toISOString();
  const transcript = formatConversationTranscript({
    entry: { id: journalId, ts: ts(first), typed: opening, ...(first?.pasted?.length ? { blocks: first.pasted } : {}) },
    chats: rest.map((t) => ({ chatter: t.role === 'myu' ? 'agent' : 'user', ts: ts(t), typed: turnText(t), ...(t.role === 'user' && t.pasted?.length ? { blocks: t.pasted } : {}) })),
  });
  const entry = opening.trim() || '(empty entry)';
  const summary = [`Journal entry (${now.toLocaleString()}):`, entry.length > 2000 ? entry.slice(0, 2000) + '\u2026' : entry, '', `${rest.length} chat turn${rest.length === 1 ? '' : 's'} attached in full.${canvases.length ? ` ${canvases.length} canvas${canvases.length === 1 ? '' : 'es'} attached (${canvases.map((c) => c.id).join(', ')}).` : ''}`];
  const parts = [transcript, ...canvases.map(formatCompositionAttachment)];
  return { attached_content: parts.join('\n\n'), attached_summary: summary.join('\n') };
}
