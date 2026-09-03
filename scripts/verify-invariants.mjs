/**
 * The structural QA invariants, checked against the source tree.
 *
 * Three of the plan's eight are properties of the CODE'S SHAPE rather than of
 * any behaviour you can call: "vault-write capability lives in exactly one
 * module", "`Notice` never appears on an initiative path", "no raw key at rest".
 * The plan says grep-provable — so this is the grep, run in CI and before each
 * phase ships, rather than a promise someone re-checks by memory.
 *
 * Run: pnpm verify
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const SRC = 'src';

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (path.endsWith('.ts')) out.push(path);
  }
  return out;
}

/** Source with comments blanked out — a checker that reads prose as code is a
    checker people stop running (the invariant-4 lesson, generalized). */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

const files = walk(SRC).map((path) => ({ path, source: readFileSync(path, 'utf8') }));
const failures = [];

function check(name, fn) {
  const problem = fn();
  if (problem) failures.push(`${name}\n    ${problem}`);
  else console.log(`  ok  ${name}`);
}

// ── invariant 3: vault writes live in exactly one module ────────────────────

check('invariant 3 — vault-write capability is confined to one module', () => {
  // Obsidian's write surface. `process`/`create` are the ones that touch files;
  // adapter.write goes around the vault API entirely.
  const WRITE = /\bvault\.(create|modify|process|append|delete|trash|rename|copy)\b|\badapter\.(write|append|remove|mkdir)\b/;
  const writers = files.filter((f) => WRITE.test(f.source)).map((f) => f.path);

  // The vault/ MODULE is the whitelist (parity-spec cross-cutting rule):
  // WeeklyReviewWriter, CanvasExporter, ConversationWriter. Everything there is
  // opt-in and exposure-warned; a writer appearing anywhere else — a view, the
  // capture pipeline — is the bug this check exists to catch.
  const allowedDir = join('src', 'vault') + '/';
  const unexpected = writers.filter((p) => !p.startsWith(allowedDir));

  return unexpected.length
    ? `these modules can write to the vault: ${unexpected.join(', ')}. Write ` +
        `capability lives only in src/vault/ (opt-in, exposure-warned).`
    : null;
});

// ── invariant 4: Notice is never an initiative channel ──────────────────────

check('invariant 4 — Notice is imported in exactly one module', () => {
  // Parse the import BINDINGS, not the file text: every module that documents
  // why it doesn't toast mentions the word, and a check that can't tell a
  // comment from an import cries wolf until someone stops running it.
  const importers = files
    .filter(({ source }) =>
      [...source.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]obsidian['"]/g)].some(([, bindings]) =>
        bindings.split(',').some((b) => b.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim() === 'Notice'),
      ),
    )
    .map((f) => f.path);

  const allowed = new Set([join('src', 'notify.ts')]);
  const unexpected = importers.filter((p) => !allowed.has(p));

  return unexpected.length
    ? `Notice reached ${unexpected.join(', ')}. Route messages through ` +
        `src/notify.ts, which documents why toasts are errors/status only.`
    : null;
});

// ── invariant 8: no raw key material at rest ────────────────────────────────

check('invariant 8 — nothing persists a raw key', () => {
  // Every persistence path in the plugin runs through saveData/settings. A raw
  // key reaching one of them would be a silent, total loss of the split-custody
  // guarantee, so the names are checked rather than trusted.
  const BAD = [
    { re: /exportKeyAsBase64\s*\([^)]*\)\s*[,;]?\s*$/m, why: 'an exported key on a persistence line' },
    { re: /(settings|data)\.[A-Za-z_]*(mdek|kek)[A-Za-z_]*\s*=\s*(?!null)(?!.*wrapped)/i, why: 'a key assigned into settings' },
    { re: /localStorage\.setItem\([^)]*(kek|mdek|phrase|recovery)/i, why: 'key material in localStorage' },
  ];

  const hits = [];
  for (const { path, source } of files) {
    // The KeyHolder legitimately exports for session escrow, and the unlock
    // machine legitimately exports the KEK to hand it to the server. Both are
    // the design; both are documented at their call sites.
    if (path.endsWith(join('crypto', 'KeyHolder.ts'))) continue;
    for (const { re, why } of BAD) if (re.test(source)) hits.push(`${path}: ${why}`);
  }

  return hits.length ? hits.join('; ') : null;
});

check('invariant 8 — the only persisted key material is the WRAPPED blob', () => {
  const settings = files.find((f) => f.path.endsWith(join('src', 'settings.ts')));
  if (!settings) return 'src/settings.ts is missing';

  // Field names in the persisted shape that look like key material.
  const fields = [...settings.source.matchAll(/^\s{2}([a-z_]+):/gm)].map((m) => m[1]);
  const keyish = fields.filter((f) => /(kek|mdek|key|secret|phrase)/i.test(f));
  const allowed = ['wrapped_mdek'];
  const unexpected = keyish.filter((f) => !allowed.includes(f));

  return unexpected.length
    ? `persisted settings contain key-ish fields beyond the wrapped blob: ${unexpected.join(', ')}`
    : null;
});

// ── shared-package boundary: types cross, runtime does not ─────────────────

check('boundary — @askmyu/shared is imported as types only, and only in src/wire', () => {
  const problems = [];

  for (const { path, source } of files) {
    const imports = [...source.matchAll(/import\s+(type\s+)?([\s\S]*?)from\s*['"](@askmyu\/shared[^'"]*)['"]/g)];
    if (imports.length === 0) continue;

    // One seam, so the mirror swap is a single file rather than a rewrite.
    if (!path.startsWith(join('src', 'wire'))) {
      problems.push(`${path} imports @askmyu/shared directly — go through src/wire`);
      continue;
    }

    for (const [, typeKeyword, bindings, module] of imports) {
      // `import type {...}` or `import { type A, type B }` are both fine; a bare
      // value import is what would drag runtime code into a public bundle.
      const everyBindingIsType = bindings
        .replace(/[{}]/g, '')
        .split(',')
        .filter((b) => b.trim())
        .every((b) => b.trim().startsWith('type '));
      if (!typeKeyword && !everyBindingIsType) {
        problems.push(`${path} imports runtime code from ${module}`);
      }
    }
  }

  // The exported surface has to be type-only too, or the swap file can't match it.
  const index = files.find((f) => f.path === join('src', 'wire', 'index.ts'));
  if (index && /^export\s*\{/m.test(index.source)) {
    problems.push('src/wire/index.ts has a value export — it must be `export type` only');
  }

  return problems.length ? problems.join('; ') : null;
});

// ── invariant 2: the watcher cannot register on an empty allowlist ──────────

check('invariant 2 — watcher registration is gated on a non-empty allowlist', () => {
  const capture = files.find((f) => f.path.endsWith(join('capture', 'CaptureService.ts')));
  if (!capture) return 'CaptureService.ts is missing';

  // The gate must sit BEFORE any register() call in start(), so an empty
  // allowlist means no handler exists at all — not a handler that returns early.
  const start = capture.source.slice(capture.source.indexOf('start('));
  const gateAt = start.search(/allowlist_folders\.length === 0 && allowlist_tags\.length === 0/);
  const registerAt = start.search(/register\(['"]modify['"]/);

  if (gateAt === -1) return 'no empty-allowlist gate found in start()';
  if (registerAt === -1) return 'no vault event registration found in start()';
  return gateAt < registerAt ? null : 'the allowlist gate runs after registration';
});

// ── P8: the Myu-folder watcher is consent-gated the same way ────────────────

check('invariant 2b — Myu-folder watcher registration is gated on consent', () => {
  const watcher = files.find((f) => f.path.endsWith(join('capture', 'MyuFolderWatcher.ts')));
  if (!watcher) return 'MyuFolderWatcher.ts is missing';

  const start = watcher.source.slice(watcher.source.indexOf('start('));
  const gateAt = start.search(/materialize_consented \|\| !s\.materialize_enabled/);
  const registerAt = start.search(/register\(['"]modify['"]/);

  if (gateAt === -1) return 'no consent gate found in start()';
  if (registerAt === -1) return 'no vault event registration found in start()';
  return gateAt < registerAt ? null : 'the consent gate runs after registration';
});

// ── invariant 9: the transport is the only network path ────────────────────

check('invariant 9 — all network egress goes through src/transport (no client telemetry)', () => {
  // transport/index.ts has claimed to be "the ONLY network path in this plugin"
  // since P0, but nothing checked it — and an analytics module quietly reached
  // for `requestUrl` on its own (2026-08-24), which is precisely the
  // client-side telemetry Obsidian's developer policies forbid outright:
  //
  //   Not allowed: "Include client-side telemetry."
  //
  // Server-side telemetry (attributed from endpoints the plugin already calls)
  // is the sanctioned path and needs no client code at all. So the rule is
  // structural rather than remembered: a module that opens its own socket is a
  // build failure, and any future telemetry has to go through a reviewed door.
  // Comments and method DEFINITIONS are not egress: this file already learned
  // (invariant 4) that a checker which can't tell prose from code cries wolf
  // until someone stops running it. `private async fetch()` on a view and the
  // word "fetch" in a sentence are both fine; `fetch(url)` is not.
  const EGRESS = /\brequestUrl\s*\(|(?<![.\w$])fetch\s*\(|new\s+WebSocket\b|new\s+EventSource\b|navigator\.sendBeacon\b|new\s+XMLHttpRequest\b/;
  const DEFINITION = /(?:\basync\b|\bfunction\b|\bprivate\b|\bpublic\b|\bprotected\b|\bstatic\b|\bdeclare\b)\s+fetch\s*\(/;

  // The two documented doors, both inside the transport module:
  //   index.ts — requestUrl, the CORS + mobile path, with the plaintext assert;
  //   sse.ts   — the one raw fetch, because requestUrl cannot stream.
  const allowed = new Set([join('src', 'transport', 'index.ts'), join('src', 'transport', 'sse.ts')]);

  const offenders = [];
  for (const { path, source } of files) {
    if (allowed.has(path)) continue;
    const code = stripComments(source);
    const hit = code
      .split('\n')
      .some((line) => EGRESS.test(line) && !DEFINITION.test(line));
    if (hit) offenders.push(path);
  }

  return offenders.length
    ? `these modules reach the network directly: ${offenders.join(', ')}. Route ` +
        `every request through src/transport/, which talks only to the configured ` +
        `backend. Client-side telemetry is banned by Obsidian's developer policies.`
    : null;
});

// ── invariant 10: no HTML-string injection (Obsidian's automated review) ───

check('invariant 10 — no innerHTML/outerHTML/insertAdjacentHTML', () => {
  // Obsidian's automated review rejects these categorically as an XSS class —
  // it cannot tell a hand-written SVG constant from an interpolated one, and
  // since EVERY release is rescanned, a failure delists the plugin rather than
  // merely blocking a submission. Build DOM with createEl/createSvg instead;
  // the two brand marks were converted on 2026-08-25.
  const INJECTION = /\b(?:innerHTML|outerHTML|insertAdjacentHTML)\b/;

  const offenders = files
    .filter(({ source }) => INJECTION.test(stripComments(source)))
    .map((f) => f.path);

  return offenders.length
    ? `these modules assign HTML as a string: ${offenders.join(', ')}. Build the ` +
        `DOM with createEl/createSvg — Obsidian's automated review rejects ` +
        `innerHTML and rescans every release.`
    : null;
});

// ── invariant 11: dev-only affordances must fail SAFE ───────────────────────
//
// A gate on a privileged affordance must name the permissive case (local dev)
// and default to denying, never the reverse: the negation of one production
// hostname inverts the moment production moves off that host, which happened
// on 2026-08-26.

check('invariant 11 — dev-only gates name the DEV case, never negate a prod host', () => {
  const offenders = [];
  for (const { path, source } of files) {
    const clean = stripComments(source);
    // `get devBackend() { return !... }` / `const isDev = !...` and friends.
    const re = /(?:get\s+)?(dev[A-Za-z]*|isDev|isLocal|localBackend)\s*(?:\([^)]*\))?\s*(?::[^={]*)?[={][\s\S]{0,200}?return\s+!/g;
    let m;
    while ((m = re.exec(clean)) !== null) offenders.push(`${path} (${m[1]})`);
    // Any surviving equality against a hardcoded prod hostname.
    if (/(?:===|includes\(|endsWith\()\s*['"`][^'"`]*askmyu\.com/.test(clean) && /\bdev/i.test(clean)) {
      offenders.push(`${path} (hardcoded prod host in a dev check)`);
    }
  }

  return offenders.length
    ? `these gates fail OPEN when production moves: ${[...new Set(offenders)].join(', ')}. ` +
        `Name the local-dev hosts explicitly and return false for everything else, ` +
        `including a URL that will not parse.`
    : null;
});

// ── invariant 12: the vault renders it, or nobody does ──────────────────────
//
// Browser exits are this modality's north-star metric ("target: trends to
// zero"). A renderer that answers "open this on
// the web" writes a browser exit into the user's own vault, permanently, where
// it is read every time the note is. componentMarkdown's floor is
// genericMarkdown, which renders whatever data a component carries; nothing
// below it may hand the reader back to the browser.
//
// Settings/billing/onboarding links are exempt — those exits are recorded as
// permanent. This is about RENDERED CONTENT only.

check('invariant 12 — content renderers never defer to the web app', () => {
  const RENDERERS = [join('src', 'vault', 'myuFiles.ts'), join('src', 'vault', 'CanvasExporter.ts'), join('src', 'vault', 'ConversationWriter.ts')];
  const DEFERRAL = /(?:needs?|open|view|see)\s+(?:it\s+)?(?:live\s+)?(?:on\s+)?(?:the\s+)?web/i;
  const offenders = [];
  for (const { path, source } of files) {
    if (!RENDERERS.includes(path)) continue;
    // stripComments already removes the prose, so what is left is code and the
    // strings inside it. Scanning LINES beats trying to regex out string
    // literals — a naive literal matcher swallows regex character classes
    // containing quotes and reports the wrong span (caught 2026-08-28).
    stripComments(source).split('\n').forEach((line, i) => {
      if (DEFERRAL.test(line)) offenders.push(`${path}:${i + 1} ${line.trim().slice(0, 60)}`);
    });
  }

  return offenders.length
    ? `these renderers send the reader to the browser: ${offenders.join(', ')}. ` +
        `Render the component's data instead — genericMarkdown is the floor and ` +
        `it never fails.`
    : null;
});

// ── invariant 13: resuming a conversation asks for its canvas ───────────────
//
// The persisted reply carries no composition id — the offer block is built
// only for the live HTTP response — so the ONLY way a resumed conversation can
// reach its canvas is the for-journal call the web makes. A refactor that drops
// it would not fail a single unit test; it would just quietly reopen the bug
// the operator reported on 2026-08-28.

check('invariant 13 — openPastConversation asks which canvas the journal has', () => {
  const chat = files.find(({ path }) => path === join('src', 'views', 'ChatView.ts'));
  if (!chat) return 'src/views/ChatView.ts not found';
  const src = stripComments(chat.source);
  const start = src.indexOf('async openPastConversation(');
  if (start < 0) return 'openPastConversation() not found in ChatView';
  const body = src.slice(start, src.indexOf('\n  }\n', start));
  return body.includes('getCompositionForJournal(')
    ? null
    : 'openPastConversation() no longer calls getCompositionForJournal — a resumed ' +
        'conversation would show no way to its canvas while the web shows the panel.';
});

// ── invariant 14: chat text is markdown, rendered as markdown ────────────────
//
// Replies carry bold, lists and tables; painting `block.text` as a plain-text
// div shows every `**` and `|` literally (2026-08-28). All block text goes
// through chatBlocks.ts → MarkdownRenderer; the view must not paint it itself.

check('invariant 14 — ChatView never paints block text as plain text', () => {
  const chat = files.find(({ path }) => path === join('src', 'views', 'ChatView.ts'));
  if (!chat) return 'src/views/ChatView.ts not found';
  const src = stripComments(chat.source);
  if (!src.includes("from './chatBlocks'")) return 'ChatView no longer renders blocks through chatBlocks.ts';
  const m = src.match(/text:\s*block\.text\b/);
  return m ? 'ChatView paints `block.text` as plain text — markdown would show as raw asterisks' : null;
});

// ── invariant 15: the always-keep switch listens on every surface ───────────
//
// A canvas made on the web never reaches the pane; the only way the vault
// catches it is the composition_ready subscription. Losing that line would
// quietly turn "always keep" into "keep what I happened to open".

check('invariant 15 — always-keep is fed by composition_ready, not only by the pane', () => {
  const main = files.find(({ path }) => path === join('src', 'main.ts'));
  if (!main) return 'src/main.ts not found';
  const src = stripComments(main.source);
  if (!/subscribe\(\s*'composition_ready'/.test(src)) return "main.ts no longer subscribes to 'composition_ready'";
  if (!/keepCanvasIfAlwaysOn\(/.test(src)) return 'main.ts no longer calls keepCanvasIfAlwaysOn';
  return null;
});

// ── invariant 16: account/session events reach the user ─────────────────────
check('invariant 16 — main.ts registers the live account/session notices', () => {
  const main = files.find(({ path }) => path === join('src', 'main.ts'));
  if (!main) return 'src/main.ts not found';
  return /registerLiveNotices\(/.test(stripComments(main.source)) ? null : 'main.ts no longer calls registerLiveNotices — device requests and remote logouts would go unannounced';
});

// ── invariant 17: the stylesheet inherits the user's theme ──────────────────
//
// Obsidian's guidelines (and every plugin people call polished): theme
// variables for type, size and color; no font-family of our own, no px type,
// no hardcoded colors except as var() fallbacks. The Myu look lives in
// snippets/myu-look.css, the user's file — never inside the plugin.

check('invariant 17 — styles.css sets no fonts, px type, or colors of its own', () => {
  const css = readFileSync('styles.css', 'utf8');
  const problems = [];
  for (const [i, line] of css.split('\n').entries()) {
    if (/font-family/.test(line) && !/var\(--font/.test(line)) problems.push(`${i + 1}: font-family override`);
    if (/font-size:\s*[0-9.]+px/.test(line)) problems.push(`${i + 1}: px font-size`);
    if (/#[0-9a-fA-F]{3,6}\b/.test(line) && !/var\(--[a-z-]+,\s*#/.test(line) && !/^\s*\/\*|^\s*\*/.test(line)) problems.push(`${i + 1}: hardcoded color`);
  }
  return problems.length ? `styles.css fights the theme: ${problems.join(', ')}` : null;
});

// ── invariant 18: what you can press, the keyboard can reach ────────────────
//
// Rows that do something are <button>s (Tab, Enter, Space, a focus ring), not
// <div>s with onclick. A keyboard user could not reach Today's cue and meeting
// rows or the past-conversations list at all before 2026-08-29.

check('invariant 18 — pressable rows are buttons, never clickable divs', () => {
  const offenders = [];
  for (const { path, source } of files) {
    if (!path.startsWith(join('src', 'views'))) continue;
    // Whole class tokens only — `myu-chat-past-preview` is a child span, not the row.
    for (const m of stripComments(source).matchAll(/create(?:Div|Span)\(\{\s*cls:\s*'(?:[^']*\s)?(?:myu-row-tappable|myu-chat-past|myu-chat-related-row|myu-pick-row)(?:\s[^']*)?'/g)) {
      offenders.push(`${path}: ${m[0].slice(0, 60)}`);
    }
  }
  return offenders.length ? `clickable rows that the keyboard cannot reach: ${offenders.join(', ')}` : null;
});

// ── report ──────────────────────────────────────────────────────────────────

if (failures.length) {
  console.error(`\n${failures.length} invariant check(s) FAILED:\n`);
  for (const failure of failures) console.error(`  ✗ ${failure}\n`);
  process.exit(1);
}

console.log('\nAll structural invariants hold.');
