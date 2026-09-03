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
}

// ── prep (P4.1) ─────────────────────────────────────────────────────────────

/**
 * PrepPayload, the rendered subset. Claims arrive pre-hedged and gated (R1/R4)
 * and are printed verbatim — which is why `confidence_tier`/`inference_type`
 * are NOT vendored: the client has no business branching on them, so it does
 * not get to see them. `data_tier` is the one standing the client renders
 * (cold/stale chips), so it is here, as the exact wire literals.
 */
export type PrepDataTier = 'high' | 'medium' | 'low' | 'cold' | 'stale';

export type PrepIdentityStatus = 'confirmed' | 'likely_match' | 'pending_disambiguation';

export interface PrepEvidenceRef {
  evidence_id: string;
  /** Short human label, e.g. `Slack — #platform, Jul 7`. Rendered as-is. */
  label: string;
  occurred_at?: number;
  /** Optional deep link for the tap-through. */
  link?: string;
}

export interface PrepClaim {
  /** Ready to render — hedging is baked in server-side. Never re-phrased. */
  text: string;
  last_updated?: number;
  evidence_refs?: PrepEvidenceRef[];
}

export interface PrepFactualOrientation {
  role_line?: string;
  company_name?: string;
  mutual_ties?: string[];
  why_meeting?: string;
  public_context?: string[];
  no_history?: boolean;
}

export interface PrepMeetingContext {
  meeting_id: string;
  title?: string;
  starts_at: number;
  ends_at?: number;
}

export interface PrepSubject {
  entity_type: string;
  entity_id: string;
  display_name: string;
  identity_status?: PrepIdentityStatus | null;
}

export interface PrepPayload {
  prep_id: string;
  subject: PrepSubject;
  meeting?: PrepMeetingContext;
  data_tier: PrepDataTier;
  generated_at: number;

  stand: PrepClaim | null;
  thread: PrepClaim | null;
  watch: PrepClaim | null;
  move: PrepClaim | null;

  factual?: PrepFactualOrientation;
  capture_hook: boolean;

  notes_captured?: boolean;
  notes_summary?: string;
  notes_decision_count?: number;
  notes_action_count?: number;
  notes_meeting_id?: string;
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
  // prep source (the meeting conversation)
  prep_phase?: 'before' | 'after';
  prep_event_id?: string;
  prep_meeting_title?: string;
  prep_claims?: string[];
}
