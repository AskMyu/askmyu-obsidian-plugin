/**
 * Weave Myu in — the recipes for the things the reader already owns: a
 * daily-note template, a weekly note, a Tasks block, a launcher, a Dataview
 * query. Myu never edits their files; these are theirs to paste, or to insert
 * at the cursor with the command. One module owns the snippets, so the pane,
 * the note and the picker cannot drift apart.
 *
 * Was seven settings rows with a Copy button each — text you could not see
 * before you copied it (operator, 2026-09-03: "is there a better way?").
 */

export interface WeaveSnippet {
  id: string;
  name: string;
  desc: string;
  /** Exactly what lands in the note. */
  text: string;
  /** Fence language in the guide. */
  lang: 'markdown' | 'text';
}

/** The guide's name when kept as a note in Myu's folder. */
export const WEAVE_NOTE = 'Weave Myu in.md';

export function weaveSnippets(folder: string): WeaveSnippet[] {
  const f = folder.replace(/\/+$/, '') || 'Myu';
  return [
    {
      id: 'day',
      name: 'Your day, inside every daily note',
      desc: "Add to your daily-note template. Every daily note — including ones the Calendar plugin creates — carries that day's schedule, meetings and journal.",
      text: `![[${f}/Days/{{date:YYYY-MM-DD}}]]`,
      lang: 'markdown',
    },
    { id: 'today', name: 'The brief in your daily note', desc: 'Add to your daily-note template; every daily note carries the morning brief.', text: `![[${f}/Today]]`, lang: 'markdown' },
    { id: 'week', name: 'The week, embedded', desc: 'Same idea for your weekly note.', text: `![[${f}/Week]]`, lang: 'markdown' },
    { id: 'tasks', name: 'Myu commitments in a Tasks query', desc: 'Anywhere you keep a Tasks block.', text: '```tasks\nnot done\npath includes ' + f + '\n```', lang: 'markdown' },
    { id: 'uri', name: 'A button to today', desc: 'Works from any note, QuickAdd macro, or launcher.', text: 'obsidian://myu', lang: 'text' },
    { id: 'people-base', name: 'The people table, inside any note', desc: 'Bases embed — the live CRM table lands wherever you paste this.', text: `![[${f}/People.base]]`, lang: 'markdown' },
    {
      id: 'people-dataview',
      name: 'Your people as a Dataview table',
      desc: 'If you use Dataview; the bundled Base does this without it.',
      text: '```dataview\ntable role, company, open_commitments\nfrom "' + f + '/People"\n```',
      lang: 'markdown',
    },
  ];
}

/** A code fence that can hold a snippet which is itself a fence. */
export function fence(text: string, lang: string): string {
  const longest = Math.max(2, ...[...text.matchAll(/`+/g)].map((m) => m[0].length));
  const ticks = '`'.repeat(longest + 1);
  return `${ticks}${lang}\n${text}\n${ticks}`;
}

/**
 * The guide, as markdown. In the pane it carries its own title; as a note the
 * file name is the title and the frontmatter keeps it purgeable with
 * everything else Myu wrote.
 */
export function weaveGuide(folder: string, opts: { asNote?: boolean } = {}): string {
  const head = opts.asNote ? '---\nmyu-generated: true\n---\n\n' : '# Weave Myu in\n\n';
  const intro =
    'Myu never edits your files. These are for you to paste into the things you already own — a daily-note template, a weekly note, a Tasks block, a launcher. ' +
    'Each block has a copy button; the command *Insert a Myu snippet…* puts one at the cursor.';
  const body = weaveSnippets(folder)
    .map((s) => `## ${s.name}\n\n${s.desc}\n\n${fence(s.text, s.lang)}`)
    .join('\n\n');
  const api =
    '## For scripts\n\n`app.plugins.plugins.askmyu.api` — `getBrief()`, `getPrep(id)`, `getPersonCard(name)`, `getWeeklyReview()`. ' +
    'Read-only; every call resolves null while the vault is locked, so a template never triggers a ceremony.';
  return `${head}${intro}\n\n${body}\n\n${api}\n`;
}
