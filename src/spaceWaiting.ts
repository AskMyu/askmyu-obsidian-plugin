// Where a space's key stands for this person (2026-11-17, BRIEF_FRONTEND_SPACE_KEYS_BY_LOCK; the backend's shapes as planning fixed them):
// - space reads (`/gattai/spaces/get`) and list rows answer as usual with `key_state`: null when the space opens for this person, else
//   `{code, message}` — `space_waiting` (they are in; it opens for them as soon as someone in it is next here), `space_cannot_open` (this
//   device's key does not open it: said, with no button), or `key_needed` (no key on this device);
// - a door that needs the space's key for its work answers 423 `{error: 'space_waiting' | 'space_cannot_open', message}`.
// The clients say the server's sentence in place of the space, never "unlock" (unlocking cannot help a space that waits for a member). A
// person whose own key is not with this session still reads the unlock words, as before.

export const SPACE_WAITING = 'space_waiting';
export const SPACE_CANNOT_OPEN = 'space_cannot_open';

export const SPACE_WAITING_WORDS = {
  waiting: "You're in. This opens for you as soon as someone in it is next here.",
  /** A device whose key does not open a space it is a member of (2026-11-17, after the review: no button, the way on in words). */
  cantOpen: "This device can't open this space. If it opens on another device of yours, use that one. Otherwise ask someone in it to take you out and invite you again.",
  /** No key on this device (the server's `key_needed` sentence). */
  keyNeeded: 'Finish setting up askMyu on this device first, then try again.',
} as const;

export type SpaceKeyCode = 'space_waiting' | 'space_cannot_open' | 'key_needed';

export interface SpaceKeyState {
  code: SpaceKeyCode;
  /** The server's sentence; ours where it sends none. */
  message: string;
}

const CODES: readonly SpaceKeyCode[] = ['space_waiting', 'space_cannot_open', 'key_needed'];
const DEFAULT_MESSAGE: Record<SpaceKeyCode, string> = {
  space_waiting: SPACE_WAITING_WORDS.waiting,
  space_cannot_open: SPACE_WAITING_WORDS.cantOpen,
  key_needed: SPACE_WAITING_WORDS.keyNeeded,
};

const objOf = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/**
 * The key state an answer or a row carries: its `key_state` object, or a door's refusal (`error` / `code` / `state` of `space_waiting` or
 * `space_cannot_open`; a bare `key_needed` refusal is the device's own matter, read by `isNoWorkingCopy`). Null when the space opens.
 */
export function spaceKeyStateOf(body: unknown): SpaceKeyState | null {
  const o = objOf(body);
  if (!o) return null;
  const ks = objOf(o.key_state);
  let code: SpaceKeyCode | null = null;
  let src: Record<string, unknown> = o;
  if (ks && CODES.includes(ks.code as SpaceKeyCode)) {
    code = ks.code as SpaceKeyCode;
    src = ks;
  } else {
    const top = [o.error, o.code, o.state].find((v): v is SpaceKeyCode => v === SPACE_WAITING || v === SPACE_CANNOT_OPEN);
    if (top) code = top;
  }
  if (!code) return null;
  return { code, message: text(src.message) ?? DEFAULT_MESSAGE[code] };
}

/** The server's sentence when an answer says the space waits for a member; null for any other answer. */
export function spaceWaitingOf(body: unknown): string | null {
  const s = spaceKeyStateOf(body);
  return s && s.code === SPACE_WAITING ? s.message : null;
}

/** A list row whose space does not open here: its sentence, unless the row's own lines already say it; else null. */
export function waitingUnder(row: unknown, said: Array<string | null | undefined> = []): string | null {
  const s = spaceKeyStateOf(row);
  if (!s || said.some((x) => (x ?? '').trim().toLowerCase() === s.message.toLowerCase())) return null;
  return s.message;
}

/**
 * Myu's lines about a space's key (the backend's shapes, 17 Nov). Those with a yes are the person's own (the box, never an agent's word):
 * Myu proposing to invite someone into a space (`invite` · `not_now`), after 14 days the one still waiting (`keep` · `leave`), and the
 * third person (the operator's answer, 17 Nov: nobody is added to a space between two people; bringing someone in starts a new space, and a
 * summary goes across only with both people's yes): starting a space with them (`space_start_with`), the summary for the starter
 * (`space_carry_draft`) and for the other of the two (`space_carry_ask`). The others only tell: someone waiting to get in, a question that
 * waits for its space to open, the asker's "Your question is with ‹name›", and how the summary went (`space_carry_done`, no words of it).
 * The receiving side of a first question rides `agents_pair_receive` with `waiting: true` (already the person's own).
 */
export const SPACE_KEY_LINE_KINDS = {
  // `space_invitation` (18 Nov, the real-session run): "‹inviter› invited you to ‹space›." Join · Decline · Not now; its Join is the page's accept.
  needsYes: ['space_propose_invite', 'space_still_waiting', 'space_start_with', 'space_carry_draft', 'space_carry_ask', 'space_invitation'],
  // `space_carry_in` (18 Nov): "‹name› brought a summary into ‹space›: ‹words›", once to each other member.
  tells: ['space_waiting_to_get_in', 'room_waiting_for_key', 'invite_question_reached', 'space_carry_done', 'space_carry_in'],
} as const;

/** The lines whose text holds a summary word for word (sealed on the server): never in a log, a cache outside the line, or analytics. */
export const SUMMARY_WORDS_KINDS = ['space_carry_draft', 'space_carry_ask', 'space_carry_in'] as const;

export function holdsSummaryWords(line: { kind?: string | null } | null | undefined): boolean {
  return !!line?.kind && (SUMMARY_WORDS_KINDS as readonly string[]).includes(line.kind);
}

/**
 * A line answered "key needed" after the key could not be opened here (2026-11-17): the line stays open, and its readback is the server's
 * sentence (its `readback.text`, else its `message`, else ours).
 */
export function keyNeededReadback(body: unknown): string {
  const o = objOf(body);
  return text(objOf(o?.readback)?.text) ?? text(o?.message) ?? SPACE_WAITING_WORDS.keyNeeded;
}

/**
 * What a refused press on an interview debrief does (2026-11-17): the space not opening here says its sentence; `locked` says the server's
 * own sentence, or (`say: null`) the caller's general words for something that did not go through, and is never offered the unlock; only no
 * key here (`key_needed`, or a bare 423) offers to open it in place. Null: the caller's words for that refusal.
 */
export function debriefRefusalStep(r: { status?: number; error?: string | null; data?: unknown }): { say: string | null; code: string } | { unlock: true } | null {
  const st = spaceKeyStateOf(r.data) ?? spaceKeyStateOf({ error: r.error });
  if (st) return { say: st.message, code: st.code };
  if (r.error === 'locked') return { say: text(objOf(r.data)?.message), code: 'locked' };
  if (r.error === 'key_needed' || r.error === 'no_working_copy' || r.status === 423) return { unlock: true };
  return null;
}

/**
 * A retro read (`GET /retro`, answered 200 with `key_state`, or refused 423 with its code) whose space does not open here (2026-11-17):
 * the sentence to show in place of the retro, which would otherwise read as empty; null when it opens.
 */
export function retroInPlaceOf(read: unknown): string | null {
  return spaceKeyStateOf(read)?.message ?? null;
}
