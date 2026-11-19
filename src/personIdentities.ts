/**
 * One colleague is one person, as the person sees it (2026-11-15): the plugin's vendored copy of the parts of shared
 * `types/personIdentities.ts` that the vault needs: drawing Myu's lines (the question "Is tessc-gh on GitHub Tess Colleague?" with
 * its four choices, "No, someone else" by a person or a typed name, what the server said back, and "Not her?" on the assumed tie),
 * "Same person", and Undo after either (its words, the `move_id` an answer carries, what an undo came to).
 *
 * Each declaration below this header is shared's, word for word, with one difference: `UnplacedName.kind` is `string` here where
 * shared writes `IdentityKind | string` (the same type; the plugin's lint refuses a union a string swallows). The card's "Also
 * known as" and "Names Myu could not place" are not drawn in the vault, so their shapes and words (`KnownAs`, `keptThingWords`)
 * are not copied; of the doors in `IDENTITY_PATHS`, the vault calls only `merge` and `undo`.
 * `tests/internal/personIdentitiesParity.test.ts` holds each declaration to shared's text and its answers to shared's.
 *
 * Never in anything a person reads: identity, identities, relationship, candidate, stand-in, handle, login, merge.
 */

export type IdentityChoice = 'yes' | 'someone_else' | 'not_a_person' | 'not_now';

export const IDENTITY_ASK_KIND = 'identity_ask';

export const IDENTITY_ASSUMED_KIND = 'identity_assumed';

export const SOMEONE_ELSE: IdentityChoice = 'someone_else';

/** One thing waiting under a name nobody is behind (2026-11-15 follow-up): its kind and its own few words. */
export interface KeptThing {
  commitment_id: string;
  /** The entry's kind: ask · promise · in_your_name · told … */
  kind?: string | null;
  words?: string | null;
  at?: string | number | null;
}

/** A name nobody is behind yet, with what waits under it. */
export interface UnplacedName {
  identity_id: string;
  kind: string;
  shown: string;
  scope?: string | null;
  /** The name a source showed beside an address ("Tess Colleague" on a mail from tess@elsewhere.test). */
  name_seen?: string | null;
  source?: string | null;
  things: number;
  /** The server's own words: "tessc-gh on GitHub". */
  label?: string | null;
  guess?: { relationship_id: string; name: string } | null;
  /** The things themselves, newest first, up to 20 (`things` counts them all). Absent from a server before the follow-up. */
  kept?: KeptThing[] | null;
}

/** `POST /myu/identities/answer` and `POST /myu/person/identities/remove` and the merge: what each says back. */
export interface IdentityChangeResult {
  success: boolean;
  op?: string;
  identity_id?: string;
  relationship_id?: string;
  name?: string;
  moved?: number;
  moved_back?: number;
  move_id?: string;
  said?: string;
  error?: string;
}

export interface UndoResult {
  success: boolean;
  moved_back?: number;
  kind?: string;
  identity_id?: string;
  /** 409 `already_undone`, or `changed_since` when the name was placed another way after (then nothing changed). */
  error?: string;
}

/**
 * What the line carries about the way someone was met, as the frontend asked the backend to serve it beside the line (15 Nov):
 * `identity: {identity_id, kind, guess_relationship_id, guess_name, waiting, someone_else_takes, relationship_id, how}`.
 */
export interface LineIdentity {
  identity_id?: string | null;
  kind?: string | null;
  guess_relationship_id?: string | null;
  guess_name?: string | null;
  waiting?: number | null;
  someone_else_takes?: string[] | null;
  relationship_id?: string | null;
  how?: string | null;
}

/** What a client needs to draw one of the two lines. */
export interface IdentityLine {
  which: 'ask' | 'assumed';
  identity_id: string | null;
  guess_relationship_id: string | null;
  relationship_id: string | null;
}

type LineLike = {
  kind?: string | null;
  ask_kind?: string;
  choices?: Array<{ id: string }>;
  why?: { evidence?: Array<{ kind?: string; ref?: string }> } | null;
  identity?: LineIdentity | null;
};

/**
 * One of the two lines, or null. The line's `kind` and `identity` when the server sends them; until it does (15 Nov: neither is
 * served), the line's evidence of kind `identity` (its ref is the way's id) with a `someone_else` choice for the question, or ask_kind
 * `assume` for the assumed tie.
 */
export function identityLineOf(line: LineLike): IdentityLine | null {
  const evidence = (line.why?.evidence ?? []).find((e) => e?.kind === 'identity');
  const id = line.identity?.identity_id ?? evidence?.ref ?? null;
  const asks = line.kind === IDENTITY_ASK_KIND || (!line.kind && !!evidence && line.ask_kind === 'choice' && (line.choices ?? []).some((c) => c.id === SOMEONE_ELSE));
  const assumed = line.kind === IDENTITY_ASSUMED_KIND || (!line.kind && !!evidence && line.ask_kind === 'assume');
  if (!asks && !assumed) return null;
  return { which: asks ? 'ask' : 'assumed', identity_id: id, guess_relationship_id: line.identity?.guess_relationship_id ?? null, relationship_id: line.identity?.relationship_id ?? null };
}

/** "No, someone else": a person chosen from the person's people, or a name typed. */
export function someoneElseAnswer(who: { relationship_id: string } | { text: string }): { choice_id: string; relationship_id?: string; text?: string } {
  return 'relationship_id' in who ? { choice_id: SOMEONE_ELSE, relationship_id: who.relationship_id } : { choice_id: SOMEONE_ELSE, text: who.text.trim() };
}

/** The undo of what an answer moved: the `said` effect's `move_id` (2026-11-15 follow-up), or null. */
export function saidMoveId(res: { effects?: Array<{ type: string; move_id?: string }> | null } | null | undefined): string | null {
  const said = (res?.effects ?? []).find((e) => e.type === 'said' && typeof e.move_id === 'string' && e.move_id);
  return said?.move_id ?? null;
}

/** What an undo came to, in words: put back, already put back, or changed since (then nothing changed). */
export function undoWords(res: { success?: boolean; error?: string | null } | null | undefined): string {
  if (res?.success) return IDENTITY_WORDS.undone;
  if (res?.error === 'already_undone') return IDENTITY_WORDS.alreadyUndone;
  if (res?.error === 'changed_since') return IDENTITY_WORDS.changedSince;
  return IDENTITY_WORDS.didNotGoThrough;
}

/** What the server said back: the `said` effect ("Done. 3 things moved to Tess Colleague.") over the readback's "Okay.". */
export function saidBack(res: { readback?: { text?: string } | null; effects?: Array<{ type: string; text?: string }> | null } | null | undefined): string | null {
  const said = (res?.effects ?? []).find((e) => e.type === 'said' && typeof e.text === 'string' && e.text.trim());
  return said?.text?.trim() || res?.readback?.text?.trim() || null;
}

/** "Myu took tessc-gh on GitHub to be Tess Colleague, from her address on a commit. Not her?" → the claim, and "Not her?" for the button. */
export function assumedParts(text: string): { claim: string; notThem: string } {
  const m = /^([\s\S]*?[.!])\s*(Not (?:her|him|them)\?)\s*$/.exec(text.trim());
  return m ? { claim: m[1], notThem: m[2] } : { claim: text.trim(), notThem: IDENTITY_WORDS.notThem };
}

/** "her", "him", "them": the same, as the object ("Not her?"). */
export function objective(pronouns: string | null | undefined): string {
  const first = (pronouns ?? '').trim().toLowerCase().split(/[/\s]+/)[0];
  return first === 'she' ? 'her' : first === 'he' ? 'him' : 'them';
}

const SOURCE_NAMES: Record<string, string> = { github: 'GitHub', slack: 'Slack', zulip: 'Zulip', linear: 'Linear', jira: 'Jira' };

/** How a way someone is known reads: "tessc-gh on GitHub", "Tess C. on Slack", "Tess C. in Linear", "tess@elsewhere.test", "“Tess”". */
export function knownAsLabel(k: { kind: string; shown: string; name_seen?: string | null }): string {
  const chat = k.name_seen?.trim() || k.shown;
  switch (k.kind) {
    case 'github':
      return `${k.shown} on GitHub`;
    case 'slack':
    case 'zulip':
      return `${chat} on ${SOURCE_NAMES[k.kind]}`;
    case 'linear':
    case 'jira':
      return `${chat} in ${SOURCE_NAMES[k.kind]}`;
    case 'email':
      return k.shown;
    default:
      return `“${k.shown}”`;
  }
}

export const things = (n: number): string => (n === 1 ? '1 thing' : `${n} things`);

/** Every sentence a person reads here that the server does not send (the brief's table, word for word). */
export const IDENTITY_WORDS = {
  knownAs: 'Also known as',
  unplaced: 'Names Myu could not place',
  unplacedNone: 'None right now.',
  /** Beside a name nobody is behind: what waits under it. */
  waiting: (n: number) => `${things(n)} waiting under it`,
  /** Beside a way someone is known: what came under it. */
  cameUnder: (n: number) => (n ? `${things(n)} came under it` : ''),
  /** Beside a way Myu tied by itself. */
  assumedNote: (pronouns?: string | null) => `Myu took this to be ${objective(pronouns)}`,
  takeOff: 'Take off',
  takeOffAsk: (name: string, n: number) =>
    n ? `Take this off ${name}? ${n === 1 ? '1 thing that came under it will' : `${n} things that came under it will`} go back to waiting.` : `Take this off ${name}?`,
  keep: 'Keep it',
  undo: 'Undo',
  undone: 'Put back as it was.',
  notThem: 'Not them?',
  chooseWho: 'Choose who',
  pickPrompt: 'Who is it?',
  /** Where the person types part of a name of one of their people, or a whole new name. */
  pickPlaceholder: 'One of your people, or a name',
  /** A name typed as it is: the one person by that whole name, else a new person by it. */
  nameTyped: (name: string) => `Use “${name.trim()}”`,
  back: 'Back',
  /** "Same person" from a person's card or a list, in place of the old "Merge … into…". */
  samePerson: 'Same person',
  samePersonTitle: (name: string) => `${name} is the same person as…`,
  samePersonHint: (name: string) => `Choose who ${name} really is. Everything kept under ${name} moves to them.`,
  samePersonSearch: 'Search your people',
  /** Two real names (16 Nov): the order said decides which is kept; how to keep the other. */
  sayOtherWay: 'To keep the other name, say it the other way round.',
  /** The web's way to say it the other way round: the button under the question. */
  keepInstead: (name: string) => `Keep ${name} instead`,
  /** The help queue's row where the order decides (two real names): either can be kept. */
  keepWhich: 'Keep the name you choose; the other becomes another name for the same person.',
  /** When the server says nothing back. */
  didNotGoThrough: 'That did not go through. Try again.',
  /** 2026-11-15 follow-up: what waits under a name, folded until asked for; a question closed while it was on screen; an undo refused. */
  seeThem: 'See them ▸',
  hide: 'Hide',
  alreadyAnswered: 'Already answered.',
  alreadyUndone: 'That was already put back.',
  changedSince: 'That has changed since, so nothing was put back.',
  question: (u: Pick<UnplacedName, 'kind' | 'shown' | 'name_seen' | 'label' | 'things' | 'guess'>) => unplacedQuestion(u),
  choices: (hasGuess: boolean): Array<{ id: IdentityChoice; label: string }> => [
    ...(hasGuess ? [{ id: 'yes' as const, label: 'Yes' }] : []),
    { id: 'someone_else', label: hasGuess ? 'No, someone else' : 'Choose who' },
    { id: 'not_a_person', label: 'Not a person' },
    { id: 'not_now', label: 'Not now' },
  ],
} as const;

/** The question for a name nobody is behind, as the line asks it (the backend's `IdentityLines.questionText`). */
export function unplacedQuestion(u: Pick<UnplacedName, 'kind' | 'shown' | 'name_seen' | 'label' | 'things' | 'guess'>): string {
  const label = u.label?.trim() || knownAsLabel(u);
  const name = u.guess?.name?.trim() || null;
  if (u.kind === 'email' && u.name_seen?.trim() && name) return `Mail came from ${u.shown} under the name ${u.name_seen.trim()}. Is that the ${name} you know?`;
  const waiting = u.things > 0 ? ` ${u.things === 1 ? '1 thing is' : `${u.things} things are`} waiting under that name.` : '';
  return name ? `Is ${label} ${name}?${waiting}` : `Who is ${label}?${waiting}`;
}

/** The doors. */
export const IDENTITY_PATHS = {
  knownAs: (relationshipId: string) => `/myu/person/identities?relationship_id=${encodeURIComponent(relationshipId)}`,
  takeOff: '/myu/person/identities/remove',
  unplaced: '/myu/identities/unplaced',
  answer: '/myu/identities/answer',
  undo: '/myu/person/undo',
  merge: '/relationships/merge',
} as const;

/** The words a person must never read here. */
export const IDENTITY_NEVER = /\b(identity|identities|relationship|candidate|stand-in|handle|login|merge)\b/i;
