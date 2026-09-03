/**
 * What a reply rating attaches — the web's `feedbackAttachments.ts`
 * (`formatJournalForEmail` / `buildJournalSummary`), shape for shape, so the
 * team's mailbox reads the same whichever client sent it. Built from the
 * turns on screen (already decrypted here); the person sees it named before
 * it goes, and can leave it out.
 */

import type { ChatTurn } from './ChatView';
import { chatBlockMarkdown } from './chatBlocks';

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
  const opening = turns[0]?.role === 'user' ? turnText(turns[0]) : '';
  const rest = turns[0]?.role === 'user' ? turns.slice(1) : turns;
  const lines = ['--- Journal Entry ---', `ID: ${journalId}`, `Timestamp: ${now.toISOString()}`, '', opening || '(empty content)'];
  if (rest.length > 0) {
    lines.push('', '--- Journal Chat ---');
    for (const t of rest) lines.push(`[${t.role === 'myu' ? 'agent' : 'user'}] ${turnText(t)}`);
  }
  const entry = opening.trim() || '(empty entry)';
  const summary = [`Journal entry (${now.toLocaleString()}):`, entry.length > 2000 ? entry.slice(0, 2000) + '\u2026' : entry, '', `${rest.length} chat turn${rest.length === 1 ? '' : 's'} attached in full.${canvases.length ? ` ${canvases.length} canvas${canvases.length === 1 ? '' : 'es'} attached (${canvases.map((c) => c.id).join(', ')}).` : ''}`];
  const parts = [lines.join('\n'), ...canvases.map(formatCompositionAttachment)];
  return { attached_content: parts.join('\n\n'), attached_summary: summary.join('\n') };
}
