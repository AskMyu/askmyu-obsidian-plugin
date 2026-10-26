/**
 * Myu's questions outside a space, drawn with their buttons (2026-09-25), on the functional UI fake:
 * what a person sees on a Today row or under a chat's opening question, and that pressing a button
 * sends the answer, shows what Myu said back, and leaves the links an answer gives.
 */

import { strict as assert } from 'node:assert';
import test from 'node:test';

import { FakeEl } from './ui-stub';
import { MockApi } from '../src/transport/mock';
import type { MyuLineLite } from '../src/transport/api';
import { pressLineButton, type LineButton, type LineUi } from '../src/lineAnswers';
import { renderLineAsk } from '../src/views/lineAsk';

const API = 'https://myu.askmyu.com/api';
const line = (over: Partial<MyuLineLite>): MyuLineLite => ({
  line_id: 'L1',
  subjects: [{ type: 'person', id: 'p1', label: 'Dana Okafor' }],
  text: 'Dana is waiting on the pricing sheet you said you would send.',
  needs_you: true,
  ask_kind: 'choice',
  choices: [{ id: 'hold', label: 'Hold 30 minutes Thursday' }, { id: 'done', label: 'I sent it' }],
  est: 'One tap to answer.',
  state: 'released',
  ...over,
});

/** A row as a pane keeps it: the line's state between answers, redrawn after each press. */
function mount(api: MockApi, l: MyuLineLite, opts: { showText?: boolean } = {}) {
  let ui: LineUi = {};
  let host = new FakeEl('div');
  const opened: string[] = [];
  const paint = () => {
    host = new FakeEl('div');
    renderLineAsk(host as unknown as HTMLElement, l, ui, { press: (b) => void press(b) }, opts);
  };
  const press = async (b: LineButton) => {
    ui = { busy: true };
    paint();
    const out = await pressLineButton({ answer: (id, a) => api.answerMyuLine(id, a), apiBase: API }, l, b);
    opened.push(...out.open);
    ui = out.ui;
    paint();
  };
  paint();
  return { host: () => host, opened, ui: () => ui };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

test('a choice: its words with the est, its buttons, and "Not now" as quiet text', () => {
  const m = mount(new MockApi(), line({}));
  const texts = m.host().visibleTexts();
  assert.ok(texts.includes('Dana is waiting on the pricing sheet you said you would send.'));
  assert.ok(texts.includes('One tap to answer.'));
  const buttons = m.host().querySelectorAll('.myu-line-choices').flatMap((row) => row.children.filter((c) => c.tag === 'button'));
  assert.deepEqual(buttons.map((b) => b.text), ['Hold 30 minutes Thursday', 'I sent it', 'Not now', "Don't ask again"]);
  assert.ok(buttons[2].classes.has('myu-line-quiet') && buttons[3].classes.has('myu-line-quiet'), '"Not now" and "Don\'t ask again" are the quiet ways out');
  assert.ok(!buttons[0].classes.has('myu-line-quiet'));
});

test('yes/no shows Yes, No and the two quiet ways out; a tell and a wait show only their words, with no est', () => {
  const yn = mount(new MockApi(), line({ ask_kind: 'yes_no', choices: [] }));
  assert.deepEqual(yn.host().querySelectorAll('.myu-line-choices').flatMap((r) => r.children.map((c) => c.text)), ['Yes', 'No', 'Not now', "Don't ask again"]);
  const tell = mount(new MockApi(), line({ ask_kind: 'tell', choices: [], est: 'One tap to answer.' }));
  assert.equal(tell.host().querySelectorAll('.myu-line-choices').length, 0);
  assert.ok(!tell.host().visibleTexts().includes('One tap to answer.'));
  const noChoices = mount(new MockApi(), line({ choices: [] }));
  assert.ok(!noChoices.host().visibleTexts().includes('One tap to answer.'), 'no est when no tap answers it');
});

test('pressing a button sends that answer and the line is replaced by what Myu said back', async () => {
  const api = new MockApi();
  const l = line({});
  api.dayLines = [l];
  api.dayAnswers.L1 = () => ({ success: true, readback: { text: "Held. I'll put it on Thursday at 2pm." } });
  const m = mount(api, l);
  assert.ok(await m.host().click('Hold 30 minutes Thursday'));
  await settle();
  assert.deepEqual(api.dayAnswered, [{ line_id: 'L1', answer: { choice_id: 'hold' } }]);
  const texts = m.host().visibleTexts();
  assert.ok(texts.includes("Held. I'll put it on Thursday at 2pm."));
  assert.ok(!texts.includes('Hold 30 minutes Thursday'), 'the buttons are gone once it is answered');
  assert.equal(m.host().querySelectorAll('.myu-line-said')[0]?.classes.has('myu-done'), true);
});

test('the invite: the compose opens, and the file is offered as a link under what Myu said', async () => {
  const api = new MockApi();
  const l = line({});
  api.dayLines = [l];
  api.dayAnswers.L1 = () => ({
    success: true,
    readback: { text: "The invite is ready in your calendar; send it and I'll mark the commitment." },
    effects: [{ type: 'invite_ready', handoff_url: 'https://calendar.google.com/x', ics_url: '/myu/holds/h1/invite.ics' }],
  });
  const m = mount(api, l);
  await m.host().click('Hold 30 minutes Thursday');
  await settle();
  assert.deepEqual(m.opened, ['https://calendar.google.com/x']);
  const link = m.host().querySelectorAll('.myu-line-link')[0];
  assert.equal(link?.tag, 'a');
  assert.equal(link?.text, 'Download the invite file');
  assert.equal(link?.attrs.href ?? (link as unknown as { href?: string }).href, `${API}/myu/holds/h1/invite.ics`);
});

test('a line that stays up keeps its buttons and says why; the chat draws only the buttons (its turn has the words)', async () => {
  const api = new MockApi();
  const l = line({});
  api.dayLines = [l];
  api.dayAnswers.L1 = () => ({ success: true, line_open: true, readback: { text: 'Myu needs to see your calendar first.' } });
  const m = mount(api, l, { showText: false });
  assert.ok(!m.host().visibleTexts().includes('Dana is waiting on the pricing sheet you said you would send.'));
  await m.host().click('Hold 30 minutes Thursday');
  await settle();
  const texts = m.host().visibleTexts();
  assert.ok(texts.includes('Myu needs to see your calendar first.'));
  assert.ok(texts.includes('Hold 30 minutes Thursday'), 'the buttons stay');
});

test('R19: "Write a message to Sam" on a Today row: the readback, then the message in a box, Copy and the link', async () => {
  const api = new MockApi();
  const text = 'Hi Sam, could you review my pull request "Queue worker"? It went to you by a rule, so I wanted to ask you myself. https://github.com/o/r/pull/7';
  const l = line({
    line_id: 'R1',
    subjects: [{ type: 'person', id: 'rel-sam', label: 'Sam Lee' }],
    text: 'Your queue-worker pull request went to Sam Lee by a rule; nobody has asked them.',
    needs_you: false,
    est: undefined,
    choices: [{ id: 'write', label: 'Write a message to Sam' }, { id: 'leave', label: 'Leave it' }],
  });
  api.dayLines = [l];
  api.dayAnswers.R1 = () => ({
    success: true,
    readback: { text: 'Here is a message for Sam. I have not sent it; copy it and send it where you usually would.' },
    effects: [{ type: 'draft_ready', text, to_name: 'Sam Lee', url: 'https://github.com/o/r/pull/7', url_label: 'Open the pull request' }],
  });
  const m = mount(api, l);
  await m.host().click('Write a message to Sam');
  await settle();
  assert.deepEqual(api.dayAnswered, [{ line_id: 'R1', answer: { choice_id: 'write' } }]);
  assert.deepEqual(m.opened, [], 'nothing opens and nothing is sent');
  const texts = m.host().visibleTexts();
  assert.ok(texts.includes('Here is a message for Sam. I have not sent it; copy it and send it where you usually would.'));
  const box = m.host().querySelectorAll('.myu-line-draft-box')[0];
  assert.equal(box?.tag, 'textarea');
  assert.equal(box?.value, text);
  assert.equal(box?.attrs['aria-label'], 'Your message to Sam Lee');
  const copy = m.host().querySelectorAll('.myu-line-draft-acts')[0]?.children.find((c) => c.tag === 'button');
  assert.equal(copy?.text, 'Copy');
  const link = m.host().querySelectorAll('.myu-line-draft-acts')[0]?.children.find((c) => c.tag === 'a');
  assert.equal(link?.text, 'Open the pull request');
  assert.equal(link?.attrs.href, 'https://github.com/o/r/pull/7');
  // No clipboard here (the test's node): the message is selected and the pane says to copy it by hand.
  await copy!.onclick!();
  assert.ok(m.host().visibleTexts().includes('It did not copy. Select the message and copy it yourself.'));
});

// ── "seen", and a drafted interview debrief's line (2026-10-06) ───────────────

const marked = (host: FakeEl) => [...host.walk()].filter((e) => e.attrs['data-line-id']);

test('the line\'s words carry its id, so the pane can say when they were seen; the chat\'s buttons alone carry none', () => {
  const m = mount(new MockApi(), line({}));
  assert.deepEqual(marked(m.host()).map((e) => [e.attrs['data-line-id'], e.text]), [['L1', 'Dana is waiting on the pricing sheet you said you would send.']]);
  const chat = mount(new MockApi(), line({}), { showText: false });
  assert.equal(marked(chat.host()).length, 0, 'the chat marks the turn that holds the words');
});

const DRAFT_ASK = "An interview for Backend engineer is on your calendar: Sam Okafor, Thu 9 Oct at 2pm. I've drafted Sam's interview debrief, with Jo and Ana on the panel. Send the invites?";
const draftLine = (first: { id: string; label: string } = { id: 'send', label: 'Send invites' }) =>
  line({
    line_id: 'D1',
    // As the server sends it: about nothing with a name.
    subjects: [],
    text: DRAFT_ASK,
    est: undefined,
    choices: [first, { id: 'not_interview', label: 'Not an interview' }, { id: 'not_this', label: 'Not this one' }],
  });
const choiceButtons = (host: FakeEl) => host.querySelectorAll('.myu-line-choices').flatMap((row) => row.children.filter((c) => c.tag === 'button'));

test('a drafted interview debrief: the line with the server\'s three choices; a press answers with the choice\'s id and shows what Myu said back', async () => {
  const api = new MockApi();
  const l = draftLine();
  api.dayLines = [l];
  api.dayAnswers.D1 = () => ({ success: true, readback: { text: "Got it. I won't take Sam's meetings for an interview for Backend engineer again." } });
  const m = mount(api, l);
  assert.ok(m.host().visibleTexts().includes(DRAFT_ASK));
  const buttons = choiceButtons(m.host());
  assert.deepEqual(buttons.map((b) => b.text), ['Send invites', 'Not an interview', 'Not this one', 'Not now', "Don't ask again"]);
  assert.deepEqual(buttons.map((b) => b.classes.has('myu-line-quiet')), [false, false, false, true, true], 'its three choices are buttons; the two ways out are quiet, as on any choice');
  assert.equal(marked(m.host())[0]?.attrs['data-line-id'], 'D1');

  assert.ok(await m.host().click('Not an interview'));
  await settle();
  assert.deepEqual(api.dayAnswered, [{ line_id: 'D1', answer: { choice_id: 'not_interview' } }]);
  const texts = m.host().visibleTexts();
  assert.ok(texts.includes("Got it. I won't take Sam's meetings for an interview for Backend engineer again."));
  assert.equal(choiceButtons(m.host()).length, 0, 'answered: the buttons are gone');
  assert.equal(marked(m.host()).length, 0, 'what Myu said back is not the line');
});

test('a drafted interview debrief: the first choice reads as the server says ("Send now", "Open it", "Open now") and answers with its id', async () => {
  for (const first of [{ id: 'send_now', label: 'Send now' }, { id: 'send', label: 'Open it' }, { id: 'send_now', label: 'Open now' }]) {
    const api = new MockApi();
    const l = draftLine(first);
    api.dayLines = [l];
    // Sending says nothing back on the line (the debrief's own line follows): the line goes.
    api.dayAnswers.D1 = () => ({ success: true, readback: { text: '' } });
    const m = mount(api, l);
    assert.equal(choiceButtons(m.host())[0].text, first.label);
    assert.ok(await m.host().click(first.label));
    await settle();
    assert.deepEqual(api.dayAnswered, [{ line_id: 'D1', answer: { choice_id: first.id } }]);
    assert.ok(!m.host().visibleTexts().includes(DRAFT_ASK));
  }
});
