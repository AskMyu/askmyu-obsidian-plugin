/**
 * The menu's marks in the vault (2026-10-06): the status bar says what is new in Myu's places, in words; a place
 * brought forward tells the server it was opened; a server without the door changes nothing.
 *
 * Runs in the unit-test entry, where `obsidian` THROWS: nothing here may touch the host.
 */

import { strict as assert } from 'node:assert';
import test from 'node:test';

import { menuMarksOf } from '../src/transport/api';
import type { ApiResponse } from '../src/transport/index';
import { MockApi } from '../src/transport/mock';
import { readMenuMarks, type MenuItemKey, type MenuMarks } from '../src/menuMarks';
import { MENU_PLACE_WORDS, MenuMarksKeeper, OPENED_AGAIN_AFTER_MS, REREAD_AFTER_MS, statusBarMarks, todayPaneMarks, type MenuMarksDoors } from '../src/menuMarksBar';

function marksOf(m: Partial<Record<MenuItemKey, [number, number]>>): MenuMarks {
  const marks: MenuMarks['marks'] = {};
  for (const [key, [n, w]] of Object.entries(m) as Array<[MenuItemKey, [number, number]]>) marks[key] = { new: n, waiting: w };
  return { day: '2026-10-06', marks, opened: {} };
}

/** Doors a test answers by hand: each read and each opened place waits until the test settles it. */
class HandDoors implements MenuMarksDoors {
  reads: Array<{ resolve: (m: MenuMarks | null) => void; reject: (e: Error) => void }> = [];
  opens: Array<{ item: MenuItemKey; resolve: (m: MenuMarks | null) => void; reject: (e: Error) => void }> = [];
  getMenuMarks(): Promise<MenuMarks | null> {
    return new Promise((resolve, reject) => this.reads.push({ resolve, reject }));
  }
  markMenuOpened(item: MenuItemKey): Promise<MenuMarks | null> {
    return new Promise((resolve, reject) => this.opens.push({ item, resolve, reject }));
  }
}

/** Timers a test runs by hand. */
function handTimers() {
  let next = 1;
  const pending = new Map<number, { fn: () => void; ms: number }>();
  return {
    pending,
    set: (fn: () => void, ms: number) => {
      pending.set(next, { fn, ms });
      return next++;
    },
    clear: (id: number) => void pending.delete(id),
    runAll: () => {
      const due = [...pending.values()];
      pending.clear();
      due.forEach((t) => t.fn());
    },
  };
}

function keeper(doors: MenuMarksDoors = new HandDoors()) {
  const timers = handTimers();
  /** The keeper's clock (ms), moved by hand. */
  const clock = { now: 1_000_000 };
  let paints = 0;
  const k = new MenuMarksKeeper({ doors: () => doors, onChange: () => void (paints += 1), timers, now: () => clock.now });
  return { k, timers, clock, paints: () => paints };
}

const tick = () => new Promise((r) => setImmediate(r));

// ── the words ──────────────────────────────────────────────────────────────

test('the places in the plugin’s own words: Home is Today here', () => {
  assert.deepEqual(MENU_PLACE_WORDS, { home: 'Today', people: 'People', calendar: 'Calendar', spaces: 'Spaces', conversations: 'Conversations', canvas: 'Canvas' });
});

test('nothing new: no lit words; nothing at all: no tooltip either', () => {
  assert.deepEqual(statusBarMarks(null), { lit: null, tooltip: null });
  assert.deepEqual(statusBarMarks(marksOf({ home: [0, 0], spaces: [0, 0] })), { lit: null, tooltip: null });
  assert.deepEqual(statusBarMarks({ marks: {} }), { lit: null, tooltip: null });
});

test('one place, then two: named, in the menu’s order, "new" said once', () => {
  assert.equal(statusBarMarks(marksOf({ home: [3, 0] })).lit, '3 new in Today');
  assert.equal(statusBarMarks(marksOf({ spaces: [2, 0], home: [3, 2] })).lit, '3 new in Today · 2 in Spaces');
  assert.equal(statusBarMarks(marksOf({ canvas: [1, 0], people: [1, 0] })).lit, '1 new in People · 1 in Canvas');
});

test('more than two places: one count and how many places', () => {
  assert.equal(statusBarMarks(marksOf({ home: [3, 0], calendar: [1, 0], spaces: [4, 0], conversations: [1, 0] })).lit, '9 new in 4 places');
});

test('the tooltip: every place with something new or waiting, one per line, in plain words', () => {
  const words = statusBarMarks(marksOf({ home: [3, 2], people: [0, 1], spaces: [2, 0], canvas: [0, 0] }));
  assert.equal(words.tooltip, 'Today: 3 new, 2 waiting for your answer\nPeople: 1 waiting for your answer\nSpaces: 2 new');
  // Only waiting: nothing lit, and the tooltip still says so.
  assert.deepEqual(statusBarMarks(marksOf({ people: [0, 1] })), { lit: null, tooltip: 'People: 1 waiting for your answer' });
});

test('on a phone (no status bar) the lit words go to the top of Today; on a computer, signed out, or nothing new: nothing', () => {
  const lit = { lit: '3 new in Today · 2 in Spaces' };
  assert.equal(todayPaneMarks(lit, { mobile: true, unlocked: true }), '3 new in Today · 2 in Spaces');
  assert.equal(todayPaneMarks(lit, { mobile: false, unlocked: true }), null);
  assert.equal(todayPaneMarks(lit, { mobile: true, unlocked: false }), null);
  assert.equal(todayPaneMarks({ lit: null }, { mobile: true, unlocked: true }), null);
  assert.equal(todayPaneMarks({ lit: '' }, { mobile: true, unlocked: true }), null);
});

test('the keeper’s words on a phone: nothing while the server has no door, the lit words once it does', async () => {
  const doors = new HandDoors();
  const { k } = keeper(doors);
  const phone = { mobile: true, unlocked: true };
  void k.load();
  doors.reads[0].resolve(null);
  await tick();
  assert.equal(todayPaneMarks(k.words(), phone), null);
  k.take(marksOf({ home: [3, 0], spaces: [2, 1] }));
  assert.equal(todayPaneMarks(k.words(), phone), '3 new in Today · 2 in Spaces');
  k.take(marksOf({ spaces: [0, 1] }));
  assert.equal(todayPaneMarks(k.words(), phone), null);
});

test('no code words reach the screen', () => {
  const words = statusBarMarks(marksOf({ home: [1, 1], people: [1, 1], calendar: [1, 1], spaces: [1, 1], conversations: [1, 1], canvas: [1, 1] }));
  for (const text of [words.lit ?? '', words.tooltip ?? '']) {
    assert.doesNotMatch(text, /home|people\b|_|menu|marks|item|waiting:/);
  }
});

// ── the door ───────────────────────────────────────────────────────────────

const answer = (status: number, data: unknown, error: string | null = null): ApiResponse<unknown> => ({ status, ok: status >= 200 && status < 300, data, error });

test('the door: 404 is "no such door" (null); the body is read; anything else throws so what is shown stays', () => {
  assert.equal(menuMarksOf(answer(404, { error: 'not_found' }, 'not_found'), 'menu marks'), null);
  const body = { success: true, day: '2026-10-06', marks: { home: { new: 3, waiting: 2 } }, opened: { home: 5 } };
  assert.deepEqual(menuMarksOf(answer(200, body), 'menu marks'), { day: '2026-10-06', marks: { home: { new: 3, waiting: 2 } }, opened: { home: 5 } });
  assert.throws(() => menuMarksOf(answer(500, null), 'menu marks'), /menu marks: http_500/);
  assert.throws(() => menuMarksOf(answer(0, null, 'offline'), 'menu marks'), /offline/);
  assert.throws(() => menuMarksOf(answer(200, { success: true }), 'menu marks'), /menu marks/);
});

test('the mock answers a demo day, clears what is opened, and stands for a server without the door', async () => {
  const api = new MockApi();
  const marks = await api.getMenuMarks();
  assert.ok(marks);
  assert.equal(statusBarMarks(marks).lit, '3 new in Today · 2 in Spaces');
  const after = await api.markMenuOpened('spaces');
  assert.equal(after?.marks.spaces?.new, 0);
  assert.equal(after?.marks.spaces?.waiting, 1);
  assert.equal(typeof after?.opened?.spaces, 'number');
  assert.deepEqual(api.menuOpened, ['spaces']);
  assert.equal(statusBarMarks(await api.getMenuMarks()).lit, '3 new in Today');
  api.menuMarks = null;
  assert.equal(await api.getMenuMarks(), null);
  assert.equal(await api.markMenuOpened('home'), null);
  api.state.offline = true;
  await assert.rejects(api.getMenuMarks());
});

// ── the keeper ─────────────────────────────────────────────────────────────

test('a server without the door: nothing shown, nothing sent when a place opens', async () => {
  const doors = new HandDoors();
  const { k } = keeper(doors);
  void k.load();
  doors.reads[0].resolve(null);
  await tick();
  assert.equal(k.available, false);
  assert.deepEqual(k.words(), { lit: null, tooltip: null });
  k.opened('home');
  k.lineChanged();
  assert.equal(doors.opens.length, 0);
  // A push says the door is there after all.
  k.take({ marks: { home: { new: 1, waiting: 0 } } });
  assert.equal(k.available, true);
  assert.equal(k.words().lit, '1 new in Today');
});

test('a failed read keeps what is shown; a first failure shows nothing', async () => {
  const doors = new HandDoors();
  const { k } = keeper(doors);
  void k.load();
  doors.reads[0].reject(new Error('offline'));
  await tick();
  assert.equal(k.available, null);
  assert.deepEqual(k.words(), { lit: null, tooltip: null });
  void k.load();
  doors.reads[1].resolve(marksOf({ home: [2, 0] }));
  await tick();
  void k.load();
  doors.reads[2].reject(new Error('offline'));
  await tick();
  assert.equal(k.words().lit, '2 new in Today');
});

test('one read at a time', async () => {
  const doors = new HandDoors();
  const { k } = keeper(doors);
  const a = k.load();
  const b = k.load();
  assert.equal(a, b);
  assert.equal(doors.reads.length, 1);
  doors.reads[0].resolve(marksOf({}));
  await a;
  void k.load();
  assert.equal(doors.reads.length, 2);
});

test('the push: the whole body, the event envelope or its string, replaces what is shown', () => {
  const { k, paints } = keeper();
  const body = { success: true, marks: { spaces: { new: 2, waiting: 1 } } };
  k.take({ eventType: 'menu_marks', content: JSON.stringify(body) });
  assert.equal(k.words().lit, '2 new in Spaces');
  k.take(JSON.stringify({ marks: { canvas: { new: 1, waiting: 0 } } }));
  assert.equal(k.words().lit, '1 new in Canvas');
  k.take({ eventType: 'menu_marks' });
  k.take('not json');
  assert.equal(k.words().lit, '1 new in Canvas');
  assert.equal(paints(), 2);
});

test('opening a place: its "new" goes at once, the server is told, and its answer is shown', async () => {
  const doors = new HandDoors();
  const { k } = keeper(doors);
  k.take(marksOf({ home: [3, 2], spaces: [2, 1] }));
  k.opened('spaces');
  assert.equal(k.words().lit, '3 new in Today');
  assert.deepEqual(doors.opens.map((o) => o.item), ['spaces']);
  // The waiting count stays: only answering lowers it.
  assert.equal(k.marks?.marks.spaces?.waiting, 1);
  assert.equal(k.marks?.marks.home?.waiting, 2);
  doors.opens[0].resolve(marksOf({ home: [4, 2], spaces: [0, 1] }));
  await tick();
  assert.equal(k.words().lit, '4 new in Today');
});

test('no place, or the door not known yet: nothing is sent', () => {
  const doors = new HandDoors();
  const { k } = keeper(doors);
  k.opened('home');
  k.opened(null);
  k.take(marksOf({ home: [1, 0] }));
  k.opened(null);
  assert.equal(doors.opens.length, 0);
});

test('nothing new here is told all the same (the count here can be behind), then not again within the minute', () => {
  const doors = new HandDoors();
  const { k, clock } = keeper(doors);
  k.take(marksOf({ home: [0, 2], spaces: [1, 0] }));
  // A count of 0 here may be a push missed or on its way: the server is told, so "opened" on the account moves.
  k.opened('home');
  k.opened('people');
  assert.deepEqual(doors.opens.map((o) => o.item), ['home', 'people']);
  // The waiting count stays.
  assert.equal(k.marks?.marks.home?.waiting, 2);
  // Brought forward again within the minute, still nothing new here: not told again.
  clock.now += OPENED_AGAIN_AFTER_MS - 1;
  k.opened('home');
  k.opened('people');
  assert.equal(doors.opens.length, 2);
  // A minute on: told again.
  clock.now += 1;
  k.opened('home');
  assert.deepEqual(doors.opens.map((o) => o.item), ['home', 'people', 'home']);
});

test('something new here is always told, however soon; the minute is kept place by place', () => {
  const doors = new HandDoors();
  const { k, clock } = keeper(doors);
  k.take(marksOf({ spaces: [1, 0] }));
  k.opened('spaces');
  // Nothing new now (cleared here): within the minute, not told again.
  k.opened('spaces');
  assert.deepEqual(doors.opens.map((o) => o.item), ['spaces']);
  // Something new arrives while the person is there: it stays new (nothing treats the place as opened) …
  clock.now += 5_000;
  k.take(marksOf({ spaces: [2, 0] }));
  assert.equal(k.words().lit, '2 new in Spaces');
  // … until the place is brought forward again, which tells the server at once.
  k.opened('spaces');
  assert.deepEqual(doors.opens.map((o) => o.item), ['spaces', 'spaces']);
  assert.equal(k.words().lit, null);
  // Another place is its own: Conversations was never told, so it is told now.
  k.opened('conversations');
  assert.deepEqual(doors.opens.map((o) => o.item), ['spaces', 'spaces', 'conversations']);
});

test('a telling that failed does not count: the next time the place is brought forward tells it', async () => {
  const doors = new HandDoors();
  const { k } = keeper(doors);
  k.take(marksOf({ home: [0, 0] }));
  k.opened('home');
  doors.opens[0].reject(new Error('offline'));
  await tick();
  k.opened('home');
  assert.deepEqual(doors.opens.map((o) => o.item), ['home', 'home']);
  // One that got through does count.
  doors.opens[1].resolve(marksOf({ home: [0, 0] }));
  await tick();
  k.opened('home');
  assert.equal(doors.opens.length, 2);
});

test('signed out: the minute is forgotten with the marks', () => {
  const doors = new HandDoors();
  const { k } = keeper(doors);
  k.take(marksOf({ home: [0, 0] }));
  k.opened('home');
  k.reset();
  k.take(marksOf({ home: [0, 0] }));
  k.opened('home');
  assert.deepEqual(doors.opens.map((o) => o.item), ['home', 'home']);
});

test('a read that left before a place was opened does not bring its "new" back', async () => {
  const doors = new HandDoors();
  const { k } = keeper(doors);
  k.take(marksOf({ home: [3, 0] }));
  void k.load();
  k.opened('home');
  doors.reads[0].resolve(marksOf({ home: [3, 0] }));
  await tick();
  assert.equal(k.words().lit, null);
});

test('a line that changed: read again soon, once for a burst, only while the server has the door', async () => {
  const doors = new HandDoors();
  const { k, timers } = keeper(doors);
  k.lineChanged();
  assert.equal(timers.pending.size, 0);
  k.take(marksOf({ home: [1, 0] }));
  k.lineChanged();
  k.lineChanged();
  assert.equal(timers.pending.size, 1);
  assert.equal([...timers.pending.values()][0].ms, REREAD_AFTER_MS);
  timers.runAll();
  assert.equal(doors.reads.length, 1);
  doors.reads[0].resolve(marksOf({ home: [2, 0] }));
  await tick();
  assert.equal(k.words().lit, '2 new in Today');
});

test('signed out: nothing shown, and a read still out is dropped', async () => {
  const doors = new HandDoors();
  const { k, timers } = keeper(doors);
  k.take(marksOf({ home: [1, 0] }));
  void k.load();
  k.lineChanged();
  k.reset();
  assert.equal(k.available, null);
  assert.deepEqual(k.words(), { lit: null, tooltip: null });
  assert.equal(timers.pending.size, 0);
  doors.reads[0].resolve(marksOf({ home: [5, 0] }));
  await tick();
  assert.equal(k.marks, null);
  // The next sign-in reads afresh.
  void k.load();
  assert.equal(doors.reads.length, 2);
});

test('the mock behind the keeper: the demo day, then a place opened', async () => {
  const api = new MockApi();
  const { k } = keeper(api);
  await k.load();
  assert.equal(k.words().lit, '3 new in Today · 2 in Spaces');
  k.opened('home');
  await tick();
  assert.equal(k.words().lit, '2 new in Spaces');
  assert.deepEqual(api.menuOpened, ['home']);
  assert.equal(readMenuMarks(k.marks)?.marks.home?.waiting, 2);
});

// ── what a visit counts as new from (2026-10-06: orange is always new) ─────────

/** A day by hand: 6 October 2026, the hour given, in the machine's own zone. */
const hour = (h: number, m = 0) => new Date(2026, 9, 6, h, m, 0).getTime();

test('since: nothing while the server has no marks; the server’s own "opened" until a place is opened here; Today never before this morning', async () => {
  const doors = new HandDoors();
  const { k, clock } = keeper(doors);
  clock.now = hour(12);
  assert.equal(k.since('home'), null, 'not read yet');
  void k.load();
  doors.reads[0].resolve(null);
  await tick();
  assert.equal(k.since('home'), null, 'a server without the door: nothing is known to be new');

  k.take({ ...marksOf({ home: [2, 1], spaces: [1, 0] }), opened: { home: hour(9), spaces: new Date(2026, 9, 4, 18, 0, 0).getTime() } });
  assert.equal(k.since('home'), hour(9));
  assert.equal(k.since('spaces'), new Date(2026, 9, 4, 18, 0, 0).getTime(), 'another place counts from whenever it was opened');
  assert.equal(k.since('people'), 0, 'never opened: everything there is new');
  // Opened yesterday evening: Today starts again each morning.
  k.take({ ...marksOf({ home: [2, 1] }), opened: { home: new Date(2026, 9, 5, 22, 0, 0).getTime() } });
  assert.equal(k.since('home'), hour(0));
});

test('since: opening a place keeps what it was before for this visit, and paints; the next opening moves it on; sign-out forgets', async () => {
  const doors = new HandDoors();
  const { k, clock, paints } = keeper(doors);
  clock.now = hour(12);
  k.take({ ...marksOf({ home: [2, 1] }), opened: { home: hour(9) } });
  const before = paints();
  k.opened('home');
  assert.equal(k.marks?.opened?.home, hour(12), 'the marks take the new stamp');
  assert.equal(k.since('home'), hour(9), 'this visit still counts from before it');
  assert.ok(paints() > before, 'an opening repaints (the rows’ dots follow it)');

  // Brought forward again within the minute, nothing new: not a new visit.
  clock.now = hour(12) + 20_000;
  k.opened('home');
  assert.equal(k.since('home'), hour(9));
  assert.equal(doors.opens.length, 1);

  // The server's answer to the opening changes nothing about the visit.
  doors.opens[0].resolve({ ...marksOf({ home: [0, 1] }), opened: { home: hour(12) + 400 } });
  await tick();
  assert.equal(k.since('home'), hour(9));

  // Opened again later: what was new last time has been shown.
  clock.now = hour(12, 5);
  k.opened('home');
  assert.equal(k.since('home'), hour(12) + 400);
  assert.equal(doors.opens.length, 2);

  // Signed out or locked: nothing is remembered; signed in again, the server's own stamp counts.
  k.reset();
  assert.equal(k.since('home'), null);
  k.take({ ...marksOf({ home: [0, 0] }), opened: { home: hour(11) } });
  assert.equal(k.since('home'), hour(11));
});
