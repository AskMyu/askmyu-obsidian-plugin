/**
 * Beta terms — what the door shows, what the account has agreed to, and what
 * that means for the pane. Pure, so the rules can be pinned by tests.
 *
 * Wire (backend, 2026-09-02; PLAN_BETA_TERMS_ACCEPTANCE_20260901):
 *  · `GET /terms` — public. `{ current_version, required[], urls{} }`. Read at
 *    the door, BEFORE an account exists: the door has no session, so it cannot
 *    ask `/features`. The version the person SAW is the version sent back.
 *  · `GET /features` → `terms: { current_version, required (outstanding),
 *    satisfied, accepted_versions{type: version}, urls{}, gate_enabled }`.
 *  · Any gated call answers `428 { error: 'terms_required', terms_required[],
 *    terms_version, urls }`. Not 401 (the session is fine) and not 403 (that
 *    is the encryption gate elsewhere) — a screen, never a re-mint or a backoff.
 *
 * Two standings besides "fine": GATED blocks (first acceptance — the account is
 * unusable until it agrees); UPDATE does not (a later version — a dismissible
 * row). Never confuse the two: only the first is how coverage is guaranteed.
 */

export const TERMS_TYPES = ['beta_participation', 'privacy_policy'] as const;
export type TermsType = (typeof TERMS_TYPES)[number];

export const TERMS_LABELS: Record<TermsType, string> = {
  beta_participation: 'Beta participation terms',
  privacy_policy: 'Privacy policy',
};

/**
 * Where the links go when `/terms` cannot be reached: the public pages. The
 * live answer is the source of truth; these only cover an unreachable server.
 */
export const TERMS_FALLBACK_URLS: Record<TermsType, string> = {
  beta_participation: 'https://www.askmyu.com/beta-program-participation-terms',
  privacy_policy: 'https://www.askmyu.com/privacy-policy',
};

/** What the door needs: the version being agreed to and where each document lives. */
export interface TermsInfo {
  currentVersion: string;
  required: string[];
  urls: Record<string, string>;
}

/** What the account has agreed to, per `/features`. */
export interface TermsState extends TermsInfo {
  satisfied: boolean;
  acceptedVersions: Record<string, string>;
  gateEnabled: boolean;
}

export type TermsStanding = 'gated' | 'update' | 'ok';

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && s.length > 0) : []);

/** The fallbacks, overlaid with whatever https links the server sent. */
function urlsFrom(raw: unknown): Record<string, string> {
  const out: Record<string, string> = { ...TERMS_FALLBACK_URLS };
  if (!isRecord(raw)) return out;
  for (const [type, url] of Object.entries(raw)) {
    if (typeof url === 'string' && /^https:\/\//.test(url)) out[type] = url;
  }
  return out;
}

/** `GET /terms`. Null when the answer names no version — nothing to agree to yet. */
export function parseTermsInfo(data: unknown): TermsInfo | null {
  if (!isRecord(data) || typeof data.current_version !== 'string' || !data.current_version) return null;
  const required = strings(data.required);
  return {
    currentVersion: data.current_version,
    required: required.length ? required : [...TERMS_TYPES],
    urls: urlsFrom(data.urls),
  };
}

/** The `terms` block of `GET /features`. Null when absent (a backend without the gate). */
export function parseTermsState(data: unknown): TermsState | null {
  const t = isRecord(data) ? data.terms : null;
  if (!isRecord(t) || typeof t.current_version !== 'string' || !t.current_version) return null;
  const accepted: Record<string, string> = {};
  if (isRecord(t.accepted_versions)) {
    for (const [type, v] of Object.entries(t.accepted_versions)) if (typeof v === 'string' && v) accepted[type] = v;
  }
  return {
    currentVersion: t.current_version,
    required: strings(t.required),
    urls: urlsFrom(t.urls),
    satisfied: t.satisfied === true,
    acceptedVersions: accepted,
    gateEnabled: t.gate_enabled !== false,
  };
}

/** A 428 body, read as the state it implies: gated, on these documents, at this version. */
export function termsStateFrom428(body: unknown): TermsState | null {
  if (!isRecord(body) || body.error !== 'terms_required') return null;
  const version = typeof body.terms_version === 'string' ? body.terms_version : '';
  const required = strings(body.terms_required);
  return {
    currentVersion: version,
    required: required.length ? required : [...TERMS_TYPES],
    urls: urlsFrom(body.urls),
    satisfied: false,
    acceptedVersions: {},
    gateEnabled: true,
  };
}

/**
 * What the pane does about it.
 *  - `gated`: the gate is on and the account has no qualifying acceptance.
 *    Blocks. (The backend enforces this with 428 regardless; the pane just
 *    gets there first, so nothing else has to fail to reveal it.)
 *  - `update`: satisfied, but a document was accepted at an older version
 *    than the current bundle. Versions are dates, so older sorts lower.
 *  - `ok`: nothing to do — including a backend that reports no terms at all.
 */
export function termsStanding(state: TermsState | null): TermsStanding {
  if (!state) return 'ok';
  if (state.gateEnabled && !state.satisfied) return 'gated';
  if (!state.satisfied) return 'ok';
  const types = new Set([...state.required, ...Object.keys(state.acceptedVersions)]);
  for (const type of types) {
    const accepted = state.acceptedVersions[type];
    if (accepted && accepted < state.currentVersion) return 'update';
  }
  return 'ok';
}

/** The two links, in reading order, with the label the agreement itself uses. */
export function termsLinks(urls: Record<string, string>): Array<{ type: TermsType; label: string; url: string }> {
  return TERMS_TYPES.map((type) => ({ type, label: TERMS_LABELS[type], url: urls[type] ?? TERMS_FALLBACK_URLS[type] }));
}
