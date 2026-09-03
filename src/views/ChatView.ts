/**
 * ChatView (P6.1) — talk to Myu, beside your notes.
 *
 * Transport mirrors the WEB journal client exactly (the reference
 * implementation, not an inspiration): first message → `POST /journal/add`,
 * turns → `POST /journal_chats/add`, chaining `journal_id`; context rides under
 * both `feed_context` and `context_injection`. The contract is the web's;
 * improvising it is how clients drift.
 *
 * Register: user turns plain; Myu's turns serif under a `myu` whisper — the one
 * type shift, always labeled. The busy state is NAMED ("thinking…"), never
 * spun. Presence, crisis handling, and coaching posture are server-side and
 * arrive in the response — the pane renders what it gets and adds NOTHING: no
 * client rephrasing, no confidence language, no synthetic warmth.
 *
 * Blocks: `conversational` renders verbatim; `composition_offer` renders as a
 * quiet row — `save to vault` (through the P5.5 exporter's exposure modal)
 * plus `view on web`; any unknown block with text renders as text, and one
 * without is skipped — a new block type must degrade, not crash the thread.
 *
 * The conversation can be SAVED (P6.3) — per-conversation `save`, exposure
 * modal, never automatic — via the vault-module ConversationWriter.
 */

import { ItemView, WorkspaceLeaf, setIcon } from 'obsidian';
import type AskMyuPlugin from '../main';
import type { ChatBlock, ChatContext, SourceReferenceLite } from '../wire';
import { CanvasExportModal } from './CanvasExportModal';
import { renderChatBlock, renderReferences, renderRelatedEntries } from './chatBlocks';
import { canvasOnResume, canvasesOnResume, type ChatCanvasOptions, type DeliveredOffer } from '../transport/api';
import type { CompositionSpecLite, CompositionComponentLite } from '../wire';
import { renderComponentActions } from './canvasActions';
import { canvasAsksLine } from './canvasAsks';
import { calloutBox } from './calloutBox';
import { renderInlineCanvas, revealComponent } from './inlineCanvas';
import { linkedInAskInText, suggestionsOf, renderLinkedInMatchesInline, type LinkedInSuggestion } from './linkedinCards';
import { runOfferOption, offerSource } from './offerActions';
import { canvasAfterTurn } from '../composition/afterTurn';
import { ReplyRatingModal } from './ReplyRatingModal';
import { listConversations, loadConversation } from '../conversations';

export const CHAT_VIEW_TYPE = 'askmyu-chat';

export interface ChatTurn {
  role: 'user' | 'myu';
  text?: string;
  blocks?: ChatBlock[];
  /** Cited sources under a reply — the web's Sources footer. */
  references?: SourceReferenceLite[];
  /** Related journal entries — the web's similar-entries list under a first reply. */
  related?: Array<{ journal_id?: string; content_preview?: string }>;
}

export interface ChatSeed {
  text: string;
  /** true = the text is complete; send it. false = pre-fill and focus. */
  send: boolean;
  context?: ChatContext;
  /** Template hint for the FIRST entry only (e.g. 'onboarding_moment') —
      influences backend routing/tone exactly as on the web. */
  templateType?: string;
}

export class ChatView extends ItemView {
  private turns: ChatTurn[] = [];
  /** P8.10 — the conversations browser: past entries, resumable in place. */
  private browsing = false;
  /** Panel behavior (2026-08-25): the chat FOLLOWS the active note like the
      extension panel follows the Gmail thread — grounding rides along unless
      the user mutes it. */
  private followActive = true;
  private pastEntries: Array<{ journalId: string; day: string; preview: string }> | null = null;
  /** The browser's search — the web's "Search journals…" box, over decrypted previews. */
  private pastQuery = '';
  /** 👍/👎 given, per Myu turn index — so a rating is shown, not repeatable. */
  private ratings = new Map<number, 1 | -1>();
  private journalId: string | null = null;
  private pendingContext: ChatContext | null = null;
  private pendingTemplateType: string | null = null;
  private busy = false;
  private draft = '';

  constructor(
    leaf: WorkspaceLeaf,
    private plugin: AskMyuPlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return CHAT_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'Myu — chat';
  }

  override getIcon(): string {
    return 'message-circle';
  }

  override async onOpen(): Promise<void> {
    // Keyboard-first: the composer takes focus when the pane opens.
    queueMicrotask(() => (this.contentEl.querySelector('textarea.myu-chat-input') as HTMLTextAreaElement | null)?.focus());
    this.contentEl.addClass('myu-today');
    this.render();
  }

  override async onClose(): Promise<void> {
    this.contentEl.empty();
  }

  /**
   * Seed a fresh conversation (prep's ask/after, a card's discuss ▸, a note).
   * A seed always starts a NEW thread: the context belongs to its first
   * message, and continuing an old thread with a new subject's context would
   * attribute the old conversation to the new subject.
   */
  seed(seed: ChatSeed): void {
    this.turns = [];
    this.journalId = null;
    this.pendingContext = seed.context ?? null;
    this.pendingTemplateType = seed.templateType ?? null;
    this.draft = seed.send ? '' : seed.text;
    this.render();
    if (seed.send && seed.text.trim()) void this.send(seed.text);
  }

  /** A blank thread: this conversation is finished, the next one starts clean. */
  startNew(): void {
    this.turns = [];
    this.journalId = null;
    this.pendingContext = null;
    this.pendingTemplateType = null;
    this.draft = '';
    this.browsing = false;
    this.canvasSpecs.clear();
    this.canvasFetching.clear();
    this.canvasAsks.clear();
    this.expandedComponents.clear();
    this.inlineOffer = null;
    this.offerDone = null;
    this.offerDoneText = null;
    this.linkedinAsk = null;
    this.ratings.clear();
    this.render();
  }

  private async send(text: string): Promise<void> {
    const content = text.trim();
    if (!content || this.busy) return;
    const accountId = this.plugin.settings.account_id;
    if (!accountId) return;

    if (!this.pendingContext && this.followActive && !this.journalId) {
      const active = this.app.workspace.getActiveFile();
      if (active && active.extension === 'md') {
        this.pendingContext = (await this.plugin.chatContextForFile(active)) ?? null;
      }
    }

    this.turns.push({ role: 'user', text: content });
    this.draft = '';
    this.busy = true;
    this.render();

    // Context is claimed by the FIRST message only — the next turn is the same
    // conversation, not a fresh attribution.
    const context = this.pendingContext ?? undefined;
    this.pendingContext = null;

    // The canvas beside the thread, named to the backend as the web names it:
    // `continues_composition_id` so the turn MUTATES that canvas instead of
    // starting over, and the real surface mode so canvas content is not gated
    // away as if nothing could show it.
    const openId = this.plugin.openCanvasId();
    const canvasOpts: ChatCanvasOptions = { surfaceMode: openId ? 'dual' : 'journal', ...(openId ? { continuesCompositionId: openId } : {}) };
    const res = this.journalId
      ? await this.plugin.backend.addChatTurn(accountId, this.journalId, content, context, canvasOpts)
      : await this.plugin.backend.createChatEntry(accountId, content, context, this.pendingTemplateType ?? undefined, canvasOpts);

    this.busy = false;

    if (!res.ok || !res.data) {
      this.turns.push({
        role: 'myu',
        text: res.error === 'offline' ? "You're offline — this didn't send. Try again when you're back." : "That didn't reach Myu. Try again in a moment.",
      });
      this.render();
      return;
    }

    if (res.data.journal_id) this.journalId = res.data.journal_id;
    if (res.data.offer) this.adoptDeliveredOffer(res.data.offer);
    const blocks = [...res.data.blocks];
    // The reply's canvas side — the web's handleDualModeResponse, here.
    const step = canvasAfterTurn(res.data.canvas, this.plugin.openCanvasId());
    if (step.kind === 'apply') {
      this.plugin.applyCanvasMutations(step.compositionId, step.mutations);
      if (step.nextId) this.plugin.adoptCanvasId(step.nextId);
      // The reply changed a canvas that was already on screen. The pane knows;
      // the THREAD did not, so a conversation with a live canvas showed no sign
      // of it (operator, 2026-09-01: "there was a canvas pane… that's my point").
      const live = step.nextId ?? step.compositionId;
      this.canvasSpecs.delete(live);
      if (!blocks.some((b) => b.type === 'composition_offer' && b.composition_id === live)) {
        blocks.push({ type: 'composition_offer', composition_id: live, summary_text: res.data.canvas?.summary_text ?? '', action_label: 'Open canvas' });
      }
    } else if (step.kind === 'open') {
      // The reply made a canvas: show it HERE. It used to open the pane (and
      // steal focus), which left conversations whose canvas had real content
      // with no sign of it in the thread at all (operator, 2026-09-01).
      if (!blocks.some((b) => b.type === 'composition_offer' && b.composition_id === step.compositionId)) {
        blocks.push({ type: 'composition_offer', composition_id: step.compositionId, summary_text: res.data.canvas?.summary_text ?? '', action_label: 'Open canvas' });
      }
      void this.plugin.openCanvas(step.compositionId, { reveal: false });
    }
    else if (step.kind === 'offer' && !blocks.some((b) => b.type === 'composition_offer' && b.composition_id === step.compositionId)) {
      blocks.push({ type: 'composition_offer', composition_id: step.compositionId, summary_text: step.summaryText, action_label: 'Open canvas' });
    }
    if (step.kind !== 'none') {
      const liveId = step.kind === 'apply' && step.nextId ? step.nextId : step.compositionId;
      void this.plugin.keepCanvasIfAlwaysOn(liveId, res.data.canvas?.summary_text ?? '');
      // The cold-start offer is conversational content: if this reply's canvas
      // carries it, it renders IN the thread (unless the panel already shows it).
      void this.fetchInlineOffer(liveId);
    }
    this.turns.push({ role: 'myu', blocks, references: res.data.references, related: res.data.similar_entries });
    void this.checkLinkedInAsk();
    // A live offer from THIS chat: keep it if the switch is on. The SSE event
    // usually beats us to it; keepOnce makes the second call a no-op.
    for (const b of blocks) {
      if (b.type === 'composition_offer' && b.composition_id) void this.plugin.keepCanvasIfAlwaysOn(b.composition_id, b.summary_text ?? '');
    }
    this.render();
  }

  // ── the cold-start calendar offer, inline (canonical in the thread) ────────
  // The web's AssistantOutput: the offer_block arrives server-composed inside
  // the welcome composition; presence of the component IS the gate, the panel
  // being open is the suppressor, and a real "no" ends the ask everywhere.

  private inlineOffer: { compositionId: string; component: CompositionComponentLite } | null = null;
  private offerDone: 'connected' | 'dismissed' | null = null;
  /** Server-authored acknowledgement shown in place of an answered offer (stop_asking). */
  private offerDoneText: string | null = null;

  // ── what the canvas needs, said in the row ─────────────────────────────────
  // A tab is invisible furniture: when the conversation's canvas carries an
  // ask, the row names it and Open canvas becomes the cta.

  private canvasAsks = new Map<string, string | null>();
  /** Specs for the canvases this thread shows inline. */
  private canvasSpecs = new Map<string, CompositionSpecLite>();
  private canvasFetching = new Set<string>();
  /** Folds the reader opened, by component id — the thread re-renders on every event. */
  private expandedComponents = new Set<string>();

  /**
   * The canvas, in the thread. Returns false while the spec is still on its
   * way, so the caller can fall back to the row for that beat.
   */
  private renderCanvasInThread(parent: HTMLElement, compositionId: string): boolean {
    const spec = this.canvasSpecs.get(compositionId);
    if (!spec) {
      if (!this.canvasFetching.has(compositionId)) {
        this.canvasFetching.add(compositionId);
        void this.plugin.backend.getComposition(compositionId).then((res) => {
          const loaded = res?.data?.composition;
          if (loaded) { this.canvasSpecs.set(compositionId, loaded); this.render(); }
        }).catch(() => undefined);
      }
      return false;
    }
    renderInlineCanvas(parent, compositionId, spec, {
      app: this.app,
      component: this,
      plugin: this.plugin,
      expanded: this.expandedComponents,
      refresh: () => { this.canvasSpecs.delete(compositionId); this.canvasFetching.delete(compositionId); this.render(); },
      openCanvas: (id) => void this.plugin.openCanvas(id),
      saveCanvas: (id) => new CanvasExportModal(this.app, this.plugin, id).open(),
    });
    return true;
  }

  /**
   * The way back: from a canvas to the reply that made it. Returns false when
   * this thread is not the one — the canvas belongs to another conversation,
   * and saying so is better than scrolling to nothing.
   */
  revealCanvas(compositionId: string): boolean {
    const has = this.turns.some((t) => t.blocks?.some((b) => b.type === 'composition_offer' && b.composition_id === compositionId));
    if (!has) return false;
    const el = this.contentEl.querySelector(`[data-myu-canvas-id="${CSS.escape(compositionId)}"]`);
    const target = el instanceof HTMLElement ? el : null;
    if (target) {
      target.scrollIntoView({ block: 'center' });
      target.classList.add('is-flashing');
      window.setTimeout(() => target.classList.remove('is-flashing'), 1400);
    }
    return true;
  }

  /** Walk the thread to a component the reply's prose names: open its fold, flash it. */
  revealCanvasComponent(componentId: string): boolean {
    return revealComponent(this.contentEl, componentId, this.expandedComponents, () => this.render());
  }

  private asksFor(compositionId: string): string | null {
    if (!this.canvasAsks.has(compositionId)) {
      this.canvasAsks.set(compositionId, null); // fetch once; re-render fills it in
      void this.plugin.backend.getComposition(compositionId).then((res) => {
        const line = canvasAsksLine(res?.data?.composition);
        if (line) { this.canvasAsks.set(compositionId, line); this.render(); }
      }).catch(() => undefined);
    }
    return this.canvasAsks.get(compositionId) ?? null;
  }

  // ── the LinkedIn ask, in the conversation that names the person ────────────
  // "Confirm the LinkedIn match for Jim" as reply prose with no door is a dead
  // end (operator, 2026-08-31). When a pending disambiguation's person is
  // named in this thread, the panel's own match cards render right here.

  private linkedinAsk: { relationshipId: string; personName: string; suggestions: LinkedInSuggestion[] } | null = null;

  private async checkLinkedInAsk(): Promise<void> {
    if (this.linkedinAsk) return;
    if (this.plugin.helpQueue.length === 0) await this.plugin.loadHelpQueue();
    const text = this.turns.map((t) => [t.text ?? '', ...(t.blocks ?? []).map((b) => ('text' in b && typeof b.text === 'string' ? b.text : ''))].join('\n')).join('\n');
    const ask = linkedInAskInText(this.plugin.helpQueue, text);
    if (!ask || this.plugin.linkedinAskResolved.has(ask.relationshipId)) return;
    const card = await this.plugin.backend.getCard('person', ask.relationshipId).catch(() => null);
    const suggestions = suggestionsOf(card?.data?.suggestions);
    this.linkedinAsk = { ...ask, suggestions };
    this.render();
  }

  /**
   * Re-check the showing ask against server truth: resolved on the canvas, the
   * web, or another device (entities_changed / a canvas action), the box goes.
   */
  async revalidateLinkedInAsk(): Promise<void> {
    const ask = this.linkedinAsk;
    if (!ask) return;
    await this.plugin.loadHelpQueue();
    const stillPending = this.plugin.helpQueue.some((i) => i.item_type === 'linkedin_disambiguation' && i.relationship_id === ask.relationshipId);
    if (stillPending) return;
    this.plugin.linkedinAskResolved.add(ask.relationshipId);
    this.linkedinAsk = null;
    this.render();
  }

  private renderLinkedInAsk(parent: HTMLElement): void {
    if (!this.linkedinAsk) return;
    const { relationshipId, personName, suggestions } = this.linkedinAsk;
    const box = calloutBox(parent, 'question', `Is this ${personName}?`, 'myu-chat-offer');
    renderLinkedInMatchesInline(box, suggestions, {
      app: this.app,
      owner: this,
      plugin: this.plugin,
      relationshipId,
      personName,
      onResolved: () => {
        this.plugin.linkedinAskResolved.add(relationshipId);
        this.linkedinAsk = null;
        void this.plugin.loadHelpQueue();
        // One record, every surface: an open canvas holds a snapshot, so tell
        // it to re-read rather than keep showing the already-answered card.
        void this.plugin.canvasView()?.refresh();
        this.render();
      },
    });
    queueMicrotask(() => {
      try {
        box.scrollIntoView({ block: 'nearest' });
      } catch {
        // test DOM stubs have no scrollIntoView; nothing to see there anyway
      }
    });
  }

  /** A trust-ladder ask riding the reply (or re-served on reopen) — rendered like the calendar offer, once per conversation. */
  private adoptDeliveredOffer(offer: DeliveredOffer | undefined): void {
    if (!offer?.moment) return;
    const journal = (typeof offer.journal_id === 'string' && offer.journal_id) || this.journalId || '';
    if (journal && this.plugin.offerAnsweredJournals.has(journal)) return;
    if (this.inlineOffer?.component.id === 'offer_moment' && (this.inlineOffer.component.data as { moment?: string } | undefined)?.moment === offer.moment) return;
    this.inlineOffer = { compositionId: '', component: { id: 'offer_moment', type: 'offer_block', data: offer as Record<string, unknown> } };
    this.offerDone = null;
    this.offerDoneText = null;
  }

  private adoptInlineOffer(spec: CompositionSpecLite | null | undefined): void {
    if (!spec?.id) return;
    const component = (spec.components ?? []).find((c) => c.type === 'offer_block');
    if (!component) return;
    // The session latch ends only the WELCOME (calendar) ask; delivered moment
    // rungs are paced and gated server-side (offer_*_state) instead.
    if (component.id === 'welcome_offer' && this.plugin.welcomeOfferAnswered) return;
    if (this.inlineOffer?.component.id === component.id && this.inlineOffer.compositionId === spec.id) return;
    this.inlineOffer = { compositionId: spec.id, component };
    this.offerDone = null;
    this.offerDoneText = null;
  }

  private async fetchInlineOffer(compositionId: string): Promise<void> {
    const res = await this.plugin.backend.getComposition(compositionId).catch(() => null);
    this.adoptInlineOffer(res?.data?.composition);
    if (this.inlineOffer) this.render();
  }

  private renderInlineOffer(parent: HTMLElement): void {
    if (!this.inlineOffer || (this.offerDone === 'dismissed' && !this.offerDoneText)) return;
    if (this.inlineOffer.component.id === 'welcome_offer' && this.plugin.welcomeOfferAnswered && !this.offerDone) return; // answered elsewhere (panel, another session)
    if (!this.turns.some((t) => t.role === 'myu')) return; // at the reply that earned it, never before
    const { compositionId, component } = this.inlineOffer;
    // NEVER two asks on screen (delta #4): whether an offer is displayed is
    // client knowledge — the server's carriesOfferBlock only sees the current
    // reply, and a welcome canvas persists in its tab across later turns. So if
    // the canvas pane is showing ANY composition that carries an offer_block,
    // that is the ask and the chat stays quiet — same-composition or not.
    if (!this.offerDone) {
      if (compositionId && this.plugin.openCanvasId() === compositionId) return;
      // Two asks for the SAME source is the noise worth avoiding; a calendar
      // ask on the canvas has no business hiding a mail ask (operator,
      // 2026-09-01: the email ask went missing, then appeared minutes later).
      // And an ask the user's own words earned is never suppressed at all.
      const data = component.data as { triggered?: boolean; moment?: string } | undefined;
      if (data?.triggered !== true) {
        const mine = offerSource(data?.moment, component);
        const shown = [this.plugin.canvasView()?.currentSpec(), ...this.canvasSpecs.values()]
          .flatMap((s) => s?.components ?? [])
          .filter((c) => c.type === 'offer_block')
          .map((c) => offerSource((c.data as { moment?: string } | undefined)?.moment, c));
        if (shown.includes(mine)) return;
      }
      // The thread may already be showing this very offer inside an inlined
      // canvas — one ask, one place (delta #4, now that canvases live here too).
      if (compositionId && this.canvasSpecs.has(compositionId)) return;
    }
    const box = calloutBox(parent, 'tip', 'Myu needs a source', 'myu-chat-offer');
    if (this.offerDone) {
      // Answered: the acknowledgement (or the connect line) IN PLACE of the ask.
      box.createDiv({ cls: 'myu-voice', text: this.offerDoneText ?? 'Calendar\u2019s in. Your week starts painting in Today.' });
      return;
    }
    const data = (component.data ?? {}) as Record<string, unknown>;
    const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
    if (text(data.lead)) box.createDiv({ cls: 'myu-voice', text: text(data.lead) });
    if (text(data.gap_line)) box.createDiv({ cls: 'myu-quiet', text: text(data.gap_line) });
    const person = data.named_person && typeof data.named_person === 'object' ? (data.named_person as Record<string, unknown>) : null;
    if (person && text(person.name)) box.createDiv({ cls: 'myu-whisper', text: `${text(person.name)}${text(person.when_text) ? ` \u2014 ${text(person.when_text)}` : ''}` });
    renderComponentActions(box, component, {
      run: async (_componentId, action, params) => {
        const out = await runOfferOption(this.plugin, action.replace(/^offer:/, ''), params);
        if (out.done) {
          this.offerDone = out.done;
          this.offerDoneText = out.ackText ?? null;
          // Never ask twice in one conversation — an answered ask stays answered.
          if (component.id === 'offer_moment') {
            const journal = ((component.data as { journal_id?: string } | undefined)?.journal_id ?? this.journalId) || '';
            if (journal) this.plugin.offerAnsweredJournals.add(journal);
          }
          this.render();
        }
        return { ok: out.ok, message: out.message };
      },
      interact: async () => undefined,
    });
    if (text(data.trust_line)) box.createDiv({ cls: 'myu-quiet', text: text(data.trust_line) });
    // The ask must be SEEN whole — a resumed thread sits scrolled to the top,
    // which buried the trust line below the fold (sweep finding, 2026-08-31).
    queueMicrotask(() => {
      try {
        box.scrollIntoView({ block: 'nearest' });
      } catch {
        // test DOM stubs have no scrollIntoView; nothing to see there anyway
      }
    });
  }

  /** 👍/👎 under a Myu turn — the web's JournalRatingBar → `/feedback/submit` (myu_response). */
  private renderRating(parent: HTMLElement, index: number): void {
    const given = this.ratings.get(index);
    const row = parent.createDiv({ cls: 'myu-chat-rating' });
    if (given) { row.createSpan({ cls: 'myu-whisper', text: given === 1 ? 'thanks \u2014 noted as a good read' : 'thanks \u2014 noted as off the mark' }); return; }
    for (const [rating, icon, label] of [[1, 'thumbs-up', 'Good read'], [-1, 'thumbs-down', 'Off the mark']] as const) {
      const b = row.createEl('button', { cls: 'myu-affordance myu-icon-button myu-rating-btn', attr: { 'aria-label': `${label} \u2014 rate this reply` } });
      setIcon(b, icon);
      b.onclick = () => {
        // The web's JournalRatingModal: a note, and what is attached, said — never a silent send.
        if (!this.journalId) return;
        new ReplyRatingModal(this.app, this.plugin, rating, this.journalId, this.turns.slice(0, index + 1), () => { this.ratings.set(index, rating); this.render(); }).open();
      };
    }
  }

  // ── render ────────────────────────────────────────────────────────────────

  private render(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass('myu-chat');

    const top = root.createDiv({ cls: 'myu-chat-top' });
    const active = this.app.workspace.getActiveFile();
    if (active && active.extension === 'md' && !this.browsing) {
      const listen = top.createSpan({ cls: 'myu-chat-listen' });
      listen.createSpan({ text: this.followActive ? `listening to ${active.basename}` : 'not listening' });
      const mute = listen.createEl('button', { cls: this.followActive ? 'myu-affordance myu-icon-button' : 'myu-affordance' });
      if (this.followActive) { setIcon(mute, 'x'); mute.setAttr('aria-label', 'Stop listening to this note'); }
      else mute.setText('Listen');
      mute.onclick = () => {
        this.followActive = !this.followActive;
        this.render();
      };
    }
    // Starting fresh was only reachable from Today; a conversation that has
    // moved on needs its own door (operator, 2026-09-01).
    if (!this.browsing && (this.turns.length > 0 || this.journalId)) {
      const fresh = top.createEl('button', { cls: 'myu-affordance', text: 'New conversation' });
      fresh.onclick = () => this.startNew();
    }
    const browse = top.createEl('button', {
      cls: 'myu-affordance',
      text: this.browsing ? '← back to the conversation' : 'Past conversations',
    });
    browse.onclick = () => {
      this.browsing = !this.browsing;
      if (this.browsing && !this.pastEntries) void this.loadPastEntries();
      this.render();
    };

    if (this.browsing) {
      this.renderBrowser(root);
      return;
    }

    const thread = root.createDiv({ cls: 'myu-chat-thread' });

    if (this.turns.length === 0 && !this.busy) {
      thread.createEl('p', { cls: 'myu-quiet', text: 'Talk to Myu — about a note, a person, or the day.' });
    }

    for (const [index, turn] of this.turns.entries()) {
      if (turn.role === 'user') {
        thread.createDiv({ cls: 'myu-chat-user', text: turn.text ?? '' });
        continue;
      }
      const myu = thread.createDiv({ cls: 'myu-chat-myu' });
      myu.createDiv({ cls: 'myu-whisper', text: 'myu' });
      if (turn.text) myu.createDiv({ cls: 'myu-voice', text: turn.text });
      for (const block of turn.blocks ?? []) this.renderBlock(myu, block);
      renderReferences(myu, turn.references);
      renderRelatedEntries(myu, turn.related, (id) => void this.openPastConversation(id));
      if (turn.blocks?.length && this.journalId) this.renderRating(myu, index);
    }

    if (!this.busy) {
      this.renderInlineOffer(thread);
      this.renderLinkedInAsk(thread);
    }

    if (this.busy) thread.createEl('p', { cls: 'myu-quiet myu-thinking', text: 'Thinking' });

    // Per-conversation save — the ONLY way this thread touches the vault.
    if (this.turns.length > 1 && !this.busy) {
      const save = thread.createEl('button', { cls: 'myu-affordance myu-chat-save', text: 'Save this conversation' });
      save.onclick = () => this.plugin.offerConversationSave([...this.turns]);
    }

    const composer = root.createDiv({ cls: 'myu-chat-composer' });
    const input = composer.createEl('textarea', {
      cls: 'myu-chat-input',
      attr: { rows: '3', placeholder: 'Say it plainly…' },
    });
    input.value = this.draft;
    input.oninput = () => {
      this.draft = input.value;
    };
    input.onkeydown = (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        void this.send(input.value);
      }
    };
    const send = composer.createEl('button', { cls: 'myu-affordance', text: 'Send' });
    send.onclick = () => void this.send(input.value);

    if (this.draft) window.setTimeout(() => input.focus(), 0);
  }

  /** The list: recent entries, decrypted previews, newest first. */
  private renderBrowser(root: HTMLElement): void {
    const host = root.createDiv({ cls: 'myu-chat-thread' });
    if (this.pastEntries === null) {
      host.createEl('p', { cls: 'myu-quiet myu-thinking', text: 'Finding your conversations' });
      return;
    }
    if (this.pastEntries.length === 0) {
      host.createEl('p', { cls: 'myu-quiet', text: 'No past conversations yet — the first one starts below.' });
      return;
    }
    const search = host.createEl('input', { cls: 'myu-chat-search', attr: { type: 'search', placeholder: 'Search conversations\u2026', 'aria-label': 'Search past conversations' } });
    search.value = this.pastQuery;
    search.oninput = () => { this.pastQuery = search.value; this.renderBrowserRows(host); };
    this.renderBrowserRows(host);
  }

  private renderBrowserRows(host: HTMLElement): void {
    host.querySelector('.myu-chat-past-rows')?.remove();
    const rows = host.createDiv({ cls: 'myu-chat-past-rows' });
    const q = this.pastQuery.trim().toLowerCase();
    const shown = (this.pastEntries ?? []).filter((e) => !q || e.preview.toLowerCase().includes(q) || e.day.includes(q));
    if (shown.length === 0) { rows.createEl('p', { cls: 'myu-quiet', text: 'Nothing matches.' }); return; }
    for (const entry of shown) {
      const row = rows.createEl('button', { cls: 'myu-row-tappable myu-chat-past', attr: { 'aria-label': `Open the conversation from ${entry.day}` } });
      row.createSpan({ cls: 'myu-whisper', text: entry.day });
      row.createSpan({ cls: 'myu-chat-past-preview', text: entry.preview });
      row.onclick = () => void this.openPastConversation(entry.journalId, entry.day);
    }
  }

  /**
   * Re-read this conversation from the server — after a canvas click made Myu
   * answer in it (`response_generating` → `chatrefresh`). The opening entry is
   * not a chat row, so the first user turn is kept from what is on screen.
   */
  async reloadThread(): Promise<void> {
    if (!this.journalId || this.busy) return;
    const opening = this.turns[0]?.role === 'user' ? this.turns[0] : null;
    const fresh = await loadConversation({ backend: this.plugin.backend, key: this.plugin.keys.get(), accountId: this.plugin.settings.account_id }, this.journalId).catch(() => null);
    if (!fresh) return;
    this.turns = opening ? [opening, ...fresh] : fresh;
    this.render();
  }

  /** A canvas made while you were elsewhere — the web's offer strip, as a row in the thread. */
  /**
   * Put a resumed conversation's canvas beside the reply it belongs to.
   *
   * `/composition/for-journal` says which turn made it (`turn_number`); without
   * that we can only fall back to the last reply. Appending blindly would stick
   * an old canvas onto whatever was said most recently (operator, 2026-09-01:
   * "any past canvas needs to stick to the response it is attached to").
   */
  private placeCanvasOnTurn(blocks: ChatBlock[], turnNumber?: number): void {
    const myuTurns = this.turns.map((t, i) => ({ t, i })).filter(({ t }) => t.role === 'myu');
    const target = typeof turnNumber === 'number' && turnNumber > 0 && turnNumber <= myuTurns.length
      ? myuTurns[turnNumber - 1]
      : myuTurns[myuTurns.length - 1];
    if (!target || target.t.blocks?.some((b) => b.type === 'composition_offer')) {
      this.turns.push({ role: 'myu', blocks });
      return;
    }
    target.t.blocks = [...(target.t.blocks ?? []), ...blocks];
  }

  /**
   * Every canvas the conversation made, each on the reply that made it.
   *
   * The reply list is snapshotted BEFORE any placing: a canvas with no reply to
   * belong to becomes a row of its own at the end, and that extra row must not
   * shift where the canvases after it land.
   */
  private placeCanvases(rows: Array<{ compositionId: string; summaryText: string; turnNumber: number }>): void {
    const myuTurns = this.turns.filter((t) => t.role === 'myu');
    for (const row of rows) {
      if (this.turns.some((t) => t.blocks?.some((b) => b.type === 'composition_offer' && b.composition_id === row.compositionId))) continue;
      const block: ChatBlock = { type: 'composition_offer', composition_id: row.compositionId, summary_text: row.summaryText };
      const target = row.turnNumber <= myuTurns.length ? myuTurns[row.turnNumber - 1] : undefined;
      // One canvas per reply: a turn already carrying one keeps it, and this
      // canvas gets its own row rather than hiding behind that one.
      if (!target || target.blocks?.some((b) => b.type === 'composition_offer')) {
        this.turns.push({ role: 'myu', blocks: [block] });
        continue;
      }
      target.blocks = [...(target.blocks ?? []), block];
    }
  }

  /**
   * A canvas belongs to the reply that made it.
   *
   * Canvases that arrive after the reply (SSE `composition_ready`, or one that
   * took the pane) used to be pushed as their own turn at the END of the
   * thread, so a conversation with four canvases showed one floating row at the
   * bottom and nothing beside the replies that earned them (operator,
   * 2026-09-01). Attach it to the most recent Myu turn instead; only a canvas
   * with no reply to belong to gets a turn of its own.
   */
  offerCanvas(compositionId: string, summaryText: string, actionLabel: string): void {
    if (this.turns.some((t) => t.blocks?.some((b) => b.type === 'composition_offer' && b.composition_id === compositionId))) return;
    const block: ChatBlock = { type: 'composition_offer', composition_id: compositionId, summary_text: summaryText, action_label: actionLabel };
    for (let i = this.turns.length - 1; i >= 0; i--) {
      const turn = this.turns[i];
      if (turn?.role !== 'myu') continue;
      // One canvas per reply: a turn that already carries one keeps it, and
      // this canvas becomes its own row rather than hiding behind that one.
      if (turn.blocks?.some((b) => b.type === 'composition_offer')) break;
      turn.blocks = [...(turn.blocks ?? []), block];
      this.render();
      return;
    }
    this.turns.push({ role: 'myu', blocks: [block] });
    this.render();
  }

  private async loadPastEntries(): Promise<void> {
    this.pastEntries = await listConversations({ backend: this.plugin.backend, key: this.plugin.keys.get(), accountId: this.plugin.settings.account_id });
    this.render();
  }


  /** Load one past conversation INTO the thread — and it stays resumable:
      the next send chains onto the same journal id, exactly like the web.
      PUBLIC: the Journal notes' "continue this conversation ▸" deep links
      land here (obsidian://myu-chat?journal=…). */
  async openPastConversation(journalId: string, day = ''): Promise<void> {
    this.browsing = false;
    this.journalId = journalId;
    this.pendingContext = null;
    const entry = this.pastEntries?.find((e) => e.journalId === journalId);
    this.turns = await loadConversation(
      { backend: this.plugin.backend, key: this.plugin.keys.get(), accountId: this.plugin.settings.account_id },
      journalId,
      entry ? { day, preview: entry.preview } : undefined,
      (offer) => this.adoptDeliveredOffer(offer),
    );
    void this.checkLinkedInAsk();
    this.render();

    // The one thing the stored turns cannot tell us: which canvas this
    // conversation has. The web asks on every resume; so do we. The offer row
    // lands where a live turn's would have, and the canvas opens beside the
    // thread — the row stays as the way back if they close the pane.
    // Two questions, one round trip each, asked together: which canvas is LIVE
    // (spec, inline offer, what to open) and which canvases this conversation
    // made at all. The second needs a backend from 2026-09-01 or later; older
    // ones answer the single shape and the fallback below carries.
    const [liveRes, allRes] = await Promise.all([
      this.plugin.backend.getCompositionForJournal(journalId).catch(() => null),
      this.plugin.backend.getCompositionsForJournal(journalId).catch(() => null),
    ]);
    const forJournal = liveRes?.data;
    this.adoptInlineOffer(forJournal?.composition);
    const canvas = canvasOnResume(forJournal);
    const all = canvasesOnResume(allRes?.data);
    // A canvas this session cannot decrypt is said out loud (R7) rather than
    // laid out as rows that would open onto nothing — and the key is per
    // account, so if the live one is unreadable the rest are too.
    if (canvas && 'note' in canvas) {
      this.turns.push({ role: 'myu', text: canvas.note });
      this.render();
      return;
    }
    if (all.length > 0) {
      this.placeCanvases(all);
      this.render();
      // Same rule as the single-canvas path: the live canvas opens beside the
      // thread unless the conversation IS the offer, in which case the chat is
      // canonical and the rows stay as the doors.
      if (canvas && 'blocks' in canvas && !this.inlineOffer) void this.plugin.openCanvas(canvas.open, { reveal: false });
      return;
    }
    if (!canvas) return;
    if ('blocks' in canvas) {
      this.placeCanvasOnTurn(canvas.blocks, canvas.turnNumber);
      this.render();
      // When the conversation IS the offer, the chat is canonical — don't
      // auto-open the panel over it; the "Open canvas" row stays as the door.
      // Quietly: the thread already carries the canvas, and a resumed
      // conversation must not have its pane thrown over the reader.
      if (!this.inlineOffer) void this.plugin.openCanvas(canvas.open, { reveal: false });
    }
  }

  private renderBlock(parent: HTMLElement, block: ChatBlock): void {
    // Markdown, through Obsidian's own renderer — see chatBlocks.ts.
    renderChatBlock(parent, block, {
      app: this.app,
      component: this,
      openCanvas: (id) => void this.plugin.openCanvas(id),
      asksFor: (id) => this.asksFor(id),
      inlineCanvas: (parent, id) => this.renderCanvasInThread(parent, id),
      saveCanvas: (id) => new CanvasExportModal(this.app, this.plugin, id).open(),
      // Strip /api — the web app and the backend share an origin.
      webOrigin: this.plugin.settings.base_url.replace(/\/api\/?$/, ''),
      autoKeep: this.plugin.settings.auto_keep_canvas,
    });
  }

}
