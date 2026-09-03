/**
 * Acceptance tests for the QA invariants that can be executed in-process.
 *
 * The handoff's definition of done says every invariant must *demonstrably*
 * hold. The structural ones (no vault writes outside one module, no `Notice`
 * on initiative paths, no raw key at rest) are proved by `verify-invariants.mjs`
 * against the source tree; the behavioural ones are proved here.
 *
 * Run: pnpm test — esbuild bundles this to CJS (stubbing `obsidian`, which only
 * exists inside the host app) and hands it to node's own test runner. No test
 * framework, no new dependencies.
 */

import { strict as assert } from 'node:assert';
import test from 'node:test';

import { assertEncrypted, PlaintextRefusedError, type EncryptedJournalPayload } from '../src/transport/assertEncrypted';
import { extractEntityHints } from '../src/capture/wikilinks';
import { stripFrontmatter } from '../src/capture/noteMeta';
import { generatePhrase, validatePhrase } from '../src/crypto/recovery';
import { sectionBlocks } from '../src/views/cardSections';
import { replaceSection, isoWeek, isWeeklyEditionFresh, editionToLines } from '../src/vault/WeeklyReviewWriter';
import { buildCanvas, chartToSvg } from '../src/vault/CanvasExporter';
import { parseChatTurn } from '../src/transport/api';
import { renderConversation } from '../src/vault/ConversationWriter';
import { buildPeopleBase, buildPersonMarkdown, buildTodayMarkdown, commitmentLine, parseCheckboxes } from '../src/vault/myuFiles';

const validEnvelope = 'a'.repeat(64);

function payload(overrides: Partial<EncryptedJournalPayload> = {}): EncryptedJournalPayload {
  return {
    encrypted_content: validEnvelope,
    encryption_version: 1,
    source_type: 'obsidian',
    external_id: 'vault:Daily/2026-08-10.md',
    occurred_at: 1754870400000,
    no_response: true,
    ...overrides,
  };
}

// ── invariant 1: nothing leaves unencrypted ─────────────────────────────────

test('invariant 1 — a well-formed encrypted payload passes', () => {
  assert.doesNotThrow(() => assertEncrypted(payload()));
});

test('invariant 1 — a payload carrying plaintext is refused', () => {
  for (const field of ['content', 'text', 'body']) {
    assert.throws(
      () => assertEncrypted(payload({ [field]: 'dear diary' } as Partial<EncryptedJournalPayload>)),
      PlaintextRefusedError,
      `expected a payload with a \`${field}\` field to be refused`,
    );
  }
});

test('invariant 1 — missing or empty ciphertext is refused', () => {
  assert.throws(() => assertEncrypted(payload({ encrypted_content: '' })), PlaintextRefusedError);
  assert.throws(
    () => assertEncrypted(payload({ encrypted_content: undefined as unknown as string })),
    PlaintextRefusedError,
  );
});

test('invariant 1 — base64 of plaintext is refused (the plausible mistake)', () => {
  // Someone "encrypts" by base64-encoding. Short and decodable — not an envelope.
  const notCiphertext = Buffer.from('had a hard conversation with Marcus').toString('base64');
  assert.throws(() => assertEncrypted(payload({ encrypted_content: notCiphertext })), PlaintextRefusedError);
});

test('invariant 1 — an unversioned payload is refused', () => {
  assert.throws(() => assertEncrypted(payload({ encryption_version: 0 })), PlaintextRefusedError);
});

// ── B2: wikilink entity hints ───────────────────────────────────────────────

test('wikilinks — plain, aliased, heading and path forms all yield the target name', () => {
  const hints = extractEntityHints(
    'Spoke to [[Marcus Webb]] and [[Priya Raman|Priya]] about [[People/Tom Alvarez#Context]].',
  );
  assert.deepEqual(hints, ['Marcus Webb', 'Priya Raman', 'Tom Alvarez']);
});

test('wikilinks — embeds are not mentions', () => {
  // A daily-note template that embeds a dashboard would otherwise tag it daily.
  assert.deepEqual(extractEntityHints('![[Daily Dashboard]]\n\nTalked with [[Marcus Webb]].'), ['Marcus Webb']);
});

test('wikilinks — links inside code are examples, not people', () => {
  assert.deepEqual(extractEntityHints('Use `[[Some Note]]` to link.\n\n```\n[[Another]]\n```\nSaw [[Real Person]].'), [
    'Real Person',
  ]);
});

test('wikilinks — duplicates collapse but the user\'s casing survives', () => {
  assert.deepEqual(extractEntityHints('[[Marcus Webb]] … [[marcus webb]] again'), ['Marcus Webb']);
});

// ── invariant 6: the note's own time, and no-op captures ────────────────────

test('frontmatter is stripped before hashing and sending', () => {
  const note = '---\nmyu: true\nmodified: 2026-08-10T09:00\n---\n\nThe actual writing.';
  assert.equal(stripFrontmatter(note), 'The actual writing.');
});

test('a note without frontmatter is untouched', () => {
  assert.equal(stripFrontmatter('Just writing.'), 'Just writing.');
});

// ── invariant 3: the single vault write is bounded and idempotent ───────────

test('invariant 3 — re-running the weekly review replaces its own section', () => {
  const note = '# Week 33\n\nMy own notes.\n\n<!-- askmyu:begin -->\nold\n<!-- askmyu:end -->\n\nMore of mine.\n';
  const next = replaceSection(note, '<!-- askmyu:begin -->\nnew\n<!-- askmyu:end -->');

  assert.ok(next.includes('new'), 'the new section should be present');
  assert.ok(!next.includes('old'), 'the previous section should be gone');
  assert.ok(next.includes('My own notes.'), "the user's text above must survive");
  assert.ok(next.includes('More of mine.'), "the user's text below must survive");
  assert.equal(next.match(/askmyu:begin/g)?.length, 1, 'exactly one section, never a pile');
});

test('invariant 3 — a note with no section gets one appended, nothing lost', () => {
  const note = '# Week 33\n\nMy own notes.\n';
  const next = replaceSection(note, '<!-- askmyu:begin -->\nfresh\n<!-- askmyu:end -->');

  assert.ok(next.startsWith('# Week 33'), 'the note keeps its head');
  assert.ok(next.includes('My own notes.'));
  assert.ok(next.includes('fresh'));
});

test('invariant 3 — a damaged marker pair appends rather than guessing', () => {
  // Someone deleted our closing marker while editing. Eating from the opening
  // marker to EOF would take their writing with it.
  const note = 'Mine.\n\n<!-- askmyu:begin -->\nhalf a section\n\nAnd more of mine.\n';
  const next = replaceSection(note, '<!-- askmyu:begin -->\nfresh\n<!-- askmyu:end -->');

  assert.ok(next.includes('And more of mine.'), 'user text after a broken marker must survive');
  assert.ok(next.includes('fresh'));
});

// ── P4.3: the weekly edition's freshness rule + materialization ─────────────

test('weekly — only the current or prior ISO week renders', () => {
  const now = new Date();
  const edition = (period: string) => ({ period, sections: [{ section: 's', line: 'l' }] });
  assert.equal(isWeeklyEditionFresh(edition(isoWeek(now)), now), true);
  assert.equal(isWeeklyEditionFresh(edition(isoWeek(new Date(now.getTime() - 7 * 86400000))), now), true);
  assert.equal(
    isWeeklyEditionFresh(edition(isoWeek(new Date(now.getTime() - 21 * 86400000))), now),
    false,
    'a three-week-old edition must render nothing',
  );
  assert.equal(isWeeklyEditionFresh({ period: isoWeek(now), sections: [] }, now), false, 'empty edition = nothing');
});

test('weekly — sections materialize with items indented under their line', () => {
  const lines = editionToLines({
    period: '2026-W34',
    sections: [
      { section: 'movement', line: 'Two moved.', items: ['Marcus — steadier'] },
      { section: 'held', line: 'One held.' },
    ],
  });
  assert.deepEqual(lines, ['Two moved.', '  - Marcus — steadier', 'One held.']);
});

test('weekly — ISO week crosses the year boundary correctly', () => {
  // Jan 1 2027 is a Friday — ISO week 53 of 2026.
  assert.equal(isoWeek(new Date(2027, 0, 1)), '2026-W53');
  assert.equal(isoWeek(new Date(2026, 0, 1)), '2026-W01');
});

// ── P5.5: the canvas builder's properties ───────────────────────────────────

test('canvas — deterministic layout, groups wrap their children, unknowns render in place', () => {
  const spec = {
    id: 'comp-1',
    summary_text: 'Team read',
    components: [
      { id: 't1', type: 'text_block', data: { text: 'A read.' } },
      { id: 'p1', type: 'person_card', label: 'Marcus Webb', data: { name: 'Marcus Webb' } },
      { id: 'p2', type: 'person_card', label: 'Unknown Person', data: { name: 'Unknown Person' } },
      { id: 'x1', type: 'exotic_widget', label: 'Trust arc', data: { standing: 'holding', last_moved: '2026-08-02' } },
      { id: 'x2', type: 'exotic_widget', label: 'Nothing here', data: {} },
      { id: 'g1', type: 'container', label: 'pair', data: { child_ids: ['p1', 'p2'] } },
    ],
  };
  const resolve = (name: string) => (name === 'Marcus Webb' ? 'People/Marcus Webb.md' : null);

  const a = buildCanvas(spec, resolve, 'https://x/dashboard');
  const b = buildCanvas(spec, resolve, 'https://x/dashboard');
  assert.deepEqual(a, b, 'same spec must build the identical canvas');

  const byId = new Map(a.canvas.nodes.map((n) => [n.id, n]));
  assert.equal(byId.get('p1')?.type, 'file', 'a resolvable person becomes their own page');
  assert.equal(byId.get('p1')?.file, 'People/Marcus Webb.md');
  assert.equal(byId.get('p2')?.type, 'text', 'an unresolvable person degrades to text');
  // An unrecognised component renders its OWN DATA in the canvas, rather than
  // becoming a link out to the browser. Browser exits are the north-star
  // metric; a node that says "go to the web" is one baked into the vault.
  assert.equal(byId.get('x1')?.type, 'text', 'an unknown component renders in place');
  assert.match(String(byId.get('x1')?.text), /holding/, 'its data is actually there to read');
  assert.match(String(byId.get('x1')?.text), /2026-08-02/);
  assert.equal(byId.get('x2')?.type, 'text', 'even an empty one stays in the vault');
  assert.match(String(byId.get('x2')?.text), /Nothing here/, 'and is named');
  assert.ok(
    !a.canvas.nodes.some((n) => n.type === 'link'),
    'no node sends the reader to the browser',
  );

  const group = a.canvas.nodes.find((n) => n.type === 'group');
  assert.ok(group, 'the container becomes a group');
  for (const id of ['p1', 'p2']) {
    const child = byId.get(id);
    assert.ok(child, `${id} placed`);
    if (!child || !group) continue;
    assert.ok(
      child.x >= group.x && child.y >= group.y &&
        child.x + child.width <= group.x + group.width &&
        child.y + child.height <= group.y + group.height,
      `${id} sits inside its group's box`,
    );
  }

  assert.deepEqual(a.linkedPages, ['People/Marcus Webb.md']);
});

// ── P6: the chat contract's normalisation + the conversation render ─────────

test('chat — content arrives as a JSON string of {content: blocks[]}', () => {
  const blocks = [{ type: 'conversational', text: 'hello' }];
  assert.deepEqual(parseChatTurn({ journal_id: 'j1', content: JSON.stringify({ context_cards: [], content: blocks }) }), {
    journal_id: 'j1',
    blocks,
  });
});

test('chat — dual-mode nests under journal; plain text degrades to one block', () => {
  const nested = parseChatTurn({ journal: { journal_id: 'j2', content: JSON.stringify({ content: [{ type: 'conversational', text: 'x' }] }) } });
  assert.equal(nested.journal_id, 'j2');
  assert.equal(nested.blocks.length, 1);

  const plain = parseChatTurn({ journal_id: 'j3', content: 'just words' });
  assert.deepEqual(plain.blocks, [{ type: 'conversational', text: 'just words' }]);
});

test('conversation render — speakers labeled, offers flattened honestly', () => {
  const text = renderConversation([
    { role: 'user', text: 'How is the team?' },
    {
      role: 'myu',
      blocks: [
        { type: 'conversational', text: 'Steadier.' },
        { type: 'composition_offer', composition_id: 'c1', summary_text: 'Team read' },
      ],
    },
  ]);
  assert.ok(text?.includes('**You:** How is the team?'));
  assert.ok(text?.includes('**Myu:** Steadier.'));
  assert.ok(text?.includes('Myu offered a canvas: \u201cTeam read\u201d'), 'an offer is recorded as an offer, not silently dropped');
});

// ── P8: the shared surface ────────────────────

test('P8 — commitment line round-trips through the checkbox parser', () => {
  const line = commitmentLine(
    {
      commitment_id: 'com-42',
      content: 'Send the platform deck',
      owner: 'Priya Raman',
      deadline: '2026-08-22',
      status: 'open',
      meeting_title: 'Platform sync',
    },
    false,
  );
  assert.ok(line.startsWith('- [ ] [[Priya Raman]]'), 'a Tasks-format checkbox with a wikilinked owner');
  assert.ok(line.includes('📅 2026-08-22'), 'the due date rides in Tasks emoji format');
  assert.ok(line.includes('%%myu-id:com-42%%'), 'the join key is present and invisible in reading view');

  const parsed = parseCheckboxes(`# Commitments\n\n${line}\n- [x] done thing %%myu-id:com-7%%\n- [ ] a plain task with no id\n`);
  assert.equal(parsed.length, 2, 'only myu-id lines are ours; a plain task is not shipped');
  assert.deepEqual(
    parsed.map((p) => [p.myuId, p.checked]),
    [['com-42', false], ['com-7', true]],
  );
});

test('P8 — a ticked render survives the round trip', () => {
  const ticked = commitmentLine({ commitment_id: 'com-9', content: 'x', status: 'open' }, true);
  const [parsed] = parseCheckboxes(ticked);
  assert.equal(parsed.checked, true);
});

test('P8 — person file: frontmatter is the Bases contract, verdicts stay in the body', () => {
  const md = buildPersonMarkdown(
    {
      entity_type: 'person',
      entity_id: 'rel-2',
      display_name: 'Priya Raman',
      organization: 'Northwind',
      subtitle: 'VP Engineering',
      item_count: 1,
      top_urgency: 'low',
      last_contact: '2026-08-12 14:03:00',
    },
    { sections: [{ title: 'Key points', items: [{ text: 'Owns the platform migration', date: '2026-08-12' }] }] },
    [{ commitment_id: 'com-1', content: 'Send the deck', status: 'open' }],
    () => false,
    'Priya Raman',
  );
  assert.ok(md.startsWith('---\n'), 'frontmatter first');
  assert.ok(md.includes('type: myu-person'));
  assert.ok(md.includes('myu-id: rel-2'));
  assert.ok(md.includes('myu-generated: true'), 'the purge handle');
  assert.ok(md.includes('open_commitments: 1'));
  assert.ok(md.includes('last_interaction: 2026-08-12'), 'date only — no churn from time-of-day');
  assert.ok(md.includes('Their page: [[Priya Raman]]'), 'backlink into THEIR page, never a write into it');
  assert.ok(md.includes('Owns the platform migration'), 'card text verbatim');
  assert.ok(md.includes('%%myu-id:com-1%%'), 'the commitment renders as a tickable line');
});

test('P8 — empty today is named, not blank', () => {
  const md = buildTodayMarkdown('2026-08-19', [{ title: 'noticing', items: [] }]);
  assert.ok(md.includes('Nothing needs you yet today.'));
});

test('P8 — the starter Base: canonical schema, formula column, two views', () => {
  const base = buildPeopleBase('Myu/People');
  assert.ok(base.includes('file.inFolder("Myu/People")'));
  assert.ok(base.includes("'type == \"myu-person\"'"), 'scoped to Myu person files, not everything in the folder');
  assert.ok(base.includes('formula.threads'), 'the computed open-threads column is wired into views');
  assert.ok(base.includes('type: table') && base.includes('type: cards'), 'table + gallery views');
  assert.ok(base.includes('displayName: Open commitments'), 'register-controlled column names');
  assert.ok(base.includes('formula.days_quiet') && base.includes('date(last_interaction)'), 'days-quiet rides the frontmatter date');
});

test('chart snapshot — renders bar data deterministically, refuses what it cannot draw', () => {
  const svg = chartToSvg(
    'Interactions per week',
    { type: 'bar', data: [{ w: 'W31', n: 3 }, { w: 'W32', n: 5 }, { w: 'W33', n: 2 }], x_key: 'w', y_key: 'n' },
    '2026-08-20',
  );
  assert.ok(svg, 'bar data renders');
  assert.ok(svg!.includes('snapshot · 2026-08-20'), 'labeled a snapshot IN the image');
  assert.ok((svg!.match(/<rect/g) ?? []).length === 3, 'one bar per row');
  assert.equal(svg, chartToSvg('Interactions per week', { type: 'bar', data: [{ w: 'W31', n: 3 }, { w: 'W32', n: 5 }, { w: 'W33', n: 2 }], x_key: 'w', y_key: 'n' }, '2026-08-20'), 'deterministic');

  assert.equal(chartToSvg('Pie', { type: 'pie', data: [{ k: 'a', v: 1 }], x_key: 'k', y_key: 'v' }, '2026-08-20'), null, 'pie declines');
  assert.equal(chartToSvg('Bad', { type: 'line', data: [{ v: 'not-a-number' }], y_key: 'v' }, '2026-08-20'), null, 'non-numeric declines');
  assert.equal(chartToSvg('X', undefined, '2026-08-20'), null, 'missing config declines');
});

test('recovery — generated phrase validates with the same machinery that consumes it', () => {
  const phrase = generatePhrase();
  assert.equal(phrase.split(' ').length, 12);
  assert.ok(validatePhrase(phrase), 'round-trips through the shared BIP-39 validation');
});

// ── card-section coverage: what the pane shows is a TESTED property ─────────

test('card sections — visual shapes degrade to honest rows instead of dropping', () => {
  const weather = sectionBlocks({
    section_type: 'weather',
    dimensions: [
      { name: 'trust', intensity: 'filled', evidence: 'Consistent follow-through on commitments' },
      { name: 'tension', intensity: 'partial' },
    ],
  });
  assert.equal(weather.length, 2, 'every dimension becomes a row');
  assert.equal(weather[0].meta, 'trust · filled');
  assert.ok(weather[0].text.includes('follow-through'), 'evidence text carries the row');
  assert.equal(weather[1].text, 'tension', 'no evidence → the dimension name still shows');

  const energy = sectionBlocks({
    section_type: 'energy_map',
    entries: [{ display_name: 'Priya Raman', mention_count: 7, overall_trend: 'sustaining' }],
  });
  assert.equal(energy.length, 1);
  assert.equal(energy[0].meta, '×7 · sustaining');

  const timeline = sectionBlocks({
    section_type: 'timeline',
    events: [{ description: 'Relationship warmed after the platform launch', date: '2026-06-02' }],
  });
  assert.equal(timeline.length, 1);
  assert.equal(timeline[0].meta, '2026-06-02');

  const orgLens = sectionBlocks({
    section_type: 'org_lens',
    voiced_narrative: { info: 'Decisions here route through James before they reach the room.' },
  });
  assert.equal(orgLens.length, 1);
  assert.equal(orgLens[0].kind, 'narrative');
});

test('card sections — an unrenderable section yields ZERO blocks (the disclosure trigger)', () => {
  // A section carrying only shapes we have no probe for must come back empty —
  // that emptiness is what CardView counts into the "N sections don't render
  // here yet" row. If this assertion ever needs weakening, the disclosure has
  // silently widened; treat that as a finding, not a test fix.
  const mystery = sectionBlocks({ section_type: 'holograph', holograph_field: { spin: 3 } });
  assert.equal(mystery.length, 0);

  // And a plain narrative section still renders — the floor never eats the基本.
  const plain = sectionBlocks({ section_type: 'narrative', narrative: 'Steady quarter with them.' });
  assert.equal(plain.length, 1);
});

// ── data.json forward/backward compatibility ─────────────────────────────────
// BRAT users upgrade (and sometimes downgrade) constantly; data.json is also
// hand-editable. Loading must never brick custody or crash on structure.

test('normalizeSettings: an OLD data.json — missing new fields — falls to defaults, custody intact', async () => {
  const { normalizeSettings, DEFAULT_SETTINGS } = await import('../src/settings');
  const old = {
    token: 'plg_abc123',
    device_id: 'dev-1',
    wrapped_mdek: 'AAAA',
    base_url: 'http://localhost/api',
    // no vault_event_queue, no myu_checkbox_state, none of the P8 fields
  };
  const s = normalizeSettings(old);
  assert.equal(s.token, 'plg_abc123', 'custody scalar survives');
  assert.equal(s.wrapped_mdek, 'AAAA', 'the local half of split custody survives');
  assert.deepEqual(s.vault_event_queue, [], 'new array field lands as its default');
  assert.deepEqual(s.myu_checkbox_state, {}, 'new record field lands as its default');
  assert.equal(s.materialize_folder, DEFAULT_SETTINGS.materialize_folder);
});

test('normalizeSettings: a corrupted/mistyped data.json is repaired, never a crash at first .push', async () => {
  const { normalizeSettings } = await import('../src/settings');
  const corrupt = {
    token: 'plg_abc123',
    vault_event_queue: null,          // hand-edited to null
    myu_checkbox_state: 'oops',       // wrong type
    capture_hashes: [],               // array where a record belongs
    quiescence_seconds: 90,
  };
  const s = normalizeSettings(corrupt as unknown);
  assert.ok(Array.isArray(s.vault_event_queue), 'null array repaired');
  assert.deepEqual(s.myu_checkbox_state, {}, 'mistyped record repaired');
  assert.ok(!Array.isArray(s.capture_hashes) && typeof s.capture_hashes === 'object', 'array-for-record repaired');
  assert.equal(s.token, 'plg_abc123', 'repair never touches custody');
});

test('normalizeSettings: a NEWER build\'s unknown fields survive a downgrade round-trip', async () => {
  const { normalizeSettings } = await import('../src/settings');
  const fromTheFuture = { token: 'plg_abc123', some_v3_feature_state: { enabled: true } };
  const s = normalizeSettings(fromTheFuture) as unknown as Record<string, unknown>;
  assert.deepEqual(s.some_v3_feature_state, { enabled: true }, 'unknown keys pass through — a downgrade must not shed a newer build\'s state');
});

test('normalizeSettings: garbage in (null / array / string) yields pristine defaults', async () => {
  const { normalizeSettings, DEFAULT_SETTINGS } = await import('../src/settings');
  for (const garbage of [null, undefined, [], 'not json', 42]) {
    const s = normalizeSettings(garbage);
    assert.equal(s.token, null);
    assert.equal(s.base_url, DEFAULT_SETTINGS.base_url);
    assert.deepEqual(s.vault_event_queue, []);
  }
});

// ── P8.9 history down-sync builders ──────────────────────────────────────────

test('person page carries the memory layer — the vault Jim is never thinner than the web Jim', async () => {
  const { buildPersonMarkdown } = await import('../src/vault/myuFiles');
  const entity = { entity_id: 'rel-1', display_name: 'Jim Harness', organization: 'Acme' } as never;
  const md = buildPersonMarkdown(entity, null, [], () => false, null, [
    { memory_text: 'Prefers early meetings; kid started school in April.', created_at: '2026-04-02T10:00:00Z' },
    { text: 'Legacy-shaped memory row.', created_at: '2026-05-01' },
  ]);
  assert.ok(md.includes('## Memories'), 'memories section renders');
  assert.ok(md.includes('Prefers early meetings'), 'memory_text shape');
  assert.ok(md.includes('Legacy-shaped memory row.'), 'text fallback shape');
  assert.ok(md.includes('*(2026-04-02)*'), 'dated, date-only (no churn)');
  const empty = buildPersonMarkdown(entity, null, [], () => false, null, []);
  assert.ok(!empty.includes('## Memories'), 'no empty section headers');
});

test('journal day file — entries in time order, honest provenance line', async () => {
  const { buildJournalDayMarkdown } = await import('../src/vault/myuFiles');
  const md = buildJournalDayMarkdown('2026-08-20', [
    { time: '09:12', text: 'Morning pages.' },
    { time: '22:40', text: 'Long day; shipped the beta build.' },
  ]);
  assert.ok(md.includes('# Journal — 2026-08-20'));
  assert.ok(md.indexOf('09:12') < md.indexOf('22:40'), 'chronological');
  assert.ok(md.includes('type: myu-journal'), 'typed frontmatter for Bases');
  assert.ok(md.includes('decrypted into your vault'), 'says what it is');
});

test('meeting history file — survives missing fields, attendees become wikilinks', async () => {
  const { buildMeetingHistoryMarkdown } = await import('../src/vault/myuFiles');
  const md = buildMeetingHistoryMarkdown({
    meeting_id: 'm-1',
    title: 'Q3 pipeline sync',
    occurred_at: '2026-07-10T15:00:00Z',
    attendees: ['Rowan Harness', 'Jim Harness'],
    summary: 'Agreed the pipeline review moves to Fridays.',
  });
  assert.ok(md.includes('[[Rowan Harness]]') && md.includes('[[Jim Harness]]'), 'attendee wikilinks');
  assert.ok(md.includes('date: 2026-07-10'));
  const bare = buildMeetingHistoryMarkdown({ meeting_id: 'm-2' });
  assert.ok(bare.includes('# Meeting'), 'a bare row still renders, never throws');
});

test('month grid — correct weekday alignment, wikilinked days, busy counts', async () => {
  const { buildMonthCalendarMarkdown } = await import('../src/vault/myuFiles');
  const busy = new Map([['2026-08-25', 3], ['2026-08-01', 1]]);
  const md = buildMonthCalendarMarkdown([{ year: 2026, month: 7 }], busy);
  assert.ok(md.includes('## August 2026'));
  assert.ok(md.includes('[[Days/2026-08-25\\|25]] ·3'), 'busy day carries its count');
  assert.ok(md.includes('[[Days/2026-08-01\\|1]] ·1'));
  // 2026-08-01 is a Saturday → first row has 5 leading blanks (Mon–Fri).
  const firstRow = md.split('\n').find((l) => l.includes('2026-08-01'));
  assert.ok(firstRow && firstRow.split('|').slice(1, 6).every((c) => c.trim() === ''), 'weekday alignment');
});

test('day file — schedule sorted, meetings wikilinked, journal embedded, empty day honest', async () => {
  const { buildDayMarkdown } = await import('../src/vault/myuFiles');
  const md = buildDayMarkdown('2026-08-25', [
    { title: 'Standup', start_time: '2026-08-25T09:00:00Z' },
    { title: 'All-hands', all_day: true },
  ], ['Meetings/2026-08-25 Board sync'], true);
  assert.ok(md.includes('**09:00** Standup'));
  assert.ok(md.includes('**all day** All-hands'));
  assert.ok(md.includes('[[Meetings/2026-08-25 Board sync]]'));
  assert.ok(md.includes('![[Journal/2026-08-25]]'), 'journal transcluded, not duplicated');
  const empty = buildDayMarkdown('2026-08-26', [], [], false);
  assert.ok(empty.includes('Nothing on file'), 'an empty day says so');
});

test('flattenMemoryPayload — the REAL shape: sources → arrays, sometimes nested by subtype', async () => {
  const { flattenMemoryPayload } = await import('../src/vault/myuFiles');
  const rows = flattenMemoryPayload({
    email: [{ content: 'Met at the Osaka summit.', memory_date: '2026-08-01' }],
    journal: {},
    messaging: { slack: [{ encrypted_content: 'AAAA', memory_date: '2026-08-10' }] },
  });
  assert.equal(rows.length, 2, 'flattens arrays AND one-level-nested maps');
  assert.equal(rows[0].memory_date, '2026-08-10', 'newest first');
  assert.equal(rows[1].content, 'Met at the Osaka summit.');
  assert.deepEqual(flattenMemoryPayload([]), [], 'array input (the wrong old assumption) yields empty, not a crash');
  assert.deepEqual(flattenMemoryPayload(null), []);
});

test('firstPresent — empty strings fall through (the nullish-coalescing trap that dropped journals)', async () => {
  const { firstPresent, parseWhen } = await import('../src/vault/myuFiles');
  // The exact live shape: occurred_at empty, timestamp populated.
  assert.equal(firstPresent('', '2026-07-28 13:53:34', undefined), '2026-07-28 13:53:34');
  assert.equal(firstPresent('   ', null, 'x'), 'x', 'whitespace-only counts as absent');
  assert.equal(firstPresent(null, undefined), undefined);
  // The trap this replaces: `'' ?? y` === '' → parseWhen('') === null → dropped.
  assert.equal('' ?? 'fallback', '', 'proving why ?? was wrong here');
  const d = parseWhen(firstPresent('', '2026-07-28 13:53:34.515799'));
  assert.ok(d && d.toISOString().startsWith('2026-07-28'), 'postgres timestamp parses once the empty is skipped');
});

test('normalizeSection — reads the .data envelope with aliased keys (the limited-note bug)', async () => {
  const { normalizeSection } = await import('../src/views/cardSections');
  // The exact live shapes from a person card.
  const narr = normalizeSection({ title: 'How things are', section_type: 'narrative', data: { text: 'She leads GTM at JustAI.' } } as never);
  assert.equal(narr.narrative, 'She leads GTM at JustAI.', 'narrative reads data.text');
  const bio = normalizeSection({ title: 'Who they are', section_type: 'bio', data: { bullets: ['Ex-Lead Data Scientist', 'Oxford alum'] } } as never);
  assert.deepEqual(bio.items?.map((i) => i.text), ['Ex-Lead Data Scientist', 'Oxford alum'], 'bio reads data.bullets');
  const mem = normalizeSection({ title: 'Memories', section_type: 'memories', data: { items: [{ content: 'Met at summit', memory_date: 1 }] } } as never);
  assert.equal(mem.items?.[0].text, 'Met at summit', 'memories read data.items[].content');
  const career = normalizeSection({ title: 'Career', section_type: 'career', data: { narrative: 'Stepping into exec.' } } as never);
  assert.equal(career.narrative, 'Stepping into exec.', 'career reads data.narrative');
  // Back-compat: an already-flat section still works.
  const flat = normalizeSection({ title: 'X', narrative: 'flat', items: [{ text: 'row' }] } as never);
  assert.equal(flat.narrative, 'flat');
  assert.equal(flat.items?.[0].text, 'row');
});

test('normalizePreferences — unwraps the { preferences } envelope both directions', async () => {
  const { normalizePreferences, Api } = await import('../src/transport/api');

  // READ. The live shape. Reading `data` flat here is what produced a settings
  // form that was silently always empty (2026-08-26) — the sibling write bug
  // 400'd loudly and chain test 26 caught it; this half failed in silence.
  const live = normalizePreferences({ preferences: { mailing_address: '1 Main St', timezone: 'America/New_York' } });
  assert.equal(live.mailing_address, '1 Main St', 'reads INSIDE the wrapper');
  assert.equal(live.timezone, 'America/New_York');

  // A flat body degrades to working, not to blank.
  assert.equal(normalizePreferences({ mailing_address: 'flat' }).mailing_address, 'flat');

  // Nothing here can throw on the way to an empty form.
  for (const junk of [null, undefined, 'string', 42, ['a'], { preferences: null }, { preferences: ['a'] }]) {
    assert.deepEqual(typeof normalizePreferences(junk), 'object', `survives ${JSON.stringify(junk) ?? 'undefined'}`);
  }
  assert.deepEqual(normalizePreferences(null), {});
  // `{ preferences: [] }` is not an object-shaped inner value, so we keep the
  // envelope rather than handing the caller an array pretending to be a record.
  assert.ok(!Array.isArray(normalizePreferences({ preferences: ['a'] })));

  // WRITE. The other half of the same wrapper: the servlet rejects a flat body
  // with "Missing 'preferences' object".
  let sent: { path?: string; body?: unknown } = {};
  const api = new Api({ post: async (path: string, body: unknown) => { sent = { path, body }; return { data: {} }; } } as never);
  await api.updateAccountPreferences({ mailing_address: '1 Main St' });
  assert.equal(sent.path, '/account/preferences/update');
  assert.deepEqual(sent.body, { preferences: { mailing_address: '1 Main St' } }, 'body is wrapped');

  // Round-trip: what we write is what normalize reads back out.
  assert.deepEqual(normalizePreferences(sent.body), { mailing_address: '1 Main St' });
});

test('prod base_url — the default points at the live backend, and a stored api. host migrates', async () => {
  const { DEFAULT_SETTINGS, normalizeSettings } = await import('../src/settings');

  // The one the web app and mobile both ship (.env.production, eas.json), and
  // the one the backend answers on (configs/prod/service_config.json5).
  assert.equal(DEFAULT_SETTINGS.base_url, 'https://myu.askmyu.com/api');

  // A stored base_url outlives the default — it sits in data.json forever —
  // so the dead host is rewritten on load rather than left pointing at nothing.
  assert.equal(
    normalizeSettings({ base_url: 'https://api.askmyu.com/api' }).base_url,
    'https://myu.askmyu.com/api',
  );
  // Anything the operator set deliberately is left exactly alone.
  for (const custom of ['http://localhost/api', 'https://staging.example.com/api', 'https://myu.askmyu.com/api']) {
    assert.equal(normalizeSettings({ base_url: custom }).base_url, custom, custom);
  }
  // Absent / junk falls back to the default rather than to undefined.
  assert.equal(normalizeSettings({}).base_url, 'https://myu.askmyu.com/api');
});
