/**
 * A space in the vault: always on Today, and the team's retro readable in the chat pane.
 *
 * Runs in the unit-test entry, where `obsidian` THROWS: nothing here may touch the host.
 */

import { strict as assert } from 'node:assert';
import test from 'node:test';

import { MockApi } from '../src/transport/mock';
import type { MyuLineLite, RetroReadResult } from '../src/transport/api';
import { SPACE_RETRO_WORDS, SpaceRetroPanel, foldSpaceRows, isSpaceLine, outcomeWords, retroView, spaceRows, taskStanding } from '../src/spaceRetro';

const LOCKED = '[Encrypted content - unlock required]';
let n = 0;
function line(about: { type?: string; id?: string; label?: string } | null, text: string, more: Partial<MyuLineLite> = {}): MyuLineLite {
  return { line_id: `l${++n}`, subjects: about ? [about] : [], text, ask_kind: 'tell', state: 'released', ...more };
}

// ── Today: a space is always there ────────────────────────────────────────────

test('a space the person belongs to is on Today with NO line about it', () => {
  const rows = spaceRows([{ space_id: 's1', name: 'yah yah', kind: 'cofounder', status: 'active', member_count: 2 }], [line({ type: 'person', id: 'p1', label: 'Jim' }, 'x')]);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], { space_id: 's1', name: 'yah yah', small: 'Cofounders · 2 members', lines: [] });
});

test('a space row carries Myu’s lines about it, whether or not they need the person', () => {
  const about = { type: 'space', id: 's1', label: 'yah yah' };
  const lines = [line(about, 'Retro Monday at 2pm. Nothing needs your answer yet.'), line({ type: 'person', id: 'p1', label: 'Jim' }, 'x'), line(about, 'The questions are posted.')];
  const rows = spaceRows([{ space_id: 's1', name: 'yah yah' }], lines);
  assert.equal(rows[0].lines.length, 2);
  assert.ok(lines.filter(isSpaceLine).length === 2, 'and those lines leave "for you"');
});

test('a line filed under a person but belonging to a space’s conversation rides the space', () => {
  const l = line({ type: 'person', id: 'p1', label: 'Jim' }, 'About the retro.', { conversation: { subject_type: 'space', subject_id: 's1' } });
  assert.equal(isSpaceLine(l), true);
  assert.equal(spaceRows([{ space_id: 's1', name: 'yah yah' }], [l])[0].lines.length, 1);
});

test('the list could not be read: a space known from a line still gets its row', () => {
  const rows = spaceRows(null, [line({ type: 'space', id: 's9', label: 'Door team' }, 'Share what you want to bring up until Sunday.')]);
  assert.deepEqual(rows.map((r) => [r.space_id, r.name, r.small]), [['s9', 'Door team', '']]);
});

test('the list was read: an old line about a space that is no longer on it does NOT bring the space back', () => {
  // The operator's Today showed two archived spaces this way (2026-09-21): the list leaves
  // archived spaces out, but lines about them were still in the day's read.
  const lines = [line({ type: 'space', id: 'gone1', label: 'Old space' }, 'Retro Friday at 2pm.'), line({ type: 'space', id: 's1', label: 'yah yah' }, 'Retro Monday at 2pm.')];
  const rows = spaceRows([{ space_id: 's1', name: 'yah yah', status: 'active' }], lines);
  assert.deepEqual(rows.map((r) => r.name), ['yah yah']);
  assert.ok(isSpaceLine(lines[0]), 'and its line does not fall back under "for you" either');
  assert.deepEqual(spaceRows([], lines), [], 'in no space at all: no rows, whatever the lines say');
});

test('archived and dissolved spaces are not on Today; each space once', () => {
  const rows = spaceRows(
    [
      { space_id: 's1', name: 'A', status: 'active' },
      { space_id: 's2', name: 'B', status: 'archived' },
      { space_id: 's3', name: 'C', status: 'dissolved' },
      { space_id: 's1', name: 'A again', status: 'active' },
    ],
    [],
  );
  assert.deepEqual(rows.map((r) => r.name), ['A']);
});

// ── the team's retro ──────────────────────────────────────────────────────────

const READ: RetroReadResult = {
  success: true,
  retro: { retro_id: 'r1', number: 1, state: 'asking', reflects: { pushed: 2, members: 2 } },
  how_it_works: "The retro is every other week, on Friday at 2pm. Each person tells Myu privately what to bring up. Only what you approve goes up, with or without your name. You meet only if the team can't agree. Each retro hands out three tasks at most.",
  pinned: {},
  threads: [
    {
      thread_id: 't2',
      position: 2,
      kind: 'own_point',
      author: { name: 'Dana Okafor' },
      author_kind: 'person',
      text: 'Can we stop the Friday deploys?',
      state_text: 'Answer in your own words, whenever you like. 1 of 2 done.',
      replies: [],
    },
    {
      thread_id: 't1',
      position: 1,
      kind: 'question',
      author_kind: 'team_myu',
      text: 'What steps can we take to increase the number of parties?',
      state_text: 'Everyone accepts this.',
      replies: [
        { participant: { name: 'Masumi Nakamura' }, text: 'i disagree- we need more parties it helps with morale' },
        { participant: { name: 'Masumi Testtesttest' }, text: 'I need to find a better balance.' },
      ],
      merged: { text: 'Review capacity, not engineering capacity, is what slips the release.' },
    },
  ],
  todos: [
    { text: 'When a pull request is opened, the assigned reviewer starts the review that day.', state: 'drafted' },
    { text: 'Add a review slot.', state: 'taken', owner: { name: 'Dana' }, status_text: 'taken by Dana · Myu checks on Wednesday' },
  ],
};

test('the retro reads as the web shows it: one line on top, the fold, questions in order, who wrote what, the chosen summary, the tasks', () => {
  const v = retroView(READ);
  assert.equal(v.top, 'Retro 1 · handing out tasks', 'R20: the top is one line, from the fields');
  assert.equal(v.how, READ.how_it_works, 'the fold holds the backend\'s words as sent');
  assert.deepEqual(v.questions.map((q) => [q.title, q.from]), [['Question 1', 'Myu, for the team'], ['Question 2', 'Dana Okafor']]);
  assert.equal(v.questions[0].state, 'Everyone accepts this.');
  assert.deepEqual(v.questions[0].replies.map((r) => r.name), ['Masumi Nakamura', 'Masumi Testtesttest']);
  assert.equal(v.questions[0].summary, 'Review capacity, not engineering capacity, is what slips the release.');
  // R21: the server's sentence as sent, with its own short count; the page adds no count of its own.
  assert.equal(v.questions[1].state, 'Answer in your own words, whenever you like. 1 of 2 done.');
  assert.ok(!('count' in v.questions[1]), 'no client-side count');
  assert.deepEqual(v.tasks.map((t) => t.standing), ['not handed out yet', 'taken by Dana · Myu checks on Wednesday']);
  assert.equal(v.none, null);
  assert.equal(v.locked, false);
});

test('the top line, stage by stage (R20)', () => {
  const top = (retro: NonNullable<RetroReadResult['retro']>) => retroView({ retro, threads: [] }).top;
  assert.equal(top({ number: 1, state: 'preparing', reflects: { pushed: 1, members: 4 }, agenda_when: 'on Thursday at 2pm' }), 'Retro 1 · getting ready · 1 of 4 shared · questions up on Thursday at 2pm');
  assert.equal(top({ number: 1, state: 'discussing', reflects: { pushed: 4, members: 4 }, open_until: 'Friday' }), 'Retro 1 · open for answers · until Friday');
  assert.equal(top({ number: 1, state: 'asking' }), 'Retro 1 · handing out tasks');
  assert.equal(top({ number: 3, state: 'closed' }), 'Retro 3 · finished');
  // R21: the backend sends no header; the line is built from the fields, and a read with no state has none.
  assert.equal(top({ number: 3, state_text: 'open for answers' }), null);
  // `open_until` still comes with its "on" (the backend's RetroCopy.when): after "until" it goes.
  assert.equal(top({ number: 1, state: 'discussing', reflects: { pushed: 2, members: 2 }, open_until: 'Monday at 10:11am' }), 'Retro 1 · open for answers · until Monday at 10:11am');
});

test('nothing running, nothing held: one plain sentence, no empty headings, the fold under it', () => {
  const v = retroView({ success: true, pinned: {}, threads: [] });
  assert.equal(v.none, SPACE_RETRO_WORDS.none);
  assert.equal(v.how, null);
  assert.equal(retroView(null).none, SPACE_RETRO_WORDS.none);
  const withHow = retroView({ success: true, how_it_works: 'No retro is planned yet. Each person tells Myu privately what to bring up.', threads: [] });
  assert.equal(withHow.none, SPACE_RETRO_WORDS.none);
  assert.equal(withHow.how, 'No retro is planned yet. Each person tells Myu privately what to bring up.');
});

test("R21: a question's state is the server's sentence as sent, with its own count", () => {
  const st = (state: string, state_text: string) => retroView({ retro: { number: 1, state: 'discussing' }, threads: [{ thread_id: 't', position: 1, state, state_text }] }).questions[0].state;
  for (const said of [
    'Answer in your own words, whenever you like. 1 of 4 done.',
    'Three summaries of what was said. Put them in your order.',
    '0 of 4 voted.',
    '3 of 4 voted.',
    'The team was split. Here are three new summaries from what was said. Please vote again.',
    'Most people chose: We ship on Fridays. 2 of 4 accept it.',
    'No answers since Tuesday.',
  ]) assert.equal(st('open', said), said);
  assert.equal(st('open', '  '), '');
});

test('R21: no carried or outside words; an unknown outcome is its own word', () => {
  assert.equal(outcomeWords('unowned'), 'nobody took it');
  assert.equal(outcomeWords('carried'), 'carried');
  assert.equal(outcomeWords('outside'), 'outside');
});

test('locked words never reach the screen; the view says the space needs unlocking', () => {
  const v = retroView({ retro: { number: 1, state: 'discussing' }, threads: [{ thread_id: 't1', position: 1, text: LOCKED, replies: [{ participant: { name: 'Dana' }, text: LOCKED }], merged: { text: LOCKED } }], todos: [{ text: LOCKED, state: 'drafted' }] });
  assert.equal(v.locked, true);
  assert.equal(v.questions[0].text, '');
  assert.equal(v.questions[0].replies.length, 0);
  assert.equal(v.questions[0].summary, null);
  assert.equal(v.tasks.length, 0);
  assert.ok(!JSON.stringify(v).includes('Encrypted content'));
});

test('results since the last retro: what, who, and what became of it', () => {
  const v = retroView({ retro: { number: 2, state: 'preparing' }, pinned: { results: { text: 'Two of three tasks were done.', items: [{ what: 'Own the review queue', outcome: 'kept', owner: { name: 'Dana' } }, { what: 'Write the runbook', outcome: 'unowned' }] } }, threads: [] });
  assert.deepEqual(v.results, { text: 'Two of three tasks were done.', items: ['Own the review queue (Dana) — done', 'Write the runbook — nobody took it'] });
});

test('a task with no words from the backend still says where it stands, in plain words', () => {
  assert.equal(taskStanding({ state: 'asking' }), 'Myu is asking someone to take it');
  assert.equal(taskStanding({ state: 'unowned' }), 'nobody took it');
  assert.equal(taskStanding({ state: 'taken', owner: { name: 'Sam' }, status: 'running_late' }), 'taken by Sam · running late');
  assert.equal(taskStanding({ state: 'taken', status: 'on_track' }), 'taken');
});

// ── the panel: closed until asked for, read when opened, read again when the space changes ──

test('the panel is closed at first and reads nothing until it is opened', async () => {
  const api = new MockApi();
  let reads = 0;
  const backend = { getRetro: (id: string) => (reads++, api.getRetro(id)) };
  let changes = 0;
  const panel = new SpaceRetroPanel('s1', { backend, onChange: () => changes++ });
  assert.deepEqual(panel.screen(), { open: false, loading: false, failed: false, view: null, howOpen: false });
  await panel.refresh();
  assert.equal(reads, 0, 'a closed panel does not read');
  await panel.toggle();
  assert.equal(reads, 1);
  const s = panel.screen();
  assert.equal(s.open, true);
  assert.equal(s.view?.questions.length, 1);
  assert.ok(changes >= 2, 'painted while loading and again when read');
  await panel.refresh();
  assert.equal(reads, 2, 'the space changed: an open panel reads again');
  panel.hide();
  assert.equal(panel.screen().open, false, 'back to the conversation');
  panel.hide();
  await panel.show();
  await panel.show();
  assert.equal(panel.screen().open, true, 'show() opens once and never closes');
});

test('"How this works" is open the first time this account sees a retro page, and closed after (R20)', async () => {
  const api = new MockApi();
  const store: Record<string, boolean> = {};
  const howSeen = { seen: () => !!store.k, markSeen: () => { store.k = true; } };
  const first = new SpaceRetroPanel('s1', { backend: api, onChange: () => {}, howSeen });
  await first.show();
  assert.equal(first.screen().howOpen, true, 'the first time: open');
  assert.equal(store.k, true, 'remembered');
  await first.refresh();
  assert.equal(first.screen().howOpen, true, 'a re-read does not close it under the person');
  first.toggleHow();
  assert.equal(first.screen().howOpen, false, 'the person closes it');
  const next = new SpaceRetroPanel('s1', { backend: api, onChange: () => {}, howSeen });
  await next.show();
  assert.equal(next.screen().howOpen, false, 'the next load: closed');
  next.toggleHow();
  assert.equal(next.screen().howOpen, true, 'and it opens when pressed');
  // A read with no how_it_works neither opens it nor uses up the first time.
  const bare = new MockApi();
  bare.retroRead = { retro: { number: 1, state: 'preparing' }, threads: [] };
  const store2: Record<string, boolean> = {};
  const p = new SpaceRetroPanel('s1', { backend: bare, onChange: () => {}, howSeen: { seen: () => !!store2.k, markSeen: () => { store2.k = true; } } });
  await p.show();
  assert.equal(p.screen().howOpen, false);
  assert.equal(store2.k, undefined);
});

test('a read that fails says so and keeps what was already shown', async () => {
  const api = new MockApi();
  const panel = new SpaceRetroPanel('s1', { backend: api, onChange: () => {} });
  await panel.toggle();
  assert.equal(panel.screen().failed, false);
  api.state.offline = true;
  await panel.refresh();
  assert.equal(panel.screen().failed, true);
  assert.ok(panel.screen().view, 'the last good read stays on screen');
});

test('many spaces: the ones that need you first and never folded, three show, the rest fold', () => {
  const rows = spaceRows(Array.from({ length: 6 }, (_, i) => ({ space_id: `s${i}`, name: `Space ${i}` })), [line({ type: 'space', id: 's4', label: 'Space 4' }, 'Myu is asking you.', { needs_you: true, ask_kind: 'open' })]);
  const needs = (r: { lines: MyuLineLite[] }) => r.lines.some((l) => !!l.needs_you);
  const { shown, folded } = foldSpaceRows(rows, needs);
  assert.deepEqual(shown.map((r) => r.name), ['Space 4', 'Space 0', 'Space 1']);
  assert.equal(folded.length, 3);
  assert.equal(foldSpaceRows(rows.slice(0, 2), needs).folded.length, 0, 'one or two spaces: nothing folds');
});
