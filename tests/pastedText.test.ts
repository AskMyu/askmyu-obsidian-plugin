/**
 * Pasted text (2026-10-06), on the functional UI fake: one long paste or drop becomes a chip on the four composers
 * (the chat, a subject's conversation, the meeting's question, the onboarding moment) without the box being drawn
 * again; what a send carries, and what a refused or a lost one gives back; the vault's note and selection; capture
 * (Myu's own notes are not sent back, Web Clipper notes are marked); and what goes back into the vault and into a
 * feedback report. Every text here is invented; ZQX-PASTE-7 marks pasted text.
 */

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { FakeEl, WorkspaceLeaf, openedModals } from './ui-stub';
import { MockApi } from '../src/transport/mock';
import { Api, type ChatTurnResult } from '../src/transport/api';
import type { ApiResponse } from '../src/transport/index';
import type { PastedBlockWire } from '../src/wire';
import { ChatView, type ChatTurn } from '../src/views/ChatView';
import { PrepView } from '../src/views/PrepView';
import { OnboardingModal } from '../src/views/OnboardingModal';
import { PASTE_WORDS, canPutBack, countLines, noteBlock, pastedPreview, selectionBlock } from '../src/pastedText';
import { renderConversation } from '../src/vault/ConversationWriter';
import { buildJournalDayMarkdown } from '../src/vault/myuFiles';
import { MaterializationService } from '../src/vault/MaterializationService';
import { listConversations, loadConversation } from '../src/conversations';
import { formatConversationAttachment } from '../src/views/feedbackAttachment';
import { CaptureService } from '../src/capture/CaptureService';
import { MeetingCapture } from '../src/capture/MeetingCapture';
import { hashContent } from '../src/capture/noteMeta';
import { DEFAULT_SETTINGS, type AskMyuSettings } from '../src/settings';

(globalThis as unknown as { window: unknown }).window = { setTimeout, clearTimeout, open: () => null };

// ── helpers ───────────────────────────────────────────────────────────────────

/** Invented text of exactly `chars` characters on one line. */
function oneLine(chars: number): string {
  return 'ZQX-PASTE-7 a sentence nobody wrote. '.repeat(Math.ceil(chars / 37) + 1).slice(0, chars).replace(/\s$/, 'x');
}

/** Invented pasted text of exactly `chars` characters, in short lines. */
function invented(chars: number, what = 'depot review'): string {
  const lines: string[] = [];
  let length = -1;
  for (let i = 1; length < chars; i++) {
    const line = `Item ${i}: the ${what} notes, ZQX-PASTE-7.`;
    lines.push(line);
    length += line.length + 1;
  }
  return lines.join('\n').slice(0, chars).replace(/\s$/, 'x');
}

type Ev = { prevented: boolean; preventDefault(): void };
function ev<T extends object>(fields: T): T & Ev {
  return Object.assign(
    {
      prevented: false,
      preventDefault(this: Ev) {
        this.prevented = true;
      },
    },
    fields,
  );
}
const getData = (text: string) => (type: string) => (type === 'text/plain' ? text : '');
function paste(box: FakeEl, text: string): Ev {
  const e = ev({ clipboardData: { getData: getData(text) } });
  box.dispatch('paste', e);
  return e;
}
function drop(box: FakeEl, text: string, files: unknown[] = []): Ev {
  const e = ev({ dataTransfer: { files, getData: getData(text) } });
  box.dispatch('drop', e);
  return e;
}
function insert(box: FakeEl, text: string): Ev {
  const e = ev({ inputType: 'insertText', data: text, dataTransfer: null });
  box.dispatch('beforeinput', e);
  return e;
}
/** Type into a box the way a person does: the value, then its input event. */
function type(box: FakeEl, value: string): void {
  box.value = value;
  (box as unknown as { oninput: () => void }).oninput();
}
function key(box: FakeEl, k: string, mods: { ctrlKey?: boolean; shiftKey?: boolean } = {}): Ev {
  const e = ev({ key: k, code: k === 'z' ? 'KeyZ' : k, ctrlKey: !!mods.ctrlKey, metaKey: false, shiftKey: !!mods.shiftKey, altKey: false });
  (box as unknown as { onkeydown: (e: unknown) => void }).onkeydown(e);
  return e;
}
const settle = async (n = 6) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
};
const chipLabels = (el: FakeEl) => el.querySelectorAll('.myu-pasted-open').map((b) => b.text);
const texts = (el: FakeEl) => el.visibleTexts().join('\n');

async function mountChat(tune?: (api: MockApi) => void) {
  const api = new MockApi();
  tune?.(api);
  const plugin = {
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
  };
  const view = new ChatView(new WorkspaceLeaf() as never, plugin as never);
  Object.assign(view, { app: { workspace: { getActiveFile: () => null } } });
  await view.onOpen();
  const fake = view as unknown as { contentEl: FakeEl; containerEl: FakeEl; draft: string; pasted: PastedBlockWire[]; turns: ChatTurn[]; render(): void };
  return {
    api,
    view,
    fake,
    root: () => fake.contentEl,
    box: () => fake.contentEl.querySelector('.myu-chat-input')!,
    row: () => fake.contentEl.querySelector('.myu-pasted-row')!,
    send: () => fake.contentEl.querySelectorAll('button').find((b) => b.text === 'Send')!,
    live: () => fake.containerEl.querySelector('.myu-sr-only')!,
  };
}

// ── the chat ──────────────────────────────────────────────────────────────────

test('the chat: a paste of 1,200 characters becomes a chip; the box keeps its words, its caret, and is the same box', async () => {
  const m = await mountChat();
  const box = m.box();
  type(box, 'Before ');
  box.setSelectionRange(7, 7);
  const text = invented(1200);
  const e = paste(box, text);
  assert.equal(e.prevented, true, 'the browser never inserts it');
  assert.equal(m.box(), box, 'the box is not drawn again (caret, focus and IME stay)');
  assert.equal(box.value, 'Before ');
  assert.equal(m.fake.draft, 'Before ');
  assert.deepEqual(chipLabels(m.root()), [`Pasted text · 1,200 chars · ${countLines(text)} lines`]);
  assert.equal(m.row().querySelector('.myu-pasted-preview')?.text, pastedPreview(text), 'the preview is its first line');
  assert.equal(pastedPreview(text), 'Item 1: the depot review notes, ZQX-PAST\u2026');
  assert.equal(m.row().querySelectorAll('.myu-pasted-remove')[0]?.attrs['aria-label'], 'Remove pasted text');
  assert.ok(texts(m.row()).includes(`${PASTE_WORDS.hint} · `));
  assert.ok(m.row().querySelectorAll('button').some((b) => b.text === 'Undo'));
  assert.equal(m.live().text, 'Pasted text added as an attachment, 1,200 characters. Undo available.');
  assert.equal(m.live().attrs.role, 'status');
  assert.equal(m.live().attrs['aria-live'], 'polite');
  assert.equal(box.selectionStart, 7, 'the caret stays where the paste was');
  // The hint goes at the next edit.
  type(box, 'Before it');
  assert.ok(!texts(m.row()).includes(PASTE_WORDS.hint));
  assert.equal(chipLabels(m.root()).length, 1, 'the chip stays');
});

test('below the chip size a paste goes inline; an image clipboard does nothing; beforeinput at the size makes a chip; a drop is a drop', async () => {
  const m = await mountChat();
  assert.equal(paste(m.box(), invented(300)).prevented, false, '300 characters go inline');
  assert.equal(paste(m.box(), '').prevented, false, 'an image clipboard has no text/plain');
  assert.equal(chipLabels(m.root()).length, 0);
  assert.equal(paste(m.box(), oneLine(999)).prevented, false, '999 characters on one line stay inline');
  assert.equal(paste(m.box(), Array.from({ length: 14 }, (_, i) => `row ${i}`).join('\n')).prevented, false, '14 short lines stay inline');
  assert.equal(paste(m.box(), `${oneLine(999)}\r\n\r\n\u0007`).prevented, false, 'line endings and control characters do not count');
  assert.equal(paste(m.box(), oneLine(1000)).prevented, true, '1,000 characters on one line are a chip');
  m.fake.pasted = [];
  assert.equal(insert(m.box(), invented(1000)).prevented, true, 'a keyboard clipboard insert at the size is a chip');
  assert.equal(m.fake.pasted[0]?.source, 'paste');
  assert.equal(paste(m.box(), Array.from({ length: 15 }, (_, i) => `row ${i}`).join('\n')).prevented, true, '15 short lines are a chip');
  assert.equal(drop(m.box(), invented(1000), [{ name: 'a.png' }]).prevented, false, 'a dropped file is not text');
  assert.equal(drop(m.box(), invented(1000)).prevented, true);
  assert.deepEqual(m.fake.pasted.map((c) => [c.id, c.source]), [['p1', 'paste'], ['p2', 'paste'], ['p3', 'drop']]);
  assert.deepEqual(chipLabels(m.root()).map((l) => l.split(' · ')[0]), ['Pasted text 1', 'Pasted text 2', 'Pasted text 3'], 'numbered when there are several');
});

test('a paste over a selection replaces it; Mod+Z puts the text back inline at the offset, the caret after it; so does Undo', async () => {
  const m = await mountChat();
  const box = m.box();
  type(box, 'Keep REPLACED end');
  box.setSelectionRange(5, 13);
  const text = invented(1100);
  paste(box, text);
  assert.equal(box.value, 'Keep  end', 'the selection went, as a paste would take it');
  assert.equal(m.fake.draft, 'Keep  end');
  const z = key(box, 'z', { ctrlKey: true });
  assert.equal(z.prevented, true);
  assert.equal(box.value, `Keep ${text} end`);
  assert.equal(box.selectionStart, 5 + text.length);
  assert.equal(box.focused, true);
  assert.equal(m.fake.pasted.length, 0);
  assert.equal(key(box, 'z', { ctrlKey: true }).prevented, false, 'with nothing to undo, the box keeps its own undo');

  type(box, '');
  paste(box, text);
  assert.ok(await m.row().click('Undo'));
  assert.equal(box.value, text);
  assert.equal(chipLabels(m.root()).length, 0);
});

test('a drop leaves the box’s words and its selection alone; Undo puts the dropped text in without taking any', async () => {
  const m = await mountChat();
  const box = m.box();
  type(box, 'Keep MINE end');
  // A selection left over from earlier: a drop goes where it is dropped, never over it.
  box.setSelectionRange(5, 9);
  const text = invented(1200);
  assert.equal(drop(box, text).prevented, true);
  assert.equal(box.value, 'Keep MINE end');
  assert.equal(m.fake.draft, 'Keep MINE end');
  assert.deepEqual([box.selectionStart, box.selectionEnd], [5, 9]);
  assert.deepEqual(m.fake.pasted.map((c) => c.source), ['drop']);
  assert.equal(key(box, 'z', { ctrlKey: true }).prevented, true);
  assert.equal(box.value, `Keep ${text}MINE end`);
  assert.equal(m.fake.pasted.length, 0);
});

test('a chip-only send goes as content "" plus pasted_blocks; the turn shows a folded card', async () => {
  const m = await mountChat();
  const text = invented(1200);
  paste(m.box(), text);
  assert.ok(await m.root().click('Send'));
  await settle();
  assert.deepEqual(m.api.sends, [{ path: '/journal/add', content: '', pasted_blocks: [{ id: 'p1', text, chars: 1200, lines: countLines(text), source: 'paste' }] }]);
  const card = m.root().querySelector('.myu-pasted-card')!;
  assert.equal(card.tag, 'details');
  assert.equal(card.querySelector('summary')?.text, 'Pasted text · 1,200 chars');
  assert.equal(card.querySelector('.myu-pasted-text')?.text, text, 'plain text, never markdown');
  assert.equal(chipLabels(m.root()).length, 0, 'the chips went with the send');
  assert.equal(m.fake.turns[0]?.role, 'user');
  assert.ok(m.fake.turns[0]?.at, 'the turn knows when it was said');

  // The next turn chains, typed words and a chip together.
  type(m.box(), 'Which part matters most?');
  paste(m.box(), invented(1500, 'staffing'));
  assert.ok(await m.root().click('Send'));
  await settle();
  assert.equal(m.api.sends[1]?.path, '/journal_chats/add');
  assert.equal(m.api.sends[1]?.content, 'Which part matters most?');
  assert.equal(m.api.sends[1]?.pasted_blocks?.length, 1);
});

test('over the caps nothing is sent: the words show, Send is held, and the box keeps everything', async () => {
  const m = await mountChat();
  type(m.box(), 'Keep these words');
  paste(m.box(), invented(50001));
  assert.ok(texts(m.row()).includes('Pasted text is 50,001 characters, and pasted text can be up to 50,000 characters.'));
  assert.equal(m.send().disabled, true, 'Send is held');
  key(m.box(), 'Enter');
  await settle();
  assert.equal(m.api.sends.length, 0);
  assert.equal(m.box().value, 'Keep these words');
  assert.equal(m.fake.pasted.length, 1);
  assert.equal(m.fake.turns.length, 0);

  const many = await mountChat();
  for (let i = 0; i < 6; i++) paste(many.box(), invented(1000 + i));
  assert.ok(texts(many.row()).includes('This message has 6 pasted texts, and a message can carry up to 5.'));
  key(many.box(), 'Enter');
  await settle();
  assert.equal(many.api.sends.length, 0);
  assert.equal(many.fake.pasted.length, 6);
  // Removing one lets it go.
  await many.row().querySelectorAll('.myu-pasted-remove')[5]!.onclick!();
  assert.equal(many.send().disabled, false);
  assert.equal(many.box().focused, true, 'the box has the focus after ×');
});

test('a refused send gives the box back its words and chips, and no user turn stays; pasted_text_too_long says the server’s words', async () => {
  // Offline.
  const off = await mountChat((api) => {
    api.state.offline = true;
  });
  type(off.box(), 'My words about it');
  const text = invented(1300);
  paste(off.box(), text);
  assert.ok(await off.root().click('Send'));
  await settle();
  assert.ok(!off.fake.turns.some((t) => t.role === 'user'), 'the turn that did not go is gone');
  assert.ok(texts(off.root()).includes("You're offline. This message was not sent. Try again when you're back online."));
  assert.equal(off.box().value, 'My words about it');
  assert.deepEqual(off.fake.pasted.map((c) => c.text), [text]);
  assert.equal(chipLabels(off.root()).length, 1);

  // A 413 with the server's sentence.
  const words = 'Pasted text is 61,200 characters, and pasted text can be up to 50,000 characters.';
  const big = await mountChat((api) => {
    api.createChatEntry = async (): Promise<ApiResponse<ChatTurnResult> & { message?: string }> => ({ status: 413, ok: false, data: null, error: 'pasted_text_too_long', message: words });
  });
  paste(big.box(), text);
  assert.ok(await big.root().click('Send'));
  await settle();
  assert.ok(texts(big.root()).includes(words), 'the server’s words, not the generic ones');
  assert.ok(!texts(big.root()).includes('Could not send this to Myu. Try again in a moment.'));
  assert.equal(big.fake.pasted.length, 1, 'the chips are back');
  assert.ok(!big.fake.turns.some((t) => t.role === 'user'));
});

test('an answer that does not count the pasted text puts the chips back with the lost words; the typed words stay sent', async () => {
  const m = await mountChat((api) => {
    // A server without pasted text: it saves and answers the typed words and says nothing of the blocks.
    api.createChatEntry = async () => ({ status: 200, ok: true, error: null, data: { journal_id: 'j-old-server', blocks: [{ type: 'conversational', text: 'Noted.' }] } });
  });
  type(m.box(), 'Here it is');
  const text = invented(1400);
  paste(m.box(), text);
  assert.ok(await m.root().click('Send'));
  await settle();
  assert.equal(m.box().value, '', 'the typed words went');
  assert.deepEqual(m.fake.pasted.map((c) => c.text), [text], 'the chips are back');
  assert.ok(texts(m.row()).includes(PASTE_WORDS.lost));
  assert.equal(m.fake.turns[0]?.text, 'Here it is');
  assert.equal(m.fake.turns[0]?.pasted, undefined, 'the turn shows only what reached Myu');
  assert.equal(m.root().querySelectorAll('.myu-pasted-card').length, 0);
});

test('a send that fails after the next words were typed keeps the failed turn, its words and its cards, in the thread', async () => {
  let answer!: (res: ApiResponse<ChatTurnResult>) => void;
  const m = await mountChat((api) => {
    api.createChatEntry = () => new Promise((resolve) => (answer = resolve));
  });
  type(m.box(), 'First message');
  const text = invented(1300);
  paste(m.box(), text);
  key(m.box(), 'Enter');
  await settle();
  // The reply is slow: the person writes the next thing, then the send fails.
  type(m.box(), 'next thought');
  answer({ status: 0, ok: false, data: null, error: 'offline' });
  await settle();
  assert.deepEqual(m.fake.turns.filter((t) => t.role === 'user').map((t) => [t.text, t.pasted?.map((c) => c.text)]), [['First message', [text]]]);
  assert.equal(m.root().querySelectorAll('.myu-pasted-card').length, 1, 'its card stays in the thread');
  assert.ok(texts(m.root()).includes("You're offline. This message was not sent. Try again when you're back online."));
  assert.equal(m.box().value, 'next thought', 'the new words stay as they are');
  assert.equal(m.fake.pasted.length, 0);
});

test('the open note as context: a lookup that fails still sends, and the pane takes the next message', async () => {
  const m = await mountChat();
  Object.assign(m.view, { app: { workspace: { getActiveFile: () => ({ extension: 'md', basename: 'Plan', path: 'Plan.md' }) } } });
  (m.view as unknown as { plugin: { chatContextForFile: () => Promise<unknown> } }).plugin.chatContextForFile = async () => {
    throw new TypeError('the lookup failed');
  };
  m.fake.render();
  type(m.box(), 'Words');
  const text = invented(1200);
  paste(m.box(), text);
  key(m.box(), 'Enter');
  await settle();
  assert.deepEqual(m.api.sends.map((s) => [s.content, s.pasted_blocks?.map((c) => c.text)]), [['Words', [text]]]);
  assert.equal(m.fake.turns[0]?.text, 'Words');
  type(m.box(), 'Again');
  key(m.box(), 'Enter');
  await settle();
  assert.deepEqual(m.api.sends.map((s) => s.content), ['Words', 'Again'], 'not stuck busy');
});

test('the open note as context: while its lookup runs the box is already empty, and words typed then stay for the next message', async () => {
  const m = await mountChat();
  let found!: (context: undefined) => void;
  Object.assign(m.view, { app: { workspace: { getActiveFile: () => ({ extension: 'md', basename: 'Plan', path: 'Plan.md' }) } } });
  (m.view as unknown as { plugin: { chatContextForFile: () => Promise<unknown> } }).plugin.chatContextForFile = () => new Promise((resolve) => (found = resolve));
  m.fake.render();
  const box = m.box();
  type(box, 'Sent words');
  paste(box, invented(1200));
  key(box, 'Enter');
  assert.equal(box.value, '', 'the sent words leave the box at once');
  assert.equal(chipLabels(m.root()).length, 0, 'and so do the chips');
  type(box, '!');
  found(undefined);
  await settle();
  assert.deepEqual(m.api.sends.map((s) => s.content), ['Sent words']);
  assert.equal(m.box().value, '!', 'only what was typed after the send');
});

test('a sent card keeps its fold across a repaint; Put back is held with the reason, and otherwise puts the text at the end', async () => {
  const m = await mountChat();
  type(m.box(), 'About this');
  paste(m.box(), invented(1200));
  assert.ok(await m.root().click('Send'));
  await settle();
  const card = m.root().querySelector('.myu-pasted-card')!;
  assert.equal(card.hasAttribute('open'), false, 'folded at first');
  card.setAttr('open', '');
  card.dispatch('toggle');
  m.fake.render();
  assert.equal(m.root().querySelector('.myu-pasted-card')!.hasAttribute('open'), true, 'still open after a repaint');

  // Put back would take the message over 10,000: held, with the reason under it.
  const typed = invented(9000, 'budget');
  type(m.box(), typed);
  const chipText = invented(1500);
  paste(m.box(), chipText);
  assert.ok(await m.row().click(`Pasted text · 1,500 chars · ${countLines(chipText)} lines`));
  const modal = openedModals[openedModals.length - 1] as { contentEl: FakeEl; titleEl: FakeEl };
  const putBack = modal.contentEl.querySelectorAll('button').find((b) => b.text === 'Put back in message')!;
  assert.equal(putBack.disabled, true);
  const check = canPutBack(typed, m.fake.pasted[0]!);
  assert.ok(texts(modal.contentEl).includes(`Putting this back would make the message ${check.length.toLocaleString('en-US')} characters, and a message can be up to 10,000.`));
  assert.equal(modal.contentEl.querySelector('.myu-pasted-sheet')?.text, chipText, 'the text, read-only');
  assert.ok(await modal.contentEl.click('Remove'));
  assert.equal(m.fake.pasted.length, 0);

  // Within the limit: at the end, after a blank line, the caret after it.
  type(m.box(), 'Short words');
  paste(m.box(), chipText);
  assert.ok(await m.row().click(`Pasted text · 1,500 chars · ${countLines(chipText)} lines`));
  const ok = openedModals[openedModals.length - 1] as { contentEl: FakeEl };
  assert.ok(await ok.contentEl.click('Put back in message'));
  assert.equal(m.box().value, `Short words\n\n${chipText}`);
  assert.equal(m.box().selectionStart, m.box().value.length);
  assert.equal(m.fake.pasted.length, 0);
});

test('the transport: pasted_blocks only when there are some; a refusal carries the server’s sentence; the count received is read', async () => {
  const posts: Array<[string, Record<string, unknown>]> = [];
  let answer: Record<string, unknown> = { ok: true, status: 200, data: { journal: { content: 'ok' }, pasted_blocks_received: 1 } };
  const api = new Api({ get: async () => ({ ok: true, status: 200, data: {} }), post: async (path: string, body: Record<string, unknown>) => { posts.push([path, body]); return answer; } } as never);
  const chip: PastedBlockWire = { id: 'p1', text: 'ZQX-PASTE-7', chars: 11, lines: 1, source: 'paste' };
  await api.addChatTurn('a', 'j1', 'hi');
  await api.addChatTurn('a', 'j1', 'hi', undefined, undefined, []);
  assert.deepEqual(posts[0]![1], posts[1]![1], 'no chips: the body is as before');
  assert.equal('pasted_blocks' in posts[0]![1], false);
  const sent = await api.addChatTurn('a', 'j1', '', undefined, undefined, [chip]);
  assert.deepEqual(posts[2]![1].pasted_blocks, [chip]);
  assert.equal(posts[2]![1].content, '', 'a paste-only message sends content ""');
  assert.equal(sent.data?.pasted_blocks_received, 1);
  await api.createChatEntry('a', 'hi', undefined, undefined, undefined, [chip]);
  assert.deepEqual(posts[3]!, ['/journal/add', { account_id: 'a', content: 'hi', surface_mode: 'journal', pasted_blocks: [chip] }]);
  await api.addSubjectTurn('conv-1', 'words', [chip]);
  await api.addSubjectTurn('conv-1', 'words');
  assert.deepEqual(posts[4]!, ['/journal_chats/add', { conversation_id: 'conv-1', content: 'words', pasted_blocks: [chip] }]);
  assert.deepEqual(posts[5]!, ['/journal_chats/add', { conversation_id: 'conv-1', content: 'words' }]);
  await api.classifyCareerMoment('a', 'typed', [chip]);
  assert.deepEqual(posts[6]!, ['/onboard/classify_career_moment', { account_id: 'a', content: 'typed', pasted_blocks: [chip] }]);

  answer = { ok: false, status: 413, data: { success: false, error: 'pasted_text_too_long', message: 'Pasted text is 61,200 characters, and pasted text can be up to 50,000 characters.' }, error: 'pasted_text_too_long' };
  const refused = await api.createChatEntry('a', '', undefined, undefined, undefined, [chip]);
  assert.equal(refused.data, null);
  assert.equal(refused.error, 'pasted_text_too_long');
  assert.equal(refused.message, 'Pasted text is 61,200 characters, and pasted text can be up to 50,000 characters.');
});

// ── a subject's conversation ──────────────────────────────────────────────────

test('a subject’s conversation: the box makes chips and sends them; a failed send gives them back; a typed name stays inline', async () => {
  const m = await mountChat();
  assert.equal(await m.view.openSpace('s1', 'Door team'), true);
  m.fake.render();
  const box = () => m.root().querySelector('.myu-space-input')!;
  const text = invented(1250, 'retro');
  type(box(), 'About this');
  const before = box();
  assert.equal(paste(box(), text).prevented, true);
  assert.equal(box(), before, 'the pane is not repainted for a chip');
  assert.equal(chipLabels(m.root()).length, 1);
  assert.equal(m.live().text, 'Pasted text added as an attachment, 1,250 characters. Undo available.');
  key(box(), 'Enter');
  await settle();
  assert.deepEqual(m.api.sends, [{ path: '/journal_chats/add', content: 'About this', pasted_blocks: [{ id: 'p1', text, chars: 1250, lines: countLines(text), source: 'paste' }] }]);
  assert.equal(m.root().querySelectorAll('.myu-pasted-card').length, 1, 'the turn shows its card');
  assert.equal(chipLabels(m.root()).length, 0);

  // A send that fails: the words and the chips come back.
  m.api.state.offline = true;
  type(box(), 'Second thought');
  paste(box(), text);
  key(box(), 'Enter');
  await settle();
  assert.equal(box().value, 'Second thought');
  assert.equal(chipLabels(m.root()).length, 1);
  m.api.state.offline = false;

  // A typed name ("Someone else"): a paste stays inline.
  const space = (m.view as unknown as { space: { typedMode: string | null; removePasted(id: string): void; pasted: PastedBlockWire[] } }).space;
  space.removePasted(space.pasted[0]!.id);
  space.typedMode = 'someone_else';
  m.fake.render();
  assert.equal(paste(box(), text).prevented, false);
  assert.equal(chipLabels(m.root()).length, 0);
});

/** A subject's conversation open in the chat pane, with its box and its state. */
async function mountSpace(tune?: (api: MockApi) => void) {
  const m = await mountChat(tune);
  assert.equal(await m.view.openSpace('s1', 'Door team'), true);
  m.fake.render();
  const space = (m.view as unknown as { space: { pasted: PastedBlockWire[]; undo: unknown; screen(): { turns: Array<{ from: string; text: string }>; after: Array<{ from: string; text: string }> } } }).space;
  return { ...m, space, spaceBox: () => m.root().querySelector('.myu-space-input')! };
}

test('a subject’s conversation: a send a read-only session may not make gives the words and the chips back', async () => {
  const m = await mountSpace((api) => {
    api.spaceMode.agent = true;
  });
  type(m.spaceBox(), 'My words');
  const text = invented(1300, 'retro');
  paste(m.spaceBox(), text);
  key(m.spaceBox(), 'Enter');
  await settle();
  assert.ok(texts(m.root()).includes("This session can read the retro's state, not act in it."));
  assert.equal(m.spaceBox().value, 'My words');
  assert.deepEqual(m.space.pasted.map((c) => c.text), [text]);
  assert.equal(chipLabels(m.root()).length, 1);
  const s = m.space.screen();
  assert.ok(![...s.turns, ...s.after].some((t) => t.from === 'you'), 'no turn for the words now back in the box');
});

test('a subject’s conversation: a failed send whose words and chips come back leaves no turn for them; one with new words in the box keeps it', async () => {
  const text = invented(1300, 'retro');
  const yours = (space: Awaited<ReturnType<typeof mountSpace>>['space']) => {
    const s = space.screen();
    return [...s.turns, ...s.after].filter((t) => t.from === 'you');
  };
  // Offline, refused (413), and no answer at all (the call throws).
  const failures: Array<[string, (api: MockApi) => void]> = [
    ['offline', (api) => (api.state.offline = true)],
    ['refused', (api) => (api.addSubjectTurn = async () => ({ status: 413, ok: false, data: null, error: 'pasted_text_too_long' }))],
    ['no answer', (api) => (api.addSubjectTurn = async () => Promise.reject(new Error('network down')))],
  ];
  for (const [how, fail] of failures) {
    const m = await mountSpace();
    const sendTurn = m.api.addSubjectTurn.bind(m.api);
    fail(m.api);
    type(m.spaceBox(), 'My words');
    paste(m.spaceBox(), text);
    key(m.spaceBox(), 'Enter');
    await settle();
    assert.equal(m.spaceBox().value, 'My words', `${how}: the words are back in the box`);
    assert.deepEqual(m.space.pasted.map((c) => c.text), [text], `${how}: and the chip`);
    assert.deepEqual(yours(m.space), [], `${how}: the message shows once, in the box`);
    assert.equal(m.root().querySelectorAll('.myu-pasted-card').length, 0, `${how}: no card for it in the thread`);
    // Sent again once the send works: one turn, with its card.
    m.api.state.offline = false;
    m.api.addSubjectTurn = sendTurn;
    key(m.spaceBox(), 'Enter');
    await settle();
    assert.deepEqual(yours(m.space).map((t) => t.text), ['My words'], `${how}: sent again, it shows once`);
    assert.equal(m.root().querySelectorAll('.myu-pasted-card').length, 1, `${how}: with its card`);
  }

  // A send that fails after new words were typed: the box keeps the new words, and the failed turn stays in the
  // thread with its words and card, so nothing is lost.
  const m = await mountSpace();
  let answer!: (res: ApiResponse<never>) => void;
  m.api.addSubjectTurn = () => new Promise((resolve) => (answer = resolve));
  type(m.spaceBox(), 'First message');
  paste(m.spaceBox(), text);
  key(m.spaceBox(), 'Enter');
  await settle();
  type(m.spaceBox(), 'next thought');
  answer({ status: 0, ok: false, data: null, error: 'offline' });
  await settle();
  assert.deepEqual(yours(m.space).map((t) => t.text), ['First message']);
  assert.equal(m.root().querySelectorAll('.myu-pasted-card').length, 1, 'its card stays in the thread');
  assert.equal(m.spaceBox().value, 'next thought');
  assert.equal(m.space.pasted.length, 0);
});

test('a subject’s conversation: pasted text that did not reach Myu comes back first, and a paste made meanwhile is no longer the one Undo takes', async () => {
  const m = await mountSpace();
  const sendTurn = m.api.addSubjectTurn.bind(m.api);
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  // A server without pasted text: it keeps the typed words and says nothing of the blocks.
  m.api.addSubjectTurn = async (id, content) => {
    await held;
    return sendTurn(id, content);
  };
  type(m.spaceBox(), 'About this');
  const sent = invented(1250, 'retro');
  paste(m.spaceBox(), sent);
  key(m.spaceBox(), 'Enter');
  await settle();
  // While it is out, the person writes on and pastes again.
  type(m.spaceBox(), 'Next');
  const later = invented(2222, 'staffing');
  paste(m.spaceBox(), later);
  release();
  await settle();
  assert.deepEqual(m.space.pasted.map((c) => [c.id, c.text]), [['p1', sent], ['p2', later]]);
  assert.equal(m.space.undo, null);
  assert.ok(texts(m.root()).includes(PASTE_WORDS.lost));
  assert.ok(!texts(m.root()).includes(`${PASTE_WORDS.hint} · `), 'no Undo offered');
  assert.equal(key(m.spaceBox(), 'z', { ctrlKey: true }).prevented, false, 'Mod+Z is the box’s own again');
  assert.equal(m.spaceBox().value, 'Next');
  assert.equal(m.space.pasted.length, 2);
});

test('a subject’s conversation: a turn kept with its pasted text folded into its words, or kept without it, shows once', async () => {
  const m = await mountSpace();
  const sendTurn = m.api.addSubjectTurn.bind(m.api);
  const yours = () => {
    const s = m.space.screen();
    return [...s.turns, ...s.after].filter((t) => t.from === 'you');
  };
  // The server's switch off: the blocks are folded into the words (typed, a blank line, each text), none is kept as a
  // block, and the count says they arrived.
  m.api.addSubjectTurn = async (id, content, pasted) => {
    const folded = [content, ...(pasted ?? []).map((c) => c.text)].filter((s) => s.trim()).join('\n\n');
    const res = await sendTurn(id, folded);
    return res.data ? { ...res, data: Object.assign({}, res.data, { pasted_blocks_received: pasted?.length ?? 0 }) } : res;
  };
  type(m.spaceBox(), 'Typed ');
  paste(m.spaceBox(), invented(1250, 'retro'));
  key(m.spaceBox(), 'Enter');
  await settle();
  assert.equal(yours().length, 1);
  assert.equal(m.root().querySelectorAll('.myu-pasted-card').length, 0, 'as the server keeps it: folded');

  // Kept with blocks the read cannot open (the field is then absent): the typed words come back alone.
  m.api.addSubjectTurn = async (id, content, pasted) => {
    const res = await sendTurn(id, content);
    return res.data ? { ...res, data: Object.assign({}, res.data, { pasted_blocks_received: pasted?.length ?? 0 }) } : res;
  };
  type(m.spaceBox(), 'Second');
  paste(m.spaceBox(), invented(1300, 'retro'));
  key(m.spaceBox(), 'Enter');
  await settle();
  assert.deepEqual(yours().map((t) => t.text.split('\n')[0]), ['Typed', 'Second']);
});

// ── the meeting's question ────────────────────────────────────────────────────

test('the meeting’s question box makes chips, and sends them with the typed words into the meeting’s conversation', async () => {
  const api = new MockApi();
  api.meetingPreps['evt-paste'] = {
    version: 2,
    event_id: 'evt-paste',
    title: 'Depot review',
    kind: 'outside',
    starts_at: new Date(Date.now() + 2 * 86400000).toISOString(),
    built_at: new Date().toISOString(),
    partial: false,
    thin: false,
    top: [],
    people: [],
    room: { team: null, lines: [] },
    before_you_go: { set_up_email: null, documents: [], not_replied: [], last_notes: null, agenda: null },
    afterwards: '',
    evidence: {},
    arc: null,
    interview: null,
    ask: { line_id: 'L-ask-paste', text: 'What do you want out of the review?', choices: [{ id: 'skip', label: 'Skip' }] },
  };
  const plugin = { backend: api, requestTodayRefresh: () => undefined, openConversationRef: async () => undefined };
  const view = new PrepView(new WorkspaceLeaf() as never, plugin as never);
  await view.onOpen();
  await view.showMeeting('evt-paste');
  const root = (view as unknown as { contentEl: FakeEl }).contentEl;
  const input = root.querySelector('.myu-prep-input')!;
  const text = invented(1600, 'route');
  type(input, 'Agree the routes');
  assert.equal(paste(input, text).prevented, true);
  assert.equal(root.querySelector('.myu-prep-input'), input, 'the card is not drawn again');
  assert.equal(chipLabels(root).length, 1);
  assert.ok(await root.click('Send'));
  await settle();
  assert.deepEqual(api.subjectTurns, [{ conversation_id: 'mock-meeting-conv-evt-paste', content: 'Agree the routes', pasted_blocks: [{ id: 'p1', text, chars: 1600, lines: countLines(text), source: 'paste' }] }]);
});

// ── the onboarding moment ─────────────────────────────────────────────────────

test('the onboarding moment: a chip under the field, classified with the typed words, and handed to the chat', async () => {
  const api = new MockApi();
  const seeds: unknown[] = [];
  const plugin = {
    backend: api,
    settings: { account_id: 'acct-test-1' },
    onboardingScripts: { onboard_arc_provided: true },
    linkSurvey: async () => [],
    refreshOnboardingState: async () => undefined,
    openChat: async (seed: unknown) => void seeds.push(seed),
  };
  const modal = new OnboardingModal({} as never, plugin as never, () => undefined);
  modal.open();
  const root = modal.contentEl as unknown as FakeEl;
  const field = root.querySelector('input')!;
  (field as unknown as { typed: string }).typed = 'Moving into operations';
  const text = invented(1100, 'role');
  assert.equal(paste(field, text).prevented, true);
  assert.equal(chipLabels(root).length, 1);
  assert.equal((modal.modalEl as unknown as FakeEl).querySelector('.myu-sr-only')?.text, 'Pasted text added as an attachment, 1,100 characters. Undo available.');
  assert.ok(await root.click('Tell Myu'));
  await settle();
  const chip = { id: 'p1', text, chars: 1100, lines: countLines(text), source: 'paste' };
  assert.deepEqual(api.sends, [{ path: '/onboard/classify_career_moment', content: 'Moving into operations', pasted_blocks: [chip] }]);
  assert.deepEqual(seeds, [{ text: 'Moving into operations', send: true, pasted: [chip], templateType: 'onboarding_moment' }]);
});

// ── the vault's note and selection ────────────────────────────────────────────

test('Ask Myu about this note: sent at once as a vault_note block with nothing typed; an over-cap note waits with Send held', async () => {
  const raw = `# Plan\n\n${invented(2000, 'plan')}\n`;
  const block = noteBlock(raw, 'Projects/Plan.md')!;
  assert.deepEqual(block.ref, { path: 'Projects/Plan.md', line_from: 1, line_to: countLines(raw.trimEnd()) });
  const m = await mountChat();
  m.view.seed({ text: '', send: true, pasted: [block] });
  await settle();
  assert.deepEqual(m.api.sends, [{ path: '/journal/add', content: '', pasted_blocks: [block] }]);
  assert.equal(m.root().querySelector('.myu-pasted-card')?.querySelector('summary')?.text, `Note: Plan · ${block.chars.toLocaleString('en-US')} chars · ${block.lines} lines`);
  assert.equal(noteBlock('  \n\n', 'Empty.md'), null, 'a blank note has nothing to send');

  const big = await mountChat();
  const over = noteBlock(invented(60000, 'archive'), 'Archive/Everything.md')!;
  big.view.seed({ text: '', send: true, pasted: [over] });
  await settle();
  assert.equal(big.api.sends.length, 0, 'not sent');
  assert.equal(chipLabels(big.root()).length, 1, 'the chat opens with the chip');
  assert.equal(big.send().disabled, true, 'Send held');
  assert.ok(texts(big.row()).includes('Pasted text is 60,000 characters, and pasted text can be up to 50,000 characters.'));

  // The command's own code: the note goes as that block, with no words written for the person.
  const main = readFileSync('src/main.ts', 'utf8');
  const fn = main.slice(main.indexOf('async askMyuAboutNote('), main.indexOf('async chatContextForFile('));
  assert.match(fn, /noteBlock\(raw, file\.path\)/);
  assert.match(fn, /openChat\(\{ text: '', send: true, context, pasted:/);
  assert.doesNotMatch(main, /What do you notice|About my note|About this:|clipped/);
});

test('Ask Myu about this selection: a vault_selection chip of 1-based lines, an empty focused box, nothing sent', async () => {
  const selection = invented(800, 'agenda');
  const block = selectionBlock(selection, 'Projects/Plan.md', { line: 11 }, { line: 29 });
  assert.deepEqual(block.ref, { path: 'Projects/Plan.md', line_from: 12, line_to: 30 });
  assert.equal(selectionBlock(selection, null, { line: 0 }, { line: 3 }).ref, undefined, 'outside a note: no ref');
  const m = await mountChat();
  m.view.seed({ text: '', send: false, pasted: [block] });
  await settle();
  assert.deepEqual(chipLabels(m.root()), ['Selection from Plan · lines 12–30 · 800 chars']);
  assert.equal(m.box().value, '');
  assert.equal(m.box().focused, true);
  assert.equal(m.api.sends.length, 0);
  // The two doors build it the same way.
  const main = readFileSync('src/main.ts', 'utf8');
  assert.equal(main.match(/selectionBlock\(selection, (?:file|ctx\.file)\?\.path, editor\.getCursor\('from'\), editor\.getCursor\('to'\)\)/g)?.length, 2);
  assert.match(main, /'Myu wrote this note, so it is not sent back as your writing\.'/);
});

// ── back into the vault, and into a report ────────────────────────────────────

const plan: PastedBlockWire = { id: 'p1', text: 'Step one ZQX-PASTE-7\n\nStep two', chars: 30, lines: 3, source: 'paste' };
const notePart: PastedBlockWire = { id: 'p2', text: 'From the note', chars: 13, lines: 1, source: 'vault_note', ref: { path: 'Projects/Plan.md', line_from: 1, line_to: 1 } };

test('saved conversations and journal notes: pasted text as folded quote callouts; a paste-only turn is kept', () => {
  const md = renderConversation([
    { role: 'user', text: 'Look at this', pasted: [plan] },
    { role: 'myu', blocks: [{ type: 'conversational', text: 'Step two first.' }] },
    { role: 'user', text: '', pasted: [plan, notePart] },
  ]);
  assert.equal(
    md,
    [
      '**You:** Look at this',
      '',
      '> [!quote]- Pasted text · 30 chars\n> Step one ZQX-PASTE-7\n>\n> Step two',
      '',
      '**Myu:** Step two first.',
      '',
      '**You:**',
      '',
      '> [!quote]- Pasted text 1 · 30 chars\n> Step one ZQX-PASTE-7\n>\n> Step two',
      '',
      '> [!quote]- Note: Plan · 13 chars · 1 line\n> From the note',
    ].join('\n'),
  );
  assert.equal(renderConversation([{ role: 'user', text: '' }]), null, 'neither words nor pasted text: nothing to write');

  const day = buildJournalDayMarkdown('2026-10-05', [
    { time: '09:00', text: '', journalId: 'j-1', pasted: [plan], turns: [{ role: 'you', text: 'And this', pasted: [plan] }, { role: 'myu', text: 'Noted.' }] },
  ]);
  assert.ok(day.includes('## 09:00\n\n> [!quote]- Pasted text · 30 chars\n> Step one ZQX-PASTE-7\n>\n> Step two\n\n> **you:** And this\n>\n> > [!quote]- Pasted text · 30 chars\n> > Step one ZQX-PASTE-7\n> >\n> > Step two\n>\n> **myu:** Noted.'), day);
  assert.ok(day.includes('myu-generated: true'));
});

test('conversations and the journal history keep rows of pasted text only', async () => {
  const backend = {
    getJournalEntries: async () => ({ ok: true, status: 200, error: null, data: { entries: [
      { journal_id: 'j-paste', content: '', pasted_blocks: [plan], timestamp: '2026-10-05T09:00:00Z' },
      { journal_id: 'j-empty', content: '', timestamp: '2026-10-04T09:00:00Z' },
      { journal_id: 'j-typed', content: 'Typed words', timestamp: '2026-10-03T09:00:00Z' },
    ] } }),
    getJournalChats: async () => ({ ok: true, status: 200, error: null, data: { chats: [
      { chatter_id: 'acct-test-1', content: '', pasted_blocks: [plan], timestamp: '2026-10-05T09:01:00Z' },
      { chatter_id: 'agent', content: JSON.stringify({ content: [{ type: 'conversational', text: 'Noted.' }] }), timestamp: '2026-10-05T09:01:05Z' },
      { chatter_id: 'acct-test-1', content: '', timestamp: '2026-10-05T09:02:00Z' },
    ] } }),
  };
  const deps = { backend: backend as never, key: null, accountId: 'acct-test-1' };
  const heads = await listConversations(deps);
  assert.deepEqual(heads.map((h) => [h.journalId, h.preview]), [['j-paste', 'Pasted text · 30 chars'], ['j-typed', 'Typed words']]);
  const turns = await loadConversation(deps, 'j-paste', heads[0]);
  assert.deepEqual(turns[0], { role: 'user', text: '(2026-10-05)', pasted: [plan] }, 'the opening: the day alone, with its card');
  assert.deepEqual(turns[1], { role: 'user', text: '', pasted: [plan], at: '2026-10-05T09:01:00.000Z' });
  assert.equal(turns.length, 3, 'a row with neither words nor pasted text is left out');

  const service = new MaterializationService({ api: () => backend, settings: () => DEFAULT_SETTINGS, paceMs: 0 } as never);
  const day = await (service as unknown as { journalEntryToDay(e: unknown, k: unknown, a: string, f: boolean): Promise<{ entry: { text: string; pasted?: unknown; turns?: Array<{ role: string; text: string; pasted?: unknown }> } } | null> })
    .journalEntryToDay({ journal_id: 'j-paste', content: '', pasted_blocks: [plan], timestamp: new Date().toISOString() }, {}, 'acct-test-1', true);
  assert.equal(day?.entry.text, '');
  assert.deepEqual(day?.entry.pasted, [plan]);
  assert.deepEqual(day?.entry.turns?.[0], { role: 'you', text: '', pasted: [plan] });
  assert.equal(day?.entry.turns?.length, 2);
});

test('the feedback transcript: every turn under a timestamped header, pasted text as labelled blocks', () => {
  const now = new Date('2026-10-05T10:00:00Z');
  const att = formatConversationAttachment(
    [
      { role: 'user', text: '(2026-10-05)', pasted: [plan] },
      { role: 'user', text: 'Two lines\nof typing', pasted: [notePart], at: '2026-10-05T09:01:00.000Z' },
      { role: 'myu', blocks: [{ type: 'conversational', text: 'Noted.' }] },
    ],
    'j-1',
    now,
  );
  assert.equal(
    att.attached_content,
    [
      '--- Journal Entry ---',
      'ID: j-1',
      'Timestamp: 2026-10-05T10:00:00.000Z',
      '',
      '  (2026-10-05)',
      '  [pasted text 1 · 30 chars · 3 lines · paste]',
      '  | Step one ZQX-PASTE-7',
      '  |',
      '  | Step two',
      '',
      '--- Journal Chat ---',
      '[user 2026-10-05T09:01:00.000Z] Two lines',
      '  of typing',
      '  [pasted text 1 · 13 chars · 1 line · vault_note]',
      '  | From the note',
      '[agent 2026-10-05T10:00:00.000Z] Noted.',
    ].join('\n'),
  );
});

// ── capture ───────────────────────────────────────────────────────────────────

function vault(notes: Record<string, { body: string; fm?: Record<string, unknown> }>) {
  const reads: string[] = [];
  const files = Object.keys(notes).map((path) => ({ path, basename: path.split('/').pop()!.replace(/\.md$/, ''), extension: 'md', stat: { mtime: Date.parse('2026-10-01T12:00:00Z') } }));
  const app = {
    metadataCache: { getFileCache: (f: { path: string }) => ({ frontmatter: notes[f.path]?.fm }) },
    vault: {
      cachedRead: async (f: { path: string }) => {
        reads.push(f.path);
        return notes[f.path]!.body;
      },
      getMarkdownFiles: () => files,
      getName: () => 'test-vault',
    },
  };
  return { app, files, reads, file: (path: string) => files.find((f) => f.path === path)! };
}

test('capture: a note Myu wrote is not read or sent; a Web Clipper note is sent marked; removing the tag sends it again', async () => {
  const notes: Record<string, { body: string; fm?: Record<string, unknown> }> = {
    'Clips/Article.md': { body: 'A clipped article, ZQX-PASTE-7.', fm: { tags: ['clippings'] } },
    'Clips/Myu note.md': { body: 'Myu wrote this.', fm: { 'myu-generated': true } },
    'Clips/Mine.md': { body: 'My own note.' },
  };
  const v = vault(notes);
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const api = new MockApi();
  const settings: AskMyuSettings = { ...DEFAULT_SETTINGS, vault_id: 'v-test', allowlist_folders: ['Clips'], capture_hashes: {}, queue: [] };
  const service = new CaptureService({ app: v.app as never, api, keys: { get: () => key } as never, settings: () => settings, save: async () => undefined, canCapture: () => true });

  assert.equal(await service.capture(v.file('Clips/Myu note.md') as never), 'generated');
  assert.deepEqual(v.reads, [], 'decided from the metadata alone: nothing read');
  assert.equal(api.upserts.length, 0, 'nothing sent');

  assert.equal(await service.capture(v.file('Clips/Article.md') as never), 'sent');
  assert.equal(api.upserts[0]?.web_clipping, true);
  assert.equal(await service.capture(v.file('Clips/Article.md') as never), 'skipped', 'unchanged');
  notes['Clips/Article.md']!.fm = {};
  assert.equal(await service.capture(v.file('Clips/Article.md') as never), 'sent', 'the tag went: the note is sent again');
  assert.equal('web_clipping' in api.upserts[1]!, false);

  assert.equal(await service.capture(v.file('Clips/Mine.md') as never), 'sent');
  assert.equal(settings.capture_hashes['v-test:Clips/Mine.md'], await hashContent('My own note.'), 'an unclipped note keeps its old hash');

  // Offline: queued with its mark, and replayed with it.
  notes['Clips/Article.md']!.fm = { source: 'https://example.com/article' };
  api.state.offline = true;
  assert.equal(await service.capture(v.file('Clips/Article.md') as never), 'queued');
  assert.equal(settings.queue[0]?.web_clipping, true);
  api.state.offline = false;
  const flushed = await service.flushQueue();
  assert.equal(flushed.sent, 1);
  assert.equal(api.upserts[api.upserts.length - 1]?.web_clipping, true);

  // The backfill and the link survey leave Myu's notes out.
  assert.deepEqual(service.surveyBackfill().files.map((f) => f.path).sort(), ['Clips/Article.md', 'Clips/Mine.md']);
  assert.deepEqual((await service.sharedNotesForSurvey()).map((n) => n.text).sort(), ['A clipped article, ZQX-PASTE-7.', 'My own note.']);
});

test('capture: a meeting note Myu wrote never qualifies for the meeting pipeline', () => {
  const v = vault({
    'Myu/Meetings/Depot review.md': { body: 'Myu wrote this.', fm: { 'myu-generated': true, 'myu-meeting': true } },
    'Meetings/Depot review.md': { body: 'My notes.' },
  });
  const settings: AskMyuSettings = { ...DEFAULT_SETTINGS, meeting_folders: ['Myu/Meetings', 'Meetings'] };
  const meetings = new MeetingCapture({ app: v.app as never, api: new MockApi(), settings: () => settings, save: async () => undefined, canCapture: () => true });
  assert.equal(meetings.qualifies(v.file('Myu/Meetings/Depot review.md') as never), false);
  assert.equal(meetings.qualifies(v.file('Meetings/Depot review.md') as never), true);
});
