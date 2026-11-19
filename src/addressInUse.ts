// The plugin's password sign-up, refused for an address an account already holds (2026-11-17; the backend's shape, relayed by
// planning): `/account/create` answers 409 `address_in_use` with its sentence, the same whichever account holds it, so it tells nobody
// which. Nothing is made. The plugin shows the server's sentence and offers its own mailed sign-in, with a way back to the start.

export const ADDRESS_IN_USE = 'address_in_use';

export const ADDRESS_IN_USE_WORDS = {
  said: "This address can't be used to make an account with a password. Sign in by mail instead.",
  mailLink: 'Email me a sign-in link',
  back: 'Back to the start',
} as const;

/** The server's sentence when a sign-up was refused for its address; ours when it sends none; null for any other answer. */
export function addressInUseOf(status: number, error: string | null | undefined, data: unknown): string | null {
  const o = data && typeof data === 'object' ? (data as { error?: unknown; message?: unknown }) : {};
  if (status !== 409 || (error !== ADDRESS_IN_USE && o.error !== ADDRESS_IN_USE)) return null;
  return typeof o.message === 'string' && o.message.trim() ? o.message.trim() : ADDRESS_IN_USE_WORDS.said;
}
