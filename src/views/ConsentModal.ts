/**
 * First-run consent — the allowlist.
 *
 * Reading the vault is the sensitive act, and Obsidian gives us the most legible
 * consent model of any surface: the user literally picks the files. This modal
 * is that pick, in the power-down register — warm, plain, unhurried, no accents.
 *
 * Two things it must do and one it must never:
 *
 *   · **Propose their actual folders by name** (from `.obsidian/daily-notes.json`
 *     and the Periodic Notes config) rather than opening a blank picker. The
 *     suggestion is smart; the consent stays explicit.
 *   · **Say plainly what leaves and how**, up top, before any control — the
 *     listing litmus test, applied inside the product.
 *   · **Never read a note to build this screen.** Folder names and vault config
 *     only. Nothing is opened until the user says yes, and the watcher isn't
 *     even registered until then.
 */

import { App, Modal, Setting } from 'obsidian';
import type AskMyuPlugin from '../main';
import { suggestFolders, type VaultFolderSuggestion } from '../capture/vaultConfig';

/** The one remote host, for the disclosure line. */
export function serverHost(baseUrl: string): string {
  try { return new URL(baseUrl).host; } catch { return baseUrl; }
}

/** "N notes, oldest 2023" — the preview an Obsidian user expects before choosing a folder. */
export function folderScope(app: App, folder: string): string {
  const prefix = folder.replace(/\/$/, '') + '/';
  let n = 0; let oldest = Infinity;
  for (const f of app.vault.getMarkdownFiles()) {
    if (!f.path.startsWith(prefix)) continue;
    n++;
    if (f.stat.ctime < oldest) oldest = f.stat.ctime;
  }
  if (n === 0) return 'no notes yet';
  return `${n} ${n === 1 ? 'note' : 'notes'}${Number.isFinite(oldest) ? `, oldest ${new Date(oldest).getFullYear()}` : ''}`;
}
import { notifyStatus } from '../notify';

export class ConsentModal extends Modal {
  private suggestions: VaultFolderSuggestion[] = [];
  private chosen = new Set<string>();
  private tags = '';
  private loaded = false;

  constructor(
    app: App,
    private plugin: AskMyuPlugin,
    private onFinished: () => void,
  ) {
    super(app);
  }

  override async onOpen(): Promise<void> {
    this.chosen = new Set(this.plugin.settings.allowlist_folders);
    this.tags = this.plugin.settings.allowlist_tags.join(', ');

    this.render(); // loading frame first — reading config is async
    this.suggestions = await suggestFolders(this.app);

    // First run: pre-tick what the vault says is the journal.
    if (this.chosen.size === 0) {
      for (const s of this.suggestions) if (s.recommended) this.chosen.add(s.path);
    }
    this.loaded = true;
    this.render();
  }

  override onClose(): void {
    this.contentEl.empty();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('myu-power-down');

    contentEl.createEl('h2', { text: 'What may Myu read?' });

    contentEl.createEl('p', {
      cls: 'myu-prose',
      text:
        'Nothing in this vault has been read. Choose the folders whose notes should ' +
        'go to Myu — usually the one you journal in. Everything outside them stays ' +
        'here, untouched.',
    });

    contentEl.createEl('p', {
      cls: 'myu-prose myu-quiet',
      text:
        'Only the folders you choose leave this device, encrypted with a key that ' +
        'stays on your devices. Everything else in your vault is never read. You can ' +
        'change this list or disconnect at any time, and any single note can opt out ' +
        'with `myu: false` in its frontmatter.',
    });
    contentEl.createEl('p', { cls: 'myu-prose myu-quiet', text: `One server: ${serverHost(this.plugin.settings.base_url)}. No telemetry.` });

    if (!this.loaded) {
      contentEl.createEl('p', { cls: 'myu-prose myu-quiet', text: 'Looking at your vault setup…' });
      return;
    }

    if (this.suggestions.length === 0) {
      contentEl.createEl('p', {
        cls: 'myu-prose',
        text:
          "Your vault doesn't have a Daily Notes folder configured, so there's nothing " +
          'obvious to suggest. Type a folder path below.',
      });
    }

    for (const suggestion of this.suggestions) {
      const scope = folderScope(this.app, suggestion.path);
      new Setting(contentEl)
        .setName(`${suggestion.path}/`)
        .setDesc(`${suggestion.reason} \u2014 ${scope}`)
        .addToggle((t) =>
          t.setValue(this.chosen.has(suggestion.path)).onChange((v) => {
            if (v) this.chosen.add(suggestion.path);
            else this.chosen.delete(suggestion.path);
          }),
        );
    }

    new Setting(contentEl)
      .setName('Other folders')
      .setDesc('Comma-separated paths, e.g. Journal, work/meetings')
      .addText((t) =>
        t
          .setPlaceholder('Journal, work/meetings')
          .setValue(this.extraFolders().join(', '))
          .onChange((v) => {
            for (const path of this.extraFolders()) this.chosen.delete(path);
            for (const path of splitList(v)) this.chosen.add(path);
          }),
      );

    new Setting(contentEl)
      .setName('Or by tag')
      .setDesc('Notes carrying any of these tags are shared wherever they live.')
      .addText((t) =>
        t
          .setPlaceholder('Myu, journal')
          .setValue(this.tags)
          .onChange((v) => {
            this.tags = v;
          }),
      );

    new Setting(contentEl)
      .addButton((b) => b.setButtonText('Not now').onClick(() => this.close()))
      .addButton((b) =>
        b
          .setButtonText('Share these')
          .setCta()
          .onClick(() => void this.confirm()),
      );
  }

  /** Folders the user typed, i.e. chosen minus the ones we suggested. */
  private extraFolders(): string[] {
    const suggested = new Set(this.suggestions.map((s) => s.path));
    return [...this.chosen].filter((p) => !suggested.has(p));
  }

  private async confirm(): Promise<void> {
    const folders = [...this.chosen].map(normalizeFolder).filter(Boolean);
    const tags = splitList(this.tags).map((t) => t.replace(/^#/, ''));

    this.plugin.settings.allowlist_folders = folders;
    this.plugin.settings.allowlist_tags = tags;
    this.plugin.settings.consent_completed = true;
    await this.plugin.saveSettings();

    // The watcher only comes into existence now, and only if something is shared.
    this.plugin.restartCapture();
    this.plugin.forgetLinkSurvey();

    if (folders.length === 0 && tags.length === 0) {
      notifyStatus('Nothing shared. Myu will not read this vault.');
      this.onFinished();
      this.close();
      return;
    }

    this.close();
    // The backfill is the next ROW in the Today pane (preview, then Start) —
    // not a second dialog on the heels of this one.
    this.onFinished();
  }
}

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeFolder(path: string): string {
  return path.replace(/^\/+|\/+$/g, '').trim();
}
