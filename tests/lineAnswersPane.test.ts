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
import { renderLineAsk, renderLineDraft } from '../src/views/lineAsk';

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
  assert.equal(copy?.text, 'Copy it');
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
  assert.deepEqual(buttons.map((b) => b.text), ['Send invites', 'Not an interview', 'Not this one', 'Not now']);
  assert.deepEqual(buttons.map((b) => b.classes.has('myu-line-quiet')), [false, false, false, true], 'its three choices are buttons; its one way out ("Not now") is quiet');
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

// ── the pages a line is about (2026-10-28) ───────────────────────────────────

const links = (host: FakeEl) => [...host.walk()].filter((e) => e.tag === 'a' && e.classes.has('myu-line-link'));

test('a LinkedIn match question: "See the profile on LinkedIn" under its words, before Yes and No, opening in the browser', () => {
  const m = mount(new MockApi(), line({
    text: "There's one LinkedIn profile that looks like David Chang. Is that right?",
    ask_kind: 'yes_no',
    needs_you: false,
    est: undefined,
    choices: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }],
    links: [{ url: 'https://linkedin.com/in/david-chang-1a2b3c' }],
  }));
  const a = links(m.host());
  assert.equal(a.length, 1);
  assert.equal(a[0].text, 'See the profile on LinkedIn ↗');
  assert.equal(a[0].attrs.href, 'https://linkedin.com/in/david-chang-1a2b3c');
  assert.equal(a[0].attrs.target, '_blank');
  const order = [...m.host().walk()].filter((e) => e === a[0] || e.classes.has('myu-line-choices'));
  assert.equal(order[0], a[0], 'the link comes before the buttons');
});

test('several profiles: each choice\'s link under the buttons, with the choice\'s words; a bad address is never drawn', () => {
  const m = mount(new MockApi(), line({
    text: 'Two LinkedIn profiles could be David Chang. Which one is it?',
    choices: [{ id: 'c1', label: 'David Chang — Chef' }, { id: 'c2', label: 'David Chang — Engineer' }, { id: 'none', label: 'None of these' }],
    links: [{ url: 'https://linkedin.com/in/dc-eng', choice_id: 'c2' }, { url: 'https://linkedin.com/in/dc-chef', choice_id: 'c1' }, { url: 'javascript:alert(1)' }],
  }));
  assert.deepEqual(links(m.host()).map((e) => [e.text, e.attrs.href]), [
    ['David Chang — Chef ↗', 'https://linkedin.com/in/dc-chef'],
    ['David Chang — Engineer ↗', 'https://linkedin.com/in/dc-eng'],
  ]);
  assert.ok(m.host().visibleTexts().some((t) => t.startsWith('See each profile on LinkedIn:')));
});

test('a send line\'s own "Copy it" (2026-11-19): the draft is marked to copy as it opens; another answer\'s draft is not', async () => {
  const send = { line_id: 'SL1', kind: 'send', ask_kind: 'choice', text: "I can't send mail for you yet.", choices: [{ id: 'copy', label: 'Copy it' }, { id: 'drop', label: 'Drop it' }] } as unknown as MyuLineLite;
  const deps = { apiBase: 'http://x', answer: async () => ({ ok: true, data: { success: true, readback: { text: 'Here it is, to copy.' }, draft: { text: 'Hi Dana.' } } }) as never };
  const pressed = await pressLineButton(deps, send, { id: 'copy', label: 'Copy it', answer: { choice_id: 'copy' }, quiet: false } as LineButton);
  assert.equal(pressed.ui.draft?.copyAtOpen, true);
  const other = await pressLineButton(deps, { ...send, kind: 'check_promise' } as MyuLineLite, { id: 'tell', label: 'Tell Dana', answer: { choice_id: 'tell' }, quiet: false } as LineButton);
  assert.ok(!other.ui.draft?.copyAtOpen);
});

test('the draft box (2026-11-19): must_see under the words; copied as it opens it reads "Copied"; refused it stays "Copy it"', async () => {
  const draw = (copyAtOpen: boolean) => {
    const host = new FakeEl('div');
    renderLineDraft(host as unknown as HTMLElement, { text: 'Hi Carla.', label: 'Open', must_see: ["I can't send mail for you yet.", 'To Carla Diaz at carla@example.test.'], copyAtOpen });
    return host;
  };
  const nav = globalThis.navigator as unknown as Record<string, unknown>;
  const had = Object.getOwnPropertyDescriptor(nav, 'clipboard');
  const written: string[] = [];
  Object.defineProperty(nav, 'clipboard', { value: { writeText: async (t: string) => void written.push(t) }, configurable: true });
  try {
    const host = draw(true);
    await new Promise((r) => setTimeout(r, 10));
    const texts = [...host.walk()].map((e) => e.text).filter(Boolean);
    assert.ok(texts.includes("I can't send mail for you yet.") && texts.includes('To Carla Diaz at carla@example.test.'), texts.join(' | '));
    assert.deepEqual(written, ['Hi Carla.']);
    assert.ok(texts.includes('Copied'), texts.join(' | '));
    Object.defineProperty(nav, 'clipboard', { value: { writeText: async () => { throw new Error('not allowed'); } }, configurable: true });
    const refused = draw(true);
    await new Promise((r) => setTimeout(r, 10));
    assert.ok([...refused.walk()].some((e) => e.text === 'Copy it'));
    // Not a send line's own: nothing written.
    written.length = 0;
    Object.defineProperty(nav, 'clipboard', { value: { writeText: async (t: string) => void written.push(t) }, configurable: true });
    draw(false);
    await new Promise((r) => setTimeout(r, 10));
    assert.deepEqual(written, []);
  } finally {
    if (had) Object.defineProperty(nav, 'clipboard', had);
    else delete nav.clipboard;
  }
});

test('"Tell" with 18b\'s answer (2026-11-19): the readback says it cannot send; that sentence is not drawn again; "To …" is', async () => {
  const promise = { line_id: 'CP9', kind: 'check_promise', ask_kind: 'choice', text: 'Jonah decided.', choices: [{ id: 'tell', label: 'Tell Tomás' }] } as unknown as MyuLineLite;
  const READ = "I can't send mail for you yet. Here is what I would say to Tomás: copy it.";
  const deps = {
    apiBase: 'http://x',
    answer: async () =>
      ({ ok: true, data: { success: true, readback: { text: READ }, draft: { connected: false, in: 'mail', to: [{ name: 'Tomás Rivera', id: 't@x.example' }], text: 'Tomás, it changed.', must_see: ["I can't send mail for you yet.", 'To Tomás Rivera at t@x.example.'] } } }) as never,
  };
  const r = await pressLineButton(deps, promise, { id: 'tell', label: 'Tell Tomás', answer: { choice_id: 'tell' }, quiet: false } as LineButton);
  assert.equal(r.ui.said, READ);
  assert.deepEqual(r.ui.draft?.must_see, ['To Tomás Rivera at t@x.example.']);
  assert.ok(!r.ui.draft?.lead, 'must_see names it: no line over it');
});

// ── 19c: route_seen, and the refusals that keep the line ─────────────────────
const SEND19C = line({ line_id: 'S19', kind: 'send', ask_kind: 'yes_no', text: 'Send this to Sofia Lindquist by mail, as you?', choices: [{ id: 'yes', label: 'Send it' }, { id: 'no', label: "Don't send" }], route_seen: 'via_myu' } as Partial<MyuLineLite>);
const replying = (status: number, data: Record<string, unknown>, got: unknown[] = []) => ({
  apiBase: 'http://x',
  answer: async (_id: string, a: unknown) => {
    got.push(a);
    return { status, ok: status >= 200 && status < 300, data, error: typeof data.error === 'string' ? data.error : null } as never;
  },
});

test('19c: a send line\'s yes, and its "Don\'t send", echo its route_seen exactly; a line with none sends none', async () => {
  const { lineButtons } = await import('../src/lineAnswers');
  for (const route of ['via_myu', 'via_myu,via_myu']) {
    for (const label of ['Send it', "Don't send"]) {
      const got: unknown[] = [];
      const l = { ...SEND19C, route_seen: route };
      const b = lineButtons(l).find((x) => x.label === label)!;
      await pressLineButton(replying(200, { success: true, readback: { text: 'Sent.' }, line_open: false }, got), l, b);
      assert.equal((got[0] as { route_seen?: string }).route_seen, route, label);
    }
  }
  const got: unknown[] = [];
  const bare = { ...SEND19C, route_seen: undefined };
  await pressLineButton(replying(200, { success: true, readback: { text: 'Sent.' } }, got), bare, lineButtons(bare)[0]);
  assert.equal('route_seen' in (got[0] as object), false);
});

test('19c: 409 route_seen_required and 409 route_changed: the server\'s sentence under the line, nothing settled, read again; line_closed and a missing key keep their own ways', async () => {
  const { lineButtons } = await import('../src/lineAnswers');
  const b = lineButtons(SEND19C)[0];
  for (const [code, words] of [['route_seen_required', 'To send this, update Myu, or open it on the web: this version can\'t show how it goes.'], ['route_changed', 'The way this goes changed since you opened it. Here it is now.']]) {
    const out = await pressLineButton(replying(409, { success: false, error: code, message: words, readback: { text: words }, effects: [], line: SEND19C, line_open: true }), SEND19C, b);
    assert.equal(out.ui.note, words, code);
    assert.equal(out.settled, false, code);
    assert.equal(out.readAgain, true, code);
    assert.equal(out.closed === true, false, code);
  }
  const closed = await pressLineButton(replying(409, { success: false, error: 'line_closed' }), SEND19C, b);
  assert.equal(closed.closed, true);
  const key = await pressLineButton(replying(409, { success: false, error: 'key_needed', readback: { text: 'Open your key first.' }, line_open: true }), SEND19C, b);
  assert.equal(key.readAgain === true, false);
  const bare = await pressLineButton(replying(409, { success: false, error: 'route_changed' }), SEND19C, b);
  assert.equal(bare.readAgain === true, false, 'a bare refusal with no sentence stays the failure it was');
});

test('19c: an answer that says line_open false is drawn exactly as one that leaves it out', async () => {
  const { lineButtons } = await import('../src/lineAnswers');
  const l = line({ line_id: 'K1', ask_kind: 'choice', text: 'Did the deck go to Priya?', choices: [{ id: 'kept', label: 'It’s done' }, { id: 'drop', label: 'Drop it' }] });
  const b = lineButtons(l)[0];
  const a = await pressLineButton(replying(200, { success: true, readback: { text: 'Good, marked done.' }, effects: [] }), l, b);
  const c = await pressLineButton(replying(200, { success: true, readback: { text: 'Good, marked done.' }, effects: [], line_open: false }), l, b);
  assert.equal(JSON.stringify(a), JSON.stringify(c));
});

test('19c2: a press while the send is going: the sentence under the line, nothing settled, read again once after a moment; a kept-open answer on any other line is not read again', async () => {
  const { lineButtons, SEND_SETTLE_MS } = await import('../src/lineAnswers');
  const GOING = 'This is being sent. Give it a moment.';
  const out = await pressLineButton(replying(200, { success: true, status: 'in_flight', readback: { text: GOING }, line_open: true }), SEND19C, lineButtons(SEND19C)[0]);
  assert.equal(out.ui.note, GOING);
  assert.equal(out.settled, false);
  assert.equal(out.readAgainAfterMs, SEND_SETTLE_MS);
  assert.equal(out.readAgain === true, false);
  const plain = line({ line_id: 'K2', ask_kind: 'choice', text: 'Keep the review on Thursday?', choices: [{ id: 'keep', label: 'Keep it' }] });
  const kept = await pressLineButton(replying(200, { success: true, readback: { text: 'Okay.' }, line_open: true }), plain, lineButtons(plain)[0]);
  assert.equal(kept.readAgainAfterMs, undefined);
});

test('an answer carrying both its own message and a draft_ready effect: one draft, from its own message, with its must_see', async () => {
  const { lineButtons } = await import('../src/lineAnswers');
  const words = 'Dan, I am running late on the deck.';
  const l = line({ line_id: 'T1', ask_kind: 'choice', text: 'The deck is late.', choices: [{ id: 'tell', label: 'Tell Dan' }] });
  const out = await pressLineButton(
    replying(200, { success: true, readback: { text: 'Here it is, to send to Dan.' }, draft: { text: words, to: [{ name: 'Dan', id: 'dan@example.test' }], in: 'mail', must_see: ['To Dan at dan@example.test.'] }, effects: [{ type: 'draft_ready', text: words, to_name: 'Dan' }] }),
    l,
    lineButtons(l)[0],
  );
  assert.equal(out.ui.draft?.text, words);
  assert.deepEqual(out.ui.draft?.must_see, ['To Dan at dan@example.test.']);
});
