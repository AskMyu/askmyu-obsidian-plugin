/**
 * Help Myu — the feed panel's "Help Myu" tab as its OWN sidebar tab (the
 * Obsidian way to tab: one view, one icon in the sidebar header), not a strip
 * inside Today. People Myu cannot place: a LinkedIn to confirm, a possible
 * duplicate. Each row is one decision, made here. Today keeps a one-line
 * pointer so it stays calm.
 */

import { ItemView, WorkspaceLeaf, setIcon } from 'obsidian';
import type AskMyuPlugin from '../main';
import { renderLinkedInMatches, suggestionsOf } from './linkedinCards';

export const HELP_VIEW_TYPE = 'askmyu-help';

export class HelpMyuView extends ItemView {
  private loading = false;

  constructor(leaf: WorkspaceLeaf, private plugin: AskMyuPlugin) { super(leaf); }

  getViewType(): string { return HELP_VIEW_TYPE; }
  getDisplayText(): string { return 'Myu \u2014 help Myu'; }
  override getIcon(): string { return 'user-search'; }

  override async onOpen(): Promise<void> {
    this.contentEl.addClass('myu-help');
    await this.refresh();
  }

  async refresh(): Promise<void> {
    this.loading = true;
    this.render();
    await this.plugin.loadHelpQueue();
    this.loading = false;
    this.render();
  }

  render(): void {
    const root = this.contentEl;
    root.empty();
    const top = root.createDiv({ cls: 'myu-sync-bar' });
    const again = top.createEl('button', { cls: 'myu-affordance myu-icon-button', attr: { 'aria-label': 'Check again' } });
    setIcon(again, 'refresh-cw');
    again.onclick = () => void this.refresh();
    top.createSpan({ cls: 'myu-whisper', text: this.loading ? 'looking' : 'people Myu cannot place' });

    if (this.plugin.unlock.current !== 'unlocked') { root.createEl('p', { cls: 'myu-quiet', text: 'Sign in to see who Myu needs help with.' }); return; }
    const items = this.plugin.helpQueue;
    if (!this.loading && items.length === 0) { root.createEl('p', { cls: 'myu-quiet', text: 'Nothing needs you right now.' }); return; }

    for (const item of items) {
      const row = root.createDiv({ cls: 'myu-zone myu-help-row' });
      if (item.item_type === 'linkedin_disambiguation') {
        row.createDiv({ cls: 'myu-claim', text: item.display_name + (item.organization ? ` \u2014 ${item.organization}` : '') });
        // The matches themselves, in place — the same cards the card pane shows.
        const matches = row.createDiv({ cls: 'myu-help-matches' });
        matches.createEl('p', { cls: 'myu-quiet myu-thinking', text: 'Finding the matches' });
        void this.plugin.backend.getCard('person', item.relationship_id).then((res) => {
          matches.empty();
          const sugs = suggestionsOf(res.data?.suggestions);
          if (!res.ok) { matches.createDiv({ cls: 'myu-quiet', text: 'Could not fetch the matches.' }); return; }
          renderLinkedInMatches(matches, sugs, { app: this.app, owner: this, plugin: this.plugin, relationshipId: item.relationship_id, personName: item.display_name, onResolved: () => void this.refresh() });
          const open = matches.createEl('button', { cls: 'myu-affordance myu-link-button', text: 'Open their card' });
          open.onclick = () => void this.plugin.openCard('person', item.relationship_id, item.display_name);
        }).catch(() => { matches.empty(); matches.createDiv({ cls: 'myu-quiet', text: 'Could not fetch the matches.' }); });
      } else {
        row.createDiv({ cls: 'myu-claim', text: `${item.source.display_name} and ${item.target.display_name} \u2014 the same person?` });
        const why = [item.reason, item.target.subtitle].filter(Boolean).join(' \u00b7 ');
        if (why) row.createDiv({ cls: 'myu-quiet', text: why });
        const actions = row.createDiv({ cls: 'myu-canvas-actions' });
        const yes = actions.createEl('button', { cls: 'myu-affordance myu-cta', text: 'Merge' });
        yes.onclick = () => this.plugin.mergePersonInto({ id: item.source.relationship_id, name: item.source.display_name }, { id: item.target.relationship_id, name: item.target.display_name });
        const no = actions.createEl('button', { cls: 'myu-affordance', text: 'Not the same' });
        no.onclick = async () => {
          no.disabled = true;
          await this.plugin.backend.rejectMerge(item.source.relationship_id, item.target.relationship_id).catch(() => undefined);
          this.plugin.helpQueue = this.plugin.helpQueue.filter((x) => x !== item);
          this.render();
        };
      }
    }
  }

  override onClose(): Promise<void> { this.contentEl.empty(); return Promise.resolve(); }
}
