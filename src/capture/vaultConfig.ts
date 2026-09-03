/**
 * Read the vault's OWN configuration to propose an allowlist.
 *
 * Vault-culture finding: the daily note IS the journal, and the vault already
 * knows where daily notes live — `.obsidian/daily-notes.json` for the core
 * plugin, `.obsidian/plugins/periodic-notes/data.json` for the community one.
 * So first-run consent asks "share your Daily Notes folder — `Daily/` — with
 * Myu?" instead of handing someone a blank folder picker and hoping.
 *
 * Consent stays explicit; only the suggestion gets smart. Nothing here reads a
 * single note — it reads config, proposes, and waits.
 */

import type { App } from 'obsidian';

export interface VaultFolderSuggestion {
  path: string;
  /** Why this is being proposed, shown verbatim to the user. */
  reason: string;
  /** Pre-ticked in the consent modal. Only the daily folder earns that. */
  recommended: boolean;
}

export interface PeriodicConfig {
  dailyFolder: string | null;
  weeklyFolder: string | null;
  /** Their moment format for weekly filenames, e.g. `gggg-[W]ww`. */
  weeklyFormat: string | null;
}

/**
 * Obsidian exposes no typed API for another plugin's config, so this reads the
 * JSON directly through the vault adapter — the same files Obsidian itself
 * writes. Every read is wrapped: a missing or malformed config is the normal
 * case for a vault that doesn't use daily notes, not an error worth surfacing.
 */
export async function readPeriodicConfig(app: App): Promise<PeriodicConfig> {
  const dailyFolder = await readJsonField(app, `${app.vault.configDir}/daily-notes.json`, 'folder');
  const weekly = await readWeekly(app);
  return {
    dailyFolder: normalizeFolder(dailyFolder),
    weeklyFolder: normalizeFolder(weekly.folder),
    weeklyFormat: weekly.format,
  };
}

async function readWeekly(app: App): Promise<{ folder: string | null; format: string | null }> {
  try {
    const raw = await readJson(app, `${app.vault.configDir}/plugins/periodic-notes/data.json`);
    if (!raw) return { folder: null, format: null };
    // Periodic Notes v1 nests per-granularity settings under `weekly`.
    const weekly = (raw as { weekly?: { folder?: unknown; format?: unknown; enabled?: unknown } }).weekly;
    if (!weekly || weekly.enabled === false) return { folder: null, format: null };
    return {
      folder: typeof weekly.folder === 'string' ? weekly.folder : null,
      format: typeof weekly.format === 'string' && weekly.format ? weekly.format : null,
    };
  } catch {
    return { folder: null, format: null };
  }
}

/**
 * What to propose, in the order a person would think of it. The daily folder is
 * recommended; meeting-shaped folders are offered but unticked, because a
 * meetings folder often holds other people's words and that is the user's call
 * to make deliberately.
 */
export async function suggestFolders(app: App): Promise<VaultFolderSuggestion[]> {
  const suggestions: VaultFolderSuggestion[] = [];
  const { dailyFolder } = await readPeriodicConfig(app);

  if (dailyFolder) {
    suggestions.push({
      path: dailyFolder,
      reason: 'your Daily Notes folder',
      recommended: true,
    });
  }

  const topLevel = app.vault
    .getAllLoadedFiles()
    .filter((f) => 'children' in f)
    .map((f) => f.path)
    .filter((p) => p && !p.startsWith('.') && !p.includes('/'));

  for (const path of topLevel) {
    if (path === dailyFolder) continue;
    const lower = path.toLowerCase();
    if (/^(journal|journals|daily|diary)$/.test(lower)) {
      suggestions.push({ path, reason: 'looks like a journal folder', recommended: !dailyFolder });
    } else if (/^(meetings?|1-?1s?|notes)$/.test(lower)) {
      suggestions.push({ path, reason: 'looks like meeting notes', recommended: false });
    }
  }

  return suggestions;
}

function normalizeFolder(folder: string | null): string | null {
  if (!folder) return null;
  const trimmed = folder.replace(/^\/+|\/+$/g, '').trim();
  return trimmed.length ? trimmed : null;
}

async function readJson(app: App, path: string): Promise<unknown | null> {
  try {
    if (!(await app.vault.adapter.exists(path))) return null;
    return JSON.parse(await app.vault.adapter.read(path));
  } catch {
    return null;
  }
}

async function readJsonField(app: App, path: string, field: string): Promise<string | null> {
  const raw = await readJson(app, path);
  if (raw && typeof raw === 'object') {
    const value = (raw as Record<string, unknown>)[field];
    if (typeof value === 'string') return value;
  }
  return null;
}
