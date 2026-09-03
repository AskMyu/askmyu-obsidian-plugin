/**
 * Build timestamp injected by esbuild's `define` at bundle time. manifest.json
 * says 0.1.0 for every dev build, and Obsidian keeps a loaded plugin in memory
 * until reload — so without this, "is my instance running the latest?" was
 * unanswerable from inside the app (2026-08-24, the stale "Finish setup" hunt).
 * Shown in settings; 'dev' in test bundles that don't set the define.
 */
declare const __BUILD_STAMP__: string | undefined;

export const BUILD_STAMP: string = typeof __BUILD_STAMP__ !== 'undefined' ? __BUILD_STAMP__ : 'dev';
