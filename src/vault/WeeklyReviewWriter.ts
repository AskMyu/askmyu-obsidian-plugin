/**
 * B4 — the weekly review, materialized. **The only module in this plugin that
 * can write to the vault**, and the invariant is machine-checked: `pnpm verify`
 * fails if any other file gains vault-write capability.
 *
 * Why writing is dangerous enough to be confined here (R2): vault files sync
 * through Dropbox, iCloud and Obsidian Sync, land on devices nobody has
 * inventoried, and persist long past any retention control we have. A read about
 * a third party, written into a file, is a read we can never take back. So Myu's
 * reads live in ephemeral panes, and exactly one thing is allowed onto disk — a
 * weekly review the user asked for, in the location and format their Periodic
 * Notes already use, because the weekly review is a ritual this crowd keeps
 * anyway and we should join it rather than invent a destination.
 *
 * Three properties make the write safe to reason about:
 *
 *  1. **Bounded.** Everything we write lives between two HTML-comment markers.
 *     Re-running replaces what is between them and touches nothing else — no
 *     appending duplicates onto someone's carefully kept note.
 *  2. **Names-free by default.** It materializes the weekly-movement line, which
 *     the backend emits as counts only, no names. Widening that to named reads
 *     is a separate, deliberate decision that needs a stronger warning than the
 *     one we show today.
 *  3. **Never automatic.** No timer calls this. A command or a button does.
 */

import { moment, normalizePath, TFile, type App } from 'obsidian';
import { readPeriodicConfig } from '../capture/vaultConfig';
import type { WeeklyEdition } from '../transport/api';

/**
 * Freshness rule, identical to the web's WeeklyReviewSection: only the current
 * or prior ISO week's edition counts. Exported for TodayView (one rule, two
 * consumers) and for the writer's server/local fork below.
 */
export function isWeeklyEditionFresh(edition: WeeklyEdition, now: Date = new Date()): boolean {
  if (!edition.period || !Array.isArray(edition.sections) || edition.sections.length === 0) return false;
  const lastWeek = new Date(now.getTime() - 7 * 86400000);
  return edition.period === isoWeek(now) || edition.period === isoWeek(lastWeek);
}

/** ISO week label, matching the backend's %d-W%02d. */
export function isoWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Server sections → the markdown lines the writer materializes. */
export function editionToLines(edition: WeeklyEdition): string[] {
  const lines: string[] = [];
  for (const section of edition.sections) {
    lines.push(section.line);
    for (const item of section.items ?? []) lines.push(`  - ${item}`);
  }
  return lines;
}

const BEGIN = '<!-- askmyu:begin -->';
const END = '<!-- askmyu:end -->';

export interface WeeklyReviewInput {
  /** Lines to write. Already hedged and gated by the backend; printed verbatim. */
  lines: string[];
  /** ISO date of the week being written, for the section heading. */
  weekOf: string;
}

export type WriteOutcome =
  | { status: 'written'; path: string; created: boolean }
  | { status: 'no_weekly_config' }
  | { status: 'nothing_to_write' }
  | { status: 'error'; message: string };

export class WeeklyReviewWriter {
  constructor(private app: App) {}

  /**
   * Where their weekly note lives, using their own folder and moment format.
   * Returns null when Periodic Notes isn't configured for weeks — in which case
   * we do not guess a location. Inventing `Reviews/2026-W33.md` in someone's
   * vault is precisely the kind of uninvited tidying this audience resents.
   */
  async resolveWeeklyPath(when: Date = new Date()): Promise<string | null> {
    const { weeklyFolder, weeklyFormat } = await readPeriodicConfig(this.app);
    if (!weeklyFolder || !weeklyFormat) return null;

    // Obsidian bundles moment and re-exports it; using the host's copy keeps the
    // filename identical to the one Periodic Notes would produce, including its
    // locale-dependent week numbering. The re-export is typed as a namespace, so
    // the call signature has to be asserted — and it must stay a NAMED import: a
    // namespace import of `obsidian` would be a way around the Notice ban, and
    // the lint rule (correctly) refuses one.
    const momentFn = moment as unknown as (input: Date) => { format: (fmt: string) => string };
    const name = momentFn(when).format(weeklyFormat);
    return normalizePath(`${weeklyFolder}/${name}.md`);
  }

  /**
   * Write (or rewrite) the Myu section of this week's note.
   *
   * Creates the note only when their weekly config says where it goes — the same
   * file Periodic Notes would create, in the same place.
   */
  async write(input: WeeklyReviewInput, when: Date = new Date()): Promise<WriteOutcome> {
    if (input.lines.length === 0) return { status: 'nothing_to_write' };

    const path = await this.resolveWeeklyPath(when);
    if (!path) return { status: 'no_weekly_config' };

    const section = this.renderSection(input);

    try {
      const existing = this.app.vault.getAbstractFileByPath(path);

      if (existing instanceof TFile) {
        // `process` is the atomic read-modify-write: it takes the current
        // contents and returns the new ones, so a sync client writing at the
        // same moment can't be clobbered by a stale read.
        await this.app.vault.process(existing, (contents) => replaceSection(contents, section));
        return { status: 'written', path, created: false };
      }

      const folder = path.slice(0, path.lastIndexOf('/'));
      if (folder && !this.app.vault.getAbstractFileByPath(folder)) {
        await this.app.vault.createFolder(folder);
      }
      await this.app.vault.create(path, `${section}\n`);
      return { status: 'written', path, created: true };
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) };
    }
  }

  private renderSection(input: WeeklyReviewInput): string {
    const body = input.lines.map((line) => `- ${line}`).join('\n');
    // The markers are the boundary of everything we own in this file. The
    // sentence between them is for the human who finds it in six months and
    // wonders what put it there.
    return [
      BEGIN,
      `## From Myu — week of ${input.weekOf}`,
      '',
      body,
      '',
      `*Written by the AskMyu plugin because you turned on the weekly review. Everything between these markers is replaced each time it runs; the rest of this note is yours.*`,
      END,
    ].join('\n');
  }
}

/**
 * Replace the marked section, or append it if absent. Exported for the
 * acceptance test: "re-running doesn't duplicate and doesn't eat the note" is
 * the property the whole module rests on, and it should be provable without a
 * vault.
 */
export function replaceSection(contents: string, section: string): string {
  const begin = contents.indexOf(BEGIN);
  const end = contents.indexOf(END);

  if (begin !== -1 && end !== -1 && end > begin) {
    return contents.slice(0, begin) + section + contents.slice(end + END.length);
  }

  // A half-present marker means someone edited inside our block. Leave their
  // file alone and append a fresh section rather than guessing where the damage
  // ends — losing their edit would be far worse than a duplicate heading.
  const separator = contents.endsWith('\n') ? '\n' : '\n\n';
  return `${contents}${separator}${section}\n`;
}
