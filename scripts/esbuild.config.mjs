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
import builtins from 'builtin-modules';

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
// and the counter may be reset when they change, since a higher minor outranks
// any build. Within one major.minor the counter only ever climbs, which is the
// one rule that keeps BRAT and Obsidian's updater offering the right release.
//
// Dev/watch builds do not bump or write anything: they reuse the current
// number with a -dev marker, so "is my instance on the latest?" is answerable
// from the settings page without burning a version per rebuild (2026-08-24).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const numFile = '.buildnum';
let buildNum = existsSync(numFile) ? parseInt(readFileSync(numFile, 'utf8').trim(), 10) || 0 : 0;
const [major, minor] = String(manifest.version).split('.');
let version = `${major}.${minor}.${buildNum}`;
if (production) {
  buildNum += 1;
  version = `${major}.${minor}.${buildNum}`;
  writeFileSync(numFile, `${buildNum}\n`);
  manifest.version = version;
  writeFileSync('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
  const versionsFile = 'versions.json';
  const versions = existsSync(versionsFile) ? JSON.parse(readFileSync(versionsFile, 'utf8')) : {};
  versions[version] = manifest.minAppVersion;
  writeFileSync(versionsFile, `${JSON.stringify(versions, null, 2)}\n`);
}
// The stamp settings shows: the version itself, `-dev` for anything not a release build.
const buildStamp = `${version}${production ? '' : '-dev'}${stampSuffix}`;

const context = await esbuild.context({
  banner: { js: banner },
  entryPoints: [entry],
  define: { __BUILD_STAMP__: JSON.stringify(buildStamp) },
  bundle: true,
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
  minify: production,
});

if (oneShot) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
