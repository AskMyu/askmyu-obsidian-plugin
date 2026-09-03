/**
 * Mounting an imperative settings section under Obsidian 1.13's
 * `getSettingDefinitions()`.
 *
 * Verified in the 1.13.7 runtime: for a `render` item Obsidian creates ONE
 * `Setting` row, calls `render(setting, group)`, then reconciles the group's
 * list to exactly its own rows (`listEl.setChildrenInPlace([...])`). Anything
 * appended beside the row is discarded on mount — which is how 0.1.0.135
 * painted seven headings over seven empty boxes. The row element itself is
 * kept, so a section renders INSIDE it: the row stops being a setting item
 * and becomes the section's container.
 */

import type { Setting } from 'obsidian';

export const SECTION_CLASS = 'myu-settings-section';

export function mountInRow(setting: Setting, render: (root: HTMLElement) => void): () => void {
  const el = setting.settingEl;
  el.empty();
  el.removeClass('setting-item');
  el.addClass(SECTION_CLASS);
  render(el);
  return () => el.empty();
}
