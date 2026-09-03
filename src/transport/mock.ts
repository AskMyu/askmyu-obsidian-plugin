/**
 * MockApi — the backend that doesn't exist yet.
 *
 * Contract items 1 (plugin tokens) and 2 (device KEK) are the backend team's,
 * and the handoff says to build against mocks until they land. This is that
 * mock: it implements the same interface with in-memory state, so the entire
 * unlock state machine — exchange → blocked → approval → wrap → store KEK →
 * restart → fetch KEK → unwrap → unlocked — runs end to end on a laptop with no
 * server.
 *
 * It is deliberately NOT a fake that always says yes. It reproduces the failure
 * modes the state machine has to survive: revoked tokens, deleted KEK (remote
 * wipe), offline, and a device transfer that has to be approved before it
 * resolves. Enable it in settings ("Use mock backend") — never a build flag,
 * because the operator needs to flip it while testing on a phone.
 */

import { TERMS_FALLBACK_URLS } from '../terms';
/** The bundle the demo account agreed to — matches the live backend's first version. */
const MOCK_TERMS_VERSION = '2026-09-01';
import type { ApiResponse, EncryptedJournalPayload } from './index';
import type { ChatContext, CompositionSpecLite, EntityHeadline as WireEntityHeadline, PrepPayload } from '../wire';
import type { OAuthInitOptions, ChatCanvasOptions, FeedbackBody, InteractionEvent, HelpMyuItem, RelatedPerson, RelatedMemory, SourceDetail, DriveSuggestion, FeedSearchResults, PersonalLoop, CoupledLoop } from './api';
import type { CompositionActionResult, CompositionHistory, CompositionForJournal,
  AskMyuApi,
  BoardLiteResult,
  PendingTransfer,
  MagicLinkSession,
  CardEntityType,
  CardSpecLite,
  EntityHeadline,
  ExchangeResult,
  JournalUpsertResult,
  SignupResult,
  VaultCommitment,
  VaultInteractionEvent,
  VaultInteractionResult,
  MirrorEdition,
  WeeklyEdition,
  ChatTurnResult,
  MeetingNotePayload,
  MeetingIngestAck,
  PatternFeedbackEvent,
  TransferRequestResult,
  TransferStatusResult,
} from './api';
import { generateDeviceId } from '../crypto/primitives';

function ok<T = Record<string, unknown>>(data: T): ApiResponse<T> {
  return { status: 200, ok: true, data, error: null };
}

function fail<T>(status: number, error: string): ApiResponse<T> {
  return { status, ok: false, data: null, error };
}

export interface MockState {
  /** Tokens the "webapp" has issued. Any 32+ char string is accepted. */
  revokedTokens: Set<string>;
  /** device_id → KEK. Deleting an entry simulates remote wipe. */
  keks: Map<string, string>;
  /** Pending transfer requests, keyed by request_id. */
  transfers: Map<string, { deviceId: string; publicKey: string; approvedAt: number | null }>;
  /** Ingested meeting notes keyed by external_id → content hash (BWI-1 dedupe). */
  meetings: Map<string, { meeting_id: string; hash: string }>;
  /** Journals keyed by external_id, so upsert semantics are actually exercised. */
  journals: Map<string, { journal_id: string; revision: number }>;
  offline: boolean;
  /** Event ids whose cold subject was explicitly linked via linkPrepSubject. */
  linkedPrepSubjects: Set<string>;
  /** Interaction records and feedback bodies, so tests can see what was sent. */
  interactions: InteractionEvent[];
  feedback: FeedbackBody[];
  /**
   * Seconds until a pending transfer auto-approves, standing in for a human
   * tapping 4 digits on their phone. Zero would make approval untestable as a
   * *state*; the UI has to render "waiting" for a while.
   */
  autoApproveAfterMs: number;
}

export class MockApi implements AskMyuApi {
  readonly state: MockState = {
    revokedTokens: new Set(),
    keks: new Map(),
    transfers: new Map(),
    meetings: new Map(),
    journals: new Map(),
    offline: false,
    linkedPrepSubjects: new Set(),
    interactions: [],
    feedback: [],
    autoApproveAfterMs: 8000,
  };

  /**
   * The mock's stand-in for "some other device holds the account mDEK". Real
   * transfers carry the mDEK from an approving device; here we mint one once and
   * hand out the same key, so a restart genuinely re-derives the same content
   * key and mis-wired unwrapping shows up as garbled content rather than silence.
   */
  private accountMDEK: string = randomBase64(32);
  private accountRecoveryWrapped: string | null = null;

  private guard<T = Record<string, unknown>>(): ApiResponse<T> | null {
    return this.state.offline ? fail<T>(0, 'offline') : null;
  }

  async exchangeToken(token: string, _deviceId: string): Promise<ApiResponse<ExchangeResult>> {
    const offline = this.guard<ExchangeResult>();
    if (offline) return offline;
    if (!token || token.trim().length < 16) return fail(404, 'invalid_token');
    if (this.state.revokedTokens.has(token)) return fail(410, 'token_revoked');
    return ok({
      auth_token: `mock-session-${generateDeviceId()}`,
      account_id: 'mock-account',
      // Mirrors the real gate: a fresh session is blocked until key escrow.
      encryption_blocked: true,
      // Flip to true to exercise the Tier-2 (escrowing) path.
      background_work_consented: false,
    });
  }

  async escrowMDEK(): Promise<ApiResponse> {
    return this.guard() ?? ok<Record<string, unknown>>({});
  }

  async storeDeviceKEK(deviceId: string, kekBase64: string): Promise<ApiResponse> {
    const offline = this.guard();
    if (offline) return offline;
    this.state.keks.set(deviceId, kekBase64);
    return ok<Record<string, unknown>>({});
  }

  async fetchDeviceKEK(deviceId: string): Promise<ApiResponse<{ device_kek: string }>> {
    const offline = this.guard<{ device_kek: string }>();
    if (offline) return offline;
    const kek = this.state.keks.get(deviceId);
    // Remote wipe: the row is gone, so the local blob is inert forever. The
    // state machine must fall back to BLOCKED, not retry.
    if (!kek) return fail(404, 'device_not_found');
    return ok({ device_kek: kek });
  }

  async requestDeviceTransfer(deviceId: string, publicKey: string): Promise<ApiResponse<TransferRequestResult>> {
    const offline = this.guard<TransferRequestResult>();
    if (offline) return offline;
    const requestId = generateDeviceId();
    this.state.transfers.set(requestId, { deviceId, publicKey, approvedAt: Date.now() + this.state.autoApproveAfterMs });
    return ok({
      request_id: requestId,
      verification_code: String(Math.floor(1000 + Math.random() * 9000)),
    });
  }

  async pollDeviceTransfer(requestId: string): Promise<ApiResponse<TransferStatusResult>> {
    const offline = this.guard<TransferStatusResult>();
    if (offline) return offline;
    const transfer = this.state.transfers.get(requestId);
    if (!transfer) return fail(404, 'request_not_found');
    if (transfer.approvedAt === null || Date.now() < transfer.approvedAt) return ok({ status: 'pending' });

    // The real flow returns the mDEK encrypted to our ECDH public key. Mocking
    // the ECDH handshake faithfully would mean implementing the approving side's
    // half here; instead the mock hands back the raw key and the caller's
    // `mockMode` branch skips the derive step. That asymmetry is the one place
    // the mock knowingly diverges, and it is confined to a single branch.
    return ok({ status: 'approved', encrypted_mdek: this.accountMDEK });
  }

  async getPendingTransfers(): Promise<ApiResponse<{ pending_requests?: PendingTransfer[] }>> {
    const offline = this.guard<{ pending_requests?: PendingTransfer[] }>();
    if (offline) return offline;
    const rows = [...this.state.transfers.entries()]
      .filter(([, t]) => t.approvedAt === null || Date.now() < t.approvedAt)
      .map(([request_id, t]) => ({ request_id, device_name: 'Mock device', public_key: t.publicKey }));
    return ok({ pending_requests: rows });
  }

  async approveDeviceTransfer(requestId: string, _code: string, encryptedMdek: string): Promise<ApiResponse> {
    const offline = this.guard();
    if (offline) return offline;
    const transfer = this.state.transfers.get(requestId);
    if (!transfer) return fail(404, 'request_not_found');
    transfer.approvedAt = Date.now();
    // The mock's receive path hands back the raw account key (its documented
    // divergence); a real approve stores this blob for the requester.
    void encryptedMdek;
    return ok({});
  }

  async denyDeviceTransfer(requestId: string): Promise<ApiResponse> {
    const offline = this.guard();
    if (offline) return offline;
    this.state.transfers.delete(requestId);
    return ok({});
  }

  async fetchRecoveryWrappedMDEK(): Promise<ApiResponse<{ wrapped_mdek_recovery: string }>> {
    const offline = this.guard<{ wrapped_mdek_recovery: string }>();
    if (offline) return offline;
    if (!this.accountRecoveryWrapped) return fail(404, 'no_recovery_key');
    return ok({ wrapped_mdek_recovery: this.accountRecoveryWrapped });
  }

  async upsertJournal(payload: EncryptedJournalPayload): Promise<ApiResponse<JournalUpsertResult>> {
    const offline = this.guard<JournalUpsertResult>();
    if (offline) return offline;

    const existing = this.state.journals.get(payload.external_id);
    if (existing) {
      existing.revision += 1;
      return ok({ ...existing, created: false });
    }
    const record = { journal_id: generateDeviceId(), revision: 1 };
    this.state.journals.set(payload.external_id, record);
    return ok({ ...record, created: true });
  }

  async getBrief(): Promise<ApiResponse> {
    const offline = this.guard();
    if (offline) return offline;
    return ok({
      brief: {
        date: new Date().toISOString().slice(0, 10),
        suppressed_count: 1,
        // Cold start (week_state on, few journal entries): the day-one edition
        // leads, with the first-minutes progress alongside.
        progress: { stage: 'first_minutes', people_read: 3, people_total: 7, meetings_this_week: 4, first_timers: 2, external: 1, mail_understood_back_to: null },
        sections: [
          {
            section: 'week',
            title: 'This week',
            visible: true,
            items: [
              {
                feed_item_id: 'week_evt-1', type: 'week_meeting', urgency: 'info',
                text: 'Priya Natarajan \u2014 Roadmap sync',
                entity_type: 'person', entity_id: 'rel-2',
                entity_references: [{ entity_type: 'person' as const, entity_id: 'rel-2', display_name: 'Priya Natarajan' }],
                actions: [{ action_type: 'prep', label: 'Prep \u25b8', target_id: 'evt-1', primary: true }, { action_type: 'capture_after', label: 'Capture after \u25b8', target_id: 'evt-1', primary: false }],
                meta: { event_id: 'evt-1', relationship_id: 'rel-2', when: new Date(Date.now() + 26 * 3600e3).toISOString(), cold: true, first_time: true, external: true, facts: { role_line: 'Head of Product at Lumen', why_meeting: 'first meeting since the partnership announcement', mutual_ties: ['Marcus Webb'], public_context: ['Spoke at Config 2026 on roadmap rituals'] } },
              },
              {
                feed_item_id: 'week_evt-2', type: 'week_meeting', urgency: 'info',
                text: 'Marcus Webb \u2014 1:1',
                entity_type: 'person', entity_id: 'rel-1',
                entity_references: [{ entity_type: 'person' as const, entity_id: 'rel-1', display_name: 'Marcus Webb' }],
                actions: [{ action_type: 'prep', label: 'Prep \u25b8', target_id: 'evt-2', primary: true }, { action_type: 'capture_after', label: 'Capture after \u25b8', target_id: 'evt-2', primary: false }],
                meta: { event_id: 'evt-2', relationship_id: 'rel-1', when: new Date(Date.now() + 50 * 3600e3).toISOString(), cold: false, first_time: false, external: false, facts: { role_line: null, why_meeting: null, mutual_ties: [], public_context: [] } },
              },
              { feed_item_id: 'week_more', type: 'week_more', text: '2 more, routine' },
            ],
          },
          {
            section: 'today',
            visible: true,
            items: [
              {
                feed_item_id: 'mock-1',
                text: 'Marcus has been quiet since the reorg — three weeks.',
                entity_references: [{ entity_type: 'person' as const, entity_id: 'rel-1', display_name: 'Marcus Webb' }],
              },
              {
                feed_item_id: 'mock-2',
                text: 'You said you would send Priya the headcount note on Friday.',
                entity_references: [{ entity_type: 'person' as const, entity_id: 'rel-2', display_name: 'Priya Raman' }],
              },
              {
                // No entity: proves the row renders without an `open` it can't honour.
                feed_item_id: 'mock-3',
                text: 'A meeting was cancelled this morning.',
                entity_references: [],
              },
            ],
          },
        ],
      },
    });
  }

  async listEntities(tab: CardEntityType, _opts: { changedSince?: number } = {}) {
    const offline = this.guard<{ entities?: EntityHeadline[] }>();
    if (offline) return offline;

    if (tab === 'company') {
      return ok({
        entities: [
          { entity_type: 'company' as const, entity_id: 'co-1', display_name: 'Acme', subtitle: '4 people you know', item_count: 2, top_urgency: 'low' as const },
          { entity_type: 'company' as const, entity_id: 'co-2', display_name: 'Northwind', subtitle: '1 person you know', item_count: 0, top_urgency: 'info' as const },
        ],
      });
    }

    return ok({
      entities: [
        { entity_type: 'person' as const, entity_id: 'rel-1', display_name: 'Marcus Webb', organization: 'Acme', item_count: 3, top_urgency: 'medium' as const },
        { entity_type: 'person' as const, entity_id: 'rel-2', display_name: 'Priya Raman', organization: 'Northwind', item_count: 1, top_urgency: 'low' as const },
      ],
    });
  }

  async getCard(entityType: CardEntityType, entityId: string) {
    const res = await this.getCardBase(entityType, entityId);
    const card = res.ok ? (res.data?.card as import('./api').CardSpecLite | undefined) : undefined;
    if (entityType === 'person' && card) {
      // per_card_offer on, no mail connected: the server composes the offer.
      const name = card.header?.display_name ?? (card.header as { title?: string } | undefined)?.title ?? 'them';
      card.mail_offer = {
        lead: `I can see the invite, and I can't see where you two left off. Connect mail and I read the history with ${name} \u2014 nothing else changes.`,
        trust_line: 'Read-only. Content is used to build memory, then dropped. Myu never sends. Revoke any time.',
        options: [
          { id: 'gmail', label: 'Connect Gmail', init: { provider: 'google', scope_set: 'history', return_to: `card:${entityId}` } },
          { id: 'microsoft', label: 'Connect Microsoft mail', init: { provider: 'microsoft', scope_set: 'history', return_to: `card:${entityId}` } },
          { id: 'archive', label: 'Upload a mail archive' },
          { id: 'imap', label: 'IMAP' },
          { id: 'not_now', label: 'Not now' },
        ],
      };
    }
    return res;
  }

  private async getCardBase(entityType: CardEntityType, entityId: string) {
    const offline = this.guard<{ card?: CardSpecLite }>();
    if (offline) return offline;

    // Priya is unresolved: the web's disambiguation_pending answer, with two matches.
    if (entityType === 'person' && entityId === 'rel-2') {
      return ok({ response_type: 'disambiguation_pending', suggestions: [
        { card_id: 'lc-1', person_name: 'Priya Raman', profile_headline: 'Head of Platform at Northwind', linkedin_url: 'https://linkedin.com/in/priya-raman-nw', confidence: 0.82 },
        { card_id: 'lc-2', person_name: 'Priya Raman', profile_headline: 'Recruiter, Contoso', linkedin_url: 'https://linkedin.com/in/priyaraman', confidence: 0.31 },
      ] } as never);
    }

    if (entityType === 'company') {
      return ok({
        card: {
          entity_id: entityId,
          header: { title: 'Acme', subtitle: '4 people you know' },
          sections: [
            {
              section_type: 'narrative',
              title: 'read',
              narrative: 'Two of your contacts there changed roles this quarter; the third has gone quiet.',
            },
            { section_type: 'people', title: 'people here', items: [{ text: 'Marcus Webb — engineering' }] },
          ],
        },
      });
    }

    return ok({
      card: {
        entity_id: entityId,
        header: { title: 'Marcus Webb', subtitle: 'Acme · engineering' },
        sections: [
          {
            section_type: 'narrative',
            title: 'read',
            narrative: 'Quieter since the reorg — three weeks without the usual mid-week check-in.',
          },
          {
            section_type: 'threads',
            title: 'open threads',
            items: [{ text: 'The headcount proposal you owe him', date: '2026-08-04' }],
          },
        ],
      },
    });
  }

  async getCalendarEvents(): Promise<ApiResponse> {
    const offline = this.guard();
    if (offline) return offline;
    const soon = new Date(Date.now() + 90 * 60 * 1000);
    return ok({
      events: [
        {
          event_id: 'mock-event-1',
          summary: 'Marcus / 1:1',
          start_time: soon.toISOString().replace('T', ' ').slice(0, 19),
          all_day: false,
          status: 'confirmed',
          attendee_emails: ['marcus@example.com'],
        },
      ],
    });
  }

  /**
   * Two prep shapes, switched by event id, so BOTH card states demo offline:
   * the default is a warm read (claims + notes captured); `mock-event-cold`
   * exercises the cold/unlinked path — factual only, subject is a bare email,
   * `who is this?` must appear and the searchEntities → linkPrepSubject loop
   * must be walkable.
   */
  async getMeetingPrep(eventId: string): Promise<ApiResponse<{ prep?: PrepPayload }>> {
    const offline = this.guard<{ prep?: PrepPayload }>();
    if (offline) return offline;

    if (this.state.linkedPrepSubjects.has(eventId) || !eventId.includes('cold')) {
      const now = Date.now();
      return ok({
        prep: {
          prep_id: `mock-prep-${eventId}`,
          subject: { entity_type: 'person', entity_id: 'rel-1', display_name: 'Marcus Webb' },
          meeting: { meeting_id: eventId, title: 'Marcus / 1:1', starts_at: now + 90 * 60 * 1000 },
          data_tier: 'medium' as const,
          generated_at: now,
          watch: {
            text: "'process' has come up in his last three messages — twice unprompted.",
            last_updated: now - 3 * 86400000,
            evidence_refs: [
              { evidence_id: 'ev-1', label: 'Slack — #platform, Aug 14' },
              { evidence_id: 'ev-2', label: 'Email — re: sync cadence, Aug 12' },
            ],
          },
          stand: {
            text: 'Steadier than last month — a read, worth testing: the reorg pressure seems to have eased.',
            last_updated: now - 5 * 86400000,
            evidence_refs: [{ evidence_id: 'ev-3', label: '1:1 notes — Aug 5' }],
          },
          thread: {
            text: 'The headcount proposal is still open between you — three weeks now.',
            last_updated: now - 21 * 86400000,
            evidence_refs: [],
          },
          move: { text: 'Name the question you both keep circling.', last_updated: now - 3 * 86400000 },
          capture_hook: true,
          notes_captured: true,
          notes_summary: 'Platform sync — ownership split agreed; two follow-ups assigned.',
          notes_decision_count: 1,
          notes_action_count: 2,
          notes_meeting_id: 'mock-meeting-1',
        },
      });
    }

    return ok({
      prep: {
        prep_id: `mock-prep-${eventId}`,
        subject: { entity_type: 'person', entity_id: 'jim@northwind.example', display_name: 'jim' },
        meeting: { meeting_id: eventId, title: 'Daily Sync', starts_at: Date.now() + 45 * 60 * 1000 },
        data_tier: 'cold' as const,
        generated_at: Date.now(),
        stand: null,
        thread: null,
        watch: null,
        move: null,
        factual: {
          role_line: 'Engineering — Northwind',
          why_meeting: 'Recurring sync on the shared invite.',
          no_history: true,
        },
        capture_hook: true,
      },
    });
  }

  async linkPrepSubject(eventId: string): Promise<ApiResponse> {
    const offline = this.guard();
    if (offline) return offline;
    // Real semantics: the stored prep clears server-side and the next fetch
    // re-warms linked. The mock's flag flips the same fetch onto the warm shape.
    this.state.linkedPrepSubjects.add(eventId);
    return ok<Record<string, unknown>>({});
  }

  async searchEntities(query: string): Promise<ApiResponse<{ results?: WireEntityHeadline[] }>> {
    const offline = this.guard<{ results?: WireEntityHeadline[] }>();
    if (offline) return offline;
    const all: WireEntityHeadline[] = [
      { entity_type: 'person', entity_id: 'rel-1', display_name: 'Marcus Webb', organization: 'Acme', item_count: 3, top_urgency: 'medium' },
      { entity_type: 'person', entity_id: 'rel-2', display_name: 'Priya Raman', organization: 'Northwind', item_count: 1, top_urgency: 'low' },
      { entity_type: 'person', entity_id: 'rel-3', display_name: 'Jim Halvorsen', organization: 'Northwind', item_count: 0, top_urgency: 'info' },
    ];
    const q = query.toLowerCase();
    return ok({ results: all.filter((e) => e.display_name.toLowerCase().includes(q)) });
  }

  async ingestMeetingNote(payload: MeetingNotePayload): Promise<ApiResponse<MeetingIngestAck>> {
    const offline = this.guard<MeetingIngestAck>();
    if (offline) return offline;
    // The server's refusals, reproduced so the client hits them in dev:
    if (!payload.occurred_at_ms) return fail(400, 'missing_occurred_at');
    if (payload.content.length > 200 * 1024) return fail(400, 'content_too_large');

    const hash = String(payload.content.length) + ':' + payload.content.slice(0, 32);
    const existing = this.state.meetings.get(payload.external_id);
    if (existing) {
      if (existing.hash === hash) return ok({ meeting_id: existing.meeting_id, created: false, reextracted: false });
      existing.hash = hash;
      return ok({ meeting_id: existing.meeting_id, created: false, reextracted: true });
    }
    const meeting_id = generateDeviceId();
    this.state.meetings.set(payload.external_id, { meeting_id, hash });
    return ok({ meeting_id, created: true, reextracted: false });
  }

  async createChatEntry(_accountId: string, content: string, context?: ChatContext, _templateType?: string, canvas?: ChatCanvasOptions): Promise<ApiResponse<ChatTurnResult>> {
    const offline = this.guard<ChatTurnResult>();
    if (offline) return offline;
    const out: ChatTurnResult = { journal_id: `mock-journal-${generateDeviceId().slice(0, 8)}`, blocks: this.reply(content, context) };
    if (canvas?.continuesCompositionId) out.canvas = this.canvasSide(canvas.continuesCompositionId, content);
    return ok(out);
  }

  /** The backend's canvas side (CreateJournalEntry / CreateJournalChat): a named canvas is mutated. */
  private canvasSide(compositionId: string, content: string): NonNullable<ChatTurnResult['canvas']> {
    return {
      composition_id: compositionId,
      summary_text: 'Updated from the thread',
      surface_mutations: [{ op: 'add', target_id: '', position: 'end', components: [{ id: `chat-${Date.now()}`, type: 'text_block', label: 'From the thread', data: { text: `You asked: \u201c${content.slice(0, 80)}\u201d \u2014 noted on the canvas.` } }] }],
    };
  }

  async addChatTurn(_accountId: string, journalId: string, content: string, context?: ChatContext, canvas?: ChatCanvasOptions): Promise<ApiResponse<ChatTurnResult>> {
    const offline = this.guard<ChatTurnResult>();
    if (offline) return offline;
    const out: ChatTurnResult = { journal_id: journalId, blocks: this.reply(content, context) };
    if (canvas?.continuesCompositionId) out.canvas = this.canvasSide(canvas.continuesCompositionId, content);
    return ok(out);
  }

  /** Canned but state-aware enough to demo: "team" earns a composition offer. */
  private reply(content: string, context?: ChatContext) {
    const blocks: ChatTurnResult['blocks'] = [
      {
        type: 'conversational',
        text: context
          ? `About that (${context.source}) — noted. What stands out to you?`
          : "I hear you. What's underneath that?",
      },
    ];
    if (/team|group|landscape/i.test(content)) {
      blocks.push({
        type: 'composition_offer',
        composition_id: 'mock-comp-1',
        summary_text: 'Team read — platform group',
        action_label: 'See the team read',
      });
    }
    return blocks;
  }

  async executeCompositionAction(_compositionId: string, componentId: string, action: string): Promise<ApiResponse<CompositionActionResult>> {
    const offline = this.guard<CompositionActionResult>();
    if (offline) return offline;
    // The common answer: the pressed card is replaced by a line saying so.
    return ok({
      success: true,
      surface_mutations: [{ op: 'replace', target_id: componentId, components: [{ id: componentId, type: 'text_block', data: { text: `\u2713 ${action.replace(/_/g, ' ')}` } }] }],
    });
  }

  async persistCompositionMutations(): Promise<ApiResponse<{ success?: boolean }>> {
    const offline = this.guard<{ success?: boolean }>();
    return offline ?? ok({ success: true });
  }

  async requestDataExport(): Promise<ApiResponse<{ success?: boolean; export_id?: string; passphrase?: string }>> {
    return this.guard<{ success?: boolean }>() ?? ok({ success: true, export_id: 'exp-mock', passphrase: 'orbit velvet cinder maple quartz harbor' });
  }

  async postCompositionInteraction(events: InteractionEvent[], generateResponse: boolean): Promise<ApiResponse<{ success?: boolean; ack?: boolean; response_generating?: boolean }>> {
    const offline = this.guard<{ success?: boolean }>();
    if (offline) return offline;
    this.state.interactions.push(...events);
    return ok({ success: true, ack: true, ...(generateResponse ? { response_generating: true } : {}) });
  }

  async getHelpMyuQueue(): Promise<ApiResponse<{ queue?: HelpMyuItem[]; total_count?: number }>> {
    return this.guard<{ queue?: HelpMyuItem[] }>() ?? ok({ queue: [
      { item_type: 'linkedin_disambiguation', relationship_id: 'rel-2', display_name: 'Priya Raman', organization: 'Northwind', suggestion_count: 2 },
      { item_type: 'merge_candidate', source: { relationship_id: 'rel-3', display_name: 'Marcus W.' }, target: { relationship_id: 'rel-1', display_name: 'Marcus Webb', subtitle: 'VP Eng @ Acme' }, reason: 'same email domain and first name' },
    ], total_count: 2 });
  }
  async getRelatedPersons(): Promise<ApiResponse<{ related?: RelatedPerson[] }>> { return this.guard<{ related?: RelatedPerson[] }>() ?? ok({ related: [{ relationship_id: 'rel-2', display_name: 'Priya Raman', subtitle: 'Northwind', weight: 0.8 }] }); }
  async getRelatedMemories(): Promise<ApiResponse<{ related?: RelatedMemory[] }>> { return this.guard<{ related?: RelatedMemory[] }>() ?? ok({ related: [{ memory_id: 'm-9', content: 'Asked for the headcount plan twice.', memory_date: '2026-08-20', source_type: 'journal_entry', source_id: 'mock-j-1' }] }); }
  async getEntityDispatch(): Promise<ApiResponse<{ dispatch_sentence?: string; dispatch_category?: string; dispatch_receipt?: Record<string, unknown> }>> { return this.guard<{ dispatch_sentence?: string }>() ?? ok({ dispatch_sentence: 'Quieter since the reorg; the weekly has slipped twice.', dispatch_category: 'attention', dispatch_receipt: { signal_fingerprint: 'fp-1' } }); }
  async dismissEntityDispatch(): Promise<ApiResponse> { return this.guard() ?? ok<Record<string, unknown>>({}); }
  async searchFeed(q: string): Promise<ApiResponse<{ results?: FeedSearchResults }>> {
    const offline = this.guard<{ results?: FeedSearchResults }>(); if (offline) return offline;
    const people = /mar/i.test(q) ? [{ entity_id: 'rel-1', header: { display_name: 'Marcus Webb', subtitle: 'VP Eng \u00b7 Acme' } }] : [];
    return ok({ results: { people, companies: /acme/i.test(q) ? [{ entity_id: 'co-1', header: { display_name: 'Acme' } }] : [], feed_items: [], total_count: people.length } });
  }
  async getSourceDetail(sourceType: string, sourceId: string): Promise<ApiResponse<{ detail?: SourceDetail }>> { return this.guard<{ detail?: SourceDetail }>() ?? ok({ detail: { source_type: sourceType, source_id: sourceId, title: 'Journal, 2026-08-20', subtitle: 'you wrote', timestamp: 1755680000000, memories: [{ memory_id: 'm-9', content: 'Asked for the headcount plan twice.', memory_type: 'observation' }] } }); }
  async setRelationshipLinkedIn(): Promise<ApiResponse<{ success?: boolean }>> { return this.guard<{ success?: boolean }>() ?? ok({ success: true }); }
  async rejectMerge(): Promise<ApiResponse<{ success?: boolean }>> { return this.guard<{ success?: boolean }>() ?? ok({ success: true }); }
  async addMeetingDecision(): Promise<ApiResponse<{ success?: boolean; decision_id?: string }>> { return this.guard<{ success?: boolean }>() ?? ok({ success: true, decision_id: `dec-${generateDeviceId().slice(0, 6)}` }); }
  async addMeetingCommitment(): Promise<ApiResponse<{ success?: boolean; commitment_id?: string }>> { return this.guard<{ success?: boolean }>() ?? ok({ success: true, commitment_id: `cmt-${generateDeviceId().slice(0, 6)}` }); }
  async getDriveSuggestions(): Promise<ApiResponse<{ suggestions?: DriveSuggestion[]; count?: number }>> { return this.guard<{ suggestions?: DriveSuggestion[] }>() ?? ok({ suggestions: [{ id: 'sug-1', file_id: 'f-1', file_type: 'gdoc', source_email_subject: 'Notes: Platform weekly', source_email_sender: 'dana@acme.com', source_email_date: '2026-08-27', meeting_likelihood_score: 0.9, meeting_signals: ['agenda', 'attendees'] }], count: 1 }); }
  async importFromDrive(fileIds: string[]): Promise<ApiResponse<{ success?: boolean; results?: Array<{ file_id: string; status: string; title?: string }>; imported_count?: number }>> { return this.guard<{ success?: boolean }>() ?? ok({ success: true, results: fileIds.map((f) => ({ file_id: f, status: 'imported', title: 'Platform weekly' })), imported_count: fileIds.length }); }
  async dismissDriveSuggestion(): Promise<ApiResponse> { return this.guard() ?? ok<Record<string, unknown>>({}); }

  /** The six Today reads in one answer — each part the payload its own method serves. */
  async getTodayBundle(_start: string, _end: string, _timezone: string): Promise<ApiResponse<import('./api').TodayBundle>> {
    const offline = this.guard<import('./api').TodayBundle>();
    if (offline) return offline;
    const part = async <T>(p: Promise<ApiResponse<T>>): Promise<T | null> => { const r = await p.catch(() => null); return r?.ok ? (r.data ?? null) : null; };
    const [brief, events, mirror, weekly, loop, help] = await Promise.all([
      part(this.getBrief()), part(this.getCalendarEvents()), part(this.getMirrorEdition()), part(this.getWeeklyReview()), part(this.getPersonalLoop()), part(this.getHelpMyuQueue()),
    ]);
    return ok({ brief, events, mirror, weekly, loop, help_queue: help, server_time: Date.now() });
  }

  /**
   * What changed since `since`: the mock has no clock of its own, so a first
   * sync (since 0) returns everything and a later one returns nothing —
   * unless a test nudged `mockChangedAt` above `since`. Pages by unit
   * (a card, a meeting, a journal day) so paging itself is exercised.
   */
  mockChangedAt = 1_700_000_000_000;
  async getVaultChanges(since: number, cursor: string | null = null, pageSize = 50): Promise<ApiResponse<import('./api').VaultChangesPage>> {
    const offline = this.guard<import('./api').VaultChangesPage>();
    if (offline) return offline;
    type Unit = { kind: 'person' | 'company' | 'meeting' | 'day'; item: unknown };
    const units: Unit[] = [];
    if (since < this.mockChangedAt) {
      for (const tab of ['person', 'company'] as const) {
        const listed = await this.listEntities(tab);
        for (const e of listed.data?.entities ?? []) {
          const card = await this.getCard(tab, e.entity_id);
          units.push({ kind: tab, item: { ...(card.data ?? {}), entity_id: e.entity_id, changed_at: this.mockChangedAt } });
        }
      }
      const meetings = await this.listMeetings();
      for (const m of meetings.data?.meetings ?? []) units.push({ kind: 'meeting', item: m });
      const journal = await this.getJournalEntries();
      const byDay = new Map<string, Array<Record<string, unknown>>>();
      for (const entry of journal.data?.entries ?? []) {
        const when = typeof entry.timestamp === 'number' ? new Date(entry.timestamp) : new Date(String(entry.date ?? entry.created_at ?? ''));
        if (Number.isNaN(when.getTime())) continue;
        const day = when.toISOString().slice(0, 10);
        byDay.set(day, [...(byDay.get(day) ?? []), entry]);
      }
      for (const [day, entries] of byDay) units.push({ kind: 'day', item: { day, entries } });
    }
    const offset = cursor ? Number(cursor) || 0 : 0;
    const slice = units.slice(offset, offset + pageSize);
    const page: import('./api').VaultChangesPage = { server_time: Date.now(), since, people: [], companies: [], meetings: [], journal_days: [], next_cursor: offset + pageSize < units.length ? String(offset + pageSize) : null };
    if (offset === 0) { page.self = (await this.getSelfCard()).data ?? null; page.removed = []; }
    for (const u of slice) {
      if (u.kind === 'person') page.people!.push(u.item as import('./api').VaultChangeCard);
      else if (u.kind === 'company') page.companies!.push(u.item as import('./api').VaultChangeCard);
      else if (u.kind === 'meeting') page.meetings!.push(u.item as Record<string, unknown>);
      else page.journal_days!.push(u.item as { day: string; entries: Array<Record<string, unknown>> });
    }
    return ok(page);
  }

  async getFeatures(): Promise<ApiResponse<Record<string, unknown>>> {
    return this.guard<Record<string, unknown>>() ?? ok({
      cold_start: { split_consent: true, onboarding_payback: true, offer_block: true, week_state: true, per_card_offer: true, self_card_legible: true },
      // Batched reads (2026-09-03): the mock serves the bundle and the delta feed from its own fixtures.
      today_bundle: true, vault_changes: true, entities_changed_ids: true, entity_changed_at: true, retry_after_header: true,
      // The beta-terms block (2026-09-02): the demo account has agreed to the current bundle.
      terms: { current_version: MOCK_TERMS_VERSION, required: [], satisfied: true, accepted_versions: { beta_participation: MOCK_TERMS_VERSION, privacy_policy: MOCK_TERMS_VERSION }, urls: { ...TERMS_FALLBACK_URLS }, gate_enabled: true },
    });
  }
  /** `GET /terms` — public; what the Create-account door shows. */
  async getTerms(): Promise<ApiResponse<Record<string, unknown>>> {
    return this.guard<Record<string, unknown>>() ?? ok({ success: true, current_version: MOCK_TERMS_VERSION, required: ['beta_participation', 'privacy_policy'], urls: { ...TERMS_FALLBACK_URLS } });
  }
  async acceptTerms(termsVersion: string): Promise<ApiResponse<{ success?: boolean; error?: string }>> {
    const offline = this.guard<{ success?: boolean; error?: string }>();
    if (offline) return offline;
    return termsVersion === MOCK_TERMS_VERSION ? ok({ success: true }) : fail(400, 'terms_version_not_accepted');
  }
  async addIcalUrl(url: string): Promise<ApiResponse<{ success?: boolean; source_id?: string; events_stored?: number; error?: string }>> {
    const offline = this.guard<{ success?: boolean }>(); if (offline) return offline;
    if (!/^(https:\/\/|webcal:\/\/)/.test(url)) return ok({ success: false, error: 'A private iCal address starts with https:// (or webcal://).' });
    return ok({ success: true, source_id: 'ical-1', events_stored: 9 });
  }
  async uploadIcs(bytes: ArrayBuffer): Promise<ApiResponse<{ success?: boolean; events_stored?: number; error?: string }>> { return this.guard<{ success?: boolean }>() ?? ok({ success: true, events_stored: Math.max(1, Math.round(bytes.byteLength / 400)) }); }
  async createCareerTrajectory(): Promise<ApiResponse<{ success?: boolean; composition?: CompositionSpecLite; composition_id?: string }>> {
    const offline = this.guard<{ success?: boolean }>(); if (offline) return offline;
    return ok({ success: true, composition_id: 'mock-career', composition: { id: 'mock-career', summary_text: 'Builder to operator', components: [{ id: 'ct', type: 'career_trajectory', data: { pattern_name: 'Builder to operator', current_phase_name: 'Scaling', current_phase_description: 'Hiring faster than delegating.', phases: [{ id: 'p2', name: 'Scaling', description: 'Hiring.', status: 'current' }] } }] } as CompositionSpecLite });
  }
  async googleOAuthDisconnect(): Promise<ApiResponse<{ success?: boolean; message?: string }>> { return this.guard<{ success?: boolean }>() ?? ok({ success: true, message: 'Disconnected' }); }
  async googleSetPrimaryCredential(): Promise<ApiResponse<{ success?: boolean; message?: string }>> { return this.guard<{ success?: boolean }>() ?? ok({ success: true, message: 'Primary set' }); }
  async microsoftOAuthDisconnect(): Promise<ApiResponse<{ success?: boolean; message?: string }>> { return this.guard<{ success?: boolean }>() ?? ok({ success: true, message: 'Disconnected' }); }
  async microsoftSetPrimaryCredential(): Promise<ApiResponse<{ success?: boolean; message?: string }>> { return this.guard<{ success?: boolean }>() ?? ok({ success: true, message: 'Primary set' }); }
  async slackConnect(): Promise<ApiResponse<{ authorization_url?: string }>> { return this.guard<{ authorization_url?: string }>() ?? ok({ authorization_url: 'https://slack.com/oauth/v2/authorize?client_id=mock' }); }
  async slackDisconnect(): Promise<ApiResponse<{ success?: boolean }>> { return this.guard<{ success?: boolean }>() ?? ok({ success: true }); }
  async zulipConnect(realmUrl: string): Promise<ApiResponse<{ success?: boolean; connection_id?: string; realm_name?: string }>> { return this.guard<{ success?: boolean }>() ?? ok({ success: true, connection_id: 'zc-1', realm_name: realmUrl.replace(/^https?:\/\//, '') }); }
  async zulipDisconnect(): Promise<ApiResponse<{ success?: boolean }>> { return this.guard<{ success?: boolean }>() ?? ok({ success: true }); }
  async updateAccountName(): Promise<ApiResponse<{ success?: boolean; message?: string }>> { return this.guard<{ success?: boolean }>() ?? ok({ success: true, message: 'Account updated successfully' }); }
  async getAccountCareer(): Promise<ApiResponse<{ status?: string; summary?: string; linkedin_data_id?: string }>> { return this.guard<{ status?: string }>() ?? ok({ status: 'ok', summary: 'Engineering leader; platform teams; two companies.', linkedin_data_id: 'masumi-example' }); }
  async getPersonalLoop(): Promise<ApiResponse<{ loop?: PersonalLoop | null; coupled_loops?: CoupledLoop[] }>> { return this.guard<{ loop?: PersonalLoop | null }>() ?? ok({ loop: { loop_id: 'loop-1', statement: 'You take on the hard conversation yourself rather than hand it off, and then run out of week.', state: 'mirrored', confidence: 0.7, domain: 'career' }, coupled_loops: [{ to_loop_id: 'loop-2', type: 'drains', confidence: 0.6, other_statement: 'Evenings go to catching up instead of resting.', other_domain: 'energy' }] }); }
  async submitFeedbackSignal(): Promise<ApiResponse<{ success?: boolean; signal_id?: string }>> { return this.guard<{ success?: boolean }>() ?? ok({ success: true, signal_id: 'sig-1' }); }

  async submitFeedback(body: FeedbackBody): Promise<ApiResponse<{ success?: boolean; message?: string }>> {
    const offline = this.guard<{ success?: boolean }>();
    if (offline) return offline;
    this.state.feedback.push(body);
    return ok({ success: true, message: 'Feedback submitted successfully' });
  }

  async refreshComposition(compositionId: string): Promise<ApiResponse<{ composition?: CompositionSpecLite; success?: boolean }>> {
    const offline = this.guard<{ composition?: CompositionSpecLite }>();
    if (offline) return offline;
    const res = await this.getComposition(compositionId);
    return ok({ success: true, composition: res.data?.composition });
  }

  async getCompositionHistory(): Promise<ApiResponse<CompositionHistory>> {
    const offline = this.guard<CompositionHistory>();
    if (offline) return offline;
    return ok({
      compositions: [
        { id: 'comp-team', composition_id: 'comp-team', source_flow: 'team_read', summary_text: 'Team read — platform group', subject_name: 'Platform', component_count: 5, created_at: 1756200000000 },
        { id: 'comp-marcus', composition_id: 'comp-marcus', source_flow: 'person', summary_text: 'Where things stand with Marcus', subject_name: 'Marcus Webb', component_count: 3, created_at: 1756100000000 },
        { id: 'comp-old', composition_id: 'comp-old', summary_text: 'An expired one', created_at: 1750000000000, is_expired: true },
      ],
      total: 3,
    });
  }

  async getCompositionForJournal(journalId: string): Promise<ApiResponse<CompositionForJournal>> {
    const offline = this.guard<CompositionForJournal>();
    if (offline) return offline;
    // A journal with `bare` in its id has no canvas; any other has the demo one.
    if (journalId.includes('bare')) return ok({ composition: null, status: 'no_composition' });
    if (journalId === 'mock-j-3') {
      // The offer conversation: its canvas is the welcome composition, so the
      // chat renders the calendar offer inline (canonical in the thread).
      const welcome = (await this.getComposition('mock-welcome')).data?.composition;
      return ok({ composition: welcome ?? null, composition_id: welcome?.id, turn_number: 1 });
    }
    const spec = (await this.getComposition(`comp-for-${journalId}`)).data?.composition;
    return ok({ composition: spec ?? null, composition_id: spec?.id, turn_number: 1 });
  }

  /** `all=true` — every canvas the conversation made. `mock-j-1` made two, on
      different replies, so demo mode exercises the placement rather than the
      one-canvas case the single call can already show. */
  async getCompositionsForJournal(journalId: string): Promise<ApiResponse<CompositionForJournal>> {
    const offline = this.guard<CompositionForJournal>();
    if (offline) return offline;
    if (journalId.includes('bare')) return ok({ success: true, count: 0, compositions: [] });
    if (journalId === 'mock-j-1') {
      return ok({ success: true, count: 2, compositions: [
        { composition_id: 'comp-for-mock-j-1-a', turn_number: 1, summary_text: 'What to ask each firm', is_expired: true, component_count: 5 },
        { composition_id: 'comp-for-mock-j-1', turn_number: 2, summary_text: 'Team read — platform group', is_expired: false, component_count: 5 },
      ] });
    }
    const single = (await this.getCompositionForJournal(journalId)).data;
    if (!single?.composition_id) return ok({ success: true, count: 0, compositions: [] });
    return ok({ success: true, count: 1, compositions: [
      { composition_id: single.composition_id, turn_number: single.turn_number ?? 1, summary_text: single.composition?.summary_text ?? '', is_expired: false },
    ] });
  }

  async getComposition(compositionId: string): Promise<ApiResponse<{ composition?: CompositionSpecLite }>> {
    const offline = this.guard<{ composition?: CompositionSpecLite }>();
    if (offline) return offline;
    if (compositionId === 'mock-welcome') {
      // The welcome canvas with the cold-start offer block (offer_block flag on).
      return ok({ composition: { id: compositionId, summary_text: 'Welcome', components: [
        { id: 'w1', type: 'text_block', data: { text: 'You named Priya as the one that matters this week.' } },
        { id: 'w2', type: 'offer_block', data: {
          lead: 'I can prepare you for Priya on Thursday \u2014 if I can see your week.',
          gap_line: 'Right now I know what you told me, and nothing about when you meet.',
          options: [
            { id: 'calendar_google', label: 'Connect Google Calendar' },
            { id: 'calendar_microsoft', label: 'Connect Microsoft Calendar' },
            { id: 'calendar_ical', label: 'Paste a calendar link' },
            { id: 'calendar_ics', label: 'Upload an .ics' },
            { id: 'just_tell', label: "I'll just tell you" },
            { id: 'stop_asking', label: 'Stop asking' },
          ],
          stopped_ack: "Done \u2014 I won't bring this up again. You can connect anything whenever you want, in Settings under Integrations.",
          trust_line: 'Read-only. Myu prepares; it never sends anything.',
          named_person: { relationship_id: 'rel-2', name: 'Priya', when_text: 'this week', from: 'you' },
        } },
      ] } });
    }
    return ok({
      composition: {
        id: compositionId,
        summary_text: 'Team read — platform group',
        components: [
          { id: 'c1', type: 'text_block', data: { text: 'The platform group is steadier than last month.' } },
          { id: 'c2', type: 'person_card', label: 'Marcus Webb', data: { name: 'Marcus Webb' } },
          { id: 'c3', type: 'person_card', label: 'Priya Raman', data: { name: 'Priya Raman' } },
          { id: 'c4', type: 'chart', label: 'Trust over time', data: {} },
          {
            id: 'g1',
            type: 'container',
            label: 'the pair to watch',
            data: { child_ids: ['c2', 'c3'] },
          },
        ],
      },
    });
  }

  async getWeeklyReview(): Promise<ApiResponse<{ edition?: WeeklyEdition }>> {
    const offline = this.guard<{ edition?: WeeklyEdition }>();
    if (offline) return offline;
    // Current ISO week so the freshness rule renders it (the rule itself is
    // exercised by handing it stale periods in tests, not by the mock).
    const now = new Date();
    const date = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return ok({
      edition: {
        edition_id: 'mock-week-1',
        period: `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`,
        generated_at: Date.now(),
        sections: [
          { section: 'movement', line: 'Two relationships moved this week.', items: ['Marcus — steadier', 'Priya — quieter'] },
          { section: 'held', line: 'One commitment is three weeks old.', items: [] },
        ],
      },
    });
  }

  async getMirrorEdition(): Promise<ApiResponse<{ edition?: MirrorEdition }>> {
    const offline = this.guard<{ edition?: MirrorEdition }>();
    if (offline) return offline;
    // One map-layer observation and one forming observed one — the two shapes
    // the renderer has to handle, including the differing correction labels.
    return ok({
      edition: {
        edition_id: 'mock-edition-1',
        period: new Date().toISOString().slice(0, 7),
        generated_at: Date.now(),
        observations: [
          {
            observation_id: 'mock-obs-map',
            pattern_id: 'career_map:first_time_manager',
            layer: 'map' as const,
            text:
              'You placed yourself at the first-time-manager moment. People at this point typically find their calendar fills before their judgement adjusts. Does that match where you are?',
            receipts: [
              { source_class: 'user_stated', label: 'Your own career-moment classification' },
              { source_class: 'reference', label: 'The career-pattern library: First-time manager' },
            ],
          },
          {
            observation_id: 'mock-obs-1',
            pattern_id: 'mock-pattern-1',
            layer: 'observed' as const,
            forming: true,
            text: 'Threads with Marcus tend to go quiet after you hand something off (early signal — the pattern is still forming).',
            receipts: [{ source_class: 'journal', label: 'Three handoffs since June, each followed by 2+ quiet weeks' }],
          },
        ],
      },
    });
  }

  async submitPatternFeedback(
    _eventType: PatternFeedbackEvent,
    _patternId: string,
    _sourceSurface: string,
  ): Promise<ApiResponse> {
    const offline = this.guard();
    if (offline) return offline;
    return ok({});
  }

  /** P8 — resolved unless the mock is told otherwise; unticks queue. */
  async vaultInteraction(
    events: VaultInteractionEvent[],
  ): Promise<ApiResponse<{ results?: VaultInteractionResult[] }>> {
    const offline = this.guard<{ results?: VaultInteractionResult[] }>();
    if (offline) return offline;
    return ok({
      results: events.map((e) => ({
        myu_id: e.myu_id,
        kind: e.kind,
        outcome: e.kind === 'tick' ? 'resolved' : e.kind === 'untick' ? 'queued' : 'absorbed',
      })),
    });
  }

  async listVaultCommitments(): Promise<ApiResponse<{ commitments?: VaultCommitment[] }>> {
    const offline = this.guard<{ commitments?: VaultCommitment[] }>();
    if (offline) return offline;
    return ok({
      commitments: [
        {
          commitment_id: 'com-1',
          content: 'Send the platform deck',
          owner: 'Priya Raman',
          owner_relationship_id: 'rel-2',
          deadline: '2026-08-22',
          status: 'open',
          meeting_title: 'Platform sync',
        },
        {
          commitment_id: 'com-2',
          content: 'Follow up on the headcount ask',
          owner: 'Marcus Webb',
          owner_relationship_id: 'rel-1',
          status: 'open',
          meeting_title: 'Weekly 1:1',
        },
      ],
    });
  }

  /** P9 — signup succeeds and mints a mock session, like the real flat shape. */
  async createAccount(_email: string, _name: string, _password: string): Promise<ApiResponse<SignupResult>> {
    const offline = this.guard<SignupResult>();
    if (offline) return offline;
    return ok({ autoken: `mock-session-${randomBase64(6)}`, account_id: 'mock-account' });
  }

  async createPluginToken(_label: string): Promise<ApiResponse<{ token?: string; token_id?: string }>> {
    const offline = this.guard<{ token?: string; token_id?: string }>();
    if (offline) return offline;
    return ok({ token: `mock-plugin-token-${randomBase64(6)}`, token_id: 'mock-token-id' });
  }

  /** The mock's magic email: request "sends" a token, validate accepts it once. */
  private pendingMagicToken: string | null = null;

  async requestMagicLink(_email: string, _name?: string): Promise<ApiResponse<{ expires_in_minutes?: number }>> {
    const offline = this.guard<{ expires_in_minutes?: number }>();
    if (offline) return offline;
    this.pendingMagicToken = `mock-magic-${randomBase64(6)}`;
    return ok({ expires_in_minutes: 15 });
  }

  async validateMagicLink(token: string): Promise<ApiResponse<MagicLinkSession>> {
    const offline = this.guard<MagicLinkSession>();
    if (offline) return offline;
    if (!this.pendingMagicToken || token !== this.pendingMagicToken) {
      return fail(404, 'token_not_found');
    }
    this.pendingMagicToken = null; // single use, like the real thing
    return ok({
      auth_token: `mock-session-${randomBase64(6)}`,
      account_id: 'mock-account',
      is_new_account: true,
    });
  }

  async resolveLinkedInSuggestion(): Promise<ApiResponse> {
    return ok({});
  }

  async confirmIdentity(_relationshipId: string): Promise<ApiResponse<{ confirmed?: boolean }>> {
    const offline = this.guard<{ confirmed?: boolean }>();
    if (offline) return offline;
    return ok({ confirmed: true });
  }

  async getBoardLite(_entityType: CardEntityType, _entityId: string): Promise<ApiResponse<BoardLiteResult>> {
    const offline = this.guard<BoardLiteResult>();
    if (offline) return offline;
    return ok({
      takes: [
        {
          advisor_id: 'strategic_advisor',
          advisor_name: 'The strategist',
          take_text: 'The friction here is information asymmetry, not disagreement — get them the same data and re-ask.',
        },
        {
          advisor_id: 'relationship_counsel',
          advisor_name: 'The counsel',
          take_text: 'He has flagged workload twice without being asked once. That pattern usually precedes a resignation, not a complaint.',
        },
      ],
      full_deliberation_available: true,
    });
  }

  async setupRecovery(_wrappedMdekRecovery: string): Promise<ApiResponse> {
    const offline = this.guard();
    if (offline) return offline;
    return ok({});
  }

  async googleOAuthInit(_opts?: OAuthInitOptions): Promise<ApiResponse<{ auth_url?: string }>> {
    const offline = this.guard<{ auth_url?: string }>();
    if (offline) return offline;
    return ok({ auth_url: 'https://accounts.google.com/o/oauth2/mock' });
  }

  async microsoftOAuthInit(_opts?: OAuthInitOptions): Promise<ApiResponse<{ auth_url?: string }>> {
    const offline = this.guard<{ auth_url?: string }>();
    if (offline) return offline;
    return ok({ auth_url: 'https://login.microsoftonline.com/mock' });
  }

  async getRelationshipMemories(): Promise<ApiResponse<{ memories?: Record<string, unknown> }>> {
    return ok({ memories: { email: [{ content: 'Prefers early-morning meetings; mentioned a move to Osaka.', memory_date: '2026-08-01' }], journal: {} } });
  }

  async getSelfCard(): Promise<ApiResponse<{ card?: import('./api').CardSpecLite }>> {
    // self_card_legible on: what Myu knows so far, each with its source.
    return ok({ card: { known_facts: [
      { key: 'title', value: 'Founder, askMyu', source: 'linkedin', kind: 'fact' },
      { key: 'career', value: 'Twelve years in product, now building the second company.', source: 'read', kind: 'read' },
      { key: 'people', value: 'Marcus Webb, Priya Natarajan', source: 'you', kind: 'fact' },
      { key: 'week', value: '4 meetings in the next 7 days', source: 'calendar', kind: 'fact' },
      { key: 'mail', value: 'Where you and the people you named left off', source: 'mail', kind: 'not_yet' },
    ] } });
  }

  async listMeetings(): Promise<ApiResponse<{ meetings?: Array<Record<string, unknown>>; total?: number }>> {
    return ok({ meetings: [], total: 0 });
  }

  async getMeetingDetail(): Promise<ApiResponse<{ meeting?: Record<string, unknown> }>> {
    return ok({ meeting: {} });
  }

  // Past conversations, so the chat browser and the export have rows to show.
  async getJournalEntries(): Promise<ApiResponse<{ entries?: Array<Record<string, unknown>> }>> {
    return this.guard<{ entries?: Array<Record<string, unknown>> }>() ?? ok({ entries: [
      { journal_id: 'mock-j-1', content: 'so this whole shopping for a corporate law firm is very new to me. Jenny has been helping', created_at: '2026-08-28T15:10:00Z' },
      { journal_id: 'mock-j-2', content: 'How it went with Francesca: it was a good conversation. To provide more context, I am', created_at: '2026-08-27T09:00:00Z' },
      { journal_id: 'mock-j-3', content: 'so today i have a bunch of meetings. i feel like i am not quite prepared for any of them.', created_at: '2026-08-25T08:30:00Z' },
    ] });
  }

  async getJournalChats(journalId: string): Promise<ApiResponse<{ chats?: Array<Record<string, unknown>> }>> {
    const offline = this.guard<{ chats?: Array<Record<string, unknown>> }>();
    if (offline) return offline;
    if (journalId === 'mock-j-2') {
      // A delivered trust-ladder ask, re-served with the history that carried
      // it (OfferMoments.pendingFor) — the notes rung on a capture-after reply.
      return ok({
        chats: [
          { content: 'After the meeting with Priya: she pushed back on the timeline, I agreed to send the revised plan Friday.' },
          { content: JSON.stringify({ content: [{ type: 'conversational', text: 'Captured. The commitment to Priya is on the board.' }] }) },
        ],
        offer: {
          moment: 'notes',
          journal_id: 'mock-j-2',
          lead: 'You brought these notes in yourself. If they live in Google Docs, I read them myself next time and prep comes pre-filled.',
          trust_line: 'Read-only. Docs are read for meeting prep and memory, then left alone. Revoke any time in Settings.',
          stopped_ack: "Done \u2014 I won't bring this up again. You can connect anything whenever you want, in Settings under Integrations.",
          options: [
            { id: 'drive_google', label: "They're in Google Docs \u2014 read them", init: { provider: 'google', scope_set: 'drive', return_to: 'dashboard' } },
            { id: 'notes_transcripts', label: "They're in a transcript tool" },
            { id: 'notes_none', label: 'No notes to read' },
            { id: 'stop_asking', label: 'Stop asking' },
          ],
        },
      });
    }
    if (journalId !== 'mock-j-1') return ok({ chats: [] });
    return ok({ chats: [
      { content: JSON.stringify({ content: [{ type: 'conversational', text: 'Shopping for counsel is mostly shopping for **judgement**. Three things to ask each firm:\n\n1. Who actually does the work\n2. How they bill the first call\n3. What they would *not* take on' }] }) },
      { content: 'what should I ask about fees?' },
      { content: JSON.stringify({ content: [{ type: 'conversational', text: 'Ask for a *capped* first engagement. See [1].' }], references: [{ id: '1', title: 'Your note: law firm shortlist', url: 'obsidian://open?file=law' }] }) },
    ] });
  }

  async setBackgroundWorkConsent(consented: boolean): Promise<ApiResponse<{ background_work_consented?: boolean }>> {
    return ok({ background_work_consented: consented });
  }

  async listGenericEmailAccounts(): Promise<ApiResponse<{ accounts?: Array<{ credential_id?: string; email?: string }> }>> {
    return ok({ accounts: [] });
  }

  async addImapConnection(): Promise<ApiResponse> { return ok({}); }
  async testImapConnection(): Promise<ApiResponse> { return ok({}); }
  async removeGenericEmailAccount(): Promise<ApiResponse> { return ok({}); }

  async listCalDavAccounts(): Promise<ApiResponse<{ accounts?: Array<{ credential_id?: string; email?: string; provider?: string }> }>> {
    return ok({ accounts: [] });
  }

  async addCalDavAccount(): Promise<ApiResponse> { return ok({}); }
  async testCalDavConnection(): Promise<ApiResponse> { return ok({}); }
  async removeCalDavAccount(): Promise<ApiResponse> { return ok({}); }

  async getSlackConnections(): Promise<ApiResponse<{ connections?: Array<Record<string, unknown>> }>> {
    return ok({ connections: [] });
  }

  async getZulipConnections(): Promise<ApiResponse<{ connections?: Array<Record<string, unknown>> }>> {
    return ok({ connections: [] });
  }

  // ── account surfaces (parity review 2026-08-26) ──────────────────────────
  // Enough shape to drive the settings UI offline, including the states that
  // are awkward to reach live: a second device you can revoke, and an
  // unverified alias waiting on a link nobody can click from a vault.

  private mockDevices: Array<Record<string, unknown>> = [
    { device_id: 'mock-this-device', device_name: 'Obsidian — Vault', device_type: 'obsidian', last_used_at: Date.now() },
    { device_id: 'mock-other', device_name: 'Chrome — MacBook', device_type: 'web', last_used_at: Date.now() - 86400000 },
  ];

  private mockEmails: Array<Record<string, unknown>> = [
    { email: 'you@example.com', verified: true, is_primary: true },
    { email: 'work@example.com', verified: false, is_primary: false },
  ];

  async listDevices(): Promise<ApiResponse<{ devices?: Array<Record<string, unknown>> }>> {
    return ok({ devices: this.mockDevices });
  }

  async removeDevice(deviceId: string): Promise<ApiResponse> {
    this.mockDevices = this.mockDevices.filter((d) => d.device_id !== deviceId);
    return ok({});
  }

  async renameDevice(deviceId: string, deviceName: string): Promise<ApiResponse> {
    for (const d of this.mockDevices) if (d.device_id === deviceId) d.device_name = deviceName;
    return ok({});
  }

  async listAccountEmails(): Promise<ApiResponse<{ emails?: Array<Record<string, unknown>> }>> {
    return ok({ emails: this.mockEmails });
  }

  async addAccountEmail(email: string): Promise<ApiResponse> {
    this.mockEmails.push({ email, verified: false, is_primary: false });
    return ok({});
  }

  async resendAccountEmail(_email: string): Promise<ApiResponse> {
    return ok({});
  }

  async removeAccountEmail(email: string): Promise<ApiResponse> {
    this.mockEmails = this.mockEmails.filter((e) => e.email !== email);
    return ok({});
  }

  async setPrimaryAccountEmail(email: string): Promise<ApiResponse> {
    for (const e of this.mockEmails) e.is_primary = e.email === email;
    return ok({});
  }

  async getAccountPreferences(): Promise<ApiResponse<Record<string, unknown>>> {
    // Same envelope the servlet uses — a mock that answers a different shape
    // than the server is a mock that hides the bug it exists to surface.
    return ok({ preferences: { preferred_address: '', coaching_preference: 'auto' } });
  }

  async updateAccountPreferences(_body: Record<string, unknown>): Promise<ApiResponse> {
    return ok({});
  }

  async updateRelationshipProfile(_id: string, _fields: Record<string, string | string[] | null>): Promise<ApiResponse> {
    return ok({});
  }

  async editRelationshipMemory(_memoryId: string, _action: 'delete' | 'correct', _correction?: string): Promise<ApiResponse> {
    return ok({});
  }

  async mergeRelationships(): Promise<ApiResponse<{ success?: boolean }>> { return this.guard<{ success?: boolean }>() ?? ok({ success: true }); }
  async markRelationshipAsSelf(): Promise<ApiResponse<{ success?: boolean }>> { return this.guard<{ success?: boolean }>() ?? ok({ success: true }); }

  async archiveRelationship(_id: string, _action: 'archive' | 'unarchive'): Promise<ApiResponse> {
    return ok({});
  }

  async purgeRelationship(_id: string): Promise<ApiResponse> {
    return ok({});
  }

  async deleteAccount(_confirmation: string): Promise<ApiResponse> {
    // Deliberately a no-op success: the mock exists so the ceremony can be
    // rehearsed, and a mock that actually forgot everything would make the
    // rehearsal cost a re-setup.
    return ok({});
  }

  async googleOAuthStatus(): Promise<ApiResponse<import('./api').OAuthStatusResult>> {
    // split_consent on: calendar in, mail and notes not yet — the scope rows.
    return ok({ connected: true, split_consent: true, credentials: [{
      credential_id: 'cred-1', email: 'you@example.com', sync_gmail: false, sync_calendar: true, is_primary: true,
      connected_at: new Date(Date.now() - 86400e3).toISOString(), granted_scopes: ['calendar'], health: 'ok',
      services: {
        calendar: { state: 'connected', last_sync_at: new Date(Date.now() - 4 * 60e3).toISOString(), events_synced: 18 },
        mail: { state: 'not_yet', last_sync_at: null, understood_back_to: null, still_reading: false, oldest_date_limit: null },
        meeting_notes: { state: 'not_yet', last_sync_at: null },
      },
    }] });
  }

  async setMailOldestDate(_provider: 'google' | 'microsoft', credentialId: string, ymd: string | null): Promise<ApiResponse<{ success?: boolean; message?: string; error?: string }>> {
    if (ymd !== null && !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ok({ success: false, error: 'mail_oldest_date must be YYYY-MM-DD or null' });
    return ok({ success: true, message: `Settings updated for ${credentialId}` });
  }

  async microsoftOAuthStatus(): Promise<ApiResponse<import('./api').OAuthStatusResult>> {
    return ok({ connected: false, credentials: [] });
  }

  // ── P10: onboarding twins. State lives in-memory; the classifier is a word
  // counter (>= 8 words reads as a real answer) so both branches are drivable.

  private mockAccountState: { onboarding_complete: boolean; myu_scripts: Record<string, unknown> } = {
    onboarding_complete: false,
    myu_scripts: {},
  };

  async getAccountState(): Promise<ApiResponse<import('./api').AccountStateResult>> {
    return ok({ ...this.mockAccountState });
  }

  async updateAccountState(_accountId: string, update: { onboardingComplete?: boolean; myuScripts?: Record<string, unknown> }): Promise<ApiResponse> {
    if (update.onboardingComplete) this.mockAccountState.onboarding_complete = true;
    if (update.myuScripts) Object.assign(this.mockAccountState.myu_scripts, update.myuScripts);
    return ok({});
  }

  async linkedinSeek(_accountId: string, linkedinUrl: string): Promise<ApiResponse<{ body?: { content?: string } }>> {
    if (!linkedinUrl.includes('linkedin.com/in/')) return { status: 400, ok: false, data: null, error: 'invalid_url' };
    return ok({ body: { content: 'A career summary, mocked: ten years of building things with people.' } });
  }

  async saveLinkedinId(): Promise<ApiResponse> {
    return ok({});
  }

  async queryCurrentEmployment(): Promise<ApiResponse> {
    return ok({});
  }

  async confirmCurrentEmployment(): Promise<ApiResponse<{ companies?: unknown[]; role?: string; company_name?: string; status?: string }>> {
    return ok({ companies: [{ company: 'Mock & Co' }], role: 'Founder' });
  }

  async resumeUpload(): Promise<ApiResponse<{ resume_id?: string; summary?: string }>> {
    return ok({ resume_id: 'mock-resume', summary: 'A mocked decade: engineering, then leading engineers.' });
  }

  async saveResumeId(): Promise<ApiResponse> {
    return ok({});
  }

  async classifyCareerMoment(_accountId: string, content: string): Promise<ApiResponse<import('./api').MomentClassifyResult>> {
    const words = content.trim().split(/\s+/).length;
    const scripts = this.mockAccountState.myu_scripts;
    scripts.onboard_moment_attempt_count = ((scripts.onboard_moment_attempt_count as number) ?? 0) + 1;
    if (words >= 8) return ok({ confidence: 0.9, moment_captured: true });
    return ok({ confidence: 0.1, moment_captured: false });
  }
}

function randomBase64(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  let binary = '';
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
  return btoa(binary);
}
