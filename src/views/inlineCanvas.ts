/**
 * A canvas, in the conversation.
 *
 * The pane was a place you had to go, and a thing you had to find: until
 * 2026-09-01 the newest canvas was reachable only through "Past canvases…"
 * (operator: "I keep clicking past canvases to see the present one"). The
 * industry moved the same way for the same reason — ChatGPT folded Canvas back
 * into the thread as writing/code blocks in May 2026, and this plugin's own
 * offers and LinkedIn walk moved into the thread the week before.
 *
 * The rule here:
 *   · ASKS — anything with a control — render OPEN. A question behind a fold is
 *     a question that does not get answered.
 *   · READS — everything else — render FOLDED, one line each, so a long canvas
 *     never swamps the thread and width stops mattering.
 *   · The region keeps the word "canvas", because the reply's own prose says
 *     "if you look at the canvas…" and that sentence must stay true.
 *
 * Every component carries `data-myu-component-id`, so prose that names one can
 * be walked to (see `revealComponent`).
 */
import { MarkdownRenderer, type App, type Component } from 'obsidian';
import type AskMyuPlugin from '../main';
import type { CompositionSpecLite, CompositionComponentLite } from '../wire';
import { componentMarkdown, compositionFlow } from '../vault/myuFiles';
import { controlsOf, renderComponentActions } from './canvasActions';
import { runOfferOption } from './offerActions';
import { calloutBox } from './calloutBox';

const FLASH_MS = 1400;

export interface InlineCanvasHost {
  app: App;
  /** The view owning the render lifecycle, so Obsidian tears down what it mounts. */
  component: Component;
  plugin: AskMyuPlugin;
  /** Component ids the reader has opened — held by the view, because the thread re-renders constantly. */
  expanded: Set<string>;
  /** Re-render the thread (a fold toggled, an action landed). */
  refresh(): void;
  openCanvas(compositionId: string): void;
  saveCanvas(compositionId: string): void;
}

/** A component the reader must answer, rather than one they read. Data, not a type list: if it has controls, it asks. */
export function isAsk(component: CompositionComponentLite): boolean {
  const { buttons, input } = controlsOf(component);
  return buttons.length > 0 || input !== null;
}

/**
 * The only asks that stay OPEN in the thread: connecting a source (calendar,
 * mail, docs) and placing a person. They are the two that block Myu from
 * working, and both are one decision wide.
 *
 * Everything else — including reflection prompts and decision frames — folds.
 * The thread stays a thread; the canvas is one click away for the whole of it
 * (operator, 2026-09-01: "make the canvas inline compact and neat … to see the
 * full thing one opens the canvas").
 */
export function staysOpen(component: CompositionComponentLite): boolean {
  if (component.type === 'offer_block') return true;
  return /^linkedin_(confirm|recover)/.test(component.id ?? '');
}

/** One line for a folded read: its own label, else its first line of prose. */
function foldLabel(component: CompositionComponentLite, markdown: string): string {
  const label = (component.label ?? '').trim() || (typeof (component.data as { title?: unknown } | undefined)?.title === 'string' ? String((component.data as { title?: string }).title).trim() : '');
  if (label) return label;
  const firstLine = markdown.split('\n').map((l) => l.replace(/^#+\s*/, '').trim()).find((l) => l.length > 0) ?? '';
  const plain = firstLine.replace(/[*_`>[\]]/g, '').trim();
  return plain.length > 72 ? `${plain.slice(0, 71)}…` : plain || 'More';
}

/** Scroll to a component in the thread, open its fold, and flash it — Obsidian's own `.is-flashing`. */
export function revealComponent(root: HTMLElement, componentId: string, expanded: Set<string>, refresh: () => void): boolean {
  const el = root.querySelector(`[data-myu-component-id="${CSS.escape(componentId)}"]`);
  if (!(el instanceof HTMLElement)) return false;
  if (!expanded.has(componentId)) { expanded.add(componentId); refresh(); }
  el.scrollIntoView({ block: 'center' });
  el.classList.add('is-flashing');
  window.setTimeout(() => el.classList.remove('is-flashing'), FLASH_MS);
  return true;
}

export function renderInlineCanvas(
  parent: HTMLElement,
  compositionId: string,
  spec: CompositionSpecLite,
  host: InlineCanvasHost,
): void {
  const region = parent.createDiv({ cls: 'myu-inline-canvas', attr: { 'data-myu-canvas-id': compositionId } });
  // The door first: the canvas is a place you can go, and the thread only
  // carries its shape.
  const head = region.createDiv({ cls: 'myu-inline-canvas-head' });
  const title = (spec.summary_text ?? '').trim().split('\n')[0] ?? '';
  head.createSpan({ cls: 'myu-whisper', text: title ? `canvas · ${title}` : 'canvas' });
  const door = head.createEl('button', { cls: 'myu-affordance myu-link-button', text: 'Open canvas' });
  door.onclick = () => host.openCanvas(compositionId);

  const run = async (componentId: string, action: string, params: Record<string, unknown> | undefined): Promise<{ ok: boolean; message?: string }> => {
    if (action.startsWith('offer:')) {
      const out = await runOfferOption(host.plugin, action.slice('offer:'.length), params);
      if (out.done) host.refresh();
      return { ok: out.ok, message: out.ackText ?? out.message };
    }
    const res = await host.plugin.backend.executeCompositionAction(compositionId, componentId, action, params).catch(() => null);
    const d = res?.data;
    if (!res?.ok || !d) return { ok: false, message: res?.error || 'Could not reach Myu.' };
    if (d.response_type === 'error' || d.success === false) return { ok: false, message: d.error || d.message || "That didn’t work." };
    // The canvas changed under the answer: re-read it rather than patch a copy.
    if (d.composition || d.surface_mutations?.length) host.refresh();
    return { ok: true, message: d.message };
  };
  const interact = async (componentId: string, interaction: Parameters<typeof renderComponentActions>[2] extends { interact: (id: string, spec: infer S) => unknown } ? S : never): Promise<void> => {
    const res = await host.plugin.backend.postCompositionInteraction([{ composition_id: compositionId, component_id: componentId, component_type: interaction.component_type, event_type: interaction.event_type, action_value: interaction.action_value, timestamp: Date.now(), metadata: interaction.metadata }], true).catch(() => null);
    if (res?.data?.response_generating) host.plugin.expectChatReply();
  };

  for (const entry of compositionFlow(spec)) {
    if ('scene' in entry) { region.createDiv({ cls: 'myu-whisper myu-inline-scene', text: entry.scene.toLowerCase() }); continue; }
    const { component, depth } = entry;
    const markdown = componentMarkdown(component, depth, () => null, spec.components, 'pane').trim();
    const ask = staysOpen(component);
    const open = ask || host.expanded.has(component.id);

    const holder = region.createDiv({ cls: `myu-inline-component myu-canvas-${component.type}`, attr: { 'data-myu-component-id': component.id } });

    if (!ask) {
      // A read folds. `<details>` is the browser's own disclosure: keyboard
      // reachable and screen-reader announced without a line of our own JS.
      const details = holder.createEl('details', { cls: 'myu-fold' });
      if (open) details.setAttr('open', '');
      details.createEl('summary', { text: foldLabel(component, markdown) });
      const body = details.createDiv({ cls: 'markdown-rendered' });
      if (markdown) void MarkdownRenderer.render(host.app, markdown, body, '', host.component);
      // Remember what the reader opened; the thread re-renders on every event.
      details.addEventListener('toggle', () => {
        if (details.hasAttribute('open')) host.expanded.add(component.id);
        else host.expanded.delete(component.id);
      });
      continue;
    }

    // An open ask wears Obsidian's own callout, so it reads as the app's
    // furniture rather than ours.
    const box = calloutBox(holder, component.type === 'offer_block' ? 'tip' : 'question', foldLabel(component, markdown), 'myu-inline-ask');
    const body = box.createDiv({ cls: 'markdown-rendered' });
    if (markdown) void MarkdownRenderer.render(host.app, markdown, body, '', host.component);
    renderComponentActions(box, component, { run, interact });
  }

  const doors = region.createDiv({ cls: 'myu-canvas-actions' });
  const save = doors.createEl('button', { cls: 'myu-affordance myu-link-button', text: 'Save to vault' });
  save.onclick = () => host.saveCanvas(compositionId);
}
