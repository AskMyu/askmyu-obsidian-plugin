/**
 * Person card — the read, rendered beside the note that mentions them.
 *
 * **Ephemeral by design (R2).** This is a pane, not a file. Myu's reads about
 * third parties never become vault content: vault files sync through Dropbox,
 * iCloud and Obsidian Sync, land on devices we know nothing about, and persist
 * outside anyone's retention control. A card view closes and is gone.
 *
 * **Linked, never written.** When a card's person matches a note in the vault —
 * the `People/` page convention this crowd already keeps — the card offers a
 * link to *their* note. Their people-notes and our cards become two views of one
 * person, with the arrow pointing only one way.
 *
 * Register: the header carries no chip when identity is settled (silence =
 * linked), a chip only when it isn't; the read is serif under its label; open
 * threads are plain rows with mono dates. No tier names, no schema words.
 */

import { ItemView, TFile, WorkspaceLeaf, setIcon } from 'obsidian';
import type AskMyuPlugin from '../main';
import type { MailOffer, ScopeSet } from '../transport/api';
import { notifyStatus, notifyError } from '../notify';

import type { BoardLiteResult, CardEntityType, CardSpecLite } from '../transport/api';
import { sectionBlocks, isDiscussable, sectionDiscussSeed } from './cardSections';
import { SourceDetailModal } from './SourceDetailModal';
import { renderLinkedInMatches, renderLinkedInRecovery, suggestionsOf } from './linkedinCards';
import { PersonEditModal, type EditableMemory } from './PersonEditModal';
import { flattenMemoryPayload } from '../vault/myuFiles';
import { decryptWithKey } from '../crypto/primitives';

export const CARD_VIEW_TYPE = 'askmyu-card';

export class CardView extends ItemView {
  private card: CardSpecLite | null = null;
  private state: 'idle' | 'loading' | 'error' | 'unresolved' = 'idle';
  private suggestions: Array<Record<string, unknown>> = [];
  private linkedinKnown = true;
  private title = 'Myu — card';
  private entityType: CardEntityType = 'person';
  private entityId: string | null = null;
  private entityName = '';
  /** Board perspectives — fetched on demand, reset per entity. */
  private board: BoardLiteResult | null = null;
  private boardOpen = false;

  constructor(
    leaf: WorkspaceLeaf,
    private plugin: AskMyuPlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return CARD_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.title;
  }

  override getIcon(): string {
    return 'user';
  }

  override async onOpen(): Promise<void> {
    this.contentEl.addClass('myu-today');
    this.render();
  }

  override async onClose(): Promise<void> {
    this.contentEl.empty();
  }

  /** Person or company — the spec shape is the same, so the renderer is too. */
  /** Re-fetch the current entity (after resolving a suggestion). */
  /** Re-read what is on screen — also on card_section_updated. */
  async reload(): Promise<void> {
    if (this.entityId) await this.showEntity(this.entityType, this.entityId, this.title.replace(/^Myu — /, ''));
  }

  /** Gather the person's memories so corrections can act on them, then open
      the edit surface. Memories come from the same endpoint the person page
      uses, so what you can correct is exactly what you can see. */
  private async openCorrections(): Promise<void> {
    const entityId = this.entityId;
    if (!entityId) return;

    const res = await this.plugin.backend.getRelationshipMemories(entityId).catch(() => null);
    const rows = flattenMemoryPayload(res?.data?.memories);
    const key = this.plugin.keys.get();
    const memories: EditableMemory[] = [];
    for (const row of rows) {
      let text = (row.content ?? '').trim();
      if (!text && typeof row.encrypted_content === 'string' && row.encrypted_content && key) {
        try {
          text = (await decryptWithKey(row.encrypted_content, key)).trim();
        } catch {
          continue;
        }
      }
      const id = row.memory_id;
      if (!text || !id) continue;
      memories.push({ memory_id: id, text, date: row.memory_date?.slice(0, 10) });
    }

    new PersonEditModal(this.app, this.plugin, entityId, this.entityName, memories, () => {
      // Server truth moved: refetch the card, and let the vault catch up.
      void this.showEntity(this.entityType, entityId, this.entityName);
      void this.plugin.materializer.materializeAll();
    }, this.card?.header?.linkedin_url ?? null).open();
  }

  async showEntity(entityType: CardEntityType, entityId: string, fallbackName: string): Promise<void> {
    this.entityType = entityType;
    this.entityId = entityId;
    this.entityName = fallbackName;
    this.board = null;
    this.boardOpen = false;
    this.title = `Myu — ${fallbackName}`;
    this.state = 'loading';
    this.card = null;
    this.render();

    const res = await this.plugin.backend.getCard(entityType, entityId);
    if (!res.ok || !res.data) {
      this.state = 'error';
      this.render();
      return;
    }

    // Identity still unresolved server-side: the card doesn't exist yet, and the
    // plugin has no business inventing one. Say so and point at the surface that
    // can fix it.
    if (res.data.response_type === 'disambiguation_pending' || !res.data.card) {
      // Carry the candidate list (if any) so the pane can offer a PICKER, not
      // just a status line — disambiguation parity with the web (2026-08-25).
      this.suggestions = Array.isArray(res.data.suggestions) ? res.data.suggestions : [];
      this.state = 'unresolved';
      this.render();
      return;
    }
    this.suggestions = [];
    this.linkedinKnown = res.data.linkedin_known !== false;

    this.card = res.data.card;
    this.state = 'idle';
    this.render();
  }

  /** Both LinkedIn doors, shared with the Help Myu tab (linkedinCards.ts). */
  private renderLinkedInRecovery(root: HTMLElement): void {
    if (!this.entityId) return;
    renderLinkedInRecovery(root, { app: this.app, owner: this, plugin: this.plugin, relationshipId: this.entityId, personName: this.entityName, onResolved: () => void this.reload() });
  }

  private render(): void {
    const root = this.contentEl;
    root.empty();

    if (this.state === 'loading') {
      root.createEl('p', { cls: 'myu-quiet', text: 'Opening…' });
      return;
    }
    if (this.state === 'error') {
      root.createEl('p', { cls: 'myu-quiet', text: "Couldn't reach Myu just now." });
      return;
    }
    if (this.state === 'unresolved') {
      if (this.suggestions.length > 0 && this.entityId) {
        renderLinkedInMatches(root, suggestionsOf(this.suggestions), { app: this.app, owner: this, plugin: this.plugin, relationshipId: this.entityId, personName: this.entityName, onResolved: () => void this.reload() });
        return;
      }
      // ZERO candidates (the person genuinely isn't found — e.g. not on
      // LinkedIn). No card to disambiguate, but the user can still SUPPLY the
      // reference: this is the affordance that was missing (operator finding,
      // 2026-08-25 — the disambiguation picker only showed when candidates
      // existed, so a truly-unknown person offered nothing).
      root.createEl('p', {
        cls: 'myu-quiet',
        text:
          this.entityType === 'company'
            ? "Myu doesn't have a read on this company yet."
            : "Myu couldn't find this person. Point it at the right profile:",
      });
      if (this.entityType === 'person') this.renderLinkedInRecovery(root);
      return;
    }
    if (!this.card) return;

    const header = this.card.header;
    root.createDiv({ cls: 'myu-card-title', text: header?.display_name || this.entityName || 'Card' });
    if (header?.subtitle) root.createDiv({ cls: 'myu-quiet', text: header.subtitle });

    // Chip by exception: an unconfirmed identity is a real gap the user can
    // close — IN the pane (P8.7 follow-up): confirming calls
    // /card/identity/confirm and the chip disappears on the refetch.
    if (header?.identity_status && header.identity_status !== 'confirmed' && header.identity_status !== 'linked') {
      const confirm = root.createEl('button', { cls: 'myu-affordance myu-cta', text: "That's them \u2014 confirm" });
      confirm.onclick = () => {
        const entityId = this.entityId;
        if (!entityId) return;
        confirm.disabled = true;
        void this.plugin.backend.confirmIdentity(entityId).then(async (res) => {
          if (res.ok) await this.showEntity(this.entityType, entityId, this.entityName);
          else confirm.disabled = false;
        });
      };
    }
    // LinkedIn is an OPEN question (no confirmed profile, not declared absent) —
    // offer the supply/mark-absent affordance. Independent of identity_status,
    // which is null for a searched-not-found person (Nomon, 2026-08-25).
    if (this.entityType === 'person' && this.card && this.linkedinKnown === false) {
      root.createEl('p', { cls: 'myu-quiet', text: "Myu doesn't have this person's LinkedIn yet." });
      this.renderLinkedInRecovery(root);
    }

    // The action-row facts the web card has always shown (parity review
    // 2026-08-26). Rendered as a quiet row of real links — facts, so they get
    // no hedging and no chip; absent ones simply don't appear.
    const contacts: Array<[string, string]> = [];
    if (header?.linkedin_url) contacts.push(['LinkedIn', header.linkedin_url]);
    if (header?.website_url) contacts.push(['Website', header.website_url]);
    if (header?.email_primary) contacts.push([header.email_primary, `mailto:${header.email_primary}`]);
    if (contacts.length > 0) {
      const row = root.createDiv({ cls: 'myu-quiet' });
      contacts.forEach(([label, href], i) => {
        if (i > 0) row.createSpan({ text: ' · ' });
        const a = row.createEl('a', { text: label, href });
        a.setAttr('target', '_blank');
        a.setAttr('rel', 'noopener');
      });
    }

    // The per-card mail offer (cold start, slice 6): the server composes it —
    // flag on, person card, no mail source connected — and it stays until "Not now".
    if (this.entityType === 'person' && this.card.mail_offer && !CardView.mailOfferHidden) {
      this.renderMailOffer(root, this.card.mail_offer);
    }

    // The feed panel's on-demand dispatch — "what's up with X" in one line,
    // made when asked, dismissible once read (feed/entities/dispatch|dismiss).
    if (this.entityId) this.renderDispatch(root, header?.display_name || this.entityName);

    // Only people have notes in a vault; a company page is not the convention.
    if (this.entityType === 'person') this.renderVaultLink(root, header?.display_name);

    // "Edit facts, correct inferences, never hand-edit readings" — the webapp's
    // PersonEditSheet, which had no vault story until the 2026-08-26 parity
    // review. It lives HERE rather than on the note because Myu/People/ pages
    // are regenerated from server truth: a correction typed into the file would
    // be silently overwritten on the next pass.
    if (this.entityType === 'person' && this.entityId) {
      const correct = root.createEl('button', { cls: 'myu-affordance', text: 'Correct this' });
      correct.onclick = () => void this.openCorrections();
    }

    // Talk about this person/company, with the card as context — the backend
    // formatter already knows the `card` source; the pane just carries it.
    const discuss = root.createEl('button', { cls: 'myu-affordance', text: 'Discuss' });
    discuss.onclick = () =>
      void this.plugin.openChat({
        text: '',
        send: false,
        context: {
          source: 'card',
          source_id: this.card?.entity_id ?? '',
          card_entity_type: this.entityType,
          card_entity_id: this.card?.entity_id,
          entity_references: this.card?.entity_id
            ? [{ entity_type: this.entityType, entity_id: this.card.entity_id, display_name: header?.display_name ?? '' }]
            : [],
        },
      });

    // Sections go through the pure extraction (cardSections.ts) so what the
    // pane can show is a TESTED property, and what it can't is DISCLOSED —
    // R7: a section this surface can't draw is named, never silently dropped.
    let undrawn = 0;
    for (const section of this.card.sections ?? []) {
      const blocks = sectionBlocks(section);
      if (blocks.length === 0) {
        undrawn++;
        continue;
      }
      const zone = root.createDiv({ cls: 'myu-zone' });
      if (section.title) zone.createDiv({ cls: 'myu-whisper', text: section.title.toLowerCase() });
      for (const block of blocks) {
        if (block.kind === 'narrative') {
          // Myu's voice — serif, under its label, printed as the backend wrote it.
          zone.createDiv({ cls: 'myu-voice', text: block.text });
        } else {
          const row = zone.createDiv({ cls: 'myu-row' });
          if (block.meta) row.createSpan({ cls: 'myu-time', text: block.meta });
          row.createSpan({ cls: 'myu-row-title', text: block.text });
          if (block.source) {
            // Provenance, one press away — the web's source icon.
            const src = row.createEl('button', { cls: 'myu-affordance myu-icon-button', attr: { 'aria-label': 'Where this came from' } });
            setIcon(src, 'file-search');
            const source = block.source;
            src.onclick = () => new SourceDetailModal(this.app, this.plugin, source.type, source.id).open();
          }
        }
      }
      // The web's per-section "Discuss with Myu" — only where it offers one.
      if (isDiscussable(section) && this.card) {
        const seed = sectionDiscussSeed(this.card, this.entityType, section, blocks);
        const discussSection = zone.createEl('button', { cls: 'myu-affordance myu-link-button', text: 'Discuss this with Myu' });
        discussSection.onclick = () => void this.plugin.openChat({
          text: seed.text, send: false,
          context: { source: 'card_section', source_id: seed.source_id, card_entity_type: this.entityType, card_entity_id: this.card?.entity_id, section_type: section.section_type, section_content: seed.section_content, section_narrative: seed.section_narrative, entity_references: this.card?.entity_id ? [{ entity_type: this.entityType, entity_id: this.card.entity_id, display_name: header?.display_name ?? '' }] : [] },
        });
      }
    }

    if (this.entityType === 'person' && this.entityId) void this.renderRelated(root, this.entityId);

    if (undrawn > 0) {
      const disclosure = root.createDiv({ cls: 'myu-zone' });
      const link = disclosure.createEl('a', {
        cls: 'myu-quiet',
        text: `${undrawn} ${undrawn === 1 ? 'section doesn’t' : 'sections don’t'} render here yet — open on the web`,
        href: `${this.plugin.settings.base_url.replace(/\/api\/?$/, '')}/dashboard`,
      });
      link.setAttr('target', '_blank');
      link.setAttr('rel', 'noopener');
    }

    this.renderBoard(root);
  }

  /**
   * Board perspectives (parity gap closed 2026-08-21) — 2-3 advisor takes,
   * fetched on demand from /card/board-lite. Pane content by doctrine: takes
   * are ephemeral advisory voices generated for this moment, not standing
   * state, so they have no vault-native expression. Each advisor is a NAMED
   * voice — whisper label carries the name, the take renders verbatim.
   */
  private renderBoard(root: HTMLElement): void {
    const zone = root.createDiv({ cls: 'myu-zone' });

    if (!this.boardOpen) {
      const open = zone.createEl('button', { cls: 'myu-affordance', text: 'Board perspectives' });
      open.onclick = () => {
        this.boardOpen = true;
        this.render();
        if (!this.board && this.entityId) {
          void this.plugin.backend.getBoardLite(this.entityType, this.entityId).then((res) => {
            this.board = res.ok ? (res.data ?? { takes: [] }) : { takes: [] };
            this.render();
          });
        }
      };
      return;
    }

    zone.createDiv({ cls: 'myu-whisper', text: 'the board' });
    if (!this.board) {
      zone.createEl('p', { cls: 'myu-quiet', text: 'Convening…' });
      return;
    }

    const takes = this.board.takes ?? [];
    if (takes.length === 0) {
      zone.createEl('p', { cls: 'myu-quiet', text: 'The board has nothing yet — not enough history here.' });
      return;
    }

    for (const take of takes) {
      const block = zone.createDiv({ cls: 'myu-hero' });
      block.createDiv({ cls: 'myu-whisper', text: (take.advisor_name ?? 'advisor').toLowerCase() });
      block.createDiv({ cls: 'myu-voice', text: take.take_text ?? take.text ?? '' });
    }

    // Seed rides the message text — the supported contract for content the
    // backend's context formatter doesn't hydrate from an id.
    const talk = zone.createEl('button', { cls: 'myu-affordance', text: 'Talk this through' });
    talk.onclick = () => {
      const lines = takes.map((t) => `${t.advisor_name ?? 'Advisor'}: ${t.take_text ?? t.text ?? ''}`).join('\n');
      void this.plugin.openChat({
        text: `The board's takes on ${this.entityName}:\n\n${lines}\n\nWhat do you make of these?`,
        send: false,
      });
    };
  }

  /**
   * Name-match against the vault's own people pages, via the PersonPageIndex —
   * so `aliases:` frontmatter and `type: person` pages count, not just an exact
   * basename anywhere in the vault. Link only (R2): we open their note, we
   * never touch it.
   */
  private static mailOfferHidden = false;
  private renderMailOffer(root: HTMLElement, offer: MailOffer): void {
    const box = root.createDiv({ cls: 'myu-mail-offer myu-canvas-component' });
    const lead = (offer.lead ?? '').trim();
    // The server's lead is two sentences: the gap, then the ask. Voice, then quiet.
    const cut = lead.indexOf('. ');
    if (cut > 0) { box.createDiv({ cls: 'myu-voice', text: lead.slice(0, cut + 1) }); box.createDiv({ cls: 'myu-quiet', text: lead.slice(cut + 2) }); }
    else if (lead) box.createDiv({ cls: 'myu-voice', text: lead });
    const actions = box.createDiv({ cls: 'myu-canvas-actions' });
    for (const o of offer.options ?? []) {
      const label = (o.label ?? '').trim();
      if (!label) continue;
      if (o.init?.provider === 'google' || o.init?.provider === 'microsoft') {
        const provider = o.init.provider;
        const opts = { scopeSet: (o.init.scope_set as ScopeSet | undefined) ?? 'history', returnTo: o.init.return_to };
        const b = actions.createEl('button', { cls: `myu-affordance${o.id === 'gmail' ? ' myu-cta' : ''}`, text: label });
        b.onclick = async () => {
          b.disabled = true;
          const init = provider === 'google' ? await this.plugin.backend.googleOAuthInit(opts).catch(() => null) : await this.plugin.backend.microsoftOAuthInit(opts).catch(() => null);
          const url = init?.data?.auth_url;
          if (init?.ok && url) { window.open(url, '_blank'); notifyStatus('Finish in your browser \u2014 Myu reads the history when you come back.'); }
          else { notifyError('The consent screen did not answer. Try again in a moment.'); b.disabled = false; }
        };
      } else if (o.id === 'imap') {
        const b = actions.createEl('button', { cls: 'myu-affordance', text: label });
        b.onclick = () => this.plugin.openSettingsAt('Other email (IMAP)');
      } else if (o.id === 'not_now') {
        const b = actions.createEl('button', { cls: 'myu-affordance myu-link-button', text: label });
        b.onclick = () => { CardView.mailOfferHidden = true; box.remove(); };
      }
      // 'archive' (a mail export upload) has no verified plugin route yet — not offered here.
    }
    if (offer.trust_line) box.createDiv({ cls: 'myu-quiet', text: offer.trust_line });
  }

  /** feed/entities/dispatch → one sentence on demand; dismiss with the receipt's fingerprint. */
  private renderDispatch(root: HTMLElement, name: string): void {
    const host = root.createDiv({ cls: 'myu-dispatch' });
    const ask = host.createEl('button', { cls: 'myu-affordance myu-link-button', text: `What\u2019s up with ${name}?` });
    ask.onclick = async () => {
      ask.disabled = true; ask.setText('Asking\u2026');
      const entityId = this.entityId; if (!entityId) return;
      const res = await this.plugin.backend.getEntityDispatch(this.entityType, entityId).catch(() => null);
      host.empty();
      const line = res?.data?.dispatch_sentence?.trim();
      if (!res?.ok || !line) { host.createDiv({ cls: 'myu-quiet', text: 'Nothing new to say right now.' }); return; }
      host.createDiv({ cls: 'myu-voice', text: line });
      const fp = res.data?.dispatch_receipt?.signal_fingerprint;
      if (typeof fp === 'string' && fp) {
        const drop = host.createEl('button', { cls: 'myu-affordance myu-link-button', text: 'Dismiss' });
        drop.onclick = () => { void this.plugin.backend.dismissEntityDispatch(entityId, fp, res.data?.dispatch_category).catch(() => undefined); host.empty(); };
      }
    };
  }

  /** The expanded feed card's related people + memories (feed/related-*). Quiet rows; people open their card. */
  private async renderRelated(root: HTMLElement, relationshipId: string): Promise<void> {
    const [people, memories] = await Promise.all([
      this.plugin.backend.getRelatedPersons(relationshipId).catch(() => null),
      this.plugin.backend.getRelatedMemories(relationshipId).catch(() => null),
    ]);
    if (this.entityId !== relationshipId) return; // the pane moved on
    const persons = people?.data?.related ?? [];
    const mems = memories?.data?.related ?? [];
    if (!persons.length && !mems.length) return;
    const zone = root.createDiv({ cls: 'myu-zone' });
    zone.createDiv({ cls: 'myu-whisper', text: 'around them' });
    for (const p of persons) {
      const row = zone.createEl('button', { cls: 'myu-row myu-row-tappable', attr: { 'aria-label': `Open ${p.display_name}` } });
      row.createSpan({ cls: 'myu-row-title', text: p.display_name + (p.subtitle ? ` \u2014 ${p.subtitle}` : '') });
      row.onclick = () => void this.plugin.openCard('person', p.relationship_id, p.display_name);
    }
    for (const m of mems) {
      if (!m.content) continue;
      const row = zone.createDiv({ cls: 'myu-row' });
      if (m.memory_date) row.createSpan({ cls: 'myu-time', text: m.memory_date.slice(0, 10) });
      row.createSpan({ cls: 'myu-row-title', text: (m.entity_display_name ? `${m.entity_display_name}: ` : '') + m.content });
      if (m.source_type && m.source_id) {
        const src = row.createEl('button', { cls: 'myu-affordance myu-icon-button', attr: { 'aria-label': 'Where this came from' } });
        setIcon(src, 'file-search');
        src.onclick = () => new SourceDetailModal(this.app, this.plugin, m.source_type as string, m.source_id as string).open();
      }
    }
  }

  private renderVaultLink(root: HTMLElement, name?: string): void {
    if (!name) return;
    const page = this.plugin.personIndex.find(name);
    if (!page) return;
    const note = this.plugin.app.vault.getAbstractFileByPath(page.path);
    if (!(note instanceof TFile)) return;

    const link = root.createEl('button', { cls: 'myu-affordance', text: 'Your note' });
    link.onclick = () => void this.app.workspace.getLeaf(false).openFile(note);
  }
}
