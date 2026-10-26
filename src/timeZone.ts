// The person's own day (backend, 2026-09-28): the morning brief is built on `preferences.timezone` (America/New_York
// without one), so the plugin saves this computer's zone when the vault signs in or opens signed in, if it differs
// from the saved one. The first three mirror shared `commsPrefs.ts` (the plugin imports shared types only;
// tests/internal/timeZoneParity.test.ts holds them to it). Nothing is shown, and a failure waits for the next time.

import type { ApiResponse } from './transport/index';

/** This computer's IANA zone ("America/Los_Angeles"), or null when the runtime has none it can name. */
export function deviceTimeZone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone && zone !== 'Etc/Unknown' && isTimeZone(zone) ? zone : null;
  } catch {
    return null;
  }
}

/** Whether `zone` is an IANA zone this runtime knows. */
export function isTimeZone(zone: unknown): zone is string {
  if (typeof zone !== 'string' || !zone.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** The zone to save: this computer's, when it is a real zone and differs from the saved one; else null. */
export function timeZoneToSave(saved: unknown, device: string | null | undefined): string | null {
  if (!isTimeZone(device)) return null;
  return saved === device ? null : device;
}

interface PreferencesApi {
  getAccountPreferences(): Promise<ApiResponse<Record<string, unknown>>>;
  updateAccountPreferences(body: Record<string, unknown>): Promise<ApiResponse>;
}

/** Compare and save. True when the saved zone is right (nothing to send, or sent); false to try again next time. */
export async function syncTimeZone(api: PreferencesApi, device: string | null = deviceTimeZone()): Promise<boolean> {
  try {
    const res = await api.getAccountPreferences();
    if (!res.ok) return false;
    // Read without an assertion: the mirror's looser wire types make one "unnecessary" there, and its lint is fatal.
    const raw: unknown = res.data?.preferences;
    const saved: unknown = raw !== null && typeof raw === 'object' && 'timezone' in raw ? raw.timezone : null;
    const zone = timeZoneToSave(saved, device);
    if (!zone) return true;
    const up = await api.updateAccountPreferences({ timezone: zone });
    return up.ok;
  } catch {
    return false;
  }
}
