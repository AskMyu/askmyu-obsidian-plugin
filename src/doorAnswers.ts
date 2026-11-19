// What the doors that try a device's key may answer besides a refusal (2026-11-18, BRIEF_FRONTEND_KEY_TEST_AT_THE_DOOR, after the
// backend's last round). The doors: the lending door (`/account/session/escrow-key`), the three copy doors (a new phrase, the password
// for new devices set or removed) and the two approve doors. Their answers: 409 `key_second` (a second key of the account's: nothing is
// changed from this device), `key_being_set_up` (another device of the person's is finishing its set-up), and 503 "not now" (the
// account's test could not be read, or it was asked too often). On none of these is anything set aside, dropped or forgotten; a refusal
// (`key_not_yours`) is keyCheck.ts's. Byte copies in packages/cli and packages/obsidian.

export const DOOR_WORDS = {
  second: "That can't be changed from this device. Change it from another device of yours where Myu is open.",
  beingSetUp: 'Another device of yours is finishing setting up. Try again in a minute.',
  notNow: "Myu can't check this device just now. Try again in a minute.",
} as const;

export type DoorAnswer = 'key_second' | 'key_being_set_up' | 'not_now';

/** Which of those answers this is (from `error`, `err` or `code`; 503 is "not now"); null for any other answer. */
export function doorAnswerOf(status: number, body: unknown): DoorAnswer | null {
  const b = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const codes = [b.error, b.err, b.code].filter((x): x is string => typeof x === 'string');
  if (codes.includes('key_second')) return 'key_second';
  if (codes.includes('key_being_set_up')) return 'key_being_set_up';
  if (status === 503 || codes.includes('not_now')) return 'not_now';
  return null;
}

/** The words to show for it: the server's own sentence where it sends one, ours where it does not; null for any other answer. */
export function doorAnswerWords(status: number, body: unknown): string | null {
  const a = doorAnswerOf(status, body);
  if (!a) return null;
  const b = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const said = [b.message, b.said].find((x): x is string => typeof x === 'string' && x.trim().length > 0)?.trim();
  if (said) return said;
  return a === 'key_second' ? DOOR_WORDS.second : a === 'key_being_set_up' ? DOOR_WORDS.beingSetUp : DOOR_WORDS.notNow;
}

/** How long a lending in the background waits after "not now" before it tries again: it grows (30 s, 1, 2, 4 … up to 15 minutes). */
export function notNowPauseMs(tries: number): number {
  return Math.min(15 * 60_000, 30_000 * 2 ** Math.max(0, tries - 1));
}
