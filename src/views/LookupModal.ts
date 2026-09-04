/**
 * "askMyu: look up…" — the command-palette entry into cards.
 *
 * A fuzzy suggester over the account's ranked entity list — the same
 * `/feed/entities` the People and Companies tabs use on every other surface, so
 * people AND companies are both reachable here rather than companies being
 * findable only by happening to be mentioned in a brief item.
 */

import { App, FuzzySuggestModal, type FuzzyMatch } from 'obsidian';
import type AskMyuPlugin from '../main';
import type { CardEntityType, EntityHeadline } from '../transport/api';

export class LookupModal extends FuzzySuggestModal<EntityHeadline> {
  private entities: EntityHeadline[] = [];

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
    // Re-run the query now that there is something to match against.
    this.inputEl.dispatchEvent(new Event('input'));
  }

  getItems(): EntityHeadline[] {
    return this.entities;
  }

  getItemText(entity: EntityHeadline): string {
    return entity.display_name;
  }

  override renderSuggestion(match: FuzzyMatch<EntityHeadline>, el: HTMLElement): void {
    el.createDiv({ text: match.item.display_name });
    const sub = match.item.organization || match.item.subtitle;
    if (sub) el.createDiv({ cls: 'myu-quiet', text: sub });
  }

  onChooseItem(entity: EntityHeadline): void {
    this.onPick(entity);
  }
}
