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
  entryPoints: ['tests/invariants.test.ts'],
  bundle: true,
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
    // Internal-only test files (tests/internal/, absent from the public
    // source) join the run when present, so both flavors gate identically.
    ...internalTests,
  ],
  bundle: true,
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
  ['--test', `${OUT}/invariants.test.cjs`, `${OUT}/ceremony.test.cjs`, `${OUT}/coldstart.test.cjs`, ...internalTests.map((t) => `${OUT}/${t.replace(/^tests\//, '').replace(/\.ts$/, '.cjs')}`)],
  { stdio: 'inherit' },
);
process.exit(result.status ?? 1);
