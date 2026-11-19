/**
 * The last moments of the week, in the vault (2026-11-13): what else falls on that day (Keep · Move it · Not a promise, "Which day?"),
 * "Add it?", what has repeated on a person's card, they may ask about on the prep, and your side of the work on the weekly review —
 * which buttons, what each answers, what an answer's message shows, and what each reader keeps. Runs in the unit-test entry, where
 * `obsidian` THROWS: nothing here touches the host.
 */

import { strict as assert } from 'node:assert';
import test from 'node:test';

import { MockApi } from '../src/transport/mock';
import type { MyuLineLite } from '../src/transport/api';
import { lineButtons, pressLineButton, tapAnswers } from '../src/lineAnswers';
import { LAST_MOMENTS_WORDS } from '../src/lastMoments';
import {
  LAST_MOMENTS_VAULT_WORDS,
  answerDraftOf,
  dayLabel,
  freeDaysOf,
  goalWords,
  isDay,
  mayAskOf,
  moveAnswer,
  repeatedOf,
  stepWhen,
  toldWords,
  weekItemWords,
  weekShown,
  yourWeekOf,
} from '../src/lastMomentsVault';

const API = 'https://myu.askmyu.com/api';
const NOW = new Date(2026, 10, 13, 12, 0).getTime();
const at = (daysAgo: number, h = 9, m = 20) => new Date(2026, 10, 13 - daysAgo, h, m).getTime();

const fullDay = (over: Partial<MyuLineLite> & Record<string, unknown> = {}): MyuLineLite =>
  ({
    line_id: 'FD1',
    kind: 'full_day',
    ask_kind: 'choice',
    subjects: [{ type: 'person', id: 'rel-priya', label: 'Priya Raman' }],
    text: 'You told Priya the pricing sheet by Thursday. That is the fourth thing due Thursday. Keep it?',
    choices: [],
    free_days: ['2026-11-16', { day: '2026-11-17', label: 'Tuesday, after the standup' }],
    state: 'released',
    ...over,
  }) as MyuLineLite;

const bearsOn = (over: Partial<MyuLineLite> = {}): MyuLineLite => ({
  line_id: 'BO1',
  kind: 'answer_bears_on',
  ask_kind: 'choice',
  subjects: [{ type: 'person', id: 'rel-jonah', label: 'Jonah Wells' }],
  text: 'Jonah answered in #prd-review: the export runs nightly. It bears on what you sent Omar on Monday. Add it?',
  choices: [],
  state: 'released',
  ...over,
});

const ids = (l: MyuLineLite) => lineButtons(l).map((b) => `${b.id}${b.quiet ? '(quiet)' : ''}${b.opens ? `(${b.opens})` : ''}`);

// ── what else falls on that day ─────────────────────────────

test('a full-day line: Keep · Move it · Not a promise, the server’s own or the contract’s, and no other way out', () => {
  assert.deepEqual(ids(fullDay()), ['keep', 'move(day)', 'not_promise']);
  assert.deepEqual(lineButtons(fullDay()).map((b) => b.label), ['Keep', 'Move it', 'Not a promise']);
  assert.deepEqual(lineButtons(fullDay()).map((b) => b.answer), [{ choice_id: 'keep' }, { choice_id: 'move' }, { choice_id: 'not_promise' }]);
  // The server's own choices, known by id or by words.
  const own = fullDay({ choices: [{ id: 'k', label: 'Keep' }, { id: 'mv', label: 'Move it' }, { id: 'np', label: 'Not a promise' }] });
  assert.deepEqual(ids(own), ['k', 'mv(day)', 'np']);
  // The older kind name draws the same; a tell of the kind has nothing to press.
  assert.deepEqual(ids(fullDay({ kind: 'promise_full_day' })), ['keep', 'move(day)', 'not_promise']);
  assert.deepEqual(ids(fullDay({ ask_kind: 'tell' })), []);
  assert.equal(tapAnswers(fullDay()), true);
});

test('the move answer is {choice_id: "move", day}; "Move it" pressed bare sends nothing', async () => {
  assert.deepEqual(moveAnswer('move', '2026-11-16'), { choice_id: 'move', day: '2026-11-16' });
  const api = new MockApi();
  const l = fullDay();
  api.dayLines = [l];
  const move = lineButtons(l).find((b) => b.opens === 'day')!;
  const bare = await pressLineButton({ answer: (id, a) => api.answerMyuLine(id, a), apiBase: API }, l, move);
  assert.deepEqual(api.dayAnswered, [], 'nothing goes without a day');
  assert.equal(bare.settled, false);
  await pressLineButton({ answer: (id, a) => api.answerMyuLine(id, a), apiBase: API }, l, { ...move, answer: moveAnswer(move.id, '2026-11-16') });
  assert.deepEqual(api.dayAnswered, [{ line_id: 'FD1', answer: { choice_id: 'move', day: '2026-11-16' } }]);
});

test('the free days, from either shape, on the line or its payload; a day in words when the server gives none', () => {
  assert.deepEqual(freeDaysOf(fullDay()), [
    { day: '2026-11-16', label: 'Monday 16 November' },
    { day: '2026-11-17', label: 'Tuesday, after the standup' },
  ]);
  const onPayload = { line_id: 'X', payload: { free_days: [{ date: '2026-11-18', words: 'Wednesday' }, { day: '2026-11-19' }, 'not a day', '2026-02-30', '2026-11-19'] } };
  assert.deepEqual(freeDaysOf(onPayload), [
    { day: '2026-11-18', label: 'Wednesday' },
    { day: '2026-11-19', label: 'Thursday 19 November' },
  ]);
  assert.deepEqual(freeDaysOf({ line_id: 'Y' }), []);
  assert.equal(dayLabel('2026-11-16'), 'Monday 16 November');
  assert.equal(isDay('2026-11-20'), true);
  assert.equal(isDay('2026-13-01'), false);
  assert.equal(isDay(''), false);
});

test('after Move it: the readback, then the message under "Myu’s message to Priya:" with the name from draft.to', async () => {
  const api = new MockApi();
  const l = fullDay();
  api.dayLines = [l];
  api.dayAnswers.FD1 = () => ({
    success: true,
    readback: { text: 'Moved to Monday 16 November.' },
    draft: { to: [{ name: 'Priya Raman', address: 'priya@corvid.test' }], in: 'mail', text: 'Hi Priya, the pricing sheet will come Monday instead of Thursday.', thread_ref: 'th-1' },
  });
  const move = lineButtons(l).find((b) => b.opens === 'day')!;
  const out = await pressLineButton({ answer: (id, a) => api.answerMyuLine(id, a), apiBase: API }, l, { ...move, answer: moveAnswer(move.id, '2026-11-16') });
  assert.equal(out.settled, true);
  assert.equal(out.ui.said, 'Moved to Monday 16 November.');
  assert.equal(out.ui.draft?.lead, "Myu's message to Priya:");
  assert.equal(out.ui.draft?.text, 'Hi Priya, the pricing sheet will come Monday instead of Thursday.');
  assert.equal(out.ui.draft?.to_name, 'Priya');
  assert.equal(out.ui.draft?.url, undefined, 'nothing to open; the thread is never shown');
  // Names as strings; an address stands for itself; no recipient at all.
  assert.equal(answerDraftOf({ draft: { to: ['Priya Raman'], in: 'mail', text: 'x' } }, l)?.lead, "Myu's message to Priya:");
  assert.equal(answerDraftOf({ draft: { to: 'priya@corvid.test', in: 'mail', text: 'x' } }, l)?.lead, "Myu's message to priya@corvid.test:");
  assert.equal(answerDraftOf({ draft: { in: 'mail', text: 'x' } }, l)?.lead, "Myu's message:");
  assert.equal(answerDraftOf({ draft: { to: ['Priya'], text: ' ' } }, l), null, 'no words, no message');
  assert.equal(answerDraftOf({ readback: { text: 'Kept.' } }, l), null);
});

test('Keep and Not a promise answer the line as any choice does', async () => {
  const api = new MockApi();
  const l = fullDay({ line_id: 'FD2' });
  api.dayLines = [l];
  const [keep] = lineButtons(l);
  const out = await pressLineButton({ answer: (id, a) => api.answerMyuLine(id, a), apiBase: API }, l, keep);
  assert.deepEqual(api.dayAnswered, [{ line_id: 'FD2', answer: { choice_id: 'keep' } }]);
  assert.equal(out.settled, true);
  assert.equal(out.ui.draft, undefined);
});

// ── "Add it?" ─────────────────────────────────────────────────

test('"Add it?": Add it · No, the server’s own or the contract’s, both kinds; nothing else', () => {
  assert.deepEqual(ids(bearsOn()), ['add', 'no(quiet)']);
  assert.deepEqual(lineButtons(bearsOn()).map((b) => [b.label, b.answer]), [['Add it', { choice_id: 'add' }], ['No', { choice_id: 'no' }]]);
  assert.deepEqual(ids(bearsOn({ kind: 'report_bears_on' })), ['add', 'no(quiet)']);
  assert.deepEqual(ids(bearsOn({ kind: 'add_answer', choices: [{ id: 'add_it', label: 'Add it' }, { id: 'no', label: 'No' }] })), ['add_it', 'no(quiet)']);
  assert.deepEqual(ids(bearsOn({ ask_kind: 'assume' })), []);
});

test('Add it answers {choice_id: "add"}; its addition shows with the line saying where it goes', async () => {
  const api = new MockApi();
  const l = bearsOn();
  api.dayLines = [l];
  api.dayAnswers.BO1 = () => ({
    success: true,
    readback: { text: 'Here is the addition. Copy it and add it where it goes.' },
    draft: { to: ['prd-review'], in: 'slack', thread_ref: '1731400000.000100', text: 'Adding to Monday: Jonah says the export runs nightly, so the numbers are a day behind.' },
  });
  const out = await pressLineButton({ answer: (id, a) => api.answerMyuLine(id, a), apiBase: API }, l, lineButtons(l)[0]);
  assert.deepEqual(api.dayAnswered, [{ line_id: 'BO1', answer: { choice_id: 'add' } }]);
  assert.equal(out.ui.said, 'Here is the addition. Copy it and add it where it goes.');
  assert.equal(out.ui.draft?.lead, 'To prd-review in Slack');
  assert.equal(out.ui.draft?.text, 'Adding to Monday: Jonah says the export runs nightly, so the numbers are a day behind.');
  // A channel named as the recipient is the place; a pull request's comment; mail to a person.
  const report = bearsOn({ kind: 'report_bears_on' });
  assert.equal(answerDraftOf({ draft: { to: ['#prd-review'], in: 'slack', text: 'x' } }, report)?.lead, 'In #prd-review on Slack');
  assert.equal(answerDraftOf({ draft: { to: [], in: 'github', thread_ref: 'o/r#7', text: 'x' } }, report)?.lead, 'On GitHub');
  assert.equal(answerDraftOf({ draft: { to: [{ name: 'Omar Haddad', address: 'omar@corvid.test' }], in: 'mail', text: 'x' } }, report)?.lead, 'To Omar by mail');

  const no = new MockApi();
  const l2 = bearsOn({ line_id: 'BO2' });
  no.dayLines = [l2];
  await pressLineButton({ answer: (id, a) => no.answerMyuLine(id, a), apiBase: API }, l2, lineButtons(l2)[1]);
  assert.deepEqual(no.dayAnswered, [{ line_id: 'BO2', answer: { choice_id: 'no' } }]);
});

// ── what has repeated ───────────────────────────────────────

const NOTICED = [
  {
    text: 'You asked Omar for a change summary on 3 pull requests this month.',
    count: 3,
    since: at(20),
    sources: [
      { id: 's1', quote: 'Can you add a change summary?', when_ms: at(4), link: 'https://github.com/corvid/api/pull/88#issuecomment-1' },
      { id: 's2', quote: 'Same ask as last time: a short summary of what changed.', when_ms: at(11), link: null },
    ],
  },
  { text: ' ', count: 1, sources: [] },
];

test('what has repeated: on the card, at the read’s top level, or in a section of its own; none when there is nothing', () => {
  const onCard = repeatedOf({ card: { entity_id: 'rel-omar', noticed: NOTICED } });
  assert.deepEqual(onCard.map((r) => [r.text, r.count, r.sources.length]), [['You asked Omar for a change summary on 3 pull requests this month.', 3, 2]]);
  assert.deepEqual(onCard[0].sources[0], { quote: 'Can you add a change summary?', whenMs: at(4), link: 'https://github.com/corvid/api/pull/88#issuecomment-1' });
  assert.deepEqual(repeatedOf({ card: { entity_id: 'rel-omar' }, noticed: NOTICED }), onCard);
  assert.deepEqual(repeatedOf({ card: { sections: [{ section_type: 'noticed', data: { noticed: NOTICED } }] } }), onCard);
  assert.deepEqual(repeatedOf({ card: { sections: [] } }), []);
  assert.deepEqual(repeatedOf(null), []);
});

// ── they may ask about ──────────────────────────────────────

const MAY_ASK = [
  {
    text: 'The rollout moved from Tuesday to Thursday.',
    kind: 'moved',
    with: 'Sofia Lind',
    steps: [{ text: 'Planned for Tuesday', at_ms: at(10) }, { text: 'Moved to Thursday after the load test', at_ms: at(1, 14, 2) }],
    told: [{ to: 'Sofia', when_ms: at(1), quote: 'Thursday, once the load test is green.' }],
    sources: [{ id: 'm1', quote: 'Moving the rollout to Thursday.', when_ms: at(1), link: 'https://corvid.slack.com/archives/C1/p1' }],
  },
  { text: 'Dan Park asked about the import tool.', kind: 'asked', steps: [], told: [{ sentence: 'You told Dan on Monday: “It ships next sprint.”', to: 'Dan', when_ms: at(4), quote: 'It ships next sprint.' }], sources: [] },
  { text: 'The pricing sheet is late.', kind: 'late', steps: [], told: [], sources: [] },
  { text: 'A fourth one is not shown.', kind: 'changed', steps: [], told: [], sources: [] },
];

test('they may ask about: three at most; the told sentence the server’s, else made from its parts; steps with their day and time', () => {
  const items = mayAskOf({ may_ask: MAY_ASK });
  assert.equal(items.length, 3);
  assert.deepEqual(items.map((m) => m.text), ['The rollout moved from Tuesday to Thursday.', 'Dan Park asked about the import tool.', 'The pricing sheet is late.']);
  assert.equal(toldWords(items[0].told[0], NOW), 'You told Sofia yesterday: “Thursday, once the load test is green.”');
  assert.equal(toldWords(items[1].told[0], NOW), 'You told Dan on Monday: “It ships next sprint.”');
  assert.equal(toldWords({ sentence: null, to: null, whenMs: at(30), quote: 'Soon.' }, NOW), 'You told them on 14 October: “Soon.”');
  assert.equal(toldWords({ sentence: null, to: 'Sofia', whenMs: null, quote: null }, NOW), null);
  assert.equal(stepWhen(items[0].steps[1].atMs, NOW), 'Yesterday 14:02');
  assert.equal(stepWhen(items[0].steps[0].atMs, NOW), '3 November 09:20');
  assert.equal(stepWhen(null, NOW), null);
  assert.deepEqual(mayAskOf({ prep: { may_ask: MAY_ASK.slice(0, 1) } }).length, 1);
  assert.deepEqual(mayAskOf({ title: 'Platform standup' }), []);
});

// ── your side of the work ───────────────────────────────────

const YOUR_SIDE = {
  range: { from_ms: at(4), to_ms: NOW, from_day: '2026-11-09', to_day: '2026-11-13' },
  counts: [
    { key: 'asks_reached', count: 3, sentence: '3 asks reached you: all answered.', items: [{ id: 'a1', text: 'Priya: the pricing sheet', link: 'https://mail.google.com/mail/u/0/#inbox/1', at_ms: at(3) }] },
    { key: 'promises', count: 2, sentence: 'You made 2 promises: 1 kept, 1 open.', items: [{ id: 'p1', text: 'The import tool demo', link: null, who: 'Jonah', state: 'open' }] },
    { key: 'went_against', count: 0, sentence: 'Nothing you sent went against what you decided.', items: [] },
  ],
  goals: [{ goal_id: 'g1', goal: 'Ship the import tool', count: 3, example: { text: 'Merged the CSV mapping', link: null, source: { kind: 'github', id: 'x' }, at_ms: at(2) } }],
};
const EDITION = { edition_id: 'e46', period: '2026-W46', sections: [{ section: 'movement', line: 'You talked with 6 people this week.', items: [] }], generated_at: NOW };

test('your side of the work: at the top level of the read, on the edition, or as its section; a count of zero left out', () => {
  const w = yourWeekOf(EDITION, { edition: EDITION, your_side: YOUR_SIDE });
  assert.ok(w);
  assert.deepEqual(w.counts.map((c) => c.sentence), ['3 asks reached you: all answered.', 'You made 2 promises: 1 kept, 1 open.']);
  assert.equal(w.range, '9 to 13 November');
  assert.deepEqual(w.counts[1].items, [{ text: 'The import tool demo', link: null, who: 'Jonah' }]);
  assert.equal(weekItemWords(w.counts[1].items[0]), 'The import tool demo · Jonah');
  assert.equal(goalWords(w.goals[0]), 'Ship the import tool: 3');
  assert.equal(w.goals[0].example?.text, 'Merged the CSV mapping');
  // As a section of the edition, or on it.
  const asSection = { ...EDITION, sections: [...EDITION.sections, { section: 'your_side', ...YOUR_SIDE }] };
  assert.deepEqual(yourWeekOf(asSection, { edition: asSection })?.counts.length, 2);
  assert.deepEqual(yourWeekOf({ ...EDITION, your_side: YOUR_SIDE })?.counts.length, 2);
  // Nothing counted, or nothing sent: none (the review reads as before).
  assert.equal(yourWeekOf(EDITION, { edition: EDITION }), null);
  assert.equal(yourWeekOf(EDITION, { your_side: { counts: [{ key: 'x', count: 0, sentence: 'None.' }], goals: [] } }), null);
});

test('the week Today shows: the sections but your side’s, that part beside them; nothing stale; a review of only that part shows', () => {
  const fresh = (p: string | undefined) => p === '2026-W46';
  const both = weekShown({ edition: { ...EDITION, sections: [...EDITION.sections, { section: 'your_side', line: '' }] }, your_side: YOUR_SIDE } as never, fresh);
  assert.deepEqual(both?.edition.sections.map((s: { section: string }) => s.section), ['movement']);
  assert.equal(both?.side?.counts.length, 2);
  assert.equal(weekShown({ edition: { ...EDITION, period: '2026-W40' }, your_side: YOUR_SIDE }, fresh), null, 'a stale review is not shown');
  const sideOnly = weekShown({ edition: { ...EDITION, sections: [] }, your_side: YOUR_SIDE }, fresh);
  assert.equal(sideOnly?.edition.sections.length, 0);
  assert.equal(sideOnly?.side?.counts.length, 2);
  const before = weekShown({ edition: EDITION }, fresh);
  assert.deepEqual(before, { edition: EDITION, side: null }, 'without your side, the week as before');
  assert.equal(weekShown({ edition: { ...EDITION, sections: [] } }, fresh), null);
  assert.equal(weekShown(null, fresh), null);
});

// ── the words ───────────────────────────────────────────────

test('every word the vault shows here passes the plain-words rule', () => {
  const shown = [
    ...Object.values(LAST_MOMENTS_VAULT_WORDS).map((v) => (typeof v === 'function' ? (v as (a: string, b: string, c: string) => string)('Priya', 'in Slack', 'Thursday.') : v)),
    LAST_MOMENTS_VAULT_WORDS.messageTo(null),
    LAST_MOMENTS_VAULT_WORDS.goesTo(null, 'on GitHub'),
    LAST_MOMENTS_VAULT_WORDS.told(null, null, 'Soon.'),
    ...Object.values(LAST_MOMENTS_WORDS.fullDay),
    ...Object.values(LAST_MOMENTS_WORDS.addIt),
    LAST_MOMENTS_WORDS.repeated,
    LAST_MOMENTS_WORDS.mayAsk,
    LAST_MOMENTS_WORDS.week.yourSide,
    LAST_MOMENTS_WORDS.week.goals,
    dayLabel('2026-11-16'),
  ];
  for (const w of shown) {
    assert.doesNotMatch(w, /\b(ledger|entry|entries|kind|in_your_name|border|verdict|batch|noticed|pattern|threshold|skip|gap|lacking|missing|health)\b/i, w);
    assert.doesNotMatch(w, /\b(row|line|prep|agenda|push|room|url|thread|payload|draft|choice_id|free_days)\b/i, w);
    assert.doesNotMatch(w, /[{}_]/, w);
  }
  assert.equal(LAST_MOMENTS_VAULT_WORDS.anotherDay, 'Another day');
  assert.equal(LAST_MOMENTS_VAULT_WORDS.messageTo('Priya'), "Myu's message to Priya:");
  assert.equal(LAST_MOMENTS_VAULT_WORDS.goesTo('prd-review', 'in Slack'), 'To prd-review in Slack');
});

// ── a promise someone else's decision affects (check_promise) ───────────

const CHECK_TEXT = [
  'Jonah decided, today: “We drop the CSV export from the Q1 release.”',
  'That affects something you promised:',
  ' • You promised Priya, Monday: “The CSV export ships Friday.”',
].join('\n');
const checkPromise = (over: Partial<MyuLineLite> = {}): MyuLineLite => ({
  line_id: 'CP1',
  kind: 'check_promise',
  ask_kind: 'choice',
  subjects: [{ type: 'person', id: 'rel-priya', label: 'Priya Raman' }],
  text: CHECK_TEXT,
  choices: [{ id: 'tell', label: 'Tell Priya' }, { id: 'let_go', label: 'Let it go' }, { id: 'keep', label: 'Keep it' }],
  state: 'released',
  ...over,
});
const TOLD = {
  success: true,
  readback: { text: '' },
  effects: [
    {
      type: 'check_promise_draft',
      readback: 'Here it is, to send.',
      draft: { to: [{ name: 'Priya Raman', address: 'priya@corvid.test' }], in: 'mail', thread_ref: 'msg-41', text: 'About “The CSV export ships Friday.”: Jonah has decided “We drop the CSV export from the Q1 release.”, so this has changed.' },
    },
  ],
};

test('a promise someone else’s decision affects: Tell <name> · Let it go · Keep it, the server’s own or shared’s, each {choice_id}; nothing else', () => {
  assert.deepEqual(ids(checkPromise()), ['tell', 'let_go(quiet)', 'keep(quiet)']);
  assert.deepEqual(lineButtons(checkPromise()).map((b) => [b.label, b.answer]), [['Tell Priya', { choice_id: 'tell' }], ['Let it go', { choice_id: 'let_go' }], ['Keep it', { choice_id: 'keep' }]]);
  assert.deepEqual(lineButtons(checkPromise({ choices: [] })).map((b) => b.label), ['Tell them', 'Let it go', 'Keep it']);
  assert.deepEqual(ids(checkPromise({ ask_kind: 'tell' })), [], 'a tell of the kind has nothing to press');
  assert.equal(tapAnswers(checkPromise()), true);
});

test('Tell: its effect’s readback is said, then where it goes and the message; Let it go and Keep it read back as any answer', async () => {
  const api = new MockApi();
  const l = checkPromise();
  api.dayLines = [l];
  api.dayAnswers.CP1 = () => TOLD;
  const out = await pressLineButton({ answer: (id, a) => api.answerMyuLine(id, a), apiBase: API }, l, lineButtons(l)[0]);
  assert.deepEqual(api.dayAnswered, [{ line_id: 'CP1', answer: { choice_id: 'tell' } }]);
  assert.equal(out.settled, true);
  assert.equal(out.ui.said, 'Here it is, to send.');
  assert.equal(out.ui.draft?.lead, 'To Priya by mail');
  assert.equal(out.ui.draft?.text, 'About “The CSV export ships Friday.”: Jonah has decided “We drop the CSV export from the Q1 release.”, so this has changed.');
  assert.equal(out.ui.draft?.to_name, 'Priya');
  // The effect read on its own, wherever the answer comes from; in Slack, to a channel.
  const slack = answerDraftOf({ effects: [{ type: 'check_promise_draft', readback: 'Here it is, to send.', draft: { to: ['#platform'], in: 'slack', text: 'x' } }] });
  assert.deepEqual(slack, { text: 'x', lead: 'In #platform on Slack', toName: null, said: 'Here it is, to send.' });

  for (const [id, words] of [['let_go', 'Let go. Nothing was said to anyone.'], ['keep', 'It stays as it is.']] as const) {
    const a = new MockApi();
    const line = checkPromise({ line_id: `CP-${id}` });
    a.dayLines = [line];
    a.dayAnswers[`CP-${id}`] = () => ({ success: true, readback: { text: words }, effects: id === 'let_go' ? [{ type: 'row_updated', entity_type: 'commitment', entity_id: 'c1' }] : [] });
    const res = await pressLineButton({ answer: (x, b) => a.answerMyuLine(x, b), apiBase: API }, line, lineButtons(line).find((b) => b.id === id)!);
    assert.deepEqual(a.dayAnswered, [{ line_id: `CP-${id}`, answer: { choice_id: id } }]);
    assert.equal(res.ui.said, words);
    assert.equal(res.ui.draft, undefined);
  }
});

test('the check-promise words the vault may show pass the plain-words rule', async () => {
  const { CHECK_PROMISE_CHOICES } = await import('../src/checkPromise');
  for (const w of [...CHECK_PROMISE_CHOICES.map((c) => c.label), LAST_MOMENTS_VAULT_WORDS.goesTo('Priya', 'by mail')]) {
    assert.doesNotMatch(w, /\b(ledger|entry|kind|in_your_name|border|verdict|batch|noticed|pattern|threshold|skip|gap|lacking|missing|health|promise_id|check_promise)\b/i, w);
    assert.doesNotMatch(w, /[{}_]/, w);
  }
});
