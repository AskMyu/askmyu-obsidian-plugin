/**
 * "Seen" in the vault (2026-10-06; BRIEF_WEB_DEBRIEF_DRAFTS_20261006 §1). A line is reported as seen
 * (`POST /myu/lines/seen`) the first time its words have been in view for a second: a row's line in the Today pane, the
 * question a chat opened on, the one ask of a space's, a meeting's or a line's own conversation, the questions on a
 * meeting's card. A drafted interview debrief sends a few minutes after its hiring manager has seen its line, so the
 * server needs to know.
 *
 * One watcher for the plugin. Each of those panes hands in its content when it opens (`watch`) and takes it back when
 * it closes (`unwatch`); every element in it that carries a line's id (`data-line-id`) is watched, through every
 * redraw. In view = at least half of it showing in the window, which a row scrolled away, a tab behind another, a
 * collapsed sidebar and a closed drawer are not, in a window that is not hidden. The timing, the batching and "once
 * per session" are the reporter's (`linesSeen.ts`, shared's copy). A notice, a note written in Myu's folder and a read
 * in the background are not seeing it: only words drawn in a pane are watched.
 *
 * One exception to "once", the reporter's too: the server makes a line unseen again when it is put off ("Not now"),
 * under the same id, so a line answered here is forgotten (`forgetAnswered`, on the one door every surface answers
 * through) and is reported again when it comes back into view.
 *
 * No host API here: `rowInView` and `LinesInView` are plain logic, and `SeenWatcher` takes the browser's observers,
 * the timers and the clock (a test hands in its own).
 */

import { createSeenReporter, type SeenReporter } from './linesSeen';
import type { AskMyuApi } from './transport/api';

/** The attribute a pane puts on the element that draws a line's words. */
export const LINE_ID_ATTR = 'data-line-id';

/** The same, as what a pane spreads into an element's `attr`. */
export function lineIdAttr(lineId: string): Record<string, string> {
  return { [LINE_ID_ATTR]: lineId };
}

const SELECTOR = `[${LINE_ID_ATTR}]`;

/** How much of an element is showing, as the browser reports it (an IntersectionObserverEntry's fields). */
export interface SeenEntry {
  isIntersecting: boolean;
  intersectionRatio: number;
  intersectionRect: { height: number };
  /** The window's own box; null when the browser does not say. */
  rootBounds: { height: number } | null;
}

/** In view: at least half of the element is showing, or it fills at least half of the window (words taller than it). */
export function rowInView(e: SeenEntry): boolean {
  if (!e.isIntersecting) return false;
  if (e.intersectionRatio >= 0.5) return true;
  return !!e.rootBounds && e.rootBounds.height > 0 && e.intersectionRect.height >= e.rootBounds.height * 0.5;
}

/**
 * The lines in view now, across the plugin's panes. A line is in view while some element showing it is, in a pane
 * whose window is not hidden (a line can be on Today's row and in its conversation at once); the reporter is told
 * when that starts and when it stops.
 */
export class LinesInView {
  /** The elements in view, each with the line it carries and the pane it is in. */
  private showing = new Map<object, { id: string; pane: object }>();
  /** The panes whose window is hidden. */
  private hidden = new Set<object>();

  constructor(private reporter: Pick<SeenReporter, 'inView' | 'outOfView'>) {}

  /** The element is in view, carrying this line. */
  show(pane: object, el: object, id: string): void {
    const was = this.showing.get(el);
    if (was && was.id === id && was.pane === pane) return;
    this.showing.set(el, { id, pane });
    // An element drawn again for another line: the line it carried before left with it.
    if (was && was.id !== id) this.settle(was.id);
    this.settle(id);
  }

  /** The element left the view: scrolled away, its tab behind another, redrawn, gone. */
  hide(el: object): void {
    const was = this.showing.get(el);
    if (!was) return;
    this.showing.delete(el);
    this.settle(was.id);
  }

  /** A pane's window was hidden, or came back: hidden, nothing in it is in view; back, the second starts again. */
  windowHidden(pane: object, hidden: boolean): void {
    if (hidden === this.hidden.has(pane)) return;
    if (hidden) this.hidden.add(pane);
    else this.hidden.delete(pane);
    for (const id of this.linesIn(pane)) this.settle(id);
  }

  /** A pane closed: nothing in it is in view. */
  close(pane: object): void {
    const ids = this.linesIn(pane);
    for (const [el, s] of this.showing) if (s.pane === pane) this.showing.delete(el);
    this.hidden.delete(pane);
    for (const id of ids) this.settle(id);
  }

  private linesIn(pane: object): Set<string> {
    const ids = new Set<string>();
    for (const s of this.showing.values()) if (s.pane === pane) ids.add(s.id);
    return ids;
  }

  /** Tell the reporter where the line stands now (it ignores what it already knows). */
  private settle(id: string): void {
    for (const s of this.showing.values()) {
      if (s.id === id && !this.hidden.has(s.pane)) {
        this.reporter.inView(id);
        return;
      }
    }
    this.reporter.outOfView(id);
  }
}

/** A watched element as the browser reports it. */
export interface SeenViewEntry extends SeenEntry {
  target: Element;
}

/** A redraw as the browser reports it (a MutationRecord's fields). */
export interface SeenDrawRecord {
  type: string;
  target: Node;
  addedNodes: ArrayLike<Node>;
  removedNodes: ArrayLike<Node>;
}

/** The browser's two observers, as the watcher uses them. */
export interface SeenObservers {
  /** How much of each observed element is showing in the window (an IntersectionObserver with no root). */
  view(report: (entries: SeenViewEntry[]) => void): { observe(el: Element): void; unobserve(el: Element): void; disconnect(): void };
  /** What is drawn and taken away under a pane, and a line's id put on an element already there (a MutationObserver). */
  draws(pane: HTMLElement, report: (records: SeenDrawRecord[]) => void): { disconnect(): void };
}

/** A report for every tenth of an element that comes into the window: words taller than the window never show half of themselves. */
const VIEW_STEPS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];

/** The browser's own observers; null where it has none (nothing is watched, and nothing else changes). */
function browserObservers(): SeenObservers | null {
  if (typeof IntersectionObserver === 'undefined' || typeof MutationObserver === 'undefined') return null;
  return {
    view: (report) => new IntersectionObserver((entries) => report(entries), { threshold: VIEW_STEPS }),
    draws: (pane, report) => {
      const mo = new MutationObserver((records) => report(records));
      mo.observe(pane, { childList: true, subtree: true, attributes: true, attributeFilter: [LINE_ID_ATTR] });
      return mo;
    },
  };
}

export interface SeenTimers {
  set: (fn: () => void, ms: number) => number;
  clear: (id: number) => void;
}

export interface SeenWatcherDeps {
  /** Sends the report. A rejection leaves its lines to be reported the next time they are in view; nothing is shown. */
  send: (lineIds: string[]) => Promise<unknown>;
  timers?: SeenTimers;
  /** The clock (ms), for how long ago a line was reported; a test hands in its own. */
  now?: () => number;
  /** The observers; a test hands in its own. Null: there are none. */
  observers?: SeenObservers | null;
}

/**
 * Every answer to a line goes through the backend's one door (`answerMyuLine`): once it was sent, whatever it was and
 * however it went, the line is forgotten. So a line put off ("Not now") is reported again when it comes back.
 */
export function forgetAnswered(backend: Pick<AskMyuApi, 'answerMyuLine'>, forget: (lineId: string) => void): void {
  const answer = backend.answerMyuLine.bind(backend);
  backend.answerMyuLine = async (lineId, body) => {
    try {
      return await answer(lineId, body);
    } finally {
      forget(lineId);
    }
  };
}

const idOf = (el: Element): string => el.getAttribute(LINE_ID_ATTR) ?? '';

/** Every element under a drawn (or removed) node that carries a line's id, the node itself among them. */
function eachLineEl(node: Node, fn: (el: Element) => void): void {
  if (node.nodeType !== 1) return;
  const el = node as Element;
  if (el.matches(SELECTOR)) fn(el);
  el.querySelectorAll(SELECTOR).forEach(fn);
}

/** The plugin's one watcher: the panes it watches, the lines in view in them, and the reporter behind them. */
export class SeenWatcher {
  private reporter: SeenReporter;
  private lines: LinesInView;
  private observers: SeenObservers | null;
  /** Each watched pane's way to stop watching it. */
  private panes = new Map<HTMLElement, () => void>();

  constructor(deps: SeenWatcherDeps) {
    const timers = deps.timers ?? { set: (fn, ms) => window.setTimeout(fn, ms), clear: (id) => window.clearTimeout(id) };
    this.reporter = createSeenReporter({
      send: deps.send,
      setTimer: (fn, ms) => timers.set(fn, ms),
      clearTimer: (timer) => timers.clear(timer as number),
      ...(deps.now ? { now: deps.now } : {}),
    });
    this.lines = new LinesInView(this.reporter);
    this.observers = deps.observers !== undefined ? deps.observers : browserObservers();
  }

  /** A pane opened: the lines drawn in it are watched from now on, through every redraw. */
  watch(pane: HTMLElement): void {
    this.unwatch(pane);
    const observers = this.observers;
    if (!observers) return;
    const view = observers.view((entries) => {
      for (const e of entries) {
        // A report that was on its way when its row was redrawn says nothing about the row that replaced it.
        const id = e.target.isConnected === false ? '' : idOf(e.target);
        if (id && rowInView(e)) this.lines.show(pane, e.target, id);
        else this.lines.hide(e.target);
      }
    });
    const found = (el: Element): void => view.observe(el);
    const gone = (el: Element): void => {
      view.unobserve(el);
      this.lines.hide(el);
    };
    const draws = observers.draws(pane, (records) => {
      for (const r of records) {
        if (r.type === 'attributes') {
          // An element drawn again for another line: it is looked at afresh.
          const el = r.target as Element;
          gone(el);
          if (idOf(el)) found(el);
          continue;
        }
        Array.from(r.removedNodes).forEach((n) => eachLineEl(n, gone));
        Array.from(r.addedNodes).forEach((n) => eachLineEl(n, found));
      }
    });
    pane.querySelectorAll(SELECTOR).forEach(found);

    // A hidden window shows nothing; back in front, what is in view starts its second again.
    const doc = pane.doc;
    const windowChanged = (): void => this.lines.windowHidden(pane, doc.visibilityState === 'hidden');
    doc.addEventListener('visibilitychange', windowChanged);
    windowChanged();
    // The pane moved to another window: it is that window's being hidden that counts now.
    const stopMigrated = pane.onWindowMigrated?.(() => this.watch(pane));

    this.panes.set(pane, () => {
      stopMigrated?.();
      doc.removeEventListener('visibilitychange', windowChanged);
      draws.disconnect();
      view.disconnect();
      this.lines.close(pane);
    });
  }

  /** A pane closed: nothing in it is in view any more. */
  unwatch(pane: HTMLElement): void {
    const stop = this.panes.get(pane);
    if (!stop) return;
    this.panes.delete(pane);
    stop();
  }

  /** The line was answered here (it may have been put off): if it shows again, it is reported again. */
  forget(lineId: string): void {
    this.reporter.forget(lineId);
  }

  /** Signed out or locked: nothing is remembered. What is in view is reported again once it has been drawn again. */
  reset(): void {
    this.reporter.reset();
  }

  /** The plugin is going: no pane is watched, and no report is left waiting. */
  stop(): void {
    for (const pane of [...this.panes.keys()]) this.unwatch(pane);
    this.reporter.reset();
  }
}
