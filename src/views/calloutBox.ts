/**
 * Obsidian's own callout markup, built by hand.
 *
 * Using the real `.callout` / `data-callout` structure means an ask inherits
 * whatever the reader's theme does with callouts — border, tint, icon, spacing
 * — instead of us inventing a look that fights it. This is the plugin's answer
 * to "make it nicer, but keep to Obsidian standards".
 */
export function calloutBox(parent: HTMLElement, kind: string, title: string, cls?: string): HTMLElement {
  const callout = parent.createDiv({ cls: `callout${cls ? ` ${cls}` : ''}`, attr: { 'data-callout': kind } });
  const head = callout.createDiv({ cls: 'callout-title' });
  head.createDiv({ cls: 'callout-title-inner', text: title });
  return callout.createDiv({ cls: 'callout-content' });
}
