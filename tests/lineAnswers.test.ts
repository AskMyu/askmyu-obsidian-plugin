/**
 * Myu's questions outside a space, answered with a tap (2026-09-25): which buttons each kind of
 * ask gets, what each answers, what a reply shows, and the pages and links an answer's effects
 * give. Runs in the unit-test entry, where `obsidian` THROWS: nothing here touches the host.
 */

import { strict as assert } from 'node:assert';
import test from 'node:test';

import { MockApi } from '../src/transport/mock';
import type { MyuLineLite } from '../src/transport/api';
import { LINE_ANSWER_WORDS, lineButtons, lineEffectActions, pressLineButton, showEstimate, tapAnswers } from '../src/lineAnswers';

const line = (over: Partial<MyuLineLite>): MyuLineLite => ({
  line_id: 'L1',
  subjects: [{ type: 'person', id: 'p1', label: 'Dana Okafor' }],
  text: 'Dana is waiting on the pricing sheet you said you would send.',
  needs_you: true,
  ask_kind: 'choice',
  choices: [{ id: 'hold', label: 'Hold 30 minutes Thursday' }, { id: 'done', label: 'I sent it' }],
  est: 'One tap to answer.',
  state: 'released',
  conversation: { subject_type: 'person', subject_id: 'p1' },
  ...over,
});
const API = 'https://myu.askmyu.com/api';
const ids = (l: MyuLineLite) => lineButtons(l).map((b) => `${b.id}${b.quiet ? '(quiet)' : ''}`);

test('buttons, kind by kind, as the web draws them', () => {
  assert.deepEqual(ids(line({ ask_kind: 'tell', choices: [] })), []);
  assert.deepEqual(ids(line({ ask_kind: 'wait', choices: [] })), []);
  assert.deepEqual(ids(line({ ask_kind: 'assume', choices: [], assumed: { claim: 'x', changeable: true } })), ['change']);
  assert.deepEqual(ids(line({ ask_kind: 'assume', choices: [], assumed: { claim: 'x', changeable: false } })), []);
  assert.deepEqual(ids(line({ ask_kind: 'yes_no', choices: [] })), ['yes', 'no', 'later(quiet)', 'dismiss(quiet)']);
  assert.deepEqual(ids(line({ ask_kind: 'yes_no', choices: [{ id: 'yes', label: 'Yes, keep it' }, { id: 'later', label: 'Ask me later' }] })), ['yes', 'later'], 'its own "later" is its way out');
  assert.deepEqual(ids(line({})), ['hold', 'done', 'later(quiet)', 'dismiss(quiet)']);
  // Four choices with "Leave it": it is the quiet one, and the line's own way out, so no "Not now" is added (2026-09-25).
  assert.deepEqual(
    ids(line({ choices: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }, { id: 'leave', label: 'Leave it' }] })),
    ['a', 'b', 'c', 'leave(quiet)'],
  );
  // R21: a task offer is "take" and "not me" again, with the two quiet ways out after them.
  assert.deepEqual(
    ids(line({ choices: [{ id: 'take', label: "Yes, I'll do it" }, { id: 'not_me', label: 'Not me' }] })),
    ['take', 'not_me', 'later(quiet)', 'dismiss(quiet)'],
  );
  // A choice line with nothing to choose is answered by writing: no buttons at all.
  assert.deepEqual(ids(line({ choices: [] })), []);
  assert.deepEqual(ids(line({ choices: [{ label: 'no id' }] })), []);
});

test('what each button answers (the body of POST /myu/lines/answer)', () => {
  const yn = lineButtons(line({ ask_kind: 'yes_no', choices: [] }));
  assert.deepEqual(yn.map((b) => b.answer), [{ yes: true }, { yes: false }, { later: true }, { dismiss: true }]);
  assert.deepEqual(yn.map((b) => b.label), ['Yes', 'No', 'Not now', "Don't ask again"]);
  const ch = lineButtons(line({}));
  assert.deepEqual(ch.map((b) => b.answer), [{ choice_id: 'hold' }, { choice_id: 'done' }, { later: true }, { dismiss: true }]);
  assert.deepEqual(ch.map((b) => b.label), ['Hold 30 minutes Thursday', 'I sent it', 'Not now', "Don't ask again"]);
  assert.deepEqual(lineButtons(line({ ask_kind: 'assume', assumed: { changeable: true } }))[0].answer, { change: true });
  assert.equal(lineButtons(line({ ask_kind: 'assume', assumed: { changeable: true } }))[0].label, 'Change');
});

test('"One tap to answer." only where a tap answers it', () => {
  assert.equal(tapAnswers(line({})), true);
  assert.equal(tapAnswers(line({ ask_kind: 'yes_no', choices: [] })), true);
  assert.equal(tapAnswers(line({ choices: [] })), false);
  assert.equal(tapAnswers(line({ ask_kind: 'tell' })), false);
  assert.equal(tapAnswers(line({ ask_kind: 'assume', assumed: { changeable: false } })), false);
  // The estimate: a tap promise only with a button to tap; an estimate that promises no tap stays.
  assert.equal(showEstimate(line({})), true);
  assert.equal(showEstimate(line({ choices: [] })), false, '"One tap to answer." with nothing to tap is hidden');
  assert.equal(showEstimate(line({ choices: [], est: 'About two minutes.' })), true);
  assert.equal(showEstimate(line({ ask_kind: 'tell', est: 'About two minutes.' })), false);
  assert.equal(showEstimate(line({ est: '' })), false);
});

test('effects: a calendar consent opens its page; the invite opens its compose and offers the file; a sent invite links the event', () => {
  const consent = lineEffectActions([{ type: 'consent_needed', provider: 'google', scope_set: 'calendar', init_path: '/oauth/google/init', return_to: 'dashboard' }], `${API}/`);
  assert.deepEqual(consent, [
    { kind: 'open', url: `${API}/oauth/google/init?scope_set=calendar&return_to=dashboard` },
    { kind: 'note', text: 'Allow calendar access once, then choose Hold again.' },
  ]);
  // A locked space's consent is not this pane's.
  assert.deepEqual(lineEffectActions([{ type: 'consent_needed', provider: 'space', reason: 'locked' }], API), []);
  assert.deepEqual(lineEffectActions([{ type: 'consent_needed', provider: 'google', init_path: 'https://evil.example' }], API), []);
  const ready = lineEffectActions([{ type: 'invite_ready', handoff_url: 'https://calendar.google.com/calendar/render?action=TEMPLATE', ics_url: '/myu/holds/h1/invite.ics' }], API);
  assert.deepEqual(ready, [
    { kind: 'open', url: 'https://calendar.google.com/calendar/render?action=TEMPLATE' },
    { kind: 'link', link: { text: 'The calendar invite is ready. Using Apple Calendar or another app?', label: 'Download the invite file', url: `${API}/myu/holds/h1/invite.ics` } },
  ]);
  assert.deepEqual(lineEffectActions([{ type: 'invite_ready', handoff_url: 'https://outlook.office.com/x' }], API), [
    { kind: 'open', url: 'https://outlook.office.com/x' },
    { kind: 'note', text: LINE_ANSWER_WORDS.inviteReadyNoFile },
  ]);
  assert.deepEqual(lineEffectActions([{ type: 'invite_sent', event_link: 'https://calendar.google.com/event?eid=abc' }], API), [
    { kind: 'link', link: { label: 'Open it in your calendar', url: 'https://calendar.google.com/event?eid=abc' } },
  ]);
  assert.deepEqual(lineEffectActions([{ type: 'invite_sent', event_link: 'javascript:alert(1)' }], API), []);
  assert.deepEqual(lineEffectActions([{ type: 'row_updated' }, { type: 'badge', open_needs_you: 2 }], API), []);
});

test('answering: a settled answer is replaced by its readback; "Not now" and "Don\'t ask again" read quiet', async () => {
  const api = new MockApi();
  api.dayLines = [line({})];
  api.dayAnswers.L1 = () => ({ success: true, readback: { text: "Held. I'll put it on Thursday at 2pm." } });
  const out = await pressLineButton({ answer: (id, a) => api.answerMyuLine(id, a), apiBase: API }, api.dayLines[0], lineButtons(api.dayLines[0])[0]);
  assert.deepEqual(api.dayAnswered, [{ line_id: 'L1', answer: { choice_id: 'hold' } }]);
  assert.equal(out.settled, true);
  assert.equal(out.ui.said, "Held. I'll put it on Thursday at 2pm.");
  assert.equal(out.ui.good, true);
  assert.equal(api.dayLines[0].state, 'answered');

  const api2 = new MockApi();
  api2.dayLines = [line({ line_id: 'L2', ask_kind: 'yes_no', choices: [] })];
  const later = await pressLineButton({ answer: (id, a) => api2.answerMyuLine(id, a), apiBase: API }, api2.dayLines[0], lineButtons(api2.dayLines[0])[2]);
  assert.deepEqual(api2.dayAnswered[0].answer, { later: true }, '"Not now" rests until tomorrow');
  assert.equal(later.settled, true);
  assert.equal(later.ui.good, false);
  const api3 = new MockApi();
  api3.dayLines = [line({ line_id: 'L3', ask_kind: 'yes_no', choices: [] })];
  const never = await pressLineButton({ answer: (id, a) => api3.answerMyuLine(id, a), apiBase: API }, api3.dayLines[0], lineButtons(api3.dayLines[0])[3]);
  assert.deepEqual(api3.dayAnswered[0].answer, { dismiss: true }, '"Don\'t ask again" closes it');
  assert.equal(never.ui.good, false);
});

test('answering: a line that stays up keeps its buttons and says why under it; a consent opens its page', async () => {
  const api = new MockApi();
  api.dayLines = [line({})];
  api.dayAnswers.L1 = () => ({
    success: true,
    line_open: true,
    readback: { text: 'Myu needs to see your calendar first.' },
    effects: [{ type: 'consent_needed', provider: 'google', scope_set: 'calendar', init_path: '/oauth/google/init', return_to: 'dashboard' }],
  });
  const out = await pressLineButton({ answer: (id, a) => api.answerMyuLine(id, a), apiBase: API }, api.dayLines[0], lineButtons(api.dayLines[0])[0]);
  assert.equal(out.settled, false);
  assert.equal(out.ui.note, 'Myu needs to see your calendar first.');
  assert.equal(out.ui.said, undefined);
  assert.deepEqual(out.open, [`${API}/oauth/google/init?scope_set=calendar&return_to=dashboard`]);
  assert.deepEqual(out.ui.notes, ['Allow calendar access once, then choose Hold again.']);
  assert.equal(api.dayLines[0].state, 'released', 'the line stays up');
});

test('answering: the invite effects give the pages and links; a failed send says so and keeps the buttons', async () => {
  const api = new MockApi();
  api.dayLines = [line({})];
  api.dayAnswers.L1 = () => ({
    success: true,
    readback: { text: "The invite is ready in your calendar; send it and I'll mark the commitment." },
    effects: [{ type: 'invite_ready', handoff_url: 'https://calendar.google.com/x', ics_url: '/myu/holds/h1/invite.ics' }],
  });
  const out = await pressLineButton({ answer: (id, a) => api.answerMyuLine(id, a), apiBase: API }, api.dayLines[0], lineButtons(api.dayLines[0])[0]);
  assert.deepEqual(out.open, ['https://calendar.google.com/x']);
  assert.equal(out.ui.links?.[0]?.url, `${API}/myu/holds/h1/invite.ics`);
  assert.equal(out.ui.said, "The invite is ready in your calendar; send it and I'll mark the commitment.");

  const sent = new MockApi();
  sent.dayLines = [line({})];
  sent.dayAnswers.L1 = () => ({ success: true, readback: { text: 'Sent. It is on your calendar.' }, effects: [{ type: 'invite_sent', event_link: 'https://calendar.google.com/event?eid=e1' }] });
  const outSent = await pressLineButton({ answer: (id, a) => sent.answerMyuLine(id, a), apiBase: API }, sent.dayLines[0], lineButtons(sent.dayLines[0])[0]);
  assert.deepEqual(outSent.ui.links, [{ label: 'Open it in your calendar', url: 'https://calendar.google.com/event?eid=e1' }]);

  const offline = new MockApi();
  offline.dayLines = [line({})];
  offline.state.offline = true;
  const failed = await pressLineButton({ answer: (id, a) => offline.answerMyuLine(id, a), apiBase: API }, offline.dayLines[0], lineButtons(offline.dayLines[0])[0]);
  assert.equal(failed.settled, false);
  assert.equal(failed.ui.note, "You're offline. Try again when you're back online.");
});

test('the words the vault owns here pass the plain-words rule', () => {
  for (const w of Object.values(LINE_ANSWER_WORDS)) {
    assert.doesNotMatch(w, /\b(row|line|prep|agenda|push|room|ics|url|oauth|consent|handoff|effect)\b/i, w);
    assert.doesNotMatch(w, /[{}]/, w);
  }
});

// ── R19: a message asking a reviewer who got it only by a rule ──────────────────────────────────
const ruleOnly = (over: Partial<MyuLineLite> = {}): MyuLineLite =>
  line({
    line_id: 'R1',
    subjects: [{ type: 'person', id: 'rel-sam', label: 'Sam Lee' }],
    text: 'Your queue-worker pull request went to Sam Lee by a rule; nobody has asked them.',
    needs_you: false,
    est: undefined,
    choices: [{ id: 'write', label: 'Write a message to Sam' }, { id: 'leave', label: 'Leave it' }],
    ...over,
  });
const DRAFT_TEXT = 'Hi Sam, could you review my pull request "Queue worker"? It went to you by a rule, so I wanted to ask you myself. https://github.com/o/r/pull/7';

test('the rule-only note: "Write a message to …" and "Leave it" are its buttons, and no "Not now" beside its own "Leave it"', () => {
  const b = lineButtons(ruleOnly());
  assert.deepEqual(b.map((x) => [x.label, x.quiet]), [['Write a message to Sam', false], ['Leave it', false]]);
  assert.deepEqual(b[0].answer, { choice_id: 'write' });
});

test('draft_ready: the message, its link and label; nothing opens', () => {
  const acts = lineEffectActions(
    [{ type: 'draft_ready', text: DRAFT_TEXT, to_relationship_id: 'rel-sam', to_name: 'Sam Lee', url: 'https://github.com/o/r/pull/7', url_label: 'Open the pull request' }],
    API,
  );
  assert.deepEqual(acts, [{ kind: 'draft', draft: { text: DRAFT_TEXT, url: 'https://github.com/o/r/pull/7', label: 'Open the pull request', to_name: 'Sam Lee' } }]);
  // No label: a plain one. A link that is not a web address is left off. An empty message is nothing.
  assert.equal((lineEffectActions([{ type: 'draft_ready', text: 'Hi', url: 'https://x.y/1' }], API)[0] as { draft: { label: string } }).draft.label, 'Open the link');
  assert.equal((lineEffectActions([{ type: 'draft_ready', text: 'Hi', url: 'javascript:alert(1)' }], API)[0] as { draft: { url?: string } }).draft.url, undefined);
  assert.deepEqual(lineEffectActions([{ type: 'draft_ready', text: ' ' }], API), []);
});

test('pressing "Write a message to …": the readback, then the message to copy', async () => {
  const api = new MockApi();
  const l = ruleOnly();
  api.dayLines = [l];
  api.dayAnswers.R1 = () => ({
    success: true,
    readback: { text: 'Here is a message for Sam. I have not sent it; copy it and send it where you usually would.' },
    effects: [{ type: 'draft_ready', text: DRAFT_TEXT, to_name: 'Sam Lee', url: 'https://github.com/o/r/pull/7', url_label: 'Open the pull request' }],
  });
  const out = await pressLineButton({ answer: (id, a) => api.answerMyuLine(id, a), apiBase: API }, l, lineButtons(l)[0]);
  assert.equal(out.settled, true);
  assert.deepEqual(out.open, []);
  assert.equal(out.ui.said, 'Here is a message for Sam. I have not sent it; copy it and send it where you usually would.');
  assert.equal(out.ui.draft?.text, DRAFT_TEXT);
  assert.equal(out.ui.draft?.label, 'Open the pull request');
});

test('the message words', () => {
  assert.equal(LINE_ANSWER_WORDS.copy, 'Copy');
  assert.equal(LINE_ANSWER_WORDS.copied, 'Copied');
  assert.equal(LINE_ANSWER_WORDS.copyFailed, 'It did not copy. Select the message and copy it yourself.');
  assert.equal(LINE_ANSWER_WORDS.draftLink, 'Open the link');
});

test('a press on a line that closed under it (409 line_closed): nothing is said, and the pane reads again', async () => {
  const api = new MockApi();
  const l = line({});
  api.dayLines = [l];
  const b = lineButtons(l)[0];
  const deps = { answer: (id: string, a: Parameters<MockApi['answerMyuLine']>[1]) => api.answerMyuLine(id, a), apiBase: API };
  const once = await pressLineButton(deps, l, b);
  assert.equal(once.settled, true);
  // Pressed again (a second pane, a stale row): the server has it closed.
  const again = await pressLineButton(deps, l, b);
  assert.equal(again.closed, true);
  assert.equal(again.settled, false);
  assert.deepEqual(again.ui, {}, 'no note, no readback');
  assert.deepEqual(again.open, []);
});
