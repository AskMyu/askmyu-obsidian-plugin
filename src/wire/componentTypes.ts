/**
 * The web app's component registry, as a RUNTIME list.
 *
 * Its own file, deliberately: `index.ts` is the shared-package seam and the
 * boundary invariant holds it to `export type` only, so that nothing with a
 * runtime footprint can cross from `@askmyu/shared` into the public bundle.
 * A value re-export there — even of our own constant — fails that check
 * (caught 2026-08-28). `sync-mirror.mjs` copies this file unchanged.
 */

/**
 * Every component type the web app's CompositionRenderer registers
 * (packages/web/src/components/composition/CompositionRenderer.tsx). The
 * markdown renderer is audited against THIS list — parity.ts proves it matches
 * the canonical union at compile time, and a test proves every entry renders.
 */
export const COMPOSITION_COMPONENT_TYPES = [
  'action_controls', 'advisor_panel', 'alignment_hierarchy', 'branch_point', 'budget_allocation',
  'card_section', 'career_pathway', 'career_position_timeline', 'career_trajectory', 'change_suggestion',
  'chart', 'circle_pack', 'comparison', 'connection_overlay', 'container', 'context_annotation',
  'decision_frame', 'diagram', 'hierarchy', 'inline_chat', 'intervention_tracker', 'matrix_view',
  'micro_arc_timeline', 'move_node', 'note_editor', 'offer_block', 'pattern_card', 'person_card', 'person_disambiguation',
  'perspective_panel', 'possibility_space', 'prediction_table', 'prepared_content', 'process_card',
  'reflection_prompt', 'relationship_map', 'section_header', 'seed_follow_up', 'severity_indicator',
  'shape', 'signal_card', 'statistical_context', 'sticky_note', 'strategy_sequence', 'subject_header',
  'team_grid', 'text_block', 'timeline', 'trackable', 'venn_diagram', 'what_if_scenarios',
] as const;

