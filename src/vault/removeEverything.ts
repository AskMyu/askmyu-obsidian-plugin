/**
 * "Remove everything Myu wrote" — the purge handle, finally with a hand on it.
 * Everything the plugin ever wrote is findable two ways: `myu-generated: true`
 * in frontmatter (people, companies, journal, meetings, days, conversations,
 * canvas stubs) and the materializer's own registry of written paths
 * (`myu_file_hashes`, which also covers `.base` and `.canvas` files that have
 * no frontmatter). Union of both, to the TRASH via `fileManager.trashFile`
 * (the user's own deletion preference) — never a hard delete. The user's own
 * notes are untouched by construction: neither list can contain them.
 */

import { TFile, type App } from 'obsidian';

export interface WrittenFiles { files: TFile[]; byFrontmatter: number; byRegistry: number }

export function findEverythingMyuWrote(app: App, registryPaths: string[]): WrittenFiles {
  const seen = new Map<string, TFile>();
  let byFrontmatter = 0;
  for (const file of app.vault.getMarkdownFiles()) {
    const fm = app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
    if (fm?.['myu-generated'] === true) { seen.set(file.path, file); byFrontmatter++; }
  }
  let byRegistry = 0;
  for (const path of registryPaths) {
    const f = app.vault.getAbstractFileByPath(path);
    if (f instanceof TFile && !seen.has(f.path)) { seen.set(f.path, f); byRegistry++; }
  }
  return { files: [...seen.values()], byFrontmatter, byRegistry };
}

export async function trashEverythingMyuWrote(app: App, files: TFile[]): Promise<number> {
  let n = 0;
  for (const f of files) {
    try { await app.fileManager.trashFile(f); n++; } catch { /* a file already gone is not a failure */ }
  }
  return n;
}
