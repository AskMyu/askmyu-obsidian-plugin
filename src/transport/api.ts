/**
 * The backend surface this plugin uses, in one file, typed to the plugin's
 * backend contract (the same routes the web app calls).
 *
 * Items 1 and 2 of that contract (plugin tokens, device KEK) do not exist on the
 * server yet. `MockApi` below implements them faithfully enough to drive the
 * whole unlock state machine offline, so P0 is buildable and demoable before the
 * backend lands — and swapping to `Api` is a one-line change in main.ts, not a
 * refactor.
 *
 * Everything else here (brief, prep, device transfer, escrow) already exists and
 * is called verbatim — no plugin-specific endpoints, per the contract's closing
 * section.
 */

import type { Transport, ApiResponse, EncryptedJournalPayload } from './index';
import type { SourceReferenceLite, SurfaceMutationLite, ChatBlock, ChatContext, CompositionSpecLite, EntityHeadline, PrepPayload } from '../wire';
import type { CanvasReply } from '../composition/afterTurn';

/** A literal union the server may extend: the named values stay as hints, any other string is still allowed. */
export type Loose<T extends string> = T | (string & Record<never, never>);

export interface ExchangeResult {
  auth_token: string;
  account_id: string;
  encryption_blocked: boolean;
  /**
   * Has this account consented to background work? Governs whether the plugin
   * escrows the mDEK to the session at all. Absent on older backends → treated
   * as not consented (fail closed).
   */
  background_work_consented?: boolean;
}

export interface PendingTransfer {
  request_id: string;
  device_name?: string;
  device_type?: string;
  requested_at?: number;
  /** When the server will drop this request (epoch ms). The window is server config — never assume it. */
  expires_at?: number;
  /** Requester's ephemeral ECDH public key — what the approver wraps to. */
  public_key?: string;
}

export interface TransferRequestResult {
  request_id: string;
  verification_code: string;
}

export interface TransferStatusResult {
  status: 'pending' | 'approved' | 'denied' | 'expired';
  /**
   * The single transfer blob, present once approved. base64 of
   * `senderSPKI(91) || iv(12) || ciphertext` — the approving device's public
   * key is packed into this blob, NOT sent as a separate field (REVIEW C1;
   * matches web DeviceKeyService.decryptReceivedMDEK / mobile decryptWithECDH).
   */
  encrypted_mdek?: string;
}

export interface JournalUpsertResult {
  journal_id: string;
  revision: number;
  created: boolean;
}

// ── P8: the vault as a surface ─────────────────

/** One vault edit, shipped as an interaction event — never as a sync write. */
export interface VaultInteractionEvent {
  /** The `%%myu-id:…%%` on the edited line — commitment_id for checkboxes. */
  myu_id: string;
  kind: 'tick' | 'untick' | 'edit' | 'add' | 'delete';
  before?: string;
  after?: string;
  /** When the edit was observed (ms). Idempotency, not display. */
  source_timestamp: number;
  content_hash?: string;
}

export interface VaultInteractionResult {
  myu_id: string;
  kind: string;
  /** resolved | restored | queued | absorbed | unknown */
  outcome: string;
}

/** Row from POST /vault/commitments. Encrypted rows decrypt client-side. */
export interface VaultCommitment {
  commitment_id: string;
  content?: string;
  encrypted_content?: string;
  encryption_version?: number;
  commitment_type?: string;
  owner?: string;
  owner_relationship_id?: string;
  /** ISO date. */
  deadline?: string;
  status?: string;
  meeting_title?: string;
  meeting_date?: string;
}

/** One advisor take from POST /card/board-lite — rendered verbatim, named voice. */
export interface BoardTakeLite {
  advisor_id?: string;
  advisor_name?: string;
  take_text?: string;
  /** Live endpoint sends `text`; older payloads `take_text`. Read both. */
  text?: string;
  advisor_persona?: string;
}

export interface BoardLiteResult {
  takes?: BoardTakeLite[];
  context_summary?: string;
  full_deliberation_available?: boolean;
}

// ── P9: plugin-native onboarding (gateway primacy) ──────────────────────────

export interface SignupResult {
  /** Session token — CreateAccount returns `autoken` on the account object. */
  autoken?: string;
  account_id?: string;
}

/** ValidateMagicLink JSON mode (X-Client-Type: obsidian). */
export interface MagicLinkSession {
  auth_token?: string;
  account_id?: string;
  is_new_account?: boolean;
  /** Existing account with encryption — this device must be approved, not born.
      The ONLY keys-exist signal (2026-08-22 live-run fix). */
  device_transfer_required?: boolean;
  /** AMBIGUOUS — true for the encryption-SETUP arm too. Never treat as keys-exist. */
  encryption_redirect?: boolean;
}

export interface AskMyuApi {
  exchangeToken(token: string, deviceId: string): Promise<ApiResponse<ExchangeResult>>;
  escrowMDEK(mdekBase64: string, deviceId: string): Promise<ApiResponse>;

  storeDeviceKEK(deviceId: string, kekBase64: string, deviceName: string): Promise<ApiResponse>;
  fetchDeviceKEK(deviceId: string): Promise<ApiResponse<{ device_kek: string }>>;

  requestDeviceTransfer(deviceId: string, publicKey: string, deviceName: string): Promise<ApiResponse<TransferRequestResult>>;
  pollDeviceTransfer(requestId: string): Promise<ApiResponse<TransferStatusResult>>;
  /** The APPROVING side (gateway primacy: a vault-primary approves their next
      device from the vault). Rows carry the requester's public_key since the
      2026-08-22 fleet fix — the input to the ECDH wrap. */
  getPendingTransfers(): Promise<ApiResponse<{ pending_requests?: PendingTransfer[] }>>;
  approveDeviceTransfer(requestId: string, verificationCode: string, encryptedMdek: string): Promise<ApiResponse>;
  denyDeviceTransfer(requestId: string): Promise<ApiResponse>;
  fetchRecoveryWrappedMDEK(): Promise<ApiResponse<{ wrapped_mdek_recovery: string }>>;

  upsertJournal(payload: EncryptedJournalPayload): Promise<ApiResponse<JournalUpsertResult>>;
  getBrief(): Promise<ApiResponse>;
  getCalendarEvents(start: string, end: string): Promise<ApiResponse>;

  // ── P8.9 history down-sync: for the vault-first user the WEB is not home —
  // the vault is. Server-side history (memories, meetings, journals) flows
  // DOWN into Myu/ (operator ruling, 2026-08-25: "sync up and down, all the
  // things").
  /** Relationship memories — the person card's memory layer. The response's
      `memories` is an OBJECT keyed by source (email/journal/messaging), each
      holding arrays (sometimes nested by subtype); rows carry `content` or
      E2EE `encrypted_content` (which only WE can open). Discovered live —
      the first guess at this shape cost Jim his memories twice. */
  getRelationshipMemories(relationshipId: string, limit?: number): Promise<ApiResponse<{ memories?: Record<string, unknown> }>>;
  /** The SELF card — the account's own arc/psych/career, /card/self. */
  getSelfCard(): Promise<ApiResponse<{ card?: CardSpecLite }>>;
  /** The account's meeting history (any source: calendar, vault, fireflies). */
  listMeetings(limit: number, offset: number): Promise<ApiResponse<{ meetings?: Array<Record<string, unknown>>; count?: number; has_more?: boolean }>>;
  /** One meeting, WHOLE: summary, key points, decisions, commitments, notes,
      transcript — the list rows are thin (found live: "only summaries"). */
  getMeetingDetail(meetingId: string): Promise<ApiResponse<{ meeting?: Record<string, unknown>; key_points?: unknown; decisions?: unknown; commitments?: unknown }>>;
  /** Journal entries in a date range; encrypted_content decrypts with OUR mDEK. */
  getJournalEntries(accountId: string, startMs: number, endMs: number): Promise<ApiResponse<{ entries?: Array<Record<string, unknown>> }>>;
  /** The chat turns chained onto one journal entry — the conversation. */
  getJournalChats(journalId: string): Promise<ApiResponse<{ chats?: Array<Record<string, unknown>>; offer?: DeliveredOffer }>>;

  /** The ranked entity list behind the People/Companies tabs on every surface. */
  listEntities(tab: CardEntityType, opts?: { changedSince?: number }): Promise<ApiResponse<{ entities?: EntityHeadline[]; server_time?: number }>>;
  /** The six Today reads in one answer (flag `today_bundle`). */
  getTodayBundle(start: string, end: string, timezone: string): Promise<ApiResponse<TodayBundle>>;
  /** What changed in the vault's material since `since` (flag `vault_changes`), one page. */
  getVaultChanges(since: number, cursor?: string | null, pageSize?: number): Promise<ApiResponse<VaultChangesPage>>;
  getCard(entityType: CardEntityType, entityId: string): Promise<ApiResponse<{ card?: CardSpecLite; response_type?: string; suggestions?: Array<Record<string, unknown>>; linkedin_known?: boolean }>>;

  /** The mirror (A11) — same endpoint every review surface reads. */
  getMirrorEdition(): Promise<ApiResponse<{ edition?: MirrorEdition }>>;

  getMeetingPrep(eventId: string): Promise<ApiResponse<{ prep?: PrepPayload }>>;
  /** "who is this? ▸" — persists server-side, outranks future guesses, clears the stored prep. */
  linkPrepSubject(eventId: string, relationshipId: string): Promise<ApiResponse>;
  /** Mixed person+company search across ALL entities (long-tail included). */
  searchEntities(query: string): Promise<ApiResponse<{ results?: EntityHeadline[] }>>;
  /** Server weekly edition — `{edition:{period, sections[], generated_at}}`. */
  getWeeklyReview(): Promise<ApiResponse<{ edition?: WeeklyEdition }>>;

  /**
   * BWI-1 — a vault meeting note enters the meeting pipeline. PLAINTEXT by
   * design and by disclosed consent: meeting content is processed server-side
   * like every meeting source (Drive, Gemini), which is what the P5.1 consent
   * copy says in as many words. The ack returns at DB speed; extraction is
   * ASYNC — artifacts land moments later and the ambient poll picks them up.
   * `occurred_at_ms` is REQUIRED server-side (refused, never defaulted).
   */
  ingestMeetingNote(payload: MeetingNotePayload): Promise<ApiResponse<MeetingIngestAck>>;

  /** Same endpoint the web canvas loads from — `GET /composition?id=`. */
  getComposition(compositionId: string): Promise<ApiResponse<{ composition?: CompositionSpecLite }>>;
  /**
   * The canvas a CONVERSATION has — `narrative_threads.current_composition_id`
   * for this journal. The web calls this on every resume
   * (DynamicChatColumn → compositionApi.getCompositionForJournal); the stored
   * turns cannot answer it, because the `composition_offer` block is built
   * only for the live HTTP response and the persisted reply carries no id.
   */
  getCompositionForJournal(journalId: string): Promise<ApiResponse<CompositionForJournal>>;
  /**
   * EVERY canvas that conversation made, oldest turn first — `all=true`, added
   * for this plugin (backend 2026-09-01) because the call above can only ever
   * name the live one and a conversation makes many.
   */
  getCompositionsForJournal(journalId: string): Promise<ApiResponse<CompositionForJournal>>;
  /**
   * The account's compositions, newest first — what the save modal OFFERS so
   * nobody is ever asked to know a composition id (operator, 2026-08-28: "i
   * dont know what the id or url is"). `GET /composition/history`, the web's
   * own list; rows carry summary/subject/date, never the spec.
   */
  getCompositionHistory(limit?: number): Promise<ApiResponse<CompositionHistory>>;
  /**
   * `POST /composition/interaction` — what makes a canvas click TALK BACK. The
   * web records every interaction here; for the high-signal ones
   * (option_selected, prompt_answered, action_clicked, linkedin_*) it sets
   * `generate_response` and the backend answers in the conversation, then
   * pushes `chatrefresh` (and `composition_mutation` if the canvas changed).
   */
  postCompositionInteraction(events: InteractionEvent[], generateResponse: boolean): Promise<ApiResponse<{ success?: boolean; ack?: boolean; response_generating?: boolean; responses?: Array<Record<string, unknown>> }>>;
  // ── the feed panel's affordances (bucket 2, 2026-08-29) ──
  getHelpMyuQueue(): Promise<ApiResponse<{ queue?: HelpMyuItem[]; total_count?: number }>>;
  getRelatedPersons(relationshipId: string, limit?: number): Promise<ApiResponse<{ related?: RelatedPerson[] }>>;
  getRelatedMemories(relationshipId: string, limit?: number): Promise<ApiResponse<{ related?: RelatedMemory[] }>>;
  getEntityDispatch(entityType: CardEntityType, entityId: string): Promise<ApiResponse<{ dispatch_sentence?: string; dispatch_category?: string; dispatch_receipt?: Record<string, unknown> }>>;
  dismissEntityDispatch(entityId: string, signalFingerprint: string, category?: string): Promise<ApiResponse>;
  searchFeed(q: string, limit?: number): Promise<ApiResponse<{ results?: FeedSearchResults }>>;
  getSourceDetail(sourceType: string, sourceId: string): Promise<ApiResponse<{ detail?: SourceDetail; error?: string }>>;
  /** `POST /v2/relationships/linkedin/{id}` — link by URL, or unlink with null. */
  setRelationshipLinkedIn(relationshipId: string, linkedinUrl: string | null): Promise<ApiResponse<{ success?: boolean; error?: string }>>;
  rejectMerge(sourceId: string, targetId: string): Promise<ApiResponse<{ success?: boolean }>>;
  addMeetingDecision(meetingId: string, content: string): Promise<ApiResponse<{ success?: boolean; decision_id?: string }>>;
  addMeetingCommitment(meetingId: string, content: string, commitmentType?: string, owner?: string): Promise<ApiResponse<{ success?: boolean; commitment_id?: string }>>;
  getDriveSuggestions(limit?: number): Promise<ApiResponse<{ suggestions?: DriveSuggestion[]; count?: number }>>;
  importFromDrive(fileIds: string[]): Promise<ApiResponse<{ success?: boolean; error?: string; message?: string; results?: Array<{ file_id: string; status: string; meeting_id?: string; title?: string; message?: string }>; imported_count?: number }>>;
  dismissDriveSuggestion(id: string): Promise<ApiResponse>;
  // ── connections and account (bucket 3, 2026-08-29) ──
  googleOAuthDisconnect(credentialId: string): Promise<ApiResponse<{ success?: boolean; message?: string; error?: string }>>;
  googleSetPrimaryCredential(credentialId: string): Promise<ApiResponse<{ success?: boolean; message?: string; error?: string }>>;
  microsoftOAuthDisconnect(credentialId: string): Promise<ApiResponse<{ success?: boolean; message?: string; error?: string }>>;
  microsoftSetPrimaryCredential(credentialId: string): Promise<ApiResponse<{ success?: boolean; message?: string; error?: string }>>;
  /** `POST /slack/connect` → the OAuth URL to open; Slack returns the person to the web's integrations page. */
  slackConnect(): Promise<ApiResponse<{ authorization_url?: string; state?: string }>>;
  slackDisconnect(connectionId: string): Promise<ApiResponse<{ success?: boolean; message?: string }>>;
  zulipConnect(realmUrl: string, email: string, apiKey: string): Promise<ApiResponse<{ success?: boolean; connection_id?: string; realm_name?: string; error?: string }>>;
  zulipDisconnect(connectionId: string): Promise<ApiResponse<{ success?: boolean; message?: string }>>;
  updateAccountName(accountId: string, name: string): Promise<ApiResponse<{ success?: boolean; message?: string }>>;
  getAccountCareer(accountId: string): Promise<ApiResponse<{ status?: string; summary?: string; resume_summary?: string; linkedin_data_id?: string; linkedin_id?: string }>>;
  getPersonalLoop(): Promise<ApiResponse<{ loop?: PersonalLoop | null; coupled_loops?: CoupledLoop[] }>>;
  submitFeedbackSignal(body: FeedbackSignalBody): Promise<ApiResponse<{ success?: boolean; signal_id?: string }>>;
  /** `POST /feedback/submit` — the web's feedback door and its 👍/👎 on a reply. */
  submitFeedback(body: FeedbackBody): Promise<ApiResponse<{ success?: boolean; message?: string; error?: string; retry_after_minutes?: number }>>;
  /** `POST /composition/refresh` — the web's Refresh on an expired canvas: a fresh spec. */
  refreshComposition(compositionId: string): Promise<ApiResponse<{ composition?: CompositionSpecLite; composition_id?: string; success?: boolean; error?: string }>>;
  /**
   * The account archive — everything the server holds, as an encrypted zip.
   * `POST /account/data/export-request` (the web's Download-your-data): answers
   * a one-time passphrase; the download link arrives by email when the archive
   * is ready; rate-limited (a 429 with a message).
   */
  requestDataExport(): Promise<ApiResponse<{ success?: boolean; export_id?: string; passphrase?: string; error?: string; message?: string }>>;
  /**
   * A canvas control, pressed. `POST /composition/action` with the web's exact
   * body; the answer is mutations to apply locally (and then persist with
   * persistCompositionMutations, as the web does), or a message, or an error.
   * A card that only READS as "Is this the right person?" is not a card the
   * reader can answer (operator screenshot, 2026-08-28).
   */
  executeCompositionAction(compositionId: string, componentId: string, action: string, params?: Record<string, unknown>): Promise<ApiResponse<CompositionActionResult>>;
  /** `POST /composition/mutate` — the second half of every action, fire-and-forget on the web too. */
  persistCompositionMutations(compositionId: string, mutations: SurfaceMutationLite[]): Promise<ApiResponse<{ success?: boolean; snapshot_id?: string }>>;

  /**
   * P6 — the chat, mirroring the WEB's request shapes exactly: first message →
   * `POST /journal/add`, turns → `POST /journal_chats/add` chaining journal_id;
   * context under BOTH `feed_context` and `context_injection` (the 2026-07-27
   * key-drift lesson — send both, land whichever the backend reads).
   */
  createChatEntry(accountId: string, content: string, context?: ChatContext, templateType?: string, canvas?: ChatCanvasOptions): Promise<ApiResponse<ChatTurnResult>>;
  addChatTurn(accountId: string, journalId: string, content: string, context?: ChatContext, canvas?: ChatCanvasOptions): Promise<ApiResponse<ChatTurnResult>>;
  /** Denial doctrine: one tap, zero justification. Fire-and-forget at call sites. */
  submitPatternFeedback(eventType: PatternFeedbackEvent, patternId: string, sourceSurface: string): Promise<ApiResponse>;

  /** P8 — vault edits as interaction events (BWI-3). */
  vaultInteraction(events: VaultInteractionEvent[]): Promise<ApiResponse<{ results?: VaultInteractionResult[] }>>;
  /** P8 — account-wide open commitments for the CommitmentWriter. */
  listVaultCommitments(): Promise<ApiResponse<{ commitments?: VaultCommitment[] }>>;

  /** P9 — plugin-native signup. Returns the session directly (autoken).
      `termsVersion`: the beta-terms bundle agreed to at the door (2026-09-02). */
  createAccount(email: string, name: string, password: string, termsVersion?: string): Promise<ApiResponse<SignupResult>>;
  /** P9 passwordless — ask for a sign-in email. Enumeration-safe: always succeeds.
      `termsVersion` rides the token so the tick is the timestamp, not the click. */
  requestMagicLink(email: string, name?: string, termsVersion?: string): Promise<ApiResponse<{ expires_in_minutes?: number }>>;
  /** `GET /terms` — public, no session: what the door shows and which version it agrees to. */
  getTerms(): Promise<ApiResponse<Record<string, unknown>>>;
  /** `POST /account/terms/accept` — the way out of the gate. Refuses a bundle outside the accepted set. */
  acceptTerms(termsVersion: string): Promise<ApiResponse<{ success?: boolean; error?: string }>>;
  /** P9 passwordless — redeem the emailed token (the mobile pattern: the app
      validates via API). Creates the account when the email is new. */
  validateMagicLink(token: string): Promise<ApiResponse<MagicLinkSession>>;
  /** P9 — durable custody of the session: mint the plugin token in-flow. */
  createPluginToken(label: string): Promise<ApiResponse<{ token?: string; token_id?: string }>>;
  /** P8.7 — the card's "yes, that's them" (identity_status → confirmed). */
  confirmIdentity(relationshipId: string): Promise<ApiResponse<{ confirmed?: boolean }>>;
  /** Resolve a LinkedIn disambiguation. confirm/reject act on a candidate
      card; manual_url and no_linkedin act on the relationship when NONE fit —
      the "provide the URL yourself / they're not on LinkedIn" recovery. */
  resolveLinkedInSuggestion(body: Record<string, unknown>): Promise<ApiResponse>;
  /** Board perspectives — 2-3 advisor takes on an entity (parity: found missing 2026-08-21). */
  getBoardLite(entityType: CardEntityType, entityId: string): Promise<ApiResponse<BoardLiteResult>>;
  /** P9 — store the recovery-wrapped mDEK (the phrase never leaves the device). */
  setupRecovery(wrappedMdekRecovery: string): Promise<ApiResponse>;
  /** P9 — start a Google connect; the browser opens auth_url, the callback
      lands on /connected/obsidian (origin rides the OAuth state). */
  googleOAuthInit(opts?: OAuthInitOptions): Promise<ApiResponse<{ auth_url?: string }>>;
  /** Same shape for Microsoft (Outlook/Teams); origin rides the query string. */
  microsoftOAuthInit(opts?: OAuthInitOptions): Promise<ApiResponse<{ auth_url?: string }>>;
  /** Account-level background-work consent — the switch that governs whether
      Myu may use the escrowed key BETWEEN visits. A plain authenticated
      endpoint on any surface; "the ceremony is the webapp's" was a
      satellite-era myth (retired 2026-08-25). OFF is a kill switch server-side. */
  setBackgroundWorkConsent(consented: boolean): Promise<ApiResponse<{ background_work_consented?: boolean }>>;
  // ── data sources beyond OAuth (parity ledger item, 2026-08-25). IMAP and
  // CalDAV are plain credential POSTs — surface-agnostic, so the vault gets
  // the FULL control (the no-webapp-only-ceremonies rule), not a mirror.
  listGenericEmailAccounts(): Promise<ApiResponse<{ accounts?: Array<{ credential_id?: string; email?: string }> }>>;
  addImapConnection(email: string, password: string, host: string, port: number, ssl: boolean): Promise<ApiResponse>;
  testImapConnection(email: string, password: string, host: string, port: number, ssl: boolean): Promise<ApiResponse>;
  removeGenericEmailAccount(credentialId: string): Promise<ApiResponse>;
  listCalDavAccounts(): Promise<ApiResponse<{ accounts?: Array<{ credential_id?: string; email?: string; provider?: string }> }>>;
  addCalDavAccount(provider: string, email: string, password: string, caldavUrl: string): Promise<ApiResponse>;
  testCalDavConnection(provider: string, email: string, password: string, caldavUrl: string): Promise<ApiResponse>;
  removeCalDavAccount(credentialId: string): Promise<ApiResponse>;
  /** Slack connects via OAuth on the web; the vault shows status + the door. */
  getSlackConnections(): Promise<ApiResponse<{ connections?: Array<Record<string, unknown>> }>>;
  /** Zulip, same posture as Slack: OAuth-ish setup on the web, status here. */
  getZulipConnections(): Promise<ApiResponse<{ connections?: Array<Record<string, unknown>> }>>;

  // ── account surfaces the vault must not have to leave for (parity review
  // 2026-08-26). Each mirrors the webapp's call exactly — same path, same
  // method, same body — per the match-the-webapp rule.

  /** Devices holding custody of this account, and the revoke that is the
      kill switch. The plugin could always BE revoked; it could never revoke. */
  listDevices(): Promise<ApiResponse<{ devices?: Array<Record<string, unknown>> }>>;
  removeDevice(deviceId: string): Promise<ApiResponse>;
  renameDevice(deviceId: string, deviceName: string): Promise<ApiResponse>;

  /** Login aliases (V046). Verification happens by clicking an emailed link,
      so there is no verify method here — the vault cannot open mail. */
  listAccountEmails(): Promise<ApiResponse<{ emails?: Array<Record<string, unknown>> }>>;
  addAccountEmail(email: string): Promise<ApiResponse>;
  resendAccountEmail(email: string): Promise<ApiResponse>;
  removeAccountEmail(email: string): Promise<ApiResponse>;
  setPrimaryAccountEmail(email: string): Promise<ApiResponse>;

  /** Account preferences — how Myu addresses you, and its coaching stance. */
  getAccountPreferences(): Promise<ApiResponse<Record<string, unknown>>>;
  updateAccountPreferences(body: Record<string, unknown>): Promise<ApiResponse>;

  /** The irreversible one. Requires the exact confirmation string, like web. */
  deleteAccount(confirmation: string): Promise<ApiResponse>;

  // ── the person edit suite (parity review 2026-08-26) ─────────────────────
  // "Edit facts, correct inferences, never hand-edit readings" — the webapp's
  // PersonEditSheet, which had no vault story at all. Myu/People/ pages are
  // regenerated from server truth, so correcting a person in the vault has to
  // mean correcting it AT THE SOURCE; editing the file would just be
  // overwritten on the next pass.

  /** Whitelisted profile facts. Explicit null clears a nullable field. */
  updateRelationshipProfile(relationshipId: string, fields: Record<string, string | string[] | null>): Promise<ApiResponse>;
  /** 'delete' removes the memory; 'correct' keeps the original, down-weighted. */
  editRelationshipMemory(memoryId: string, action: 'delete' | 'correct', correction?: string): Promise<ApiResponse>;
  /** Archive or restore — reversible, unlike purge. */
  archiveRelationship(relationshipId: string, action: 'archive' | 'unarchive'): Promise<ApiResponse>;
  /**
   * Merge `source` INTO `target` — the web's "Merge into…" (MergePickerModal →
   * feedApi.mergeRelationships): `POST /v2/relationships/merge`, persons only,
   * never self, never the source itself. Everything about the source moves to
   * the target; the source is soft-deleted (`merged_into_id`).
   */
  mergeRelationships(sourceId: string, targetId: string, reason?: string): Promise<ApiResponse<{ success?: boolean; message?: string }>>;
  /**
   * "This is me": the person is merged into the account's self — memories,
   * threads, names — and removed from people, search and the graph. (Until
   * 2026-08-29 the backend only hid the row.)
   */
  markRelationshipAsSelf(relationshipId: string): Promise<ApiResponse<{ success?: boolean; message?: string }>>;
  /** Irreversible: the person and everything derived from them. */
  purgeRelationship(relationshipId: string): Promise<ApiResponse>;

  /** Live connection state — the settings cards must reflect what the ACCOUNT
      already has, not offer Connect… to an already-connected user. */
  googleOAuthStatus(): Promise<ApiResponse<OAuthStatusResult>>;
  /** Cold start (2026-08-30): the flags, the calendar-without-OAuth routes, the career canvas. */
  getFeatures(): Promise<ApiResponse<Record<string, unknown>>>;
  addIcalUrl(url: string): Promise<ApiResponse<{ success?: boolean; source_id?: string; events_stored?: number; error?: string }>>;
  uploadIcs(bytes: ArrayBuffer): Promise<ApiResponse<{ success?: boolean; events_stored?: number; error?: string }>>;
  /** The mail cap: read mail no older than YYYY-MM-DD (null = everything). `POST /oauth/{provider}/credential/settings` → {success, message} | {success:false, error}. */
  setMailOldestDate(provider: 'google' | 'microsoft', credentialId: string, ymd: string | null): Promise<ApiResponse<{ success?: boolean; message?: string; error?: string }>>;
  createCareerTrajectory(): Promise<ApiResponse<{ success?: boolean; composition?: CompositionSpecLite; composition_id?: string; error?: string }>>;
  microsoftOAuthStatus(): Promise<ApiResponse<OAuthStatusResult>>;

  // ── P10: the identity onboarding the WEBAPP runs (arc + moment). The server
  // is the single source of truth for whether it happened — myu_scripts flags
  // + onboarding_complete on /account/state — so every surface asks it, and
  // vault ingestion never substitutes for it.
  /** onboarding_complete + myu_scripts off the account state. */
  getAccountState(accountId: string): Promise<ApiResponse<AccountStateResult>>;
  /** Mark onboarding complete and/or merge myu_scripts flags. */
  updateAccountState(accountId: string, update: { onboardingComplete?: boolean; myuScripts?: Record<string, unknown> }): Promise<ApiResponse>;
  /** Arc, beat 1: fetch + summarize a LinkedIn profile. */
  /** `body.code` passes an EnrichLayer failure through (dead/private profile) — branch on it, never summarize it. */
  linkedinSeek(accountId: string, linkedinUrl: string): Promise<ApiResponse<{ body?: { content?: string; code?: number } }>>;
  /** Persist the linkedin public identifier on the account. */
  saveLinkedinId(accountId: string, linkedinId: string): Promise<ApiResponse>;
  /** Extract current employment from the arc source just provided. */
  queryCurrentEmployment(accountId: string, source: 'linkedin' | 'resume'): Promise<ApiResponse>;
  /** Persist the extracted employment; empty {} answer = no CURRENT role found. */
  confirmCurrentEmployment(accountId: string): Promise<ApiResponse<{ companies?: unknown[]; role?: string; company_name?: string; status?: string }>>;
  /** Arc, resume flavor: multipart upload (the web's exact form fields);
      summarize=true makes the response carry the summary the transcript shows. */
  resumeUpload(accountId: string, fileName: string, bytes: ArrayBuffer): Promise<ApiResponse<{ resume_id?: string; summary?: string }>>;
  /** Persist the uploaded resume id on the account (the web's updateAccountResume). */
  saveResumeId(accountId: string, resumeId: string): Promise<ApiResponse>;
  /** Moment, beat 2: classify "where are you right now" (server also writes the
      onboard_moment_* myu_scripts flags — attempt count included). */
  classifyCareerMoment(accountId: string, content: string): Promise<ApiResponse<MomentClassifyResult>>;
}

export interface MirrorReceipt {
  source_class?: string;
  source?: string;
  label?: string;
  occurred_at?: number;
}

export interface MirrorObservation {
  observation_id: string;
  pattern_id?: string;
  layer?: 'map' | 'observed';
  forming?: boolean;
  /** Backend-set once the user confirmed the map fit — text arrives phrased
      as settled ground, so the fit controls don't render. */
  confirmed?: boolean;
  text: string;
  receipts?: MirrorReceipt[];
}

export interface MirrorEdition {
  edition_id: string;
  period: string;
  observations: MirrorObservation[];
  generated_at: number;
}

export type PatternFeedbackEvent =
  | 'wrong'
  | 'wrong_facts'
  | 'wrong_reading'
  | 'true_drop_it'
  | 'dismissed'
  | 'correction'
  | 'confirmed';

export type CardEntityType = 'person' | 'company';

export interface MeetingNotePayload {
  /** Stable vault path. Rename mints a new meeting — recorded v1 caveat. */
  external_id: string;
  title: string;
  occurred_at_ms: number;
  /** Full markdown, verbatim — Tasks checkboxes intact. */
  content: string;
  /** Every `[[..]]` target (aliases split on |), deduped. Server caps at 50. */
  wikilink_names: string[];
}

export interface MeetingIngestAck {
  meeting_id: string;
  created: boolean;
  reextracted: boolean;
}

/** `GET /features` — the cold-start flags (all default false; absent endpoint = all off). */
export interface ColdStartFlags { split_consent: boolean; onboarding_payback: boolean; offer_block: boolean; week_state: boolean; per_card_offer: boolean; self_card_legible: boolean }
export const COLD_START_OFF: ColdStartFlags = { split_consent: false, onboarding_payback: false, offer_block: false, week_state: false, per_card_offer: false, self_card_legible: false };
export function parseColdStartFlags(data: unknown): ColdStartFlags {
  const c = (data && typeof data === 'object' ? (data as Record<string, unknown>).cold_start : null) as Record<string, unknown> | null;
  const on = (k: keyof ColdStartFlags) => c?.[k] === true;
  return { split_consent: on('split_consent'), onboarding_payback: on('onboarding_payback'), offer_block: on('offer_block'), week_state: on('week_state'), per_card_offer: on('per_card_offer'), self_card_legible: on('self_card_legible') };
}

/**
 * `GET /features` — the batched-reads flags (backend, 2026-09-03). Absent on an
 * older backend = off, and every per-item path stays as the fallback.
 */
export interface BackendFlags { today_bundle: boolean; vault_changes: boolean; entities_changed_ids: boolean; entity_changed_at: boolean; retry_after_header: boolean }
export const BACKEND_FLAGS_OFF: BackendFlags = { today_bundle: false, vault_changes: false, entities_changed_ids: false, entity_changed_at: false, retry_after_header: false };
export function parseBackendFlags(data: unknown): BackendFlags {
  const d = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
  const on = (k: keyof BackendFlags) => d?.[k] === true;
  return { today_bundle: on('today_bundle'), vault_changes: on('vault_changes'), entities_changed_ids: on('entities_changed_ids'), entity_changed_at: on('entity_changed_at'), retry_after_header: on('retry_after_header') };
}

/**
 * `GET /today/bundle` — the six Today reads in one answer. Each part is the
 * exact payload its own endpoint serves, and each is nullable: a part that
 * failed is null with its message under `errors`; the bundle itself is 200.
 */
export interface TodayBundle {
  brief?: Record<string, unknown> | null;
  events?: Record<string, unknown> | null;
  mirror?: { edition?: MirrorEdition } | null;
  weekly?: { edition?: WeeklyEdition } | null;
  loop?: { loop?: PersonalLoop | null; coupled_loops?: CoupledLoop[] } | null;
  help_queue?: { queue?: HelpMyuItem[]; total_count?: number } | null;
  server_time?: number;
  errors?: Record<string, string>;
}

/**
 * `GET /vault/changes` — everything that changed since a server time, paged.
 * Cards are the single-card payloads plus `entity_id` and `changed_at`; a card
 * that could not build is `{ success: false, error, entity_id }`. `self` and
 * `removed` ride on the first page only; a journal day can split across pages.
 */
export interface VaultChangeCard { entity_id?: string; changed_at?: number; card?: CardSpecLite; success?: boolean; error?: string }
export interface VaultChangesPage {
  server_time?: number;
  since?: number;
  self?: { card?: CardSpecLite } | null;
  people?: VaultChangeCard[];
  companies?: VaultChangeCard[];
  meetings?: Array<Record<string, unknown>>;
  journal_days?: Array<{ day?: string; entries?: Array<Record<string, unknown>> }>;
  removed?: string[];
  next_cursor?: string | null;
}

/** One service on a Google/Microsoft credential (scope-aware status). */
export interface IntegrationService { state?: Loose<'connected' | 'not_yet' | 'needs_reconnect'>; last_sync_at?: string | null; events_synced?: number | null; understood_back_to?: string | null; still_reading?: boolean; oldest_date_limit?: string | null }

export interface OAuthStatusResult {
  connected?: boolean;
  /** Emitted unconditionally by the scope-aware status: whether calendar / mail can be consented separately. */
  split_consent?: boolean;
  /** One per signed-in account; `credential_id` is what disconnect / set-primary take. */
  credentials?: Array<{ email?: string; credential_id?: string; is_primary?: boolean; status?: string; granted_scopes?: string[]; health?: Loose<'ok' | 'needs_reconnect'>; services?: { calendar?: IntegrationService; mail?: IntegrationService; meeting_notes?: IntegrationService } }>;
}

/** `mail` = Gmail only; `history` = mail + notes together; `drive` = docs. The label and the scope must agree. */
export type ScopeSet = 'calendar' | 'history' | 'all' | 'drive' | 'mail';
export interface OAuthInitOptions { scopeSet?: ScopeSet; returnTo?: string }

/** `GET /personal_loop/get` — the Today strip's read of you, and what it couples to. */
export interface PersonalLoop {
  loop_id: string;
  statement: string;
  state?: string;
  confidence?: number;
  domain?: string;
}
export interface CoupledLoop { to_loop_id?: string; type?: string; confidence?: number; other_statement?: string | null; other_domain?: string | null }
export interface FeedbackSignalBody { subject_type: string; subject_id: string; rating: 1 | -1; subject_text?: string; surface?: string; context?: Record<string, unknown> }

export interface AccountStateResult {
  onboarding_complete?: boolean;
  myu_scripts?: Record<string, unknown>;
}

export interface MomentClassifyResult {
  confidence?: number;
  moment_captured?: boolean;
}

/**
 * A trust-ladder ask riding a reply (OfferMoments.attach) — top level on every
 * response shape, re-served by GET /journal_chats while still live. Options
 * with `init` start that OAuth verbatim; options without are ANSWERS:
 * stop_asking → {offer_all_stopped: true} (show `stopped_ack`), not_now →
 * {offer_snoozed_journal: journal_id} (this conversation only), notes_none /
 * notes_transcripts → offer_notes_state "none" | "transcripts".
 */
export interface DeliveredOffer {
  /** `history` = one consent for mail+docs; `calendar` = the wedge re-offered to someone who skipped it. */
  moment?: Loose<'mail' | 'notes' | 'connect_rest' | 'history' | 'calendar'>;
  /** The user's own words earned this ask. A triggered ask outranks a stale canvas — never suppressed. */
  triggered?: boolean;
  lead?: string;
  gap_line?: string;
  trust_line?: string;
  stopped_ack?: string;
  journal_id?: string | null;
  options?: Array<{ id?: string; label?: string; init?: { provider?: string; scope_set?: string; return_to?: string } }>;
}

export interface ChatTurnResult {
  journal_id?: string;
  /** The ask this reply carries, when the server chose this moment. */
  offer?: DeliveredOffer;
  blocks: ChatBlock[];
  /** Cited sources, when the reply drew on any. */
  references?: SourceReferenceLite[];
  /** Journal entries the first reply found similar — {journal_id, content_preview}. */
  similar_entries?: Array<{ journal_id?: string; content_preview?: string }>;
  /** The reply's canvas side — mutations for the thread's composition (see composition/afterTurn.ts). */
  canvas?: CanvasReply;
}

/** What the chat sends about the canvas it can see — the web's `chatOptions`. */
export interface ChatCanvasOptions {
  /** The canvas open beside the thread; the backend mutates it instead of starting over. */
  continuesCompositionId?: string;
  /** The web's layoutMode: `journal` (no canvas showing), `dual`, `canvas`. Gates what the backend dares to put on the canvas. */
  surfaceMode?: 'journal' | 'dual' | 'canvas';
}

/**
 * The response's `content` arrives as a JSON STRING of `{content: ChatBlock[]}`
 * (sometimes nested under `journal` in dual-mode responses). One parser, both
 * endpoints — exactly the normalisation the mobile journal store does.
 */
/** `GET /feed/help-myu` — people Myu cannot place: LinkedIn matches to check, and possible duplicates. */
export type HelpMyuItem =
  | { item_type: 'linkedin_disambiguation'; relationship_id: string; display_name: string; organization?: string; suggestion_count?: number; triggered_at?: number }
  | { item_type: 'merge_candidate'; source: { relationship_id: string; display_name: string; subtitle?: string; email_primary?: string }; target: { relationship_id: string; display_name: string; subtitle?: string; email_primary?: string }; reason?: string };
export interface RelatedPerson { relationship_id: string; display_name: string; subtitle?: string; weight?: number }
export interface RelatedMemory { memory_id: string; relationship_id?: string; content?: string; memory_date?: string; memory_type?: string; source_type?: string; source_id?: string; entity_display_name?: string }
export interface SourceDetail { source_type: string; source_id: string; title: string; subtitle?: string; timestamp?: number; memories?: Array<{ memory_id: string; content: string; memory_type?: string; memory_date?: number }>; tasks?: Array<{ task_id: string; title: string; status?: string; due_date?: number }>; events?: Array<{ event_id: string; title: string; start_time?: number }> }
export interface DriveSuggestion { id: string; file_id: string; file_url?: string; file_type?: string; source_email_subject?: string; source_email_sender?: string; source_email_date?: string; meeting_likelihood_score?: number; meeting_signals?: string[] }
export interface FeedSearchResults { people?: CardSpecLite[]; companies?: CardSpecLite[]; feed_items?: Array<{ feed_item_id?: string; title?: string; summary?: string }>; total_count?: number }

export function oauthQuery(opts: OAuthInitOptions): string {
  return (opts.scopeSet ? `&scope_set=${encodeURIComponent(opts.scopeSet)}` : '') + (opts.returnTo ? `&return_to=${encodeURIComponent(opts.returnTo)}` : '');
}

/** One canvas interaction, the web's `CanvasInteractionEvent` (shared/types/composition.ts). */
export interface InteractionEvent {
  composition_id: string;
  component_id: string;
  component_type?: string;
  event_type: string;
  action_value?: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/** `POST /feedback/submit`, the web's body minus screenshots. */
export interface FeedbackBody {
  message: string;
  category: Loose<'bug' | 'feature' | 'general' | 'myu_response'>;
  rating?: 1 | -1;
  app: string;
  version: string;
  context?: Record<string, unknown>;
  /** The web's shape: the transcript as text (no screenshot from a plugin). */
  attachments?: { attached_content?: string; attached_summary?: string };
}

/** `POST /composition/action` — the union the web's executeAction reads. */
export interface CompositionActionResult {
  success?: boolean;
  response_type?: string;
  result?: string;
  message?: string;
  error?: string;
  surface_mutations?: SurfaceMutationLite[];
  composition?: CompositionSpecLite;
  summary_text?: string;
}

/** One row of `GET /composition/history` — `compositions` table columns, no spec. */
export interface CompositionHistoryRow {
  id?: string;
  composition_id?: string;
  source_flow?: string;
  summary_text?: string;
  subject_name?: string;
  component_count?: number;
  created_at?: number | string;
  updated_at?: number | string;
  is_expired?: boolean;
  /** Which conversation made this canvas, and which turn of it (backend
      2026-09-01, V077). Canvases superseded before that deploy could not be
      anchored, so `turn_number` is null for them — guard before using it. */
  journal_id?: string;
  turn_number?: number | null;
}
export interface CompositionHistory {
  compositions?: CompositionHistoryRow[];
  total?: number;
}

/**
 * One row of `GET /composition/for-journal?all=true` — every canvas a
 * conversation made, oldest turn first. No specs; those are still fetched
 * lazily, one per canvas the reader actually opens.
 */
export interface CompositionForJournalRow {
  composition_id?: string;
  turn_number?: number | null;
  summary_text?: string;
  subject_name?: string;
  source_flow?: string;
  preferred_surface?: string;
  component_count?: number;
  /** Account-wide "no longer the live canvas" — NOT "gone". Every canvas but
      the newest is expired by construction, and its spec is still fetchable. */
  is_expired?: boolean;
  created_at?: number | string;
}

/** `GET /composition/for-journal` — the web's shape, verbatim, plus `all=true`'s list. */
export interface CompositionForJournal {
  composition?: CompositionSpecLite | null;
  composition_id?: string;
  turn_number?: number;
  /** `no_thread` | `no_composition` | `composition_expired` | `encrypted_unavailable` */
  status?: string;
  /** Present only for `all=true`, and only on servers that have the flag. */
  compositions?: CompositionForJournalRow[];
  count?: number;
}

/**
 * What a RESUMED conversation shows for its canvas. Pure and exported because
 * the decision is the part worth pinning:
 *  - a live composition → the same offer row a live turn ends on (one path,
 *    one set of affordances), plus the id to open beside the thread as the
 *    web does;
 *  - a canvas that exists but cannot be read here → say so (R7: gating is
 *    visible, never silent);
 *  - none, or expired → nothing, exactly like the web closing its pane.
 *
 * Before this, a resumed conversation showed no route to its canvas at all
 * while the web showed the panel (operator, 2026-08-28).
 */
export function canvasOnResume(
  data: CompositionForJournal | null | undefined,
): { blocks: ChatBlock[]; open: string; turnNumber?: number } | { note: string } | null {
  const id = typeof data?.composition_id === 'string' ? data.composition_id : '';
  if (id && data?.composition) {
    return {
      blocks: [{ type: 'composition_offer', composition_id: id, summary_text: data.composition.summary_text ?? '' }],
      open: id,
      // WHICH reply it belongs to. A resumed conversation must put the canvas
      // beside the turn that made it, not beside the last thing said.
      ...(typeof data.turn_number === 'number' ? { turnNumber: data.turn_number } : {}),
    };
  }
  if (data?.status === 'encrypted_unavailable') {
    return { note: 'This conversation has a canvas, but its key is not available in this session.' };
  }
  return null;
}

/**
 * EVERY canvas a resumed conversation made, each with the turn it belongs to.
 *
 * `canvasOnResume` can only ever return the live one, so a conversation that
 * made four canvases came back showing one (operator, 2026-09-01: "im finding
 * myself having to click on past canvases to see the most present one").
 * `all=true` answers with all of them — expired included, because `is_expired`
 * is account-wide bookkeeping meaning "no longer the live canvas", not "gone",
 * and every canvas but the newest is expired by construction.
 *
 * A row with no turn cannot be placed: canvases superseded before V077 have no
 * record of which reply made them. The backend omits those, and if one arrives
 * anyway it is dropped rather than pinned to the wrong reply — that mistake is
 * the bug this whole path exists to fix.
 *
 * Empty for a server without the flag: it answers the single-composition shape,
 * `compositions` is absent, and the caller falls back to `canvasOnResume`.
 */
export function canvasesOnResume(
  data: CompositionForJournal | null | undefined,
): Array<{ compositionId: string; summaryText: string; turnNumber: number }> {
  if (!Array.isArray(data?.compositions)) return [];
  const out: Array<{ compositionId: string; summaryText: string; turnNumber: number }> = [];
  const seen = new Set<string>();
  for (const row of data.compositions) {
    const id = typeof row?.composition_id === 'string' ? row.composition_id : '';
    const turn = typeof row?.turn_number === 'number' ? row.turn_number : 0;
    if (!id || turn <= 0 || seen.has(id)) continue;
    seen.add(id);
    out.push({ compositionId: id, summaryText: typeof row.summary_text === 'string' ? row.summary_text : '', turnNumber: turn });
  }
  return out;
}

/** `canvas` on a dual-mode reply. Only what the pane acts on; empty ids are absent. */
function parseCanvasSide(raw: unknown): CanvasReply | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const c = raw as Record<string, unknown>;
  const nc = (c.narrative_context && typeof c.narrative_context === 'object' ? c.narrative_context : {}) as Record<string, unknown>;
  const out: CanvasReply = {};
  if (typeof c.composition_id === 'string' && c.composition_id) out.composition_id = c.composition_id;
  if (Array.isArray(c.surface_mutations)) out.surface_mutations = c.surface_mutations as SurfaceMutationLite[];
  if (typeof c.summary_text === 'string') out.summary_text = c.summary_text;
  if (typeof nc.continues_composition_id === 'string' && nc.continues_composition_id) out.continues_composition_id = nc.continues_composition_id;
  return out.composition_id || out.surface_mutations || out.continues_composition_id ? out : undefined;
}

export function parseChatTurn(data: unknown): ChatTurnResult {
  if (!data || typeof data !== 'object') return { blocks: [] };
  let record = data as Record<string, unknown>;
  // The canvas side rides on the OUTER dual-mode envelope, beside `journal`.
  const canvas = parseCanvasSide(record.canvas);
  // So does the delivered offer (top level on every shape; mirrored under `journal`).
  const offer = record.offer && typeof record.offer === 'object' ? (record.offer as DeliveredOffer) : undefined;
  if (record.journal && typeof record.journal === 'object') record = record.journal as Record<string, unknown>;

  const journalId = typeof record.journal_id === 'string' ? record.journal_id : undefined;

  let blocks: ChatBlock[] = [];
  // Citations: the backend injects [N] markers into the text and ships
  // `references` beside it — LIFTED to a sibling on the live response, INSIDE
  // the stored JSON on resume. Dropping them left bare [1] markers pointing at
  // nothing (2026-08-29); the web renders them as a Sources footer.
  let references: SourceReferenceLite[] = Array.isArray(record.references) ? (record.references as SourceReferenceLite[]) : [];
  const content = record.content;
  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content) as { content?: unknown; references?: unknown };
      if (Array.isArray(parsed.content)) blocks = parsed.content as ChatBlock[];
      if (references.length === 0 && Array.isArray(parsed.references)) references = parsed.references as SourceReferenceLite[];
    } catch {
      // Plain text response — render it as one conversational block.
      if (content.trim()) blocks = [{ type: 'conversational', text: content }];
    }
  } else if (Array.isArray(content)) {
    blocks = content as ChatBlock[];
  }
  references = references.filter((r) => r && typeof r === 'object' && (typeof r.title === 'string' || typeof r.url === 'string'));
  const similar = Array.isArray(record.similar_entries)
    ? (record.similar_entries as Array<Record<string, unknown>>).filter((e) => typeof e?.journal_id === 'string').map((e) => ({ journal_id: String(e.journal_id), content_preview: typeof e.content_preview === 'string' ? e.content_preview : undefined }))
    : [];
  const out: ChatTurnResult = { journal_id: journalId, blocks };
  if (offer) out.offer = offer;
  if (canvas) out.canvas = canvas;
  if (references.length) out.references = references;
  if (similar.length) out.similar_entries = similar;
  return out;
}

/** `GET /review/weekly` — rendered verbatim; freshness rule is the client's. */
export interface WeeklyEdition {
  edition_id?: string;
  /** ISO week, e.g. `2026-W34`. */
  period: string;
  sections: Array<{ section: string; line: string; items?: string[] }>;
  generated_at?: number;
}

export type { EntityHeadline } from '../wire';

/**
 * A structural subset of `CardSpec` (packages/shared/src/types/cards.ts). The
 * plugin renders what it recognises and ignores the rest — render-verbatim means
 * printing the backend's text, not re-deriving a schema we'd then have to keep
 * in lockstep.
 */
/** `card.mail_offer` — lead already carries the person's name; options with `init` start OAuth for that provider. */
export interface MailOffer {
  lead?: string;
  trust_line?: string;
  options?: Array<{ id?: Loose<'gmail' | 'microsoft' | 'archive' | 'imap' | 'not_now'>; label?: string; init?: { provider?: Loose<'google' | 'microsoft'>; scope_set?: Loose<ScopeSet>; return_to?: string } }>;
}

export interface CardSpecLite {
  entity_id?: string;
  header?: {
    display_name?: string;
    subtitle?: string;
    identity_status?: string;
    // Tier-2 action-row facts, populated server-side at level=read. The web
    // card renders these (EntityCardExpanded -> EntityActionsRow); the vault
    // ignored them until the 2026-08-26 parity review, which made the vault
    // page thinner than the web page on facts we already had in hand.
    // FACTS, not verdicts — so unlike health_tier they belong in frontmatter,
    // where Bases can column them (P8.1 bars verdicts, not facts).
    linkedin_url?: string;
    email_primary?: string;
    website_url?: string;
  };
  /** Person card, `per_card_offer` on and no mail source connected: the server-composed mail offer (MailOfferBuilder). Absent otherwise. */
  mail_offer?: MailOffer;
  /** Self card, `self_card_legible` on: what Myu knows, each line with its source and whether it is a fact, a read, or not yet. */
  known_facts?: Array<{ key?: string; value?: string; source?: Loose<'linkedin' | 'you' | 'calendar' | 'mail' | 'read'>; kind?: Loose<'fact' | 'read' | 'not_yet'> }>;
  sections?: Array<{
    section_id?: string;
    section_type?: string;
    title?: string;
    narrative?: string;
    /** `actionable` sections of type patterns/predictions/threads/weather get the web's per-section "Discuss with Myu". */
    actionable?: boolean;
    items?: Array<{ text?: string; date?: string; source_type?: string; source_id?: string; title?: string; subtitle?: string }>;
  }>;
}

/**
 * Account preferences, unwrapped.
 *
 * `GetAccountPreferences` answers `{ preferences: {...} }` and
 * `UpdateAccountPreferences` demands the same wrapper going the other way.
 * Reading `data` flat produced a settings form that was silently always empty
 * (2026-08-26) — the write half 400'd loudly and got caught by chain test 26,
 * the read half failed in silence and did not.
 *
 * A NAMED normalizer, exported beside the endpoint, for the same reason
 * `normalizeSection` exists: the shape is knowledge about the wire, and it
 * belongs in one place where a test can reach it — not inlined in a view
 * where it can only be verified by eye.
 *
 * Tolerates a flat response too, so a server that ever drops the wrapper
 * degrades to working rather than to blank.
 */
export function normalizePreferences(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  const envelope = data as Record<string, unknown>;
  const inner = envelope.preferences;
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    return inner as Record<string, unknown>;
  }
  return envelope;
}

export class Api implements AskMyuApi {
  constructor(private transport: Transport) {}

  exchangeToken(token: string, deviceId: string) {
    // Anonymous by construction: this call is what *mints* the session, so
    // sending a stale Authorization header would be meaningless at best.
    return this.transport.post<ExchangeResult>(
      '/account/plugin-token/exchange',
      { token, device_id: deviceId, client_version: '0.1.0' },
      { anonymous: true },
    );
  }

  escrowMDEK(mdekBase64: string, deviceId: string) {
    return this.transport.post('/account/session/escrow-key', { mdek: mdekBase64, device_id: deviceId });
  }

  storeDeviceKEK(deviceId: string, kekBase64: string, deviceName: string) {
    return this.transport.post('/account/device/kek/store', {
      device_id: deviceId,
      device_kek: kekBase64,
      device_name: deviceName,
      device_type: 'obsidian',
    });
  }

  fetchDeviceKEK(deviceId: string) {
    return this.transport.post<{ device_kek: string }>('/account/device/kek/get', { device_id: deviceId });
  }

  requestDeviceTransfer(deviceId: string, publicKey: string, deviceName: string) {
    return this.transport.post<TransferRequestResult>('/account/device/transfer-request', {
      device_id: deviceId,
      public_key: publicKey,
      device_name: deviceName,
      device_type: 'obsidian',
    });
  }

  getPendingTransfers() {
    return this.transport.get<{ pending_requests?: PendingTransfer[] }>('/account/device/transfer-pending');
  }

  approveDeviceTransfer(requestId: string, verificationCode: string, encryptedMdek: string) {
    return this.transport.post('/account/device/transfer-approve', {
      request_id: requestId,
      verification_code: verificationCode,
      encrypted_mdek: encryptedMdek,
    });
  }

  denyDeviceTransfer(requestId: string) {
    return this.transport.post('/account/device/transfer-deny', { request_id: requestId });
  }

  pollDeviceTransfer(requestId: string) {
    // GET + query param — the deployed endpoint both existing clients poll
    // (web backendMethods.pollTransferStatus / mobile pollTransferStatus), not
    // POST + body (REVIEW C1).
    return this.transport.get<TransferStatusResult>(
      `/account/device/transfer-receive?request_id=${encodeURIComponent(requestId)}`
    );
  }

  fetchRecoveryWrappedMDEK() {
    // GET, not POST — RecoveryRetrieve's securityPass accepts only GET (the
    // transfer-receive lesson again; POSTed here unlived-in since P0 and the
    // live suite caught it 2026-08-22).
    return this.transport.get<{ wrapped_mdek_recovery: string }>('/account/recovery/wrapped-key');
  }

  upsertJournal(payload: EncryptedJournalPayload) {
    // Goes through postJournal — the only door with the plaintext assertion on it.
    // /journal/add is CreateJournalEntry; its external_id branch is the
    // CONTRACT_OBSIDIAN.md §3 encrypted-capture upsert. (/journal/create never
    // existed — this 404'd from P0 until the 2026-08-19 review, masked by MockApi.)
    return this.transport.postJournal<JournalUpsertResult>('/journal/add', payload);
  }

  getBrief() {
    // GET, not POST: GetBriefServlet.securityPass allows only GET, so a POST
    // 403s and the brief silently never loads (shape audit, 2026-08-25 — same
    // class as the magic-link GET bug).
    return this.transport.get('/feed/brief');
  }

  getCalendarEvents(start: string, end: string) {
    return this.transport.post('/calendar/events', { start_date: start, end_date: end });
  }

  listEntities(tab: CardEntityType, opts: { changedSince?: number } = {}) {
    // The same ranked list the mobile People/Companies tabs and the web entity
    // panel use — people and companies both, so the lookup covers both.
    // `changed_since` (server ms) filters server-side, before sentence generation.
    const since = opts.changedSince && opts.changedSince > 0 ? `&changed_since=${opts.changedSince}` : '';
    return this.transport.get<{ entities?: EntityHeadline[]; server_time?: number }>(
      `/feed/entities?tab=${tab === 'company' ? 'companies' : 'people'}${since}`,
    );
  }

  getTodayBundle(start: string, end: string, timezone: string) {
    return this.transport.get<TodayBundle>(
      `/today/bundle?start_date=${encodeURIComponent(start)}&end_date=${encodeURIComponent(end)}&timezone=${encodeURIComponent(timezone)}`,
    );
  }

  getVaultChanges(since: number, cursor: string | null = null, pageSize = 50) {
    const q = [`since=${Math.max(0, Math.floor(since))}`, `page_size=${pageSize}`, ...(cursor ? [`cursor=${encodeURIComponent(cursor)}`] : [])].join('&');
    return this.transport.get<VaultChangesPage>(`/vault/changes?${q}`);
  }

  getCard(entityType: CardEntityType, entityId: string) {
    // `level=read` is the card the other surfaces open with — the read, not the
    // deep dive. Editing lives on the web (FULL VIEW → WEB). Person and company
    // return the same spec shape, so one renderer serves both.
    return this.transport.get<{ card?: CardSpecLite; response_type?: string; suggestions?: Array<Record<string, unknown>>; linkedin_known?: boolean }>(
      `/card/${entityType}?entity_id=${encodeURIComponent(entityId)}&level=read`,
    );
  }

  getMeetingPrep(eventId: string) {
    return this.transport.get<{ prep?: PrepPayload }>(`/prep/meeting?event_id=${encodeURIComponent(eventId)}`);
  }

  linkPrepSubject(eventId: string, relationshipId: string) {
    return this.transport.post('/prep/subject/link', { event_id: eventId, relationship_id: relationshipId });
  }

  searchEntities(query: string) {
    return this.transport.get<{ results?: EntityHeadline[] }>(
      `/feed/entities/search?query=${encodeURIComponent(query)}`,
    );
  }

  getWeeklyReview() {
    return this.transport.get<{ edition?: WeeklyEdition }>('/review/weekly');
  }

  ingestMeetingNote(payload: MeetingNotePayload) {
    return this.transport.post<MeetingIngestAck>('/meetings/ingest_note', payload as unknown as Record<string, unknown>);
  }

  getComposition(compositionId: string) {
    return this.transport.get<{ composition?: CompositionSpecLite }>(
      `/composition?id=${encodeURIComponent(compositionId)}`,
    );
  }

  executeCompositionAction(compositionId: string, componentId: string, action: string, params?: Record<string, unknown>) {
    return this.transport.post<CompositionActionResult>('/composition/action', {
      composition_id: compositionId,
      component_id: componentId,
      action,
      params,
    });
  }

  persistCompositionMutations(compositionId: string, mutations: SurfaceMutationLite[]) {
    return this.transport.post<{ success?: boolean; snapshot_id?: string }>('/composition/mutate', {
      composition_id: compositionId,
      mutations,
    });
  }

  requestDataExport() {
    return this.transport.post<{ success?: boolean; export_id?: string; passphrase?: string; error?: string; message?: string }>('/account/data/export-request', {});
  }

  postCompositionInteraction(events: InteractionEvent[], generateResponse: boolean) {
    return this.transport.post<{ success?: boolean; ack?: boolean; response_generating?: boolean; responses?: Array<Record<string, unknown>> }>('/composition/interaction', { events, timing: {}, generate_response: generateResponse });
  }

  getHelpMyuQueue() { return this.transport.get<{ queue?: HelpMyuItem[]; total_count?: number }>('/feed/help-myu'); }
  getRelatedPersons(relationshipId: string, limit = 5) { return this.transport.get<{ related?: RelatedPerson[] }>(`/feed/related-persons?relationship_id=${encodeURIComponent(relationshipId)}&limit=${limit}`); }
  getRelatedMemories(relationshipId: string, limit = 5) { return this.transport.get<{ related?: RelatedMemory[] }>(`/feed/related-memories?relationship_id=${encodeURIComponent(relationshipId)}&limit=${limit}`); }
  getEntityDispatch(entityType: CardEntityType, entityId: string) { return this.transport.get<{ dispatch_sentence?: string; dispatch_category?: string; dispatch_receipt?: Record<string, unknown> }>(`/feed/entities/dispatch?entity_type=${encodeURIComponent(entityType)}&entity_id=${encodeURIComponent(entityId)}`); }
  dismissEntityDispatch(entityId: string, signalFingerprint: string, category?: string) { return this.transport.post('/feed/entities/dismiss', { entity_id: entityId, signal_fingerprint: signalFingerprint, ...(category ? { category } : {}) }); }
  searchFeed(q: string, limit = 10) { return this.transport.get<{ results?: FeedSearchResults }>(`/feed/search?q=${encodeURIComponent(q)}&types=all&limit=${limit}`); }
  getSourceDetail(sourceType: string, sourceId: string) { return this.transport.get<{ detail?: SourceDetail; error?: string }>(`/card/source-detail?source_type=${encodeURIComponent(sourceType)}&source_id=${encodeURIComponent(sourceId)}`); }
  setRelationshipLinkedIn(relationshipId: string, linkedinUrl: string | null) { return this.transport.post<{ success?: boolean; error?: string }>(`/v2/relationships/linkedin/${encodeURIComponent(relationshipId)}`, { linkedin_url: linkedinUrl }); }
  rejectMerge(sourceId: string, targetId: string) { return this.transport.post<{ success?: boolean }>('/relationships/merge', { source_id: sourceId, target_id: targetId, action: 'reject' }); }
  addMeetingDecision(meetingId: string, content: string) { return this.transport.post<{ success?: boolean; decision_id?: string }>('/meetings/add-decision', { meeting_id: meetingId, content }); }
  addMeetingCommitment(meetingId: string, content: string, commitmentType = 'action_item', owner?: string) { return this.transport.post<{ success?: boolean; commitment_id?: string }>('/meetings/add-commitment', { meeting_id: meetingId, content, commitment_type: commitmentType, ...(owner ? { owner } : {}) }); }
  getDriveSuggestions(limit = 10) { return this.transport.get<{ suggestions?: DriveSuggestion[]; count?: number }>(`/meetings/drive/suggestions?limit=${limit}`); }
  importFromDrive(fileIds: string[]) { return this.transport.post<{ success?: boolean; error?: string; message?: string; results?: Array<{ file_id: string; status: string; meeting_id?: string; title?: string; message?: string }>; imported_count?: number }>('/meetings/import/drive', { file_ids: fileIds }); }
  dismissDriveSuggestion(id: string) { return this.transport.post('/meetings/drive/suggestions', { id, action: 'dismiss' }); }

  googleOAuthDisconnect(credentialId: string) { return this.transport.post<{ success?: boolean; message?: string; error?: string }>('/oauth/google/disconnect', { credential_id: credentialId }); }
  googleSetPrimaryCredential(credentialId: string) { return this.transport.post<{ success?: boolean; message?: string; error?: string }>('/oauth/google/credential/set-primary', { credential_id: credentialId }); }
  microsoftOAuthDisconnect(credentialId: string) { return this.transport.post<{ success?: boolean; message?: string; error?: string }>('/oauth/microsoft/disconnect', { credential_id: credentialId }); }
  microsoftSetPrimaryCredential(credentialId: string) { return this.transport.post<{ success?: boolean; message?: string; error?: string }>('/oauth/microsoft/credential/set-primary', { credential_id: credentialId }); }
  slackConnect() { return this.transport.post<{ authorization_url?: string; state?: string }>('/slack/connect', {}); }
  slackDisconnect(connectionId: string) { return this.transport.post<{ success?: boolean; message?: string }>('/slack/disconnect', { connection_id: connectionId }); }
  zulipConnect(realmUrl: string, email: string, apiKey: string) { return this.transport.post<{ success?: boolean; connection_id?: string; realm_name?: string; error?: string }>('/zulip/connect', { realm_url: realmUrl, email, api_key: apiKey }); }
  zulipDisconnect(connectionId: string) { return this.transport.post<{ success?: boolean; message?: string }>('/zulip/disconnect', { connection_id: connectionId }); }
  updateAccountName(accountId: string, name: string) { return this.transport.post<{ success?: boolean; message?: string }>('/account/update', { account_id: accountId, name }); }
  getAccountCareer(accountId: string) { return this.transport.get<{ status?: string; summary?: string; resume_summary?: string; linkedin_data_id?: string; linkedin_id?: string }>(`/account/career?account_id=${encodeURIComponent(accountId)}`); }
  getPersonalLoop() { return this.transport.get<{ loop?: PersonalLoop | null; coupled_loops?: CoupledLoop[] }>('/personal_loop/get'); }
  submitFeedbackSignal(body: FeedbackSignalBody) { return this.transport.post<{ success?: boolean; signal_id?: string }>('/feedback/signal', body as unknown as Record<string, unknown>); }

  submitFeedback(body: FeedbackBody) {
    return this.transport.post<{ success?: boolean; message?: string; error?: string; retry_after_minutes?: number }>('/feedback/submit', body as unknown as Record<string, unknown>);
  }

  refreshComposition(compositionId: string) {
    return this.transport.post<{ composition?: CompositionSpecLite; composition_id?: string; success?: boolean; error?: string }>('/composition/refresh', { composition_id: compositionId });
  }

  getCompositionHistory(limit = 20) {
    return this.transport.get<CompositionHistory>(`/composition/history?limit=${limit}&offset=0`);
  }

  getCompositionForJournal(journalId: string) {
    // The web's exact request: GET, `journal_id` in the query. The servlet is
    // GET-gated (securityPass) and 400s without the parameter.
    return this.transport.get<CompositionForJournal>(
      `/composition/for-journal?journal_id=${encodeURIComponent(journalId)}`,
    );
  }

  /** Every canvas this conversation made, oldest turn first (backend 2026-09-01).
      A server without the flag ignores it and answers the single-composition
      shape, which `canvasesOnResume` reads as "none" so the caller falls back. */
  getCompositionsForJournal(journalId: string) {
    return this.transport.get<CompositionForJournal>(
      `/composition/for-journal?journal_id=${encodeURIComponent(journalId)}&all=true`,
    );
  }

  async createChatEntry(accountId: string, content: string, context?: ChatContext, templateType?: string, canvas?: ChatCanvasOptions) {
    const body: Record<string, unknown> = { account_id: accountId, content, surface_mode: canvas?.surfaceMode ?? 'journal' };
    if (canvas?.continuesCompositionId) body.continues_composition_id = canvas.continuesCompositionId;
    if (templateType) body.template_type = templateType;
    if (context) {
      body.feed_context = context;
      body.context_injection = context;
    }
    const res = await this.transport.post('/journal/add', body);
    return { ...res, data: res.ok ? parseChatTurn(res.data) : null };
  }

  async addChatTurn(accountId: string, journalId: string, content: string, context?: ChatContext, canvas?: ChatCanvasOptions) {
    const body: Record<string, unknown> = {
      account_id: accountId,
      chatter_id: accountId,
      journal_id: journalId,
      content,
      // The web sends its layoutMode and the canvas it has open; without them
      // the backend gates canvas content as if no canvas could show it.
      surface_mode: canvas?.surfaceMode ?? 'journal',
    };
    if (canvas?.continuesCompositionId) body.continues_composition_id = canvas.continuesCompositionId;
    if (context) {
      body.feed_context = context;
      body.context_injection = context;
    }
    const res = await this.transport.post('/journal_chats/add', body);
    return { ...res, data: res.ok ? parseChatTurn(res.data) : null };
  }

  getMirrorEdition() {
    return this.transport.get<{ edition?: MirrorEdition }>('/initiative/mirror');
  }

  submitPatternFeedback(eventType: PatternFeedbackEvent, patternId: string, sourceSurface: string) {
    return this.transport.post('/initiative/pattern-feedback/submit', {
      event_type: eventType,
      pattern_id: patternId,
      source_surface: sourceSurface,
    });
  }

  vaultInteraction(events: VaultInteractionEvent[]) {
    return this.transport.post<{ results?: VaultInteractionResult[] }>('/vault/interaction', { events });
  }

  listVaultCommitments() {
    return this.transport.post<{ commitments?: VaultCommitment[] }>('/vault/commitments', {});
  }

  async createAccount(email: string, name: string, password: string, termsVersion?: string) {
    // CreateAccount returns the account object with `autoken` (the session) —
    // signup IS the first session, no separate login round-trip.
    const res = await this.transport.post<{ account?: SignupResult } & SignupResult>('/account/create', {
      email,
      name,
      password,
      client: 'obsidian',
      ...(termsVersion ? { terms_version: termsVersion } : {}),
    });
    const flat = res.data?.account ?? res.data ?? null;
    return { ...res, data: flat ? { autoken: flat.autoken, account_id: flat.account_id } : null };
  }

  createPluginToken(label: string) {
    return this.transport.post<{ token?: string; token_id?: string }>('/account/plugin-token/create', {
      label,
      client: 'obsidian',
    });
  }

  requestMagicLink(email: string, name?: string, termsVersion?: string) {
    // `client: 'obsidian'` marks the token's origin server-side: the landing
    // page grows an "Open in Obsidian" button and browser fallbacks land on
    // /connected/obsidian. Anonymous — there is no session yet.
    // `terms_version` rides the token too: the account is minted when the
    // link is clicked, hours later on another device, and the acceptance is
    // recorded as of the tick (2026-09-02).
    return this.transport.post<{ expires_in_minutes?: number }>(
      '/auth/magic-link/request',
      { email, name, client: 'obsidian', ...(termsVersion ? { terms_version: termsVersion } : {}) },
      { anonymous: true },
    );
  }

  getTerms() {
    // Public and pre-session: the Create-account door has no /features yet.
    return this.transport.get<Record<string, unknown>>('/terms');
  }

  acceptTerms(termsVersion: string) {
    return this.transport.post<{ success?: boolean; error?: string }>('/account/terms/accept', { terms_version: termsVersion, client: 'obsidian' });
  }

  validateMagicLink(token: string) {
    // GET, not POST: ValidateMagicLink.securityPass allows only GET (it is a
    // link a mail client opens). The X-Client-Type header still selects JSON
    // mode (session in the body, no cookie/redirect) — the same door the
    // mobile app uses. POSTing here 403s at BaseServlet before the servlet
    // ever runs — dead-from-birth until chain test 19 (2026-08-23), the same
    // lesson as /journal/create and transfer-receive: a path is only real
    // once a test has walked it against the real backend.
    return this.transport.get<MagicLinkSession>(
      `/auth/magic-link/validate?token=${encodeURIComponent(token)}`,
      { headers: { 'X-Client-Type': 'obsidian' } },
    );
  }

  resolveLinkedInSuggestion(body: Record<string, unknown>) {
    return this.transport.post('/v2/relationships/linkedin/suggestion/resolve', body);
  }

  confirmIdentity(relationshipId: string) {
    return this.transport.post<{ confirmed?: boolean }>('/card/identity/confirm', {
      relationship_id: relationshipId,
    });
  }

  getBoardLite(entityType: CardEntityType, entityId: string) {
    return this.transport.post<BoardLiteResult>('/card/board-lite', {
      entity_type: entityType,
      entity_id: entityId,
    });
  }

  setupRecovery(wrappedMdekRecovery: string) {
    return this.transport.post('/account/recovery/setup', {
      wrapped_mdek_recovery: wrappedMdekRecovery,
    });
  }

  googleOAuthInit(opts: OAuthInitOptions = {}) {
    // POST like the web client; `origin` rides the query string because the
    // servlet is a BaseServlet reading request parameters, not a JSON body.
    // scope_set / return_to too — Microsoft's servlet reads query ONLY, so both
    // providers get them the same way. `origin=obsidian` lands on
    // /connected/obsidian regardless of return_to (OAuthLanding).
    return this.transport.post<{ auth_url?: string }>(`/oauth/google/init?origin=obsidian${oauthQuery(opts)}`, {});
  }

  setMailOldestDate(provider: 'google' | 'microsoft', credentialId: string, ymd: string | null) {
    return this.transport.post<{ success?: boolean; message?: string; error?: string }>(`/oauth/${provider}/credential/settings`, { credential_id: credentialId, mail_oldest_date: ymd });
  }

  microsoftOAuthInit(opts: OAuthInitOptions = {}) {
    return this.transport.post<{ auth_url?: string }>(`/oauth/microsoft/init?origin=obsidian${oauthQuery(opts)}`, {});
  }

  getFeatures() { return this.transport.get<Record<string, unknown>>('/features'); }
  addIcalUrl(url: string) { return this.transport.post<{ success?: boolean; source_id?: string; events_stored?: number; error?: string }>('/calendar/ical/add', { url }); }
  uploadIcs(bytes: ArrayBuffer) {
    // The servlet takes a raw body with a non-multipart content type — no hand-built multipart needed.
    return this.transport.postRaw<{ success?: boolean; events_stored?: number; error?: string }>('/calendar/ics/upload', bytes, 'text/calendar');
  }
  createCareerTrajectory() { return this.transport.post<{ success?: boolean; composition?: CompositionSpecLite; composition_id?: string; error?: string }>('/composition/career-trajectory', { entity_type: 'self' }); }

  getRelationshipMemories(relationshipId: string, limit = 50) {
    return this.transport.get<{ memories?: Record<string, unknown> }>(
      `/memories/relationship/${encodeURIComponent(relationshipId)}?source_type=all&limit=${limit}`,
    );
  }

  getSelfCard() {
    return this.transport.get<{ card?: CardSpecLite }>('/card/self');
  }

  getMeetingDetail(meetingId: string) {
    return this.transport.get<{ meeting?: Record<string, unknown>; key_points?: unknown; decisions?: unknown; commitments?: unknown }>(`/meetings/get?meeting_id=${encodeURIComponent(meetingId)}`);
  }

  listMeetings(limit: number, offset: number) {
    return this.transport.get<{ meetings?: Array<Record<string, unknown>>; count?: number; has_more?: boolean }>(
      `/meetings/list?limit=${limit}&offset=${offset}`,
    );
  }

  getJournalChats(journalId: string) {
    return this.transport.get<{ chats?: Array<Record<string, unknown>>; offer?: DeliveredOffer }>(`/journal_chats/get?journal_id=${encodeURIComponent(journalId)}`);
  }

  getJournalEntries(accountId: string, startMs: number, endMs: number) {
    return this.transport.get<{ entries?: Array<Record<string, unknown>> }>(
      `/journal/get?account_id=${encodeURIComponent(accountId)}&start_date=${startMs}&end_date=${endMs}`,
    );
  }

  setBackgroundWorkConsent(consented: boolean) {
    return this.transport.post<{ background_work_consented?: boolean }>('/account/background-work/set', { consented });
  }

  listGenericEmailAccounts() {
    return this.transport.get<{ accounts?: Array<{ credential_id?: string; email?: string }> }>('/email/generic/list');
  }

  addImapConnection(email: string, password: string, host: string, port: number, ssl: boolean) {
    return this.transport.post('/email/generic/add', { email, password, protocol: 'imap', incoming_host: host, incoming_port: port, incoming_ssl: ssl });
  }

  testImapConnection(email: string, password: string, host: string, port: number, ssl: boolean) {
    return this.transport.post('/email/generic/test', { email, password, protocol: 'imap', incoming_host: host, incoming_port: port, incoming_ssl: ssl });
  }

  removeGenericEmailAccount(credentialId: string) {
    return this.transport.post('/email/generic/remove', { credential_id: credentialId });
  }

  listCalDavAccounts() {
    return this.transport.get<{ accounts?: Array<{ credential_id?: string; email?: string; provider?: string }> }>('/calendar/caldav/list');
  }

  addCalDavAccount(provider: string, email: string, password: string, caldavUrl: string) {
    return this.transport.post('/calendar/caldav/add', { provider, email, password, caldav_url: caldavUrl });
  }

  testCalDavConnection(provider: string, email: string, password: string, caldavUrl: string) {
    return this.transport.post('/calendar/caldav/test', { provider, email, password, caldav_url: caldavUrl });
  }

  removeCalDavAccount(credentialId: string) {
    return this.transport.post('/calendar/caldav/remove', { credential_id: credentialId });
  }

  getSlackConnections() {
    return this.transport.get<{ connections?: Array<Record<string, unknown>> }>('/slack/connections');
  }

  getZulipConnections() {
    return this.transport.get<{ connections?: Array<Record<string, unknown>> }>('/zulip/connections');
  }

  // ── account surfaces (parity review 2026-08-26) ──────────────────────────
  // Paths and methods copied from packages/web/src/lib/backendMethods.ts and
  // accountEmailsApi.ts, then checked against each servlet's securityPass:
  // /account/devices and /account/emails/list are GET-only in web's usage;
  // DeviceRemove and AccountDelete gate on POST explicitly.

  listDevices() {
    return this.transport.get<{ devices?: Array<Record<string, unknown>> }>('/account/devices');
  }

  removeDevice(deviceId: string) {
    return this.transport.post('/account/device/remove', { device_id: deviceId });
  }

  renameDevice(deviceId: string, deviceName: string) {
    return this.transport.post('/account/device/rename', { device_id: deviceId, device_name: deviceName });
  }

  listAccountEmails() {
    return this.transport.get<{ emails?: Array<Record<string, unknown>> }>('/account/emails/list');
  }

  addAccountEmail(email: string) {
    return this.transport.post('/account/emails/add', { email });
  }

  resendAccountEmail(email: string) {
    return this.transport.post('/account/emails/resend', { email });
  }

  removeAccountEmail(email: string) {
    return this.transport.post('/account/emails/remove', { email });
  }

  setPrimaryAccountEmail(email: string) {
    return this.transport.post('/account/emails/set-primary', { email });
  }

  getAccountPreferences() {
    // GET, matching web (backendMethods.ts :5444). The servlet inherits the
    // permissive default, so the method is the webapp's convention, not a gate.
    return this.transport.get<Record<string, unknown>>('/account/preferences/get');
  }

  updateAccountPreferences(body: Record<string, unknown>) {
    // The fields go INSIDE a `preferences` wrapper — the servlet 400s with
    // "Missing 'preferences' object" otherwise. Caught by chain test 26 on
    // 2026-08-26; I had matched the path and the method but not the body,
    // which is the same half-read that produced the earlier shape bugs.
    return this.transport.post('/account/preferences/update', { preferences: body });
  }

  deleteAccount(confirmation: string) {
    // `immediate: true` mirrors DeleteAccountModal — the web flow does not
    // offer the scheduled variant either.
    return this.transport.post('/account/delete', { confirmation, immediate: true });
  }

  // ── person edit suite. Bodies copied from web's experimentsBackendMethods.
  updateRelationshipProfile(relationshipId: string, fields: Record<string, string | string[] | null>) {
    return this.transport.post('/v2/relationships/profile/update', { relationship_id: relationshipId, fields });
  }

  editRelationshipMemory(memoryId: string, action: 'delete' | 'correct', correction?: string) {
    return this.transport.post('/v2/relationships/memories/edit', {
      memory_id: memoryId,
      action,
      ...(correction ? { correction } : {}),
    });
  }

  mergeRelationships(sourceId: string, targetId: string, reason = 'user_initiated_merge') {
    return this.transport.post<{ success?: boolean; message?: string }>('/v2/relationships/merge', { source_id: sourceId, target_id: targetId, reason });
  }

  markRelationshipAsSelf(relationshipId: string) {
    return this.transport.post<{ success?: boolean; message?: string }>('/experiments/relationships/mark-as-self', { relationship_id: relationshipId });
  }

  archiveRelationship(relationshipId: string, action: 'archive' | 'unarchive') {
    return this.transport.post('/relationships/archive', { relationship_id: relationshipId, action });
  }

  purgeRelationship(relationshipId: string) {
    // `confirm: true` is required server-side — the servlet refuses without it.
    return this.transport.post('/v2/relationships/purge', { relationship_id: relationshipId, confirm: true });
  }

  googleOAuthStatus() {
    return this.transport.get<OAuthStatusResult>('/oauth/google/status');
  }

  microsoftOAuthStatus() {
    return this.transport.get<OAuthStatusResult>('/oauth/microsoft/status');
  }

  // ── P10: onboarding (mirrors the web's OnboardingChat calls exactly) ───────

  getAccountState(accountId: string) {
    return this.transport.get<AccountStateResult>(`/account/state/check?account_id=${encodeURIComponent(accountId)}`);
  }

  updateAccountState(accountId: string, update: { onboardingComplete?: boolean; myuScripts?: Record<string, unknown> }) {
    const body: Record<string, unknown> = { account_id: accountId };
    if (update.onboardingComplete !== undefined) body.onboarding_complete = update.onboardingComplete;
    if (update.myuScripts) body.myu_scripts = update.myuScripts;
    return this.transport.post('/account/state/update', body);
  }

  linkedinSeek(accountId: string, linkedinUrl: string) {
    const qs = `?account_id=${encodeURIComponent(accountId)}&summarize=true&regenerate=false&linkedin_url=${encodeURIComponent(linkedinUrl)}`;
    return this.transport.get<{ body?: { content?: string; code?: number } }>(`/linkedin/seek${qs}`);
  }

  saveLinkedinId(accountId: string, linkedinId: string) {
    return this.transport.post('/account/career/update', { account_id: accountId, linkedin_id: linkedinId });
  }

  queryCurrentEmployment(accountId: string, source: 'linkedin' | 'resume') {
    return this.transport.get(`/onboard/current_employment?account_id=${encodeURIComponent(accountId)}&source=${source}`);
  }

  confirmCurrentEmployment(accountId: string) {
    // The response IS the employment object (companies[]/role/company_name),
    // not wrapped in `.employment` — audit 2026-08-25.
    return this.transport.post<{ companies?: unknown[]; role?: string; company_name?: string; status?: string }>('/onboard/current_employment_confirm', { account_id: accountId });
  }

  resumeUpload(accountId: string, fileName: string, bytes: ArrayBuffer) {
    // requestUrl has no FormData — assemble the multipart body by hand with
    // the SAME field names the web sends (file, account_id, resume_name,
    // summarize). Boundary is fixed-random-enough for a private API call.
    const boundary = `----myu${Math.random().toString(36).slice(2)}`;
    const enc = new TextEncoder();
    const ext = fileName.toLowerCase().split('.').pop() ?? '';
    const mime = { pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', txt: 'text/plain' }[ext] ?? 'application/octet-stream';
    const parts: Uint8Array[] = [];
    const push = (text: string) => parts.push(enc.encode(text));
    push(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${mime}\r\n\r\n`);
    parts.push(new Uint8Array(bytes));
    push('\r\n');
    for (const [name, value] of [['account_id', accountId], ['resume_name', fileName], ['summarize', 'true']]) {
      push(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);
    }
    push(`--${boundary}--\r\n`);
    const body = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let offset = 0;
    for (const p of parts) { body.set(p, offset); offset += p.length; }
    return this.transport.postRaw<{ resume_id?: string; summary?: string }>('/resume/upload', body.buffer, `multipart/form-data; boundary=${boundary}`);
  }

  saveResumeId(accountId: string, resumeId: string) {
    return this.transport.post('/account/career/update', { account_id: accountId, resume_id: resumeId });
  }

  classifyCareerMoment(accountId: string, content: string) {
    return this.transport.post<MomentClassifyResult>('/onboard/classify_career_moment', { account_id: accountId, content });
  }
}
