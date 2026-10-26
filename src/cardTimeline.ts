/**
 * A card's timeline (2026-10-03) — the plugin's word-for-word copies of shared `types/cards.ts` `timelineWhen` and
 * `timelineSourceWords` (the plugin imports shared types only; `tests/internal/cardTimelineParity.test.ts` holds them).
 * The day an event happened as a person says it ("28 Sep"; "Sep 2025" for a role), and where it came from in plain
 * words — never a code.
 */

import { cardDayWords, cardMonthWords } from './cardDays';

interface TimelineEventLike {
  event_type?: string;
  date?: string;
  date_ms?: number;
}

/** The day an event happened, as a person says it. A role's start has only a month: "Sep 2025". */
export function timelineWhen(event: TimelineEventLike, now: Date = new Date()): string {
  // A day alone ("2026-06-02") is that calendar day; a stamp is the reader's day; a stamp with no zone is the server's UTC.
  // The words are the server's ("28 Sep"; "28 Sep 2025" outside this year; a role's start as "Mar 2024"), never the
  // browser's "Sep 28" (2026-10-06).
  const raw = typeof event.date === 'string' ? event.date.trim() : '';
  const at = /^\d{4}-\d{2}-\d{2}$/.test(raw) || typeof event.date_ms !== 'number' ? raw : event.date_ms;
  if (event.event_type === 'role_started') return cardMonthWords(at) ?? '';
  return cardDayWords(at, { now }) ?? '';
}

const TIMELINE_SOURCE_WORDS: Record<string, string> = {
  journal_entry: 'from your journal',
  journal: 'from your journal',
  journal_chat: 'from a conversation with Myu',
  career: 'from your career',
  goals: 'a goal you reached',
  email: 'from email',
  calendar: 'from your calendar',
  meeting: 'from a meeting',
};

/** Where an event came from, in plain words; null for anything else (never a code word on screen). */
export function timelineSourceWords(source: string | null | undefined): string | null {
  return source ? TIMELINE_SOURCE_WORDS[source] ?? null : null;
}
