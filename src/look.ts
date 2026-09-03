/**
 * The Myu look — an optional CSS snippet, installed on request.
 *
 * It ships INSIDE the plugin as text (esbuild's text loader on
 * snippets/myu-look.css) and is written into the vault's snippets folder only
 * when the reader presses Install the look. No network: the look for this
 * build is the look the button installs, and BRAT's next update brings the
 * next one. The plugin's own stylesheet never loads it — it stays the reader's
 * file, to edit, turn off, or remove (operator, 2026-09-03: "can we also
 * uninstall the look so they can undo it?").
 *
 * Pure: the file's name and place, the stamped text, and what an installed
 * copy is (this build's, an older build's, or one Myu did not write).
 */

import lookSource from '../snippets/myu-look.css';

/** The snippet name Obsidian shows under Appearance → CSS snippets (the file name without .css). */
export const LOOK_NAME = 'myu-look';
export const LOOK_FILE = `${LOOK_NAME}.css`;

/** Where it lives — under the vault's config folder, whatever that is called. */
export function lookPath(configDir: string): string {
  return `${configDir}/snippets/${LOOK_FILE}`;
}

/** The installed text: a stamp naming the build that wrote it, then the look. */
export function lookText(version: string): string {
  return `/* @myu-look ${version} — installed by the AskMyu plugin. Yours to edit, turn off, or remove: Settings → AskMyu → Advanced → Myu look. */\n${lookSource}`;
}

/** The build that wrote an installed copy, or null for a file Myu did not write. */
export function lookStamp(text: string): string | null {
  const m = /^\/\* @myu-look (\S+)/.exec(text);
  return m ? (m[1] ?? null) : null;
}

export type LookStanding = { state: 'absent' } | { state: 'current'; version: string } | { state: 'different'; version: string | null };

/** What is installed, against what this build would install. */
export function lookStanding(installed: string | null, version: string): LookStanding {
  if (installed === null) return { state: 'absent' };
  if (installed === lookText(version)) return { state: 'current', version };
  return { state: 'different', version: lookStamp(installed) };
}

/**
 * Obsidian's snippet switch is not public API (`app.customCss`); Snippet
 * Commands and CSS Editor in the community directory flip it the same way.
 * Guarded: when it is absent the row sends people to Appearance instead.
 */
export interface SnippetSwitch {
  isOn(): boolean;
  set(on: boolean): Promise<void>;
}

interface CustomCssLike {
  enabledSnippets?: Set<string>;
  setCssEnabledStatus?: (name: string, enabled: boolean) => void;
  readSnippets?: () => void | Promise<void>;
}

export function snippetSwitch(app: unknown, name: string): SnippetSwitch | null {
  const css = (app as { customCss?: CustomCssLike } | null)?.customCss;
  if (!css || typeof css.setCssEnabledStatus !== 'function') return null;
  const setStatus = css.setCssEnabledStatus.bind(css);
  return {
    isOn: () => css.enabledSnippets instanceof Set && css.enabledSnippets.has(name),
    set: async (on) => {
      // A file written a moment ago is unknown until the folder is re-read.
      await css.readSnippets?.();
      setStatus(name, on);
    },
  };
}

/** The few file operations the installer needs — Obsidian's DataAdapter has them all. */
export interface LookFs {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  write(path: string, text: string): Promise<void>;
  remove(path: string): Promise<void>;
  mkdir(path: string): Promise<void>;
}

export class LookInstaller {
  constructor(
    private fs: LookFs,
    private configDir: string,
    private version: string,
    private sw: SnippetSwitch | null,
  ) {}

  path(): string {
    return lookPath(this.configDir);
  }

  async installed(): Promise<string | null> {
    return (await this.fs.exists(this.path())) ? this.fs.read(this.path()) : null;
  }

  async standing(): Promise<LookStanding> {
    return lookStanding(await this.installed(), this.version);
  }

  /** On, when the switch is reachable; null when only Appearance can say. */
  isOn(): boolean | null {
    return this.sw ? this.sw.isOn() : null;
  }

  /** Write this build's look and turn it on. `installed_off` = written, but the switch is not reachable. */
  async install(): Promise<'installed' | 'installed_off'> {
    await this.fs.mkdir(`${this.configDir}/snippets`).catch(() => undefined);
    await this.fs.write(this.path(), lookText(this.version));
    if (!this.sw) return 'installed_off';
    await this.sw.set(true);
    return 'installed';
  }

  async setOn(on: boolean): Promise<void> {
    await this.sw?.set(on);
  }

  /** Turn it off, then delete the file. The undo of install — nothing else is touched. */
  async remove(): Promise<void> {
    await this.sw?.set(false).catch(() => undefined);
    if (await this.fs.exists(this.path())) await this.fs.remove(this.path());
  }
}
