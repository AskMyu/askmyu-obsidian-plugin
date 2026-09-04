/**
 * askMyu — Obsidian plugin. The spine: lifecycle, wiring, and nothing clever.
 *
 * What lives here and why it is small: every hard decision is in a module with a
 * header explaining it (transport = the encryption chokepoint, UnlockMachine =
 * split custody, CaptureService = the watcher gate). This file's job is to hold
 * them together and to be readable by a reviewer deciding whether to trust the
 * plugin — the listing promises an open-source client, and this is the file they
 * will open first.
 *
 * Runs on desktop and mobile alike: no Electron-only API, no Node, no
 * `safeStorage`, no assumption of a resident process. Everything must survive
 * `kill -9`, because Linux has no tray and Android will kill us whenever it
 * likes.
 */

import { Plugin, TAbstractFile, TFile, WorkspaceLeaf, Platform } from 'obsidian';
import { AskMyuSettingTab } from './views/SettingsTab';
import { TodayView, TODAY_VIEW_TYPE } from './views/TodayView';
import { CardView, CARD_VIEW_TYPE } from './views/CardView';
import { PrepView, PREP_VIEW_TYPE } from './views/PrepView';
import { LookupModal } from './views/LookupModal';
import { WeeklyReviewModal } from './views/WeeklyReviewModal';
import { WeeklyReviewWriter, editionToLines, isWeeklyEditionFresh } from './vault/WeeklyReviewWriter';
import { BackfillModal } from './views/BackfillModal';
import { ConsentModal } from './views/ConsentModal';
import { Transport } from './transport/index';
import { type PendingTransfer, Api, type AskMyuApi, type CardEntityType } from './transport/api';
import { MockApi } from './transport/mock';
import { KeyHolder, type UnlockState } from './crypto/KeyHolder';
import { generateDeviceId } from './crypto/primitives';
import { UnlockMachine } from './auth/UnlockMachine';
import { CaptureService } from './capture/CaptureService';
import { SSEClient, deriveSseUrl } from './transport/sse';
import { MeetingCapture } from './capture/MeetingCapture';
import { PersonPageIndex } from './people/PersonPageIndex';
import { MeetingConsentModal } from './views/MeetingConsentModal';
import { type CanvasWriteOutcome, CanvasExporter } from './vault/CanvasExporter';
import { shouldKeepCanvas } from './composition/keepOnce';
import { registerLiveNotices } from './liveNotices';
import { MergeIntoModal } from './views/MergeIntoModal';
import { PersonActionConfirmModal } from './views/PersonActionConfirmModal';
import { PERSON_ACTION_COPY, type PersonRef } from './views/personActions';
import { CanvasExportModal } from './views/CanvasExportModal';
import { ChatView, CHAT_VIEW_TYPE, type ChatSeed, type ChatTurn } from './views/ChatView';
import { CanvasView, CANVAS_VIEW_TYPE } from './views/CanvasView';
import type { ChatContext, SurfaceMutationLite } from './wire';
import { ConversationWriter } from './vault/ConversationWriter';
import { ExportService } from './vault/ExportService';
import { DataExportModal } from './views/DataExportModal';
import { CanvasHistoryModal } from './views/CanvasHistoryModal';
import { FeedbackModal } from './views/FeedbackModal';
import { findEverythingMyuWrote, trashEverythingMyuWrote } from './vault/removeEverything';
import { surveyLinks, type LinkedPerson } from './capture/linkSurvey';
import { FeedSearchModal } from './views/FeedSearchModal';
import { HelpMyuView, HELP_VIEW_TYPE } from './views/HelpMyuView';
import { WeaveView, WEAVE_VIEW_TYPE } from './views/WeaveView';
import { LookInstaller, LOOK_NAME, snippetSwitch } from './look';
import { WeaveSnippetModal } from './views/WeaveSnippetModal';
import { DriveImportModal } from './views/DriveImportModal';
import { COLD_START_OFF, parseColdStartFlags, parseBackendFlags, BACKEND_FLAGS_OFF, type BackendFlags, type ColdStartFlags, type HelpMyuItem, type OAuthStatusResult } from './transport/api';
import { routeOffer, addOffer, type CanvasOffer } from './composition/offers';
import { burnoutRow, goalMilestoneRow } from './views/wellbeingRows';
import { BUILD_STAMP } from './buildStamp';
import { parseTermsState, termsStateFrom428, termsStanding, termsLinks, TERMS_FALLBACK_URLS, type TermsState, type TermsStanding } from './terms';
import { revealSetting } from './views/revealSetting';
import { ConversationSaveModal } from './views/ConversationSaveModal';
import { DEFAULT_SETTINGS, normalizeSettings, type AskMyuSettings } from './settings';
import { notifyLive, notifyError, notifyStatus } from './notify';
import { MaterializationService } from './vault/MaterializationService';
import { MyuFolderWatcher } from './capture/MyuFolderWatcher';
import { MaterializeConsentModal } from './views/MaterializeConsentModal';
import { OnboardingModal } from './views/OnboardingModal';
import { SetupRecoveryModal } from './views/SetupRecoveryModal';
import { RefreshGate } from './refreshGate';

/** At most one recovery-triggered repaint this often — a server that keeps refusing must not loop the pane. */
const RECOVERY_REPAINT_MS = 30_000;

/** How often Today refreshes itself. Ambient, not live. */
const TODAY_REFRESH_MS = 5 * 60 * 1000;
/** Never two Today fetches closer than this, whatever asks — see refreshGate.ts. */
const TODAY_REFRESH_GAP_MS = 5_000;
/** How often to prove the live stream is up and re-read pending device requests. */
const LIVE_WATCHDOG_MS = 45 * 1000;

/** How often a queue left over from an offline stretch retries. */
const QUEUE_RETRY_MS = 10 * 60 * 1000;

export default class AskMyuPlugin extends Plugin {
  override settings: AskMyuSettings = { ...DEFAULT_SETTINGS };
  transport!: Transport;
  backend!: AskMyuApi;
  keys = new KeyHolder();
  unlock!: UnlockMachine;
  capture!: CaptureService;
  /** The single vault-write capability in the plugin. See the module header. */
  weeklyReview!: WeeklyReviewWriter;
  /** Live layer. Best-effort: the 5-min poll stays the floor. */
  sse = new SSEClient();
  meetingCapture!: MeetingCapture;
  canvasExporter!: CanvasExporter;
  conversationWriter!: ConversationWriter;
  exporter!: ExportService;
  /** When the last full sync finished — the Today pane says \"synced N min ago\". */
  lastSyncAt: number | null = null;
  personIndex!: PersonPageIndex;
  /** SSE-pushed initiative cues, rendered by TodayView as pane rows. */
  liveCues: Array<{ text: string; event_id?: string; received_at: number }> = [];
  /** Canvases Myu made while you were elsewhere — the web's pending offers; rows in Today and the thread. */
  pendingOffers: CanvasOffer[] = [];
  /** feed/help-myu — people Myu cannot place; rendered by Today. */
  helpQueue: HelpMyuItem[] = [];
  /** GET /features — the cold-start flags; all off until fetched. */
  flags: ColdStartFlags = COLD_START_OFF;
  /** GET /features → terms (2026-09-02): what the account has agreed to. Null until fetched, or on a backend without the gate. */
  terms: TermsState | null = null;
  /** The dismissible "terms were updated" row, dismissed for this session. */
  private termsUpdateDismissed = false;
  /** GET /oauth/google/status, cached per session — the scope-aware picture (calendar · mail · meeting notes). */
  integration: OAuthStatusResult | null = null;

  async loadFeatures(): Promise<void> {
    const res = await this.backend.getFeatures().catch(() => null);
    this.flags = res?.ok ? parseColdStartFlags(res.data) : COLD_START_OFF;
    this.backendFlags = res?.ok ? parseBackendFlags(res.data) : BACKEND_FLAGS_OFF;
    if (res?.ok) this.terms = parseTermsState(res.data);
  }

  // ── beta terms (2026-09-02) — PLAN_BETA_TERMS_ACCEPTANCE_20260901 ─────────
  // First acceptance BLOCKS (the gate, a fourth Today-pane state); a later
  // version update does not (a dismissible row). The backend enforces the gate
  // with 428 on every content call; /features is how the pane learns it first.

  termsStanding(): TermsStanding {
    return termsStanding(this.terms);
  }
  termsUpdateVisible(): boolean {
    return this.termsStanding() === 'update' && !this.termsUpdateDismissed;
  }
  dismissTermsUpdate(): void {
    this.termsUpdateDismissed = true;
    void this.refreshToday({ now: true });
  }
  termsLinkTargets(): Array<{ label: string; url: string }> {
    return termsLinks(this.terms?.urls ?? TERMS_FALLBACK_URLS);
  }
  /** The way out of the gate, and the update row's Accept. Everything that waited resumes. */
  async acceptTerms(): Promise<boolean> {
    const version = this.terms?.currentVersion;
    if (!version) return false;
    const res = await this.backend.acceptTerms(version).catch(() => null);
    if (!res?.ok) {
      notifyError('Could not record your agreement. Check the connection and try again.');
      return false;
    }
    this.termsUpdateDismissed = false;
    await this.loadFeatures();
    await this.refreshToday({ now: true });
    this.startLiveStream();
    void this.loadIntegrationStatus(true);
    void this.syncOnOpen();
    return true;
  }
  /**
   * The transport hit a wall a fresh session (401) or a fresh escrow (403 enc)
   * clears. Let the machine try; when it worked, the refused request is sent
   * again by the transport, the live stream re-opens on the new session, and
   * whatever was painted from refused answers repaints. The repaint is
   * throttled so a server that keeps refusing cannot turn recovery into a loop.
   */
  private lastRecoveryRepaint = 0;
  private async recoverSession(kind: 'session' | 'escrow'): Promise<boolean> {
    const ok = kind === 'session' ? await this.unlock.onUnauthorized() : await this.unlock.onEncryptionBlocked();
    if (!ok || this.unlock.current !== 'unlocked') return ok;
    if (kind === 'session') this.startLiveStream();
    if (Date.now() - this.lastRecoveryRepaint > RECOVERY_REPAINT_MS) {
      this.lastRecoveryRepaint = Date.now();
      this.settingTab?.refreshIfVisible();
      void this.refreshToday();
    }
    return ok;
  }
  /** A gated call answered 428: the pane shows the screen; the stream stops. */
  private onTermsRequired(body: unknown): void {
    const state = termsStateFrom428(body);
    if (!state) return;
    // Keep what /features already told us if the 428 body named no version.
    this.terms = state.currentVersion || !this.terms ? state : { ...this.terms, satisfied: false, gateEnabled: true };
    this.sse.stop();
    void this.refreshToday({ now: true });
  }
  /** The live layer, once the account may have content — never while gated. */
  private startLiveStream(): void {
    if (this.settings.use_mock_backend || this.termsStanding() === 'gated') return;
    const token = this.settings.session_token;
    const account = this.settings.account_id;
    if (!token || !account) return;
    // A 428 on the stream itself: ask /features, which names the standing, and let the pane say so.
    this.sse.onGated = () => void this.loadFeatures().then(() => this.refreshToday());
    this.sse.start(this.settings.sse_url || deriveSseUrl(this.settings.base_url, account), token);
  }
  async loadIntegrationStatus(force = false): Promise<OAuthStatusResult | null> {
    if (this.integration && !force) return this.integration;
    const res = await this.backend.googleOAuthStatus().catch(() => null);
    this.integration = res?.ok ? (res.data ?? null) : null;
    return this.integration;
  }
  /** The mail service's state across credentials — for the per-card offer. */
  mailState(): 'connected' | 'needs_reconnect' | 'not_yet' | 'none' {
    const creds = this.integration?.credentials ?? [];
    if (creds.some((c) => c.services?.mail?.state === 'connected')) return 'connected';
    if (creds.some((c) => c.services?.mail?.state === 'needs_reconnect')) return 'needs_reconnect';
    return creds.length ? 'not_yet' : 'none';
  }
  /** insight_ready, kept for Today as rows (the web's insight cards). Twelve hours, six deep. */
  liveInsights: Array<{ title: string; summary?: string; personId?: string; personName?: string; receivedAt: number }> = [];
  lastStateDetail: string | null = null;
  /** P10 — server-truth onboarding state (null = not yet fetched). The server
      tracks whether the arc/moment were captured; vault ingestion never
      substitutes, so every surface reads THESE, not local flags. */
  onboardingComplete: boolean | null = null;
  onboardingScripts: Record<string, unknown> | null = null;
  settingTab: AskMyuSettingTab | null = null;
  private statusBarEl: HTMLElement | null = null;
  private returningSetupOffered = false;
  /** P8 — the writers behind the shared surface. */
  materializer!: MaterializationService;
  /** P8 — the user's edits in Myu/, shipped back as interaction events. */
  myuWatcher!: MyuFolderWatcher;
  /** First-run choreography line, rendered by TodayView ("6 of 38 · Jim…"). */
  materializeProgress: string | null = null;
  /** The batched-reads flags from /features; off until it answers, and on an older backend. */
  backendFlags: BackendFlags = BACKEND_FLAGS_OFF;

  /**
   * P8.6 — the DOCUMENTED public surface: `app.plugins.plugins.askmyu.api`,
   * the ecosystem convention (Dataview/MetaEdit/Templater). Read-only, and
   * every call resolves null while the vault is locked — a Templater template
   * must never trigger an unlock ceremony. Everything else on this plugin
   * instance is internal and unstable; this object is the contract.
   */
  readonly api = {
    status: (): string => this.unlock?.current ?? 'disconnected',
    getBrief: async (): Promise<unknown> => {
      if (this.unlock?.current !== 'unlocked') return null;
      const res = await this.backend.getBrief();
      return res.ok ? (res.data as { brief?: unknown } | null)?.brief ?? null : null;
    },
    getPrep: async (eventId: string): Promise<unknown> => {
      if (this.unlock?.current !== 'unlocked') return null;
      const res = await this.backend.getMeetingPrep(eventId);
      return res.ok ? res.data?.prep ?? null : null;
    },
    getPersonCard: async (name: string): Promise<unknown> => {
      if (this.unlock?.current !== 'unlocked') return null;
      const search = await this.backend.searchEntities(name);
      const match = (search.data?.results ?? []).find((r) => r.entity_type === 'person');
      if (!match) return null;
      const card = await this.backend.getCard('person', match.entity_id);
      return card.ok ? card.data?.card ?? null : null;
    },
    getWeeklyReview: async (): Promise<unknown> => {
      if (this.unlock?.current !== 'unlocked') return null;
      const res = await this.backend.getWeeklyReview();
      return res.ok ? res.data?.edition ?? null : null;
    },
  };

  override async onload(): Promise<void> {
    await this.loadSettings();

    this.transport = new Transport({
      baseUrl: this.settings.base_url,
      authToken: this.settings.session_token,
      onUnauthorized: () => this.recoverSession('session'),
      onEncryptionBlocked: () => this.recoverSession('escrow'),
      onTermsRequired: (body) => this.onTermsRequired(body),
    });

    this.backend = this.settings.use_mock_backend ? new MockApi() : new Api(this.transport);

    this.unlock = new UnlockMachine({
      api: this.backend,
      keys: this.keys,
      load: () => this.settings,
      save: async (partial) => {
        Object.assign(this.settings, partial);
        await this.saveSettings();
      },
      onSession: (token) => {
        this.settings.session_token = token;
        this.transport.setAuthToken(token);
      },
      onState: (state, detail) => void this.onUnlockState(state, detail ?? null),
      onApproval: () => {
        void this.refreshToday({ now: true });
        this.settingTab?.refreshIfVisible();
      },
      deviceName: `Obsidian — ${this.app.vault.getName()}`,
      mockMode: () => this.settings.use_mock_backend,
    });

    this.capture = new CaptureService({
      app: this.app,
      api: this.backend,
      keys: this.keys,
      settings: () => this.settings,
      save: () => this.saveSettings(),
      canCapture: () => this.unlock.current === 'unlocked',
      onStatus: (status) => {
        this.lastStateDetail = status;
      },
    });

    this.weeklyReview = new WeeklyReviewWriter(this.app);

    this.personIndex = new PersonPageIndex(this.app, () => this.settings.people_folders);
    this.canvasExporter = new CanvasExporter(this.app);
    this.conversationWriter = new ConversationWriter(this.app);
    this.exporter = new ExportService(this.app, this);

    this.meetingCapture = new MeetingCapture({
      app: this.app,
      api: this.backend,
      settings: () => this.settings,
      save: () => this.saveSettings(),
      canCapture: () => this.unlock.current === 'unlocked',
      personIndex: () => this.personIndex,
    });

    this.materializer = new MaterializationService({
      contentKey: () => this.keys.get(),
      app: this.app,
      api: () => this.backend,
      settings: () => this.settings,
      save: () => this.saveSettings(),
      canRun: () => this.unlock.current === 'unlocked',
      findTheirPage: (name) => this.personIndex.find(name)?.path ?? null,
      flags: () => this.backendFlags,
      onProgress: (line) => {
        this.materializeProgress = line;
        // Paint the line; fetch only when the sweep is over and the day may have changed.
        if (line === null) void this.refreshToday();
        else this.paintProgress();
      },
    });

    this.myuWatcher = new MyuFolderWatcher({
      app: this.app,
      api: () => this.backend,
      settings: () => this.settings,
      save: () => this.saveSettings(),
      canSend: () => this.unlock.current === 'unlocked',
      onRestored: () => this.materializer.refreshCommitmentSurfaces(),
      rebaseline: (path) => this.materializer.rebaseline(path),
      onMeetingAdded: () => this.materializer.refreshHistoryIfDue(true),
    });

    this.registerView(TODAY_VIEW_TYPE, (leaf: WorkspaceLeaf) => new TodayView(leaf, this));
    this.registerView(CARD_VIEW_TYPE, (leaf: WorkspaceLeaf) => new CardView(leaf, this));
    this.registerView(PREP_VIEW_TYPE, (leaf: WorkspaceLeaf) => new PrepView(leaf, this));
    this.registerView(HELP_VIEW_TYPE, (leaf: WorkspaceLeaf) => new HelpMyuView(leaf, this));
    this.registerView(WEAVE_VIEW_TYPE, (leaf: WorkspaceLeaf) => new WeaveView(leaf, this));
    this.registerView(CHAT_VIEW_TYPE, (leaf: WorkspaceLeaf) => new ChatView(leaf, this));
    this.registerView(CANVAS_VIEW_TYPE, (leaf: WorkspaceLeaf) => new CanvasView(leaf, this));
    this.settingTab = new AskMyuSettingTab(this.app, this);
    this.addSettingTab(this.settingTab);
    this.registerCommands();

    // "Open Myu", not "Today": the ribbon names the COMPANION, the pane names
    // its current face. Reads correctly in every state — disconnected (the
    // door), locked (the honest message), unlocked (the brief).
    this.addRibbonIcon('sun', 'Open Myu', () => void this.openToday());
    // The conversation gets its own front door. Before unlock the chat can't
    // speak, so the same click lands on Today — which names the state and
    // offers the way in.
    this.addRibbonIcon('message-circle', 'Talk to Myu', () => {
      if (this.unlock.current === 'unlocked') void this.openChat({ text: '', send: false });
      else void this.openToday();
    });

    // ── native context menus (integration audit, 2026-08-24): Myu's actions
    // appear where the user's attention already is — the difference between a
    // resident and an interloper. Same handlers as the palette commands; the
    // person-card item only ON person pages, where it means something.
    this.registerEvent(
      this.app.workspace.on('editor-menu', (menu, editor, info) => {
        if (this.unlock.current !== 'unlocked') return;
        const selection = editor.getSelection().trim();
        if (selection) {
          menu.addItem((i) =>
            i.setTitle('Ask Myu about this selection').setIcon('message-circle')
              .onClick(() => void this.openChat({ text: `About this:\n\n${selection}\n\n`, send: false })),
          );
        }
        const file = info.file;
        if (file && file.extension === 'md') {
          menu.addItem((i) =>
            i.setTitle('Ask Myu about this note').setIcon('message-circle')
              .onClick(() => void this.askMyuAboutNote(file)),
          );
          if (this.personIndex.find(file.basename)) {
            menu.addItem((i) =>
              i.setTitle(`Open Myu's card for ${file.basename}`).setIcon('contact')
                .onClick(() => void this.showMyuCardFor(file)),
            );
          }
        }
      }),
    );
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (this.unlock.current !== 'unlocked') return;
        if (!(file instanceof TFile) || file.extension !== 'md') return;
        menu.addItem((i) =>
          i.setTitle('Ask Myu about this note').setIcon('message-circle')
            .onClick(() => void this.askMyuAboutNote(file)),
        );
        if (this.personIndex.find(file.basename)) {
          menu.addItem((i) =>
            i.setTitle(`Open Myu's card for ${file.basename}`).setIcon('contact')
              .onClick(() => void this.showMyuCardFor(file)),
          );
        }
        // The web's person kebab, on the person's own note (2026-08-29).
        const person = this.personOfNote(file);
        if (person) {
          menu.addSeparator();
          menu.addItem((i) => i.setTitle(`Merge ${person.name} into\u2026`).setIcon('git-merge').onClick(() => this.mergePerson(person)));
          menu.addItem((i) => i.setTitle(`${person.name} is me`).setIcon('user-check').onClick(() => this.markPersonAsSelf(person)));
          menu.addItem((i) => i.setTitle(`Archive ${person.name}`).setIcon('archive').onClick(() => void this.archivePerson(person)));
        }
      }),
    );

    // Status-bar whisper: one lowercase word of truth, click → Today. The
    // quiet-structure register applied to presence itself.
    this.statusBarEl = this.addStatusBarItem();
    this.statusBarEl.addClass('myu-statusbar');
    this.statusBarEl.onclick = () => void this.openToday();
    this.setStatusBar('disconnected', null);

    // Ambient refresh + queue drain. `registerInterval` so Obsidian tears them
    // down with the plugin — a leaked interval outlives disable and keeps
    // talking to the network, which for this plugin is a trust bug, not a leak.
    this.registerInterval(window.setInterval(() => void this.refreshToday(), TODAY_REFRESH_MS));
    // The live layer is not taken on faith: re-open a dead stream, and poll the
    // one thing that must never be missed — another device asking to join.
    this.registerInterval(window.setInterval(() => {
      if (this.unlock.current !== 'unlocked') return;
      this.ensureLiveStream();
      void this.refreshPendingTransfers();
    }, LIVE_WATCHDOG_MS));
    this.registerInterval(window.setInterval(() => void this.capture.flushQueue(), QUEUE_RETRY_MS));
    // P8 ambient: Today/Week/commitments refresh + the daily people ratchet.
    this.registerInterval(window.setInterval(() => void this.materializer.refreshAmbient(), TODAY_REFRESH_MS));
    this.registerInterval(window.setInterval(() => void this.myuWatcher.flushQueue(), QUEUE_RETRY_MS));

    // obsidian://myu | action=prep&event={id} — the deep-link
    // target for BWI-2's email CTA ("Open in Obsidian →"). Unknown actions are
    // ignored rather than erroring: an old plugin receiving a newer link should
    // do nothing, quietly.
    // One handler PER VERB — the Obsidian idiom (obsidian://ACTION?data...):
    // the action IS the URI's first segment, query params carry only data.
    // Multiplexing a verb through a query key collided with Obsidian's own
    // reserved params.action and left every branch dead from birth
    // (2026-08-25). The receipt stamp stays: it is what caught it.
    const stamp = (verb: string) => {
      this.settings.last_protocol = `${new Date().toISOString()} ${verb}`;
      void this.saveSettings();
    };
    this.registerObsidianProtocolHandler('myu', () => {
      stamp('myu');
      void this.openToday();
    });
    this.registerObsidianProtocolHandler('myu-prep', (params) => {
      stamp('myu-prep');
      if (typeof params.event === 'string' && params.event) void this.openPrep(params.event);
    });
    this.registerObsidianProtocolHandler('myu-connected', () => {
      stamp('myu-connected');
      // The /connected/obsidian landing fired us back after a Google/Microsoft
      // connect. Refresh; the calendar-fed surfaces light up on their own.
      notifyStatus('Welcome back — Myu is syncing your calendar and email now.');
      void this.loadIntegrationStatus(true).then(() => this.refreshToday({ now: true }));
      void this.openToday();
    });
    this.registerObsidianProtocolHandler('myu-card', (params) => {
      stamp('myu-card');
      // Person notes link here so the vault note reaches its interactive card
      // (the "what card pane?" gap, 2026-08-25). name resolves via the index.
      if (typeof params.name === 'string' && params.name) {
        const file = this.app.metadataCache.getFirstLinkpathDest?.(params.name, '');
        void this.showMyuCardForName(params.name, file ?? null);
      }
    });
    // obsidian://myu-canvas?id=… — a saved conversation's "open it ▸" lands
    // here: the canvas pane, in the vault, never the browser.
    this.registerObsidianProtocolHandler('myu-canvas', (params) => {
      if (typeof params.id === 'string' && params.id) void this.openCanvas(params.id);
    });
    this.registerObsidianProtocolHandler('myu-chat', (params) => {
      stamp('myu-chat');
      // The Journal notes' "continue this conversation ▸" — reopen a past
      // thread, resumable (the next send chains the same journal id).
      if (typeof params.journal === 'string' && params.journal) {
        void this.openConversation(params.journal);
      }
    });
    this.registerObsidianProtocolHandler('myu-signin', (params) => {
      stamp('myu-signin');
      // The sign-in landing's "Open in Obsidian" — emailed magic link or the
      // web-session hand-off. This IS signup when the email is new.
      if (typeof params.token === 'string' && params.token) void this.completeMagicSignup(params.token);
    });

    // Live-layer subscriptions. Cues are PANE CONTENT (invariant 4): they
    // land as rows in Today, never as popups.
    this.sse.subscribe('initiative_cue', (payload) => {
      const text = typeof payload.text === 'string' ? payload.text : null;
      if (!text) return;
      this.liveCues.push({
        text,
        event_id: typeof payload.event_id === 'string' ? payload.event_id : undefined,
        received_at: Date.now(),
      });
      // A cue is for today; a backlog of yesterday's cues is noise.
      this.liveCues = this.liveCues.filter((c) => Date.now() - c.received_at < 12 * 60 * 60 * 1000).slice(-6);
      void this.refreshToday();
    });
    this.sse.subscribe('brief_ready', () => {
      void this.refreshToday();
      // A fresh brief means the engine digested new material — pull the cheap
      // history tier now instead of waiting out the half-hour ratchet.
      void this.materializer.refreshHistoryIfDue(true);
    });
    this.sse.subscribe('brief_item_updated', () => void this.refreshToday());
    // ALWAYS KEEP, every surface (operator, 2026-08-29: "we want that"): a
    // canvas made on the web or mobile fires composition_ready here too, so
    // with the switch on, the vault catches every panel — not just the ones
    // this pane happened to open. Compositions expire server-side in ~a day;
    // this is the copy that lasts.
    // Tier A of the web's toasts — account and session events — on Notice.
    // Same events, same words (see liveNotices.ts). Cards stay in Today.
    registerLiveNotices((type, handler) => this.sse.subscribe(type, handler), {
      accountId: () => this.settings.account_id,
      // A device event also refreshes the durable row — the Notice is the fast
      // path, Today is the one that survives a missed toast.
      notify: (n) => { void this.refreshPendingTransfers(); notifyLive(n, n.action === 'open_devices' ? () => this.openSettings() : n.action === 'open_person' && n.relationshipId ? () => void this.openCard('person', n.relationshipId as string, n.personName || 'Person') : undefined); },
      openDevices: () => this.openSettings(),
      openPerson: (id, name) => void this.openCard('person', id, name),
      onRemoteLogout: () => void this.unlock.revokedRemotely(),
    });
    this.sse.subscribe('composition_ready', (payload) => {
      void this.keepCanvasIfAlwaysOn(payload.composition_id, typeof payload.summary_text === 'string' ? payload.summary_text : '');
      if (this.claimCareerCanvas(payload) && typeof payload.composition_id === 'string') {
        // The career read IS worth keeping and worth looking at — the one
        // automatic open that earns the reader's attention.
        void this.openCanvas(payload.composition_id);
        this.careerCanvasListener?.(payload.composition_id);
        return;
      }
      this.takeOffer('ready', payload);
    });
    this.sse.subscribe('composition_offer', (payload) => this.takeOffer('offer', payload));
    // The feed panel's live updates (bucket 2): the people list moved, an open
    // card's section was recomputed, a meeting's extraction finished. (The
    // wire strips these payloads to bare eventType — see the audit — so each
    // is a trigger, never a diff.)
    this.sse.subscribe('entities_changed', (payload) => {
      // With ids (backend, 2026-09-03): refetch exactly those, now; the next
      // delta pass catches what async enrichment touches later. Without: by since.
      const ids = Array.isArray(payload.entity_ids) ? payload.entity_ids.filter((id): id is string => typeof id === 'string') : [];
      if (ids.length && this.backendFlags.entities_changed_ids) void this.materializer.refreshPeopleByIds(ids);
      else void this.materializer.refreshPeople();
      void this.refreshToday();
      void this.chatView()?.revalidateLinkedInAsk();
    });
    this.sse.subscribe('personal_loop.updated', () => void this.refreshToday());
    this.sse.subscribe('insight_ready', (payload) => {
      const title = typeof payload.title === 'string' ? payload.title.trim() : '';
      if (title) this.noteInsight({ title, summary: typeof payload.summary === 'string' ? payload.summary : undefined, personId: typeof payload.person_id === 'string' ? payload.person_id : undefined, personName: typeof payload.person_name === 'string' ? payload.person_name : undefined });
    });
    // Wellbeing and goals: the web toasts these; here they are Today rows
    // (invariant 4 — Notice is never an initiative channel). Same words.
    this.sse.subscribe('burnout_warning', (payload) => this.noteInsight(burnoutRow(payload)));
    this.sse.subscribe('goal_milestone', (payload) => { const row = goalMilestoneRow(payload); if (row) this.noteInsight(row); });
    this.sse.subscribe('card_section_updated', () => void this.cardView()?.reload());
    this.sse.subscribe('meeting_extraction_complete', (payload) => {
      if (payload.success === false) return;
      void this.materializer.refreshHistoryIfDue(true);
    });
    // After a canvas click made Myu answer in the conversation, the backend
    // says so here; the web polls on a timer because its listener is dead.
    this.sse.subscribe('chatrefresh', () => void this.chatView()?.reloadThread());
    this.sse.subscribe('composition_expired', (payload) => {
      // The web's ExpiredBanner: said in the pane, with Refresh. Nothing happens on its own.
      const id = typeof payload.composition_id === 'string' ? payload.composition_id : '';
      if (id) this.canvasView()?.markExpired(id, typeof payload.reason === 'string' ? payload.reason : undefined, typeof payload.refresh_available === 'boolean' ? payload.refresh_available : undefined);
    });
    this.sse.subscribe('composition_mutation', (payload) => {
      // The web's useCompositionSSE → applyMutations: the canvas on screen
      // changes under a background response, the same way the web's does.
      const id = typeof payload.composition_id === 'string' ? payload.composition_id : '';
      const mutations = Array.isArray(payload.mutations) ? (payload.mutations as SurfaceMutationLite[]) : [];
      if (id && mutations.length) this.applyCanvasMutations(id, mutations);
    });

    // Resume after the workspace settles: device ids, vault config and the
    // metadata cache are all ready then, and startup is where a plugin can most
    // easily make Obsidian feel slow.
    this.app.workspace.onLayoutReady(() => {
      this.personIndex.watch((unsub) => this.register(unsub));
      void this.resume();

      // First enable, nothing configured: the Obsidian way is a Notice and
      // the pane, not a modal on load (2026-08-30, PLAN_OBSIDIAN_FIRST_RUN).
      // The pane's resting state holds the sign-in doors; the setup checklist
      // takes over after that. Once only; settings stays a standing entrance.
      const s = this.settings;
      if (!s.first_run_shown && !s.token && !s.wrapped_mdek && !s.account_id && !s.consent_completed) {
        s.first_run_shown = true;
        void this.saveSettings();
        notifyStatus('askMyu is installed \u2014 the Myu pane is where you set it up.');
        void this.openToday();
      }
    });
  }

  override onunload(): void {
    if (this.careerCanvasTimer !== null) { window.clearTimeout(this.careerCanvasTimer); this.careerCanvasTimer = null; }
    this.careerCanvasListener = null;
    // Memory only — there is nothing to flush. The wrapped blob was written at
    // unlock precisely so this path can be a no-op under `kill -9`.
    this.unlock?.shutdown();
    this.capture?.stop();
    this.myuWatcher?.stop();
    this.sse?.stop();
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────

  private async resume(): Promise<void> {
    if (!this.settings.device_id) {
      this.settings.device_id = generateDeviceId();
      await this.saveSettings();
    }
    await this.unlock.resume();
  }

  /**
   * Every state transition lands here: capture starts or stops, Today redraws.
   * Capture is bound to UNLOCKED and nothing else — no key, no capture, and the
   * user is told which of the three reasons applies.
   */
  private syncingOnOpen = false;

  /** Full materialize on vault open, so the state is current without a manual
      Sync now. Throttled (a reload within 60s of the last open-sync is a no-op)
      and single-flight. */
  private async syncOnOpen(): Promise<void> {
    if (this.syncingOnOpen) return;
    // The switch (operator, 2026-08-29): default on; off means nothing runs
    // until Sync is pressed — Today's header, or the command.
    if (!this.settings.sync_on_open) return;
    const since = Date.now() - (this.settings.last_open_sync ?? 0);
    if (since < 60_000) return;
    this.syncingOnOpen = true;
    this.settings.last_open_sync = Date.now();
    await this.saveSettings();
    try {
      await this.materializer.materializeAll();
      this.lastSyncAt = Date.now();
    } finally {
      this.syncingOnOpen = false;
    }
  }

  private async onUnlockState(state: UnlockState, detail: string | null): Promise<void> {
    this.lastStateDetail = detail;
    this.setStatusBar(state, detail);
    // A pane showing the resting state (signed out, blocked, locked) must move the moment the machine does.
    if (state !== 'unlocked') void this.refreshToday({ now: true });
    if (state === 'unlocked') {
      void this.refreshOnboardingState();
      void this.unlock.ensurePluginToken();
      // Features FIRST (2026-09-02): it carries the beta-terms standing, and
      // the live stream must not open while gated — so the stream starts on
      // this answer, not on unlock. The custody ceremony has already run.
      void this.loadFeatures().then(() => {
        void this.refreshToday({ now: true });
        this.startLiveStream();
      });
      void this.loadIntegrationStatus(true);
      // RETURNING-USER choreography (2026-08-25): approval/recovery sign-ins
      // never ran the first-run ladder — an existing web account landed in a
      // vault with no consents, so nothing materialized and "why are my
      // relationships not syncing?" had no answer. Offer the same ladder
      // genesis gets, once per session.
      // Setup that is still open — a returning web account with no consents,
      // a read consent without the write one — is ROWS in the Today pane, not
      // a ladder of dialogs (2026-08-30). The pane is revealed once per
      // session so the rows are seen; nothing opens on the person.
      if ((!this.settings.consent_completed || !this.settings.materialize_consented) && !this.returningSetupOffered) {
        this.returningSetupOffered = true;
        void this.openToday();
      }
      {
        // SYNC ON OPEN (operator, 2026-08-25): the user's expectation — like
        // the web app — is that opening the vault shows a CURRENT state, not
        // one they must hand-refresh. A full pass runs in the background;
        // no-op suppression means only genuinely-changed files are rewritten,
        // so the cost is the fetch (exactly what the web pays on load), not
        // churn. Once per session-open, guarded so a rapid reload doesn't
        // double-run.
        void this.syncOnOpen();
      }
    }

    // A settings pane is a ONE-SHOT render; ours shows live machine state
    // (status line, the finish-setup row). Signup runs FROM settings, so the
    // pane behind the modals is guaranteed to be mid-transition stale unless
    // every state change re-renders it (2026-08-24: "Finish setup" haunted a
    // completed ceremony until the user clicked away and back).
    this.settingTab?.refreshIfVisible();

    if (state === 'unlocked') {
      this.restartCapture();
      await this.capture.flushQueue();
      await this.myuWatcher.flushQueue();
      // The live layer starts after /features answers — see the unlocked
      // branch above — so a gated account never opens a stream it cannot use.
      void this.refreshPendingTransfers();
    } else {
      this.capture.stop();
      this.meetingCapture.stop();
      this.sse.stop();
    }

    if (state === 'disconnected' && detail === 'token_revoked') {
      notifyError('askMyu access was revoked. Reconnect in Settings → askMyu to resume.');
    }

    await this.refreshToday({ now: true });
  }

  /**
   * (Re)register the vault watcher. Called after consent and after unlock.
   * Registration is refused when the allowlist is empty — QA invariant 2 — so
   * this is safe to call at any time.
   */
  restartCapture(): void {
    this.capture.stop();
    this.meetingCapture.stop();
    this.myuWatcher.stop();
    if (this.unlock.current !== 'unlocked') return;

    this.capture.start((event, fn) => {
      // Handlers go through registerEvent so Obsidian owns their teardown.
      this.registerEvent(this.app.vault.on(event as 'modify', fn as (file: TAbstractFile) => void));
    });
    this.meetingCapture.start((event, fn) => {
      this.registerEvent(this.app.vault.on(event as 'modify', fn as (file: TAbstractFile) => void));
    });
    this.myuWatcher.start((event, fn) => {
      this.registerEvent(this.app.vault.on(event as 'modify', fn as (file: TAbstractFile) => void));
    });
  }

  // ── commands ──────────────────────────────────────────────────────────────

  private registerCommands(): void {
    this.addCommand({
      id: 'open-today',
      name: 'Open Myu',
      callback: () => void this.openToday(),
    });
    this.addCommand({
      id: 'sync-from-myu',
      name: 'Sync everything from Myu now',
      checkCallback: (checking: boolean) => {
        if (this.unlock.current !== 'unlocked' || !this.settings.materialize_consented) return false;
        if (checking) return true;
        void this.materializer.materializeAll().then(() => notifyStatus('Synced — Myu’s folder is current.'));
        return true;
      },
    });
    this.addCommand({
      id: 'talk-to-myu',
      name: 'Talk to Myu',
      callback: () => {
        if (this.unlock.current === 'unlocked') void this.openChat({ text: '', send: false });
        else void this.openToday();
      },
    });

    this.addCommand({
      id: 'choose-shared-folders',
      name: 'Choose what Myu can read',
      callback: () => new ConsentModal(this.app, this, () => void this.refreshToday({ now: true })).open(),
    });

    this.addCommand({
      id: 'capture-current-note',
      name: 'Send this note to Myu now',
      checkCallback: (checking: boolean) => {
        const file = this.app.workspace.getActiveFile();
        // Only offered for a note the user has already shared — this command is
        // a "don't wait 90 seconds" shortcut, never a way around the allowlist.
        if (!file || file.extension !== 'md' || !this.capture.isShared(file)) return false;
        if (this.unlock.current !== 'unlocked') return false;
        if (checking) return true;

        void this.capture.capture(file).then((result) => {
          notifyStatus(
            result === 'sent'
              ? 'Sent to Myu.'
              : result === 'queued'
                ? 'Saved — it goes out when you are back online.'
                : result === 'vetoed'
                  ? 'This note opts out with `myu: false`.'
                  : 'Nothing new in this note since the last time.',
          );
        });
        return true;
      },
    });

    this.addCommand({
      id: 'ask-about-note',
      name: 'Ask Myu about this note',
      checkCallback: (checking: boolean) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== 'md' || this.unlock.current !== 'unlocked') return false;
        if (checking) return true;
        void this.askMyuAboutNote(file);
        return true;
      },
    });

    this.addCommand({
      id: 'ask-about-selection',
      name: 'Ask Myu about this selection',
      editorCheckCallback: (checking, editor) => {
        const selection = editor.getSelection();
        if (!selection.trim() || this.unlock.current !== 'unlocked') return false;
        if (checking) return true;
        void this.openChat({ text: `About this:\n\n${selection.trim()}\n\n`, send: false });
        return true;
      },
    });

    // The same person actions from the keyboard, on the active note.
    for (const [id, name, run] of [
      ['merge-person', 'Merge this person into\u2026', (p: PersonRef) => this.mergePerson(p)],
      ['this-is-me', 'This person is me', (p: PersonRef) => this.markPersonAsSelf(p)],
      ['archive-person', 'Archive this person', (p: PersonRef) => void this.archivePerson(p)],
    ] as const) {
      this.addCommand({
        id,
        name,
        checkCallback: (checking: boolean) => {
          if (this.unlock.current !== 'unlocked') return false;
          const file = this.app.workspace.getActiveFile();
          const person = file ? this.personOfNote(file) : null;
          if (!person) return false;
          if (!checking) run(person);
          return true;
        },
      });
    }

    this.addCommand({ id: 'new-conversation', name: 'Start a new conversation', callback: () => { void this.openChat({ text: '', send: false }); this.chatView()?.startNew(); } });
    this.addCommand({ id: 'cancel-backfill', name: 'Cancel bringing in notes', checkCallback: (checking) => { if (!this.backfillActive) return false; if (!checking) this.cancelBackfill(); return true; } });
    this.addCommand({ id: 'remove-myu-files', name: 'Remove everything Myu wrote', checkCallback: (checking) => { if (this.unlock.current !== 'unlocked' && Object.keys(this.settings.myu_file_hashes).length === 0) return false; if (!checking) this.removeEverythingMyuWrote(); return true; } });
    this.addCommand({ id: 'weave-myu-in', name: 'Weave Myu in (recipes for your notes)', callback: () => void this.openWeave() });
    this.addCommand({
      id: 'insert-myu-snippet',
      name: 'Insert a Myu snippet\u2026',
      editorCallback: (editor) => {
        new WeaveSnippetModal(this.app, this.settings.materialize_folder || 'Myu', (snippet) => editor.replaceSelection(snippet.text)).open();
      },
    });
    this.addCommand({ id: 'help-myu', name: 'Help Myu (people it cannot place)', checkCallback: (checking) => { if (this.unlock.current !== 'unlocked') return false; if (!checking) void this.openHelpMyu(); return true; } });
    this.addCommand({ id: 'search-myu', name: 'Search Myu (people, companies, memories)', checkCallback: (checking) => { if (this.unlock.current !== 'unlocked') return false; if (!checking) new FeedSearchModal(this.app, this).open(); return true; } });
    this.addCommand({ id: 'import-from-drive', name: 'Import meeting notes from Google Drive\u2026', checkCallback: (checking) => { if (this.unlock.current !== 'unlocked') return false; if (!checking) new DriveImportModal(this.app, this).open(); return true; } });
    this.addCommand({ id: 'send-feedback', name: 'Send feedback', checkCallback: (checking) => { if (this.unlock.current !== 'unlocked') return false; if (!checking) new FeedbackModal(this.app, this).open(); return true; } });
    this.addCommand({ id: 'past-canvases', name: 'Open a past canvas', checkCallback: (checking) => { if (this.unlock.current !== 'unlocked') return false; if (!checking) new CanvasHistoryModal(this.app, this).open(); return true; } });
    this.addCommand({ id: 'export-everything', name: 'Export everything Myu knows into the vault', checkCallback: (checking) => { if (this.unlock.current !== 'unlocked') return false; if (!checking) void this.exportEverything(); return true; } });
    this.addCommand({ id: 'request-data-archive', name: 'Request my data archive (encrypted zip by email)', checkCallback: (checking) => { if (this.unlock.current !== 'unlocked') return false; if (!checking) this.openDataExport(); return true; } });

    this.addCommand({
      id: 'save-composition',
      name: 'Save a Myu composition to my vault',
      checkCallback: (checking: boolean) => {
        if (this.unlock.current !== 'unlocked') return false;
        if (checking) return true;
        new CanvasExportModal(this.app, this).open();
        return true;
      },
    });

    this.addCommand({
      id: 'choose-meeting-folders',
      name: 'Choose my meeting-notes folders',
      callback: () => new MeetingConsentModal(this.app, this, () => void this.refreshToday({ now: true })).open(),
    });

    this.addCommand({
      id: 'show-myu-card',
      name: "Show Myu's card for this person",
      checkCallback: (checking: boolean) => {
        if (this.unlock.current !== 'unlocked') return false;
        const file = this.app.workspace.getActiveFile();
        // Only offered ON a person page — the command is the bridge between the
        // vault's convention and Myu's card, not a generic search.
        if (!file || !this.personIndex.find(file.basename)) return false;
        if (checking) return true;

        void this.showMyuCardFor(file);
        return true;
      },
    });

    this.addCommand({
      id: 'send-meeting-note',
      name: 'Send this meeting note to Myu now',
      checkCallback: (checking: boolean) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || !this.meetingCapture.qualifies(file)) return false;
        if (this.unlock.current !== 'unlocked') return false;
        if (checking) return true;
        void this.meetingCapture.capture(file).then((result) => {
          notifyStatus(
            result === 'sent'
              ? 'Meeting note sent — Myu is reading it now.'
              : result === 'unchanged'
                ? 'Nothing new in this note since the last send.'
                : result === 'refused'
                  ? "The server refused this note (too large, or it has no date Myu can find)."
                  : 'Not sent — check the connection.',
          );
        });
        return true;
      },
    });

    this.addCommand({
      id: 'next-meeting-prep',
      name: "Look at my next meeting's prep",
      checkCallback: (checking: boolean) => {
        if (this.unlock.current !== 'unlocked') return false;
        if (checking) return true;
        void (async () => {
          const today = new Date();
          const pad = (n: number) => String(n).padStart(2, '0');
          const day = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
          const next = new Date(today.getTime() + 86400000);
          const res = await this.backend.getCalendarEvents(
            day,
            `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`,
          );
          const events = ((res.data as { events?: Array<{ event_id: string; start_time: string; all_day?: boolean; status?: string }> })
            ?.events ?? [])
            .filter((e) => !e.all_day && e.status !== 'cancelled')
            .map((e) => ({ ...e, at: new Date(e.start_time.includes('T') ? e.start_time : `${e.start_time.replace(' ', 'T')}Z`).getTime() }))
            .filter((e) => e.at > Date.now())
            .sort((a, b) => a.at - b.at);
          if (events.length === 0) {
            notifyStatus('No more meetings today.');
            return;
          }
          await this.openPrep(events[0].event_id);
        })();
        return true;
      },
    });

    // People and companies get their own entry rather than one command with a
    // toggle — the palette is the surface, and "look up a company" should be
    // findable by typing "company".
    for (const tab of ['person', 'company'] as const) {
      this.addCommand({
        id: `look-up-${tab}`,
        name: tab === 'company' ? 'Look up a company' : 'Look up a person',
        checkCallback: (checking: boolean) => {
          if (this.unlock.current !== 'unlocked') return false;
          if (checking) return true;
          new LookupModal(this.app, this, tab, (entity) => {
            void this.openCard(tab, entity.entity_id, entity.display_name);
          }).open();
          return true;
        },
      });
    }

    this.addCommand({
      id: 'write-weekly-review',
      name: "Write this week's review into my weekly note",
      checkCallback: (checking: boolean) => {
        // Gated on the opt-in, not merely hidden: the command palette is a
        // capability surface, and a vault write must never be one keystroke away
        // from someone who never agreed to it.
        if (!this.settings.weekly_review_enabled) return false;
        if (this.unlock.current !== 'unlocked') return false;
        if (checking) return true;
        void this.writeWeeklyReview();
        return true;
      },
    });

    this.addCommand({
      id: 'let-myu-write',
      name: 'Let Myu keep a folder in my vault',
      checkCallback: (checking: boolean) => {
        if (this.unlock.current !== 'unlocked') return false;
        if (checking) return true;
        new MaterializeConsentModal(this.app, this, (accepted) => {
          if (!accepted) return;
          this.restartCapture();
          // First-run choreography: the folder fills progressively, with the
          // progress line as a Today row — never a silent partial folder.
          void this.materializer.materializeAll().then(({ people }) => {
            if (people > 0) notifyStatus(`Myu wrote ${people} ${people === 1 ? 'page' : 'pages'}.`);
          });
        }).open();
        return true;
      },
    });

    this.addCommand({
      id: 'refresh-myu-folder',
      name: "Refresh Myu's folder now",
      checkCallback: (checking: boolean) => {
        const s = this.settings;
        if (!s.materialize_consented || !s.materialize_enabled) return false;
        if (this.unlock.current !== 'unlocked') return false;
        if (checking) return true;
        void this.materializer.materializeAll().then(({ people, skipped }) => {
          notifyStatus(
            skipped > 0
              ? `Refreshed. ${skipped} ${skipped === 1 ? 'file has' : 'files have'} unshipped edits and ${skipped === 1 ? 'was' : 'were'} left alone.`
              : `Refreshed ${people} ${people === 1 ? 'page' : 'pages'}.`,
          );
        });
        return true;
      },
    });

    this.addCommand({
      id: 'send-queued',
      name: 'Send queued notes now',
      callback: () => {
        void this.capture.flushQueue().then(({ sent, remaining }) => {
          notifyStatus(remaining === 0 ? `Sent ${sent}. Nothing waiting.` : `Sent ${sent}. ${remaining} still waiting.`);
        });
      },
    });
  }

  // ── views ─────────────────────────────────────────────────────────────────

  async openToday(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(TODAY_VIEW_TYPE);
    if (existing.length > 0) {
      await this.app.workspace.revealLeaf(existing[0]);
      // Opening the pane is the person's own ask: fresh now, not after the gap.
      void this.refreshToday({ now: true });
      return;
    }

    const leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: TODAY_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  /**
   * Cards open in the right sidebar and REPLACE each other — one card leaf, not
   * a pile. They are ephemeral views of someone's read, not documents to
   * accumulate.
   */
  private setStatusBar(state: UnlockState, detail: string | null): void {
    if (!this.statusBarEl) return;
    const word =
      state === 'unlocked' ? 'ready'
      : state === 'relocked' ? (detail === 'offline' ? 'offline' : 'locked')
      : state === 'blocked' ? 'setup'
      : 'off';
    this.statusBarEl.setText(`myu · ${word}`);
  }

  /** Shared by the palette command and the context menus. */
  async askMyuAboutNote(file: TFile): Promise<void> {
    const raw = await this.app.vault.cachedRead(file);
    // Clipped to a sane cap: the model reads a note, not a book. The content
    // rides IN THE MESSAGE — the supported contract — rather than in a
    // context source the backend doesn't know.
    const clipped = raw.length > 6000 ? `${raw.slice(0, 6000)}\n\n[… clipped]` : raw;
    // GROUND the conversation: a question about a person page must carry the
    // entity, or Myu answers from the text alone and ignores everything it
    // KNOWS about the relationship (live finding, 2026-08-25).
    const context = await this.chatContextForFile(file);
    await this.openChat({
      text: `About my note "${file.basename}":\n\n${clipped}\n\nWhat do you notice?`,
      send: true,
      context,
    });
  }

  /** Entity grounding for a note: Myu-materialized pages carry their entity id
      in frontmatter; the user's own person pages resolve by name. */
  async chatContextForFile(file: TFile): Promise<ChatContext | undefined> {
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    const fmType: unknown = fm?.type;
    const fmId: unknown = fm?.['myu-id'];
    if ((fmType === 'myu-person' || fmType === 'myu-company') && typeof fmId === 'string' && fmId) {
      const entityType = fmType === 'myu-person' ? 'person' : 'company';
      return {
        source: 'vault_note',
        source_id: file.path,
        entity_references: [{ entity_type: entityType, entity_id: fmId, display_name: file.basename }],
        card_entity_type: entityType,
        card_entity_id: fmId,
      };
    }
    if (this.personIndex.find(file.basename)) {
      const res = await this.backend.searchEntities(file.basename);
      const match = (res.data?.results ?? []).find(
        (r) => r.entity_type === 'person' && r.display_name.toLowerCase() === file.basename.toLowerCase(),
      );
      if (match) {
        return {
          source: 'vault_note',
          source_id: file.path,
          entity_references: [{ entity_type: 'person', entity_id: match.entity_id, display_name: match.display_name }],
          card_entity_type: 'person',
          card_entity_id: match.entity_id,
        };
      }
    }
    return undefined;
  }

  /** Open a person's card by display name (the myu-card deep link target). */
  async showMyuCardForName(name: string, _file: TFile | null): Promise<void> {
    const res = await this.backend.searchEntities(name);
    const match = (res.data?.results ?? []).find(
      (r) => r.entity_type === 'person' && r.display_name.toLowerCase() === name.toLowerCase(),
    ) ?? (res.data?.results ?? []).find((r) => r.entity_type === 'person');
    if (!match) {
      notifyStatus(`Myu doesn't know ${name} yet.`);
      return;
    }
    await this.openCard('person', match.entity_id, match.display_name);
  }

  /** Shared by the palette command and the context menus. */
  async showMyuCardFor(file: TFile): Promise<void> {
    const res = await this.backend.searchEntities(file.basename);
    const match = (res.data?.results ?? []).find(
      (r) => r.entity_type === 'person' && r.display_name.toLowerCase() === file.basename.toLowerCase(),
    ) ?? (res.data?.results ?? []).find((r) => r.entity_type === 'person');
    if (!match) {
      notifyStatus(`Myu doesn't know ${file.basename} yet.`);
      return;
    }
    await this.openCard('person', match.entity_id, match.display_name);
  }

  /** Help Myu — its own sidebar tab, reused like cards. */
  /** The Myu look, over the vault's own adapter and config folder — whatever that folder is called. */
  lookInstaller(): LookInstaller {
    const a = this.app.vault.adapter;
    return new LookInstaller(
      { exists: (p) => a.exists(p), read: (p) => a.read(p), write: (p, t) => a.write(p, t), remove: (p) => a.remove(p), mkdir: (p) => a.mkdir(p) },
      this.app.vault.configDir,
      this.manifest.version,
      snippetSwitch(this.app, LOOK_NAME),
    );
  }

  /** The recipes pane — a document, so it opens in the main area, once. */
  async openWeave(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(WEAVE_VIEW_TYPE);
    const leaf = existing[0] ?? this.app.workspace.getLeaf('tab');
    if (!existing.length) await leaf.setViewState({ type: WEAVE_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
    const view = leaf.view;
    if (view instanceof WeaveView) await view.render();
  }

  async openHelpMyu(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(HELP_VIEW_TYPE);
    const leaf = existing[0] ?? this.app.workspace.getRightLeaf(false);
    if (!leaf) return;
    if (!existing.length) await leaf.setViewState({ type: HELP_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
    const view = leaf.view;
    if (view instanceof HelpMyuView) await view.refresh();
  }

  async openCard(entityType: CardEntityType, entityId: string, name: string): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(CARD_VIEW_TYPE);
    const leaf = existing[0] ?? this.app.workspace.getRightLeaf(false);
    if (!leaf) return;

    if (!existing.length) await leaf.setViewState({ type: CARD_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);

    const view = leaf.view;
    if (view instanceof CardView) await view.showEntity(entityType, entityId, name);
  }

  /**
   * A composition, read beside the notes (P-CANVAS-1). One canvas leaf,
   * reused — like cards and preps, it is a view of something, not a document
   * to accumulate.
   */
  /** The card pane, if one is open. */
  cardView(): CardView | null {
    const view = this.app.workspace.getLeavesOfType(CARD_VIEW_TYPE)[0]?.view;
    return view instanceof CardView ? view : null;
  }

  /** A row for Today's "noticed just now": twelve hours, six deep, newest first, one per title. */
  noteInsight(row: { title: string; summary?: string; personId?: string; personName?: string }): void {
    this.liveInsights = [{ ...row, receivedAt: Date.now() }, ...this.liveInsights.filter((i) => i.title !== row.title)]
      .filter((i) => Date.now() - i.receivedAt < 12 * 60 * 60 * 1000).slice(0, 6);
    void this.refreshToday();
  }

  /** feed/help-myu, for Today. Quiet on failure — the queue is a courtesy, not a state. */
  async loadHelpQueue(): Promise<void> {
    if (this.unlock.current !== 'unlocked') { this.helpQueue = []; return; }
    const res = await this.backend.getHelpMyuQueue().catch(() => null);
    this.helpQueue = res?.ok ? (res.data?.queue ?? []) : [];
  }

  /** A merge the Help Myu queue proposed — same confirm, same wire as the picker path. */
  mergePersonInto(source: PersonRef, target: PersonRef): void {
    new PersonActionConfirmModal(this.app, PERSON_ACTION_COPY.merge(source.name, target.name), (yes) => {
      if (!yes) return;
      void (async () => {
        const res = await this.backend.mergeRelationships(source.id, target.id);
        if (!res.ok) { notifyError(`Couldn\u2019t merge: ${res.error ?? res.data?.message ?? res.status}`); return; }
        await this.materializer.retirePersonNote(source.id);
        notifyStatus(`Merged ${source.name} into ${target.name}.`);
        this.helpQueue = this.helpQueue.filter((i) => !(i.item_type === 'merge_candidate' && i.source.relationship_id === source.id));
        void this.refreshToday({ now: true });
        for (const leaf of this.app.workspace.getLeavesOfType(HELP_VIEW_TYPE)) if (leaf.view instanceof HelpMyuView) leaf.view.render();
        void this.materializer.materializeAll();
      })();
    }).open();
  }

  /** The chat pane, if one is open anywhere. */
  chatView(): ChatView | null {
    const view = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0]?.view;
    return view instanceof ChatView ? view : null;
  }

  /** A canvas click that talks back: the reply lands in the thread within seconds — show it even if `chatrefresh` is late. */
  expectChatReply(): void {
    window.setTimeout(() => void this.chatView()?.reloadThread(), 3500);
  }

  /**
   * `composition_ready` / `composition_offer`: an OPEN pane follows a ready
   * canvas ("if a new one comes in it replaces the last one" — operator);
   * otherwise it is an offer — a row in the conversation and in Today, and a
   * Notice only when the backend marked it `announce`. Nothing opens itself.
   */
  private takeOffer(source: 'ready' | 'offer', payload: Record<string, unknown>): void {
    const step = routeOffer(source, payload, this.openCanvasId(), Date.now(), this.canvasView()?.followsLatest() ?? true);
    if (step.kind === 'replace') {
      // In place, never revealed — and the thread hears about it too. Taking
      // the pane used to be the END of the story, so with a pane open the
      // conversation never mentioned its own canvas.
      void this.canvasView()?.showComposition(step.compositionId);
      this.chatView()?.offerCanvas(step.compositionId, step.summaryText ?? '', 'Open canvas');
      return;
    }
    if (step.kind !== 'offer') return;
    this.pendingOffers = addOffer(this.pendingOffers, step.offer);
    // A pinned pane holds still, but must not pretend nothing happened.
    this.canvasView()?.noteNewer(step.offer.compositionId, step.offer.summaryText ?? '');
    this.chatView()?.offerCanvas(step.offer.compositionId, step.offer.summaryText, step.offer.actionLabel);
    void this.refreshToday();
    if (step.announce) notifyLive({ title: step.offer.summaryText || 'Myu prepared a canvas', body: step.offer.subjectName, kind: 'info' }, () => void this.openOffer(step.offer.compositionId));
  }

  async openOffer(compositionId: string): Promise<void> {
    this.pendingOffers = this.pendingOffers.filter((o) => o.compositionId !== compositionId);
    await this.openCanvas(compositionId);
    void this.refreshToday({ now: true });
  }

  dismissOffer(compositionId: string): void {
    this.pendingOffers = this.pendingOffers.filter((o) => o.compositionId !== compositionId);
    void this.refreshToday({ now: true });
  }

  /** `POST /feedback/submit` with what an Obsidian plugin can honestly say about itself. */
  sendFeedback(opts: { message: string; category: string; rating?: 1 | -1; surface: string; journalId?: string; attachments?: { attached_content?: string; attached_summary?: string } }) {
    return this.backend.submitFeedback({ message: opts.message, category: opts.category, ...(opts.rating ? { rating: opts.rating } : {}), app: 'obsidian', version: BUILD_STAMP, context: { surface_state: opts.surface, ...(opts.journalId ? { journal_id: opts.journalId } : {}), platform: Platform.isMobile ? 'mobile' : 'desktop' }, ...(opts.attachments ? { attachments: opts.attachments } : {}) });
  }

  /** The canvas pane, if one is open anywhere. */
  canvasView(): CanvasView | null {
    const view = this.app.workspace.getLeavesOfType(CANVAS_VIEW_TYPE)[0]?.view;
    return view instanceof CanvasView ? view : null;
  }

  /** The composition a pane is showing — what the chat sends as `continues_composition_id`. */
  openCanvasId(): string | null {
    return this.canvasView()?.currentId() ?? null;
  }

  applyCanvasMutations(compositionId: string, mutations: SurfaceMutationLite[]): boolean {
    return this.canvasView()?.applyRemoteMutations(compositionId, mutations) ?? false;
  }

  adoptCanvasId(compositionId: string): void {
    this.canvasView()?.adoptId(compositionId);
  }

  /**
   * `reveal: false` updates the pane WITHOUT pulling it in front of what the
   * reader is doing. Every automatic path uses it: a canvas arriving mid-thread
   * used to yank its tab over the conversation the user was typing in
   * (operator, 2026-09-01), and the thread now carries the canvas anyway. A
   * button press still reveals, because that is a request to look.
   */
  async openCanvas(compositionId: string, opts: { reveal?: boolean } = {}): Promise<void> {
    const reveal = opts.reveal !== false;
    const existing = this.app.workspace.getLeavesOfType(CANVAS_VIEW_TYPE);
    // Nothing automatic spawns a pane: no tab appears unless the reader asked.
    if (!existing.length && !reveal) return;
    const leaf = existing[0] ?? this.app.workspace.getRightLeaf(false);
    if (!leaf) return;
    if (!existing.length) await leaf.setViewState({ type: CANVAS_VIEW_TYPE, active: true });
    if (reveal) await this.app.workspace.revealLeaf(leaf);
    const view = leaf.view;
    if (view instanceof CanvasView) await view.showComposition(compositionId);
  }

  /** Prep opens in the right sidebar; one prep leaf, reused, like cards. */
  async openPrep(eventId: string): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(PREP_VIEW_TYPE);
    const leaf = existing[0] ?? this.app.workspace.getRightLeaf(false);
    if (!leaf) return;

    if (!existing.length) await leaf.setViewState({ type: PREP_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);

    const view = leaf.view;
    if (view instanceof PrepView) await view.showMeeting(eventId);
  }

  /**
   * Refresh every LOADED Today pane.
   *
   * Deferred panes (Obsidian 1.7.2+) are skipped ON PURPOSE, not by accident:
   * a deferred leaf's `view` is a placeholder rather than a TodayView, and
   * forcing it to load from a background timer would defeat precisely the
   * startup and memory saving deferral exists for. Nothing is lost — the
   * view's `onOpen` refreshes, so a pane is current the moment it is actually
   * revealed. `isDeferred` is undefined on older builds, which reads falsy and
   * keeps the pre-1.7.2 behaviour intact.
   */
  /**
   * Every "refresh Today" in this file lands here: coalesced, paced, one fetch
   * in flight. The sync button passes `now`. (The unpaced version, called once
   * per progress line, is what tripped the WAF on 2026-09-03.)
   */
  private todayGate = new RefreshGate(() => this.fetchTodayLeaves(), TODAY_REFRESH_GAP_MS);
  private refreshToday(opts: { now?: boolean } = {}): Promise<void> {
    return this.todayGate.request(opts);
  }
  private async fetchTodayLeaves(): Promise<void> {
    for (const leaf of this.app.workspace.getLeavesOfType(TODAY_VIEW_TYPE)) {
      if (leaf.isDeferred) continue;
      const view = leaf.view;
      if (view instanceof TodayView) await view.refresh();
    }
  }
  /** A progress line is a PAINT, never a fetch: the pane updates one row. */
  private paintProgress(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(TODAY_VIEW_TYPE)) {
      if (leaf.isDeferred) continue;
      const view = leaf.view;
      if (view instanceof TodayView) view.paintProgress();
    }
  }

  // ── connect / backfill (called from settings + modals) ────────────────────

  /** Stable device identity, minted on first need. */
  async ensureDeviceId(): Promise<string> {
    if (!this.settings.device_id) {
      this.settings.device_id = crypto.randomUUID();
      await this.saveSettings();
    }
    return this.settings.device_id;
  }

  /** P9 — redeem an emailed sign-in token (protocol handler or pasted link). */
  async completeMagicSignup(token: string): Promise<void> {
    if (this.unlock.current === 'unlocked') return; // stale link, already in
    const deviceId = await this.ensureDeviceId();
    const outcome = await this.unlock.completeMagicLink(token, deviceId);
    if (outcome === 'ceremony') {
      this.openGenesisCeremony();
    } else if (outcome === 'existing_account') {
      // The pane carries the way forward — the approval lives there now, so a
      // person who came back from the browser is not left with a toast.
      notifyStatus('Welcome back — this device needs approving. Myu shows how.');
      void this.openToday();
    } else if (outcome === 'invalid') {
      notifyError('That sign-in link has expired or was already used. Request a fresh one.');
    } else {
      notifyError('Sign-in failed — check the connection and try again.');
    }
  }

  /**
   * Signup's key-birth step — the same t=0 custody sequence every frontend
   * runs, made visible as twelve words because this client has no passkey.
   * Closable: the account rests in BLOCKED and settings offers to finish.
   */
  openGenesisCeremony(): void {
    new SetupRecoveryModal(this.app, this, () => void this.finishFirstRun(), 'genesis').open();
  }

  /**
   * The shared landing of every fresh-account door, AFTER keys exist:
   * rung one of the consent ladder, immediately — propose-don't-ask,
   * give-before-take. Recovery is real from birth; nothing is pending.
   */
  async finishFirstRun(): Promise<void> {
    // No ladder. The Today pane carries the setup as a checklist — write,
    // read, backfill, meetings, identity — each a row that opens its dialog
    // only when pressed. Give before
    // take: the folder row leads, and shows as soon as Myu has something to
    // put in it.
    notifyStatus('Welcome. Myu is ready.');
    await this.openToday();
  }

  /** P10 — the webapp's arc/moment conversation, gated on SERVER truth. Dismissed or finished, the ladder goes on. */
  async offerOnboardingThenBackfill(): Promise<void> {
    await this.refreshOnboardingState();
    if (this.onboardingComplete === false) {
      this.openOnboarding(() => this.offerBackfill());
      return;
    }
    this.offerBackfill();
  }

  /** The write rung, then whatever comes next. Latches `materialize_offered` either way — never a nag. */
  offerResidencyThen(next: () => void): void {
    if (this.unlock.current !== 'unlocked') return;
    if (this.settings.materialize_consented || this.settings.materialize_offered) { next(); return; }
    new MaterializeConsentModal(this.app, this, (accepted) => {
      this.settings.materialize_offered = true;
      void this.saveSettings();
      if (accepted) {
        this.restartCapture();
        void this.materializer.materializeAll().then(({ people }) => {
          if (people > 0) notifyStatus(`Myu wrote ${people} ${people === 1 ? 'page' : 'pages'}.`);
        });
      }
      next();
    }).open();
  }

  /**
   * The write step of the sign-in ladder (operator, 2026-08-25: "I had to
   * enable Myu to write to Myu — annoying"). Signing in ran the READ consents
   * and onboarding but never OFFERED the write consent, so the vault stayed
   * empty and the toggle had to be hunted for in settings. Writing plaintext
   * stays its own opt-in class — we don't auto-enable — but it is now offered
   * at the natural moment. Backfill of the user's own existing notes proceeds
   * either way (it is a read, independent of whether Myu writes its folder).
   */
  offerResidencyThenBackfill(): void {
    this.offerResidencyThen(() => this.offerBackfill());
  }

  openOnboarding(onFinished?: () => void): void {
    // Finished OR dismissed: the next rung runs once either way (the write
    // offer used to vanish for anyone who closed this dialog).
    let handed = false;
    new OnboardingModal(this.app, this, () => {
      if (handed) return;
      handed = true;
      void this.refreshOnboardingState();
      onFinished?.();
    }).open();
  }

  /** Ask the server whether onboarding happened; cache for settings + Today. */
  async refreshOnboardingState(): Promise<void> {
    if (this.unlock.current !== 'unlocked' || !this.settings.account_id) return;
    const res = await this.backend.getAccountState(this.settings.account_id);
    if (!res.ok || !res.data) return;
    this.onboardingComplete = res.data.onboarding_complete === true;
    this.onboardingScripts = res.data.myu_scripts ?? {};
    this.settingTab?.refreshIfVisible();
    void this.refreshToday();
  }

  async connect(token: string): Promise<void> {
    if (!this.settings.device_id) {
      this.settings.device_id = generateDeviceId();
      await this.saveSettings();
    }
    await this.unlock.connect(token, this.settings.device_id);

    if (this.unlock.current === 'disconnected') {
      notifyError("That token didn't work. Create a new one in askMyu → Settings → Integrations.");
    }
  }

  /** Offered right after consent — the vault's history is the whole wedge. */
  offerBackfill(): void {
    if (this.unlock.current !== 'unlocked') return;
    const { files, oldest } = this.capture.surveyBackfill();
    if (files.length === 0) return;
    new BackfillModal(this.app, this, files, oldest).open();
  }

  /**
   * The meeting-side wedge (gap closed 2026-08-23): existing Meetings/ notes
   * ingest in one confirmed sweep instead of waiting to be edited. Progress
   * rides the Today choreography row — the folder visibly filling is the
   * first-run promise, and this is where it starts for the acquisition
   * persona. Scope-confirmed by the count in the notice, not a second modal:
   * the consent ceremony just named these exact folders.
   */
  async runMeetingBackfill(): Promise<void> {
    if (this.unlock.current !== 'unlocked') return;
    const { files } = this.meetingCapture.surveyBackfill();
    if (files.length === 0) return;
    notifyStatus(`Bringing in ${files.length} existing meeting ${files.length === 1 ? 'note' : 'notes'}…`);
    await this.meetingCapture.backfill(files, (done, total) => {
      this.materializeProgress = `Reading your meeting notes — ${done} of ${total}`;
      this.paintProgress();
    });
    this.materializeProgress = null;
    void this.refreshToday();
    // One action, one final toast below — the mid-import toast was noise (audit, 2026-08-29).
  }

  reportBackfillFinished(total: number): void {
    notifyStatus(`Brought in ${total} ${total === 1 ? 'note' : 'notes'}.`);
    this.settings.backfill_done = true;
    void this.saveSettings();
    void this.refreshToday({ now: true });
  }

  /**
   * The payback beat: after the LinkedIn confirm the backend seeds the career
   * canvas and announces it over `composition_ready` (flow_type
   * CareerTrajectoryCompositionFlow) — the plugin opens that one. If nothing
   * arrives (older backend, seed failed), it asks on demand instead.
   */
  private careerCanvasTimer: number | null = null;
  /** The cold-start calendar offer was answered this session (a calendar landed, or a real "no") — no surface asks again. */
  welcomeOfferAnswered = false;
  /** Conversations whose delivered ask was answered this session — never ask twice in one conversation. */
  offerAnsweredJournals = new Set<string>();
  /** People whose LinkedIn ask was resolved this session — the chat stops offering the walk. */
  linkedinAskResolved = new Set<string>();
  /** Device transfer requests waiting on THIS vault to approve them (server truth, polled — never only SSE). */
  pendingTransfers: PendingTransfer[] = [];
  /** While the onboarding modal is open it listens here, so the read can be SHOWN in the conversation, not just in a tab behind it. */
  careerCanvasListener: ((compositionId: string) => void) | null = null;
  expectCareerCanvas(): void {
    if (this.careerCanvasTimer !== null) window.clearTimeout(this.careerCanvasTimer);
    this.careerCanvasTimer = window.setTimeout(() => { this.careerCanvasTimer = null; void this.openCareerCanvas(); }, 25_000);
  }
  /** True (and consumed) when a `composition_ready` is the seeded career canvas the onboarding is waiting for. */
  private claimCareerCanvas(payload: Record<string, unknown>): boolean {
    if (this.careerCanvasTimer === null || payload.flow_type !== 'CareerTrajectoryCompositionFlow') return false;
    window.clearTimeout(this.careerCanvasTimer); this.careerCanvasTimer = null;
    return true;
  }

  /**
   * Device transfer requests waiting on this vault. Polled, not merely pushed:
   * the SSE Notice is the fast path, this is the one that still works when the
   * stream is down, the app was closed, or the toast was missed. Requests live
   * ~5 minutes server-side, so a stale row is dropped rather than shown.
   */
  /**
   * Keep the live stream up while unlocked. START it if it was never started
   * (an unlock that did not re-fire leaves `desired` false, and ensure() would
   * politely do nothing), otherwise re-open a stream that is not connected.
   */
  private ensureLiveStream(): void {
    if (this.settings.use_mock_backend || this.termsStanding() === 'gated') return;
    if (!this.sse.isRunning) {
      this.startLiveStream();
      return;
    }
    this.sse.ensure();
  }

  async refreshPendingTransfers(): Promise<void> {
    if (this.unlock.current !== 'unlocked' || this.settings.use_mock_backend) {
      if (this.pendingTransfers.length) { this.pendingTransfers = []; void this.refreshToday(); }
      return;
    }
    const res = await this.backend.getPendingTransfers().catch(() => null);
    if (!res?.ok) return;
    const next = (res.data?.pending_requests ?? []).filter((r) => r.request_id);
    const changed = next.length !== this.pendingTransfers.length
      || next.some((r, i) => r.request_id !== this.pendingTransfers[i]?.request_id);
    this.pendingTransfers = next;
    if (changed) { void this.refreshToday({ now: true }); this.settingTab?.refreshIfVisible(); }
  }

  /**
   * From a canvas back to the conversation that made it: reveal the chat, then
   * scroll to and flash the reply carrying that canvas.
   *
   * If the canvas belongs to a conversation that is not open, `journal_id` on
   * its history row (backend 2026-09-01) says which one \u2014 so we open it and
   * land on the reply rather than telling the reader to go find it. Canvases
   * stored before that deploy carry no journal, and those still say so.
   */
  async showCanvasInChat(compositionId: string): Promise<void> {
    await this.openChat({ text: '', send: false });
    if (this.chatView()?.revealCanvas(compositionId)) return;
    const journalId = await this.journalForComposition(compositionId);
    if (!journalId) { notifyStatus('That canvas belongs to another conversation \u2014 find it under Past conversations.'); return; }
    await this.openConversation(journalId);
    if (!this.chatView()?.revealCanvas(compositionId)) notifyStatus('Opened the conversation this canvas belongs to.');
  }

  /** Which conversation a canvas came from, per `/composition/history`. Empty when unknown. */
  private async journalForComposition(compositionId: string): Promise<string> {
    const rows = (await this.backend.getCompositionHistory(50).catch(() => null))?.data?.compositions ?? [];
    const row = rows.find((r) => (r.composition_id ?? r.id) === compositionId);
    return typeof row?.journal_id === 'string' ? row.journal_id : '';
  }

  /** The career canvas, asked for by the plugin (POST /composition/career-trajectory) and opened — the payback beat's fallback. */
  async openCareerCanvas(): Promise<void> {
    const res = await this.backend.createCareerTrajectory().catch(() => null);
    const id = res?.data?.composition?.id || res?.data?.composition_id;
    if (!res?.ok || !id) return;
    await this.openCanvas(String(id));
    this.careerCanvasListener?.(String(id));
  }

  /** "Remove everything Myu wrote": confirm, then every generated file to the trash. Writing stays as set. */
  removeEverythingMyuWrote(): void {
    const found = findEverythingMyuWrote(this.app, Object.keys(this.settings.myu_file_hashes));
    if (found.files.length === 0) { notifyStatus('Nothing of Myu\u2019s to remove.'); return; }
    const n = found.files.length;
    new PersonActionConfirmModal(this.app, {
      title: 'Remove everything Myu wrote?',
      body: `${n} ${n === 1 ? 'file goes' : 'files go'} to the trash \u2014 every page, note, table and canvas Myu wrote, recoverable from there. Your own notes are untouched. Writing stays ${this.settings.materialize_consented ? 'on, so the folder fills again on the next sync; turn it off in settings to stop that' : 'off'}.`,
      cta: 'Remove',
    }, (yes) => {
      if (!yes) return;
      void (async () => {
        const trashed = await trashEverythingMyuWrote(this.app, found.files);
        this.settings.myu_file_hashes = {};
        await this.saveSettings();
        notifyStatus(`Removed ${trashed} ${trashed === 1 ? 'file' : 'files'} \u2014 they are in the trash.`);
        void this.refreshToday({ now: true });
      })();
    }).open();
  }

  // ── backfill: background, status bar, cancel; the link survey ─────────────
  private backfillStop = false;
  backfillActive = false;
  private surveyCache: LinkedPerson[] | null = null;

  /** What the vault's links already say — cached per session; recomputed when consent changes. */
  async linkSurvey(force = false): Promise<LinkedPerson[]> {
    if (this.surveyCache && !force) return this.surveyCache;
    const notes = await this.capture.sharedNotesForSurvey();
    this.surveyCache = surveyLinks(notes);
    return this.surveyCache;
  }
  forgetLinkSurvey(): void { this.surveyCache = null; }

  async runBackfill(files: TFile[]): Promise<void> {
    if (this.backfillActive || files.length === 0) return;
    this.backfillActive = true;
    this.backfillStop = false;
    notifyStatus(`Bringing in ${files.length} ${files.length === 1 ? 'note' : 'notes'} \u2014 progress in the status bar; \u201cCancel bringing in notes\u201d stops it.`);
    const result = await this.capture.backfill(files, (done, total) => {
      this.statusBarEl?.setText(`myu \u00b7 reading ${done}/${total}`);
      this.materializeProgress = `Reading your notes \u2014 ${done} of ${total}`;
      this.paintProgress();
    }, () => this.backfillStop);
    this.backfillActive = false;
    this.materializeProgress = null;
    this.setStatusBar(this.unlock.current, this.lastStateDetail);
    if (result.stopped) { notifyStatus('Stopped. What was sent stays sent; press Start again to continue \u2014 notes already in are skipped.'); void this.refreshToday({ now: true }); return; }
    this.reportBackfillFinished(files.length);
  }

  cancelBackfill(): void { this.backfillStop = true; }

  /** Public door to the Today refresh, for dialogs that changed a checklist row. */
  refreshTodayNow(): Promise<void> {
    return this.refreshToday({ now: true });
  }

  /** Open the chat pane seeded — every conversational affordance lands here. */
  /** Open the chat pane on a PAST conversation, resumable. */
  async openConversation(journalId: string): Promise<void> {
    await this.openChat({ text: '', send: false });
    const leaf = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0];
    const view = leaf?.view;
    if (view instanceof ChatView) await view.openPastConversation(journalId);
  }

  async openChat(seed: ChatSeed): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE);
    const leaf = existing[0] ?? this.app.workspace.getRightLeaf(false);
    if (!leaf) return;
    if (!existing.length) await leaf.setViewState({ type: CHAT_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
    const view = leaf.view;
    if (view instanceof ChatView) view.seed(seed);
  }

  /** P6.3 — the exposure modal, then the vault-module write. Never automatic. */
  offerConversationSave(turns: ChatTurn[]): void {
    new ConversationSaveModal(this.app, async () => {
      const outcome = await this.conversationWriter.write(turns);
      if (outcome.status === 'written') notifyStatus(`Saved to ${outcome.path}.`);
      else if (outcome.status === 'nothing_to_write') notifyStatus('Nothing to save yet.');
      else notifyError(`Could not save the conversation: ${outcome.message}`);
    }).open();
  }

  /**
   * P5.5 — fetch a composition and materialize it as a .canvas + provenance
   * stub. The caller has already collected the exposure yes; this is the
   * mechanism. Shared by the command modal and (P6) the chat offer.
   */
  // ── person actions: merge / this is me / archive ─────────────────────────

  /** A Myu person note → the relationship it stands for, by frontmatter. */
  personOfNote(file: TFile): PersonRef | null {
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (fm?.type !== 'myu-person' || typeof fm['myu-id'] !== 'string') return null;
    return { id: fm['myu-id'], name: file.basename };
  }

  mergePerson(source: PersonRef): void {
    new MergeIntoModal(this.app, this, source.id, source.name, (target) => {
      new PersonActionConfirmModal(this.app, PERSON_ACTION_COPY.merge(source.name, target.display_name), (yes) => {
        if (!yes) return;
        void (async () => {
          const res = await this.backend.mergeRelationships(source.id, target.entity_id);
          if (!res.ok) { notifyError(`Couldn\u2019t merge: ${res.error ?? res.data?.message ?? res.status}`); return; }
          await this.materializer.retirePersonNote(source.id);
          notifyStatus(`Merged ${source.name} into ${target.display_name}.`);
          void this.materializer.materializeAll();
        })();
      }).open();
    }).open();
  }

  markPersonAsSelf(person: PersonRef): void {
    new PersonActionConfirmModal(this.app, PERSON_ACTION_COPY.self(person.name), (yes) => {
      if (!yes) return;
      void (async () => {
        const res = await this.backend.markRelationshipAsSelf(person.id);
        if (!res.ok) { notifyError(`Couldn\u2019t mark as you: ${res.error ?? res.data?.message ?? res.status}`); return; }
        await this.materializer.retirePersonNote(person.id);
        notifyStatus(`${person.name} is you now \u2014 removed from your people.`);
        void this.materializer.materializeAll();
      })();
    }).open();
  }

  async archivePerson(person: PersonRef): Promise<void> {
    const res = await this.backend.archiveRelationship(person.id, 'archive');
    if (!res.ok) { notifyError(`Couldn\u2019t archive: ${res.error ?? res.status}`); return; }
    await this.materializer.retirePersonNote(person.id);
    notifyStatus(`Archived ${person.name}.`);
    void this.materializer.materializeAll();
  }

  /** Sync now — Today's header button and the command. */
  async syncNow(): Promise<void> {
    if (this.unlock.current !== 'unlocked' || !this.settings.materialize_consented) { notifyError('Sign in and allow Myu to write first (Settings \u2192 askMyu).'); return; }
    await this.materializer.materializeAll();
    this.lastSyncAt = Date.now();
    void this.refreshToday({ now: true });
  }

  /** Everything Myu knows, as files — plus the receipt. */
  async exportEverything(): Promise<void> {
    if (this.unlock.current !== 'unlocked' || !this.settings.materialize_consented) { notifyError('Sign in and allow Myu to write first (Settings \u2192 askMyu).'); return; }
    const summary = await this.exporter.exportEverything((line) => { this.materializeProgress = line || null; void this.refreshToday(); });
    this.lastSyncAt = Date.now();
    notifyStatus(`Exported \u2014 ${summary.conversations.saved} conversations, ${summary.canvases.kept} canvases, ${summary.people} people. Receipt: Myu/Export.md`);
  }

  openDataExport(): void {
    if (this.unlock.current !== 'unlocked') { notifyError('Sign in first.'); return; }
    new DataExportModal(this.app, this).open();
  }

  /** The plugin's own settings tab — where Devices lives. */
  openSettings(): void {
    this.settingsHost()?.open();
    this.settingsHost()?.openTabById(this.manifest.id);
  }

  /** Open the tab AND land on one row — scrolled, flashed, focused. Retries once: the tab paints on its own tick. */
  openSettingsAt(settingName: string): void {
    const host = this.settingsHost();
    host?.open();
    const tab = host?.openTabById(this.manifest.id);
    const container = tab?.containerEl ?? document;
    window.setTimeout(() => {
      if (!revealSetting(container, settingName)) window.setTimeout(() => revealSetting(container, settingName), 300);
    }, 60);
  }

  private settingsHost(): { open(): void; openTabById(id: string): { containerEl?: HTMLElement } | null } | undefined {
    return (this.app as unknown as { setting?: { open(): void; openTabById(id: string): { containerEl?: HTMLElement } | null } }).setting;
  }

  /** The always-keep switch, honoured from outside the pane. Once per id per session. */
  private readonly keptCanvasIds = new Set<string>();
  async keepCanvasIfAlwaysOn(compositionId: unknown, summary = ''): Promise<void> {
    if (!shouldKeepCanvas(this.settings.auto_keep_canvas, compositionId, this.keptCanvasIds)) return;
    const outcome = await this.exportComposition(compositionId, 'canvas', { quiet: true });
    // A vault write the user did not initiate must never be silent: ONE short
    // Notice — Obsidian's standard for an outcome — no OS notification. The
    // pane's own keeps say "kept in …" in place instead.
    if (outcome.status === 'written') notifyStatus(`Kept canvas${summary ? ` \u2014 ${summary}` : ''}: ${outcome.canvasPath}`);
    else notifyError(`Couldn\u2019t keep a canvas: ${outcome.message}`);
  }

  async exportComposition(
    compositionId: string,
    format: 'canvas' | 'markdown' = 'canvas',
    /** quiet: the automatic keep — the pane reports in place; no toast. */
    opts: { quiet?: boolean } = {},
  ): Promise<CanvasWriteOutcome> {
    const res = await this.backend.getComposition(compositionId);
    const spec = res.data?.composition;
    if (!res.ok || !spec) {
      if (!opts.quiet) notifyError("Couldn't load that composition. Check the id and your connection.");
      return { status: 'error', message: res.error || 'could not load the composition' };
    }

    const webUrl = `${this.settings.base_url.replace(/\/api\/?$/, '')}/dashboard`;
    const outcome =
      format === 'markdown'
        ? await this.canvasExporter.writeMarkdown(
            spec,
            // The note links to the user's OWN person page when they keep one,
            // by basename — the link belongs in their graph, not ours.
            (name) => this.personIndex.find(name)?.path?.replace(/\.md$/, '').split('/').pop() ?? null,
            webUrl,
          )
        : await this.canvasExporter.write(
            spec,
            (name) => this.personIndex.find(name)?.path ?? null,
            webUrl,
          );

    if (!opts.quiet) {
      if (outcome.status === 'written') notifyStatus(`Saved to ${outcome.canvasPath}.`);
      else notifyError(`Could not save it: ${outcome.message}`);
    }
    return outcome;
  }

  // ── B4: the weekly review (the only vault write) ──────────────────────────

  /** Turn the opt-in on or off. Always behind the exposure warning. */
  offerWeeklyReview(onDecided: () => void): void {
    new WeeklyReviewModal(this.app, async (enabled) => {
      this.settings.weekly_review_enabled = enabled;
      await this.saveSettings();
      onDecided();
    }).open();
  }

  /**
   * Materialize this week's review. Manual only — nothing on a timer calls this,
   * so a vault write is always something the user just did.
   */
  async writeWeeklyReview(): Promise<void> {
    if (!this.settings.weekly_review_enabled) return;

    // The SERVER edition when a fresh one exists — the same review Today's
    // "the week" zone shows, so the pane and the note can never disagree. The
    // local composition (the brief's counts-only weekly_movement line) stays as
    // the offline fallback so the command still works with no server edition.
    // One mechanism, two outputs — this closes the parity fork with the web.
    let lines: string[] = [];
    const weeklyRes = await this.backend.getWeeklyReview().catch(() => null);
    const edition = weeklyRes?.data?.edition;
    if (edition && isWeeklyEditionFresh(edition)) {
      lines = editionToLines(edition);
    } else {
      const res = await this.backend.getBrief();
      const brief = (res.data as { brief?: { sections?: Array<{ items?: Array<{ text?: string; type?: string }> }> } } | null)
        ?.brief;
      // Only the weekly-movement line: counts, no names — what makes writing
      // into a synced file defensible. Named reads stay in ephemeral panes.
      lines = (brief?.sections ?? [])
        .flatMap((section) => section.items ?? [])
        .filter((item) => item.type === 'weekly_movement' && item.text)
        .map((item) => item.text as string);
    }

    const outcome = await this.weeklyReview.write({ lines, weekOf: new Date().toISOString().slice(0, 10) });

    switch (outcome.status) {
      case 'written':
        notifyStatus(`Weekly review ${outcome.created ? 'created in' : 'updated in'} ${outcome.path}.`);
        break;
      case 'no_weekly_config':
        notifyError('No weekly note configured in Periodic Notes, so there is nowhere to write it.');
        break;
      case 'nothing_to_write':
        notifyStatus('No movement to report this week — nothing written.');
        break;
      case 'error':
        notifyError(`Could not write the weekly review: ${outcome.message}`);
        break;
    }
  }

  // ── persistence ───────────────────────────────────────────────────────────

  async loadSettings(): Promise<void> {
    this.settings = normalizeSettings(await this.loadData());
    // Mint a stable vault id once (REVIEW M3) so external_id survives a vault
    // folder rename. Persisted in this vault's plugin data.
    if (!this.settings.vault_id) {
      this.settings.vault_id = crypto.randomUUID();
      await this.saveSettings();
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
