/**
 * "Search Myu" — the feed panel's search (`GET /feed/search`) across people,
 * companies and feed items, as an Obsidian suggester that asks the server as
 * you type. A person or company opens their card.
 */

import { App, SuggestModal } from 'obsidian';
import type AskMyuPlugin from '../main';
import type { CardEntityType, CardSpecLite } from '../transport/api';

interface Hit { kind: CardEntityType | 'feed_item'; id: string; title: string; subtitle?: string }

export class FeedSearchModal extends SuggestModal<Hit> {
  private seq = 0;

  constructor(app: App, private plugin: AskMyuPlugin) {
    super(app);
    this.setPlaceholder('Search people, companies, memories\u2026');
    this.emptyStateText = 'Type at least two characters.';
  }

  async getSuggestions(query: string): Promise<Hit[]> {
    const q = query.trim();
    if (q.length < 2) return [];
    const mine = ++this.seq;
    const res = await this.plugin.backend.searchFeed(q, 12).catch(() => null);
    if (mine !== this.seq) return [];
    const r = res?.data?.results;
    if (!res?.ok || !r) { this.emptyStateText = 'Search is not answering right now.'; return []; }
    const card = (kind: CardEntityType) => (c: CardSpecLite): Hit | null => (c.entity_id ? { kind, id: c.entity_id, title: c.header?.display_name || 'Unnamed', subtitle: c.header?.subtitle } : null);
    const hits = [...(r.people ?? []).map(card('person')), ...(r.companies ?? []).map(card('company'))].filter((h): h is Hit => !!h);
    for (const f of r.feed_items ?? []) if (f.title) hits.push({ kind: 'feed_item', id: f.feed_item_id ?? '', title: f.title, subtitle: f.summary });
    this.emptyStateText = hits.length ? '' : 'Nothing matches.';
    return hits;
  }

  renderSuggestion(hit: Hit, el: HTMLElement): void {
    el.createDiv({ text: hit.title });
    const sub = [hit.kind === 'feed_item' ? 'feed' : hit.kind, hit.subtitle].filter(Boolean).join(' \u00b7 ');
    if (sub) el.createDiv({ cls: 'myu-quiet', text: sub });
  }

  onChooseSuggestion(hit: Hit): void {
    if (hit.kind === 'feed_item') { void this.plugin.openToday(); return; }
    void this.plugin.openCard(hit.kind, hit.id, hit.title);
  }
}
