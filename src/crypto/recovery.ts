/**
 * Recovery phrase ↔ KEK. Ported from `packages/web/src/lib/encryption/RecoveryService.ts`.
 *
 * Both directions live here since P9 (gateway primacy): the plugin CONSUMES a
 * phrase (the fallback onboarding path) and, for accounts born in the vault,
 * GENERATES one — same `@scure/bip39` + English wordlist as the web, so a
 * phrase written down in either place works in the other.
 *
 * Normalization and derivation constants must match the reference exactly.
 * The phrase never leaves the device: setup wraps the mDEK locally and ships
 * only the ciphertext.
 */

import { generateMnemonic, validateMnemonic, mnemonicToSeed } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { deriveRecoveryKEK } from './primitives';

/** 12 words, 128-bit entropy — identical to the web's RecoveryService. */
export function generatePhrase(): string {
  return generateMnemonic(wordlist, 128);
}

export function normalizePhrase(phrase: string): string {
  return phrase.toLowerCase().trim().split(/\s+/).join(' ');
}

export function validatePhrase(phrase: string): boolean {
  return validateMnemonic(normalizePhrase(phrase), wordlist);
}

/**
 * Derive the KEK that unwraps the account's recovery-wrapped mDEK.
 *
 * @throws if the phrase fails its BIP-39 checksum — caught in the UI and shown
 *         as "that phrase isn't right", never as a stack trace.
 */
export async function deriveKEKFromPhrase(phrase: string): Promise<CryptoKey> {
  const normalized = normalizePhrase(phrase);
  if (!validateMnemonic(normalized, wordlist)) {
    throw new Error('invalid_recovery_phrase');
  }
  const seed = await mnemonicToSeed(normalized);
  return deriveRecoveryKEK(new Uint8Array(seed));
}
