/**
 * The canvas pane's footer: the "always keep" switch, and — only while it is
 * OFF — the per-save button.
 *
 * Operator (2026-08-29): "a switch in the canvas that is default off but when
 * turned on always saves to vault. then the save to vault only shows if that
 * is off. if it's on it doesn't show and the toggle continues to show as on."
 *
 * Its own module so the two states are testable without an ItemView.
 */

import { Setting } from 'obsidian';

export interface CanvasFooterState {
  autoKeep: boolean;
  /** Snapshots behind the spec on screen — the web's ↩ Undo (client-only, bounded). */
  canUndo?: boolean;
  /** The server said this canvas is outdated — the web's ExpiredBanner. `refreshable` false hides the button. */
  expired?: { reason?: string; refreshable: boolean } | null;
  /** Where the current canvas was last kept — shown while the switch is on. */
  keptPath?: string | null;
  /** A keep that failed — said in place, never a silent skip (R7). */
  problem?: string | null;
}

export interface CanvasFooterHost {
  /** The user flipped the switch. `true` is a request — the host confirms, then commits. */
  onToggle(next: boolean): void;
  onSave(): void;
  onUndo?(): void;
  onHistory?(): void;
  onRefresh?(): void;
}

export function renderCanvasFooter(parent: HTMLElement, state: CanvasFooterState, host: CanvasFooterHost): void {
  if (state.expired) {
    // Said in place, like the web's yellow banner — and the way out is one press.
    const bar = parent.createDiv({ cls: 'myu-canvas-expired' });
    bar.createSpan({ text: `This canvas may be outdated${state.expired.reason ? ` (${state.expired.reason})` : ''}.` });
    if (state.expired.refreshable && host.onRefresh) {
      const refresh = bar.createEl('button', { cls: 'myu-affordance', text: 'Refresh' });
      refresh.onclick = () => host.onRefresh?.();
    }
  }
  const tools = parent.createDiv({ cls: 'myu-canvas-tools' });
  if (state.canUndo && host.onUndo) {
    const undo = tools.createEl('button', { cls: 'myu-affordance', text: 'Undo' });
    undo.onclick = () => host.onUndo?.();
  }
  if (host.onHistory) {
    const history = tools.createEl('button', { cls: 'myu-affordance myu-link-button', text: 'Past canvases\u2026' });
    history.onclick = () => host.onHistory?.();
  }
  const row = new Setting(parent)
    .setName('Always keep in my vault')
    .setDesc(state.autoKeep ? 'Every canvas this pane shows is saved to Myu/Canvas/.' : 'Off — save each canvas yourself.')
    .addToggle((t) => t.setValue(state.autoKeep).onChange((v) => host.onToggle(v)));
  row.settingEl.addClass('myu-canvas-footer');

  if (!state.autoKeep) {
    // The durable form, on demand. KEEPING is a .canvas — an open standard
    // that outlives the plugin, which is the whole argument for it over a
    // render-only view.
    const keep = parent.createEl('button', { cls: 'myu-affordance', text: 'Save to my vault' });
    keep.onclick = () => host.onSave();
    return;
  }
  if (state.problem) parent.createDiv({ cls: 'myu-problem', text: state.problem });
  else if (state.keptPath) parent.createDiv({ cls: 'myu-whisper', text: `kept in ${state.keptPath}` });
}
