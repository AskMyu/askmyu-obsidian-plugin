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

import { wrapWithPassword, type PasswordSetupBody, type PasswordWrappedKey } from '../devicePassword';
import { TERMS_FALLBACK_URLS } from '../terms';
import type { Commitment, GetCommitmentsResponse } from '../wire';
/** The bundle the demo account agreed to — matches the live backend's first version. */
const MOCK_TERMS_VERSION = '2026-09-01';
import type { ApiResponse, EncryptedJournalPayload } from './index';
import type { ChatContext, CompositionSpecLite, EntityHeadline as WireEntityHeadline, MapFold, MapPeoplePage, MapPersonRow, PrepCardV2 } from '../wire';
import type { MyuLineLite, RetroReadResult, SpaceLite } from './api';
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
import { readMenuMarks, withOpened, type MenuItemKey, type MenuMarks } from '../menuMarks';
import type { LinesSeenResponse } from '../linesSeen';
import type { SpaceAnswer, SpaceAnswerReply, SpaceAsk, SpaceChoice, SpaceConversationRead, SpacePrepMine, SpacePrepStep, SpaceTurn, SpaceTurnReply } from '../wire';
import type { PastedBlockWire } from '../wire';

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
  /** The password for new devices (2026-10-26): the account key wrapped under it, as `setDevicePassword` puts it. */
  accountPasswordWrapped: PasswordSetupBody | null = null;
  /** 429 on the next read of the password door, as the server's rate limit answers. */
  passwordDoorRateLimited = false;

  private guard<T = Record<string, unknown>>(): ApiResponse<T> | null {
    return this.state.offline ? fail<T>(0, 'offline') : null;
  }

  /**
   * Every message sent to Myu, in order (pasted text, 2026-10-06): the path, the typed words and the pasted blocks,
   * the blocks only when there were some, as on the wire. Tests read what went.
   */
  sends: Array<{ path: string; content: string; pasted_blocks?: PastedBlockWire[] }> = [];
  /** Every capture payload sent (`POST /journal/add` with `external_id`), as sent. */
  upserts: EncryptedJournalPayload[] = [];

  /** Record one send; the blocks it carried, or undefined when it carried none. */
  private recordSend(path: string, content: string, pasted?: PastedBlockWire[]): PastedBlockWire[] | undefined {
    const blocks = pasted?.length ? pasted : undefined;
    this.sends.push({ path, content, ...(blocks ? { pasted_blocks: blocks } : {}) });
    return blocks;
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

  async fetchPasswordWrappedMDEK(): Promise<ApiResponse<PasswordWrappedKey>> {
    const offline = this.guard<PasswordWrappedKey>();
    if (offline) return offline;
    if (this.passwordDoorRateLimited) return fail(429, 'rate_limit_exceeded');
    if (!this.accountPasswordWrapped) return fail(404, 'no_password');
    return ok({ success: true, has_password: true, wrapped_mdek_password: this.accountPasswordWrapped.wrapped_mdek_password, kdf: this.accountPasswordWrapped.kdf, set_at: '2026-10-26T00:00:00Z' });
  }

  /** A test's account key, wrapped under `password` the way the web's sheet does it. */
  async setDevicePassword(mdek: CryptoKey, password: string): Promise<void> {
    this.accountPasswordWrapped = await wrapWithPassword(mdek, password);
  }

  async upsertJournal(payload: EncryptedJournalPayload): Promise<ApiResponse<JournalUpsertResult>> {
    const offline = this.guard<JournalUpsertResult>();
    if (offline) return offline;
    this.upserts.push(payload);

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

    // The people list leaves those on the map out and carries the fold beside it (2026-10-03).
    this.peopleListReads++;
    return ok({
      entities: [
        { entity_type: 'person' as const, entity_id: 'rel-1', display_name: 'Marcus Webb', organization: 'Acme', item_count: 3, top_urgency: 'medium' as const },
        { entity_type: 'person' as const, entity_id: 'rel-2', display_name: 'Priya Raman', organization: 'Northwind', item_count: 1, top_urgency: 'low' as const },
        ...this.keptPeople,
      ],
      map: this.mapFoldOf(),
    });
  }

  // ── people Myu isn't keeping track of yet, folded away (2026-10-03) ──
  /** People who were only on some emails: out of the list, in the fold (most recently seen first) and in search, marked. */
  mapPeople: MapPersonRow[] = [
    { relationship_id: 'map-1', primary_name: 'Carla Moss', email_primary: 'carla@brightpath.io', company_name: 'Brightpath Recruiting', last_seen: '2026-10-02 09:12:00', on_map: true, times_seen: 1 },
    { relationship_id: 'map-2', primary_name: 'Wen Li', email_primary: 'wenli.design@gmail.com', last_seen: '2026-09-11 08:00:00', on_map: true, times_seen: 1 },
    { relationship_id: 'map-3', primary_name: 'Mark Delaney', email_primary: 'mark.d@datastream.io', company_name: 'Datastream', last_seen: '2026-05-14 16:40:00', on_map: true, times_seen: 2 },
  ];
  /** The pronouns the person card's header carries for them, when known (the card's sentence reads them). */
  mapPronouns: Record<string, string> = { 'map-1': 'she/her', 'map-3': 'he/him' };
  /** Kept track of: ordinary people now, listed with everyone else. */
  keptPeople: EntityHeadline[] = [];
  /** What Keep track was pressed for, in order. */
  keeps: string[] = [];
  /** How many times the people list was read — the fold reads it again after a Keep track. */
  peopleListReads = 0;
  /** How many times a card was read — the person's card reads again after a Keep track. */
  cardReads = 0;
  /** How many times search was asked — the look-up asks only from two characters on. */
  searchReads = 0;

  /** `{count, line}` as the server writes it from the lines copy (`map_fold`). */
  mapFoldOf(): MapFold {
    const n = this.mapPeople.length;
    return { count: n, line: n === 0 ? null : `${n} more people from your mail` };
  }

  /** The one way back: Keep track makes the person an ordinary relationship. Opening their card does nothing. */
  private leaveMap(relationshipId: string): boolean {
    const i = this.mapPeople.findIndex((r) => r.relationship_id === relationshipId);
    if (i < 0) return false;
    const [row] = this.mapPeople.splice(i, 1);
    this.keptPeople.push({ entity_type: 'person', entity_id: row.relationship_id, display_name: row.primary_name, organization: row.company_name ?? undefined, item_count: 0, top_urgency: 'info' });
    return true;
  }

  async listMapPeople(limit: number, offset: number): Promise<ApiResponse<MapPeoplePage>> {
    const offline = this.guard<MapPeoplePage>();
    if (offline) return offline;
    const sorted = [...this.mapPeople].sort((a, b) => (b.last_seen ?? '').localeCompare(a.last_seen ?? '') || a.relationship_id.localeCompare(b.relationship_id));
    const page = sorted.slice(offset, offset + limit);
    return ok({ relationships: page, count: page.length, map: this.mapFoldOf(), limit, offset });
  }

  async keepRelationship(relationshipId: string): Promise<ApiResponse<{ success?: boolean; relationship_id?: string; on_map?: boolean }>> {
    const offline = this.guard<{ success?: boolean; relationship_id?: string; on_map?: boolean }>();
    if (offline) return offline;
    this.keeps.push(relationshipId);
    if (!this.leaveMap(relationshipId)) return fail(404, 'not_found');
    return ok({ success: true, relationship_id: relationshipId, on_map: false });
  }

  async getCard(entityType: CardEntityType, entityId: string) {
    // Reading a person's card changes nothing about the map (2026-10-03): their header says `on_map` and the card
    // offers "Keep track of <First>"; `keepRelationship` is the only way back.
    this.cardReads++;
    const res = await this.getCardBase(entityType, entityId);
    const card = res.ok ? res.data?.card : undefined;
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

  async getCardDeep(entityType: CardEntityType, entityId: string) {
    // The deep dive is the read card plus the four new agentic sections in the mock.
    const res = await this.getCard(entityType, entityId);
    const offline = this.guard();
    if (offline) return offline;
    const card = res.ok ? res.data?.card : undefined;
    if (card && entityType === 'person') {
      card.sections = [
        ...(card.sections ?? []),
        {
          section_type: 'spaces_shared', title: 'Spaces you share', is_new: true,
          data: { items: [{ space_id: 'sp1', name: 'Platform team', line: 'Retro Friday, two things need you.' }] },
        },
        {
          section_type: 'commitments_between', title: 'Commitments between you', is_new: true,
          data: { items: [{ commitment_id: 'c1', what: 'Review the migration plan', owner: 'them', status: 'open', how_myu_knows: 'You said so in the sync.' }] },
        },
        {
          section_type: 'partner_readings', title: 'Their reading next to yours', is_new: true, is_experiment: true,
          data: { rows: [{ dimension: 'Initiation', words: 'alike' }, { dimension: 'Reply speed', words: 'differently' }], numbers_need_both: true },
        },
        {
          section_type: 'emissions', title: 'What your Myu said about them in rooms', is_new: true,
          note: 'Nothing yet.', data: { items: [] },
        },
      ];
    }
    return ok({ card });
  }

  /** Myu's lines outside a space (Today, a person's chat); none by default. A test sets them. */
  dayLines: MyuLineLite[] = [];
  /** What answering a day line says back, by line id; "Okay." (nothing for a Skip) otherwise. */
  dayAnswers: Record<string, (answer: SpaceAnswer) => SpaceAnswerReply> = {};
  /** Every answer to a day line, in order: which line and the body sent. */
  dayAnswered: Array<{ line_id: string; answer: SpaceAnswer }> = [];

  /**
   * Send feedback with files (2026-10-14): the body, files included, lands in `state.feedback`. By default the server
   * answers `files_attached` as the count it was given; `feedbackServerBeforeFiles` answers none (a server from
   * before files), and `feedbackRefusal` answers that refusal instead (a 413 `attachment_too_large`).
   */
  feedbackServerBeforeFiles = false;
  feedbackRefusal: { status: number; error: string } | null = null;

  async getMyuLines(_scope: 'today' | 'people' | 'spaces' | 'calendar') {
    const offline = this.guard();
    if (offline) return offline;
    return ok({ success: true, day: new Date().toISOString().slice(0, 10), budget: { released: 0, limit: 3 }, lines: this.dayLines.map((l) => ({ ...l })) });
  }

  /**
   * The menu's marks (2026-10-06): a demo day — something new on Today and in a space, questions waiting on Today, a
   * person and the space. `null` stands for a server without the door (404); a test sets either.
   */
  menuMarks: MenuMarks | null = {
    day: new Date().toISOString().slice(0, 10),
    marks: {
      home: { new: 3, waiting: 2 },
      people: { new: 0, waiting: 1 },
      calendar: { new: 0, waiting: 0 },
      spaces: { new: 2, waiting: 1 },
      conversations: { new: 0, waiting: 0 },
      canvas: { new: 0, waiting: 0 },
    },
    opened: {},
  };
  /** Every place told it was opened, in order. */
  menuOpened: MenuItemKey[] = [];

  async getMenuMarks(): Promise<MenuMarks | null> {
    if (this.state.offline) throw new Error('menu marks: offline');
    // A fresh copy, read the way an answer off the wire is.
    return this.menuMarks ? readMenuMarks(this.menuMarks) : null;
  }

  async markMenuOpened(item: MenuItemKey): Promise<MenuMarks | null> {
    if (this.state.offline) throw new Error('menu marks opened: offline');
    if (!this.menuMarks) return null;
    this.menuOpened.push(item);
    this.menuMarks = withOpened(this.menuMarks, item);
    return readMenuMarks(this.menuMarks);
  }

  /**
   * "Seen" (2026-10-06): every report, in order, and the lines the server has recorded so far (it records a line the
   * first time and ignores it after). `linesSeenDoor = false` stands for a server without the door (404).
   */
  linesSeenDoor = true;
  linesSeenReports: string[][] = [];
  linesSeen = new Set<string>();

  async markLinesSeen(lineIds: string[]): Promise<LinesSeenResponse | null> {
    if (this.state.offline) throw new Error('lines seen: offline');
    if (!lineIds.length || !this.linesSeenDoor) return null;
    this.linesSeenReports.push([...lineIds]);
    const fresh = lineIds.filter((id) => !this.linesSeen.has(id));
    for (const id of fresh) this.linesSeen.add(id);
    return { success: true, seen: fresh };
  }

  /** The commitments between people (`GET /commitments`); none by default. A test sets them. */
  myuCommitments: Commitment[] = [];

  async getCommitments(): Promise<ApiResponse<GetCommitmentsResponse>> {
    const offline = this.guard<GetCommitmentsResponse>();
    if (offline) return offline;
    return ok<GetCommitmentsResponse>({ success: true, items: this.myuCommitments.map((c) => ({ ...c })) });
  }

  async getMyuLog() {
    const offline = this.guard();
    if (offline) return offline;
    return ok({ success: true, items: [] });
  }

  /** The spaces this example account belongs to; a test can empty it or fail the call (`spacesFail`). */
  spaces: SpaceLite[] = [{ space_id: 's1', name: 'Door team', kind: 'small_team', status: 'active', member_count: 4 }];
  spacesFail = false;
  /** The team's retro as the example account sees it; a test can replace it. */
  retroRead: RetroReadResult = {
    success: true,
    retro: { retro_id: 'r1', number: 1, state: 'asking', first_retro: true, reflects: { pushed: 4, members: 4 } },
    how_it_works:
      "The retro is every other week, on Friday at 2pm. Each person tells Myu privately what to bring up. Only what you approve goes up, with or without your name. You meet only if the team can't agree. Each retro hands out three tasks at most.",
    pinned: {},
    threads: [
      {
        thread_id: 't1',
        position: 1,
        kind: 'question',
        author_kind: 'team_myu',
        text: 'Reviews pile up before a release. What would make reviews faster without slowing the work?',
        state: 'settled',
        state_text: 'Everyone accepts this.',
        reply_count: 2,
        replies: [
          { reply_id: 'rp1', participant: { participant_id: 'p1', name: 'Dana Okafor' }, text: 'Reviews wait because nobody owns the queue.' },
          { reply_id: 'rp2', participant: { participant_id: 'p2', name: 'Sam Reyes' }, text: 'I would rather review the same day than batch them.' },
        ],
        merged: { wording_id: 'w1', text: 'Review capacity, not engineering capacity, is what slips the release.' },
      },
    ],
    todos: [
      { todo_id: 'td1', text: 'When a pull request is opened, the assigned reviewer starts the review that day.', state: 'drafted' },
      { todo_id: 'td2', text: 'Add a review slot to the weekly plan when more than five reviews wait.', state: 'taken', owner: { name: 'Dana Okafor' }, status_text: 'taken by Dana · Myu checks on Wednesday' },
    ],
  };

  async getRetro(_spaceId: string) {
    const offline = this.guard();
    if (offline) return offline;
    return ok(this.retroRead);
  }

  async listSpaces() {
    const offline = this.guard();
    if (offline) return offline;
    if (this.spacesFail) return fail<{ spaces?: SpaceLite[] }>(404, 'not found');
    return ok({ spaces: this.spaces });
  }

  // ── Space mode (R14): one space, getting ready, one ask at a time ───────────────
  // A small stand-in for the backend's state machine, enough for dev mode and the tests:
  // typed words first, then "how should this go to the team", then "anything else", the
  // readback with its bullets, and sharing. The sentences are the backend's fixed copy.

  /** Seeded thin (hints under the box) unless a test says otherwise. */
  spaceMode: { step: SpacePrepStep; thin: boolean; locked: boolean; agent: boolean; turns: SpaceTurn[]; open: SpaceAsk | null; own: string[]; n: number; earlierAsked: number } = {
    step: 'open',
    thin: true,
    locked: false,
    agent: false,
    turns: [],
    open: null,
    own: [],
    n: 0,
    earlierAsked: 0,
  };

  private spaceAsk(spaceId: string, text: string, choices: SpaceChoice[]): SpaceAsk {
    const sm = this.spaceMode;
    const at = new Date().toISOString();
    const line: SpaceAsk = {
      line_id: `mock-line-${++sm.n}`,
      subjects: [{ type: 'space', id: spaceId, label: 'Door team' }],
      text,
      needs_you: true,
      ask_kind: 'choice',
      choices,
      state: 'released',
      why: { fired_because: 'The retro is getting ready' },
      conversation: { subject_type: 'space', subject_id: spaceId, conversation_id: `mock-conv-${spaceId}` },
      provenance: { source: 'retro', detail: 'prep' },
      created_at: at,
    };
    sm.turns.push({ turn_id: `mock-turn-${++sm.n}`, from: 'myu', at, text, choices, line_id: line.line_id });
    sm.open = line;
    return line;
  }

  private spaceSay(from: 'myu' | 'you', text: string, extra: Partial<SpaceTurn> = {}): void {
    this.spaceMode.turns.push({ turn_id: `mock-turn-${++this.spaceMode.n}`, from, at: new Date().toISOString(), text, ...extra });
  }

  /** Mark the ask that is up as answered (a button's id, or "typed" when the person typed past it). */
  private spaceSettle(choiceId: string): void {
    const sm = this.spaceMode;
    if (!sm.open) return;
    const turn = sm.turns.find((t) => t.line_id === sm.open?.line_id && !t.readback);
    if (turn) turn.answered = { choice_id: choiceId, at: new Date().toISOString() };
    sm.open = null;
  }

  // ── The interview debrief (2026-09-29): a debrief space's conversation ─────────
  // A small stand-in for the backend's debrief asks (V093), in its words: the scorecard one ask at a time (what did
  // you see, typed or "Didn't come up"; then yes or no), the overall call, then locked. `start: 'cv'` opens instead
  // with the one-time "Add Jordan's CV or LinkedIn" ask, whose first two buttons stay open and send an effect.
  // The space is not on the list until a test or the shot adds it (`spaces.push(debriefSpace)`).

  debriefSpace: SpaceLite = { space_id: 'd1', name: 'Jordan Reyes', kind: 'small_team', kind_label: 'Small team', status: 'active', member_count: 3, work: 'debrief' };
  debriefMode: {
    start: 'saw' | 'cv';
    topics: Array<{ topic: string; yes: string; no: string }>;
    /** Which topic is up, and the step: `saw:<topic>` (words, `payload.input`), `rate:<topic>`, `call`, `locked`, `cv`. */
    at: number;
    step: string;
    turns: SpaceTurn[];
    open: SpaceAsk | null;
    /** The open ask's own record (the backend keeps it in the line's payload; the wire does not carry it). */
    payload: { type: string; step: string; input: boolean } | null;
    n: number;
    answers: Array<{ step: string; answer: string }>;
    added: string[];
  } = {
    start: 'saw',
    topics: [
      { topic: 'System design', yes: 'Breaks a vague problem into parts and names the trade-offs.', no: 'Jumps to one design and defends it.' },
      { topic: 'Ownership', yes: 'Talks about what they shipped and what broke after.', no: 'Talks only about what the team did.' },
    ],
    at: 0,
    step: '',
    turns: [],
    open: null,
    payload: null,
    n: 0,
    answers: [],
    added: [],
  };

  private isDebriefId(spaceId: string): boolean {
    return spaceId === this.debriefSpace.space_id;
  }

  private debriefFirst(): string {
    return (this.debriefSpace.name ?? 'the candidate').split(/\s+/)[0] ?? 'the candidate';
  }

  private debriefAsk(type: string, step: string, text: string, choices: SpaceChoice[], input: boolean): SpaceAsk {
    const dm = this.debriefMode;
    const spaceId = this.debriefSpace.space_id;
    const at = new Date().toISOString();
    const line: SpaceAsk = {
      line_id: `mock-debrief-line-${++dm.n}`,
      subjects: [{ type: 'space', id: spaceId, label: this.debriefSpace.name ?? '' }],
      text,
      needs_you: true,
      ask_kind: 'choice',
      choices,
      state: 'released',
      why: { fired_because: 'Your interview just ended' },
      conversation: { subject_type: 'space', subject_id: spaceId, conversation_id: `mock-conv-${spaceId}` },
      provenance: { source: 'debrief', detail: type },
      created_at: at,
    };
    dm.turns.push({ turn_id: `mock-debrief-turn-${++dm.n}`, from: 'myu', at, text, choices, line_id: line.line_id });
    dm.open = line;
    dm.payload = { type, step, input };
    dm.step = step;
    return line;
  }

  private debriefSay(from: 'myu' | 'you', text: string, extra: Partial<SpaceTurn> = {}): void {
    this.debriefMode.turns.push({ turn_id: `mock-debrief-turn-${++this.debriefMode.n}`, from, at: new Date().toISOString(), text, ...extra });
  }

  private debriefSettle(choiceId: string): void {
    const dm = this.debriefMode;
    if (!dm.open) return;
    const turn = dm.turns.find((t) => t.line_id === dm.open?.line_id && !t.readback);
    if (turn) turn.answered = { choice_id: choiceId, at: new Date().toISOString() };
    dm.open = null;
    dm.payload = null;
  }

  private static readonly RATINGS: SpaceChoice[] = [
    { id: 'strong_no', label: 'Strong no' },
    { id: 'no', label: 'No' },
    { id: 'yes', label: 'Yes' },
    { id: 'strong_yes', label: 'Strong yes' },
  ];

  /** The next ask of the scorecard: the next topic's "what did you see", else the overall call, else locked. */
  private debriefNext(): void {
    const dm = this.debriefMode;
    const t = dm.topics[dm.at];
    if (t) {
      this.debriefAsk('debrief_ask', `saw:${t.topic}`, `${t.topic}. What did you see?\nA yes: ${t.yes}\nA no: ${t.no}`, [{ id: 'dcu', label: "Didn't come up" }], true);
      return;
    }
    if (dm.step !== 'call' && dm.step !== 'locked') {
      this.debriefAsk('debrief_ask', 'call', 'Your overall call: yes or no?', MockApi.RATINGS, false);
      return;
    }
    dm.step = 'locked';
    this.debriefSay('myu', "Done. Your scorecard is locked. Nobody sees anyone else's until everyone is in, or Friday at 5pm.");
  }

  private debriefConversation(): SpaceConversationRead {
    const dm = this.debriefMode;
    const spaceId = this.debriefSpace.space_id;
    if (!dm.open && dm.turns.length === 0) {
      if (dm.start === 'cv') {
        dm.step = 'cv';
        this.debriefAsk('debrief_cv_ask', 'cv', `Add ${this.debriefFirst()}'s CV or LinkedIn so the panel can read it first?`, [
          { id: 'addcv', label: 'Add a CV' },
          { id: 'linkedin', label: 'Paste a LinkedIn link' },
          { id: 'notnow', label: 'Not now' },
        ], false);
      } else {
        this.debriefSay('myu', `Your interview with ${this.debriefSpace.name} just ended. Two topics for you, before you see anyone else's.`);
        this.debriefNext();
      }
    }
    const step = dm.step;
    const placeholder = step.startsWith('saw:') ? 'What did you see?' : step.startsWith('rate:') || step === 'call' ? 'Or say it in words' : 'Type to Myu about this interview debrief';
    const done = dm.step === 'locked' ? 1 : 0;
    return {
      success: true,
      conversation_id: `mock-conv-${spaceId}`,
      subject: { type: 'space', id: spaceId, label: this.debriefSpace.name ?? '' },
      history: dm.turns.map((t) => ({ ...t })),
      open_line: dm.open ?? undefined,
      open_lines: dm.open ? [dm.open] : [],
      mode: 'space',
      stage: { work: 'debrief', debrief_state: 'sealed', step: step || undefined, first_line: `${done} of 3 in · reveal when everyone is in, or Friday at 5pm` },
      input: { placeholder, hints: [], attach: true },
    };
  }

  /** Typed words in a debrief space answer the ask that takes words (or say it in words for a yes or no). */
  private debriefTyped(content: string): ApiResponse<SpaceTurnReply> {
    const dm = this.debriefMode;
    this.debriefSay('you', content);
    const said = (text: string) => {
      this.debriefSay('myu', text);
      return ok<SpaceTurnReply>({ role: 'assistant', content: text, space_mode: { intent: 'debrief', confidence: 0.9, handled: 'answered' }, effects: [] });
    };
    const next = (answer: string) => {
      dm.answers.push({ step: dm.step, answer });
      this.debriefSettle('typed');
      this.debriefNext();
      const line = dm.open;
      return ok<SpaceTurnReply>({ role: 'assistant', content: line?.text ?? '', space_mode: { intent: 'debrief', confidence: 0.9, handled: line ? 'confirm' : 'answered', line_id: line?.line_id }, effects: [] });
    };
    const step = dm.step;
    if (step.startsWith('saw:') && dm.payload?.input) {
      const topic = step.slice(4);
      dm.answers.push({ step, answer: content });
      this.debriefSettle('typed');
      const line = this.debriefAsk('debrief_ask', `rate:${topic}`, `${topic}: yes or no?`, MockApi.RATINGS, false);
      return ok({ role: 'assistant', content: line.text, space_mode: { intent: 'debrief', confidence: 0.9, handled: 'confirm', line_id: line.line_id }, effects: [] });
    }
    if (step.startsWith('rate:') || step === 'call') {
      const rating = MockApi.RATINGS.find((r) => r.label.toLowerCase() === content.trim().toLowerCase());
      if (!rating) return said('Yes or no? Press one, or say it in words: strong no, no, yes or strong yes.');
      if (step.startsWith('rate:')) dm.at++;
      return next(rating.id);
    }
    if (step === 'cv' && /linkedin\.com\//i.test(content)) {
      dm.added.push(content.trim());
      this.debriefSettle('added');
      return said(`Added to ${this.debriefFirst()}'s page: the work history from that profile.`);
    }
    return said("I'll keep that with your notes on this interview debrief.");
  }

  private debriefAnswer(open: SpaceAsk, choice: string): ApiResponse<SpaceAnswerReply> {
    const dm = this.debriefMode;
    const step = dm.step;
    const done = (readback: string, effects: SpaceAnswerReply['effects'] = [], lineOpen = false): ApiResponse<SpaceAnswerReply> => {
      if (!lineOpen) this.debriefSettle(choice);
      if (readback) this.debriefSay('myu', readback, { readback: true, line_id: open.line_id });
      return ok({ success: true, line: { ...open, state: lineOpen ? 'released' : 'answered' }, readback: { text: readback }, effects, line_open: lineOpen });
    };
    if (step === 'cv') {
      // As the backend: the first two keep the ask open until something is added; "Not now" closes it.
      if (choice === 'addcv') return done('', [{ type: 'attach_cv', space_id: this.debriefSpace.space_id }], true);
      if (choice === 'linkedin') return done(`Paste the link, and ${this.debriefFirst()}'s work history appears on the page.`, [{ type: 'paste_linkedin', space_id: this.debriefSpace.space_id }], true);
      return done('Okay.');
    }
    dm.answers.push({ step, answer: choice });
    const r = done('');
    // "Didn't come up" skips that topic's yes or no; a yes or no moves to the next topic.
    if (step.startsWith('saw:') || step.startsWith('rate:')) dm.at++;
    this.debriefNext();
    return r;
  }

  async getSubjectConversation(subjectType: string, subjectId: string, opts?: { occurrenceKey?: string; earlier?: boolean }): Promise<ApiResponse<SpaceConversationRead>> {
    const offline = this.guard<SpaceConversationRead>();
    if (offline) return offline;
    this.conversationReads.push({ subject_type: subjectType, subject_id: subjectId, ...(opts?.occurrenceKey ? { occurrence_key: opts.occurrenceKey } : {}) });
    if (subjectType === 'meeting') {
      this.meetingSeed(subjectId);
      return ok(this.meetingConversation(subjectId));
    }
    if (subjectType === 'space' && this.isDebriefId(subjectId)) return ok(this.debriefConversation());
    const sm = this.spaceMode;
    if (subjectType !== 'space') {
      return ok({ success: true, conversation_id: `mock-conv-${subjectId}`, subject: { type: subjectType as 'person', id: subjectId }, history: [] });
    }
    if (opts?.earlier) sm.earlierAsked++;
    if (sm.step === 'open' && !sm.open && sm.turns.length === 0) {
      // R20: the backend's lean opening (`prep_open`).
      this.spaceAsk(subjectId, 'Retro Saturday at 2pm. What do you want to bring up? Nothing is shared until you say yes.', [{ id: 'nothing', label: 'Nothing this time' }]);
    }
    const asking = sm.step === 'open' || sm.step === 'words';
    return ok({
      success: true,
      conversation_id: `mock-conv-${subjectId}`,
      subject: { type: 'space', id: subjectId, label: 'Door team' },
      history: sm.turns.map((t) => ({ ...t })),
      open_line: sm.open ?? undefined,
      open_lines: sm.open ? [sm.open] : [],
      mode: 'space',
      stage: {
        retro_id: 'mock-retro-1',
        retro_state: 'preparing',
        step: sm.step,
        // R20: the lean line, as the backend sends it (the fact once, with the counts, no closing stop).
        first_line: sm.step === 'shared' ? `Retro Saturday · you shared ${Math.max(1, sm.own.length)} · 1 of 4 shared` : 'Retro Saturday at 2pm',
      },
      input: {
        placeholder: asking ? 'What do you want to bring up?' : 'Write to Myu about this team',
        hints: sm.thin && asking
          ? ['What happened in the last few weeks that the team should talk about?', 'What is going well?', "Is there something you didn't say in a meeting?"]
          : [],
      },
      history_from: '2026-09-15T00:00:00Z',
    });
  }

  async addSubjectTurn(conversationId: string, content: string, pasted?: PastedBlockWire[]): Promise<ApiResponse<SpaceTurnReply>> {
    const offline = this.guard<SpaceTurnReply>();
    if (offline) return offline;
    const blocks = this.recordSend('/journal_chats/add', content, pasted);
    this.subjectTurns.push({ conversation_id: conversationId, content, ...(blocks ? { pasted_blocks: blocks } : {}) });
    const res = this.subjectTurnReply(conversationId, content, blocks);
    // As the server does (2026-10-06): a 2xx answer to a send that carried pasted text counts the blocks received.
    return blocks && res.ok && res.data ? { ...res, data: Object.assign({}, res.data, { pasted_blocks_received: blocks.length }) } : res;
  }

  /** A typed turn's answer, by whose conversation it is. */
  private subjectTurnReply(conversationId: string, content: string, blocks?: PastedBlockWire[]): ApiResponse<SpaceTurnReply> {
    if (conversationId.startsWith('mock-meeting-conv-')) return this.meetingTyped(content);
    const sm = this.spaceMode;
    const spaceId = conversationId.replace(/^mock-conv-/, '');
    if (sm.agent) return { status: 403, ok: false, data: { success: false, error: 'scope_required', scope_required: 'content' }, error: 'scope_required' };
    if (this.isDebriefId(spaceId)) return this.debriefTyped(content);
    this.spaceSay('you', content, blocks ? { pasted_blocks: blocks } : {});
    const answered = (intent: string, text: string, handled: 'answered' | 'refused' = 'answered', effects: SpaceTurnReply['effects'] = []) => {
      this.spaceSay('myu', text);
      return ok<SpaceTurnReply>({ role: 'assistant', content: text, space_mode: { intent, confidence: 0.9, handled }, effects });
    };
    if (/what do you think of|what do you make of/i.test(content)) {
      return answered('about_person', "I don't see anyone else's private notes; I can tell you what the team shared.");
    }
    if (/what did we decide|last time/i.test(content)) {
      if (sm.locked) return answered('results', 'Unlock this space to read it.', 'refused', [{ type: 'consent_needed', provider: 'space', reason: 'locked' }]);
      return answered('results', 'Nothing has been decided here yet.');
    }
    if (/bigger|my whole career/i.test(content)) {
      const line = this.spaceAsk(spaceId, "That's bigger than this retro. Want to take it to your journal?", [{ id: 'journal', label: 'Take it there' }, { id: 'leave', label: 'Not now' }]);
      return ok({ role: 'assistant', content: line.text, space_mode: { intent: 'bigger', confidence: 0.9, handled: 'confirm', line_id: line.line_id }, effects: [] });
    }
    if (/take (that|it) back/i.test(content)) {
      if (sm.open) this.spaceSettle('typed');
      const last = sm.own[sm.own.length - 1] ?? '';
      const line = this.spaceAsk(spaceId, `Take this back? "${last}"`, [{ id: 'take_back', label: 'Take it back' }, { id: 'leave', label: 'Leave it' }]);
      return ok({ role: 'assistant', content: line.text, space_mode: { intent: 'take_back', confidence: 0.95, handled: 'confirm', line_id: line.line_id }, effects: [] });
    }
    // The person's own words: the step that was up is parked as typed, and Myu asks how it should go.
    if (sm.open) this.spaceSettle('typed');
    sm.own.push(content);
    sm.step = 'words';
    const line = this.spaceAsk(spaceId, 'Got it. How should this go to the team?', [
      { id: 'named', label: 'With my name' },
      { id: 'question', label: 'As a question, no name' },
      { id: 'private', label: 'Keep it private' },
    ]);
    return ok({ role: 'assistant', content: line.text, space_mode: { intent: 'bring_up', confidence: 0.9, handled: 'confirm', line_id: line.line_id }, effects: [] });
  }

  async answerMyuLine(lineId: string, answer: SpaceAnswer): Promise<ApiResponse<SpaceAnswerReply>> {
    const offline = this.guard<SpaceAnswerReply>();
    if (offline) return offline;
    const day = this.dayLines.find((l) => l.line_id === lineId);
    // As the server does: a line no longer open answers 409 line_closed.
    if (day && day.state !== 'released' && day.state !== 'queued') return fail(409, 'line_closed');
    if (day) {
      this.dayAnswered.push({ line_id: lineId, answer });
      const reply = this.dayAnswers[lineId]?.(answer) ?? { success: true, readback: { text: answer.dismiss ? '' : 'Okay.' } };
      if (!reply.line_open) day.state = 'answered';
      return ok(reply);
    }
    const meeting = this.meetingAnswer(lineId, answer.choice_id ?? '');
    if (meeting) return meeting;
    const dOpen = this.debriefMode.open;
    if (dOpen && dOpen.line_id === lineId) return this.debriefAnswer(dOpen, answer.choice_id ?? '');
    if (lineId.startsWith('mock-debrief-line-')) return fail(409, 'line_closed');
    const sm = this.spaceMode;
    const open = sm.open;
    if (!open || open.line_id !== lineId) return fail(409, 'line_closed');
    const spaceId = open.conversation?.subject_id ?? '';
    const choice = answer.choice_id ?? '';
    const last = sm.own[sm.own.length - 1] ?? '';
    const done = (readback: string, effects: SpaceAnswerReply['effects'] = [], lineOpen = false): ApiResponse<SpaceAnswerReply> => {
      if (!lineOpen) this.spaceSettle(choice);
      if (readback) this.spaceSay('myu', readback, { readback: true, line_id: lineId });
      return ok({ success: true, line: { ...open, state: lineOpen ? 'released' : 'answered' }, readback: { text: readback }, effects, line_open: lineOpen });
    };
    const anythingElse = () => this.spaceAsk(spaceId, "Anything else? Type it, or say you're done.", [{ id: 'done', label: "I'm done" }]);
    switch (choice) {
      case 'named': {
        const r = done(`Okay. The team will see: "${last}" with your name on it.`);
        anythingElse();
        return r;
      }
      case 'question': {
        const r = done(`Okay. The team will see: "${last}" with no name.`);
        anythingElse();
        return r;
      }
      case 'private': {
        const r = done('Okay, kept private.');
        this.spaceAsk(spaceId, "Want to talk it through? Sometimes there's a version of it worth bringing.", [{ id: 'talk', label: 'Talk it through' }, { id: 'leave', label: 'Leave it' }]);
        return r;
      }
      case 'talk': {
        const r = done('');
        this.spaceAsk(spaceId, `Here's a version that says only that: "I agreed to the date before the work was sized." Bring this?`, [
          { id: 'named', label: 'Yes, with my name' },
          { id: 'question', label: 'Yes, as a question, no name' },
          { id: 'private', label: 'No, keep it private' },
          { id: 'leave', label: 'Leave it' },
        ]);
        return r;
      }
      case 'nothing':
      case 'done': {
        const r = done('');
        sm.step = 'readback';
        const bullets = sm.own.map((t) => `• "${t}" with your name`).join('\n');
        this.spaceAsk(spaceId, `Here is what the team will see on Saturday:\n${bullets || '• nothing yet'}\nNothing else is shared.\nOnce the questions are up, a no-name question can't be taken back.`, [
          { id: 'push', label: 'Share with the team' },
          { id: 'change', label: 'Change something' },
          { id: 'hold', label: 'Not yet' },
        ]);
        return r;
      }
      case 'push': {
        if (sm.locked) return done('Unlock this space to read it.', [{ type: 'consent_needed', provider: 'space', reason: 'locked' }], true);
        sm.step = 'shared';
        return done(`Shared with Door team: ${sm.own.length} things.`, [{ type: 'pushed', pushed: sm.own.length }]);
      }
      case 'change': {
        sm.step = 'words';
        return done('Type it again, the way you want it.');
      }
      case 'take_back': {
        sm.own.pop();
        return done('Taken back.');
      }
      case 'journal':
        return done('', [{ type: 'open_journal', text: last }]);
      default:
        return done('Okay.');
    }
  }

  async getRetroPrepMine(_spaceId: string): Promise<ApiResponse<SpacePrepMine>> {
    const offline = this.guard<SpacePrepMine>();
    if (offline) return offline;
    const sm = this.spaceMode;
    return ok({
      success: true,
      retro_id: 'mock-retro-1',
      retro_state: 'preparing',
      prep_id: 'mock-prep-1',
      just_me: false,
      step: sm.step,
      own_items: sm.own.map((text, i) => ({ item_id: `own-${i}`, text, how: 'named' as const, shared: sm.step === 'shared' })),
      suggestions: [],
      can_take_back: true,
      items: [],
      unanswered: [],
      capacity_answered: false,
      shared: sm.step === 'shared',
      share_line_open: sm.step === 'readback',
      open_asks: sm.open ? 1 : 0,
    });
  }

  private async getCardBase(entityType: CardEntityType, entityId: string): Promise<ApiResponse<{ card?: CardSpecLite }>> {
    const offline = this.guard<{ card?: CardSpecLite }>();
    if (offline) return offline;

    // Priya is unresolved: the web's disambiguation_pending answer, with two matches.
    if (entityType === 'person' && entityId === 'rel-2') {
      return ok({ response_type: 'disambiguation_pending', suggestions: [
        { card_id: 'lc-1', person_name: 'Priya Raman', profile_headline: 'Head of Platform at Northwind', linkedin_url: 'https://linkedin.com/in/priya-raman-nw', confidence: 0.82 },
        { card_id: 'lc-2', person_name: 'Priya Raman', profile_headline: 'Recruiter, Contoso', linkedin_url: 'https://linkedin.com/in/priyaraman', confidence: 0.31 },
      ] } as never);
    }

    // A person on the map: a thin card whose header says so (2026-10-03). Once kept track of, an ordinary thin card.
    const onMap = entityType === 'person' ? this.mapPeople.find((r) => r.relationship_id === entityId) : undefined;
    if (onMap) {
      return ok({
        card: {
          entity_id: entityId,
          header: { display_name: onMap.primary_name, subtitle: onMap.company_name ?? undefined, email_primary: onMap.email_primary, pronouns: this.mapPronouns[entityId] ?? null, on_map: true },
          sections: [],
        },
      });
    }
    const kept = entityType === 'person' ? this.keptPeople.find((e) => e.entity_id === entityId) : undefined;
    if (kept) {
      return ok({
        card: {
          entity_id: entityId,
          header: { display_name: kept.display_name, subtitle: kept.organization, pronouns: this.mapPronouns[entityId] ?? null },
          sections: [],
        },
      });
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

  // ── the meeting's card, version 2 (2026-09-30), and the meeting's own conversation ─────────────
  // A small stand-in for the backend: the card with its question before and its arc, and the
  // meeting's conversation where typed words answer the question that is up, "Anything you didn't
  // say in there?" is followed by the Yes/No, and the arc's Now opens it. The sentences are the
  // backend's fixed copy (lines_config).

  /** Cards a test puts in place of the mock's own, by event id. */
  meetingPreps: Record<string, unknown> = {};
  /** Every card read, by event id. */
  prepReads: string[] = [];
  /** Every conversation read: which subject, and the occurrence it named. */
  conversationReads: Array<{ subject_type: string; subject_id: string; occurrence_key?: string }> = [];
  /** Every typed turn into a subject's conversation. */
  subjectTurns: Array<{ conversation_id: string; content: string; pasted_blocks?: PastedBlockWire[] }> = [];
  /** Every button pressed on the meeting's conversation or the mock card's arc: which line, which choice. */
  meetingAnswered: Array<{ line_id: string; choice_id: string }> = [];

  /** One meeting's conversation: its turns, the ask that is up, and whether the arc was answered. */
  meetingMode: { event_id: string | null; turns: SpaceTurn[]; open: SpaceAsk | null; n: number; arcAnswered: boolean } = {
    event_id: null,
    turns: [],
    open: null,
    n: 0,
    arcAnswered: false,
  };

  /** Open an ask in the meeting's conversation (the mock's own seeding, or a test's). */
  meetingAsk(eventId: string, text: string, choices: SpaceChoice[], detail: 'ask' | 'unsaid' | 'converge' | 'take_back'): SpaceAsk {
    const mm = this.meetingMode;
    mm.event_id = eventId;
    const at = new Date().toISOString();
    const line: SpaceAsk = {
      line_id: `mock-meeting-line-${++mm.n}`,
      subjects: [{ type: 'meeting', id: eventId, label: 'Marcus / 1:1' }],
      text,
      needs_you: true,
      ask_kind: 'choice',
      choices,
      state: 'released',
      conversation: { subject_type: 'meeting', subject_id: eventId, conversation_id: `mock-meeting-conv-${eventId}` },
      provenance: { source: 'calendar', detail },
      created_at: at,
    };
    mm.turns.push({ turn_id: `mock-meeting-turn-${++mm.n}`, from: 'myu', at, text, choices, line_id: line.line_id });
    mm.open = line;
    return line;
  }

  private meetingSay(from: 'myu' | 'you', text: string, extra: Partial<SpaceTurn> = {}): void {
    this.meetingMode.turns.push({ turn_id: `mock-meeting-turn-${++this.meetingMode.n}`, from, at: new Date().toISOString(), text, ...extra });
  }

  private meetingSettle(choiceId: string): SpaceAsk | null {
    const mm = this.meetingMode;
    const open = mm.open;
    if (!open) return null;
    const turn = mm.turns.find((t) => t.line_id === open.line_id && !t.readback);
    if (turn) turn.answered = { choice_id: choiceId, at: new Date().toISOString() };
    mm.open = null;
    return open;
  }

  /** The mock's first read of a meeting: the question before it is up. */
  private meetingSeed(eventId: string): void {
    const mm = this.meetingMode;
    if (mm.event_id === eventId) return;
    this.meetingMode = { event_id: eventId, turns: [], open: null, n: mm.n, arcAnswered: false };
    this.meetingAsk(eventId, 'What do you want out of Thursday with Marcus?', [{ id: 'skip', label: 'Skip' }], 'ask');
  }

  private meetingConversation(eventId: string): SpaceConversationRead {
    const mm = this.meetingMode;
    return {
      success: true,
      conversation_id: `mock-meeting-conv-${eventId}`,
      subject: { type: 'meeting', id: eventId, label: 'Marcus / 1:1' },
      history: mm.turns.map((t) => ({ ...t })),
      open_line: mm.open ?? undefined,
      open_lines: mm.open ? [mm.open] : [],
    };
  }

  /** Words typed in the meeting's conversation: the answer to the ask that is up. */
  private meetingTyped(content: string): ApiResponse<SpaceTurnReply> {
    this.meetingSay('you', content);
    const answered = this.meetingSettle('typed');
    const eventId = this.meetingMode.event_id ?? '';
    const reply = (text: string) => {
      this.meetingSay('myu', text);
      return ok<SpaceTurnReply>({ role: 'assistant', content: text });
    };
    if (answered?.provenance?.detail === 'unsaid') {
      const r = reply('Kept with this meeting. Only you can see it.');
      this.meetingAsk(eventId, 'If someone else in that meeting has the same thing unsaid, want it on the list for the next one, without names?', [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }], 'converge');
      return r;
    }
    return reply(answered ? 'Thanks. I’ll keep that in mind going in.' : 'Noted.');
  }

  /** A button on the meeting's ask that is up, or on the card's arc. */
  private meetingAnswer(lineId: string, choice: string): ApiResponse<SpaceAnswerReply> | null {
    const mm = this.meetingMode;
    const eventId = mm.event_id ?? '';
    if (lineId === `mock-arc-${eventId}` && !mm.arcAnswered) {
      this.meetingAnswered.push({ line_id: lineId, choice_id: choice });
      mm.arcAnswered = true;
      const start = String(Date.parse(this.mockPrepCard(eventId).starts_at));
      if (choice === 'hold_time') {
        return ok({ success: true, readback: { text: "Here's the hold. Its link opens the session." }, effects: [{ type: 'invite_ready', handoff_url: 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=Get+ready%3A+Thursday', source: 'google' }] });
      }
      if (choice === 'now') {
        this.meetingSay('myu', "Here's what I have for Thursday's 1:1:\n- Agreed the beta ships Oct 1 (Your notes, Sep 25)");
        return ok({ success: true, readback: { text: '' }, effects: [{ type: 'open_conversation', subject_type: 'meeting', subject_id: eventId, occurrence_key: start }] });
      }
      return ok({ success: true, readback: { text: "Okay, I'll leave this one." } });
    }
    const open = mm.open;
    if (!open || open.line_id !== lineId) return null;
    this.meetingAnswered.push({ line_id: lineId, choice_id: choice });
    const detail = open.provenance?.detail;
    this.meetingSettle(choice);
    const said = (text: string) => {
      if (text) this.meetingSay('myu', text, { readback: true, line_id: lineId });
      return ok<SpaceAnswerReply>({ success: true, line: { ...open, state: 'answered' }, readback: { text } });
    };
    if (detail === 'converge' && choice === 'yes') {
      const r = said('Okay. Only the topic goes, never your words or your name.');
      this.meetingAsk(eventId, "It's in, as a topic with no names. You can take it back until the next meeting starts.", [{ id: 'take_back', label: 'Take it back' }], 'take_back');
      return r;
    }
    if (detail === 'converge') return said('It stays with you.');
    if (detail === 'take_back') return said('Taken back. Nothing of it goes anywhere.');
    return said('');
  }

  /** The card the mock serves: a one-on-one in two days, with the question before it and the arc. */
  private mockPrepCard(eventId: string): PrepCardV2 {
    const starts = new Date(Date.now() + 2 * 86400000);
    starts.setUTCMinutes(0, 0, 0);
    const mm = this.meetingMode;
    const ask = mm.event_id === eventId && mm.open?.provenance?.detail === 'ask' ? { line_id: mm.open.line_id, text: mm.open.text, choices: [{ id: 'skip', label: 'Skip' }] } : null;
    return {
      version: 2,
      event_id: eventId,
      kind: 'one_on_one',
      title: 'Marcus / 1:1',
      starts_at: starts.toISOString(),
      built_at: new Date().toISOString(),
      thin: false,
      partial: false,
      top: [
        { part: 'purpose', text: 'This 1:1 is to settle the headcount proposal.', evidence_ids: ['meeting:m1'] },
        { part: 'since_last', text: 'Marcus asked for the numbers by Friday; the proposal is still open.', evidence_ids: ['email:e1', 'meeting:m1'] },
        { part: 'moves', text: '', evidence_ids: [], items: [{ text: 'You could send Marcus the numbers before Thursday.', evidence_ids: ['email:e1'] }] },
        { part: 'watch', text: 'Watch for the reorg coming up again.', evidence_ids: ['memory:j1'] },
      ],
      people: [
        {
          relationship_id: 'rel-1',
          name: 'Marcus Webb',
          thin: false,
          to_you: 'Your manager.',
          stands: 'Marcus is your manager, with the headcount proposal open between you.',
          works_best: null,
          you_owe: ['The headcount numbers'],
          they_owe: [],
          stance: 'In 4 of 6 emails Marcus wrote as the one deciding.',
          last_time: 'You last met Sep 25.',
          evidence_ids: ['email:e1'],
        },
        { relationship_id: null, name: 'Reid Park', thin: true, to_you: 'Nothing in your notes about Reid yet.', stands: null, works_best: null, you_owe: [], they_owe: [], stance: null, last_time: null, evidence_ids: [] },
      ],
      room: { team: null, lines: [] },
      before_you_go: {
        agenda: null,
        documents: [{ title: 'Headcount plan', url: 'https://docs.google.com/document/d/mock' }],
        set_up_email: { subject: 'Re: headcount', from: 'Marcus Webb', at: new Date(Date.now() - 5 * 86400000).toISOString() },
        last_notes: { summary: 'Agreed to revisit headcount once the budget lands.', meeting_id: 'm1' },
        not_replied: ['Reid Park'],
      },
      afterwards: 'Note whether the headcount is agreed.',
      interview: null,
      evidence: {
        'meeting:m1': { source: 'calendar', label: 'Your notes, Sep 25', at: '2026-09-25T11:00:00Z', open: { kind: 'meeting', id: 'm1' } },
        'email:e1': { source: 'email', label: 'Email, Sep 26: Re: headcount', at: '2026-09-26T09:00:00Z', open: { kind: 'email', id: 'e1' } },
        'memory:j1': { source: 'user_stated', label: 'You said, Sep 28', at: '2026-09-28T18:00:00Z', open: { kind: 'journal', id: 'mock-j-1' } },
      },
      ask,
      arc: mm.arcAnswered ? null : { line_id: `mock-arc-${eventId}`, text: 'Thursday with Marcus matters. Want to get ready together?', choices: [{ id: 'hold_time', label: 'Hold time' }, { id: 'now', label: 'Now' }, { id: 'skip', label: 'Skip' }], hold_link: 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=Get+ready%3A+Thursday' },
    };
  }

  /** `GET /prep/meeting` — a test's card when it set one; `mock-event-unknown` is not on the calendar (404). */
  async getMeetingPrep(eventId: string): Promise<ApiResponse<{ prep?: PrepCardV2 }>> {
    const offline = this.guard<{ prep?: PrepCardV2 }>();
    if (offline) return offline;
    this.prepReads.push(eventId);
    if (eventId in this.meetingPreps) return ok({ prep: this.meetingPreps[eventId] as PrepCardV2 });
    if (eventId === 'mock-event-unknown') return fail(404, 'not_found');
    this.meetingSeed(eventId);
    return ok({ prep: this.mockPrepCard(eventId) });
  }

  async searchEntities(query: string): Promise<ApiResponse<{ results?: WireEntityHeadline[] }>> {
    const offline = this.guard<{ results?: WireEntityHeadline[] }>();
    if (offline) return offline;
    // Search covers everyone: a person on the map is found too, marked `on_map` (2026-10-03).
    this.searchReads++;
    const all: WireEntityHeadline[] = [
      { entity_type: 'person', entity_id: 'rel-1', display_name: 'Marcus Webb', organization: 'Acme', item_count: 3, top_urgency: 'medium' },
      { entity_type: 'person', entity_id: 'rel-2', display_name: 'Priya Raman', organization: 'Northwind', item_count: 1, top_urgency: 'low' },
      { entity_type: 'person', entity_id: 'rel-3', display_name: 'Jim Halvorsen', organization: 'Northwind', item_count: 0, top_urgency: 'info' },
      ...this.keptPeople,
      ...this.mapPeople.map((r): WireEntityHeadline => ({ entity_type: 'person', entity_id: r.relationship_id, display_name: r.primary_name, organization: r.company_name ?? undefined, item_count: 0, top_urgency: 'info', on_map: true, times_seen: r.times_seen })),
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

  async createChatEntry(_accountId: string, content: string, context?: ChatContext, _templateType?: string, canvas?: ChatCanvasOptions, pasted?: PastedBlockWire[]): Promise<ApiResponse<ChatTurnResult>> {
    const offline = this.guard<ChatTurnResult>();
    if (offline) return offline;
    const blocks = this.recordSend('/journal/add', content, pasted);
    const out: ChatTurnResult = { journal_id: `mock-journal-${generateDeviceId().slice(0, 8)}`, blocks: this.reply(content, context) };
    if (canvas?.continuesCompositionId) out.canvas = this.canvasSide(canvas.continuesCompositionId, content);
    if (blocks) out.pasted_blocks_received = blocks.length;
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

  async addChatTurn(_accountId: string, journalId: string, content: string, context?: ChatContext, canvas?: ChatCanvasOptions, pasted?: PastedBlockWire[]): Promise<ApiResponse<ChatTurnResult>> {
    const offline = this.guard<ChatTurnResult>();
    if (offline) return offline;
    const blocks = this.recordSend('/journal_chats/add', content, pasted);
    const out: ChatTurnResult = { journal_id: journalId, blocks: this.reply(content, context) };
    if (canvas?.continuesCompositionId) out.canvas = this.canvasSide(canvas.continuesCompositionId, content);
    if (blocks) out.pasted_blocks_received = blocks.length;
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
    return ok({ success: true, composition_id: 'mock-career', composition: { id: 'mock-career', summary_text: 'Builder to operator', components: [{ id: 'ct', type: 'career_trajectory', data: { pattern_name: 'Builder to operator', current_phase_name: 'Scaling', current_phase_description: 'Hiring faster than delegating.', phases: [{ id: 'p2', name: 'Scaling', description: 'Hiring.', status: 'current' }] } }] } });
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

  async submitFeedback(body: FeedbackBody): Promise<ApiResponse<{ success?: boolean; message?: string; error?: string; files_attached?: number }>> {
    const offline = this.guard<{ success?: boolean }>();
    if (offline) return offline;
    if (this.feedbackRefusal) return fail(this.feedbackRefusal.status, this.feedbackRefusal.error);
    this.state.feedback.push(body);
    const files = body.attachments?.files?.length ?? 0;
    return ok({ success: true, message: 'Feedback submitted successfully', ...(this.feedbackServerBeforeFiles ? {} : { files_attached: files }) });
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

  async getSelfCard(level?: 'read' | 'deep_dive'): Promise<ApiResponse<{ card?: import('./api').CardSpecLite }>> {
    // self_card_legible on: what Myu knows so far, each with its source. As the server (2026-10-05): the read in full
    // (`full`) only at deep_dive; the tiles and the pressing item at both levels.
    const deep = level === 'deep_dive';
    return ok({ card: {
      known_facts: [
        { key: 'you', value: 'Founder, askMyu', source: 'linkedin', kind: 'fact' },
        { key: 'read', value: 'You’ve spent twelve years in product. You’re building the second company now.', ...(deep ? { full: 'You’ve spent twelve years in product. You’re building the second company now. Alongside it: advisor at Northwind.' } : {}), source: 'read', kind: 'read' },
        { key: 'week', value: '4 meetings in the next 7 days', source: 'calendar', kind: 'fact' },
        { key: 'not_yet', value: 'Where you and the people you named left off', source: 'mail', kind: 'not_yet' },
      ],
      tiles: [{ label: 'Burnout risk', value: 'Low' }],
      hot_item: { text: 'Your board update is due Friday.', urgency: 'medium' },
    } });
  }

  async listMeetings(): Promise<ApiResponse<{ meetings?: Array<Record<string, unknown>>; total?: number }>> {
    return ok({ meetings: [], total: 0 });
  }

  /** A meeting's notes a test puts in place, by meeting id (the card's "Open the notes ▸"); empty otherwise. */
  meetingDetails: Record<string, { meeting?: Record<string, unknown>; key_points?: unknown; decisions?: unknown }> = {};

  async getMeetingDetail(meetingId = ''): Promise<ApiResponse<{ meeting?: Record<string, unknown>; key_points?: unknown; decisions?: unknown }>> {
    return ok(this.meetingDetails[meetingId] ?? { meeting: {} });
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
    return ok({ preferences: { preferred_address: '', coaching_preference: 'auto', timezone: this.savedTimeZone } });
  }

  /** The saved zone, as the server keeps it (null until a client sends one; the brief then uses America/New_York). */
  savedTimeZone: string | null = null;

  async updateAccountPreferences(body: Record<string, unknown>): Promise<ApiResponse> {
    if (typeof body.timezone === 'string') this.savedTimeZone = body.timezone;
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

  async classifyCareerMoment(_accountId: string, content: string, pasted?: PastedBlockWire[]): Promise<ApiResponse<import('./api').MomentClassifyResult>> {
    const blocks = this.recordSend('/onboard/classify_career_moment', content, pasted);
    // The server classifies the typed words and the pasted text together.
    const words = [content, ...(blocks ?? []).map((b) => b.text)].join('\n\n').trim().split(/\s+/).length;
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
