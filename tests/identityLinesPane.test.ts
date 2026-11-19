/**
 * One colleague is one person, in the panes (2026-11-15), on the functional UI fake: what a person sees on a Today row or under a
 * chat's opening question when Myu asks who someone is — the question with its four buttons, "No, someone else" opening "Who is
 * it?" (their people found as they type, or the name as typed), what the server said back — and the assumed tie with "Not her?".
 */

import { strict as assert } from 'node:assert';
import test from 'node:test';

import { FakeEl } from './ui-stub';
import { MockApi } from '../src/transport/mock';
import type { MyuLineLite } from '../src/transport/api';
import { pressLineButton, type LineButton, type LineUi } from '../src/lineAnswers';
import { renderLineAsk, type FindPeople } from '../src/views/lineAsk';
import { peopleFinder } from '../src/identityLines';
import { TodayView } from '../src/views/TodayView';

const API = 'https://myu.askmyu.com/api';
const QUESTION = 'Is tessc-gh on GitHub Tess Colleague? 3 things are waiting under that name.';

const askLine = (over: Partial<MyuLineLite> = {}): MyuLineLite => ({
  line_id: 'P1',
  text: QUESTION,
  needs_you: true,
  ask_kind: 'choice',
  choices: [
    { id: 'yes', label: 'Yes' },
    { id: 'someone_else', label: 'No, someone else' },
    { id: 'not_a_person', label: 'Not a person' },
    { id: 'not_now', label: 'Not now' },
  ],
  why: { fired_because: '3 things are waiting under that name.', evidence: [{ kind: 'identity', count: 3, ref: 'idn-1' }] },
  state: 'released',
  ...over,
});

/** A row as a pane keeps it: the line's state between answers, redrawn after each press (and whenever the test asks). */
function mount(api: MockApi, l: MyuLineLite, people?: FindPeople, opts: { showText?: boolean } = {}) {
  let ui: LineUi = {};
  let host = new FakeEl('div');
  const paint = () => {
    host = new FakeEl('div');
    renderLineAsk(host as unknown as HTMLElement, l, ui, { press: (b) => void press(b), people }, opts);
  };
  const press = async (b: LineButton) => {
    ui = { busy: true };
    paint();
    const out = await pressLineButton({ answer: (id, a) => api.answerMyuLine(id, a), apiBase: API }, l, b);
    ui = out.ui;
    paint();
  };
  paint();
  return { host: () => host, paint, ui: () => ui };
}
const settle = () => new Promise((r) => setTimeout(r, 0));
const buttonsIn = (host: FakeEl, cls: string) => host.querySelectorAll(cls).flatMap((row) => row.children.filter((c) => c.tag === 'button'));
/** Type into "Who is it?" as a person does: the box's value, then its input event. */
async function type(host: FakeEl, words: string) {
  const box = host.querySelector('.myu-who-name')!;
  box.value = words;
  box.dispatch('input');
  await settle();
  await settle();
}
/** The finder over the mock's people, with no wait. */
const finder = (api: MockApi) => peopleFinder(() => api, { wait: () => Promise.resolve() });

test('the question: its words, then Yes · No, someone else · Not a person, and Not now quiet; nothing else', () => {
  const m = mount(new MockApi(), askLine());
  assert.ok(m.host().visibleTexts().includes(QUESTION));
  const first = buttonsIn(m.host(), '.myu-line-choices');
  assert.deepEqual(first.map((b) => b.text), ['Yes', 'No, someone else', 'Not a person', 'Not now']);
  assert.ok(first[3].classes.has('myu-line-quiet'), '"Not now" is the quiet way out');
  assert.ok(!first.slice(0, 3).some((b) => b.classes.has('myu-line-quiet')));
  assert.equal(first[1].attrs['aria-expanded'], 'false');
  assert.equal(m.host().querySelector('.myu-who-name'), null, '"Who is it?" is closed until it is asked for');
});

test('each of the four: Yes, Not a person and Not now answer at once and show what the server said back', async () => {
  for (const [label, id, said] of [
    ['Yes', 'yes', 'Done. 3 things moved to Tess Colleague.'],
    ['Not a person', 'not_a_person', 'Okay. Myu will not ask about it again.'],
    ['Not now', 'not_now', 'Okay. Myu will ask again if more comes under that name.'],
  ] as const) {
    const api = new MockApi();
    const l = askLine({ line_id: `P-${id}` });
    api.dayLines = [l];
    api.dayAnswers[l.line_id] = () => ({ success: true, readback: { text: id === 'yes' ? 'Okay.' : said }, effects: id === 'yes' ? [{ type: 'said', text: said }] : [] });
    const m = mount(api, l);
    assert.ok(await m.host().click(label), label);
    await settle();
    assert.deepEqual(api.dayAnswered, [{ line_id: l.line_id, answer: { choice_id: id } }], label);
    assert.ok(m.host().visibleTexts().includes(said), `${label}: ${said}`);
    assert.ok(!m.host().visibleTexts().includes(QUESTION), 'the line is replaced by what the server said back');
    assert.ok(!m.host().visibleTexts().includes('Okay.') || id !== 'yes', 'the bare "Okay." is not what shows after Yes');
  }
});

test('No, someone else: "Who is it?" opens with nothing sent; typing finds their people; one press sends that person', async () => {
  const api = new MockApi();
  const l = askLine();
  api.dayLines = [l];
  api.dayAnswers.P1 = () => ({ success: true, readback: { text: 'Okay.' }, effects: [{ type: 'said', text: 'Done. 3 things moved to Priya Raman.' }] });
  const m = mount(api, l, finder(api));
  assert.ok(await m.host().click('No, someone else'));
  m.paint();
  assert.deepEqual(api.dayAnswered, [], 'opening it answers nothing');
  assert.ok(m.host().visibleTexts().includes('Who is it?'));
  const box = m.host().querySelector('.myu-who-name')!;
  assert.equal(box.attrs.placeholder, 'One of your people, or a name');
  assert.equal(buttonsIn(m.host(), '.myu-line-choices')[1].attrs['aria-expanded'], 'true');
  // Only Back until something is typed.
  assert.deepEqual(buttonsIn(m.host(), '.myu-who-acts').map((b) => b.text), ['Back']);

  await type(m.host(), 'pri');
  const found = buttonsIn(m.host(), '.myu-who-found');
  assert.deepEqual(found.map((b) => b.text), ['Priya Raman']);
  assert.equal(found[0].attrs['data-person'], 'rel-2');
  assert.ok(m.host().visibleTexts().includes(' · Northwind'), 'where they work, beside the name');
  assert.deepEqual(buttonsIn(m.host(), '.myu-who-acts').map((b) => b.text), ['Use “pri”', 'Back']);
  // A redraw (Today's refresh) keeps what was typed and who was found, without asking again.
  const reads = api.searchReads;
  m.paint();
  assert.equal(m.host().querySelector('.myu-who-name')!.value, 'pri');
  assert.deepEqual(buttonsIn(m.host(), '.myu-who-found').map((b) => b.text), ['Priya Raman']);
  assert.equal(api.searchReads, reads);

  assert.ok(await m.host().click('Priya Raman'));
  await settle();
  assert.deepEqual(api.dayAnswered, [{ line_id: 'P1', answer: { choice_id: 'someone_else', relationship_id: 'rel-2' } }]);
  assert.ok(m.host().visibleTexts().includes('Done. 3 things moved to Priya Raman.'));
  assert.equal(m.host().querySelector('.myu-who-name'), null, 'answered: "Who is it?" is gone');
});

test('No, someone else by a typed name: "Use “Rowan Field”" sends the name; so does Enter when nobody matches', async () => {
  const api = new MockApi();
  const l = askLine({ line_id: 'P2' });
  api.dayLines = [l];
  api.dayAnswers.P2 = () => ({ success: true, readback: { text: 'Okay.' }, effects: [{ type: 'said', text: 'Done. 3 things moved to Rowan Field.' }] });
  const m = mount(api, l, finder(api));
  await m.host().click('No, someone else');
  m.paint();
  await type(m.host(), '  Rowan Field ');
  assert.deepEqual(buttonsIn(m.host(), '.myu-who-found'), [], 'nobody by that name');
  assert.ok(await m.host().click('Use “Rowan Field”'));
  await settle();
  assert.deepEqual(api.dayAnswered, [{ line_id: 'P2', answer: { choice_id: 'someone_else', text: 'Rowan Field' } }]);
  assert.ok(m.host().visibleTexts().includes('Done. 3 things moved to Rowan Field.'));

  // Enter, with nobody found, sends the name; with someone found, it sends nothing (a press picks them, or "Use …").
  const api2 = new MockApi();
  const l2 = askLine({ line_id: 'P3' });
  api2.dayLines = [l2];
  const m2 = mount(api2, l2, finder(api2));
  await m2.host().click('No, someone else');
  m2.paint();
  await type(m2.host(), 'Marcus');
  m2.host().querySelector('.myu-who-name')!.dispatch('keydown', { key: 'Enter' });
  await settle();
  assert.deepEqual(api2.dayAnswered, [], 'someone matches: Enter does not make a new person');
  await type(m2.host(), 'Ines Okafor');
  m2.host().querySelector('.myu-who-name')!.dispatch('keydown', { key: 'Enter' });
  await settle();
  assert.deepEqual(api2.dayAnswered, [{ line_id: 'P3', answer: { choice_id: 'someone_else', text: 'Ines Okafor' } }]);
});

test('Back (or Escape) closes "Who is it?" with nothing sent; "Choose who" with no guess opens the same', async () => {
  const api = new MockApi();
  const l = askLine({ line_id: 'P4', text: 'Who is tessc-gh on GitHub? 1 thing is waiting under that name.', choices: [{ id: 'someone_else', label: 'Choose who' }, { id: 'not_a_person', label: 'Not a person' }, { id: 'not_now', label: 'Not now' }] });
  api.dayLines = [l];
  const m = mount(api, l, finder(api));
  assert.deepEqual(buttonsIn(m.host(), '.myu-line-choices').slice(0, 3).map((b) => b.text), ['Choose who', 'Not a person', 'Not now']);
  await m.host().click('Choose who');
  m.paint();
  await type(m.host(), 'Tess');
  assert.ok(await m.host().click('Back'));
  assert.equal(m.host().querySelector('.myu-who-name'), null);
  m.paint();
  assert.equal(m.host().querySelector('.myu-who-name'), null, 'closed stays closed across a redraw');
  await m.host().click('Choose who');
  m.paint();
  assert.equal(m.host().querySelector('.myu-who-name')!.value, '', 'Back let go of what was typed');
  m.host().querySelector('.myu-who-name')!.dispatch('keydown', { key: 'Escape' });
  assert.equal(m.host().querySelector('.myu-who-name'), null);
  assert.deepEqual(api.dayAnswered, []);
});

test('with no people to look in, the name as typed can still be sent; a failed send keeps the box and what was typed', async () => {
  const api = new MockApi();
  const l = askLine({ line_id: 'P5' });
  api.dayLines = [l];
  const m = mount(api, l);
  await m.host().click('No, someone else');
  m.paint();
  await type(m.host(), 'Rowan Field');
  assert.deepEqual(buttonsIn(m.host(), '.myu-who-found'), []);
  api.state.offline = true;
  assert.ok(await m.host().click('Use “Rowan Field”'));
  await settle();
  assert.ok(m.host().visibleTexts().includes("You're offline. Try again when you're back online."));
  assert.equal(m.host().querySelector('.myu-who-name')!.value, 'Rowan Field');
  assert.ok(m.host().visibleTexts().includes(QUESTION), 'the question stays up');
});

test('the assumed tie: the claim, "Not her?" under it; pressed, it answers {change: true} and shows what the server said back', async () => {
  const api = new MockApi();
  const l: MyuLineLite = {
    line_id: 'A1',
    subjects: [{ type: 'person', id: 'rel-tess', label: 'Tess Colleague' }],
    text: 'Myu took tessc-gh on GitHub to be Tess Colleague, from her address on a commit. Not her?',
    ask_kind: 'assume',
    assumed: { claim: 'tessc-gh on GitHub is Tess Colleague', changeable: true },
    why: { fired_because: 'from her address on a commit', evidence: [{ kind: 'identity', count: 1, ref: 'idn-2' }] },
    state: 'released',
  };
  api.dayLines = [l];
  api.dayAnswers.A1 = () => ({ success: true, readback: { text: 'Okay.' }, effects: [{ type: 'said', text: 'Taken off. 1 thing went back to waiting.' }] });
  const m = mount(api, l);
  const texts = m.host().visibleTexts();
  assert.ok(texts.includes('Myu took tessc-gh on GitHub to be Tess Colleague, from her address on a commit.'));
  assert.ok(!texts.some((t) => t.endsWith('commit. Not her?')), '"Not her?" is the button, not repeated in the words');
  assert.deepEqual(buttonsIn(m.host(), '.myu-line-choices').map((b) => b.text), ['Not her?']);
  assert.ok(await m.host().click('Not her?'));
  await settle();
  assert.deepEqual(api.dayAnswered, [{ line_id: 'A1', answer: { change: true } }]);
  assert.ok(m.host().visibleTexts().includes('Taken off. 1 thing went back to waiting.'));
});

// ── the follow-up (2026-11-15): a question closed elsewhere, and Undo after an answer, in the panes ──

test('a question closed elsewhere: pressed, its words stay and "Already answered." stands where its buttons were', async () => {
  const api = new MockApi();
  const l = askLine({ line_id: 'P9', kind: 'identity_ask', identity: { identity_id: 'idn-1', guess_relationship_id: 'rel-tess', waiting: 3 } });
  api.dayLines = [{ ...l, state: 'expired' }];
  const m = mount(api, l, finder(api));
  // Mid-way through "Who is it?" makes no difference: the box goes too.
  await m.host().click('No, someone else');
  m.paint();
  await type(m.host(), 'Pri');
  assert.ok(await m.host().click('Priya Raman'));
  await settle();
  const texts = m.host().visibleTexts();
  assert.ok(texts.includes(QUESTION), 'its words stay');
  assert.ok(texts.includes('Already answered.'));
  assert.deepEqual(buttonsIn(m.host(), '.myu-line-choices'), [], 'no button that answers nothing');
  assert.equal(m.host().querySelector('.myu-who-name'), null);
  assert.ok(!texts.some((t) => /Could not send|offline/.test(t)), 'not an error');
  assert.deepEqual(api.dayAnswered, []);
});

const TODAY_Q = 'Is mira-o on GitHub Mira Okonjo? 3 things are waiting under that name.';
const todayQuestion = (over: Partial<MyuLineLite> = {}): MyuLineLite =>
  askLine({ line_id: 'Q1', kind: 'identity_ask', text: TODAY_Q, identity: { identity_id: 'idn-7', kind: 'github', guess_relationship_id: 'rel-mira', guess_name: 'Mira Okonjo', waiting: 3 }, ...over });
const TELL: MyuLineLite = { line_id: 'T1', subjects: [{ type: 'person', id: 'p1', label: 'Ana Lind' }], text: 'Ana replied to your pricing note.', ask_kind: 'tell', needs_you: false, state: 'released' };

/** Today's "for you" rows on the fake, over the mock: a refresh reads the lines; what the pane offered as Undo is kept. */
function mountToday(api: MockApi, lines: MyuLineLite[]) {
  const offered: Array<[string, string]> = [];
  let reads = 0;
  const backend = Object.assign(Object.create(api) as MockApi, {
    getMyuLines: (scope: 'today') => {
      reads++;
      return api.getMyuLines(scope);
    },
  });
  const view = Object.create(TodayView.prototype) as InstanceType<typeof TodayView> & Record<string, unknown>;
  const root = new FakeEl('div');
  const draw = () => {
    root.empty();
    const v = view as unknown as { dots: unknown[]; renderForYou(r: unknown): void };
    v.dots = [];
    v.renderForYou(root);
  };
  view['plugin'] = { settings: { base_url: API }, backend, offerUndo: (said: string, moveId: string) => offered.push([said, moveId]), openChatAbout: async () => undefined } as never;
  view['todayLines'] = lines.map((l) => ({ ...l }));
  view['spaces'] = [];
  view['openStacks'] = new Set<string>();
  view['forYouOpen'] = true;
  view['render'] = draw;
  view['refresh'] = async () => {
    const r = await backend.getMyuLines('today');
    (view as unknown as { takeLines(d: unknown): void }).takeLines(r.data);
    draw();
  };
  draw();
  return { root, view: view as unknown as { lineUpdated(id: unknown): Promise<void> | null }, offered, reads: () => reads };
}

test('Today: a question answered elsewhere leaves when the server says its line changed, with no reload; other changes read nothing', async () => {
  const api = new MockApi();
  api.dayLines = [todayQuestion(), TELL];
  const t = mountToday(api, api.dayLines);
  assert.ok(t.root.visibleTexts().includes(TODAY_Q));
  // Answered under People: the server no longer carries it, and says its line changed.
  api.dayLines = [TELL];
  assert.equal(t.view.lineUpdated('nope'), null, 'a line Today does not show reads nothing');
  assert.equal(t.view.lineUpdated(undefined), null);
  assert.equal(t.reads(), 0);
  const first = t.view.lineUpdated('Q1');
  const second = t.view.lineUpdated('Q1');
  await first;
  await second;
  await settle();
  assert.equal(t.reads(), 1, 'changes close together are one read');
  assert.ok(!t.root.visibleTexts().includes(TODAY_Q), 'the question is gone');
  assert.ok(t.root.visibleTexts().includes('Ana replied to your pricing note.'), 'the rest of Today stays');
});

test('Today: pressing a question closed elsewhere shows "Already answered." in place of its buttons, and it stays after the read', async () => {
  const api = new MockApi();
  api.dayLines = [todayQuestion({ state: 'expired' }), TELL];
  const t = mountToday(api, [todayQuestion(), TELL]);
  assert.ok(await t.root.click('Yes'));
  await settle();
  await settle();
  const texts = t.root.visibleTexts();
  assert.ok(texts.includes(TODAY_Q));
  assert.ok(texts.includes('Already answered.'));
  assert.ok(!t.root.querySelectorAll('button').some((b) => ['Yes', 'No, someone else', 'Not a person', 'Not now'].includes(b.text)), 'no button that answers nothing');
  assert.equal(t.reads(), 1, 'the pane read its lines again');
  assert.deepEqual(api.dayAnswered, []);
  assert.deepEqual(t.offered, []);
});

test('Today: "Yes" on the question says the server’s sentence on the row and offers Undo with its move; "Not now" offers none', async () => {
  const api = new MockApi();
  api.dayLines = [todayQuestion(), todayQuestion({ line_id: 'Q2', text: 'Who is tess@elsewhere.test? 1 thing is waiting under that name.', identity: { identity_id: 'idn-9' }, choices: [{ id: 'someone_else', label: 'Choose who' }, { id: 'not_a_person', label: 'Not a person' }, { id: 'not_now', label: 'Not now' }] })];
  api.dayAnswers.Q1 = () => ({ success: true, readback: { text: 'Done. 3 things moved to Mira Okonjo.' }, effects: [{ type: 'said', text: 'Done. 3 things moved to Mira Okonjo.', move_id: 'mv-q1' }] });
  api.dayAnswers.Q2 = () => ({ success: true, readback: { text: 'Okay. Myu will ask again if more comes under that name.' } });
  const t = mountToday(api, api.dayLines);
  assert.ok(await t.root.click('Yes'));
  await settle();
  await settle();
  assert.deepEqual(t.offered, [['Done. 3 things moved to Mira Okonjo.', 'mv-q1']]);
  assert.ok(t.root.visibleTexts().includes('Done. 3 things moved to Mira Okonjo.'));
  assert.ok(await t.root.click('Not now'));
  await settle();
  await settle();
  assert.deepEqual(t.offered, [['Done. 3 things moved to Mira Okonjo.', 'mv-q1']], 'nothing moved, nothing to undo');
});
