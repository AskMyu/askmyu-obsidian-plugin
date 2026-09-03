/**
 * What you can DO to a person — the web's kebab, in the vault's three doors:
 * right-click the person note (file-menu), the command palette on the active
 * note, and the card's edit modal. One list, so the doors never disagree.
 *
 * Web kebab (EntityListPanel): Discuss with Myu · Merge into… · This card
 * isn't right (archive) · This is me. Discuss and archive/forget already
 * existed here; merge and this-is-me are new (2026-08-29).
 */

import type { EntityHeadline } from '../transport/api';

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
  merge: (source: string, target: string) => ({
    title: `Merge ${source} into ${target}?`,
    body: `Everything Myu knows about ${source} \u2014 memories, threads, history \u2014 moves to ${target}. ${source} is removed from your people, and their note here goes to the trash. This cannot be undone from the vault.`,
    cta: 'Merge',
  }),
  self: (name: string) => ({
    title: `${name} is you?`,
    // Backend folds the person into the self (memories, threads, names) as of
    // 2026-08-29. The earlier wording that said it did NOT is gone.
    body: `Everything Myu knows about ${name} becomes part of you \u2014 memories, threads, and the name itself, so future mentions are recognised as you. ${name} is removed from your people, and their note here goes to the trash.`,
    cta: 'Yes, that\u2019s me',
  }),
} as const;
