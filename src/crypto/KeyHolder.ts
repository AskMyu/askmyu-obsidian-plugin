/**
 * KeyHolder — the runtime mDEK, in memory and nowhere else.
 *
 * QA invariant 8 ("passive read of ALL local storage yields nothing
 * unwrappable") is a property of this class plus the split-custody handoff:
 *
 *   · this device stores the mDEK **wrapped** (`data.json` → `wrapped_mdek`),
 *   · the server stores the **wrapping key** (device registration row),
 *   · the raw key exists only here, only while the process lives.
 *
 * So there is deliberately no `persist()` on this object, and the only way out
 * of it is `exportForEscrow()` — which exists because the backend needs the mDEK
 * escrowed to the session to do server-side work, exactly as every other client
 * does it. That is the one door, and it is named after its reason.
 *
 * `clear()` drops the reference. It cannot scrub the bytes — WebCrypto owns them
 * and JS has no memory-zeroing — which is why the design never claims more than
 * "no raw key at rest".
 */

import { exportKeyAsBase64, type Base64String } from './primitives';

export type UnlockState =
  /** No token, or the token was revoked. Nothing works. */
  | 'disconnected'
  /** Session exists, but this device has no key material yet (or lost it). */
  | 'blocked'
  /** Wrapped blob present; needs the server's KEK to open. Offline stays here. */
  | 'relocked'
  /** mDEK in memory. Capture and views live. */
  | 'unlocked';

export class KeyHolder {
  private mDEK: CryptoKey | null = null;

  get isUnlocked(): boolean {
    return this.mDEK !== null;
  }

  set(key: CryptoKey): void {
    this.mDEK = key;
  }

  /**
   * The key, or null. Callers that need it must handle null rather than assert —
   * a relock can happen between a caller's check and its use (revocation,
   * restart, user disconnect), and a thrown "key missing" in the capture path
   * would surface as a lost note.
   */
  get(): CryptoKey | null {
    return this.mDEK;
  }

  /**
   * Export the raw key for session escrow (`POST /account/session/escrow-key`).
   * The backend holds it for the escrow TTL so async work can unwrap content —
   * the established architecture, not a plugin-specific concession.
   */
  async exportForEscrow(): Promise<Base64String> {
    if (!this.mDEK) throw new Error('locked');
    return exportKeyAsBase64(this.mDEK);
  }

  clear(): void {
    this.mDEK = null;
  }
}
