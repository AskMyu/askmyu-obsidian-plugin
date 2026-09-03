/**
 * What the Today pane reads, as six answers — whether they came as six calls
 * or as one bundle (backend flag `today_bundle`, 2026-09-03). The pane's own
 * logic stays written against the six, so the bundle cannot change what it
 * shows; only how many requests it took.
 */

import type { ApiResponse } from '../transport';
import type { CoupledLoop, MirrorEdition, PersonalLoop, TodayBundle, WeeklyEdition, HelpMyuItem } from '../transport/api';

export interface TodayReads {
  brief: ApiResponse;
  events: ApiResponse;
  mirror: ApiResponse<{ edition?: MirrorEdition }> | null;
  weekly: ApiResponse<{ edition?: WeeklyEdition }> | null;
  loop: ApiResponse<{ loop?: PersonalLoop | null; coupled_loops?: CoupledLoop[] }> | null;
  /** The Help Myu queue when the bundle carried it; null means "ask the old way". */
  helpQueue: HelpMyuItem[] | null;
}

/** One bundle answer, unpacked into the six the pane knows. A part that is null failed on its own. */
export function readsFromBundle(res: ApiResponse<TodayBundle> | null): TodayReads {
  if (!res?.ok || !res.data) {
    const refused: ApiResponse = { ok: false, status: res?.status ?? 0, data: null, error: res?.error ?? 'offline' };
    return { brief: refused, events: refused, mirror: null, weekly: null, loop: null, helpQueue: null };
  }
  const b = res.data;
  const part = <T>(name: keyof TodayBundle, value: T | null | undefined): ApiResponse<T> =>
    value ? { ok: true, status: 200, data: value, error: null } : { ok: false, status: 200, data: null, error: b.errors?.[name] ?? 'part_missing' };
  const mirror = b.mirror ? part('mirror', b.mirror) : null;
  const weekly = b.weekly ? part('weekly', b.weekly) : null;
  const loop = b.loop ? part('loop', b.loop) : null;
  return {
    brief: part('brief', b.brief),
    events: part('events', b.events),
    mirror,
    weekly,
    loop,
    helpQueue: b.help_queue ? (b.help_queue.queue ?? []) : null,
  };
}
