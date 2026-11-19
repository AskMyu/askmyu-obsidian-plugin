/**
 * A line about a promise of the person's that someone else's decision affects (2026-11-13, kind `check_promise`; the backend's handback
 * IMPL_BACKEND_PHASE1_20261112 §8.1 item 10, §8.3). Its words are the server's, several lines ("Jonah decided, today: “…”", "That
 * affects something you promised:", " • You promised Priya, Monday: “…”"), shown as sent with their line breaks; its choices are the
 * server's: Tell <name> · Let it go · Keep it, answered `{choice_id}`. Tell has no readback of its own: it comes back with the effect
 * below, carrying "Here it is, to send." and the message (`draft: {to, in, thread_ref, text}`), shown as Add it's addition is
 * (`lastMomentsVault.answerDraftOf`). Nothing is sent from the vault.
 *
 * The four declarations below are shared `types/checkWords.ts`'s, word for word (the vault takes shared TYPES only), held to it by
 * `tests/internal/lastMomentsParity.test.ts`.
 */

/** A line about a promise someone else's decision affects (13 Nov): Tell <name> · Let it go · Keep it, the person's own to answer. */
export const CHECK_PROMISE_KIND = 'check_promise';
export const isCheckPromiseLine = (line: { kind?: string | null } | null | undefined): boolean => line?.kind === CHECK_PROMISE_KIND;
/** The choices when the server sends none of its own (it always does; these are its words). */
export const CHECK_PROMISE_CHOICES = [
  { id: 'tell', label: 'Tell them' },
  { id: 'let_go', label: 'Let it go' },
  { id: 'keep', label: 'Keep it' },
] as const;
/** What Tell comes back with: an effect of this type carrying `draft: {to, in, thread_ref, text}` and its `readback`. */
export const CHECK_PROMISE_DRAFT_EFFECT = 'check_promise_draft';
