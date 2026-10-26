// Commitments on Today (terminal parity, 2026-09-26): "what you owe ▸", folded, from `GET /commitments`: "you owe"
// and "owed to you", each row `what · name · next check <day>` with the status as sent, the row opening the other
// person's conversation. The plugin's copy of shared `types/commitmentsFold.ts` (it imports types only);
// `tests/internal/commitmentsFoldParity.test.ts` holds the two together.

import type { Commitment } from './wire';
import { isLockedText } from './spaceModeLogic';

export const COMMITMENTS_FOLD_WORDS = {
  title: 'What you owe',
  youOwe: 'you owe',
  owedToYou: 'owed to you',
  nextCheck: (day: string) => `next check ${day}`,
  locked: 'Unlock to read it',
  someone: 'someone',
  more: (n: number) => `${n} more`,
} as const;

export const FINISHED_COMMITMENT_STATUSES: readonly string[] = ['done', 'kept', 'dropped'];

export interface CommitmentOpen {
  subject_type: 'person' | 'space';
  subject_id: string;
  label?: string;
}

export interface CommitmentRow {
  commitment_id: string;
  text: string;
  what: string;
  name: string;
  check: string | null;
  status: string | null;
  open: CommitmentOpen | null;
}

export interface CommitmentsFold {
  youOwe: CommitmentRow[];
  owedToYou: CommitmentRow[];
  moreYouOwe: number;
  moreOwedToYou: number;
  empty: boolean;
}

/** A day, the way a person says it (shared `dayWords`): today, tomorrow, Thursday, or "Thursday, Oct 2" further out. */
export function dayWords(when: string | Date | undefined, now: Date = new Date()): string {
  if (!when) return '';
  const d = typeof when === 'string' ? new Date(when) : when;
  if (Number.isNaN(d.getTime())) return '';
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(d) - startOf(now)) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  const weekday = d.toLocaleDateString(undefined, { weekday: 'long' });
  if (days > 1 && days < 7) return weekday;
  return `${weekday}, ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

const whenOf = (c: Pick<Commitment, 'next_check' | 'due'>): number => {
  const t = Date.parse(c.next_check ?? c.due ?? '');
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
};

export function commitmentRow(c: Commitment, now: Date = new Date()): CommitmentRow {
  const what = isLockedText(c.what) ? COMMITMENTS_FOLD_WORDS.locked : (c.what ?? '').trim();
  const name = c.counterparty?.name?.trim() || c.space?.name?.trim() || COMMITMENTS_FOLD_WORDS.someone;
  const day = c.next_check ? dayWords(c.next_check, now) : '';
  const check = day ? COMMITMENTS_FOLD_WORDS.nextCheck(day) : null;
  const status = c.status && c.status !== 'open' ? String(c.status) : null;
  const relId = c.counterparty?.relationship_id ?? (c.counterparty?.type === 'person' ? c.counterparty.id : undefined);
  const spaceId = c.counterparty?.type === 'space' ? c.counterparty.id : c.space?.space_id;
  const open: CommitmentOpen | null = relId
    ? { subject_type: 'person', subject_id: relId, label: c.counterparty?.name ?? undefined }
    : spaceId
      ? { subject_type: 'space', subject_id: spaceId, label: c.space?.name ?? c.counterparty?.name ?? undefined }
      : null;
  return { commitment_id: c.commitment_id, text: [what, name, check, status].filter(Boolean).join(' · '), what, name, check, status, open };
}

export function commitmentsFold(items: Commitment[] | null | undefined, opts: { now?: Date; limit?: number } = {}): CommitmentsFold {
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? 5;
  const running = (items ?? []).filter((c) => !FINISHED_COMMITMENT_STATUSES.includes(String(c.status)));
  const sorted = (xs: Commitment[]) => [...xs].sort((a, b) => whenOf(a) - whenOf(b));
  const mine = sorted(running.filter((c) => c.owner !== 'them'));
  const theirs = sorted(running.filter((c) => c.owner === 'them'));
  return {
    youOwe: mine.slice(0, limit).map((c) => commitmentRow(c, now)),
    owedToYou: theirs.slice(0, limit).map((c) => commitmentRow(c, now)),
    moreYouOwe: Math.max(0, mine.length - limit),
    moreOwedToYou: Math.max(0, theirs.length - limit),
    empty: mine.length + theirs.length === 0,
  };
}
