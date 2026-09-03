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

/**
 * "About 4 minutes left" — from the SERVER's `expires_at`. The window is
 * config (`device_transfer_ttl_secs`), so a client that assumes it starts
 * lying the day it changes; with no expiry given, say nothing rather than
 * guess.
 */
function remainingLabel(expiresAt: number | undefined): string {
  if (!expiresAt) return '';
  const leftMs = expiresAt - Date.now();
  if (leftMs <= 0) return 'This one has expired \u2014 ask that device to try again.';
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
import type { BriefItem, DailyBrief, GoogleCalendarEvent } from '../wire';
import type { CoupledLoop, MirrorEdition, MirrorObservation, PatternFeedbackEvent, PersonalLoop, WeeklyEdition } from '../transport/api';
import { isWeeklyEditionFresh } from '../vault/WeeklyReviewWriter';

export const TODAY_VIEW_TYPE = 'askmyu-today';

/**
 * The one entity a brief item is really about. People first: a line naming a
 * person and their employer is about the person, and opening the company would
 * answer a question nobody asked.
 */
function openTargetFor(item: BriefItem) {
  const refs = item.entity_references ?? [];
  return refs.find((r) => r.entity_type === 'person') ?? refs.find((r) => r.entity_type === 'company') ?? null;
}

export class TodayView extends ItemView {
  private brief: DailyBrief | null = null;
  /** P4.6: the hero shows 2; the rest render on demand. Reset per refresh. */
  private briefExpanded = false;
  private meetings: Array<GoogleCalendarEvent & { startDate: Date }> = [];
  /** P8.8 — the rest of the week, day-labeled doors into prep. */
  private weekAhead: Array<GoogleCalendarEvent & { startDate: Date }> = [];
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
    await this.refresh();
  }

  override async onClose(): Promise<void> {
    if (this.retryTimer !== null) { window.clearTimeout(this.retryTimer); this.retryTimer = null; }
    this.contentEl.empty();
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

    const [briefRes, eventsRes, mirrorRes, weeklyRes, loopRes] = await Promise.all([
      this.plugin.backend.getBrief(),
      this.plugin.backend.getCalendarEvents(localDate(new Date()), localDate(addDays(new Date(), 7))),
      // The mirror rides along but never decides the view's error state — its
      // absence is a designed condition, not a failure to report.
      this.plugin.backend.getMirrorEdition().catch(() => null),
      this.plugin.backend.getWeeklyReview().catch(() => null),
      // The web's personal-loop strip and its Help Myu queue ride along the same way.
      this.plugin.backend.getPersonalLoop().catch(() => null),
      this.plugin.loadHelpQueue().catch(() => undefined),
    ]);
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
    this.weekAhead = dated.filter((e) => localDate(e.startDate) > today);

    this.loading = false;
    this.render();
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

    this.renderSyncBar(root);
    if (this.plugin.termsUpdateVisible()) this.renderTermsUpdate(root);
    this.renderDeviceRequests(root);
    this.renderSetup(root);
    this.renderMaterializeProgress(root);
    this.renderCues(root);
    this.renderInsights(root);
    this.renderOffers(root);
    this.renderHelpMyu(root);
    this.renderWeekEdition(root);
    this.renderLoop(root);
    this.renderBrief(root);
    this.renderNext(root);
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
      // eslint-disable-next-line obsidianmd/ui/sentence-case -- the documents' titles
      text: 'The beta needs one thing first: your agreement to the Beta Participation Terms and the Privacy Policy. Read them, then tick the box.',
    });
    this.renderTermsLinks(zone);
    const label = zone.createEl('label', { cls: 'myu-terms-label' });
    // eslint-disable-next-line obsidianmd/ui/sentence-case -- the documents' titles, and the agreement's own §12 wording
    const box = label.createEl('input', { cls: 'myu-terms-box', attr: { type: 'checkbox', 'aria-label': 'I agree to the Beta Participation Terms and the Privacy Policy' } });
    box.checked = this.termsAgreed;
    label.createSpan({ cls: 'myu-terms-sentence', text: 'I agree to the Beta Participation Terms and the Privacy Policy.' });
    const actions = zone.createDiv({ cls: 'myu-mirror-actions' });
    const go = actions.createEl('button', { cls: 'myu-affordance myu-cta', text: 'Continue' });
    go.disabled = !this.termsAgreed;
    box.onchange = () => {
      this.termsAgreed = box.checked;
      go.disabled = !this.termsAgreed;
    };
    go.onclick = async () => {
      go.disabled = true;
      go.textContent = 'Recording\u2026';
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
    zone.createEl('p', { cls: 'myu-prose', text: `The Beta Participation Terms or the Privacy Policy changed (version ${this.plugin.terms?.currentVersion ?? ''}). You can keep working on the version you agreed to; accepting the new one takes a moment.` });
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
      zone.createDiv({ cls: 'myu-whisper', text: 'a device wants in' });
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
    const row = root.createEl('button', { cls: 'myu-row myu-row-tappable', attr: { 'aria-label': 'People Myu needs help placing' } });
    row.createSpan({ cls: 'myu-row-title', text: `${n} ${n === 1 ? 'person needs' : 'people need'} your help placing them` });
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
      if (item.meta?.cold) row.createDiv({ cls: 'myu-quiet', text: item.meta.first_time ? 'First meeting \u2014 facts only, worth capturing how it lands.' : 'No history here yet \u2014 Myu starts learning this one afterwards.' });
      const actions = row.createDiv({ cls: 'myu-canvas-actions' });
      const eventId = item.actions?.find((a) => a.action_type === 'prep')?.target_id || item.meta?.event_id;
      if (eventId) { const prep = actions.createEl('button', { cls: 'myu-affordance myu-cta', text: 'Prep' }); prep.onclick = () => void this.plugin.openPrep(eventId); }
      if (item.actions?.some((a) => a.action_type === 'capture_after')) {
        const name = item.entity_references?.[0]?.display_name ?? 'them';
        const cap = actions.createEl('button', { cls: 'myu-affordance', text: 'Capture after' });
        cap.onclick = () => void this.plugin.openChat({ text: `After the meeting with ${name}: `, send: false });
      }
    }
  }

  /** Canvases Myu prepared while you were elsewhere — the web's pending-offers strip. Open, or let go. */
  private renderOffers(root: HTMLElement): void {
    const offers = this.plugin.pendingOffers;
    if (offers.length === 0) return;
    const zone = root.createDiv({ cls: 'myu-zone myu-offers' });
    zone.createDiv({ cls: 'myu-whisper', text: 'myu prepared' });
    for (const offer of offers) {
      const row = zone.createDiv({ cls: 'myu-offer-row' });
      row.createSpan({ cls: 'myu-claim', text: (offer.summaryText || 'A canvas') + (offer.subjectName ? ` \u2014 ${offer.subjectName}` : '') });
      const open = row.createEl('button', { cls: 'myu-affordance', text: offer.actionLabel });
      open.onclick = () => void this.plugin.openOffer(offer.compositionId);
      const drop = row.createEl('button', { cls: 'myu-affordance myu-icon-button', attr: { 'aria-label': 'Let this canvas go' } });
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
    const hide = zone.createEl('button', { cls: 'myu-affordance myu-link-button', text: 'Hide setup \u2014 every door stays in settings' });
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
      rows.push({ title: 'Keep what Myu knows in your vault', why: 'One folder, Myu/, renameable: people and companies, your journal by day, meetings, today, commitments as checkboxes, every canvas you keep. Your own notes are never edited.', button: 'Let Myu write\u2026', primary: true, open: () => p.offerResidencyThen(refresh) });
    }
    if (!s.consent_completed) {
      rows.push({ title: 'Choose what Myu may read', why: 'Nothing is read until you choose. Only the folders you choose leave this device, encrypted with a key that stays here.', button: 'Choose folders\u2026', primary: !rows.length, open: () => new ConsentModal(this.app, p, refresh).open() });
    }
    if (s.consent_completed && !s.backfill_done) {
      const { files, oldest } = p.capture.surveyBackfill();
      if (files.length > 0) {
        const months = oldest ? Math.max(1, Math.round((Date.now() - oldest) / (1000 * 60 * 60 * 24 * 30))) : 0;
        rows.push({ title: 'Bring in what you have already written', why: `${files.length} ${files.length === 1 ? 'note' : 'notes'} in the folders you shared${months ? `, going back ${months >= 12 ? `${Math.round(months / 12)} ${Math.round(months / 12) === 1 ? 'year' : 'years'}` : `${months} ${months === 1 ? 'month' : 'months'}`}` : ''}. Preview first; nothing leaves until you press Start.`, button: 'Preview\u2026', open: () => p.offerBackfill() });
      } else if (!s.backfill_done) { s.backfill_done = true; void p.saveSettings(); }
    }
    if (s.consent_completed && s.meeting_folders.length === 0 && !s.meeting_consent_offered) {
      rows.push({ title: 'Share meeting notes', why: 'A separate choice: meeting notes are processed on the server like every meeting source, not end-to-end encrypted like your journal.', button: 'Choose\u2026', open: () => new MeetingConsentModal(this.app, p, refresh).open() });
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
      locked: 'Locked. Myu reopens your notes when this device reaches the server.',
      offline: 'No connection right now. Capture is paused and will catch up.',
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
        text: detail === 'genesis_failed' ? 'Key setup did not finish. Two minutes to try again: the twelve words, then everything works.' : 'One step left: your twelve words. Two minutes, then everything works.',
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
      root.createEl('p', { cls: 'myu-prose myu-quiet', text: 'It finishes on its own: go approve it and come back. The code is good for a few minutes.' });
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
            : 'You are signed in, but this device is not approved yet. Your notes are encrypted with a key only your approved devices hold.',
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
    alt.createSpan({ cls: 'myu-quiet', text: 'No other device handy?' });
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
    const row = root.createDiv({ cls: 'myu-cue-row' });
    row.createSpan({ cls: 'myu-quiet', text: line });
  }

  /**
   * Cue rows — the toast's vault analogue, ambient by construction. Two
   * sources merged: SSE-pushed cues (arrive the moment dispatch delivers) and
   * the client-derived pair as belt-and-suspenders when the stream is down —
   * T-15 before a meeting, and just-ended. All are pane content; none are
   * popups (invariant 4).
   */
  private renderCues(root: HTMLElement): void {
    const now = Date.now();
    const rows: Array<{ text: string; eventId?: string }> = [];

    for (const cue of this.plugin.liveCues) {
      rows.push({ text: cue.text, eventId: cue.event_id });
    }

    // Client-derived fallback: only when SSE didn't already say it.
    for (const meeting of this.meetings) {
      const start = meeting.startDate.getTime();
      const title = meeting.summary || 'Meeting';
      if (start - now > 0 && start - now < 15 * 60 * 1000) {
        rows.push({ text: `prep ready — ${title}`, eventId: meeting.event_id });
      } else if (now - start > 5 * 60 * 1000 && now - start < 90 * 60 * 1000) {
        rows.push({ text: `your read on ${title}?`, eventId: meeting.event_id });
      }
    }

    if (rows.length === 0) return;

    // Dedupe on text — an SSE cue about the meeting the client also derived.
    const seen = new Set<string>();
    const zone = root.createDiv({ cls: 'myu-cues' });
    for (const row of rows.slice(0, 3)) {
      if (seen.has(row.text)) continue;
      seen.add(row.text);
      const el = zone.createEl('button', { cls: 'myu-cue-row' });
      el.createSpan({ cls: 'myu-claim', text: row.text });
      if (row.eventId) {
        const eventId = row.eventId;
        setIcon(el.createSpan({ cls: 'myu-affordance-inline myu-chevron', attr: { 'aria-hidden': 'true' } }), 'chevron-right');
        el.addClass('myu-row-tappable');
        el.onclick = () => void this.plugin.openPrep(eventId);
      }
    }
  }

  private renderBrief(root: HTMLElement): void {
    // Every visible section's items, in section order; the first two are the
    // hero, the rest sit behind `+N more` (R7: OUR trimming is disclosed —
    // the server already disclosed its own via suppressed_count).
    const all = (this.brief?.sections ?? [])
      .filter((s) => s.visible && s.section !== 'week') // the week edition has its own zone
      .flatMap((s) => s.items ?? []);
    const items = this.briefExpanded ? all : all.slice(0, 2);
    const held = all.length - 2;

    if (items.length === 0) {
      // Only a fetch that actually landed may call the day empty.
      root.createEl('p', {
        cls: 'myu-quiet',
        text: this.loadedOnce ? 'Nothing pressing this morning.' : 'Still reading your day\u2026',
      });
    }

    for (const item of items) {
      const row = root.createDiv({ cls: 'myu-hero' });
      // Serif, under its label: this is Myu speaking, and the register says that
      // voice is always marked as such.
      row.createDiv({ cls: 'myu-whisper', text: 'noticing' });
      row.createDiv({ cls: 'myu-voice', text: item.text ?? '' });

      // Affordance from the TARGET, not from the space: an item with nothing to
      // open gets no control. A brief line like "meeting cancelled" carries no
      // entity, and offering `open` on it is a promise the row can't keep.
      const ref = openTargetFor(item);
      if (!ref) continue;

      const open = row.createEl('button', { cls: 'myu-affordance', text: 'Open' });
      open.onclick = () =>
        void this.plugin.openCard(
          ref.entity_type === 'company' ? 'company' : 'person',
          ref.entity_id,
          ref.display_name,
        );
    }

    if (!this.briefExpanded && held > 0) {
      const more = root.createEl('button', { cls: 'myu-affordance', text: `+${held} more` });
      more.onclick = () => {
        this.briefExpanded = true;
        this.render();
      };
    }

    const suppressed = this.brief?.suppressed_count ?? 0;
    if (suppressed > 0) {
      // R7: suppression is disclosed, never silent.
      root.createEl('p', {
        cls: 'myu-quiet',
        text: suppressed === 1 ? '1 lower-confidence item held back' : `${suppressed} lower-confidence items held back`,
      });
    }
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
    zone.createDiv({ cls: 'myu-whisper', text: `the loop${loop.domain ? ` \u00b7 ${loop.domain}` : ''}` });
    zone.createDiv({ cls: 'myu-voice', text: loop.statement });
    for (const c of this.coupledLoops) {
      if (!c.other_statement) continue;
      const row = zone.createDiv({ cls: 'myu-row' });
      row.createSpan({ cls: 'myu-time', text: c.type ?? 'with' });
      row.createSpan({ cls: 'myu-row-title', text: c.other_statement });
    }
    const rate = zone.createDiv({ cls: 'myu-chat-rating' });
    if (this.loopRated) { rate.createSpan({ cls: 'myu-whisper', text: this.loopRated === 1 ? 'good read \u2014 noted' : 'off the mark \u2014 noted' }); return; }
    for (const [rating, icon, label] of [[1, 'thumbs-up', 'Good read'], [-1, 'thumbs-down', 'Off the mark']] as const) {
      const b = rate.createEl('button', { cls: 'myu-affordance myu-icon-button myu-rating-btn', attr: { 'aria-label': `${label} \u2014 rate this read` } });
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
      root.createDiv({ cls: 'myu-quiet', text: `Couldn\u2019t reach Myu ${mins === 1 ? 'a minute' : `${mins} minutes`} ago \u2014 showing what was here, trying again.` });
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
    zone.createEl('p', { cls: 'myu-quiet myu-mirror-caveat', text: 'Patterns, not verdicts — each may be wrong' });

    for (const obs of this.mirror.observations) {
      this.renderMirrorObservation(zone, obs);
    }
  }

  private renderMirrorObservation(zone: HTMLElement, obs: MirrorObservation): void {
    const box = zone.createDiv({ cls: 'myu-mirror-obs' });
    const state = this.mirrorFeedback.get(obs.observation_id) ?? 'idle';

    if (state === 'done') {
      box.createEl('p', { cls: 'myu-quiet', text: 'Noted.' });
      return;
    }

    const line = box.createDiv({ cls: 'myu-voice myu-mirror-voice', text: obs.text });
    if (obs.forming) line.createSpan({ cls: 'myu-mirror-forming', text: '  forming' });

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
        ['wrong_reading', 'Wrong read'],
        ['true_drop_it', 'True — drop it'],
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

  private renderNext(root: HTMLElement): void {
    const now = Date.now();
    // A 15-min grace keeps a just-started meeting under 'next' (you're walking
    // in, prep still helps); everything earlier moves to its OWN section —
    // labelling past meetings 'next' was simply wrong (operator, 2026-08-25).
    const grace = now - 15 * 60 * 1000;
    const upcoming = this.meetings.filter((m) => m.startDate.getTime() > grace);
    const earlier = this.meetings.filter((m) => m.startDate.getTime() <= grace).reverse();

    // ── earlier today: ended meetings, their door is your read/capture ──────
    if (earlier.length > 0) {
      const past = root.createDiv({ cls: 'myu-zone' });
      past.createDiv({ cls: 'myu-whisper', text: 'earlier today' });
      for (const meeting of earlier.slice(0, 4)) {
        const row = past.createEl('button', { cls: 'myu-row myu-row-tappable' });
        row.createSpan({ cls: 'myu-time', text: timeLabel(meeting.startDate) });
        row.createSpan({ cls: 'myu-row-title myu-row-past', text: meeting.summary || 'Meeting' });
        row.createSpan({ cls: 'myu-affordance-inline', text: 'Your read' });
        row.onclick = () => void this.plugin.openPrep(meeting.event_id);
      }
    }

    // ── next: upcoming only ─────────────────────────────────────────────────
    const zone = root.createDiv({ cls: 'myu-zone' });
    zone.createDiv({ cls: 'myu-whisper', text: 'next' });

    if (upcoming.length === 0) {
      zone.createEl('p', { cls: 'myu-quiet', text: earlier.length > 0 ? 'Nothing more today.' : 'No meetings today.' });
    }

    upcoming.slice(0, 5).forEach((meeting, index) => {
      const row = zone.createEl('button', { cls: 'myu-row myu-row-tappable' });
      row.createSpan({ cls: 'myu-time', text: timeLabel(meeting.startDate) });
      row.createSpan({ cls: 'myu-row-title', text: meeting.summary || 'Meeting' });
      row.createSpan({
        cls: index === 0 ? 'myu-affordance-inline' : 'myu-chevron',
        text: index === 0 ? 'Prep' : '›',
      });
      row.onclick = () => void this.plugin.openPrep(meeting.event_id);
    });

    // P8.8 — the agenda widens past today: day-labeled rows, each a door into
    // prep. Not a grid (the vault's own calendar plugins do grids); a row of
    // doors is what a calendar is FOR here.
    if (this.weekAhead.length > 0) {
      zone.createDiv({ cls: 'myu-whisper', text: 'this week' });
      for (const meeting of this.weekAhead.slice(0, 6)) {
        const row = zone.createEl('button', { cls: 'myu-row myu-row-tappable' });
        row.createSpan({ cls: 'myu-time', text: dayLabel(meeting.startDate) });
        row.createSpan({ cls: 'myu-row-title', text: meeting.summary || 'Meeting' });
        row.createSpan({ cls: 'myu-chevron', text: '›' });
        row.onclick = () => void this.plugin.openPrep(meeting.event_id);
      }
      const held = this.weekAhead.length - 6;
      if (held > 0) {
        zone.createEl('p', { cls: 'myu-quiet', text: `+${held} more later this week` });
      }
    }
  }
}

function dayLabel(date: Date): string {
  return date.toLocaleDateString([], { weekday: 'short' }).toLowerCase();
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
