/**
 * QA invariant 1, as a function.
 *
 * "Nothing leaves unencrypted" is asserted at the transport chokepoint rather
 * than trusted to each caller — the cross-review lesson. It lives in its own
 * module, free of any `obsidian` import, for one reason: **so the acceptance
 * test can run it without the host app.** An invariant nobody can execute is a
 * comment, and comments don't hold.
 */

/** Payload shape the journal endpoints accept — see CONTRACT_OBSIDIAN.md §3. */
export interface EncryptedJournalPayload {
  encrypted_content: string;
  encryption_version: number;
  source_type: 'obsidian';
  external_id: string;
  occurred_at: number;
  entity_hints?: string[];
  previous_external_id?: string;
  no_response: boolean;
}

export class PlaintextRefusedError extends Error {
  constructor(reason: string) {
    super(
      `Refused to send a journal payload: ${reason}. This is the transport ` +
        `chokepoint — content is encrypted under the mDEK before it reaches ` +
        `here, and nothing else is allowed out.`,
    );
    this.name = 'PlaintextRefusedError';
  }
}

export function assertEncrypted(payload: EncryptedJournalPayload): void {
  const carrier = payload as unknown as Record<string, unknown>;

  // A plaintext key at all means someone built a plaintext payload and bolted
  // encryption on afterwards. Refuse the whole thing rather than strip it —
  // stripping would hide the caller's bug and ship the rest.
  if ('content' in carrier || 'text' in carrier || 'body' in carrier) {
    throw new PlaintextRefusedError('it carries a plaintext field (content/text/body)');
  }
  if (typeof payload.encrypted_content !== 'string' || payload.encrypted_content.length === 0) {
    throw new PlaintextRefusedError('encrypted_content is missing or empty');
  }
  if (!Number.isInteger(payload.encryption_version) || payload.encryption_version < 1) {
    throw new PlaintextRefusedError('encryption_version is missing');
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(payload.encrypted_content)) {
    throw new PlaintextRefusedError('encrypted_content is not base64');
  }
  if (!looksLikeEnvelope(payload.encrypted_content)) {
    throw new PlaintextRefusedError('encrypted_content is not a plausible AES-GCM envelope');
  }
}

/**
 * Does this decode to something that could be IV(12) + ciphertext + tag(16)?
 *
 * Length alone is not enough — base64 of a paragraph of prose is long and valid
 * base64, which is precisely the mistake this guard exists to catch ("I
 * base64'd it, that's encoding, close enough"). So look at the bytes: the first
 * 12 are a random IV, and the odds of 12 random bytes all landing in printable
 * ASCII are about 1 in 5,000. Text base64'd by hand hits that every time.
 */
function looksLikeEnvelope(base64: string): boolean {
  let bytes: Uint8Array;
  try {
    const binary = atob(base64);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  } catch {
    return false;
  }

  // 12-byte IV + 16-byte GCM tag is the floor, before a single byte of content.
  if (bytes.length < 29) return false;

  const printable = (b: number) => b === 0x09 || b === 0x0a || b === 0x0d || (b >= 0x20 && b <= 0x7e);
  return !Array.from(bytes.slice(0, 12)).every(printable);
}
