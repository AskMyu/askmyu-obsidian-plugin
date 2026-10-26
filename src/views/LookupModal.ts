/**
 * "askMyu: look up…" — the command-palette entry into cards.
 *
 * A fuzzy suggester over the account's ranked entity list — the same
 * `/feed/entities` the People and Companies tabs use on every other surface, so
 * people AND companies are both reachable here rather than companies being
 * findable only by happening to be mentioned in a brief item.
 *
 * People Myu isn't keeping track of yet (2026-10-03): the server leaves people who were only on some of your emails
 * out of the list. The list's foot carries the server's line for them ("214 more people from your mail"), which opens
 * the fold (MapFoldModal). Search covers everyone: the typed words also go to `/feed/entities/search`, and whoever the
 * list lacks joins the suggestions — a person on the map drawn folded, with the mark "not keeping track yet".
 * Choosing one opens their card like any person; the card changes nothing (only "Keep track" does).
 */

import { App, FuzzySuggestModal, type FuzzyMatch } from 'obsidian';
import type AskMyuPlugin from '../main';
import type { CardEntityType, EntityHeadline } from '../transport/api';
import type { MapFold } from '../wire';
import { MAP_FOLD_WORDS, foldLine, isOnMap, seenWords, timesSeen } from '../mapFold';
import { MapFoldModal } from './MapFoldModal';

/** How long after the last keystroke the server is asked. */
const SEARCH_WAIT_MS = 250;

export class LookupModal extends FuzzySuggestModal<EntityHeadline> {
  private entities: EntityHeadline[] = [];
  /** Whoever the server found for the typed words that the list leaves out: on the map, or down the long tail. */
  private found: EntityHeadline[] = [];
  private map: MapFold | null = null;
  private foot: HTMLElement | null = null;
  private seq = 0;
  private lastQuery = '';
  private cancelSearch: (() => void) | null = null;
  private busy: Promise<void> = Promise.resolve();
  /** The wait before the server is asked — swapped for an immediate one in tests. */
  schedule: (fn: () => void, ms: number) => () => void = (fn, ms) => {
    const t = window.setTimeout(fn, ms);
    return () => window.clearTimeout(t);
  };

  constructor(
    app: App,
    private plugin: AskMyuPlugin,
    private tab: CardEntityType,
    private onPick: (entity: EntityHeadline) => void,
  ) {
    super(app);
    this.setPlaceholder(tab === 'company' ? 'Look up a company…' : 'Look up someone Myu knows…');
  }

  override async onOpen(): Promise<void> {
    await super.onOpen();
    const res = await this.plugin.backend.listEntities(this.tab);
    this.entities = res.data?.entities ?? [];
    this.map = this.tab === 'person' ? (res.data?.map ?? null) : null;
    this.renderFoot();
    // Re-run the query now that there is something to match against.
    this.inputEl.dispatchEvent(new Event('input'));
  }

  override onClose(): void {
    this.cancelSearch?.();
    this.cancelSearch = null;
  }

  /** The server's line at the foot of the list, when anyone is on the map; it opens the fold. */
  private renderFoot(): void {
    this.foot?.remove();
    this.foot = null;
    const line = foldLine(this.map);
    if (!line) return;
    this.foot = this.modalEl.createDiv({ cls: 'myu-map-foot' });
    const open = this.foot.createEl('button', { cls: 'myu-map-foot-line', text: line });
    open.onclick = () => this.openFold();
  }

  /** The fold in place of this list; closing it comes back here, to a list read again. */
  openFold(): MapFoldModal | null {
    if (!this.map) return null;
    this.close();
    const fold = new MapFoldModal(this.app, this.plugin, this.map, {
      onBack: () => new LookupModal(this.app, this.plugin, this.tab, this.onPick).open(),
    });
    fold.open();
    return fold;
  }

  getItems(): EntityHeadline[] {
    return this.found.length ? [...this.entities, ...this.found] : this.entities;
  }

  getItemText(entity: EntityHeadline): string {
    return entity.display_name;
  }

  override getSuggestions(query: string): FuzzyMatch<EntityHeadline>[] {
    this.askServer(query.trim());
    return super.getSuggestions(query);
  }

  /** The search in flight — tests wait on it. */
  whenIdle(): Promise<void> {
    return this.busy;
  }

  private askServer(query: string): void {
    this.cancelSearch?.();
    this.cancelSearch = null;
    if (query.length < 2) {
      this.found = [];
      this.lastQuery = '';
      return;
    }
    if (query === this.lastQuery) return;
    this.cancelSearch = this.schedule(() => {
      this.cancelSearch = null;
      this.busy = this.busy.then(() => this.search(query)).catch(() => undefined);
    }, SEARCH_WAIT_MS);
  }

  private async search(query: string): Promise<void> {
    const mine = ++this.seq;
    const res = await this.plugin.backend.searchEntities(query).catch(() => null);
    if (mine !== this.seq) return;
    this.lastQuery = query;
    const listed = new Set(this.entities.map((e) => e.entity_id));
    const kind = this.tab === 'company' ? 'company' : 'person';
    const found = (res?.data?.results ?? []).filter((r) => r.entity_type === kind && !listed.has(r.entity_id));
    const same = found.length === this.found.length && found.every((r, i) => r.entity_id === this.found[i]?.entity_id);
    this.found = found;
    if (!same) this.inputEl.dispatchEvent(new Event('input'));
  }

  override renderSuggestion(match: FuzzyMatch<EntityHeadline>, el: HTMLElement): void {
    const item = match.item;
    const onMap = isOnMap(item);
    if (onMap) el.addClass('myu-map-hit');
    el.createDiv({ text: item.display_name });
    const sub = [
      item.organization || item.subtitle,
      onMap && timesSeen(item) > 0 ? seenWords(item) : null,
      onMap ? MAP_FOLD_WORDS.mark : null,
    ]
      .filter(Boolean)
      .join(' · ');
    if (sub) el.createDiv({ cls: 'myu-quiet', text: sub });
  }

  onChooseItem(entity: EntityHeadline): void {
    this.onPick(entity);
  }
}
