/**
 * The meeting's card, version 2 (2026-09-30) — what `PrepView` shows and does, with no host API.
 *
 * The web, the phone and the terminal take the card's labels and helpers from `@askmyu/shared`
 * (`types/prep.ts`). The plugin may not: only TYPES cross its boundary, because the public mirror
 * has no workspace to resolve shared code against. So the labels and the helpers the view uses are
 * copied here word for word, and `tests/internal/prepParity.test.ts` (monorepo-only) holds them to
 * shared's, source and behaviour. Every sentence on the card is the server's; the fixed labels are
 * `PREP_WORDS`; the few words the vault owns beyond them are `PREP_VIEW_WORDS`.
 *
 * The two lines riding on the card are answered here too, through the same doors every surface uses:
 *   the question before (`prep.ask`): typed words go into the meeting's own conversation
 *     (`GET /myu/conversation?subject_type=meeting&subject_id=<event id>` → `POST /journal_chats/add`),
 *     and its Skip is `POST /myu/lines/answer {line_id, answer: {choice_id: 'skip'}}`;
 *   a pick in its place (2026-10-04, `prepAskMode`): one choice, or several sent together, a typed name with
 *     either (`pickMany.ts`), each `POST /myu/lines/answer`;
 *   the arc (`prep.arc`): Hold time, Now, Skip, each `POST /myu/lines/answer {choice_id}`. Hold time
 *     opens the calendar's own page (the answer's `invite_ready` link, else `hold_link`; nobody is
 *     invited); Now opens the meeting's conversation, where Myu has written the first turn.
 */

import type { AskMyuApi } from './transport/api';
import type { ChatContext, PastedBlockWire, PrepArc, PrepCardV2, PrepDocument, PrepEvidence, PrepLineRef, PrepPerson, SpaceAnswer, SpaceEffect } from './wire';
import { LINE_ANSWER_WORDS, lineClosed } from './lineAnswers';
import { PASTE_WORDS, pastedTextLost } from './pastedText';
import { readbackText } from './spaceModeLogic';

// ── the copies (shared `types/prep.ts`, word for word) ───────────────────────

/** The card's fixed labels (every sentence on it is the server's). */
export const PREP_WORDS = {
  parts: {
    purpose: 'What it’s for',
    since_last: 'Since last time',
    moves: 'Your moves',
    power: 'Where power sits',
    watch: 'One thing to watch',
  } as Record<string, string>,
  why: 'why ▸',
  whyOpen: 'why ▾',
  more: 'more ▸',
  less: 'less ▴',
  stands: 'Where things stand',
  youOwe: 'You owe',
  theyOwe: 'They owe',
  worksBest: 'How they like to work',
  stance: 'In your threads',
  room: 'The room',
  beforeYouGo: 'Before you go in',
  planned: 'What’s planned',
  documents: 'Documents',
  setUpEmail: 'The email that set it up',
  lastNotes: 'Last time’s notes',
  openNotes: 'Open the notes ▸',
  notReplied: 'Hasn’t replied',
  notRepliedMany: 'Haven’t replied',
  afterwards: 'Afterwards',
  candidateFacts: 'About the candidate',
  yourTopics: 'Your topics',
  openItem: 'open ▸',
  openConversation: 'Open the conversation ▸',
  writeHowItWent: 'Write how it went ▸',
  answerPlaceholder: 'Type your answer',
  sendAnswer: 'Send',
  partial: 'From your calendar only for now. The rest comes when you open it with your key here.',
  loading: 'Getting it ready…',
  failed: 'That didn’t load. Try again in a moment.',
} as const;

/** A part's label ("Since last time"); an unknown part reads as its name in words. */
export function prepPartLabel(part: string): string {
  return PREP_WORDS.parts[part] ?? part.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

/** The evidence of a line, in the order given, the ids that resolve only. */
export function prepEvidenceFor(prep: Pick<PrepCardV2, 'evidence'>, ids: string[] | undefined): Array<{ id: string; ev: PrepEvidence }> {
  const out: Array<{ id: string; ev: PrepEvidence }> = [];
  for (const id of ids ?? []) {
    const ev = prep.evidence?.[id];
    if (ev) out.push({ id, ev });
  }
  return out;
}

/** A person's block has more than its first line (who they are to you). */
export function prepPersonHasMore(p: PrepPerson): boolean {
  return !!(p.stands || p.works_best || p.stance || p.last_time || p.you_owe.length || p.they_owe.length);
}

/** Before or after the meeting (the capture after it tells Myu `prep_phase: 'after'`). */
export function prepPhase(prep: Pick<PrepCardV2, 'starts_at'>, now: number = Date.now()): 'before' | 'after' {
  const t = Date.parse(prep.starts_at);
  return Number.isFinite(t) && now >= t ? 'after' : 'before';
}

/** A document's name, and its link when it has one. */
export function prepDocument(d: PrepDocument): { name: string; url: string | null } {
  if (typeof d === 'string') return { name: d, url: null };
  return { name: d.title || d.name || d.fileUrl || d.url || '', url: d.fileUrl || d.url || null };
}

/** "Hasn't replied: Dana" / "Haven't replied: Dana, Reid". */
export function prepNotRepliedLabel(names: string[]): string {
  return names.length === 1 ? PREP_WORDS.notReplied : PREP_WORDS.notRepliedMany;
}

/** The card's own sentences, for the chat's context on this meeting (in place of version 1's claims). */
export function prepTextLines(prep: Pick<PrepCardV2, 'top' | 'people' | 'room' | 'before_you_go' | 'afterwards' | 'interview'>): string[] {
  const out: string[] = [];
  const push = (s: string | null | undefined) => {
    const t = s?.trim();
    if (t) out.push(t);
  };
  for (const t of prep.top ?? []) {
    push(t.text);
    for (const it of t.items ?? []) push(it.text);
  }
  for (const p of prep.people ?? []) {
    push(p.to_you);
    push(p.stands);
    push(p.stance);
    for (const o of p.you_owe) push(`You owe ${p.name}: ${o}`);
    for (const o of p.they_owe) push(`${p.name} owes you: ${o}`);
  }
  for (const l of prep.room?.lines ?? []) push(l.text);
  push(prep.before_you_go?.agenda);
  push(prep.before_you_go?.last_notes?.summary);
  for (const f of prep.interview?.candidate_facts ?? []) push(f);
  push(prep.afterwards);
  return out;
}

/** Is it version 2 (a card from before the switch, or a failed read, isn't drawn). */
export function isPrepV2(p: unknown): p is PrepCardV2 {
  return !!p && typeof p === 'object' && (p as { version?: unknown }).version === 2 && Array.isArray((p as { top?: unknown }).top);
}

/**
 * How the question inside the prep is answered: `many` — several picks sent together (a typed name may ride with them);
 * `choice` — one choice (its "Someone else" takes a typed name); `text` — typed words into the meeting's conversation,
 * its choices beside them (the question before; a card from before `input` reads this way).
 */
export type PrepAskMode = 'many' | 'choice' | 'text';

export function prepAskMode(ask: Pick<PrepLineRef, 'input' | 'select'>): PrepAskMode {
  if (ask.select === 'many') return 'many';
  return ask.input === 'choice' ? 'choice' : 'text';
}

// ── the vault's own ─────────────────────────────────────────────────────────

/** The words the vault owns on the card, beyond `PREP_WORDS`. */
export const PREP_VIEW_WORDS = {
  /** The pane's tab before a card has loaded; with one, the meeting's title follows the dash. */
  pane: 'Myu — meeting',
  /** 404: the event is not on this account's calendar. */
  unknown: 'Myu can’t find this meeting on your calendar.',
  retry: 'Try again',
  /** The label over Myu's own words (its question, the arc's invitation, what it said back). */
  myu: 'myu',
  /** A typed answer went into the meeting's conversation. */
  sent: 'Sent. Myu’s reply is in the conversation.',
  /** A meeting's notes, shown in place when the vault has no note for that meeting. */
  notesLoading: 'Opening the notes…',
  notesEmpty: 'Nothing in those notes yet.',
  notesFailed: 'Those notes didn’t open. Try again in a moment.',
} as const;

/** "Thursday 2 October, 11am" (the web card's words for when). */
export function prepWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const day = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(':00', '').replace(/\s/g, '');
  return `${day}, ${time}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "26 Sep", for the email that set it up (the month as the server's labels write it, on every system). */
export function prepShortDate(iso: string | null | undefined): string {
  const d = new Date(iso ?? '');
  return Number.isNaN(d.getTime()) ? '' : `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/**
 * What tapping a piece of evidence does in the vault:
 *   url, linkedin → the link, in the browser (only an http(s) address; anything else is its label);
 *   journal → that conversation, in the chat pane;
 *   meeting → that meeting's notes (the vault's note for it, else shown in place);
 *   space → the space's conversation, in the chat pane;
 *   email → its mailbox's web link in the browser when the server sends one (`open.url`, 2026-09-30), else its label only;
 *   commitment, anything else → its label only.
 */
export type EvidenceOpening =
  | { kind: 'link'; url: string }
  | { kind: 'journal'; id: string }
  | { kind: 'meeting'; id: string }
  | { kind: 'space'; id: string };

export function evidenceOpening(ev: PrepEvidence): EvidenceOpening | null {
  const open = ev.open;
  if (!open?.id) return null;
  switch (open.kind) {
    case 'url':
    case 'linkedin':
      return /^https?:\/\//i.test(open.id) ? { kind: 'link', url: open.id } : null;
    case 'email':
      return open.url && /^https?:\/\//i.test(open.url) ? { kind: 'link', url: open.url } : null;
    case 'journal':
      return { kind: 'journal', id: open.id };
    case 'meeting':
      return { kind: 'meeting', id: open.id };
    case 'space':
      return { kind: 'space', id: open.id };
    default:
      return null;
  }
}

/** A meeting's notes as `GET /meetings/get` sends them: the summary, then key points, then decisions. */
export function meetingNoteLines(detail: { meeting?: Record<string, unknown>; key_points?: unknown; decisions?: unknown } | null | undefined): string[] {
  const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
  const list = (v: unknown): string[] =>
    Array.isArray(v)
      ? (v as unknown[]).map((i) => (typeof i === 'string' ? i.trim() : text((i as Record<string, unknown> | null)?.text) || text((i as Record<string, unknown> | null)?.content))).filter(Boolean)
      : [];
  const m = detail?.meeting ?? {};
  return [text(m.summary) || text(m.debrief), ...list(detail?.key_points), ...list(detail?.decisions)].filter(Boolean);
}

/**
 * The context a conversation about this meeting starts with (the web's `buildPrepContext`): the card's own
 * sentences, the meeting, and its people. After the meeting it is the capture: `prep_phase: 'after'`.
 */
export function prepChatContext(prep: PrepCardV2, phase: 'before' | 'after' = prepPhase(prep)): ChatContext {
  const starts = Date.parse(prep.starts_at);
  return {
    source: 'prep',
    source_id: prep.event_id,
    prep_phase: phase,
    prep_event_id: prep.event_id,
    prep_meeting_title: prep.title,
    ...(Number.isFinite(starts) ? { prep_meeting_starts_at: starts } : {}),
    prep_claims: prepTextLines(prep),
    entity_references: prep.people.flatMap((p) => (p.relationship_id ? [{ entity_type: 'person', entity_id: p.relationship_id, display_name: p.name }] : [])),
  };
}

// ── the question before, and the arc ─────────────────────────────────────────

/**
 * The meeting's occurrence key: its start in ms, as the server keys the meeting's conversation and the lines on it
 * (the question before, the arc, "Anything you didn't say in there?"). Without it the read opens a conversation of its
 * own that holds none of those turns. Null when the card has no start.
 */
export function prepOccurrenceKey(prep: Pick<PrepCardV2, 'starts_at' | 'occurrence_key'>): string | null {
  if (prep.occurrence_key) return String(prep.occurrence_key);
  const t = Date.parse(prep.starts_at);
  return Number.isFinite(t) && t > 0 ? String(t) : null;
}


/** A meeting's own conversation, to open in the chat pane (what the arc's Now opens). */
export interface PrepConversationRef {
  subject_type: string;
  subject_id: string;
  occurrence_key?: string;
}

export interface PrepAnswer {
  /** What Myu said back (empty for a Skip that says nothing); null when nothing was settled. */
  said: string | null;
  /** The answer did not go, or the line stays up and says why: shown under it, which stays. */
  note: string | null;
  /** Pages the answer opens in the browser (the hold's add-to-calendar page). */
  open: string[];
  /** Now: the meeting's own conversation. */
  conversation: PrepConversationRef | null;
  /** The line had closed already (409 `line_closed`): nothing was answered or said; the card reads again. */
  closed: boolean;
  /**
   * Pasted text (2026-10-06): the typed words went, but the server did not count the pasted text (pastedTextLost).
   * The box keeps the chips, under `note`, and lets the typed words go.
   */
  pastedLost?: boolean;
}

type PrepBackend = Pick<AskMyuApi, 'getSubjectConversation' | 'addSubjectTurn' | 'answerMyuLine'>;

const settledNothing = (): PrepAnswer => ({ said: null, note: null, open: [], conversation: null, closed: false });
const failedWords = (error: string | null | undefined): string => (error === 'offline' ? LINE_ANSWER_WORDS.offline : LINE_ANSWER_WORDS.failed);

/** The arc's Hold time (`hold_time`; `hold` in the backend's first notes). */
export function isHoldChoice(choiceId: string): boolean {
  return choiceId === 'hold_time' || choiceId === 'hold';
}

/** The page the hold opens: the answer's `invite_ready` link, else the card's `hold_link`. Only http(s). */
export function holdPage(effects: SpaceEffect[] | null | undefined, arc: PrepArc | null | undefined): string | null {
  const ready = (effects ?? []).find((e) => e.type === 'invite_ready' && typeof e.handoff_url === 'string' && /^https?:\/\//i.test(e.handoff_url));
  if (ready && typeof ready.handoff_url === 'string') return ready.handoff_url;
  return arc?.hold_link && /^https?:\/\//i.test(arc.hold_link) ? arc.hold_link : null;
}

/** The `open_conversation` effect (the arc's Now): which conversation to open. */
export function conversationOf(effects: SpaceEffect[] | null | undefined): PrepConversationRef | null {
  const e = (effects ?? []).find((x) => x.type === 'open_conversation' && typeof x.subject_type === 'string' && typeof x.subject_id === 'string');
  if (!e || typeof e.subject_type !== 'string' || typeof e.subject_id !== 'string') return null;
  return { subject_type: e.subject_type, subject_id: e.subject_id, ...(typeof e.occurrence_key === 'string' && e.occurrence_key ? { occurrence_key: e.occurrence_key } : {}) };
}

/**
 * The pick inside the card (2026-10-04, the structure picks): a typed name ("Someone else"), or the picks sent together
 * ("That's everyone"), through the lines door. A name the server does not know keeps the question up, its words under it.
 */
export async function answerPrepPick(backend: PrepBackend, line: PrepLineRef, answer: SpaceAnswer): Promise<PrepAnswer> {
  const res = await backend.answerMyuLine(line.line_id, answer).catch(() => null);
  if (lineClosed(res)) return { ...settledNothing(), closed: true };
  if (!res?.ok || !res.data) return { ...settledNothing(), note: failedWords(res?.error) };
  const said = readbackText(res.data);
  if (res.data.line_open) return { ...settledNothing(), note: said };
  return { ...settledNothing(), said: said ?? '' };
}

/**
 * The question before, answered by typing: the words go into the meeting's own conversation, where
 * Myu reads them as the answer (and replies there), with any pasted text beside them (2026-10-06). Nothing is
 * sent when there are neither words nor pasted text.
 */
export async function sendPrepAnswer(backend: PrepBackend, prep: Pick<PrepCardV2, 'event_id' | 'starts_at'>, text: string, pasted: PastedBlockWire[] = []): Promise<PrepAnswer> {
  const content = text.trim();
  if (!content && pasted.length === 0) return settledNothing();
  const occurrenceKey = prepOccurrenceKey(prep) ?? undefined;
  const read = await backend.getSubjectConversation('meeting', prep.event_id, { occurrenceKey }).catch(() => null);
  const conversationId = read?.ok ? read.data?.conversation_id : undefined;
  if (!conversationId) return { ...settledNothing(), note: failedWords(read?.error) };
  const res = await backend.addSubjectTurn(conversationId, content, pasted).catch(() => null);
  if (!res?.ok) return { ...settledNothing(), note: failedWords(res?.error) };
  if (pastedTextLost(pasted.length, res.data)) return { ...settledNothing(), note: PASTE_WORDS.lost, pastedLost: true };
  return { ...settledNothing(), said: PREP_VIEW_WORDS.sent };
}

/**
 * One of a line's own choices on the card (the question's Skip; the arc's Hold time, Now, Skip):
 * `POST /myu/lines/answer {line_id, answer: {choice_id}}`, then what the answer opens and says.
 */
export async function answerPrepLine(backend: PrepBackend, prep: Pick<PrepCardV2, 'event_id' | 'starts_at' | 'arc'>, line: PrepLineRef, choiceId: string): Promise<PrepAnswer> {
  const onArc = !!prep.arc && prep.arc.line_id === line.line_id;
  const hold = onArc && isHoldChoice(choiceId);
  const res = await backend.answerMyuLine(line.line_id, { choice_id: choiceId }).catch(() => null);
  if (lineClosed(res)) return { ...settledNothing(), closed: true };
  if (!res?.ok || !res.data) {
    // The hold's page is a form to fill in with nobody on it, so it still opens (as on the web).
    const page = hold ? holdPage(null, prep.arc) : null;
    return { ...settledNothing(), note: failedWords(res?.error), open: page ? [page] : [] };
  }
  const effects = res.data.effects ?? [];
  const page = hold ? holdPage(effects, prep.arc) : null;
  const occurrenceKey = prepOccurrenceKey(prep);
  const nowRef: PrepConversationRef = { subject_type: 'meeting', subject_id: prep.event_id, ...(occurrenceKey ? { occurrence_key: occurrenceKey } : {}) };
  const conversation = conversationOf(effects) ?? (onArc && choiceId === 'now' ? nowRef : null);
  const said = readbackText(res.data);
  const open = page ? [page] : [];
  if (res.data.line_open) return { ...settledNothing(), note: said, open, conversation };
  return { ...settledNothing(), said: said ?? '', open, conversation };
}
