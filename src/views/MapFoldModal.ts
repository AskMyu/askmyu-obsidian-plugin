/**
 * The people Myu isn't keeping track of yet, folded away (2026-10-03) — the list behind the look-up's foot line.
 *
 * The server keeps people who were only on some of your emails "on the map": out of the people list, still in
 * search. This modal pages them (`GET /v2/relationships?map=only`, most recently seen first) under one sentence
 * saying what they are, as plain rows — the name, then the company when known, the address, how many emails and when
 * the last one was — each with two things to do: the row opens the person's card, which changes nothing (the row and
 * the count stay as they were), and **Keep track** brings them back without opening it. After a Keep track the row
 * goes, the count comes down and the main list is read again; its fresh `map` is the count and the line here.
 * Closing the fold goes back to the look-up, which reads the list again — unless a card was opened, when the card is
 * what the reader wanted. Every word on a row is the server's or shared `mapFold`'s.
 */

import { App, Modal } from 'obsidian';
import type AskMyuPlugin from '../main';
import type { MapFold, MapPersonRow } from '../wire';
import { MAP_FOLD_PAGE, MAP_FOLD_WORDS, foldAfterOneLeft, foldHasMore, foldLine, mapRowFirst, mapRowId, mapRowMeta, mapRowName, withoutRow } from '../mapFold';
import { notifyError, notifyStatus } from '../notify';

export class MapFoldModal extends Modal {
  private rows: MapPersonRow[] = [];
  private offset = 0;
  private count: number;
  private line: string | null;
  /** How long the last page was — a short one means there is no more to read. */
  private lastPage = MAP_FOLD_PAGE;
  private loading = false;
  private failed = false;
  /** A row was pressed: the person's card is open, so closing does not go back to the look-up. */
  private opened = false;
  /** Someone was kept: the look-up behind this has to read again. */
  private changed = false;
  private busy: Promise<void> = Promise.resolve();

  constructor(
    app: App,
    private plugin: AskMyuPlugin,
    map: MapFold,
    private opts: { onBack?: (changed: boolean) => void; pageSize?: number } = {},
  ) {
    super(app);
    this.count = map.count;
    this.line = map.line;
    this.lastPage = this.pageSize;
  }

  override onOpen(): void {
    this.modalEl.addClass('myu-map-fold');
    this.render();
    this.run(() => this.loadMore());
  }

  override onClose(): void {
    this.contentEl.empty();
    if (!this.opened) this.opts.onBack?.(this.changed);
  }

  /** The page read or the Keep track in flight — tests wait on it. */
  whenIdle(): Promise<void> {
    return this.busy;
  }

  private run(work: () => Promise<void>): void {
    this.busy = this.busy.then(work).catch(() => undefined);
  }

  private get pageSize(): number {
    return this.opts.pageSize ?? MAP_FOLD_PAGE;
  }

  private hasMore(): boolean {
    return foldHasMore(this.rows.length, this.count, this.lastPage, this.pageSize);
  }

  private async loadMore(): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    this.failed = false;
    this.render();
    const res = await this.plugin.backend.listMapPeople(this.pageSize, this.offset).catch(() => null);
    this.loading = false;
    if (!res?.ok || !res.data) {
      this.failed = true;
      this.render();
      return;
    }
    const page = res.data.relationships ?? [];
    const have = new Set(this.rows.map((r) => mapRowId(r)));
    for (const r of page) if (!have.has(mapRowId(r))) this.rows.push(r);
    this.offset += page.length;
    this.lastPage = page.length;
    this.takeMap(res.data.map);
    this.render();
  }

  private takeMap(map: MapFold | undefined): void {
    if (!map) return;
    this.count = map.count;
    this.line = map.line;
  }

  /** "Keep track": the one way back. The row goes, the count comes down, the main list is read again. */
  private async keep(row: MapPersonRow): Promise<void> {
    const id = mapRowId(row);
    const res = await this.plugin.backend.keepRelationship(id).catch(() => null);
    if (!res?.ok) {
      notifyError(MAP_FOLD_WORDS.failed);
      return;
    }
    this.changed = true;
    this.rows = withoutRow(this.rows, id);
    // The server's list lost one row before the next page starts.
    this.offset = Math.max(0, this.offset - 1);
    const after = foldAfterOneLeft({ count: this.count, line: this.line });
    this.count = after?.count ?? 0;
    this.line = after?.line ?? null;
    notifyStatus(MAP_FOLD_WORDS.kept(mapRowFirst(row)));
    this.render();
    // The main list reads again; its fresh `map` is the count and the line.
    const list = await this.plugin.backend.listEntities('person').catch(() => null);
    this.takeMap(list?.data?.map);
    this.render();
  }

  /** A row opens the person's card and nothing else changes: they stay on the map, the row and the count stay. */
  private openPerson(row: MapPersonRow): void {
    this.opened = true;
    this.close();
    void this.plugin.openCard('person', mapRowId(row), mapRowName(row));
  }

  private render(): void {
    this.titleEl.setText(foldLine({ count: this.count, line: this.line }) ?? '');
    const c = this.contentEl;
    c.empty();
    const settledEmpty = !this.loading && !this.failed && this.rows.length === 0;
    if (!settledEmpty) c.createDiv({ cls: 'myu-map-intro myu-quiet', text: MAP_FOLD_WORDS.intro });
    const list = c.createDiv({ cls: 'myu-map-list' });
    for (const row of this.rows) {
      const name = mapRowName(row);
      const item = list.createDiv({ cls: 'myu-map-item' });
      const open = item.createEl('button', { cls: 'myu-row-tappable myu-map-row', attr: { 'aria-label': `Open ${name}` } });
      open.createDiv({ cls: 'myu-row-title', text: name });
      const meta = mapRowMeta(row);
      if (meta) open.createDiv({ cls: 'myu-quiet', text: meta });
      open.onclick = () => this.openPerson(row);
      const keep = item.createEl('button', { cls: 'myu-map-keep', text: MAP_FOLD_WORDS.keep, attr: { 'aria-label': MAP_FOLD_WORDS.keepOf(name) } });
      keep.onclick = () => this.run(() => this.keep(row));
    }
    const foot = c.createDiv({ cls: 'myu-map-foot' });
    if (this.loading) {
      foot.createDiv({ cls: 'myu-quiet', text: 'Reading…' });
    } else if (this.failed) {
      foot.createDiv({ cls: 'myu-quiet', text: "Myu couldn't read these people just now." });
      const again = foot.createEl('button', { text: 'Try again' });
      again.onclick = () => this.run(() => this.loadMore());
    } else if (this.hasMore()) {
      foot.createDiv({ cls: 'myu-quiet', text: MAP_FOLD_WORDS.showing(this.rows.length, this.count) });
      const more = foot.createEl('button', { cls: 'myu-map-more', text: MAP_FOLD_WORDS.more });
      more.onclick = () => this.run(() => this.loadMore());
    } else if (this.rows.length === 0) {
      foot.createDiv({ cls: 'myu-quiet', text: MAP_FOLD_WORDS.empty });
    }
  }
}
