// An address proven at sign-in that only an unconfirmed password account holds (2026-11-17; the backend's shapes, relayed by
// planning). After an address is proven (a right code at POST /auth/email-code/verify, Google at POST /auth/google/signin, or the
// mailed link), when the only account at that address is a password account nobody confirmed, the door answers 409 `address_held`
// with the server's sentence and two choices: enter that account's password (which opens and confirms it), or start one's own.
// The answer goes to POST /auth/address-held; then the client sends the same sign-in again (the same code, the same Google
// credential, or opens `again_url`) and it goes through. The mailed link sends the web to `/auth/address-held?held=<token>`, which
// reads the same fields from POST /auth/address-held/read {held_token}. One question, two choices, a way back to the start; the
// server's `message` is shown each time.
//
// And the plugin's sign-up (the same work): `/account/create` answers `email_confirmed`, `email_confirmation` ("sent" | "not_sent")
// and `email_message`; until the address is confirmed the account works but gets no invitation, seat or connection at it.
// POST /account/emails/resend {email} mails it again; `/account/get` carries `email_confirmed`.

export const ADDRESS_HELD = 'address_held';

export interface AddressHeldChoice {
  id: string;
  label: string;
}

export interface AddressHeld {
  held_token: string;
  email: string;
  message: string;
  choices: AddressHeldChoice[];
}

export const ADDRESS_HELD_WORDS = {
  message:
    "An account was made at this address with a password and never confirmed. If it's yours, enter that password to open it (that confirms it). If it isn't, start your own.",
  password: 'Enter its password',
  startOwn: 'Start my own account',
  passwordField: 'Its password',
  open: 'Open it',
  back: 'Back to the start',
  wrong: "That isn't its password.",
  triesLeft: (n: number) => (n === 1 ? '1 try left.' : `${n} tries left.`),
  tooMany: 'Too many tries. Go back to the start and sign in again.',
  expired: 'This question has ended. Go back to the start and sign in again.',
  failed: "That didn't go through. Try again in a moment.",
} as const;

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** The two choices, in the server's words where it sends them; ours otherwise. Always both, password first. */
function choicesOf(raw: unknown): AddressHeldChoice[] {
  const sent = Array.isArray(raw) ? raw : [];
  const label = (id: string, fallback: string) => {
    const c = sent.find((x) => !!x && typeof x === 'object' && (x as { id?: unknown }).id === id) as { label?: unknown } | undefined;
    return str(c?.label) ?? fallback;
  };
  return [
    { id: 'password', label: label('password', ADDRESS_HELD_WORDS.password) },
    { id: 'start_own', label: label('start_own', ADDRESS_HELD_WORDS.startOwn) },
  ];
}

/** The 409 `address_held` answer of a sign-in (or the read door's 200 for the mailed link), else null. */
export function addressHeldOf(status: number, body: unknown): AddressHeld | null {
  const o = body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  if (!o) return null;
  const isHeld = (status === 409 && o.error === ADDRESS_HELD) || (status === 200 && o.error === undefined && typeof o.held_token === 'string');
  const token = str(o.held_token);
  if (!isHeld || !token) return null;
  return { held_token: token, email: str(o.email) ?? '', message: str(o.message) ?? ADDRESS_HELD_WORDS.message, choices: choicesOf(o.choices) };
}

/** The body for POST /auth/address-held. */
export function addressHeldBody(heldToken: string, choice: 'password' | 'start_own', password?: string): Record<string, string> {
  return choice === 'password' ? { held_token: heldToken, choice, password: password ?? '' } : { held_token: heldToken, choice };
}

export type AddressHeldOutcome =
  /** Answered: send the same sign-in again (or open `again_url`). */
  | { kind: 'done'; choice: string; again_url?: string }
  /** 401: the password was not that account's; the question stays. */
  | { kind: 'wrong'; message: string; tries_left?: number }
  /** 429 after five: the server ends the question (its token is gone), as `expired`: only the way back to the start. */
  | { kind: 'too_many'; message: string }
  /** 410: the token ended; back to the start. */
  | { kind: 'expired'; message: string }
  | { kind: 'failed'; message: string };

/** What POST /auth/address-held's answer means, with the server's sentence each time. */
export function addressHeldOutcome(status: number, body: unknown): AddressHeldOutcome {
  const o = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const message = str(o.message);
  if (status === 200 && o.success !== false) return { kind: 'done', choice: str(o.choice) ?? '', ...(str(o.again_url) ? { again_url: str(o.again_url)! } : {}) };
  if (status === 401) {
    const left = typeof o.tries_left === 'number' && Number.isFinite(o.tries_left) ? o.tries_left : undefined;
    return { kind: 'wrong', message: message ?? ADDRESS_HELD_WORDS.wrong + (left !== undefined ? ' ' + ADDRESS_HELD_WORDS.triesLeft(left) : ''), ...(left !== undefined ? { tries_left: left } : {}) };
  }
  if (status === 429) return { kind: 'too_many', message: message ?? ADDRESS_HELD_WORDS.tooMany };
  if (status === 410) return { kind: 'expired', message: message ?? ADDRESS_HELD_WORDS.expired };
  return { kind: 'failed', message: message ?? ADDRESS_HELD_WORDS.failed };
}

// ── The plugin's sign-up: the address to confirm ─────────────────────────

export interface SignupConfirmation {
  email: string;
  /** null when the server did not say (an older server): nothing is said then. */
  confirmed: boolean | null;
  sent: 'sent' | 'not_sent' | null;
  message: string | null;
}

export function signupConfirmationOf(data: unknown, email: string): SignupConfirmation {
  const o = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const sent = o.email_confirmation === 'sent' || o.email_confirmation === 'not_sent' ? o.email_confirmation : null;
  return { email: str(o.email) ?? email, confirmed: typeof o.email_confirmed === 'boolean' ? o.email_confirmed : null, sent, message: str(o.email_message) };
}

export const ADDRESS_CONFIRM_WORDS = {
  /** Said once, after sign-up, when the confirmation went. */
  mailed: (email: string) => `We've mailed ${email}. Confirm it from that mail to get invitations and connect with people there.`,
  /** …when it could not go: the server's sentence where it sends one. */
  notMailed: (email: string) => `We couldn't mail ${email} just now. Mail the confirmation again from Settings to get invitations and connect with people there.`,
  /** Where the account is shown. */
  confirmed: 'confirmed',
  notConfirmed: 'not confirmed yet: invitations and connections at this address wait until it is',
  mailAgain: 'Mail the confirmation again',
  mailedAgain: (email: string) => `Mailed ${email} again.`,
  mailFailed: "That didn't go. Try again in a moment.",
} as const;

/** The sentence after sign-up, or null when there is nothing to say (confirmed already, or an older server that does not say). */
export function signupConfirmationWords(c: SignupConfirmation): string | null {
  if (c.confirmed !== false) return null;
  if (c.sent === 'not_sent') return c.message ?? ADDRESS_CONFIRM_WORDS.notMailed(c.email);
  return ADDRESS_CONFIRM_WORDS.mailed(c.email);
}
