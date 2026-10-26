/**
 * Bundle the tests (stubbing `obsidian`, which only exists inside the host) and
 * run them with node's built-in runner. Keeps the invariants executable without
 * adding a test framework to a plugin that ships as one file.
 */
import esbuild from 'esbuild';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, mkdirSync, rmSync } from 'node:fs';
import process from 'node:process';

const OUT = 'dist-tests';
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// Entry 1: logic tests — obsidian THROWS (proves no host-API dependence).
await esbuild.build({
  // spaceMode: a space's conversation decides everything with no host API (R14).
  // todayLines: Today's "for you" rows (one per subject, the rest behind a count), same rule.
  // spaceRetro: a space's row on Today and the team's retro as the pane shows it, same rule.
  // lineAnswers: Myu's questions outside a space answered with a tap (2026-09-25), same rule.
  // menuMarks: the status bar's words for what is new, and the keeper behind them (2026-10-06), same rule.
  // linesSeen: a line reported as seen after a second in view, once (2026-10-06), same rule.
  entryPoints: ['tests/invariants.test.ts', 'tests/spaceMode.test.ts', 'tests/todayLines.test.ts', 'tests/spaceRetro.test.ts', 'tests/lineAnswers.test.ts', 'tests/menuMarks.test.ts', 'tests/linesSeen.test.ts'],
  bundle: true,
  loader: { '.css': 'text' },
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  outdir: OUT,
  // The package is `"type": "module"`, so a bundled `.js` would be parsed as ESM
  // and choke on esbuild's CJS interop. `.cjs` says what it is.
  outExtension: { '.js': '.cjs' },
  external: ['node:*'],
  plugins: [
    {
      name: 'stub-obsidian',
      setup(build) {
        // Nothing under test touches the host API; anything that starts to will
        // fail loudly here rather than silently depend on Obsidian internals.
        build.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'stub' }));
        build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
          contents: 'module.exports = new Proxy({}, { get() { throw new Error("obsidian API used in a unit test"); } });',
        }));
      },
    },
  ],
});

const internalTests = existsSync('tests/internal')
  ? readdirSync('tests/internal').filter((f) => f.endsWith('.test.ts')).map((f) => `tests/internal/${f}`)
  : [];

// Entry 2: modal-WIRING tests — obsidian is the functional UI fake
// (tests/ui-stub.ts), because wiring IS host API and 2026-08-22 shipped three
// wiring bugs only clicking found. Same runner, different stub philosophy.
await esbuild.build({
  entryPoints: [
    'tests/ceremony.test.ts',
    'tests/coldstart.test.ts',
    'tests/spaceModePane.test.ts',
    'tests/lineAnswersPane.test.ts',
    // The interview debrief (2026-09-29): its asks in the space pane, and its Today row.
    'tests/debriefPane.test.ts',
    // Pasted text (2026-10-06): chips on the four composers, the vault's note and selection, capture, write-back.
    'tests/pastedText.test.ts',
    // The dots beside Today's rows (2026-10-06): orange is new, grey is waiting; an opening repaints them.
    'tests/todayDots.test.ts',
    // Send feedback with files (2026-10-14): which picks are kept, what a send carries, an old server, a 413.
    'tests/feedbackModal.test.ts',
    // Internal-only test files (tests/internal/, absent from the public
    // source) join the run when present, so both flavors gate identically.
    ...internalTests,
  ],
  bundle: true,
  loader: { '.css': 'text' },
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  outdir: OUT,
  outExtension: { '.js': '.cjs' },
  external: ['node:*'],
  alias: { obsidian: './tests/ui-stub.ts' },
});

const result = spawnSync(
  process.execPath,
  ['--test', `${OUT}/invariants.test.cjs`, `${OUT}/spaceMode.test.cjs`, `${OUT}/todayLines.test.cjs`, `${OUT}/spaceRetro.test.cjs`, `${OUT}/lineAnswers.test.cjs`, `${OUT}/menuMarks.test.cjs`, `${OUT}/linesSeen.test.cjs`, `${OUT}/ceremony.test.cjs`, `${OUT}/coldstart.test.cjs`, `${OUT}/spaceModePane.test.cjs`, `${OUT}/lineAnswersPane.test.cjs`, `${OUT}/debriefPane.test.cjs`, `${OUT}/pastedText.test.cjs`, `${OUT}/todayDots.test.cjs`, `${OUT}/feedbackModal.test.cjs`, ...internalTests.map((t) => `${OUT}/${t.replace(/^tests\//, '').replace(/\.ts$/, '.cjs')}`)],
  { stdio: 'inherit' },
);
process.exit(result.status ?? 1);
