/**
 * One colleague is one person, where the vault draws Myu's lines (2026-11-15): the question about who someone is with each of its
 * four answers, "No, someone else" by a person and by a typed name, the assumed tie and "Not her?", and the words the server said
 * back; then the people "Who is it?" finds. Runs in the unit-test entry, where `obsidian` THROWS: nothing here touches the host.
 *
 * The lines are as measured on local-dev (15 Nov): the question arrives with `ask_kind: "choice"`, the four choices and its evidence of
 * kind `identity`, and no `kind` or payload yet; the assumed tie with `ask_kind: "assume"` and the same evidence.
 */

import { strict as assert } from 'node:assert';
import test from 'node:test';

import { MockApi } from '../src/transport/mock';
import type { EntityHeadline, MyuLineLite } from '../src/transport/api';
import { lineButtons, pressLineButton, tapAnswers } from '../src/lineAnswers';
import { IDENTITY_NEVER, IDENTITY_WORDS } from '../src/personIdentities';
import { identityChoices, identityLine, isIdentityAsk, isIdentityAssumed, lineWords, notThemLabel, peopleFinder, peopleMatching } from '../src/identityLines';
import { linesAfterRead, readsAgainFor } from '../src/todayLines';

const API = 'https://myu.askmyu.com/api';
const QUESTION = 'Is tessc-gh on GitHub Tess Colleague? 3 things are waiting under that name.';
const CLAIM = 'Myu took tessc-gh on GitHub to be Tess Colleague, from her address on a commit.';

const askLine = (over: Partial<MyuLineLite> = {}): MyuLineLite => ({
  line_id: 'ID1',
  text: QUESTION,
  needs_you: true,
  ask_kind: 'choice',
  choices: [
    { id: 'yes', label: 'Yes' },
    { id: 'someone_else', label: 'No, someone else' },
    { id: 'not_a_person', label: 'Not a person', readback: 'Okay. Myu will not ask about it again.' },
    { id: 'not_now', label: 'Not now', readback: 'Okay. Myu will ask again if more comes under that name.' },
  ],
  why: { fired_because: '3 things are waiting under that name.', evidence: [{ kind: 'identity', count: 3, ref: 'idn-1' }] },
  state: 'released',
  ...over,
});

const assumedLine = (over: Partial<MyuLineLite> = {}): MyuLineLite => ({
  line_id: 'IA1',
  subjects: [{ type: 'person', id: 'rel-tess', label: 'Tess Colleague' }],
  text: `${CLAIM} Not her?`,
  needs_you: false,
  ask_kind: 'assume',
  assumed: { claim: 'tessc-gh on GitHub is Tess Colleague', changeable: true },
  why: { fired_because: 'from her address on a commit', evidence: [{ kind: 'identity', count: 1, ref: 'idn-2' }] },
  state: 'released',
  ...over,
});

const answerVia = (api: MockApi) => ({ answer: (id: string, a: Parameters<MockApi['answerMyuLine']>[1]) => api.answerMyuLine(id, a), apiBase: API });
const ids = (l: MyuLineLite) => lineButtons(l).map((b) => `${b.id}${b.quiet ? '(quiet)' : ''}${b.opens ? `(${b.opens})` : ''}`);

// ── the question ─────────────────────────────────────────────

test('the question, known by its evidence until the server sends its kind, and by its kind once it does', () => {
  assert.deepEqual(identityLine(askLine()), { which: 'ask', identity_id: 'idn-1', guess_relationship_id: null, relationship_id: null });
  assert.equal(isIdentityAsk(askLine()), true);
  assert.equal(isIdentityAsk(askLine({ kind: 'identity_ask', why: null, identity: { identity_id: 'idn-9', guess_relationship_id: 'rel-tess' } })), true);
  // A someone-else choice with no such evidence is another line (the "About you" question's own "Someone else").
  assert.equal(isIdentityAsk(askLine({ why: { fired_because: 'x', evidence: [{ kind: 'commitment', ref: 'c1' }] } })), false);
  assert.equal(isIdentityAsk(askLine({ kind: 'check_promise' })), false, 'a served kind of another line wins');
  assert.equal(isIdentityAsk(askLine({ ask_kind: 'tell' })), false);
});

test('its choices as the server sends them: Yes · No, someone else · Not a person · Not now; no other way out is added', () => {
  assert.deepEqual(ids(askLine()), ['yes', 'someone_else(who)', 'not_a_person', 'not_now(quiet)']);
  assert.deepEqual(lineButtons(askLine()).map((b) => b.label), ['Yes', 'No, someone else', 'Not a person', 'Not now']);
  assert.deepEqual(lineButtons(askLine()).map((b) => b.answer), [{ choice_id: 'yes' }, { choice_id: 'someone_else' }, { choice_id: 'not_a_person' }, { choice_id: 'not_now' }]);
  // No guess: no Yes, and "Choose who".
  const noGuess = askLine({ text: 'Who is tessc-gh on GitHub? 1 thing is waiting under that name.', choices: [{ id: 'someone_else', label: 'Choose who' }, { id: 'not_a_person', label: 'Not a person' }, { id: 'not_now', label: 'Not now' }] });
  assert.deepEqual(lineButtons(noGuess).map((b) => b.label), ['Choose who', 'Not a person', 'Not now']);
  // Choices sent without their words read in shared's; none sent at all, shared's four.
  assert.deepEqual(identityChoices(askLine({ choices: [{ id: 'yes' }, { id: 'someone_else' }, { id: 'not_a_person' }, { id: 'not_now' }] })).map((c) => c.label), ['Yes', 'No, someone else', 'Not a person', 'Not now']);
  assert.deepEqual(identityChoices(askLine({ kind: 'identity_ask', choices: [], identity: { guess_relationship_id: 'rel-tess' } })).map((c) => c.label), ['Yes', 'No, someone else', 'Not a person', 'Not now']);
  assert.deepEqual(identityChoices(askLine({ kind: 'identity_ask', choices: [] })).map((c) => c.label), ['Choose who', 'Not a person', 'Not now']);
  assert.equal(tapAnswers(askLine()), true);
});

test('Yes, Not a person and Not now each answer {choice_id} and show what the server said back', async () => {
  const replies: Record<string, { readback: string; said?: string }> = {
    yes: { readback: 'Okay.', said: 'Done. 3 things moved to Tess Colleague.' },
    not_a_person: { readback: 'Okay. Myu will not ask about it again.' },
    not_now: { readback: 'Okay. Myu will ask again if more comes under that name.' },
  };
  for (const [id, r] of Object.entries(replies)) {
    const api = new MockApi();
    const l = askLine({ line_id: `ID-${id}` });
    api.dayLines = [l];
    api.dayAnswers[l.line_id] = () => ({ success: true, readback: { text: r.readback }, effects: r.said ? [{ type: 'row_updated' }, { type: 'said', text: r.said }] : [] });
    const out = await pressLineButton(answerVia(api), l, lineButtons(l).find((b) => b.id === id)!);
    assert.deepEqual(api.dayAnswered, [{ line_id: l.line_id, answer: { choice_id: id } }], id);
    assert.equal(out.settled, true, id);
    assert.equal(out.ui.said, r.said ?? r.readback, id);
  }
});

test('"No, someone else" pressed bare sends nothing; a person chosen sends their id, a typed name sends the name', async () => {
  const api = new MockApi();
  const l = askLine();
  api.dayLines = [l];
  api.dayAnswers.ID1 = (a) => ({
    success: true,
    readback: { text: 'Okay.' },
    effects: [{ type: 'said', text: a.relationship_id ? 'Done. 1 thing moved to Omar Haddad.' : 'Done. 3 things moved to Rowan Field.' }],
  });
  const someoneElse = lineButtons(l).find((b) => b.opens === 'who')!;
  const bare = await pressLineButton(answerVia(api), l, someoneElse);
  assert.equal(bare.settled, false);
  assert.deepEqual(bare.ui, {});
  assert.deepEqual(api.dayAnswered, [], 'nothing goes without someone');
  // Spaces alone are no name either.
  await pressLineButton(answerVia(api), l, { ...someoneElse, answer: { choice_id: 'someone_else', text: '   ' } });
  assert.deepEqual(api.dayAnswered, []);

  const byPerson = await pressLineButton(answerVia(api), l, { ...someoneElse, answer: { choice_id: 'someone_else', relationship_id: 'rel-omar' } });
  assert.deepEqual(api.dayAnswered, [{ line_id: 'ID1', answer: { choice_id: 'someone_else', relationship_id: 'rel-omar' } }]);
  assert.equal(byPerson.ui.said, 'Done. 1 thing moved to Omar Haddad.');

  const api2 = new MockApi();
  const l2 = askLine({ line_id: 'ID2' });
  api2.dayLines = [l2];
  api2.dayAnswers.ID2 = () => ({ success: true, readback: { text: 'Okay.' }, effects: [{ type: 'said', text: 'Done. 3 things moved to Rowan Field.' }] });
  const byName = await pressLineButton(answerVia(api2), l2, { ...someoneElse, answer: { choice_id: 'someone_else', text: 'Rowan Field' } });
  assert.deepEqual(api2.dayAnswered, [{ line_id: 'ID2', answer: { choice_id: 'someone_else', text: 'Rowan Field' } }]);
  assert.equal(byName.ui.said, 'Done. 3 things moved to Rowan Field.');
  assert.equal(byName.ui.good, true);
});

// ── the assumed tie ──────────────────────────────────────────

test('the assumed tie: its claim on the row, "Not her?" as its one button, answering {change: true}', async () => {
  const l = assumedLine();
  assert.equal(isIdentityAssumed(l), true);
  assert.equal(isIdentityAsk(l), false);
  assert.equal(lineWords(l), CLAIM);
  assert.deepEqual(lineButtons(l).map((b) => [b.label, b.answer, b.quiet]), [['Not her?', { change: true }, false]]);
  assert.equal(notThemLabel(assumedLine({ text: 'Myu took Tess C. in Linear to be Tess Colleague, from the same name in Linear. Not them?' })), 'Not them?');
  assert.equal(notThemLabel(assumedLine({ text: 'Myu took tessc-gh on GitHub to be Tom Colleague, from his own GitHub sign-in. Not him?' })), 'Not him?');
  // Words the server ends some other way keep "Not them?" on the button; one that cannot be changed has none.
  assert.equal(notThemLabel(assumedLine({ text: 'Myu took tessc-gh on GitHub to be Tess Colleague.' })), 'Not them?');
  assert.deepEqual(lineButtons(assumedLine({ assumed: { changeable: false } })), []);
  // Every other assume line keeps "Change" and its full words.
  const other = assumedLine({ why: { fired_because: 'x', evidence: [{ kind: 'commitment', ref: 'c' }] }, text: 'Myu took the 2pm to be your 1:1 with Dana.' });
  assert.deepEqual(lineButtons(other).map((b) => b.label), ['Change']);
  assert.equal(lineWords(other), 'Myu took the 2pm to be your 1:1 with Dana.');

  const api = new MockApi();
  api.dayLines = [l];
  api.dayAnswers.IA1 = () => ({ success: true, readback: { text: 'Okay.' }, effects: [{ type: 'said', text: 'Taken off. 1 thing went back to waiting.' }] });
  const out = await pressLineButton(answerVia(api), l, lineButtons(l)[0]);
  assert.deepEqual(api.dayAnswered, [{ line_id: 'IA1', answer: { change: true } }]);
  assert.equal(out.ui.said, 'Taken off. 1 thing went back to waiting.');
});

// ── what the server said back ───────────────────────────────

test('the said-back words: the server’s `said` sentence over its "Okay.", the readback when there is none, for any line', async () => {
  const cases: Array<[Record<string, unknown>, string]> = [
    [{ readback: { text: 'Okay.' }, effects: [{ type: 'said', text: 'Done. 1 thing moved to Tess Colleague.' }] }, 'Done. 1 thing moved to Tess Colleague.'],
    [{ readback: { text: 'Okay.' }, effects: [{ type: 'said', text: '  ' }] }, 'Okay.'],
    [{ readback: { text: 'Okay.' }, effects: [{ type: 'said', text: 7 }] }, 'Okay.'],
    [{ readback: { text: 'Okay. Myu will not ask about it again.' } }, 'Okay. Myu will not ask about it again.'],
    // A line of another kind that carries the sentence shows it too.
    [{ readback: { text: 'Noted.' }, effects: [{ type: 'said', text: 'Done. 2 things moved to Priya Raman.' }] }, 'Done. 2 things moved to Priya Raman.'],
  ];
  for (const [i, [reply, words]] of cases.entries()) {
    const api = new MockApi();
    const l = askLine({ line_id: `S${i}` });
    api.dayLines = [l];
    api.dayAnswers[l.line_id] = () => ({ success: true, ...reply }) as never;
    const out = await pressLineButton(answerVia(api), l, lineButtons(l)[0]);
    assert.equal(out.ui.said, words, JSON.stringify(reply));
  }
  // An answer that stays open says it under the line, the same way.
  const api = new MockApi();
  const l = askLine({ line_id: 'OPEN' });
  api.dayLines = [l];
  api.dayAnswers.OPEN = () => ({ success: true, line_open: true, readback: { text: 'Okay.' }, effects: [{ type: 'said', text: 'Only you can answer this.' }] });
  const open = await pressLineButton(answerVia(api), l, lineButtons(l)[0]);
  assert.equal(open.settled, false);
  assert.equal(open.ui.note, 'Only you can answer this.');
});

// ── who is it ───────────────────────────────────────────────

const person = (id: string, name: string, organization?: string): EntityHeadline => ({ entity_type: 'person', entity_id: id, display_name: name, item_count: 0, top_urgency: 'info', ...(organization ? { organization } : {}) });
const PEOPLE: EntityHeadline[] = [person('rel-tess', 'Tess Colleague', 'Corvid'), person('rel-tom', 'Tom Collins'), person('rel-omar', 'Omar Haddad', 'Corvid'), { ...person('co-1', 'Tessera Labs'), entity_type: 'company' }];

test('the people "Who is it?" lists: every typed word starts a word of the name; the list first, then the search; people only, each once', () => {
  assert.deepEqual(peopleMatching(PEOPLE, [], 'tess').map((p) => p.name), ['Tess Colleague']);
  assert.deepEqual(peopleMatching(PEOPLE, [], 'col').map((p) => p.name), ['Tess Colleague', 'Tom Collins']);
  assert.deepEqual(peopleMatching(PEOPLE, [], 'tess col'), [{ id: 'rel-tess', name: 'Tess Colleague', sub: 'Corvid' }]);
  assert.deepEqual(peopleMatching(PEOPLE, [], 'ess'), [], 'the middle of a name is not a match');
  assert.deepEqual(peopleMatching(PEOPLE, [], '  '), []);
  const found: EntityHeadline[] = [person('rel-tess', 'Tess Colleague'), person('rel-rowan', 'Rowan Field'), { ...person('self', 'Me Myself'), entity_type: 'self' }];
  assert.deepEqual(peopleMatching(PEOPLE, found, 'tess').map((p) => p.id), ['rel-tess', 'rel-rowan']);
  const many = Array.from({ length: 9 }, (_, i) => person(`r${i}`, `Sam ${i}`));
  assert.equal(peopleMatching(many, [], 'sam').length, 6);
});

test('the finder: a moment after the last key, the people list read once, the search from two letters; an overtaken query answers nothing', async () => {
  const api = new MockApi();
  let t = 0;
  const waits: Array<() => void> = [];
  const find = peopleFinder(() => api, { wait: () => new Promise<void>((r) => waits.push(r)), now: () => t });
  const first = find('m');
  const second = find('ma');
  waits.splice(0).forEach((r) => r());
  assert.deepEqual(await first, [], 'overtaken');
  // The list's own match first, then whoever the server's search found that the list leaves out ("ma" in Raman: the server's
  // search is taken as it answers; Mark Delaney is someone Myu is not keeping track of yet, whom only the search finds).
  assert.deepEqual((await second).map((p) => p.name), ['Marcus Webb', 'Priya Raman', 'Mark Delaney']);
  assert.equal(api.peopleListReads, 1);
  assert.equal(api.searchReads, 1);
  // One letter: the list only. The list is kept a while, then read again.
  const one = find('p');
  waits.splice(0).forEach((r) => r());
  assert.deepEqual((await one).map((p) => p.name), ['Priya Raman']);
  assert.equal(api.searchReads, 1);
  assert.equal(api.peopleListReads, 1);
  t += 6 * 60_000;
  const later = find('ji');
  waits.splice(0).forEach((r) => r());
  assert.deepEqual((await later).map((p) => p.name), ['Jim Halvorsen'], 'the search finds whoever the list leaves out');
  assert.equal(api.peopleListReads, 2);
  assert.deepEqual(await find(' '), []);
});

// ── the words ───────────────────────────────────────────────

test('nothing a person reads here says identity, relationship, candidate, stand-in, handle, login or merge', () => {
  const shown = [
    ...lineButtons(askLine()).map((b) => b.label),
    ...lineButtons(assumedLine()).map((b) => b.label),
    ...IDENTITY_WORDS.choices(true).map((c) => c.label),
    ...IDENTITY_WORDS.choices(false).map((c) => c.label),
    IDENTITY_WORDS.pickPrompt,
    IDENTITY_WORDS.pickPlaceholder,
    IDENTITY_WORDS.nameTyped('Rowan Field'),
    IDENTITY_WORDS.back,
    lineWords(assumedLine()),
  ];
  for (const w of shown) {
    assert.doesNotMatch(w, IDENTITY_NEVER, w);
    assert.doesNotMatch(w, /[{}_]/, w);
  }
  assert.equal(IDENTITY_WORDS.nameTyped(' Rowan Field '), 'Use “Rowan Field”');
});

// ── the follow-up (2026-11-15): served lines, Undo after an answer, a question closed elsewhere ──

/** The question as the server now serves it: with its kind and the way the person was met beside it. */
const served = (over: Partial<MyuLineLite> = {}): MyuLineLite =>
  askLine({
    line_id: 'SV1',
    kind: 'identity_ask',
    text: 'Is mira-o on GitHub Mira Okonjo? 3 things are waiting under that name.',
    identity: { identity_id: 'idn-7', kind: 'github', guess_relationship_id: 'rel-mira', guess_name: 'Mira Okonjo', waiting: 3, someone_else_takes: ['relationship_id', 'text'] },
    ...over,
  });

test('served with its kind and identity: the same question, the same four, read as before (the evidence stays the fallback)', () => {
  assert.deepEqual(identityLine(served()), { which: 'ask', identity_id: 'idn-7', guess_relationship_id: 'rel-mira', relationship_id: null });
  assert.deepEqual(lineButtons(served()).map((b) => b.label), ['Yes', 'No, someone else', 'Not a person', 'Not now']);
  const tie = assumedLine({ kind: 'identity_assumed', why: { fired_because: 'x' }, identity: { identity_id: 'idn-8', kind: 'linear', relationship_id: 'rel-lena', how: 'same_name' } });
  assert.equal(isIdentityAssumed(tie), true);
  assert.equal(identityLine(tie)?.relationship_id, 'rel-lena');
});

test('the sentence for a name equal to the person’s own, as served: the claim on the row, "Not her?" on its button', () => {
  const l = assumedLine({ kind: 'identity_assumed', text: 'Myu took the Lena Fischer in Linear to be the one you know. Not her?' });
  assert.equal(lineWords(l), 'Myu took the Lena Fischer in Linear to be the one you know.');
  assert.deepEqual(lineButtons(l).map((b) => [b.label, b.answer]), [['Not her?', { change: true }]]);
  assert.equal(notThemLabel(assumedLine({ text: 'Myu took the Lena Fischer in Linear to be the one you know. Not them?' })), 'Not them?');
});

test('Undo after an answer on the line: "Yes", "No, someone else" and "Not her?" carry their move; "Not a person" and "Not now" none', async () => {
  const moved = (text: string, moveId: string) => ({ success: true, readback: { text }, effects: [{ type: 'row_updated' }, { type: 'said', text, move_id: moveId }] });
  const cases: Array<[MyuLineLite, (l: MyuLineLite) => ReturnType<typeof lineButtons>[number], Record<string, unknown>, { said: string; moveId: string } | undefined]> = [
    [served({ line_id: 'U1' }), (l) => lineButtons(l).find((b) => b.id === 'yes')!, moved('Done. 3 things moved to Mira Okonjo.', 'mv-yes'), { said: 'Done. 3 things moved to Mira Okonjo.', moveId: 'mv-yes' }],
    [served({ line_id: 'U2' }), (l) => ({ ...lineButtons(l).find((b) => b.opens === 'who')!, answer: { choice_id: 'someone_else', relationship_id: 'rel-omar' } }), moved('Done. 3 things moved to Omar Haddad.', 'mv-who'), { said: 'Done. 3 things moved to Omar Haddad.', moveId: 'mv-who' }],
    [served({ line_id: 'U3' }), (l) => ({ ...lineButtons(l).find((b) => b.opens === 'who')!, answer: { choice_id: 'someone_else', text: 'Rowan F.' } }), moved('Done. 1 thing moved to Rowan F.', 'mv-typed'), { said: 'Done. 1 thing moved to Rowan F.', moveId: 'mv-typed' }],
    [assumedLine({ line_id: 'U4', kind: 'identity_assumed' }), (l) => lineButtons(l)[0], moved('Taken off. 1 thing went back to waiting.', 'mv-off'), { said: 'Taken off. 1 thing went back to waiting.', moveId: 'mv-off' }],
    [served({ line_id: 'U5' }), (l) => lineButtons(l).find((b) => b.id === 'not_a_person')!, { success: true, readback: { text: 'Okay. Myu will not ask about it again.' } }, undefined],
    [served({ line_id: 'U6' }), (l) => lineButtons(l).find((b) => b.id === 'not_now')!, { success: true, readback: { text: 'Okay. Myu will ask again if more comes under that name.' }, effects: [{ type: 'said', text: 'Okay. Myu will ask again if more comes under that name.' }] }, undefined],
  ];
  for (const [l, button, reply, undo] of cases) {
    const api = new MockApi();
    api.dayLines = [l];
    api.dayAnswers[l.line_id] = () => reply as never;
    const out = await pressLineButton(answerVia(api), l, button(l));
    assert.equal(out.settled, true, l.line_id);
    assert.deepEqual(out.undo, undo, l.line_id);
    if (undo) assert.equal(out.ui.said, undo.said, 'the row shows the same sentence the notice carries');
  }
});

test('a question closed elsewhere: a press answers 409, nothing is said as an error, "Already answered." stands where its buttons were', async () => {
  for (const l of [served({ line_id: 'C1' }), askLine({ line_id: 'C2' }), assumedLine({ line_id: 'C3', kind: 'identity_assumed' })]) {
    const api = new MockApi();
    api.dayLines = [{ ...l, state: 'expired' }];
    const out = await pressLineButton(answerVia(api), l, lineButtons(l)[0]);
    assert.equal(out.closed, true, l.line_id);
    assert.equal(out.settled, false);
    assert.deepEqual(out.ui, { closed: 'Already answered.' }, l.line_id);
    assert.deepEqual(api.dayAnswered, [], 'nothing was answered');
  }
  // Any other line closed under a press keeps today's behaviour: nothing said; the pane reads the list again.
  const other: MyuLineLite = { line_id: 'C9', text: 'Hold Thursday?', ask_kind: 'yes_no', state: 'expired' };
  const api = new MockApi();
  api.dayLines = [other];
  const out = await pressLineButton(answerVia(api), other, lineButtons(other)[0]);
  assert.deepEqual([out.closed, out.ui], [true, {}]);
});

test('Today after a read: a question closed elsewhere is gone; one closed under a press here stays, no longer waiting; a change to a line Today shows reads again', () => {
  const q = served({ line_id: 'Q1' });
  const other = askLine({ line_id: 'Q2', text: 'Who is tess@elsewhere.test? 1 thing is waiting under that name.' });
  const tell: MyuLineLite = { line_id: 'T1', text: 'Ana replied.', ask_kind: 'tell', state: 'released' };
  // The server no longer carries Q1 (closed elsewhere), and carries Q2 as expired.
  const read = [tell, { ...other, state: 'expired' }];
  assert.deepEqual(linesAfterRead(read, [q, other, tell], new Set()).map((l) => l.line_id), ['T1']);
  // Q1 was pressed here and answered 409: it stays, closed, so its "Already answered." can show; its dot no longer waits.
  const kept = linesAfterRead(read, [q, other, tell], new Set(), new Set(['Q1']));
  assert.deepEqual(kept.map((l) => [l.line_id, l.state, l.needs_you]), [['T1', 'released', undefined], ['Q1', 'expired', false]]);
  // Answered here: kept while the read carries it, as before.
  assert.deepEqual(linesAfterRead([{ ...q, state: 'answered' }], [q], new Set(['Q1'])).map((l) => l.line_id), ['Q1']);
  // Answered here and no longer read (2026-11-19: the read returns open lines only): kept from what was shown, in its place, once.
  const a = served({ line_id: 'A1' });
  const b = served({ line_id: 'B1' });
  assert.deepEqual(linesAfterRead([tell, b], [tell, a, b], new Set(['A1'])).map((l) => l.line_id), ['T1', 'A1', 'B1']);
  assert.deepEqual(linesAfterRead([a, tell], [a, tell], new Set(['A1'])).map((l) => l.line_id), ['A1', 'T1'], 'read still carries it: once');
  assert.deepEqual(linesAfterRead([tell], [tell, a], new Set()).map((l) => l.line_id), ['T1'], 'not answered here: gone with the read');
  // line_updated: only for a line Today shows and has not answered here.
  assert.equal(readsAgainFor('Q1', [q, tell], new Set()), true);
  assert.equal(readsAgainFor('Q9', [q, tell], new Set()), false);
  assert.equal(readsAgainFor('Q1', [q, tell], new Set(['Q1'])), false);
  assert.equal(readsAgainFor(undefined, [q], new Set()), false);
  assert.equal(readsAgainFor('Q1', null, new Set()), false);
});
