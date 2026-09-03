/**
 * Reveal one setting row by name: scroll it into view, flash it with
 * Obsidian's own `.is-flashing` highlight, and put keyboard focus on its
 * control. What Obsidian's settings search does when a result is picked —
 * here so a link in a pane can land ON the switch, not merely on the page
 * ("clicking change opens the settings but doesn't easily go to where the
 * setting is" — operator, 2026-08-29).
 */

export const FLASH_MS = 1800;

export function revealSetting(container: ParentNode, name: string, schedule: (fn: () => void, ms: number) => void = (fn, ms) => window.setTimeout(fn, ms)): boolean {
  const rows = Array.from(container.querySelectorAll<HTMLElement>('.setting-item'));
  const row = rows.find((r) => r.querySelector('.setting-item-name')?.textContent?.trim() === name);
  if (!row) return false;
  row.scrollIntoView({ block: 'center', behavior: 'smooth' });
  row.classList.add('is-flashing');
  schedule(() => row.classList.remove('is-flashing'), FLASH_MS);
  const control = row.querySelector<HTMLElement>('.setting-item-control [tabindex], .setting-item-control button, .setting-item-control input, .setting-item-control select');
  control?.focus();
  return true;
}
