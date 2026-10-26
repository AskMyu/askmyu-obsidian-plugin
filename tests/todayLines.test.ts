/**
 * Today's "for you" — one row per person, company or space, one line per row, the rest
 * behind a count. The backend writes many lines per subject; a row per line buried the pane.
 *
 * Runs in the unit-test entry, where `obsidian` THROWS: nothing here may touch the host.
 */

import { strict as assert } from 'node:assert';
import test from 'node:test';

import type { MyuLineLite } from '../src/transport/api';
import { FOR_YOU_ROWS, dedupeLines, foldRows, groupBySubject, stackOf, topLine } from '../src/todayLines';

let n = 0;
function line(about: { type?: string; id?: string; label?: string } | null, text: string, more: Partial<MyuLineLite> = {}): MyuLineLite {
  return { line_id: `l${++n}`, subjects: about ? [about] : [], text, ask_kind: 'open', state: 'released', ...more };
}
const dana = { type: 'person', id: 'p1', label: 'Dana Okafor' };
const team = { type: 'space', id: 's1', label: 'Door team' };

test('sixty lines about one person are ONE row', () => {
  const lines = Array.from({ length: 60 }, (_, i) => line(dana, `Commitment ${i} is late.`));
  const groups = groupBySubject(lines);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, 'Dana Okafor');
  assert.equal(groups[0].lines.length, 60);
  const stack = stackOf(groups[0].lines);
  assert.equal(stack.top?.text, 'Commitment 0 is late.');
  assert.equal(stack.count, '59 more');
  assert.equal(stack.rest.length, 59);
});

test('groups keep the order the backend sent, and a space is its own row', () => {
  const groups = groupBySubject([line(team, 'The retro opens Sunday.'), line(dana, 'You owe Dana a reply.'), line(team, 'Two questions are up.')]);
  assert.deepEqual(groups.map((g) => g.key), ['space:s1', 'person:p1']);
  assert.equal(groups[0].type, 'space');
  assert.equal(groups[0].lines.length, 2);
});

test('the conversation says what a line is about before its subject does', () => {
  const l = line({ type: 'person', id: 'p9', label: 'Someone else' }, 'About the space.', { conversation: { subject_type: 'space', subject_id: 's1' } });
  assert.equal(groupBySubject([l])[0].key, 'space:s1');
});

test('the first line that speaks, in the server\'s order, is the row\'s (R19c: time-bound first), never a waiting line', () => {
  const lines = [
    line(dana, 'Saved for later.', { ask_kind: 'wait' }),
    line(dana, 'You said you would send Dana the pricing sheet.', { ask_kind: 'choice', needs_you: false }),
    line(dana, 'Is Dana still on the pricing work?', { ask_kind: 'yes_no', needs_you: true }),
  ];
  assert.equal(topLine(lines)?.text, 'You said you would send Dana the pricing sheet.', 'the server put it first; a dot does not jump the order');
  const stack = stackOf(lines);
  assert.equal(stack.top?.text, 'You said you would send Dana the pricing sheet.');
  assert.equal(stack.count, '1 more · 1 saved for tomorrow');
  assert.deepEqual(stack.rest.map((l) => l.ask_kind), ['yes_no', 'wait'], 'lines that speak first, waits last');
});

test('a row where everything is waiting shows only the count', () => {
  const stack = stackOf([line(dana, 'One.', { ask_kind: 'wait' }), line(dana, 'Two.', { ask_kind: 'wait' })]);
  assert.equal(stack.top, null);
  assert.equal(stack.count, '2 saved for tomorrow');
  assert.equal(stack.rest.length, 2);
});

test('one line has no count', () => {
  const stack = stackOf([line(dana, 'You owe Dana a reply.')]);
  assert.equal(stack.top?.text, 'You owe Dana a reply.');
  assert.equal(stack.count, null);
});

test('the same words twice show once, and a line with no words is dropped', () => {
  const lines = [line(dana, 'You owe Dana a reply.'), line(dana, 'You owe Dana a reply.'), line(dana, '   ')];
  assert.equal(dedupeLines(lines).length, 1);
  assert.equal(stackOf(lines).count, null);
});

test('needs_you only counts on a released line; a server that sends no state counts as released', () => {
  const held = groupBySubject([line(dana, 'Held.', { needs_you: true, state: 'held' })]);
  assert.equal(held[0].needsYou, false);
  const old = groupBySubject([line(dana, 'Old server.', { needs_you: true, state: undefined })]);
  assert.equal(old[0].needsYou, true);
});

test('lines about nothing that can be opened share one quiet row at the end', () => {
  const groups = groupBySubject([line(null, 'Your week is lighter than last week.'), line(dana, 'You owe Dana a reply.'), line(null, 'Three notes captured.')]);
  assert.deepEqual(groups.map((g) => g.key), ['person:p1', 'other']);
  assert.equal(groups[1].lines.length, 2);
  assert.equal(groups[1].id, '', 'no door on a row that opens nothing');
});

test('a subject with no name still gets plain words', () => {
  const groups = groupBySubject([line({ type: 'space', id: 's2' }, 'x'), line({ type: 'company', id: 'c1' }, 'y'), line({ type: 'person', id: 'p2' }, 'z')]);
  assert.deepEqual(groups.map((g) => g.label), ['A space', 'A company', 'Someone']);
});

test('twenty people: the first few rows show, the rest fold', () => {
  const groups = groupBySubject(Array.from({ length: 20 }, (_, i) => line({ type: 'person', id: `p${i}`, label: `Person ${i}` }, 'x')));
  const { shown, folded } = foldRows(groups);
  assert.equal(shown.length, FOR_YOU_ROWS);
  assert.equal(folded.length, 20 - FOR_YOU_ROWS);
  assert.equal(shown[0].label, 'Person 0');
});

test('a row that needs you comes first and is never folded', () => {
  const lines = Array.from({ length: 12 }, (_, i) => line({ type: 'person', id: `p${i}`, label: `Person ${i}` }, 'x', { needs_you: i >= 4 && i < 11 }));
  const { shown, folded } = foldRows(groupBySubject(lines));
  assert.equal(shown.length, 7, 'seven need you: all seven show, past the usual limit');
  assert.ok(shown.every((g) => g.needsYou));
  assert.ok(folded.every((g) => !g.needsYou));
  assert.equal(shown[0].label, 'Person 4');
});

test('few rows: nothing folds', () => {
  const { shown, folded } = foldRows(groupBySubject([line(dana, 'x'), line(team, 'y')]));
  assert.equal(shown.length, 2);
  assert.equal(folded.length, 0);
});

test('the same words about two different people are two rows', () => {
  const groups = groupBySubject([line(dana, 'You owe them a reply.'), line({ type: 'person', id: 'p2', label: 'Sam Reyes' }, 'You owe them a reply.')]);
  assert.deepEqual(groups.map((g) => g.label), ['Dana Okafor', 'Sam Reyes']);
});

// ── the same lines, as the vault's Today note writes them ────────────────────

import { buildTodayLinesSection } from '../src/vault/myuFiles';

test('the Today note: one item per subject, with its name, the line that speaks, a count and a talk link', () => {
  const lines = [
    ...Array.from({ length: 30 }, (_, i) => line(dana, `Commitment ${i} is late.`)),
    line(dana, 'Is Dana still on the pricing work?', { ask_kind: 'yes_no', needs_you: true }),
    line(dana, 'Saved.', { ask_kind: 'wait' }),
    line(team, 'Share what you want to bring up until Sunday.'),
  ];
  const { title, items } = buildTodayLinesSection(lines);
  assert.equal(title, 'What needs your attention today');
  assert.equal(items.length, 2, 'thirty-two lines, two subjects, two items');
  // The server's order decides the line that speaks (R19c: a person's time-bound lines first).
  assert.equal(items[0], '● [[Dana Okafor]] — *Commitment 0 is late.* (and 30 more) — [talk ▸](obsidian://myu-chat?about=person%3Ap1)');
  assert.equal(items[1], '**Door team** — *Share what you want to bring up until Sunday.* — [talk ▸](obsidian://myu-chat?about=space%3As1)');
});

test('the Today note: what needs you comes first; a subject with only waiting lines is left out; a nameless person is not a link', () => {
  const { items } = buildTodayLinesSection([
    line(team, 'The questions are open until Sunday.'),
    line({ type: 'person', id: 'p7' }, 'You owe them a reply.', { needs_you: true }),
    line({ type: 'person', id: 'p8', label: 'Sam Reyes' }, 'Saved.', { ask_kind: 'wait' }),
    line(null, 'Three notes were captured this morning.', { ask_kind: 'tell' }),
  ]);
  assert.equal(items.length, 3);
  assert.match(items[0], /^● \*\*Someone\*\* — \*You owe them a reply\.\*/);
  assert.match(items[1], /^\*\*Door team\*\*/);
  assert.equal(items[2], '*Three notes were captured this morning.*');
});

// ── a drafted interview debrief (2026-10-06): a choice line the server sends about nothing with a name ───────────

import { ROLE_SUBJECT, isDraftLine, rowOpensConversation } from '../src/todayLines';

const DRAFT_WORDS = "An interview for Backend engineer is on your calendar: Sam Okafor, Thu 9 Oct at 2pm. I've drafted Sam's interview debrief, with Jo and Ana on the panel. Send the invites?";
const SECOND_DRAFT = "An interview for Backend engineer is on Jo's calendar: Lee Park, Fri 10 Oct at 10am. I've drafted Lee's interview debrief, with Ana on the panel. Send the invites?";
const draft = (about: { type?: string; id?: string; label?: string } | null, more: Partial<MyuLineLite> = {}): MyuLineLite =>
  line(about, DRAFT_WORDS, {
    ask_kind: 'choice',
    needs_you: true,
    choices: [{ id: 'send', label: 'Send invites' }, { id: 'not_interview', label: 'Not an interview' }, { id: 'not_this', label: 'Not this one' }],
    // As the server sends it: no subject, and a conversation that names none.
    conversation: {},
    ...more,
  });

test('a drafted interview debrief is known by its own choice, never by a label', () => {
  assert.equal(isDraftLine(draft(null)), true);
  assert.equal(isDraftLine(draft(null, { choices: [{ id: 'send_now', label: 'Open now' }, { id: 'not_interview', label: 'This is something else' }, { id: 'not_this', label: 'Skip it' }] })), true);
  assert.equal(isDraftLine(line(dana, 'Is this an interview?', { ask_kind: 'choice', choices: [{ id: 'yes', label: 'Not an interview' }] })), false);
  assert.equal(isDraftLine(line(dana, 'You owe Dana a reply.')), false);
});

test('a drafted interview debrief with no subject is a row of its own, first as it needs you, never behind another line\'s count', () => {
  const groups = groupBySubject([
    line(null, 'Three notes were captured this morning.', { ask_kind: 'tell' }),
    line(dana, 'You owe Dana a reply.'),
    draft(null),
    draft(null, { text: SECOND_DRAFT }),
    line(null, 'Your week is written.', { ask_kind: 'tell' }),
  ]);
  const drafts = groups.filter((g) => g.type === ROLE_SUBJECT);
  assert.equal(drafts.length, 2, 'one row per draft: each is its own decision');
  assert.ok(drafts.every((g) => g.key.startsWith('draft:') && g.label === 'Interview debrief' && g.needsYou && g.lines.length === 1));
  assert.deepEqual(drafts.map((g) => stackOf(g.lines)).map((st) => [st.top?.text, st.count]), [[DRAFT_WORDS, null], [SECOND_DRAFT, null]]);
  assert.deepEqual(groups.map((g) => g.key.replace(/:l\d+$/, '')), ['person:p1', 'draft', 'draft', 'other']);
  assert.equal(groups[3].lines.length, 2, 'the other lines about nothing with a name still share the quiet row');
  assert.deepEqual(foldRows(groups).shown.slice(0, 2).map((g) => g.type), [ROLE_SUBJECT, ROLE_SUBJECT]);
  assert.ok(drafts.every((g) => !rowOpensConversation(g)), 'the line is the draft: it is answered on the row');
  assert.equal(rowOpensConversation(groups[0]), true);
  assert.equal(rowOpensConversation(groups[3]), false);
});

test('a drafted interview debrief the server names a role for is titled by the role, one row per draft all the same', () => {
  const role = { type: 'debrief_role', id: 'role-1', label: 'Backend engineer' };
  const groups = groupBySubject([draft(role, { conversation: { subject_type: 'debrief_role', subject_id: 'role-1' } }), draft(role, { text: SECOND_DRAFT }), draft({ type: 'debrief_role', id: 'role-2' })]);
  assert.deepEqual(groups.map((g) => [g.type, g.id, g.label, g.lines.length]), [[ROLE_SUBJECT, 'role-1', 'Backend engineer', 1], [ROLE_SUBJECT, 'role-1', 'Backend engineer', 1], [ROLE_SUBJECT, 'role-2', 'Interview debrief', 1]]);
  assert.ok(groups.every((g) => !rowOpensConversation(g)));
  // A line that only looks like one, about a person: that person's row, as any line.
  const person = groupBySubject([draft(dana, { conversation: undefined })]);
  assert.deepEqual(person.map((g) => g.key), ['person:p1']);
});

test('the Today note: a drafted interview debrief is an item with its words and no talk link, named when the server names its role', () => {
  const { items } = buildTodayLinesSection([line(dana, 'You owe Dana a reply.'), draft(null), draft({ type: 'debrief_role', id: 'role-1', label: 'Backend engineer' }, { text: SECOND_DRAFT })]);
  assert.deepEqual(items.slice(0, 2), [`● *${DRAFT_WORDS}*`, `● **Backend engineer** — *${SECOND_DRAFT}*`]);
  assert.match(items[2], /^\[\[Dana Okafor\]\] — \*You owe Dana a reply\.\* — \[talk ▸\]\(obsidian:\/\/myu-chat\?about=person%3Ap1\)$/);
});
