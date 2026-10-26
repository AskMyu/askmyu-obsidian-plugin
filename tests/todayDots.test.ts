/**
 * The dots beside the Today pane's rows (2026-10-06, the operator's rule: orange is always new), on the functional UI
 * fake. A row is lit while something came in for it since Today was opened before this visit (a question or a note
 * alike), and grey while a question there waits for an answer. With no marks from the server nothing is lit. An
 * opening, and every change of the marks, repaints the dots where they are.
 */

import { strict as assert } from 'node:assert';
import test from 'node:test';

import { FakeEl } from './ui-stub';
import type { MyuLineLite } from '../src/transport/api';
import type { MenuMarks } from '../src/menuMarks';
import { MenuMarksKeeper } from '../src/menuMarksBar';
import { TodayView } from '../src/views/TodayView';

/** A day by hand: 6 October 2026, the hour given, in the machine's own zone. */
const hour = (h: number, m = 0) => new Date(2026, 9, 6, h, m, 0).getTime();
const iso = (ms: number) => new Date(ms).toISOString();
const tick = () => new Promise((r) => setImmediate(r));

const person = (id: string, label: string) => [{ type: 'person', id, label }];
/** The day's lines: Today was last opened at 9:00; some came in before, some after. */
const LINES: MyuLineLite[] = [
  { line_id: 'n-new', subjects: person('p1', 'Ana New-note'), text: 'Ana replied to your pricing note.', ask_kind: 'tell', needs_you: false, state: 'released', created_at: iso(hour(10)) },
  // Made earlier, released to the person after the opening: it came in when it was released.
  { line_id: 'q-new', subjects: person('p2', 'Ben New-question'), text: 'Is Ben still on the pricing work?', ask_kind: 'yes_no', needs_you: true, state: 'released', created_at: iso(hour(7)), released_at: iso(hour(10)) },
  { line_id: 'q-old', subjects: person('p3', 'Cy Old-question'), text: 'Hold Thursday for the review?', ask_kind: 'yes_no', needs_you: true, state: 'released', created_at: iso(hour(8)) },
  { line_id: 'n-old', subjects: person('p4', 'Di Old-note'), text: 'Di sent the contract yesterday.', ask_kind: 'tell', needs_you: false, state: 'released', created_at: iso(hour(8)) },
  // Answered: neither new nor waiting, though it is still on the list.
  { line_id: 'q-done', subjects: person('p5', 'Eli Answered'), text: 'Did the invoice go out?', ask_kind: 'yes_no', needs_you: true, state: 'answered', created_at: iso(hour(11)) },
  { line_id: 's-new', subjects: [{ type: 'space', id: 's1', label: 'Door team' }], text: 'Two questions are up.', ask_kind: 'tell', needs_you: false, state: 'released', created_at: iso(hour(11)) },
  { line_id: 'm-old', subjects: [{ type: 'meeting', id: 'evt-1' }], text: 'What do you want out of the sync?', ask_kind: 'choice', needs_you: true, state: 'released', created_at: iso(hour(8)) },
];

const MARKS = (openedHome: number): MenuMarks => ({ day: '2026-10-06', marks: { home: { new: 3, waiting: 3 } }, opened: { home: openedHome } });

/** The Today pane's rows on the fake, with the plugin's keeper behind them: every change of the marks repaints the dots. */
function mount(opts: { marks?: MenuMarks | null; keeper?: boolean } = {}) {
  const clock = { now: hour(12) };
  const told: string[] = [];
  const view = Object.create(TodayView.prototype) as InstanceType<typeof TodayView> & Record<string, unknown>;
  const keeper = new MenuMarksKeeper({
    doors: () => ({
      getMenuMarks: async () => opts.marks ?? null,
      markMenuOpened: async (item) => {
        told.push(item);
        return null;
      },
    }),
    // As the plugin does: the status bar, then the Today pane's dots.
    onChange: () => view.paintDots(),
    timers: { set: () => 0, clear: () => undefined },
    now: () => clock.now,
  });
  view['plugin'] = { settings: {}, backend: {}, termsStanding: () => 'ok', openChatAbout: async () => undefined, openPrep: async () => undefined, ...(opts.keeper === false ? {} : { menuMarks: keeper }) };
  view['loading'] = false;
  view['errorState'] = null;
  view['todayLines'] = LINES.map((l) => ({ ...l }));
  view['spaces'] = [{ space_id: 's1', name: 'Door team', kind: 'small_team', member_count: 4, status: 'active' }];
  view['spaceDoors'] = new Map<string, string>();
  view['meetings'] = [{ event_id: 'evt-1', summary: 'Pricing sync', attendee_emails: ['a', 'b'], startDate: new Date(Date.now() + 3600_000) }];
  view['openStacks'] = new Set<string>();
  view['spacesOpen'] = false;
  view['forYouOpen'] = true;
  const root = new FakeEl('div');
  const draw = () => {
    root.empty();
    const v = view as unknown as { dots: unknown[]; renderSpaces(r: unknown): void; renderForYou(r: unknown): void; renderNext(r: unknown): void };
    v.dots = [];
    v.renderSpaces(root);
    v.renderForYou(root);
    v.renderNext(root);
  };
  /** Each row's dot by the row's title: "new", "waiting", or none; with its words for a screen reader. */
  const dots = (): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const row of root.querySelectorAll('.myu-mrow')) {
      const title = row.querySelector('.myu-ttl')?.text ?? '';
      const dot = row.querySelector('.myu-dot');
      out[title] = !dot ? 'none' : `${dot.classes.has('myu-dot-waiting') ? 'waiting' : 'new'}: ${dot.attrs['aria-label']}`;
    }
    return out;
  };
  return { view, keeper, clock, told, root, draw, dots };
}

test('the dot each kind of row gets: a new note and a new question are lit, an old question is grey, an old note has none', async () => {
  const m = mount({ marks: MARKS(hour(9)) });
  await m.keeper.load();
  m.draw();
  assert.deepEqual(m.dots(), {
    'Door team': 'new: New',
    'Ana New-note': 'new: New',
    'Ben New-question': 'new: New',
    'Cy Old-question': 'waiting: Waiting for your answer',
    'Di Old-note': 'none',
    'Eli Answered': 'none',
    'Pricing sync': 'waiting: Waiting for your answer',
  });
  // One shape, two colours: the lit dot is `myu-dot` alone; the grey one adds `myu-dot-waiting`. Never both meanings.
  const lit = m.root.querySelectorAll('.myu-dot').filter((d) => !d.classes.has('myu-dot-waiting'));
  assert.equal(lit.length, 3);
  assert.ok(lit.every((d) => d.attrs['aria-label'] === 'New'));
  assert.ok(!m.root.visibleTexts().join(' ').includes('needs something from you'));
});

test('no marks from the server: nothing is lit; a question that waits is still grey', async () => {
  const expected = {
    'Door team': 'none',
    'Ana New-note': 'none',
    'Ben New-question': 'waiting: Waiting for your answer',
    'Cy Old-question': 'waiting: Waiting for your answer',
    'Di Old-note': 'none',
    'Eli Answered': 'none',
    'Pricing sync': 'waiting: Waiting for your answer',
  };
  // A server without the door (404).
  const old = mount({ marks: null });
  await old.keeper.load();
  old.draw();
  assert.deepEqual(old.dots(), expected);
  // Not read yet, and a pane with no keeper at all.
  const early = mount({ marks: MARKS(hour(9)) });
  early.draw();
  assert.deepEqual(early.dots(), expected);
  const bare = mount({ keeper: false });
  bare.draw();
  assert.deepEqual(bare.dots(), expected);
});

test('Today starts again each morning: opened last night, what came in today is new; yesterday’s is not', async () => {
  const m = mount({ marks: MARKS(new Date(2026, 9, 5, 22, 0, 0).getTime()) });
  await m.keeper.load();
  (m.view as unknown as { todayLines: MyuLineLite[] }).todayLines.push({ line_id: 'n-yesterday', subjects: person('p9', 'Flo Yesterday'), text: 'Flo wrote back.', ask_kind: 'tell', state: 'released', created_at: iso(new Date(2026, 9, 5, 23, 0, 0).getTime()) });
  m.draw();
  const dots = m.dots();
  assert.equal(dots['Flo Yesterday'], 'none', 'after the last opening, but before this morning');
  assert.equal(dots['Cy Old-question'], 'new: New', 'this morning, since it was last opened');
  assert.equal(dots['Di Old-note'], 'new: New');
});

test('an opening repaints the dots where they are: lit for the visit that first shows them, then grey or gone', async () => {
  const m = mount({ marks: MARKS(hour(9)) });
  await m.keeper.load();
  m.draw();
  const rows = m.root.querySelectorAll('.myu-mrow');
  const before = m.dots();

  // Today is brought forward: the server is told, the marks take the new stamp, and this visit still shows what is new.
  m.keeper.opened('home');
  await tick();
  assert.deepEqual(m.told, ['home']);
  assert.equal(m.keeper.marks?.opened?.home, hour(12));
  assert.deepEqual(m.dots(), before);

  // Brought forward again later: what was new has been shown. A question among it waits, in grey; a note has no dot.
  m.clock.now = hour(12, 5);
  m.keeper.opened('home');
  await tick();
  assert.deepEqual(m.dots(), {
    'Door team': 'none',
    'Ana New-note': 'none',
    'Ben New-question': 'waiting: Waiting for your answer',
    'Cy Old-question': 'waiting: Waiting for your answer',
    'Di Old-note': 'none',
    'Eli Answered': 'none',
    'Pricing sync': 'waiting: Waiting for your answer',
  });
  const after = m.root.querySelectorAll('.myu-mrow');
  assert.ok(after.length === rows.length && after.every((row, i) => row === rows[i]), 'the same rows: only their dots were repainted');

  // The marks move (the server's push): painted again; something that came in since is lit once the pane has it.
  (m.view as unknown as { todayLines: MyuLineLite[] }).todayLines.push({ line_id: 'n-later', subjects: person('p1', 'Ana New-note'), text: 'Ana sent the numbers.', ask_kind: 'tell', state: 'released', created_at: iso(hour(12, 6)) });
  m.draw();
  m.keeper.take({ ...MARKS(hour(12, 5)), marks: { home: { new: 1, waiting: 3 } } });
  assert.equal(m.dots()['Ana New-note'], 'new: New');

  // Signed out or locked: the marks go, and with them every lit dot.
  m.keeper.reset();
  assert.equal(m.dots()['Ana New-note'], 'none');
  assert.equal(m.dots()['Cy Old-question'], 'waiting: Waiting for your answer');
});

test('while the pane opens, rests or waits at the terms, there are no dots to repaint', () => {
  const m = mount({ marks: MARKS(hour(9)) });
  m.draw();
  let painted = 0;
  (m.view as unknown as { dots: Array<() => void> }).dots = [() => void (painted += 1)];
  m.view.paintDots();
  assert.equal(painted, 1);
  (m.view as unknown as { loading: boolean }).loading = true;
  m.view.paintDots();
  (m.view as unknown as { loading: boolean; errorState: string | null }).loading = false;
  (m.view as unknown as { errorState: string | null }).errorState = 'locked';
  m.view.paintDots();
  (m.view as unknown as { errorState: string | null }).errorState = null;
  (m.view as unknown as { plugin: { termsStanding: () => string } }).plugin.termsStanding = () => 'gated';
  m.view.paintDots();
  assert.equal(painted, 1);
});
