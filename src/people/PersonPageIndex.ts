/**
 * PersonPageIndex (P5.4) — the vault's own people, indexed.
 *
 * The vault-culture finding this serves: a note per person, linked from daily
 * and meeting notes, is THE convention (Bases made it a de-facto native CRM).
 * This index maps name + frontmatter `aliases:` → note path so that:
 *
 *   · CardView offers `your note` on a matching person,
 *   · person pages get a `Show Myu's card` command,
 *   · MeetingCapture ships the user's own alias list with wikilink names,
 *     which is the strongest owner evidence the backend resolver ever gets.
 *
 * A note counts as a person page when it lives in a people folder (default
 * `People/`, configurable) OR carries `type: person` frontmatter.
 *
 * LINK ONLY — R2. Nothing here writes, and nothing here may ever gain write
 * capability: their people-notes practice and Myu's cards are two views of one
 * person, with the arrow pointing at THEIR note, never into it.
 *
 * Rebuilds are event-driven (create/rename/delete + metadata resolution) and
 * cheap: the scan reads the metadata cache, not file contents.
 */

import type { App, CachedMetadata, TAbstractFile, TFile } from 'obsidian';
import { TFile as TFileClass } from 'obsidian';

export interface PersonPage {
  path: string;
  /** The page's basename — the canonical name in the vault's own convention. */
  name: string;
  aliases: string[];
}

export class PersonPageIndex {
  /** lowercased name/alias → page. First writer wins (basename beats alias). */
  private byName = new Map<string, PersonPage>();
  private pages: PersonPage[] = [];

  constructor(
    private app: App,
    private folders: () => string[],
  ) {}

  /** Wire the rebuild triggers through the plugin's registerEvent. */
  watch(register: (unsub: () => void) => void): void {
    const rebuild = () => this.rebuild();
    // vault.on is overloaded per event name — spelled out rather than looped.
    const created = this.app.vault.on('create', rebuild);
    const deleted = this.app.vault.on('delete', rebuild);
    const renamed = this.app.vault.on('rename', rebuild);
    register(() => this.app.vault.offref(created));
    register(() => this.app.vault.offref(deleted));
    register(() => this.app.vault.offref(renamed));
    // Frontmatter (`type: person`, `aliases:`) lands via the metadata cache,
    // often after the vault event — this catches the aliases arriving late.
    const metaRef = this.app.metadataCache.on('changed', (file) => {
      if (this.isCandidate(file)) this.rebuild();
    });
    register(() => this.app.metadataCache.offref(metaRef));
    this.rebuild();
  }

  rebuild(): void {
    this.byName.clear();
    this.pages = [];

    for (const file of this.app.vault.getMarkdownFiles()) {
      if (!this.isCandidate(file)) continue;
      const cache = this.app.metadataCache.getFileCache(file);
      const page: PersonPage = {
        path: file.path,
        name: file.basename,
        aliases: aliasesFrom(cache),
      };
      this.pages.push(page);
      // Basenames register before aliases so a name collision resolves to the
      // page NAMED that, not the page that merely lists it as an alias.
      if (!this.byName.has(page.name.toLowerCase())) this.byName.set(page.name.toLowerCase(), page);
    }
    for (const page of this.pages) {
      for (const alias of page.aliases) {
        const key = alias.toLowerCase();
        if (!this.byName.has(key)) this.byName.set(key, page);
      }
    }
  }

  private isCandidate(file: TAbstractFile): file is TFile {
    if (!(file instanceof TFileClass) || file.extension !== 'md') return false;
    for (const folder of this.folders()) {
      if (file.path === folder || file.path.startsWith(`${folder}/`)) return true;
    }
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    return fm?.type === 'person';
  }

  /** The vault page for a display name, or null. Exact (case-insensitive) only. */
  find(name: string): PersonPage | null {
    return this.byName.get(name.trim().toLowerCase()) ?? null;
  }

  /** The user's own aliases for a name (the page's other names + its basename). */
  aliasesFor(name: string): string[] {
    const page = this.find(name);
    if (!page) return [];
    const wanted = name.trim().toLowerCase();
    return [page.name, ...page.aliases].filter((n) => n.toLowerCase() !== wanted);
  }

  get size(): number {
    return this.pages.length;
  }
}

function aliasesFrom(cache: CachedMetadata | null): string[] {
  const fm = cache?.frontmatter;
  const raw = fm?.aliases;
  if (Array.isArray(raw)) return raw.filter((a): a is string => typeof a === 'string' && a.trim().length > 0);
  if (typeof raw === 'string' && raw.trim()) return [raw.trim()];
  return [];
}
