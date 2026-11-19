/**
 * The pages a line is about (2026-10-28) — the plugin's word-for-word copy of shared `types/lineLinks.ts` (the plugin
 * imports shared types only; `tests/internal/lineLinksParity.test.ts` holds the copy). Every served line can carry
 * `links: [{url, choice_id?}]`; today that is the LinkedIn profile a match question asks about, so "There's one
 * LinkedIn profile that looks like David Chang. Is that right?" can be checked before it is answered. A link with no
 * choice id belongs to the whole question and is drawn under its words; one with a choice id belongs to that choice
 * and is drawn under the choices with the choice's words. Only http and https addresses are drawn. Pure.
 */

export interface LineLink {
  url: string;
  /** The choice this page belongs to, when there is one choice per page. */
  choice_id?: string;
}

/** What a link opens, as a category (the address itself never goes to analytics). */
export type LineLinkKind = 'linkedin_profile' | 'page';

export interface ShownLink {
  url: string;
  kind: LineLinkKind;
  /** The words drawn for it: the fixed words for a question's link, the choice's own words for a choice's. */
  label: string;
  choice_id?: string;
}

/** The surfaces' words for a line's links. */
export const LINE_LINK_WORDS = {
  profile: 'See the profile on LinkedIn',
  page: 'Open the page',
  eachProfile: 'See each profile on LinkedIn:',
  eachPage: 'Open each page:',
} as const;

/** An address fit to open: http or https, trimmed. Null for anything else (a `javascript:` or `data:` address never opens). */
export function safeLinkUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const v = url.trim();
  if (!/^https?:\/\/[^\s/?#]+/i.test(v) || /\s/.test(v)) return null;
  return v;
}

/** A LinkedIn profile (linkedin.com or a country's subdomain, a path under /in/), else a page. */
export function linkKind(url: string): LineLinkKind {
  const m = /^https?:\/\/([^/?#:]+)(?::\d+)?(\/[^?#]*)?/i.exec(url.trim());
  if (!m) return 'page';
  const host = m[1].toLowerCase();
  const onLinkedIn = host === 'linkedin.com' || host.endsWith('.linkedin.com');
  return onLinkedIn && /^\/in\/[^/]+/i.test(m[2] ?? '') ? 'linkedin_profile' : 'page';
}

/**
 * A line's links as a surface draws them. `own`: the question's (no choice id, or a choice id the line's choices do
 * not have), with the fixed words. `byChoice`: one per choice that has one, in the choices' order, with the choice's
 * words. An address that is not http or https, or that came already, is left out.
 */
export function lineLinks(line: { links?: ReadonlyArray<Partial<LineLink>> | null; choices?: ReadonlyArray<{ id?: string; label?: string }> | null } | null | undefined): {
  own: ShownLink[];
  byChoice: ShownLink[];
} {
  const own: ShownLink[] = [];
  const byChoice: ShownLink[] = [];
  const given: unknown = line?.links;
  const raw: ReadonlyArray<Partial<LineLink> | null | undefined> = Array.isArray(given) ? (given as Array<Partial<LineLink> | null | undefined>) : [];
  const choices = line?.choices ?? [];
  const seen = new Set<string>();
  const forChoice = new Map<string, string>();
  for (const l of raw) {
    const url = safeLinkUrl(l?.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const choiceId = typeof l?.choice_id === 'string' ? l.choice_id.trim() : '';
    if (choiceId && choices.some((c) => c.id === choiceId) && !forChoice.has(choiceId)) {
      forChoice.set(choiceId, url);
      continue;
    }
    const kind = linkKind(url);
    own.push({ url, kind, label: kind === 'linkedin_profile' ? LINE_LINK_WORDS.profile : LINE_LINK_WORDS.page });
  }
  for (const c of choices) {
    const url = c.id ? forChoice.get(c.id) : undefined;
    if (!url || !c.id) continue;
    const kind = linkKind(url);
    const label = (c.label ?? '').trim() || (kind === 'linkedin_profile' ? LINE_LINK_WORDS.profile : LINE_LINK_WORDS.page);
    byChoice.push({ url, kind, label, choice_id: c.id });
  }
  return { own, byChoice };
}

/** The words before a line's choice links: profiles when every one is a LinkedIn profile, else pages. */
export function eachLinkWords(byChoice: ReadonlyArray<Pick<ShownLink, 'kind'>>): string {
  return byChoice.length > 0 && byChoice.every((l) => l.kind === 'linkedin_profile') ? LINE_LINK_WORDS.eachProfile : LINE_LINK_WORDS.eachPage;
}
