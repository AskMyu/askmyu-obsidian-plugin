/**
 * A canvas Myu made for you while you were elsewhere — the web's
 * `pendingOffers` strip (summary + action label ▸ + ✕), decided purely.
 *
 * Two events say it: `composition_offer` (background producers; `announce`
 * true only for genuinely proactive ones, which the web also toasts) and
 * `composition_ready`. On the web BOTH only become an offer. The plugin keeps
 * the operator's rule for `ready` when a pane is open — it replaces what the
 * pane shows — and otherwise treats both as an offer: a row in the open
 * conversation, a row in Today, and a Notice only when `announce` is set.
 * Nothing opens itself.
 */

export interface CanvasOffer {
  compositionId: string;
  summaryText: string;
  actionLabel: string;
  subjectName?: string;
  flowType?: string;
  receivedAt: number;
}

export type OfferStep =
  | { kind: 'replace'; compositionId: string; summaryText?: string }
  | { kind: 'offer'; offer: CanvasOffer; announce: boolean }
  | { kind: 'none' };

function str(v: unknown): string { return typeof v === 'string' ? v.trim() : ''; }

export function offerFromPayload(payload: Record<string, unknown>, now: number): CanvasOffer | null {
  const compositionId = str(payload.composition_id);
  if (!compositionId) return null;
  return {
    compositionId,
    summaryText: str(payload.summary_text),
    actionLabel: str(payload.action_label) || 'View',
    subjectName: str(payload.subject_name) || undefined,
    flowType: str(payload.flow_type) || undefined,
    receivedAt: now,
  };
}

/**
 * Where a new canvas goes.
 *
 * An OPEN, UNPINNED pane follows the newest canvas — the idiom Obsidian's own
 * context panes use ("the backlinks tab … updates when you switch to a
 * different note", with a *linked* tab when you want one held still). Before
 * 2026-09-01 only `composition_ready` could take the pane, and an `offer`
 * never did, so the newest canvas was reachable only through the "Past
 * canvases…" list — the operator was clicking through history to reach the
 * present.
 *
 * A PINNED pane never changes underneath you; the canvas still lands as an
 * offer row, so nothing is lost.
 */
export function routeOffer(
  source: 'ready' | 'offer',
  payload: Record<string, unknown>,
  openPaneId: string | null,
  now: number,
  paneFollows = true,
): OfferStep {
  const offer = offerFromPayload(payload, now);
  if (!offer) return { kind: 'none' };
  if (openPaneId === offer.compositionId) return { kind: 'none' };
  if (openPaneId && paneFollows) return { kind: 'replace', compositionId: offer.compositionId, summaryText: offer.summaryText };
  return { kind: 'offer', offer, announce: source === 'offer' && payload.announce === true };
}

/** The pending list, the web's way: newest first, one per id, ten deep. */
export function addOffer(list: CanvasOffer[], offer: CanvasOffer): CanvasOffer[] {
  return [offer, ...list.filter((o) => o.compositionId !== offer.compositionId)].slice(0, 10);
}
