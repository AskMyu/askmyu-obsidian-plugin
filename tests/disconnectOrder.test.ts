/**
 * Disconnect ends this vault's sign-in on the server first (2026-11-19, the journal's search after a sign-out): while the key is still lent
 * the server saves the journal's search index sealed with it, then drops the key itself. Then the vault's own material goes, whatever the
 * server answered.
 */

import { strict as assert } from 'node:assert';
import test from 'node:test';

import { UnlockMachine } from '../src/auth/UnlockMachine';

function rig(endSignIn: () => Promise<unknown>) {
  const calls: string[] = [];
  let auth: Record<string, unknown> = { token: 'tok', device_id: 'dev-1', wrapped_mdek: 'wrapped', session_token: 's', account_id: 'acc' };
  let held: unknown = {};
  const machine = new UnlockMachine({
    api: {
      endSignIn: async () => {
        calls.push(`ended (session ${String(auth.session_token)}, key ${held ? 'held' : 'gone'})`);
        return endSignIn();
      },
    } as never,
    keys: { get isUnlocked() { return !!held; }, set: (k: unknown) => void (held = k), clear: () => void (calls.push('key cleared'), (held = null)), exportForEscrow: async () => 'e' } as never,
    load: () => auth as never,
    save: async (a: Record<string, unknown>) => void (calls.push('saved'), (auth = { ...auth, ...a })),
    onSession: () => undefined,
    onState: () => undefined,
    deviceName: 'Obsidian — test',
    mockMode: () => true,
  });
  return { machine, calls, auth: () => auth };
}

test('Disconnect: the sign-in ended on the server first, with the key still held and the session still there; then the vault’s material goes', async () => {
  const r = rig(async () => ({ ok: true, status: 200, data: {}, error: null }));
  await r.machine.disconnect();
  assert.deepEqual(r.calls, ['ended (session s, key held)', 'key cleared', 'saved']);
  assert.equal(r.auth().session_token, null);
  assert.equal(r.auth().token, null);
});

test('Disconnect when the server cannot be reached: the vault’s material goes all the same', async () => {
  const r = rig(async () => {
    throw new Error('offline');
  });
  await r.machine.disconnect();
  assert.equal(r.auth().session_token, null);
  assert.equal(r.auth().wrapped_mdek, null);
});

test('Disconnect pressed again, with no sign-in left in the vault: nothing more asked of the server', async () => {
  const r = rig(async () => ({ ok: true, status: 200, data: {}, error: null }));
  await r.machine.disconnect();
  await r.machine.disconnect();
  assert.equal(r.calls.filter((c) => c.startsWith('ended')).length, 1);
});
