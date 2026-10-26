/**
 * The interview debrief (2026-09-29) in the vault: its space's conversation and its Today entry.
 *
 * A debrief space talks in the same space conversation as a retro's: one ask at a time, the
 * backend's words, choices as buttons, the person's own typed words in the box. What differs is
 * small, and it lives here: which space is an interview debrief, where to add the candidate's CV
 * (the vault cannot take a file there, so it says where: the web page, or the terminal), and the
 * few words the plugin owns. Nothing of a retro's (its page, "How this works", the getting-ready
 * door) is part of it.
 *
 * No host API in this file. The words mirror shared `DEBRIEF_WORDS` where they overlap; the
 * monorepo-only `tests/internal/debriefParity.test.ts` holds them together.
 */

import type { SpaceLite } from './transport/api';
import type { SpaceConversationRead, SpaceEffect } from './wire';

export const DEBRIEF_PANE_WORDS = {
  /** The kind, as a person reads it (shared `DEBRIEF_WORDS.nameCap`). */
  nameCap: 'Interview debrief',
  /** The door on Today, into the space's conversation. */
  door: 'Ask Myu about this interview debrief ▸',
  /** "Add a CV": the file goes on the candidate's page on the web, or through the terminal. */
  cvWhere: (name: string, link: string) =>
    `To add ${name.trim() || 'the candidate'}'s CV, open this interview debrief on the web: ${link} Or, in the terminal: myu debrief "${name.trim() || 'name'}" --cv <file>`,
  /** "Paste a LinkedIn link", when the backend says nothing back. */
  linkedinHere: 'Paste the LinkedIn link in the box below, and send it.',
  /** A session that may only read (403 `scope_required`). */
  agentRefused: 'This session can read this interview debrief, not act in it.',
} as const;

/** The conversation is an interview debrief's (the backend says `stage.work = "debrief"`). */
export function isDebriefConversation(conv: Pick<SpaceConversationRead, 'stage'> | null | undefined): boolean {
  return conv?.stage?.work === 'debrief';
}

/** The space is an interview debrief (`POST /gattai/spaces` sends `work`). */
export function isDebriefSpace(space: Pick<SpaceLite, 'work'> | null | undefined): boolean {
  return space?.work === 'debrief';
}

/** Today's small line beside the name: "Interview debrief · 4 members". */
export function debriefSmall(memberCount: number | undefined): string {
  const members = typeof memberCount === 'number' && memberCount > 0 ? `${memberCount} ${memberCount === 1 ? 'member' : 'members'}` : '';
  return [DEBRIEF_PANE_WORDS.nameCap, members].filter(Boolean).join(' · ');
}

export type DebriefStep = { do: 'attach_cv' } | { do: 'paste_linkedin' };

/** The debrief's own effects after a button: "Add a CV" (`attach_cv`) and "Paste a LinkedIn link" (`paste_linkedin`). */
export function debriefEffectSteps(effects: SpaceEffect[] | undefined | null): DebriefStep[] {
  const out: DebriefStep[] = [];
  for (const e of effects ?? []) {
    if (e.type === 'attach_cv') out.push({ do: 'attach_cv' });
    else if (e.type === 'paste_linkedin') out.push({ do: 'paste_linkedin' });
  }
  return out;
}
