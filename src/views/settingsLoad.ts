/**
 * Settings sections that fetch. A section that could not load must SAY so.
 *
 * "No other devices are holding custody of this account" on a failed fetch is
 * a lie the reader acts on — live, 2026-09-03: nine devices, a connected
 * Google account and a saved name all rendered as absent while the session
 * was being reopened, and "Connect…" invited a second connect of an account
 * that was already syncing. An empty state and a failed fetch are different
 * facts; only the first may be painted as "nothing here".
 */

import type { ApiResponse } from '../transport';

/** Why the fetch came back empty-handed, in the reader's words — null when it didn't. */
export function loadFailure(res: Pick<ApiResponse<unknown>, 'ok' | 'status' | 'error'> | null | undefined): string | null {
  if (res?.ok) return null;
  if (!res || res.status === 0) return 'askMyu could not be reached. Check the connection and try again.';
  switch (res.status) {
    case 401:
      return 'Your session was refreshed. Try again.';
    case 403:
      return 'Still signing in. Try again in a moment.';
    case 428:
      return 'Accept the beta terms first. They are in the Today pane.';
    case 429:
      return 'Too many requests. Try again in a minute.';
    default:
      return res.status >= 500 ? `askMyu had a server error (${res.status}). Try again.` : `askMyu returned an error (${res.status}). Try again.`;
  }
}
