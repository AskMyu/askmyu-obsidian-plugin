/**
 * The self card's rules (2026-10-05; BRIEF_WEB_SELF_CARD_20261005): shared `types/selfCard.ts`, copied word for word from
 * its first declaration (only types cross the plugin's boundary; `tests/internal/selfCardParity.test.ts` holds the copy).
 * The shapes it reads are the wire's, as the card sends them.
 */

import { cardDayWords } from './cardDays';

type KnownFact = { key?: string; value: string; full?: string; source?: string; kind?: string };
type EnergyEntry = { entity_id?: string; entity_type?: string; display_name?: string; entity_name?: string; mention_count?: number; overall_trend?: string; depletion_risk?: boolean };
type PredictionEntry = { basis?: string };
type PatternInstance = { context?: string; detail?: string; date_range?: string };
type CardTile = { label?: string; value?: string; sub_value?: string };
type HotItem = { text?: string; urgency?: string };

/** The known facts' fixed words (the expanded card's, 2026-09). */
export const KNOWN_FACT_WORDS = {
  title: 'What I know so far · correct me',
  guess: 'Myu’s guess, not confirmed',
  correct: 'correct me ▸',
} as const;

/** A known fact's words: at the deep dive the whole read (`full`), else its one line (`value`). */
export function knownFactText(f: Pick<KnownFact, 'value' | 'full'>, full: boolean): string {
  return (full && f.full?.trim()) || f.value;
}

const FACT_SOURCE_WORDS: Record<string, string> = {
  linkedin: 'from LinkedIn',
  you: 'you said',
  calendar: 'from your calendar',
  mail: 'from your email',
};

/**
 * Where a known fact came from, in words; a read says it is Myu's guess. Never the source's code. A gap ("not yet") is
 * what Myu cannot see yet: no source.
 */
export function knownFactSource(f: Pick<KnownFact, 'source' | 'kind'>): string | null {
  if (f.kind === 'not_yet') return null;
  if (f.kind === 'read' || f.source === 'read') return KNOWN_FACT_WORDS.guess;
  return FACT_SOURCE_WORDS[f.source ?? ''] ?? null;
}

const FACT_LABELS: Record<string, string> = {
  you: 'you',
  read: 'Myu’s read',
  week: 'this week',
  mail: 'your email',
  not_yet: 'not yet',
};

/** A known fact's label in words (the server's key is a code: "not_yet"); a key it does not know, with spaces. */
export function knownFactLabel(f: Pick<KnownFact, 'key' | 'kind'>): string {
  if (f.kind === 'not_yet') return FACT_LABELS.not_yet;
  return FACT_LABELS[f.key ?? ''] ?? String(f.key ?? '').replace(/_/g, ' ');
}

export type EnergyTrendWord = 'draining' | 'sustaining' | 'energizing';

/**
 * The energy map's trend in the client's words: the server's (`draining`, `sustaining`, `energizing`), or the
 * analyzer's enum mapped until it sends words (`DEPLETING`, `SUSTAINING`, `ENERGIZING`); anything else, none.
 */
export function energyTrendWord(trend: string | null | undefined): EnergyTrendWord | null {
  const t = (trend ?? '').trim().toLowerCase();
  if (t === 'draining' || t === 'depleting') return 'draining';
  if (t === 'sustaining') return 'sustaining';
  if (t === 'energizing') return 'energizing';
  return null;
}

/** One person on the energy map: the mentions and the allocation joined. */
export interface EnergyRow {
  key: string;
  name: string;
  entity_id?: string;
  entity_type?: EnergyEntry['entity_type'];
  /** How often they came up (null: no count). */
  mentions: number | null;
  trend: EnergyTrendWord | null;
  /** True only when the trend does not already say so ("may be draining you"). */
  depletion: boolean;
}

/**
 * One row per person, in the order first met: the same person's mention and allocation entries joined, by id, else by
 * name — by name only when one side has no id, so two people who share a name stay two rows.
 */
export function energyRows(entries: readonly EnergyEntry[] | null | undefined): EnergyRow[] {
  const rows: EnergyRow[] = [];
  const byKey = new Map<string, EnergyRow>();
  for (const e of entries ?? []) {
    const name = (e.display_name ?? e.entity_name ?? '').trim();
    if (!name && !e.entity_id) continue;
    const nameKey = `name:${name.toLowerCase()}`;
    const byName = name ? byKey.get(nameKey) : undefined;
    const row = (e.entity_id && byKey.get(`id:${e.entity_id}`)) || (byName && (!e.entity_id || !byName.entity_id) ? byName : undefined);
    const trend = energyTrendWord(e.overall_trend);
    const mentions = typeof e.mention_count === 'number' && e.mention_count > 0 ? e.mention_count : null;
    if (row) {
      if (mentions != null) row.mentions = (row.mentions ?? 0) + mentions;
      row.trend = row.trend ?? trend;
      row.depletion = row.depletion || !!e.depletion_risk;
      row.entity_id = row.entity_id ?? e.entity_id;
      row.entity_type = row.entity_type ?? e.entity_type;
      if (row.name === 'Someone' && name) row.name = name;
      if (e.entity_id) byKey.set(`id:${e.entity_id}`, row);
      continue;
    }
    const next: EnergyRow = { key: e.entity_id ? `id:${e.entity_id}` : nameKey, name: name || 'Someone', entity_id: e.entity_id, entity_type: e.entity_type, mentions, trend, depletion: !!e.depletion_risk };
    rows.push(next);
    if (e.entity_id) byKey.set(`id:${e.entity_id}`, next);
    if (name && !byKey.has(nameKey)) byKey.set(nameKey, next);
  }
  for (const r of rows) r.depletion = r.depletion && r.trend !== 'draining';
  return rows;
}

/** How often a person came up, in words ("came up 7 times"); the energy map's count never stands alone. */
export function energyMentionsWords(n: number): string {
  return `came up ${n} ${n === 1 ? 'time' : 'times'}`;
}

const WEATHER_NAMES: Record<string, string> = { external_pressure: 'outside pressure' };

/** A weather dimension's name in words ("outside pressure"), never its code. */
export function weatherName(name: string | null | undefined): string {
  const n = String(name ?? '').trim();
  return WEATHER_NAMES[n] ?? n.replace(/_/g, ' ');
}

/**
 * Your own full card: the server sends the tiles and the pressing item at the read level only, so the full card takes
 * them from the read card (2026-10-05) — the deep dive shows what the smaller card shows. The deep card's own win.
 */
export function withReadExtras<T extends { tiles?: CardTile[] | null; hot_item?: HotItem | null }>(deep: T, read: { tiles?: CardTile[] | null; hot_item?: HotItem | null } | null | undefined): T {
  if (!read) return deep;
  return {
    ...deep,
    tiles: deep.tiles && deep.tiles.length ? deep.tiles : (read.tiles ?? deep.tiles),
    hot_item: deep.hot_item ?? read.hot_item ?? deep.hot_item,
  };
}

/** A prediction's score (and its confidence) shows only with what it rests on: a number with no basis is not shown. */
export function predictionScoreShown(p: Pick<PredictionEntry, 'basis'>): boolean {
  return !!p.basis?.trim();
}

/** A day ("2026-09-28", or a stamp that starts with one) in the card's words, the year outside this one. */
const dayWords = (iso: string, now?: Date): string | null => {
  const m = /^\d{4}-\d{2}-\d{2}/.exec(iso.trim());
  return m ? cardDayWords(m[0], { now }) : null;
};

/**
 * A due date as a day ("31 Dec", "31 Dec 2025" when not this year), in UTC — the server sends it as epoch ms or seconds
 * (a goal's), a day ("2026-09-30") or a Java date string (a commitment's). Null when it is none of these: never the raw
 * value.
 */
export function dueDayWords(raw: unknown, now: Date = new Date()): string | null {
  return cardDayWords(raw, { utc: true, now });
}

/**
 * A pattern instance's day as a person says it ("28 Sep", "28 Sep to 4 Oct"; "12 Mar 2025" outside this year, as every
 * card day); its own words when it is not two dates.
 */
export function patternInstanceWhen(i: Pick<PatternInstance, 'date_range'>, now?: Date): string | null {
  const raw = i.date_range?.trim();
  if (!raw) return null;
  const [a, b] = raw.split(/\s+to\s+/);
  const from = dayWords(a ?? '', now);
  if (!from) return raw;
  const to = b ? dayWords(b, now) : null;
  return to && to !== from ? `${from} to ${to}` : from;
}

/** A pattern instance's words: what happened, then the detail, as the server sends them; either may be missing. */
export function patternInstanceText(i: { context?: string | null; detail?: string | null }): string {
  return [i.context?.trim(), i.detail?.trim()].filter(Boolean).join(' · ');
}
