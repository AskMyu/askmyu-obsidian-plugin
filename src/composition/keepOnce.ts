/**
 * Should this composition be kept right now, automatically?
 *
 * Two doors feed the always-keep switch besides the pane itself: the live
 * `composition_ready` SSE event (a canvas made on ANY surface — web, mobile,
 * this vault) and the plugin's own chat offers. Both can fire for the same id,
 * and the pane re-keeps on mutation on its own, so these two keep ONCE per id
 * per session. Pure, so the rule is pinned.
 */
export function shouldKeepCanvas(autoKeep: boolean, compositionId: unknown, seen: Set<string>): compositionId is string {
  if (!autoKeep) return false;
  if (typeof compositionId !== 'string' || !compositionId) return false;
  if (seen.has(compositionId)) return false;
  seen.add(compositionId);
  return true;
}
