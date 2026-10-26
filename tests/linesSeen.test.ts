/**
 * "Seen" in the vault (2026-10-06): a line is reported (`POST /myu/lines/seen`) the first time its words have been in
 * view for a second, once per line; a row that leaves the view before its second is not seen; a tab behind another, a
 * hidden window and a closed pane show nothing; a server without the door changes nothing.
 *
 * Runs in the unit-test entry, where `obsidian` THROWS: nothing here may touch the host. The browser's observers and
 * the clock are handed in, and moved by hand.
 */

import { strict as assert } from 'node:assert';
import test from 'node:test';

import { Api, linesSeenOf } from '../src/transport/api';
import type { ApiResponse } from '../src/transport/index';
import { MockApi } from '../src/transport/mock';
import { LINE_SEEN_AFTER_MS, LINE_SEEN_AGAIN_AFTER_MS, LINE_SEEN_BATCH_MS, type LinesSeenResponse } from '../src/linesSeen';
import { LINE_ID_ATTR, LinesInView, SeenWatcher, forgetAnswered, lineIdAttr, rowInView, type SeenDrawRecord, type SeenObservers, type SeenViewEntry } from '../src/linesSeenWatch';

/** A clock by hand: timers fire when time is moved past them. */
function clock() {
  let now = 0;
  let seq = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    set: (fn: () => void, ms: number) => {
      seq += 1;
      timers.set(seq, { at: now + ms, fn });
      return seq;
    },
    clear: (id: number) => void timers.delete(id),
    advance(ms: number) {
      const until = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        // A timer set while this one runs starts from this one's moment.
        now = due[1].at;
        due[1].fn();
      }
      now = until;
    },
    waiting: () => timers.size,
    now: () => now,
  };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

/** An element as the watcher reads it: a line's id on it (or none), and what is drawn under it. */
class El {
  nodeType = 1;
  children: El[] = [];
  attrs: Record<string, string> = {};
  /** False once it was taken out of the pane (the browser's own word for it). */
  isConnected = true;
  constructor(lineId?: string) {
    if (lineId) this.attrs[LINE_ID_ATTR] = lineId;
  }
  getAttribute(name: string): string | null {
    return this.attrs[name] ?? null;
  }
  matches(_selector: string): boolean {
    return LINE_ID_ATTR in this.attrs;
  }
  querySelectorAll(_selector: string): El[] {
    return this.children.flatMap((c) => [...(c.matches('') ? [c] : []), ...c.querySelectorAll('')]);
  }
  add(...els: El[]): this {
    this.children.push(...els);
    return this;
  }
}

/** A pane's content: an element in a window that can be hidden. */
class Pane extends El {
  private listeners = new Set<() => void>();
  doc = {
    visibilityState: 'visible',
    addEventListener: (_name: string, fn: () => void) => void this.listeners.add(fn),
    removeEventListener: (_name: string, fn: () => void) => void this.listeners.delete(fn),
  };
  /** The window is hidden (minimised, the app in the background), or back in front. */
  windowHidden(hidden: boolean): void {
    this.doc.visibilityState = hidden ? 'hidden' : 'visible';
    for (const fn of [...this.listeners]) fn();
  }
  listening(): number {
    return this.listeners.size;
  }
}

/** The browser's observers, by hand: what is observed, and the reports a test makes for it. */
function browser() {
  const views: Array<{ observed: Set<El>; report: (entries: SeenViewEntry[]) => void; off: boolean }> = [];
  const draws: Array<{ pane: El; report: (records: SeenDrawRecord[]) => void; off: boolean }> = [];
  const observers: SeenObservers = {
    view: (report) => {
      const v = { observed: new Set<El>(), report, off: false };
      views.push(v);
      return {
        observe: (el) => void v.observed.add(el as unknown as El),
        unobserve: (el) => void v.observed.delete(el as unknown as El),
        disconnect: () => {
          v.off = true;
          v.observed.clear();
        },
      };
    },
    draws: (pane, report) => {
      const d = { pane: pane as unknown as El, report, off: false };
      draws.push(d);
      return { disconnect: () => void (d.off = true) };
    },
  };
  /** The browser reports on an element it was asked to observe: how much of it shows in a window 800 high. */
  const shows = (el: El, ratio: number, height = 40) => {
    const v = views.find((x) => !x.off && x.observed.has(el));
    assert.ok(v, 'the element is observed');
    v.report([{ target: el as unknown as Element, isIntersecting: ratio > 0, intersectionRatio: ratio, intersectionRect: { height: height * ratio }, rootBounds: { height: 800 } }]);
  };
  /** A redraw under a pane: what was taken away, what was drawn. */
  const redraw = (pane: El, removed: El[], added: El[]) => {
    const d = draws.find((x) => !x.off && x.pane === pane);
    assert.ok(d, 'the pane is watched');
    pane.children = [...pane.children.filter((c) => !removed.includes(c)), ...added];
    for (const gone of removed) for (const el of [gone, ...gone.querySelectorAll('')]) el.isConnected = false;
    d.report([{ type: 'childList', target: pane as unknown as Node, removedNodes: removed as unknown as Node[], addedNodes: added as unknown as Node[] }]);
  };
  const observed = (el: El) => views.some((v) => !v.off && v.observed.has(el));
  return { observers, views, draws, shows, redraw, observed };
}

/** The watcher over a hand browser and a hand clock; what it sent, in order. */
function watcher(send?: (ids: string[]) => Promise<unknown>) {
  const c = clock();
  const b = browser();
  const sent: string[][] = [];
  const w = new SeenWatcher({
    send: async (ids) => {
      sent.push(ids);
      await send?.(ids);
    },
    timers: c,
    now: c.now,
    observers: b.observers,
  });
  /** A second in view, and the wait for what became seen together. */
  const aSecond = async () => {
    c.advance(LINE_SEEN_AFTER_MS);
    c.advance(LINE_SEEN_BATCH_MS);
    await settle();
  };
  return { w, c, b, sent, aSecond };
}
const asPane = (p: Pane) => p as unknown as HTMLElement;

test('a row in view for a second is reported, not before; each line once per session', async () => {
  const { w, c, b, sent, aSecond } = watcher();
  const row = new El('L1');
  const pane = new Pane().add(new El().add(row));
  w.watch(asPane(pane));
  assert.ok(b.observed(row), 'a row already drawn when the pane is watched is found');
  await aSecond();
  assert.deepEqual(sent, [], 'drawn is not in view: the browser has not said it shows');

  b.shows(row, 1);
  c.advance(LINE_SEEN_AFTER_MS - 1);
  await settle();
  assert.deepEqual(sent, [], 'not yet a second');
  assert.equal(c.waiting(), 1, 'the second is still counting');
  c.advance(1);
  await settle();
  assert.deepEqual(sent, [], 'seen now; the report waits a moment for others');
  c.advance(LINE_SEEN_BATCH_MS);
  await settle();
  assert.deepEqual(sent, [['L1']]);

  // Scrolled away and back, and left there: nothing more.
  b.shows(row, 0);
  b.shows(row, 1);
  await aSecond();
  await aSecond();
  assert.deepEqual(sent, [['L1']], 'once per session');
});

test('a row that leaves the view before its second is not seen; the second starts again the next time', async () => {
  const { w, c, b, sent, aSecond } = watcher();
  const row = new El('L1');
  const pane = new Pane().add(row);
  w.watch(asPane(pane));
  b.shows(row, 1);
  c.advance(700);
  b.shows(row, 0);
  await aSecond();
  await aSecond();
  assert.deepEqual(sent, [], 'out of view before the second');

  b.shows(row, 1);
  c.advance(700);
  await settle();
  assert.equal(c.waiting(), 1, 'the earlier 700 ms do not count: its second is still counting');
  c.advance(300);
  c.advance(LINE_SEEN_BATCH_MS);
  await settle();
  assert.deepEqual(sent, [['L1']]);
});

test('in view is half of the row showing, or half the window filled; a tab behind another shows nothing', async () => {
  const entry = (over: Partial<SeenViewEntry>) => ({ isIntersecting: true, intersectionRatio: 1, intersectionRect: { height: 40 }, rootBounds: { height: 800 }, ...over });
  assert.equal(rowInView(entry({})), true);
  assert.equal(rowInView(entry({ intersectionRatio: 0.5, intersectionRect: { height: 20 } })), true);
  assert.equal(rowInView(entry({ intersectionRatio: 0.4, intersectionRect: { height: 16 } })), false, 'most of it is scrolled away');
  assert.equal(rowInView(entry({ isIntersecting: false, intersectionRatio: 0, intersectionRect: { height: 0 } })), false, 'a tab behind another, a collapsed sidebar: nothing of it shows');
  assert.equal(rowInView(entry({ intersectionRatio: 0.2, intersectionRect: { height: 400 } })), true, 'words taller than the window, filling half of it');
  assert.equal(rowInView(entry({ intersectionRatio: 0.2, intersectionRect: { height: 300 } })), false);
  assert.equal(rowInView(entry({ intersectionRatio: 0.2, intersectionRect: { height: 400 }, rootBounds: null })), false, 'the window\'s size unknown: only half of the row counts');
  assert.equal(rowInView(entry({ isIntersecting: true, intersectionRatio: 0, intersectionRect: { height: 0 }, rootBounds: { height: 0 } })), false, 'touching the edge of a window with no height');

  // Through the watcher: a pane that is a tab behind another never has its row in view.
  const { w, b, sent, aSecond } = watcher();
  const row = new El('L1');
  w.watch(asPane(new Pane().add(row)));
  b.shows(row, 0);
  await aSecond();
  b.shows(row, 0.3);
  await aSecond();
  assert.deepEqual(sent, []);
});

test('a hidden window shows nothing; back in front, what is in view starts its second again', async () => {
  const { w, c, b, sent, aSecond } = watcher();
  const row = new El('L1');
  const pane = new Pane().add(row);
  w.watch(asPane(pane));
  b.shows(row, 1);
  c.advance(600);
  pane.windowHidden(true);
  await aSecond();
  await aSecond();
  assert.deepEqual(sent, [], 'the row is still where it was, in a window nobody sees');

  pane.windowHidden(false);
  c.advance(600);
  await settle();
  assert.equal(c.waiting(), 1, 'the 600 ms before the window was hidden do not count: its second is still counting');
  c.advance(400);
  c.advance(LINE_SEEN_BATCH_MS);
  await settle();
  assert.deepEqual(sent, [['L1']]);

  // A pane opened in a window that is already hidden: its rows wait for the window.
  const other = new El('L2');
  const behind = new Pane().add(other);
  behind.doc.visibilityState = 'hidden';
  w.watch(asPane(behind));
  b.shows(other, 1);
  await aSecond();
  assert.deepEqual(sent, [['L1']]);
  behind.windowHidden(false);
  await aSecond();
  assert.deepEqual(sent, [['L1'], ['L2']]);
});

test('a pane closed: nothing in it is in view, and nothing of it is watched any more', async () => {
  const { w, c, b, sent, aSecond } = watcher();
  const row = new El('L1');
  const pane = new Pane().add(row);
  w.watch(asPane(pane));
  assert.equal(pane.listening(), 1);
  b.shows(row, 1);
  c.advance(500);
  w.unwatch(asPane(pane));
  await aSecond();
  assert.deepEqual(sent, []);
  assert.equal(c.waiting(), 0, 'no second is still counting');
  assert.equal(b.observed(row), false);
  assert.ok(b.views.every((v) => v.off) && b.draws.every((d) => d.off));
  assert.equal(pane.listening(), 0);
  w.unwatch(asPane(pane));

  // Opened again: watched again, from the start.
  w.watch(asPane(pane));
  b.shows(row, 1);
  await aSecond();
  assert.deepEqual(sent, [['L1']]);
});

test('a redraw: the rows drawn are watched, the rows taken away are not; a row redrawn starts its second again', async () => {
  const { w, c, b, sent, aSecond } = watcher();
  const first = new El('L1');
  const zone = new El().add(first);
  const pane = new Pane().add(zone);
  w.watch(asPane(pane));
  b.shows(first, 1);
  c.advance(800);

  // The pane redraws (a refresh): the same line on a new row, and a new line under it.
  const again = new El('L1');
  const second = new El('L2');
  const fresh = new El().add(again, new El().add(second));
  b.redraw(pane, [zone], [fresh]);
  assert.equal(b.observed(first), false);
  assert.ok(b.observed(again) && b.observed(second), 'rows nested in what was drawn are found');
  // A report that was already on its way for the row taken away says nothing about the row that replaced it.
  b.views[0].report([{ target: first as unknown as Element, isIntersecting: true, intersectionRatio: 1, intersectionRect: { height: 40 }, rootBounds: { height: 800 } }]);
  await aSecond();
  assert.deepEqual(sent, [], 'the row that was taken away took its 800 ms with it; a redraw alone is not seeing it');

  b.shows(again, 1);
  await aSecond();
  assert.deepEqual(sent, [['L1']], 'L2 was drawn below the fold and never showed');

  // A row that is itself what was drawn (not nested), and a line's id put on a row already there.
  const third = new El('L3');
  b.redraw(pane, [], [third]);
  b.shows(third, 1);
  const reused = new El();
  b.redraw(pane, [], [reused]);
  assert.equal(b.observed(reused), false, 'no line on it: not watched');
  reused.attrs[LINE_ID_ATTR] = 'L4';
  b.draws[0].report([{ type: 'attributes', target: reused as unknown as Node, addedNodes: [], removedNodes: [] }]);
  b.shows(reused, 1);
  await aSecond();
  assert.deepEqual(sent, [['L1'], ['L3', 'L4']]);
});

test('what comes into view together goes in one report; a line on two panes is reported once', async () => {
  const { w, c, b, sent, aSecond } = watcher();
  const a = new El('L1');
  const second = new El('L2');
  const today = new Pane().add(a, second);
  // The same line as the one ask of its conversation, in the chat pane.
  const ask = new El('L1');
  const chat = new Pane().add(ask);
  w.watch(asPane(today));
  w.watch(asPane(chat));
  b.shows(a, 1);
  b.shows(second, 0.6);
  c.advance(100);
  b.shows(ask, 1);
  // Today's row scrolls away; the line is still in view in the chat pane, and its second goes on.
  c.advance(500);
  b.shows(a, 0);
  await aSecond();
  assert.deepEqual(sent, [['L1', 'L2']]);
  b.shows(a, 1);
  await aSecond();
  assert.deepEqual(sent, [['L1', 'L2']], 'not again from the other pane');
});

test('a report that fails is sent again the next time the line is in view; sign-out or lock forgets', async () => {
  let fail = true;
  const { w, b, sent, aSecond } = watcher(async () => {
    if (fail) throw new Error('lines seen: offline');
  });
  const row = new El('L1');
  w.watch(asPane(new Pane().add(row)));
  b.shows(row, 1);
  await aSecond();
  assert.deepEqual(sent, [['L1']], 'sent, and it failed (nothing is shown)');
  await aSecond();
  assert.deepEqual(sent, [['L1']], 'not sent again by itself');
  fail = false;
  b.shows(row, 0);
  b.shows(row, 1);
  await aSecond();
  assert.deepEqual(sent, [['L1'], ['L1']], 'reported again after the failure');

  // Signed out or locked, then back: the line as it is drawn again is reported for the new session.
  w.reset();
  b.shows(row, 0);
  b.shows(row, 1);
  await aSecond();
  assert.deepEqual(sent, [['L1'], ['L1'], ['L1']]);

  // A reset while a second is counting: that second is dropped.
  const next = new El('L2');
  const pane = new Pane().add(next);
  w.watch(asPane(pane));
  b.shows(next, 1);
  w.reset();
  await aSecond();
  assert.equal(sent.length, 3);
  w.stop();
  assert.ok(b.views.every((v) => v.off), 'the plugin going: no pane is watched');
});

test('a line answered here is forgotten: put off ("Not now"), then in view again for a second, it is reported again', async () => {
  const api = new MockApi();
  api.dayLines = [
    { line_id: 'L1', subjects: [], text: 'An interview for Backend engineer is on your calendar.', ask_kind: 'choice', needs_you: true, state: 'released', choices: [{ id: 'send_now', label: 'Send now' }, { id: 'not_interview', label: 'Not an interview' }, { id: 'not_this', label: 'Not this one' }] },
    { line_id: 'L2', subjects: [{ type: 'person', id: 'p1', label: 'Dana Okafor' }], text: 'You owe Dana a reply.', ask_kind: 'yes_no', needs_you: true, state: 'released' },
  ];
  const { w, b, sent, aSecond } = watcher((ids) => api.markLinesSeen(ids));
  // The one door every pane answers through: once an answer was sent, the line is forgotten.
  forgetAnswered(api, (lineId) => w.forget(lineId));
  const [draft, other] = [new El('L1'), new El('L2')];
  const pane = new Pane().add(draft, other);
  w.watch(asPane(pane));
  b.shows(draft, 1);
  b.shows(other, 1);
  await aSecond();
  assert.deepEqual(sent, [['L1', 'L2']]);

  // "Not now": the server makes the line unseen again, under the same id; it leaves the list until another day.
  const reply = await api.answerMyuLine('L1', { later: true });
  assert.equal(reply.ok, true, 'the answer itself goes through as before');
  assert.deepEqual(api.dayAnswered, [{ line_id: 'L1', answer: { later: true } }]);
  b.redraw(pane, [draft], []);
  await aSecond();
  assert.deepEqual(sent, [['L1', 'L2']], 'gone from the pane: nothing to report');

  // It comes back, on a new row: in view for a second, it is reported again. The line nobody answered is not.
  const back = new El('L1');
  const sameOther = new El('L2');
  b.redraw(pane, [other], [back, sameOther]);
  b.shows(back, 1);
  b.shows(sameOther, 1);
  await aSecond();
  assert.deepEqual(sent, [['L1', 'L2'], ['L1']]);

  // Whatever the answer was, and however it went: an answer that could not be sent forgets the line too.
  api.state.offline = true;
  await api.answerMyuLine('L2', { yes: true });
  api.state.offline = false;
  b.shows(sameOther, 0);
  b.shows(sameOther, 1);
  await aSecond();
  assert.deepEqual(sent, [['L1', 'L2'], ['L1'], ['L2']]);
});

test('a line reported long ago is reported again the next time it is in view (it may have been put off on another device)', async () => {
  const { w, c, b, sent, aSecond } = watcher();
  const row = new El('L1');
  w.watch(asPane(new Pane().add(row)));
  b.shows(row, 1);
  await aSecond();
  c.advance(LINE_SEEN_AGAIN_AFTER_MS - 2 * LINE_SEEN_AFTER_MS);
  b.shows(row, 0);
  b.shows(row, 1);
  await aSecond();
  assert.deepEqual(sent, [['L1']], 'within the six hours: once');
  c.advance(LINE_SEEN_AFTER_MS);
  b.shows(row, 0);
  b.shows(row, 1);
  await aSecond();
  assert.deepEqual(sent, [['L1'], ['L1']]);
});

test('the lines in view: the reporter is told when a line comes into view and when the last row showing it leaves', () => {
  const told: string[] = [];
  const lines = new LinesInView({ inView: (id) => void told.push(`in ${id}`), outOfView: (id) => void told.push(`out ${id}`) });
  const [paneA, paneB, row1, row2] = [{}, {}, {}, {}];
  lines.show(paneA, row1, 'L1');
  lines.show(paneA, row1, 'L1');
  assert.deepEqual(told, ['in L1'], 'the same row said twice is said once');
  lines.show(paneB, row2, 'L1');
  lines.hide(row1);
  assert.deepEqual(told, ['in L1', 'in L1', 'in L1'], 'still in view on the other pane (the reporter ignores what it knows)');
  lines.windowHidden(paneB, true);
  assert.equal(told.at(-1), 'out L1');
  lines.windowHidden(paneB, true);
  lines.windowHidden(paneB, false);
  assert.equal(told.at(-1), 'in L1');
  // A row drawn again for another line: the line it carried before left with it.
  told.length = 0;
  lines.show(paneB, row2, 'L2');
  assert.deepEqual(told, ['out L1', 'in L2']);
  lines.close(paneB);
  assert.equal(told.at(-1), 'out L2');
  lines.hide(row2);
  assert.equal(told.length, 3, 'a row that is not in view leaving says nothing');
});

test('no observers in this browser: nothing is watched, nothing is sent, nothing breaks', async () => {
  const c = clock();
  const sent: string[][] = [];
  const w = new SeenWatcher({ send: async (ids) => void sent.push(ids), timers: c, observers: null });
  const pane = new Pane().add(new El('L1'));
  w.watch(asPane(pane));
  w.unwatch(asPane(pane));
  w.reset();
  w.stop();
  c.advance(5000);
  await settle();
  assert.deepEqual(sent, []);
  assert.equal(pane.listening(), 0);
});

test('a pane marks a line\'s words with its id', () => {
  assert.deepEqual(lineIdAttr('L1'), { 'data-line-id': 'L1' });
});

// ── the door ──────────────────────────────────────────────────────────────────

const answer = (status: number, data: LinesSeenResponse | null, error?: string): ApiResponse<LinesSeenResponse> => ({ status, ok: status >= 200 && status < 300, data, ...(error ? { error } : {}) });

test('the door: POST /myu/lines/seen {line_ids}; nothing to send is not sent', async () => {
  const calls: Array<[string, string, unknown?]> = [];
  const api = new Api({
    get: async (p: string) => {
      calls.push(['GET', p]);
      return { ok: true, status: 200, data: {} };
    },
    post: async (p: string, b: unknown) => {
      calls.push(['POST', p, b]);
      return { ok: true, status: 200, data: { success: true, seen: ['L1'] } };
    },
  } as never);
  assert.deepEqual(await api.markLinesSeen(['L1', 'L2']), { success: true, seen: ['L1'] });
  assert.equal(await api.markLinesSeen([]), null);
  assert.deepEqual(calls, [['POST', '/myu/lines/seen', { line_ids: ['L1', 'L2'] }]]);
});

test('the door\'s answer: a server without it (404) is nothing to send again; any other failure throws, to be sent again', () => {
  assert.equal(linesSeenOf(answer(404, null, 'not_found')), null);
  assert.equal(linesSeenOf(answer(403, null, 'scope_required')), null, 'a session that may only read is refused every time: nothing to send again');
  assert.throws(() => linesSeenOf(answer(403, null, 'http_403')), /lines seen: http_403/);
  assert.deepEqual(linesSeenOf(answer(200, { success: true, seen: ['L1'] })), { success: true, seen: ['L1'] });
  assert.deepEqual(linesSeenOf(answer(200, null)), {});
  assert.throws(() => linesSeenOf(answer(500, null)), /lines seen: http_500/);
  assert.throws(() => linesSeenOf(answer(0, null, 'offline')), /lines seen: offline/);
  assert.throws(() => linesSeenOf(answer(429, null, 'paused')), /paused/);
});

test('through the watcher to the server: what was reported is recorded; a server without the door is asked once and nothing shows', async () => {
  const api = new MockApi();
  const c = clock();
  const b = browser();
  const w = new SeenWatcher({ send: (ids) => api.markLinesSeen(ids), timers: c, now: c.now, observers: b.observers });
  const [one, two] = [new El('L1'), new El('L2')];
  w.watch(asPane(new Pane().add(one, two)));
  b.shows(one, 1);
  b.shows(two, 1);
  c.advance(LINE_SEEN_AFTER_MS + LINE_SEEN_BATCH_MS);
  await settle();
  assert.deepEqual(api.linesSeenReports, [['L1', 'L2']]);
  assert.deepEqual(await api.markLinesSeen(['L1', 'L3']), { success: true, seen: ['L3'] }, 'the server records a line the first time and ignores it after');

  // Until the backend ships: the door answers 404. The lines are not sent again and again.
  const old = new MockApi();
  old.linesSeenDoor = false;
  const asked: string[][] = [];
  const w2 = new SeenWatcher({
    send: (ids) => {
      asked.push(ids);
      return old.markLinesSeen(ids);
    },
    timers: c,
    now: c.now,
    observers: b.observers,
  });
  const row = new El('L9');
  w2.watch(asPane(new Pane().add(row)));
  b.shows(row, 1);
  c.advance(LINE_SEEN_AFTER_MS + LINE_SEEN_BATCH_MS);
  await settle();
  b.shows(row, 0);
  b.shows(row, 1);
  c.advance(LINE_SEEN_AFTER_MS + LINE_SEEN_BATCH_MS);
  await settle();
  assert.deepEqual(asked, [['L9']]);
  assert.deepEqual(old.linesSeenReports, []);

  // Offline: the report fails quietly and goes again the next time the line is in view.
  api.state.offline = true;
  const three = new El('L4');
  w.watch(asPane(new Pane().add(three)));
  b.shows(three, 1);
  c.advance(LINE_SEEN_AFTER_MS + LINE_SEEN_BATCH_MS);
  await settle();
  api.state.offline = false;
  b.shows(three, 0);
  b.shows(three, 1);
  c.advance(LINE_SEEN_AFTER_MS + LINE_SEEN_BATCH_MS);
  await settle();
  assert.deepEqual(api.linesSeenReports, [['L1', 'L2'], ['L1', 'L3'], ['L4']]);
});
