/**
 * "Same person" in the vault (2026-11-15), on the functional UI fake: the words (never the old one), the picker's heading and box, the
 * one yes, the door and its body, the server's sentence with Undo and what an undo says, a failure, and the Help Myu row.
 */

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { FakeEl } from './ui-stub';
import { MockApi } from '../src/transport/mock';
import { Api, type HelpMyuItem } from '../src/transport/api';
import { IDENTITY_NEVER, IDENTITY_WORDS } from '../src/personIdentities';
import { samePerson, undoPersonMove, type SamePersonDeps, type UndoAction } from '../src/samePerson';
import { PERSON_ACTION_COPY } from '../src/views/personActions';
import { PersonActionConfirmModal } from '../src/views/PersonActionConfirmModal';
import { MergeIntoModal } from '../src/views/MergeIntoModal';
import { HelpMyuView } from '../src/views/HelpMyuView';

const settle = () => new Promise((r) => setTimeout(r, 0));

/** What the person was told, in order, and what ran after. */
function deps(api: MockApi) {
  const told: Array<{ said: string; undo: UndoAction | null; failed?: true }> = [];
  const ran: string[] = [];
  const d: SamePersonDeps = {
    backend: api,
    done: (said, undo) => told.push({ said, undo }),
    failed: (said) => told.push({ said, undo: null, failed: true }),
    after: () => void ran.push('after'),
    undone: () => void ran.push('undone'),
  };
  return { d, told, ran };
}

// ── the words ───────────────────────────────────────────────

test('the words: "A and B are the same person?", what moves and that it can be undone, "Same person"; never the old word', () => {
  const copy = PERSON_ACTION_COPY.samePerson('Tess C.', 'Tess Colleague');
  assert.equal(copy.title, 'Tess C. and Tess Colleague are the same person?');
  assert.equal(copy.body, 'Everything kept under Tess C. moves to Tess Colleague: what was said, the promises, the mail and the meetings. You can undo it.');
  assert.equal(copy.cta, 'Same person');
  assert.equal('note' in copy, false, 'no vault sentence when Myu keeps no notes');
  assert.equal(PERSON_ACTION_COPY.samePerson('Tess C.', 'Tess Colleague', { vaultNotes: true }).note, 'Tess C.’s note in the Myu folder goes to the trash.');
  assert.equal(PERSON_ACTION_COPY.samePersonAs, 'Same person as…');
  const shown = [
    copy.title,
    copy.body,
    copy.cta,
    PERSON_ACTION_COPY.samePerson('A', 'B', { vaultNotes: true }).note ?? '',
    PERSON_ACTION_COPY.samePersonAs,
    IDENTITY_WORDS.samePersonTitle('Tess C.'),
    IDENTITY_WORDS.samePersonHint('Tess C.'),
    IDENTITY_WORDS.samePersonSearch,
    IDENTITY_WORDS.undo,
    IDENTITY_WORDS.undone,
    IDENTITY_WORDS.didNotGoThrough,
    IDENTITY_WORDS.chooseWho,
  ];
  for (const w of shown) {
    assert.doesNotMatch(w, IDENTITY_NEVER, w);
    assert.doesNotMatch(w, /cannot be undone/i, w);
  }
});

/** Every string literal in a file that reads as words (not an id like 'merge-person' or 'merge_candidate', not a path). */
function sentences(file: string): string[] {
  const text = readFileSync(path.join(process.cwd(), file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
  return [...text.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)]
    .map((m) => m[1] ?? m[2] ?? m[3] ?? '')
    .filter((s) => !/^[a-z0-9_-]+$/.test(s) && !s.startsWith('/') && !s.startsWith('../') && !s.startsWith('./'));
}

test('nothing on screen in the doors that open it says the old word: the menu, the command, the edit window, the picker, Help Myu', () => {
  // The scan reads the words people see (so a pass is not a scan that read nothing).
  assert.ok(sentences('src/views/HelpMyuView.ts').includes('Not the same'));
  assert.ok(sentences('src/views/PersonEditModal.ts').includes('This is me'));
  assert.ok(sentences('src/main.ts').some((s) => s.includes('is me')));
  for (const file of ['src/main.ts', 'src/views/MergeIntoModal.ts', 'src/views/PersonEditModal.ts', 'src/views/HelpMyuView.ts', 'src/views/personActions.ts', 'src/views/PersonActionConfirmModal.ts', 'src/samePerson.ts']) {
    for (const s of sentences(file)) assert.doesNotMatch(s, /\bmerg(e|ed|ing)\b/i, `${file}: ${s}`);
  }
});

// ── the picker and the one yes ──────────────────────────────

test('the picker: "Marcus W. is the same person as…", what choosing does, "Search your people"; never the person themself', async () => {
  const api = new MockApi();
  const picked: string[] = [];
  const m = new MergeIntoModal({} as never, { backend: api } as never, 'rel-1', 'Marcus W.', (t) => picked.push(t.entity_id));
  m.open();
  await settle();
  assert.equal((m as unknown as { placeholder: string }).placeholder, 'Search your people');
  const modal = (m as unknown as { modalEl: FakeEl }).modalEl;
  assert.deepEqual(modal.visibleTexts(), ['Marcus W. is the same person as…', 'Choose who Marcus W. really is. Everything kept under Marcus W. moves to them.']);
  assert.deepEqual(m.getItems().map((e) => e.entity_id), ['rel-2'], 'people only, and not Marcus W. themself');
  m.onChooseItem(m.getItems()[0]);
  assert.deepEqual(picked, ['rel-2']);
});

test('the one yes: the question, what moves, the vault sentence when there is one; "Same person" answers yes, "Not now" no', async () => {
  const answers: boolean[] = [];
  const m = new PersonActionConfirmModal({} as never, PERSON_ACTION_COPY.samePerson('Marcus W.', 'Marcus Webb', { vaultNotes: true }), (y) => void answers.push(y));
  m.open();
  const el = (m as unknown as { contentEl: FakeEl }).contentEl;
  const texts = el.visibleTexts();
  assert.ok(texts.includes('Marcus W. and Marcus Webb are the same person?'));
  assert.ok(texts.includes('Everything kept under Marcus W. moves to Marcus Webb: what was said, the promises, the mail and the meetings. You can undo it.'));
  assert.ok(texts.includes('Marcus W.’s note in the Myu folder goes to the trash.'));
  assert.ok(await el.click('Same person'));
  const m2 = new PersonActionConfirmModal({} as never, PERSON_ACTION_COPY.samePerson('Marcus W.', 'Marcus Webb'), (y) => void answers.push(y));
  m2.open();
  const el2 = (m2 as unknown as { contentEl: FakeEl }).contentEl;
  assert.ok(!el2.visibleTexts().some((t) => /Myu folder/.test(t)), 'no vault sentence when Myu keeps no notes');
  assert.ok(await el2.click('Not now'));
  assert.deepEqual(answers, [true, false]);
});

// ── the door, what it says back, Undo ───────────────────────

test('the door: POST /relationships/merge {source_id, target_id, action: "confirm"}; Undo is POST /myu/person/undo {move_id}', async () => {
  const posts: Array<[string, unknown]> = [];
  const api = new Api({ get: async () => ({ ok: true, status: 200, data: {} }), post: async (p: string, body: unknown) => { posts.push([p, body]); return { ok: true, status: 200, data: {} }; } } as never);
  await api.samePerson('rel-3', 'rel-1');
  await api.undoPersonChange('mv-9');
  assert.deepEqual(posts, [
    ['/relationships/merge', { source_id: 'rel-3', target_id: 'rel-1', action: 'confirm' }],
    ['/myu/person/undo', { move_id: 'mv-9' }],
  ]);
  assert.equal('mergeRelationships' in api, false, 'the old door is gone');
});

test('after it: the server’s sentence with Undo, then the vault; Undo puts it back and says "Put back as it was."', async () => {
  const api = new MockApi();
  const { d, told, ran } = deps(api);
  assert.equal(await samePerson(d, 'rel-3', 'rel-1'), true);
  assert.deepEqual(api.samePersonCalls, [{ source_id: 'rel-3', target_id: 'rel-1' }]);
  assert.equal(told.length, 1);
  assert.equal(told[0].said, 'Now one person. 5 things moved to Marcus Webb.');
  assert.equal(told[0].undo?.label, 'Undo');
  assert.deepEqual(ran, ['after']);
  told[0].undo!.run();
  await settle();
  assert.deepEqual(api.undoCalls, ['mv-1']);
  assert.deepEqual(told.slice(1), [{ said: 'Put back as it was.', undo: null }]);
  assert.deepEqual(ran, ['after', 'undone']);
});

test('no way back sent: no Undo; no sentence sent: "Same person"; it or its undo not going through: "That did not go through. Try again."', async () => {
  const api = new MockApi();
  api.samePersonReply = { success: true, moved: 2, said: '  ' };
  const a = deps(api);
  await samePerson(a.d, 'rel-3', 'rel-1');
  assert.deepEqual(a.told, [{ said: 'Same person', undo: null }]);

  const refused = new MockApi();
  refused.samePersonReply = { success: false, error: 'not_found' };
  const b = deps(refused);
  assert.equal(await samePerson(b.d, 'rel-3', 'rel-1'), false);
  assert.deepEqual(b.told, [{ said: 'That did not go through. Try again.', undo: null, failed: true }]);
  assert.deepEqual(b.ran, [], 'nothing in the vault changes');

  const offline = new MockApi();
  offline.state.offline = true;
  const c = deps(offline);
  assert.equal(await samePerson(c.d, 'rel-3', 'rel-1'), false);
  assert.equal(c.told[0].said, 'That did not go through. Try again.');

  const undoFails = new MockApi();
  undoFails.undoReply = { success: false, error: 'gone' };
  const e = deps(undoFails);
  assert.equal(await undoPersonMove(e.d, 'mv-1'), false);
  assert.deepEqual(e.told, [{ said: 'That did not go through. Try again.', undo: null, failed: true }]);
  assert.deepEqual(e.ran, []);
});

test('Undo’s outcome in shared’s words: put back; already put back (409 already_undone); changed since (409 changed_since)', async () => {
  for (const [refusal, words, went] of [
    [null, 'Put back as it was.', true],
    ['already_undone', 'That was already put back.', false],
    ['changed_since', 'That has changed since, so nothing was put back.', false],
  ] as const) {
    const api = new MockApi();
    api.undoRefusal = refusal;
    const { d, told, ran } = deps(api);
    assert.equal(await undoPersonMove(d, 'mv-1'), went, String(refusal));
    assert.deepEqual(api.undoCalls, ['mv-1']);
    assert.deepEqual(told, [{ said: words, undo: null, ...(went ? {} : { failed: true as const }) }], String(refusal));
    assert.deepEqual(ran, went ? ['undone'] : [], 'only a real undo reads the vault and Today again');
  }
});

// ── the Help Myu row ────────────────────────────────────────

test('the Help Myu row: "Are A and B the same person?" with "Same person" (straight to the door) and "Not the same" as before', async () => {
  const item: HelpMyuItem = { item_type: 'merge_candidate', source: { relationship_id: 'rel-3', display_name: 'Marcus W.' }, target: { relationship_id: 'rel-1', display_name: 'Marcus Webb', subtitle: 'VP Eng @ Acme' }, reason: 'same email domain and first name' };
  const asked: Array<[string, string]> = [];
  const rejected: Array<[string, string]> = [];
  const plugin = {
    unlock: { current: 'unlocked' },
    helpQueue: [item],
    loadHelpQueue: async () => undefined,
    samePersonFromHelp: async (s: { id: string }, t: { id: string }) => { asked.push([s.id, t.id]); return true; },
    backend: { rejectMerge: async (s: string, t: string) => { rejected.push([s, t]); return { ok: true, status: 200, data: { success: true } }; } },
  };
  const view = new HelpMyuView({} as never, plugin as never);
  view.render();
  const root = (view as unknown as { contentEl: FakeEl }).contentEl;
  assert.ok(root.visibleTexts().includes('Are Marcus W. and Marcus Webb the same person?'));
  const buttons = root.querySelectorAll('button').map((b) => b.text).filter(Boolean);
  assert.deepEqual(buttons, ['Same person', 'Not the same']);
  assert.ok(await root.click('Same person'));
  assert.deepEqual(asked, [['rel-3', 'rel-1']]);
  view.render();
  assert.ok(await root.click('Not the same'));
  assert.deepEqual(rejected, [['rel-3', 'rel-1']], '"Not the same" keeps its own door');
});
