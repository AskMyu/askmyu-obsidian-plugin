/**
 * Myu's own entries on the askMyu calendar (2026-09-29) — an interview debrief's interview set by hand, and when its
 * scorecards open — come beside the synced events, for someone with no calendar synced, in their own shape
 * ({source: 'myu', kind, event_id, space_id, title, start, end}). The plugin reads the synced shape, so they are mapped
 * onto it where the events are fetched. Copies of shared `types/calendar.ts` (the plugin imports shared types only);
 * `tests/internal/calendarMyuParity.test.ts` holds them word for word. No host API in this file.
 */

import type { CalendarEventLike } from './wire';

/** Myu's entry, as the calendar door sends it. */
interface MyuCalendarEntry {
  source: 'myu';
  kind: string;
  event_id: string;
  space_id?: string;
  title: string;
  start: string;
  end: string;
}

/** Myu's entry, as `/calendar/events/get` sends it. */
export function isMyuCalendarEntry(e: unknown): e is MyuCalendarEntry {
  return !!e && typeof e === 'object' && (e as { source?: unknown }).source === 'myu';
}

/**
 * An ISO time in the synced events' own form: UTC, "YYYY-MM-DD HH:mm:ss.SSS", no "Z" (the clients add it back when they
 * read). An unreadable time is left as it came.
 */
export function toCalendarWireTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().replace('T', ' ').replace('Z', '');
}

/**
 * The events as one shape: Myu's entries mapped onto the synced fields (`title` → `summary`, `start` → `start_time`,
 * the times in the synced events' UTC form).
 */
export function normalizeCalendarEvents(raw: unknown[]): CalendarEventLike[] {
  return (raw ?? []).map((e) => {
    if (!isMyuCalendarEntry(e)) return e as CalendarEventLike;
    return {
      event_id: e.event_id,
      account_id: '',
      calendar_id: 'myu',
      summary: e.title,
      start_time: toCalendarWireTime(e.start),
      end_time: toCalendarWireTime(e.end || e.start),
      all_day: false,
      status: 'confirmed',
      last_synced_at: '',
      created_at: '',
      source: 'myu',
      kind: e.kind,
      space_id: e.space_id,
    };
  });
}
