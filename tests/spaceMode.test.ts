/**
 * Space mode (R14) — the decisions a space's conversation makes in the vault.
 *
 * Runs in the unit-test entry, where `obsidian` THROWS: nothing here may touch the host.
 * The backend is the mock transport's stand-in for the getting-ready state machine
 * (typed words first, one ask at a time).
 */

import { strict as assert } from 'node:assert';
import test from 'node:test';

import { MockApi } from '../src/transport/mock';
import { SpaceConversation, spaceDoorLabel, spaceIdsOf, LOCKED_TURN_WORDS } from '../src/spaceConversation';

function setup(tune?: (api: MockApi) => void) {
  const api = new MockApi();
  tune?.(api);
  const calls = { changes: 0, journal: [] as string[], unlocks: 0 };
  let unlockWorks = true;
  const space = new SpaceConversation('s1', 'Door team', {
    backend: api,
    unlock: async () => {
      calls.unlocks++;
      if (unlockWorks) api.spaceMode.locked = false;
      return unlockWorks;
    },
    openJournal: (text) => calls.journal.push(text),
    onChange: () => calls.changes++,
  });
  return { api, space, calls, failUnlock: () => { unlockWorks = false; } };
}

test('space mode: the box is always there, with the backend placeholder', async () => {
  const { space } = setup();
  // Before anything is read the box already exists.
  assert.equal(space.screen().box.placeholder, 'Write to Myu…');
  assert.equal(await space.open(), true);
  const s = space.screen();
  assert.equal(s.box.placeholder, 'What do you want to bring up?');
  assert.equal(s.title, 'Door team');
});

test('space mode: for a person Myu has little of, the hints sit under the box as quiet lines', async () => {
  const { space } = setup();
  await space.open();
  const s = space.screen();
  assert.equal(s.box.hintsLead, 'If it helps:');
  assert.equal(s.box.hints.length, 3);
  // Hints are text for the box, never choices of the ask.
  assert.deepEqual(s.ask?.choices.map((c) => c.label), ['Nothing this time']);
  const rich = setup((api) => { api.spaceMode.thin = false; });
  await rich.space.open();
  assert.deepEqual(rich.space.screen().box.hints, []);
});

test('space mode: one ask at a time, no counter, no list, no second box', async () => {
  const { space } = setup();
  await space.open();
  const s = space.screen();
  assert.ok(s.ask, 'the opening ask is up');
  assert.match(s.ask.text, /What do you want to bring up\?/);
  assert.equal(s.turns.length, 0, 'the ask is not printed twice');
  const keys = Object.keys(s);
  for (const banned of ['position', 'counter', 'asks', 'open_lines', 'ownWords']) assert.ok(!keys.includes(banned), banned);
  assert.doesNotMatch(JSON.stringify(s), /\b\d+ of \d+\b/);
});

test('space mode: typed words come first; Myu answers with how it should go to the team', async () => {
  const { space, api } = setup();
  await space.open();
  const sent = space.send('The release date slipped twice.');
  // At once: the person's own turn under the ask, and "Myu is reading…".
  const during = space.screen();
  assert.deepEqual(during.after.map((t) => [t.from, t.text]), [['you', 'The release date slipped twice.']]);
  assert.equal(during.reading, true);
  await sent;
  const s = space.screen();
  assert.equal(s.reading, false);
  assert.equal(s.ask?.text, 'Got it. How should this go to the team?');
  assert.deepEqual(s.ask?.choices.map((c) => c.id), ['named', 'question', 'private']);
  assert.equal(s.after.length, 0, 'the read carries what was shown ahead of it');
  // The step the person typed past reads as answered, with no choice marked.
  const parked = api.spaceMode.turns.find((t) => t.answered);
  assert.equal(parked?.answered?.choice_id, 'typed');
  assert.deepEqual(s.turns.map((t) => t.from), ['myu', 'you']);
});

test('space mode: words typed in a space go INTO its conversation, never to a journal thread', async () => {
  const { space, api } = setup();
  const seen: Array<[string, string]> = [];
  const real = api.addSubjectTurn.bind(api);
  api.addSubjectTurn = async (conversationId, content) => { seen.push([conversationId, content]); return real(conversationId, content); };
  await space.open();
  await space.send('Reviews sat for days.');
  assert.deepEqual(seen, [['mock-conv-s1', 'Reviews sat for days.']]);
  assert.equal(api.state.journals.size, 0);
});

test('space mode: answered replies (the wall line) are appended as Myu\'s turn', async () => {
  const { space } = setup();
  await space.open();
  await space.send('what do you think of Dan');
  const s = space.screen();
  const said = [...s.turns, ...s.after].filter((t) => t.from === 'myu').map((t) => t.text);
  assert.ok(said.includes("I don't see anyone else's private notes; I can tell you what the team shared."));
  // The ask that was up is still the one ask.
  assert.match(s.ask?.text ?? '', /What do you want to bring up\?/);
});

test('space mode: the readback prints each bullet on its own line, the warning apart', async () => {
  const { space } = setup();
  await space.open();
  await space.send('The release date slipped twice.');
  await space.choose('named');
  assert.equal(space.screen().ask?.text, "Anything else? Type it, or say you're done.");
  await space.choose('done');
  const ask = space.screen().ask;
  assert.ok(ask?.parts, 'the readback has parts');
  assert.deepEqual(ask.parts.lead, ['Here is what the team will see on Saturday:']);
  assert.deepEqual(ask.parts.bullets, ['"The release date slipped twice." with your name']);
  assert.deepEqual(ask.parts.closing, ['Nothing else is shared.']);
  assert.deepEqual(ask.parts.warning, ["Once the questions are up, a no-name question can't be taken back."]);
  assert.deepEqual(ask.choices.map((c) => c.id), ['push', 'change', 'hold']);
});

test('space mode: the talk\'s version is three buttons and a quiet "Leave it"', async () => {
  const { space } = setup();
  await space.open();
  await space.send('Jim sets dates nobody believes.');
  await space.choose('private');
  assert.deepEqual(space.screen().ask?.choices.map((c) => c.id), ['talk', 'leave'], 'two choices stay two buttons');
  assert.equal(space.screen().ask?.quiet, null);
  await space.choose('talk');
  const ask = space.screen().ask;
  assert.deepEqual(ask?.choices.map((c) => c.id), ['named', 'question', 'private']);
  assert.equal(ask?.quiet?.label, 'Leave it');
});

test('space mode: "Change something" puts the cursor back in the box', async () => {
  const { space } = setup();
  await space.open();
  space.wantsFocus = false;
  await space.send('One thing.');
  await space.choose('named');
  await space.choose('done');
  space.wantsFocus = false;
  await space.choose('change');
  assert.equal(space.wantsFocus, true);
});

test('space mode: "Take it there" opens the journal with the text in the box, unsent', async () => {
  const { space, calls, api } = setup();
  await space.open();
  await space.send('this is bigger than the team, it is my whole career');
  assert.deepEqual(space.screen().ask?.choices.map((c) => c.label), ['Take it there', 'Not now']);
  api.spaceMode.own.push('I keep saying yes to dates I doubt.');
  await space.choose('journal');
  assert.deepEqual(calls.journal, ['I keep saying yes to dates I doubt.']);
  assert.equal(api.state.journals.size, 0, 'nothing was sent to the journal');
});

test('space mode: a locked space offers the unlock in place, and it works without going anywhere', async () => {
  const { space, calls } = setup((api) => { api.spaceMode.locked = true; });
  await space.open();
  await space.send('what did we decide last time');
  let s = space.screen();
  assert.equal(s.unlock.show, true);
  assert.ok([...s.turns, ...s.after].some((t) => t.text === 'Unlock this space to read it.'));
  await space.unlockSpace();
  s = space.screen();
  assert.equal(calls.unlocks, 1);
  assert.equal(s.unlock.show, false);
  assert.equal(s.unlock.failed, false);
});

test('space mode: an unlock that cannot be done says so in place', async () => {
  const t = setup((api) => { api.spaceMode.locked = true; });
  t.failUnlock();
  await t.space.open();
  await t.space.send('what did we decide last time');
  await t.space.unlockSpace();
  const s = t.space.screen();
  assert.equal(s.unlock.show, true);
  assert.equal(s.unlock.failed, true);
});

test('space mode: a share refused for a locked space keeps the ask up and says why', async () => {
  const { space } = setup((api) => { api.spaceMode.locked = true; });
  await space.open();
  await space.send('One thing.');
  await space.choose('named');
  await space.choose('done');
  await space.choose('push');
  const s = space.screen();
  assert.equal(s.note, 'Unlock this space to read it.');
  assert.equal(s.unlock.show, true);
  assert.deepEqual(s.ask?.choices.map((c) => c.id), ['push', 'change', 'hold'], 'the ask is still up');
});

test('space mode: where things stand is a status, always current, never a turn', async () => {
  const api = new MockApi();
  const space = new SpaceConversation('s1', 'Door team', { backend: api, unlock: async () => true, openJournal: () => {}, onChange: () => {} });
  await space.open();
  const before = space.screen();
  const said = (s: ReturnType<SpaceConversation['screen']>) => [...s.turns, ...s.after].map((t) => t.text);
  // It is not a turn, on a fresh visit or a later one.
  if (before.status) assert.ok(!said(before).includes(before.status));
  assert.ok(!('firstLine' in before));
  // Once something is said it is STILL there (it used to go), and it says what the latest read says.
  await space.send('Reviews sat for days.');
  const after = space.screen();
  // R20: the backend's lean line, as sent; nothing added.
  assert.equal(after.status, 'Retro Saturday at 2pm');
  assert.ok(after.status && !said(after).includes(after.status));
});

test('space mode: an open tell is never the ask; it stays where it was said', async () => {
  const tell = { line_id: 'T1', ask_kind: 'tell', text: "Smb accepted your invitation to the space 'Door team'.", created_at: '2026-09-18T12:30:00Z' };
  const ask = { line_id: 'L5', ask_kind: 'choice', text: "Anything else? Type it, or say you're done.", choices: [{ id: 'done', label: "I'm done" }], created_at: '2026-09-18T10:00:00Z' };
  const read = (open_line: typeof tell | typeof ask, open_lines: Array<typeof tell | typeof ask>) => ({
    status: 200, ok: true, error: null,
    data: {
      success: true, conversation_id: 'c1', mode: 'space', subject: { type: 'space', id: 's1', label: 'Door team' },
      history: [
        { turn_id: 'a', from: 'myu' as const, at: '2026-09-18T09:00:00Z', text: tell.text, line_id: 'T1' },
        { turn_id: 'b', from: 'you' as const, at: '2026-09-18T11:00:00Z', text: 'what is this space' },
        { turn_id: 'c', from: 'myu' as const, at: '2026-09-18T11:00:01Z', text: 'A space for the door team.' },
      ],
      open_line, open_lines,
    },
  });
  const make = (data: ReturnType<typeof read>) => new SpaceConversation('s1', 'Door team', {
    backend: { getSubjectConversation: async () => data, addSubjectTurn: async () => ({ status: 200, ok: true, error: null, data: {} }), answerMyuLine: async () => ({ status: 200, ok: true, error: null, data: { success: true } }) },
    unlock: async () => true, openJournal: () => {}, onChange: () => {},
  });
  // Only the tell is open: nothing is drawn after the history, and the tell is first, once.
  const only = make(read(tell, [tell]));
  await only.open();
  assert.equal(only.screen().ask, null);
  assert.deepEqual(only.screen().turns.map((t) => t.text), [tell.text, 'what is this space', 'A space for the door team.']);
  // A NEWER tell beside an ask: the ask is the ask.
  const both = make(read(tell, [ask, tell]));
  await both.open();
  assert.equal(both.screen().ask?.line_id, 'L5');
  assert.equal(both.screen().turns.filter((t) => t.text === tell.text).length, 1);
});

test('space mode: "Earlier" asks for what came before; the same turns back reads "Nothing earlier."', async () => {
  const { space, api } = setup();
  await space.open();
  assert.equal(space.screen().earlier, 'link');
  await space.loadEarlier();
  assert.equal(api.spaceMode.earlierAsked, 1);
  assert.equal(space.screen().earlier, 'none');
});

test('space mode: a read-only session is told what it may do', async () => {
  const { space } = setup((api) => { api.spaceMode.agent = true; });
  await space.open();
  await space.send('bring up the release');
  const said = space.screen().after.filter((t) => t.from === 'myu').map((t) => t.text);
  assert.deepEqual(said, ["This session can read the retro's state, not act in it."]);
});

test('space mode: a locked turn never shows ciphertext', async () => {
  const { space, api } = setup();
  await space.open();
  api.spaceMode.turns.unshift({ turn_id: 'x', from: 'myu', at: '2026-09-18T09:00:00Z', text: '[Encrypted content - unlock required]' });
  await space.refresh();
  const s = space.screen();
  assert.equal(s.turns[0]?.text, LOCKED_TURN_WORDS);
  assert.equal(s.unlock.show, true);
});

test('an older backend with no space mode is reported, so the caller can fall back', async () => {
  const api = new MockApi();
  const real = api.getSubjectConversation.bind(api);
  api.getSubjectConversation = async (type, id, opts) => {
    const res = await real(type, id, opts);
    if (res.data) delete res.data.mode;
    return res;
  };
  const space = new SpaceConversation('s1', 'Door team', { backend: api, unlock: async () => true, openJournal: () => {}, onChange: () => {} });
  assert.equal(await space.open(), false);
  assert.equal(space.opened, true);
  assert.equal(space.isSpace, false);
});

test('a read that fails stays in the space and says so (it never falls through to the journal)', async () => {
  const api = new MockApi();
  api.state.offline = true;
  const space = new SpaceConversation('s1', 'Door team', { backend: api, unlock: async () => true, openJournal: () => {}, onChange: () => {} });
  assert.equal(await space.open(), false);
  assert.equal(space.opened, false);
  assert.match(space.screen().failed ?? '', /offline/i);
  assert.equal(space.screen().box.placeholder, 'Write to Myu…', 'the box is still there');
});

test('the door on a space\'s Today entry: words from the step, never a count', async () => {
  const api = new MockApi();
  const door = async () => spaceDoorLabel((await api.getRetroPrepMine('s1')).data);
  assert.equal(await door(), 'Myu is asking what you want to bring up ▸');
  api.spaceMode.step = 'readback';
  assert.equal(await door(), 'Ready to share with the team ▸');
  api.spaceMode.step = 'shared';
  assert.equal(await door(), 'Shared. Myu will tell you when the questions are up.');
  assert.equal(spaceDoorLabel(null), 'Ask Myu about this space ▸');
  for (const step of ['open', 'readback', 'shared'] as const) {
    api.spaceMode.step = step;
    assert.doesNotMatch(await door(), /\d/);
  }
});

test('the spaces among today\'s entries, once each', () => {
  assert.deepEqual(
    spaceIdsOf([
      { subjects: [{ type: 'space', id: 's1' }] },
      { conversation: { subject_type: 'space', subject_id: 's1' } },
      { subjects: [{ type: 'person', id: 'p1' }] },
      { conversation: { subject_type: 'space', subject_id: 's2' } },
    ]),
    ['s1', 's2'],
  );
});

test('space mode: with two asks open underneath, the one Myu said last is shown, and it is the one a button answers', async () => {
  // The newer ask carries the newer `created_at`, as the backend sends it; that is what decides.
  const older = { line_id: 'L5', text: "Anything else? Type it, or say you're done.", choices: [{ id: 'done', label: "I'm done" }], created_at: '2026-09-18T10:00:00Z' };
  const newer = { line_id: 'L6', text: 'Take this back? "The release date slipped twice."', choices: [{ id: 'take_back', label: 'Take it back' }, { id: 'leave', label: 'Leave it' }], created_at: '2026-09-18T10:01:02Z' };
  const answered: string[] = [];
  const backend = {
    getSubjectConversation: async () => ({
      status: 200, ok: true, error: null,
      data: {
        success: true, conversation_id: 'c1', mode: 'space', subject: { type: 'space', id: 's1', label: 'Door team' },
        history: [
          { turn_id: 'a', from: 'myu' as const, at: '2026-09-18T10:00:00Z', text: older.text, line_id: 'L5', choices: older.choices },
          { turn_id: 'b', from: 'you' as const, at: '2026-09-18T10:01:00Z', text: 'take that back' },
          { turn_id: 'c', from: 'myu' as const, at: '2026-09-18T10:01:02Z', text: newer.text, line_id: 'L6', choices: newer.choices },
        ],
        // The backend's open_line is the OLDEST open ask.
        open_line: older, open_lines: [older, newer],
      },
    }),
    addSubjectTurn: async () => ({ status: 200, ok: true, error: null, data: {} }),
    answerMyuLine: async (lineId: string) => { answered.push(lineId); return { status: 200, ok: true, error: null, data: { success: true, readback: { text: 'Taken back.' } } }; },
  };
  const space = new SpaceConversation('s1', 'Door team', { backend, unlock: async () => true, openJournal: () => {}, onChange: () => {} });
  await space.open();
  const s = space.screen();
  assert.equal(s.ask?.line_id, 'L6');
  assert.deepEqual(s.turns.map((t) => t.key), ['a', 'b'], 'the older ask stays in what was said; it is not a second set of buttons');
  await space.choose('take_back');
  assert.deepEqual(answered, ['L6']);
});

test('invitee first (R18): "Add my LinkedIn" and "Connect my calendar" say where on the web, in place', async () => {
  const ask = {
    line_id: 'N1',
    text: "I don't know much about you yet. With your LinkedIn profile or a resume, I can suggest things next time and write in a way that fits your work.",
    choices: [{ id: 'add_linkedin', label: 'Add my LinkedIn' }, { id: 'upload_resume', label: 'Upload a resume' }, { id: 'not_now', label: 'Not now' }],
    created_at: '2026-09-24T10:00:00Z',
  };
  let effects: Array<Record<string, unknown>> = [{ type: 'open_onboarding', step: 'linkedin' }];
  const backend = {
    getSubjectConversation: async () => ({
      status: 200, ok: true, error: null,
      data: {
        success: true, conversation_id: 'c1', mode: 'space', subject: { type: 'space', id: 's1', label: 'Door team' },
        history: [{ turn_id: 'a', from: 'myu' as const, at: ask.created_at, text: ask.text, line_id: 'N1', choices: ask.choices }],
        open_line: ask, open_lines: [ask],
      },
    }),
    addSubjectTurn: async () => ({ status: 200, ok: true, error: null, data: {} }),
    answerMyuLine: async () => ({ status: 200, ok: true, error: null, data: { success: true, readback: { text: '' }, effects: effects as never } }),
  };
  const space = new SpaceConversation('s1', 'Door team', { backend, unlock: async () => true, openJournal: () => {}, onChange: () => {}, apiBase: 'https://myu.askmyu.com/api' });
  await space.open();
  await space.choose('add_linkedin');
  assert.equal(space.screen().note, 'To add your LinkedIn profile or a resume, open your Home page on the web: https://myu.askmyu.com/dashboard');
  effects = [{ type: 'consent_needed', provider: 'google', scope_set: 'calendar', init_path: '/oauth/google/init', return_to: 'dashboard' }];
  await space.choose('add_linkedin');
  assert.equal(
    space.screen().note,
    'To let Myu see your calendar, open this link in a browser where you are signed in: https://myu.askmyu.com/api/oauth/google/init?scope_set=calendar&return_to=dashboard',
  );
});

test('a press on an ask that closed under it (409 line_closed): the conversation is read again, nothing is said', async () => {
  const { api, space } = setup();
  await space.open();
  await space.send('The release date slipped twice.');
  const stale = api.spaceMode.open?.line_id;
  assert.ok(stale, 'an ask is up');
  // Answered elsewhere first (another device): the ask this pane still shows is closed now.
  const first = await api.answerMyuLine(stale!, { choice_id: 'named' });
  assert.equal(first.ok, true);
  await space.choose('named');
  const s = space.screen();
  assert.equal(s.ask?.text, "Anything else? Type it, or say you're done.", 'what is open now');
  assert.equal(s.note, null, 'no note about the closed one');
  const second = await api.answerMyuLine(stale!, { choice_id: 'named' });
  assert.equal(second.status, 409);
  assert.equal(second.error, 'line_closed');
});
