/**
 * Wikilink → entity hints. This is B2, and it is the thing no other surface gets.
 *
 * When someone writes `[[Marcus Webb]]` in a daily note they have hand-tagged a
 * person for us, for free, in the convention their whole vault already uses
 * (vault-culture research: a note per person, linked from daily/meeting notes,
 * is THE pattern). We lift those names and pass them as *hints* — the backend
 * resolves identity under its existing gates. The plugin never decides who
 * someone is.
 *
 * Deliberately not handled: unlinked mentions (a later feature, and a much
 * noisier signal), and tags-as-people (`#marcus`), which collide with topic tags
 * badly enough to be a wrong guess more often than a right one.
 */

/** `[[Target]]`, `[[Target|alias]]`, `[[Target#heading]]`, `[[Target^block]]`. */
const WIKILINK = /\[\[([^\]|#^]+)(?:[#^][^\]|]*)?(?:\|[^\]]*)?\]\]/g;

/** Fenced or inline code — links inside are examples, not tags. */
const CODE_FENCE = /```[\s\S]*?```|`[^`\n]*`/g;

/**
 * Extract entity hints in document order, deduped case-insensitively but
 * preserving the user's own casing (the contract says send it as they wrote it).
 *
 * Embeds (`![[…]]`) are excluded: an embedded note is transclusion, not a
 * mention of a person — including them would tag every daily note with whatever
 * its template embeds.
 */
export function extractEntityHints(markdown: string): string[] {
  const withoutCode = markdown.replace(CODE_FENCE, ' ');
  const seen = new Set<string>();
  const hints: string[] = [];

  for (const match of withoutCode.matchAll(WIKILINK)) {
    // Skip embeds: the char before `[[` is `!`.
    if (match.index !== undefined && match.index > 0 && withoutCode[match.index - 1] === '!') continue;

    const target = match[1].trim();
    if (!target) continue;

    // A path-style link (`People/Marcus Webb`) points at a note; the leaf is the
    // name the user means.
    const leaf = target.includes('/') ? target.slice(target.lastIndexOf('/') + 1) : target;
    const name = leaf.trim();
    if (!name || name.length > 80) continue;

    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    hints.push(name);
  }

  return hints;
}
