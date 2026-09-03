/**
 * The unlock state machine — split custody.
 *
 *   DISCONNECTED ──token pasted──▶ BLOCKED ──approval/phrase──▶ UNLOCKED
 *        ▲                           ▲                             │
 *        │                    KEK deleted / device revoked         │ restart
 *        │                           │                             ▼
 *        └────token revoked──────────┴──────fetch KEK, unwrap──── RELOCKED
 *
 * The invariant the whole design exists to hold: **the raw key is never at rest
 * anywhere.** This device stores the mDEK wrapped under a KEK it does not have;
 * the server stores that KEK with no blob to open. A passive read of everything
 * on disk here yields ciphertext. Getting from ciphertext to content requires a
 * network fetch that is authenticated, rate-limited, receipted, and revocable —
 * which turns silent theft into a loud, killable act.
 *
 * Two consequences that are features, not bugs:
 *
 *  · **An offline restart stays RELOCKED.** Capture pauses with a badge rather
 *    than falling back to something weaker. There is no local escape hatch by
 *    construction — if there were, the passive-read guarantee would be a lie.
 *  · **The blob is written at UNLOCK, not at unload.** Obsidian can be killed;
 *    Linux has no tray to keep us resident. An unload-time write is a write that
 *    sometimes doesn't happen. The blob is static once made, so writing it early
 *    costs nothing and survives `kill -9`.
 */

import type { AskMyuApi } from '../transport/api';
import type { UnlockState } from '../crypto/KeyHolder';
import { KeyHolder } from '../crypto/KeyHolder';
import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  deriveSharedKey,
  decryptToBase64,
  encryptMDEKForTransfer,
  generateECDHKeyPair,
  generateKEK,
  generateMDEK,
  exportKeyAsBase64,
  importECDHPublicKey,
  importKEK,
  importMDEK,
  unwrapMDEK,
  wrapMDEK,
  type ECDHKeyPair,
} from '../crypto/primitives';
import { deriveKEKFromPhrase } from '../crypto/recovery';
import type { ApiResponse } from '../transport/index';

/** Backend error codes that mean the token is genuinely gone (not transient). */
const TERMINAL_AUTH_ERRORS = new Set(['invalid_token', 'token_revoked', 'token_used', 'token_expired', 'token_not_found']);

/**
 * True only for a DEFINITIVE token revocation/invalidity — the sole condition
 * that justifies forgetting custody material. Offline, network errors, HTTP 429
 * (rate limit) and 5xx (server) are transient and must retain custody (REVIEW
 * H1). The exchange contract's terminal statuses are 400/404/410; 429 is
 * explicitly transient. When in doubt, NOT terminal — keep the user's material.
 */
function isTerminalAuthError(res: ApiResponse<unknown>): boolean {
  if (res.error === 'offline' || res.error === 'network_error') return false;
  if (res.status === 429 || res.status >= 500 || res.status === 0) return false;
  if (res.error && TERMINAL_AUTH_ERRORS.has(res.error)) return true;
  return res.status === 400 || res.status === 404 || res.status === 410;
}

/** What the machine persists. Ciphertext and identifiers only — no key material. */
export interface PersistedAuth {
  /** The plugin token, pasted once. Accepted, disclosed risk (plan §Accepted risks). */
  token: string | null;
  /** This install's device identity, stable across restarts. */
  device_id: string | null;
  /** mDEK wrapped under the KEK the SERVER holds. Useless on its own. */
  wrapped_mdek: string | null;
  /** Session from the last exchange. Short-lived; re-minted from the token. */
  session_token: string | null;
  account_id: string | null;
  /**
   * Whether the account has consented to background work — i.e. to the session
   * escrow that lets Myu act on content while the user isn't present. Set from
   * the token-exchange response; the plugin displays it and never changes it.
   * `null` = not yet told, treated as no.
   */
  background_work_consented: boolean | null;
}

export interface UnlockDeps {
  api: AskMyuApi;
  keys: KeyHolder;
  /** Reads persisted auth (plugin data.json). */
  load: () => PersistedAuth;
  /** Writes persisted auth. Called at unlock, never at unload. */
  save: (auth: Partial<PersistedAuth>) => Promise<void>;
  /** Session token changed — the transport needs it. */
  onSession: (token: string | null) => void;
  /** State changed — settings + views re-render, capture starts/stops. */
  onState: (state: UnlockState, detail?: string) => void;
  /** Device label shown in the account's device list. */
  deviceName: string;
  /** Mock backends skip the ECDH half — see MockApi.pollDeviceTransfer. */
  mockMode: () => boolean;
}

export interface PendingApproval {
  requestId: string;
  /** The 4 digits the user types on an already-approved device. */
  verificationCode: string;
}

export class UnlockMachine {
  private state: UnlockState = 'disconnected';
  /** The one re-mint / re-escrow in flight — every 401 / 403-enc of a burst joins it. */
  private remint: Promise<boolean> | null = null;
  private reescrow: Promise<boolean> | null = null;
  private transferKeys: ECDHKeyPair | null = null;
  private pollTimer: number | null = null;

  constructor(private deps: UnlockDeps) {}

  get current(): UnlockState {
    return this.state;
  }

  private setState(next: UnlockState, detail?: string): void {
    this.state = next;
    this.deps.onState(next, detail);
  }

  // ── load ──────────────────────────────────────────────────────────────────

  /**
   * Called once at plugin load. Walks as far up the ladder as the material
   * allows and stops — every stop is a legitimate resting state with its own UI.
   */
  async resume(): Promise<void> {
    const auth = this.deps.load();
    if (!auth.token) {
      this.setState('disconnected');
      return;
    }

    const session = await this.mintSession(auth);
    if (!session) return; // mintSession has already set the terminal state

    if (!auth.wrapped_mdek) {
      // Token works, but this device has never been approved (or its blob is
      // gone). Approval or recovery phrase from here.
      this.setState('blocked');
      return;
    }

    this.setState('relocked');
    await this.unlockFromServerKEK();
  }

  /** Token → session. Shared by resume() and the settings connect card. */
  private async mintSession(auth: PersistedAuth): Promise<boolean> {
    if (!auth.token || !auth.device_id) {
      this.setState('disconnected');
      return false;
    }

    const res = await this.deps.api.exchangeToken(auth.token, auth.device_id);
    if (!res.ok || !res.data) {
      // Only a DEFINITIVE revocation forgets the token+blob. A transient
      // failure — offline, rate-limit (429), or a 5xx server hiccup — must
      // retain custody and let the next load retry; treating those as
      // revocation would make people re-paste a token they can never see again
      // AND re-approve the device, for nothing (REVIEW H1).
      if (isTerminalAuthError(res)) {
        await this.forget('token_revoked');
      } else {
        this.setState(auth.wrapped_mdek ? 'relocked' : 'blocked', 'offline');
      }
      return false;
    }

    this.deps.onSession(res.data.auth_token);
    await this.deps.save({
      session_token: res.data.auth_token,
      account_id: res.data.account_id,
      background_work_consented: res.data.background_work_consented ?? null,
    });
    return true;
  }

  // ── connect ───────────────────────────────────────────────────────────────

  /**
   * P9 — gateway primacy: the plugin as a FIRST device. Silent crypto at t=0,
   * exactly the web funnel's discipline expressed device-native:
   *
   *   createAccount → session (signup IS the first session) → mint a plugin
   *   token in-flow (durable custody, so restarts re-mint sessions like every
   *   connected install) → GENESIS: a fresh mDEK, adopted through the same
   *   split-custody path an approved transfer uses (wrap under fresh KEK, KEK
   *   to the server, blob local, memory-only key).
   *
   * Recovery hardening is deliberately a FOLLOW-UP, not a gate — no phrase
   * wall at the door. The caller shows the "add a recovery method" prompt;
   * until then, device loss means re-ingesting a vault the user still has
   * (named in the signup modal, because it's true).
   */
  async signup(
    email: string,
    name: string,
    password: string,
    deviceId: string,
    /** The beta-terms bundle the person agreed to at the door (2026-09-02). */
    termsVersion?: string,
  ): Promise<'ceremony' | 'existing_account' | 'email_not_allowed' | 'error'> {
    const created = await this.deps.api.createAccount(email, name, password, termsVersion);
    if (!created.ok || !created.data?.autoken || !created.data.account_id) {
      // 401 here is the closed-beta email gate, not a wrong password.
      return created.status === 401 ? 'email_not_allowed' : 'error';
    }

    // CreateAccount only succeeds for a NEW email — genesis is always right here.
    return this.bootstrapFreshSession(created.data.autoken, created.data.account_id, deviceId, false);
  }

  /**
   * P9 passwordless — redeem an emailed magic-link token (arrives through the
   * obsidian:// handler or pasted from the landing page). ValidateMagicLink
   * creates the account when the email is new, so this IS signup.
   */
  async completeMagicLink(
    token: string,
    deviceId: string,
  ): Promise<'ceremony' | 'existing_account' | 'invalid' | 'error'> {
    const res = await this.deps.api.validateMagicLink(token);
    if (!res.ok || !res.data?.auth_token || !res.data.account_id) {
      // A used/expired token is NOT a clean 4xx: the servlet's error arms
      // REDIRECT to the web error page (302) — and requestUrl may follow it,
      // yielding a 2xx HTML page with no session. So: any answer from the
      // server that isn't a session means the token is bad ('invalid');
      // only 5xx/network — the server not answering — is transient ('error').
      const serverAnswered = res.status > 0 && res.status < 500;
      return serverAnswered ? 'invalid' : 'error';
    }
    // ONLY the explicit flag: `encryption_redirect` is ambiguous — the server
    // sets it for the encryption-SETUP arm too, and a brand-new account must
    // never be told "welcome back" (live-run finding, 2026-08-22).
    const hasKeys = res.data.device_transfer_required === true;
    const outcome = await this.bootstrapFreshSession(res.data.auth_token, res.data.account_id, deviceId, hasKeys);
    return outcome === 'error' ? 'error' : outcome;
  }

  /**
   * The shared tail of every fresh-session onboarding door (password, magic
   * link): persist the session, mint the plugin token (durable
   * custody — restarts re-mint sessions like any connected install), then
   * silent key genesis through the same split-custody path a transfer uses.
   *
   * GENESIS GUARD: if this account already has key material (an existing user
   * signing in through the vault door), minting a fresh mDEK would FORK their
   * content key. The auth response is authoritative (`device_transfer_required`
   * / `encryption_redirect` — the server's own encryption-state check), so the
   * caller passes it; keys are RECEIVED via approval/phrase, never re-created.
   */
  async bootstrapFreshSession(
    autoken: string,
    accountId: string,
    deviceId: string,
    hasExistingKeys: boolean,
  ): Promise<'ceremony' | 'existing_account' | 'error'> {
    this.deps.onSession(autoken);
    await this.deps.save({
      session_token: autoken,
      account_id: accountId,
      device_id: deviceId,
      background_work_consented: null,
    });

    if (hasExistingKeys) {
      // Welcome back — this device gets APPROVED into custody (4-digit code
      // from another device, or the recovery phrase), never a second key.
      this.setState('blocked', 'existing_account');
      return 'existing_account';
    }

    // A fresh account: keys are born in completeGenesis, AFTER the recovery
    // ceremony — the same first-device sequence every other frontend runs
    // (register + recovery/setup with REAL artifacts; no plugin-special
    // shortcuts, no synthetic state). Until then this device is BLOCKED with
    // a session, which is a legitimate resting state (close the modal, finish
    // from settings later).
    this.pendingGenesisDeviceId = deviceId;
    this.setState('blocked', 'genesis_pending');
    return 'ceremony';
  }

  /** Device id captured between the door and the ceremony. */
  private pendingGenesisDeviceId: string | null = null;

  get genesisPending(): boolean {
    return this.pendingGenesisDeviceId !== null;
  }

  /**
   * P9 — key genesis: the same enablement rule every frontend satisfies
   * (device present + recovery stored → encryption on), expressed in the
   * plugin's custody polarity. The account_device_keys custody-split CHECK is
   * the schema's own ruling here: a device row holds wrapped_mdek (web
   * polarity) OR device_kek (plugin polarity), never both — so the plugin's
   * device is BORN as a kek-row via kek/store (whitelisted setup endpoint,
   * write-once guarded), not via device/register, which exists for mdek-rows.
   *
   * Sequence: real phrase-derived recovery first (whitelisted), then
   * adoptMDEK (kek/store creates the device row and flips enablement through
   * the same setup-complete check DeviceRegister/RecoverySetup share, then
   * escrow + blob). hasRecoveryKey is TRUE and MEANS IT from birth.
   */
  async completeGenesis(phrase: string): Promise<'unlocked' | 'error'> {
    const deviceId = this.pendingGenesisDeviceId ?? this.deps.load().device_id;
    if (!deviceId) return 'error';
    try {
      const mdek = await generateMDEK();
      const recoveryKEK = await deriveKEKFromPhrase(phrase);
      const recoveryWrapped = await wrapMDEK(mdek, recoveryKEK);

      const recovery = await this.deps.api.setupRecovery(recoveryWrapped);
      if (!recovery.ok) {
        this.setState('blocked', 'genesis_failed');
        return 'error';
      }

      const ok = await this.adoptMDEK(mdek);
      if (!ok) {
        this.setState('blocked', 'genesis_failed');
        return 'error';
      }

      this.pendingGenesisDeviceId = null;
      return 'unlocked';
    } catch {
      this.setState('blocked', 'genesis_failed');
      return 'error';
    }
  }

  /** Settings: the user pasted a token. */
  async connect(token: string, deviceId: string): Promise<void> {
    await this.deps.save({ token, device_id: deviceId });
    const ok = await this.mintSession(this.deps.load());
    if (!ok) return;

    const auth = this.deps.load();
    if (auth.wrapped_mdek) {
      this.setState('relocked');
      await this.unlockFromServerKEK();
    } else {
      this.setState('blocked');
    }
  }

  /** Settings: disconnect. Local material goes; the server's KEK is the user's to revoke. */
  async disconnect(): Promise<void> {
    await this.forget('disconnected_by_user');
  }

  /** The server ended this account's sessions (admin force-logout): custody is void. */
  async revokedRemotely(): Promise<void> {
    await this.forget('remote_logout');
  }

  private async forget(reason: string): Promise<void> {
    this.stopPolling();
    this.pendingGenesisDeviceId = null;
    this.deps.keys.clear();
    this.deps.onSession(null);
    await this.deps.save({ token: null, session_token: null, wrapped_mdek: null, account_id: null });
    this.setState('disconnected', reason);
  }

  // ── the split-custody re-unlock (the common path) ─────────────────────────

  /**
   * RELOCKED → UNLOCKED. Fetch the server's KEK, unwrap the local blob, keep the
   * result in memory. This is what makes restarts self-service on both consent
   * tiers — no re-approval in the normal course.
   */
  async unlockFromServerKEK(): Promise<void> {
    const auth = this.deps.load();
    if (!auth.device_id || !auth.wrapped_mdek) {
      this.setState('blocked');
      return;
    }

    const res = await this.deps.api.fetchDeviceKEK(auth.device_id);
    if (!res.ok || !res.data?.device_kek) {
      // Only 404 (the KEK row is gone: device revoked / remote wipe) makes the
      // blob permanently inert and justifies dropping it. A revoked TOKEN (403)
      // does NOT delete the KEK, so keep the blob — a fresh token unlocks
      // without re-approval. Rate-limit (429), 5xx, and offline are transient:
      // retain the blob, stay relocked, retry (REVIEW H2).
      if (res.status === 404 || res.error === 'kek_not_found') {
        await this.deps.save({ wrapped_mdek: null });
        this.setState('blocked', 'device_revoked');
      } else if (res.status === 403 || res.error === 'token_revoked') {
        // Token dead, KEK alive: need a new token, keep custody material.
        this.setState('blocked', 'token_revoked');
      } else {
        // offline / 429 / 5xx / unknown — the disclosed residual: capture pauses.
        this.setState('relocked', 'offline');
      }
      return;
    }

    try {
      const kek = await importKEK(res.data.device_kek);
      const mdek = await unwrapMDEK(auth.wrapped_mdek, kek);
      this.deps.keys.set(mdek);
      await this.escrowToSession(auth.device_id);
      this.setState('unlocked');
    } catch {
      // Blob and KEK don't match — a half-finished approval, or storage that was
      // restored from a backup out of step with the server.
      await this.deps.save({ wrapped_mdek: null });
      this.setState('blocked', 'key_mismatch');
    }
  }

  // ── device approval (BLOCKED → UNLOCKED) ──────────────────────────────────

  /**
   * Start an ECDH device transfer. Returns the 4-digit code for the user to
   * type on a device that is already approved.
   */
  async beginApproval(): Promise<PendingApproval | null> {
    const auth = this.deps.load();
    if (!auth.device_id) return null;

    this.transferKeys = await generateECDHKeyPair();
    const res = await this.deps.api.requestDeviceTransfer(auth.device_id, this.transferKeys.publicKey, this.deps.deviceName);
    if (!res.ok || !res.data) return null;

    return { requestId: res.data.request_id, verificationCode: res.data.verification_code };
  }

  /**
   * Poll until the other device approves. Stops on approval, denial, expiry, or
   * `cancelApproval()`. Deliberately not an infinite retry: a request that has
   * expired should surface, not spin.
   */
  startPolling(requestId: string, onResolved: (outcome: 'approved' | 'denied' | 'expired' | 'error') => void): void {
    this.stopPolling();
    const started = Date.now();

    const tick = async () => {
      if (Date.now() - started > 10 * 60 * 1000) {
        this.stopPolling();
        onResolved('expired');
        return;
      }

      const res = await this.deps.api.pollDeviceTransfer(requestId);
      if (!res.ok || !res.data) {
        if (res.error === 'offline' || res.error === 'network_error') return; // keep waiting
        this.stopPolling();
        onResolved('error');
        return;
      }

      if (res.data.status === 'pending') return;
      this.stopPolling();

      if (res.data.status !== 'approved' || !res.data.encrypted_mdek) {
        onResolved(res.data.status === 'denied' ? 'denied' : 'expired');
        return;
      }

      const completed = await this.completeApproval(res.data.encrypted_mdek);
      onResolved(completed ? 'approved' : 'error');
    };

    this.pollTimer = window.setInterval(() => void tick(), 2000);
    void tick();
  }

  stopPolling(): void {
    if (this.pollTimer !== null) {
      window.clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  cancelApproval(): void {
    this.stopPolling();
    this.transferKeys = null;
  }

  /**
   * The mDEK has arrived. Wrap it under a brand-new KEK, write the blob HERE and
   * the KEK THERE — the moment split custody is established.
   */
  private async completeApproval(encryptedMDEK: string): Promise<boolean> {
    try {
      let mdek: CryptoKey;

      if (this.deps.mockMode()) {
        // The mock hands back the raw key rather than performing the approving
        // side's ECDH half. Confined to this branch, on purpose.
        mdek = await importMDEK(encryptedMDEK);
      } else {
        if (!this.transferKeys) return false;
        // Single transfer blob: senderSPKI(91) || iv(12) || ciphertext (REVIEW
        // C1). The approving device's public key is the first 91 bytes; the
        // remainder is exactly the iv||ct that decryptWithKey expects.
        const blob = new Uint8Array(base64ToArrayBuffer(encryptedMDEK));
        if (blob.length <= 91 + 12) return false;
        const senderSPKI = arrayBufferToBase64(blob.slice(0, 91).buffer);
        const ivAndCiphertext = arrayBufferToBase64(blob.slice(91).buffer);
        const shared = await deriveSharedKey(
          this.transferKeys.privateKey,
          await importECDHPublicKey(senderSPKI)
        );
        // Raw key bytes, not text — decryptToBase64, never decryptWithKey
        // (UTF-8 decoding key material mangles it; two-instance run, 2026-08-22).
        mdek = await importMDEK(await decryptToBase64(ivAndCiphertext, shared));
      }

      return await this.adoptMDEK(mdek);
    } catch {
      return false;
    } finally {
      this.transferKeys = null;
    }
  }

  /**
   * P9 — recovery SETUP, in the vault: wrap the current mDEK under a
   * phrase-derived KEK and store the ciphertext. Exact mirror of
   * unlockWithRecoveryPhrase's unwrap, so a phrase written here works on the
   * web and vice versa. The phrase itself never leaves the device.
   */
  async setupRecoveryPhrase(phrase: string): Promise<'ok' | 'locked' | 'error'> {
    const mdek = this.deps.keys.get();
    if (!mdek) return 'locked';
    try {
      const recoveryKEK = await deriveKEKFromPhrase(phrase);
      const wrapped = await wrapMDEK(mdek, recoveryKEK);
      const res = await this.deps.api.setupRecovery(wrapped);
      return res.ok ? 'ok' : 'error';
    } catch {
      return 'error';
    }
  }

  /**
   * The APPROVING side (fleet fix, 2026-08-22): wrap the live mDEK to the
   * requester's public key — the exact blob every receiver already parses —
   * and hand it to the server with the 4-digit code the user read off the new
   * device. The raw key never leaves this function.
   */
  async approvePendingDevice(requestId: string, verificationCode: string, requesterPublicKey: string): Promise<'ok' | 'bad_code' | 'error'> {
    const mdek = this.deps.keys.get();
    if (!mdek) return 'error';
    try {
      const blob = await encryptMDEKForTransfer(mdek, requesterPublicKey);
      const res = await this.deps.api.approveDeviceTransfer(requestId, verificationCode, blob);
      if (res.ok) return 'ok';
      return res.error === 'invalid_verification_code' || res.status === 400 ? 'bad_code' : 'error';
    } catch {
      return 'error';
    }
  }

  // ── recovery phrase (the fallback) ────────────────────────────────────────

  /**
   * BLOCKED → UNLOCKED without another device: unwrap the account's
   * recovery-wrapped mDEK with the user's 12 words. The phrase never leaves this
   * process and is never stored.
   */
  async unlockWithRecoveryPhrase(phrase: string): Promise<'ok' | 'invalid_phrase' | 'no_recovery_key' | 'error'> {
    let recoveryKEK: CryptoKey;
    try {
      recoveryKEK = await deriveKEKFromPhrase(phrase);
    } catch {
      return 'invalid_phrase';
    }

    const res = await this.deps.api.fetchRecoveryWrappedMDEK();
    if (!res.ok || !res.data?.wrapped_mdek_recovery) {
      return res.error === 'no_recovery_key' ? 'no_recovery_key' : 'error';
    }

    try {
      const mdek = await unwrapMDEK(res.data.wrapped_mdek_recovery, recoveryKEK);
      return (await this.adoptMDEK(mdek)) ? 'ok' : 'error';
    } catch {
      // Valid BIP-39 checksum, wrong phrase for this account.
      return 'invalid_phrase';
    }
  }

  // ── shared tail of both onboarding paths ──────────────────────────────────

  /**
   * Establish split custody for a freshly obtained mDEK, then unlock.
   *
   * Order matters and is not incidental: the KEK goes to the server FIRST. If
   * that call fails we have gained nothing and lost nothing — the user retries.
   * Writing the blob first would leave a device holding ciphertext whose key
   * nobody has, which looks identical to remote wipe and would send the user
   * through re-approval for a network blip.
   */
  private async adoptMDEK(mdek: CryptoKey): Promise<boolean> {
    const auth = this.deps.load();
    if (!auth.device_id) return false;

    const kek = await generateKEK();
    const wrapped = await wrapMDEK(mdek, kek);

    this.deps.keys.set(mdek);

    // Order is the enforcement filter's contract, learned live twice over:
    // kek/store is WHITELISTED (setup endpoint) so it always passes, and for
    // a genesis it is also what creates the device row and flips enablement.
    // Escrow comes immediately after, because the moment enablement is on,
    // every NON-whitelisted call requires this session to hold its escrowed
    // key — the same at-unlock escrow web and mobile perform.
    const stored = await this.deps.api.storeDeviceKEK(auth.device_id, await exportKeyAsBase64(kek), this.deps.deviceName);
    if (!stored.ok) {
      this.deps.keys.clear();
      return false;
    }
    await this.escrowToSession(auth.device_id);

    await this.deps.save({ wrapped_mdek: wrapped });

    // Durable custody of the SESSION — mint the plugin token now that the
    // escrow gate is open. HERE, not in the callers: genesis, device
    // approval, and phrase recovery ALL establish custody through this one
    // path, and two of the three were shipping without a token — a device
    // that worked until its first restart (live finding, 2026-08-25).
    if (!this.deps.load().token) {
      const minted = await this.deps.api.createPluginToken(this.deps.deviceName);
      if (minted.ok && minted.data?.token) {
        await this.deps.save({ token: minted.data.token });
      }
    }

    // Whatever door got us here — ceremony, approval, or phrase — there is no
    // pending genesis anymore.
    this.pendingGenesisDeviceId = null;
    this.setState('unlocked');
    return true;
  }

  /**
   * Hand the mDEK to the session — ONLY when the account has consented to
   * background work.
   *
   * Escrow is exactly what that consent is about: it is what lets Myu work on
   * content while the user isn't looking. An account that hasn't opted in gets
   * an unlocked plugin that captures and reads, and its key stays on this
   * device. The plugin never *sets* this — the ceremony is webapp-side and the
   * plugin only reflects it (plan §decisions, background-work consent).
   *
   * `null` means we haven't been told yet — treat as not consented. Failing
   * closed here costs a user some server-side freshness; failing open would
   * hand over a key they declined to give.
   */
  private async escrowToSession(deviceId: string): Promise<boolean> {
    // Session escrow is the PLATFORM's session contract, not a plugin choice:
    // EncryptionEnforcementFilter blocks every non-whitelisted endpoint for an
    // encryption-enabled account until the session holds its escrowed key —
    // the same contract web and mobile satisfy at every unlock. The
    // background-work consent governs what the SERVER does with escrow between
    // visits (its ceremony and enforcement are server-side); withholding
    // session escrow client-side was a plugin-special misreading (live-run
    // finding, 2026-08-22) that left Tier-1 sessions unable to call anything.
    try {
      const res = await this.deps.api.escrowMDEK(await this.deps.keys.exportForEscrow(), deviceId);
      return res.ok;
    } catch {
      // Escrow failing doesn't cost us the local key; the next call that needs
      // server-side decryption will surface it — and the transport asks for a
      // re-escrow on that answer. Don't block unlock on it.
      return false;
    }
  }

  /** Transport saw a 401 — the session died mid-flight. */
  /** Belt-and-braces: an UNLOCKED machine without a durable plugin token
      (sessions minted by the pre-fix approval/recovery paths) heals itself. */
  async ensurePluginToken(): Promise<void> {
    if (!this.deps.keys.isUnlocked || this.deps.load().token) return;
    const minted = await this.deps.api.createPluginToken(this.deps.deviceName);
    if (minted.ok && minted.data?.token) {
      await this.deps.save({ token: minted.data.token });
    }
  }

  /**
   * Transport saw a 401 — the session died mid-flight. Re-mint ONCE for
   * everyone who noticed: a burst of parallel calls (the settings pane opens
   * a dozen at a time) used to re-mint a session each, the key was escrowed to
   * whichever session was current at that moment, and the transport kept a
   * different one — every call after that was refused until a restart (live,
   * 2026-09-03). Resolves true when the new session is usable, so the caller
   * can send the refused request again.
   */
  onUnauthorized(): Promise<boolean> {
    if (!this.remint) {
      this.remint = this.remintSession().finally(() => {
        this.remint = null;
      });
    }
    return this.remint;
  }

  private async remintSession(): Promise<boolean> {
    const auth = this.deps.load();
    if (!auth.token) {
      this.deps.onSession(null);
      return false;
    }
    // A revoked token lands in forget() inside mintSession; a transient
    // failure leaves custody in place and the session cleared, as before.
    const minted = await this.mintSession(auth);
    if (!minted) {
      this.deps.onSession(null);
      return false;
    }
    // The re-minted session starts encryption_blocked like any other. If the
    // key is already in memory, it must be escrowed to THIS session too, or
    // every call after the recovery 403s (same class as the SSE session bug).
    if (this.deps.keys.isUnlocked && auth.device_id) return this.escrowToSession(auth.device_id);
    return true;
  }

  /**
   * Transport saw 403 `{"err":"enc"}` — this session holds no escrowed key:
   * a session minted while the key was not yet in memory, or an escrow that
   * lapsed. Re-escrow, once for everyone who noticed. True means the refused
   * request is worth sending again.
   */
  onEncryptionBlocked(): Promise<boolean> {
    if (!this.reescrow) {
      this.reescrow = (async () => {
        const auth = this.deps.load();
        if (!this.deps.keys.isUnlocked || !auth.device_id || !auth.session_token) return false;
        return this.escrowToSession(auth.device_id);
      })().finally(() => {
        this.reescrow = null;
      });
    }
    return this.reescrow;
  }

  /** Plugin unload. Memory only — nothing to flush, which is the point. */
  shutdown(): void {
    this.stopPolling();
    this.deps.keys.clear();
  }
}
