/**
 * A key the server refuses as not the account's (2026-11-18, BRIEF_FRONTEND_KEY_TEST_AT_THE_DOOR): the plugin lends it no more (a call
 * refused for the key asks again without lending it), drops it from memory and from what this device keeps, and waits for approval as a
 * device never approved, with its own plain words in Settings. Approval brings it back.
 */

import { strict as assert } from 'node:assert';
import test from 'node:test';

import { UnlockMachine } from '../src/auth/UnlockMachine';

function rig() {
  let escrows = 0;
  let cleared = 0;
  const saved: Record<string, unknown>[] = [];
  const states: Array<[string, string | undefined]> = [];
  const machine = new UnlockMachine({
    api: {
      escrowMDEK: async () => {
        escrows += 1;
        return { ok: false, status: 409, data: { success: false, error: 'key_not_yours', said: 'This device can’t open your account yet.' }, error: 'key_not_yours' };
      },
    } as never,
    keys: { isUnlocked: true, clear: () => void (cleared += 1), exportForEscrow: async () => 'escrowed' } as never,
    load: () => ({ token: 'tok', device_id: 'dev-1', wrapped_mdek: 'wrapped', session_token: 's', account_id: 'acc', background_work_consented: true }) as never,
    save: async (a: Record<string, unknown>) => void saved.push(a),
    onSession: () => undefined,
    onState: (st, detail) => void states.push([st, detail]),
    deviceName: 'Obsidian — test',
    mockMode: () => true,
  });
  return { machine, escrows: () => escrows, cleared: () => cleared, saved, states };
}

test('refused: lent once, then never again; the key dropped here; the device waits for approval', async () => {
  const r = rig();
  assert.equal(await r.machine.onEncryptionBlocked(), false);
  assert.equal(r.escrows(), 1);
  assert.equal(r.cleared(), 1, 'gone from memory');
  assert.ok(r.saved.some((a) => 'wrapped_mdek' in a && a.wrapped_mdek === null), 'gone from what this device keeps');
  assert.deepEqual(r.states.at(-1), ['blocked', 'not_this_account']);
  for (let i = 0; i < 3; i++) assert.equal(await r.machine.onEncryptionBlocked(), false);
  assert.equal(r.escrows(), 1, 'never lent again by a refused call');
});

test('Settings says it plainly, with the way in', async () => {
  const { describeState } = await import('../src/views/SettingsTab');
  const w = describeState('blocked', 'not_this_account');
  assert.equal(w, "this device can't open your account yet. Approve it from a device you already use, or use your recovery phrase");
  assert.doesNotMatch(w, /\bkeys?\b|seal|escrow/i);
});

function rig2(opts: { escrow: 'refuse' | 'take' }) {
  let escrows = 0;
  let auth: Record<string, unknown> = { token: 'tok', device_id: 'dev-1', wrapped_mdek: 'wrapped-old', session_token: 's', account_id: 'acc', background_work_consented: true };
  const states: Array<[string, string | undefined]> = [];
  let held: CryptoKey | null = null;
  const machine = new UnlockMachine({
    api: {
      fetchDeviceKEK: async () => ({ ok: true, status: 200, data: { device_kek: 'k' }, error: null }),
      storeDeviceKEK: async () => ({ ok: true, status: 200, data: {}, error: null }),
      escrowMDEK: async () => {
        escrows += 1;
        return opts.escrow === 'refuse' ? { ok: false, status: 409, data: { error: 'key_not_yours' }, error: 'key_not_yours' } : { ok: true, status: 200, data: {}, error: null };
      },
      createPluginToken: async () => ({ ok: true, status: 200, data: { token: 'tok' }, error: null }),
    } as never,
    keys: { get isUnlocked() { return !!held; }, set: (k: CryptoKey) => void (held = k), clear: () => void (held = null), exportForEscrow: async () => 'escrowed' } as never,
    load: () => auth as never,
    save: async (a: Record<string, unknown>) => void (auth = { ...auth, ...a }),
    onSession: () => undefined,
    onState: (st, detail) => void states.push([st, detail]),
    deviceName: 'Obsidian — test',
    mockMode: () => true,
  });
  return { machine, escrows: () => escrows, auth: () => auth, states, held: () => held };
}

test('refused on reopening: never "unlocked" after it; the stored copy set aside, byte for byte, with its time', async () => {
  const r = rig2({ escrow: 'refuse' });
  // The KEK on file does not open the stand-in's blob; drive the refusal through the same door the reopening uses.
  await r.machine.onEncryptionBlocked();
  assert.equal(r.escrows(), 0, 'nothing held yet, nothing lent');
  (r.machine as unknown as { deps: { keys: { set: (k: unknown) => void } } }).deps.keys.set({} as never);
  await r.machine.onEncryptionBlocked();
  assert.equal(r.escrows(), 1);
  const aside = r.auth().refused_keys as Array<{ at: string; device_id: string; wrapped_mdek: string }>;
  assert.equal(aside.length, 1);
  assert.equal(aside[0].wrapped_mdek, 'wrapped-old', 'byte for byte the copy it held');
  assert.equal(aside[0].device_id, 'dev-1');
  assert.ok(!Number.isNaN(Date.parse(aside[0].at)));
  assert.equal(r.auth().wrapped_mdek, null);
  assert.deepEqual(r.states.at(-1), ['blocked', 'not_this_account']);
  assert.equal(r.held(), null);
});

test('a new key (approval, the phrase) after a refusal is tried afresh; the set-aside copy stays', async () => {
  const r = rig2({ escrow: 'refuse' });
  (r.machine as unknown as { deps: { keys: { set: (k: unknown) => void } } }).deps.keys.set({} as never);
  await r.machine.onEncryptionBlocked();
  assert.equal((r.auth().refused_keys as unknown[]).length, 1);
  const fresh = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  // Refused again: never saved as this device's copy, set aside once more; never "unlocked".
  const again = await (r.machine as unknown as { adoptMDEK: (k: CryptoKey) => Promise<boolean> }).adoptMDEK(fresh);
  assert.equal(again, false);
  assert.equal(r.auth().wrapped_mdek, null, 'the refused copy is not saved as this device’s');
  assert.equal((r.auth().refused_keys as unknown[]).length, 2, 'one per refusal');
  assert.ok(!r.states.some(([s]) => s === 'unlocked'));
});

test('reopening from the server’s KEK, refused at the door: never "unlocked", the copy set aside, the device waits for approval', async () => {
  const p = await import('../src/crypto/primitives');
  const kek = await p.generateKEK();
  const mdek = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const wrapped = await p.wrapMDEK(mdek, kek);
  const r = rig2({ escrow: 'refuse' });
  const a = r.auth();
  a.wrapped_mdek = wrapped;
  (r.machine as unknown as { deps: { api: { fetchDeviceKEK: unknown } } }).deps.api.fetchDeviceKEK = async () => ({ ok: true, status: 200, data: { device_kek: await p.exportKeyAsBase64(kek) }, error: null });
  await r.machine.unlockFromServerKEK();
  assert.equal(r.escrows(), 1);
  assert.ok(!r.states.some(([s]) => s === 'unlocked'), r.states.map(([s, d]) => `${s}:${d}`).join(' '));
  assert.deepEqual(r.states.at(-1), ['blocked', 'not_this_account']);
  assert.equal(r.held(), null);
  assert.equal((r.auth().refused_keys as Array<{ wrapped_mdek: string }>)[0].wrapped_mdek, wrapped, 'set aside, byte for byte');
  assert.equal(r.auth().wrapped_mdek, null);
});

test('Disconnect (the person’s own) takes the set-aside copies; a sign-out the server made keeps them', async () => {
  const r = rig2({ escrow: 'refuse' });
  (r.machine as unknown as { deps: { keys: { set: (k: unknown) => void } } }).deps.keys.set({} as never);
  await r.machine.onEncryptionBlocked();
  assert.equal((r.auth().refused_keys as unknown[]).length, 1);
  await r.machine.revokedRemotely();
  assert.equal((r.auth().refused_keys as unknown[]).length, 1, 'kept through a sign-out the server made');
  await r.machine.disconnect();
  assert.deepEqual(r.auth().refused_keys, [], 'gone with the person’s own Disconnect');
});

test('never deleted without being set aside (18 Nov): a sign-out the server made and a copy that does not match are set aside, with why', async () => {
  const r = rig2({ escrow: 'take' });
  r.auth().wrapped_mdek = 'wrapped-held';
  await r.machine.revokedRemotely();
  assert.deepEqual((r.auth().refused_keys as Array<{ wrapped_mdek: string; why: string }>).map((x) => [x.wrapped_mdek, x.why]), [['wrapped-held', 'remote_logout']]);
  assert.equal(r.auth().wrapped_mdek, null);
  // A copy its device key does not open (a half-finished approval): set aside, not lost.
  const r2 = rig2({ escrow: 'take' });
  const p = await import('../src/crypto/primitives');
  r2.auth().wrapped_mdek = 'not-a-real-copy';
  (r2.machine as unknown as { deps: { api: { fetchDeviceKEK: unknown } } }).deps.api.fetchDeviceKEK = async () => ({ ok: true, status: 200, data: { device_kek: await p.exportKeyAsBase64(await p.generateKEK()) }, error: null });
  await r2.machine.unlockFromServerKEK();
  assert.deepEqual((r2.auth().refused_keys as Array<{ wrapped_mdek: string; why: string }>).map((x) => [x.wrapped_mdek, x.why]), [['not-a-real-copy', 'key_mismatch']]);
  // The person's own Disconnect takes them all.
  await r2.machine.disconnect();
  assert.deepEqual(r2.auth().refused_keys, []);
});

// The door words against shared's, byte for byte: tests/internal/doorAnswersParity.test.ts (the public mirror has no shared).

test('a second key at the phrase door: the server’s sentence; "not now" at an approve door and at the lending door (18 Nov)', async () => {
  const SENT = 'That can’t be changed from this device (server).';
  let escrows = 0;
  const auth: Record<string, unknown> = { token: 'tok', device_id: 'dev-1', wrapped_mdek: 'wrapped-old', session_token: 's', account_id: 'acc', background_work_consented: true };
  const mdek = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const machine = new UnlockMachine({
    api: {
      setupRecovery: async () => ({ ok: false, status: 409, data: { error: 'key_second', message: SENT }, error: 'key_second' }),
      approveDeviceTransfer: async () => ({ ok: false, status: 503, data: { error: 'not_now' }, error: 'not_now' }),
      escrowMDEK: async () => ((escrows += 1), { ok: false, status: 503, data: { error: 'not_now' }, error: 'not_now' }),
    } as never,
    keys: { isUnlocked: true, get: () => mdek, set: () => undefined, clear: () => undefined, exportForEscrow: async () => 'escrowed' } as never,
    load: () => auth as never,
    save: async (a: Record<string, unknown>) => void Object.assign(auth, a),
    onSession: () => undefined,
    onState: () => undefined,
    deviceName: 'Obsidian — test',
    mockMode: () => true,
  });
  const { generatePhrase } = await import('../src/crypto/recovery');
  assert.deepEqual(await machine.setupRecoveryPhrase(generatePhrase()), { said: SENT });
  // An approve door says "not now": said, nothing changed.
  const p = await import('../src/crypto/primitives');
  const pair = await p.generateECDHKeyPair();
  assert.equal(await machine.approvePendingDevice('req-n', '1234', pair.publicKey), 'not_now');
  // The lending door says "not now": no tight loop; nothing set aside.
  assert.equal(await machine.onEncryptionBlocked(), false);
  assert.equal(await machine.onEncryptionBlocked(), false);
  assert.equal(escrows, 1, 'nothing sent inside the pause');
  assert.equal(auth.refused_keys, undefined, 'nothing set aside');
  assert.equal(auth.wrapped_mdek, 'wrapped-old', 'nothing dropped');
});
