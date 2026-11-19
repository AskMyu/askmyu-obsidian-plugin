/**
 * "Same person as…" — pick who this person really is (the one kept). The same fuzzy picker as
 * LookupModal, over the web's exact candidate rule (personActions.mergeCandidates). Its words are
 * shared's (2026-11-15): "Tess C. is the same person as…", what happens, "Search your people".
 */

import { App, FuzzySuggestModal, type FuzzyMatch } from 'obsidian';
import type AskMyuPlugin from '../main';
import type { EntityHeadline } from '../transport/api';
import { IDENTITY_WORDS } from '../personIdentities';
import { mergeCandidates } from './personActions';

export class MergeIntoModal extends FuzzySuggestModal<EntityHeadline> {
  private entities: EntityHeadline[] = [];

  constructor(app: App, private plugin: AskMyuPlugin, private sourceId: string, private sourceName: string, private onPick: (target: EntityHeadline) => void) {
    super(app);
    this.setPlaceholder(IDENTITY_WORDS.samePersonSearch);
  }

  override async onOpen(): Promise<void> {
    await super.onOpen();
    // Above the box: "Tess C. is the same person as…", and what choosing someone does.
    const head = this.modalEl.createDiv({ cls: 'myu-same-head', prepend: true });
    head.createDiv({ cls: 'myu-same-title', text: IDENTITY_WORDS.samePersonTitle(this.sourceName) });
    head.createDiv({ cls: 'myu-quiet myu-same-hint', text: IDENTITY_WORDS.samePersonHint(this.sourceName) });
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
