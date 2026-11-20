/**
 * The address to confirm, and an address held by a password account nobody confirmed (2026-11-17, shared `addressHeld.ts`),
 * in the vault, on the functional UI fake and the real `Api` over a fake wire: the sentence after a password sign-up (once;
 * mailed, not mailed, an older server saying nothing); Settings saying whether the account's own address is confirmed, with
 * "Mail the confirmation again" posting that address; the one question on a 409 from the mailed link's redeem (a wrong
 * password keeps it with the server's words, too many and an ended question leave only the way back,
 * "Start my own account"), and the same link redeemed exactly once more after an answer. The mock answers the same shapes.
 */

import { strict as assert } from 'node:assert';
import test from 'node:test';

import { FakeEl, notices, answerRequestsWith } from './ui-stub';
import { Api } from '../src/transport/api';
import { Transport } from '../src/transport/index';
import { RequestBudget } from '../src/transport/budget';
import { MockApi } from '../src/transport/mock';
import { UnlockMachine, type MagicLinkOutcome } from '../src/auth/UnlockMachine';
import { SignupModal } from '../src/views/SignupModal';
import { ADDRESS_IN_USE_WORDS } from '../src/addressInUse';
import { AddressHeldModal, heardAnswer } from '../src/views/AddressHeldModal';
import { AskMyuSettingTab, mailedAgainWords } from '../src/views/SettingsTab';
import { againToken, magicSignin, type MagicSigninDeps } from '../src/addressHeldSignin';
import { ADDRESS_CONFIRM_WORDS, ADDRESS_HELD_WORDS, type AddressHeld } from '../src/addressHeld';

const settle = (ms = 5) => new Promise((r) => setTimeout(r, ms));
type Answer = { status: number; data: unknown };
type Call = { method: string; path: string; body?: Record<string, unknown> };

/** The real `Api` over a fake wire: each path answers from `routes`; every call is kept. */
function wire(routes: Record<string, (body: Record<string, unknown> | undefined, call: number) => Answer>) {
  const calls: Call[] = [];
  const count = new Map<string, number>();
  const answer = (method: string, path: string, body?: Record<string, unknown>) => {
    calls.push({ method, path, ...(body ? { body } : {}) });
    const key = path.split('?')[0];
    const n = count.get(key) ?? 0;
    count.set(key, n + 1);
    const r = routes[key]?.(body, n) ?? { status: 200, data: {} };
    const err = r.data && typeof r.data === 'object' ? (r.data as { error?: unknown }).error : undefined;
    return { status: r.status, ok: r.status >= 200 && r.status < 300, data: r.data, error: typeof err === 'string' ? err : r.status >= 400 ? `http_${r.status}` : null };
  };
  const api = new Api({
    get: async (path: string) => answer('GET', path),
    post: async (path: string, body: Record<string, unknown>) => answer('POST', path, body),
  } as never);
  return { api, calls, of: (path: string) => calls.filter((c) => c.path.split('?')[0] === path) };
}

function machineOn(api: unknown) {
  const states: string[] = [];
  const machine = new UnlockMachine({
    api: api as never,
    keys: { isUnlocked: false, clear: () => undefined, set: () => undefined, exportForEscrow: async () => 'escrowed' } as never,
    load: () => ({ token: null, device_id: 'dev-1', wrapped_mdek: null, session_token: null, account_id: null, background_work_consented: null }),
    save: async () => undefined,
    onSession: () => undefined,
    onState: (st) => void states.push(st),
    deviceName: 'Obsidian — test',
    mockMode: () => true,
  });
  return { machine, states };
}

/** Words never on screen (the words rule). */
const NEVER = /\b(identity|login|log in|merge|candidate|handle|health|skip|gap|lacking|missing|token|409)\b|\/(auth|account)\//i;
const noCodeWords = (texts: string[]) => {
  for (const t of texts) assert.doesNotMatch(t, NEVER, t);
};

// ── A. the sentence after a password sign-up ───────────────────────────────

async function signUp(createAnswer: Answer) {
  const w = wire({
    '/terms': () => ({ status: 200, data: { current_version: '2026-09-01', urls: {} } }),
    '/account/create': () => createAnswer,
    '/auth/magic-link/request': () => ({ status: 200, data: { expires_in_minutes: 15 } }),
  });
  const { machine } = machineOn(w.api);
  let ceremonies = 0;
  const plugin = {
    settings: { base_url: 'http://localhost/api' },
    backend: w.api,
    unlock: machine,
    ensureDeviceId: async () => 'dev-1',
    openGenesisCeremony: () => void ceremonies++,
  };
  const modal = new SignupModal({} as never, plugin as never, () => undefined);
  modal.open();
  await settle();
  const root = modal.contentEl as unknown as FakeEl;
  const box = root.find((e) => e.tag === 'input' && e.attrs.type === 'checkbox');
  assert.ok(box?.onchange);
  box.checked = true;
  box.onchange();
  assert.ok(await root.click('Use a password instead'));
  Object.assign(modal as unknown as Record<string, unknown>, { email: 'ann@example.com', name: 'Ann', password: 'password1' });
  const before = notices.length;
  assert.ok(await root.click('Create my account'));
  await settle(20);
  return { said: notices.slice(before), machine, ceremonies: () => ceremonies, calls: w.of('/account/create'), root, w };
}

const session = { autoken: 'sess-1', account_id: 'acc-1' };

test('sign-up: the mail went, so the sentence says so, once; the ceremony still opens', async () => {
  const r = await signUp({ status: 200, data: { ...session, email: 'ann@example.com', email_confirmed: false, email_confirmation: 'sent', email_message: 'We sent a link to ann@example.com. Open it to confirm your address.' } });
  assert.deepEqual(r.said, [ADDRESS_CONFIRM_WORDS.mailed('ann@example.com')], 'our sentence, once');
  assert.equal(r.ceremonies(), 1, 'the key ceremony opens as before');
  assert.equal(r.machine.takeSignupWords(), null, 'taken: never said a second time');
  assert.equal(r.calls.length, 1);
});

test("sign-up: the mail did not go, so the server's sentence (or ours when it sends none)", async () => {
  const withWords = await signUp({ status: 200, data: { account: { ...session, email_confirmed: false, email_confirmation: 'not_sent', email_message: 'Mail is slow today. Try again from Settings.' } } });
  assert.deepEqual(withWords.said, ['Mail is slow today. Try again from Settings.'], "the server's words, read through the nested account object");
  const without = await signUp({ status: 200, data: { ...session, email_confirmed: false, email_confirmation: 'not_sent' } });
  assert.deepEqual(without.said, [ADDRESS_CONFIRM_WORDS.notMailed('ann@example.com')]);
});

test('sign-up refused for its address: the server’s sentence, nothing made, the mailed sign-in instead, and back to the start', async () => {
  // The server's own words (not ours, so the test can tell them apart).
  const sentence = 'This address is taken for a password sign-up. Sign in with the code we mail to it.';
  const r = await signUp({ status: 409, data: { success: false, error: 'address_in_use', message: sentence } });
  assert.equal(r.ceremonies(), 0, 'nothing is made');
  assert.deepEqual(r.said, [], 'no notice of a made account');
  assert.ok(r.root.visibleTexts().includes(sentence), r.root.visibleTexts().join(' | '));
  noCodeWords(r.root.visibleTexts().filter((t) => t !== sentence));
  // The mailed sign-in, to the same address (its "sent" stage watches with the window's timer: a stand-in one here).
  const g = globalThis as unknown as { window?: unknown };
  const had = 'window' in g;
  const timers: number[] = [];
  g.window = { setInterval: () => (timers.push(1), timers.length), clearInterval: () => undefined };
  try {
    assert.ok(await r.root.click(ADDRESS_IN_USE_WORDS.mailLink));
    await settle(20);
  } finally {
    if (!had) delete g.window;
  }
  assert.deepEqual(r.w.of('/auth/magic-link/request').map((c) => c.body?.email), ['ann@example.com']);
  // And the way back, from a second refusal.
  const again = await signUp({ status: 409, data: { success: false, error: 'address_in_use' } });
  assert.ok(again.root.visibleTexts().includes(ADDRESS_IN_USE_WORDS.said), 'ours when the server sends none');
  assert.ok(await again.root.click(ADDRESS_IN_USE_WORDS.back));
  assert.ok(again.root.visibleTexts().includes('Create my account'), 'back at the start');
  // The allow list's refusal still comes first, as before.
  const gate = await signUp({ status: 401, data: { error: 'email_not_allowed' } });
  assert.ok(!gate.root.visibleTexts().includes(ADDRESS_IN_USE_WORDS.said));
});

test('sign-up: an older server says nothing about the address, and nothing new is said', async () => {
  const r = await signUp({ status: 200, data: { ...session } });
  assert.deepEqual(r.said, []);
  assert.equal(r.ceremonies(), 1);
});

test('the words after sign-up are plain', () => {
  noCodeWords([ADDRESS_CONFIRM_WORDS.mailed('ann@example.com'), ADDRESS_CONFIRM_WORDS.notMailed('ann@example.com'), ADDRESS_CONFIRM_WORDS.confirmed, ADDRESS_CONFIRM_WORDS.notConfirmed, ADDRESS_CONFIRM_WORDS.mailAgain, ADDRESS_CONFIRM_WORDS.mailedAgain('ann@example.com'), ADDRESS_CONFIRM_WORDS.mailFailed]);
});

// ── A. Settings → Account → Email addresses ────────────────────────────────

async function emailsSection(account: Answer, resend?: (body: Record<string, unknown> | undefined) => Answer) {
  const w = wire({
    '/account/emails/list': () => ({ status: 200, data: { emails: [{ email: 'you@example.com', is_primary: true, verified: true }, { email: 'work@example.com', is_primary: false, verified: false }] } }),
    '/account/get': () => account,
    '/account/emails/resend': (body) => resend?.(body) ?? { status: 200, data: {} },
  });
  const tab = new AskMyuSettingTab({} as never, { unlock: { current: 'unlocked' }, settings: { account_id: 'acc' }, backend: w.api } as never);
  const host = new FakeEl('div');
  await (tab as unknown as { renderAccountEmails(el: FakeEl): Promise<void> }).renderAccountEmails(host);
  return { host, w };
}

test('settings: the own address not confirmed says so, and "Mail the confirmation again" posts that address', async () => {
  const { host, w } = await emailsSection(
    { status: 200, data: { account_id: 'acc', email: 'you@example.com', email_confirmed: false } },
    (body) => ({ status: 200, data: { success: true, email_confirmation: 'sent', email_message: `We sent a link to ${String(body?.email)}. Open it to confirm your address.` } }),
  );
  const texts = host.visibleTexts();
  assert.ok(texts.includes(`Primary · ${ADDRESS_CONFIRM_WORDS.notConfirmed}`), texts.join(' | '));
  assert.ok(texts.includes('Waiting for you to click the link Myu emailed'), 'the other address keeps its own words');
  noCodeWords(texts);
  const before = notices.length;
  assert.ok(await host.click(ADDRESS_CONFIRM_WORDS.mailAgain), 'the button is on the row');
  await settle();
  assert.deepEqual(w.of('/account/emails/resend').map((c) => c.body), [{ email: 'you@example.com' }], "the account's own address, once");
  assert.deepEqual(notices.slice(before), ['We sent a link to you@example.com. Open it to confirm your address.'], "the server's sentence");
});

test("settings: the mail could not go — the failure words; with no sentence from the server, ours", async () => {
  const failed = await emailsSection({ status: 200, data: { email: 'you@example.com', email_confirmed: false } }, () => ({ status: 503, data: { success: false, email_confirmation: 'not_sent' } }));
  let before = notices.length;
  assert.ok(await failed.host.click(ADDRESS_CONFIRM_WORDS.mailAgain));
  await settle();
  assert.deepEqual(notices.slice(before), [ADDRESS_CONFIRM_WORDS.mailFailed]);

  const plain = await emailsSection({ status: 200, data: { email: 'you@example.com', email_confirmed: false } }, () => ({ status: 200, data: { success: true } }));
  before = notices.length;
  assert.ok(await plain.host.click(ADDRESS_CONFIRM_WORDS.mailAgain));
  await settle();
  assert.deepEqual(notices.slice(before), [ADDRESS_CONFIRM_WORDS.mailedAgain('you@example.com')]);

  assert.equal(mailedAgainWords({ ok: true, data: { success: true, email_confirmation: 'not_sent' } }, 'a@b.co'), null);
  assert.equal(mailedAgainWords(null, 'a@b.co'), null);
});

test('settings: a confirmed address says so with no button; an older server (or a refused read) shows nothing new', async () => {
  const confirmed = await emailsSection({ status: 200, data: { email: 'you@example.com', email_confirmed: true } });
  let texts = confirmed.host.visibleTexts();
  assert.ok(texts.includes(`Primary · ${ADDRESS_CONFIRM_WORDS.confirmed}`), texts.join(' | '));
  assert.ok(!texts.includes(ADDRESS_CONFIRM_WORDS.mailAgain));

  for (const older of [{ status: 200, data: { email: 'you@example.com' } }, { status: 500, data: null }]) {
    const { host } = await emailsSection(older);
    texts = host.visibleTexts();
    assert.ok(texts.includes('Primary'), texts.join(' | '));
    assert.ok(!texts.some((t) => t.includes(ADDRESS_CONFIRM_WORDS.confirmed)), 'no confirmation words at all');
    assert.ok(!texts.includes(ADDRESS_CONFIRM_WORDS.mailAgain));
  }
});

test("settings: the own address the list does not carry gets its own row", async () => {
  const w = wire({
    '/account/emails/list': () => ({ status: 200, data: { emails: [] } }),
    '/account/get': () => ({ status: 200, data: { email: 'you@example.com', email_confirmed: false } }),
  });
  const tab = new AskMyuSettingTab({} as never, { unlock: { current: 'unlocked' }, settings: {}, backend: w.api } as never);
  const host = new FakeEl('div');
  await (tab as unknown as { renderAccountEmails(el: FakeEl): Promise<void> }).renderAccountEmails(host);
  const texts = host.visibleTexts();
  assert.ok(texts.includes('you@example.com') && texts.includes(ADDRESS_CONFIRM_WORDS.notConfirmed) && texts.includes(ADDRESS_CONFIRM_WORDS.mailAgain), texts.join(' | '));
});

// ── B. the one question on a held address ──────────────────────────────────

const HELD_409 = (token: string): Answer => ({
  status: 409,
  data: {
    success: false,
    error: 'address_held',
    held_token: token,
    email: 'ann@example.com',
    message: 'An account was made here with a password and never confirmed. (Server words.)',
    choices: [
      { id: 'password', label: 'Enter its password' },
      { id: 'start_own', label: 'Start my own account' },
    ],
  },
});
const SIGNED_IN: Answer = { status: 200, data: { auth_token: 'sess-9', account_id: 'acc-9', is_new_account: false } };
const WRONG = "That password doesn't open it. Try again, or start your own account.";

/** The vault's link sign-in, as main.ts wires it, over the fake wire. */
function heldRig(validate: (call: number) => Answer, heldAnswer: (body: Record<string, unknown> | undefined, call: number) => Answer) {
  const w = wire({ '/auth/magic-link/validate': (_b, n) => validate(n), '/auth/address-held': heldAnswer });
  const { machine } = machineOn(w.api);
  const asked: Array<{ modal: AddressHeldModal; held: AddressHeld; answered: (againUrl?: string) => Promise<void> }> = [];
  const landed: string[] = [];
  let backs = 0;
  const deps: MagicSigninDeps = {
    redeem: (t): Promise<MagicLinkOutcome> => machine.completeMagicLink(t, 'dev-1'),
    ask: (held, answered) => {
      const modal = new AddressHeldModal({} as never, { held, answer: (b) => w.api.answerAddressHeld(b), answered, back: () => void backs++ });
      asked.push({ modal, held, answered });
      modal.open();
    },
    landed: (o) => void landed.push(o),
  };
  const root = () => asked[asked.length - 1].modal.contentEl as unknown as FakeEl;
  const passwordField = () => root().find((e) => e.tag === 'input' && e.type === 'password');
  const type = (v: string) => {
    const f = passwordField();
    assert.ok(f, 'the password field is open');
    (f as unknown as { typed: string }).typed = v;
  };
  return { w, machine, asked, landed, backs: () => backs, deps, root, passwordField, type, validates: () => w.of('/auth/magic-link/validate') };
}

test('the mailed link answered 409: the question, in the server\'s words, with its two choices and the way back — never "link expired"', async () => {
  const r = heldRig(() => HELD_409('held-1'), () => ({ status: 200, data: { success: true } }));
  const before = notices.length;
  await magicSignin(r.deps, 'link-1');
  assert.equal(r.asked.length, 1, 'one question');
  assert.deepEqual(r.landed, [], 'not landed: asked first');
  assert.deepEqual(notices.slice(before), [], 'no "expired or used" notice');
  const texts = r.root().visibleTexts();
  for (const t of ['ann@example.com', 'An account was made here with a password and never confirmed. (Server words.)', 'Enter its password', 'Start my own account', ADDRESS_HELD_WORDS.back]) assert.ok(texts.includes(t), `${t} — ${texts.join(' | ')}`);
  assert.ok(!r.passwordField(), 'the field waits for "Enter its password"');
  assert.ok(!texts.some((t) => t.includes('held-1')), 'the held token is never on screen');
  noCodeWords(texts);
  const outcome = await r.machine.completeMagicLink('link-1', 'dev-1');
  assert.ok(typeof outcome === 'object' && outcome.held.held_token === 'held-1', 'the machine reads the 409 as the question, not as a used link');
});

test('a wrong password: the server\'s words, and the question stays with its field', async () => {
  const r = heldRig(() => HELD_409('held-1'), () => ({ status: 401, data: { success: false, error: 'wrong_password', tries_left: 4, message: WRONG } }));
  await magicSignin(r.deps, 'link-1');
  assert.ok(await r.root().click('Enter its password'));
  const texts0 = r.root().visibleTexts();
  assert.ok(texts0.includes(ADDRESS_HELD_WORDS.passwordField) && texts0.includes(ADDRESS_HELD_WORDS.open), texts0.join(' | '));
  r.type('not it');
  assert.ok(await r.root().click(ADDRESS_HELD_WORDS.open));
  await settle();
  assert.deepEqual(r.w.of('/auth/address-held').map((c) => c.body), [{ held_token: 'held-1', choice: 'password', password: 'not it' }]);
  const texts = r.root().visibleTexts();
  assert.ok(texts.includes(WRONG), `the server's words — ${texts.join(' | ')}`);
  assert.ok(texts.includes('An account was made here with a password and never confirmed. (Server words.)'), 'the question stays');
  assert.equal(r.passwordField()?.value, '', 'the field stays, emptied');
  assert.ok(texts.includes(ADDRESS_HELD_WORDS.open) && texts.includes('Start my own account') && texts.includes(ADDRESS_HELD_WORDS.back));
  assert.equal(r.validates().length, 1, 'no sign-in again on a wrong password');
  noCodeWords(texts);
});

test('too many wrong tries (19 Nov): the server\'s wait; the question, its field as typed and every choice stay, to send again after it', async () => {
  const REFUSED = { success: false, error: 'too_many_tries', retry_after: 840, message: 'Too many tries. Try again in 14 minutes.', status_code: 429 };
  const r = heldRig(() => HELD_409('held-1'), () => ({ status: 429, data: REFUSED }));
  await magicSignin(r.deps, 'link-1');
  assert.ok(await r.root().click('Enter its password'));
  r.type('their real password');
  assert.ok(await r.root().click(ADDRESS_HELD_WORDS.open));
  await settle();
  const texts = r.root().visibleTexts();
  assert.ok(texts.includes(REFUSED.message), texts.join(' | '));
  assert.ok(!texts.includes(WRONG), 'nothing says the password was wrong: it was not checked');
  assert.equal(r.passwordField()?.value, 'their real password', 'what he typed stays');
  assert.ok(texts.includes(ADDRESS_HELD_WORDS.open) && texts.includes('Start my own account') && texts.includes(ADDRESS_HELD_WORDS.back), 'every way still there');
  assert.ok(await r.root().click(ADDRESS_HELD_WORDS.open));
  await settle();
  assert.equal(r.w.of('/auth/address-held').length, 2, 'sent again as it was');
  noCodeWords(texts);
});

test('too many: the question ends as an ended one does — the server\'s words and only the way back', async () => {
  const r = heldRig(() => HELD_409('held-1'), () => ({ status: 429, data: { success: false, error: 'too_many_attempts', message: 'Too many tries. Sign in again from the start.' } }));
  await magicSignin(r.deps, 'link-1');
  assert.ok(await r.root().click('Enter its password'));
  r.type('fifth wrong');
  assert.ok(await r.root().click(ADDRESS_HELD_WORDS.open));
  await settle();
  const texts = r.root().visibleTexts();
  assert.ok(texts.includes('Too many tries. Sign in again from the start.'), texts.join(' | '));
  assert.ok(!r.passwordField(), 'no field');
  assert.ok(!texts.includes(ADDRESS_HELD_WORDS.open) && !texts.includes('Enter its password'), 'the password way is closed');
  assert.ok(!texts.includes('Start my own account'), 'no "Start my own account": the server ended the question');
  assert.ok(texts.includes(ADDRESS_HELD_WORDS.back));
  assert.ok(await r.root().click(ADDRESS_HELD_WORDS.back));
  assert.equal(r.backs(), 1, 'back to the start');
  assert.equal(r.validates().length, 1, 'no sign-in again');
  assert.equal(r.w.of('/auth/address-held').length, 1, 'nothing more sent');
});

test("too many with no sentence from the server: the shared words, which send the person back to the start", () => {
  const out = heardAnswer({ status: 429, data: { success: false, error: 'too_many_attempts' }, error: 'too_many_attempts' });
  assert.deepEqual(out, { kind: 'too_many', message: ADDRESS_HELD_WORDS.tooMany });
  assert.doesNotMatch(ADDRESS_HELD_WORDS.tooMany, /own account/i, 'never offers a choice that is gone');
});

test('an ended question says so and leaves only the way back, which opens the sign-in window', async () => {
  const r = heldRig(() => HELD_409('held-1'), () => ({ status: 410, data: { success: false, error: 'expired', message: 'This took too long. Sign in again from the start.' } }));
  await magicSignin(r.deps, 'link-1');
  assert.ok(await r.root().click('Start my own account'));
  await settle();
  const texts = r.root().visibleTexts();
  assert.ok(texts.includes('This took too long. Sign in again from the start.'), texts.join(' | '));
  assert.ok(!texts.includes('Start my own account') && !texts.includes('Enter its password'), 'no choices left');
  assert.ok(await r.root().click(ADDRESS_HELD_WORDS.back));
  assert.equal(r.backs(), 1, 'back to the start');
  assert.deepEqual(r.root().children, [], 'the window closed');
  assert.equal(r.validates().length, 1, 'no sign-in again');
});

test('"Start my own account": its body, the window closes, and the same link is redeemed exactly once more (again_url\'s link)', async () => {
  const r = heldRig(
    (n) => (n === 0 ? HELD_409('held-1') : SIGNED_IN),
    () => ({ status: 200, data: { success: true, choice: 'start_own', again_url: 'https://myu.askmyu.com/api/auth/magic-link/validate?token=link-1' } }),
  );
  await magicSignin(r.deps, 'link-1');
  assert.ok(await r.root().click('Start my own account'));
  await settle(20);
  assert.deepEqual(r.w.of('/auth/address-held').map((c) => c.body), [{ held_token: 'held-1', choice: 'start_own' }], 'no password key');
  assert.deepEqual(r.root().children, [], 'the window closed');
  assert.deepEqual(r.validates().map((c) => c.path), ['/auth/magic-link/validate?token=link-1', '/auth/magic-link/validate?token=link-1']);
  assert.deepEqual(r.landed, ['ceremony'], 'signed in');
});

test('the right password: the sign-in goes again once, however often the answer is passed on', async () => {
  const r = heldRig((n) => (n === 0 ? HELD_409('held-1') : SIGNED_IN), () => ({ status: 200, data: { success: true, choice: 'password' } }));
  await magicSignin(r.deps, 'link-1');
  assert.ok(await r.root().click('Enter its password'));
  r.type('the right one');
  assert.ok(await r.root().click(ADDRESS_HELD_WORDS.open));
  await settle(20);
  await r.asked[0].answered();
  await r.asked[0].answered('https://x/validate?token=other');
  await settle(20);
  assert.equal(r.validates().length, 2, 'the link, then once more');
  assert.deepEqual(r.landed, ['ceremony']);
});

test('the redo answered with the question again: the question shows again, never a silent third try', async () => {
  let held = 0;
  const r = heldRig(() => HELD_409(`held-${++held}`), () => ({ status: 200, data: { success: true, choice: 'start_own' } }));
  await magicSignin(r.deps, 'link-1');
  assert.ok(await r.root().click('Start my own account'));
  await settle(20);
  assert.equal(r.validates().length, 2);
  assert.equal(r.asked.length, 2, 'asked again');
  assert.equal(r.asked[1].held.held_token, 'held-2', 'with the new question');
  await settle(20);
  assert.equal(r.validates().length, 2, 'and nothing more until it is answered');
  assert.deepEqual(r.landed, []);
});

test('again_url: its link when it names one, else the link just redeemed', () => {
  assert.equal(againToken('https://myu.askmyu.com/api/auth/magic-link/validate?token=abc123', 'orig'), 'abc123');
  assert.equal(againToken('http://localhost:8080/auth/magic-link/validate?x=1&token=a%2Bb', 'orig'), 'a+b');
  assert.equal(againToken(undefined, 'orig'), 'orig');
  assert.equal(againToken('https://myu.askmyu.com/somewhere', 'orig'), 'orig');
  assert.equal(againToken('https://x/?token=%E0%A4%A', 'orig'), 'orig', 'a broken link falls back');
});

test("an answer that never reached the server (offline, the plugin's own pause) did not go through", () => {
  assert.equal(heardAnswer(null).kind, 'failed');
  assert.equal(heardAnswer({ status: 0, data: null, error: 'offline' }).kind, 'failed');
  assert.equal(heardAnswer({ status: 429, data: { retry_after: 60 }, error: 'paused' }).kind, 'failed', 'not "too many"');
  assert.equal(heardAnswer({ status: 429, data: { error: 'too_many_attempts' }, error: 'too_many_attempts' }).kind, 'too_many');
});

test("the question's 429 is an answer: the door is not rested, so the next answer goes at once; other doors still rest", async () => {
  const transport = new Transport({ baseUrl: 'http://localhost/api', authToken: null, budget: new RequestBudget() });
  answerRequestsWith(async () => ({ status: 429, json: { success: false, error: 'too_many_attempts', message: 'Too many tries.' }, headers: {} }));
  try {
    const held = await transport.post('/auth/address-held', { held_token: 'h', choice: 'password', password: 'x' }, { anonymous: true });
    assert.equal(held.status, 429);
    assert.equal(transport.budget.pausedMs('/auth/address-held'), 0, 'not rested');
    await transport.post('/account/emails/resend', { email: 'a@b.co' });
    assert.ok(transport.budget.pausedMs('/account/emails/resend') > 0, 'a rate limit elsewhere still rests that door');
  } finally {
    answerRequestsWith(null);
  }
});

// ── the mock answers the same shapes (dev mode walks this) ─────────────────

test('the mock: sign-up confirmation, the own address, mail again, and the held question end to end', async () => {
  const mock = new MockApi();
  const created = await mock.createAccount('ann@example.com', 'Ann', 'password1');
  assert.equal(created.data?.email_confirmation, 'sent');
  mock.signupConfirmation = null;
  assert.equal((await mock.createAccount('ann@example.com', 'Ann', 'password1')).data?.email_confirmed, undefined, 'an older server');
  assert.equal((await mock.getAccount()).data?.email_confirmed, false);
  assert.equal(((await mock.resendAccountEmail('you@example.com')).data as { email_confirmation?: string }).email_confirmation, 'sent');
  assert.deepEqual(mock.resends, ['you@example.com']);

  mock.heldAddress = { email: 'ann@example.com', password: 'correct horse' };
  const link = mock.mailMagicLink();
  const { machine } = machineOn(mock);
  const asked: Array<{ held: AddressHeld; answered: (u?: string) => Promise<void> }> = [];
  const landed: string[] = [];
  const deps: MagicSigninDeps = { redeem: (t) => machine.completeMagicLink(t, 'dev-1'), ask: (held, answered) => void asked.push({ held, answered }), landed: (o) => void landed.push(o) };
  await magicSignin(deps, link);
  assert.equal(asked.length, 1);
  for (let i = 1; i <= 4; i++) assert.equal((await mock.answerAddressHeld({ held_token: asked[0].held.held_token, choice: 'password', password: 'nope' })).status, 401);
  assert.equal((await mock.answerAddressHeld({ held_token: asked[0].held.held_token, choice: 'password', password: 'nope' })).status, 429, 'the fifth');
  assert.equal((await mock.answerAddressHeld({ held_token: asked[0].held.held_token, choice: 'start_own' })).status, 410, 'the token ended with the fifth, as the server does');

  // Back to the start: the same link (not used) asks again; this time the right password.
  await magicSignin(deps, link);
  assert.equal(asked.length, 2);
  const right = await mock.answerAddressHeld({ held_token: asked[1].held.held_token, choice: 'password', password: 'correct horse' });
  assert.equal(right.status, 200);
  await asked[1].answered(String(right.data?.again_url));
  assert.deepEqual(landed, ['ceremony']);
  assert.deepEqual(mock.magicRedeems, [link, link, link], 'asked, asked again, then through');
});
