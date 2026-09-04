/**
 * esbuild → a single `main.js` beside manifest.json + styles.css, which is the
 * only artifact shape Obsidian loads.
 *
 * `obsidian` and Electron/CodeMirror internals are EXTERNAL: they are provided
 * by the host at runtime. Bundling them produces a plugin that loads twice and
 * breaks in ways that look like Obsidian bugs.
 */
import esbuild from 'esbuild';
import process from 'node:process';
import { builtinModules } from 'node:module';
// Node's own list, with and without the `node:` prefix — no third-party package for it.
const builtins = [...builtinModules, ...builtinModules.map((m) => `node:${m}`)];

const production = process.argv[2] === 'production';
// Overrides for internal tooling (dev loops, test harnesses). Release builds
// leave all three unset and produce main.js from src/main.ts.
const entry = process.env.MYU_ENTRY || 'src/main.ts';
const stampSuffix = process.env.MYU_STAMP_SUFFIX || '';
// MYU_ONESHOT=1: build once and exit even in dev mode (harness installs).
const oneShot = production || process.env.MYU_ONESHOT === '1';
// MYU_OUTFILE: build somewhere else (a harness vault) without touching the
// release artifact beside manifest.json.
const outfile = process.env.MYU_OUTFILE || 'main.js';

const banner = `/*
AskMyu — Obsidian plugin. Bundled from packages/obsidian in the askmyu-frontend
monorepo; the public mirror (AskMyu/askmyu-obsidian-plugin) carries the same source.
*/`;

// VERSION = MAJOR.MINOR.BUILD (operator, 2026-09-02). Semver allows exactly
// three numbers, and Obsidian and BRAT order releases by them, so the build
// counter IS the patch number: every production build bumps .buildnum and
// writes `major.minor.<build>` into manifest.json (and versions.json, which
// maps each version to its minAppVersion). Major and minor are edited by hand
// in manifest.json — 0.1 while in beta, 0.2 for the public beta, 1.x after —
// and the counter RESETS TO 0 when they change (operator, 2026-09-02: "Z is the
// build number that gets reset whenever we bump X or Y"), since a higher minor
// outranks any build — the first build of a new line is `.0`. versions.json
// remembers the last version written, so the reset needs no hand edit of
// .buildnum. Within one major.minor the counter only ever climbs, which is the
// one rule that keeps BRAT and Obsidian's updater offering the right release.
//
// Dev/watch builds do not bump or write anything: they reuse the current
// number with a -dev marker, so "is my instance on the latest?" is answerable
// from the settings page without burning a version per rebuild (2026-08-24).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const numFile = '.buildnum';
const counter = existsSync(numFile) ? parseInt(readFileSync(numFile, 'utf8').trim(), 10) || 0 : 0;
const [major, minor] = String(manifest.version).split('.');
const versionsFile = 'versions.json';
const versions = existsSync(versionsFile) ? JSON.parse(readFileSync(versionsFile, 'utf8')) : {};
// The line the last release was on — versions.json keeps insertion order, so the last key is the newest.
const lastLine = Object.keys(versions).pop()?.split('.').slice(0, 2).join('.');
const sameLine = lastLine === `${major}.${minor}`;
// Dev builds show the counter as it stands (0 on a fresh line); a release build advances it.
let buildNum = sameLine ? counter : 0;
let version = `${major}.${minor}.${buildNum}`;
// The bump is a separate act (`npm run release`, MYU_BUMP=1): a plain production
// build bundles the manifest AS IT IS, so anyone rebuilding the tagged source —
// the directory's build verification, our own release workflow — gets the same
// bytes. Until 0.1.1 every rebuild stamped the next number and never matched.
const bump = production && process.env.MYU_BUMP === '1';
if (bump) {
  buildNum = sameLine ? counter + 1 : 0;
  version = `${major}.${minor}.${buildNum}`;
  writeFileSync(numFile, `${buildNum}\n`);
  manifest.version = version;
  writeFileSync('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
  versions[version] = manifest.minAppVersion;
  writeFileSync(versionsFile, `${JSON.stringify(versions, null, 2)}\n`);
} else if (production) {
  // Bundle exactly what manifest.json says.
  version = String(manifest.version);
}
// The stamp settings shows: the version itself, `-dev` for anything not a release build.
const buildStamp = `${version}${production ? '' : '-dev'}${stampSuffix}`;

const context = await esbuild.context({
  banner: { js: banner },
  entryPoints: [entry],
  define: { __BUILD_STAMP__: JSON.stringify(buildStamp) },
  bundle: true,
  // snippets/myu-look.css rides along as TEXT — written into the vault only when the
  // reader presses Install the look; the plugin's own stylesheet never loads it.
  loader: { '.css': 'text' },
  external: [
    'obsidian',
    'electron',
    '@codemirror/autocomplete',
    '@codemirror/collab',
    '@codemirror/commands',
    '@codemirror/language',
    '@codemirror/lint',
    '@codemirror/search',
    '@codemirror/state',
    '@codemirror/view',
    '@lezer/common',
    '@lezer/highlight',
    '@lezer/lr',
    ...builtins,
  ],
  format: 'cjs',
  target: 'es2020',
  logLevel: 'info',
  sourcemap: production ? false : 'inline',
  treeShaking: true,
  outfile,
  // Never minified: the directory's malware / obfuscation / network scans need
  // readable code (0.1.0: "scan not available" ×3), and a reader who opens the
  // bundle in their vault should be able to read it too. Tree-shaken, not shrunk.
  minify: false,
});

if (oneShot) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
