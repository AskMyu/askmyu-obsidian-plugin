/**
 * Signing in with a mailed link when the address it proves is held by a password account nobody confirmed (2026-11-17,
 * shared `addressHeld.ts`). The plugin's one sign-in that proves an address is the mailed link (the browser hand-off for
 * Google comes back the same way, as a link token); the server answers its redeem 409 `address_held` BEFORE it uses the
 * link. So: one question; once it is answered, the same link is redeemed once more. If that redeem is asked about again,
 * the question is shown again: never a silent retry. No host API here: the window that asks and what each landing says
 * are the caller's (`main.ts`).
 *
 * `again_url`: the server's own record of the link (its validate address with the same token). The plugin never opens it
 * as a page or requests it directly (every request goes to the configured server through the transport); it reads the
 * token from it and redeems that through the same door, which is the request `again_url` names.
 */

import type { AddressHeld } from './addressHeld';
import type { MagicLinkOutcome } from './auth/UnlockMachine';

/** The token to redeem again: the one `again_url` carries when it carries one, else the one just redeemed. */
export function againToken(againUrl: string | undefined, token: string): string {
  const m = againUrl ? /[?&]token=([^&#\s]+)/.exec(againUrl) : null;
  if (!m) return token;
  try {
    const t = decodeURIComponent(m[1]).trim();
    return t || token;
  } catch {
    return token;
  }
}

export interface MagicSigninDeps {
  /** Redeem the link (`UnlockMachine.completeMagicLink`). */
  redeem: (token: string) => Promise<MagicLinkOutcome>;
  /** Show the question. `answered` sends the same sign-in again; it goes once, however often it is called. */
  ask: (held: AddressHeld, answered: (againUrl?: string) => Promise<void>) => void;
  /** Where the sign-in landed. */
  landed: (outcome: Exclude<MagicLinkOutcome, { held: AddressHeld }>) => void;
}

/** Redeem a mailed link; a held address is asked about first, then the link goes once more. */
export async function magicSignin(deps: MagicSigninDeps, token: string): Promise<void> {
  const outcome = await deps.redeem(token);
  if (typeof outcome === 'string') {
    deps.landed(outcome);
    return;
  }
  let again: Promise<void> | null = null;
  deps.ask(outcome.held, (againUrl) => {
    again ??= magicSignin(deps, againToken(againUrl, token));
    return again;
  });
}
