/**
 * PrepView — the prep card, beside your notes. The #1 use case, in the vault.
 *
 * Render order and register are COPIED from the web card (`PrepCard.tsx`), not
 * reinterpreted: `signal` ← watch, `read` ← stand (serif — Myu's voice under its
 * whisper), `move`, factual floor; the thread claim lives behind `why` with
 * the evidence, not as a fourth zone. Claims print verbatim — hedging is baked
 * in server-side (R1) and the gate's nulls stay null (R4): a dropped zone
 * renders NOTHING, never a synthesized substitute.
 *
 * Chips by exception only (silence = linked / fully backed):
 *   `likely match — confirm on the web` — identity resolution needs the web's
 *     picker; the chip says where the door is instead of pretending to be one.
 *   `who is this?` — an UNLINKED subject (attendee-less booking): the card
 *     cannot say who the meeting is with, so it asks. Inline search →
 *     `linkPrepSubject` → refetch; the answer persists server-side and outranks
 *     every future guess.
 *   `no history yet` / `stale — {date}` + `refresh`.
 *
 * The ask/after affordance seeds ChatView with the prep context (P6.2), so
 * "why this read?" resolves against the claims on THIS card rather than a
 * fresh derivation.
 */

import { setIcon, ItemView, WorkspaceLeaf } from 'obsidian';
import type AskMyuPlugin from '../main';
import type { EntityHeadline, PrepClaim, PrepPayload } from '../wire';

export const PREP_VIEW_TYPE = 'askmyu-prep';

export class PrepView extends ItemView {
  private prep: PrepPayload | null = null;
  private eventId: string | null = null;
  private state: 'idle' | 'loading' | 'error' | 'unavailable' = 'idle';
  private showWhy = false;
  private showNotes = false;
  private showLink = false;
  private linkResults: EntityHeadline[] = [];
  private linkQuery = '';
  private linking = false;
  private searchSeq = 0;

  constructor(
    leaf: WorkspaceLeaf,
    private plugin: AskMyuPlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return PREP_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.prep ? `Myu — ${this.prep.subject.display_name}` : 'Myu — prep';
  }

  override getIcon(): string {
    return 'target';
  }

  override async onOpen(): Promise<void> {
    this.contentEl.addClass('myu-today');
    this.render();
  }

  override async onClose(): Promise<void> {
    this.contentEl.empty();
  }

  async showMeeting(eventId: string): Promise<void> {
    this.eventId = eventId;
    this.state = 'loading';
    this.prep = null;
    // Disclosure toggles are per-payload, not per-pane-lifetime.
    this.showWhy = false;
    this.showNotes = false;
    this.showLink = false;
    this.linkQuery = '';
    this.linkResults = [];
    this.render();
    await this.fetch();
  }

  private async fetch(): Promise<void> {
    if (!this.eventId) return;
    const res = await this.plugin.backend.getMeetingPrep(this.eventId);
    if (!res.ok || !res.data?.prep) {
      this.state = res.status === 404 ? 'unavailable' : 'error';
      this.render();
      return;
    }
    this.prep = res.data.prep;
    this.state = 'idle';
    this.render();
  }

  /** Quiet refetch — the stale chip's `refresh` and the post-link re-warm. */
  private refresh(): void {
    void this.fetch();
  }

  // ── render ────────────────────────────────────────────────────────────────

  private render(): void {
    const root = this.contentEl;
    root.empty();

    if (this.state === 'loading') {
      root.createEl('p', { cls: 'myu-quiet', text: 'Opening prep…' });
      return;
    }
    if (this.state === 'unavailable') {
      root.createEl('p', { cls: 'myu-quiet', text: 'No prep for this meeting yet.' });
      return;
    }
    if (this.state === 'error') {
      root.createEl('p', { cls: 'myu-quiet', text: "Couldn't reach Myu just now." });
      const retry = root.createEl('button', { cls: 'myu-affordance', text: 'Try again' });
      retry.onclick = () => this.refresh();
      return;
    }
    if (!this.prep) return;
    const prep = this.prep;

    this.renderHeader(root, prep);
    this.renderChips(root, prep);
    if (this.showLink) this.renderLinkSearch(root);
    this.renderZones(root, prep);
    this.renderFactual(root, prep);
    this.renderFooter(root, prep);
    if (this.showNotes) this.renderNotes(root, prep);
    if (this.showWhy) this.renderWhy(root, prep);
  }

  private renderHeader(root: HTMLElement, prep: PrepPayload): void {
    const head = root.createDiv({ cls: 'myu-prep-head' });
    head.createDiv({ cls: 'myu-card-title', text: prep.subject.display_name });
    if (prep.meeting) {
      const time = new Date(prep.meeting.starts_at)
        .toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
        .toLowerCase();
      head.createDiv({
        cls: 'myu-quiet myu-prep-meeting',
        text: `${prep.meeting.title ? `${prep.meeting.title} · ` : ''}${time}`,
      });
    }
  }

  private renderChips(root: HTMLElement, prep: PrepPayload): void {
    const cold = prep.data_tier === 'cold';
    const stale = prep.data_tier === 'stale';
    const identityUnconfirmed =
      prep.subject.identity_status === 'likely_match' ||
      prep.subject.identity_status === 'pending_disambiguation';
    const unlinked = prep.subject.entity_id === 'unlinked' || prep.subject.entity_id.includes('@');

    if (!cold && !stale && !identityUnconfirmed && !unlinked) return;

    const chips = root.createDiv({ cls: 'myu-prep-chips' });

    if (identityUnconfirmed) {
      // P8.7 — the picker is IN the pane now: same inline search the unlinked
      // case uses, pre-seeded with the likely subject so candidates appear
      // immediately. Confirming calls linkPrepSubject — an explicit answer,
      // which outranks inference server-side. No more browser exit here.
      const confirm = chips.createEl('button', { cls: 'myu-chip myu-chip-amber', text: 'Likely match — confirm' });
      confirm.onclick = () => {
        this.showLink = true;
        this.linkQuery = prep.subject.display_name ?? '';
        void this.runLinkSearch(this.linkQuery);
        this.render();
      };
    }
    if (unlinked) {
      const who = chips.createEl('button', { cls: 'myu-chip myu-chip-amber', text: 'Who is this?' });
      who.onclick = () => {
        this.showLink = !this.showLink;
        this.render();
      };
    }
    if (cold) chips.createSpan({ cls: 'myu-chip', text: 'no history yet' });
    if (stale) {
      chips.createSpan({ cls: 'myu-chip', text: `stale — ${staleLabel(prep)}` });
      const refresh = chips.createEl('button', { cls: 'myu-affordance', text: 'Refresh' });
      refresh.onclick = () => this.refresh();
    }
  }

  /** Inline `who is this?` — search people, link, refetch re-warmed. */
  private renderLinkSearch(root: HTMLElement): void {
    const box = root.createDiv({ cls: 'myu-prep-evidence' });
    const input = box.createEl('input', { cls: 'myu-prep-search', attr: { placeholder: 'Search your people…' } });
    input.value = this.linkQuery;
    input.oninput = () => {
      this.linkQuery = input.value;
      void this.runLinkSearch(input.value);
    };
    window.setTimeout(() => input.focus(), 0);

    for (const result of this.linkResults) {
      const row = box.createEl('button', { cls: 'myu-affordance myu-prep-link-row' });
      row.createSpan({ text: `${result.display_name} ` });
      if (result.organization) row.createSpan({ cls: 'myu-quiet', text: `${result.organization} ` });
      setIcon(row.createSpan({ cls: 'myu-chevron', attr: { 'aria-hidden': 'true' } }), 'chevron-right');
      row.disabled = this.linking;
      row.onclick = () => void this.linkSubject(result.entity_id);
    }

    if (this.linkQuery.trim().length > 1 && this.linkResults.length === 0) {
      box.createEl('p', {
        cls: 'myu-quiet',
        text: 'Nobody by that name yet — they may not have history with you',
      });
    }
  }

  private async runLinkSearch(query: string): Promise<void> {
    const q = query.trim();
    if (q.length < 2) {
      this.linkResults = [];
      this.render();
      return;
    }
    // Sequence guard: a slow response for "ma" must not clobber "marcus".
    const seq = ++this.searchSeq;
    const res = await this.plugin.backend.searchEntities(q);
    if (seq !== this.searchSeq) return;
    this.linkResults = (res.data?.results ?? []).filter((r) => r.entity_type === 'person').slice(0, 5);
    this.render();
  }

  private async linkSubject(relationshipId: string): Promise<void> {
    if (!this.eventId || this.linking) return;
    this.linking = true;
    this.render();
    const res = await this.plugin.backend.linkPrepSubject(this.eventId, relationshipId);
    this.linking = false;
    if (res.ok) {
      this.showLink = false;
      // The stored prep cleared server-side — refetch re-warms it linked.
      this.refresh();
    } else {
      this.render();
    }
  }

  private renderZones(root: HTMLElement, prep: PrepPayload): void {
    // signal ← watch
    if (prep.watch) {
      const zone = root.createDiv({ cls: 'myu-zone' });
      zone.createDiv({ cls: 'myu-whisper', text: 'signal' });
      const row = zone.createDiv({ cls: 'myu-prep-signal' });
      row.createSpan({ cls: 'myu-prep-dot' });
      row.createSpan({ cls: 'myu-claim', text: prep.watch.text });
      this.renderDated(zone, prep, prep.watch);
    }

    // read ← stand — Myu's voice, serif under its whisper.
    if (prep.stand) {
      const zone = root.createDiv({ cls: 'myu-zone' });
      zone.createDiv({ cls: 'myu-whisper', text: 'read' });
      zone.createDiv({ cls: 'myu-voice', text: prep.stand.text });
      this.renderDated(zone, prep, prep.stand);
    }

    // move
    if (prep.move) {
      const zone = root.createDiv({ cls: 'myu-zone' });
      zone.createDiv({ cls: 'myu-whisper', text: 'move' });
      zone.createDiv({ cls: 'myu-claim', text: prep.move.text });
    }
  }

  /** Stale claims surface their date (isStalePrep contract). */
  private renderDated(zone: HTMLElement, prep: PrepPayload, claim: PrepClaim): void {
    if (prep.data_tier !== 'stale' || !claim.last_updated) return;
    zone.createDiv({ cls: 'myu-quiet', text: `as of ${new Date(claim.last_updated).toLocaleDateString()}` });
  }

  /** Cold/low floor: facts, plainly, never an invented read. Zero accents. */
  private renderFactual(root: HTMLElement, prep: PrepPayload): void {
    const factual = prep.factual;
    if (!factual) return;

    const zone = root.createDiv({ cls: 'myu-zone' });
    zone.createDiv({ cls: 'myu-whisper', text: 'what we know' });
    for (const line of [
      factual.role_line,
      factual.company_name,
      factual.why_meeting,
      (factual.mutual_ties ?? []).length ? `Mutual: ${(factual.mutual_ties ?? []).join(', ')}` : null,
      ...(factual.public_context ?? []),
    ]) {
      if (line) zone.createDiv({ cls: 'myu-quiet myu-fact-row', text: line });
    }
    if (factual.no_history) {
      zone.createEl('p', {
        cls: 'myu-quiet',
        text: `Myu doesn't have history with ${prep.subject.display_name} yet — it builds from here.`,
      });
    }
  }

  private renderFooter(root: HTMLElement, prep: PrepPayload): void {
    const hasWhy = this.evidence(prep).length > 0 || prep.thread !== null;
    if (!hasWhy && !prep.capture_hook && !prep.notes_captured) return;

    const foot = root.createDiv({ cls: 'myu-prep-foot' });

    if (hasWhy) {
      const why = foot.createEl('button', { cls: 'myu-affordance', text: 'Why' });
      why.onclick = () => {
        this.showWhy = !this.showWhy;
        this.render();
      };
    }

    if (prep.notes_captured) {
      const notes = foot.createEl('button', { cls: 'myu-affordance', text: 'Notes captured' });
      notes.onclick = () => {
        this.showNotes = !this.showNotes;
        this.render();
      };
    }

    if (prep.capture_hook) {
      // One meeting, one conversation, two moments: ask before, capture after.
      // Seeds ChatView with the prep context so "why this read?" resolves
      // against the claims on THIS card (P6.2 upgrade of the web deep-link).
      const after = prep.meeting ? Date.now() >= prep.meeting.starts_at : false;
      const talk = foot.createEl('button', { cls: 'myu-affordance', text: after ? 'After' : 'Ask' });
      talk.onclick = () =>
        void this.plugin.openChat({
          text: after ? `How it went with ${prep.subject.display_name}: ` : '',
          send: false,
          context: {
            source: 'prep',
            source_id: prep.prep_id,
            prep_phase: after ? 'after' : 'before',
            prep_event_id: prep.meeting?.meeting_id,
            prep_meeting_title: prep.meeting?.title,
            prep_claims: [prep.watch, prep.stand, prep.thread, prep.move]
              .filter((c): c is NonNullable<typeof c> => c !== null)
              .map((c) => c.text),
            entity_references: [
              {
                entity_type: prep.subject.entity_type,
                entity_id: prep.subject.entity_id,
                display_name: prep.subject.display_name,
              },
            ],
          },
        });
    }
  }

  /** The captured notes, inspectable in place — a state you can't inspect reads as a claim. */
  private renderNotes(root: HTMLElement, prep: PrepPayload): void {
    const box = root.createDiv({ cls: 'myu-prep-evidence' });
    if (prep.notes_summary) box.createDiv({ cls: 'myu-claim', text: prep.notes_summary });

    const decisions = prep.notes_decision_count ?? 0;
    const actions = prep.notes_action_count ?? 0;
    if (decisions > 0 || actions > 0) {
      const parts = [
        decisions > 0 ? `${decisions} decision${decisions === 1 ? '' : 's'}` : null,
        actions > 0 ? `${actions} action item${actions === 1 ? '' : 's'}` : null,
      ].filter(Boolean);
      box.createDiv({ cls: 'myu-quiet', text: `${parts.join(' · ')} on record` });
    }
  }

  private renderWhy(root: HTMLElement, prep: PrepPayload): void {
    const box = root.createDiv({ cls: 'myu-prep-evidence' });
    // The thread claim — the "second observable" — lives here, not as a 4th zone.
    if (prep.thread) box.createDiv({ cls: 'myu-claim', text: prep.thread.text });

    for (const { refs } of this.evidence(prep)) {
      for (const ref of refs) {
        // Refs with a deep link are tappable; the affordance is the chevron,
        // not a colour change — evidence stays muted.
        if (ref.link) {
          const a = box.createEl('a', { cls: 'myu-quiet myu-prep-ref', text: `${ref.label}`, href: ref.link });
          a.setAttr('target', '_blank');
          a.setAttr('rel', 'noopener');
        } else {
          box.createDiv({ cls: 'myu-quiet myu-prep-ref', text: ref.label });
        }
      }
    }
  }

  private evidence(prep: PrepPayload): Array<{ refs: NonNullable<PrepClaim['evidence_refs']> }> {
    return [prep.watch, prep.stand, prep.move, prep.thread]
      .filter((c): c is PrepClaim => c !== null && (c.evidence_refs?.length ?? 0) > 0)
      .map((c) => ({ refs: c.evidence_refs ?? [] }));
  }
}

function staleLabel(prep: PrepPayload): string {
  const newest =
    [prep.stand, prep.thread, prep.watch, prep.move]
      .filter((c): c is PrepClaim => c !== null)
      .reduce((max, c) => Math.max(max, c.last_updated ?? 0), 0) || prep.generated_at;
  return new Date(newest).toLocaleDateString([], { month: 'short', day: 'numeric' }).toLowerCase();
}
