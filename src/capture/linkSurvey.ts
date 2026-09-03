/**
 * The instant give: what a vault's `[[links]]` already say about who is in
 * someone's world — computed here, from files already on disk, before a
 * single note is uploaded. Feeds the backfill preview ("people your links
 * name"), the Today line after Start, and the onboarding moment's candidates.
 * Pure over (text, mtime) pairs so it is testable without a vault.
 */

export interface LinkedPerson { name: string; count: number; last: number }

const LINK_RE = /\[\[([^\]|#^]+)(?:[|#^][^\]]*)?\]\]/g;

/** A link target that reads as a person, not a path, date or heading. */
function looksLikeAName(target: string): boolean {
  const t = target.trim();
  if (!t || t.includes('/') || t.length > 60) return false;
  if (/^\d{4}-\d{2}-\d{2}/.test(t) || /^\d+$/.test(t)) return false;
  if (/^(Myu|Today|Week|Calendar|Commitments|Me)$/i.test(t)) return false;
  return /^[\p{L}][\p{L}\p{M}.'’\- ]*$/u.test(t);
}

export function surveyLinks(notes: Array<{ text: string; mtime: number }>): LinkedPerson[] {
  const seen = new Map<string, LinkedPerson>();
  for (const note of notes) {
    LINK_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    const inThisNote = new Set<string>();
    while ((m = LINK_RE.exec(note.text)) !== null) {
      const name = m[1].trim();
      if (!looksLikeAName(name) || inThisNote.has(name)) continue;
      inThisNote.add(name);
      const cur = seen.get(name) ?? { name, count: 0, last: 0 };
      cur.count += 1;
      if (note.mtime > cur.last) cur.last = note.mtime;
      seen.set(name, cur);
    }
  }
  return [...seen.values()].sort((a, b) => b.count - a.count || b.last - a.last || a.name.localeCompare(b.name));
}

/** "Your links already name 47 people; you write most about Marcus Webb, Dana Ortiz and Priya Nair." */
export function surveyLine(people: LinkedPerson[]): string | null {
  if (people.length === 0) return null;
  const top = people.slice(0, 3).map((p) => p.name);
  const most = top.length === 1 ? top[0] : `${top.slice(0, -1).join(', ')} and ${top[top.length - 1]}`;
  return `Your links already name ${people.length} ${people.length === 1 ? 'person' : 'people'}; you write most about ${most}.`;
}

/** A rough, honest estimate for the preview: sequential sends with a breath between. */
export function backfillEstimate(count: number): string {
  const seconds = Math.ceil(count * 0.25);
  if (seconds < 60) return 'under a minute';
  const minutes = Math.ceil(seconds / 60);
  return `about ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}

export type BackfillRange = '90d' | '1y' | 'all';
export function rangeCutoff(range: BackfillRange, now = Date.now()): number {
  if (range === '90d') return now - 90 * 24 * 60 * 60 * 1000;
  if (range === '1y') return now - 365 * 24 * 60 * 60 * 1000;
  return 0;
}
