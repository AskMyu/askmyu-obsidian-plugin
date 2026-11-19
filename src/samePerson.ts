/**
 * "Same person" in the vault (2026-11-15, BRIEF_FRONTEND_ONE_COLLEAGUE_ONE_PERSON §5, against the backend's IMPL_BACKEND_PHASE1_20261115
 * §1.4.5), as the web's `useSamePerson` does it: `POST /relationships/merge {source_id, target_id, action: "confirm"}`; the one kept
 * holds everything of both, and the server says how many things moved ("Now one person. 5 things moved to Tess Colleague."). That
 * sentence is shown with Undo beside it; when it does not go through, "That did not go through. Try again." The words are shared's
 * (`IDENTITY_WORDS`, the plugin's copy).
 *
 * Undo (the follow-up, 2026-11-15, §2.2): the same for every move a person makes about who someone is — "Same person", and an
 * answer on Myu's question ("Yes", "Choose who" / "No, someone else", "Not her?"), whose `said` effect carries the `move_id`.
 * `POST /myu/person/undo {move_id}`, then what it came to in shared's words (`undoWords`): "Put back as it was.", or "That was
 * already put back." (409 `already_undone`), or "That has changed since, so nothing was put back." (409 `changed_since`).
 *
 * Every door into it (the picker from a person's note, the command, the card's edit window, the Help Myu row, a line's answer)
 * goes through here. No host calls: what is shown, and what the vault does after, are handed in.
 */

import type { AskMyuApi } from './transport/api';
import { IDENTITY_WORDS, undoWords } from './personIdentities';

/** The way back, beside the server's sentence. */
export interface UndoAction {
  label: string;
  run: () => void;
}

/** What an undo needs: the door, what is shown, and what the vault does after it went through. */
export interface PersonMoveDeps {
  backend: Pick<AskMyuApi, 'undoPersonChange'>;
  /** A sentence, with Undo when there is a way back (null after an undo). */
  done: (said: string, undo: UndoAction | null) => void;
  /** It did not go through, or there was nothing to put back. */
  failed: (said: string) => void;
  /** After an undo went through: the vault and Today read again. */
  undone?: () => void | Promise<void>;
}

export interface SamePersonDeps extends PersonMoveDeps {
  backend: Pick<AskMyuApi, 'samePerson' | 'undoPersonChange'>;
  /** After it went through: the vault's note for the one who moved, Today, the Help Myu row. */
  after?: () => void | Promise<void>;
}

/** Undo beside a sentence: pressed, it puts that move back. */
export function undoAction(deps: PersonMoveDeps, moveId: string): UndoAction {
  return { label: IDENTITY_WORDS.undo, run: () => void undoPersonMove(deps, moveId) };
}

/** "Same person": `source` is the one who moves, `target` the one kept. True when it went through. */
export async function samePerson(deps: SamePersonDeps, sourceId: string, targetId: string): Promise<boolean> {
  const res = await deps.backend.samePerson(sourceId, targetId).catch(() => null);
  if (!res?.ok || !res.data?.success) {
    deps.failed(IDENTITY_WORDS.didNotGoThrough);
    return false;
  }
  const moveId = res.data.move_id?.trim() || null;
  deps.done(res.data.said?.trim() || IDENTITY_WORDS.samePerson, moveId ? undoAction(deps, moveId) : null);
  await deps.after?.();
  return true;
}

/** Undo: puts the move back as it was, and says what it came to. True when it went through. */
export async function undoPersonMove(deps: PersonMoveDeps, moveId: string): Promise<boolean> {
  const res = await deps.backend.undoPersonChange(moveId).catch(() => null);
  const went = !!res?.ok && !!res.data?.success;
  const words = undoWords(res ? { success: went, error: res.error ?? res.data?.error ?? null } : null);
  if (!went) {
    deps.failed(words);
    return false;
  }
  deps.done(words, null);
  await deps.undone?.();
  return true;
}
