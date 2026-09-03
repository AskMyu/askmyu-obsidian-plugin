/**
 * burnout_warning and goal_milestone as Today rows — the web's toast words,
 * kept; the channel changed (invariant 4: a Notice is never an initiative
 * channel; these are). Pure, so the words are pinned by tests.
 */

function str(v: unknown): string { return typeof v === 'string' ? v.trim() : ''; }

export interface WellbeingRow { title: string; summary?: string; personId?: string; personName?: string }

/** `{burnout_score, primary_drivers:[{dimension}|string], urgency, person_id?, person_name?}` */
export function burnoutRow(payload: Record<string, unknown>): WellbeingRow {
  const person = str(payload.person_name);
  const drivers = (Array.isArray(payload.primary_drivers) ? payload.primary_drivers : [])
    .map((d) => (typeof d === 'string' ? d : d && typeof d === 'object' ? str((d as Record<string, unknown>).dimension) : ''))
    .filter(Boolean).slice(0, 2).map((d) => d.replace(/_/g, ' '));
  const summary = drivers.length >= 2 ? `${drivers[0]} and ${drivers[1]} are adding up` : drivers.length === 1 ? `${drivers[0]} is adding up` : 'Stress levels are elevated \u2014 consider taking breaks';
  return { title: person ? `${person} might need support` : 'Take care of yourself', summary, personId: str(payload.person_id) || undefined, personName: person || undefined };
}

/** Only the two the web's default mode surfaces: stalled, deadline approaching. */
export function goalMilestoneRow(payload: Record<string, unknown>): WellbeingRow | null {
  const type = str(payload.milestone_type);
  if (type !== 'stalled' && type !== 'deadline_approaching') return null;
  const goal = str(payload.goal_content) || str(payload.message);
  if (!goal) return null;
  return { title: type === 'stalled' ? 'A goal needs attention' : 'A goal deadline is approaching', summary: goal };
}
