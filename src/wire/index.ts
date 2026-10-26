/**
 * Wire shapes, standalone. **This file is what ships in the public mirror.**
 *
 * The boundary rule (locked): the plugin may import from
 * `@askmyu/shared` as `import type` ONLY — never a runtime function — so the
 * public bundle can never carry shared runtime code. This file is the other half
 * of that: the mirror has no workspace to resolve `@askmyu/shared` against, so
 * `sync-mirror.mjs` swaps `src/wire/index.ts` for this one.
 *
 * Everything here is a wire-shape interface — the fields any client's own
 * network tab already shows them. No logic, no constants, no secrets.
 *
 * Drift is caught at compile time: `src/wire/parity.ts` asserts these are
 * structurally assignable to the canonical types in `@askmyu/shared`, so
 * `pnpm type-check` fails if the two diverge. That file is monorepo-only and the
 * sync deletes it.
 */

export interface BriefItem {
  feed_item_id?: string;
  text?: string;
  entity_references?: EntityReference[];
  /** `weekly_movement` = the Friday counts line; `week_meeting` / `week_more` = the day-one week edition. */
  type?: string;
  urgency?: string;
  /** The week edition's row actions: prep ▸ (target_id = event id), capture_after ▸. */
  actions?: Array<{ action_type?: string; label?: string; target_id?: string | null; primary?: boolean }>;
  /** The week edition's facts for one meeting (WeekEditionBuilder). Nulls as the canonical type allows them. */
  meta?: { event_id?: string; relationship_id?: string | null; when?: string; cold?: boolean; first_time?: boolean; external?: boolean; facts?: { role_line?: string | null; why_meeting?: string | null; mutual_ties?: string[]; public_context?: string[] } };
}

export interface EntityReference {
  entity_type: string;
  entity_id: string;
  display_name: string;
}

export interface BriefSectionData {
  section?: string;
  visible?: boolean;
  items?: BriefItem[];
}

export interface DailyBrief {
  date?: string;
  sections?: BriefSectionData[];
  /** R7: how many lower-confidence items the gate held back. Disclosed, never silent. */
  suppressed_count?: number;
  /** Day one, cold-start: the one finite bar, then the watermark, then silence. */
  progress?: { stage?: 'first_minutes' | 'long_tail' | 'steady' | (string & Record<never, never>); people_read?: number; people_total?: number; meetings_this_week?: number; first_timers?: number; external?: number; mail_understood_back_to?: string | null };
}

export interface GoogleCalendarEvent {
  event_id: string;
  summary?: string;
  /** `YYYY-MM-DD HH:MM:SS` in UTC. */
  start_time: string;
  all_day?: boolean;
  status?: string;
  attendee_emails?: string[];
}

/** A synced event, or one of Myu's own entries (2026-09-29) mapped onto the same shape. Mirrors shared `types/calendar.ts`. */
export type CalendarEventLike = GoogleCalendarEvent & { source?: 'myu'; kind?: string; space_id?: string };

/** Row from `/feed/entities` — the People/Companies tabs on every surface. */
export interface EntityHeadline {
  entity_type: string;
  entity_id: string;
  display_name: string;
  item_count: number;
  top_urgency: 'high' | 'medium' | 'low' | 'info';
  organization?: string;
  subtitle?: string;
  /** ISO timestamp of the last recorded contact — feeds `days quiet`. */
  last_contact?: string;
  /** Server ms: the latest change across the row, its memories, sections, health (2026-09-03). */
  changed_at?: number;
  /** People on the map (2026-10-03): true on a search result for someone seen pass by in mail; the lists leave them out. */
  on_map?: boolean;
  /** How many times they were seen in mail — only on a row on the map. */
  times_seen?: number;
}

// ── people on the map, folded away (2026-10-03) ─────────────────────────────

/** `{count, line}` beside the people list, the fold page and the v2 list: how many people are on the map and the
 *  server's line for the fold ("214 more people from your mail"; null when none). shared `types/mapFold.ts`. */
export interface MapFold {
  count: number;
  line: string | null;
}

/** One row of `GET /v2/relationships?map=only` — the part of shared `Relationship` the fold draws. */
export interface MapPersonRow {
  relationship_id: string;
  primary_name: string;
  email_primary?: string;
  /** When known. */
  company_name?: string | null;
  /** The last time they were seen in mail, server time. */
  last_seen?: string;
  on_map?: boolean;
  /** How many times they were seen — only on a row on the map. */
  times_seen?: number;
}

/** The fields a folded row reads (a `Relationship` from `map=only`, tolerant of the company's field name). shared `types/mapFold.ts`. */
export interface MapRowLike {
  relationship_id?: string;
  id?: string;
  primary_name?: string;
  name?: string;
  email_primary?: string;
  email?: string | null;
  company_name?: string | null;
  organization?: string | null;
  stated_company?: string | null;
  last_seen?: string | null;
  times_seen?: number | null;
  mention_count?: number | null;
  on_map?: boolean | null;
}

/** One page of the fold, most recently seen first. `count` is this page's length; the total is `map.count`. */
export interface MapPeoplePage {
  relationships?: MapPersonRow[];
  count?: number;
  map?: MapFold;
  limit?: number;
  offset?: number;
}

// ── the meeting's card, version 2 (2026-09-30) ──────────────────────────────

/**
 * `GET /prep/meeting?event_id=` → `{prep}`. A copy of shared `types/prep.ts`, shape for shape:
 * the view draws every field, so nothing is left out, and `parity.ts` holds the two to each
 * other in both directions. Every sentence in it is the server's. Where shared writes
 * `'a' | 'b' | string` (the known names, and any other), this writes the same set as
 * `'a' | 'b' | (string & Record<never, never>)`, which the lint here accepts.
 */
/** Any other name the server may send, beside the known ones. */
type AnyOther = string & Record<never, never>;

export type PrepKind = 'one_on_one' | 'team' | 'group' | 'outside' | 'interview' | 'large';
export type PrepPartName = 'purpose' | 'since_last' | 'moves' | 'power' | 'watch';

/** One line with its evidence: a move, an item under a part, a line about the room. */
export interface PrepItem {
  text: string;
  evidence_ids: string[];
}

/** A top part, in the server's order; `items` on `moves` (a move each) and sometimes on `purpose`. */
export interface PrepTopPart {
  part: PrepPartName | AnyOther;
  text: string;
  items?: PrepItem[];
  evidence_ids: string[];
}

/** One block per person at the meeting (never the user). A thin person carries only `to_you` (the server's thin line). */
export interface PrepPerson {
  relationship_id: string | null;
  name: string;
  thin: boolean;
  to_you: string | null;
  stands: string | null;
  works_best: string | null;
  you_owe: string[];
  they_owe: string[];
  stance: string | null;
  last_time: string | null;
  evidence_ids: string[];
}

export interface PrepRoom {
  team: { space_id: string; name: string } | null;
  lines: PrepItem[];
}

/** A document as the calendar invite carries it: a name, sometimes a link. */
export type PrepDocument = string | { title?: string; name?: string; fileUrl?: string; url?: string };

export interface PrepBeforeYouGo {
  agenda: string | null;
  documents: PrepDocument[];
  set_up_email: { subject: string; from: string; at: string } | null;
  last_notes: { summary: string; meeting_id: string } | null;
  not_replied: string[];
}

export interface PrepInterview {
  candidate_facts: string[];
  topics: Array<{ name: string; questions: string[] }>;
  scorecard_note: string | null;
}

export type PrepEvidenceFamily = 'calendar' | 'email' | 'signature' | 'linkedin' | 'company' | 'public' | 'user_stated';
export type PrepOpenKind = 'email' | 'meeting' | 'journal' | 'space' | 'linkedin' | 'commitment' | 'url';

/** One piece of evidence: its family, a plain dated label, and what opening it opens (null: text only). */
export interface PrepEvidence {
  source: PrepEvidenceFamily | AnyOther;
  label: string;
  at?: string;
  /** `url` (2026-09-30): the mailbox's web link for an email, when the server knows one — what opens it on every client. */
  open: { kind: PrepOpenKind | AnyOther; id: string; url?: string | null } | null;
}

/** A line riding on the card: the question before (T4; `skip` among its choices), or the arc (hold_time, now, skip). */
export interface PrepLineRef {
  line_id: string;
  text: string;
  choices: Array<{ id: string; label: string }>;
  /** What answers it (2026-09-30): `text` — typed words beside the choices (the question before); `choice` — a choice alone (the arc). */
  input?: 'text' | 'choice';
  /** 2026-10-04 (the structure picks): a pick inside the card is a line of the built kinds — several picks sent together, a typed name. */
  select?: 'many';
  send?: string;
  typed?: string;
  /** 2026-10-04: the box's words for the typed answer, when the line sends them ("Type who they are to Hannah."). */
  typed_hint?: string;
}

export interface PrepArc extends PrepLineRef {
  /** The prefilled add-to-calendar link ("Get ready: Thursday coffee"); it invites no one. */
  hold_link: string | null;
}

export interface PrepCardV2 {
  version: 2;
  event_id: string;
  kind: PrepKind | AnyOther;
  title: string;
  starts_at: string;
  /** The meeting's own conversation key (2026-09-30); absent on an older card, when `prepOccurrenceKey` derives it from `starts_at`. */
  occurrence_key?: string | null;
  built_at: string;
  thin: boolean;
  /** Built without the account's key by a background pass: calendar-level only. A card the person opens is never partial. */
  partial: boolean;
  top: PrepTopPart[];
  people: PrepPerson[];
  room: PrepRoom;
  before_you_go: PrepBeforeYouGo;
  afterwards: string;
  interview: PrepInterview | null;
  evidence: Record<string, PrepEvidence>;
  ask: PrepLineRef | null;
  arc: PrepArc | null;
}

export interface PrepResponse {
  prep: PrepCardV2;
}

// ── composition (P5.5) ──────────────────────────────────────────────────────

/**
 * CompositionSpec, the exportable subset. Lenient by design: the canvas has 15+
 * component types and grows; the exporter maps what it recognises and renders
 * the rest as text or a web link, so an unknown type degrades to "open live"
 * instead of a failed export.
 */
export interface CompositionComponentLite {
  id: string;
  type: string;
  /** Renderer variant, e.g. person_card 'stakeholder' — part of ComponentBase upstream. */
  variant?: string;
  label?: string;
  data?: Record<string, unknown>;
}

/**
 * A surface mutation — what `/composition/action` answers with and what
 * `/composition/mutate` persists. Applied client-side exactly as the shared
 * store does (compositionStore.applyMutations); see composition/applyMutations.ts.
 */
export interface SurfaceMutationLite {
  op: 'add' | 'update' | 'remove' | 'replace';
  target_id: string;
  position?: 'before' | 'after' | 'prepend_child' | 'append_child' | 'end';
  components?: CompositionComponentLite[];
  data_patch?: Record<string, unknown>;
  transition?: string;
}

export interface CompositionSpecLite {
  id: string;
  summary_text?: string;
  components: CompositionComponentLite[];
  /** Scenes: the web's full-canvas groups components under labelled sections (SceneNavigator). */
  scenes?: Array<{ id: string; label: string; component_ids: string[]; color?: string; collapsed?: boolean }>;
}

// ── chat (P6) ───────────────────────────────────────────────────────────────

/**
 * Response content blocks, the lenient subset. The thread renders
 * `conversational` text verbatim and offers `composition_offer`; any other
 * block that carries text renders as text, and one that doesn't is skipped —
 * a pane that crashes on a new block type would hold the conversation hostage
 * to the release calendar.
 */
/** A cited source — the backend's `references[]` beside a reply: {id, title, url, source_type}. */
export interface SourceReferenceLite {
  id: number | string;
  title?: string;
  url?: string;
  source_type?: string;
}

export interface ChatBlock {
  type: string;
  text?: string;
  format?: string;
  composition_id?: string;
  summary_text?: string;
  action_label?: string;
}

/**
 * Context injection riding a chat message ("discuss this"). Only the fields
 * this plugin actually constructs are typed — an index signature would break
 * the parity check (interfaces without one aren't assignable to types with
 * one), and the backend's formatter owns the semantics anyway.
 */
export interface ChatContext {
  source: string;
  source_id: string;
  entity_references: Array<{ entity_type: string; entity_id: string; display_name: string }>;
  // card source
  card_entity_type?: string;
  card_entity_id?: string;
  // card_section source (the web's per-section "Discuss with Myu")
  card_narrative?: string;
  card_context_type?: string;
  section_type?: string;
  section_content?: string;
  section_narrative?: string;
  // prep source (the meeting conversation; the capture after it)
  prep_phase?: 'before' | 'after';
  prep_event_id?: string;
  prep_meeting_title?: string;
  /** Unix ms. */
  prep_meeting_starts_at?: number;
  prep_claims?: string[];
}

// ── Pasted text (2026-10-06) — a long paste goes beside the typed words, never cut ──
// Shared `chatSend.ts` (`PastedSource`, `PastedBlockRef`, `PastedBlock`); parity.ts holds these to it both ways.

/** Where a block came from. The server accepts only these and returns only these. */
export type PastedSource = 'paste' | 'drop' | 'burst' | 'vault_note' | 'vault_selection';

/** The note lines a vault block came from, 1-based (vault_note and vault_selection only). */
export interface PastedBlockRef {
  path: string;
  line_from: number;
  line_to: number;
}

/** One pasted block, as it goes over the wire (`pasted_blocks`) and comes back on a stored turn. */
export interface PastedBlockWire {
  /** `p1`, `p2`, … unique within the message. */
  id: string;
  /** The pasted text, normalised. Never blank. */
  text: string;
  /** text.length, in UTF-16 units as the server counts. */
  chars: number;
  lines: number;
  source: PastedSource;
  ref?: PastedBlockRef;
}

// ── Space mode (R14) — a space's own conversation ─────────────────────────────
// `GET /myu/conversation`, `POST /journal_chats/add` (with `conversation_id`),
// `POST /myu/lines/answer`, `GET /retro/prep/mine`. Subsets: only what the pane reads.

/** A button on an ask. The label is always the backend's. */
export interface SpaceChoice {
  id: string;
  label: string;
  /** The server's own readback for this choice, when it has one (a choice answered alone on a pick-many line has). */
  readback?: string;
}

/** Where a person is in getting ready. `list` ends a just-me retro. */
export type SpacePrepStep = 'open' | 'words' | 'suggestions' | 'capacity' | 'readback' | 'shared' | 'list';

/** The ask that is up, as the conversation read carries it. */
export interface SpaceAsk {
  line_id: string;
  text: string;
  choices?: SpaceChoice[];
  /**
   * 2026-10-03 (the "About you" question): `select: "many"` — the choices are toggles and `send` names the choice that
   * sends the picks together ("That's everyone", `{choice_id: send, choice_ids}`); `typed` names the choice that takes a
   * typed name ("Someone else": the answer carries `text`). See `src/pickMany.ts`.
   */
  select?: 'many';
  send?: string;
  typed?: string;
  /** 2026-10-04: the box's words for the typed answer, when the line sends them ("Type who they are to Hannah."). */
  typed_hint?: string;
  subjects?: Array<{ type?: string; id?: string; occurrence_key?: string; label?: string }>;
  needs_you?: boolean;
  ask_kind?: string;
  state?: string;
  why?: { fired_because?: string };
  conversation?: { subject_type?: string; subject_id?: string; occurrence_key?: string; conversation_id?: string };
  provenance?: { source?: string; detail?: string };
  created_at?: string;
}

export interface SpaceTurn {
  turn_id: string;
  from: 'myu' | 'you';
  /** ISO. */
  at: string;
  /** The locked placeholder when the session has no key. */
  text: string;
  /** 2026-10-06: pasted text sent with a 'you' turn, beside `text`; absent when there is none or it cannot be opened. */
  pasted_blocks?: PastedBlockWire[];
  choices?: SpaceChoice[];
  /** `choice_id: "typed"` = the person typed past this ask. */
  answered?: { choice_id: string; at: string };
  readback?: boolean;
  line_id?: string;
}

export interface SpaceConversationRead {
  success?: boolean;
  conversation_id: string;
  subject?: { type?: string; id?: string; occurrence_key?: string; label?: string };
  history: SpaceTurn[];
  open_line?: SpaceAsk;
  /** Sent by the backend; the pane never lists it (one ask at a time). */
  open_lines?: SpaceAsk[];
  /** `"space"` for a space's conversation. */
  mode?: string;
  /** `work` says which kind of space: "retro" or "debrief" (an interview debrief, 2026-09-29). */
  stage?: { work?: string; retro_id?: string; retro_state?: string; debrief_state?: string; step?: string; first_line?: string };
  /** `attach`: the box takes a file here (an interview debrief's CV); the vault says where instead. */
  input?: { placeholder?: string; hints?: string[]; attach?: boolean };
  history_from?: string;
  has_earlier?: boolean;
}

/** What rides back beside an answer. Only `type` is read; the rest is per effect. */
export type SpaceEffect = { type: string; [k: string]: unknown };

export interface SpaceTurnReply {
  success?: boolean;
  role?: string;
  /** Myu's turn. */
  content?: string;
  space_mode?: { intent?: string; confidence?: number; handled: string; line_id?: string };
  effects?: SpaceEffect[];
  /** 403 from a session that may only read: `scope_required`. */
  error?: string;
  scope_required?: string;
}

export interface SpaceAnswer {
  choice_id?: string;
  /** 2026-10-03: the picks sent together with a `select: "many"` line's send choice. */
  choice_ids?: string[];
  /** 2026-10-03: the typed name with a `typed` choice ("Someone else"), alone or with the picks. */
  text?: string;
  yes?: boolean;
  /** "Don't ask again" (R19c): closed for good. */
  dismiss?: boolean;
  /** "Not now" (R19c): it rests until tomorrow and comes back. */
  later?: boolean;
  change?: boolean | string;
}

export interface SpaceAnswerReply {
  success?: boolean;
  line?: SpaceAsk;
  readback?: { text?: string };
  effects?: SpaceEffect[];
  /** The ask stays up (a locked space, a refusal). */
  line_open?: boolean;
}

/** `GET /retro/prep/mine` — the door's words come from `step`. */
export interface SpacePrepMine {
  success?: boolean;
  retro_id?: string;
  retro_state?: string;
  prep_id?: string;
  just_me?: boolean;
  step?: SpacePrepStep;
  own_items?: Array<{ item_id: string; text: string; how?: string | null; shared: boolean }>;
  suggestions?: Array<{ item_id: string; question: string; disposition: string; shared: boolean }>;
  can_take_back?: boolean;
  shared?: boolean;
  share_line_open?: boolean;
  open_asks?: number;
}

// ── commitments (`GET /commitments`, 2026-09-26: Today's "what you owe"; the vault's Commitments.md). Mirrors shared
// `types/commitments.ts`; parity.ts holds the canonical shapes readable as these. ──

export type CommitmentOwner = 'me' | 'them' | 'both';
export type MyuCommitmentStatus = 'open' | 'slipping' | 'renegotiated' | 'done' | 'kept' | 'dropped';
export type CommitmentProofSource = 'manual' | 'calendar' | 'mail' | 'github' | 'space' | 'peer' | 'tracker';
export type CommitmentOriginType = 'conversation' | 'hold' | 'retro' | 'detected';
export type CommitmentExecutor = 'person' | 'myu' | 'coding_tool';

export interface CommitmentCounterparty {
  relationship_id?: string;
  /** Retro: a space can be the counterparty. */
  type?: 'person' | 'space';
  id?: string;
  name: string;
}

export interface CommitmentProof {
  source: CommitmentProofSource;
  ref?: string;
  at?: string;
}

export interface CommitmentOrigin {
  type: CommitmentOriginType;
  id: string;
}

export interface Commitment {
  commitment_id: string;
  /** A locked placeholder when the reader has no key. */
  what: string;
  owner: CommitmentOwner;
  counterparty: CommitmentCounterparty;
  space?: { space_id: string; name: string };
  due?: string;
  next_check?: string;
  status: MyuCommitmentStatus;
  counts?: { kept: number; missed: number };
  how_myu_knows: string;
  proof: CommitmentProof;
  origin: CommitmentOrigin;
  validation_rule?: string;
  executor?: CommitmentExecutor;
  todo_id?: string;
  if_then?: string;
}

export interface GetCommitmentsResponse {
  success: boolean;
  items: Commitment[];
}
