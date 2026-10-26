/**
 * Send feedback with files (2026-10-14), on the functional UI fake: what the modal says, which picked files it keeps
 * and what it says about the others, the remove button, and what a send carries on the wire (each file's bytes as
 * base64, no data-URL prefix). A server from before files, and a 413, as the modal answers them. Every file here is
 * invented.
 */

import { strict as assert } from 'node:assert';
import test from 'node:test';

import { FakeEl, notices } from './ui-stub';
import { MockApi } from '../src/transport/mock';
import { FEEDBACK_FILE_MAX_BYTES, FEEDBACK_FILE_WORDS } from '../src/feedbackFiles';
import { FeedbackModal, readFileBase64 } from '../src/views/FeedbackModal';

/** The DOM's FileReader, as far as `readFileBase64` uses it: a data URL from the blob's bytes, then onload. */
class FakeFileReader {
  result: string | null = null;
  error: Error | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readAsDataURL(blob: Blob): void {
    blob.arrayBuffer().then(
      (buf) => {
        this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(buf).toString('base64')}`;
        this.onload?.();
      },
      (e: unknown) => {
        this.error = e instanceof Error ? e : new Error(String(e));
        this.onerror?.();
      },
    );
  }
}
(globalThis as unknown as { FileReader: unknown }).FileReader = FakeFileReader;

const bytes = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 7 + 3) % 256);
const file = (name: string, size: number, type = '') => new File([bytes(size)], name, { type });
/** A pick over the cap, never read: its size is all that is looked at. */
const huge = (name: string) => ({ name, size: FEEDBACK_FILE_MAX_BYTES + 1, type: 'video/quicktime' }) as unknown as File;

function mount(tune?: (api: MockApi) => void) {
  const api = new MockApi();
  tune?.(api);
  const plugin = {
    // main.ts's sendFeedback, as far as the modal relies on it: the attachments pass through as they are.
    sendFeedback: (opts: { message: string; category: string; surface: string; attachments?: { files?: unknown[] } }) =>
      api.submitFeedback({ message: opts.message, category: opts.category, app: 'obsidian', version: 'test', context: { surface_state: opts.surface }, ...(opts.attachments ? { attachments: opts.attachments as never } : {}) }),
  };
  const modal = new FeedbackModal({} as never, plugin as never);
  modal.open();
  const root = modal.contentEl as unknown as FakeEl;
  const rows = () => root.querySelectorAll('.myu-fb-file').map((r) => r.children.map((c) => c.text));
  const refused = () => root.querySelectorAll('.myu-fb-refused').map((p) => p.text);
  const type = (value: string) => {
    const box = root.querySelector('textarea')!;
    box.value = value;
    (box as unknown as { oninput: () => void }).oninput();
  };
  return { api, modal, root, rows, refused, type };
}
const settle = async (n = 8) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
};

test('the modal says what goes, offers "Add a file" with the caps, and lists no file until one is added', () => {
  const m = mount();
  const words = m.root.visibleTexts().join('\n');
  assert.ok(words.includes('Nothing from your vault is attached unless you add a file.'));
  assert.ok(words.includes(`${FEEDBACK_FILE_WORDS.caps} ${FEEDBACK_FILE_WORDS.byEmail}`));
  assert.ok(!/health|to-do|screenshot/i.test(words), 'plain words only');
  const add = m.root.querySelector('.myu-fb-add');
  assert.equal(add?.tag, 'button');
  assert.equal(add?.text, 'Add a file');
  assert.deepEqual(m.rows(), []);
  assert.deepEqual(m.refused(), []);
  assert.equal(m.root.querySelector('.myu-fb-file-input'), null, 'the picker is made when pressed, not drawn');
});

test('a pick: the files that can go are listed with their size and a remove button; the others are said, until the next pick', () => {
  const m = mount();
  m.modal.addPicked([file('shot.png', 1200, 'image/png'), huge('big.mov'), file('notes.pdf', 2 * 1024 * 1024)]);
  assert.deepEqual(m.rows(), [['shot.png', '· 1 KB', '×'], ['notes.pdf', '· 2 MB', '×']]);
  assert.deepEqual(m.refused(), ['big.mov is over 10 MB, so it can’t go.']);
  const remove = m.root.querySelectorAll('.myu-fb-file-remove');
  assert.deepEqual(remove.map((b) => [b.tag, b.attrs['aria-label']]), [['button', 'Remove shot.png'], ['button', 'Remove notes.pdf']]);
  // The same file again is already on it; the earlier refusal is gone.
  m.modal.addPicked([file('shot.png', 1200, 'image/png')]);
  assert.deepEqual(m.rows().map((r) => r[0]), ['shot.png', 'notes.pdf']);
  assert.deepEqual(m.refused(), ['shot.png is already on it.']);
  // A clean pick says nothing.
  m.modal.addPicked([file('log.txt', 40)]);
  assert.deepEqual(m.rows().map((r) => r[0]), ['shot.png', 'notes.pdf', 'log.txt']);
  assert.deepEqual(m.refused(), []);
  // The message box is not redrawn by a pick: what was typed is still there.
  m.type('The Today pane stayed empty this morning.');
  m.modal.addPicked([file('more.txt', 4)]);
  assert.equal(m.root.querySelector('textarea')?.value, 'The Today pane stayed empty this morning.');
});

test('the remove button takes the file off the list', async () => {
  const m = mount();
  m.modal.addPicked([file('shot.png', 1200, 'image/png'), file('notes.pdf', 300)]);
  const remove = m.root.querySelectorAll('.myu-fb-file-remove').find((b) => b.attrs['aria-label'] === 'Remove shot.png');
  assert.ok(remove?.onclick);
  await remove.onclick!();
  assert.deepEqual(m.rows().map((r) => r[0]), ['notes.pdf']);
});

test('a send carries each file as {name, content_type, size_bytes, base64}, the bytes as base64 with no data-URL prefix', async () => {
  const m = mount();
  const png = bytes(1200);
  m.modal.addPicked([new File([png], 'shot.png', { type: 'image/png' }), file('Makefile', 12)]);
  m.type('The Today pane stayed empty this morning.');
  assert.ok(await m.root.click('Send'));
  await settle();
  assert.equal(m.api.state.feedback.length, 1);
  const body = m.api.state.feedback[0];
  assert.equal(body.message, 'The Today pane stayed empty this morning.');
  assert.equal(body.category, 'general');
  assert.deepEqual(body.attachments, {
    files: [
      { name: 'shot.png', content_type: 'image/png', size_bytes: 1200, base64: Buffer.from(png).toString('base64') },
      { name: 'Makefile', content_type: 'application/octet-stream', size_bytes: 12, base64: Buffer.from(bytes(12)).toString('base64') },
    ],
  });
  assert.ok(!body.attachments?.files?.some((f) => f.base64.startsWith('data:')));
  assert.equal(notices[notices.length - 1], 'Thank you — sent.');
  assert.equal(m.root.children.length, 0, 'the modal closed');
});

test('without a file, the body carries no attachments at all', async () => {
  const m = mount();
  m.type('An idea: a week view.');
  await m.root.click('Send');
  await settle();
  assert.equal(m.api.state.feedback.length, 1);
  assert.ok(!('attachments' in m.api.state.feedback[0]));
});

test('a server from before files takes the message and drops them: the modal says so and closes as on success', async () => {
  const m = mount((api) => { api.feedbackServerBeforeFiles = true; });
  m.modal.addPicked([file('shot.png', 100, 'image/png')]);
  m.type('The Today pane stayed empty this morning.');
  await m.root.click('Send');
  await settle();
  assert.equal(m.api.state.feedback.length, 1);
  assert.equal(notices[notices.length - 1], FEEDBACK_FILE_WORDS.filesNotTaken);
  assert.equal(m.root.children.length, 0, 'the modal closed');
});

test('a 413 is the modal\'s problem line; the files stay listed and nothing was recorded', async () => {
  const m = mount((api) => { api.feedbackRefusal = { status: 413, error: 'attachment_too_large' }; });
  m.modal.addPicked([file('shot.png', 100, 'image/png')]);
  m.type('The Today pane stayed empty this morning.');
  await m.root.click('Send');
  await settle();
  assert.equal(m.api.state.feedback.length, 0);
  assert.equal(m.root.querySelector('.myu-problem')?.text, FEEDBACK_FILE_WORDS.tooBigToSend);
  assert.deepEqual(m.rows().map((r) => r[0]), ['shot.png']);
  assert.ok(m.root.children.length > 0, 'the modal stays open');
});

test('a file that will not read is left out and named in a notice; the report goes with the others', async () => {
  const m = mount();
  const broken = Object.assign(file('gone.txt', 10), { arrayBuffer: () => Promise.reject(new Error('EACCES')) });
  m.modal.addPicked([file('shot.png', 100, 'image/png'), broken]);
  m.type('The Today pane stayed empty this morning.');
  await m.root.click('Send');
  await settle();
  assert.equal(m.api.state.feedback.length, 1);
  assert.deepEqual(m.api.state.feedback[0].attachments?.files?.map((f) => f.name), ['shot.png']);
  assert.deepEqual(notices.slice(-2), ['Thank you — sent.', 'Couldn’t read gone.txt, so it isn’t going.']);
  assert.equal(m.root.children.length, 0, 'the modal closed');
  // Every kept file failing: the message still goes, with no attachments, and the names are said.
  const all = mount();
  all.modal.addPicked([Object.assign(file('a.pdf', 5), { arrayBuffer: () => Promise.reject(new Error('x')) }), Object.assign(file('b.png', 5), { arrayBuffer: () => Promise.reject(new Error('x')) })]);
  all.type('Still here.');
  await all.root.click('Send');
  await settle();
  assert.equal(all.api.state.feedback.length, 1);
  assert.ok(!('attachments' in all.api.state.feedback[0]));
  assert.equal(notices[notices.length - 1], 'Couldn’t read a.pdf and b.png, so they aren’t going.');
});

test('readFileBase64 strips the data-URL prefix and keeps the bytes', async () => {
  const b = bytes(300);
  assert.equal(await readFileBase64(new Blob([b], { type: 'application/pdf' })), Buffer.from(b).toString('base64'));
  assert.equal(await readFileBase64(new Blob([])), '');
});
