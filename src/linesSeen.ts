/**
 * "Seen" (2026-10-06; BRIEF_WEB_DEBRIEF_DRAFTS_20261006 §1): a line is reported as seen the first time it has been on
 * screen for a second (`POST /myu/lines/seen {line_ids}`). A drafted interview debrief sends a few minutes after its
 * hiring manager has seen its line, so every surface says when a line was seen. What comes into view together goes in
 * one report; each line is reported once per session; a report that fails leaves its lines to be reported again the
 * next time they are in view. A push notification is not seeing it. Obsidian mirrors this file (its test holds the
 * copy); the terminal reports what it prints, with no wait.
 *
 * One exception to "once": the server makes a line unseen again when it is put off ("Not now"), under the same id
 * (`LineStore.markSeen`), so a line put off must be reported again when it comes back, or its draft would never send by
 * itself. A line answered here is forgotten (`forget`), and a line reported long ago (`LINE_SEEN_AGAIN_AFTER_MS`, for a
 * line put off on another device) is reported again the next time it is in view. The server ignores a repeat.
 */

/** How long a line is in view before it counts as seen. */
export const LINE_SEEN_AFTER_MS = 1000;
/** How long the lines that became seen wait for others, to go in one report. */
export const LINE_SEEN_BATCH_MS = 250;
/** How long a report stands: after this, a line in view again is reported again (it may have been put off elsewhere). */
export const LINE_SEEN_AGAIN_AFTER_MS = 6 * 60 * 60 * 1000;

/** `POST /myu/lines/seen` → the ids recorded now (the server ignores the ones already seen). */
export interface LinesSeenResponse {
  success?: boolean;
  seen?: string[];
}

export interface SeenReporterDeps {
  /** Sends the report; a rejection puts its lines back, to be reported the next time they are in view. */
  send: (lineIds: string[]) => Promise<unknown>;
  afterMs?: number;
  batchMs?: number;
  againAfterMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (timer: unknown) => void;
  now?: () => number;
}

export interface SeenReporter {
  /** The line came into view: after a second there, it is seen. */
  inView(lineId: string): void;
  /** The line left the view (scrolled away, its page closed, the window hidden): the second starts again next time. */
  outOfView(lineId: string): void;
  /** Everything in view left it (the window hidden, the surface closed). */
  allOutOfView(): void;
  /** The line was answered here (it may have been put off): if it shows again, it is reported again. */
  forget(lineId: string): void;
  /** Another account, or signed out: nothing is remembered. */
  reset(): void;
}

// The host's own timers, for a surface that hands none in (Obsidian hands in its window's).
const hostSetTimer: (fn: () => void, ms: number) => unknown = setTimeout;
const hostClearTimer = clearTimeout as (timer: unknown) => void;

export function createSeenReporter(deps: SeenReporterDeps): SeenReporter {
  const afterMs = deps.afterMs ?? LINE_SEEN_AFTER_MS;
  const batchMs = deps.batchMs ?? LINE_SEEN_BATCH_MS;
  const setTimer = deps.setTimer ?? hostSetTimer;
  const clearTimer = deps.clearTimer ?? hostClearTimer;
  const againAfterMs = deps.againAfterMs ?? LINE_SEEN_AGAIN_AFTER_MS;
  const now = deps.now ?? (() => Date.now());
  /** Reported, or on its way: the line, and when. */
  const done = new Map<string, number>();
  /** In view, its second not up yet. */
  const waiting = new Map<string, unknown>();
  let queue: string[] = [];
  let flushTimer: unknown = null;

  const flush = () => {
    flushTimer = null;
    const ids = queue;
    queue = [];
    if (!ids.length) return;
    Promise.resolve()
      .then(() => deps.send(ids))
      .catch(() => {
        for (const id of ids) done.delete(id);
      });
  };

  return {
    inView(lineId) {
      if (!lineId || waiting.has(lineId)) return;
      const reported = done.get(lineId);
      if (reported !== undefined && now() - reported < againAfterMs) return;
      waiting.set(
        lineId,
        setTimer(() => {
          waiting.delete(lineId);
          done.set(lineId, now());
          queue.push(lineId);
          if (flushTimer === null) flushTimer = setTimer(flush, batchMs);
        }, afterMs),
      );
    },
    outOfView(lineId) {
      const timer = waiting.get(lineId);
      if (timer === undefined) return;
      clearTimer(timer);
      waiting.delete(lineId);
    },
    allOutOfView() {
      for (const timer of waiting.values()) clearTimer(timer);
      waiting.clear();
    },
    forget(lineId) {
      done.delete(lineId);
    },
    reset() {
      for (const timer of waiting.values()) clearTimer(timer);
      waiting.clear();
      if (flushTimer !== null) clearTimer(flushTimer);
      flushTimer = null;
      queue = [];
      done.clear();
    },
  };
}
