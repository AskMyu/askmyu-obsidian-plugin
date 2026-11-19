/**
 * What you can DO to a person — the web's kebab, in the vault's three doors:
 * right-click the person note (file-menu), the command palette on the active
 * note, and the card's edit modal. One list, so the doors never disagree.
 *
 * Web kebab (EntityListPanel): Discuss with Myu · Same person as… · This card
 * isn't right (archive) · This is me. Discuss and archive/forget already
 * existed here; "Same person" and this-is-me are new (2026-08-29). Since
 * 2026-11-15 the first is "Same person" on every screen, never the old word
 * (BRIEF_FRONTEND_ONE_COLLEAGUE_ONE_PERSON), and it can be undone.
 */

import type { EntityHeadline } from '../transport/api';
import { IDENTITY_WORDS } from '../personIdentities';

export interface PersonRef { id: string; name: string }

/**
 * Who a person can be merged INTO — the web's exact rule (MergePickerModal):
 * persons only (you can't merge into a company), never the self, never the
 * source itself. Pure, so the rule is pinned.
 */
export function mergeCandidates(entities: EntityHeadline[], sourceId: string): EntityHeadline[] {
  // `entity_type === 'person'` already excludes the self row (entity_type 'self') and companies.
  return entities.filter((e) => e.entity_type === 'person' && e.entity_id !== sourceId);
}

/** The words each confirm uses — plain about what happens, including what does NOT. */
export const PERSON_ACTION_COPY = {
  /**
   * "Same person" (2026-11-15), the web's words: `source` moves, `target` is kept. `note`, beside it only when Myu keeps notes in
   * the vault: the vault's own part (the note of the one who moves goes to the trash).
   */
  samePerson: (source: string, target: string, opts: { vaultNotes?: boolean } = {}) => ({
    title: `${source} and ${target} are the same person?`,
    body: `Everything kept under ${source} moves to ${target}: what was said, the promises, the mail and the meetings. You can undo it.`,
    cta: IDENTITY_WORDS.samePerson,
    ...(opts.vaultNotes ? { note: `${source}’s note in the Myu folder goes to the trash.` } : {}),
  }),
  /** The menu item, the command and the card's edit window that open the picker. */
  samePersonAs: 'Same person as…',
  self: (name: string) => ({
    title: `Is ${name} you?`,
    // Backend folds the person into the self (memories, threads, names) as of
    // 2026-08-29. The earlier wording that said it did NOT is gone.
    body: `Everything Myu knows about ${name} (memories, open items, and the name itself) is added to your own profile, so future mentions of ${name} are recognised as you. ${name} is removed from your people, and their note in the Myu folder goes to the trash.`,
    cta: 'Yes, that\u2019s me',
  }),
} as const;
