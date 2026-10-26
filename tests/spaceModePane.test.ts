/**
 * Space mode (R14) — the pane's WIRING, on the functional UI fake: what a person sees, in
 * what order, and that the buttons do what they say.
 */

import { strict as assert } from 'node:assert';
import test from 'node:test';

import { FakeEl, WorkspaceLeaf } from './ui-stub';
import { MockApi } from '../src/transport/mock';
import { SpaceConversation } from '../src/spaceConversation';
import { renderSpaceConversation, renderSpaceStatus } from '../src/views/spaceConversationPane';
import { ChatView } from '../src/views/ChatView';

function mount(tune?: (api: MockApi) => void) {
  const api = new MockApi();
  tune?.(api);
  const space = new SpaceConversation('s1', 'Door team', { backend: api, unlock: async () => { api.spaceMode.locked = false; return true; }, openJournal: () => {}, onChange: () => {} });
  let thread = new FakeEl('div');
  let composer = new FakeEl('div');
  const paint = () => {
    thread = new FakeEl('div');
    composer = new FakeEl('div');
    renderSpaceConversation(thread as unknown as HTMLElement, composer as unknown as HTMLElement, space.screen(), {
      send: (text) => void space.send(text),
      choose: (id) => void space.choose(id),
      earlier: () => void space.loadEarlier(),
      unlock: () => void space.unlockSpace(),
      draft: (text) => { space.draft = text; },
    });
  };
  return { api, space, paint, thread: () => thread, composer: () => composer };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

test('the pane: the box is always there; hints under it are text, not buttons', async () => {
  const m = mount();
  await m.space.open();
  m.paint();
  const box = m.composer().querySelector('textarea');
  assert.ok(box, 'a text box');
  assert.equal(box.attrs.placeholder, 'What do you want to bring up?');
  const texts = m.composer().visibleTexts();
  assert.ok(texts.includes('If it helps:'));
  assert.ok(texts.includes('What is going well?'));
  const hintEls = m.composer().querySelectorAll('.myu-space-hint');
  assert.equal(hintEls.length, 3);
  assert.ok(hintEls.every((h) => !h.onclick && h.tag !== 'button'), 'hints are not pressable');
  // Exactly one text box on the whole pane: no second box behind a button.
  assert.equal(m.thread().querySelectorAll('textarea').length + m.composer().querySelectorAll('textarea').length, 1);
});

test('the pane: one ask with its buttons; no "k of N" anywhere', async () => {
  const m = mount();
  await m.space.open();
  m.paint();
  assert.equal(m.thread().querySelectorAll('.myu-space-ask').length, 1);
  const all = [...m.thread().visibleTexts(), ...m.composer().visibleTexts()].join('\n');
  assert.doesNotMatch(all, /\b\d+ of \d+\b/);
  assert.ok(all.includes('Nothing this time'));
});

test('the pane: pressing a button answers the ask, and the next ask takes its place', async () => {
  const m = mount();
  await m.space.open();
  await m.space.send('The release date slipped twice.');
  m.paint();
  assert.ok(await m.thread().click('With my name'));
  await settle();
  await settle();
  m.paint();
  const texts = m.thread().visibleTexts();
  assert.ok(texts.some((t) => t.startsWith('Okay. The team will see:')));
  assert.ok(texts.includes("Anything else? Type it, or say you're done."));
  assert.equal(m.thread().querySelectorAll('.myu-space-ask').length, 1);
});

test('the pane: the readback draws bullets as a list and the warning in the quiet style', async () => {
  const m = mount();
  await m.space.open();
  await m.space.send('The release date slipped twice.');
  await m.space.choose('named');
  await m.space.choose('done');
  m.paint();
  const bullets = m.thread().querySelectorAll('li');
  assert.deepEqual(bullets.map((b) => b.text), ['"The release date slipped twice." with your name']);
  const warning = m.thread().querySelector('.myu-space-warning');
  assert.equal(warning?.text, "Once the questions are up, a no-name question can't be taken back.");
  assert.ok(warning?.classes.has('myu-quiet'));
});

test('the pane: the talk\'s version has three buttons and a quiet "Leave it"', async () => {
  const m = mount();
  await m.space.open();
  await m.space.send('Jim sets dates nobody believes.');
  await m.space.choose('private');
  await m.space.choose('talk');
  m.paint();
  const acts = m.thread().querySelector('.myu-space-choices');
  assert.ok(acts);
  assert.equal(acts.querySelectorAll('.myu-aff').length, 3);
  const quiet = acts.querySelector('.myu-space-quiet');
  assert.equal(quiet?.text, 'Leave it');
});

test('the pane: "Myu is reading…" while a typed message is out, with the words shown at once', async () => {
  const m = mount();
  await m.space.open();
  const sent = m.space.send('Reviews sat for days.');
  m.paint();
  const texts = m.thread().visibleTexts();
  assert.ok(texts.includes('Myu is reading…'));
  assert.ok(texts.includes('Reviews sat for days.'));
  assert.ok(!texts.some((t) => /writing|thinking/i.test(t)));
  await sent;
});

test('the pane: a locked space shows the unlock here, and pressing it unlocks', async () => {
  const m = mount((api) => { api.spaceMode.locked = true; });
  await m.space.open();
  await m.space.send('what did we decide last time');
  m.paint();
  assert.ok(m.thread().visibleTexts().includes('Unlock this space'));
  assert.ok(await m.thread().click('Unlock this space'));
  await settle();
  await settle();
  m.paint();
  assert.ok(!m.thread().visibleTexts().includes('Unlock this space'));
});

test('the pane: "Earlier ▸" sits above the history and becomes "Nothing earlier."', async () => {
  const m = mount();
  await m.space.open();
  m.paint();
  assert.equal(m.thread().children[0]?.text, 'Earlier ▸');
  assert.ok(await m.thread().click('Earlier ▸'));
  await settle();
  await settle();
  m.paint();
  assert.ok(m.thread().visibleTexts().includes('Nothing earlier.'));
});

test('the pane: where things stand is a strip outside the thread, with no "myu" on it; none when there is nothing to say', async () => {
  const m = mount();
  await m.space.open();
  await m.space.send('Reviews sat for days.');
  m.paint();
  const status = m.space.screen().status;
  assert.ok(status, 'a status once the opening ask no longer says the same sentence');
  const strip = new FakeEl('div');
  renderSpaceStatus(strip as unknown as HTMLElement, status);
  assert.deepEqual(strip.visibleTexts(), [status]);
  assert.equal(strip.querySelectorAll('.myu-space-status').length, 1);
  assert.equal(strip.querySelectorAll('.myu-whisper').length, 0, 'it is not a turn');
  // The thread itself never carries it.
  assert.ok(!m.thread().visibleTexts().includes(status));
  assert.equal(m.thread().querySelectorAll('.myu-space-first').length, 0);
  const none = new FakeEl('div');
  renderSpaceStatus(none as unknown as HTMLElement, null);
  assert.deepEqual(none.visibleTexts(), []);
});

// ── a space's pane has two tabs: the conversation, and the team's retro as a page ──

import { SpaceRetroPanel, SPACE_RETRO_WORDS } from '../src/spaceRetro';
import { renderSpaceRetro, renderSpaceTabs } from '../src/views/spaceConversationPane';

function mountRetro(tune?: (api: MockApi) => void, seen = true) {
  const api = new MockApi();
  tune?.(api);
  let howSeen = seen;
  const panel = new SpaceRetroPanel('s1', { backend: api, onChange: () => {}, howSeen: { seen: () => howSeen, markSeen: () => { howSeen = true; } } });
  let unlocks = 0;
  let tabs = new FakeEl('div');
  let host = new FakeEl('div');
  const paint = () => {
    tabs = new FakeEl('div');
    host = new FakeEl('div');
    renderSpaceTabs(tabs as unknown as HTMLElement, panel.screen().open, { conversation: () => panel.hide(), retro: () => void panel.show() });
    if (panel.screen().open) renderSpaceRetro(host as unknown as HTMLElement, panel.screen(), { conversation: () => panel.hide(), unlock: () => { unlocks++; }, how: () => panel.toggleHow() });
  };
  return { api, panel, paint, tabs: () => tabs, host: () => host, unlocks: () => unlocks };
}
const press = (el: FakeEl | undefined | null) => el?.onclick?.(new Event('click') as unknown as MouseEvent);

test('the tabs: two of them, the conversation first and selected; pressing the other shows the retro page', async () => {
  const m = mountRetro();
  m.paint();
  const tabs = m.tabs().querySelectorAll('.myu-space-tab');
  assert.deepEqual(tabs.map((t) => t.text), [SPACE_RETRO_WORDS.tabConversation, SPACE_RETRO_WORDS.tabRetro]);
  assert.ok(tabs.every((t) => t.tag === 'button' && t.attrs.role === 'tab'), 'real buttons: the keyboard can reach them');
  assert.deepEqual(tabs.map((t) => t.attrs['aria-selected']), ['true', 'false']);
  assert.deepEqual(m.host().visibleTexts(), [], 'the retro is not drawn, or read, until its tab is chosen');
  press(tabs[1]);
  await settle();
  m.paint();
  assert.deepEqual(m.tabs().querySelectorAll('.myu-space-tab').map((t) => t.attrs['aria-selected']), ['false', 'true']);
  assert.ok(m.host().visibleTexts().includes('Question 1'));
  press(m.tabs().querySelectorAll('.myu-space-tab')[0]);
  m.paint();
  assert.equal(m.panel.screen().open, false);
});

test('the retro page: plain headings, who wrote what under its own label, the chosen summary, the tasks, and the way back', async () => {
  const m = mountRetro();
  await m.panel.show();
  m.paint();
  const texts = m.host().visibleTexts();
  assert.equal(texts[0], 'Retro 1 · handing out tasks', 'where it stands comes first, in one line');
  assert.equal(texts[1], `${SPACE_RETRO_WORDS.howThisWorks} ▸`, 'then the fold, closed once it has been seen');
  const order = ['Question 1', SPACE_RETRO_WORDS.replies, 'Dana Okafor', SPACE_RETRO_WORDS.summary, 'Review capacity, not engineering capacity, is what slips the release.', SPACE_RETRO_WORDS.tasks, 'not handed out yet', SPACE_RETRO_WORDS.howToAct];
  const at = order.map((t) => texts.indexOf(t));
  assert.ok(at.every((i) => i >= 0), `every part is on the page: ${JSON.stringify(at)}`);
  assert.deepEqual([...at].sort((a, b) => a - b), at, 'in reading order');
  assert.ok(texts.includes('from Myu, for the team'));
  assert.ok(texts.includes('taken by Dana · Myu checks on Wednesday'));
  // For reading: no text box, and the one button leads back to the conversation.
  assert.equal(m.host().querySelectorAll('textarea').length, 0);
  const buttons = m.host().querySelectorAll('button');
  assert.deepEqual(buttons.map((b) => b.text), [`${SPACE_RETRO_WORDS.howThisWorks} ▸`, SPACE_RETRO_WORDS.goToConversation]);
  press(buttons[1]);
  assert.equal(m.panel.screen().open, false, 'back on the conversation');
});

test('the retro page: "How this works" is open the first time, holds the backend\'s words as sent, and folds (R20)', async () => {
  const m = mountRetro(undefined, false);
  await m.panel.show();
  m.paint();
  const how = m.api.retroRead.how_it_works!;
  let texts = m.host().visibleTexts();
  assert.equal(texts[0], 'Retro 1 · handing out tasks');
  assert.equal(texts[1], `${SPACE_RETRO_WORDS.howThisWorks} ▾`);
  assert.equal(texts[2], how, 'the words as sent, under the fold');
  assert.ok(!texts.some((t) => /answers Myu privately before the retro|Everyone here shared something|started this retro/.test(t)), 'no rules paragraph, no shared-count sentence, no who-started line');
  press(m.host().querySelectorAll('button').find((b) => b.text.startsWith(SPACE_RETRO_WORDS.howThisWorks)));
  m.paint();
  texts = m.host().visibleTexts();
  assert.equal(texts[1], `${SPACE_RETRO_WORDS.howThisWorks} ▸`);
  assert.ok(!texts.includes(how), 'folded');
  // Before the first question: the words on the page are few.
  const before = mountRetro((api) => { api.retroRead = { retro: { number: 1, state: 'preparing', reflects: { pushed: 1, members: 4 }, agenda_when: 'on Thursday at 2pm' }, how_it_works: how, threads: [] }; });
  await before.panel.show();
  before.paint();
  const words = before.host().visibleTexts().join(' ').split(/\s+/).filter(Boolean).length;
  assert.ok(words < 70, `the page before the first question has ${words} words`);
});

test('the retro page: a question nobody has written under says so', async () => {
  const m = mountRetro((api) => { api.retroRead = { retro: { number: 2, state: 'discussing' }, threads: [{ thread_id: 't1', position: 1, author: { name: 'Dana Okafor' }, author_kind: 'person', text: 'Can we stop the Friday deploys?', replies: [] }] }; });
  await m.panel.show();
  m.paint();
  const texts = m.host().visibleTexts();
  assert.ok(texts.includes('from Dana Okafor'));
  assert.ok(texts.includes(SPACE_RETRO_WORDS.noReplies));
  assert.ok(!texts.includes(SPACE_RETRO_WORDS.summary), 'no summary heading before there is a summary');
  assert.ok(!texts.includes(SPACE_RETRO_WORDS.tasks), 'no tasks heading before there are tasks');
});

test('the retro page: nothing running says so in one sentence', async () => {
  const m = mountRetro((api) => { api.retroRead = { success: true, pinned: {}, threads: [] }; });
  await m.panel.show();
  m.paint();
  assert.deepEqual(m.host().visibleTexts(), [SPACE_RETRO_WORDS.none]);
  // With the backend's how_it_works, the fold stands under that sentence.
  const f = mountRetro((api) => { api.retroRead = { success: true, how_it_works: 'The retro is every other week, on Friday at 2pm.', threads: [] }; });
  await f.panel.show();
  f.paint();
  assert.deepEqual(f.host().visibleTexts(), [SPACE_RETRO_WORDS.none, `${SPACE_RETRO_WORDS.howThisWorks} ▸`]);
});

test('the retro page: a locked space offers the unlock in place, and no locked words are drawn', async () => {
  const LOCKED = '[Encrypted content - unlock required]';
  const m = mountRetro((api) => { api.retroRead = { retro: { number: 1, state: 'discussing' }, threads: [{ thread_id: 't1', position: 1, author_kind: 'team_myu', text: LOCKED, replies: [] }] }; });
  await m.panel.show();
  m.paint();
  const texts = m.host().visibleTexts();
  assert.ok(texts.includes(SPACE_RETRO_WORDS.locked));
  assert.ok(!texts.some((t) => t.includes('Encrypted content')));
  assert.ok(!texts.includes(SPACE_RETRO_WORDS.replies), 'a question whose words are locked shows no empty "what people wrote"');
  press(m.host().querySelectorAll('button').find((b) => b.text === 'Unlock this space'));
  assert.equal(m.unlocks(), 1);
});

// ── the menu's marks (2026-10-06): which place the chat pane shows, and each move inside it ──────────────

/** The whole chat pane on the fake, with a plugin that writes down each place the pane says it moved to. */
async function mountChatPane() {
  // The pane scrolls its thread on a timer and opens links in a window: enough of one for node.
  (globalThis as { window?: unknown }).window ??= { setTimeout, clearTimeout, open: () => null };
  const api = new MockApi();
  const told: string[] = [];
  /** "Seen" (2026-10-06): what the pane handed to the watcher, and took back. */
  const watched: unknown[] = [];
  const unwatched: unknown[] = [];
  const plugin = {
    linesSeen: { watch: (el: unknown) => void watched.push(el), unwatch: (el: unknown) => void unwatched.push(el) },
    backend: api,
    settings: { account_id: 'acct-test-1', base_url: 'https://api.example.test/api', auto_keep_canvas: false, retro_how_seen: {} },
    keys: { get: () => null },
    openCanvasId: () => null,
    canvasView: () => null,
    helpQueue: [] as unknown[],
    loadHelpQueue: async () => undefined,
    linkedinAskResolved: new Set<string>(),
    offerAnsweredJournals: new Set<string>(),
    welcomeOfferAnswered: false,
    keepCanvasIfAlwaysOn: async () => undefined,
    chatContextForFile: async () => undefined,
    unlock: { onEncryptionBlocked: async () => true },
    saveSettings: async () => undefined,
    requestTodayRefresh: () => undefined,
    openConversationRef: async () => undefined,
    openCanvas: async () => undefined,
    chatPaneMoved: (view: ChatView) => told.push(view.menuItem()),
  };
  const view = new ChatView(new WorkspaceLeaf() as never, plugin as never);
  Object.assign(view, { app: { workspace: { getActiveFile: () => null } } });
  await view.onOpen();
  const root = () => (view as unknown as { contentEl: FakeEl }).contentEl;
  return { api, view, told, root, watched, unwatched };
}

test('the chat pane says which place it shows: a space’s conversation is Spaces, the past conversations Conversations', async () => {
  const m = await mountChatPane();
  assert.equal(m.view.menuItem(), 'conversations', 'a fresh pane is a conversation');
  assert.ok(await m.view.openSpace('s1', 'Door team'));
  assert.equal(m.view.menuItem(), 'spaces');
  assert.deepEqual(m.told, [], 'opening a space is the plugin’s own door, which tells it there');

  // Past conversations, reached from inside the space: the list is Conversations, and the move is told.
  assert.ok(await m.root().click('Past conversations'));
  assert.equal(m.view.menuItem(), 'conversations');
  assert.deepEqual(m.told, ['conversations']);

  // Back: the space again, told.
  await settle();
  assert.ok(await m.root().click('\u2190 Back to the conversation'));
  assert.equal(m.view.menuItem(), 'spaces');
  assert.deepEqual(m.told, ['conversations', 'spaces']);

  // A new conversation from inside the space: Conversations, told.
  assert.ok(await m.root().click('New conversation'));
  assert.equal(m.view.menuItem(), 'conversations');
  assert.deepEqual(m.told, ['conversations', 'spaces', 'conversations']);

  // The list and back from a plain conversation: both moves told, both Conversations.
  assert.ok(await m.root().click('Past conversations'));
  await settle();
  assert.ok(await m.root().click('\u2190 Back to the conversation'));
  assert.deepEqual(m.told, ['conversations', 'spaces', 'conversations', 'conversations', 'conversations']);

  // A past conversation picked: told.
  await m.view.openPastConversation('j-1');
  assert.deepEqual(m.told.slice(5), ['conversations']);
  assert.equal(m.told.length, 6);
});

test('the chat pane: something said in the pane is not a move (only what it shows changing is)', async () => {
  const m = await mountChatPane();
  await m.view.openSpace('s1', 'Door team');
  await settle();
  m.view.refreshSpace('s1');
  await settle();
  assert.deepEqual(m.told, []);
});

// ── "seen" (2026-10-06): the chat pane's lines carry their ids ────────────────────────────────────

test('"seen": the one ask of a conversation carries its line\'s id', async () => {
  const m = mount();
  await m.space.open();
  m.paint();
  const ask = m.thread().querySelector('.myu-space-ask');
  assert.ok(m.space.screen().ask?.line_id);
  assert.equal(ask?.attrs['data-line-id'], m.space.screen().ask?.line_id);
});

test('"seen": the chat pane hands its content to the watcher while it is open; the line a chat opened on carries its id', async () => {
  const m = await mountChatPane();
  assert.deepEqual(m.watched, [m.root()]);
  const opening = { line_id: 'L7', subjects: [{ type: 'person', id: 'p1', label: 'Dana Okafor' }], text: 'Is Dana still on the pricing work?', ask_kind: 'yes_no', needs_you: true, state: 'released' };
  m.view.seed({ text: '', send: false, opening: opening.text, openingLine: opening });
  const voice = m.root().querySelector('.myu-voice');
  assert.equal(voice?.text, 'Is Dana still on the pricing work?');
  assert.equal(voice?.attrs['data-line-id'], 'L7');

  // Opened with words alone (no line behind them): nothing to report.
  m.view.seed({ text: '', send: false, opening: 'Dana replied this morning.' });
  assert.equal(m.root().querySelector('.myu-voice')?.attrs['data-line-id'], undefined);

  // A space's conversation in the same pane: its ask.
  assert.ok(await m.view.openSpace('s1', 'Door team'));
  assert.ok(m.root().querySelector('.myu-space-ask')?.attrs['data-line-id']);

  assert.deepEqual(m.unwatched, []);
  await m.view.onClose();
  assert.deepEqual(m.unwatched, [m.root()]);
});
