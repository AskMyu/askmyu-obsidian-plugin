/**
 * Modal-wiring tests — the tier that 2026-08-22 proved automatable the hard
 * way: three ceremony bugs (a phantom paper-check on the manager path, a
 * finish button mislabeled after a file save, stale blocked-state copy) all
 * lived in wiring the unit tests couldn't see and the live suite doesn't
 * render. This entry runs the REAL modal classes against the functional UI
 * fake in ui-stub.ts: tests find buttons by their visible text and click.
 *
 * Regression law: every wiring bug a human finds in a modal gets a click-path
 * here that would have found it first.
 */

import { strict as assert } from 'node:assert';
import test from 'node:test';

import { FakeEl, notices, markdownRenders } from './ui-stub';
import { DeleteAccountModal } from '../src/views/DeleteAccountModal';
import { CanvasExportModal } from '../src/views/CanvasExportModal';
import { AddAccountEmailModal } from '../src/views/AddAccountEmailModal';
import { PersonEditModal } from '../src/views/PersonEditModal';
import { SetupRecoveryModal } from '../src/views/SetupRecoveryModal';

interface Calls {
  completeGenesis: string[];
  setupRecoveryPhrase: string[];
}

function makeModal(mode: 'harden' | 'genesis') {
  const calls: Calls = { completeGenesis: [], setupRecoveryPhrase: [] };
  let finished = 0;
  const plugin = {
    settings: { recovery_pending: true, account_id: 'acct', base_url: 'http://localhost/api' },
    saveSettings: async () => undefined,
    unlock: {
      completeGenesis: async (phrase: string) => {
        calls.completeGenesis.push(phrase);
        return 'unlocked' as const;
      },
      setupRecoveryPhrase: async (phrase: string) => {
        calls.setupRecoveryPhrase.push(phrase);
        return 'ok' as const;
      },
    },
    app: {},
  };
  const modal = new SetupRecoveryModal({} as never, plugin as never, () => finished++, mode);
  notices.length = 0;
  modal.open();
  const root = (modal as unknown as { contentEl: FakeEl }).contentEl;
  const phrase = (modal as unknown as { phrase: string }).phrase;
  return { modal, root, phrase, calls, finishedCount: () => finished };
}

// Clipboard for the copy path — node's navigator is getter-only, so
// defineProperty rather than assignment.
const clipboard = { text: '' };
// `window` for the clipboard self-wipe timer — node has none.
Object.defineProperty(globalThis, 'window', {
  value: { setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms).unref?.() ?? 0, clearTimeout },
  configurable: true,
});
Object.defineProperty(globalThis, 'navigator', {
  value: {
    clipboard: {
      writeText: async (t: string) => {
        clipboard.text = t;
      },
      readText: async () => clipboard.text,
    },
  },
  configurable: true,
});

test('ceremony — manager path: copy → door-aware finish → genesis, NO paper-check', async () => {
  const { root, phrase, calls, finishedCount } = makeModal('genesis');

  assert.ok(await root.click('Copy for your password manager'), 'copy button exists');
  assert.equal(clipboard.text, phrase, 'the twelve words landed on the clipboard');

  // The finish door must exist, speak to the MANAGER path, and not demand
  // the retype (the phantom paper-check bug).
  assert.ok(
    await root.click('It’s in my password manager — finish'),
    `manager finish button missing; visible: ${root.visibleTexts().join(' | ')}`,
  );
  assert.deepEqual(calls.completeGenesis, [phrase], 'genesis ran with the shown phrase');
  assert.equal(finishedCount(), 1, 'onFinished fired');
  assert.ok(!notices.some((n) => n.includes("don't match")), 'no phantom paper-check on the manager path');
});

test('ceremony — paper path: wrong words refused, right words finish', async () => {
  const { root, phrase, calls } = makeModal('genesis');
  assert.ok(await root.click('I wrote it down'));

  // Type wrong answers into the two word inputs.
  const inputs = [...root.walk()].filter((e) => e.tag === 'input');
  assert.equal(inputs.length, 2, 'two word checks');
  (inputs[0] as unknown as { typed: string }).typed = 'wrong';
  (inputs[1] as unknown as { typed: string }).typed = 'wrong';
  assert.ok(await root.click('Finish'));
  assert.ok(notices.some((n) => n.includes("don't match")), 'wrong words are refused');
  assert.equal(calls.completeGenesis.length, 0, 'no genesis on refused words');

  // Now the right ones.
  const modal = root; // re-find inputs after re-render? finish() does not re-render on failure.
  const words = phrase.split(' ');
  const idx = (root.visibleTexts().filter((t) => /^Word \d+$/.test(t)) ?? []).map((t) => Number(t.slice(5)) - 1);
  (inputs[0] as unknown as { typed: string }).typed = words[idx[0]];
  (inputs[1] as unknown as { typed: string }).typed = words[idx[1]];
  assert.ok(await modal.click('Finish'));
  assert.deepEqual(calls.completeGenesis, [phrase], 'genesis ran once the paper was proven');
});

test('ceremony — harden mode routes to setupRecoveryPhrase, not genesis', async () => {
  const { root, phrase, calls } = makeModal('harden');
  await root.click('Copy for your password manager');
  await root.click('It’s in my password manager — finish');
  assert.deepEqual(calls.setupRecoveryPhrase, [phrase]);
  assert.equal(calls.completeGenesis.length, 0);
});

test('ceremony — before securing, the only doors are write-down and not-now', async () => {
  const { root } = makeModal('genesis');
  const texts = root.visibleTexts();
  assert.ok(!texts.includes('It’s in my password manager — finish'), 'no finish before securing');
  assert.ok(!texts.includes('The file is safe — finish'), 'no file-finish before securing');
  assert.ok(texts.includes('I wrote it down'));
  assert.ok(texts.includes('Not now'));
  // Platform.isDesktopApp is false in this stub — the file button must hide,
  // exactly as it must on mobile Obsidian.
  assert.ok(!texts.includes('save to a file ▸'), 'file save hidden off-desktop');
});

// ── offline durability: the watcher's queue survives failure and drains ──────
// The vault keeps working when the laptop is offline; interactions must queue
// durably and land — not vanish — when the backend is back.

test('watcher queue: a failed send re-queues durably; the drain applies results', async () => {
  const { MyuFolderWatcher } = await import('../src/capture/MyuFolderWatcher');
  const { DEFAULT_SETTINGS } = await import('../src/settings');

  const settings = {
    ...DEFAULT_SETTINGS,
    materialize_consented: true,
    materialize_enabled: true,
    vault_event_queue: [
      { myu_id: 'cmt-queued-1', kind: 'tick' as const, source_timestamp: 1755900000000 },
      { myu_id: 'cmt-queued-2', kind: 'untick' as const, source_timestamp: 1755900001000 },
    ],
    myu_checkbox_state: { 'cmt-queued-2': true },
  };
  let backendUp = false;
  let saves = 0;
  let restoredCalls = 0;
  const api = {
    vaultInteraction: async (events: Array<{ myu_id: string; kind: string }>) => {
      if (!backendUp) return { ok: false, status: 0, error: 'network_error', data: null };
      return {
        ok: true, status: 200, error: null,
        data: { results: events.map((e) => ({
          myu_id: e.myu_id, kind: e.kind,
          outcome: e.kind === 'tick' ? 'resolved' : 'restored',
        })) },
      };
    },
  };
  const watcher = new MyuFolderWatcher({
    app: {} as never,
    api: () => api as never,
    settings: () => settings,
    save: async () => { saves += 1; },
    canSend: () => true,
    onRestored: async () => { restoredCalls += 1; },
    rebaseline: async () => undefined,
  });

  // Backend down: the drain attempt must put every event BACK — zero loss.
  await watcher.flushQueue();
  assert.equal(settings.vault_event_queue.length, 2, 'failed send re-queues everything');
  assert.ok(saves >= 2, 'the re-queue is persisted, not memory-only');

  // Backend back: one drain empties the queue and applies server outcomes.
  backendUp = true;
  await watcher.flushQueue();
  assert.equal(settings.vault_event_queue.length, 0, 'reconnect drains the queue');
  assert.equal(settings.myu_checkbox_state['cmt-queued-1'], true, 'resolved tick baselines as checked');
  assert.equal(settings.myu_checkbox_state['cmt-queued-2'], true, "a 'restored' untick baselines back to checked");
  assert.equal(restoredCalls, 1, 'a restored outcome triggers prompt surface regeneration');

  // Nothing left: a further drain is a no-op (and must not call the API).
  backendUp = false;
  await watcher.flushQueue();
  assert.equal(settings.vault_event_queue.length, 0);
});

test('ceremony — the clipboard self-wipes at 90s, but never clobbers a later copy', async () => {
  // The 90-second wipe is a stated security behavior enforced by nothing but
  // the code that does it. Capture the scheduled timer instead of waiting.
  const win = (globalThis as unknown as { window: { setTimeout: unknown } }).window;
  const original = win.setTimeout;
  const scheduled: Array<{ fn: () => void; ms: number }> = [];
  win.setTimeout = ((fn: () => void, ms: number) => {
    scheduled.push({ fn, ms });
    return 0;
  }) as never;
  try {
    // Wipe arm: the phrase is still on the clipboard when the timer fires.
    {
      const { root, phrase } = makeModal('genesis');
      assert.ok(await root.click('Copy for your password manager'));
      assert.equal(clipboard.text, phrase);
      const wipe = scheduled.pop();
      assert.ok(wipe, 'a wipe timer was scheduled by the copy');
      assert.equal(wipe!.ms, 90_000, 'the wipe fires at 90 seconds — the paste window, not clipboard history');
      wipe!.fn();
      await new Promise((r) => setTimeout(r, 0));
      assert.equal(clipboard.text, '', 'the phrase does not outlive its paste window');
    }
    // Respect arm: the user copied something else meanwhile — leave it alone.
    {
      const { root } = makeModal('genesis');
      assert.ok(await root.click('Copy for your password manager'));
      const wipe = scheduled.pop();
      assert.ok(wipe);
      clipboard.text = 'a grocery list';
      wipe!.fn();
      await new Promise((r) => setTimeout(r, 0));
      assert.equal(clipboard.text, 'a grocery list', 'the wipe never clobbers unrelated clipboard content');
    }
  } finally {
    win.setTimeout = original as never;
  }
});

// ── file save = finished: saving the phrase must complete genesis in one act ──
// A real user was stranded in genesis_pending TWICE (2026-08-22, 2026-08-24)
// by saving the file and reasonably closing the modal — the extra "the file
// is safe — finish" click is exactly the kind of attestation people skip.

test('ceremony — saving to a file completes genesis; no second click, and the vault still refuses', async () => {
  const { Platform, FileSystemAdapter } = await import('./ui-stub');
  const wasDesktop = Platform.isDesktopApp;
  (Platform as { isDesktopApp: boolean }).isDesktopApp = true;
  const writes: Array<{ path: string; content: string }> = [];
  let savePath = '/home/user/safe-place/askmyu-recovery-phrase.txt';
  const win = globalThis.window as unknown as Record<string, unknown>;
  const hadRequire = 'require' in win;
  win.require = (m: string) =>
    m === 'electron'
      ? { remote: { dialog: { showSaveDialog: async () => ({ canceled: false, filePath: savePath }) } } }
      : { writeFileSync: (path: string, content: string) => writes.push({ path, content }) };
  try {
    const adapter = new FileSystemAdapter() as FileSystemAdapter & { getBasePath: () => string };
    adapter.getBasePath = () => '/home/user/vault';
    const app = { vault: { adapter } };

    // In-vault destination: refused, nothing written, NO genesis.
    {
      const calls: string[] = [];
      const plugin = {
        settings: { recovery_pending: true },
        saveSettings: async () => undefined,
        unlock: { completeGenesis: async (p: string) => (calls.push(p), 'unlocked' as const), setupRecoveryPhrase: async () => 'ok' as const },
      };
      const modal = new SetupRecoveryModal(app as never, plugin as never, () => undefined, 'genesis');
      notices.length = 0;
      modal.open();
      const root = (modal as unknown as { contentEl: FakeEl }).contentEl;
      savePath = '/home/user/vault/Myu/phrase.txt';
      assert.ok(await root.click('Save to a file'), 'save button exists on desktop');
      await new Promise((r) => setTimeout(r, 0)); // the handler is void-wrapped async — let it drain
      assert.ok(notices.some((n) => n.includes('must never sync')), 'in-vault destination refused');
      assert.equal(writes.length, 0, 'nothing written into the vault');
      assert.equal(calls.length, 0, 'no genesis on a refused save');
    }

    // Good destination: the save alone finishes — genesis runs, modal closes.
    {
      const calls: string[] = [];
      let finished = 0;
      const plugin = {
        settings: { recovery_pending: true },
        saveSettings: async () => undefined,
        unlock: { completeGenesis: async (p: string) => (calls.push(p), 'unlocked' as const), setupRecoveryPhrase: async () => 'ok' as const },
      };
      const modal = new SetupRecoveryModal(app as never, plugin as never, () => finished++, 'genesis');
      notices.length = 0;
      modal.open();
      const root = (modal as unknown as { contentEl: FakeEl }).contentEl;
      const phrase = (modal as unknown as { phrase: string }).phrase;
      savePath = '/home/user/safe-place/askmyu-recovery-phrase.txt';
      assert.ok(await root.click('Save to a file'));
      await new Promise((r) => setTimeout(r, 0)); // drain the void-wrapped save → finish chain
      assert.equal(writes.length, 1, 'the phrase file was written');
      assert.ok(writes[0].content.includes(phrase), 'the file holds the twelve words');
      assert.deepEqual(calls, [phrase], 'genesis ran from the save itself — saved IS done');
      assert.equal(finished, 1, 'the ceremony closed without any further click');
    }
  } finally {
    (Platform as { isDesktopApp: boolean }).isDesktopApp = wasDesktop;
    if (hadRequire) delete win.require; else delete win.require;
  }
});

// ── the completion contract, every door × every mode ─────────────────────────
// The file door stranded a real user because one path's ending was never
// pinned. This matrix pins ALL of them to the same contract: securing the
// phrase through ANY door ends with exactly ONE call to the right unlock
// method (zero to the other), onFinished fired, and recovery_pending cleared
// — no path may leave someone who secured their phrase still "pending".

type Door = 'manager' | 'paper' | 'file';
type Mode = 'genesis' | 'harden';

async function driveDoor(mode: Mode, door: Door, unlockResults?: Array<'ok' | 'unlocked' | 'error'>) {
  const { Platform, FileSystemAdapter } = await import('./ui-stub');
  const wasDesktop = Platform.isDesktopApp;
  const win = globalThis.window as unknown as Record<string, unknown>;
  const results = unlockResults ?? [mode === 'genesis' ? 'unlocked' : 'ok'];
  let call = 0;
  const calls: Calls = { completeGenesis: [], setupRecoveryPhrase: [] };
  let finished = 0;
  const settings = { recovery_pending: true };
  const plugin = {
    settings,
    saveSettings: async () => undefined,
    unlock: {
      completeGenesis: async (p: string) => (calls.completeGenesis.push(p), results[Math.min(call++, results.length - 1)]),
      setupRecoveryPhrase: async (p: string) => (calls.setupRecoveryPhrase.push(p), results[Math.min(call++, results.length - 1)]),
    },
  };
  if (door === 'file') {
    (Platform as { isDesktopApp: boolean }).isDesktopApp = true;
    win.require = (m: string) =>
      m === 'electron'
        ? { remote: { dialog: { showSaveDialog: async () => ({ canceled: false, filePath: '/home/user/elsewhere/phrase.txt' }) } } }
        : { writeFileSync: () => undefined };
  }
  const adapter = new FileSystemAdapter() as InstanceType<typeof FileSystemAdapter> & { getBasePath: () => string };
  adapter.getBasePath = () => '/home/user/vault';
  const modal = new SetupRecoveryModal({ vault: { adapter } } as never, plugin as never, () => finished++, mode);
  notices.length = 0;
  modal.open();
  const root = (modal as unknown as { contentEl: FakeEl }).contentEl;
  const phrase = (modal as unknown as { phrase: string }).phrase;

  const drive = async () => {
    if (door === 'manager') {
      assert.ok(await root.click('Copy for your password manager'), `[${mode}/${door}] copy exists`);
      assert.ok(await root.click('It’s in my password manager — finish'), `[${mode}/${door}] finish exists`);
    } else if (door === 'paper') {
      assert.ok(await root.click('I wrote it down'), `[${mode}/${door}] write-down exists`);
      const inputs = [...root.walk()].filter((e) => e.tag === 'input');
      const words = phrase.split(' ');
      const idx = root.visibleTexts().filter((t) => /^Word \d+$/.test(t)).map((t) => Number(t.slice(5)) - 1);
      (inputs[0] as unknown as { typed: string }).typed = words[idx[0]];
      (inputs[1] as unknown as { typed: string }).typed = words[idx[1]];
      assert.ok(await root.click('Finish'), `[${mode}/${door}] finish exists`);
    } else {
      assert.ok(await root.click('Save to a file'), `[${mode}/${door}] save exists`);
    }
    await new Promise((r) => setTimeout(r, 0));
  };
  const cleanup = () => {
    (Platform as { isDesktopApp: boolean }).isDesktopApp = wasDesktop;
    delete win.require;
  };
  return { drive, cleanup, calls, settings, phrase, root, finishedCount: () => finished };
}

test('ceremony matrix — every door, both modes: one call, finished, pending cleared', async () => {
  for (const mode of ['genesis', 'harden'] as Mode[]) {
    for (const door of ['manager', 'paper', 'file'] as Door[]) {
      const t = await driveDoor(mode, door);
      try {
        await t.drive();
        const right = mode === 'genesis' ? t.calls.completeGenesis : t.calls.setupRecoveryPhrase;
        const wrong = mode === 'genesis' ? t.calls.setupRecoveryPhrase : t.calls.completeGenesis;
        assert.deepEqual(right, [t.phrase], `[${mode}/${door}] exactly one call to the right unlock method`);
        assert.equal(wrong.length, 0, `[${mode}/${door}] zero calls to the other mode's method`);
        assert.equal(t.finishedCount(), 1, `[${mode}/${door}] onFinished fired — the ceremony ENDED`);
        assert.equal(t.settings.recovery_pending, false, `[${mode}/${door}] recovery_pending cleared`);
      } finally {
        t.cleanup();
      }
    }
  }
});

test('ceremony — a failed finish strands nobody: the retry completes, every door', async () => {
  for (const door of ['manager', 'file'] as Door[]) {
    const t = await driveDoor('genesis', door, ['error', 'unlocked']);
    try {
      await t.drive();
      assert.equal(t.finishedCount(), 0, `[${door}] first attempt failed — not finished`);
      assert.ok(notices.some((n) => n.includes("Couldn't save the recovery key")), `[${door}] the failure is TOLD, not silent`);
      // The modal must still offer a working finish — no dead ends.
      const retried =
        (await t.root.click('Finish')) ||
        (await t.root.click('It’s in my password manager — finish')) ||
        (await t.root.click('The file is safe — finish'));
      assert.ok(retried, `[${door}] a retry affordance exists after failure (visible: ${t.root.visibleTexts().join(' | ')})`);
      await new Promise((r) => setTimeout(r, 0));
      assert.equal(t.finishedCount(), 1, `[${door}] the retry completed the ceremony`);
      assert.equal(t.calls.completeGenesis.length, 2, `[${door}] genesis attempted twice, succeeded once`);
    } finally {
      t.cleanup();
    }
  }
});

// ── P10 onboarding: the webapp's arc/moment conversation, server-truth gated ──

function makeOnboardingHarness(opts?: {
  scripts?: Record<string, unknown>;
  hasCurrentRole?: boolean;
  confidence?: number;
}) {
  const calls: Record<string, unknown[]> = {
    updateAccountState: [], classifyCareerMoment: [], addOnboardingMoment: [],
    linkedinSeek: [], saveLinkedinId: [], queryCurrentEmployment: [], confirmCurrentEmployment: [],
  };
  const plugin = {
    settings: { account_id: 'acct-1' },
    onboardingScripts: opts?.scripts ?? {},
    refreshOnboardingState: async () => undefined,
    openChat: async (...a: unknown[]) => {
      (calls.openChat ??= []).push(a);
    },
    backend: {
      linkedinSeek: async (...a: unknown[]) => (calls.linkedinSeek.push(a), { ok: true, status: 200, error: null, data: { body: { content: 'A decade of building.' } } }),
      saveLinkedinId: async (...a: unknown[]) => (calls.saveLinkedinId.push(a), { ok: true, status: 200, error: null, data: {} }),
      queryCurrentEmployment: async (...a: unknown[]) => (calls.queryCurrentEmployment.push(a), { ok: true, status: 200, error: null, data: {} }),
      confirmCurrentEmployment: async (...a: unknown[]) => (
        calls.confirmCurrentEmployment.push(a),
        { ok: true, status: 200, error: null, data: opts?.hasCurrentRole ? { companies: [{ company: 'Co' }], role: 'Founder' } : {} }
      ),
      updateAccountState: async (...a: unknown[]) => (calls.updateAccountState.push(a), { ok: true, status: 200, error: null, data: {} }),
      classifyCareerMoment: async (...a: unknown[]) => (
        calls.classifyCareerMoment.push(a),
        { ok: true, status: 200, error: null, data: { confidence: opts?.confidence ?? 0.9, moment_captured: (opts?.confidence ?? 0.9) >= 0.5 } }
      ),
      addOnboardingMoment: async (...a: unknown[]) => (
        calls.addOnboardingMoment.push(a),
        { ok: true, status: 200, error: null, data: { blocks: [{ type: 'conversational', text: 'Placed.' }] } }
      ),
    },
  };
  return { plugin, calls };
}

test('onboarding — the full LinkedIn arc: current role found → complete, flags written, moment still asked', async () => {
  const { OnboardingModal } = await import('../src/views/OnboardingModal');
  const { plugin, calls } = makeOnboardingHarness({ hasCurrentRole: true });
  let finished = 0;
  const modal = new OnboardingModal({} as never, plugin as never, () => finished++);
  modal.open();
  const root = (modal as unknown as { contentEl: FakeEl }).contentEl;

  const inputs = [...root.walk()].filter((e) => e.tag === 'input');
  (inputs[0] as unknown as { typed: string }).typed = 'https://linkedin.com/in/masumi-dev';
  assert.ok(await root.click('Share'), 'linkedin share button exists');
  await new Promise((r) => setTimeout(r, 0));

  assert.equal(calls.linkedinSeek.length, 1);
  assert.deepEqual(calls.saveLinkedinId[0], ['acct-1', 'masumi-dev'], 'public identifier extracted and persisted');
  assert.deepEqual(calls.queryCurrentEmployment[0], ['acct-1', 'linkedin']);
  const completion = calls.updateAccountState[0] as [string, { onboardingComplete?: boolean; myuScripts?: Record<string, unknown> }];
  assert.equal(completion[1].onboardingComplete, true, 'a current role carries onboarding');
  assert.deepEqual(completion[1].myuScripts, { onboard_arc_provided: true, onboard_arc_source: 'linkedin' });

  // The moment is still asked (it seeds the first journal entry).
  const momentInputs = [...root.walk()].filter((e) => e.tag === 'input');
  (momentInputs[momentInputs.length - 1] as unknown as { typed: string }).typed = 'Running my own company, heads down on the beta.';
  assert.ok(await root.click('Tell Myu'));
  await new Promise((r) => setTimeout(r, 0));
  // The web's transition: no in-modal reply, no Done click — the moment goes
  // to the CHAT as the first (template-routed) entry and the modal is gone.
  const seed = (calls.openChat?.[0] as [Record<string, unknown>])?.[0];
  assert.ok(seed, 'the chat opened');
  assert.equal(seed.send, true, 'the moment is SENT, not just pre-filled');
  assert.equal(seed.templateType, 'onboarding_moment', 'template-routed like the web');
  assert.ok(String(seed.text).includes('Running my own company'), 'the chat carries their words');
  assert.equal(finished, 1, 'onFinished fired without any further click');
});

test('onboarding — a dismissed conversation comes back: the transcript survives reopen, once', async () => {
  // The web's onboardingSession pattern: an outside click kills an Obsidian
  // modal, so reopening from the Today row must restore the conversation —
  // no second greeting, the arc read still on screen.
  const { OnboardingModal } = await import('../src/views/OnboardingModal');
  const { plugin } = makeOnboardingHarness({ hasCurrentRole: true });
  const first = new OnboardingModal({} as never, plugin as never, () => undefined);
  first.open();
  const firstRoot = (first as unknown as { contentEl: FakeEl }).contentEl;
  const inputs = [...firstRoot.walk()].filter((e) => e.tag === 'input');
  (inputs[0] as unknown as { typed: string }).typed = 'https://linkedin.com/in/masumi-dev';
  assert.ok(await firstRoot.click('Share'));
  await new Promise((r) => setTimeout(r, 0));
  first.close(); // the glance at the canvas behind

  const second = new OnboardingModal({} as never, plugin as never, () => undefined);
  second.open();
  const text = [...(second as unknown as { contentEl: FakeEl }).contentEl.walk()].map((e) => e.text ?? '').join('\n');
  assert.ok(text.includes('masumi-dev'), 'their own line is still in the log');
  assert.equal(text.split("Hey — I'm Myu").length - 1, 1, 'the greeting is not said twice');

  // Finishing the moment clears the session for the next account/test.
  const momentInputs = [...(second as unknown as { contentEl: FakeEl }).contentEl.walk()].filter((e) => e.tag === 'input');
  (momentInputs[momentInputs.length - 1] as unknown as { typed: string }).typed = 'Running my own company, heads down on the beta.';
  assert.ok(await (second as unknown as { contentEl: FakeEl }).contentEl.click('Tell Myu'));
  await new Promise((r) => setTimeout(r, 0));
  const third = new OnboardingModal({} as never, plugin as never, () => undefined);
  third.open();
  const thirdText = [...(third as unknown as { contentEl: FakeEl }).contentEl.walk()].map((e) => e.text ?? '').join('\n');
  assert.ok(!thirdText.includes('masumi-dev'), 'the finished conversation is not replayed');
});

test('onboarding — skip + thin moment stays INCOMPLETE; second-attempt borderline is the smart escape', async () => {
  const { OnboardingModal } = await import('../src/views/OnboardingModal');

  // First attempt: skipped arc, thin answer (confidence 0.1) → NOT complete.
  {
    const { plugin, calls } = makeOnboardingHarness({ confidence: 0.1 });
    const modal = new OnboardingModal({} as never, plugin as never, () => undefined);
    modal.open();
    const root = (modal as unknown as { contentEl: FakeEl }).contentEl;
    assert.ok(await root.click('Skip for now'));
    const inputs = [...root.walk()].filter((e) => e.tag === 'input');
    (inputs[inputs.length - 1] as unknown as { typed: string }).typed = 'stuff';
    assert.ok(await root.click('Tell Myu'));
    await new Promise((r) => setTimeout(r, 0));
    const completions = (calls.updateAccountState as Array<[string, { onboardingComplete?: boolean }]>).filter((c) => c[1].onboardingComplete);
    assert.equal(completions.length, 0, 'two thin signals never fake a completed onboarding');
    assert.equal(calls.openChat?.length, 1, 'the transition to chat happens regardless of the completion gate');
  }

  // Second attempt (server says attempt_count 1), borderline 0.3 → complete.
  {
    const { plugin, calls } = makeOnboardingHarness({
      confidence: 0.3,
      scripts: { onboard_moment_attempt_count: 1, onboard_arc_skip_count: 1 },
    });
    const modal = new OnboardingModal({} as never, plugin as never, () => undefined);
    modal.open();
    const root = (modal as unknown as { contentEl: FakeEl }).contentEl;
    assert.ok(await root.click('Skip for now'));
    const inputs = [...root.walk()].filter((e) => e.tag === 'input');
    (inputs[inputs.length - 1] as unknown as { typed: string }).typed = 'consulting while I figure out the next thing';
    assert.ok(await root.click('Tell Myu'));
    await new Promise((r) => setTimeout(r, 0));
    const completions = (calls.updateAccountState as Array<[string, { onboardingComplete?: boolean }]>).filter((c) => c[1].onboardingComplete);
    assert.equal(completions.length, 1, 'second-attempt borderline signal completes (the web’s smart escape, verbatim)');
  }
});

test('onboarding — arc already on file: opens straight at the moment', async () => {
  const { OnboardingModal } = await import('../src/views/OnboardingModal');
  const { plugin, calls } = makeOnboardingHarness({ scripts: { onboard_arc_provided: true }, confidence: 0.9 });
  const modal = new OnboardingModal({} as never, plugin as never, () => undefined);
  modal.open();
  const root = (modal as unknown as { contentEl: FakeEl }).contentEl;
  assert.ok(!(await root.click('Share')), 'no arc beat — the server already has it');
  const inputs = [...root.walk()].filter((e) => e.tag === 'input');
  (inputs[inputs.length - 1] as unknown as { typed: string }).typed = 'Just moved into a VP role, drinking from the firehose.';
  assert.ok(await root.click('Tell Myu'));
  await new Promise((r) => setTimeout(r, 0));
  const completion = (calls.updateAccountState as Array<[string, { onboardingComplete?: boolean }]>).find((c) => c[1].onboardingComplete);
  assert.ok(completion, 'sufficient moment completes');
});

test('onboarding — resume path: the SERVER\'s summary lands in the transcript, resume id persisted', async () => {
  const { OnboardingModal } = await import('../src/views/OnboardingModal');
  const { Platform } = await import('./ui-stub');
  const wasDesktop = Platform.isDesktopApp;
  (Platform as { isDesktopApp: boolean }).isDesktopApp = true;
  const win = globalThis.window as unknown as Record<string, unknown>;
  win.require = (m: string) =>
    m === 'electron'
      ? { remote: { dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: ['/home/user/cv/resume.pdf'] }) } } }
      : { readFileSync: () => new Uint8Array([1, 2, 3]) };
  try {
    const { plugin, calls } = makeOnboardingHarness({ hasCurrentRole: true });
    const backend = plugin.backend as Record<string, unknown>;
    backend.resumeUpload = async (...a: unknown[]) => (
      (calls.resumeUpload ??= []).push(a),
      { ok: true, status: 200, error: null, data: { resume_id: 'res-9', summary: 'Twelve years shipping, the last three leading.' } }
    );
    backend.saveResumeId = async (...a: unknown[]) => ((calls.saveResumeId ??= []).push(a), { ok: true, status: 200, error: null, data: {} });

    const modal = new OnboardingModal({} as never, plugin as never, () => undefined);
    modal.open();
    const root = (modal as unknown as { contentEl: FakeEl }).contentEl;
    assert.ok(await root.click('Upload a resume'), 'resume button exists on desktop');
    await new Promise((r) => setTimeout(r, 0));

    assert.deepEqual(calls.saveResumeId?.[0], ['acct-1', 'res-9'], 'the uploaded resume id is persisted on the account');
    assert.deepEqual(calls.queryCurrentEmployment[0], ['acct-1', 'resume']);
    const transcript = (modal as unknown as { transcript: Array<{ role: string; text: string }> }).transcript;
    assert.ok(
      transcript.some((l) => l.role === 'myu' && l.text.includes('Twelve years shipping')),
      `the server's summary is SHOWN, not a placeholder (got: ${transcript.map((l) => l.text).join(' | ')})`,
    );
  } finally {
    (Platform as { isDesktopApp: boolean }).isDesktopApp = wasDesktop;
    delete win.require;
  }
});

// ── aliases: the link that never resolved, and the hijack that must not happen

test('safeFirstNameAlias — gives [[Marcus]] a home, and refuses to steal one', async () => {
  const { safeFirstNameAlias } = await import('../src/vault/myuFiles');
  const free = () => false;

  // The whole point of P8.1's aliases: field.
  assert.deepEqual(
    safeFirstNameAlias('Marcus Webb', ['Marcus Webb', 'Priya Raman'], free),
    ['Marcus'],
    'a distinct first name becomes an alias',
  );

  // Ambiguity WE created: two Marcuses means neither may claim the short name.
  assert.deepEqual(
    safeFirstNameAlias('Marcus Webb', ['Marcus Webb', 'Marcus Chen'], free),
    [],
    'a first name shared by another generated person is refused',
  );

  // The hijack case. The user already has People/Marcus.md; taking [[Marcus]]
  // would silently redirect their own link into our folder.
  assert.deepEqual(
    safeFirstNameAlias('Marcus Webb', ['Marcus Webb'], (n) => n === 'Marcus'),
    [],
    'a name the vault already answers to is never claimed',
  );

  // Mononyms and initials have no distinct first name to offer.
  assert.deepEqual(safeFirstNameAlias('Cher', ['Cher'], free), [], 'single-word names get no alias');
  assert.deepEqual(safeFirstNameAlias('J Smith', ['J Smith'], free), [], 'a one-letter first name is not an alias');
});

test('person frontmatter — facts land as Bases columns, aliases as a YAML list', async () => {
  const { buildPersonMarkdown } = await import('../src/vault/myuFiles');
  const md = buildPersonMarkdown(
    { entity_type: 'person', entity_id: 'rel-1', display_name: 'Marcus Webb', item_count: 0, top_urgency: 'info', organization: 'Acme', subtitle: 'CTO' },
    { header: { display_name: 'Marcus Webb', email_primary: 'marcus@acme.com', linkedin_url: 'https://linkedin.com/in/marcusw' }, sections: [] },
    [],
    () => false,
    null,
    [],
    ['Marcus'],
  );
  assert.match(md, /^aliases: \["Marcus"\]$/m, 'aliases is a YAML flow list Obsidian can read');
  assert.match(md, /^email: marcus@acme\.com$/m, 'email is a column, not buried in prose');
  assert.match(md, /linkedin: /, 'linkedin url is present');
  // The rule that keeps frontmatter honest: facts yes, verdicts no.
  assert.ok(!/health_tier|trend_direction/.test(md), 'no verdict fields reach frontmatter');
});

// ── P-CANVAS-1: the composition, read as markdown

test('buildCompositionMarkdown — structure chosen, wording untouched, nothing deferred to the web', async () => {
  const { buildCompositionMarkdown } = await import('../src/vault/myuFiles');
  const md = buildCompositionMarkdown(
    {
      id: 'comp-1',
      summary_text: 'Where the Acme deal stands.',
      components: [
        { id: 'g1', type: 'container', label: 'The room', data: { child_ids: ['p1'] } },
        { id: 'p1', type: 'person_card', data: { name: 'Marcus Webb', summary: 'has gone quiet since the reorg' } },
        { id: 't1', type: 'text_block', label: 'What I notice', data: { text: 'Two weeks without a reply.' } },
        { id: 'd1', type: 'diagram', label: 'Flow', data: { mermaid: 'graph TD; A-->B;' } },
        { id: 'c1', type: 'chart', label: 'Momentum', data: {} },
      ],
    },
    (name) => (name === 'Marcus Webb' ? 'Marcus Webb' : null),
  );

  assert.match(md, /Where the Acme deal stands\./, 'summary renders verbatim');
  assert.match(md, /^## The room$/m, 'a container becomes a heading');
  assert.match(md, /\[\[Marcus Webb\]\]/, "a person becomes a link into the user's own page");
  assert.match(md, /Two weeks without a reply\./, 'text-shaped components render verbatim');
  assert.match(md, /```mermaid\ngraph TD; A-->B;\n```/, 'a diagram becomes a mermaid block Obsidian renders natively');

  // NOTHING defers to the browser. This used to emit a "needs the web view"
  // callout — a browser exit printed into the user's vault, against the
  // modality's own north-star metric. A chart with no data still marks its
  // place with its heading; it never sends the reader out of Obsidian.
  assert.ok(!/web view|open live|on the web/i.test(md), 'no component defers to the browser');
  assert.match(md, /^#+ Momentum$/m, 'an empty chart still marks its place');

  // Render-verbatim: no hedging, no confidence language invented client-side.
  assert.ok(!/likely|probably|might be/i.test(md), 'the builder adds no wording of its own');
});

test('buildCompositionMarkdown — an empty spec degrades quietly, not into junk', async () => {
  const { buildCompositionMarkdown } = await import('../src/vault/myuFiles');
  const md = buildCompositionMarkdown({ id: 'c', components: [] });
  assert.equal(md.trim(), '', 'nothing in, nothing out — no empty headings');
});

// ── P-CANVAS-2: content is ours, layout and their work are theirs

test('mergeCanvas — their geometry survives, our wording updates', async () => {
  const { mergeCanvas } = await import('../src/vault/CanvasExporter');
  const existing = JSON.stringify({
    nodes: [{ id: 'n1', type: 'text', text: 'the old reading', x: 900, y: 640, width: 300, height: 120 }],
    edges: [{ id: 'e1', fromNode: 'n1', toNode: 'n2' }],
  });
  const fresh = { nodes: [{ id: 'n1', type: 'text', text: 'the new reading', x: 0, y: 0, width: 400, height: 200 }], edges: [] as never[] };

  const merged = mergeCanvas(existing, fresh as never);
  const node = merged.nodes.find((n) => n.id === 'n1')!;

  assert.equal(node.text, 'the new reading', 'content comes from the server');
  assert.equal(node.x, 900, 'the position they dragged it to survives');
  assert.equal(node.y, 640);
  assert.equal(node.width, 300, 'the size they chose survives');
  assert.equal(merged.edges.length, 1, 'hand-drawn edges are never dropped — we generate none');
});

test('mergeCanvas — a node the composition no longer has is KEPT, not deleted', async () => {
  const { mergeCanvas } = await import('../src/vault/CanvasExporter');
  const existing = JSON.stringify({
    nodes: [
      { id: 'n1', type: 'text', text: 'ours', x: 0, y: 0, width: 10, height: 10 },
      { id: 'their-sticky', type: 'text', text: 'my own note to self', x: 50, y: 50, width: 10, height: 10 },
    ],
    edges: [],
  });
  const merged = mergeCanvas(existing, { nodes: [{ id: 'n1', type: 'text', text: 'ours v2', x: 0, y: 0, width: 10, height: 10 }], edges: [] } as never);

  // We cannot prove authorship from the file, so we never guess: deleting the
  // user's work is unrecoverable, a stale node is one keystroke.
  assert.ok(merged.nodes.some((n) => n.id === 'their-sticky'), "the user's own node survives a refresh");
  assert.equal(merged.nodes.length, 2);
});

test('mergeCanvas — unparseable JSON is not merged into nonsense', async () => {
  const { mergeCanvas } = await import('../src/vault/CanvasExporter');
  const merged = mergeCanvas('{ this is not json', { nodes: [{ id: 'n1', type: 'text', text: 'x', x: 0, y: 0, width: 1, height: 1 }], edges: [] } as never);
  assert.equal(merged.nodes.length, 1, 'falls back to the fresh canvas rather than throwing');
});

// ── P-CANVAS-2: the node differ. The case I could not prove without a vault
// was "our own write settling vs the user moving something" — it turns out to
// be perfectly testable, and it is the one that would have hurt.

async function canvasWatcher(json: string, state: Record<string, string> = {}) {
  const { MyuFolderWatcher } = await import('../src/capture/MyuFolderWatcher');
  const { DEFAULT_SETTINGS } = await import('../src/settings');
  const sent: Array<{ myu_id: string; kind: string }> = [];
  const settings = {
    ...DEFAULT_SETTINGS,
    materialize_consented: true,
    materialize_enabled: true,
    myu_canvas_node_state: { ...state },
  };
  const watcher = new MyuFolderWatcher({
    app: { vault: { cachedRead: async () => json } } as never,
    api: () => ({
      vaultInteraction: async (events: Array<{ myu_id: string; kind: string }>) => {
        sent.push(...events);
        return { ok: true, status: 200, error: null, data: { results: [] } };
      },
    }) as never,
    settings: () => settings,
    save: async () => undefined,
    canSend: () => true,
    onRestored: async () => undefined,
    rebaseline: async () => undefined,
  });
  const file = { path: 'Myu/Canvas/board.canvas', extension: 'canvas' } as never;
  await (watcher as unknown as { shipCanvas: (f: unknown) => Promise<void> }).shipCanvas(file);
  return { sent, settings };
}

const NODE = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ nodes: [{ id: 'n1', type: 'text', text: 'the read', x: 0, y: 0, width: 100, height: 60, ...over }], edges: [] });

test('canvas differ — first sighting records a baseline and says NOTHING (our own write settling)', async () => {
  const { sent, settings } = await canvasWatcher(NODE());
  assert.equal(sent.length, 0, 'a node we just wrote must not fire an event at itself');
  assert.ok(settings.myu_canvas_node_state['Myu/Canvas/board.canvas::n1'], 'the baseline is recorded');
});

test('canvas differ — MOVING a card is silent; layout is handling, not meaning', async () => {
  const first = await canvasWatcher(NODE());
  const baseline = first.settings.myu_canvas_node_state;
  // Same node, dragged and resized. Nothing about its meaning changed.
  const { sent } = await canvasWatcher(NODE({ x: 900, y: 640, width: 400, height: 300 }), baseline);
  assert.equal(sent.length, 0, 'dragging and resizing raise no signal at all');
});

test('canvas differ — changing the TEXT is an edit event', async () => {
  const first = await canvasWatcher(NODE());
  const { sent } = await canvasWatcher(NODE({ text: 'I disagree with this' }), first.settings.myu_canvas_node_state);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].kind, 'edit');
  assert.equal(sent[0].myu_id, 'n1');
});

test('canvas differ — removing a node is a delete event, and the baseline is dropped', async () => {
  const first = await canvasWatcher(NODE());
  const { sent, settings } = await canvasWatcher(
    JSON.stringify({ nodes: [], edges: [] }),
    first.settings.myu_canvas_node_state,
  );
  assert.equal(sent.length, 1);
  assert.equal(sent[0].kind, 'delete');
  assert.equal(sent[0].myu_id, 'n1');
  assert.equal(
    settings.myu_canvas_node_state['Myu/Canvas/board.canvas::n1'],
    undefined,
    'a deleted node leaves no baseline to re-fire from',
  );
});

test('canvas differ — mid-write or broken JSON is ignored, never a storm of deletes', async () => {
  const first = await canvasWatcher(NODE());
  const { sent } = await canvasWatcher('{ "nodes": [', first.settings.myu_canvas_node_state);
  assert.equal(sent.length, 0, 'unparseable JSON must not read as "every node was deleted"');
});

// ── Tier A: the destructive modals. House law (2026-08-22): "every wiring bug
// a human finds gets a click-path here." These are written BEFORE a human
// finds one, because the failure is unrecoverable rather than annoying.

function makeDeleteModal() {
  const calls: { deleted: string[]; disconnected: number } = { deleted: [], disconnected: 0 };
  let done = 0;
  const plugin = {
    settings: { base_url: 'http://localhost/api' },
    backend: {
      deleteAccount: async (confirmation: string) => {
        calls.deleted.push(confirmation);
        return { ok: true, status: 200, error: null, data: {} };
      },
    },
    unlock: { disconnect: async () => { calls.disconnected++; } },
  };
  const modal = new DeleteAccountModal({} as never, plugin as never, () => done++);
  notices.length = 0;
  modal.open();
  const root = (modal as unknown as { contentEl: FakeEl }).contentEl;
  return { modal, root, calls, doneCount: () => done };
}

test('delete account — an empty confirmation deletes NOTHING', async () => {
  const { root, calls } = makeDeleteModal();
  assert.ok(await root.click('Delete everything'), `button missing; visible: ${root.visibleTexts().join(' | ')}`);
  assert.equal(calls.deleted.length, 0, 'no confirmation typed → no call reaches the server');
  assert.equal(calls.disconnected, 0, 'and custody is untouched');
});

test('delete account — a WRONG confirmation deletes nothing either', async () => {
  const { root, calls } = makeDeleteModal();
  const inputs = [...root.walk()].filter((e) => e.tag === 'input');
  assert.equal(inputs.length, 1, 'one confirmation field');
  (inputs[0] as unknown as { typed: string }).typed = 'delete';  // lowercase — not the string
  await root.click('Delete everything');
  assert.equal(calls.deleted.length, 0, 'the match is exact, not fuzzy');
});

test('delete account — the exact word deletes, then forgets custody locally', async () => {
  const { root, calls, doneCount } = makeDeleteModal();
  const inputs = [...root.walk()].filter((e) => e.tag === 'input');
  (inputs[0] as unknown as { typed: string }).typed = 'DELETE';
  await root.click('Delete everything');
  assert.deepEqual(calls.deleted, ['DELETE'], 'the server is told exactly once');
  assert.equal(calls.disconnected, 1, 'local token + wrapped blob go too — no litter that looks live');
  assert.equal(doneCount(), 1, 'the settings pane is told to re-render');
});

test('delete account — the escape hatch is the CTA, and it deletes nothing', async () => {
  const { root, calls } = makeDeleteModal();
  assert.ok(await root.click('Keep my account'), 'the safe door exists');
  assert.equal(calls.deleted.length, 0);
});

test('delete account — says plainly that the vault survives', async () => {
  const { root } = makeDeleteModal();
  const text = root.visibleTexts().join(' ');
  // The reassurance a local-first user needs at exactly this moment, and the
  // thing they would otherwise have to guess at.
  assert.match(text, /vault is untouched/i, 'the copy states the vault is not deleted');
  assert.match(text, /myu-generated/i, 'and how to purge what Myu wrote, if they want to');
});

// ── Tier A: the remaining new modals. PersonEditModal carries the OTHER
// irreversible button in the plugin ("Forget"), so it gets the same treatment
// as account deletion.

function makePersonEditModal(memories: Array<{ memory_id: string; text: string }> = []) {
  const calls = {
    profile: [] as Array<Record<string, unknown>>,
    memory: [] as Array<{ id: string; action: string; correction?: string }>,
    archived: [] as string[],
    purged: [] as string[],
  };
  let changed = 0;
  const okRes = { ok: true, status: 200, error: null, data: {} };
  const plugin = {
    backend: {
      updateRelationshipProfile: async (_id: string, fields: Record<string, unknown>) => {
        calls.profile.push(fields);
        return okRes;
      },
      editRelationshipMemory: async (id: string, action: string, correction?: string) => {
        calls.memory.push({ id, action, correction });
        return okRes;
      },
      archiveRelationship: async (id: string) => { calls.archived.push(id); return okRes; },
      purgeRelationship: async (id: string) => { calls.purged.push(id); return okRes; },
    },
  };
  const modal = new PersonEditModal({} as never, plugin as never, 'rel-1', 'Marcus Webb', memories as never, () => changed++);
  notices.length = 0;
  modal.open();
  return { root: (modal as unknown as { contentEl: FakeEl }).contentEl, calls, changedCount: () => changed };
}

test('person edit — saving with nothing typed calls no endpoint', async () => {
  const { root, calls } = makePersonEditModal();
  assert.ok(await root.click('Save facts'), `visible: ${root.visibleTexts().join(' | ')}`);
  assert.equal(calls.profile.length, 0, 'an untouched form is not an update');
});

test('person edit — a cleared field sends explicit null, not an empty string', async () => {
  const { root, calls } = makePersonEditModal();
  const inputs = [...root.walk()].filter((e) => e.tag === 'input');
  (inputs[0] as unknown as { typed: string }).typed = '';   // Name, cleared
  (inputs[1] as unknown as { typed: string }).typed = 'CTO'; // Role, set
  await root.click('Save facts');
  assert.equal(calls.profile.length, 1);
  const fields = calls.profile[0];
  // The endpoint reads explicit null as "clear it"; '' would be a value.
  assert.equal(fields.primary_name, null, 'an emptied field clears, it does not blank');
  assert.equal(fields.stated_role, 'CTO');
});

test('person edit — correcting a memory REQUIRES the correction text', async () => {
  const { root, calls } = makePersonEditModal([{ memory_id: 'm1', text: 'He left Acme' }]);
  assert.ok(await root.click('Correct'), 'the correct button exists');
  assert.equal(calls.memory.length, 0, 'no correction typed → nothing sent');
  assert.ok(notices.some((n) => /actually true/i.test(n)), 'and the user is told why');
});

test('person edit — a typed correction keeps the original, down-weighted', async () => {
  const { root, calls } = makePersonEditModal([{ memory_id: 'm1', text: 'He left Acme' }]);
  const inputs = [...root.walk()].filter((e) => e.tag === 'input');
  (inputs[inputs.length - 1] as unknown as { typed: string }).typed = 'He was promoted, not gone';
  await root.click('Correct');
  assert.equal(calls.memory.length, 1);
  assert.equal(calls.memory[0].action, 'correct', "'correct' preserves the original; 'delete' would not");
  assert.equal(calls.memory[0].correction, 'He was promoted, not gone');
});

test('person edit — deleting a memory needs no correction text', async () => {
  const { root, calls } = makePersonEditModal([{ memory_id: 'm1', text: 'wrong thing' }]);
  await root.click('Delete');
  assert.deepEqual(calls.memory, [{ id: 'm1', action: 'delete', correction: undefined }]);
});

test('person edit — archive is reversible, forget is the irreversible one', async () => {
  const a = makePersonEditModal();
  await a.root.click('Archive');
  assert.deepEqual(a.calls.archived, ['rel-1']);
  assert.equal(a.calls.purged.length, 0, 'archiving must never purge');

  const b = makePersonEditModal();
  await b.root.click('Forget');
  assert.deepEqual(b.calls.purged, ['rel-1']);
  assert.equal(b.calls.archived.length, 0);
});

test('add email — a non-address is refused before any call', async () => {
  const calls: string[] = [];
  const plugin = { backend: { addAccountEmail: async (e: string) => { calls.push(e); return { ok: true, status: 200, error: null, data: {} }; } } };
  const modal = new AddAccountEmailModal({} as never, plugin as never, () => undefined);
  notices.length = 0;
  modal.open();
  const root = (modal as unknown as { contentEl: FakeEl }).contentEl;
  const inputs = [...root.walk()].filter((e) => e.tag === 'input');
  (inputs[0] as unknown as { typed: string }).typed = 'not-an-address';
  await root.click('Send the link');
  assert.equal(calls.length, 0, 'obvious nonsense never reaches the server');

  (inputs[0] as unknown as { typed: string }).typed = 'work@example.com';
  await root.click('Send the link');
  assert.deepEqual(calls, ['work@example.com']);
});

test('mergeCanvas — a canvas Obsidian actually wrote: colour, style and unknown spec fields survive', async () => {
  const { mergeCanvas } = await import('../src/vault/CanvasExporter');

  // Shaped the way Obsidian serialises `.canvas`: tab indentation, no space
  // after the colon, and fields we never emit — `color` on a node the user
  // colour-coded, a `group` they drew themselves with a background image,
  // `styleAttributes` (1.9+), and richly-specified edges.
  const onDisk = [
    '{',
    '\t"nodes":[',
    '\t\t{"id":"c-1","type":"text","text":"ours v1","x":-260,"y":-200,"width":360,"height":120,"color":"4"},',
    '\t\t{"id":"c-2","type":"text","text":"ours, stale","x":140,"y":-200,"width":360,"height":120,"styleAttributes":{"border":"dashed"}},',
    '\t\t{"id":"mine","type":"text","text":"my own thought","x":200,"y":300,"width":250,"height":60,"color":"#a341ff"},',
    '\t\t{"id":"grp","type":"group","x":-300,"y":-240,"width":800,"height":400,"label":"How I think about this","background":"pics/paper.png","backgroundStyle":"cover"}',
    '\t],',
    '\t"edges":[',
    '\t\t{"id":"e1","fromNode":"c-1","fromSide":"right","toNode":"mine","toSide":"left","color":"6","label":"because"}',
    '\t]',
    '}',
  ].join('\n');

  const fresh = {
    nodes: [
      { id: 'c-1', type: 'text', text: 'ours v2', x: 0, y: 0, width: 360, height: 200 },
      // Re-typed by the server: this component now resolves to a person page.
      { id: 'c-2', type: 'file', file: 'Myu/People/Ada Lovelace.md', x: 400, y: 0, width: 360, height: 120 },
    ],
    edges: [],
  };

  const merged = mergeCanvas(onDisk, fresh as never);
  const byId = new Map(merged.nodes.map((n) => [n.id, n as Record<string, unknown>]));

  // Ours: the wording updates…
  assert.equal(byId.get('c-1')?.text, 'ours v2');
  // …and nothing else about the node they arranged does.
  assert.equal(byId.get('c-1')?.color, '4', 'the colour the user chose is NOT reset on re-export');
  assert.deepEqual(
    [byId.get('c-1')?.x, byId.get('c-1')?.y, byId.get('c-1')?.width, byId.get('c-1')?.height],
    [-260, -200, 360, 120],
    'geometry is theirs',
  );

  // A field invented after this code was written survives by construction.
  assert.deepEqual(byId.get('c-2')?.styleAttributes, { border: 'dashed' }, 'unknown spec fields are preserved');

  // Re-typed node: the new content lands and the stale content key is GONE —
  // a `file` node carrying a leftover `text` is invalid JSON Canvas.
  assert.equal(byId.get('c-2')?.type, 'file');
  assert.equal(byId.get('c-2')?.file, 'Myu/People/Ada Lovelace.md');
  assert.ok(!('text' in (byId.get('c-2') as object)), 'stale text key removed when the type changes');

  // Theirs, entirely untouched.
  assert.equal(byId.get('mine')?.text, 'my own thought');
  assert.equal(byId.get('mine')?.color, '#a341ff');
  assert.equal(byId.get('grp')?.label, 'How I think about this');
  assert.equal(byId.get('grp')?.background, 'pics/paper.png');
  assert.equal(byId.get('grp')?.backgroundStyle, 'cover');

  // Edges are theirs wholesale — sides, colour, label and all.
  assert.deepEqual(merged.edges, [
    { id: 'e1', fromNode: 'c-1', fromSide: 'right', toNode: 'mine', toSide: 'left', color: '6', label: 'because' },
  ]);

  // And the whole thing is still serialisable back to a canvas Obsidian reads.
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(merged)));
});

test('a chart becomes a MARKDOWN TABLE — readable bare, and a chart source for Obsidian Charts', async () => {
  const { buildCompositionMarkdown } = await import('../src/vault/myuFiles');
  const md = buildCompositionMarkdown({
    id: 'c',
    components: [
      {
        id: 'ch1',
        type: 'chart',
        label: 'Reply latency',
        data: {
          recharts_config: {
            type: 'line',
            x_key: 'week',
            y_key: 'days',
            color: '#b8860b',
            data: [
              { week: '2026-07-06', days: 1, threads: 4 },
              { week: '2026-07-13', days: 3, threads: 4 },
              { week: '2026-07-20', days: 9, threads: 2 },
            ],
          },
        },
      },
    ],
  });

  assert.match(md, /^#+ Reply latency$/m, 'the chart keeps its title');
  // A table, not a picture and not a referral. Obsidian Charts (320k installs)
  // turns exactly this into an interactive chart via "Create Chart from Table";
  // everyone else can simply read it.
  assert.match(md, /\| Week \| Days \| Threads \|/, 'every series becomes a column');
  assert.match(md, /\| --- \| --- \| --- \|/);
  assert.match(md, /\| 2026-07-20 \| 9 \| 2 \|/, 'rows render verbatim');
  // Multi-series is free here; chartToSvg only ever drew one.
  assert.ok(!/web view|open live|on the web/i.test(md), 'a chart never defers to the browser');

  // Presentation keys are not content — a table of colours would be noise.
  assert.ok(!/b8860b/.test(md), 'plumbing keys are excluded');
  assert.ok(!/x_key|y_key/.test(md));
});

test('an unrecognised component renders its data rather than deferring to the web', async () => {
  const { buildCompositionMarkdown } = await import('../src/vault/myuFiles');
  const md = buildCompositionMarkdown({
    id: 'c',
    components: [
      {
        id: 'w1',
        type: 'trust_arc_widget',           // nothing in the switch handles this
        label: 'Trust arc',
        data: {
          id: 'w1',                          // plumbing — must not surface
          standing: 'holding',
          note: 'Third reschedule in a row, but he still answers within the day.',
          milestones: [
            { when: '2026-06-01', what: 'intro' },
            { when: '2026-08-02', what: 'went quiet' },
          ],
        },
      },
    ],
  });

  assert.match(md, /^#+ Trust arc$/m);
  assert.match(md, /- \*\*Standing\*\* — holding/, 'short scalars become labelled fields');
  assert.match(md, /within the day\.\n\n\*\*Milestones\*\*/, 'a field line never lazily continues into the next block');
  assert.match(md, /Third reschedule in a row/, 'prose renders as prose, not as a field');
  assert.match(md, /\| When \| What \|/, 'rows become a table');
  assert.match(md, /\| 2026-08-02 \| went quiet \|/);
  assert.ok(!/\bw1\b/.test(md), 'the id is plumbing and stays out');
  assert.ok(!/web view|open live|on the web/i.test(md), 'nothing defers to the browser');
});

// ── every web component type renders in the vault ───────────────────────────
//
// One realistic fixture per type, built from the REAL shapes in
// packages/shared/src/types/composition.ts, rendered through
// buildCompositionMarkdown as one composition (so cross-references resolve).
// Each entry names a string that MUST appear — the piece of content a reader
// would miss if that type fell back to nothing. The list itself is pinned to
// the canonical union in src/wire/parity.ts; this proves the runtime half.

type Fx = { type: string; label?: string; variant?: string; data: Record<string, unknown>; expect: RegExp };
const COMPONENT_FIXTURES: Record<string, Fx> = {
  a: { type: 'text_block', data: { text: 'Two weeks without a reply.', tone: 'observational' }, expect: /Two weeks without a reply\./ },
  b: { type: 'person_card', data: { name: 'Marcus Webb', role: 'VP Eng', company: 'Acme', health_tier: 'NEEDS_ATTENTION', key_insight: 'has gone quiet', photo_url: 'https://x/p.jpg' }, expect: /\[\[Marcus Webb\]\] — VP Eng, Acme — \*needs attention\* — has gone quiet/ },
  b2: { type: 'person_card', variant: 'stakeholder', data: { name: 'Priya Nair', subject_role: 'Lead Investor', stance: 'skeptical', what_they_want: ['no surprises'], what_they_can_block: ['the bridge round'] }, expect: /\*\*Stance\*\* — skeptical[\s\S]*What they can block[\s\S]*the bridge round/ },
  c: { type: 'team_grid', data: { title: 'Platform', total_count: 3, people: [{ id: 'p1', type: 'person_card', data: { name: 'Dana Ortiz', role: 'Staff Eng' } }] }, expect: /\*1 of 3\*[\s\S]*\[\[Dana Ortiz\]\] — Staff Eng/ },
  d: { type: 'chart', data: { title: 'Reply latency', fallback_text: 'Replies slowed over July.', recharts_config: { type: 'line', x_key: 'week', y_key: 'days', color: '#b8860b', data: [{ week: '07-06', days: 1 }, { week: '07-20', days: 9 }] } }, expect: /\| Week \| Days \|[\s\S]*\| 07-20 \| 9 \|[\s\S]*Replies slowed over July\./ },
  d2: { type: 'chart', data: { title: 'Share', fallback_text: 'Mostly platform.', vega_lite_spec: { mark: 'arc', data: { values: [{ team: 'Platform', pct: 62 }] } } }, expect: /\| Team \| Pct \|[\s\S]*\| Platform \| 62 \|/ },
  e: { type: 'comparison', data: { title: 'You vs the data', left: { label: 'Your read', items: [] }, right: { label: 'Calendar', items: [] }, dimensions: [{ name: 'cadence', left_value: 'weekly', right_value: 'every 3 weeks', alignment: 'divergent' }], summary: 'The gap is cadence.' }, expect: /\| \*\*cadence\*\* \| weekly \| every 3 weeks \| divergent/ },
  f: { type: 'timeline', data: { title: 'The arc', events: [{ date: '2026-08-02', label: 'Went quiet', description: 'One line.' }] }, expect: /`2026-08-02` Went quiet — One line\./ },
  g: { type: 'diagram', data: { title: 'The loop', source: 'graph TD; A-->B;', caption: 'Shape of it?' }, expect: /```mermaid\ngraph TD; A-->B;\n```/ },
  h: { type: 'signal_card', data: { title: 'Cadence broke', description: 'Three cancelled.', evidence: ['Cancelled 07-08'], related_entity: 'Marcus Webb' }, expect: /Three cancelled\.[\s\S]*- Cancelled 07-08[\s\S]*re \[\[Marcus Webb\]\]/ },
  i: { type: 'pattern_card', data: { pattern_name: 'Goes quiet', description: 'Withdraws.', confidence: 0.72, instances: [{ context: 'Q2 reorg', detail: '11 days silent.' }] }, expect: /Goes quiet[\s\S]*72% confidence[\s\S]*\| Q2 reorg \| 11 days silent\. \|/ },
  j: { type: 'reflection_prompt', data: { question: 'What would you want him to say?', context: 'You were rehearsing.', prompt_type: 'gut_check' }, expect: /> What would you want him to say\?\n\n\*You were rehearsing\.\*/ },
  k: { type: 'action_controls', data: { actions: [{ label: 'Draft a note', action: 'draft_message', priority: 'high' }] }, expect: /- Draft a note/ },
  l: { type: 'person_disambiguation', data: { query_name: 'Sam', candidates: [{ relationship_id: 'r-2', name: 'Sam Okafor', role: 'PM' }] }, expect: /Which Sam\?[\s\S]*\| Sam Okafor \| PM \|/ },
  m: { type: 'prepared_content', data: { title: 'For the 1:1', content: '- Ask about the reorg\n- Leave room', format: 'markdown' }, expect: /- Ask about the reorg\n- Leave room/ },
  n: { type: 'decision_frame', data: { question: 'Raise it this week?', options: [{ label: 'Yes', description: 'Name it.', risk: 'he withdraws', recommended: true }], summary: 'Only one is reversible.' }, expect: /- \*\*Yes\*\* ✓ — Name it\. · risk: he withdraws/ },
  n2: { type: 'decision_frame', data: { question: 'Bridge round?', pros: [{ text: 'Buys 9 months', weight: 'high' }], cons: [{ text: 'Dilutes', weight: 'medium' }], prerequisites: ['board sign-off'] }, expect: /\*\*For\*\*\n- Buys 9 months \*\(high\)\*[\s\S]*\*\*Against\*\*[\s\S]*- \[ \] board sign-off/ },
  o: { type: 'trackable', data: { trackable_id: 't-1', title: 'Send the plan', status: 'overdue', due_date: '2026-08-20', linked_person: 'Marcus Webb' }, expect: /- \[ \] Send the plan — overdue · due 2026-08-20 · with \[\[Marcus Webb\]\]/ },
  p: { type: 'process_card', data: { title: 'Platform weekly', cadence: 'weekly', current_state: 'drifting', summary: 'Attendance thinned.' }, expect: /\*weekly · drifting\*\n\nAttendance thinned\./ },
  q: { type: 'change_suggestion', data: { title: 'Go async', expected_effect: 'One place again.', status: 'draft', rationale: 'Half the room is async.' }, expect: /Half the room is async\.\n\n→ One place again\. \*\(draft\)\*/ },
  r: { type: 'intervention_tracker', data: { title: 'Async weekly', target_type: 'process', expected_effect: 'fewer DM decisions', watch_period_weeks: 4, report_marks: [1, 2, 4], started_at: 1756166400000, status: 'active' }, expect: /\*active · 4-week watch · since 2025-08-26\*[\s\S]*\*\*Expecting\*\* — fewer DM decisions/ },
  s: { type: 'subject_header', data: { subject_name: 'Marcus Webb', subject_type: 'person', tagline: 'VP Eng · cooling', badges: [{ label: 'at risk' }] }, expect: /\[\[Marcus Webb\]\]\n\nVP Eng · cooling · `at risk`/ },
  t: { type: 'note_editor', data: { initial_text: 'He mentioned the deck twice.', placeholder: 'Add a note…', context_title: 'Your note' }, expect: /Your note\n\nHe mentioned the deck twice\./ },
  u: { type: 'section_header', data: { title: 'What changed', subtitle: 'since last time', collapsible: true }, expect: /What changed\n\n\*since last time\*/ },
  v: { type: 'relationship_map', data: { title: 'Around Marcus', center_node: { id: 'r-1', name: 'Marcus Webb', type: 'person' }, nodes: [{ id: 'r-1', name: 'Marcus Webb', type: 'person' }, { id: 'r-4', name: 'Dana Ortiz', type: 'person', health_tier: 'thriving' }], edges: [{ source: 'r-1', target: 'r-4', strength: 0.8, label: 'weekly 1:1s' }] }, expect: /- \[\[Dana Ortiz\]\] \*\(thriving\)\*[\s\S]*Marcus Webb ↔ Dana Ortiz — weekly 1:1s/ },
  w: { type: 'budget_allocation', data: { title: 'The week', total_budget: 40, budget_unit: 'hours', items: [{ id: 'i1', label: 'Platform', current_value: 18, color: '#aaa' }] }, expect: /\| Platform \| 18 \|\n\| \*\*Total\*\* \| \*\*40\*\* \|/ },
  x: { type: 'move_node', data: { move_number: 3, actor: 'Red team', move_text: 'What if the board knows?', annotation: 'You wrote it yourself.' }, expect: /3\. Red team\n\n> What if the board knows\?\n\n\*You wrote it yourself\.\*/ },
  y: { type: 'perspective_panel', data: { title: 'Two readings', left_perspective: { actor: 'You', items: [{ label: 'the silence', value: 'anger' }] }, right_perspective: { actor: 'Marcus', items: [{ label: 'the silence', value: 'load' }] }, asymmetries: [{ topic: 'urgency', left_view: 'now', right_view: 'later' }] }, expect: /\*\*You\*\*\n- the silence: anger[\s\S]*\*\*Marcus\*\*\n- the silence: load[\s\S]*\| urgency \| now \| later \|/ },
  z: { type: 'seed_follow_up', data: { prompt: 'Which Sam?', original_type: 'person_card', original_seed: 'Sam', options: ['Sam Okafor'] }, expect: /> Which Sam\?\n\n- Sam Okafor/ },
  aa: { type: 'inline_chat', data: { prompt: 'Ask a follow-up', placeholder: 'e.g. …' }, expect: /> Ask a follow-up/ },
  ab: { type: 'sticky_note', data: { text: 'call him before Thursday', color: 'yellow' }, expect: /call him before Thursday/ },
  ac: { type: 'shape', data: { text: 'Decision', shape_type: 'diamond' }, expect: /Decision/ },
  ad: { type: 'connection_overlay', data: { from_id: 'b', to_id: 'c', connection_type: 'tension', label: '3rd clash', directional: true }, expect: /\*\*Marcus Webb → Platform\*\* — tension: 3rd clash/ },
  ae: { type: 'strategy_sequence', data: { title: 'Before the offsite', steps: [{ step_number: 1, action: 'Meet Dana', person_name: 'Dana Ortiz', rationale: 'gatekeeper', timing: 'today', phase: 'Phase 1' }] }, expect: /\*\*Phase 1\*\*\n1\. Meet Dana with \[\[Dana Ortiz\]\] \*\(today\)\* — gatekeeper/ },
  af: { type: 'context_annotation', data: { text: 'Third time this pattern.', anchor_id: 'b', severity: 'attention' }, expect: /> \[!info\] re Marcus Webb\n> Third time this pattern\./ },
  af2: { type: 'offer_block', data: { lead: 'I can read your week once I can see it.', gap_line: 'You mentioned a meeting I cannot find.', options: [{ id: 'calendar_google', label: 'Connect Google Calendar' }, { id: 'just_tell', label: 'Just tell me' }], trust_line: 'Read-only. Never edited.', named_person: { name: 'Marcus Webb', when_text: 'Thursday' } }, expect: /I can read your week once I can see it\.[\s\S]*re \[\[Marcus Webb\]\] — Thursday[\s\S]*- Connect Google Calendar\n- Just tell me[\s\S]*\*Read-only\. Never edited\.\*/ },
  ag: { type: 'career_trajectory', data: { pattern_name: 'Builder to operator', current_phase: 'p2', current_phase_name: 'Scaling', current_phase_description: 'Hiring faster than delegating.', phases: [{ id: 'p2', name: 'Scaling', description: 'Hiring.', status: 'current' }, { id: 'p3', name: 'Operating', description: 'Runs itself.', status: 'predicted' }], predicted_next_phase_name: 'Operating', estimated_timeline_weeks: [20, 40], risk_markers: ['no deputy'] }, expect: /\*\*Now: Scaling\*\*[\s\S]*- \*\*Scaling\*\* — Hiring\.[\s\S]*Likely next: Operating in 20–40 weeks[\s\S]*\*\*Watch\*\*\n- no deputy/ },
  ah: { type: 'career_position_timeline', data: { positions: [{ start_year: 2022, end_year: null, title: 'VP Engineering', company: 'Acme', seniority_level: 6, is_primary: true, is_current: true }], summary: { total_years: 7, companies: 2 } }, expect: /\*7 years · 2 companies\*[\s\S]*`2022–now` \*\*VP Engineering\*\*, Acme \*\(current\)\*/ },
  ai: { type: 'micro_arc_timeline', data: { pattern_key: 'k', phases: [{ id: 'p2', name: 'Scaling', status: 'current', collapsed: false, micro_arcs: [{ summary: 'Delegated the roadmap', timestamp: 1756000000000, source_type: 'email' }] }] }, expect: /Scaling \*\(current\)\*\n\n- `2025-08-24` Delegated the roadmap \*\(email\)\*/ },
  aj: { type: 'branch_point', data: { pattern_key: 'k', from_phase: 'Scaling', proximity: 0.7, branches: [{ to_phase: 'p3', to_phase_name: 'Operating', conditions: 'A deputy.', contextualized_narrative: 'Dana is half there.' }], current_lean: 'Operating' }, expect: /From Scaling[\s\S]*- \*\*Operating\*\* — A deputy\.\n  \*Dana is half there\.\*[\s\S]*Leaning: Operating/ },
  ak: { type: 'possibility_space', data: { natural_next_steps: [{ target_title: 'CTO', probability: 0.4, typical_years: [2, 4] }] }, expect: /\*\*Natural next steps\*\*[\s\S]*\| CTO \| 40% \| 2–4 \|/ },
  al: { type: 'career_pathway', data: { from: { title: 'VP Engineering' }, to: { title: 'CTO' }, narrative: 'One hop.', estimated_years: { optimistic: 1.5, typical: 3 }, hops: [{ order: 1, from_title: 'VP Engineering', to_title: 'CTO', typical_years: [2, 4] }], skill_gaps: [{ skill: 'budget', gap: 'moderate', importance_to_target: 0.9, user_level: 0.5 }], network_peers_on_path: [{ relationship_id: 'r-9', display_name: 'Lena Park', current_title: 'CTO' }] }, expect: /VP Engineering → CTO[\s\S]*~3 years \(1\.5 if it goes well\)[\s\S]*1\. VP Engineering → CTO \*\(2–4 yrs\)\*[\s\S]*\| budget \| moderate \|[\s\S]*- \[\[Lena Park\]\], CTO/ },
  am: { type: 'what_if_scenarios', data: { scenarios: [{ scenario: 'Dana takes delivery', conditions: 'hand over by Q4', outcome_phase: 'Operating', outcome_probability: 0.6, timeline_weeks: [12, 24] }], levers: [{ lever: 'delegate', impact: 'high' }] }, expect: /\| Dana takes delivery \| hand over by Q4 \| Operating \| 60% \| 12–24 \|[\s\S]*\*\*Levers\*\*[\s\S]*\| delegate \| high \|/ },
  an: { type: 'statistical_context', data: { source: 'NLSY97', sample_size: 1200, cohort: 'eng leaders', success_rate: 0.34, user_vs_cohort: { team_size: { user: 24, cohort_avg: 15 } } }, expect: /\*\*eng leaders\*\* · n=1200 · NLSY97[\s\S]*Success rate\*\* — 34%[\s\S]*\| \*\*Team size\*\* \| 24 \| 15 \|/ },
  ao: { type: 'advisor_panel', data: { entity_type: 'self', triggering_event: 'third cancelled 1:1', takes: [{ persona: 'mentor', text: 'It might be load.' }] }, expect: /\*on: third cancelled 1:1\*\n\n- \*\*Mentor\*\* — It might be load\./ },
  ap: { type: 'severity_indicator', data: { level: 'critical', context: 'board in 21 days' }, expect: /> \[!danger\] Critical\n> board in 21 days/ },
  aq: { type: 'prediction_table', data: { framing: 'If you do nothing', horizon_label: 'next 14 days', predictions: [{ what: 'He escalates', confidence: 0.55, by_when: '2026-09-05', who_else_affected: ['Dana Ortiz'] }], footer: 'Based on 3 patterns.' }, expect: /If you do nothing \*\(next 14 days\)\*[\s\S]*\| He escalates \| 2026-09-05 \| 55% \| Dana Ortiz \|[\s\S]*\*Based on 3 patterns\.\*/ },
  ar: { type: 'alignment_hierarchy', data: { subject_name: 'Marcus Webb', overall_alignment_score: 0.55, tiers: [{ level: 'L2', label: 'Strategy', score: 0.3, status: 'disagree', their_stance: 'growth now', your_stance: 'debt first', evidence: [{ date: '08-20', source: 'slack', preview: 'no to sales' }], actions: ['Name the trade-off'] }] }, expect: /Alignment with \[\[Marcus Webb\]\][\s\S]*\*\*55% aligned\*\*[\s\S]*\*\*L2 Strategy\*\* — disagree 30%\n  - them: growth now\n  - you: debt first\n  - `08-20` no to sales \*\(slack\)\*\n  - → Name the trade-off/ },
  as: { type: 'circle_pack', data: { title: 'Clusters', nodes: [{ id: 'r-4', label: 'Dana Ortiz', value: 9, group: 'platform' }], groups: [{ id: 'platform', label: 'Platform' }] }, expect: /\*\*Platform\*\*\n- \[\[Dana Ortiz\]\] \(9\)/ },
  at: { type: 'hierarchy', data: { title: 'Reporting', root: { id: 'you', label: 'You', children: [{ id: 'r-1', label: 'Marcus Webb', health_tier: 'at_risk', children: [{ id: 'r-4', label: 'Dana Ortiz' }] }] } }, expect: /- You\n  - Marcus Webb \*\(at risk\)\*\n    - Dana Ortiz/ },
  au: { type: 'matrix_view', data: { title: 'Who talks', entities: [{ id: 'r-1', label: 'Marcus' }, { id: 'r-4', label: 'Dana' }], cells: [{ row_id: 'r-1', col_id: 'r-4', value: 14, label: 'weekly' }], value_label: 'messages' }, expect: /\| messages \| Marcus \| Dana \|[\s\S]*\| \*\*Marcus\*\* \|  \| 14 \(weekly\) \|/ },
  av: { type: 'venn_diagram', data: { title: 'Overlap', sets: [{ id: 'a', label: 'Platform', size: 6 }, { id: 'b', label: 'Hiring', size: 4 }], intersections: [{ sets: ['a', 'b'], size: 2, members: [{ id: 'r-4', label: 'Dana Ortiz' }] }] }, expect: /- \*\*Platform ∩ Hiring\*\* — 2: Dana Ortiz/ },
  aw: { type: 'card_section', data: { entity_type: 'person', entity_id: 'r-1', section_type: 'narrative', section_title: 'How things are', section_data: { text: 'The quiet has a shape.' } }, expect: /How things are\n\nThe quiet has a shape\./ },
  ax: { type: 'container', variant: 'cluster', data: { label: 'Platform', child_ids: [], defining_characteristic: 'all report to Marcus', risk_label: 'single point of failure' }, expect: /Platform/ },
};

test('every web component type renders in the vault — all 50, from the real shapes', async () => {
  const { buildCompositionMarkdown } = await import('../src/vault/myuFiles');
  // Its own file, not vendored.ts (the mirror renames that) and not the wire
  // index (held to `export type` only) — see componentTypes.ts.
  const { COMPOSITION_COMPONENT_TYPES } = await import('../src/wire/componentTypes');

  const covered = new Set(Object.values(COMPONENT_FIXTURES).map((f) => f.type));
  for (const type of COMPOSITION_COMPONENT_TYPES) {
    assert.ok(covered.has(type), `no fixture for '${type}' — the web renders it, so the vault must be proven to`);
  }

  // Render each on its own (the container fixture would otherwise swallow its
  // children into a heading), with the full set as siblings for id lookups.
  const all = Object.entries(COMPONENT_FIXTURES).map(([id, f]) => ({ id, type: f.type, label: f.label, variant: f.variant, data: f.data }));
  const resolve = (name: string) => (name === 'Marcus Webb' ? 'Marcus Webb' : null);
  for (const [id, fixture] of Object.entries(COMPONENT_FIXTURES)) {
    const only = all.map((c) => (c.id === id ? c : { ...c, type: c.type === 'container' ? 'text_block' : c.type }));
    const md = buildCompositionMarkdown({ id: 'audit', components: only.filter((c) => c.id === id || fixture.type === 'connection_overlay' || fixture.type === 'context_annotation') } as never, resolve);
    // For the two that point at siblings by id, render the WHOLE set so the
    // ids resolve — then look for this fixture's line inside it.
    assert.match(md, fixture.expect, `${fixture.type}${fixture.variant ? ` (${fixture.variant})` : ''} lost its content:\n${md}`);
    assert.ok(!/\{"/.test(md), `${fixture.type}: raw JSON leaked into the note`);
    assert.ok(!/web view|open live|on the web/i.test(md), `${fixture.type}: defers to the browser`);
    assert.ok(!/\n- \*\*[^\n]+\n\*\*/.test(md), `${fixture.type}: a field line lazily continues into a bold header`);
  }
});

test('a resumed conversation finds its canvas — the call the stored turns cannot make', async () => {
  const { canvasOnResume, Api } = await import('../src/transport/api');

  // Live composition → the SAME offer row a live turn ends on, plus the id to
  // open beside the thread (what the web's DynamicChatColumn does on resume).
  const live = canvasOnResume({ composition: { id: 'comp-9', summary_text: 'Team read', components: [] }, composition_id: 'comp-9', turn_number: 3 });
  assert.ok(live && 'blocks' in live);
  if (live && 'blocks' in live) {
    assert.deepEqual(live.blocks, [{ type: 'composition_offer', composition_id: 'comp-9', summary_text: 'Team read' }]);
    assert.equal(live.open, 'comp-9');
  }

  // Exists but gated → said out loud (R7), never silently nothing.
  const gated = canvasOnResume({ composition: null, status: 'encrypted_unavailable' });
  assert.ok(gated && 'note' in gated && /canvas/.test(gated.note));

  // None / expired / malformed → nothing, like the web closing its pane.
  for (const none of [null, undefined, {}, { composition: null, status: 'no_thread' }, { composition: null, status: 'no_composition' }, { composition: null, status: 'composition_expired' }, { composition: { id: 'x', components: [] } /* no id */ }]) {
    assert.equal(canvasOnResume(none as never), null, JSON.stringify(none));
  }

  // The wire call is the web's, verbatim: GET, journal_id in the query, encoded.
  let seen = '';
  const api = new Api({ get: async (path: string) => { seen = path; return { ok: true, status: 200, data: {} }; }, post: async () => ({ ok: true, status: 200, data: {} }) } as never);
  await api.getCompositionForJournal('j/1 2');
  assert.equal(seen, '/composition/for-journal?journal_id=j%2F1%202');
});

// ── saving a composition: nobody is asked to know an id ─────────────────────

function makeExportModal(opts: { id?: string; rows?: Array<Record<string, unknown>> | 'fail' }) {
  const calls: Array<[string, string]> = [];
  let historyCalls = 0;
  const plugin = {
    backend: {
      getCompositionHistory: async () => {
        historyCalls++;
        if (opts.rows === 'fail') throw new Error('backend down');
        return { ok: true, status: 200, data: { compositions: opts.rows ?? [] } };
      },
    },
    exportComposition: async (id: string, fmt: string) => { calls.push([id, fmt]); },
  };
  const modal = new CanvasExportModal({} as never, plugin as never, opts.id);
  modal.open();
  return { modal, root: modal.contentEl as unknown as FakeEl, calls, historyCalls: () => historyCalls };
}

const THREE = [
  { composition_id: 'comp-team', summary_text: 'Team read — platform group', subject_name: 'Platform', created_at: 1756200000000 },
  { composition_id: 'comp-marcus', summary_text: 'Where things stand with Marcus', subject_name: 'Marcus Webb', created_at: 1756100000000 },
  { composition_id: 'comp-old', summary_text: 'An expired one', is_expired: true },
];

test('save composition — opened from an offer or the pane, the id is KNOWN: no picker, no question', async () => {
  const { root, calls, historyCalls } = makeExportModal({ id: 'comp-9' });
  const text = root.visibleTexts().join(' | ');
  assert.ok(!/Which composition|paste/i.test(text), `no picker, no paste field: ${text}`);
  assert.equal(historyCalls(), 0, 'and no history fetch');
  assert.ok(await root.click('As a canvas'));
  assert.deepEqual(calls, [['comp-9', 'canvas']]);
});

test('save composition — opened from the command, it OFFERS compositions; an empty click is SAID, not swallowed', async () => {
  const { modal, root, calls } = makeExportModal({ rows: THREE });
  await modal.ready;
  const text = root.visibleTexts().join(' | ');
  assert.match(text, /Which composition\?/);
  assert.match(text, /Team read — platform group/, 'rows are offered by their summary');
  assert.match(text, /Where things stand with Marcus/);
  assert.ok(!/An expired one/.test(text), 'an expired composition is not offered — it would be a button that fails');

  // The reported bug: nothing picked, click a save button, nothing happens.
  assert.ok(await root.click('As a note'));
  assert.deepEqual(calls, [], 'nothing is exported without a choice');
  assert.match(root.visibleTexts().join(' '), /Pick a composition above first\./, 'and the modal SAYS so (R7)');

  // Pick by reading, not by knowing an id.
  assert.ok(await root.click('Where things stand with Marcus'), 'a row is clickable');
  assert.ok(await root.click('As a note'));
  assert.deepEqual(calls, [['comp-marcus', 'markdown']]);
});

test('save composition — no compositions yet: says what to do; the buttons never go dead-silent', async () => {
  const { modal, root, calls } = makeExportModal({ rows: [] });
  await modal.ready;
  assert.match(root.visibleTexts().join(' '), /No compositions yet/);
  assert.ok(await root.click('As a canvas'));
  assert.deepEqual(calls, []);
  assert.match(root.visibleTexts().join(' '), /Nothing to save yet/, 'the empty click is explained');
});

test('save composition — a pasted web canvas URL still works, as the fallback it is', async () => {
  const { modal, root, calls } = makeExportModal({ rows: 'fail' });
  await modal.ready;   // the history fetch failed; the modal must still be usable
  const inputs = [...root.walk()].filter((e) => e.tag === 'input');
  assert.equal(inputs.length, 1, 'one paste field, below the picker');
  (inputs[0] as unknown as { typed: string }).typed = 'https://myu.askmyu.com/dashboard?id=comp-77';
  assert.ok(await root.click('As a canvas'));
  assert.deepEqual(calls, [['comp-77', 'canvas']], 'the id is lifted out of the URL');
});

test('save composition — the copy no longer claims charts link back to the web', async () => {
  const { root } = makeExportModal({ id: 'x' });
  const text = root.visibleTexts().join(' ');
  assert.ok(!/links? back to the web/i.test(text), 'charts are tables/snapshots now — the old claim is gone');
  assert.match(text, /snapshot/i);
});

// ── chat replies render as MARKDOWN, not as a wall of asterisks ─────────────

test('chat — a reply renders through Obsidian\'s markdown renderer, never as plain text', async () => {
  const { renderChatBlock } = await import('../src/views/chatBlocks');
  const parent = new FakeEl('div');
  const opened: string[] = []; const saved: string[] = [];
  const host = { app: {}, component: {}, openCanvas: (id: string) => opened.push(id), saveCanvas: (id: string) => saved.push(id), webOrigin: 'https://myu.askmyu.com' };

  // The operator's real reply: a six-column table plus emphasis.
  const reply = 'Here\u2019s your checklist \u2014 built for *bootstrapping now*.\n\n| **Area** | **Day-One** |\n|---|---|\n| Core hygiene | LLC formation |';
  markdownRenders.length = 0;
  renderChatBlock(parent as never, { type: 'conversational', text: reply }, host as never);
  assert.deepEqual(markdownRenders, [reply], 'the exact text goes to MarkdownRenderer');
  assert.ok(!parent.visibleTexts().join(' ').includes('| **Area** |'), 'and is NOT also painted as raw text');
  const block = parent.find((e) => e.classes.has('myu-chat-block'));
  assert.ok(block?.classes.has('markdown-rendered'), 'carries the class the theme styles tables and lists by');

  // An unknown block type that carries text is markdown too — never dropped.
  markdownRenders.length = 0;
  renderChatBlock(parent as never, { type: 'insight_card', text: '- one\n- two' }, host as never);
  assert.deepEqual(markdownRenders, ['- one\n- two']);

  // The offer row keeps its three doors, and they reach the host.
  renderChatBlock(parent as never, { type: 'composition_offer', composition_id: 'comp-4', summary_text: 'Team read' }, host as never);
  assert.ok(await parent.click('Open canvas'));
  assert.ok(await parent.click('Save to vault'));
  assert.deepEqual(opened, ['comp-4']);
  assert.deepEqual(saved, ['comp-4']);
});

test('chat — the saved note links an offer to its canvas in the vault, never "on the web"', async () => {
  const { renderConversation } = await import('../src/vault/ConversationWriter');
  const text = renderConversation([
    { role: 'user', text: 'so this whole shopping for a law firm' },
    { role: 'myu', blocks: [{ type: 'conversational', text: 'Here is your checklist.' }, { type: 'composition_offer', composition_id: 'comp-9', summary_text: '' }] },
  ]);
  assert.ok(text);
  assert.ok(!/on the web/i.test(text!), 'no browser exit written into the vault');
  assert.ok(!/offered:\s+\u2014/.test(text!), 'an empty summary does not render as "offered:  \u2014"');
  assert.match(text!, /Myu offered a canvas \u2014 \[open it \u25b8\]\(obsidian:\/\/myu-canvas\?id=comp-9\)/, 'the offer is a deep link into the canvas pane');
  const named = renderConversation([{ role: 'myu', blocks: [{ type: 'composition_offer', composition_id: 'c', summary_text: 'Team read' }] }]);
  assert.match(named!, /a canvas: \u201cTeam read\u201d/, 'a summary is quoted when there is one');
});

// ── the canvas pane is actionable: cards with controls get real buttons ─────

test('applyMutations — the shared store\'s semantics, op for op', async () => {
  const { applyMutations } = await import('../src/composition/applyMutations');
  const spec = { id: 'c', components: [
    { id: 'a', type: 'text_block', data: { text: 'A' } },
    { id: 'b', type: 'prepared_content', data: { title: 'LinkedIn Match Found' } },
    { id: 'c', type: 'text_block', data: { text: 'C' } },
  ] };
  const ids = (x: { components: Array<{ id: string }> }) => x.components.map((c) => c.id);

  // replace: the LinkedIn card becomes the confirmation line — the real resolve_linkedin answer.
  const replaced = applyMutations(spec, [{ op: 'replace', target_id: 'b', components: [{ id: 'b', type: 'text_block', data: { text: '\u2713 Confirmed' } }] }]);
  assert.deepEqual(ids(replaced), ['a', 'b', 'c']);
  assert.equal(replaced.components[1].data?.text, '\u2713 Confirmed');
  assert.equal(spec.components[1].type, 'prepared_content', 'pure — the input is untouched');

  // replace root swaps everything.
  assert.deepEqual(ids(applyMutations(spec, [{ op: 'replace', target_id: 'root', components: [{ id: 'z', type: 'text_block' }] }])), ['z']);
  // add: end / before / after / unknown-target appends.
  assert.deepEqual(ids(applyMutations(spec, [{ op: 'add', target_id: 'x', position: 'end', components: [{ id: 'n', type: 'text_block' }] }])), ['a', 'b', 'c', 'n']);
  assert.deepEqual(ids(applyMutations(spec, [{ op: 'add', target_id: 'b', position: 'before', components: [{ id: 'n', type: 'text_block' }] }])), ['a', 'n', 'b', 'c']);
  assert.deepEqual(ids(applyMutations(spec, [{ op: 'add', target_id: 'b', position: 'after', components: [{ id: 'n', type: 'text_block' }] }])), ['a', 'b', 'n', 'c']);
  assert.deepEqual(ids(applyMutations(spec, [{ op: 'add', target_id: 'nope', components: [{ id: 'n', type: 'text_block' }] }])), ['a', 'b', 'c', 'n']);
  // remove / update.
  assert.deepEqual(ids(applyMutations(spec, [{ op: 'remove', target_id: 'b' }])), ['a', 'c']);
  const updated = applyMutations(spec, [{ op: 'update', target_id: 'a', data_patch: { text: 'A2', tone: 'direct' } }]);
  assert.deepEqual(updated.components[0].data, { text: 'A2', tone: 'direct' }, 'a shallow merge, as the store does');
  // Sequence applies in order.
  assert.deepEqual(ids(applyMutations(spec, [{ op: 'remove', target_id: 'a' }, { op: 'add', target_id: 'c', position: 'after', components: [{ id: 'd', type: 'text_block' }] }])), ['b', 'c', 'd']);
});

test('canvas controls — the wire is the web\'s: body shapes for action and persist', async () => {
  const { Api } = await import('../src/transport/api');
  const posts: Array<[string, unknown]> = [];
  const api = new Api({ get: async () => ({ ok: true, status: 200, data: {} }), post: async (path: string, body: unknown) => { posts.push([path, body]); return { ok: true, status: 200, data: {} }; } } as never);
  await api.executeCompositionAction('comp-1', 'linkedin_confirm_abc', 'resolve_linkedin', { card_id: 'abc', resolve_action: 'confirm' });
  await api.persistCompositionMutations('comp-1', [{ op: 'remove', target_id: 'x' }]);
  assert.deepEqual(posts, [
    ['/composition/action', { composition_id: 'comp-1', component_id: 'linkedin_confirm_abc', action: 'resolve_linkedin', params: { card_id: 'abc', resolve_action: 'confirm' } }],
    ['/composition/mutate', { composition_id: 'comp-1', mutations: [{ op: 'remove', target_id: 'x' }] }],
  ]);
});

function makeActionHost() {
  const runs: Array<[string, string, unknown]> = [];
  let answer: { ok: boolean; message?: string } = { ok: true };
  const interactions: Array<[string, unknown]> = [];
  const host = { run: async (c: string, a: string, p: unknown) => { runs.push([c, a, p]); return answer; }, interact: async (c: string, spec: unknown) => { interactions.push([c, spec]); } };
  return { host, runs, interactions, setAnswer: (a: typeof answer) => { answer = a; } };
}

test('canvas controls — "Is this the right person?" is now ANSWERABLE: the LinkedIn card\'s two buttons', async () => {
  const { renderComponentActions } = await import('../src/views/canvasActions');
  const { host, runs } = makeActionHost();
  // Exactly what CompositionSpecBuilder injects (2026-08-28 screenshot).
  const card = { id: 'linkedin_confirm_7d3e1a', type: 'prepared_content', data: {
    title: 'LinkedIn Match Found', content: '**Tankmouri**\n\n_VP Product at MeridianAI_\n\nIs this the right person?', format: 'markdown', readonly: true,
    channel_actions: [
      { label: '\u2713 Confirm Match', action: 'resolve_linkedin', params: { card_id: '7d3e1a', resolve_action: 'confirm' } },
      { label: '\u2717 Not this person', action: 'resolve_linkedin', params: { card_id: '7d3e1a', resolve_action: 'reject' } },
    ],
  } };
  const parent = new FakeEl('div');
  assert.equal(renderComponentActions(parent as never, card, host), true, 'controls rendered');
  const texts = parent.visibleTexts().join(' | ');
  assert.match(texts, /\u2713 Confirm Match/); assert.match(texts, /\u2717 Not this person/);

  assert.ok(await parent.click('\u2713 Confirm Match'));
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(runs, [['linkedin_confirm_7d3e1a', 'resolve_linkedin', { card_id: '7d3e1a', resolve_action: 'confirm' }]], 'component id, action, params — the web\'s exact call');
  assert.match(parent.visibleTexts().join(' '), /done \u2713/, 'and the row says it landed');
  const buttons = [...parent.walk()].filter((e) => e.tag === 'button');
  assert.ok(buttons.every((b) => b.disabled), 'buttons stay down after success — the card is about to be replaced');
});

test('canvas controls — a failed press is SAID and the buttons come back', async () => {
  const { renderComponentActions } = await import('../src/views/canvasActions');
  const { host, setAnswer } = makeActionHost();
  setAnswer({ ok: false, message: 'Composition not found' });
  const parent = new FakeEl('div');
  renderComponentActions(parent as never, { id: 'k', type: 'action_controls', data: { actions: [{ label: 'Draft a note', action: 'draft_message', priority: 'high' }] } }, host);
  assert.ok(await parent.click('Draft a note'));
  await new Promise((r) => setTimeout(r, 0));
  assert.match(parent.visibleTexts().join(' '), /Composition not found/);
  assert.ok([...parent.walk()].filter((e) => e.tag === 'button').every((b) => !b.disabled), 're-enabled for another try');
});

test('canvas controls — decision options, disambiguation candidates, and the input field send the web\'s params', async () => {
  const { renderComponentActions, controlsOf } = await import('../src/views/canvasActions');
  const { host, runs } = makeActionHost();

  const decision = { id: 'd', type: 'decision_frame', variant: 'options', data: { question: 'Raise it?', options: [{ label: 'Yes', description: 'x', recommended: true }, { label: 'Wait', description: 'y' }] } };
  const p1 = new FakeEl('div'); renderComponentActions(p1 as never, decision, host);
  assert.ok(await p1.click('Wait')); await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(runs.at(-1), ['d', 'select_option', { option_index: 1, option_label: 'Wait' }]);

  const who = { id: 'w', type: 'person_disambiguation', data: { query_name: 'Sam', candidates: [{ relationship_id: 'r-2', name: 'Sam Okafor' }, { relationship_id: 'r-3', name: 'Samantha Liu' }] } };
  const p2 = new FakeEl('div'); renderComponentActions(p2 as never, who, host);
  assert.ok(await p2.click('\u2713 Sam Okafor')); await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(runs.at(-1), ['w', 'resolve_person', { type: 'confirm', relationship_id: 'r-2', person_name: 'Sam Okafor' }]);
  const p3 = new FakeEl('div'); renderComponentActions(p3 as never, who, host);
  assert.ok(await p3.click('None of these')); await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(runs.at(-1), ['w', 'resolve_person', { type: 'reject_all' }]);

  const manual = { id: 'm', type: 'prepared_content', data: { content: 'Paste their LinkedIn', input_field: { action: 'resolve_linkedin', params: { card_id: 'c9', resolve_action: 'manual_url' }, param_name: 'linkedin_url', validate: 'linkedin_url', submit_label: 'Use this profile' } } };
  const p4 = new FakeEl('div'); renderComponentActions(p4 as never, manual, host);
  const field = [...p4.walk()].find((e) => e.tag === 'input')!;
  field.value = 'not a url';
  assert.ok(await p4.click('Use this profile')); await new Promise((r) => setTimeout(r, 0));
  assert.match(p4.visibleTexts().join(' '), /LinkedIn profile URL/, 'validated before it is sent');
  field.value = 'https://www.linkedin.com/in/tankmouri';
  await p4.click('Use this profile'); await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(runs.at(-1), ['m', 'resolve_linkedin', { card_id: 'c9', resolve_action: 'manual_url', linkedin_url: 'https://www.linkedin.com/in/tankmouri' }], 'static params merged with the typed value under param_name');

  // Prose-only components render NO controls — nothing invented.
  for (const quiet of [{ id: 't', type: 'text_block', data: { text: 'hi' } }, { id: 'c', type: 'chart', data: {} }, { id: 'ms', type: 'decision_frame', variant: 'multi_select', data: { options: [{ label: 'a' }] } }]) {
    assert.deepEqual(controlsOf(quiet as never), { buttons: [], input: null }, quiet.type);
  }
});

test('compositionFlow — the pane reads in the note\'s order, containers first with their children', async () => {
  const { compositionFlow, buildCompositionMarkdown } = await import('../src/vault/myuFiles');
  const spec = { id: 'c', components: [
    { id: 'x', type: 'text_block', data: { text: 'ungrouped' } },
    { id: 'p1', type: 'person_card', data: { name: 'Ada' } },
    { id: 'g', type: 'container', data: { label: 'The room', child_ids: ['p1'] } },
  ] };
  assert.deepEqual(compositionFlow(spec).map((e) => `${e.component.id}@${e.depth}`), ['g@2', 'p1@3', 'x@2']);
  // And the note is built from the same order.
  const md = buildCompositionMarkdown(spec);
  assert.ok(md.indexOf('The room') < md.indexOf('Ada') && md.indexOf('Ada') < md.indexOf('ungrouped'));
});

// ── the canvas pane's "always keep" switch ──────────────────────────────────

test('canvas footer — switch OFF: the save button shows; switch ON: it does not, and the switch stays on', async () => {
  const { renderCanvasFooter } = await import('../src/views/canvasFooter');
  const calls: string[] = [];
  const host = { onToggle: (v: boolean) => calls.push(`toggle:${v}`), onSave: () => calls.push('save') };

  const off = new FakeEl('div');
  renderCanvasFooter(off as never, { autoKeep: false }, host);
  assert.ok(await off.click('Save to my vault'), 'off → the per-save button is there');
  assert.deepEqual(calls, ['save']);

  const on = new FakeEl('div');
  renderCanvasFooter(on as never, { autoKeep: true, keptPath: 'Myu/Canvas/2026-08-29 Team read.canvas' }, host);
  assert.ok(!(await on.click('Save to my vault')), 'on → no per-save button');
  assert.match(on.visibleTexts().join(' '), /Always keep in my vault/, 'the switch is still shown');
  assert.match(on.visibleTexts().join(' '), /kept in Myu\/Canvas\/2026-08-29 Team read\.canvas/, 'and says where the canvas went');

  const broken = new FakeEl('div');
  renderCanvasFooter(broken as never, { autoKeep: true, problem: 'Couldn\u2019t keep this canvas: disk full' }, host);
  assert.match(broken.visibleTexts().join(' '), /disk full/, 'a failed keep is said, never silent');
});

test('auto-keep — turning the switch on asks the exposure question ONCE; dismissing is a no', async () => {
  const { AutoKeepModal } = await import('../src/views/AutoKeepModal');
  const answers: boolean[] = [];
  const yes = new AutoKeepModal({} as never, (k) => answers.push(k)); yes.open();
  const root = yes.contentEl as unknown as FakeEl;
  assert.match(root.visibleTexts().join(' '), /leaves Myu.s reach/, 'the same exposure warning the per-save modal gives');
  assert.match(root.visibleTexts().join(' '), /expire on the server within a day/, 'and why a standing keep is worth it');
  assert.ok(await root.click('Keep every canvas'));
  assert.deepEqual(answers, [true]);

  const no = new AutoKeepModal({} as never, (k) => answers.push(k)); no.open();
  assert.ok(await (no.contentEl as unknown as FakeEl).click('Not now'));
  assert.deepEqual(answers, [true, false]);

  const dismissed = new AutoKeepModal({} as never, (k) => answers.push(k)); dismissed.open(); dismissed.close();
  assert.deepEqual(answers, [true, false, false], 'escape / click-away is a no, answered exactly once');
});

test('chat offer — while always-keep is on, the offer row drops its save button (opening keeps it)', async () => {
  const { renderChatBlock } = await import('../src/views/chatBlocks');
  const base = { app: {}, component: {}, openCanvas: () => undefined, saveCanvas: () => undefined, webOrigin: 'https://x' };
  const off = new FakeEl('div');
  renderChatBlock(off as never, { type: 'composition_offer', composition_id: 'c', summary_text: 'x' }, base as never);
  assert.ok(await off.click('Save to vault'));
  const on = new FakeEl('div');
  renderChatBlock(on as never, { type: 'composition_offer', composition_id: 'c', summary_text: 'x' }, { ...base, autoKeep: true } as never);
  assert.ok(!(await on.click('Save to vault')));
  assert.ok(await on.click('Open canvas'), 'open stays');
});

test('always-keep from outside the pane — once per composition per session, and only while the switch is on', async () => {
  const { shouldKeepCanvas } = await import('../src/composition/keepOnce');
  const seen = new Set<string>();
  assert.equal(shouldKeepCanvas(false, 'comp-1', seen), false, 'switch off → never');
  assert.equal(seen.size, 0, 'and nothing is remembered');
  assert.equal(shouldKeepCanvas(true, 'comp-1', seen), true, 'first sight → keep');
  assert.equal(shouldKeepCanvas(true, 'comp-1', seen), false, 'the SSE event AND the chat offer for the same id → one keep');
  assert.equal(shouldKeepCanvas(true, 'comp-2', seen), true, 'a new composition → keep');
  for (const junk of [undefined, null, '', 42, {}]) assert.equal(shouldKeepCanvas(true, junk, seen), false, `no id → nothing: ${String(junk)}`);
});

// ── tier A of the web's toasts, as Notices ──────────────────────────────────

test('live notices — the web\'s account/session toasts, word for word, from the events the backend actually emits', async () => {
  const { liveNoticeFor, LIVE_NOTICE_EVENTS } = await import('../src/liveNotices');
  const me = 'acct-1';
  // Payload fields from EventService: DEVICE_TRANSFER_PENDING {request_id, device_name, verification_code}.
  const pending = liveNoticeFor('DEVICE_TRANSFER_PENDING', { request_id: 'r1', device_name: 'Masumi\u2019s MacBook' }, me);
  assert.deepEqual(pending, { title: 'New Device Request', body: '\u201cMasumi\u2019s MacBook\u201d wants to join your account', kind: 'info', durationMs: 0, action: 'open_devices' });
  assert.deepEqual(liveNoticeFor('DEVICE_TRANSFER_COMPLETED', { new_device_name: 'iPhone' }, me), { title: 'Transfer Completed', body: '\u201ciPhone\u201d was added by another device', kind: 'info' });
  assert.deepEqual(liveNoticeFor('DEVICE_TRANSFER_DENIED', { request_id: 'r1' }, me), { title: 'Transfer Denied', body: 'The device transfer was denied', kind: 'error' });
  // logout is broadcast with the account id as content; only OURS acts.
  assert.equal(liveNoticeFor('logout', { content: 'someone-else' }, me), null, 'another account\'s logout is ignored');
  assert.equal(liveNoticeFor('logout', {}, me), null);
  assert.equal(liveNoticeFor('logout', { content: me }, me)?.title, 'Logged Out');
  assert.equal(liveNoticeFor('logout', { content: me }, me)?.durationMs, 0, 'stays until read');
  // server-authored toast: content OR message; persistent → 0; duration honoured.
  assert.deepEqual(liveNoticeFor('toast', { title: 'Employees loaded', message: '12 found', type: 'success', duration: 3000 }, me), { title: 'Employees loaded', body: '12 found', kind: 'success', durationMs: 3000 });
  assert.deepEqual(liveNoticeFor('toast', { content: 'Just text', persistent: true }, me), { title: 'Just text', body: undefined, kind: 'info', durationMs: 0 });
  assert.equal(liveNoticeFor('toast', {}, me), null, 'an empty toast is nothing');
  assert.deepEqual(liveNoticeFor('career_position_update', { role_title: 'VP Eng', company_name: 'Acme' }, me), { title: 'Career position updated', body: 'VP Eng at Acme', kind: 'info' });
  assert.equal(liveNoticeFor('career_prediction_ready', { summary: 'x'.repeat(80) }, me)?.body, 'x'.repeat(57) + '...');
  assert.equal(liveNoticeFor('burnout_warning', { title: 'Burnout' }, me), null, 'initiative cards are NOT notices (invariant 4)');
  assert.ok(!LIVE_NOTICE_EVENTS.includes('DEVICE_TRANSFER_APPROVED' as never), 'not subscribed: the backend never emits it');
});

test('live notices — registration subscribes every tier-A event and routes logout to custody', async () => {
  const { registerLiveNotices, LIVE_NOTICE_EVENTS } = await import('../src/liveNotices');
  const handlers = new Map<string, (p: Record<string, unknown>) => void>();
  const shown: string[] = []; let logouts = 0; let devices = 0;
  registerLiveNotices((t, h) => { handlers.set(t, h); }, {
    accountId: () => 'acct-1', notify: (n) => shown.push(n.title), openDevices: () => devices++, onRemoteLogout: () => logouts++,
  });
  assert.deepEqual([...handlers.keys()].sort(), [...LIVE_NOTICE_EVENTS].sort());
  handlers.get('DEVICE_TRANSFER_PENDING')!({ device_name: 'X' });
  handlers.get('logout')!({ content: 'not-me' });
  handlers.get('logout')!({ content: 'acct-1' });
  assert.deepEqual(shown, ['New Device Request', 'Logged Out']);
  assert.equal(logouts, 1, 'only our own logout forgets custody');
});

test('notifyLive — one Notice, title and body, persistent when asked', async () => {
  const { notifyLive } = await import('../src/notify');
  notices.length = 0;
  notifyLive({ title: 'New Device Request', body: '\u201cX\u201d wants to join', kind: 'info', durationMs: 0 });
  assert.deepEqual(notices, ['New Device Request \u2014 \u201cX\u201d wants to join'], 'outside a DOM the fragment degrades to one line');
});

test('citations — references survive both wire shapes and render as the web\'s Sources footer', async () => {
  const { parseChatTurn } = await import('../src/transport/api');
  const { renderReferences } = await import('../src/views/chatBlocks');
  const { renderConversation } = await import('../src/vault/ConversationWriter');
  const refs = [{ id: 1, title: 'Acme raises Series B', url: 'https://news.example/acme', source_type: 'news' }, { id: 2, title: 'Marcus Webb', url: 'https://linkedin.com/in/marcus', source_type: 'linkedin_profile' }];
  // Live: references lifted to a sibling of the blocks array.
  const live = parseChatTurn({ journal_id: 'j', content: [{ type: 'conversational', text: 'Acme just raised [1]; Marcus led it [2].' }], references: refs });
  assert.deepEqual(live.references, refs);
  // Stored: inside the JSON the reply was persisted as.
  const stored = parseChatTurn({ content: JSON.stringify({ content: [{ type: 'conversational', text: 'x [1]' }], references: [refs[0]] }) });
  assert.deepEqual(stored.references, [refs[0]]);
  assert.equal(parseChatTurn({ content: JSON.stringify({ content: [{ type: 'conversational', text: 'plain' }] }) }).references, undefined, 'none → undefined, not []');

  const el = new FakeEl('div');
  renderReferences(el as never, refs);
  const text = el.visibleTexts().join(' ');
  assert.match(text, /Sources/);
  assert.match(text, /\[1\].*Acme raises Series B/);
  assert.match(text, /\[2\].*Marcus Webb/);
  assert.equal([...el.walk()].filter((e) => e.tag === 'a').length, 2, 'titles are links');

  const md = renderConversation([{ role: 'myu', blocks: [{ type: 'conversational', text: 'Acme raised [1].' }], references: [refs[0]] }]);
  assert.match(md!, /> \[1\] \[Acme raises Series B\]\(https:\/\/news\.example\/acme\)/, 'the saved note keeps the source under the reply');
});

// ── the parity pass (2026-08-29): chat blocks, scenes, related entries, notes ─

test('chat blocks — every type in the web\'s registry renders as markdown; board deliberation keeps the web\'s headings', async () => {
  const { chatBlockMarkdown } = await import('../src/views/chatBlocks');
  const md = (b: Record<string, unknown>) => chatBlockMarkdown(b as never) ?? '';
  assert.equal(md({ type: 'conversational', text: 'Hi **there**' }), 'Hi **there**');
  assert.equal(md({ type: 'text', text: 'plain' }), 'plain');
  assert.equal(md({ type: 'question', text: 'Raise it?', options: ['Yes', 'Wait'] }), '> Raise it?\n\n- Yes\n- Wait');
  assert.equal(md({ type: 'suggestion', text: 'Ask Dana first' }), '\u2192 Ask Dana first');
  assert.equal(md({ type: 'insight_card', title: 'Cadence broke', summary: 'Three cancelled.', priority: 'high' }), '**Cadence broke**\n\nThree cancelled.');
  assert.equal(md({ type: 'action_card', title: 'Send the plan', description: 'Before Thursday.', due_date: '2026-09-04', related_people: ['Marcus Webb'] }), '**Send the plan**\nBefore Thursday.\n- due 2026-09-04\n- with Marcus Webb');
  assert.equal(md({ type: 'data_table', title: 'Firms', columns: [{ key: 'firm', label: 'Firm' }, { key: 'fee', label: 'Fee' }], rows: [{ firm: 'Cooley', fee: 'fixed' }] }), '**Firms**\n\n| Firm | Fee |\n| --- | --- |\n| Cooley | fixed |');
  assert.equal(md({ type: 'quick_stats', stats: [{ label: 'Replies', value: 9, trend_label: 'up' }] }), '- **Replies** \u2014 9 *(up)*');
  assert.equal(md({ type: 'chart', title: 'Latency', data: { labels: ['w1', 'w2'], datasets: [{ label: 'days', data: [1, 9] }] } }), '**Latency**\n\n|  | days |\n| --- | --- |\n| w1 | 1 |\n| w2 | 9 |');
  assert.equal(md({ type: 'diagram', source: 'graph TD; A-->B;', caption: 'the loop' }), '```mermaid\ngraph TD; A-->B;\n```\n\n*the loop*');
  assert.equal(md({ type: 'separator', label: 'later' }), '---\n*later*');
  // board_deliberation: {advisors[{advisor_type, content, to}], synthesis{agreements, tensions, crux, next_steps}, gut_check}
  const board = md({ type: 'board_deliberation', advisors: [{ advisor_type: 'mentor', content: 'It might be load.' }, { advisor_type: 'strategist', content: 'The offsite is your deadline.', to: 'you' }], synthesis: { agreements: ['Ask him directly'], tensions: ['Timing'], crux: 'Silence is not a verdict.', next_steps: ['Book 30 min'] }, gut_check: 'What are you afraid he will say?' });
  for (const h of ['### Your Board Weighs In', '**Mentor**', 'It might be load.', '**Strategist** \u2192 you', '**Points of Agreement**', '- Ask him directly', '**Key Tensions**', '**The bottom line**', 'Silence is not a verdict.', '**Suggested Next Steps**', '- Book 30 min', '> [!question] Gut Check']) {
    assert.ok(board.includes(h), `board block carries ${h}`);
  }
  assert.ok(board.indexOf('Your Board') < board.indexOf('Points of Agreement') && board.indexOf('Points of Agreement') < board.indexOf('Gut Check'), 'same order as the web');
  // Unknown type with data: the canvas renderer's floor, never a silent drop.
  assert.match(md({ type: 'trust_arc', standing: 'holding' }), /Standing.*holding/);
  assert.equal(chatBlockMarkdown({ type: 'separator_of_nothing' } as never), null, 'unknown and empty → nothing, not junk');
});

test('scenes — the pane and the note read a scened composition the way the web\'s full canvas groups it', async () => {
  const { compositionFlow, buildCompositionMarkdown } = await import('../src/vault/myuFiles');
  const spec = {
    id: 'c',
    components: [
      { id: 'a', type: 'text_block', data: { text: 'overview' } },
      { id: 'b', type: 'person_card', data: { name: 'Ada' } },
      { id: 'g', type: 'container', data: { label: 'The room', child_ids: ['b'] } },
      { id: 'z', type: 'text_block', data: { text: 'unclaimed' } },
    ],
    scenes: [{ id: 's1', label: 'Where things stand', component_ids: ['a'] }, { id: 's2', label: 'People', component_ids: ['g', 'b'] }],
  };
  const flow = compositionFlow(spec).map((e) => ('scene' in e ? `#${e.scene}` : `${e.component.id}@${e.depth}`));
  assert.deepEqual(flow, ['#Where things stand', 'a@3', '#People', 'g@3', 'b@4', 'z@2'], 'scenes first, in order; a container inside a scene keeps its child; the unclaimed component last');
  const md = buildCompositionMarkdown(spec);
  assert.ok(md.indexOf('## Where things stand') < md.indexOf('overview') && md.indexOf('## People') < md.indexOf('Ada') && md.indexOf('Ada') < md.indexOf('unclaimed'));
  // No scenes → unchanged behaviour.
  assert.deepEqual(compositionFlow({ id: 'c', components: spec.components }).map((e) => ('scene' in e ? '#' : e.component.id)), ['g', 'b', 'a', 'z']);
});

test('related entries — a first reply\'s similar journal entries are carried and rendered as openable rows', async () => {
  const { parseChatTurn } = await import('../src/transport/api');
  const { renderRelatedEntries } = await import('../src/views/chatBlocks');
  const parsed = parseChatTurn({ journal_id: 'j9', content: [{ type: 'conversational', text: 'x' }], similar_entries: [{ journal_id: 'j1', content_preview: 'the law firm search' }, { nope: true }] });
  assert.deepEqual(parsed.similar_entries, [{ journal_id: 'j1', content_preview: 'the law firm search' }], 'rows without an id are dropped');
  const opened: string[] = [];
  const el = new FakeEl('div');
  renderRelatedEntries(el as never, parsed.similar_entries, (id) => opened.push(id));
  assert.match(el.visibleTexts().join(' '), /Related entries.*the law firm search/);
  assert.ok(await el.click('the law firm search'));
  assert.deepEqual(opened, ['j1'], 'opens that conversation in place — no browser');
});

test('notes — people carry last_interaction for the Base; companies drop titled-but-empty sections', async () => {
  const { buildPersonMarkdown, buildCompanyMarkdown } = await import('../src/vault/myuFiles');
  const person = buildPersonMarkdown({ entity_type: 'person', entity_id: 'r1', display_name: 'Adam Rosen', item_count: 0, top_urgency: 'low', last_contact: '2026-08-02T10:00:00Z' }, null, [], () => false, null, []);
  assert.match(person, /^last_interaction: 2026-08-02$/m, 'People.base\'s "Days quiet" reads this — it was never written before');
  const company = buildCompanyMarkdown(
    { entity_type: 'company', entity_id: 'Ally', display_name: 'Ally', item_count: 0, top_urgency: 'low' },
    { sections: [{ title: "What's happening", narrative: 'Quiet quarter.' }, { title: "What's happening here" }, { title: 'Your people here', items: [] }] } as never,
    ['Jenny'],
  );
  assert.match(company, /## What's happening\n\nQuiet quarter\./);
  assert.ok(!/What's happening here|Your people here/.test(company), 'empty titled sections are not bare headings');
  // The people list is a LIVE embedded base filtered to this note, not a static list.
  assert.match(company, /## People\n\n```base\n/, 'an embedded base');
  assert.match(company, /company == this/, 'filtered to the people whose company links HERE');
  assert.match(company, /file\.inFolder\("Myu\/People"\)/);
  assert.ok(!/- \[\[Jenny\]\]/.test(company), 'no hand-written list to go stale');
});

test('notes — company is a QUOTED wikilink in person frontmatter; people with nothing known say so once; Companies.base exists', async () => {
  const { buildPersonMarkdown, buildCompaniesBase } = await import('../src/vault/myuFiles');
  const known = buildPersonMarkdown({ entity_type: 'person', entity_id: 'r2', display_name: 'Priya Raman', organization: 'Northwind', subtitle: 'VP Engineering', item_count: 0, top_urgency: 'low' }, null, [], () => false, null, []);
  assert.match(known, /^company: "\[\[Northwind\]\]"$/m, 'a Link for Bases and the graph — QUOTED, or YAML reads a nested list');
  assert.match(known, /^role: VP Engineering$/m);
  const blank = buildPersonMarkdown({ entity_type: 'person', entity_id: 'r1', display_name: 'Adam Rosen', item_count: 0, top_urgency: 'low' }, { sections: [{ title: 'How things are' }, { title: 'Open threads', items: [] }, { title: 'Bridges' }] } as never, [], () => false, null, []);
  assert.ok(!/^## /m.test(blank), 'five empty headings are not a page');
  assert.match(blank, /Nothing here yet/, 'it says so, once');
  const base = buildCompaniesBase('Myu/Companies');
  assert.match(base, /file\.inFolder\("Myu\/Companies"\)/);
  assert.match(base, /type == "myu-company"/);
  assert.match(base, /name: Companies/);
});

// ── person actions: merge, this is me ───────────────────────────────────────

test('person actions — merge candidates follow the web\'s rule; the wire is the web\'s; the confirms say what happens', async () => {
  const { mergeCandidates, PERSON_ACTION_COPY } = await import('../src/views/personActions');
  const { PersonActionConfirmModal } = await import('../src/views/PersonActionConfirmModal');
  const { Api } = await import('../src/transport/api');
  const people = [
    { entity_type: 'person', entity_id: 'p1', display_name: 'Marcus Webb', item_count: 0, top_urgency: 'low' },
    { entity_type: 'person', entity_id: 'p2', display_name: 'Marcus W.', item_count: 0, top_urgency: 'low' },
    { entity_type: 'self', entity_id: 'me', display_name: 'Masumi', item_count: 0, top_urgency: 'low' },
    { entity_type: 'company', entity_id: 'c1', display_name: 'Acme', item_count: 0, top_urgency: 'low' },
  ] as never[];
  assert.deepEqual(mergeCandidates(people, 'p2').map((e: { entity_id: string }) => e.entity_id), ['p1'], 'persons only, never self, never the source');

  const posts: Array<[string, unknown]> = [];
  const api = new Api({ get: async () => ({ ok: true, status: 200, data: {} }), post: async (path: string, body: unknown) => { posts.push([path, body]); return { ok: true, status: 200, data: {} }; } } as never);
  await api.mergeRelationships('p2', 'p1');
  await api.markRelationshipAsSelf('p9');
  assert.deepEqual(posts, [
    ['/v2/relationships/merge', { source_id: 'p2', target_id: 'p1', reason: 'user_initiated_merge' }],
    ['/experiments/relationships/mark-as-self', { relationship_id: 'p9' }],
  ]);

  const answers: boolean[] = [];
  const m = new PersonActionConfirmModal({} as never, PERSON_ACTION_COPY.self('Marcus Webb'), (y) => answers.push(y)); m.open();
  const text = (m.contentEl as unknown as FakeEl).visibleTexts().join(' ');
  assert.match(text, /Marcus Webb is you\?/);
  assert.match(text, /becomes part of you/, 'says what happens: the person folds into the self');
  assert.ok(!/not folded|not yet recognised/.test(text), 'the pre-fix disclaimer is gone (backend fix deployed, operator 2026-08-29)');
  assert.ok(await (m.contentEl as unknown as FakeEl).click('Yes, that\u2019s me'));
  const m2 = new PersonActionConfirmModal({} as never, PERSON_ACTION_COPY.merge('Marcus W.', 'Marcus Webb'), (y) => answers.push(y)); m2.open(); m2.close();
  assert.deepEqual(answers, [true, false], 'dismissing a confirm is a no, once');
  assert.match(PERSON_ACTION_COPY.merge('A', 'B').body, /goes to the trash/, 'the vault consequence is named');
});


// ── what survives, and how to take it all with you (2026-08-29) ─────────────

test('conversations — one loader for the browser and the export: heads newest first, turns typed by envelope', async () => {
  const { listConversations, loadConversation } = await import('../src/conversations');
  const backend = {
    getJournalEntries: async () => ({ ok: true, status: 200, data: { entries: [
      { journal_id: 'j-old', content: 'the older one', created_at: '2026-08-01T10:00:00Z' },
      { journal_id: 'j-new', content: 'so this whole shopping for a law firm', created_at: '2026-08-20T10:00:00Z' },
      { journal_id: 'j-empty', content: '   ', created_at: '2026-08-21T10:00:00Z' },
      { content: 'no id at all', created_at: '2026-08-22T10:00:00Z' },
    ] } }),
    getJournalChats: async (id: string) => ({ ok: true, status: 200, data: { chats: id === 'j-new' ? [
      { content: 'tell me more' },
      { content: JSON.stringify({ content: [{ type: 'conversational', text: 'Here is your checklist.' }], references: [{ title: 'Your note', url: 'x' }] }) },
    ] : [] } }),
  };
  const deps = { backend: backend as never, key: null, accountId: 'acct' };
  const heads = await listConversations(deps);
  assert.deepEqual(heads.map((h) => h.journalId), ['j-new', 'j-old'], 'newest first; blank and id-less entries dropped');
  assert.equal(heads[0]!.day, '2026-08-20');
  const turns = await loadConversation(deps, 'j-new', heads[0]);
  assert.equal(turns.length, 3);
  assert.equal(turns[0]!.role, 'user'); assert.match(turns[0]!.text ?? '', /^\(2026-08-20\) so this whole/);
  assert.equal(turns[1]!.role, 'user'); assert.equal(turns[1]!.text, 'tell me more');
  assert.equal(turns[2]!.role, 'myu'); assert.equal(turns[2]!.blocks?.[0]?.type, 'conversational');
  assert.equal(turns[2]!.references?.[0]?.title, 'Your note', 'citations survive the resume path');
  assert.deepEqual(await listConversations({ ...deps, accountId: null }), [], 'no account, no list — never a throw');
});

test('conversation writer — a note remembers its journal id, and the export skips what is already here', async () => {
  const { ConversationWriter } = await import('../src/vault/ConversationWriter');
  const files: Record<string, string> = {};
  const app = {
    vault: {
      getAbstractFileByPath: (p: string) => (p in files || p === 'Myu' || p === 'Myu/Conversations' ? {} : null),
      createFolder: async () => undefined,
      create: async (p: string, s: string) => { files[p] = s; },
      getMarkdownFiles: () => Object.keys(files).map((path) => ({ path })),
    },
    metadataCache: { getFileCache: (f: { path: string }) => ({ frontmatter: { 'myu-journal-id': (files[f.path]?.match(/^myu-journal-id: (.*)$/m) ?? [])[1] } }) },
  };
  const w = new ConversationWriter(app as never);
  assert.equal(w.hasNoteFor('j-1'), false);
  const out = await w.write([{ role: 'user', text: 'hello there' }, { role: 'myu', blocks: [{ type: 'conversational', text: 'Hi.' }] }], { journalId: 'j-1', date: '2026-08-20' });
  assert.equal(out.status, 'written');
  const [path, body] = Object.entries(files)[0]!;
  assert.match(path, /^Myu\/Conversations\/2026-08-20 /, 'dated by the conversation, not by today');
  assert.match(body, /^myu-generated: true\nmyu-journal-id: j-1\ndate: 2026-08-20$/m);
  assert.equal(w.hasNoteFor('j-1'), true, 'found by frontmatter, so the export never writes it twice');
  assert.equal(w.hasNoteFor('j-2'), false);
});

test('export manifest — a receipt that says what landed, what could not, and what uninstalling does', async () => {
  const { buildExportManifest } = await import('../src/vault/myuFiles');
  const md = buildExportManifest({
    date: '2026-08-29', people: 12,
    conversations: { saved: 3, alreadyThere: 5, failed: 1 },
    canvases: { kept: 2, expired: 4, failed: 0 },
    surfaces: ['**Me** → `Myu/Me.md`'],
  });
  assert.match(md, /^type: myu-export$/m); assert.match(md, /^myu-generated: true$/m);
  assert.match(md, /3 saved, 5 already here, 1 could not be read/);
  assert.match(md, /2 kept, 4 expired on the server and cannot be fetched/);
  assert.match(md, /## What is not here[\s\S]*account[\s\S]*Request my data archive/, 'the account is named as NOT vault material, with the door to it');
  assert.match(md, /## If you uninstall[\s\S]*stays exactly as it is/, 'the statement lives in the vault, not only in a README');
  assert.match(md, /data\.json[\s\S]*goes with it/, 'and says what leaves: the plugin token and wrapped key');
  const one = buildExportManifest({ date: 'd', people: 1, conversations: { saved: 0, alreadyThere: 0, failed: 0 }, canvases: { kept: 0, expired: 0, failed: 0 }, surfaces: [] });
  assert.match(one, /1 page written/); assert.ok(!/already here|could not|expired/.test(one), 'zero counts are not narrated');
});

test('data archive — the web\'s Download-your-data, from the vault: POST, passphrase once, refusal said', async () => {
  const { DataExportModal } = await import('../src/views/DataExportModal');
  const { Api } = await import('../src/transport/api');
  const posts: Array<[string, unknown]> = [];
  const api = new Api({ get: async () => ({ ok: true, status: 200, data: {} }), post: async (path: string, body: unknown) => { posts.push([path, body]); return { ok: true, status: 200, data: { success: true, export_id: 'e1', passphrase: 'orbit velvet cinder maple' } }; } } as never);
  await api.requestDataExport();
  assert.deepEqual(posts, [['/account/data/export-request', {}]], 'the web\'s endpoint, verbatim');

  const ok = new DataExportModal({} as never, { backend: api } as never); ok.open();
  const root = ok.contentEl as unknown as FakeEl;
  assert.match(root.visibleTexts().join(' '), /One request per day/, 'the rate limit is said before the click');
  assert.ok(await root.click('Request my archive'));
  await new Promise((r) => setTimeout(r, 0));
  const shown = root.visibleTexts().join(' ');
  assert.match(shown, /shown only once/); 
  for (const word of ['orbit', 'velvet', 'cinder', 'maple']) assert.ok(shown.includes(word), `passphrase word ${word} is on screen`);
  assert.ok(await root.click('Copy passphrase'));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(clipboard.text, 'orbit velvet cinder maple');
  ok.close();

  const limited = new Api({ get: async () => ({ ok: true, status: 200, data: {} }), post: async () => ({ ok: false, status: 429, error: 'Rate limited', data: { message: 'You can request an export once every 24 hours.' } }) } as never);
  const no = new DataExportModal({} as never, { backend: limited } as never); no.open();
  const nroot = no.contentEl as unknown as FakeEl;
  assert.ok(await nroot.click('Request my archive'));
  await new Promise((r) => setTimeout(r, 0));
  assert.match(nroot.visibleTexts().join(' '), /once every 24 hours/, 'the server\'s reason, not a generic shrug');
  assert.ok(!/orbit/.test(nroot.visibleTexts().join(' ')));
  no.close();
});

test('sync on open — on by default, an old data.json inherits on, and off is a real off', async () => {
  const { DEFAULT_SETTINGS, normalizeSettings } = await import('../src/settings');
  assert.equal(DEFAULT_SETTINGS.sync_on_open, true);
  assert.equal(normalizeSettings({ base_url: 'x' }).sync_on_open, true, 'a pre-switch data.json keeps syncing, as it always did');
  assert.equal(normalizeSettings({ sync_on_open: false }).sync_on_open, false);
  const fs = await import('node:fs/promises');
  const src = await fs.readFile('src/main.ts', 'utf8');
  assert.match(src, /if \(!this\.settings\.sync_on_open\) return;/, 'the open-time sync is gated by the switch');
  assert.match(src, /async syncNow\(\)/, 'and the button has its own path that ignores the switch');
  const today = await fs.readFile('src/views/TodayView.ts', 'utf8');
  assert.match(today, /'aria-label': 'Sync everything from Myu now'/, 'the sync button lives in Today, not only in settings');
});

test('settings (1.13) — a section renders INSIDE its definitions row; nothing beside it survives mount', async () => {
  // The 1.13.7 runtime reconciles the group list to its own rows after
  // render() — build 135 painted seven empty boxes for exactly this reason.
  const { mountInRow, SECTION_CLASS } = await import('../src/views/settingsMount');
  const host = new FakeEl('div');
  const row = host.createDiv({ cls: 'setting-item' });
  row.createDiv({ text: 'Connection', cls: 'setting-item-name' });
  const cleanup = mountInRow({ settingEl: row } as never, (root) => { root.createDiv({ text: 'Signed in as you' }); root.createDiv({ text: 'Devices' }); });
  assert.ok(!row.classes.has('setting-item') && row.classes.has(SECTION_CLASS), 'the row becomes the section container');
  assert.deepEqual(row.visibleTexts(), ['Signed in as you', 'Devices'], 'the bare row name is gone; the section is in its place');
  assert.equal(host.children.length, 1, 'nothing appended beside the row');
  cleanup();
  assert.equal(row.children.length, 0, 'cleanup empties the row for the next render');
  const src = await (await import('node:fs/promises')).readFile('src/views/SettingsTab.ts', 'utf8');
  const sections = [...src.matchAll(/section\('([^']+)'|section\("([^"]+)"/g)].map((m) => m[1] ?? m[2]);
  assert.deepEqual(sections, ['Connection', 'What Myu can read', 'Meeting notes', "Myu's folder", 'Weave Myu in', 'Weekly review', 'Account', 'Advanced'], 'every display() section, Account included, is a definition');
  assert.ok(!/settingEl\.parentElement/.test(src), 'no section renders beside its row any more');
  assert.ok(/searchable: false, render: \(setting: Setting\) => mountInRow\(setting, \(root\) => appendBrand\(root, 'myu-brand myu-brand-settings'\)\)/.test(src), 'the brandmark is a definitions item too — 1.13 paints it on open, not only after a legacy repaint');
});

test('reveal a setting — the link lands ON the switch: scrolled, flashed with Obsidian\'s own class, focused', async () => {
  const { revealSetting, FLASH_MS } = await import('../src/views/revealSetting');
  const log: string[] = [];
  const mk = (name: string) => {
    const classes = new Set<string>();
    const control = { focus: () => log.push(`focus:${name}`) };
    return {
      classList: { add: (c: string) => classes.add(c), remove: (c: string) => classes.delete(c) }, classes,
      scrollIntoView: (o: unknown) => log.push(`scroll:${name}:${JSON.stringify(o)}`),
      querySelector: (sel: string) => (sel === '.setting-item-name' ? { textContent: ` ${name} ` } : sel.startsWith('.setting-item-control') ? control : null),
    };
  };
  const rows = [mk('Materialize people'), mk('Sync when the vault opens'), mk('Myu look')];
  const container = { querySelectorAll: () => rows } as unknown as ParentNode;
  const timers: Array<[() => void, number]> = [];
  assert.equal(revealSetting(container, 'Sync when the vault opens', (fn, ms) => timers.push([fn, ms])), true);
  assert.deepEqual(log, ['scroll:Sync when the vault opens:{"block":"center","behavior":"smooth"}', 'focus:Sync when the vault opens']);
  assert.ok(rows[1]!.classes.has('is-flashing') && !rows[0]!.classes.has('is-flashing'), 'only the named row flashes');
  assert.equal(timers[0]![1], FLASH_MS); timers[0]![0]();
  assert.ok(!rows[1]!.classes.has('is-flashing'), 'the flash ends');
  assert.equal(revealSetting(container, 'No such row', () => undefined), false, 'a missing row is reported, not thrown — the caller retries after the tab paints');
  const today = await (await import('node:fs/promises')).readFile('src/views/TodayView.ts', 'utf8');
  assert.match(today, /openSettingsAt\('Sync when the vault opens'\)/, 'the sync whisper targets the row by its exact name');
});

// ── the canvas follows the conversation (2026-08-29) ────────────────────────

test('canvas after a turn — the web\'s handleDualModeResponse, decision for decision', async () => {
  const { canvasAfterTurn } = await import('../src/composition/afterTurn');
  const add = [{ op: 'add', target_id: '', position: 'end', components: [{ id: 'x', type: 'text_block', data: { text: 'hi' } }] }] as never[];
  // Pane shows the canvas the turn continued → apply in place.
  assert.deepEqual(canvasAfterTurn({ composition_id: 'c1', surface_mutations: add }, 'c1'), { kind: 'apply', compositionId: 'c1', mutations: add });
  // narrative_context names the target first, like the web.
  assert.deepEqual(canvasAfterTurn({ composition_id: 'c1', continues_composition_id: 'c1', surface_mutations: add }, 'c1').kind, 'apply');
  // The reply's id differs from the one we named (the chain harness saw this
  // live): apply to the open canvas, then ADOPT the new id — the web's store.
  assert.deepEqual(canvasAfterTurn({ composition_id: 'c2', surface_mutations: add }, 'c1'), { kind: 'apply', compositionId: 'c1', mutations: add, nextId: 'c2' });
  assert.deepEqual(canvasAfterTurn({ composition_id: 'c2' }, 'c1'), { kind: 'open', compositionId: 'c2' }, 'a new id with no mutations: fetch it');
  // narrative_context names a canvas this pane is not showing → show that one.
  assert.deepEqual(canvasAfterTurn({ composition_id: 'c3', continues_composition_id: 'c3', surface_mutations: add }, 'c1'), { kind: 'open', compositionId: 'c3' });
  // Same canvas, nothing changed → nothing happens (no flicker, no refetch).
  assert.deepEqual(canvasAfterTurn({ composition_id: 'c1', surface_mutations: [] }, 'c1'), { kind: 'none' });
  // No pane open: a changed canvas is SAID in the thread, never forced open.
  assert.deepEqual(canvasAfterTurn({ composition_id: 'c1', surface_mutations: add, summary_text: ' Updated ' }, null), { kind: 'offer', compositionId: 'c1', summaryText: 'Updated' });
  assert.deepEqual(canvasAfterTurn({ composition_id: 'c1', surface_mutations: [] }, null), { kind: 'none' }, 'the thread\'s unchanged canvas is not re-offered every turn');
  assert.deepEqual(canvasAfterTurn(undefined, 'c1'), { kind: 'none' });
  assert.deepEqual(canvasAfterTurn({}, null), { kind: 'none' });
});

test('chat wire — the reply\'s canvas side is read, and the request names the open canvas', async () => {
  const { parseChatTurn, Api } = await import('../src/transport/api');
  // The backend's dual-mode envelope, verbatim shape (CreateJournalChat).
  const reply = parseChatTurn({
    success: true, response_type: 'dual_mode', journal_id: 'j1',
    journal: { content: JSON.stringify({ content: [{ type: 'conversational', text: 'Noted.' }] }) },
    canvas: { success: true, response_type: 'mutation', composition_id: 'comp-9', summary_text: 'Updated', surface_mutations: [{ op: 'remove', target_id: 'c3' }], narrative_context: { continues_composition_id: 'comp-9' } },
  });
  assert.equal(reply.blocks[0]?.type, 'conversational');
  assert.deepEqual(reply.canvas, { composition_id: 'comp-9', surface_mutations: [{ op: 'remove', target_id: 'c3' }], summary_text: 'Updated', continues_composition_id: 'comp-9' });
  // An empty canvas side (no id, no mutations) is absent, not a ghost.
  assert.equal(parseChatTurn({ journal: { content: 'plain' }, canvas: { success: true, response_type: 'mutation', composition_id: '', surface_mutations: null } }).canvas, undefined);
  assert.equal(parseChatTurn({ journal: { content: 'plain' } }).canvas, undefined);

  const posts: Array<[string, Record<string, unknown>]> = [];
  const api = new Api({ get: async () => ({ ok: true, status: 200, data: {} }), post: async (path: string, body: Record<string, unknown>) => { posts.push([path, body]); return { ok: true, status: 200, data: { journal: { content: 'ok' } } }; } } as never);
  await api.addChatTurn('a', 'j1', 'hi', undefined, { continuesCompositionId: 'comp-9', surfaceMode: 'dual' });
  await api.addChatTurn('a', 'j1', 'hi');
  await api.createChatEntry('a', 'hi', undefined, undefined, { surfaceMode: 'journal' });
  assert.equal(posts[0]![1].continues_composition_id, 'comp-9', 'the open canvas is named, so the backend mutates it instead of starting over');
  assert.equal(posts[0]![1].surface_mode, 'dual', 'and the real layout mode, so canvas content is not gated away');
  assert.equal(posts[1]![1].continues_composition_id, undefined); assert.equal(posts[1]![1].surface_mode, 'journal');
  assert.equal(posts[2]![1].surface_mode, 'journal');
});

test('canvas pane — remote mutations land only on the canvas they name', async () => {
  const { CanvasView } = await import('../src/views/CanvasView');
  const view = Object.create(CanvasView.prototype) as InstanceType<typeof CanvasView>;
  let rendered = 0;
  Object.assign(view, { compositionId: 'c1', snapshots: [], spec: { id: 'c1', components: [{ id: 'a', type: 'text_block', data: { text: 'A' } }] }, render: () => { rendered++; }, autoKeep: async () => undefined, plugin: { settings: { auto_keep_canvas: false } } });
  const add = [{ op: 'add', target_id: '', position: 'end', components: [{ id: 'b', type: 'text_block', data: { text: 'B' } }] }] as never[];
  assert.equal(view.applyRemoteMutations('c2', add), false, 'another canvas\'s mutations are ignored');
  assert.equal(view.applyRemoteMutations('c1', []), false);
  assert.equal(view.applyRemoteMutations('c1', add), true);
  assert.equal(rendered, 1);
  assert.deepEqual(((view as unknown as { spec: { components: Array<{ id: string }> } }).spec.components).map((c) => c.id), ['a', 'b']);
  assert.equal(view.currentId(), 'c1');
  // Undo — the web's ↩: the snapshot taken before the mutation comes back.
  assert.equal(view.undo(), true);
  assert.deepEqual(((view as unknown as { spec: { components: Array<{ id: string }> } }).spec.components).map((c) => c.id), ['a'], 'undo restores the spec before the remote mutation');
  assert.equal(view.undo(), false, 'nothing left to undo is said, not thrown');
  // Expired — only the named canvas is marked.
  assert.equal(view.markExpired('c2', 'superseded', true), false);
  assert.equal(view.markExpired('c1', 'superseded', true), true);
  const src = await (await import('node:fs/promises')).readFile('src/main.ts', 'utf8');
  assert.match(src, /subscribe\('composition_mutation'/, 'the pane listens for background mutations like the web');
  assert.match(src, /this\.takeOffer\('ready', payload\)/, 'composition_ready goes through routeOffer: an open pane follows it, a closed pane gets an offer');
});

// ── bucket 1: the canvas talks back; offers; feedback; chips ────────────────

test('canvas click → chat reply: high-signal presses record the web\'s interaction after the action', async () => {
  const { renderComponentActions, controlsOf } = await import('../src/views/canvasActions');
  const { host, runs, interactions } = makeActionHost();
  const decision = { id: 'd1', type: 'decision_frame', data: { question: 'Raise it?', options: [{ label: 'Yes, directly' }, { label: 'Wait' }] } } as never;
  const p = new FakeEl('div'); renderComponentActions(p as never, decision, host);
  assert.ok(await p.click('Wait'));
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(runs[0], ['d1', 'select_option', { option_index: 1, option_label: 'Wait' }], 'the action still runs');
  assert.deepEqual(interactions[0], ['d1', { event_type: 'option_selected', component_type: 'decision_frame', action_value: 'Wait', metadata: { action_name: 'select_option', option_index: 1, option_label: 'Wait' } }], 'and the record that makes Myu answer in the conversation follows');
  const actions = { id: 'a1', type: 'action_controls', data: { actions: [{ label: 'Draft a note', action: 'draft_note' }] } } as never;
  const c = controlsOf(actions);
  assert.deepEqual(c.buttons[0]?.interaction, { event_type: 'action_clicked', component_type: 'action_controls', action_value: 'Draft a note', metadata: { action_name: 'draft_note' } });
  // reflection_prompt: no /composition/action exists — interaction only.
  const prompt = { id: 'r1', type: 'reflection_prompt', data: { question: 'What would you want him to say first?' } } as never;
  const rc = controlsOf(prompt);
  assert.equal(rc.input?.action, '');
  assert.deepEqual(rc.input?.interaction?.('That he noticed.'), { event_type: 'prompt_answered', component_type: 'reflection_prompt', action_value: 'That he noticed.', metadata: { action_name: 'prompt_answered' } });
  // inline_chat: the web's exact body — action inline_chat, params.message.
  const chat = { id: 'ic', type: 'inline_chat', data: { placeholder: 'Ask about this' } } as never;
  assert.deepEqual([controlsOf(chat).input?.action, controlsOf(chat).input?.param_name], ['inline_chat', 'message']);
});

test('interaction + feedback wires — the web\'s bodies, verbatim', async () => {
  const { Api } = await import('../src/transport/api');
  const posts: Array<[string, Record<string, unknown>]> = [];
  const api = new Api({ get: async () => ({ ok: true, status: 200, data: {} }), post: async (path: string, body: Record<string, unknown>) => { posts.push([path, body]); return { ok: true, status: 200, data: { success: true } }; } } as never);
  await api.postCompositionInteraction([{ composition_id: 'c1', component_id: 'd1', component_type: 'decision_frame', event_type: 'option_selected', action_value: 'Wait', timestamp: 1 }], true);
  assert.equal(posts[0]![0], '/composition/interaction');
  assert.deepEqual(posts[0]![1], { events: [{ composition_id: 'c1', component_id: 'd1', component_type: 'decision_frame', event_type: 'option_selected', action_value: 'Wait', timestamp: 1 }], timing: {}, generate_response: true });
  await api.submitFeedback({ message: '', category: 'myu_response', rating: -1, app: 'obsidian', version: '0.1.0 (build 150)', context: { journal_id: 'j1', surface_state: 'chat' } });
  assert.equal(posts[1]![0], '/feedback/submit');
  assert.equal(posts[1]![1].rating, -1); assert.equal(posts[1]![1].category, 'myu_response'); assert.equal((posts[1]![1].context as Record<string, unknown>).journal_id, 'j1');
  await api.refreshComposition('c1');
  assert.deepEqual(posts[2], ['/composition/refresh', { composition_id: 'c1' }]);
});

test('offers — the web\'s pending strip, decided purely; a ready canvas replaces an open pane, everything else is offered', async () => {
  const { routeOffer, addOffer } = await import('../src/composition/offers');
  const ready = { composition_id: 'c2', summary_text: 'Team read', subject_name: 'Platform', flow_type: 'team_read' };
  assert.deepEqual(routeOffer('ready', ready, 'c1', 5), { kind: 'replace', compositionId: 'c2', summaryText: ready.summary_text }, 'operator rule: an open pane follows the newest canvas, and the thread is told what it is');
  assert.deepEqual(routeOffer('ready', ready, 'c2', 5), { kind: 'none' }, 'already showing it');
  const offered = routeOffer('ready', ready, null, 5);
  assert.equal(offered.kind, 'offer'); if (offered.kind === 'offer') { assert.equal(offered.announce, false); assert.equal(offered.offer.actionLabel, 'View'); }
  // A background offer now takes an OPEN, following pane too (2026-09-01): the
  // pane is a context pane, and leaving it stale made "Past canvases…" the only
  // way to the present. With the pane closed — or PINNED — it stays a row.
  assert.deepEqual(routeOffer('offer', { ...ready, announce: true }, 'c1', 5), { kind: 'replace', compositionId: 'c2', summaryText: ready.summary_text }, 'a following pane shows the newest');
  assert.equal(routeOffer('offer', { ...ready, announce: true }, 'c1', 5, false).kind, 'offer', 'a pinned pane is left alone');
  const bg = routeOffer('offer', { ...ready, action_label: 'View briefing', announce: true }, null, 5);
  assert.equal(bg.kind, 'offer'); if (bg.kind === 'offer') { assert.equal(bg.announce, true, 'a Notice only when the backend marked it announce'); assert.equal(bg.offer.actionLabel, 'View briefing'); }
  assert.equal(routeOffer('offer', { ...ready, announce: true }, 'c2', 5).kind, 'none', 'an offer for the canvas on screen is noise');
  assert.equal(routeOffer('offer', { summary_text: 'no id' }, null, 5).kind, 'none');
  const a = { compositionId: 'a', summaryText: 'A', actionLabel: 'View', receivedAt: 1 };
  const list = addOffer(addOffer([a], { ...a, compositionId: 'b' }), { ...a, summaryText: 'A again' });
  assert.deepEqual(list.map((o) => o.compositionId), ['a', 'b'], 'newest first, one per id');
  assert.equal(list[0]!.summaryText, 'A again');
  assert.equal(addOffer(Array.from({ length: 10 }, (_, i) => ({ ...a, compositionId: String(i) })), { ...a, compositionId: 'new' }).length, 10, 'ten deep, like the web');
});

test('chat wiring — the thread re-reads after a canvas click; offers arrive over SSE (template chips: removed on the operator\'s call, 2026-08-30)', async () => {
  const fs = await import('node:fs/promises');
  const chat = await fs.readFile('src/views/ChatView.ts', 'utf8');
  assert.match(chat, /reloadThread/, 'the thread can be re-read after a canvas click');
  assert.ok(!/renderTemplateChips|CHAT_TEMPLATES/.test(chat), 'no template chips — the product is moving away from them');
  const main = await fs.readFile('src/main.ts', 'utf8');
  assert.match(main, /subscribe\('chatrefresh'/, 'the backend\'s own signal that the reply landed is honoured');
  assert.match(main, /subscribe\('composition_offer'/);
});

// ── bucket 2: the feed panel's affordances, and the vault as the meeting form ─

test('meeting additions — a bullet typed under Decisions/Commitments without a myu-id is the user\'s; Myu\'s rows are marked', async () => {
  const { meetingAdditions, buildMeetingHistoryMarkdown } = await import('../src/vault/myuFiles');
  const md = buildMeetingHistoryMarkdown({ meeting_id: 'm1', title: 'Platform weekly', decisions: ['Move the weekly to async'], commitments: [{ owner: 'Dana Ortiz', content: 'Draft the async format', commitment_id: 'cmt-1' }, { content: 'No owner yet' }] });
  assert.match(md, /^- Move the weekly to async %%myu-id:d-[a-z0-9]+%%$/m, 'Myu\'s decisions carry an invisible id');
  assert.match(md, /^- \[\[Dana Ortiz\]\] Draft the async format %%myu-id:cmt-1%%$/m, 'commitments carry the server id');
  assert.match(md, /^- No owner yet %%myu-id:c-[a-z0-9]+%%$/m, 'or a stable hash when the server gave none');
  assert.deepEqual(meetingAdditions(md), { decisions: [], commitments: [] }, 'nothing of Myu\'s is mistaken for the user\'s');
  const edited = md.replace('## Decisions\n', '## Decisions\n- Keep Thursday for 1:1s\n').replace('## Commitments\n', '## Commitments\n- [[Marcus Webb]] Send the revised plan\n- Book the room\n');
  assert.deepEqual(meetingAdditions(edited), { decisions: ['Keep Thursday for 1:1s'], commitments: [{ content: 'Send the revised plan', owner: 'Marcus Webb' }, { content: 'Book the room' }] });
  assert.deepEqual(meetingAdditions('## Notes\n- not a decision\n\n## Decisions\n- [ ] a checkbox is a commitment row, not a decision\n'), { decisions: [], commitments: [] });
});

test('relationship alerts and priority cards — Notices only at the web\'s default bar (high/critical), toast types only, deduped 30 min', async () => {
  const { liveNoticeFor, registerLiveNotices } = await import('../src/liveNotices');
  assert.equal(liveNoticeFor('relationship_alert', { alert_type: 'sentiment_drop', severity: 'medium', person_name: 'Marcus', message: 'cooling' }, 'a'), null, 'medium stays in the feed');
  assert.equal(liveNoticeFor('relationship_alert', { alert_type: 'linkedin_suggested', severity: 'info', person_name: 'Marcus' }, 'a'), null, 'LinkedIn info alerts are pull-based on the card');
  const high = liveNoticeFor('relationship_alert', { alert_type: 'conflict_escalation', severity: 'high', person_name: 'Marcus Webb', relationship_id: 'rel-1', message: 'Third clash in two weeks.' }, 'a');
  assert.equal(high?.title, '⚠️ Marcus Webb'); assert.equal(high?.body, 'Third clash in two weeks.'); assert.equal(high?.action, 'open_person'); assert.equal(high?.relationshipId, 'rel-1');
  assert.equal(liveNoticeFor('priority_card', { card_type: 'relationship_info', urgency: 'critical', card_data: { title: 'x' } }, 'a'), null, 'a panel card is Today\'s business, not a Notice');
  assert.equal(liveNoticeFor('priority_card', { card_type: 'no_contact_card', urgency: 'normal', card_data: { title: 'x' } }, 'a'), null, 'normal urgency is silent under smart mode');
  const crit = liveNoticeFor('priority_card', { card_type: 'conflict_risk', urgency: 'critical', card_data: { title: 'Conflict risk with Marcus', description: 'Two sharp threads this week.', relationship_id: 'rel-1', person_name: 'Marcus Webb' } }, 'a');
  assert.equal(crit?.durationMs, 0, 'critical persists, like the web'); assert.equal(crit?.kind, 'error'); assert.equal(crit?.dedupeKey, 'priority_card:conflict_risk');
  const highCard = liveNoticeFor('priority_card', { card_type: 'no_contact', urgency: 'high', card_data: { title: 'No contact', description: 'Three weeks.' } }, 'a');
  assert.equal(highCard?.durationMs, 8000);
  // Dedup: the same key inside 30 minutes is not shown twice.
  const shown: string[] = []; const handlers = new Map<string, (p: Record<string, unknown>) => void>();
  registerLiveNotices((type, h) => { handlers.set(type, h); }, { accountId: () => 'a', notify: (n) => shown.push(n.title), openDevices: () => undefined, onRemoteLogout: () => undefined });
  const fire = () => handlers.get('priority_card')?.({ card_type: 'no_contact', urgency: 'high', card_data: { title: 'No contact' } });
  fire(); fire();
  assert.deepEqual(shown, ['No contact']);
});

test('card sections — provenance rides along, the sources section reads, per-section discuss only where the web offers it', async () => {
  const { sectionBlocks, isDiscussable, sectionDiscussSeed } = await import('../src/views/cardSections');
  const mem = sectionBlocks({ section_type: 'memories', title: 'Memories', items: [{ text: 'Asked for the plan twice.', date: '2026-08-20', source_type: 'journal_entry', source_id: 'j1' }, { text: 'No source' }] });
  assert.deepEqual(mem[0], { kind: 'row', text: 'Asked for the plan twice.', meta: '2026-08-20', source: { type: 'journal_entry', id: 'j1' } });
  assert.equal(mem[1]?.source, undefined);
  const src = sectionBlocks({ section_type: 'sources', title: 'Sources', items: [{ title: 'Re: Thursday sync', subtitle: 'From Dana', source_type: 'gmail', source_id: 'g1' }] });
  assert.deepEqual(src, [{ kind: 'row', text: 'Re: Thursday sync', meta: 'From Dana', source: { type: 'gmail', id: 'g1' } }]);
  assert.equal(isDiscussable({ section_type: 'patterns', actionable: true }), true);
  assert.equal(isDiscussable({ section_type: 'patterns' }), false, 'actionable must be set');
  assert.equal(isDiscussable({ section_type: 'memories', actionable: true }), false, 'only patterns/predictions/threads/weather');
  const seed = sectionDiscussSeed({ entity_id: 'rel-1', header: { display_name: 'Marcus Webb' } }, 'person', { section_id: 's1', section_type: 'patterns', title: 'Patterns', narrative: 'Goes quiet under pressure.' }, [{ kind: 'narrative', text: 'Goes quiet under pressure.' }, { kind: 'row', text: 'Q2 reorg' }]);
  assert.deepEqual(seed, { text: 'About Marcus Webb — patterns: ', source_id: 'rel-1:s1', section_content: 'Q2 reorg', section_narrative: 'Goes quiet under pressure.' });
});

test('feed-panel wires — GET/POST, paths and bodies exactly as the web sends them', async () => {
  const { Api } = await import('../src/transport/api');
  const { driveFileId } = await import('../src/views/DriveImportModal');
  const calls: Array<[string, string, unknown?]> = [];
  const api = new Api({ get: async (p: string) => { calls.push(['GET', p]); return { ok: true, status: 200, data: {} }; }, post: async (p: string, b: unknown) => { calls.push(['POST', p, b]); return { ok: true, status: 200, data: {} }; } } as never);
  await api.getHelpMyuQueue(); await api.getRelatedPersons('r/1'); await api.getRelatedMemories('r1', 3); await api.getEntityDispatch('person', 'r1'); await api.dismissEntityDispatch('r1', 'fp', 'attention');
  await api.searchFeed('mar cus'); await api.getSourceDetail('gmail', 'g 1'); await api.setRelationshipLinkedIn('r1', null); await api.setRelationshipLinkedIn('r1', 'https://linkedin.com/in/x'); await api.rejectMerge('s', 't');
  await api.addMeetingDecision('m1', 'Keep Thursday'); await api.addMeetingCommitment('m1', 'Book the room', 'action_item', 'Dana'); await api.getDriveSuggestions(); await api.importFromDrive(['f1']); await api.dismissDriveSuggestion('sug-1');
  assert.deepEqual(calls, [
    ['GET', '/feed/help-myu'], ['GET', '/feed/related-persons?relationship_id=r%2F1&limit=5'], ['GET', '/feed/related-memories?relationship_id=r1&limit=3'],
    ['GET', '/feed/entities/dispatch?entity_type=person&entity_id=r1'], ['POST', '/feed/entities/dismiss', { entity_id: 'r1', signal_fingerprint: 'fp', category: 'attention' }],
    ['GET', '/feed/search?q=mar%20cus&types=all&limit=10'], ['GET', '/card/source-detail?source_type=gmail&source_id=g%201'],
    ['POST', '/v2/relationships/linkedin/r1', { linkedin_url: null }], ['POST', '/v2/relationships/linkedin/r1', { linkedin_url: 'https://linkedin.com/in/x' }],
    ['POST', '/relationships/merge', { source_id: 's', target_id: 't', action: 'reject' }],
    ['POST', '/meetings/add-decision', { meeting_id: 'm1', content: 'Keep Thursday' }], ['POST', '/meetings/add-commitment', { meeting_id: 'm1', content: 'Book the room', commitment_type: 'action_item', owner: 'Dana' }],
    ['GET', '/meetings/drive/suggestions?limit=10'], ['POST', '/meetings/import/drive', { file_ids: ['f1'] }], ['POST', '/meetings/drive/suggestions', { id: 'sug-1', action: 'dismiss' }],
  ]);
  assert.equal(driveFileId('https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/edit'), '1AbCdEfGhIjKlMnOpQrStUvWxYz');
  assert.equal(driveFileId('https://drive.google.com/open?id=1AbCdEfGhIjKlMnOp'), '1AbCdEfGhIjKlMnOp');
  assert.equal(driveFileId('not a link'), null);
});

// ── bucket 3: connections, the loop, wellbeing notices ──────────────────────

test('connection wires — credential-level disconnect / set-primary, Slack OAuth, Zulip form, name, career, loop, signal', async () => {
  const { Api } = await import('../src/transport/api');
  const calls: Array<[string, string, unknown?]> = [];
  const api = new Api({ get: async (p: string) => { calls.push(['GET', p]); return { ok: true, status: 200, data: {} }; }, post: async (p: string, b: unknown) => { calls.push(['POST', p, b]); return { ok: true, status: 200, data: {} }; } } as never);
  await api.googleOAuthDisconnect('g1'); await api.googleSetPrimaryCredential('g2'); await api.microsoftOAuthDisconnect('m1'); await api.microsoftSetPrimaryCredential('m2');
  await api.slackConnect(); await api.slackDisconnect('s1'); await api.zulipConnect('https://org.zulipchat.com', 'me@org.com', 'KEY'); await api.zulipDisconnect('z1');
  await api.updateAccountName('acct', 'Masumi'); await api.getAccountCareer('acct'); await api.getPersonalLoop();
  await api.submitFeedbackSignal({ subject_type: 'personal_loop', subject_id: 'loop-1', rating: 1, subject_text: 'x', surface: 'personal_loop_strip', context: { loop_state: 'mirrored' } });
  assert.deepEqual(calls, [
    ['POST', '/oauth/google/disconnect', { credential_id: 'g1' }], ['POST', '/oauth/google/credential/set-primary', { credential_id: 'g2' }],
    ['POST', '/oauth/microsoft/disconnect', { credential_id: 'm1' }], ['POST', '/oauth/microsoft/credential/set-primary', { credential_id: 'm2' }],
    ['POST', '/slack/connect', {}], ['POST', '/slack/disconnect', { connection_id: 's1' }],
    ['POST', '/zulip/connect', { realm_url: 'https://org.zulipchat.com', email: 'me@org.com', api_key: 'KEY' }], ['POST', '/zulip/disconnect', { connection_id: 'z1' }],
    ['POST', '/account/update', { account_id: 'acct', name: 'Masumi' }], ['GET', '/account/career?account_id=acct'], ['GET', '/personal_loop/get'],
    ['POST', '/feedback/signal', { subject_type: 'personal_loop', subject_id: 'loop-1', rating: 1, subject_text: 'x', surface: 'personal_loop_strip', context: { loop_state: 'mirrored' } }],
  ]);
});

test('wellbeing — burnout and goal milestones are Today rows with the web\'s words, never Notices (invariant 4)', async () => {
  const { burnoutRow, goalMilestoneRow } = await import('../src/views/wellbeingRows');
  const { LIVE_NOTICE_EVENTS } = await import('../src/liveNotices');
  assert.ok(!(LIVE_NOTICE_EVENTS as readonly string[]).includes('burnout_warning') && !(LIVE_NOTICE_EVENTS as readonly string[]).includes('goal_milestone'), 'initiative material stays out of Notice');
  const b = burnoutRow({ burnout_score: 82, urgency: 'immediate', primary_drivers: [{ dimension: 'workload', score: 0.9 }, { dimension: 'late_nights', score: 0.7 }, { dimension: 'x' }] });
  assert.deepEqual(b, { title: 'Take care of yourself', summary: 'workload and late nights are adding up', personId: undefined, personName: undefined });
  const other = burnoutRow({ person_name: 'Marcus Webb', person_id: 'rel-1', primary_drivers: [] });
  assert.equal(other.title, 'Marcus Webb might need support'); assert.match(other.summary ?? '', /Stress levels are elevated/); assert.equal(other.personId, 'rel-1');
  assert.equal(goalMilestoneRow({ milestone_type: 'created', goal_content: 'Ship v2' }), null, 'informational on the web → nothing');
  assert.equal(goalMilestoneRow({ milestone_type: 'completed', goal_content: 'Ship v2' }), null);
  assert.equal(goalMilestoneRow({ milestone_type: 'stalled', goal_content: 'Ship v2' })?.title, 'A goal needs attention');
  assert.equal(goalMilestoneRow({ milestone_type: 'deadline_approaching', goal_content: 'Ship v2' })?.summary, 'Ship v2');
  const fs = await import('node:fs/promises');
  const main = await fs.readFile('src/main.ts', 'utf8');
  for (const ev of ['personal_loop\\.updated', 'insight_ready', 'burnout_warning', 'goal_milestone', 'entities_changed', 'card_section_updated', 'meeting_extraction_complete']) assert.match(main, new RegExp(`subscribe\\('${ev}'`), `${ev} is wired`);
  const today = await fs.readFile('src/views/TodayView.ts', 'utf8');
  assert.match(today, /getPersonalLoop\(\)/, 'the loop strip is fetched with the day');
  assert.match(today, /loadHelpQueue\(\)/, 'and the Help Myu queue with it');
});

test('LinkedIn matches — the panel\'s walk, verbatim: one card, ✗ brings the next in place, then "Still can\'t find"', async () => {
  const { linkedInMatchComponent, linkedInTerminalComponent, renderLinkedInMatches, suggestionsOf } = await import('../src/views/linkedinCards');
  const { controlsOf } = await import('../src/views/canvasActions');
  const sugs = suggestionsOf([
    { card_id: '7d3e1a', person_name: 'Tankmouri', profile_headline: 'VP Product at MeridianAI', linkedin_url: 'https://linkedin.com/in/tank' },
    { card_id: '8e4f2b', person_name: 'T. Mouri', profile_headline: 'Recruiter', linkedin_url: 'https://linkedin.com/in/tm' },
  ]);
  const first = linkedInMatchComponent(sugs[0]!, 'Tankmouri', 0, 2)!;
  assert.equal(first.data?.title, 'LinkedIn Match Found');
  assert.equal(first.data?.content, '**Tankmouri**\n\n*VP Product at MeridianAI*\n\n> Tankmouri — VP Product at MeridianAI\n\n[View profile on LinkedIn](https://linkedin.com/in/tank)\n\nIs this the right person?', 'CompositionSpecBuilder\'s first card — with the profile link');
  assert.deepEqual(controlsOf(first).buttons.map((b) => [b.label, b.params]), [['✓ Confirm Match', { card_id: '7d3e1a', resolve_action: 'confirm' }], ['✗ Not this person', { card_id: '7d3e1a', resolve_action: 'reject' }]]);
  const next = linkedInMatchComponent(sugs[1]!, 'Tankmouri', 1, 2)!;
  assert.equal(next.data?.title, 'LinkedIn match for Tankmouri — last suggestion', 'the servlet\'s next-candidate title');
  assert.equal(next.data?.content, '**T. Mouri**\n\n*Recruiter*\n\n[View profile on LinkedIn](https://linkedin.com/in/tm)\n\nIs this the right person?');
  assert.equal(linkedInMatchComponent(sugs[1]!, 'Tankmouri', 1, 3)!.data?.title, 'LinkedIn match for Tankmouri — 2 suggestions remaining');
  const end = linkedInTerminalComponent('rel-1', 'Tankmouri');
  assert.equal(end.data?.title, 'Still can’t find Tankmouri');
  assert.match(String(end.data?.content), /None of the suggested LinkedIn profiles matched \*\*Tankmouri\*\*\. If you have Tankmouri’s LinkedIn URL, paste it below\. If Tankmouri isn’t on LinkedIn at all, just let me know\./);
  const ec = controlsOf(end);
  assert.deepEqual(ec.buttons.map((b) => [b.label, b.params]), [['Not on LinkedIn', { resolve_action: 'no_linkedin', relationship_id: 'rel-1' }]]);
  assert.equal(ec.input?.submit_label, 'Link profile'); assert.equal(ec.input?.validate, 'linkedin_url'); assert.equal(ec.input?.help_text, 'Paste the full LinkedIn profile URL for the correct person.');

  // The walk on screen: one card at a time; ✗ replaces it; the end is the terminal card.
  const resolved: unknown[] = [];
  const host = { app: {}, owner: {}, plugin: { backend: { resolveLinkedInSuggestion: async (b: unknown) => { resolved.push(b); return { ok: true, status: 200, data: {} }; } } }, relationshipId: 'rel-1', personName: 'Tankmouri', onResolved: () => resolved.push('resolved') } as never;
  const root = new FakeEl('div');
  const before = markdownRenders.length;
  renderLinkedInMatches(root as never, sugs, host);
  assert.equal(markdownRenders.length - before, 1, 'ONE card, not a stack');
  assert.match(markdownRenders[markdownRenders.length - 1]!, /LinkedIn Match Found/);
  assert.ok(await root.click('✗ Not this person'));
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(resolved, [{ card_id: '7d3e1a', action: 'reject' }], 'the reject reaches the server');
  assert.match(markdownRenders[markdownRenders.length - 1]!, /last suggestion/, 'the next candidate took its place');
  assert.ok(await root.click('✗ Not this person'));
  await new Promise((r) => setTimeout(r, 0));
  assert.match(markdownRenders[markdownRenders.length - 1]!, /Still can’t find Tankmouri/, 'after the last: the terminal card');
  assert.ok([...root.walk()].some((e) => e.tag === 'button' && e.text === 'Not on LinkedIn'));
  // A refused reject still moves the walk on — the doors must always be reachable.
  const stubborn = { ...host, plugin: { backend: { resolveLinkedInSuggestion: async () => ({ ok: false, status: 409, error: 'stale' }) } } } as never;
  const root2 = new FakeEl('div');
  renderLinkedInMatches(root2 as never, sugs.slice(0, 1), stubborn);
  assert.ok(await root2.click('✗ Not this person'));
  await new Promise((r) => setTimeout(r, 0));
  assert.match(markdownRenders[markdownRenders.length - 1]!, /Still can’t find Tankmouri/, 'the terminal card is reached even when the server refused the reject');
  const css = await (await import('node:fs/promises')).readFile('styles.css', 'utf8');
  assert.ok(!/\.myu-whisper \{[^}]*monospace/.test(css), 'default labels are in the UI font — the monospace register lives in the snippet');
  assert.ok(!/color-orange/.test(css), 'no orange web pill in the default look');
});

test('reply rating — the web\'s modal: the thumb sets the rating, a note is optional, what is sent is SAID and the transcript is a switch', async () => {
  const { ReplyRatingModal } = await import('../src/views/ReplyRatingModal');
  const { formatConversationAttachment } = await import('../src/views/feedbackAttachment');
  const turns = [{ role: 'user', text: 'so this whole shopping for a law firm' }, { role: 'myu', blocks: [{ type: 'conversational', text: 'Ask for a **capped** first engagement.' }] }] as never[];
  const att = formatConversationAttachment(turns as never, 'j1', new Date('2026-08-30T10:00:00Z'));
  assert.match(att.attached_content, /^--- Journal Entry ---\nID: j1\nTimestamp: 2026-08-30T10:00:00.000Z\n\nso this whole shopping for a law firm\n\n--- Journal Chat ---\n\[agent\] Ask for a \*\*capped\*\* first engagement\.$/, 'the web\'s formatJournalForEmail shape');
  assert.match(att.attached_summary, /^Journal entry \(.+\):\nso this whole shopping for a law firm\n\n1 chat turn attached in full\.$/);

  const sent: unknown[] = [];
  const plugin = {
    sendFeedback: async (o: unknown) => { sent.push(o); return { ok: true, status: 200, data: { success: true } }; },
    backend: { getCompositionForJournal: async () => ({ ok: true, status: 200, data: { composition_id: 'comp-9', composition: { id: 'comp-9', components: [{ id: 'c1', type: 'text_block', data: { text: 'hi' } }] } } }) },
    canvasView: () => ({ currentId: () => 'comp-open', currentSpec: () => ({ id: 'comp-open', components: [] }) }),
  };
  let submitted = 0;
  const m = new ReplyRatingModal({} as never, plugin as never, -1, 'j1', turns as never, () => { submitted++; }); m.open();
  const root = m.contentEl as unknown as FakeEl;
  const text = root.visibleTexts().join(' ');
  assert.match(text, /What was off\?/, 'the web\'s header for a thumbs-down');
  assert.match(text, /Attach this conversation/, 'the transcript is a visible switch');
  assert.ok(await root.click('Send'));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(submitted, 1);
  const body = sent[0] as { rating: number; category: string; journalId: string; attachments?: { attached_content: string } };
  assert.equal(body.rating, -1); assert.equal(body.category, 'myu_response'); assert.equal(body.journalId, 'j1');
  assert.match(body.attachments?.attached_content ?? '', /--- Journal Chat ---/, 'attached by default, like the web');
  assert.match(body.attachments?.attached_content ?? '', /--- Canvas Composition \(Linked to journal\) ---\nID: comp-9\n\{[\s\S]*"type": "text_block"/, 'the conversation\'s canvas rides along as JSON, the web\'s shape');
  assert.ok(!/Open in the canvas pane/.test(body.attachments?.attached_content ?? ''), 'only the conversation\'s own canvas — never whatever the pane happens to show');
  const chat = await (await import('node:fs/promises')).readFile('src/views/ChatView.ts', 'utf8');
  assert.ok(!/sendFeedback\(\{ message: '', category: 'myu_response'/.test(chat), 'no silent one-click send remains');
});

test('the first run is the pane, not a ladder — no modal on enable, rows in Today, write leads, identity last; a dismissed onboarding hands off once', async () => {
  const fs = await import('node:fs/promises');
  const main = await fs.readFile('src/main.ts', 'utf8');
  const first = main.slice(main.indexOf('async finishFirstRun'), main.indexOf('offerOnboardingThenBackfill(): Promise'));
  assert.ok(!/new ConsentModal|offerResidencyThen\(/.test(first), 'genesis opens no dialog — the pane carries the setup');
  assert.match(first, /await this\.openToday\(\)/);
  const enable = main.slice(main.indexOf('First enable, nothing configured'), main.indexOf('override onunload'));
  assert.ok(!/new SignupModal/.test(enable), 'nothing opens on enable');
  assert.match(enable, /notifyStatus\('askMyu is installed/, 'a Notice, and the pane');
  const today = await fs.readFile('src/views/TodayView.ts', 'utf8');
  const rows = today.slice(today.indexOf('private setupRows()'), today.indexOf('return rows;'));
  const order = ['Keep what Myu knows in your vault', 'Choose what Myu may read', 'Bring in what you have already written', 'Share meeting notes', 'Tell Myu who you are'].map((t) => rows.indexOf(t));
  assert.ok(order.every((i) => i >= 0) && order.every((i, k) => k === 0 || i > order[k - 1]!), `rows in the agreed order: ${order.join(',')}`);
  assert.match(rows, /!s\.materialize_consented && \(this\.brief \|\| s\.consent_completed\)/, 'the folder row shows as soon as Myu has something to put in it');
  const { OnboardingModal } = await import('../src/views/OnboardingModal');
  let finished = 0;
  const m = new OnboardingModal({} as never, { onboardingScripts: {}, settings: {}, backend: {} } as never, () => { finished++; });
  m.open(); m.close(); m.close();
  assert.equal(finished, 1, 'closing the onboarding dialog is an answer — once');
  const { DEFAULT_SETTINGS } = await import('../src/settings');
  assert.deepEqual([DEFAULT_SETTINGS.setup_hidden, DEFAULT_SETTINGS.backfill_done, DEFAULT_SETTINGS.meeting_consent_offered], [false, false, false]);
});

test('remove everything Myu wrote — frontmatter handle ∪ the written-path registry, to the trash, never the user\'s notes', async () => {
  const { findEverythingMyuWrote, trashEverythingMyuWrote } = await import('../src/vault/removeEverything');
  const { TFile } = await import('obsidian');
  const mk = (path: string, fm?: Record<string, unknown>) => { const f = Object.assign(new TFile(), { path }); (f as unknown as { fm?: unknown }).fm = fm; return f; };
  const files = [mk('Myu/People/Marcus Webb.md', { 'myu-generated': true }), mk('Journal/2026-08-30.md'), mk('Myu/Conversations/2026-08-20 law firm.md', { 'myu-generated': true }), mk('Notes/mine.md', { 'myu-generated': false })];
  const byPath = new Map(files.map((f) => [f.path, f]));
  byPath.set('Myu/People.base', mk('Myu/People.base'));
  const app = { vault: { getMarkdownFiles: () => files, getAbstractFileByPath: (p: string) => byPath.get(p) ?? null }, metadataCache: { getFileCache: (f: { fm?: unknown }) => ({ frontmatter: f.fm }) }, fileManager: { trashFile: async () => undefined } } as never;
  const found = findEverythingMyuWrote(app, ['Myu/People.base', 'Myu/People/Marcus Webb.md', 'Myu/gone.md']);
  assert.deepEqual(found.files.map((f) => f.path).sort(), ['Myu/Conversations/2026-08-20 law firm.md', 'Myu/People.base', 'Myu/People/Marcus Webb.md'], 'generated md by frontmatter, the base by registry, nothing of the user\'s, nothing twice');
  assert.equal(found.byFrontmatter, 2); assert.equal(found.byRegistry, 1);
  assert.equal(await trashEverythingMyuWrote(app, found.files), 3);
  const fs = await import('node:fs/promises');
  const main = await fs.readFile('src/main.ts', 'utf8');
  assert.match(main, /id: 'remove-myu-files'/); assert.match(main, /trashEverythingMyuWrote/);
  assert.ok(!/vault\.delete\(/.test(await fs.readFile('src/vault/removeEverything.ts', 'utf8')), 'trash, never delete');
});

test('read consent — names the one server and shows what each folder holds; the write dialog leads with what you get', async () => {
  const { serverHost, folderScope } = await import('../src/views/ConsentModal');
  assert.equal(serverHost('https://myu.askmyu.com/api'), 'myu.askmyu.com');
  assert.equal(serverHost('http://localhost/api'), 'localhost');
  const files = [{ path: 'Journal/2024-01-01.md', stat: { ctime: Date.UTC(2024, 5, 15) } }, { path: 'Journal/2026-08-30.md', stat: { ctime: Date.UTC(2026, 6, 15) } }, { path: 'Other/x.md', stat: { ctime: 0 } }];
  const app = { vault: { getMarkdownFiles: () => files } } as never;
  assert.equal(folderScope(app, 'Journal'), '2 notes, oldest 2024');
  assert.equal(folderScope(app, 'Journal/'), '2 notes, oldest 2024');
  assert.equal(folderScope(app, 'Empty'), 'no notes yet');
  const fs = await import('node:fs/promises');
  const write = await fs.readFile('src/views/MaterializeConsentModal.ts', 'utf8');
  assert.match(write, /Myu keeps one folder in your vault, up to date: a page for each/, 'the give, first');
  assert.match(write, /Remove everything Myu wrote/, 'and the way out, named');
  const readme = await fs.readFile('README.md', 'utf8');
  for (const q of ['Can I self-host, or use it offline?', 'What exactly is sent?', 'Can I exclude my journal, or any note?', 'Will it touch my existing notes?', 'Can I change the folder?', 'How do I delete my data?']) assert.ok(readme.includes(q), `README answers: ${q}`);
  assert.ok(!/local-first|privacy-first|your notes never leave/i.test(readme + write), 'no banned phrases');
});

test('the instant give — links name the people; the preview is honest about range and time; the walk can be stopped', async () => {
  const { surveyLinks, surveyLine, backfillEstimate, rangeCutoff } = await import('../src/capture/linkSurvey');
  const notes = [
    { text: 'Met [[Marcus Webb]] and [[Dana Ortiz]] about [[Projects/Platform]] on [[2026-08-20]]. [[Marcus Webb|Marcus]] again.', mtime: 300 },
    { text: 'Call with [[Dana Ortiz]]; see [[Today]] and [[Marcus Webb#notes]].', mtime: 200 },
    { text: '[[Priya Nair]] joined. [[42]]', mtime: 100 },
  ];
  const people = surveyLinks(notes);
  assert.deepEqual(people.map((p) => [p.name, p.count, p.last]), [['Dana Ortiz', 2, 300], ['Marcus Webb', 2, 300], ['Priya Nair', 1, 100]], 'one count per note per person (count, then recency, then name); paths, dates, numbers and Myu\'s own pages are not people');
  assert.equal(surveyLine(people), 'Your links already name 3 people; you write most about Dana Ortiz, Marcus Webb and Priya Nair.');
  assert.equal(surveyLine([]), null);
  assert.equal(backfillEstimate(10), 'under a minute'); assert.equal(backfillEstimate(1000), 'about 5 minutes');
  const now = 1_000_000_000_000;
  assert.equal(rangeCutoff('all', now), 0); assert.equal(rangeCutoff('90d', now), now - 90 * 86_400_000); assert.equal(rangeCutoff('1y', now), now - 365 * 86_400_000);
  const { describeScope } = await import('../src/views/BackfillModal');
  assert.equal(describeScope(38, 2, Date.UTC(2023, 5, 1)), '38 notes across 2 folders, oldest 2023.');
  assert.equal(describeScope(0, 0, null), 'There is nothing in the folders you shared yet.');
  const fs = await import('node:fs/promises');
  const main = await fs.readFile('src/main.ts', 'utf8');
  assert.match(main, /id: 'cancel-backfill'/, 'a cancel command, while it runs');
  assert.match(main, /statusBarEl\?\.setText\(`myu \\u00b7 reading \$\{done\}\/\$\{total\}`\)/, 'progress lives in the status bar');
  const capture = await fs.readFile('src/capture/CaptureService.ts', 'utf8');
  assert.match(capture, /if \(shouldStop\?\.\(\)\) \{ stopped = true; break; \}/, 'the walk stops when asked');
});

// ── settings, live findings 2026-09-03 ───────────────────────────────────────
// Against production, a fresh BRAT install painted "Connect…" over a Google
// account that was syncing, "No other devices are holding custody" over nine
// devices, and an empty name field — every one a refused fetch painted as an
// empty state — then "Delete my account" ABOVE a name row whose copy pointed
// "above", and a pane that reshuffled its sections after every click.

test('settings — a fetch that FAILED is said in the reader\'s words, never painted as "nothing here"', async () => {
  const { loadFailure } = await import('../src/views/settingsLoad');
  assert.equal(loadFailure({ ok: true, status: 200, error: null }), null);
  assert.match(loadFailure(null)!, /could not be reached/);
  assert.match(loadFailure({ ok: false, status: 0, error: 'offline' })!, /could not be reached/);
  assert.match(loadFailure({ ok: false, status: 401, error: 'http_401' })!, /reopened/);
  assert.match(loadFailure({ ok: false, status: 403, error: 'http_403' })!, /still being opened/);
  assert.match(loadFailure({ ok: false, status: 428, error: 'terms_required' })!, /beta terms/);
  assert.match(loadFailure({ ok: false, status: 429, error: 'http_429' })!, /pause/);
  assert.match(loadFailure({ ok: false, status: 503, error: 'http_503' })!, /could not answer \(503\)/);
  assert.match(loadFailure({ ok: false, status: 404, error: 'http_404' })!, /answered 404/);
});

test('settings — rerender is update(): the definitions are re-read and the active tab repainted; no legacy display() remains', async () => {
  const { AskMyuSettingTab } = await import('../src/views/SettingsTab');
  const log: string[] = [];
  AskMyuSettingTab.prototype.rerender.call({ update: () => log.push('update') } as never);
  assert.deepEqual(log, ['update']);
  const src = await (await import('node:fs/promises')).readFile('src/views/SettingsTab.ts', 'utf8');
  assert.ok(!/override display\(\)/.test(src) && !/this\.display\(\)/.test(src), 'display() is gone with the 1.13 floor');
  assert.ok(!/withHeading/.test(src), 'sections carry no legacy heading switch');
  const defs = [...src.matchAll(/section\((?:'[^']+'|"[^"]+"), \[[^\]]*\], \(r\) => this\.(render\w+)\(r\)/g)].map((m) => m[1]);
  assert.equal(defs.length, 8, 'eight sections, all definitions');
});

test('transport — a burst of 401s shares ONE re-mint, and each refused request is sent again on the new session', async () => {
  const { Transport } = await import('../src/transport');
  const { answerRequestsWith, httpRequests } = await import('./ui-stub');
  const seen: Array<{ url: string; auth: string | undefined }> = [];
  answerRequestsWith(async (opts) => {
    const auth = (opts.headers as Record<string, string>).Authorization;
    seen.push({ url: String(opts.url), auth });
    if (auth === 'Bearer dead') return { status: 401, json: { error: 'session_expired' }, text: '' };
    return { status: 200, json: { ok: 1 }, text: '' };
  });
  let remints = 0;
  const t = new Transport({
    baseUrl: 'https://x/api',
    authToken: 'dead',
    onUnauthorized: async () => {
      remints += 1;
      await new Promise((r) => setTimeout(r, 5));
      t.setAuthToken('fresh');
      return true;
    },
  });
  const answers = await Promise.all([t.get('/account/devices'), t.get('/oauth/google/status'), t.post('/account/preferences', {})]);
  assert.deepEqual(answers.map((a) => a.status), [200, 200, 200], 'every refused request got its second send');
  assert.equal(remints, 1, 'one re-mint for the whole burst');
  assert.equal(seen.filter((r) => r.auth === 'Bearer fresh').length, 3, 'the second sends carry the new session');
  assert.equal(seen.length, 6);

  // A re-mint that failed: the 401 stands, one send only.
  seen.length = 0;
  const dead = new Transport({ baseUrl: 'https://x/api', authToken: 'dead', onUnauthorized: async () => false });
  assert.equal((await dead.get('/account/devices')).status, 401);
  assert.equal(seen.length, 1, 'no second send without a new session');
  answerRequestsWith(null);
  httpRequests.length = 0;
});

test('transport — 403 {"err":"enc"} asks for a re-escrow and retries once; other refusals and anonymous calls never retry', async () => {
  const { Transport } = await import('../src/transport');
  const { answerRequestsWith, httpRequests } = await import('./ui-stub');
  let calls = 0;
  let escrows = 0;
  let remints = 0;
  let blocked = true;
  answerRequestsWith(async (opts) => {
    calls += 1;
    const url = String(opts.url);
    if (url.endsWith('/anon')) return { status: 401, json: {}, text: '' };
    if (url.endsWith('/forbidden')) return { status: 403, json: { error: 'nope' }, text: '' };
    if (blocked) return { status: 403, json: { err: 'enc' }, text: '' };
    return { status: 200, json: {}, text: '' };
  });
  const t = new Transport({
    baseUrl: 'https://x/api',
    authToken: 'live',
    onUnauthorized: async () => { remints += 1; return false; },
    onEncryptionBlocked: async () => { escrows += 1; blocked = false; return true; },
  });
  const healed = await t.get('/account/devices');
  assert.equal(healed.status, 200);
  assert.equal(escrows, 1);
  assert.equal(calls, 2, 'refused, re-escrowed, sent again');
  calls = 0;
  assert.equal((await t.get('/forbidden')).status, 403);
  assert.equal(calls, 1, 'a 403 that is not the encryption gate is final');
  calls = 0;
  assert.equal((await t.post('/anon', {}, { anonymous: true })).status, 401);
  assert.equal(calls, 1);
  assert.equal(remints, 0, 'no session to mend for an anonymous call');
  answerRequestsWith(null);
  httpRequests.length = 0;
});

test('unlock — concurrent 401s share one re-mint, escrowed to the new session; concurrent 403-enc share one re-escrow', async () => {
  const { UnlockMachine } = await import('../src/auth/UnlockMachine');
  const log: string[] = [];
  let auth: Record<string, unknown> = { token: 'plugin-token', device_id: 'dev-1', wrapped_mdek: 'blob', session_token: 'dead', account_id: 'acc', background_work_consented: true };
  const api = {
    exchangeToken: async () => {
      log.push('exchange');
      await new Promise((r) => setTimeout(r, 5));
      return { ok: true, status: 200, data: { auth_token: 'fresh', account_id: 'acc', encryption_blocked: true }, error: null };
    },
    escrowMDEK: async () => {
      log.push('escrow');
      return { ok: true, status: 200, data: {}, error: null };
    },
  };
  const deps = {
    api: api as never,
    keys: { isUnlocked: true, exportForEscrow: async () => 'k', set: () => undefined, clear: () => undefined } as never,
    load: () => auth as never,
    save: async (partial: Record<string, unknown>) => { auth = { ...auth, ...partial }; },
    onSession: (token: string | null) => { log.push(`session:${token}`); },
    onState: () => undefined,
    deviceName: 'Obsidian — test',
    mockMode: () => false,
  };
  const machine = new UnlockMachine(deps);
  const [a, b] = await Promise.all([machine.onUnauthorized(), machine.onUnauthorized()]);
  assert.deepEqual([a, b], [true, true]);
  assert.deepEqual(log, ['exchange', 'session:fresh', 'escrow'], 'one exchange, one escrow, and the session set before the escrow that targets it');
  assert.equal(auth.session_token, 'fresh');

  log.length = 0;
  const [c, d] = await Promise.all([machine.onEncryptionBlocked(), machine.onEncryptionBlocked()]);
  assert.deepEqual([c, d], [true, true]);
  assert.deepEqual(log, ['escrow'], 'one re-escrow for two askers');

  // No key in memory: nothing to escrow, no retry promised.
  const cold = new UnlockMachine({ ...deps, keys: { isUnlocked: false } as never });
  assert.equal(await cold.onEncryptionBlocked(), false);
});

test('settings — the Account section keeps its reading order whatever answers first; the door out is last', async () => {
  const { AskMyuSettingTab } = await import('../src/views/SettingsTab');
  const later = <T,>(v: T, ms: number) => new Promise<T>((r) => setTimeout(() => r(v), ms));
  const ok = (data: unknown) => ({ ok: true, status: 200, data, error: null });
  const plugin = {
    unlock: { current: 'unlocked' },
    settings: { account_id: 'acc', device_id: 'dev-this' },
    backend: {
      listDevices: () => later(ok({ devices: [{ device_id: 'dev-this', device_name: 'Obsidian — Vault' }, { device_id: 'dev-2', device_name: 'Chrome on Linux' }] }), 12),
      listAccountEmails: () => later(ok({ emails: [{ email: 'you@example.com', is_primary: true, verified: true }] }), 8),
      getSelfCard: () => later(ok({ card: { header: { display_name: 'Masumi' } } }), 15), // slowest
      getAccountCareer: () => later(ok({ status: 'no_data' }), 1),
      getAccountPreferences: () => later(ok({ preferences: { preferred_address: 'Boss', coaching_preference: 'auto' } }), 1), // fastest
    },
  };
  const tab = new AskMyuSettingTab({} as never, plugin as never);
  const root = new FakeEl('div');
  (tab as unknown as { renderAccount(el: FakeEl): void }).renderAccount(root);
  await later(null, 40);
  const texts = root.visibleTexts();
  const at = (label: string) => {
    const i = texts.indexOf(label);
    assert.ok(i >= 0, `${label} rendered — saw: ${texts.join(' | ')}`);
    return i;
  };
  const order = ['Devices', 'Chrome on Linux', 'Email addresses', 'you@example.com', 'Your name', 'What Myu calls you', 'How directly Myu speaks', 'Delete my account'].map(at);
  assert.deepEqual([...order].sort((x, y) => x - y), order, `reading order held: ${texts.join(' | ')}`);
  assert.ok(!texts.some((t) => /that is above/.test(t)), 'no row points at another by position');
  assert.ok(root.find((e) => e.tag === 'input' && e.value === 'Masumi'), 'the saved name is in its field');
  assert.ok(root.find((e) => e.tag === 'input' && e.value === 'Boss'), 'the saved address is in its field');
});

test('settings — a refused device list says so and offers Retry; Retry paints the list, never "no devices"', async () => {
  const { AskMyuSettingTab } = await import('../src/views/SettingsTab');
  let answers = 0;
  const plugin = {
    unlock: { current: 'unlocked' },
    settings: { account_id: 'acc', device_id: 'dev-this' },
    backend: {
      listDevices: async () =>
        answers++ === 0
          ? { ok: false, status: 403, data: { err: 'enc' }, error: 'http_403' }
          : { ok: true, status: 200, data: { devices: [{ device_id: 'dev-2', device_name: 'Chrome on Linux', last_used_at: '2026-09-03T06:00:00Z' }] }, error: null },
    },
  };
  const tab = new AskMyuSettingTab({} as never, plugin as never);
  const host = new FakeEl('div');
  await (tab as unknown as { renderDevices(el: FakeEl): Promise<void> }).renderDevices(host);
  let texts = host.visibleTexts();
  assert.ok(texts.some((t) => t.startsWith("Couldn't load — This session is still being opened")), `says why: ${texts.join(' | ')}`);
  assert.ok(!texts.some((t) => /no other devices|no devices/i.test(t)), 'a refusal is not an empty state');
  assert.ok(await host.click('Retry'), 'Retry is offered');
  await new Promise((r) => setTimeout(r, 5));
  texts = host.visibleTexts();
  assert.ok(texts.includes('Chrome on Linux') && texts.includes('Last used 2026-09-03'), `the retry painted the list: ${texts.join(' | ')}`);
  assert.ok(!texts.some((t) => t.startsWith("Couldn't load")), 'the failure row is gone');
});

test('settings — a refused Google status never paints "Connect…" over a connected account; connected leads the copy', async () => {
  const { AskMyuSettingTab } = await import('../src/views/SettingsTab');
  const { Setting } = await import('./ui-stub');
  let answers = 0;
  const now = new Date().toISOString();
  const connected = { ok: true, status: 200, error: null, data: { connected: true, split_consent: true, credentials: [{ credential_id: 'c1', email: 'you@example.com', is_primary: true, services: { calendar: { state: 'connected', last_sync_at: now, events_synced: 0 }, mail: { state: 'connected', last_sync_at: now }, meeting_notes: { state: 'connected', last_sync_at: now } } }] } };
  const plugin = { settings: {}, backend: { googleOAuthStatus: async () => (answers++ === 0 ? { ok: false, status: 401, data: null, error: 'http_401' } : connected) } };
  const tab = new AskMyuSettingTab({} as never, plugin as never);
  const root = new FakeEl('div');
  const row = new Setting(root).setName('Google Calendar & Gmail').setDesc('Connect and Myu preps…');
  const host = root.createDiv();
  await (tab as unknown as { renderIntegrationStatus(r: unknown, p: string, h: FakeEl): Promise<void> }).renderIntegrationStatus(row, 'google', host);
  let texts = root.visibleTexts();
  assert.ok(texts.some((t) => t.startsWith("Couldn't check whether it is connected")), texts.join(' | '));
  assert.ok(!texts.includes('Connect…'), 'no invitation to connect on a refusal');
  assert.ok(await root.click('Retry'));
  await new Promise((r) => setTimeout(r, 5));
  texts = root.visibleTexts();
  assert.ok(texts.some((t) => t.startsWith('Connected as you@example.com. Read-only')), `connected leads, whatever the consent shape: ${texts.join(' | ')}`);
  assert.ok(texts.includes('Calendar') && texts.includes('Mail'), 'the service rows follow');
});

// ── Weave Myu in: one row, a pane of recipes, a picker (2026-09-03) ──────────

test('weave — one module owns the recipes: seven, unique, the folder woven in, each fenced so it survives its own fences', async () => {
  const { weaveSnippets, weaveGuide, fence } = await import('../src/vault/weaveRecipes');
  const snippets = weaveSnippets('Notes/Myu/');
  assert.equal(snippets.length, 7);
  assert.equal(new Set(snippets.map((s) => s.id)).size, 7, 'ids are unique');
  assert.ok(snippets.every((s) => s.id === 'uri' || s.text.includes('Notes/Myu')), 'the folder is woven into every vault snippet');
  assert.ok(!snippets.some((s) => s.text.includes('Notes/Myu//')), 'no trailing slash leaks into a path');
  const guide = weaveGuide('Notes/Myu');
  for (const s of snippets) assert.ok(guide.includes(`${s.name}\n\n${s.desc}\n\n`) && guide.includes(`\n${s.text}\n`), `${s.id} is in the guide with its words`);
  // A snippet that IS a fence gets a longer fence around it, so the copy is the whole block.
  assert.ok(guide.includes('````markdown\n```tasks\nnot done\npath includes Notes/Myu\n```\n````'), 'the Tasks block is wrapped in a four-tick fence');
  assert.equal(fence('plain', 'text'), '```text\nplain\n```');
  assert.ok(guide.startsWith('# Weave Myu in\n'), 'the pane carries its own title');
  const note = weaveGuide('Myu', { asNote: true });
  assert.ok(note.startsWith('---\nmyu-generated: true\n---\n'), 'as a note it is purgeable like everything Myu writes');
  assert.ok(!note.includes('# Weave Myu in\n'), 'as a note the file name is the title');
  assert.ok(guide.includes('app.plugins.plugins.askmyu.api'), 'the scripting API moved here from the settings pane');
});

test('weave — the picker lists the recipes and hands the chosen one back', async () => {
  const { WeaveSnippetModal } = await import('../src/views/WeaveSnippetModal');
  const picked: string[] = [];
  const modal = new WeaveSnippetModal({} as never, 'Myu', (s) => picked.push(s.text));
  const items = modal.getItems();
  assert.equal(items.length, 7);
  assert.ok(modal.getItemText(items[0]!).includes('Your day, inside every daily note'));
  modal.onChooseItem(items[1]!);
  assert.deepEqual(picked, ['![[Myu/Today]]']);
});

test('weave — the pane renders the guide, adds a copy button only where Obsidian left none, and offers to keep a copy only while Myu\'s folder is on', async () => {
  const { WeaveView, addCopyButtons } = await import('../src/views/WeaveView');
  const { markdownRenders } = await import('./ui-stub');
  const before = markdownRenders.length;
  const settings = { materialize_folder: 'Myu', materialize_consented: false, materialize_enabled: false };
  const plugin = { settings, app: {}, materializer: { writeGuide: async () => 'Myu/Weave Myu in.md' } };
  const view = new WeaveView({} as never, plugin as never);
  await view.onOpen();
  assert.equal(markdownRenders.length, before + 1, 'one render');
  assert.ok(markdownRenders[before]!.startsWith('# Weave Myu in'), 'the guide is what is rendered');
  assert.ok(!view.contentEl.visibleTexts().some((t) => t.startsWith('Keep a copy')), 'no write offered while the folder is off');
  settings.materialize_consented = true;
  settings.materialize_enabled = true;
  await view.render();
  assert.ok(view.contentEl.visibleTexts().includes('Keep a copy in Myu/'), 'the write is offered once the folder is on');

  // Copy buttons: one per bare <pre>, none where Obsidian already put one.
  const body = new FakeEl('div');
  const bare = body.createEl('pre'); bare.createEl('code', { text: '![[Myu/Today]]' });
  const dressed = body.createEl('pre'); dressed.createEl('code', { text: 'x' }); dressed.createEl('button', { cls: 'copy-code-button' });
  assert.equal(addCopyButtons(body), 1);
  assert.equal(body.querySelectorAll('.myu-copy-code').length, 1);
});

test('settings — Weave Myu in is one row with one door; the look links to the real file on GitHub', async () => {
  const src = await (await import('node:fs/promises')).readFile('src/views/SettingsTab.ts', 'utf8');
  const weave = src.slice(src.indexOf('private renderIntegrations('), src.indexOf('* The account itself'));
  assert.equal((weave.match(/new Setting\(/g) ?? []).length, 1, 'one recipes row — nothing else');
  assert.ok(!/'Copy'/.test(weave), 'no blind Copy buttons remain');
  assert.ok(/openWeave\(\)/.test(weave), 'the row opens the pane');
  assert.ok(src.includes("const MYU_LOOK_URL = 'https://github.com/AskMyu/askmyu-obsidian-plugin/raw/main/snippets/myu-look.css'"), 'the look points at the raw file');
  assert.ok(/descEl\.createEl\('a', \{ text: [^}]*href: MYU_LOOK_URL/.test(src), 'and it is a real link, not text');
  assert.ok(!/release zip/.test(src), 'no promise of a zip that BRAT releases do not carry');
});

// ── the Myu look: bundled, installed on request, undone from the same row (2026-09-03) ──

test('look — bundled as text and stamped with the build; an installed copy reads as this build\'s, an older build\'s, or not ours', async () => {
  const { lookText, lookStamp, lookStanding, lookPath, LOOK_NAME } = await import('../src/look');
  const text = lookText('0.0.246');
  assert.ok(text.startsWith('/* @myu-look 0.0.246 '), 'the stamp names the build');
  assert.ok(text.includes('--myu-cy:'), 'the look itself rides along as text');
  assert.equal(lookStamp(text), '0.0.246');
  assert.equal(lookStamp('body { color: red }'), null);
  assert.equal(lookPath('.obsidian'), '.obsidian/snippets/myu-look.css');
  assert.equal(lookPath('.config-alt'), '.config-alt/snippets/myu-look.css', 'the config folder is whatever the vault calls it');
  assert.equal(LOOK_NAME, 'myu-look');
  assert.deepEqual(lookStanding(null, '0.0.246'), { state: 'absent' });
  assert.deepEqual(lookStanding(text, '0.0.246'), { state: 'current', version: '0.0.246' });
  assert.deepEqual(lookStanding(lookText('0.0.240'), '0.0.246'), { state: 'different', version: '0.0.240' });
  assert.deepEqual(lookStanding(`${text}\n/* mine */`, '0.0.246'), { state: 'different', version: '0.0.246' });
  assert.deepEqual(lookStanding('body {}', '0.0.246'), { state: 'different', version: null });
});

test('look — install writes the stamped file and switches the snippet on; remove switches it off and deletes it; no switch → written, off', async () => {
  const { LookInstaller, lookText, snippetSwitch } = await import('../src/look');
  const files = new Map<string, string>();
  const log: string[] = [];
  const fs = {
    exists: async (p: string) => files.has(p),
    read: async (p: string) => files.get(p) ?? '',
    write: async (p: string, t: string) => { files.set(p, t); },
    remove: async (p: string) => { files.delete(p); },
    mkdir: async (p: string) => { log.push(`mkdir:${p}`); },
  };
  const enabled = new Set<string>();
  const app = { customCss: { enabledSnippets: enabled, setCssEnabledStatus: (n: string, on: boolean) => { if (on) enabled.add(n); else enabled.delete(n); log.push(`${on ? 'on' : 'off'}:${n}`); }, readSnippets: async () => { log.push('read'); } } };
  const inst = new LookInstaller(fs, '.obsidian', '0.0.246', snippetSwitch(app, 'myu-look'));
  assert.deepEqual(await inst.standing(), { state: 'absent' });
  assert.equal(inst.isOn(), false);
  assert.equal(await inst.install(), 'installed');
  assert.equal(files.get('.obsidian/snippets/myu-look.css'), lookText('0.0.246'));
  assert.deepEqual(log, ['mkdir:.obsidian/snippets', 'read', 'on:myu-look'], 'folder made, folder re-read, then switched on');
  assert.equal(inst.isOn(), true);
  assert.deepEqual(await inst.standing(), { state: 'current', version: '0.0.246' });
  await inst.setOn(false);
  assert.equal(inst.isOn(), false);
  await inst.setOn(true);
  await inst.remove();
  assert.equal(files.size, 0, 'the file is gone');
  assert.equal(inst.isOn(), false, 'and the snippet is off');
  // An Obsidian without app.customCss: written, and the row sends people to Appearance.
  const bare = new LookInstaller(fs, '.obsidian', '0.0.246', snippetSwitch({}, 'myu-look'));
  assert.equal(bare.isOn(), null);
  assert.equal(await bare.install(), 'installed_off');
  assert.ok(files.has('.obsidian/snippets/myu-look.css'));
});

test('settings — the Myu look row: Install; then Turn off / Remove; an older or edited copy gets Update and Remove behind a confirm', async () => {
  const { AskMyuSettingTab } = await import('../src/views/SettingsTab');
  const { LookInstaller, lookText, snippetSwitch } = await import('../src/look');
  const files = new Map<string, string>();
  const fs = {
    exists: async (p: string) => files.has(p),
    read: async (p: string) => files.get(p) ?? '',
    write: async (p: string, t: string) => { files.set(p, t); },
    remove: async (p: string) => { files.delete(p); },
    mkdir: async () => undefined,
  };
  const enabled = new Set<string>();
  const app = { customCss: { enabledSnippets: enabled, setCssEnabledStatus: (n: string, on: boolean) => { if (on) enabled.add(n); else enabled.delete(n); } } };
  const plugin = { app, manifest: { version: '0.0.246' }, lookInstaller: () => new LookInstaller(fs, '.obsidian', '0.0.246', snippetSwitch(app, 'myu-look')) };
  const tab = new AskMyuSettingTab(app as never, plugin as never);
  const host = new FakeEl('div');
  const tick = () => new Promise((r) => setTimeout(r, 5));
  const render = async () => { host.empty(); await (tab as unknown as { renderLook(el: FakeEl): Promise<void> }).renderLook(host); };
  await render();
  let texts = host.visibleTexts();
  assert.ok(texts.includes('Install the look') && texts.some((t) => t.includes('.obsidian/snippets/myu-look.css')), `absent: offers Install and names the file — ${texts.join(' | ')}`);
  assert.ok(await host.click('Install the look'));
  await tick();
  assert.equal(files.get('.obsidian/snippets/myu-look.css'), lookText('0.0.246'), 'installed this build\'s look');
  assert.ok(enabled.has('myu-look'), 'and switched it on');
  texts = host.visibleTexts();
  assert.ok(texts.includes('Turn off') && texts.includes('Remove') && texts.some((t) => t.startsWith('Installed from 0.0.246 and on')), `current + on: ${texts.join(' | ')}`);
  assert.ok(await host.click('Turn off'));
  await tick();
  texts = host.visibleTexts();
  assert.ok(!enabled.has('myu-look') && texts.includes('Turn on') && texts.some((t) => t.startsWith('Installed from 0.0.246, off')), `current + off: ${texts.join(' | ')}`);
  assert.ok(await host.click('Remove'));
  await tick();
  texts = host.visibleTexts();
  assert.equal(files.size, 0, 'removed the file');
  assert.ok(texts.includes('Install the look'), 'and offers Install again');
  // A copy from an older build (or an edited one): nothing is replaced or deleted without asking.
  files.set('.obsidian/snippets/myu-look.css', lookText('0.0.240'));
  await render();
  texts = host.visibleTexts();
  assert.ok(texts.includes('Update the look') && texts.includes('Remove') && !texts.includes('Install the look') && texts.some((t) => t.startsWith('A copy from 0.0.240')), `different: ${texts.join(' | ')}`);
  assert.ok(await host.click('Update the look'));
  await tick();
  assert.equal(files.get('.obsidian/snippets/myu-look.css'), lookText('0.0.240'), 'Update asks first — nothing replaced until the confirm');
  const src = await (await import('node:fs/promises')).readFile('src/views/SettingsTab.ts', 'utf8');
  assert.ok(!/['"`]\.obsidian/.test(src), 'no hardcoded .obsidian path — the vault\'s configDir is used');
  assert.ok(/text: 'The file on GitHub', href: MYU_LOOK_URL/.test(src), 'the row still links to the file');
});

// ── a device signed in but not approved: the approval lives on the machine (2026-09-03) ──
// Operator: "someone can flip between interfaces (browser and obsidian) and end up
// losing the flow of the signin/login process." Until now the dialog owned the poll
// and cancelled it on close; the Today pane called this state "Locked — try now".

test('approval — the machine owns it: a dialog closing does not cancel; denial and cancel are recorded; approval clears it', async () => {
  const { UnlockMachine } = await import('../src/auth/UnlockMachine');
  const { ApprovalModal } = await import('../src/views/ApprovalModal');
  // The machine polls on window timers; the test host has a bare window.
  const w = ((globalThis as { window?: Record<string, unknown> }).window ??= {});
  w['setInterval'] ??= setInterval;
  w['clearInterval'] ??= clearInterval;
  let status: 'pending' | 'denied' | 'approved' = 'pending';
  const moves: string[] = [];
  const api = {
    requestDeviceTransfer: async () => ({ ok: true, status: 200, data: { request_id: 'req-1', verification_code: '4242' }, error: null }),
    pollDeviceTransfer: async () => ({ ok: true, status: 200, data: status === 'approved' ? { status: 'approved', encrypted_mdek: 'raw' } : { status }, error: null }),
  };
  const machine = new UnlockMachine({
    api: api as never,
    keys: { isUnlocked: false, clear: () => undefined, set: () => undefined } as never,
    load: () => ({ token: 't', device_id: 'dev-1', wrapped_mdek: null, session_token: 's', account_id: 'acc', background_work_consented: null }) as never,
    save: async () => undefined,
    onSession: () => undefined,
    onState: (st, d) => { moves.push(`state:${st}:${d ?? ''}`); },
    onApproval: () => { moves.push(`approval:${machine.approval?.status ?? 'none'}`); },
    deviceName: 'Obsidian — test',
    mockMode: () => true,
    pollIntervalMs: 10,
  });
  const settle = () => new Promise((r) => setTimeout(r, 40));

  const pending = await machine.beginApproval();
  assert.equal(pending?.verificationCode, '4242');
  assert.equal(machine.approval?.status, 'pending');
  assert.deepEqual(moves, ['approval:pending'], 'the pane is told the moment it starts');

  // The dialog is a window onto it: it shows the machine's code, and closing changes nothing.
  const modal = new ApprovalModal({} as never, machine, () => undefined);
  modal.open();
  assert.ok(modal.contentEl.visibleTexts().includes('4242'), `the dialog shows the code in flight — ${modal.contentEl.visibleTexts().join(' | ')}`);
  modal.close();
  await settle();
  assert.equal(machine.approval?.status, 'pending', 'closing the dialog is not cancelling');

  // Declined on the other device: recorded, the poll stops.
  status = 'denied';
  await settle();
  assert.equal(machine.approval?.status, 'denied');
  assert.ok(moves.includes('approval:denied'));
  const askedAfter = moves.length;
  await settle();
  assert.equal(moves.length, askedAfter, 'nothing polls after a verdict');

  // Try again → pending; an explicit cancel clears it.
  status = 'pending';
  await machine.beginApproval();
  assert.equal(machine.approval?.status, 'pending');
  machine.cancelApproval();
  assert.equal(machine.approval, null);
  assert.ok(moves.includes('approval:none'));

  // A refused request names its cause: the prod case was 429 — three requests an hour.
  const limited = new UnlockMachine({
    api: { requestDeviceTransfer: async () => ({ ok: false, status: 429, data: null, error: 'rate_limit_exceeded' }) } as never,
    keys: { isUnlocked: false, clear: () => undefined, set: () => undefined } as never,
    load: () => ({ token: 't', device_id: 'dev-1', wrapped_mdek: null, session_token: 's', account_id: 'acc', background_work_consented: null }) as never,
    save: async () => undefined, onSession: () => undefined, onState: () => undefined, deviceName: 'x', mockMode: () => true, pollIntervalMs: 10,
  });
  assert.equal(await limited.beginApproval(), null);
  assert.deepEqual(limited.approval, { status: 'failed', failure: { step: 'request', status: 429, error: 'rate_limit_exceeded' } });
  const { approvalFailureText } = await import('../src/views/approvalCopy');
  assert.match(approvalFailureText({ step: 'request', status: 429, error: 'rate_limit_exceeded' }), /Too many approval requests in the last hour/);
  assert.match(approvalFailureText({ step: 'request', status: 0, error: 'offline' }), /^Could not start the approval\. askMyu could not be reached/);
  assert.match(approvalFailureText({ step: 'poll', status: 403, error: 'http_403' }), /^Could not check on the approval\. This session is still being opened/);
  assert.match(approvalFailureText({ step: 'handover', status: 0, error: null }), /key handover/);

  // While waiting, a pause or a server hiccup is not a verdict; a request the server forgot has aged out.
  let pollAnswer: { ok: boolean; status: number; data: unknown; error: string | null } = { ok: false, status: 503, data: null, error: 'http_503' };
  const flaky = new UnlockMachine({
    api: {
      requestDeviceTransfer: async () => ({ ok: true, status: 200, data: { request_id: 'req-2', verification_code: '9999' }, error: null }),
      pollDeviceTransfer: async () => pollAnswer,
    } as never,
    keys: { isUnlocked: false, clear: () => undefined, set: () => undefined } as never,
    load: () => ({ token: 't', device_id: 'dev-1', wrapped_mdek: null, session_token: 's', account_id: 'acc', background_work_consented: null }) as never,
    save: async () => undefined, onSession: () => undefined, onState: () => undefined, deviceName: 'x', mockMode: () => true, pollIntervalMs: 10,
  });
  await flaky.beginApproval();
  await settle();
  assert.equal(flaky.approval?.status, 'pending', 'a 503 while polling keeps waiting');
  pollAnswer = { ok: false, status: 429, data: null, error: 'http_429' };
  await settle();
  assert.equal(flaky.approval?.status, 'pending', 'so does a 429');
  pollAnswer = { ok: false, status: 404, data: null, error: 'request_not_found' };
  await settle();
  assert.equal(flaky.approval?.status, 'expired', 'a request the server no longer knows has aged out');

  // Approved: the handover runs, then the record clears (the unlock itself is adoptMDEK's, covered by transfer.e2e).
  await machine.beginApproval();
  (machine as unknown as { completeApproval: () => Promise<boolean> }).completeApproval = async () => true;
  status = 'approved';
  await settle();
  assert.equal(machine.approval, null, 'an approval leaves no record behind');
});

test('Today — signed in but not approved is its own screen: the way forward, the code while waiting, the retry after a verdict, never "locked"', async () => {
  const { TodayView } = await import('../src/views/TodayView');
  const calls: string[] = [];
  const mk = (detail: string | null, approval: unknown, unlockExtra: Record<string, unknown> = {}) => {
    const view = Object.create(TodayView.prototype) as InstanceType<typeof TodayView> & Record<string, unknown>;
    view['plugin'] = {
      lastStateDetail: detail,
      unlock: {
        current: 'blocked',
        genesisPending: false,
        approval,
        beginApproval: async () => { calls.push('begin'); return { requestId: 'r', verificationCode: '1234' }; },
        cancelApproval: () => { calls.push('cancel'); },
        disconnect: async () => { calls.push('disconnect'); },
        ...unlockExtra,
      },
      openGenesisCeremony: () => { calls.push('genesis'); },
      termsStanding: () => 'ok',
    };
    view['app'] = {};
    view['refresh'] = async () => { calls.push('refresh'); };
    view['contentEl'] = new FakeEl('div');
    return view;
  };
  const blocked = (view: ReturnType<typeof mk>) => { const root = new FakeEl('div'); (view as unknown as { renderBlocked(r: FakeEl): void }).renderBlocked(root); return root; };

  // Signed in, nothing started yet.
  let root = blocked(mk('existing_account', null));
  let texts = root.visibleTexts();
  assert.ok(texts.some((t) => t.startsWith('You are signed in, but this device is not approved yet')), texts.join(' | '));
  assert.ok(texts.includes('Get this device approved…') && texts.includes('Use my recovery phrase') && texts.includes('Sign out'), 'three doors: approve, phrase, leave');
  assert.ok(!texts.some((t) => /Locked|Try now/.test(t)), 'never the locked copy');
  assert.ok(await root.click('Get this device approved…'));
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(calls.splice(0), ['begin', 'refresh'], 'the pane starts the approval itself and re-reads');

  // Waiting: the code, in the pane, with cancel and the phrase route.
  root = blocked(mk('existing_account', { status: 'pending', requestId: 'r', code: '1234', startedAt: 0 }));
  texts = root.visibleTexts();
  assert.ok(texts.includes('1234') && texts.includes('Cancel') && texts.includes('Use my recovery phrase instead'), texts.join(' | '));
  assert.ok(!texts.includes('Get this device approved…'), 'no second start while one is in flight');
  assert.ok(await root.click('Cancel'));
  assert.deepEqual(calls.splice(0), ['cancel', 'refresh']);

  // A verdict: said, with Try again.
  root = blocked(mk('existing_account', { status: 'denied' }));
  texts = root.visibleTexts();
  assert.ok(texts.includes('That request was declined on the other device.') && texts.includes('Try again'), texts.join(' | '));
  root = blocked(mk('existing_account', { status: 'expired' }));
  assert.ok(root.visibleTexts().includes('The request timed out.'));
  root = blocked(mk('existing_account', { status: 'failed', failure: { step: 'request', status: 429, error: 'rate_limit_exceeded' } }));
  assert.ok(root.visibleTexts().some((t) => t.startsWith('Too many approval requests in the last hour')), 'a refused request says why, not "did not finish"');

  // The other reasons a device is blocked keep their own words and doors.
  assert.ok(blocked(mk('device_revoked', null)).visibleTexts().some((t) => t.startsWith('This device was removed from your account')));
  assert.ok(blocked(mk('token_revoked', null)).visibleTexts().includes('Sign in'));
  root = blocked(mk('genesis_pending', null, { genesisPending: true }));
  assert.ok(root.visibleTexts().includes('Finish setup…'));
  await root.click('Finish setup…');
  assert.deepEqual(calls.splice(0), ['genesis']);

  // And refresh() routes a blocked machine here, not to "Locked".
  const view = mk('existing_account', null);
  view['refresh'] = TodayView.prototype.refresh;
  view['loading'] = false;
  await (view as unknown as { refresh(): Promise<void> }).refresh();
  texts = (view['contentEl'] as FakeEl).visibleTexts();
  assert.ok(texts.includes('Get this device approved…') && !texts.some((t) => /Locked/.test(t)), `refresh paints the blocked screen: ${texts.join(' | ')}`);
});

// ── the request budget and the Today gate (2026-09-03, the WAF incident) ─────

test('budget — a bucket paces a stream, a 429 rests only its endpoint for exactly Retry-After, a bare 403 rests everything', async () => {
  const { RequestBudget, retryAfterMs } = await import('../src/transport/budget');
  let t = 1_000_000;
  const slept: number[] = [];
  const sleep = async (ms: number) => { slept.push(ms); t += ms; };
  const b = new RequestBudget({ perSecond: 5, burst: 3, defaultPauseMs: 60_000, wafPauseMs: 300_000, maxWaitMs: 30_000, now: () => t });
  for (let i = 0; i < 3; i++) assert.deepEqual(await b.acquire('/a', sleep), { ok: true }, 'the burst goes at once');
  assert.deepEqual(slept, []);
  await b.acquire('/a', sleep);
  assert.deepEqual(slept, [200], 'the fourth waits one token at 5/s');
  // A 429 with Retry-After: that endpoint rests for exactly that long; another endpoint does not.
  b.pause('/card/person?id=1', 7_000);
  assert.equal(b.waitFor('/card/person?id=2'), 7_000, 'the pause is per endpoint, query stripped');
  assert.ok(b.waitFor('/feed/brief') < 7_000, 'other endpoints carry on');
  b.pause('/x', null);
  assert.equal(b.waitFor('/x'), 60_000, 'no Retry-After → the default');
  // retry_after: 0 is the invalidated-request case (start over) — no rest at all.
  b.pause('/y', 0);
  assert.ok(b.waitFor('/y') < 60_000, 'an explicit zero rests nothing — the request is invalidated, waiting is the wrong move');
  // Past the cap: a synthetic pause, nothing on the wire.
  const r = await b.acquire('/x', sleep);
  assert.deepEqual(r, { ok: false, retryAfterMs: 60_000 });
  // A bare 403 — the WAF — rests everything, long and flat.
  b.pauseAll();
  assert.equal(b.waitFor('/feed/brief'), 300_000);
  assert.equal(b.pausedMs(), 300_000);
  // Retry-After parsing: header seconds, header date, body seconds, nothing.
  assert.equal(retryAfterMs({ 'retry-after': '42' }, null), 42_000);
  assert.equal(retryAfterMs({ 'Retry-After': new Date(1_005_000).toUTCString() }, null, 1_000_000), 5_000, 'an HTTP date, whole seconds');
  assert.equal(retryAfterMs({}, { retry_after: 9 }), 9_000);
  assert.equal(retryAfterMs(undefined, { error: 'x' }), null);
});

test('transport — a 429 rests the endpoint and the next call to it is answered as a pause without touching the wire; a bare 403 is the WAF', async () => {
  const { Transport } = await import('../src/transport');
  const { RequestBudget } = await import('../src/transport/budget');
  const { answerRequestsWith, httpRequests } = await import('./ui-stub');
  const wire: string[] = [];
  answerRequestsWith(async (opts) => {
    const url = String(opts.url);
    wire.push(url);
    if (url.endsWith('/card/person?id=1')) return { status: 429, headers: { 'retry-after': '120' }, json: { error: 'rate_limit_exceeded', retry_after: 120 }, text: '' };
    if (url.endsWith('/waf')) return { status: 403, headers: {}, json: null, text: 'Forbidden' };
    return { status: 200, headers: {}, json: { ok: 1 }, text: '' };
  });
  let t = 5_000_000;
  const budget = new RequestBudget({ perSecond: 100, burst: 100, maxWaitMs: 1_000, now: () => t });
  const tr = new Transport({ baseUrl: 'https://x/api', authToken: 'live', budget });
  const first = await tr.get('/card/person?id=1');
  assert.equal(first.status, 429);
  const second = await tr.get('/card/person?id=2');
  assert.equal(second.status, 429);
  assert.equal(second.error, 'paused', 'the endpoint rests; the second call never went out');
  assert.deepEqual(second.data, { retry_after: 120 }, 'and says how long');
  assert.equal(wire.filter((u) => u.includes('/card/person')).length, 1);
  assert.equal((await tr.get('/feed/brief')).status, 200, 'another endpoint is unaffected');
  t += 121_000;
  assert.equal((await tr.get('/card/person?id=2')).status, 200, 'after Retry-After it goes again');
  // The WAF: a bare 403, then everything is paused.
  assert.equal((await tr.get('/waf')).status, 403);
  const blocked = await tr.get('/feed/brief');
  assert.equal(blocked.error, 'paused', 'every endpoint rests after a WAF 403');
  assert.ok(budget.pausedMs() >= 299_000 && budget.pausedMs() <= 300_000);
  answerRequestsWith(null);
  httpRequests.length = 0;
});

test('refresh gate — fifty asks in a burst are two fetches; the person\'s own ask goes at once; a trailing run catches what arrived mid-fetch', async () => {
  const { RefreshGate } = await import('../src/refreshGate');
  let t = 100_000;
  const log: string[] = [];
  const timers = { now: () => t, sleep: async (ms: number) => { t += ms; log.push(`sleep:${ms}`); } };
  let resolveRun: (() => void) | null = null;
  const gate = new RefreshGate(async () => { log.push(`run@${t}`); await new Promise<void>((r) => { resolveRun = r; }); }, 5_000, timers);
  // The first ask starts a fetch at once; forty-nine more land while it is in flight.
  const first = gate.request();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(gate.runs, 1, 'one fetch in flight');
  const asks = Array.from({ length: 49 }, () => gate.request());
  assert.equal(gate.runs, 1, 'still one — the rest fold into a trailing run');
  resolveRun!();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(gate.runs, 2, 'plus exactly one trailing run for what arrived mid-fetch');
  resolveRun!();
  await Promise.all([first, ...asks]);
  assert.deepEqual(log, ['run@100000', 'sleep:5000', 'run@105000'], 'the trailing run waited the gap');
  // Asks that land during a gap wait are folded into the run that follows — no extra fetch.
  log.length = 0;
  const during = Array.from({ length: 10 }, () => gate.request());
  await new Promise((r) => setTimeout(r, 0));
  resolveRun!();
  await Promise.all(during);
  assert.deepEqual(log, ['sleep:5000', 'run@110000'], 'ten asks in a gap are one fetch after it');
  // An urgent ask that lands DURING a gap wait cuts it short (a state change
  // used to sit behind a paced request's five seconds — the sign-in pane
  // showed the previous screen, 2026-09-03).
  {
    let release: (() => void) | null = null;
    const slow = { now: () => t, sleep: () => new Promise<void>((r) => { release = r; }) };
    const held = new RefreshGate(async () => { log.push(`held-run@${t}`); }, 5_000, slow);
    log.length = 0;
    t = 200_000;
    await held.request();                         // first: runs at once, sets `last`
    const paced = held.request();                 // inside the gap: begins a wait that never ends on its own
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(held.runs, 1, 'the paced ask is waiting');
    const urgent = held.request({ now: true });   // the person's ask wakes it
    await Promise.all([paced, urgent]);
    assert.equal(held.runs, 2, 'the wait was cut short and the run happened');
    assert.ok(release !== null, 'the slow sleep was indeed in progress');
  }
  // The person presses Sync: no gap for them.
  log.length = 0;
  const p = gate.request({ now: true });
  await new Promise((r) => setTimeout(r, 0));
  resolveRun!();
  await p;
  assert.deepEqual(log, ['run@200000'], 'immediate');
});

test('Today — a progress line repaints one row and fetches nothing', async () => {
  const { TodayView } = await import('../src/views/TodayView');
  const view = Object.create(TodayView.prototype) as InstanceType<typeof TodayView> & Record<string, unknown>;
  let fetched = 0;
  const plugin = { materializeProgress: 'Myu is writing your people — 1 of 116' as string | null, backend: { getBrief: async () => { fetched += 1; return { ok: true, status: 200, data: {}, error: null }; } } };
  view['plugin'] = plugin;
  view['loading'] = false;
  view['errorState'] = null;
  const content = new FakeEl('div');
  view['contentEl'] = content;
  let renders = 0;
  view['render'] = () => { renders += 1; const row = content.createDiv({ cls: 'myu-cue-row myu-materialize-progress' }); row.createSpan({ cls: 'myu-quiet', text: plugin.materializeProgress ?? '' }); };
  view.paintProgress();
  assert.equal(renders, 1, 'no row yet → one local render');
  plugin.materializeProgress = 'Myu is writing your people — 2 of 116';
  view.paintProgress();
  assert.equal(renders, 1, 'the row exists → no render');
  assert.ok(content.visibleTexts().includes('Myu is writing your people — 2 of 116'), 'the row says the new line');
  plugin.materializeProgress = null;
  view.paintProgress();
  assert.equal(content.querySelectorAll('.myu-materialize-progress').length, 0, 'the line went away → the row goes');
  assert.equal(fetched, 0, 'and nothing was fetched at any point');
});

// ── batched reads (backend 2026-09-03): the bundle, the delta feed, the ids ──

test('features — the batched-reads flags parse only booleans and default off', async () => {
  const { parseBackendFlags, BACKEND_FLAGS_OFF } = await import('../src/transport/api');
  assert.deepEqual(parseBackendFlags(null), BACKEND_FLAGS_OFF);
  assert.deepEqual(parseBackendFlags({ today_bundle: 'yes', vault_changes: 1 }), BACKEND_FLAGS_OFF, 'truthy is not true');
  assert.deepEqual(parseBackendFlags({ today_bundle: true, vault_changes: true, entities_changed_ids: true, entity_changed_at: true, retry_after_header: true }), { today_bundle: true, vault_changes: true, entities_changed_ids: true, entity_changed_at: true, retry_after_header: true });
});

test('Today — one bundle unpacks into the six reads the pane knows; a null part fails alone; a refused bundle refuses brief and events', async () => {
  const { readsFromBundle } = await import('../src/views/todayReads');
  const ok = { ok: true, status: 200, error: null, data: { brief: { brief: { date: '2026-09-03' } }, events: { events: [] }, mirror: null, weekly: { edition: { week: 'W36' } }, loop: { loop: null }, help_queue: { queue: [{ id: 'h1' }] }, server_time: 1, errors: { mirror: 'timeout' } } };
  const r = readsFromBundle(ok as never);
  assert.equal(r.brief.ok, true);
  assert.deepEqual(r.brief.data, { brief: { date: '2026-09-03' } }, 'the part is the endpoint\'s own payload');
  assert.equal(r.events.ok, true);
  assert.equal(r.mirror, null, 'a null part reads as absent, like a caught failure did');
  assert.equal(r.weekly?.ok, true);
  assert.deepEqual(r.helpQueue, [{ id: 'h1' }]);
  const refused = readsFromBundle({ ok: false, status: 429, data: null, error: 'paused' });
  assert.equal(refused.brief.ok, false);
  assert.equal(refused.brief.error, 'paused', 'the pane sees the same refusal it would have from the brief call');
  assert.equal(refused.helpQueue, null, 'and asks the old way for the queue');
  const half = readsFromBundle({ ok: true, status: 200, error: null, data: { brief: null, events: { events: [] }, errors: { brief: 'brief failed' } } } as never);
  assert.equal(half.brief.ok, false);
  assert.equal(half.brief.error, 'brief failed', 'a failed part carries its own message');
});

test('sync — the delta feed replaces a card call per person: pages merge journal days, stamps skip unchanged cards, removed people go to the trash, and the cursor advances only on a whole read', async () => {
  const { MaterializationService } = await import('../src/vault/MaterializationService');
  const { TFile } = await import('./ui-stub');
  const w = ((globalThis as { window?: Record<string, unknown> }).window ??= {});
  w['setTimeout'] ??= setTimeout;
  const files = new Map<string, string>();
  const log: string[] = [];
  const tfile = (path: string) => Object.assign(new TFile(), { path });
  const fmOf = (text: string) => { const m = /^---\n([\s\S]*?)\n---/.exec(text); const fm: Record<string, string> = {}; for (const line of (m?.[1] ?? '').split('\n')) { const i = line.indexOf(':'); if (i > 0) fm[line.slice(0, i).trim()] = line.slice(i + 1).trim(); } return fm; };
  const app = {
    vault: {
      getAbstractFileByPath: (p: string) => (files.has(p) ? tfile(p) : null),
      cachedRead: async (f: { path: string }) => files.get(f.path) ?? '',
      process: async (f: { path: string }, fn: (s: string) => string) => { files.set(f.path, fn(files.get(f.path) ?? '')); },
      create: async (p: string, c: string) => { files.set(p, c); },
      createFolder: async () => undefined,
      getMarkdownFiles: () => [...files.keys()].map(tfile),
      getFirstLinkpathDest: () => null,
    },
    metadataCache: { getFileCache: (f: { path: string }) => ({ frontmatter: fmOf(files.get(f.path) ?? '') }) },
    fileManager: { trashFile: async (f: { path: string }) => { files.delete(f.path); log.push(`trash:${f.path}`); } },
  };
  const settings: Record<string, unknown> = {
    account_id: 'acc', materialize_folder: 'Myu', materialize_consented: true, materialize_enabled: true, materialize_people: true, materialize_commitments: false,
    materialize_meetings_history: true, materialize_journal_history: true, materialize_calendar: false, materialize_today: false,
    myu_checkbox_state: {}, myu_file_hashes: {}, myu_entity_changed_at: {}, memories_by_day: {}, vault_changes_since: 0, last_people_materialize: 0, last_history_materialize: 0,
  };
  const ok = (data: unknown) => ({ ok: true, status: 200, data, error: null });
  const card = (name: string, id: string) => ({ entity_id: id, header: { display_name: name, subtitle: 'Founder' }, sections: [] });
  const pages = [
    { server_time: 9_000, since: 0, self: { card: card('You', 'me') }, people: [{ entity_id: 'rel-1', changed_at: 100, card: card('Marcus Webb', 'rel-1') }, { entity_id: 'rel-2', changed_at: 200, card: card('Priya Raman', 'rel-2') }], companies: [{ entity_id: 'co-1', changed_at: 50, card: card('Acme', 'co-1') }], meetings: [{ meeting_id: 'm1', title: 'Kickoff', meeting_date: '2026-09-01T10:00:00Z' }], journal_days: [{ day: '2026-09-01', entries: [{ journal_id: 'j1', content: 'morning', timestamp: Date.parse('2026-09-01T08:00:00Z') }] }], removed: ['rel-gone'], next_cursor: 'p2' },
    { server_time: 9_000, since: 0, people: [], companies: [], meetings: [], journal_days: [{ day: '2026-09-01', entries: [{ journal_id: 'j2', content: 'evening', timestamp: Date.parse('2026-09-01T20:00:00Z') }] }], next_cursor: null },
  ];
  const api = {
    listEntities: async (tab: string, opts?: { changedSince?: number }) => { log.push(`list:${tab}:${opts?.changedSince ?? 'all'}`); return ok({ entities: tab === 'person' ? [{ entity_type: 'person', entity_id: 'rel-1', display_name: 'Marcus Webb', organization: 'Acme', item_count: 0, top_urgency: 'low', changed_at: 100 }] : [] }); },
    getVaultChanges: async (since: number, cursor: string | null) => { log.push(`changes:${since}:${cursor ?? '-'}`); return ok(cursor === 'p2' ? pages[1] : pages[0]); },
    getCard: async (_t: string, id: string) => { log.push(`card:${id}`); return ok({ card: card('X', id) }); },
    getRelationshipMemories: async (id: string) => { log.push(`memories:${id}`); return ok({ memories: [] }); },
    getMeetingDetail: async (id: string) => { log.push(`meeting:${id}`); return ok({ meeting: { meeting_id: id, title: 'Kickoff' }, key_points: ['x'] }); },
    getJournalChats: async (id: string) => { log.push(`chats:${id}`); return ok({ chats: [] }); },
    listVaultCommitments: async () => ok({ commitments: [] }),
  };
  // A page for a person the server has since removed.
  files.set('Myu/People/Gone Person.md', '---\ntype: myu-person\nmyu-id: rel-gone\n---\n# Gone');
  const svc = new MaterializationService({
    app: app as never, api: () => api as never, settings: () => settings as never, save: async () => undefined, canRun: () => true,
    findTheirPage: () => null, onProgress: (line) => { if (line) log.push(`progress:${line}`); }, contentKey: () => ({}) as CryptoKey,
    flags: () => ({ today_bundle: true, vault_changes: true, entities_changed_ids: true, entity_changed_at: true, retry_after_header: true }), paceMs: 0,
  });

  const first = await svc.syncChanges('full');
  assert.equal(first.people, 2, 'two people written from the feed');
  assert.ok(files.get('Myu/People/Marcus Webb.md')?.includes('Marcus Webb'), 'the page comes from the card in the feed');
  assert.ok(files.get('Myu/People/Priya Raman.md'), 'a person the changed-list did not name is still written, from the card');
  assert.ok(files.get('Myu/Companies/Acme.md'));
  assert.ok(files.get('Myu/Me.md'), 'self rides on the first page');
  assert.ok(files.has('Myu/Meetings/2026-09-01 Kickoff.md'), 'a meeting row became a note (detail fetched)');
  const day = files.get('Myu/Journal/2026-09-01.md') ?? '';
  assert.ok(day.includes('morning') && day.includes('evening'), `a day split across two pages is one note: ${day.slice(0, 120)}`);
  assert.ok(log.includes('trash:Myu/People/Gone Person.md'), 'a removed person goes to the trash');
  assert.ok(!log.some((l) => l.startsWith('card:')), 'no single-card call was made');
  assert.equal(settings.vault_changes_since, 9_000, 'the server time becomes the next since');
  assert.deepEqual(settings.myu_entity_changed_at, { 'rel-1': 100, 'rel-2': 200, 'co-1': 50 });
  assert.ok(log.includes('changes:0:-') && log.includes('changes:0:p2'), 'both pages read with since 0');

  // Second pass, delta: the same stamps → nothing rewritten, no memories fetched, since advances.
  log.length = 0;
  pages[0].removed = []; pages[0].self = null as never;
  const second = await svc.syncChanges('delta');
  assert.equal(second.people, 0);
  assert.ok(log.includes('list:person:9000') && log.includes('changes:9000:-'), `asks by since: ${log.join(' ')}`);
  assert.ok(!log.some((l) => l.startsWith('memories:')), 'unchanged cards cost nothing');

  // A refused page keeps the old since so the next sync re-asks.
  log.length = 0;
  const refusing = { ...api, getVaultChanges: async () => ({ ok: false, status: 429, data: null, error: 'paused' }) };
  const svc2 = new MaterializationService({ app: app as never, api: () => refusing as never, settings: () => settings as never, save: async () => undefined, canRun: () => true, findTheirPage: () => null, onProgress: () => undefined, contentKey: () => ({}) as CryptoKey, flags: () => ({ today_bundle: true, vault_changes: true, entities_changed_ids: true, entity_changed_at: true, retry_after_header: true }), paceMs: 0 });
  settings.vault_changes_since = 9_000;
  await svc2.syncChanges('delta');
  assert.equal(settings.vault_changes_since, 9_000, 'since did not move on a refused page');

  // entities_changed with ids: exactly those cards, now.
  log.length = 0;
  await svc.refreshPeopleByIds(['rel-1', 'nope']);
  assert.deepEqual(log.filter((l) => l.startsWith('card:')), ['card:rel-1'], 'one card call, for the named id only');
});

test('sync — two overlapping full sweeps are one: the ambient ratchet cannot start a second while the open sweep runs', async () => {
  const { MaterializationService } = await import('../src/vault/MaterializationService');
  let sweeps = 0;
  const svc = new MaterializationService({
    app: { vault: { getAbstractFileByPath: () => null, create: async () => undefined, createFolder: async () => undefined, getMarkdownFiles: () => [] } } as never,
    api: () => ({ listEntities: async () => ({ ok: true, status: 200, data: { entities: [] }, error: null }), getVaultChanges: async () => { sweeps += 1; await new Promise((r) => setTimeout(r, 20)); return { ok: true, status: 200, data: { server_time: 1, people: [], next_cursor: null }, error: null }; }, listVaultCommitments: async () => ({ ok: true, status: 200, data: { commitments: [] }, error: null }) }) as never,
    settings: () => ({ materialize_consented: true, materialize_enabled: true, materialize_people: true, materialize_today: false, materialize_commitments: false, materialize_calendar: false, materialize_folder: 'Myu', myu_file_hashes: {}, myu_entity_changed_at: {}, vault_changes_since: 0, last_people_materialize: 0, last_history_materialize: Date.now() }) as never,
    save: async () => undefined, canRun: () => true, findTheirPage: () => null, onProgress: () => undefined, contentKey: () => null,
    flags: () => ({ today_bundle: true, vault_changes: true, entities_changed_ids: true, entity_changed_at: true, retry_after_header: true }), paceMs: 0,
  });
  await Promise.all([svc.materializeAll(), svc.materializeAll(), svc.refreshAmbient()]);
  assert.equal(sweeps, 1, 'one feed read for three overlapping asks');
});
