/**
 * The person's list on the Today pane (2026-10-29, BRIEF_WEB_PREP_NOTES §1), on the functional UI fake over the mock's
 * lines read and list doors: a meeting's row has Open ▸ as its only link, "· n to cover" on its title, three items and
 * "+n more" under it; "Later this week" for the meetings with an open list question; under the question the list's add
 * box, Enter adds, the item appears at once with a live checkbox, "On the list for {day}." and the box stays open; no
 * Skip. The items carried from a meeting with no next one yet wait under their person.
 */

import { strict as assert } from 'node:assert';
import test from 'node:test';

import { FakeEl } from './ui-stub';
import { MockApi } from '../src/transport/mock';
import type { MyuLineLite } from '../src/transport/api';
import type { LinesMeeting, PrepListItem } from '../src/wire';
import { TodayView } from '../src/views/TodayView';
import { prepDayWord, prepTimeWords } from '../src/prepList';

const settle = () => new Promise((r) => setTimeout(r, 0));
const item = (n: number, text: string, over: Partial<PrepListItem> = {}): PrepListItem => ({ item_id: `it-${n}`, text, done: false, source: 'user', carried_from: null, position: n, ...over });

const TODAY = new Date(Date.now() + 3600_000);
const THURSDAY = new Date(Date.now() + 2 * 86400_000);
THURSDAY.setHours(14, 0, 0, 0);
const STANDUP: LinesMeeting = {
  event_id: 'evt-standup',
  occurrence_key: String(TODAY.getTime()),
  title: 'Platform standup',
  starts_at: TODAY.toISOString(),
  later: false,
  items: [item(0, 'the rollback check'), item(1, 'the on-call rota', { source: 'carried', carried_from: { event_id: 'evt-old', date: '15 Oct' } }), item(2, 'the deploy freeze'), item(3, 'the dashboards'), item(4, 'the pager budget')],
  want_line_id: null,
};
const REID: LinesMeeting = {
  event_id: 'evt-reid',
  occurrence_key: String(THURSDAY.getTime()),
  title: '1:1 with Reid',
  starts_at: THURSDAY.toISOString(),
  day_label: 'Thu 2:00 pm',
  later: true,
  items: [],
  want_line_id: 'L-want',
};
const WANT: MyuLineLite = {
  line_id: 'L-want',
  subjects: [{ type: 'meeting', id: 'evt-reid', occurrence_key: String(THURSDAY.getTime()), label: '1:1 with Reid' }],
  text: 'What do you want to cover with Reid? Add as many as you like.',
  needs_you: true,
  ask_kind: 'want',
  choices: [],
  state: 'released',
};

/** The Today pane's meeting rows on the fake, read through the mock as the pane reads them. */
async function mount(tune?: (api: MockApi) => void) {
  const api = new MockApi();
  api.dayMeetings = [structuredClone(STANDUP), structuredClone(REID)];
  api.dayLines = [{ ...WANT }];
  tune?.(api);
  const preps: Array<[string, unknown]> = [];
  const changed: Array<string | null> = [];
  const view = Object.create(TodayView.prototype) as InstanceType<typeof TodayView> & Record<string, unknown>;
  view['plugin'] = {
    settings: {},
    backend: api,
    keys: null,
    termsStanding: () => 'ok',
    openChatAbout: async () => undefined,
    openPrep: async (id: string, talk?: unknown) => void preps.push([id, talk]),
    prepListChanged: (id: string | null) => void changed.push(id),
  };
  view['loading'] = false;
  view['errorState'] = null;
  view['todayLines'] = [];
  view['spaces'] = [];
  view['spaceDoors'] = new Map<string, string>();
  view['meetings'] = [{ event_id: 'evt-standup', summary: 'Platform standup', attendee_emails: ['a', 'b', 'c'], startDate: TODAY }];
  view['openStacks'] = new Set<string>();
  view['spacesOpen'] = false;
  view['forYouOpen'] = false;
  await (view as unknown as { readLinesAndCommitments(): Promise<void> }).readLinesAndCommitments();
  const root = new FakeEl('div');
  const draw = () => {
    root.empty();
    const v = view as unknown as { dots: unknown[]; renderNext(r: unknown): void };
    v.dots = [];
    v.renderNext(root);
  };
  view['render'] = draw;
  draw();
  const row = (title: string) => root.querySelectorAll('.myu-mrow').find((r) => r.querySelector('.myu-ttl')?.text === title)!;
  return { api, view, root, row, preps, changed, draw };
}

function type(el: FakeEl, text: string): void {
  el.value = text;
  (el as unknown as { oninput: () => void }).oninput();
}
function enter(el: FakeEl): void {
  (el as unknown as { onkeydown: (e: unknown) => void }).onkeydown({ key: 'Enter', shiftKey: false, isComposing: false, preventDefault: () => undefined });
}
const items = (row: FakeEl) => row.querySelectorAll('.myu-prep-li').map((li) => li.querySelector('.myu-prep-li-text')?.text);

test('a meeting\'s row: Open ▸ its only link, "· n to cover" on the title, three items with live checkboxes and "+2 more"; the one time format', async () => {
  const m = await mount();
  const row = m.row('Platform standup');
  assert.deepEqual(row.querySelectorAll('button').filter((b) => !b.classes.has('myu-prep-li-text') && !b.classes.has('myu-prep-li-x')).map((b) => b.text), ['Open ▸'], 'nothing else on the row navigates');
  assert.ok(row.querySelector('.myu-ttl')!.visibleTexts().includes('· 5 to cover'));
  assert.equal(row.querySelector('.myu-time')?.text, prepTimeWords(TODAY));
  assert.match(prepTimeWords(TODAY), /^\d{1,2}:\d\d [ap]m$/);
  assert.deepEqual(items(row), ['the rollback check', 'the on-call rota', 'the deploy freeze']);
  assert.ok(row.visibleTexts().includes('+2 more'));
  assert.ok(row.visibleTexts().includes('from last time'), 'after a carried item');
  assert.equal(row.querySelector('.myu-prep-add-box'), null, 'no list question on this one: no box');
  assert.ok(row.querySelectorAll('.myu-prep-li').every((li) => li.attrs.draggable !== 'true'), 'the row holds part of the list: its order is the page\'s');

  const box = row.querySelectorAll('.myu-prep-check')[0]!;
  box.checked = true;
  box.onchange!();
  await settle();
  assert.deepEqual(m.api.prepCalls.at(-1), { door: 'update', body: { item_id: 'it-0', done: true } });
  assert.ok(m.row('Platform standup').visibleTexts().includes('· 4 to cover'));
  assert.deepEqual(m.changed, ['evt-standup'], 'the meeting\'s page reads again');

  await m.row('Platform standup').click('Open ▸');
  assert.deepEqual(m.preps, [['evt-standup', { label: 'Platform standup', occurrenceKey: String(TODAY.getTime()) }]]);
});

test('Later this week: the meeting with the list\'s question; under it Myu\'s question, the add box, Enter adds at once, the fixed line, the box stays open; no Skip', async () => {
  const m = await mount();
  const zone = m.root.querySelector('.myu-later')!;
  assert.equal(zone.children[0]?.text, 'Later this week');
  const row = m.row('1:1 with Reid');
  assert.equal(row.querySelector('.myu-time')?.text, 'Thu 2:00 pm');
  const question = row.querySelector('.myu-prep-want')!;
  assert.equal(question.text, WANT.text);
  assert.ok(question.classes.has('myu-voice'), 'in Myu\'s voice');
  assert.equal(question.attrs['data-line-id'], 'L-want', 'reported as seen');
  assert.equal(row.querySelectorAll('.myu-line').length, 0, 'the question is drawn once');
  const box = row.querySelector('.myu-prep-add-box')!;
  assert.equal(box.attrs.placeholder, 'Add an item to your list');
  assert.ok(row.visibleTexts().includes('Add'));
  assert.ok(!m.root.visibleTexts().some((t) => /\bskip\b/i.test(t)), 'no Skip anywhere');

  type(box, 'the hiring plan for Q1');
  enter(box);
  // At once: the item with its checkbox, before the server answers.
  assert.deepEqual(items(m.row('1:1 with Reid')), ['the hiring plan for Q1']);
  await settle();
  assert.deepEqual(m.api.prepCalls.at(-1), { door: 'add', body: { event_id: 'evt-reid', occurrence_key: String(THURSDAY.getTime()), text: 'the hiring plan for Q1', source: 'user' } });
  const after = m.row('1:1 with Reid');
  assert.ok(after.querySelector('.myu-prep-check'), 'a live checkbox');
  assert.ok(after.visibleTexts().includes(`On the list for ${prepDayWord(THURSDAY.toISOString())}.`));
  assert.ok(after.querySelector('.myu-ttl')!.visibleTexts().includes('· 1 to cover'));
  assert.equal(after.querySelector('.myu-prep-add-box')?.value, '', 'the box stays open, empty');

  // Several lines, several items; the box keeps going.
  type(after.querySelector('.myu-prep-add-box')!, 'the on-call rota\nPriya’s promotion timing');
  enter(after.querySelector('.myu-prep-add-box')!);
  await settle();
  assert.deepEqual(items(m.row('1:1 with Reid')), ['the hiring plan for Q1', 'the on-call rota', 'Priya’s promotion timing']);

  // A refresh reads the list as the server has it, and the row keeps its box.
  await (m.view as unknown as { readLinesAndCommitments(): Promise<void> }).readLinesAndCommitments();
  m.draw();
  assert.deepEqual(items(m.row('1:1 with Reid')), ['the hiring plan for Q1', 'the on-call rota', 'Priya’s promotion timing']);
  assert.ok(m.row('1:1 with Reid').querySelector('.myu-prep-add-box'));

  await m.row('1:1 with Reid').click('Open ▸');
  assert.deepEqual(m.preps.at(-1), ['evt-reid', { label: '1:1 with Reid', occurrenceKey: String(THURSDAY.getTime()) }]);
});

test('an item on a row: its words edited in place (Enter saves), × takes it off', async () => {
  const m = await mount((api) => {
    api.dayMeetings = [{ ...structuredClone(STANDUP), items: [item(0, 'the rollback check'), item(1, 'the deploy freeze')] }];
  });
  await m.row('Platform standup').querySelectorAll('.myu-prep-li-text')[0]!.onclick!();
  const edit = m.row('Platform standup').querySelector('.myu-prep-li-edit')!;
  type(edit, 'the rollback check, signed off');
  enter(edit);
  await settle();
  assert.deepEqual(m.api.prepCalls.at(-1), { door: 'update', body: { item_id: 'it-0', text: 'the rollback check, signed off' } });
  assert.ok(m.row('Platform standup').querySelectorAll('.myu-prep-li').every((li) => li.attrs.draggable === 'true'), 'the whole list on the row: its rows drag');
  await m.row('Platform standup').querySelectorAll('.myu-prep-li-x')[1]!.onclick!();
  await settle();
  assert.deepEqual(m.api.prepCalls.at(-1), { door: 'remove', body: { item_id: 'it-1' } });
  assert.deepEqual(items(m.row('Platform standup')), ['the rollback check, signed off']);
});

test('the items carried from a meeting with no next one wait under their person, with the server\'s line; Drop takes one off', async () => {
  const m = await mount((api) => {
    api.dayWaiting = [{ relationship_id: 'rel-priya', name: 'Priya Shah', label: 'Carried from your 1:1 on 12 Nov', items: [item(7, 'the sizing', { item_id: 'w-1', source: 'carried' })] }];
  });
  const zone = m.root.querySelector('.myu-waiting')!;
  assert.equal(zone.children[0]?.text, 'from last time');
  const row = m.row('Priya Shah');
  assert.ok(row.visibleTexts().includes('Carried from your 1:1 on 12 Nov'));
  assert.deepEqual(items(row), ['the sizing']);
  assert.equal(row.querySelector('.myu-prep-add-box'), null);
  await row.querySelector('.myu-prep-li-x')!.onclick!();
  await settle();
  assert.deepEqual(m.api.prepCalls.at(-1), { door: 'remove', body: { item_id: 'w-1' } });
  assert.equal(m.root.querySelector('.myu-waiting'), null, 'nothing left waiting');
});

test('Yesterday (2026-10-30): the meetings with a record, "· 2 of 3 covered", Open ▸ the only link, the server\'s line under it once', async () => {
  const yesterday = new Date(Date.now() - 86400_000);
  yesterday.setHours(14, 0, 0, 0);
  const m = await mount((api) => {
    api.dayYesterday = [
      { event_id: 'evt-y1', occurrence_key: String(yesterday.getTime()), title: '1:1 with Reid', starts_at: yesterday.toISOString(), covered: { done: 2, total: 3 }, line: 'The Gemini notes for Thursday’s 1:1 with Reid came in: two decisions, seven action items, three of them yours.' },
      { event_id: 'evt-y2', title: 'Design review', starts_at: yesterday.toISOString(), covered: null, line: null },
    ];
  });
  const zone = m.root.querySelector('.myu-yesterday')!;
  assert.equal(zone.children[0]?.text, 'Yesterday');
  const inZone = (title: string) => zone.querySelectorAll('.myu-mrow').find((r) => r.querySelector('.myu-ttl')?.text === title)!;
  const row = inZone('1:1 with Reid');
  assert.equal(row.querySelector('.myu-time')?.text, prepTimeWords(yesterday));
  assert.ok(row.querySelector('.myu-ttl')!.visibleTexts().includes('· 2 of 3 covered'));
  assert.deepEqual(row.querySelectorAll('button').map((b) => b.text), ['Open ▸']);
  const line = row.querySelector('.myu-yesterday-line')!;
  assert.equal(line.text, 'The Gemini notes for Thursday’s 1:1 with Reid came in: two decisions, seven action items, three of them yours.');
  assert.ok(line.classes.has('myu-voice'));
  assert.equal(inZone('Design review').querySelector('.myu-yesterday-line'), null, 'no line without one from the server');
  await row.click('Open ▸');
  assert.deepEqual(m.preps.at(-1), ['evt-y1', { label: '1:1 with Reid', occurrenceKey: String(yesterday.getTime()) }]);
});

test('Yesterday, as the server built it: the notes-arrived line is one of Myu\'s lines about the meeting, drawn under its row, once', async () => {
  const yesterday = new Date(Date.now() - 86400_000);
  yesterday.setHours(14, 0, 0, 0);
  const said = 'The Gemini notes for Thursday’s 1:1 with Reid came in: 2 decisions, 7 action items, 3 of them yours.';
  const m = await mount((api) => {
    api.dayYesterday = [{ event_id: 'evt-y1', occurrence_key: String(yesterday.getTime()), title: 'Weekly with Reid', starts_at: yesterday.toISOString(), covered: { done: 2, total: 3 }, source: 'google_drive' }];
    api.dayLines = [
      { ...WANT },
      { line_id: 'L-arrived', subjects: [{ type: 'meeting', id: 'evt-y1', occurrence_key: String(yesterday.getTime()), label: 'Weekly with Reid' }], text: said, ask_kind: 'tell', needs_you: false, state: 'released' },
    ];
  });
  const row = m.root.querySelector('.myu-yesterday')!.querySelectorAll('.myu-mrow')[0]!;
  assert.deepEqual(row.querySelectorAll('.myu-done').map((l) => [l.text, l.attrs['data-line-id']]), [[said, 'L-arrived']], 'Myu\'s line under the row, reported as seen');
  assert.equal(row.querySelectorAll('.myu-yesterday-line').length, 0, 'not twice');
  assert.equal(m.row('Platform standup').visibleTexts().includes(said), false, 'under its own meeting only');
});
