/**
 * A FUNCTIONAL fake of the Obsidian UI primitives the modals use — the
 * opposite philosophy of the throwing stub in the unit-test entry. That stub
 * exists to prove logic touches no host API; this one exists because MODAL
 * WIRING is host API, and 2026-08-22 shipped three wiring bugs (a phantom
 * paper-check, a mislabeled finish, stale status copy) that only clicking
 * found. This fake makes clicking a thing tests do.
 *
 * Fidelity bar: enough structure to find a control by its visible text and
 * activate it, and to read what a user would see. Anything fancier belongs in
 * the real-Obsidian tier (wdio-obsidian-service), not here.
 */

export class FakeEl {
  children: FakeEl[] = [];
  tag: string;
  text = '';
  classes = new Set<string>();
  disabled = false;
  onclick: (() => void | Promise<void>) | null = null;
  value = '';
  type = '';
  /** Checkbox state and its change hook — the terms box at the door and the gate. */
  checked = false;
  onchange: (() => void) | null = null;
  parent: FakeEl | null = null;
  /** Attributes the UI sets — `data-*` anchors and aria labels are behaviour, not decoration. */
  attrs: Record<string, string> = {};

  constructor(tag = 'div', opts?: { text?: string; cls?: string; attr?: Record<string, string> }) {
    this.tag = tag;
    if (opts?.text) this.text = opts.text;
    if (opts?.attr) this.attrs = { ...opts.attr };
    for (const c of (opts?.cls ?? '').split(' ')) if (c) this.classes.add(c);
  }

  get textContent(): string {
    return this.text;
  }
  set textContent(v: string) {
    this.text = v;
  }

  private add(el: FakeEl): FakeEl {
    el.parent = this;
    this.children.push(el);
    return el;
  }
  createEl(tag: string, opts?: { text?: string; cls?: string; attr?: Record<string, string>; href?: string }): FakeEl {
    const el = this.add(new FakeEl(tag, opts));
    if (opts?.href) el.attrs.href = opts.href;
    return el;
  }
  /** SVG marks are built path by path (the brand seal, Google's G) — a fake node is enough. */
  createSvg(tag: string, opts?: { attr?: Record<string, string> }): FakeEl {
    return this.add(new FakeEl(tag, opts));
  }
  /** Obsidian's Node.appendText: a text run beside built links. */
  appendText(text: string): void {
    this.text += text;
  }
  createDiv(opts?: { text?: string; cls?: string }): FakeEl {
    return this.add(new FakeEl('div', opts));
  }
  createSpan(opts?: { text?: string; cls?: string }): FakeEl {
    return this.add(new FakeEl('span', opts));
  }
  empty(): void {
    this.children = [];
  }
  /** DOM events the UI actually binds (a <details> fold reporting its state). Fire with `dispatch`. */
  private listeners = new Map<string, Array<() => void>>();
  addEventListener(name: string, handler: () => void): void {
    const set = this.listeners.get(name) ?? [];
    set.push(handler);
    this.listeners.set(name, set);
  }
  removeEventListener(name: string, handler: () => void): void {
    this.listeners.set(name, (this.listeners.get(name) ?? []).filter((h) => h !== handler));
  }
  dispatch(name: string): void {
    for (const h of this.listeners.get(name) ?? []) h();
  }
  hasAttribute(name: string): boolean { return this.attrs?.[name] !== undefined; }

  removeClass(c: string): void { this.classes.delete(c); }
  addClass(c: string): void {
    this.classes.add(c);
  }
  setText(t: string): void {
    this.text = t;
  }
  setAttr(k: string, v: string): void { this.attrs[k] = v; }
  remove(): void {
    if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this);
  }

  /** Depth-first search of the rendered tree. */
  *walk(): Generator<FakeEl> {
    yield this;
    for (const child of this.children) yield* child.walk();
  }
  find(predicate: (el: FakeEl) => boolean): FakeEl | undefined {
    for (const el of this.walk()) if (predicate(el)) return el;
    return undefined;
  }
  /** The test's finger: find a visible control by its text and press it. */
  async click(text: string): Promise<boolean> {
    const el = this.find((e) => e.text === text && !!e.onclick && !e.disabled);
    if (!el) return false;
    await el.onclick!();
    return true;
  }
  visibleTexts(): string[] {
    return [...this.walk()].map((e) => e.text).filter(Boolean);
  }
}

export class Modal {
  app: unknown;
  contentEl = new FakeEl('div');
  constructor(app: unknown) {
    this.app = app;
  }
  open(): void {
    (this as unknown as { onOpen?: () => void }).onOpen?.();
  }
  close(): void {
    (this as unknown as { onClose?: () => void }).onClose?.();
  }
}

class ButtonBuilder {
  buttonEl = new FakeEl('button');
  constructor(host: FakeEl) {
    host.children.push(this.buttonEl);
    this.buttonEl.parent = host;
  }
  setButtonText(t: string): this {
    this.buttonEl.text = t;
    return this;
  }
  setCta(): this {
    this.buttonEl.classes.add('cta');
    return this;
  }
  /** Destructive buttons. Missing until 2026-08-26, which quietly meant the
      stub could not drive ANY modal with a delete in it — exactly the modals
      most worth a click-path. */
  setDestructive(): this {
    this.buttonEl.classes.add('mod-destructive');
    return this;
  }
  setWarning(): this {
    this.buttonEl.classes.add('warning');
    return this;
  }
  setDisabled(disabled: boolean): this {
    if (disabled) this.buttonEl.classes.add('disabled');
    else this.buttonEl.classes.delete('disabled');
    return this;
  }
  setTooltip(_t: string): this {
    return this;
  }
  onClick(cb: () => void): this {
    this.buttonEl.onclick = cb;
    return this;
  }
}

class TextBuilder {
  inputEl = new FakeEl('input');
  private changeCb: ((v: string) => void) | null = null;
  constructor(host: FakeEl) {
    host.children.push(this.inputEl);
    this.inputEl.parent = host;
    const self = this;
    // Typing into the fake input fires onChange, like the real component.
    Object.defineProperty(this.inputEl, 'typed', {
      set(v: string) {
        self.inputEl.value = v;
        self.changeCb?.(v);
      },
    });
  }
  setPlaceholder(_p: string): this {
    return this;
  }
  setValue(v: string): this {
    this.inputEl.value = v;
    return this;
  }
  onChange(cb: (v: string) => void): this {
    this.changeCb = cb;
    return this;
  }
}

export class Setting {
  settingEl = new FakeEl('div');
  constructor(host: FakeEl) {
    host.children.push(this.settingEl);
    this.settingEl.parent = host;
  }
  setName(n: string): this {
    this.settingEl.createDiv({ text: n, cls: 'setting-name' });
    return this;
  }
  setDesc(d: string): this {
    this.settingEl.createDiv({ text: d, cls: 'setting-desc' });
    return this;
  }
  /** Obsidian's own guidelines recommend setHeading() over raw <h*> tags — so
      the stub not having it meant every modal that followed the guidance was
      untestable (added 2026-08-26). */
  setHeading(): this {
    this.settingEl.classes.add('setting-heading');
    return this;
  }
  addButton(cb: (b: ButtonBuilder) => unknown): this {
    cb(new ButtonBuilder(this.settingEl));
    return this;
  }
  addText(cb: (t: TextBuilder) => unknown): this {
    cb(new TextBuilder(this.settingEl));
    return this;
  }
  addToggle(cb: (t: { setValue: (v: boolean) => unknown; onChange: (f: (v: boolean) => void) => unknown }) => unknown): this {
    const toggle = { setValue: () => toggle, onChange: () => toggle };
    cb(toggle as never);
    return this;
  }
}

/** Notices land here so tests can assert what the user was told. */
export const notices: string[] = [];
export class Notice {
  constructor(message: string) {
    notices.push(message);
  }
}

export const Platform = { isDesktopApp: false };
export class FileSystemAdapter {}
export class App {}
/** What the chat pane handed to Obsidian's renderer — tests read this. */
export const markdownRenders: string[] = [];
/** Obsidian re-exports moment; the weekly-note path formatter uses it. Enough of it to format a date. */
export function moment(input?: Date): { format: (fmt: string) => string } {
  const d = input ?? new Date();
  return {
    format: (fmt: string) =>
      fmt
        .replace(/YYYY/g, String(d.getFullYear()))
        .replace(/MM/g, String(d.getMonth() + 1).padStart(2, '0'))
        .replace(/DD/g, String(d.getDate()).padStart(2, '0'))
        .replace(/\[W\]/g, 'W')
        .replace(/ww/g, '01'),
  };
}

export class Component {
  load(): void {}
  unload(): void {}
  addChild<T>(c: T): T { return c; }
}

export class MarkdownRenderer {
  static async render(_app: unknown, markdown: string, el: FakeEl, _path: string, _component: unknown): Promise<void> {
    markdownRenders.push(markdown);
    // Deliberately NOT setting the text: a test that finds the raw markdown in
    // visibleTexts() has found it painted as plain text somewhere it shouldn't be.
    el.createDiv({ cls: 'markdown-rendered-stub' });
  }
}
export class TFile {}

/** Obsidian's path normaliser, near enough for pure-function tests. */
export function setIcon(el: FakeEl, name: string): void {
  el.classes.add(`icon-${name}`);
}
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\.\//, '').trim();
}

/** Captured requestUrl calls, so a test can assert on traffic — or its absence. */
export const httpRequests: Array<Record<string, unknown>> = [];
export async function requestUrl(opts: Record<string, unknown>): Promise<Record<string, unknown>> {
  httpRequests.push(opts);
  return { status: 200, json: {}, text: '' };
}

/** Views, for tests that poke a pane's public surface without opening it. */
export class WorkspaceLeaf {}
export class ItemView {
  contentEl = new FakeEl('div');
  containerEl = new FakeEl('div');
  constructor(public leaf: WorkspaceLeaf) {}
}

/** Fuzzy suggesters, for tests that import a view which imports one. */
export class FuzzySuggestModal<T> {
  inputEl = new FakeEl('input');
  constructor(public app: unknown) {}
  setPlaceholder(_t: string): void {}
  onOpen(): void {}
  open(): void { this.onOpen(); }
  close(): void {}
  getItems(): T[] { return []; }
  getItemText(_item: T): string { return ''; }
}
