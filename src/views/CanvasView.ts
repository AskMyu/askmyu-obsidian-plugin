/**
 * CanvasView (P-CANVAS-1) — a Myu composition, read beside your notes.
 *
 * The "half canvas" the webapp shows next to a conversation. On web that is 51
 * React renderers over `@xyflow`; here it is the SAME SPEC rendered as
 * markdown and handed to Obsidian's own renderer. No React, no graph library,
 * no bundle weight — and mermaid, `[[wikilinks]]`, tables and the user's theme
 * arrive for free because Obsidian already does all of that.
 *
 * Why a pane and not a file: `CanvasExporter` already writes the FILE form —
 * a real `.canvas`, an open MIT standard opened by Obsidian's own editor. That
 * is for keeping. This is for reading, and it works on mobile, where Canvas
 * itself is genuinely awkward. Pane for reading, file for keeping.
 *
 * READ-ONLY, deliberately. Nothing here mutates the composition: the return
 * path for canvas interaction is `/vault/interaction` (specced from the start
 * as "the vault's canvas_interaction twin") and belongs to P-CANVAS-2, after a
 * design pass on conflict semantics. A half-built interaction loop would be
 * worse than none.
 */

import { ItemView, MarkdownRenderer, WorkspaceLeaf, setIcon } from 'obsidian';
import type AskMyuPlugin from '../main';
import type { CompositionHistoryRow } from '../transport/api';
import { componentMarkdown, compositionFlow } from '../vault/myuFiles';
import { applyMutations } from '../composition/applyMutations';
import { renderComponentActions, type InteractionSpec } from './canvasActions';
import { renderCanvasFooter } from './canvasFooter';
import { AutoKeepModal } from './AutoKeepModal';
import type { CompositionSpecLite, SurfaceMutationLite } from '../wire';
import { CanvasExportModal } from './CanvasExportModal';
import { CanvasHistoryModal } from './CanvasHistoryModal';

import { runOfferOption } from './offerActions';

export const CANVAS_VIEW_TYPE = 'askmyu-canvas';

export class CanvasView extends ItemView {
  private compositionId: string | null = null;
  private title = 'Myu — canvas';
  private state: 'idle' | 'loading' | 'error' = 'idle';

  constructor(leaf: WorkspaceLeaf, private plugin: AskMyuPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return CANVAS_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.title;
  }

  override getIcon(): string {
    return 'layout-dashboard';
  }

  override async onOpen(): Promise<void> {
    void this.loadHistory();
    this.contentEl.addClass('myu-canvas');
    if (this.compositionId) await this.showComposition(this.compositionId);
    else this.render();
  }

  /** The spec on screen — mutated by the controls, then re-rendered. */
  private spec: CompositionSpecLite | null = null;

  /** Undo, the web's way: a snapshot before every change, 20 deep, client-only. */
  private snapshots: CompositionSpecLite[] = [];
  /** Pinned: this pane holds still. Obsidian's *linked* pane, applied to canvases. */
  private pinned = false;
  /** Recent canvases, newest first — the stepper's ground, fetched with the pane. */
  private history: CompositionHistoryRow[] = [];
  /** A newer canvas arrived while this one was pinned or being read. */
  private newer: { compositionId: string; summary: string } | null = null;
  private snapshot(): void {
    if (!this.spec) return;
    this.snapshots.push(this.spec);
    if (this.snapshots.length > 20) this.snapshots.shift();
  }
  undo(): boolean {
    const prev = this.snapshots.pop();
    if (!prev) return false;
    this.spec = prev;
    this.render();
    void this.autoKeep();
    return true;
  }

  /** The server's word that this canvas is stale (composition_expired) — shown, never acted on silently. */
  private expired: { reason?: string; refreshable: boolean } | null = null;
  markExpired(compositionId: string, reason?: string, refreshAvailable?: boolean): boolean {
    if (this.compositionId !== compositionId) return false;
    this.expired = { reason, refreshable: refreshAvailable !== false };
    this.render();
    return true;
  }

  /** False when the pane is pinned — a new canvas must not take it. */
  followsLatest(): boolean {
    return !this.pinned;
  }

  /** A newer canvas exists; say so rather than swapping under a pinned pane. */
  noteNewer(compositionId: string, summary: string): void {
    if (!compositionId || compositionId === this.compositionId) return;
    this.newer = { compositionId, summary };
    this.render();
  }

  /** What this pane shows — the id the chat sends as `continues_composition_id`. */
  currentId(): string | null {
    return this.compositionId;
  }

  /** The spec on screen, for a feedback attachment. */
  currentSpec(): CompositionSpecLite | null {
    return this.spec;
  }

  /**
   * Mutations that arrived from OUTSIDE the pane — a chat turn's canvas side,
   * or a composition_mutation event. Applied in place like the web's store;
   * not persisted from here (the backend already holds them).
   */
  /** The same canvas under a new id (the reply's `composition_id`): follow it, no refetch. */
  adoptId(compositionId: string): void {
    if (!compositionId || compositionId === this.compositionId) return;
    this.compositionId = compositionId;
    this.keptPath = null;
    void this.autoKeep();
  }

  applyRemoteMutations(compositionId: string, mutations: SurfaceMutationLite[]): boolean {
    if (this.compositionId !== compositionId || !this.spec || mutations.length === 0) return false;
    this.snapshot();
    this.spec = applyMutations(this.spec, mutations);
    this.render();
    void this.autoKeep();
    return true;
  }

  async showComposition(compositionId: string): Promise<void> {
    this.compositionId = compositionId;
    this.state = 'loading';
    this.spec = null;
    this.snapshots = [];
    this.expired = null;
    this.render();

    const res = await this.plugin.backend.getComposition(compositionId).catch(() => null);
    const spec = res?.data?.composition ?? null;
    if (!res?.ok || !spec) {
      this.state = 'error';
      this.render();
      return;
    }
    this.state = 'idle';
    this.spec = spec;
    this.keptPath = null;
    this.keepProblem = null;
    this.newer = null;
    this.render();
    void this.autoKeep();
    // The stepper needs to know what sits either side of this one.
    void this.loadHistory();
  }

  private keptPath: string | null = null;
  private keepProblem: string | null = null;

  /**
   * The switch, honoured: keep what the pane shows, quietly, and say where.
   * Runs on show and after every mutation, so the file tracks the canvas;
   * P-CANVAS-2 merges into the existing file and keeps the user's layout.
   */
  private async autoKeep(): Promise<void> {
    if (!this.plugin.settings.auto_keep_canvas || !this.compositionId || !this.spec) return;
    const outcome = await this.plugin.exportComposition(this.compositionId, 'canvas', { quiet: true });
    if (outcome.status === 'written') { this.keptPath = outcome.canvasPath; this.keepProblem = null; }
    else { this.keepProblem = `Couldn\u2019t keep this canvas: ${outcome.message}`; }
    this.render();
  }

  private onToggleKeep(next: boolean): void {
    if (!next) {
      this.plugin.settings.auto_keep_canvas = false;
      void this.plugin.saveSettings();
      this.render();
      return;
    }
    // ON is the standing yes — ask the exposure question once, then commit.
    new AutoKeepModal(this.app, (keep) => {
      if (keep) {
        this.plugin.settings.auto_keep_canvas = true;
        void this.plugin.saveSettings();
        void this.autoKeep();
      }
      this.render(); // a declined toggle snaps back to off
    }).open();
  }

  private resolvePerson = (name: string): string | null => {
    const path = this.plugin.personIndex.find(name)?.path;
    return path ? path.replace(/\.md$/, '').split('/').pop() ?? null : null;
  };

  /**
   * A control pressed on a card. The web's sequence, exactly: POST the action,
   * apply the returned mutations to the spec on screen, persist them
   * (fire-and-forget, as the web does), re-render. Errors come back to the
   * row that asked — never a silent no-op.
   */
  private runAction = async (componentId: string, action: string, params: Record<string, unknown> | undefined): Promise<{ ok: boolean; message?: string }> => {
    if (!this.compositionId || !this.spec) return { ok: false, message: 'No canvas open.' };
    if (action.startsWith('offer:')) return this.runOffer(componentId, action.slice('offer:'.length), params);
    if (action === 'inline_chat' && typeof params?.message === 'string') this.chatMessages.push(params.message);
    const res = await this.plugin.backend.executeCompositionAction(this.compositionId, componentId, action, params).catch(() => null);
    const d = res?.data;
    if (!res?.ok || !d) return { ok: false, message: res?.error || 'Could not reach Myu.' };
    if (d.response_type === 'error' || d.success === false) return { ok: false, message: d.error || d.message || "That didn\u2019t work." };
    if (d.composition || d.surface_mutations?.length) this.snapshot();
    if (d.composition) this.spec = d.composition;
    if (Array.isArray(d.surface_mutations) && d.surface_mutations.length > 0) {
      this.spec = applyMutations(this.spec, d.surface_mutations);
      void this.plugin.backend.persistCompositionMutations(this.compositionId, d.surface_mutations).catch(() => undefined);
    }
    if (d.composition || d.surface_mutations?.length) { this.render(); void this.autoKeep(); }
    // One record, every surface (the mirror of the chat→canvas nudge): a
    // canvas action may have answered an ask the chat is still showing.
    void this.plugin.chatView()?.revalidateLinkedInAsk();
    return { ok: true, message: d.message };
  };

  /**
   * The interaction record — the web's `recordInteraction` + immediate flush
   * for high-signal events. `generate_response` on: the backend answers in the
   * conversation (chat turn + `chatrefresh`), and may mutate this canvas
   * (`composition_mutation`, already handled). The reply lands in the chat
   * pane; `expectChatReply` makes sure it is shown.
   */
  private interact = async (componentId: string, spec: InteractionSpec): Promise<void> => {
    if (!this.compositionId) return;
    const res = await this.plugin.backend.postCompositionInteraction([{ composition_id: this.compositionId, component_id: componentId, component_type: spec.component_type, event_type: spec.event_type, action_value: spec.action_value, timestamp: Date.now(), metadata: spec.metadata }], true).catch(() => null);
    if (res?.data?.response_generating) this.plugin.expectChatReply();
  };

  /** What was asked of this canvas through inline_chat — summarised into the thread on close, like the web's canvas chat bar. */
  private chatMessages: string[] = [];

  /**
   * The offer block's doors (cold start, slice 4) — the web's OfferBlockRenderer,
   * in the pane. Success rewrites the block in place ("Calendar's in…"), the
   * dismissal removes it and is remembered on the account.
   */
  private async runOffer(componentId: string, option: string, params: Record<string, unknown> | undefined): Promise<{ ok: boolean; message?: string }> {
    const out = await runOfferOption(this.plugin, option, params);
    if (out.done === 'connected' && this.spec) {
      this.snapshot();
      this.spec = applyMutations(this.spec, [{ op: 'update', target_id: componentId, data_patch: { lead: 'Calendar\u2019s in. Your week starts painting in Today.', gap_line: '', options: [], trust_line: '', named_person: null } }]);
      this.render();
    }
    if (out.done === 'dismissed' && this.spec) {
      this.snapshot();
      this.spec = out.ackText
        ? applyMutations(this.spec, [{ op: 'update', target_id: componentId, data_patch: { lead: out.ackText, gap_line: '', options: [], trust_line: '', named_person: null } }])
        : applyMutations(this.spec, [{ op: 'remove', target_id: componentId }]);
      this.render();
    }
    return { ok: out.ok, message: out.message };
  }

  private render(): void {
    const root = this.contentEl;
    root.empty();

    if (this.state === 'loading') {
      root.createDiv({ cls: 'myu-quiet', text: 'reading\u2026' });
      return;
    }
    if (this.state === 'error') {
      root.createDiv({ cls: 'myu-quiet', text: "Couldn't load that canvas." });
      return;
    }
    if (!this.spec) {
      root.createDiv({ cls: 'myu-quiet', text: 'No canvas open.' });
      return;
    }

    this.renderHeader(root);

    const body = root.createDiv({ cls: 'myu-canvas-body' });
    if (this.spec.summary_text?.trim()) {
      const lead = body.createDiv({ cls: 'myu-canvas-component markdown-rendered' });
      void MarkdownRenderer.render(this.app, this.spec.summary_text.trim(), lead, '', this);
    }
    // Component by component, in the note's reading order, so a card with
    // controls gets its buttons directly under its own markdown. sourcePath ''
    // — the composition is not a file, so links resolve against the vault
    // root. `this` is the Component owning the render's lifecycle.
    for (const entry of compositionFlow(this.spec)) {
      if ('scene' in entry) { body.createEl('h2', { cls: 'myu-canvas-scene', text: entry.scene }); continue; }
      const { component, depth } = entry;
      const md = componentMarkdown(component, depth, this.resolvePerson, this.spec.components, 'pane').trim();
      const host = body.createDiv({ cls: `myu-canvas-component myu-canvas-${component.type} markdown-rendered` });
      if (md) void MarkdownRenderer.render(this.app, md, host, '', this);
      renderComponentActions(host, component, { run: this.runAction, interact: this.interact });
    }

    renderCanvasFooter(root, { autoKeep: this.plugin.settings.auto_keep_canvas, keptPath: this.keptPath, problem: this.keepProblem, canUndo: this.snapshots.length > 0, expired: this.expired }, {
      onToggle: (next) => this.onToggleKeep(next),
      // The pane KNOWS which composition it is showing.
      onSave: () => new CanvasExportModal(this.app, this.plugin, this.compositionId ?? undefined).open(),
      onUndo: () => { this.undo(); },
      onHistory: () => new CanvasHistoryModal(this.app, this.plugin).open(),
      onRefresh: () => void this.refresh(),
    });
  }

  /**
   * The header the pane never had: WHICH canvas this is, how to step to the one
   * before it, and whether the pane is following. Every artifact panel worth
   * copying does this in place (Claude's ← → at the top of the panel, ChatGPT's
   * version arrows in the toolbar) rather than sending you to a list.
   */
  private renderHeader(root: HTMLElement): void {
    const head = root.createDiv({ cls: 'myu-canvas-head' });
    const title = (this.spec?.summary_text ?? '').trim().split('\n')[0] || 'Canvas';
    head.createDiv({ cls: 'myu-canvas-heading', text: title.length > 64 ? `${title.slice(0, 63)}\u2026` : title });

    const row = head.createDiv({ cls: 'myu-canvas-nav' });
    // The canvas on screen may not be in the history list yet (minutes old, or
    // never listed) — which left the index at -1 and both arrows dead. It is
    // the newest thing there is, so it leads.
    const rows = this.history.some((h) => (h.composition_id ?? h.id) === this.compositionId)
      ? this.history
      : [{ composition_id: this.compositionId ?? '', summary_text: this.spec?.summary_text }, ...this.history];
    const index = rows.findIndex((h) => (h.composition_id ?? h.id) === this.compositionId);
    const total = rows.length;

    const older = row.createEl('button', { cls: 'myu-affordance myu-icon-button', attr: { 'aria-label': 'Older canvas' } });
    setIcon(older, 'chevron-left');
    older.disabled = index < 0 || index >= total - 1;
    older.onclick = () => void this.stepTo(rows, index + 1);

    const newerBtn = row.createEl('button', { cls: 'myu-affordance myu-icon-button', attr: { 'aria-label': 'Newer canvas' } });
    setIcon(newerBtn, 'chevron-right');
    newerBtn.disabled = index <= 0;
    newerBtn.onclick = () => void this.stepTo(rows, index - 1);

    // The steppers and their label belong together; the pin is a different kind
    // of control and sits apart. Silent, disabled arrows read as broken, so the
    // position is always stated (operator, 2026-09-01).
    row.createSpan({ cls: 'myu-whisper', text: total > 1 ? `${index + 1} of ${total}` : 'the only canvas so far' });

    // The pin: Obsidian's linked pane. Following is the default; holding still is the choice.
    // What the pin DOES, in the tooltip and in words below — an icon that only
    // changes colour teaches nobody (operator: "what is supposed to happen?").
    const pin = row.createEl('button', { cls: `myu-affordance myu-icon-button myu-canvas-pin${this.pinned ? ' myu-cta' : ''}`, attr: { 'aria-label': this.pinned
      ? 'Pinned: this canvas stays put. A newer one waits, and says so here.'
      : 'Following the newest: a new canvas takes this pane. Pin to hold this one.' } });
    setIcon(pin, this.pinned ? 'pin' : 'pin-off');
    pin.onclick = () => { this.pinned = !this.pinned; if (!this.pinned) this.newer = null; this.render(); };

    head.createDiv({ cls: 'myu-whisper', text: this.pinned ? 'pinned \u2014 a newer canvas will wait for you' : 'following the newest canvas' });

    // The way back. A canvas without its conversation is an orphan.
    const back = head.createEl('button', { cls: 'myu-affordance myu-link-button', text: 'Show in the conversation' });
    back.onclick = () => { if (this.compositionId) void this.plugin.showCanvasInChat(this.compositionId); };

    if (this.newer) {
      const nudge = head.createEl('button', { cls: 'myu-affordance myu-link-button', text: `A newer canvas is ready \u2014 ${this.newer.summary || 'open it'} \u2192` });
      const id = this.newer.compositionId;
      nudge.onclick = () => { this.newer = null; void this.showComposition(id); };
    }
  }

  /** Recent canvases, newest first — refreshed quietly; failure just leaves the stepper disabled. */
  private async loadHistory(): Promise<void> {
    const res = await this.plugin.backend.getCompositionHistory(20).catch(() => null);
    // Expired canvases stay in the walk. Dropping them left the stepper empty
    // while "Past canvases…" listed a dozen — the pane claiming to be the only
    // canvas that ever existed (operator, 2026-09-01). An outdated one still
    // reads, and the pane already says so with its own banner and Refresh.
    const rows = (res?.data?.compositions ?? []).filter((r) => r.composition_id || r.id);
    if (rows.length === 0) return;
    this.history = rows;
    this.render();
  }

  /** Walk the history list in place — the stepper's action. */
  private async stepTo(rows: CompositionHistoryRow[], index: number): Promise<void> {
    const row = rows[index];
    const id = row?.composition_id ?? row?.id;
    if (!id) return;
    this.newer = null;
    await this.showComposition(id);
  }

  /** The web's Refresh: a fresh spec for a stale canvas. Wire filled in once the contract is read (bucket 1, row 2). */
  async refresh(): Promise<void> {
    if (!this.compositionId) return;
    const res = await this.plugin.backend.refreshComposition(this.compositionId).catch(() => null);
    const spec = res?.data?.composition ?? null;
    if (!res?.ok || !spec) { this.keepProblem = `Couldn\u2019t refresh: ${res?.error || 'no answer from Myu'}`; this.render(); return; }
    this.snapshot();
    this.spec = spec;
    // A refresh mints a NEW composition (the pipeline re-runs); follow its id
    // so the next chat turn and the next keep name the right canvas.
    if (typeof spec.id === 'string' && spec.id && spec.id !== this.compositionId) { this.compositionId = spec.id; this.keptPath = null; }
    this.expired = null;
    this.keepProblem = null;
    this.render();
    void this.autoKeep();
  }

  override onClose(): Promise<void> {
    // The web's summarizeAndBridge: closing after asking the canvas things
    // posts a bridge note into the conversation. Fire-and-forget, like the web.
    if (this.compositionId && this.chatMessages.length > 0) {
      void this.plugin.backend.executeCompositionAction(this.compositionId, '__session__', 'summarize_session', { chat_messages: [...this.chatMessages] }).catch(() => undefined);
      this.chatMessages = [];
    }
    this.contentEl.empty();
    return Promise.resolve();
  }

}
