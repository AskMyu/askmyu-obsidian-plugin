/**
 * The last moments of the week, in the vault's panes (2026-11-13), on the functional UI fake: a full-day line's Keep · Move it ·
 * Not a promise, "Which day?" with the free days and another day's date, the message an answer brings under "Myu's message to Priya:"
 * with Copy; "Add it?" and where the addition goes; what has repeated, they may ask about and your side of the work, each sentence
 * opening to what it rests on. Nothing is sent from the vault.
 */

import { strict as assert } from 'node:assert';
import test from 'node:test';

import { FakeEl } from './ui-stub';
import { MockApi } from '../src/transport/mock';
import type { MyuLineLite } from '../src/transport/api';
import { pressLineButton, type LineButton, type LineUi } from '../src/lineAnswers';
import { renderLineAsk } from '../src/views/lineAsk';
import { renderMayAsk, renderRepeated, renderYourWeek } from '../src/views/lastMomentsParts';
import { mayAskOf, repeatedOf, yourWeekOf } from '../src/lastMomentsVault';

const API = 'https://myu.askmyu.com/api';
const NOW = new Date(2026, 10, 13, 12, 0).getTime();
const at = (daysAgo: number, h = 9, m = 20) => new Date(2026, 10, 13 - daysAgo, h, m).getTime();
const settle = () => new Promise((r) => setTimeout(r, 0));

/** A row as a pane keeps it: the line's state between answers, redrawn after each press (as lineAnswersPane.test.ts mounts it). */
function mount(api: MockApi, l: MyuLineLite) {
  let ui: LineUi = {};
  let host = new FakeEl('div');
  const paint = () => {
    host = new FakeEl('div');
    renderLineAsk(host as unknown as HTMLElement, l, ui, { press: (b) => void press(b) });
  };
  const press = async (b: LineButton) => {
    ui = { busy: true };
    paint();
    const out = await pressLineButton({ answer: (id, a) => api.answerMyuLine(id, a), apiBase: API }, l, b);
    ui = out.ui;
    paint();
  };
  paint();
  return { host: () => host, paint };
}
const buttons = (el: FakeEl) => el.querySelectorAll('button').map((b) => b.text);

const fullDay = (id: string): MyuLineLite =>
  ({
    line_id: id,
    kind: 'full_day',
    ask_kind: 'choice',
    subjects: [{ type: 'person', id: 'rel-priya', label: 'Priya Raman' }],
    text: 'You told Priya the pricing sheet by Thursday. That is the fourth thing due Thursday. Keep it?',
    choices: [{ id: 'keep', label: 'Keep' }, { id: 'move', label: 'Move it' }, { id: 'not_promise', label: 'Not a promise' }],
    free_days: ['2026-11-16', '2026-11-17'],
    state: 'released',
  }) as MyuLineLite;

const MOVED = {
  success: true,
  readback: { text: 'Moved to Monday 16 November.' },
  draft: { to: [{ name: 'Priya Raman', address: 'priya@corvid.test' }], in: 'mail', text: 'Hi Priya, the pricing sheet will come Monday instead of Thursday.' },
};

test('a full-day line: its words, Keep · Move it · Not a promise; Move it opens "Which day?" and answers nothing', () => {
  const api = new MockApi();
  const l = fullDay('FD-p1');
  api.dayLines = [l];
  const m = mount(api, l);
  assert.ok(m.host().visibleTexts().includes('You told Priya the pricing sheet by Thursday. That is the fourth thing due Thursday. Keep it?'));
  assert.deepEqual(buttons(m.host()), ['Keep', 'Move it', 'Not a promise'], 'no "Not now", no "Don\'t ask again"');
  assert.ok(!m.host().visibleTexts().includes('Which day?'));
  const move = m.host().find((e) => e.text === 'Move it')!;
  assert.equal(move.attrs['aria-expanded'], 'false');
  void move.onclick!();
  assert.deepEqual(api.dayAnswered, [], 'Move it alone answers nothing');
  assert.equal(move.attrs['aria-expanded'], 'true');
  const texts = m.host().visibleTexts();
  assert.ok(texts.includes('Which day?'));
  assert.ok(texts.includes('Monday 16 November') && texts.includes('Tuesday 17 November'), 'the free days first, in words');
  assert.ok(texts.includes('Another day'));
  const field = m.host().querySelector('.myu-lm-date')!;
  assert.equal(field.tag, 'input');
  assert.equal(field.attrs.type, 'date');
  assert.equal(field.attrs['aria-label'], 'Another day');
  assert.equal(m.host().querySelector('.myu-lm-move')?.disabled, true, 'no day typed, nothing to move to');
  // A redraw keeps it open; pressing Move it again closes it.
  m.paint();
  assert.ok(m.host().visibleTexts().includes('Which day?'));
  void m.host().find((e) => e.text === 'Move it')!.onclick!();
  assert.ok(!m.host().visibleTexts().includes('Which day?'));
  m.paint();
  assert.ok(!m.host().visibleTexts().includes('Which day?'));
});

test('a free day picked answers {choice_id: "move", day}; the readback, then "Myu’s message to Priya:" and the message with Copy', async () => {
  const api = new MockApi();
  const l = fullDay('FD-p2');
  api.dayLines = [l];
  api.dayAnswers['FD-p2'] = () => MOVED;
  const m = mount(api, l);
  await m.host().click('Move it');
  assert.ok(await m.host().click('Monday 16 November'));
  await settle();
  assert.deepEqual(api.dayAnswered, [{ line_id: 'FD-p2', answer: { choice_id: 'move', day: '2026-11-16' } }]);
  const texts = m.host().visibleTexts();
  assert.ok(texts.includes('Moved to Monday 16 November.'));
  assert.ok(texts.indexOf("Myu's message to Priya:") > texts.indexOf('Moved to Monday 16 November.'), 'the readback, then the line over the message');
  const box = m.host().querySelector('.myu-line-draft-box')!;
  assert.equal(box.value, 'Hi Priya, the pricing sheet will come Monday instead of Thursday.');
  assert.equal(box.attrs['aria-label'], 'Your message to Priya');
  assert.ok(buttons(m.host()).includes('Copy it'));
  assert.ok(!buttons(m.host()).includes('Send'), 'nothing is sent from the vault');
  assert.ok(!texts.includes('Which day?'), 'answered, "Which day?" is gone');
  // Drawn again from scratch (another pane's redraw), the line's day question stays closed.
  m.paint();
  assert.ok(!m.host().visibleTexts().includes('Which day?'));
});

test('another day typed answers with that day; a day that is not one is not sent', async () => {
  const api = new MockApi();
  const l = fullDay('FD-p3');
  api.dayLines = [l];
  api.dayAnswers['FD-p3'] = () => MOVED;
  const m = mount(api, l);
  await m.host().click('Move it');
  const field = m.host().querySelector('.myu-lm-date')!;
  const go = m.host().querySelector('.myu-lm-move')!;
  assert.equal(go.text, 'Move it');
  field.value = '2026-02-30';
  field.dispatch('input');
  assert.equal(go.disabled, true);
  field.value = '2026-11-20';
  field.dispatch('change');
  assert.equal(go.disabled, false);
  // The typed day survives a redraw.
  m.paint();
  assert.equal(m.host().querySelector('.myu-lm-date')!.value, '2026-11-20');
  await m.host().querySelector('.myu-lm-move')!.onclick!();
  await settle();
  assert.deepEqual(api.dayAnswered, [{ line_id: 'FD-p3', answer: { choice_id: 'move', day: '2026-11-20' } }]);
});

test('Keep answers at once; a failed answer says so and keeps "Which day?" open', async () => {
  const api = new MockApi();
  const l = fullDay('FD-p4');
  api.dayLines = [l];
  api.dayAnswers['FD-p4'] = () => ({ success: true, readback: { text: 'Kept. Thursday stays.' } });
  const m = mount(api, l);
  await m.host().click('Keep');
  await settle();
  assert.deepEqual(api.dayAnswered, [{ line_id: 'FD-p4', answer: { choice_id: 'keep' } }]);
  assert.ok(m.host().visibleTexts().includes('Kept. Thursday stays.'));

  const off = new MockApi();
  const l2 = fullDay('FD-p5');
  off.dayLines = [l2];
  off.state.offline = true;
  const m2 = mount(off, l2);
  await m2.host().click('Move it');
  await m2.host().click('Tuesday 17 November');
  await settle();
  const texts = m2.host().visibleTexts();
  assert.ok(texts.includes("You're offline. Try again when you're back online."));
  assert.ok(texts.includes('Which day?'), 'the days stay, to pick again');
});

test('"Add it?": Add it · No; Add it shows the readback, where it goes, and the addition with Copy', async () => {
  const api = new MockApi();
  const l: MyuLineLite = {
    line_id: 'BO-p1',
    kind: 'answer_bears_on',
    ask_kind: 'choice',
    subjects: [{ type: 'person', id: 'rel-jonah', label: 'Jonah Wells' }],
    text: 'Jonah answered in #prd-review: the export runs nightly. It bears on what you sent Omar on Monday. Add it?',
    choices: [{ id: 'add', label: 'Add it' }, { id: 'no', label: 'No' }],
    state: 'released',
  };
  api.dayLines = [l];
  api.dayAnswers['BO-p1'] = () => ({
    success: true,
    readback: { text: 'Here is the addition. Copy it and add it where it goes.' },
    draft: { to: ['prd-review'], in: 'slack', thread_ref: '1731400000.000100', text: 'Adding to Monday: Jonah says the export runs nightly.' },
  });
  const m = mount(api, l);
  assert.deepEqual(buttons(m.host()), ['Add it', 'No']);
  assert.ok(await m.host().click('Add it'));
  await settle();
  assert.deepEqual(api.dayAnswered, [{ line_id: 'BO-p1', answer: { choice_id: 'add' } }]);
  const texts = m.host().visibleTexts();
  assert.ok(texts.includes('Here is the addition. Copy it and add it where it goes.'));
  assert.ok(texts.includes('To prd-review in Slack'));
  assert.ok(!texts.some((t) => t.includes('1731400000')), 'the thread is never shown');
  assert.equal(m.host().querySelector('.myu-line-draft-box')!.value, 'Adding to Monday: Jonah says the export runs nightly.');
  assert.ok(buttons(m.host()).includes('Copy it'));
});

// ── the drawn parts ─────────────────────────────────────────

test('what has repeated: the heading, each sentence; opened, its sources (the day, the words, the link); nothing when there is nothing', async () => {
  const items = repeatedOf({
    noticed: [
      {
        text: 'You asked Omar for a change summary on 3 pull requests this month.',
        count: 3,
        sources: [
          { quote: 'Can you add a change summary?', when_ms: at(4), link: 'https://github.com/corvid/api/pull/88#issuecomment-1' },
          { quote: 'Same ask as last time.', when_ms: null, link: 'javascript:alert(1)' },
        ],
      },
      { text: 'Omar reviewed your pull requests within a day, 5 times.', count: 5, sources: [] },
    ],
  });
  const root = new FakeEl('div');
  const opened = new Set<string>();
  renderRepeated(root as unknown as HTMLElement, items, opened, NOW);
  assert.deepEqual(root.visibleTexts(), ['What has repeated', 'You asked Omar for a change summary on 3 pull requests this month.', 'Omar reviewed your pull requests within a day, 5 times.']);
  // The one with sources is pressable; the other is its words alone.
  assert.equal(root.find((e) => e.text === 'Omar reviewed your pull requests within a day, 5 times.')?.tag, 'div');
  assert.ok(await root.click('You asked Omar for a change summary on 3 pull requests this month.'));
  assert.deepEqual(root.querySelectorAll('.myu-lm-source').map((r) => r.visibleTexts().join('')), ['Monday: “Can you add a change summary?”', '“Same ask as last time.”']);
  const links = root.querySelectorAll('a');
  assert.deepEqual(links.map((a) => [a.text, a.attrs.href]), [['“Can you add a change summary?”', 'https://github.com/corvid/api/pull/88#issuecomment-1']], 'only a web address is a link');
  // Kept open across a redraw, closed by a second press.
  const again = new FakeEl('div');
  renderRepeated(again as unknown as HTMLElement, items, opened, NOW);
  assert.equal(again.querySelectorAll('.myu-lm-source').length, 2);
  await again.click('You asked Omar for a change summary on 3 pull requests this month.');
  assert.equal(again.querySelectorAll('.myu-lm-source').length, 0);
  const none = new FakeEl('div');
  renderRepeated(none as unknown as HTMLElement, [], new Set(), NOW);
  assert.equal(none.children.length, 0);
});

test('they may ask about: three at most, the steps with their days, what you told them, the sources when opened', async () => {
  const items = mayAskOf({
    may_ask: [
      {
        text: 'The rollout moved from Tuesday to Thursday.',
        steps: [{ text: 'Planned for Tuesday', at_ms: at(10) }, { text: 'Moved to Thursday after the load test', at_ms: at(1, 14, 2) }],
        told: [{ to: 'Sofia', when_ms: at(1), quote: 'Thursday, once the load test is green.' }],
        sources: [{ quote: 'Moving the rollout to Thursday.', when_ms: at(1), link: 'https://corvid.slack.com/archives/C1/p1' }],
      },
      { text: 'Dan Park asked about the import tool.', told: [{ sentence: 'You told Dan on Monday: “It ships next sprint.”' }], sources: [] },
      { text: 'The pricing sheet is late.' },
      { text: 'A fourth is not shown.' },
    ],
  });
  const root = new FakeEl('div');
  renderMayAsk(root as unknown as HTMLElement, items, new Set(), NOW);
  const texts = root.visibleTexts();
  assert.equal(texts[0], 'They may ask about');
  assert.ok(!texts.includes('A fourth is not shown.'));
  assert.deepEqual(root.querySelectorAll('.myu-lm-step').map((s) => s.visibleTexts()), [['3 November 09:20', 'Planned for Tuesday'], ['Yesterday 14:02', 'Moved to Thursday after the load test']]);
  assert.deepEqual(root.querySelectorAll('.myu-lm-told').map((t) => t.text), ['You told Sofia yesterday: “Thursday, once the load test is green.”', 'You told Dan on Monday: “It ships next sprint.”']);
  assert.equal(root.querySelectorAll('.myu-lm-source').length, 0);
  await root.click('The rollout moved from Tuesday to Thursday.');
  assert.deepEqual(root.querySelectorAll('.myu-lm-source').map((r) => r.visibleTexts().join('')), ['Yesterday: “Moving the rollout to Thursday.”']);
  const none = new FakeEl('div');
  renderMayAsk(none as unknown as HTMLElement, mayAskOf({ may_ask: [] }), new Set(), NOW);
  assert.equal(none.children.length, 0);
});

test('your side of the work: each count’s sentence opening to what it counted, your goals beside it; no number, no chart for zero', async () => {
  const week = yourWeekOf(null, {
    your_side: {
      range: { from_day: '2026-11-09', to_day: '2026-11-13' },
      counts: [
        { key: 'asks_reached', count: 3, sentence: '3 asks reached you: all answered.', items: [{ text: 'Priya: the pricing sheet', link: 'https://mail.google.com/mail/u/0/#inbox/1' }] },
        { key: 'promises', count: 2, sentence: 'You made 2 promises: 1 kept, 1 open.', items: [{ text: 'The import tool demo', link: null, who: 'Jonah' }] },
        { key: 'went_against', count: 0, sentence: 'Nothing went against what you decided.', items: [] },
      ],
      goals: [{ goal: 'Ship the import tool', count: 3, example: { text: 'Merged the CSV mapping', link: null } }],
    },
  })!;
  const root = new FakeEl('div');
  renderYourWeek(root as unknown as HTMLElement, week, new Set());
  assert.deepEqual(root.visibleTexts(), [
    'Your side of the work',
    '3 asks reached you: all answered.',
    'You made 2 promises: 1 kept, 1 open.',
    'Your goals',
    'Ship the import tool: 3',
    'Merged the CSV mapping',
  ]);
  await root.click('You made 2 promises: 1 kept, 1 open.');
  assert.ok(root.visibleTexts().includes('The import tool demo · Jonah'));
  await root.click('3 asks reached you: all answered.');
  assert.deepEqual(root.querySelectorAll('a').map((a) => [a.text, a.attrs.href]), [['Priya: the pricing sheet', 'https://mail.google.com/mail/u/0/#inbox/1']]);
});

test('a promise someone else’s decision affects: its words with their line breaks, Tell Priya · Let it go · Keep it; Tell shows the message to copy', async () => {
  const text = 'Jonah decided, today: “We drop the CSV export from the Q1 release.”\nThat affects something you promised:\n • You promised Priya, Monday: “The CSV export ships Friday.”';
  const l: MyuLineLite = {
    line_id: 'CP-p1',
    kind: 'check_promise',
    ask_kind: 'choice',
    subjects: [{ type: 'person', id: 'rel-priya', label: 'Priya Raman' }],
    text,
    choices: [{ id: 'tell', label: 'Tell Priya' }, { id: 'let_go', label: 'Let it go' }, { id: 'keep', label: 'Keep it' }],
    state: 'released',
  };
  const api = new MockApi();
  api.dayLines = [l];
  api.dayAnswers['CP-p1'] = () => ({
    success: true,
    readback: { text: '' },
    effects: [{ type: 'check_promise_draft', readback: 'Here it is, to send.', draft: { to: ['Priya Raman'], in: 'slack', thread_ref: '1731400000.000200', text: 'About the CSV export: Jonah has decided to drop it from the Q1 release, so this has changed.' } }],
  });
  const m = mount(api, l);
  // Short first (2026-11-19): its first two lines, a quiet "read all", and its choices under them already.
  // Its second line ends on a heading ("That affects something you promised:"), so its first item comes with it (2026-11-19): with
  // nothing after that item, the words show whole, nothing to open.
  const words = m.host().find((e) => e.text === text)!;
  assert.ok(words, 'the words as sent, line breaks and all');
  assert.ok(words.classes.has('myu-line-words'));
  assert.deepEqual(buttons(m.host()), ['Tell Priya', 'Let it go', 'Keep it', 'Not now'], '"Let it go" is its way out: "Not now" only (the one rule)');
  assert.ok(!m.host().find((e) => e.text === 'Let it go')!.classes.has('myu-line-quiet'), 'drawn as every choice is (2026-11-19)');
  assert.ok(m.host().find((e) => e.text === 'Not now')!.classes.has('myu-line-quiet'));
  assert.ok(await m.host().click('Tell Priya'));
  await settle();
  assert.deepEqual(api.dayAnswered, [{ line_id: 'CP-p1', answer: { choice_id: 'tell' } }]);
  const texts = m.host().visibleTexts();
  assert.deepEqual(texts.slice(0, 2), ['Here it is, to send.', 'To Priya in Slack'], 'the readback, then where it goes');
  assert.equal(m.host().querySelector('.myu-line-draft-box')!.value, 'About the CSV export: Jonah has decided to drop it from the Q1 release, so this has changed.');
  assert.ok(buttons(m.host()).includes('Copy it'));
  assert.ok(!texts.some((t) => t.includes('1731400000')), 'the thread is never shown');

  const go = new MockApi();
  const l2: MyuLineLite = { ...l, line_id: 'CP-p2', state: 'released' };
  go.dayLines = [l2];
  go.dayAnswers['CP-p2'] = () => ({ success: true, readback: { text: 'Let go. Nothing was said to anyone.' } });
  const m2 = mount(go, l2);
  await m2.host().click('Let it go');
  await settle();
  assert.deepEqual(m2.host().visibleTexts(), ['Let go. Nothing was said to anyone.']);
});
