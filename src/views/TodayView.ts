/**
 * TodayView — the brief, beside your notes. Right sidebar `ItemView`.
 *
 * The quiet-structure register, mapped onto Obsidian's own CSS variables so it
 * respects every theme the user has installed (this crowd notices, and a plugin
 * that ignores their theme reads as a foreign object in their vault):
 *
 *   · hairline zones + whisper labels (`next`, `noticing`), never boxes;
 *   · ≤1 amber accent per view, and only on a genuine deviation;
 *   · serif = Myu's voice ONLY, under a label that says so;
 *   · mono = digits and times;
 *   · no internal schema words — the personal loop is `noticing`, tiers are
 *     never named, `brief_item.type` never renders.
 *
 * Ambient by construction: this pane is the whole initiative channel. Nothing
 * here calls `Notice` (invariant 4), nothing animates, nothing demands. It
 * refreshes on `registerInterval` and otherwise sits still.
 *
 * Render-verbatim: claim text arrives hedged and gated from the backend and is
 * printed as-is. The plugin does not re-phrase, re-rank, or add confidence
 * language of its own.
 */

import { setIcon, ItemView, WorkspaceLeaf } from 'obsidian';
import type AskMyuPlugin from '../main';
import { SignupModal } from './SignupModal';
import { ConsentModal } from './ConsentModal';
import { surveyLine } from '../capture/linkSurvey';
import { ApproveDeviceModal } from './ApproveDeviceModal';
import { ApprovalModal } from './ApprovalModal';
import { notifyError } from '../notify';
import { approvalFailureText } from './approvalCopy';
import { readsFromBundle, type TodayReads } from './todayReads';

/**
 * "About 4 minutes left" — from the SERVER's `expires_at`. The window is
 * config (`device_transfer_ttl_secs`), so a client that assumes it starts
 * lying the day it changes; with no expiry given, say nothing rather than
 * guess.
 */
function remainingLabel(expiresAt: number | undefined): string {
  if (!expiresAt) return '';
  const leftMs = expiresAt - Date.now();
  if (leftMs <= 0) return 'This request has expired. Ask that device to try again.';
  const mins = Math.ceil(leftMs / 60000);
  return `About ${mins} ${mins === 1 ? 'minute' : 'minutes'} left.`;
}

/** "Wed 3:00pm" from an ISO start, in the vault's locale. */
function whenLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}
/** "Jul 3" from YYYY-MM-DD. */
function shortDate(ymd: string): string {
  const d = new Date(ymd.length === 10 ? `${ymd}T12:00:00` : ymd);
  return Number.isNaN(d.getTime()) ? ymd : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
import { MeetingConsentModal } from './MeetingConsentModal';
import type { DailyBrief, GoogleCalendarEvent } from '../wire';
import type { CoupledLoop, MirrorEdition, MirrorObservation, MyuLineLite, SpaceLite, PatternFeedbackEvent, PersonalLoop, VaultCommitment, VaultInteractionEvent, WeeklyEdition } from '../transport/api';
import { isWeeklyEditionFresh } from '../vault/WeeklyReviewWriter';
import { commitmentLine, sanitizeName } from '../vault/myuFiles';
import { spaceDoorLabel, spaceIdsOf } from '../spaceConversation';
import { foldRows, groupBySubject, lineNeedsYou, rowOpensConversation, stackOf } from '../todayLines';
import { SPACE_RETRO_WORDS, foldSpaceRows, isSpaceLine, spaceRows } from '../spaceRetro';
import { DEBRIEF_PANE_WORDS, isDebriefSpace } from '../debriefPane';
import { pressLineButton, type LineButton, type LineUi } from '../lineAnswers';
import { renderLineAsk } from './lineAsk';
import { lineIdAttr } from '../linesSeenWatch';
import { ENTRY_DOT_WORDS, entryDot } from '../menuMarks';
import { decryptWithKey } from '../crypto/primitives';
import { COMMITMENTS_FOLD_WORDS, commitmentsFold, type CommitmentRow } from '../commitmentsFold';
import type { Commitment } from '../wire';

export const TODAY_VIEW_TYPE = 'askmyu-today';

/** "Friday, 12 September" — the pane's title date, weekday first, day before month. */
function dateTitle(d: Date): string {
  const weekday = d.toLocaleDateString(undefined, { weekday: 'long' });
  const month = d.toLocaleDateString(undefined, { month: 'long' });
  return `${weekday}, ${d.getDate()} ${month}`;
}

/** A call that may not exist on an older backend, or may throw: null, never a decision. */
async function safe<T>(f: () => Promise<T>): Promise<T | null> {
  try {
    return await f();
  } catch {
    return null;
  }
}

type Meeting = GoogleCalendarEvent & { startDate: Date };

export class TodayView extends ItemView {
  private brief: DailyBrief | null = null;
  /** P4.6: the hero shows 2; the rest render on demand. Reset per refresh. */
  private briefExpanded = false;
  private meetings: Meeting[] = [];
  /**
   * One list, two lenses (F0): today's lines. A meeting's line sits under its
   * row in Next / Earlier; a person's, company's or space's line is a row of
   * its own under "for you". The dot beside a row (2026-10-06): lit while something came in for it since Today was
   * opened before this visit (new), grey while a question there waits for an answer.
   */
  private todayLines: MyuLineLite[] = [];
  /**
   * Myu's questions answered here with a tap (2026-09-25): what each line shows between answers,
   * and the lines answered here, kept on the list to show what Myu said back (the read keeps an
   * answered line until tomorrow but sends no readback for it).
   */
  private lineUi = new Map<string, LineUi>();
  private answeredHere = new Set<string>();
  /** The two above, made on first use (a view built without its constructor, as the tests do, has neither). */
  private lineState(): { ui: Map<string, LineUi>; answered: Set<string> } {
    this.lineUi ??= new Map<string, LineUi>();
    this.answeredHere ??= new Set<string>();
    return { ui: this.lineUi, answered: this.answeredHere };
  }
  /** Space mode (R14): each space's door words, by space id (from the step of the person's getting-ready). */
  private spaceDoors = new Map<string, string>();
  /**
   * The spaces this person belongs to. A space is on Today whether or not Myu has a line about
   * it: until 0.1.3 the only way into a space was a line, and a space whose line did not need
   * you could not be found at all. Null until the list was read (or when it cannot be).
   */
  private spaces: SpaceLite[] | null = null;
  /**
   * Rows whose other lines are showing, and whether the rest of "for you" is. Held on the
   * VIEW (like the mirror's state below): the ambient refresh re-renders everything, and a
   * row the reader opened must not snap shut under them.
   */
  private openStacks = new Set<string>();
  private forYouOpen = false;
  private spacesOpen = false;
  /** "Open with you today" — the open commitments, as Tasks checkboxes. */
  private commitments: VaultCommitment[] = [];
  /** "what you owe ▸" (terminal parity, 2026-09-26): the commitments between people, `GET /commitments`. */
  private owed: Commitment[] = [];
  private owedOpen = false;
  private mirror: MirrorEdition | null = null;
  private weekly: WeeklyEdition | null = null;
  /**
   * Per-observation feedback state, held on the VIEW rather than in render
   * scope: the 5-minute ambient refresh re-renders everything, and a dismissed
   * line coming back from the dead would be worse than no mirror at all.
   * Keyed by observation_id (edition-scoped), so a new edition starts clean.
   */
  private mirrorFeedback = new Map<string, 'refine' | 'done' | 'confirmed'>();
  private mirrorReceiptsOpen = new Set<string>();
  private loading = true;
  /** A refresh has succeeded at least once. Until then "nothing" is not a fact worth stating. */
  private loadedOnce = false;
  /** The last refresh could not reach Myu — say so, and try again soon rather than in five minutes. */
  private staleSince: number | null = null;
  private retryTimer: number | null = null;
  private errorState: 'locked' | 'blocked' | 'offline' | 'disconnected' | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private plugin: AskMyuPlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return TODAY_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'Myu — Today';
  }

  override getIcon(): string {
    return 'sun';
  }

  override async onOpen(): Promise<void> {
    this.contentEl.addClass('myu-today');
    // "Seen" (2026-10-06): a row's line in view for a second is reported, through every redraw of the pane.
    this.plugin.linesSeen?.watch(this.contentEl);
    await this.refresh();
  }

  override async onClose(): Promise<void> {
    if (this.retryTimer !== null) { window.clearTimeout(this.retryTimer); this.retryTimer = null; }
    this.plugin.linesSeen?.unwatch(this.contentEl);
    this.contentEl.empty();
  }

  /**
   * The six reads — one bundle call when the backend offers it (`today_bundle`),
   * six calls otherwise. The pane cannot tell the difference; the server can.
   */
  private async readToday(): Promise<TodayReads> {
    const start = localDate(new Date());
    const end = localDate(addDays(new Date(), 7));
    if (this.plugin.backendFlags?.today_bundle) {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const reads = readsFromBundle(await this.plugin.backend.getTodayBundle(start, end, tz).catch(() => null));
      if (reads.helpQueue) this.plugin.helpQueue = reads.helpQueue;
      else await this.plugin.loadHelpQueue().catch(() => undefined);
      return reads;
    }
    const [brief, events, mirror, weekly, loop] = await Promise.all([
      this.plugin.backend.getBrief(),
      this.plugin.backend.getCalendarEvents(start, end),
      // The mirror rides along but never decides the view's error state — its
      // absence is a designed condition, not a failure to report.
      this.plugin.backend.getMirrorEdition().catch(() => null),
      this.plugin.backend.getWeeklyReview().catch(() => null),
      // The web's personal-loop strip and its Help Myu queue ride along the same way.
      this.plugin.backend.getPersonalLoop().catch(() => null),
      this.plugin.loadHelpQueue().catch(() => undefined),
    ]);
    return { brief, events, mirror, weekly, loop, helpQueue: null };
  }

  /** Called by the plugin's 5-minute interval and after state changes. */
  async refresh(): Promise<void> {
    const state = this.plugin.unlock.current;
    if (state === 'disconnected') {
      this.errorState = 'disconnected';
      this.loading = false;
      this.render();
      return;
    }
    if (state === 'blocked') {
      // Signed in, not yet trusted with the key — its own screen, never "locked".
      this.errorState = 'blocked';
      this.loading = false;
      this.render();
      return;
    }
    if (state !== 'unlocked') {
      this.errorState = 'locked';
      this.loading = false;
      this.render();
      return;
    }

    const reads = await this.readToday();
    const { brief: briefRes, events: eventsRes, mirror: mirrorRes, weekly: weeklyRes, loop: loopRes } = reads;
    this.loop = loopRes?.ok ? (loopRes.data?.loop ?? null) : null;
    // The instant give: what the vault's links already say, once a scope exists and setup is still showing.
    this.giveLine = null;
    if (this.plugin.settings.consent_completed && !this.plugin.settings.setup_hidden && (!this.plugin.settings.backfill_done || !this.plugin.settings.materialize_consented)) {
      this.giveLine = surveyLine(await this.plugin.linkSurvey().catch(() => []));
    }
    this.coupledLoops = loopRes?.ok ? (loopRes.data?.coupled_loops ?? []) : [];

    if (briefRes.error === 'offline' || eventsRes.error === 'offline') {
      this.errorState = 'offline';
      this.loading = false;
      this.render();
      return;
    }

    // A REFUSED call is not an empty day. Only `offline` used to be recognised,
    // so a 401/403/500 left `data` null and the pane announced "Nothing pressing
    // this morning" — a verdict it had not earned — until the 5-minute ambient
    // tick happened to succeed (operator, prod, 2026-08-31: eight minutes of it).
    if (!briefRes.ok || !eventsRes.ok) {
      this.staleSince = this.staleSince ?? Date.now();
      this.loading = false;
      this.scheduleRetry();
      this.render();
      return;
    }
    this.staleSince = null;
    this.loadedOnce = true;

    this.errorState = null;
    const nextBrief = (briefRes.data as { brief?: DailyBrief } | null)?.brief ?? null;
    if (nextBrief?.date !== this.brief?.date) this.briefExpanded = false;
    this.brief = nextBrief;

    // Freshness identical to the web: current or prior ISO week, else nothing —
    // a stale review rendering as if current would be worse than absence.
    const weeklyEdition = weeklyRes?.data?.edition ?? null;
    this.weekly = weeklyEdition && isWeeklyEditionFresh(weeklyEdition) ? weeklyEdition : null;

    const edition = mirrorRes?.data?.edition ?? null;
    this.mirror =
      edition && Array.isArray(edition.observations) && edition.observations.length > 0 ? edition : null;

    const today = localDate(new Date());
    const raw = ((eventsRes.data as { events?: GoogleCalendarEvent[] })?.events ?? []).filter(
      (e) => !e.all_day && e.status !== 'cancelled',
    );
    const dated = raw
      .map((e) => ({ ...e, startDate: parseEventTime(e.start_time) }))
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    this.meetings = dated.filter((e) => localDate(e.startDate) === today);

    await this.readLinesAndCommitments();

    this.loading = false;
    this.render();
  }

  /**
   * The lines and the open commitments ride along the good day; neither
   * decides the pane's error state (a backend without them is an older one,
   * not a broken one). Encrypted commitment rows open here — this device has
   * custody — the same way the vault's Commitments file opens them.
   */
  private async readLinesAndCommitments(): Promise<void> {
    const [linesRes, commitsRes, spacesRes, owedRes] = await Promise.all([
      safe(() => this.plugin.backend.getMyuLines('today')),
      safe(() => this.plugin.backend.listVaultCommitments()),
      safe(() => this.plugin.backend.listSpaces()),
      safe(() => this.plugin.backend.getCommitments()),
    ]);
    if (owedRes?.ok) this.owed = owedRes.data?.items ?? [];
    if (spacesRes?.ok) this.spaces = spacesRes.data?.spaces ?? [];
    // The read keeps a line answered today on today's list until tomorrow but
    // sends no readback for it; only open lines are drawn here.
    if (linesRes?.ok) {
      this.todayLines = (linesRes.data?.lines ?? []).filter(
        (l) => !l.state || l.state === 'queued' || l.state === 'released' || this.lineState().answered.has(l.line_id),
      );
    }
    // Space mode (R14): a space's door says where the person is in getting ready ("Myu is asking
    // what you want to bring up ▸" / "Ready to share with the team ▸" / …), from the step, never a count.
    // An interview debrief has no getting-ready step to read: its door is its own words.
    const debriefs = new Set((this.spaces ?? []).filter(isDebriefSpace).map((sp) => sp.space_id));
    const doors = new Map<string, string>();
    await Promise.all(
      [...new Set([...spaceIdsOf(this.todayLines), ...(this.spaces ?? []).map((sp) => sp.space_id)])].filter((id) => !debriefs.has(id)).map(async (id) => {
        const mine = await safe(() => this.plugin.backend.getRetroPrepMine(id));
        doors.set(id, spaceDoorLabel(mine?.ok ? mine.data : null));
      }),
    );
    this.spaceDoors = doors;
    if (commitsRes?.ok) this.commitments = await this.openCommitments(commitsRes.data?.commitments ?? []);
  }

  private async openCommitments(rows: VaultCommitment[]): Promise<VaultCommitment[]> {
    const key = this.plugin.keys?.get() ?? null;
    const out: VaultCommitment[] = [];
    for (const c of rows) {
      if (c.status && c.status !== 'open') continue;
      if ((c.content ?? '').trim() || !c.encrypted_content || !key) {
        out.push(c);
        continue;
      }
      try {
        out.push({ ...c, content: (await decryptWithKey(c.encrypted_content, key)).trim() });
      } catch {
        out.push(c);
      }
    }
    return out;
  }

  /**
   * A refresh that could not reach Myu retries in seconds, not on the ambient
   * five-minute tick — the pane must not sit on a wrong picture that long.
   */
  private scheduleRetry(): void {
    if (this.retryTimer !== null) return;
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = null;
      void this.refresh();
    }, 15_000);
  }

  // ── render ────────────────────────────────────────────────────────────────

  /** The gate's checkbox, kept across re-renders so a tick survives a refresh. */
  private termsAgreed = false;

  private render(): void {
    const root = this.contentEl;
    root.empty();
    this.dots = [];

    if (this.loading) {
      root.createEl('p', { cls: 'myu-quiet myu-thinking', text: 'Opening your day' });
      return;
    }

    if (this.errorState) {
      this.renderResting(root);
      return;
    }

    // The beta-terms gate (2026-09-02): first acceptance BLOCKS. The fourth
    // state of this pane, beside signed-out, setup and the day. Nothing else
    // renders until the account agrees — the backend answers 428 to it all.
    if (this.plugin.termsStanding() === 'gated') {
      this.renderTermsGate(root);
      return;
    }

    this.renderMenuMarks(root);
    this.renderSyncBar(root);
    if (this.plugin.termsUpdateVisible()) this.renderTermsUpdate(root);
    this.renderDeviceRequests(root);
    this.renderSetup(root);
    this.renderMaterializeProgress(root);
    this.renderInsights(root);
    this.renderOffers(root);
    // From Myu — <date>: the brief, then Next and Earlier as meeting rows with
    // the line under each, then Open with you today (the mock's pane, F0).
    this.renderBrief(root);
    this.renderSpaces(root);
    this.renderForYou(root);
    this.renderNext(root);
    this.renderOpenWithYou(root);
    this.renderWhatYouOwe(root);
    this.renderHelpMyu(root);
    this.renderWeekEdition(root);
    this.renderLoop(root);
    this.renderWeek(root);
    this.renderMonthlyPointer(root);
    this.renderMirror(root);
    this.renderChatDoor(root);
  }

  /**
   * "Before you start": the one screen a gated account sees. The documents
   * are links out (the exempt kind — settings/onboarding, not content), the
   * sentence is the agreement's own, and Continue is the only way forward
   * short of signing out.
   */
  private renderTermsGate(root: HTMLElement): void {
    const zone = root.createDiv({ cls: 'myu-zone myu-terms-gate' });
    zone.createEl('h3', { text: 'Before you start' });
    zone.createEl('p', {
      cls: 'myu-prose',
      text: 'Before you use the beta, please agree to the beta participation terms and the privacy policy. Read them, then tick the box.',
    });
    this.renderTermsLinks(zone);
    const label = zone.createEl('label', { cls: 'myu-terms-label' });
    const box = label.createEl('input', { cls: 'myu-terms-box', attr: { type: 'checkbox', 'aria-label': 'I agree to the beta participation terms and the privacy policy' } });
    box.checked = this.termsAgreed;
    label.createSpan({ cls: 'myu-terms-sentence', text: 'I agree to the beta participation terms and the privacy policy.' });
    const actions = zone.createDiv({ cls: 'myu-mirror-actions' });
    const go = actions.createEl('button', { cls: 'myu-affordance myu-cta', text: 'Continue' });
    go.disabled = !this.termsAgreed;
    box.onchange = () => {
      this.termsAgreed = box.checked;
      go.disabled = !this.termsAgreed;
    };
    go.onclick = async () => {
      go.disabled = true;
      go.textContent = 'Saving\u2026';
      const ok = await this.plugin.acceptTerms();
      if (!ok) {
        go.disabled = false;
        go.textContent = 'Continue';
      }
    };
    const out = actions.createEl('button', { cls: 'myu-affordance', text: 'Sign out' });
    out.onclick = () => void this.plugin.unlock.disconnect();
  }

  /**
   * "We've updated the terms": a later version, a row, never a lockout
   * (decision 7). Accept writes the new rows; Not now hides it for the session.
   */
  private renderTermsUpdate(root: HTMLElement): void {
    const zone = root.createDiv({ cls: 'myu-zone myu-terms-update' });
    zone.createEl('h3', { text: 'We\u2019ve updated the terms' });
    zone.createEl('p', { cls: 'myu-prose', text: `The beta participation terms or the privacy policy changed (version ${this.plugin.terms?.currentVersion ?? ''}). You can keep using Myu under the version you agreed to. Accepting the new one takes a moment.` });
    this.renderTermsLinks(zone);
    const actions = zone.createDiv({ cls: 'myu-mirror-actions' });
    const accept = actions.createEl('button', { cls: 'myu-affordance myu-cta', text: 'I agree to the updated terms' });
    accept.onclick = async () => {
      accept.disabled = true;
      const ok = await this.plugin.acceptTerms();
      if (!ok) accept.disabled = false;
    };
    const later = actions.createEl('button', { cls: 'myu-affordance', text: 'Not now' });
    later.onclick = () => this.plugin.dismissTermsUpdate();
  }

  private renderTermsLinks(zone: HTMLElement): void {
    const links = zone.createDiv({ cls: 'myu-terms-links' });
    for (const link of this.plugin.termsLinkTargets()) {
      links.createEl('a', { cls: 'myu-affordance', text: `Read the ${link.label} \u2197`, href: link.url, attr: { target: '_blank', rel: 'noopener' } });
    }
  }

  /**
   * Another device asking to join — the ONE thing that must never be missed.
   * A transient Notice is not enough (the app may be closed, the stream down,
   * the toast dismissed), so the request lives here until it is answered or
   * expires. Requests are server-side ~5 minutes; the row says so.
   */
  private renderDeviceRequests(root: HTMLElement): void {
    const requests = this.plugin.pendingTransfers;
    if (!requests.length) return;
    for (const request of requests) {
      const zone = root.createDiv({ cls: 'myu-zone myu-device-request' });
      zone.createDiv({ cls: 'myu-whisper', text: 'a device wants to join' });
      zone.createDiv({ cls: 'myu-claim', text: `\u201c${request.device_name || 'A new device'}\u201d wants to join your account` });
      const left = remainingLabel(request.expires_at);
      zone.createDiv({ cls: 'myu-quiet', text: left ? `Type the 4-digit code it shows. ${left}` : 'Type the 4-digit code it shows.' });
      const actions = zone.createDiv({ cls: 'myu-canvas-actions' });
      const approve = actions.createEl('button', { cls: 'myu-affordance myu-cta', text: 'Approve\u2026' });
      approve.onclick = () => {
        if (!request.public_key) { this.plugin.openSettings(); return; }
        new ApproveDeviceModal(this.app, this.plugin, request.request_id, request.public_key, () => void this.plugin.refreshPendingTransfers()).open();
      };
      const deny = actions.createEl('button', { cls: 'myu-affordance', text: 'Deny' });
      deny.onclick = async () => {
        deny.disabled = true;
        await this.plugin.backend.denyDeviceTransfer(request.request_id).catch(() => undefined);
        await this.plugin.refreshPendingTransfers();
      };
    }
  }

  /** One line pointing at the Help Myu tab — the queue itself lives in its own sidebar tab, not here. */
  private renderHelpMyu(root: HTMLElement): void {
    const n = this.plugin.helpQueue.length;
    if (n === 0) return;
    const row = root.createEl('button', { cls: 'myu-row myu-row-tappable', attr: { 'aria-label': 'People Myu needs help identifying' } });
    row.createSpan({ cls: 'myu-row-title', text: `Help Myu identify ${n} ${n === 1 ? 'person' : 'people'}` });
    const chev = row.createSpan({ cls: 'myu-affordance-inline myu-chevron' });
    setIcon(chev, 'chevron-right');
    row.onclick = () => void this.plugin.openHelpMyu();
  }

  /**
   * "This week" — the day-one edition (cold start, slice 5): the web's
   * WeekEdition, in the pane. Stats line, the ONE finite bar while the first
   * minutes run, the watermark during the long tail, silence at steady; a row
   * per meeting with its facts and two doors (prep, capture after).
   */
  private renderWeekEdition(root: HTMLElement): void {
    const section = (this.brief?.sections ?? []).find((s) => s.section === 'week' && s.visible && (s.items?.length ?? 0) > 0);
    const progress = this.brief?.progress ?? null;
    if (!section && !progress) return;
    const zone = root.createDiv({ cls: 'myu-zone myu-week' });
    zone.createDiv({ cls: 'myu-whisper', text: 'this week' });
    if (progress) {
      const stats = [
        progress.meetings_this_week != null ? `${progress.meetings_this_week} ${progress.meetings_this_week === 1 ? 'meeting' : 'meetings'}` : '',
        progress.first_timers ? `${progress.first_timers} ${progress.first_timers === 1 ? 'person' : 'people'} you haven\u2019t met` : '',
        progress.external ? `${progress.external} external` : '',
      ].filter(Boolean).join(' \u00b7 ');
      if (stats) zone.createDiv({ cls: 'myu-quiet', text: stats });
      if (progress.stage === 'first_minutes' && (progress.people_total ?? 0) > 0) {
        const read = progress.people_read ?? 0; const total = progress.people_total ?? 0;
        const bar = zone.createDiv({ cls: 'myu-progress', attr: { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(read), 'aria-label': 'Reading your week' } });
        bar.createDiv({ cls: 'myu-progress-fill' }).style.width = `${Math.min(100, Math.round((read / total) * 100))}%`;
        zone.createDiv({ cls: 'myu-quiet', text: `Reading your week \u2014 ${read} of ${total} people` });
      } else if (progress.stage === 'long_tail' && progress.mail_understood_back_to) {
        zone.createDiv({ cls: 'myu-quiet', text: `Mail understood back to ${shortDate(progress.mail_understood_back_to)} \u00b7 still reading` });
      }
    }
    for (const item of section?.items ?? []) {
      if (item.type === 'week_more') { zone.createDiv({ cls: 'myu-quiet', text: item.text ?? '' }); continue; }
      const row = zone.createDiv({ cls: `myu-week-row${item.meta?.external ? ' myu-week-external' : ''}` });
      const when = item.meta?.when ? whenLabel(item.meta.when) : '';
      const head = row.createDiv({ cls: 'myu-row' });
      if (when) head.createSpan({ cls: 'myu-time', text: when });
      head.createSpan({ cls: 'myu-row-title', text: item.text ?? '' });
      const facts = item.meta?.facts;
      const lines = [facts?.role_line, facts?.why_meeting ? `Why: ${facts.why_meeting}` : '', facts?.mutual_ties?.length ? `You both know ${facts.mutual_ties.join(', ')}` : '', ...(facts?.public_context ?? []).slice(0, 2)].filter((x): x is string => !!x);
      for (const l of lines) row.createDiv({ cls: 'myu-quiet', text: l });
      if (item.meta?.cold) row.createDiv({ cls: 'myu-quiet', text: item.meta.first_time ? 'First meeting. Facts only; worth noting how it goes afterwards.' : 'No history yet. Myu starts learning about this person after the meeting.' });
      const actions = row.createDiv({ cls: 'myu-canvas-actions' });
      const eventId = item.actions?.find((a) => a.action_type === 'prep')?.target_id || item.meta?.event_id;
      if (eventId) { const prep = actions.createEl('button', { cls: 'myu-affordance myu-cta', text: 'Prepare' }); prep.onclick = () => void this.plugin.openPrep(eventId); }
      if (item.actions?.some((a) => a.action_type === 'capture_after')) {
        const name = item.entity_references?.[0]?.display_name ?? 'them';
        const cap = actions.createEl('button', { cls: 'myu-affordance', text: 'Add notes' });
        cap.onclick = () => void this.plugin.openChat({ text: `After the meeting with ${name}: `, send: false });
      }
    }
  }

  /** Canvases Myu prepared while you were elsewhere — the web's pending-offers strip. Open, or let go. */
  private renderOffers(root: HTMLElement): void {
    const offers = this.plugin.pendingOffers;
    if (offers.length === 0) return;
    const zone = root.createDiv({ cls: 'myu-zone myu-offers' });
    zone.createDiv({ cls: 'myu-whisper', text: 'prepared by Myu' });
    for (const offer of offers) {
      const row = zone.createDiv({ cls: 'myu-offer-row' });
      row.createSpan({ cls: 'myu-claim', text: (offer.summaryText || 'A canvas') + (offer.subjectName ? ` \u2014 ${offer.subjectName}` : '') });
      const open = row.createEl('button', { cls: 'myu-affordance', text: offer.actionLabel });
      open.onclick = () => void this.plugin.openOffer(offer.compositionId);
      const drop = row.createEl('button', { cls: 'myu-affordance myu-icon-button', attr: { 'aria-label': 'Dismiss this canvas' } });
      setIcon(drop, 'x');
      drop.onclick = () => this.plugin.dismissOffer(offer.compositionId);
    }
  }

  /**
   * The first run, the Obsidian way:
   * a checklist in the pane — one row per decision, each opening its dialog
   * only when pressed, ticking off, gone when done. Nothing opens itself.
   * Order = give before take: the folder (what Myu gives) leads as soon as
   * there is something to put in it; then what Myu may read; then the
   * preview-and-start of history; meeting notes; identity last, optional.
   */
  private renderSetup(root: HTMLElement): void {
    const s = this.plugin.settings;
    if (s.setup_hidden) return;
    const rows = this.setupRows();
    if (rows.length === 0) return;
    const zone = root.createDiv({ cls: 'myu-zone myu-setup' });
    zone.createDiv({ cls: 'myu-whisper', text: 'setting up' });
    for (const r of rows) {
      const row = zone.createDiv({ cls: 'myu-setup-row' });
      row.createDiv({ cls: 'myu-claim', text: r.title });
      row.createDiv({ cls: 'myu-quiet', text: r.why });
      const actions = row.createDiv({ cls: 'myu-canvas-actions' });
      const go = actions.createEl('button', { cls: `myu-affordance${r.primary ? ' myu-cta' : ''}`, text: r.button });
      go.onclick = () => r.open();
    }
    if (this.giveLine) zone.createEl('p', { cls: 'myu-voice', text: this.giveLine });
    const hide = zone.createEl('button', { cls: 'myu-affordance myu-link-button', text: 'Hide setup. Everything here is also in settings' });
    hide.onclick = () => { s.setup_hidden = true; void this.plugin.saveSettings(); this.render(); };
  }

  private setupRows(): Array<{ title: string; why: string; button: string; primary?: boolean; open: () => void }> {
    const s = this.plugin.settings;
    const p = this.plugin;
    const rows: Array<{ title: string; why: string; button: string; primary?: boolean; open: () => void }> = [];
    const refresh = () => void this.refresh();
    // The folder, as soon as Myu has something to put in it (a brief, or a
    // read consent given). A cold account gets it after its first give.
    if (!s.materialize_consented && (this.brief || s.consent_completed)) {
      rows.push({ title: 'Save what Myu knows to your vault', why: 'One folder, Myu/ (you can rename it): people and companies, your journal by day, meetings, today, commitments as checkboxes, every canvas you save. Your own notes are never edited.', button: 'Let Myu write\u2026', primary: true, open: () => p.offerResidencyThen(refresh) });
    }
    if (!s.consent_completed) {
      rows.push({ title: 'Choose what Myu may read', why: 'Nothing is read until you choose. Only notes in the folders you choose are sent, encrypted with a key that stays on this device.', button: 'Choose folders\u2026', primary: !rows.length, open: () => new ConsentModal(this.app, p, refresh).open() });
    }
    if (s.consent_completed && !s.backfill_done) {
      const { files, oldest } = p.capture.surveyBackfill();
      if (files.length > 0) {
        const months = oldest ? Math.max(1, Math.round((Date.now() - oldest) / (1000 * 60 * 60 * 24 * 30))) : 0;
        rows.push({ title: 'Share the notes you have already written', why: `${files.length} ${files.length === 1 ? 'note' : 'notes'} in the folders you shared${months ? `, going back ${months >= 12 ? `${Math.round(months / 12)} ${Math.round(months / 12) === 1 ? 'year' : 'years'}` : `${months} ${months === 1 ? 'month' : 'months'}`}` : ''}. Preview first; nothing is sent until you press Start.`, button: 'Preview\u2026', open: () => p.offerBackfill() });
      } else if (!s.backfill_done) { s.backfill_done = true; void p.saveSettings(); }
    }
    if (s.consent_completed && s.meeting_folders.length === 0 && !s.meeting_consent_offered) {
      rows.push({ title: 'Share meeting notes', why: 'A separate choice. Meeting notes are processed on the server like every other meeting source. Unlike your journal, they are not encrypted with your device key.', button: 'Choose\u2026', open: () => new MeetingConsentModal(this.app, p, refresh).open() });
    }
    if (p.onboardingComplete === false) {
      rows.push({ title: 'Tell Myu who you are', why: 'Optional. Used to name you and your role in briefs; kept with your encrypted account data only.', button: 'Tell Myu\u2026', open: () => p.openOnboarding(refresh) });
    }
    return rows;
  }

  /** Today is Myu's front door — talking to Myu must be reachable FROM it. */
  private renderChatDoor(root: HTMLElement): void {
    const door = root.createEl('button', { cls: 'myu-affordance', text: 'Talk to Myu' });
    door.onclick = () => void this.plugin.openChat({ text: '', send: false });
  }

  /**
   * Locked / offline / disconnected. Named plainly, with the one action that
   * fixes each — a spinner that never resolves is how a plugin earns a bug
   * report about the wrong thing.
   */
  private renderResting(root: HTMLElement): void {
    if (this.errorState === 'blocked') {
      this.renderBlocked(root);
      return;
    }
    const messages: Record<string, string> = {
      disconnected: 'Not connected yet. Create an account, or sign in to the one you already have.',
      locked: 'Locked. Myu unlocks your notes when this device can reach the server.',
      offline: 'No connection right now. Sharing notes is paused and will catch up.',
    };
    root.createEl('p', { cls: 'myu-prose myu-quiet', text: messages[this.errorState ?? 'locked'] });

    if (this.errorState === 'disconnected') {
      // The ribbon sun icon is an ENTRANCE, not a dead end: gateway primacy
      // means the vault door signs you up without a detour through settings.
      // BOTH doors open the same modal — the email step detects an existing
      // account and routes to approval/recovery, so the labels differ only to
      // meet each person's expectation, not to fork the flow.
      const doors = root.createDiv({ cls: 'myu-door-stack' });
      const signup = doors.createEl('button', { cls: 'myu-door-primary', text: 'Create my account…' });
      signup.onclick = () => new SignupModal(this.app, this.plugin, () => void this.refresh()).open();
      const alt = doors.createDiv({ cls: 'myu-door-alt' });
      alt.createSpan({ cls: 'myu-quiet', text: 'Already use Myu?' });
      const signin = alt.createEl('button', { cls: 'myu-affordance', text: 'Sign in' });
      signin.onclick = () => new SignupModal(this.app, this.plugin, () => void this.refresh(), 'signin').open();
    }

    if (this.errorState === 'locked' || this.errorState === 'offline') {
      const retry = root.createEl('button', { cls: 'myu-affordance', text: 'Try now' });
      retry.onclick = async () => {
        await this.plugin.unlock.unlockFromServerKEK();
        await this.refresh();
      };
    }
  }

  /**
   * Signed in, not yet trusted with the key. This used to fall into the
   * "Locked — try now" copy, which is for a device that HAS custody and is
   * merely offline; a person who clicked the emailed link in a browser came
   * back to a pane with no way forward (operator, 2026-09-03: "someone can
   * flip between interfaces and end up losing the flow"). The approval lives
   * on the machine now, so this pane shows it and drives it — the code, the
   * wait, the retry, the phrase — with no dialog to lose.
   */
  private renderBlocked(root: HTMLElement): void {
    const unlock = this.plugin.unlock;
    const detail = this.plugin.lastStateDetail;
    const again = () => void this.refresh();

    if (unlock.genesisPending || detail === 'genesis_pending' || detail === 'genesis_failed') {
      root.createEl('p', {
        cls: 'myu-prose',
        text: detail === 'genesis_failed' ? 'Key setup did not finish. Try again: the twelve-word step takes two minutes, then everything works.' : 'One step left: your twelve-word recovery phrase. It takes two minutes, then everything works.',
      });
      const finish = root.createEl('button', { cls: 'myu-door-primary', text: 'Finish setup…' });
      finish.onclick = () => this.plugin.openGenesisCeremony();
      return;
    }

    if (detail === 'token_revoked') {
      root.createEl('p', { cls: 'myu-prose', text: 'This device was signed out on the server. Sign in again to continue.' });
      const signin = root.createEl('button', { cls: 'myu-door-primary', text: 'Sign in' });
      signin.onclick = () => new SignupModal(this.app, this.plugin, again, 'signin').open();
      return;
    }

    const approval = unlock.approval;
    const phraseDoor = (host: HTMLElement, label: string) => {
      const b = host.createEl('button', { cls: 'myu-affordance', text: label });
      b.onclick = () => new ApprovalModal(this.app, unlock, again, 'phrase').open();
    };

    if (approval?.status === 'pending') {
      root.createEl('p', { cls: 'myu-prose', text: 'Waiting for your approval. In Myu on your phone or the web app, approve this device and enter:' });
      root.createDiv({ cls: 'myu-code', text: approval.code });
      root.createEl('p', { cls: 'myu-prose myu-quiet', text: 'It finishes on its own. Approve it there and come back. The code works for a few minutes.' });
      const actions = root.createDiv({ cls: 'myu-door-stack' });
      phraseDoor(actions, 'Use my recovery phrase instead');
      const cancel = actions.createEl('button', { cls: 'myu-affordance', text: 'Cancel' });
      cancel.onclick = () => {
        unlock.cancelApproval();
        again();
      };
      return;
    }

    root.createEl('p', {
      cls: 'myu-prose',
      text:
        detail === 'device_revoked'
          ? 'This device was removed from your account. Approve it again to continue.'
          : detail === 'key_mismatch'
            ? 'This device’s key no longer matches your account. Approve it again to continue.'
            : 'You are signed in, but this device is not approved yet. Your notes are encrypted with a key that only your approved devices have.',
    });
    if (approval) {
      root.createEl('p', {
        cls: 'myu-prose myu-warn',
        text: approval.status === 'failed' ? approvalFailureText(approval.failure) : approval.status === 'denied' ? 'That request was declined on the other device.' : 'The request timed out.',
      });
    }
    const doors = root.createDiv({ cls: 'myu-door-stack' });
    const go = doors.createEl('button', { cls: 'myu-door-primary', text: approval ? 'Try again' : 'Get this device approved…' });
    go.onclick = async () => {
      go.disabled = true;
      const pending = await unlock.beginApproval();
      if (!pending) notifyError('Could not start the approval. Check the connection and try again.');
      again();
    };
    const alt = doors.createDiv({ cls: 'myu-door-alt' });
    alt.createSpan({ cls: 'myu-quiet', text: 'No other device nearby?' });
    phraseDoor(alt, 'Use my recovery phrase');
    const out = root.createDiv({ cls: 'myu-door-alt' });
    out.createSpan({ cls: 'myu-quiet', text: 'Not you?' });
    const signout = out.createEl('button', { cls: 'myu-affordance', text: 'Sign out' });
    signout.onclick = async () => {
      await unlock.disconnect();
      again();
    };
  }

  /**
   * P8 first-run choreography — the folder visibly filling ("6 of 38 · Jim's
   * file just appeared"). Declared progress beats a silent partial folder,
   * which reads as broken (§First-run, regime 3 applied to day one).
   */
  private renderMaterializeProgress(root: HTMLElement): void {
    const line = this.plugin.materializeProgress;
    if (!line) return;
    const row = root.createDiv({ cls: 'myu-cue-row myu-materialize-progress' });
    row.createSpan({ cls: 'myu-quiet', text: line });
  }

  /**
   * The progress line moved: repaint THAT ROW, nothing else, no fetch. A row
   * that does not exist yet (the sweep just started) means one local render;
   * a line that went away means the row goes. (Every line used to be a full
   * refresh — six backend calls — 2026-09-03.)
   */
  paintProgress(): void {
    const line = this.plugin.materializeProgress;
    const row = this.contentEl.querySelector('.myu-materialize-progress');
    if (line && row) {
      const span = row.querySelector('span');
      if (span) span.textContent = line;
      return;
    }
    if (!line && row) {
      row.remove();
      return;
    }
    if (line && !row && !this.loading && !this.errorState) this.render();
  }

  /**
   * The menu's marks on a phone (2026-10-06), where Obsidian has no status bar: what is new in Myu's places
   * ("3 new in Today · 2 in Spaces"), lit, at the top of the pane. Nothing on a computer, nothing when nothing is new.
   */
  private renderMenuMarks(root: HTMLElement): void {
    const line = this.plugin.menuMarksLine();
    if (line) root.createDiv({ cls: 'myu-menu-new', text: line });
  }

  /**
   * The marks moved: repaint THAT LINE, nothing else, no fetch. A line that is not there yet goes in at the top; a
   * line with nothing left to say goes. Only over the day itself (not while it opens, rests or waits at the terms).
   */
  paintMenuMarks(): void {
    if (this.loading || this.errorState || this.plugin.termsStanding() === 'gated') return;
    const line = this.plugin.menuMarksLine();
    const row = this.contentEl.querySelector('.myu-menu-new');
    if (!line) {
      row?.remove();
      return;
    }
    if (row) row.textContent = line;
    else this.contentEl.createDiv({ cls: 'myu-menu-new', text: line, prepend: true });
  }

  /**
   * The rows' dots as drawn last, each with its way to draw itself again. Made on first use (a view built without its
   * constructor, as the tests do, has none).
   */
  private dots: Array<() => void> = [];
  private dotPainters(): Array<() => void> {
    this.dots ??= [];
    return this.dots;
  }

  /**
   * A row's dot (2026-10-06, the operator's rule: orange is always new). Lit, in the colour of the status bar's "new",
   * while something came in for the row since Today was opened before this visit: a question or a note alike. Grey
   * while a question there waits for an answer. New wins while it lasts. With no marks from the server nothing is
   * known to be new, and only what waits is marked.
   */
  private drawDot(mark: HTMLElement, lines: MyuLineLite[]): void {
    mark.empty();
    const dot = entryDot(lines, this.plugin.menuMarks?.since('home') ?? null);
    if (dot) mark.createSpan({ cls: dot === 'new' ? 'myu-dot' : 'myu-dot myu-dot-waiting', attr: { 'aria-label': ENTRY_DOT_WORDS[dot] } });
  }

  /**
   * The marks moved, or Today was opened: repaint THE DOTS, nothing else, no fetch. What is new is counted from when
   * Today was opened before this visit, so an opening changes it. Only over the day itself.
   */
  paintDots(): void {
    if (this.loading || this.errorState || this.plugin.termsStanding() === 'gated') return;
    for (const paint of this.dotPainters()) paint();
  }

  /**
   * "From Myu — Friday, 12 September", then the brief in Myu's voice. The
   * title is the label that says who is speaking, so the voice needs no
   * whisper of its own. The first two items lead; the rest sit behind
   * `+N more` (R7: OUR trimming is disclosed — the server already disclosed
   * its own via suppressed_count).
   */
  private renderBrief(root: HTMLElement): void {
    const zone = root.createDiv({ cls: 'myu-zone myu-from-myu' });
    zone.createEl('h2', { cls: 'myu-from-myu-title', text: `From Myu — ${dateTitle(new Date())}` });

    const all = (this.brief?.sections ?? [])
      .filter((s) => s.visible && s.section !== 'week') // the week edition has its own zone
      .flatMap((s) => s.items ?? []);
    const items = this.briefExpanded ? all : all.slice(0, 2);
    const held = all.length - 2;

    if (items.length === 0) {
      // Only a fetch that actually landed may call the day empty.
      zone.createEl('p', {
        cls: 'myu-quiet',
        text: this.loadedOnce ? 'Nothing urgent today.' : 'Still loading your day…',
      });
    }

    for (const item of items) {
      zone.createEl('p', { cls: 'myu-voice myu-brief-line', text: item.text ?? '' });
    }

    if (!this.briefExpanded && held > 0) {
      const more = zone.createEl('button', { cls: 'myu-affordance myu-link-button', text: `+${held} more` });
      more.onclick = () => {
        this.briefExpanded = true;
        this.render();
      };
    }

    const suppressed = this.brief?.suppressed_count ?? 0;
    if (suppressed > 0) {
      // R7: suppression is disclosed, never silent.
      zone.createEl('p', {
        cls: 'myu-quiet',
        text: suppressed === 1 ? '1 less certain item hidden' : `${suppressed} less certain items hidden`,
      });
    }
  }

  // ── the rows: a meeting, a person, a company, a space — and Myu's line under it ──

  /** The lines under one meeting's row: the occurrence first, the event otherwise. */
  private linesForMeeting(m: Meeting): MyuLineLite[] {
    const all = this.todayLines ?? [];
    const isMeeting = (l: MyuLineLite, withKey: boolean) =>
      (l.subjects ?? []).some(
        (s) => s.type === 'meeting' && s.id === m.event_id && (!withKey || !s.occurrence_key || s.occurrence_key === String(m.startDate.getTime())),
      );
    const exact = all.filter((l) => isMeeting(l, true));
    return exact.length ? exact : all.filter((l) => isMeeting(l, false));
  }

  private nonMeetingLines(): MyuLineLite[] {
    // A space's line rides its space's row under "spaces", never a row here.
    return (this.todayLines ?? []).filter((l) => (l.subjects?.[0]?.type ?? 'person') !== 'meeting' && !isSpaceLine(l));
  }

  /**
   * One row as the mock draws it: the mark (a dot: lit when something new
   * came in for the row, grey when a question there waits), the time, the
   * title with who, Myu's line under it in the theme's accent (a tell in its
   * success colour, a waiting line quiet), and the doors on the right.
   */
  private row(
    host: HTMLElement,
    r: {
      /** What this row is about: keeps its fold open across a refresh. */
      key: string;
      time: string;
      title: string;
      small?: string;
      lines: MyuLineLite[];
      past?: boolean;
      acts: Array<{ label: string; onClick: () => void }>;
    },
  ): void {
    const row = host.createDiv({ cls: `myu-mrow${r.past ? ' myu-mrow-past' : ''}` });
    const mark = row.createSpan({ cls: 'myu-mark' });
    this.drawDot(mark, r.lines);
    this.dotPainters().push(() => this.drawDot(mark, r.lines));
    row.createSpan({ cls: 'myu-time', text: r.time });
    const body = row.createDiv({ cls: 'myu-mrow-body' });
    const ttl = body.createDiv({ cls: 'myu-ttl', text: r.title });
    if (r.small) ttl.createSpan({ cls: 'myu-ttl-small', text: r.small });
    // One line on the row, the rest behind a count: the backend writes many lines per subject.
    // A question answered here comes first, with what Myu said back; the next one follows.
    const { ui: lineUi, answered } = this.lineState();
    const saidHere = r.lines.filter((l) => answered.has(l.line_id));
    const stack = stackOf(r.lines.filter((l) => !answered.has(l.line_id)));
    const say = (l: MyuLineLite) => {
      // Outside a space a question is answered here, with its buttons; a space's line is answered
      // in the space's own conversation, one ask at a time, so its row shows only the words.
      if (!isSpaceLine(l)) {
        renderLineAsk(body, l, lineUi.get(l.line_id) ?? {}, { press: (b) => void this.pressLine(l, b) });
        return;
      }
      const cls = l.ask_kind === 'tell' ? 'myu-done' : l.ask_kind === 'wait' ? 'myu-quiet' : 'myu-line';
      const line = body.createDiv({ cls, text: (l.text ?? '').trim(), attr: lineIdAttr(l.line_id) });
      if (l.est && l.ask_kind !== 'tell' && l.ask_kind !== 'wait') line.createSpan({ cls: 'myu-est', text: l.est });
    };
    saidHere.forEach(say);
    if (stack.top) say(stack.top);
    if (stack.count) {
      const open = this.openStacks.has(r.key);
      const fold = body.createEl('button', { cls: 'myu-aff myu-fold-aff', text: `${stack.count} — ${open ? 'hide' : 'show'} ▸`, attr: { 'aria-expanded': String(open) } });
      fold.onclick = () => {
        if (open) this.openStacks.delete(r.key);
        else this.openStacks.add(r.key);
        this.render();
      };
      if (open) stack.rest.forEach(say);
    }
    // The doors sit under the title and its line, as the mock's `.ask` does.
    if (r.acts.length === 0) return;
    const acts = body.createDiv({ cls: 'myu-mrow-acts' });
    for (const a of r.acts) {
      const b = acts.createEl('button', { cls: 'myu-aff', text: a.label });
      b.onclick = a.onClick;
    }
  }

  /**
   * One of a question's buttons: the answer (`POST /myu/lines/answer`), the pages it opens (a
   * calendar consent, the invite's compose), what Myu said back, then the pane again.
   */
  private async pressLine(line: MyuLineLite, button: LineButton): Promise<void> {
    const id = line.line_id;
    const { ui, answered } = this.lineState();
    if (ui.get(id)?.busy) return;
    ui.set(id, { busy: true });
    this.render();
    const out = await pressLineButton({ answer: (lineId, answer) => this.plugin.backend.answerMyuLine(lineId, answer), apiBase: this.plugin.settings.base_url }, line, button);
    // Closed under the press: read the list again and show what is open now; nothing about this one.
    if (out.closed) {
      ui.delete(id);
      await this.refresh();
      return;
    }
    for (const url of out.open) window.open(url, '_blank');
    // The meeting arc's Now: the meeting's own conversation, where Myu wrote the first turn.
    if (out.conversation) void this.plugin.openConversationRef(out.conversation, line.subjects?.[0]?.label ?? '');
    ui.set(id, out.ui);
    if (out.settled) answered.add(id);
    this.render();
    if (out.settled) await this.refresh();
  }

  /** "6 people" — a count, never who. */
  private who(m: Meeting): string {
    const n = m.attendee_emails?.length ?? 0;
    return n > 1 ? `${n} people` : '';
  }

  /** talk ▸ — the chat pane opens about this meeting, Myu speaking first. */
  private talkAboutMeeting(m: Meeting, phase: 'before' | 'after'): void {
    const lines = this.linesForMeeting(m);
    const line = stackOf(lines).top ?? lines.find((l) => (l.text ?? '').trim());
    void this.plugin.openChatAbout('meeting', m.event_id, {
      label: m.summary || 'Meeting',
      occurrenceKey: String(m.startDate.getTime()),
      phase,
      line: line?.text,
      lineObj: line,
    });
  }

  /**
   * The spaces this person belongs to: always here, under their own heading, one row each. Two
   * doors: the space's own conversation with Myu (its words say where the person is in getting
   * ready), and the team's retro (the questions, what people wrote, the tasks). An interview
   * debrief's space has the first door only. Someone in many spaces sees the ones that need them
   * and the first few; the rest sit behind "Show N more".
   */
  private renderSpaces(root: HTMLElement): void {
    const rows = spaceRows(this.spaces, this.todayLines ?? []);
    if (rows.length === 0) return;
    const zone = root.createDiv({ cls: 'myu-zone' });
    zone.createDiv({ cls: 'myu-whisper', text: 'spaces' });
    const { shown, folded } = foldSpaceRows(rows, (r) => r.lines.some(lineNeedsYou));
    for (const r of this.spacesOpen ? [...shown, ...folded] : shown) {
      const first = stackOf(r.lines).top ?? r.lines[0];
      this.row(zone, {
        key: `space:${r.space_id}`,
        time: '',
        title: r.name,
        small: r.small,
        lines: r.lines,
        // An interview debrief: one door, into its conversation. A team's space: its conversation and its retro.
        acts: r.debrief
          ? [{ label: DEBRIEF_PANE_WORDS.door, onClick: () => void this.plugin.openChatAbout('space', r.space_id, { label: r.name, line: first?.text, debrief: true }) }]
          : [
              { label: this.spaceDoors.get(r.space_id) ?? spaceDoorLabel(null), onClick: () => void this.plugin.openChatAbout('space', r.space_id, { label: r.name, line: first?.text }) },
              { label: SPACE_RETRO_WORDS.show, onClick: () => void this.plugin.openChatAbout('space', r.space_id, { label: r.name, retro: true }) },
            ],
      });
    }
    if (folded.length === 0) return;
    const more = zone.createEl('button', {
      cls: 'myu-aff myu-fold-aff',
      text: this.spacesOpen ? 'Show fewer ▸' : `Show ${folded.length} more ▸`,
      attr: { 'aria-expanded': String(this.spacesOpen) },
    });
    more.onclick = () => {
      this.spacesOpen = !this.spacesOpen;
      this.render();
    };
  }

  /**
   * People and companies Myu has something to say about: ONE row each, its door the
   * conversation. Rows that need you come first; past the first few the rest fold behind
   * "Show N more", so a busy day cannot push the meetings off the pane.
   */
  private renderForYou(root: HTMLElement): void {
    const groups = groupBySubject(this.nonMeetingLines());
    if (groups.length === 0) return;
    const zone = root.createDiv({ cls: 'myu-zone' });
    zone.createDiv({ cls: 'myu-whisper', text: 'for you' });
    const { shown, folded } = foldRows(groups);
    for (const g of this.forYouOpen ? [...shown, ...folded] : shown) {
      const first = stackOf(g.lines).top ?? g.lines[0];
      this.row(zone, {
        key: g.key,
        time: '',
        title: g.label,
        lines: g.lines,
        // A drafted interview debrief's row has no conversation behind it: its line is answered here.
        acts: rowOpensConversation(g) ? [{ label: 'talk about this ▸', onClick: () => void this.plugin.openChatAbout(g.type, g.id, { label: g.label, line: first?.text, lineObj: first }) }] : [],
      });
    }
    if (folded.length === 0) return;
    const more = zone.createEl('button', {
      cls: 'myu-aff myu-fold-aff',
      text: this.forYouOpen ? 'Show fewer ▸' : `Show ${folded.length} more ▸`,
      attr: { 'aria-expanded': String(this.forYouOpen) },
    });
    more.onclick = () => {
      this.forYouOpen = !this.forYouOpen;
      this.render();
    };
  }

  /**
   * Next, then Earlier — today's meetings as rows with Myu's line under each.
   * `talk ▸` on every row; `prepare ▸` on the next meeting only. An earlier
   * meeting's talk is the after-conversation ("how it went").
   */
  private renderNext(root: HTMLElement): void {
    const now = Date.now();
    // A 15-min grace keeps a just-started meeting under Next (you're walking
    // in, prep still helps); everything earlier moves to Earlier.
    const grace = now - 15 * 60 * 1000;
    const meetings = this.meetings ?? [];
    const upcoming = meetings.filter((m) => m.startDate.getTime() > grace);
    const earlier = meetings.filter((m) => m.startDate.getTime() <= grace).reverse();

    const zone = root.createDiv({ cls: 'myu-zone' });
    zone.createDiv({ cls: 'myu-whisper', text: 'next' });
    if (upcoming.length === 0) {
      zone.createEl('p', { cls: 'myu-quiet', text: earlier.length > 0 ? 'Nothing more today.' : 'No meetings today.' });
    }
    upcoming.slice(0, 6).forEach((m, index) => {
      const lines = this.linesForMeeting(m);
      this.row(zone, {
        key: `meeting:${m.event_id}:${m.startDate.getTime()}`,
        time: timeLabel(m.startDate),
        title: m.summary || 'Meeting',
        small: this.who(m),
        lines,
        acts: [
          { label: 'talk about this ▸', onClick: () => this.talkAboutMeeting(m, 'before') },
          ...(index === 0 ? [{ label: 'prepare ▸', onClick: () => void this.plugin.openPrep(m.event_id) }] : []),
        ],
      });
    });

    if (earlier.length === 0) return;
    const past = root.createDiv({ cls: 'myu-zone' });
    past.createDiv({ cls: 'myu-whisper', text: 'earlier' });
    for (const m of earlier.slice(0, 4)) {
      const lines = this.linesForMeeting(m);
      this.row(past, {
        key: `meeting:${m.event_id}:${m.startDate.getTime()}`,
        time: timeLabel(m.startDate),
        title: m.summary || 'Meeting',
        small: this.who(m),
        lines,
        past: true,
        acts: [{ label: 'talk about this ▸', onClick: () => this.talkAboutMeeting(m, 'after') }],
      });
    }
  }

  // ── Open with you today ────────────────────────────────────────────────────

  private folder(): string {
    return this.plugin.settings?.materialize_folder || 'Myu';
  }

  /** `[[Myu/People/Dan Park|Dan Park]]` — their own page when they keep one. */
  private openPerson(name: string): void {
    const own = this.plugin.personIndex?.find(name)?.path ?? null;
    const path = own ?? `${this.folder()}/People/${sanitizeName(name)}.md`;
    void this.app.workspace.openLinkText(path, '', true);
  }

  /**
   * The open commitments as Tasks checkboxes: owner as a wikilink, the words,
   * the due date, where it came from. Soonest first, six shown, the rest in
   * the Commitments file. Ticking marks it done in Myu through the same
   * vault-interaction path the folder watcher uses for the files.
   */
  private renderOpenWithYou(root: HTMLElement): void {
    const open = (this.commitments ?? []).filter((c) => !c.status || c.status === 'open');
    if (open.length === 0) return;
    const state: Record<string, boolean> = this.plugin.settings?.myu_checkbox_state ?? {};
    const zone = root.createDiv({ cls: 'myu-zone myu-open-today' });
    zone.createDiv({ cls: 'myu-whisper', text: 'open items today' });
    const list = zone.createEl('ul', { cls: 'myu-tasks' });
    const sorted = [...open].sort((a, b) => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999'));
    for (const c of sorted.slice(0, 6)) {
      const checked = !!state[c.commitment_id];
      const li = list.createEl('li', { cls: `myu-task${checked ? ' myu-task-done' : ''}` });
      const box = li.createEl('input', { attr: { type: 'checkbox', 'aria-label': 'Mark this done in Myu' } });
      box.checked = checked;
      const body = li.createSpan({ cls: 'myu-task-body' });
      if (c.owner) {
        const owner = c.owner;
        const link = body.createSpan({ cls: 'myu-wl', text: owner });
        link.onclick = () => this.openPerson(owner);
        body.createSpan({ text: ' ' });
      }
      body.createSpan({ text: (c.content ?? '').trim() || '(encrypted — open in Myu)' });
      if (c.deadline) body.createSpan({ cls: 'myu-task-date', text: ` 📅 ${c.deadline.slice(0, 10)}` });
      if (c.meeting_title) body.createSpan({ cls: 'myu-task-from', text: ` (from ${c.meeting_title})` });
      box.onchange = () => void this.tickCommitment(c, box.checked);
    }
    if (sorted.length > 6) {
      const more = zone.createEl('button', { cls: 'myu-affordance myu-link-button', text: `+${sorted.length - 6} more in Commitments` });
      more.onclick = () => void this.app.workspace.openLinkText(`${this.folder()}/Commitments.md`, '', true);
    }
  }

  /**
   * "what you owe ▸", folded (terminal parity, 2026-09-26): the web's Home and the phone's Today show the same two
   * lists, "you owe" and "owed to you", each row `what · name · next check <day>` with the status as sent. A row
   * opens the other person's conversation. Nothing running either way: nothing is drawn.
   */
  private renderWhatYouOwe(root: HTMLElement): void {
    const fold = commitmentsFold(this.owed);
    if (fold.empty) return;
    const zone = root.createDiv({ cls: 'myu-zone myu-owed' });
    const head = zone.createEl('button', {
      cls: 'myu-affordance myu-link-button myu-whisper',
      text: `${COMMITMENTS_FOLD_WORDS.title.toLowerCase()} ${this.owedOpen ? '▾' : '▸'}`,
      attr: { 'aria-expanded': String(this.owedOpen) },
    });
    head.onclick = () => {
      this.owedOpen = !this.owedOpen;
      this.render();
    };
    if (!this.owedOpen) return;
    const list = (title: string, rows: CommitmentRow[], more: number) => {
      if (!rows.length) return;
      zone.createDiv({ cls: 'myu-whisper', text: title });
      for (const r of rows) {
        const row = zone.createEl('button', { cls: 'myu-row myu-row-tappable myu-owed-row', text: r.text });
        const open = r.open;
        if (open) row.onclick = () => void this.plugin.openChatAbout(open.subject_type, open.subject_id, { label: open.label });
        else row.disabled = true;
      }
      if (more > 0) zone.createDiv({ cls: 'myu-quiet', text: COMMITMENTS_FOLD_WORDS.more(more) });
    };
    list(COMMITMENTS_FOLD_WORDS.youOwe, fold.youOwe, fold.moreYouOwe);
    list(COMMITMENTS_FOLD_WORDS.owedToYou, fold.owedToYou, fold.moreOwedToYou);
  }

  private async tickCommitment(c: VaultCommitment, checked: boolean): Promise<void> {
    const s = this.plugin.settings;
    const event: VaultInteractionEvent = {
      myu_id: c.commitment_id,
      kind: checked ? 'tick' : 'untick',
      after: commitmentLine(c, checked),
      source_timestamp: Date.now(),
    };
    const res = await safe(() => this.plugin.backend.vaultInteraction([event]));
    if (!res?.ok) {
      // Offline or refused: queue it exactly as the folder watcher does; the
      // box keeps the tick so the pane says what you did.
      s.vault_event_queue.push(event);
      s.myu_checkbox_state[c.commitment_id] = checked;
      await this.plugin.saveSettings();
      this.render();
      return;
    }
    for (const r of res.data?.results ?? []) {
      if (r.kind === 'tick' && r.outcome === 'resolved') s.myu_checkbox_state[r.myu_id] = true;
      else if (r.kind === 'untick') s.myu_checkbox_state[r.myu_id] = r.outcome === 'restored';
    }
    await this.plugin.saveSettings();
    // The Commitments file and the person's file follow the server now, not on the next sweep.
    void this.plugin.materializer?.refreshCommitmentSurfaces().catch(() => undefined);
    await this.refresh();
  }

  /**
   * P4.4 — a quiet catch-up row when this month's mirror edition hasn't been
   * looked at yet. The email remains the OWNED pointer; this is the pane
   * catching you up, once, and then never again for that period.
   */
  private renderMonthlyPointer(root: HTMLElement): void {
    const edition = this.mirror;
    if (!edition) return;
    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (edition.period !== currentPeriod) return;
    if (this.plugin.settings.monthly_seen[edition.period]) return;

    const row = root.createEl('button', { cls: 'myu-cue-row myu-row-tappable' });
    row.createSpan({ cls: 'myu-claim', text: 'your monthly review is ready' });
    setIcon(row.createSpan({ cls: 'myu-affordance-inline myu-chevron', attr: { 'aria-hidden': 'true' } }), 'chevron-right');
    row.onclick = () => {
      this.plugin.settings.monthly_seen[edition.period] = true;
      void this.plugin.saveSettings();
      this.render();
      // The review IS the mirror zone below — scroll it into view.
      this.contentEl.querySelector('.myu-mirror')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
  }

  /** "the week" — the server weekly edition, verbatim, only while fresh. */
  /** Sync, always within reach (operator, 2026-08-29): the button lives at the top of Today, whatever else the day holds. */
  private giveLine: string | null = null;
  private loop: PersonalLoop | null = null;
  private coupledLoops: CoupledLoop[] = [];
  private loopRated: 1 | -1 | null = null;

  /**
   * The web's PersonalLoopStrip: Myu's one-sentence read of you, what it is
   * coupled to, and rate-the-read (feedback/signal). A whisper zone, not a card.
   */
  private renderLoop(root: HTMLElement): void {
    const loop = this.loop;
    if (!loop?.statement) return;
    const zone = root.createDiv({ cls: 'myu-zone myu-loop' });
    zone.createDiv({ cls: 'myu-whisper', text: `about you${loop.domain ? ` \u00b7 ${loop.domain}` : ''}` });
    zone.createDiv({ cls: 'myu-voice', text: loop.statement });
    for (const c of this.coupledLoops) {
      if (!c.other_statement) continue;
      const row = zone.createDiv({ cls: 'myu-row' });
      row.createSpan({ cls: 'myu-time', text: c.type ?? 'with' });
      row.createSpan({ cls: 'myu-row-title', text: c.other_statement });
    }
    const rate = zone.createDiv({ cls: 'myu-chat-rating' });
    if (this.loopRated) { rate.createSpan({ cls: 'myu-whisper', text: this.loopRated === 1 ? 'Marked as helpful' : 'Marked as not helpful' }); return; }
    for (const [rating, icon, label] of [[1, 'thumbs-up', 'Helpful'], [-1, 'thumbs-down', 'Not helpful']] as const) {
      const b = rate.createEl('button', { cls: 'myu-affordance myu-icon-button myu-rating-btn', attr: { 'aria-label': `${label} \u2014 rate this` } });
      setIcon(b, icon);
      b.onclick = () => {
        this.loopRated = rating;
        this.render();
        void this.plugin.backend.submitFeedbackSignal({ subject_type: 'personal_loop', subject_id: loop.loop_id, rating, subject_text: loop.statement, surface: 'personal_loop_strip', context: { loop_state: loop.state, loop_confidence: loop.confidence, loop_domain: loop.domain } }).catch(() => undefined);
      };
    }
  }

  /** insight_ready, as rows — the web's insight card lives in a side panel; cards stay in Today here (invariant 4). */
  private renderInsights(root: HTMLElement): void {
    const items = this.plugin.liveInsights;
    if (items.length === 0) return;
    const zone = root.createDiv({ cls: 'myu-zone myu-insights' });
    zone.createDiv({ cls: 'myu-whisper', text: 'noticed just now' });
    for (const it of items) {
      const row = zone.createDiv({ cls: 'myu-offer-row' });
      row.createSpan({ cls: 'myu-claim', text: it.summary ? `${it.title} \u2014 ${it.summary}` : it.title });
      if (it.personId) {
        const open = row.createEl('button', { cls: 'myu-affordance', text: it.personName || 'Open' });
        open.onclick = () => void this.plugin.openCard('person', it.personId as string, it.personName || 'Person');
      }
      const drop = row.createEl('button', { cls: 'myu-affordance myu-icon-button', attr: { 'aria-label': 'Dismiss' } });
      setIcon(drop, 'x');
      drop.onclick = () => { this.plugin.liveInsights = this.plugin.liveInsights.filter((x) => x !== it); this.render(); };
    }
  }

  private renderSyncBar(root: HTMLElement): void {
    if (this.staleSince) {
      const mins = Math.max(1, Math.round((Date.now() - this.staleSince) / 60000));
      root.createDiv({ cls: 'myu-quiet', text: `Couldn\u2019t reach Myu ${mins === 1 ? 'a minute' : `${mins} minutes`} ago. Showing the last update and trying again.` });
    }
    const bar = root.createDiv({ cls: 'myu-sync-bar' });
    const sync = bar.createEl('button', { cls: 'myu-affordance myu-icon-button', attr: { 'aria-label': 'Sync everything from Myu now' } });
    setIcon(sync, 'refresh-cw');
    sync.onclick = () => { sync.disabled = true; void this.plugin.syncNow().finally(() => { sync.disabled = false; void this.refresh(); }); };
    const at = this.plugin.lastSyncAt;
    if (at) bar.createSpan({ cls: 'myu-whisper', text: `synced ${Math.max(0, Math.round((Date.now() - at) / 60000))} min ago` });
    // The switch is a setting; the whisper is the way there ("how does one
    // turn on/off the auto sync" — operator, 2026-08-29).
    const mode = bar.createEl('button', { cls: 'myu-affordance myu-link-button', text: this.plugin.settings.sync_on_open ? 'syncs when the vault opens \u00b7 change' : 'sync on open is off \u00b7 change', attr: { 'aria-label': 'Change whether Myu syncs when the vault opens (opens settings)' } });
    mode.onclick = () => this.plugin.openSettingsAt('Sync when the vault opens');
  }

  private renderWeek(root: HTMLElement): void {
    if (!this.weekly || this.weekly.sections.length === 0) return;

    const zone = root.createDiv({ cls: 'myu-zone' });
    zone.createDiv({ cls: 'myu-whisper', text: 'the week' });

    for (const section of this.weekly.sections) {
      zone.createDiv({ cls: 'myu-claim myu-week-line', text: section.line });
      for (const item of section.items ?? []) {
        zone.createDiv({ cls: 'myu-quiet myu-week-item', text: item });
      }
    }
  }

  /**
   * The mirror (A11, two-layer) — "noticed this month". Last: the day first,
   * the meetings, then the self. Same register rules as web/mobile:
   * render verbatim, absence renders nothing (zone chrome included), serif =
   * Myu's voice, `wrong` is one tap with an optional refine row, the map
   * layer offers `doesn't fit`, receipts sit behind `why`. Dismissed
   * lines collapse to a quiet "noted." rather than vanishing mid-read.
   * Nothing here calls `Notice` (invariant 4) — the mirror pane IS the channel.
   */
  private renderMirror(root: HTMLElement): void {
    if (!this.mirror) return;

    const zone = root.createDiv({ cls: 'myu-zone myu-mirror' });
    zone.createDiv({ cls: 'myu-whisper', text: 'noticed this month' });
    zone.createEl('p', { cls: 'myu-quiet myu-mirror-caveat', text: 'These are patterns Myu noticed, not conclusions. Each may be wrong.' });

    for (const obs of this.mirror.observations) {
      this.renderMirrorObservation(zone, obs);
    }
  }

  private renderMirrorObservation(zone: HTMLElement, obs: MirrorObservation): void {
    const box = zone.createDiv({ cls: 'myu-mirror-obs' });
    const state = this.mirrorFeedback.get(obs.observation_id) ?? 'idle';

    if (state === 'done') {
      box.createEl('p', { cls: 'myu-quiet', text: 'Okay.' });
      return;
    }

    const line = box.createDiv({ cls: 'myu-voice myu-mirror-voice', text: obs.text });
    if (obs.forming) line.createSpan({ cls: 'myu-mirror-forming', text: '  still forming' });

    const isMap = obs.layer === 'map';
    const actions = box.createDiv({ cls: 'myu-mirror-actions' });

    const talk = actions.createEl('button', { cls: 'myu-mirror-ctl', text: 'Talk about this' });
    talk.onclick = () =>
      void this.plugin.openChat({
        text: '',
        send: false,
        context: {
          source: 'mirror',
          source_id: obs.observation_id,
          entity_references: [],
        },
      });

    if (obs.receipts && obs.receipts.length > 0) {
      const why = actions.createEl('button', { cls: 'myu-mirror-ctl', text: 'Why' });
      why.onclick = () => {
        if (this.mirrorReceiptsOpen.has(obs.observation_id)) this.mirrorReceiptsOpen.delete(obs.observation_id);
        else this.mirrorReceiptsOpen.add(obs.observation_id);
        this.render();
      };
    }

    // The map layer asks a question, so BOTH answers must be a tap away —
    // a question whose only answer is "no" isn't one. Once the backend marks
    // the fit confirmed, the text arrives as settled ground: no fit controls.
    if (state === 'idle' && isMap && !obs.confirmed) {
      const fits = actions.createEl('button', { cls: 'myu-mirror-ctl', text: 'That fits' });
      fits.onclick = () => {
        this.recordMirrorFeedback(obs, 'confirmed');
        this.mirrorFeedback.set(obs.observation_id, 'confirmed');
        this.render();
      };
    }
    if (state === 'idle' && !(isMap && obs.confirmed)) {
      const wrong = actions.createEl('button', { cls: 'myu-mirror-ctl', text: isMap ? "doesn't fit\u2026" : 'Wrong' });
      wrong.onclick = () => {
        this.recordMirrorFeedback(obs, 'wrong');
        // The map's real correction path is re-classifying the career moment;
        // the tap is still recorded, and either way the line goes quiet now.
        this.mirrorFeedback.set(obs.observation_id, isMap ? 'done' : 'refine');
        this.render();
      };
    }
    if (state === 'confirmed') {
      actions.createSpan({ cls: 'myu-mirror-ctl-label', text: 'noted' });
    }

    if (state === 'refine') {
      const refine = box.createDiv({ cls: 'myu-mirror-actions' });
      refine.createSpan({ cls: 'myu-mirror-ctl-label', text: 'noted —' });
      const options: Array<[PatternFeedbackEvent, string]> = [
        ['wrong_facts', 'Wrong facts'],
        ['wrong_reading', 'Wrong conclusion'],
        ['true_drop_it', 'True, but drop it'],
      ];
      for (const [evt, label] of options) {
        const btn = refine.createEl('button', { cls: 'myu-mirror-ctl', text: label });
        btn.onclick = () => {
          this.recordMirrorFeedback(obs, evt);
          this.mirrorFeedback.set(obs.observation_id, 'done');
          this.render();
        };
      }
      const skip = refine.createEl('button', { cls: 'myu-mirror-ctl', text: 'Skip' });
      skip.onclick = () => {
        this.mirrorFeedback.set(obs.observation_id, 'done');
        this.render();
      };
    }

    if (this.mirrorReceiptsOpen.has(obs.observation_id) && obs.receipts) {
      const receipts = box.createDiv({ cls: 'myu-mirror-receipts' });
      for (const r of obs.receipts) {
        receipts.createEl('p', { cls: 'myu-quiet myu-mirror-receipt', text: r.label ?? r.source ?? 'source' });
      }
    }
  }

  /** One tap, zero justification — a lost signal never surfaces as an error. */
  private recordMirrorFeedback(obs: MirrorObservation, eventType: PatternFeedbackEvent): void {
    if (!obs.pattern_id) return;
    void this.plugin.backend.submitPatternFeedback(eventType, obs.pattern_id, 'mirror_edition').catch(() => {});
  }

}

function parseEventTime(value: string): Date {
  // Backend sends `YYYY-MM-DD HH:MM:SS` in UTC — the same normalisation the web
  // and mobile clients do.
  return new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
}

function localDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function timeLabel(date: Date): string {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(' ', '');
}
