/**
 * The password for new devices in the vault (2026-10-26): the connect window shows the field first when the account
 * has one, a wrong password says so and stays, the right one unlocks and this device holds the key as the phrase
 * path leaves it; no field without a password; the door's rate limit in words. Driven through the fake UI.
 */

import { strict as assert } from 'node:assert';
import test from 'node:test';

import { FakeEl } from './ui-stub';
import { UnlockMachine } from '../src/auth/UnlockMachine';
import { ApprovalModal, rateLimitNote } from '../src/views/ApprovalModal';
import { DEVICE_PASSWORD_WORDS, wrapWithPassword } from '../src/devicePassword';

const settle = () => new Promise((r) => setTimeout(r, 30));
const inputs = (root: FakeEl) => [...root.walk()].filter((e) => e.tag === 'input');

async function rig(opts: { password?: string; rateLimited?: boolean } = {}) {
  const mdek = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const copy = opts.password ? await wrapWithPassword(mdek, opts.password) : null;
  const calls: string[] = [];
  let held: CryptoKey | null = null;
  const api = {
    fetchPasswordWrappedMDEK: async () => {
      calls.push('read');
      if (opts.rateLimited) return { ok: false, status: 429, data: { success: false, error: 'rate_limit_exceeded', retry_after: 600 }, error: 'rate_limit_exceeded' };
      if (!copy) return { ok: false, status: 404, data: { success: false, has_password: false }, error: 'no_password' };
      return { ok: true, status: 200, data: { success: true, has_password: true, ...copy }, error: null };
    },
    storeDeviceKEK: async () => {
      calls.push('kek');
      return { ok: true, status: 200, data: {}, error: null };
    },
    escrowMDEK: async () => {
      calls.push('escrow');
      return { ok: true, status: 200, data: {}, error: null };
    },
    createPluginToken: async () => ({ ok: true, status: 200, data: { token: 'tok' }, error: null }),
  };
  const saved: Record<string, unknown>[] = [];
  const states: string[] = [];
  const machine = new UnlockMachine({
    api: api as never,
    keys: {
      isUnlocked: false,
      clear: () => {
        held = null;
      },
      set: (k: CryptoKey) => {
        held = k;
      },
      exportForEscrow: async () => 'escrowed',
    } as never,
    load: () => ({ token: null, device_id: 'dev-1', wrapped_mdek: null, session_token: 's', account_id: 'acc', background_work_consented: null }) as never,
    save: async (a: Record<string, unknown>) => {
      saved.push(a);
    },
    onSession: () => undefined,
    onState: (st) => {
      states.push(st);
    },
    deviceName: 'Obsidian — test',
    mockMode: () => true,
  });
  return { machine, calls, saved, states, held: () => held, mdek };
}

test('the connect window: the password field first when the account has one; a wrong password says so and stays; the right one unlocks', async () => {
  const r = await rig({ password: 'correct horse battery' });
  const modal = new ApprovalModal({} as never, r.machine, () => undefined);
  modal.open();
  await settle();
  const root = modal.contentEl as unknown as FakeEl;
  assert.ok(root.visibleTexts().includes(DEVICE_PASSWORD_WORDS.newDeviceField), `the field is drawn — ${root.visibleTexts().join(' | ')}`);
  assert.ok(root.visibleTexts().includes('Approve from another device'), 'the two doors stay');
  const field = inputs(root)[0];
  assert.equal(field.type, 'password');
  assert.deepEqual(r.calls, ['read'], 'the copy was read once when the window opened');

  (field as unknown as { typed: string }).typed = 'wrong password here';
  assert.ok(await root.click(DEVICE_PASSWORD_WORDS.open));
  await settle();
  assert.ok(root.visibleTexts().includes(DEVICE_PASSWORD_WORDS.wrong), `the wrong line — ${root.visibleTexts().join(' | ')}`);
  assert.ok(root.visibleTexts().includes(DEVICE_PASSWORD_WORDS.newDeviceField), 'the field stays');
  assert.deepEqual(r.calls, ['read'], 'a wrong password sends nothing');
  assert.equal(r.held(), null);

  (inputs(root)[0] as unknown as { typed: string }).typed = 'correct horse battery';
  assert.ok(await root.click(DEVICE_PASSWORD_WORDS.open));
  await settle();
  assert.deepEqual(r.calls, ['read', 'kek', 'escrow'], 'the right one establishes custody as the phrase path does');
  assert.ok(r.states.includes('unlocked'));
  assert.ok(r.held(), 'this device holds the key');
  assert.ok(r.saved.some((a) => typeof a.wrapped_mdek === 'string'), 'the wrapped copy is saved for next time');
  assert.ok(r.saved.some((a) => a.token === 'tok'), 'and the plugin token minted');
  assert.ok(!root.visibleTexts().includes(DEVICE_PASSWORD_WORDS.newDeviceField), 'the window moved on');
});

test('without a password for new devices there is no field, and the machine says so', async () => {
  const r = await rig();
  const modal = new ApprovalModal({} as never, r.machine, () => undefined);
  modal.open();
  await settle();
  const root = modal.contentEl as unknown as FakeEl;
  assert.ok(!root.visibleTexts().includes(DEVICE_PASSWORD_WORDS.newDeviceField));
  assert.ok(root.visibleTexts().includes('Use your recovery phrase'));
  assert.equal(await r.machine.unlockWithPassword('anything at all'), 'no_password');
  assert.deepEqual(r.calls, ['read'], 'one read, kept');
});

test("the door's rate limit: the sentence with the server's minutes, no field; the words", async () => {
  const r = await rig({ rateLimited: true });
  const modal = new ApprovalModal({} as never, r.machine, () => undefined);
  modal.open();
  await settle();
  const root = modal.contentEl as unknown as FakeEl;
  assert.ok(root.visibleTexts().includes(rateLimitNote(600)), root.visibleTexts().join(' | '));
  assert.equal(rateLimitNote(600), 'Too many tries with the password for new devices. Try again in 10 minutes, or use one of the doors below.');
  assert.equal(rateLimitNote(30), 'Too many tries with the password for new devices. Try again in a minute, or use one of the doors below.');
  assert.equal(rateLimitNote(undefined), 'Too many tries with the password for new devices. Try again later, or use one of the doors below.');
  for (const w of [DEVICE_PASSWORD_WORDS.newDeviceField, DEVICE_PASSWORD_WORDS.wrong, rateLimitNote(600)]) assert.doesNotMatch(w, /\b(kdf|pbkdf|mdek|kek|wrap|token)\b/i, w);
});
