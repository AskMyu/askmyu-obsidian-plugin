/**
 * WebCrypto primitives — ported from `packages/web/src/lib/encryption/EncryptionService.ts`.
 *
 * The algorithms are identical to the web path on purpose: the same mDEK has to
 * round-trip between a browser, a phone and this plugin, so any divergence here
 * is a decryption failure somewhere else. AES-256-GCM for content, AES-KW for
 * wrapping, P-256 ECDH for device transfer.
 *
 * TWO deliberate differences from the reference, both forced by the runtime:
 *
 * 1. **The KEK is extractable here.** In the browser it is non-extractable and
 *    lives in IndexedDB, which is safe because the origin is isolated. Obsidian
 *    has no plugin isolation — Obsidian's own docs say it "cannot reliably
 *    restrict plugins to specific permissions or access levels" — so a KEK
 *    sitting locally would be a secret sitting locally, non-extractable or not
 *    (a co-resident plugin can't read the bytes, but it can *use* the key).
 *    Split custody inverts it: the KEK is exported to the server, the wrapped
 *    blob stays here, and neither side alone can open anything.
 *
 * 2. **Function references are captured at module load** (see `subtle` below).
 *    A same-process adversary that hooks `crypto.subtle` before us wins
 *    regardless — no scheme survives that in a runtime without isolation — but
 *    capturing early means it has to be *earlier than plugin load*, not merely
 *    present. Disclosed as a residual risk in the plan, not papered over.
 */

export type Base64String = string;

/**
 * Captured at load, before any other plugin has a chance to run in our lifetime.
 * Every call in this file goes through these bindings rather than reaching for
 * `crypto.subtle` at call time.
 */
const cryptoRef = crypto;
const subtle = cryptoRef.subtle;
const getRandomValues = cryptoRef.getRandomValues.bind(cryptoRef);

// ── encoding ────────────────────────────────────────────────────────────────

export function arrayBufferToBase64(buffer: ArrayBuffer): Base64String {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: Base64String): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Device id. `crypto.randomUUID` needs a secure context, and the mobile webview
 * is not guaranteed to be one — the web reference carries the same fallback.
 */
export function generateDeviceId(): string {
  if (typeof cryptoRef.randomUUID === 'function') return cryptoRef.randomUUID();

  const bytes = new Uint8Array(16);
  getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ── keys ────────────────────────────────────────────────────────────────────

/**
 * A fresh wrapping key for the split-custody handoff. Extractable — see the
 * header — because its whole job is to be handed to the server while the blob
 * it wraps stays on this device.
 */
export async function generateKEK(): Promise<CryptoKey> {
  return subtle.generateKey({ name: 'AES-KW', length: 256 }, true, ['wrapKey', 'unwrapKey']);
}

/**
 * P9 — key GENESIS, for the plugin-as-first-device path (gateway primacy).
 * Everywhere else the plugin RECEIVES an mDEK (transfer/recovery); a signup
 * born in the vault mints its own. Extractable for the same runtime reason the
 * KEK is (see the module header) — it must survive wrap + escrow round-trips.
 */
export async function generateMDEK(): Promise<CryptoKey> {
  return subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

/**
 * The APPROVING side of a device transfer — the exact mirror of the receive
 * path (completeApproval / web decryptReceivedMDEK / mobile): ephemeral ECDH
 * pair, shared key with the requester's public key, then the single blob
 * `ourSPKI(91) || iv(12) || ciphertext`. Every client's receiver parses this
 * format; until 2026-08-22 no client's APPROVER produced it (the fleet-wide
 * transfer bug — approvers sent the raw mDEK because the pending list
 * withheld the requester's public key).
 */
export async function encryptMDEKForTransfer(mDEK: CryptoKey, requesterPublicKeyB64: Base64String): Promise<Base64String> {
  const ours = await generateECDHKeyPair();
  const requesterKey = await importECDHPublicKey(requesterPublicKeyB64);
  const shared = await deriveSharedKey(ours.privateKey, requesterKey);

  const mdekBytes = await subtle.exportKey('raw', mDEK);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await subtle.encrypt({ name: 'AES-GCM', iv }, shared, mdekBytes);

  const ourSpki = new Uint8Array(base64ToArrayBuffer(ours.publicKey));
  const blob = new Uint8Array(ourSpki.length + iv.length + ciphertext.byteLength);
  blob.set(ourSpki, 0);
  blob.set(iv, ourSpki.length);
  blob.set(new Uint8Array(ciphertext), ourSpki.length + iv.length);
  return arrayBufferToBase64(blob.buffer);
}

export async function exportKeyAsBase64(key: CryptoKey): Promise<Base64String> {
  return arrayBufferToBase64(await subtle.exportKey('raw', key));
}

/** Import a raw AES-KW key — the KEK coming back from the server at unlock. */
export async function importKEK(base64Key: Base64String): Promise<CryptoKey> {
  return subtle.importKey('raw', base64ToArrayBuffer(base64Key), { name: 'AES-KW', length: 256 }, true, [
    'wrapKey',
    'unwrapKey',
  ]);
}

/** Import a raw AES-GCM key — the mDEK arriving from a device transfer. */
export async function importMDEK(base64Key: Base64String): Promise<CryptoKey> {
  return subtle.importKey('raw', base64ToArrayBuffer(base64Key), { name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
}

export async function wrapMDEK(mDEK: CryptoKey, kek: CryptoKey): Promise<Base64String> {
  return arrayBufferToBase64(await subtle.wrapKey('raw', mDEK, kek, 'AES-KW'));
}

export async function unwrapMDEK(wrapped: Base64String, kek: CryptoKey): Promise<CryptoKey> {
  return subtle.unwrapKey(
    'raw',
    base64ToArrayBuffer(wrapped),
    kek,
    'AES-KW',
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}

// ── content ─────────────────────────────────────────────────────────────────

/**
 * AES-GCM with a random 96-bit IV, IV prepended to the ciphertext. Byte-for-byte
 * the reference implementation's format — the backend and the other clients
 * already read it.
 */
export async function encryptWithKey(plaintext: string, key: CryptoKey): Promise<Base64String> {
  const iv = getRandomValues(new Uint8Array(12));
  const ciphertext = await subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));

  const out = new Uint8Array(iv.length + ciphertext.byteLength);
  out.set(iv);
  out.set(new Uint8Array(ciphertext), iv.length);
  return arrayBufferToBase64(out.buffer);
}

export async function decryptWithKey(encrypted: Base64String, key: CryptoKey): Promise<string> {
  const data = new Uint8Array(base64ToArrayBuffer(encrypted));
  const decrypted = await subtle.decrypt({ name: 'AES-GCM', iv: data.slice(0, 12) }, key, data.slice(12));
  return new TextDecoder().decode(decrypted);
}

/**
 * Raw-bytes sibling of decryptWithKey, returned as base64. KEY MATERIAL IS NOT
 * TEXT: the fleet's transfer payload is the mDEK's raw bytes (web + mobile
 * approvers and receivers agree), and UTF-8-decoding raw key bytes mangles
 * them irreversibly — the bug that ate the plugin's receive side until the
 * 2026-08-22 two-instance run caught it.
 */
export async function decryptToBase64(encrypted: Base64String, key: CryptoKey): Promise<Base64String> {
  const data = new Uint8Array(base64ToArrayBuffer(encrypted));
  const decrypted = await subtle.decrypt({ name: 'AES-GCM', iv: data.slice(0, 12) }, key, data.slice(12));
  return arrayBufferToBase64(decrypted);
}

// ── device transfer (ECDH) ──────────────────────────────────────────────────

export interface ECDHKeyPair {
  publicKey: Base64String;
  privateKey: CryptoKey;
}

/**
 * Ephemeral P-256 pair for receiving the mDEK from an approving device. The
 * private half never leaves memory and never touches storage — a transfer that
 * doesn't complete before restart is simply restarted.
 */
export async function generateECDHKeyPair(): Promise<ECDHKeyPair> {
  const pair = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits']);
  // SPKI, not raw — the deployed device-transfer protocol (web
  // DeviceKeyService / mobile EncryptionService) exports and imports P-256
  // public keys as SPKI (91 bytes), and packs them into the transfer blob at a
  // fixed 91-byte offset. A raw 65-byte point would not parse on the approving
  // device (REVIEW C1).
  const spki = await subtle.exportKey('spki', pair.publicKey);
  return { publicKey: arrayBufferToBase64(spki), privateKey: pair.privateKey };
}

export async function importECDHPublicKey(base64PublicKey: Base64String): Promise<CryptoKey> {
  // TOLERANT: SPKI (91 bytes, the fleet convention) or a raw uncompressed
  // point (65 bytes, 0x04-prefixed — what the web's transfer page emitted for
  // months). An approver that refuses a requester's key format strands a
  // human mid-transfer (live finding, 2026-08-25).
  const buffer = base64ToArrayBuffer(base64PublicKey);
  const bytes = new Uint8Array(buffer);
  const format = bytes.length === 65 && bytes[0] === 0x04 ? 'raw' : 'spki';
  return subtle.importKey(format, buffer, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
}

export async function deriveSharedKey(privateKey: CryptoKey, publicKey: CryptoKey): Promise<CryptoKey> {
  return subtle.deriveKey({ name: 'ECDH', public: publicKey }, privateKey, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
}

// ── recovery phrase ─────────────────────────────────────────────────────────

const PBKDF2_ITERATIONS = 100000;
const PBKDF2_SALT = 'askmyu-recovery-kek-v1';

/**
 * Derive the recovery KEK from a 12-word phrase. Constants must match
 * `packages/web/src/lib/encryption/RecoveryService.ts` exactly — a phrase
 * written down during web setup has to open the vault here.
 */
export async function deriveRecoveryKEK(seed: Uint8Array): Promise<CryptoKey> {
  const baseKey = await subtle.importKey('raw', seed as BufferSource, 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: new TextEncoder().encode(PBKDF2_SALT),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-KW', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  );
}
