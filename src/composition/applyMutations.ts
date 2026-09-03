/**
 * Apply surface mutations to a composition — the SAME semantics as the shared
 * store's `applyMutations` (packages/shared/src/stores/compositionStore.ts),
 * transcribed op for op so the pane and the web agree on what a pressed
 * button did:
 *  - add: at `end`, or before/after `target_id`; an unknown target appends;
 *  - remove: drop `target_id`;
 *  - update: shallow-merge `data_patch` into the target's data;
 *  - replace: `target_id === 'root'` swaps the whole list, else the first of
 *    `components` takes the target's place.
 * Pure — a new spec, the input untouched.
 */

import type { CompositionComponentLite, CompositionSpecLite, SurfaceMutationLite } from '../wire';

export function applyMutations(spec: CompositionSpecLite, mutations: SurfaceMutationLite[]): CompositionSpecLite {
  let components: CompositionComponentLite[] = [...(spec.components ?? [])];

  for (const m of mutations) {
    switch (m.op) {
      case 'add': {
        if (!m.components?.length) break;
        if (m.position === 'end') { components.push(...m.components); break; }
        const at = components.findIndex((c) => c.id === m.target_id);
        if (at < 0) { components.push(...m.components); break; }
        components.splice(m.position === 'before' ? at : at + 1, 0, ...m.components);
        break;
      }
      case 'remove':
        components = components.filter((c) => c.id !== m.target_id);
        break;
      case 'update':
        components = components.map((c) => (c.id === m.target_id ? { ...c, data: { ...(c.data ?? {}), ...(m.data_patch ?? {}) } } : c));
        break;
      case 'replace': {
        if (m.target_id === 'root' && m.components) { components = [...m.components]; break; }
        const next = m.components?.[0];
        if (!next) break;
        components = components.map((c) => (c.id === m.target_id ? next : c));
        break;
      }
      default:
        break;
    }
  }

  return { ...spec, components };
}
