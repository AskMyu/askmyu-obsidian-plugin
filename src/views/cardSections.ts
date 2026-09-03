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

export interface SectionBlock {
  kind: 'narrative' | 'row';
  text: string;
  /** Mono-prefix (date, intensity, count) rendered in the row's time slot. */
  meta?: string;
  /** Provenance, when the item carries it — the web's source icon → SourceDetailModal. */
  source?: { type: string; id: string };
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
      if (typeof t === 'string' && t.trim()) rows.push({ text: t, date: it?.date as string | undefined, ...extra });
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
  for (const key of ['dimensions', 'entries', 'events', 'voiced_narrative']) {
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
    for (const d of dimensions) {
      if (!d?.name) continue;
      blocks.push({ kind: 'row', text: d.evidence?.trim() || d.name, meta: `${d.name} · ${d.intensity ?? '—'}` });
    }
  }

  const entries = section.entries as Array<{ display_name?: string; entity_name?: string; mention_count?: number; overall_trend?: string }> | undefined;
  if (Array.isArray(entries)) {
    for (const e of entries) {
      const name = e?.display_name || e?.entity_name;
      if (!name) continue;
      const meta = [e.mention_count != null ? `×${e.mention_count}` : null, e.overall_trend ?? null]
        .filter(Boolean)
        .join(' · ');
      blocks.push({ kind: 'row', text: name, meta: meta || undefined });
    }
  }

  const events = section.events as Array<{ description?: string; summary?: string; label?: string; date?: string; change_type?: string }> | undefined;
  if (Array.isArray(events)) {
    for (const e of events) {
      const text = e?.description || e?.summary || e?.label || e?.change_type;
      if (!text) continue;
      blocks.push({ kind: 'row', text, meta: e.date });
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
