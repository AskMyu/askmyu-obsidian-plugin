/**
 * "Merge into…" — pick the person who stays. The same fuzzy picker as
 * LookupModal, over the web's exact candidate rule (personActions.mergeCandidates).
 */

import { App, FuzzySuggestModal, type FuzzyMatch } from 'obsidian';
import type AskMyuPlugin from '../main';
import type { EntityHeadline } from '../transport/api';
import { mergeCandidates } from './personActions';

export class MergeIntoModal extends FuzzySuggestModal<EntityHeadline> {
  private entities: EntityHeadline[] = [];

  constructor(app: App, private plugin: AskMyuPlugin, private sourceId: string, sourceName: string, private onPick: (target: EntityHeadline) => void) {
    super(app);
    this.setPlaceholder(`Merge ${sourceName} into\u2026`);
  }

  override async onOpen(): Promise<void> {
    super.onOpen();
    const res = await this.plugin.backend.listEntities('person');
    this.entities = mergeCandidates(res.data?.entities ?? [], this.sourceId);
    this.inputEl.dispatchEvent(new Event('input'));
  }

  getItems(): EntityHeadline[] { return this.entities; }
  getItemText(entity: EntityHeadline): string { return entity.display_name; }

  override renderSuggestion(match: FuzzyMatch<EntityHeadline>, el: HTMLElement): void {
    el.createDiv({ text: match.item.display_name });
    const sub = match.item.organization || match.item.subtitle;
    if (sub) el.createDiv({ cls: 'myu-quiet', text: sub });
  }

  onChooseItem(entity: EntityHeadline): void { this.onPick(entity); }
}
