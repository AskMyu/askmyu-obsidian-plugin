/**
 * The interview debrief (2026-09-29) in the vault, on the functional UI fake: a debrief space's
 * conversation shows and answers its asks as a retro's does (a choice, typed words), its CV and
 * LinkedIn asks say where, and Today's row for it has one door in "interview debrief" words.
 */

import { strict as assert } from 'node:assert';
import test from 'node:test';

import { FakeEl } from './ui-stub';
import { MockApi } from '../src/transport/mock';
import { SpaceConversation } from '../src/spaceConversation';
import { renderSpaceConversation, renderSpaceStatus } from '../src/views/spaceConversationPane';
import { DEBRIEF_PANE_WORDS, debriefEffectSteps, debriefSmall, isDebriefConversation, isDebriefSpace } from '../src/debriefPane';
import { spaceRows } from '../src/spaceRetro';

function mount(tune?: (api: MockApi) => void) {
  const api = new MockApi();
  api.spaces.push(api.debriefSpace);
  tune?.(api);
  const space = new SpaceConversation('d1', 'Jordan Reyes', {
    backend: api,
    unlock: async () => true,
    openJournal: () => {},
    onChange: () => {},
    apiBase: 'https://myu.askmyu.com/api',
  });
  let thread = new FakeEl('div');
  let composer = new FakeEl('div');
  let status = new FakeEl('div');
  const paint = () => {
    thread = new FakeEl('div');
    composer = new FakeEl('div');
    status = new FakeEl('div');
    renderSpaceStatus(status as unknown as HTMLElement, space.screen().status);
    renderSpaceConversation(thread as unknown as HTMLElement, composer as unknown as HTMLElement, space.screen(), {
      send: (text) => void space.send(text),
      choose: (id) => void space.choose(id),
      earlier: () => void space.loadEarlier(),
      unlock: () => void space.unlockSpace(),
      draft: (text) => { space.draft = text; },
    });
  };
  return { api, space, paint, thread: () => thread, composer: () => composer, status: () => status };
}

const settle = async () => {
  for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));
};

const everything = (m: ReturnType<typeof mount>) => [...m.status().visibleTexts(), ...m.thread().visibleTexts(), ...m.composer().visibleTexts()].join('\n');

test('interview debrief: the pane shows the ask, its one choice, the server\'s status line and placeholder', async () => {
  const m = mount();
  assert.equal(await m.space.open(), true, 'a debrief conversation is space mode');
  assert.equal(m.space.isDebrief, true);
  m.paint();
  const asks = m.thread().querySelectorAll('.myu-space-ask');
  assert.equal(asks.length, 1, 'one ask at a time');
  const texts = m.thread().visibleTexts();
  assert.ok(texts.some((t) => t.startsWith('System design. What did you see?')), 'the question, as sent');
  assert.ok(texts.some((t) => t.includes('A yes: ') && t.includes('\nA no: ')), 'what a yes and a no look like, on their own lines');
  assert.ok(m.thread().find((e) => e.tag === 'button' && e.text === "Didn't come up"), 'the one choice beside the words');
  assert.equal(m.composer().querySelector('textarea')?.attrs.placeholder, 'What did you see?', "the server's placeholder");
  assert.deepEqual(m.status().visibleTexts(), ['0 of 3 in · reveal when everyone is in, or Friday at 5pm'], "the server's status line, as sent");
});

test('interview debrief: answering by typing moves to the yes or no, whose four choices are buttons', async () => {
  const m = mount();
  await m.space.open();
  await m.space.send('Split the queue from the workers and named the retry trade-off.');
  m.paint();
  const texts = m.thread().visibleTexts();
  assert.ok(texts.includes('Split the queue from the workers and named the retry trade-off.'), 'the typed words stay in the conversation');
  assert.ok(texts.includes('System design: yes or no?'), 'the next ask is up');
  for (const label of ['Strong no', 'No', 'Yes', 'Strong yes']) {
    assert.ok(m.thread().querySelectorAll('.myu-space-ask')[0]?.find((e) => e.tag === 'button' && e.text === label), `"${label}" is a button`);
  }
  assert.equal(m.composer().querySelector('textarea')?.attrs.placeholder, 'Or say it in words');
  assert.deepEqual(m.api.debriefMode.answers, [{ step: 'saw:System design', answer: 'Split the queue from the workers and named the retry trade-off.' }]);
});

test('interview debrief: answering by choice moves on, and the scorecard ends locked', async () => {
  const m = mount();
  await m.space.open();
  await m.space.send('Split the queue from the workers.');
  m.paint();
  assert.ok(await m.thread().click('Strong yes'));
  await settle();
  m.paint();
  assert.ok(m.thread().visibleTexts().some((t) => t.startsWith('Ownership. What did you see?')), 'the next topic');
  assert.ok(await m.thread().click("Didn't come up"));
  await settle();
  m.paint();
  assert.ok(m.thread().visibleTexts().includes('Your overall call: yes or no?'));
  assert.ok(await m.thread().click('Yes'));
  await settle();
  m.paint();
  assert.equal(m.thread().querySelectorAll('.myu-space-ask').length, 0, 'nothing more to answer');
  assert.ok(m.thread().visibleTexts().some((t) => t.startsWith('Done. Your scorecard is locked.')));
  assert.deepEqual(m.api.debriefMode.answers.map((a) => a.answer), ['Split the queue from the workers.', 'strong_yes', 'dcu', 'yes']);
  assert.deepEqual(m.status().visibleTexts(), ['1 of 3 in · reveal when everyone is in, or Friday at 5pm']);
});

test('interview debrief: "Add a CV" says where in plain words (the web page, or the terminal); the ask stays up', async () => {
  const m = mount((api) => { api.debriefMode.start = 'cv'; });
  await m.space.open();
  m.paint();
  assert.ok(await m.thread().click('Add a CV'));
  await settle();
  m.paint();
  const note = m.thread().querySelector('.myu-space-note')?.text ?? '';
  assert.equal(note, DEBRIEF_PANE_WORDS.cvWhere('Jordan Reyes', 'https://myu.askmyu.com/dashboard/spaces/d1'));
  assert.match(note, /open this interview debrief on the web: https:\/\/myu\.askmyu\.com\/dashboard\/spaces\/d1/);
  assert.match(note, /myu debrief "Jordan Reyes" --cv <file>/);
  assert.equal(m.thread().querySelectorAll('.myu-space-ask').length, 1, 'the ask stays open until something is added');
});

test('interview debrief: "Paste a LinkedIn link" says so and puts the cursor in the box; a pasted link answers it', async () => {
  const m = mount((api) => { api.debriefMode.start = 'cv'; });
  await m.space.open();
  m.space.wantsFocus = false;
  m.paint();
  assert.ok(await m.thread().click('Paste a LinkedIn link'));
  await settle();
  m.paint();
  assert.equal(m.thread().querySelector('.myu-space-note')?.text, "Paste the link, and Jordan's work history appears on the page.", "the server's words");
  assert.equal(m.space.wantsFocus, true, 'the box gets the cursor');
  await m.space.send('https://www.linkedin.com/in/jordan-reyes');
  m.paint();
  assert.ok(m.thread().visibleTexts().includes("Added to Jordan's page: the work history from that profile."));
  assert.equal(m.thread().querySelectorAll('.myu-space-ask').length, 0);
});

test('interview debrief: nothing of a retro in its conversation', async () => {
  const m = mount();
  await m.space.open();
  m.paint();
  const all = everything(m);
  assert.doesNotMatch(all, /retro|How this works|bring up|getting ready|share with the team/i);
  // Words on screen say "interview debrief", never "debrief" alone.
  const words = [DEBRIEF_PANE_WORDS.nameCap, DEBRIEF_PANE_WORDS.door, DEBRIEF_PANE_WORDS.linkedinHere, DEBRIEF_PANE_WORDS.agentRefused, DEBRIEF_PANE_WORDS.cvWhere('Jordan Reyes', 'https://x')];
  for (const w of words) assert.doesNotMatch(w.replace(/myu debrief /, ''), /(?<!interview )debrief/i, w);
});

test('interview debrief: a retro space is not one', async () => {
  const api = new MockApi();
  const space = new SpaceConversation('s1', 'Door team', { backend: api, unlock: async () => true, openJournal: () => {}, onChange: () => {} });
  await space.open();
  assert.equal(space.isDebrief, false);
  assert.equal(isDebriefConversation({ stage: { work: 'retro' } }), false);
  assert.equal(isDebriefConversation({ stage: { work: 'debrief' } }), true);
  assert.equal(isDebriefSpace({ work: 'debrief' }), true);
  assert.equal(isDebriefSpace({}), false);
  assert.deepEqual(debriefEffectSteps([{ type: 'attach_cv', space_id: 'd1' }, { type: 'open_journal' }, { type: 'paste_linkedin' }]), [{ do: 'attach_cv' }, { do: 'paste_linkedin' }]);
});

test('Today: a debrief space\'s row reads "Interview debrief · 3 members"; a team\'s row is unchanged', () => {
  const api = new MockApi();
  const rows = spaceRows([...api.spaces, api.debriefSpace], []);
  const d = rows.find((r) => r.space_id === 'd1');
  assert.ok(d);
  assert.equal(d.name, 'Jordan Reyes');
  assert.equal(d.small, 'Interview debrief · 3 members');
  assert.equal(d.debrief, true);
  const team = rows.find((r) => r.space_id === 's1');
  assert.equal(team?.small, 'Small team · 4 members');
  assert.equal(team?.debrief, undefined);
  assert.equal(debriefSmall(1), 'Interview debrief · 1 member');
  assert.equal(debriefSmall(undefined), 'Interview debrief');
});

test('Today: a debrief space has one door, into its conversation, and no getting-ready read', async () => {
  const { TodayView } = await import('../src/views/TodayView');
  const api = new MockApi();
  api.spaces.push(api.debriefSpace);
  const prepAsked: string[] = [];
  const opened: unknown[] = [];
  const view = Object.create(TodayView.prototype) as InstanceType<typeof TodayView> & Record<string, unknown>;
  view['plugin'] = {
    settings: {},
    backend: {
      getMyuLines: async () => ({ ok: true, status: 200, data: { lines: [] } }),
      listVaultCommitments: async () => ({ ok: true, status: 200, data: { commitments: [] } }),
      listSpaces: () => api.listSpaces(),
      getCommitments: async () => ({ ok: true, status: 200, data: { items: [] } }),
      getRetroPrepMine: async (id: string) => {
        prepAsked.push(id);
        return api.getRetroPrepMine(id);
      },
    },
    openChatAbout: async (type: string, id: string, opts: unknown) => { opened.push([type, id, opts]); },
  };
  view['todayLines'] = [];
  view['spacesOpen'] = false;
  await (view as unknown as { readLinesAndCommitments(): Promise<void> }).readLinesAndCommitments();
  assert.deepEqual(prepAsked, ['s1'], 'only the team space is asked where the person is in getting ready');

  const root = new FakeEl('div');
  (view as unknown as { renderSpaces(r: unknown): void }).renderSpaces(root);
  const texts = root.visibleTexts();
  assert.ok(texts.includes('Jordan Reyes'));
  assert.ok(texts.includes('Interview debrief · 3 members'));
  const rows = root.querySelectorAll('.myu-mrow');
  assert.equal(rows.length, 2);
  const debriefRow = rows.find((r) => r.visibleTexts().includes('Jordan Reyes'))!;
  const buttons = debriefRow.querySelectorAll('button').map((b) => b.text);
  assert.deepEqual(buttons, ['Ask Myu about this interview debrief ▸'], 'one door, in "interview debrief" words; no retro');
  assert.ok(await debriefRow.click('Ask Myu about this interview debrief ▸'));
  assert.deepEqual(opened, [['space', 'd1', { label: 'Jordan Reyes', line: undefined, debrief: true }]]);
  const teamRow = rows.find((r) => r.visibleTexts().includes('Door team'))!;
  assert.equal(teamRow.querySelectorAll('button').length, 2, "a team's row keeps its two doors");
});

// ── a drafted interview debrief (2026-10-06): Myu's line to the hiring manager, in the Today pane ───────────

const DRAFT = {
  line_id: 'D1',
  // As the server sends it: no subject, and a conversation that names none.
  subjects: [],
  conversation: {},
  text: "An interview for Backend engineer is on your calendar: Sam Okafor, Thu 9 Oct at 2pm. I've drafted Sam's interview debrief, with Jo and Ana on the panel. Send the invites?",
  needs_you: true,
  ask_kind: 'choice',
  choices: [{ id: 'send', label: 'Send invites' }, { id: 'not_interview', label: 'Not an interview' }, { id: 'not_this', label: 'Not this one' }],
  state: 'released',
};

test('Today: a drafted interview debrief is a row of its own: the line, its three choices, no door; answered there, with what Myu said back', async () => {
  const { TodayView } = await import('../src/views/TodayView');
  const api = new MockApi();
  // Another line about nothing with a name comes first: the draft is not left behind its count.
  api.dayLines = [{ line_id: 'T1', subjects: [], text: 'Three notes were captured this morning.', ask_kind: 'tell', state: 'released' }, { ...DRAFT }];
  api.dayAnswers.D1 = () => ({ success: true, readback: { text: 'Okay, not this one.' } });
  const opened: unknown[] = [];
  const view = Object.create(TodayView.prototype) as InstanceType<typeof TodayView> & Record<string, unknown>;
  view['plugin'] = { settings: { base_url: 'https://myu.askmyu.com/api' }, backend: api, openChatAbout: async (type: string, id: string) => void opened.push([type, id]) };
  view['todayLines'] = api.dayLines;
  view['openStacks'] = new Set<string>();
  let root = new FakeEl('div');
  const paint = () => {
    root = new FakeEl('div');
    (view as unknown as { renderForYou(r: unknown): void }).renderForYou(root);
  };
  // The pane's own repaint and re-read, as far as this row goes.
  view['render'] = paint;
  view['refresh'] = async () => paint();
  paint();

  const rows = root.querySelectorAll('.myu-mrow');
  assert.deepEqual(rows.map((r) => r.querySelector('.myu-ttl')?.text), ['Interview debrief', 'Other'], 'the draft first: it needs the hiring manager');
  assert.ok(rows[0].querySelector('.myu-dot'), 'it needs the hiring manager');
  assert.equal(rows[0].querySelectorAll('.myu-fold-aff').length, 0, 'nothing of it is behind a count');
  const words = rows[0].querySelector('.myu-line');
  assert.equal(words?.text, DRAFT.text);
  assert.equal(words?.attrs['data-line-id'], 'D1', 'the words carry the line\'s id: seen is reported from here');
  assert.deepEqual(rows[0].querySelectorAll('button').map((b) => b.text), ['Send invites', 'Not an interview', 'Not this one', 'Not now', "Don't ask again"], 'no "talk about this": the line is the draft');

  assert.ok(await root.click('Not this one'));
  await settle();
  assert.deepEqual(api.dayAnswered, [{ line_id: 'D1', answer: { choice_id: 'not_this' } }]);
  assert.deepEqual(opened, []);
  const after = root.querySelectorAll('.myu-mrow')[0];
  assert.ok(after.visibleTexts().includes('Okay, not this one.'));
  assert.equal(after.querySelectorAll('button').length, 0);
});

test('Today: a space\'s line carries its id too; the pane hands its content to the watcher while it is open', async () => {
  const { TodayView } = await import('../src/views/TodayView');
  const view = Object.create(TodayView.prototype) as InstanceType<typeof TodayView> & Record<string, unknown>;
  const watched: unknown[] = [];
  const unwatched: unknown[] = [];
  view['plugin'] = { settings: {}, backend: {}, linesSeen: { watch: (el: unknown) => void watched.push(el), unwatch: (el: unknown) => void unwatched.push(el) } };
  view['spaces'] = [{ space_id: 's1', name: 'Door team', kind: 'small_team', member_count: 4, status: 'active' }];
  view['todayLines'] = [{ line_id: 'S9', subjects: [{ type: 'space', id: 's1', label: 'Door team' }], text: 'Two questions are up.', ask_kind: 'tell', state: 'released' }];
  view['spaceDoors'] = new Map<string, string>();
  view['openStacks'] = new Set<string>();
  view['spacesOpen'] = false;
  const root = new FakeEl('div');
  (view as unknown as { renderSpaces(r: unknown): void }).renderSpaces(root);
  const words = root.querySelector('.myu-done');
  assert.equal(words?.text, 'Two questions are up.');
  assert.equal(words?.attrs['data-line-id'], 'S9');

  const content = new FakeEl('div');
  view['contentEl'] = content;
  view['retryTimer'] = null;
  view['refresh'] = async () => undefined;
  await view.onOpen();
  assert.deepEqual(watched, [content]);
  assert.deepEqual(unwatched, []);
  await view.onClose();
  assert.deepEqual(unwatched, [content]);
});
