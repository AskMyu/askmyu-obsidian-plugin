/**
 * Card-section renderability — the answer to "does the generic renderer
 * silently drop this?" made into a function instead of a hope.
 *
 * Three layers keep drops loud (parity register, 2026-08-21):
 *  1. THIS module: a pure (section → blocks) extraction the tests can hit
 *     without a vault. It renders narrative + items like before, and adds
 *     structural DEGRADES for the known visual shapes (weather dimensions,
 *     energy-map entries, timeline events) so they arrive as honest text rows
 *     instead of vanishing.
 *  2. CardView: any section that yields nothing is COUNTED and disclosed as a
 *     pane row — "N sections don't render here yet — open on the web ▸".
 *     R7: capacity/capability gating must be visible, never silent.
 *  3. `src/wire/parity.ts` (monorepo-only): a Record over the CANONICAL
 *     CardSectionType union — when the web team ships a new section type,
 *     tsc fails here until it gets a disposition. Silent drop → build error.
 *
 * Probing is structural (loose records), because CardSpecLite deliberately
 * vendors a subset: the wire carries the full shapes, the type doesn't.
 */

import { timelineSourceWords, timelineWhen } from '../cardTimeline';
import { energyMentionsWords, energyRows, patternInstanceText, patternInstanceWhen, predictionScoreShown, weatherName } from '../selfCard';
import { cardDayWords } from '../cardDays';

export interface SectionBlock {
  kind: 'narrative' | 'row';
  text: string;
  /** Mono-prefix (date, intensity, count) rendered in the row's time slot. */
  meta?: string;
  /** Provenance, when the item carries it — the web's source icon → SourceDetailModal. */
  source?: { type: string; id: string };
}

/**
 * A row's day in the card's words (2026-10-06): a memory's stamp, a task's due day ("due 30 Sep", kept as its midnight
 * UTC) or a dated item's day — the pane and the notes used to show none of these, or a machine date. Words the server
 * wrote for a day stay as they are.
 */
function rowDay(it: Record<string, unknown>): string | undefined {
  // An overdue goal or task says so, as the web's badge and the terminal do ("overdue · due 30 Sep").
  const overdue = it?.overdue === true || it?.status === 'overdue' ? 'overdue' : null;
  const due = it?.due_date != null && it.due_date !== '' ? cardDayWords(it.due_date, { utc: true }) : null;
  if (due || overdue) return [overdue, due ? `due ${due}` : null].filter(Boolean).join(' \u00b7 ');
  const day = cardDayWords(it?.date ?? it?.memory_date);
  if (day) return day;
  return typeof it?.date === 'string' && it.date.trim() && !/\d{4}-\d{2}-\d{2}|^\d{9,}$/.test(it.date) ? it.date : undefined;
}

/** The web shows "Discuss with Myu" on these sections only (CardDeepDive.tsx:137-142). */
export const DISCUSSABLE_SECTION_TYPES = new Set(['patterns', 'predictions', 'threads', 'weather']);
export function isDiscussable(section: { section_type?: string; actionable?: boolean }): boolean {
  return section.actionable === true && DISCUSSABLE_SECTION_TYPES.has(section.section_type ?? '');
}

/** The web's `buildCardSectionContext` + composer seed, for one section. */
export function sectionDiscussSeed(card: { entity_id?: string; header?: { display_name?: string } }, entityType: string, section: { section_id?: string; section_type?: string; title?: string; narrative?: string }, blocks: SectionBlock[]): { text: string; source_id: string; section_content: string; section_narrative: string } {
  const name = card.header?.display_name ?? '';
  return {
    text: `About ${name} \u2014 ${(section.title ?? section.section_type ?? '').toLowerCase()}: `,
    source_id: `${card.entity_id ?? ''}:${section.section_id ?? section.section_type ?? ''}`,
    section_content: blocks.filter((b) => b.kind === 'row').map((b) => b.text).join('\n'),
    section_narrative: section.narrative ?? blocks.find((b) => b.kind === 'narrative')?.text ?? '',
  };
}

interface LooseSection {
  section_type?: string;
  title?: string;
  narrative?: string;
  items?: Array<{ text?: string; date?: string; source_type?: string; source_id?: string; title?: string; subtitle?: string }>;
  [key: string]: unknown;
}

/**
 * Card sections nest their real content under `data` with type-specific keys
 * (`data.text` for narrative, `data.bullets` for bio, `data.items[].content`
 * for memories, `data.narrative` for career). The readers below expect flat
 * `narrative`/`items`, so a section rendered without this normalization shows
 * a bare title and nothing else (operator, 2026-08-25: "her note is limited").
 * Normalize once, alias the keys, and both the pane and the note builder work.
 */
export function normalizeSection(raw: LooseSection): LooseSection {
  const data = (raw.data && typeof raw.data === 'object' ? raw.data : raw) as Record<string, unknown>;
  const out: LooseSection = { section_type: raw.section_type, title: raw.title };

  // Narrative: bio/career/narrative all speak through text|narrative.
  const text = data.text ?? data.narrative ?? raw.narrative;
  if (typeof text === 'string' && text.trim()) out.narrative = text;

  // Rows: items[].text|content, or bio's bullets (bare strings).
  const rows: Array<{ text?: string; date?: string; source_type?: string; source_id?: string; title?: string; subtitle?: string }> = [];
  if (Array.isArray(data.items)) {
    for (const it of data.items as Array<Record<string, unknown>>) {
      const t = (it?.text ?? it?.content) as string | undefined;
      // Provenance (memories) and the sources section's title/subtitle ride along.
      const extra = {
        ...(typeof it?.source_type === 'string' && typeof it?.source_id === 'string' ? { source_type: it.source_type, source_id: it.source_id } : {}),
        ...(typeof it?.title === 'string' ? { title: it.title } : {}),
        ...(typeof it?.subtitle === 'string' ? { subtitle: it.subtitle } : {}),
      };
      if (typeof t === 'string' && t.trim()) rows.push({ text: t, date: rowDay(it), ...extra });
      else if (raw.section_type === 'sources' && typeof it?.title === 'string' && it.title.trim()) rows.push({ ...extra, date: it?.date as string | undefined });
    }
  }
  if (Array.isArray(data.bullets)) {
    for (const b of data.bullets as unknown[]) {
      if (typeof b === 'string' && b.trim()) rows.push({ text: b });
    }
  }
  if (rows.length > 0) out.items = rows;

  // The structural shapes pass straight through for the degrade renderers.
  for (const key of ['dimensions', 'entries', 'events', 'voiced_narrative', 'patterns', 'predictions', 'top_prediction', 'placeholder_text']) {
    if (data[key] !== undefined) (out as Record<string, unknown>)[key] = data[key];
  }
  return out;
}

/** Everything the pane can honestly show for this section. Empty = disclose. */
export function sectionBlocks(rawSection: LooseSection): SectionBlock[] {
  const section = normalizeSection(rawSection);
  const blocks: SectionBlock[] = [];

  if (typeof section.narrative === 'string' && section.narrative.trim()) {
    blocks.push({ kind: 'narrative', text: section.narrative });
  }
  for (const item of Array.isArray(section.items) ? section.items : []) {
    const source = item?.source_type && item?.source_id ? { type: item.source_type, id: item.source_id } : undefined;
    if (item?.text?.trim()) blocks.push({ kind: 'row', text: item.text, meta: item.date, source });
    // The sources section: the web's provenance rows carry a title, not text.
    else if (section.section_type === 'sources' && item?.title?.trim()) blocks.push({ kind: 'row', text: item.title, meta: item.subtitle, source });
  }

  // Structural degrades for the known visual shapes. Text-honest versions of
  // what the web draws — a row per dimension/entry/event, never a fake chart.
  const dimensions = section.dimensions as Array<{ name?: string; intensity?: string; evidence?: string }> | undefined;
  if (Array.isArray(dimensions)) {
    // The weather (2026-10-05): the server's reading, with the dimension in words beside it. The bars' fill code
    // ("empty", "partial", "filled") is never shown: "empty" is also the self weather's lowest reading.
    for (const d of dimensions) {
      const reading = d?.evidence?.trim();
      if (!d?.name || !reading) continue;
      const name = weatherName(d.name);
      blocks.push({ kind: 'row', text: reading, meta: name.charAt(0).toUpperCase() + name.slice(1) });
    }
  }

  // The energy map (2026-10-05): one row per person, how often they came up and the trend in words — the analyzer's enum
  // ("DEPLETING") is never shown.
  const entries = section.entries as Parameters<typeof energyRows>[0] | undefined;
  if (Array.isArray(entries)) {
    for (const r of energyRows(entries)) {
      const meta = [r.mentions != null ? energyMentionsWords(r.mentions) : null, r.trend, r.depletion ? 'may be draining you' : null]
        .filter(Boolean)
        .join(' · ');
      blocks.push({ kind: 'row', text: r.name, meta: meta || undefined });
    }
  }

  // Patterns (2026-10-05): the name and the sentence, then each instance by the day and its words; never a confidence, a
  // severity or a trend symbol. Nothing complete yet: the server's own words for it.
  const patterns = section.patterns as Array<{ pattern_name?: string; description?: string; instances?: Array<{ context?: string; detail?: string; date_range?: string }> }> | undefined;
  const placeholder = typeof section.placeholder_text === 'string' ? section.placeholder_text.trim() : '';
  if (Array.isArray(patterns) && !patterns.length && placeholder && !blocks.length) blocks.push({ kind: 'narrative', text: placeholder });
  if (Array.isArray(patterns)) {
    for (const p of patterns) {
      const head = [p?.pattern_name?.trim(), p?.description?.trim()].filter(Boolean).join(': ');
      if (!head) continue;
      blocks.push({ kind: 'row', text: head });
      for (const i of p.instances ?? []) {
        // Its words with its day beside them; an instance with nothing written then is its day alone (as the web and the
        // terminal show it).
        const words = patternInstanceText(i);
        const when = patternInstanceWhen(i);
        if (words) blocks.push({ kind: 'row', text: `↳ ${words}`, meta: when ?? undefined });
        else if (when) blocks.push({ kind: 'row', text: `↳ ${when}` });
      }
    }
  }

  // Predictions (2026-10-05): the sentence; its number only with what it rests on, and that beside it.
  const predictions = section.predictions as Array<{ prediction?: string; label?: string; score?: number; basis?: string }> | undefined;
  if (Array.isArray(predictions)) {
    for (const p of predictions) {
      const text = p?.prediction?.trim() || p?.label?.trim();
      if (!text) continue;
      const shown = predictionScoreShown(p);
      const meta = [shown && typeof p.score === 'number' ? `${Math.round(p.score * 100)}%` : null, shown ? p.basis?.trim() : null].filter(Boolean).join(' · ');
      blocks.push({ kind: 'row', text, meta: meta || undefined });
    }
  }

  // Career: the next phase by its name, when the server fills it.
  const next = (section.top_prediction as { next_phase_name?: string } | undefined)?.next_phase_name?.trim();
  if (next) blocks.push({ kind: 'row', text: `Next: ${next}` });

  // A timeline (2026-10-03): what happened (the event's title, its description beside it when there is one) and the
  // day as a person says it. The self card's events carry a title only, so reading description/summary alone dropped
  // them all; a shift's change_type is a code and never the text.
  // Recent activity's items (2026-10-04) carry their words in `text`, the server's ("You said he reports to Hannah Cole
  // (22 Oct)"); without it they were dropped.
  const events = section.events as Array<{ title?: string; text?: string; description?: string; summary?: string; label?: string; date?: string; date_ms?: number; event_type?: string; kind?: string; source?: string; current?: boolean }> | undefined;
  if (Array.isArray(events)) {
    for (const e of events) {
      if (!e) continue;
      const what = e.title || e.text || e.description || e.summary || e.label;
      if (!what) continue;
      const more = e.title && e.description ? ` — ${e.description}` : '';
      // A structure fact carries its date and source in its words ("An email from Hannah that you were copied on, 24 Nov").
      const from = e.kind === 'structure' ? null : timelineSourceWords(e.source);
      const text = `${what}${more}${e.current ? ' (now)' : ''}${from ? ` · ${from}` : ''}`;
      blocks.push({ kind: 'row', text, meta: timelineWhen(e) || undefined });
    }
  }

  // org_lens voiced narrative — the VOICE-model sentences are made for reading.
  const voiced = section.voiced_narrative as Record<string, unknown> | undefined;
  if (voiced && typeof voiced === 'object') {
    for (const value of Object.values(voiced)) {
      if (typeof value === 'string' && value.trim()) blocks.push({ kind: 'narrative', text: value });
    }
  }

  return blocks;
}
