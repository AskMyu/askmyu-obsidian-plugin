/**
 * The menu's marks in the vault (2026-10-06). The server counts, for each of Myu's places (Today, people, calendar,
 * spaces, conversations, canvas), what came in since the person last opened it ("new") and Myu's questions there still
 * waiting for an answer ("waiting"). "Opened" is kept on the account, so every device sees the same.
 *
 * The plugin has no menu, so the status bar carries the mark that matters (the operator: "the most important thing is
 * the new indicator"): "myu · 3 new in Today · 2 in Spaces", lit in the theme's warning colour. The waiting counts
 * only go in its tooltip, where there is room. Obsidian on a phone has no status bar: there the same lit words open
 * the Today pane. A place brought forward here tells the server it was opened: the Today pane (home), a space's
 * conversation (spaces), the chat pane on anything else, the list of past conversations among them (conversations),
 * the canvas pane, a card (people), a meeting's card (calendar). Something that arrives while a place is in front
 * stays new until that place is brought forward again (the operator's decision 4).
 *
 * The dots beside the Today pane's rows follow the same two meanings (2026-10-06, the operator's rule: orange is always
 * new). A row is lit while something came in for it since Today was opened before this visit, and grey while a question
 * there waits for an answer. The keeper holds what "before this visit" was (`since`): opening a place stamps it to now,
 * so the stamp it had before is kept for the visit.
 *
 * Until the server has the door (404) nothing changes: the status bar says what it always said, nothing is sent when a
 * place opens, and no row is lit (a question that waits is still grey). No host API here: the plugin hands in the
 * doors, the repaint and the timers.
 */

import { MENU_ITEM_KEYS, createVisitSince, menuMarkWords, readMenuMarks, withOpened, type MenuItemKey, type MenuMarks } from './menuMarks';

/** Each place in the plugin's own words (the phone's): the web's Home is the Today pane here. */
export const MENU_PLACE_WORDS: Record<MenuItemKey, string> = {
  home: 'Today',
  people: 'People',
  calendar: 'Calendar',
  spaces: 'Spaces',
  conversations: 'Conversations',
  canvas: 'Canvas',
};

/** More places than this with something new: one count and how many places ("9 new in 4 places"). */
const NAMED_PLACES = 2;

/**
 * The status bar's words. `lit`: what is new, place by place ("3 new in Today · 2 in Spaces"), or in one count when
 * more than two places have something; null when nothing is new. `tooltip`: every place with something new or
 * waiting, one per line ("Today: 3 new, 2 waiting for your answer"); null when there is none.
 */
export function statusBarMarks(marks: MenuMarks | null): { lit: string | null; tooltip: string | null } {
  if (!marks) return { lit: null, tooltip: null };
  const newIn = (key: MenuItemKey) => marks.marks[key]?.new ?? 0;
  const fresh = MENU_ITEM_KEYS.filter((key) => newIn(key) > 0);
  let lit: string | null = null;
  if (fresh.length > NAMED_PLACES) {
    const total = fresh.reduce((sum, key) => sum + newIn(key), 0);
    lit = `${total} new in ${fresh.length} places`;
  } else if (fresh.length > 0) {
    lit = fresh.map((key, i) => `${newIn(key)} ${i === 0 ? 'new in' : 'in'} ${MENU_PLACE_WORDS[key]}`).join(' · ');
  }
  const lines = MENU_ITEM_KEYS.map((key) => {
    const words = menuMarkWords(marks.marks[key]);
    return words ? `${MENU_PLACE_WORDS[key]}: ${words}` : '';
  }).filter(Boolean);
  return { lit, tooltip: lines.length ? lines.join('\n') : null };
}

/**
 * Obsidian on a phone has no status bar (it is a computer's only), so there the lit words stand at the top of the
 * Today pane instead. Only on a phone, only signed in, only when something is new (and never while the server has
 * no door: `words` is empty then).
 */
export function todayPaneMarks(words: { lit: string | null }, where: { mobile: boolean; unlocked: boolean }): string | null {
  return where.mobile && where.unlocked && words.lit ? words.lit : null;
}

/** The two doors (`GET /myu/menu-marks`, `POST /myu/menu-marks/opened`): null while the server has none (404). */
export interface MenuMarksDoors {
  getMenuMarks(): Promise<MenuMarks | null>;
  markMenuOpened(item: MenuItemKey): Promise<MenuMarks | null>;
}

export interface MenuMarksTimers {
  set: (fn: () => void, ms: number) => number;
  clear: (id: number) => void;
}

/** After a line changes, read again this soon (a burst of changes is one read), in case a push was missed. */
export const REREAD_AFTER_MS = 400;

/**
 * A place with nothing new here is still told it was opened (the count here can be behind: a push missed, or still on
 * its way), but not again within this long of the last time it was told.
 */
export const OPENED_AGAIN_AFTER_MS = 60_000;

/**
 * The marks as the server last said them, kept for the status bar. Read on sign-in and on the plugin's five-minute
 * rhythm, replaced by every `menu_marks` push, read again soon after a line changes, cleared on sign-out.
 */
export class MenuMarksKeeper {
  /** The server's marks; null until read, and while the server has no door. */
  marks: MenuMarks | null = null;
  /** null: not asked yet; false: the server has no door (404); true: the marks are the server's. */
  available: boolean | null = null;
  private inflight: Promise<void> | null = null;
  /** Bumped by every change made here (a push, a place opened, a sign-out): an answer to an older read is dropped. */
  private seq = 0;
  private timer: number | null = null;
  private timers: MenuMarksTimers;
  /** When each place was last told it was opened, from here (ms). */
  private told = new Map<MenuItemKey, number>();
  /** What each place's "opened" was before it was opened in this visit: what its entries count as new from. */
  private visit = createVisitSince();
  private now: () => number;

  constructor(
    private deps: {
      doors: () => MenuMarksDoors;
      /** The marks moved: repaint. */
      onChange: () => void;
      timers?: MenuMarksTimers;
      /** The clock (ms); a test hands in its own. */
      now?: () => number;
    },
  ) {
    this.timers = deps.timers ?? { set: (fn, ms) => window.setTimeout(fn, ms), clear: (id) => window.clearTimeout(id) };
    this.now = deps.now ?? (() => Date.now());
  }

  /** The status bar's words for the marks (nothing while the server has no door). */
  words(): { lit: string | null; tooltip: string | null } {
    return statusBarMarks(this.available ? this.marks : null);
  }

  /**
   * From when a place's entries count as new (ms): since it was opened before this visit, and on Today never before
   * this morning. Null while the server has no marks: then nothing is known to be new.
   */
  since(item: MenuItemKey): number | null {
    return this.visit.since(item, this.available ? this.marks : null, new Date(this.now()));
  }

  /** Read the marks. One read at a time; a failed read keeps what is shown (a first failure shows nothing). */
  load(): Promise<void> {
    if (this.inflight) return this.inflight;
    const seq = this.seq;
    const read: Promise<void> = this.deps
      .doors()
      .getMenuMarks()
      .then(
        (marks) => {
          if (seq !== this.seq) return;
          this.set(marks ? { marks, available: true } : { marks: null, available: false });
        },
        () => undefined,
      )
      .finally(() => {
        if (this.inflight === read) this.inflight = null;
      });
    this.inflight = read;
    return read;
  }

  /** The server's push (`menu_marks`): the whole body, each time something changes. */
  take(raw: unknown): void {
    const marks = readMenuMarks(raw);
    if (!marks) return;
    this.seq += 1;
    this.set({ marks, available: true });
  }

  /**
   * A place brought forward here: its "new" goes at once, and the server is told (it keeps "opened" on the account).
   * Nothing is sent while the server has no door. A place that shows nothing new here is told all the same, since
   * the count here can be behind the server's (a push missed, or on its way), but at most once a minute.
   */
  opened(item: MenuItemKey | null): void {
    if (!item || this.available !== true || !this.marks) return;
    const now = this.now();
    const last = this.told.get(item);
    if ((this.marks.marks[item]?.new ?? 0) === 0 && last !== undefined && now - last < OPENED_AGAIN_AFTER_MS) return;
    this.told.set(item, now);
    this.seq += 1;
    const seq = this.seq;
    // What it was before this opening is what this visit counts as new from: kept before the marks take the new stamp.
    this.visit.opening(item, this.marks);
    this.set({ marks: withOpened(this.marks, item, now) });
    this.deps
      .doors()
      .markMenuOpened(item)
      .then(
        (marks) => {
          if (marks && seq === this.seq) this.set({ marks });
        },
        // Not told after all: the next time it is brought forward tells it.
        () => {
          if (this.told.get(item) === now) this.told.delete(item);
        },
      );
  }

  /** A line changed (`line_new`, `line_updated`): read again soon, in case a push was missed. Only while the server has the door. */
  lineChanged(): void {
    if (this.available !== true) return;
    if (this.timer !== null) this.timers.clear(this.timer);
    this.timer = this.timers.set(() => {
      this.timer = null;
      void this.load();
    }, REREAD_AFTER_MS);
  }

  /** Signed out or locked: nothing is shown until the next read, and a read still out is dropped. */
  reset(): void {
    this.seq += 1;
    this.inflight = null;
    this.told.clear();
    this.visit.reset();
    if (this.timer !== null) {
      this.timers.clear(this.timer);
      this.timer = null;
    }
    if (this.marks === null && this.available === null) return;
    this.marks = null;
    this.available = null;
    this.deps.onChange();
  }

  private set(next: { marks?: MenuMarks | null; available?: boolean | null }): void {
    if (next.marks !== undefined) this.marks = next.marks;
    if (next.available !== undefined) this.available = next.available;
    this.deps.onChange();
  }
}
