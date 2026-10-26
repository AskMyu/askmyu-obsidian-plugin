/**
 * A password for new devices (2026-10-20; BRIEF_WEB_DEVICE_PASSWORD_20261020, the backend's IMPL_DEVICE_PASSWORD_20261020,
 * the words in NOTE_DEVICE_PASSWORD_20261020). One more wrapped copy of the account key, under a key derived from a
 * password the person chooses (PBKDF2-SHA256, a random 16-byte salt, 600000 iterations); the server keeps the blob and
 * the parameters and can open nothing. Everything here is pure and runs on Web Crypto (the browser's, node's, the phone's
 * polyfill); the terminal keeps a word-for-word copy (`packages/cli/src/devicePassword.ts`).
 *
 * This is the Obsidian plugin's copy of shared `types/devicePassword.ts`: the same file but for `webCrypto` below
 * (`tests/internal/devicePasswordParity.test.ts` holds everything else byte for byte).
 */

/** The derivation the door takes: `POST /account/password/setup {wrapped_mdek_password, kdf}`. */
export interface PasswordKdf {
  name: 'pbkdf2-sha256';
  iterations: number;
  /** base64, 16 random bytes or more. */
  salt: string;
}

export interface PasswordSetupBody {
  wrapped_mdek_password: string;
  kdf: PasswordKdf;
}

/** `GET /account/password/wrapped-key` (404 `no_password` when none is set). */
export interface PasswordWrappedKey {
  success?: boolean;
  has_password: boolean;
  wrapped_mdek_password?: string;
  kdf?: PasswordKdf;
  set_at?: string;
}

/** The door's floor; the client derives with exactly this many. */
export const PASSWORD_KDF_ITERATIONS = 600000;
export const PASSWORD_KDF_NAME = 'pbkdf2-sha256' as const;
/** Under this many characters the button stays off. */
export const PASSWORD_MIN_LENGTH = 12;

/** The words on screen, exactly as the note has them. */
export const DEVICE_PASSWORD_WORDS = {
  rowLabel: 'Password for new devices',
  notSet: 'Not set',
  isSet: 'Set',
  setButton: 'Set',
  changeButton: 'Change',
  removeButton: 'Remove',
  rowExplain:
    "Sign in on your phone or another computer with your email, type this password, and you're in. Without it, you get in on a new device by typing your recovery phrase, or by approving it from a device you already use.",
  unlockFirst: 'Unlock this device first.',
  sheetTitle: 'Choose a password for new devices.',
  changeTitle: 'Change the password for new devices',
  sheetExplain:
    "Sign in on your phone or another computer with your email, type this password, and you're in. Choose one you'll remember: Myu can't reset it. If you forget it, you can still get in by typing your recovery phrase, or by approving the new device from one you already use. Longer is safer.",
  password: 'Password',
  again: 'Again',
  tooShort: 'Too short',
  couldBeLonger: 'Could be longer',
  good: 'Good',
  /** The two fields differ (the note gives no sentence; this one is plain). */
  mismatch: "The two don't match.",
  setThePassword: 'Set the password',
  changeThePassword: 'Change the password',
  removeAsk: "Remove the password? To get in on a new device you'll then type your recovery phrase, or approve it from a device you already use.",
  remove: 'Remove',
  cancel: 'Cancel',
  working: 'Working…',
  /** The new device. */
  newDeviceField: 'Your password for new devices',
  open: 'Open',
  wrong: "That password isn't right.",
  /** The terminal's lines. */
  terminalSet: "set. sign in on another device with your email, type it, and you're in.",
  terminalChanged: 'changed.',
  terminalRemoved: 'removed.',
  terminalTooShort: 'too short: 12 characters or more',
  terminalRemoveAsk: "remove the password for new devices? to get in on a new device you'll then type your recovery phrase, or approve it from a device you already use.",
  terminalUnlockAsk: 'type your password for new devices (hidden):',
  terminalWrong: "that password isn't right.",
} as const;

export type PasswordStrength = 'too_short' | 'could_be_longer' | 'good';

/** Under 12 characters "Too short" (the button stays off); 12 to 15 "Could be longer"; 16 or more "Good". */
export function passwordStrength(password: string): PasswordStrength {
  const n = Array.from(password).length;
  if (n < PASSWORD_MIN_LENGTH) return 'too_short';
  if (n < 16) return 'could_be_longer';
  return 'good';
}

export function strengthWords(s: PasswordStrength): string {
  return s === 'too_short' ? DEVICE_PASSWORD_WORDS.tooShort : s === 'could_be_longer' ? DEVICE_PASSWORD_WORDS.couldBeLonger : DEVICE_PASSWORD_WORDS.good;
}

/** Whether the sheet's button is on: long enough, and the two fields the same. */
export function canSetPassword(password: string, again: string): boolean {
  return passwordStrength(password) !== 'too_short' && password === again;
}

// ── bytes ──
const webCrypto = (): Crypto => {
  // The plugin's one difference from shared: Obsidian's window, or node's global `crypto` under the tests, never the
  // global object by its name, which the directory's scanner flags (obsidianmd/no-global-this). The parity test holds
  // the rest of the file.
  const c = typeof window !== 'undefined' ? window.crypto : crypto;
  if (!c?.subtle) throw new Error('Web Crypto is not available here.');
  return c;
};
export function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
export function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** Fresh parameters for a setup: 16 random bytes of salt, the door's iterations. */
export function newPasswordKdf(): PasswordKdf {
  const salt = new Uint8Array(16);
  webCrypto().getRandomValues(salt);
  return { name: PASSWORD_KDF_NAME, iterations: PASSWORD_KDF_ITERATIONS, salt: bytesToBase64(salt) };
}

/** The parameters the door accepts: the name, at least 600000 iterations, a salt of 16 bytes or more. */
export function validPasswordKdf(kdf: Partial<PasswordKdf> | null | undefined): kdf is PasswordKdf {
  if (!kdf || String(kdf.name).toLowerCase() !== PASSWORD_KDF_NAME) return false;
  if (typeof kdf.iterations !== 'number' || kdf.iterations < PASSWORD_KDF_ITERATIONS) return false;
  try {
    return typeof kdf.salt === 'string' && base64ToBytes(kdf.salt).length >= 16;
  } catch {
    return false;
  }
}

/** The key the password derives (AES-KW, 256): PBKDF2-SHA256 over the password (NFKC) with the salt and the iterations. */
export async function derivePasswordKEK(password: string, kdf: PasswordKdf): Promise<CryptoKey> {
  const subtle = webCrypto().subtle;
  const material = await subtle.importKey('raw', new TextEncoder().encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', salt: base64ToBytes(kdf.salt) as BufferSource, iterations: kdf.iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-KW', length: 256 },
    true,
    ['wrapKey', 'unwrapKey'],
  );
}

/** The account key wrapped under the password's key: the body of the setup door. */
export async function wrapWithPassword(mdek: CryptoKey, password: string, kdf: PasswordKdf = newPasswordKdf()): Promise<PasswordSetupBody> {
  const kek = await derivePasswordKEK(password, kdf);
  const wrapped = await webCrypto().subtle.wrapKey('raw', mdek, kek, 'AES-KW');
  return { wrapped_mdek_password: bytesToBase64(new Uint8Array(wrapped)), kdf };
}

/** The account key back from the door's blob with the typed password; throws on a wrong password (AES-KW fails to unwrap). */
export async function unwrapWithPassword(wrappedMdekPassword: string, password: string, kdf: PasswordKdf): Promise<CryptoKey> {
  const kek = await derivePasswordKEK(password, kdf);
  return webCrypto().subtle.unwrapKey('raw', base64ToBytes(wrappedMdekPassword) as BufferSource, kek, 'AES-KW', { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}
