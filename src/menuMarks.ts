/**
 * The menu's marks (2026-10-06, decided by the operator): every menu item carries two numbers, counted by the server
 * (`GET /myu/menu-marks`, pushed live as the SSE `menu_marks`):
 *   - new: everything that came in for that item since the person last opened it (questions and notes alike). Opening
 *     the item (`POST /myu/menu-marks/opened`) clears it. Drawn lit (the "needs" colour), on every menu.
 *   - waiting: Myu's questions there still waiting for an answer; only answering lowers it. Drawn quiet (grey), where
 *     there is room (the open menu, the narrow menu), never on the collapsed rail.
 * Home starts fresh each morning. "Opened" is kept on the account, so every device sees the same. The terminal and
 * Obsidian mirror this file (their tests hold the copies).
 *
 * The dots on a page's own entries follow the same two meanings (2026-10-06, the operator's rule: orange is always
 * new): an entry is lit while something came in for it since the page's item was opened before this visit, and quiet
 * (grey) while a question there waits for an answer. See `entryDot` at the foot of this file.
 */

/** The menu items that carry marks, as the server names them. */
export type MenuItemKey = 'home' | 'people' | 'calendar' | 'spaces' | 'conversations' | 'canvas';

export const MENU_ITEM_KEYS: readonly MenuItemKey[] = ['home', 'people', 'calendar', 'spaces', 'conversations', 'canvas'];

/**
 * The Spaces page's kinds (Retros, Interview debriefs) each have their own "opened", kept beside the items' under
 * these keys (`POST /gattai/spaces/kinds/opened` stamps it). Their lists' entries count as new from it.
 */
export type KindKey = 'spaces:retro' | 'spaces:debrief';

export const KIND_KEYS: readonly KindKey[] = ['spaces:retro', 'spaces:debrief'];

/** Anything that has an "opened" of its own: a menu item, or a kind of space. */
export type OpenedKey = MenuItemKey | KindKey;

/** A kind's key ("retro" → "spaces:retro"); null for a work that is not a kind. */
export function kindKey(work: string | null | undefined): KindKey | null {
  const key = `spaces:${work ?? ''}`;
  return (KIND_KEYS as readonly string[]).includes(key) ? (key as KindKey) : null;
}

export interface MenuMark {
  new: number;
  waiting: number;
}

/** The door's and the event's body. */
export interface MenuMarks {
  day?: string;
  marks: Partial<Record<MenuItemKey, MenuMark>>;
  /** When each item, and each kind of space, was last opened (epoch ms); absent = never. */
  opened?: Partial<Record<OpenedKey, number>>;
}

const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

/** The body as the server sends it (the door's, or the event's, whose payload may be a JSON string); null when it is not one. */
export function readMenuMarks(raw: unknown): MenuMarks | null {
  let body = raw;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return null;
    }
  }
  if (!body || typeof body !== 'object') return null;
  const b = body as { marks?: unknown; opened?: unknown; day?: unknown; content?: unknown };
  // An SSE envelope carries the body in `content`.
  if (!b.marks && b.content !== undefined) return readMenuMarks(b.content);
  if (!b.marks || typeof b.marks !== 'object') return null;
  const marks: MenuMarks['marks'] = {};
  for (const key of MENU_ITEM_KEYS) {
    const m = (b.marks as Record<string, unknown>)[key] as { new?: unknown; waiting?: unknown } | undefined;
    if (m && typeof m === 'object') marks[key] = { new: count(m.new), waiting: count(m.waiting) };
  }
  const opened: MenuMarks['opened'] = {};
  if (b.opened && typeof b.opened === 'object') {
    for (const key of [...MENU_ITEM_KEYS, ...KIND_KEYS]) {
      const at = (b.opened as Record<string, unknown>)[key];
      if (typeof at === 'number' && Number.isFinite(at)) opened[key] = at;
    }
  }
  return { day: typeof b.day === 'string' ? b.day : undefined, marks, opened };
}

/** The marks once an item is opened here, before the server's answer: its "new" is 0. */
export function withOpened(marks: MenuMarks, item: MenuItemKey, at: number = Date.now()): MenuMarks {
  const m = marks.marks[item];
  return {
    ...marks,
    marks: { ...marks.marks, [item]: { new: 0, waiting: m?.waiting ?? 0 } },
    opened: { ...(marks.opened ?? {}), [item]: at },
  };
}

/**
 * What an item draws: `lit` — the new count, when there is something new; `quiet` — the waiting count, only where
 * there is room (`roomy`: the open menu, the narrow menu; not the collapsed rail).
 */
export function menuMarkView(mark: MenuMark | undefined, roomy: boolean): { lit: number | null; quiet: number | null } {
  return {
    lit: mark && mark.new > 0 ? mark.new : null,
    quiet: roomy && mark && mark.waiting > 0 ? mark.waiting : null,
  };
}

/** The marks in words, for a screen reader or a tooltip ("2 new, 1 waiting for your answer"); empty when there is none. */
export function menuMarkWords(mark: MenuMark | undefined): string {
  if (!mark) return '';
  return [mark.new > 0 ? `${mark.new} new` : '', mark.waiting > 0 ? `${mark.waiting} waiting for your answer` : '']
    .filter(Boolean)
    .join(', ');
}

// ---- the dots on a page's own entries (2026-10-06: orange is always new, grey is waiting) ----

/**
 * The dot beside an entry on a page (a meeting, a person, a question, a conversation): `new` — lit, the menu's orange —
 * while something came in for it since the page's item was opened before this visit; `waiting` — quiet, grey — while a
 * question there waits for an answer. New wins while it lasts. Orange never means anything but new.
 */
export type EntryDot = 'new' | 'waiting';

/** The dots in words, for a screen reader or a tooltip. */
export const ENTRY_DOT_WORDS: Record<EntryDot, string> = { new: 'New', waiting: 'Waiting for your answer' };

/**
 * When something came in, as the server counts "new" (epoch ms; 0 when it does not say): a line's release to the
 * person (`released_at`, when the server sends it), else when it was made.
 */
export function cameInAt(entry: { released_at?: string | number | null; created_at?: string | number | null }): number {
  for (const raw of [entry.released_at, entry.created_at]) {
    const at = typeof raw === 'number' ? raw : raw ? Date.parse(raw) : NaN;
    if (Number.isFinite(at) && at > 0) return at;
  }
  return 0;
}

/**
 * From when a page's entries count as new: since its item was opened before this visit (`openedBefore`: the item's
 * `opened` as it stood before this opening; absent = never opened, so everything on the page is new), and on Home never
 * before the start of today, as Home's menu number starts again each morning.
 */
export function newSince(item: OpenedKey, openedBefore: number | null | undefined, now: Date = new Date()): number {
  const opened = typeof openedBefore === 'number' && Number.isFinite(openedBefore) && openedBefore > 0 ? openedBefore : 0;
  if (item !== 'home') return opened;
  return Math.max(opened, new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime());
}

/** What a dot reads of a line. */
export interface DotLine {
  needs_you?: boolean;
  state?: string | null;
  released_at?: string | number | null;
  created_at?: string | number | null;
}

/**
 * An entry's dot from its lines (one line, or every line under the entry). `since`: `newSince` for the page; null when
 * the server sends no marks, and then nothing is known to be new and only what waits is marked. Only a line the list
 * shows as open (released) counts, as the server counts it.
 */
export function entryDot(lines: readonly DotLine[] | DotLine | null | undefined, since: number | null | undefined): EntryDot | null {
  const all: readonly DotLine[] = !lines ? [] : Array.isArray(lines) ? (lines as readonly DotLine[]) : [lines as DotLine];
  const open = all.filter((l) => (l.state ?? 'released') === 'released');
  if (typeof since === 'number' && open.some((l) => cameInAt(l) > since)) return 'new';
  return open.some((l) => l.needs_you) ? 'waiting' : null;
}

/**
 * The dot of an entry of a kind's list (a retro's run, an interview debrief, a draft): new while the newest thing
 * about it (`newest_at`, which the server sends when one of the lines the kind's "new" counts is about it) came in
 * since the kind was opened before this visit; else waiting when it needs you.
 */
export function runDot(entry: { newest_at?: string | number | null; needs_you?: boolean | null }, since: number | null | undefined): EntryDot | null {
  return plainDot(cameInAt({ created_at: entry.newest_at }) || null, !!entry.needs_you, since);
}

/** The dot of something that carries no line: new when it came in (`at`, epoch ms) since `since`; else waiting when it waits. */
export function plainDot(at: number | null | undefined, waiting: boolean, since: number | null | undefined): EntryDot | null {
  if (typeof since === 'number' && typeof at === 'number' && Number.isFinite(at) && at > since) return 'new';
  return waiting ? 'waiting' : null;
}

/**
 * What a visit counts as new from, per item. A page's entries stay lit for the visit that first shows them: opening an
 * item stamps its `opened` to now, so what it was BEFORE this opening is kept here. `opening` is called as the item is
 * opened, before the marks take the new stamp. Without an opening in this session (a reload, a first load), the
 * server's own `opened` is what counts, as the menu's number does.
 */
export interface VisitSince {
  opening(item: OpenedKey, marks: MenuMarks | null | undefined): void;
  /** `newSince` for the item's page; null while there are no marks (a server without them). */
  since(item: OpenedKey, marks: MenuMarks | null | undefined, now?: Date): number | null;
  reset(): void;
}

export function createVisitSince(): VisitSince {
  const before = new Map<OpenedKey, number>();
  return {
    opening(item, marks) {
      if (marks) before.set(item, marks.opened?.[item] ?? 0);
    },
    since(item, marks, now) {
      if (!marks) return null;
      return newSince(item, before.has(item) ? before.get(item) : marks.opened?.[item], now);
    },
    reset() {
      before.clear();
    },
  };
}
