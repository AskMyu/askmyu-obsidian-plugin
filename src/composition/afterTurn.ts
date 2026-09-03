/**
 * What a chat reply's canvas side means for the canvas pane — the web's
 * `handleDualModeResponse`, mutation branch, transcribed (2026-08-29: "this is
 * the match-the-webapp feature we keep chasing").
 *
 * Every reply from `/journal_chats/add` carries `canvas: { response_type:
 * "mutation", surface_mutations, composition_id, summary_text,
 * narrative_context }`. The web resolves the target the same way, in the same
 * order: `narrative_context.continues_composition_id`, then the canvas it has
 * open, then `canvas.composition_id`. Then:
 *  - target is the open canvas → apply the mutations in place;
 *  - target is a different canvas → show it (a new one replaces the last);
 *  - no canvas open but the thread's canvas changed → say so in the thread
 *    (an offer row), never force a pane open on every turn.
 */

import type { SurfaceMutationLite } from '../wire';

export interface CanvasReply {
  composition_id?: string;
  surface_mutations?: SurfaceMutationLite[];
  summary_text?: string;
  /** `narrative_context.continues_composition_id`, lifted. */
  continues_composition_id?: string;
}

export type CanvasStep =
  /** `nextId`: the reply carried a different id for the same canvas — adopt it, as the web's store moves `activeCompositionId`. */
  | { kind: 'apply'; compositionId: string; mutations: SurfaceMutationLite[]; nextId?: string }
  | { kind: 'open'; compositionId: string }
  | { kind: 'offer'; compositionId: string; summaryText: string }
  | { kind: 'none' };

export function canvasAfterTurn(canvas: CanvasReply | undefined, openId: string | null): CanvasStep {
  if (!canvas) return { kind: 'none' };
  const mutations = Array.isArray(canvas.surface_mutations) ? canvas.surface_mutations : [];
  const target = canvas.continues_composition_id || openId || canvas.composition_id || '';
  if (!target) return { kind: 'none' };
  if (openId) {
    // narrative_context names a canvas this pane does not show → show that one.
    if (target !== openId) return { kind: 'open', compositionId: target };
    // The reply's own id can differ from the one we named (a new version of
    // the thread's canvas): the web applies to the active one, then makes the
    // new id active. So do we — without a refetch, the mutations ARE the diff.
    const nextId = canvas.composition_id && canvas.composition_id !== openId ? canvas.composition_id : undefined;
    if (mutations.length) return { kind: 'apply', compositionId: target, mutations, ...(nextId ? { nextId } : {}) };
    return nextId ? { kind: 'open', compositionId: nextId } : { kind: 'none' };
  }
  if (!mutations.length) return { kind: 'none' };
  return { kind: 'offer', compositionId: canvas.composition_id || target, summaryText: canvas.summary_text?.trim() || '' };
}
