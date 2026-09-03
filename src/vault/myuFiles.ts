/**
 * P8 — pure builders and parsers for the Myu/ shared surface.
 * No vault API in this file: everything here is
 * a (data → markdown) or (markdown → data) function, exported so the
 * acceptance tests can prove the round-trip without a vault. The write
 * mechanics live in MaterializationService (vault/ module, invariant 3); the
 * read side (tick detection) lives in the watcher, which imports the parsers.
 *
 * The one durable convention: every line Myu may be told about carries an
 * Obsidian comment `%%myu-id:<id>%%` — invisible in reading view, inert to the
 * Tasks plugin, and the join key between a vault edit and a server object.
 */

import type { CardSpecLite, EntityHeadline, VaultCommitment, WeeklyEdition } from '../transport/api';
import type { CompositionComponentLite, CompositionSpecLite } from '../wire';
import { normalizeSection } from '../views/cardSections';

export const MYU_GENERATED_KEY = 'myu-generated';

/** `%%myu-id:xyz%%` — the join key on ownable lines. */
const MYU_ID_RE = /%%myu-id:([A-Za-z0-9_-]+)%%/;
/** A Tasks-style checkbox line: `- [ ] …` or `- [x] …` (any indent). */
const CHECKBOX_RE = /^\s*- \[( |x|X)\]/;

/** Vault-safe file name from a display name. Deterministic; myu-id disambiguates. */
/** Epoch seconds, epoch millis, ISO, or postgres 'YYYY-MM-DD HH:MM:SS' —
    the backends emit all four (live findings, 2026-08-25: meetings arrived
    as epoch SECONDS and journals as postgres timestamps; naive parsing
    filed meetings under '1778025600' and journals under 1970). */
/** First value that is neither null/undefined NOR an empty string. `??` is a
    trap here: the backends emit EMPTY STRINGS for absent dates (occurred_at
    on journal rows), and `??` keeps the "" instead of falling through — which
    dropped every journal entry (live, 2026-08-25). */
export function firstPresent(...values: unknown[]): unknown {
  for (const v of values) {
    if (v !== null && v !== undefined && !(typeof v === 'string' && v.trim() === '')) return v;
  }
  return undefined;
}

export function parseWhen(value: unknown): Date | null {
  if (value == null) return null;
  if (typeof value === 'number' || /^\d+$/.test(String(value))) {
    let n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return null;
    if (n < 1e12) n *= 1000; // seconds → millis
    const d = new Date(n);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const s = String(value).trim();
  if (!s) return null;
  const d = new Date(s.includes(' ') && !s.includes('T') ? s.replace(' ', 'T') : s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * A first-name alias for a generated person page — or null.
 *
 * P8.1 specified `aliases:` and it was never implemented; the server supplies
 * none, so the only honest source is the display name itself. The value is
 * real: without an alias, a user writing `[[Marcus]]` never reaches the
 * generated `Marcus Webb.md`, and the vault's own convention is first names.
 *
 * The danger is the mirror image, and it is why this is so conservative: an
 * alias PARTICIPATES in link resolution, so a careless one HIJACKS a link the
 * user already had — their own `People/Marcus.md` would lose `[[Marcus]]` to
 * our file. That would break "link in, never write" by another route.
 *
 * So an alias is emitted only when all of:
 *   · the display name has a distinct first name (two or more words);
 *   · no OTHER generated person shares that first name (no ambiguity we made);
 *   · nothing already in the vault answers to it (`isTaken`), which covers the
 *     user's own person pages and every other note.
 *
 * `isTaken` must treat the person's OWN page as not-taken, or the alias
 * flip-flops: once written, the name resolves to us, and the next pass would
 * read that as a collision and remove it.
 */
export function safeFirstNameAlias(
  displayName: string,
  allDisplayNames: string[],
  isTaken: (name: string) => boolean,
): string[] {
  const parts = displayName.trim().split(/\s+/);
  if (parts.length < 2) return [];
  const first = parts[0];
  if (!first || first.length < 2 || first === displayName) return [];

  const sharedByAnother = allDisplayNames.some(
    (other) => other !== displayName && other.trim().split(/\s+/)[0] === first,
  );
  if (sharedByAnother) return [];
  if (isTaken(first)) return [];
  return [first];
}

export function sanitizeName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|#^[\]]/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned || 'Unknown';
}

function frontmatter(
  pairs: Array<[string, string | number | boolean | string[] | null | undefined]>,
): string {
  const lines = pairs
    .filter(([, v]) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) => {
      // Obsidian reads `aliases` as a YAML list; a flow sequence is what the
      // app itself writes, so match it.
      if (Array.isArray(v)) return `${k}: [${v.map((item) => JSON.stringify(item)).join(', ')}]`;
      // Quote anything YAML would misread: colons, hashes, and a wikilink —
      // bare `[[Ally]]` parses as a nested list; quoted, Obsidian reads a Link.
      return `${k}: ${typeof v === 'string' && /[:#]|^\[\[/.test(v) ? JSON.stringify(v) : String(v)}`;
    });
  return ['---', ...lines, '---'].join('\n');
}

/** One commitment as a Tasks-format checkbox line the user can genuinely tick. */
export function commitmentLine(c: VaultCommitment, checked: boolean): string {
  const box = checked ? 'x' : ' ';
  const owner = c.owner ? `[[${sanitizeName(c.owner)}]] ` : '';
  const text = (c.content ?? '').trim() || '(encrypted — open in Myu)';
  const due = c.deadline ? ` 📅 ${c.deadline.slice(0, 10)}` : '';
  const from = c.meeting_title ? ` *(from ${c.meeting_title})*` : '';
  return `- [${box}] ${owner}${text}${due}${from} %%myu-id:${c.commitment_id}%%`;
}

export interface ParsedCheckbox {
  myuId: string;
  checked: boolean;
  line: string;
}

/** Every myu-id checkbox line in a file — the watcher's read side. */
/** A short, deterministic key for a line — the join id for rows the server did not id. */
export function lineKey(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/**
 * Bullets the USER added under `## Decisions` / `## Commitments` in a Myu
 * meeting note — the ones without a `%%myu-id%%`. The web adds these through
 * the meeting modal's tabs; in a vault, typing under the heading is the
 * natural act, and the watcher ships them (meetings/add-decision, add-commitment).
 */
export function meetingAdditions(contents: string): { decisions: string[]; commitments: Array<{ content: string; owner?: string }> } {
  const out = { decisions: [] as string[], commitments: [] as Array<{ content: string; owner?: string }> };
  let section: 'decisions' | 'commitments' | null = null;
  for (const raw of contents.split('\n')) {
    const line = raw.trimEnd();
    if (/^## /.test(line)) {
      section = /^## Decisions\s*$/.test(line) ? 'decisions' : /^## Commitments\s*$/.test(line) ? 'commitments' : null;
      continue;
    }
    if (!section) continue;
    const m = /^- (?!\[[ xX]\])(.+)$/.exec(line);
    if (!m || MYU_ID_RE.test(line)) continue;
    const body = m[1].trim();
    if (!body) continue;
    if (section === 'decisions') { out.decisions.push(body); continue; }
    const owned = /^\[\[([^\]|]+)(?:\|[^\]]*)?\]\]\s+(.+)$/.exec(body);
    out.commitments.push(owned ? { content: owned[2].trim(), owner: owned[1].trim() } : { content: body });
  }
  return out;
}

export function parseCheckboxes(contents: string): ParsedCheckbox[] {
  const out: ParsedCheckbox[] = [];
  for (const line of contents.split('\n')) {
    const id = MYU_ID_RE.exec(line)?.[1];
    if (!id) continue;
    const box = CHECKBOX_RE.exec(line);
    if (!box) continue;
    out.push({ myuId: id, checked: box[1].toLowerCase() === 'x', line });
  }
  return out;
}

/** The person file — frontmatter is the Bases contract (columns), body is the card. */
/** Myu/Companies/<name>.md — the org page. Same contract as the person page:
    card sections verbatim, frontmatter as Bases columns, regenerated from
    server truth. `people` become wikilinks so the graph view connects the
    org to its humans (companies were person-frontmatter strings only until
    2026-08-25 — the engine had first-class companies, the vault didn't). */
/** Myu/Meetings/<date> <title>.md — the WHOLE meeting on paper: summary,
    key points, decisions, commitments, notes, transcript. The list rows are
    thin; the detail endpoint carries the substance (operator finding,
    2026-08-25: "only getting the summaries"). Every section is optional —
    render what exists, skip what doesn't, never an empty header. */
export function buildMeetingHistoryMarkdown(meeting: Record<string, unknown>): string {
  const title = String(meeting.title ?? meeting.meeting_title ?? 'Meeting');
  const whenDate = parseWhen(firstPresent(meeting.meeting_date, meeting.occurred_at, meeting.created_at));
  const when = whenDate ? whenDate.toISOString().slice(0, 10) : '';
  // Prefer the detail endpoint's `participation` roster (names), then the list
  // row's `participants`/`attendees` (audit 2026-08-25).
  const participation = Array.isArray(meeting.participation)
    ? (meeting.participation as Array<Record<string, unknown>>)
        .map((p) => String(p.display_name ?? p.name ?? p.person_name ?? '').trim())
        .filter(Boolean)
    : [];
  const rawAttendees = meeting.attendees ?? meeting.participants;
  const listAttendees = Array.isArray(rawAttendees) ? (rawAttendees as unknown[]).map(String) : [];
  const attendees = participation.length > 0 ? participation : listAttendees;
  const head = frontmatter([
    ['type', 'myu-meeting'],
    ['myu-id', String(meeting.meeting_id ?? '')],
    [MYU_GENERATED_KEY, true],
    ['date', when || null],
    ['source', String(meeting.source ?? '') || null],
  ]);
  const parts: string[] = [head, '', `# ${title}`];
  if (attendees.length > 0) {
    parts.push('', `**Attendees:** ${attendees.map((a) => `[[${sanitizeName(a)}]]`).join(', ')}`);
  }

  const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
  const list = (v: unknown): string[] =>
    Array.isArray(v) ? (v as unknown[]).map((i) => (typeof i === 'string' ? i : text((i as Record<string, unknown>)?.text) || text((i as Record<string, unknown>)?.content))).filter(Boolean) : [];

  const summary = text(meeting.summary) || text(meeting.debrief);
  if (summary) parts.push('', '## Summary', '', summary);

  const keyPoints = list(meeting.key_points);
  if (keyPoints.length > 0) {
    parts.push('', '## Key points');
    for (const p of keyPoints) parts.push(`- ${p}`);
  }

  // Myu's rows carry an invisible `%%myu-id%%`; a bullet WITHOUT one under
  // these headings is the user's — shipped as a new decision / commitment
  // (meetingAdditions, MyuFolderWatcher), then the note is regenerated with ids.
  const decisions = list(meeting.decisions);
  if (decisions.length > 0) {
    parts.push('', '## Decisions');
    for (const d of decisions) parts.push(`- ${d} %%myu-id:d-${lineKey(d)}%%`);
  }

  const commitments = Array.isArray(meeting.commitments) ? (meeting.commitments as Array<Record<string, unknown>>) : [];
  if (commitments.length > 0) {
    parts.push('', '## Commitments');
    for (const c of commitments) {
      const owner = text(c.owner);
      const line = text(c.content) || text(c.text);
      if (line) parts.push(`- ${owner ? `[[${sanitizeName(owner)}]] ` : ''}${line} %%myu-id:${text(c.commitment_id) || `c-${lineKey(line)}`}%%`);
    }
  }

  let topics: Array<{ name?: string; time_spent_percent?: number }> = [];
  const rawTopics = meeting.topics_detail;
  if (Array.isArray(rawTopics)) topics = rawTopics as typeof topics;
  else if (typeof rawTopics === 'string' && rawTopics.trim().startsWith('[')) {
    try { topics = JSON.parse(rawTopics) as typeof topics; } catch { topics = []; }
  }
  if (topics.length > 0) {
    parts.push('', '## Topics');
    for (const t of topics) {
      if (!t?.name) continue;
      parts.push(`- ${t.name}${typeof t.time_spent_percent === 'number' ? ` *(${t.time_spent_percent}%)*` : ''}`);
    }
  }

  const notes = text(meeting.content) || text(meeting.raw_notes);
  if (notes && notes !== summary) parts.push('', '## Notes', '', notes);

  const transcript = text(meeting.transcript);
  if (transcript) parts.push('', '## Transcript', '', transcript);

  parts.push('', '*Maintained by Myu — meeting history from your account. Edits here are replaced.*', '');
  return parts.join('\n');
}

/** Myu/Journal/YYYY-MM-DD.md — the day's entries, decrypted with THIS vault's
    key. An entry is a conversation SEED (operator, 2026-08-25): when chats
    grew from it, the conversation renders inline as quoted turns, and the
    deep link reopens it in the chat pane — RESUMABLE, not a museum piece. */
export interface JournalDayEntry {
  time: string;
  text: string;
  journalId?: string;
  turns?: Array<{ role: 'you' | 'myu'; text: string }>;
}

export function buildJournalDayMarkdown(date: string, entries: JournalDayEntry[]): string {
  const head = frontmatter([
    ['type', 'myu-journal'],
    [MYU_GENERATED_KEY, true],
    ['date', date],
    ['entries', entries.length],
  ]);
  const parts: string[] = [head, '', `# Journal — ${date}`];
  for (const entry of entries) {
    parts.push('', `## ${entry.time}`, '', entry.text.trim());
    if (entry.turns && entry.turns.length > 0) {
      parts.push('');
      for (const turn of entry.turns) {
        const speaker = turn.role === 'myu' ? 'myu' : 'you';
        for (const line of turn.text.trim().split('\n')) {
          parts.push(`> **${speaker}:** ${line}`.trimEnd());
        }
        parts.push('>');
      }
      parts.pop();
    }
    if (entry.journalId) {
      parts.push('', `[continue this conversation ▸](obsidian://myu-chat?journal=${entry.journalId})`);
    }
  }
  parts.push('', '*Maintained by Myu — your journal, decrypted into your vault. Edits here are replaced.*', '');
  return parts.join('\n');
}

/** Myu/Days/YYYY-MM-DD.md — one day, whole: calendar events, meetings,
    journal. The web's month-view day drilldown, as paper. Embedded into the
    user's daily notes via the {{date}} template snippet, which is how the
    BASE Calendar plugin's grid becomes a Myu calendar (its dots and clicks
    are daily notes — the one integration surface it has). */
export function buildDayMarkdown(
  date: string,
  events: Array<{ title?: string; start_time?: string; all_day?: boolean; event_id?: string }>,
  meetingLinks: string[],
  hasJournal: boolean,
  memoryPeople: string[] = [],
): string {
  const head = frontmatter([
    ['type', 'myu-day'],
    [MYU_GENERATED_KEY, true],
    ['date', date],
    ['events', events.length],
  ]);
  const parts: string[] = [head, '', `# ${date}`];
  if (events.length > 0) {
    parts.push('', '## Schedule');
    for (const e of events) {
      const time = e.all_day ? 'all day' : (e.start_time ?? '').slice(11, 16) || '—';
      // Every line is a DOOR (operator, 2026-08-25: calendar items must link
      // back to their thing): prep opens in the pane via the deep link.
      const door = e.event_id ? ` [prep ▸](obsidian://myu-prep?event=${e.event_id})` : '';
      parts.push(`- **${time}** ${e.title ?? 'Busy'}${door}`);
    }
  }
  if (meetingLinks.length > 0) {
    parts.push('', '## Meetings');
    for (const link of meetingLinks) parts.push(`- [[${link}]]`);
  }
  if (hasJournal) {
    parts.push('', `## Journal`, '', `![[Journal/${date}]]`);
  }
  if (memoryPeople.length > 0) {
    parts.push('', '## Relationship notes', '', `Memories minted this day about ${memoryPeople.map((n) => `[[${n}]]`).join(', ')}.`);
  }
  if (events.length === 0 && meetingLinks.length === 0 && !hasJournal && memoryPeople.length === 0) {
    parts.push('', '*Nothing on file for this day.*');
  }
  parts.push('', '*Maintained by Myu.*', '');
  return parts.join('\n');
}

/** Myu/Calendar.md — a month grid of wikilinked days (this month + next).
    Works with no plugins at all; the day links resolve to Myu/Days/. */
export function buildMonthCalendarMarkdown(months: Array<{ year: number; month: number }>, busy: Map<string, number>): string {
  const head = frontmatter([['type', 'myu-calendar'], [MYU_GENERATED_KEY, true]]);
  const parts: string[] = [head, '', '# Calendar'];
  for (const { year, month } of months) {
    const label = new Date(Date.UTC(year, month, 1)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    parts.push('', `## ${label}`, '', '| Mon | Tue | Wed | Thu | Fri | Sat | Sun |', '| --- | --- | --- | --- | --- | --- | --- |');
    const first = new Date(Date.UTC(year, month, 1));
    const startOffset = (first.getUTCDay() + 6) % 7;
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    let row: string[] = new Array(startOffset).fill(' ');
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const count = busy.get(iso) ?? 0;
      row.push(`[[Days/${iso}\\|${d}]]${count > 0 ? ` ·${count}` : ''}`);
      if (row.length === 7) {
        parts.push(`| ${row.join(' | ')} |`);
        row = [];
      }
    }
    if (row.length > 0) {
      while (row.length < 7) row.push(' ');
      parts.push(`| ${row.join(' | ')} |`);
    }
  }
  parts.push('', '*Maintained by Myu — the number after a day is how much is on file for it.*', '');
  return parts.join('\n');
}

/** Flatten the memories payload's real shape: sources → arrays (sometimes
    nested one level deeper by subtype). Pure, so the shape is TESTED — the
    first two guesses at it were wrong (2026-08-25). */
export interface MemoryRow {
  /** Present on every row the API returns; the join key for corrections.
      Verified against the webapp's parser (PersonEditSheet reads m.memory_id). */
  memory_id?: string;
  content?: string;
  encrypted_content?: string;
  memory_date?: string;
  source_type?: string;
  memory_type?: string;
}

export function flattenMemoryPayload(raw: unknown): MemoryRow[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const out: MemoryRow[] = [];
  const takeRows = (value: unknown) => {
    if (!Array.isArray(value)) return;
    for (const row of value) {
      if (row && typeof row === 'object' && !Array.isArray(row)) out.push(row as MemoryRow);
    }
  };
  for (const value of Object.values(raw as Record<string, unknown>)) {
    if (Array.isArray(value)) takeRows(value);
    else if (value && typeof value === 'object') {
      for (const nested of Object.values(value as Record<string, unknown>)) takeRows(nested);
    }
  }
  out.sort((a, b) => String(b.memory_date ?? '').localeCompare(String(a.memory_date ?? '')));
  return out;
}

/**
 * A composition, as markdown (P-CANVAS-1, 2026-08-26).
 *
 * The canvas's vault-native reading form. `CanvasExporter` already turns a spec
 * into a `.canvas` FILE — an open standard, opened by Obsidian's own editor —
 * but a file is for keeping, and Canvas on mobile is rough. This is the other
 * output of the same spec: markdown, handed to `MarkdownRenderer`, which gives
 * mermaid, `[[wikilinks]]`, tables and the user's own theme for nothing.
 *
 * One mechanism, two outputs — the pattern the weekly review already uses.
 *
 * **Render-verbatim still governs.** Backend text is printed as written; this
 * function chooses STRUCTURE (heading, list, table, quote), never wording. What
 * it cannot render honestly it names rather than dropping — R7: gating is
 * visible, never silent.
 */
export function buildCompositionMarkdown(
  spec: CompositionSpecLite,
  resolvePersonName?: (name: string) => string | null,
): string {
  const parts: string[] = [];
  if (spec.summary_text?.trim()) parts.push(spec.summary_text.trim(), '');

  const components = spec.components ?? [];

  const emit = (component: CompositionComponentLite, depth: number): void => {
    // componentMarkdown ALWAYS returns markdown now — genericMarkdown is the
    // floor. An empty string means "nothing to say" (a bare header), not
    // "go and look at this on the web".
    const rendered = componentMarkdown(component, depth, resolvePersonName, components);
    if (!rendered.trim()) return;
    // A blank line BETWEEN list items makes markdown treat the list as
    // "loose" and space every entry — so consecutive item-shaped components
    // (people, mostly) stay contiguous.
    const isItem = rendered.startsWith('- ');
    const prevWasItem = parts.length >= 2 && parts[parts.length - 2].startsWith('- ') && parts[parts.length - 1] === '';
    if (isItem && prevWasItem) parts.splice(parts.length - 1, 1);
    parts.push(rendered, '');
  };

  // One reading order for the note AND the pane — see compositionFlow.
  for (const entry of compositionFlow(spec)) {
    if ('scene' in entry) parts.push(`## ${entry.scene}`, '');
    else emit(entry.component, entry.depth);
  }

  return parts.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

/**
 * The reading order of a composition: each container as a heading followed by
 * its (non-container) children one level deeper, then everything ungrouped, in
 * spec order throughout. Exported so the canvas PANE renders component by
 * component in exactly the order the NOTE reads — it has to, because a
 * component with controls needs its own DOM host beside its markdown.
 */
export type FlowEntry = { component: CompositionComponentLite; depth: number } | { scene: string };

export function compositionFlow(spec: CompositionSpecLite): FlowEntry[] {
  const components = spec.components ?? [];
  const containers = components.filter((c) => c.type === 'container');
  const childIds = new Set(containers.flatMap((c) => (Array.isArray(c.data?.child_ids) ? (c.data?.child_ids as string[]) : [])));

  // One group: containers as headings with their children, then the rest.
  const flowOf = (pool: CompositionComponentLite[], depth: number): FlowEntry[] => {
    const out: FlowEntry[] = [];
    const seen = new Set<string>();
    for (const container of pool.filter((c) => c.type === 'container')) {
      out.push({ component: container, depth });
      seen.add(container.id);
      for (const id of (container.data?.child_ids as string[] | undefined) ?? []) {
        const child = components.find((c) => c.id === id);
        if (child && child.type !== 'container' && !seen.has(child.id)) { out.push({ component: child, depth: depth + 1 }); seen.add(child.id); }
      }
    }
    for (const component of pool) {
      if (seen.has(component.id) || component.type === 'container' || childIds.has(component.id)) continue;
      out.push({ component, depth });
    }
    return out;
  };

  // SCENES (2026-08-29): the web's full canvas groups components under
  // labelled sections. When a spec carries them, they are the top-level
  // structure — each scene a heading, its components beneath — and anything
  // no scene claims comes last. Without them, the containers-first order.
  const scenes = (spec.scenes ?? []).filter((sc) => Array.isArray(sc.component_ids) && sc.component_ids.length > 0);
  if (scenes.length === 0) return flowOf(components, 2);
  const out: FlowEntry[] = [];
  const claimed = new Set<string>();
  for (const scene of scenes) {
    const pool = scene.component_ids.map((id) => components.find((c) => c.id === id)).filter((c): c is CompositionComponentLite => !!c && !claimed.has(c.id));
    if (pool.length === 0) continue;
    out.push({ scene: scene.label?.trim() || 'Scene' });
    for (const e of flowOf(pool, 3)) { out.push(e); if ('component' in e) claimed.add(e.component.id); }
    for (const c of pool) claimed.add(c.id);
  }
  const rest = components.filter((c) => !claimed.has(c.id));
  if (rest.length) out.push(...flowOf(rest, 2));
  return out;
}

/** The receipt an export leaves behind: what landed, what did not, and why. */
export interface ExportSummary {
  date: string;
  people: number;
  conversations: { saved: number; alreadyThere: number; failed: number };
  canvases: { kept: number; expired: number; failed: number };
  surfaces: string[];
}

export function buildExportManifest(s: ExportSummary): string {
  const head = frontmatter([['type', 'myu-export'], [MYU_GENERATED_KEY, true], ['date', s.date]]);
  return [
    head, '', '# Everything Myu knows, as files', '',
    `*Exported ${s.date}. Every file Myu wrote carries \`myu-generated: true\` \u2014 this whole export is one search away, and one delete away.*`, '',
    '## What is here', '',
    ...s.surfaces.map((x) => `- ${x}`),
    `- **People** \u2014 ${s.people} ${s.people === 1 ? 'page' : 'pages'} written or refreshed this pass`,
    `- **Conversations** \u2014 ${s.conversations.saved} saved${s.conversations.alreadyThere ? `, ${s.conversations.alreadyThere} already here` : ''}${s.conversations.failed ? `, ${s.conversations.failed} could not be read` : ''} \u2192 \`Myu/Conversations/\``,
    `- **Canvases** \u2014 ${s.canvases.kept} kept${s.canvases.expired ? `, ${s.canvases.expired} expired on the server and cannot be fetched` : ''}${s.canvases.failed ? `, ${s.canvases.failed} failed` : ''} \u2192 \`Myu/Canvas/\``,
    '', '## What is not here', '',
    '- Your **account** itself \u2014 email addresses, devices, keys, consents. Those are not vault material. For a complete archive of what the server holds, use **Request my data archive** (Settings \u2192 AskMyu \u2192 Advanced): an encrypted zip, link by email, passphrase shown once.',
    '- Your **own notes** \u2014 they were never Myu\u2019s to export. They are already yours.',
    '', '## If you uninstall', '',
    '- Everything under `Myu/` stays exactly as it is. Nothing here needs the plugin to open: markdown, `.canvas` (an open standard), `.base` (an Obsidian core feature).',
    '- Notes stop refreshing; nothing breaks. Links, properties and tables keep working.',
    '- The plugin\u2019s own `data.json` (your plugin token and wrapped key) goes with it \u2014 no custody is left on this device.',
    '- Your account is untouched. Delete it from Settings \u2192 AskMyu, or on the web.', '',
  ].join('\n');
}

/**
 * Heading, optional body, then rows — with the ONE blank line markdown needs
 * after a heading and nowhere else. `[a, '', b].filter(Boolean)` looks like it
 * does this and silently eats the blank, which glued headings to their bodies
 * until it was caught in review.
 */
function joinBlock(heading: string, body: string, rows: string[], bullet = true): string {
  const out: string[] = [];
  if (heading) out.push(heading, '');
  if (body) out.push(body, '');
  // A leading separator row would double the blank the body already left.
  let started = false;
  for (const row of rows) {
    if (!started && row === '') continue;
    started = true;
    out.push(bullet ? `- ${row}` : row);
  }
  return out.join('\n').trimEnd();
}

// ── the component renderer ──────────────────────────────────────────────────
//
// Every arm below was written against the REAL data shape in
// packages/shared/src/types/composition.ts — not a guess at field names. The
// first version of this guessed (`rows`, `events`, `mermaid`) and seven of the
// web's fifty component types rendered as nothing at all (audit, 2026-08-28).
// When a shape changes upstream, this is the file that has to follow.

/**
 * Keys that are plumbing, not content. Two classes:
 *  - by SUFFIX: ids, urls, codes and keys are wiring, never prose;
 *  - by NAME: renderer instructions (layout, colour, collapse, click, input
 *    chrome) that mean something to a React component and nothing on paper.
 * Rendering them turns an honest fallback into noise, which is its own kind
 * of failure.
 */
const PLUMBING_SUFFIX = /(?:^|_)(?:id|ids|url|urls|code|key|hint)$/;
const PLUMBING = new Set([
  'type', 'component_type', 'original_type', 'variant', 'kind', 'mode',
  'x', 'y', 'width', 'height', 'color', 'colors', 'style', 'styleAttributes', 'className',
  'icon', 'emoji', 'shape_type', 'actor_color', 'orientation', 'display_mode',
  'collapsed', 'collapsible', 'initially_collapsed', 'dismissible', 'directional', 'visible',
  'click_action', 'placeholder', 'submit_label', 'submitting_label', 'aria_label', 'validate',
  'param_name', 'params', 'checkable', 'readonly', 'format', 'tone', 'prompt_type',
  'provisional', 'attention_deferred', 'index', 'order', 'locked', 'is_primary',
  'min_value', 'max_value', 'min_selections', 'max_selections',
  'recharts_config', 'vega_lite_spec', 'config', 'has_linkedin', 'card_spec_enriched',
  'data_completeness', 'is_outlier', 'success', 'generated_at',
]);

function isPlumbing(key: string): boolean {
  return PLUMBING.has(key) || PLUMBING_SUFFIX.test(key);
}

/** `snake_case_key` → `Snake case key`. */
function labelOf(key: string): string {
  return key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

/** A 13-digit epoch under a time-shaped key reads as a date, not a number. */
function scalarOf(key: string, value: unknown): string {
  if (typeof value === 'number' && /(?:_at|timestamp|_time)$/.test(key) && value > 1e11) {
    return new Date(value).toISOString().slice(0, 10);
  }
  if (typeof value === 'number' && /(?:probability|confidence|score|rate|pct|overlap)$/.test(key) && value >= 0 && value <= 1) {
    return `${Math.round(value * 100)}%`;
  }
  return String(value).trim();
}

/**
 * A table cell: scalars verbatim; an array of scalars joined; an array of
 * objects reduced to each object's readable field; a range `[a, b]` as
 * `a–b`. Never a pipe, never a newline, never raw JSON.
 */
function cellOf(key: string, value: unknown): string {
  if (value === null || value === undefined) return '';
  let text: string;
  if (Array.isArray(value)) {
    if (value.length === 2 && value.every((v) => typeof v === 'number') && /(?:months|years|weeks|days|range)$/.test(key)) {
      text = `${value[0]}–${value[1]}`;
    } else {
      text = value
        .map((v) => (v && typeof v === 'object' ? readableOf(v as Record<string, unknown>) : scalarOf(key, v)))
        .filter(Boolean)
        .join(', ');
    }
  } else if (typeof value === 'object') {
    text = readableOf(value as Record<string, unknown>);
  } else {
    text = scalarOf(key, value);
  }
  return text.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim();
}

/** The one field of an object a reader would want: its name, text, or label. */
function readableOf(obj: Record<string, unknown>): string {
  for (const k of ['display_name', 'name', 'label', 'title', 'text', 'preview', 'summary', 'what', 'action']) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  const scalars = Object.entries(obj).filter(([k, v]) => !isPlumbing(k) && v !== null && typeof v !== 'object');
  return scalars.map(([, v]) => String(v)).join(' · ');
}

/** `[{a,b},{a,b}]` → a markdown table. Empty (or not rows) → no table. */
function rowsToTable(value: unknown, columnsOverride?: string[]): string[] {
  if (!Array.isArray(value) || value.length === 0) return [];
  const rows = value.filter((r) => r && typeof r === 'object' && !Array.isArray(r)) as Array<Record<string, unknown>>;
  if (rows.length === 0) return [];
  const candidates = columnsOverride ?? [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((c) => !isPlumbing(c));
  // A column empty in every row is a header over nothing — drop it.
  const columns = candidates.filter((c) => rows.some((r) => cellOf(c, r[c]) !== ''));
  if (columns.length === 0) return [];
  return [
    `| ${columns.map(labelOf).join(' | ')} |`,
    `| ${columns.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${columns.map((c) => cellOf(c, r[c])).join(' | ')} |`),
  ];
}

/** Bullets from an array: strings as-is, objects by their readable field. */
function bulletsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (v && typeof v === 'object' ? readableOf(v as Record<string, unknown>) : String(v ?? '').trim()))
    .filter(Boolean)
    .map((t) => `- ${t}`);
}

/**
 * The LAST RESORT — and it never gives up.
 *
 * There used to be a `null` return here that produced a
 * "N parts of this canvas need the web view" callout. That callout was a
 * browser exit printed into the user's vault, and browser exits are the
 * modality's north-star metric ("target: trends
 * to zero"). A component we do not have a bespoke renderer for is not a
 * component we cannot render — its data is still data.
 *
 * Rows become a table, lists become bullets, nested objects become their own
 * small sections, scalars become labelled fields, prose stays prose. Renders
 * verbatim, assigns no meaning — the engine's job (P8.3), not a client mapping
 * table's.
 */
function genericMarkdown(
  data: Record<string, unknown>,
  heading: string,
  opts: { skip?: string[]; headingText?: string } = {},
): string {
  const skip = new Set(opts.skip ?? []);
  const blocks: string[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (skip.has(key) || isPlumbing(key) || value === null || value === undefined) continue;
    // The title is already the heading; saying it twice reads as a bug.
    if (typeof value === 'string' && opts.headingText && value.trim() === opts.headingText) continue;
    const name = labelOf(key);

    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      const table = rowsToTable(value);
      if (table.length > 0) { blocks.push(`**${name}**`, '', ...table, ''); continue; }
      const bullets = bulletsOf(value);
      if (bullets.length > 0) blocks.push(`**${name}**`, '', ...bullets, '');
      continue;
    }

    if (typeof value === 'object') {
      const inner = genericMarkdown(value as Record<string, unknown>, '', {});
      if (inner) blocks.push(`**${name}**`, '', inner, '');
      continue;
    }

    const text = scalarOf(key, value);
    if (!text) continue;
    // A long string is prose; a short one is a field. Every block ends in a
    // blank so a field line never lazily continues into the next block's
    // bold header — the collapse below re-joins CONSECUTIVE fields only.
    blocks.push(text.length > 80 || text.includes('\n') ? text : `- **${name}** — ${text}`, '');
  }

  const body = blocks
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/(- \*\*[^\n]+)\n\n(?=- \*\*)/g, '$1\n')
    .trimEnd();
  if (!body) return heading;
  return heading ? `${heading}\n\n${body}` : body;
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function listOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) =>
      typeof item === 'string'
        ? item
        : textOf((item as Record<string, unknown>)?.text) ||
          textOf((item as Record<string, unknown>)?.label) ||
          textOf((item as Record<string, unknown>)?.content),
    )
    .filter(Boolean);
}

/** A small, single-line callout. */
function callout(kind: string, title: string, body?: string): string {
  return body ? `> [!${kind}] ${title}\n> ${body.split('\n').join('\n> ')}` : `> [!${kind}] ${title}`;
}

function quote(text: string): string {
  return `> ${text.split('\n').join('\n> ')}`;
}

/** A person → `[[their page]]` when they keep one, else a plain wikilink. */
function personLink(name: string, resolvePersonName?: (name: string) => string | null): string {
  const own = resolvePersonName?.(name);
  return own ? `[[${own}]]` : `[[${sanitizeName(name)}]]`;
}

/**
 * ONE component → markdown. Exported so the canvas exporter shares the same
 * floor: what a pane can render, a canvas node can carry. K2 — one engine, one
 * path — applied to rendering.
 *
 * `siblings` lets components that point at OTHER components by id
 * (`connection_overlay`, `context_annotation`) name what they point at.
 */
export function componentMarkdown(
  component: CompositionComponentLite,
  depth: number,
  resolvePersonName?: (name: string) => string | null,
  siblings?: CompositionComponentLite[],
  /** 'file': the vault note (no buttons, so doors are named in prose). 'pane': the canvas view, which renders the controls itself. */
  mode: 'file' | 'pane' = 'file',
): string {
  const data = component.data ?? {};
  const h = (text: string) => (text ? `${'#'.repeat(Math.min(Math.max(depth, 1), 6))} ${text}` : '');
  const sub = (text: string) => (text ? `${'#'.repeat(Math.min(Math.max(depth + 1, 1), 6))} ${text}` : '');
  // headline/statement are the pre-normalisation shapes still sitting in vaults.
  const label = (component.label || textOf(data.title) || textOf(data.headline) || textOf(data.statement)).trim();
  const heading = h(label);
  const generic = (skip: string[] = []) => genericMarkdown(data, heading, { skip, headingText: label });
  const nameOfSibling = (id: unknown): string => {
    const s = typeof id === 'string' ? siblings?.find((c) => c.id === id) : undefined;
    const d = s?.data ?? {};
    return textOf(d.name) || textOf(d.subject_name) || textOf(d.title) || s?.label || (typeof id === 'string' ? id : '');
  };

  switch (component.type) {
    // ── headers ──────────────────────────────────────────────────────────
    case 'subject_header': {
      const name = textOf(data.subject_name) || label;
      if (!name) return '';
      const kind = textOf(data.subject_type);
      const person = kind === 'person' ? personLink(name, resolvePersonName) : name;
      const badges = bulletsOf(data.badges).map((b) => b.slice(2)).map((b) => `\`${b}\``).join(' ');
      const line = [textOf(data.tagline), badges].filter(Boolean).join(' · ');
      return [h(person), line ? `\n${line}` : ''].join('\n').trimEnd();
    }
    case 'section_header': {
      const title = textOf(data.title) || label;
      const subtitle = textOf(data.subtitle);
      return title ? (subtitle ? `${h(title)}\n\n*${subtitle}*` : h(title)) : '';
    }

    // ── people ───────────────────────────────────────────────────────────
    case 'person_card':
    case 'person': {
      const name = textOf(data.name) || textOf(data.display_name) || component.label || '';
      if (!name) return '';
      const link = personLink(name, resolvePersonName);
      const stakeholder = component.variant === 'stakeholder' || data.mode === 'stakeholder' || !!data.stance;
      const role = textOf(data.subject_role) || [textOf(data.role), textOf(data.company)].filter(Boolean).join(', ');
      const health = [textOf(data.health_tier).toLowerCase().replace(/_/g, ' '), textOf(data.trajectory)].filter(Boolean).join(', ');
      const insight = textOf(data.key_insight) || textOf(data.summary) || textOf(data.text) || textOf(data.tone_summary);
      const tags = Array.isArray(data.tags) ? bulletsOf(data.tags).map((t) => `\`${t.slice(2)}\``).join(' ') : '';
      const tail = [role, health && `*${health}*`, insight].filter(Boolean).join(' — ');
      const line = `- ${link}${tail ? ` — ${tail}` : ''}${tags ? ` ${tags}` : ''}`;
      if (!stakeholder) {
        const extra: string[] = [];
        if (textOf(data.card_spec_narrative)) extra.push('', `  ${textOf(data.card_spec_narrative)}`);
        for (const p of listOf(data.card_spec_patterns)) extra.push(`  - ${p}`);
        if (textOf(data.card_spec_prediction)) extra.push(`  - *${textOf(data.card_spec_prediction)}*`);
        if (textOf(data.flag_reason)) extra.push(`  - ⚑ ${textOf(data.flag_reason)}`);
        return [line, ...extra].join('\n');
      }
      // Stakeholder mode: the four quadrants are the whole point of the card.
      const rows: string[] = [];
      if (textOf(data.stance)) rows.push(`  - **Stance** — ${textOf(data.stance)}`);
      const quadrant = (key: string, title: string) => {
        const items = listOf(data[key]);
        if (items.length) rows.push(`  - **${title}**`, ...items.map((i) => `    - ${i}`));
      };
      quadrant('what_they_want', 'What they want');
      quadrant('what_they_can_block', 'What they can block');
      quadrant('what_signals_their_stance', 'What signals their stance');
      quadrant('your_leverage', 'Your leverage');
      return [line, ...rows].join('\n');
    }
    case 'team_grid': {
      const people = Array.isArray(data.people) ? (data.people as CompositionComponentLite[]) : [];
      const lines = people.map((p) => componentMarkdown({ ...p, type: 'person_card' }, depth + 1, resolvePersonName, siblings)).filter(Boolean);
      const count = typeof data.total_count === 'number' && data.total_count > people.length ? `*${people.length} of ${data.total_count}*` : '';
      return joinBlock(heading, count, lines, false);
    }
    case 'person_disambiguation': {
      const q = textOf(data.query_name);
      const rows = rowsToTable(data.candidates, ['name', 'role', 'company', 'relevance_reason']);
      return joinBlock(heading || (q ? h(`Which ${q}?`) : ''), textOf(data.context_hint), rows, false);
    }

    // ── prose-shaped ─────────────────────────────────────────────────────
    case 'text_block':
    case 'sticky_note':
    case 'shape':
      return joinBlock(heading, textOf(data.text) || textOf(data.content), []);
    case 'note_editor': {
      const text = textOf(data.initial_text);
      return text ? joinBlock(h(textOf(data.context_title) || label), text, []) : '';
    }
    case 'prepared_content':
      return joinBlock(heading, textOf(data.content), []);
    case 'offer_block': {
      // Cold-start onboarding (web: OfferBlockRenderer): Myu names the gap it
      // hit and asks for a calendar source once. The web's buttons run its own
      // OAuth / iCal / ICS flows; in the vault the options are named and the
      // doors are the plugin's (Settings → AskMyu → Connection). Copy is the
      // backend's, verbatim.
      const lead = textOf(data.lead);
      const gap = textOf(data.gap_line);
      const options = (Array.isArray(data.options) ? data.options : []).map((o) => textOf((o as Record<string, unknown>)?.label)).filter(Boolean);
      const trust = textOf(data.trust_line);
      const person = data.named_person && typeof data.named_person === 'object' ? (data.named_person as Record<string, unknown>) : null;
      const who = person ? textOf(person.name) : '';
      // In the pane the doors are real controls (canvasActions.ts), so the
      // options and the settings pointer are prose only in the vault note.
      const lines = mode === 'pane'
        ? [...(gap ? [gap] : []), ...(trust ? ['', `*${trust}*`] : [])]
        : [
          ...(gap ? [gap, ''] : []),
          ...(who ? [`re ${personLink(who, resolvePersonName)}${textOf(person?.when_text) ? ` \u2014 ${textOf(person?.when_text)}` : ''}`, ''] : []),
          ...(options.length ? [...options.map((o) => `- ${o}`), '', '*Connect a calendar under Settings \u2192 AskMyu \u2192 Connection.*'] : []),
          ...(trust ? ['', `*${trust}*`] : []),
        ];
      return lead || lines.length ? joinBlock(heading, lead, lines, false) : '';
    }
    case 'context_annotation': {
      const anchor = nameOfSibling(data.anchor_id);
      const text = textOf(data.text);
      if (!text) return '';
      const kind = textOf(data.severity) === 'warning' ? 'warning' : 'info';
      return callout(kind, anchor ? `re ${anchor}` : 'Note', text);
    }
    case 'severity_indicator': {
      const level = textOf(data.level) || 'attention';
      const kind = level === 'critical' ? 'danger' : level === 'urgent' ? 'warning' : 'info';
      return callout(kind, level.replace(/^./, (c) => c.toUpperCase()), textOf(data.context));
    }
    case 'signal_card': {
      // Cards already in vaults came from the model as headline/detail/statement;
      // the backend normalises new ones to title/description. Read both, or old
      // notes render as a bare heading with nothing under it.
      const desc = textOf(data.description) || textOf(data.detail);
      const rows = listOf(data.evidence);
      const foot = [textOf(data.related_entity) && `re ${personLink(textOf(data.related_entity), resolvePersonName)}`, textOf(data.source) && `via ${textOf(data.source)}`].filter(Boolean).join(' · ');
      const block = joinBlock(heading, desc, rows);
      return foot ? `${block}\n\n*${foot}*` : block;
    }
    case 'pattern_card': {
      const title = textOf(data.pattern_name) || label;
      const conf = typeof data.confidence === 'number' ? ` *(${Math.round(data.confidence * 100)}% confidence)*` : '';
      const body = [textOf(data.description) + conf, textOf(data.outcome_summary)].filter((s) => s.trim()).join('\n\n');
      const rows = rowsToTable(data.instances, ['context', 'date_range', 'detail', 'outcome']);
      return joinBlock(h(title), body, rows, false);
    }
    case 'advisor_panel': {
      const takes = Array.isArray(data.takes) ? (data.takes as Array<Record<string, unknown>>) : [];
      const rows = takes.map((t) => `**${labelOf(textOf(t.persona) || 'advisor')}** — ${textOf(t.text)}`).filter((r) => !r.endsWith('— '));
      return joinBlock(heading, textOf(data.triggering_event) && `*on: ${textOf(data.triggering_event)}*`, rows);
    }
    case 'move_node': {
      const who = textOf(data.actor);
      const n = typeof data.move_number === 'number' ? `${data.move_number}. ` : '';
      const body = quote(textOf(data.move_text));
      const notes = [textOf(data.unexpected_angle), textOf(data.annotation)].filter(Boolean).map((t) => `*${t}*`);
      return joinBlock(h(`${n}${who}`), body, notes, false);
    }

    // ── questions & decisions ────────────────────────────────────────────
    case 'reflection_prompt': {
      const q = textOf(data.question) || textOf(data.prompt) || textOf(data.text);
      const ctx = textOf(data.context);
      return joinBlock(heading, q ? quote(q) : '', ctx ? [`*${ctx}*`] : [], false);
    }
    case 'seed_follow_up':
    case 'inline_chat': {
      const q = textOf(data.prompt);
      return q ? joinBlock(heading, quote(q), listOf(data.options)) : '';
    }
    case 'decision_frame': {
      const q = textOf(data.question) || textOf(data.prompt);
      const rows: string[] = [];
      for (const o of Array.isArray(data.options) ? (data.options as Array<Record<string, unknown>>) : []) {
        const parts = [textOf(o.description), textOf(o.impact) && `impact: ${textOf(o.impact)}`, textOf(o.risk) && `risk: ${textOf(o.risk)}`].filter(Boolean);
        rows.push(`- **${textOf(o.label)}**${o.recommended ? ' ✓' : ''}${parts.length ? ` — ${parts.join(' · ')}` : ''}`);
      }
      const weighted = (key: string, title: string) => {
        const items = Array.isArray(data[key]) ? (data[key] as Array<Record<string, unknown>>) : [];
        if (!items.length) return;
        rows.push('', `**${title}**`, ...items.map((i) => `- ${textOf(i.text) || readableOf(i)}${textOf(i.weight) ? ` *(${textOf(i.weight)})*` : ''}`));
      };
      weighted('pros', 'For');
      weighted('cons', 'Against');
      const prereqs = listOf(data.prerequisites);
      if (prereqs.length) rows.push('', '**Before either**', ...prereqs.map((p) => `- [ ] ${p}`));
      const summary = textOf(data.summary);
      if (summary) rows.push('', `*${summary}*`);
      return joinBlock(heading, q ? quote(q) : '', rows, false);
    }
    case 'action_controls': {
      // In a pane or a thread the buttons ARE the actions; listing them as
      // bullets too printed every label twice (operator, 2026-09-01). A file
      // has no buttons, so there the list is the only record.
      if (mode === 'pane') return '';
      const actions = Array.isArray(data.actions) ? (data.actions as Array<Record<string, unknown>>) : [];
      return joinBlock(heading, '', actions.map((a) => textOf(a.label)).filter(Boolean));
    }
    case 'trackable': {
      const title = textOf(data.title) || label;
      const done = textOf(data.status) === 'completed' || textOf(data.status) === 'resolved';
      const bits = [textOf(data.status), textOf(data.due_date) && `due ${textOf(data.due_date)}`, typeof data.progress_percent === 'number' && `${data.progress_percent}%`, textOf(data.linked_person) && `with ${personLink(textOf(data.linked_person), resolvePersonName)}`].filter(Boolean);
      return `- [${done ? 'x' : ' '}] ${title}${bits.length ? ` — ${bits.join(' · ')}` : ''}`;
    }

    // ── structure: tables and timelines ──────────────────────────────────
    case 'comparison': {
      const left = (data.left ?? {}) as Record<string, unknown>;
      const right = (data.right ?? {}) as Record<string, unknown>;
      const lname = textOf(left.label) || 'Left';
      const rname = textOf(right.label) || 'Right';
      const rows: string[] = [];
      const dims = Array.isArray(data.dimensions) ? (data.dimensions as Array<Record<string, unknown>>) : [];
      if (dims.length) {
        rows.push(`| | ${lname} | ${rname} | |`, '| --- | --- | --- | --- |');
        for (const d of dims) rows.push(`| **${textOf(d.name)}** | ${cellOf('v', d.left_value)} | ${cellOf('v', d.right_value)} | ${textOf(d.alignment)}${textOf(d.detail) ? ` — ${cellOf('d', d.detail)}` : ''} |`);
      } else {
        const li = Array.isArray(left.items) ? (left.items as Array<Record<string, unknown>>) : [];
        const ri = Array.isArray(right.items) ? (right.items as Array<Record<string, unknown>>) : [];
        const keys = [...new Set([...li, ...ri].map((i) => textOf(i.key)))].filter(Boolean);
        if (keys.length) {
          rows.push(`| | ${lname} | ${rname} |`, '| --- | --- | --- |');
          for (const k of keys) rows.push(`| **${k}** | ${cellOf('v', li.find((i) => i.key === k)?.value)} | ${cellOf('v', ri.find((i) => i.key === k)?.value)} |`);
        }
      }
      const summary = textOf(data.summary);
      const block = joinBlock(heading, '', rows, false);
      return summary ? `${block}\n\n*${summary}*` : block;
    }
    case 'prediction_table': {
      const framing = [textOf(data.framing), textOf(data.horizon_label) && `*(${textOf(data.horizon_label)})*`].filter(Boolean).join(' ');
      const rows = rowsToTable(data.predictions, ['what', 'by_when', 'confidence', 'who_else_affected', 'context']);
      const block = joinBlock(heading, framing, rows, false);
      return textOf(data.footer) ? `${block}\n\n*${textOf(data.footer)}*` : block;
    }
    case 'timeline': {
      const events = Array.isArray(data.events) ? (data.events as Array<Record<string, unknown>>) : [];
      const lines = events.map((e) => {
        const when = textOf(e.date) || textOf(e.when);
        const what = [textOf(e.label) || textOf(e.text), textOf(e.description) || textOf(e.expandable_detail)].filter(Boolean).join(' — ');
        return when ? `- \`${when.slice(0, 10)}\` ${what}` : `- ${what}`;
      });
      const trend = textOf(data.trend);
      return joinBlock(heading, trend ? `*${trend}*` : '', lines, false);
    }
    case 'career_position_timeline': {
      const positions = Array.isArray(data.positions) ? (data.positions as Array<Record<string, unknown>>) : [];
      const span = (p: Record<string, unknown>) => `${p.start_year ?? '?'}–${p.end_year ?? (p.is_current ? 'now' : '?')}`;
      const rows = positions.map((p) => `- \`${span(p)}\` **${textOf(p.title)}**, ${textOf(p.company)}${p.is_current ? ' *(current)*' : ''}`);
      const parallel = Array.isArray(data.parallel_roles) ? (data.parallel_roles as Array<Record<string, unknown>>) : [];
      if (parallel.length) rows.push('', '**Alongside**', ...parallel.map((p) => `- \`${span(p)}\` ${textOf(p.title)}, ${textOf(p.company)}`));
      const s = (data.summary ?? {}) as Record<string, unknown>;
      const summary = [typeof s.total_years === 'number' && `${s.total_years} years`, typeof s.companies === 'number' && `${s.companies} companies`, textOf(s.primary_family), textOf(s.education)].filter(Boolean).join(' · ');
      return joinBlock(heading || h('Career'), summary ? `*${summary}*` : '', rows, false);
    }
    case 'micro_arc_timeline': {
      const phases = Array.isArray(data.phases) ? (data.phases as Array<Record<string, unknown>>) : [];
      const out: string[] = [];
      for (const ph of phases) {
        out.push((heading ? sub : h)(`${textOf(ph.name)}${textOf(ph.status) ? ` *(${textOf(ph.status)})*` : ''}`), '');
        const arcs = Array.isArray(ph.micro_arcs) ? (ph.micro_arcs as Array<Record<string, unknown>>) : [];
        for (const a of arcs) {
          const when = typeof a.timestamp === 'number' ? `\`${new Date(a.timestamp).toISOString().slice(0, 10)}\` ` : '';
          out.push(`- ${when}${textOf(a.summary)}${textOf(a.source_type) ? ` *(${textOf(a.source_type)})*` : ''}`);
        }
        out.push('');
      }
      return joinBlock(heading, '', out, false);
    }
    case 'career_trajectory': {
      const title = textOf(data.pattern_name) || label;
      const now = [textOf(data.current_phase_name) && `**Now: ${textOf(data.current_phase_name)}**`, textOf(data.current_phase_description)].filter(Boolean).join(' — ');
      const phases = Array.isArray(data.phases) ? (data.phases as Array<Record<string, unknown>>) : [];
      const rows = phases.map((p) => `- ${textOf(p.status) === 'current' ? '**' : ''}${textOf(p.name)}${textOf(p.status) === 'current' ? '**' : ''} — ${textOf(p.description)}${textOf(p.status) && textOf(p.status) !== 'current' ? ` *(${textOf(p.status)})*` : ''}`);
      const next = textOf(data.predicted_next_phase_name);
      if (next) rows.push('', `*Likely next: ${next}${Array.isArray(data.estimated_timeline_weeks) ? ` in ${cellOf('weeks', data.estimated_timeline_weeks)} weeks` : ''}*`);
      for (const [key, name] of [['risk_markers', 'Watch'], ['opportunity_markers', 'Openings']] as const) {
        const items = listOf(data[key]);
        if (items.length) rows.push('', `**${name}**`, ...items.map((i) => `- ${i}`));
      }
      return joinBlock(h(title), now, rows, false);
    }
    case 'branch_point': {
      const branches = Array.isArray(data.branches) ? (data.branches as Array<Record<string, unknown>>) : [];
      const rows = branches.map((b) => `- **${textOf(b.to_phase_name) || textOf(b.to_phase)}** — ${textOf(b.conditions)}${textOf(b.contextualized_narrative) ? `\n  *${textOf(b.contextualized_narrative)}*` : ''}`);
      const lean = textOf(data.current_lean);
      if (lean) rows.push('', `*Leaning: ${lean}${textOf(data.lean_reasoning) ? ` — ${textOf(data.lean_reasoning)}` : ''}*`);
      return joinBlock(heading || h(`From ${textOf(data.from_phase) || 'here'}`), '', rows, false);
    }
    case 'strategy_sequence': {
      const steps = Array.isArray(data.steps) ? (data.steps as Array<Record<string, unknown>>) : [];
      const rows: string[] = [];
      let phase = '';
      for (const s of steps) {
        if (textOf(s.phase) && textOf(s.phase) !== phase) { phase = textOf(s.phase); rows.push('', `**${phase}**`); }
        const who = textOf(s.person_name) ? ` with ${personLink(textOf(s.person_name), resolvePersonName)}` : '';
        rows.push(`${typeof s.step_number === 'number' ? s.step_number : rows.length + 1}. ${textOf(s.action)}${who}${textOf(s.timing) ? ` *(${textOf(s.timing)})*` : ''}${textOf(s.rationale) ? ` — ${textOf(s.rationale)}` : ''}`);
      }
      const body = [textOf(data.context), textOf(data.timing_note) && `*${textOf(data.timing_note)}*`].filter(Boolean).join('\n\n');
      return joinBlock(heading, body, rows, false);
    }
    case 'what_if_scenarios': {
      const rows = rowsToTable(data.scenarios, ['scenario', 'conditions', 'outcome_phase', 'outcome_probability', 'timeline_weeks']);
      const levers = rowsToTable(data.levers, ['lever', 'impact', 'current_signal', 'target_signal']);
      return joinBlock(heading, '', [...rows, ...(levers.length ? ['', '**Levers**', '', ...levers] : [])], false);
    }
    case 'possibility_space': {
      const rows: string[] = [];
      for (const [key, title] of [['natural_next_steps', 'Natural next steps'], ['pattern_aligned', 'Where your pattern points'], ['stretch_possibilities', 'Stretch'], ['cross_functional_pivots', 'Pivots']] as const) {
        const table = rowsToTable(data[key]);
        if (table.length) rows.push(`**${title}**`, '', ...table, '');
      }
      return joinBlock(heading, '', rows, false);
    }
    case 'career_pathway': {
      const from = (data.from ?? {}) as Record<string, unknown>;
      const to = (data.to ?? {}) as Record<string, unknown>;
      const title = label || (textOf(from.title) && textOf(to.title) ? `${textOf(from.title)} → ${textOf(to.title)}` : 'Pathway');
      const yrs = (data.estimated_years ?? {}) as Record<string, unknown>;
      const eta = typeof yrs.typical === 'number' ? `*~${yrs.typical} years${typeof yrs.optimistic === 'number' ? ` (${yrs.optimistic} if it goes well)` : ''}*` : '';
      const body = [textOf(data.narrative), eta, textOf(data.reason)].filter(Boolean).join('\n\n');
      const rows: string[] = [];
      const hops = Array.isArray(data.hops) ? (data.hops as Array<Record<string, unknown>>) : [];
      for (const hp of hops) rows.push(`${typeof hp.order === 'number' ? hp.order : rows.length + 1}. ${textOf(hp.from_title)} → ${textOf(hp.to_title)}${Array.isArray(hp.typical_years) ? ` *(${cellOf('years', hp.typical_years)} yrs)*` : ''}${textOf(hp.pattern_note) ? ` — ${textOf(hp.pattern_note)}` : ''}`);
      const gaps = rowsToTable(data.skill_gaps, ['skill', 'gap', 'user_level', 'target_level']);
      if (gaps.length) rows.push('', '**Skill gaps**', '', ...gaps);
      const signals = listOf(data.recognition_signals);
      if (signals.length) rows.push('', '**What gets you recognised**', ...signals.map((s) => `- ${s}`));
      const peers = Array.isArray(data.network_peers_on_path) ? (data.network_peers_on_path as Array<Record<string, unknown>>) : [];
      if (peers.length) rows.push('', '**People on this path**', ...peers.map((p) => `- ${personLink(textOf(p.display_name), resolvePersonName)}${textOf(p.current_title) ? `, ${textOf(p.current_title)}` : ''}`));
      return joinBlock(h(title), body, rows, false);
    }
    case 'statistical_context': {
      const head = [textOf(data.cohort) && `**${textOf(data.cohort)}**`, typeof data.sample_size === 'number' && `n=${data.sample_size}`, textOf(data.source)].filter(Boolean).join(' · ');
      const rows: string[] = [];
      if (typeof data.success_rate === 'number') rows.push(`- **Success rate** — ${Math.round(data.success_rate * 100)}%`);
      const uvc = (data.user_vs_cohort ?? {}) as Record<string, Record<string, unknown>>;
      const cmp = Object.entries(uvc);
      if (cmp.length) rows.push('', '| | You | Cohort |', '| --- | --- | --- |', ...cmp.map(([k, v]) => `| **${labelOf(k)}** | ${cellOf('v', v.user)} | ${cellOf('v', v.cohort_avg ?? v.cohort_threshold)} |`));
      if (textOf(data.confidence_note)) rows.push('', `*${textOf(data.confidence_note)}*`);
      return joinBlock(heading, head, rows, false);
    }
    case 'alignment_hierarchy': {
      const tiers = Array.isArray(data.tiers) ? (data.tiers as Array<Record<string, unknown>>) : [];
      const rows: string[] = [];
      for (const t of tiers) {
        const score = typeof t.score === 'number' ? ` ${Math.round(t.score * 100)}%` : '';
        rows.push(`- **${textOf(t.level)}${textOf(t.label) ? ` ${textOf(t.label)}` : ''}** — ${textOf(t.status)}${score}${textOf(t.summary) ? `: ${textOf(t.summary)}` : ''}`);
        if (textOf(t.their_stance)) rows.push(`  - them: ${textOf(t.their_stance)}`);
        if (textOf(t.your_stance)) rows.push(`  - you: ${textOf(t.your_stance)}`);
        for (const e of Array.isArray(t.evidence) ? (t.evidence as Array<Record<string, unknown>>) : []) rows.push(`  - \`${textOf(e.date)}\` ${textOf(e.preview)}${textOf(e.source) ? ` *(${textOf(e.source)})*` : ''}`);
        for (const a of listOf(t.actions)) rows.push(`  - → ${a}`);
      }
      const subj = textOf(data.subject_name);
      const head = [typeof data.overall_alignment_score === 'number' && `**${Math.round(data.overall_alignment_score * 100)}% aligned**`, typeof data.active_disagreement_count === 'number' && `${data.active_disagreement_count} open disagreements`, typeof data.lookback_days === 'number' && `last ${data.lookback_days} days`].filter(Boolean).join(' · ');
      return joinBlock(heading || (subj ? h(`Alignment with ${personLink(subj, resolvePersonName)}`) : ''), head, rows, false);
    }
    case 'budget_allocation': {
      const unit = textOf(data.budget_unit);
      const items = Array.isArray(data.items) ? (data.items as Array<Record<string, unknown>>) : [];
      const rows = items.length ? [`| | ${unit || 'Value'} |`, '| --- | ---: |', ...items.map((i) => `| ${textOf(i.label)} | ${cellOf('v', i.current_value)} |`)] : [];
      if (typeof data.total_budget === 'number' && rows.length) rows.push(`| **Total** | **${data.total_budget}** |`);
      const body = [textOf(data.constraint_text), textOf(data.reflection_text) && `*${textOf(data.reflection_text)}*`].filter(Boolean).join('\n\n');
      return joinBlock(heading, body, rows, false);
    }
    case 'perspective_panel': {
      const side = (key: string) => {
        const s = data[key] as Record<string, unknown> | undefined;
        if (!s) return [];
        const items = Array.isArray(s.items) ? (s.items as Array<Record<string, unknown>>) : [];
        return [`**${textOf(s.actor) || labelOf(key)}**`, ...items.map((i) => `- ${textOf(i.label)}: ${textOf(i.value)}`), ''];
      };
      const rows = [...side('left_perspective'), ...side('right_perspective')];
      const asym = rowsToTable(data.asymmetries, ['topic', 'left_view', 'right_view']);
      if (asym.length) rows.push('**Where the readings diverge**', '', ...asym);
      return joinBlock(heading, '', rows, false);
    }

    // ── process & change ─────────────────────────────────────────────────
    case 'process_card': {
      const bits = [textOf(data.cadence), textOf(data.current_state)].filter(Boolean).join(' · ');
      return joinBlock(h(textOf(data.title) || label), bits ? `*${bits}*\n\n${textOf(data.summary)}`.trim() : textOf(data.summary), []);
    }
    case 'change_suggestion':
      return joinBlock(h(textOf(data.title) || label), textOf(data.rationale), textOf(data.expected_effect) ? [`→ ${textOf(data.expected_effect)}${textOf(data.status) ? ` *(${textOf(data.status)})*` : ''}`] : [], false);
    case 'intervention_tracker': {
      const bits = [textOf(data.status), typeof data.watch_period_weeks === 'number' && `${data.watch_period_weeks}-week watch`, typeof data.started_at === 'number' && `since ${scalarOf('started_at', data.started_at)}`].filter(Boolean).join(' · ');
      const rows = [textOf(data.expected_effect) && `- **Expecting** — ${textOf(data.expected_effect)}`, textOf(data.latest_signal_value) && `- **Latest** — ${textOf(data.latest_signal_value)}`].filter(Boolean);
      return joinBlock(h(textOf(data.title) || label), bits ? `*${bits}*` : '', rows, false);
    }

    // ── drawn structure ──────────────────────────────────────────────────
    case 'diagram': {
      // Obsidian renders mermaid natively; this is the one component that
      // arrives BETTER here than as a canvas node. `source` is the wire field.
      const code = textOf(data.source) || textOf(data.mermaid) || textOf(data.definition) || textOf(data.code);
      if (!code) return joinBlock(heading, textOf(data.fallback_text), []);
      const caption = textOf(data.caption);
      return joinBlock(heading, '', ['```mermaid', code, '```', ...(caption ? ['', `*${caption}*`] : [])], false);
    }
    case 'chart': {
      // A chart's DATA is a table — that is its text form, and it is a better
      // one than a picture. Obsidian Charts (320k installs) reads a markdown
      // table as a chart source via "Create Chart from Table", so this renders
      // for everyone, survives uninstalling us, AND is one command away from
      // an interactive chart. `fallback_text` is the shape's own prose form
      // and goes underneath as the caption.
      const rc = (data.recharts_config ?? {}) as Record<string, unknown>;
      const vl = (data.vega_lite_spec ?? {}) as Record<string, unknown>;
      const vlData = (vl.data ?? {}) as Record<string, unknown>;
      const rows = rowsToTable(rc.data ?? vlData.values ?? data.data ?? data.rows);
      const caption = textOf(data.fallback_text) || textOf(data.summary) || textOf(data.caption);
      const src = textOf(data.data_source);
      if (rows.length === 0 && !caption) return joinBlock(heading, '', ['*No data in this chart yet.*'], false);
      return joinBlock(heading, '', [...rows, ...(caption ? ['', caption] : []), ...(src ? ['', `*source: ${src}*`] : [])], false);
    }
    case 'connection_overlay': {
      const from = nameOfSibling(data.from_id);
      const to = nameOfSibling(data.to_id);
      if (!from || !to) return '';
      const arrow = data.directional === false ? '↔' : '→';
      const kind = textOf(data.connection_type);
      return `- **${from} ${arrow} ${to}**${kind ? ` — ${kind}` : ''}${textOf(data.label) ? `: ${textOf(data.label)}` : ''}`;
    }
    case 'relationship_map': {
      const nodes = Array.isArray(data.nodes) ? (data.nodes as Array<Record<string, unknown>>) : [];
      const nameOf = new Map(nodes.map((n) => [textOf(n.id), textOf(n.name)]));
      const centre = (data.center_node ?? {}) as Record<string, unknown>;
      const rows = nodes.filter((n) => n.id !== centre.id).map((n) => `- ${textOf(n.type) === 'person' ? personLink(textOf(n.name), resolvePersonName) : textOf(n.name)}${textOf(n.health_tier) ? ` *(${textOf(n.health_tier).replace(/_/g, ' ')})*` : ''}`);
      const edges = Array.isArray(data.edges) ? (data.edges as Array<Record<string, unknown>>) : [];
      if (edges.length) rows.push('', ...edges.map((e) => `- ${nameOf.get(textOf(e.source)) || textOf(e.source)} ↔ ${nameOf.get(textOf(e.target)) || textOf(e.target)}${textOf(e.label) ? ` — ${textOf(e.label)}` : ''}`));
      return joinBlock(heading || (textOf(centre.name) ? h(`Around ${personLink(textOf(centre.name), resolvePersonName)}`) : ''), '', rows, false);
    }
    case 'hierarchy': {
      const walk = (node: Record<string, unknown>, indent: number): string[] => {
        const line = `${'  '.repeat(indent)}- ${textOf(node.label)}${textOf(node.health_tier) ? ` *(${textOf(node.health_tier).replace(/_/g, ' ')})*` : ''}`;
        const kids = Array.isArray(node.children) ? (node.children as Array<Record<string, unknown>>) : [];
        return [line, ...kids.flatMap((k) => walk(k, indent + 1))];
      };
      const root = data.root as Record<string, unknown> | undefined;
      return joinBlock(heading, '', root ? walk(root, 0) : [], false);
    }
    case 'circle_pack': {
      const nodes = Array.isArray(data.nodes) ? (data.nodes as Array<Record<string, unknown>>) : [];
      const groups = Array.isArray(data.groups) ? (data.groups as Array<Record<string, unknown>>) : [];
      const groupName = new Map(groups.map((g) => [textOf(g.id), textOf(g.label)]));
      const byGroup = new Map<string, string[]>();
      for (const n of nodes) {
        const g = groupName.get(textOf(n.group)) || textOf(n.group) || 'Ungrouped';
        byGroup.set(g, [...(byGroup.get(g) ?? []), `- ${personLink(textOf(n.label), resolvePersonName)}${typeof n.value === 'number' ? ` (${n.value})` : ''}${textOf(n.health_tier) ? ` *(${textOf(n.health_tier).replace(/_/g, ' ')})*` : ''}`]);
      }
      const rows = [...byGroup.entries()].flatMap(([g, lines]) => [`**${g}**`, ...lines, '']);
      return joinBlock(heading, '', rows, false);
    }
    case 'matrix_view': {
      const entities = Array.isArray(data.entities) ? (data.entities as Array<Record<string, unknown>>) : [];
      const cells = Array.isArray(data.cells) ? (data.cells as Array<Record<string, unknown>>) : [];
      if (!entities.length) return heading;
      const cell = new Map(cells.map((c) => [`${textOf(c.row_id)}|${textOf(c.col_id)}`, c]));
      const rows = [
        `| ${textOf(data.value_label) || ''} | ${entities.map((e) => textOf(e.label)).join(' | ')} |`,
        `| --- | ${entities.map(() => '---').join(' | ')} |`,
        ...entities.map((r) => `| **${textOf(r.label)}** | ${entities.map((c) => { const v = cell.get(`${textOf(r.id)}|${textOf(c.id)}`); if (!v) return ''; const n = cellOf('v', v.value); return textOf(v.label) ? `${n} (${textOf(v.label)})` : n; }).join(' | ')} |`),
      ];
      return joinBlock(heading, '', rows, false);
    }
    case 'venn_diagram': {
      const sets = Array.isArray(data.sets) ? (data.sets as Array<Record<string, unknown>>) : [];
      const setName = new Map(sets.map((s) => [textOf(s.id), textOf(s.label)]));
      const rows = sets.map((s) => `- **${textOf(s.label)}** — ${cellOf('size', s.size)}`);
      const inter = Array.isArray(data.intersections) ? (data.intersections as Array<Record<string, unknown>>) : [];
      for (const i of inter) {
        const names = (Array.isArray(i.sets) ? (i.sets as string[]) : []).map((id) => setName.get(id) || id).join(' ∩ ');
        const members = bulletsOf(i.members).map((m) => m.slice(2)).join(', ');
        rows.push(`- **${names}** — ${cellOf('size', i.size)}${members ? `: ${members}` : ''}`);
      }
      return joinBlock(heading, '', rows, false);
    }
    case 'card_section': {
      // Exactly a card section, so exactly the card renderer — one path.
      const s = normalizeSection({ section_type: textOf(data.section_type), title: textOf(data.section_title) || label, data: data.section_data });
      const rows = (s.items ?? []).filter((i) => i.text?.trim()).map((i) => `- ${i.text}${i.date ? ` *(${i.date})*` : ''}`);
      return joinBlock(h(s.title?.trim() || ''), s.narrative?.trim() || '', rows, false);
    }
    case 'container': {
      // Containers are headings in buildCompositionMarkdown; a container that
      // reaches here directly (canvas node) shows its cluster read, if any.
      const bits = [textOf(data.defining_characteristic), textOf(data.risk_label), textOf(data.departed_reason)].filter(Boolean);
      return joinBlock(h(textOf(data.label) || label), bits.join(' — '), []);
    }

    default:
      return generic();
  }
}

/** Myu/Me.md — the SELF card: the account's own arc, on its own paper. */
export function buildSelfMarkdown(card: CardSpecLite | null): string {
  const head = frontmatter([['type', 'myu-self'], [MYU_GENERATED_KEY, true]]);
  const parts: string[] = [head, '', '# Me'];
  let rendered = 0;
  // Legible memory (cold start, slice 7): what Myu knows so far, each line
  // with its source; a read is marked as a read, a gap as not yet.
  const facts = (card?.known_facts ?? []).filter((f) => f && typeof f.value === 'string' && f.value.trim());
  if (facts.length > 0) {
    rendered++;
    parts.push('', '## What Myu knows so far', '', '*Correct any of it under Settings \u2192 AskMyu \u2192 Account.*', '');
    for (const f of facts) {
      const key = (f.key ?? '').replace(/_/g, ' ');
      const src = f.source ? ` \u00b7 ${f.source}` : '';
      if (f.kind === 'read') parts.push(`- **${key}** \u2014 *${f.value}* (a read, worth testing${src})`);
      else if (f.kind === 'not_yet') parts.push(`- **not yet** \u2014 ${f.value}${src}`);
      else parts.push(`- **${key}** \u2014 ${f.value}${src}`);
    }
  }
  for (const rawSection of card?.sections ?? []) {
    const section = normalizeSection(rawSection);
    const title = section.title?.trim();
    const narrative = section.narrative?.trim();
    const items = (section.items ?? []).filter((i) => i.text?.trim());
    if (!narrative && items.length === 0) continue; // a bare title is not a section
    rendered++;
    parts.push('', `## ${title || 'Notes'}`);
    if (narrative) parts.push('', narrative);
    for (const item of items) {
      parts.push(`- ${item.text}${item.date ? ` *(${item.date})*` : ''}`);
    }
  }
  if (rendered === 0) {
    parts.push('', '*Myu is still forming its picture of you — this page fills in as it learns.*');
  }
  parts.push('', '*Maintained by Myu — how Myu currently sees you. Edits here are replaced.*', '');
  return parts.join('\n');
}

export function buildCompanyMarkdown(
  entity: EntityHeadline,
  card: CardSpecLite | null,
  peopleNames: string[],
  memories: Array<{ memory_text?: string; text?: string; created_at?: string }> = [],
  /** Where person notes live — the embedded people table filters inside it. */
  peopleFolder = 'Myu/People',
): string {
  const head = frontmatter([
    ['type', 'myu-company'],
    ['myu-id', entity.entity_id],
    [MYU_GENERATED_KEY, true],
    ['people', peopleNames.length],
    ['website', card?.header?.website_url ?? null],
    ['last_interaction', entity.last_contact ? entity.last_contact.slice(0, 10) : null],
  ]);

  const parts: string[] = [head, '', `# ${entity.display_name}`];

  // A LIVE table, not a hand-written list that goes stale between
  // regenerations: an embedded base over the People folder, filtered to the
  // people whose `company` links to THIS note (`this` is the embedding file).
  // The graph edge comes from the person side, so nothing is lost by dropping
  // the static wikilinks; the count stays in frontmatter for Bases.
  if (peopleNames.length > 0) {
    parts.push('', '## People', '', ...companyPeopleBase(peopleFolder));
  }

  for (const rawSection of card?.sections ?? []) {
    const section = normalizeSection(rawSection);
    const title = section.title?.trim();
    const narrative = section.narrative?.trim();
    const items = (section.items ?? []).filter((i) => i.text?.trim());
    // A titled section with nothing in it is a bare heading — the company
    // note had "What's happening here" and "Your people here" as empty
    // headings beside the real ones (operator's vault, 2026-08-29).
    if (!narrative && items.length === 0) continue;
    parts.push('', `## ${title || 'Notes'}`);
    if (narrative) parts.push('', narrative);
    for (const item of items) {
      parts.push(`- ${item.text}${item.date ? ` *(${item.date})*` : ''}`);
    }
  }

  const memoryLines = (Array.isArray(memories) ? memories : [])
    .map((m) => (m.memory_text ?? m.text ?? '').trim())
    .filter(Boolean);
  if (memoryLines.length > 0) {
    parts.push('', '## Memories');
    for (let i = 0; i < memoryLines.length; i++) {
      const when = memories[i]?.created_at ? ` *(${String(memories[i].created_at).slice(0, 10)})*` : '';
      parts.push(`- ${memoryLines[i]}${when}`);
    }
  }

  parts.push(
    '',
    '*Maintained by Myu — regenerated as things change. Edits here are replaced.*',
    '',
  );
  return parts.join('\n');
}

export function buildPersonMarkdown(
  entity: EntityHeadline,
  card: CardSpecLite | null,
  openCommitments: VaultCommitment[],
  checkedState: (myuId: string) => boolean,
  theirPageName: string | null,
  memories: Array<{ memory_text?: string; text?: string; created_at?: string }> = [],
  aliases: string[] = [],
): string {
  const head = frontmatter([
    ['type', 'myu-person'],
    ['myu-id', entity.entity_id],
    [MYU_GENERATED_KEY, true],
    // Role only when it's an actual title — the subtitle sometimes echoes the
    // company (no known title), which read as role=JustAI, company=JustAI
    // (operator, 2026-08-25). If they match, the role is unknown, not the org.
    ['role', entity.subtitle && entity.subtitle !== entity.organization ? entity.subtitle : null],
    // A WIKILINK (2026-08-29): Bases reads a quoted wikilink as a Link, so the
    // People table groups by company as a link, the graph gets the edge, and the
    // company note's embedded people table can filter `company == this`. (It was
    // a plain string from before Bases typed links.)
    ['company', entity.organization ? `[[${sanitizeName(entity.organization)}]]` : null],
    ['open_commitments', openCommitments.length],
    // People.base computes "Days quiet" from this; it was never written, so the
    // column was blank for all 47 people (2026-08-29).
    ['last_interaction', entity.last_contact ? entity.last_contact.slice(0, 10) : null],
    // FACTS the web card has always shown (parity review 2026-08-26). In
    // frontmatter because they are Bases columns a CRM actually wants —
    // P8.1 bars VERDICTS from frontmatter, not facts.
    ['email', card?.header?.email_primary ?? null],
    ['linkedin', card?.header?.linkedin_url ?? null],
    // Only when provably safe — see safeFirstNameAlias(). Without it a user
    // writing [[Marcus]] never reaches the generated Marcus Webb.md, which is
    // why P8.1 specified aliases in the first place.
    ['aliases', aliases],
    // Date only — a Bases formula turns this into "days quiet", and a
    // frontmatter timestamp down to the second would churn the file on every
    // regenerate without changing what the column says.
    ['last_interaction', entity.last_contact ? entity.last_contact.slice(0, 10) : null],
  ]);

  const parts: string[] = [head, '', `# ${entity.display_name}`];
  // A visible door from the static note to the interactive card (confirm
  // identity, supply LinkedIn, board takes) — "what card pane?" otherwise
  // (2026-08-25). The protocol handler resolves the name to the entity.
  parts.push('', `[Open in Myu ▸](obsidian://myu-card?name=${encodeURIComponent(entity.display_name)})`);
  if (entity.organization) {
    parts.push('', `Company: [[${sanitizeName(entity.organization)}]]`);
  }
  if (theirPageName) {
    parts.push('', `Their page: [[${theirPageName}]]`);
  }

  // Card sections, verbatim — the same text CardView renders, on paper because
  // the user consented to paper. No verdict lands in frontmatter (spec: body
  // prose keeps its evidence framing; frontmatter is the most-scanned surface).
  for (const rawSection of card?.sections ?? []) {
    const section = normalizeSection(rawSection);
    const title = section.title?.trim();
    const narrative = section.narrative?.trim();
    const items = (section.items ?? []).filter((i) => i.text?.trim());
    // A titled section with nothing in it was a bare heading — five of them on a
    // person Myu knows nothing about yet (operator's vault, 2026-08-29).
    if (!narrative && items.length === 0) continue;
    parts.push('', `## ${title || 'Notes'}`);
    if (narrative) parts.push('', narrative);
    for (const item of items) {
      parts.push(`- ${item.text}${item.date ? ` *(${item.date})*` : ''}`);
    }
  }

  if (openCommitments.length > 0) {
    parts.push('', '## Commitments');
    for (const c of openCommitments) {
      parts.push(commitmentLine(c, checkedState(c.commitment_id)));
    }
  }

  // The memory layer — the same relationship memories the web card shows.
  // Their absence made the vault page a THINNER Jim than the web's Jim
  // (operator finding, 2026-08-25), which breaks residency: the vault copy
  // must never be the lesser copy.
  const memoryLines = (Array.isArray(memories) ? memories : [])
    .map((m) => (m.memory_text ?? m.text ?? '').trim())
    .filter(Boolean);
  if (memoryLines.length > 0) {
    parts.push('', '## Memories');
    for (let i = 0; i < memoryLines.length; i++) {
      const when = memories[i]?.created_at ? ` *(${String(memories[i].created_at).slice(0, 10)})*` : '';
      parts.push(`- ${memoryLines[i]}${when}`);
    }
  }

  if (!parts.some((p) => p.startsWith('## '))) {

    parts.push('', '*Nothing here yet \u2014 Myu fills this in as things happen.*');

  }

  parts.push(
    '',
    '*Maintained by Myu — regenerated as things change. Ticking a checkbox marks it done in Myu; other edits here are replaced.*',
    '',
  );
  return parts.join('\n');
}

/** Myu/Today.md — the brief as a mountable file (`![[Myu/Today]]`). */
export function buildTodayMarkdown(
  briefDate: string,
  sections: Array<{ title?: string; items: string[] }>,
): string {
  const head = frontmatter([
    ['type', 'myu-today'],
    [MYU_GENERATED_KEY, true],
    ['date', briefDate],
  ]);
  const parts: string[] = [head, '', `# From Myu — ${briefDate}`];
  for (const section of sections) {
    if (section.items.length === 0) continue;
    if (section.title) parts.push('', `## ${section.title}`);
    for (const item of section.items) parts.push(`- ${item}`);
  }
  if (sections.every((s) => s.items.length === 0)) {
    parts.push('', 'Nothing needs you yet today.');
  }
  parts.push('');
  return parts.join('\n');
}

/** Myu/Week.md — the server weekly edition as a file. */
export function buildWeekMarkdown(edition: WeeklyEdition): string {
  const head = frontmatter([
    ['type', 'myu-week'],
    [MYU_GENERATED_KEY, true],
    ['period', edition.period],
  ]);
  const parts: string[] = [head, '', `# The week — ${edition.period}`];
  for (const section of edition.sections) {
    parts.push('', `## ${section.section}`, '', section.line);
    for (const item of section.items ?? []) parts.push(`- ${item}`);
  }
  parts.push('');
  return parts.join('\n');
}

/** Myu/Commitments.md — the rollup; open first, done collapsed below. */
export function buildCommitmentsMarkdown(
  commitments: VaultCommitment[],
  checkedState: (myuId: string) => boolean,
): string {
  const head = frontmatter([
    ['type', 'myu-commitments'],
    [MYU_GENERATED_KEY, true],
    ['open', commitments.length],
  ]);
  const parts: string[] = [head, '', '# Commitments'];
  if (commitments.length === 0) {
    parts.push('', 'Nothing open right now.');
  } else {
    parts.push('');
    for (const c of commitments) {
      parts.push(commitmentLine(c, checkedState(c.commitment_id)));
    }
  }
  parts.push(
    '',
    '*Maintained by Myu from your meetings. Tick a box to mark it done in Myu.*',
    '',
  );
  return parts.join('\n');
}

/**
 * The starter Base over Myu/People — so the CRM view exists the moment consent
 * lands, in core Obsidian, zero plugins. Written ONCE, never regenerated: the
 * user owns this file after creation, so their tweaks survive (delete it and
 * refresh to get a fresh copy).
 *
 * Uses the canonical Bases schema (verified against kepano/obsidian-skills,
 * 2026-08-21): a formula column for open threads, display names in the
 * product's register, a table grouped by company, and a cards view for the
 * gallery read. Embeddable anywhere with `![[<folder>/People.base]]`.
 */
/** The ```base block a company note embeds: its people, live, by link. */
export function companyPeopleBase(peopleFolder: string): string[] {
  return [
    '```base',
    'filters:',
    '  and:',
    `    - file.inFolder("${peopleFolder}")`,
    '    - \'type == "myu-person"\'',
    '    - company == this',
    'formulas:',
    '  days_quiet: \'if(last_interaction, (today() - date(last_interaction)).days, "")\'',
    'properties:',
    '  role:',
    '    displayName: Role',
    '  formula.days_quiet:',
    '    displayName: Days quiet',
    'views:',
    '  - type: table',
    '    name: People here',
    '    order:',
    '      - file.name',
    '      - role',
    '      - formula.days_quiet',
    '```',
  ];
}

/**
 * Myu/Companies.base — the companies table, beside People.base. Written ONCE,
 * user-owned after that, like People.base.
 */
export function buildCompaniesBase(companiesFolder: string): string {
  return [
    'filters:',
    '  and:',
    `    - file.inFolder("${companiesFolder}")`,
    '    - \'type == "myu-company"\'',
    'formulas:',
    '  days_quiet: \'if(last_interaction, (today() - date(last_interaction)).days, "")\'',
    'properties:',
    '  people:',
    '    displayName: People',
    '  website:',
    '    displayName: Website',
    '  formula.days_quiet:',
    '    displayName: Days quiet',
    'views:',
    '  - type: table',
    '    name: Companies',
    '    order:',
    '      - file.name',
    '      - people',
    '      - formula.days_quiet',
    '      - website',
    '    sort:',
    '      - property: people',
    '        direction: DESC',
    '  - type: cards',
    '    name: Gallery',
    '    order:',
    '      - file.name',
    '      - people',
    '',
  ].join('\n');
}

export function buildPeopleBase(peopleFolder: string): string {
  return [
    'filters:',
    '  and:',
    `    - file.inFolder("${peopleFolder}")`,
    '    - \'type == "myu-person"\'',
    'formulas:',
    '  threads: \'if(open_commitments > 0, open_commitments + " open", "—")\'',
    '  days_quiet: \'if(last_interaction, (today() - date(last_interaction)).days, "")\'',
    'properties:',
    '  role:',
    '    displayName: Role',
    '  company:',
    '    displayName: Company',
    '  formula.threads:',
    '    displayName: Open commitments',
    '  formula.days_quiet:',
    '    displayName: Days quiet',
    'views:',
    '  - type: table',
    '    name: People',
    '    order:',
    '      - file.name',
    '      - role',
    '      - company',
    '      - formula.days_quiet',
    '      - formula.threads',
    '    groupBy:',
    '      property: company',
    '      direction: ASC',
    '  - type: cards',
    '    name: Gallery',
    '    order:',
    '      - file.name',
    '      - role',
    '      - formula.days_quiet',
    '      - formula.threads',
    '',
  ].join('\n');
}
