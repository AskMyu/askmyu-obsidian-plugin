/**
 * LinkedIn matches, ONE way (K2: one engine, one path): the card pane and the
 * Help Myu tab build the SAME component the backend's CompositionSpecBuilder
 * injects into a canvas ("LinkedIn Match Found" — prepared_content with
 * `resolve_linkedin` channel actions, read from the 2026-08-28 screenshot and
 * pinned in tests) and render it through the canvas pipeline:
 * `componentMarkdown` + `renderComponentActions`. Same words, same buttons,
 * same input for a pasted URL — whichever surface you meet it on.
 *
 * The press maps to the card route the web's Help Myu uses
 * (`/v2/relationships/linkedin/suggestion/resolve`), since outside a canvas
 * there is no composition to act on.
 */

import type { App, Component } from 'obsidian';
import { MarkdownRenderer } from 'obsidian';
import type AskMyuPlugin from '../main';
import type { CompositionComponentLite } from '../wire';
import { componentMarkdown } from '../vault/myuFiles';
import { renderComponentActions } from './canvasActions';
import { notifyStatus } from '../notify';

export interface LinkedInSuggestion { card_id?: string; person_name?: string; profile_headline?: string; linkedin_url?: string; confidence?: number }

export function suggestionsOf(raw: unknown): LinkedInSuggestion[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is Record<string, unknown> => !!s && typeof s === 'object').map((s) => ({
    card_id: typeof s.card_id === 'string' ? s.card_id : undefined,
    person_name: typeof s.person_name === 'string' ? s.person_name : undefined,
    profile_headline: typeof s.profile_headline === 'string' ? s.profile_headline : undefined,
    linkedin_url: typeof s.linkedin_url === 'string' ? s.linkedin_url : undefined,
    confidence: typeof s.confidence === 'number' ? s.confidence : undefined,
  }));
}

/**
 * The panel's cards, verbatim (CompositionSpecBuilder for the first;
 * PostCompositionActionServlet `resolve_linkedin` reject → the next, then the
 * terminal). ONE card at a time: ✗ replaces it in place with the next
 * candidate; after the last, "Still can't find {name}".
 */
export function linkedInMatchComponent(sug: LinkedInSuggestion, personName: string, index: number, total: number): CompositionComponentLite | null {
  if (!sug.card_id) return null;
  const name = sug.person_name || 'Unknown';
  const first = index === 0;
  const remaining = total - index;
  // CompositionSpecBuilder's first card: name, headline, the "> Name — headline"
  // context line (its profile-summary blockquote when it has one), the profile
  // link, the question. The servlet's next-candidate card drops the context line.
  const link = sug.linkedin_url ? `[View profile on LinkedIn](${sug.linkedin_url})\n\n` : '';
  const body = first
    ? `**${name}**\n\n${sug.profile_headline ? `*${sug.profile_headline}*\n\n> ${name} \u2014 ${sug.profile_headline}\n\n` : ''}${link}Is this the right person?`
    : `**${name}**\n\n${sug.profile_headline ? `*${sug.profile_headline}*\n\n` : ''}${link}Is this the right person?`;
  const title = first
    ? 'LinkedIn Match Found'
    : `${personName ? `LinkedIn match for ${personName}` : 'LinkedIn Match'}${remaining > 1 ? ` \u2014 ${remaining} suggestions remaining` : ' \u2014 last suggestion'}`;
  return {
    id: `linkedin_confirm_${sug.card_id}`,
    type: 'prepared_content',
    data: {
      title, content: body, format: 'markdown', variant: 'message', readonly: true,
      channel_actions: [
        { label: '\u2713 Confirm Match', action: 'resolve_linkedin', params: { card_id: sug.card_id, resolve_action: 'confirm' } },
        { label: '\u2717 Not this person', action: 'resolve_linkedin', params: { card_id: sug.card_id, resolve_action: 'reject' } },
      ],
    },
  };
}

/** The terminal card — the servlet's words when every candidate was rejected (or there were none). */
export function linkedInTerminalComponent(relationshipId: string, personName: string): CompositionComponentLite {
  const who = personName || 'them';
  const whose = personName ? `${personName}\u2019s` : 'their';
  return {
    id: `linkedin_recover_${relationshipId}`,
    type: 'prepared_content',
    data: {
      title: `Still can\u2019t find ${who}`,
      content: `None of the suggested LinkedIn profiles matched **${who}**. If you have ${whose} LinkedIn URL, paste it below. If ${personName ? `${personName} isn\u2019t` : 'they\u2019re not'} on LinkedIn at all, just let me know.`,
      format: 'markdown', variant: 'message', readonly: true,
      input_field: { placeholder: 'https://linkedin.com/in/...', action: 'resolve_linkedin', param_name: 'linkedin_url', submit_label: 'Link profile', validate: 'linkedin_url', help_text: 'Paste the full LinkedIn profile URL for the correct person.', params: { resolve_action: 'manual_url', relationship_id: relationshipId } },
      channel_actions: [{ label: 'Not on LinkedIn', action: 'resolve_linkedin', params: { resolve_action: 'no_linkedin', relationship_id: relationshipId } }],
    },
  };
}

export interface LinkedInCardsHost {
  app: App;
  owner: Component;
  plugin: AskMyuPlugin;
  relationshipId: string;
  /** The person Myu is trying to place — named in the panel's titles. */
  personName: string;
  /** Called after any resolution so the surface re-reads server truth. */
  onResolved: () => void;
}

/** Render one component exactly as the canvas pane does, the press routed to the card route. `onReject` replaces the card in place. */
function renderAsCanvasCard(root: HTMLElement, component: CompositionComponentLite, host: LinkedInCardsHost, onReject?: () => void): HTMLElement {
  const el = root.createDiv({ cls: `myu-canvas-component myu-canvas-${component.type} markdown-rendered` });
  const md = componentMarkdown(component, 0, () => null, [component]).trim();
  if (md) void MarkdownRenderer.render(host.app, md, el, '', host.owner);
  renderComponentActions(el, component, {
    run: async (_componentId, action, params) => {
      if (action !== 'resolve_linkedin') return { ok: false, message: 'Not a LinkedIn action.' };
      const p = params ?? {};
      const resolve = String(p.resolve_action ?? '');
      const body = resolve === 'confirm' || resolve === 'reject'
        ? { card_id: String(p.card_id ?? ''), action: resolve }
        : resolve === 'manual_url'
          ? { action: 'manual_url' as const, relationship_id: host.relationshipId, linkedin_url: String(p.linkedin_url ?? '') }
          : { action: 'no_linkedin' as const, relationship_id: host.relationshipId };
      const res = await host.plugin.backend.resolveLinkedInSuggestion(body as never).catch(() => null);
      // "Not this person" is the user's verdict, not a request: the walk moves on
      // even if the server refused to record it (a stale card, say) — the doors
      // at the end must always be reachable.
      if (resolve === 'reject' && onReject) { if (!res?.ok) console.warn('[askmyu] linkedin reject not recorded', res?.error); onReject(); return { ok: true, message: 'noted \u2713' }; }
      if (!res?.ok) return { ok: false, message: res?.error || "That didn\u2019t work. Try again." };
      if (resolve === 'confirm' || resolve === 'manual_url') notifyStatus('Linked.');
      if (resolve === 'no_linkedin') notifyStatus("Noted \u2014 Myu won\u2019t keep guessing.");
      host.onResolved();
      return { ok: true, message: resolve === 'reject' ? 'noted \u2713' : 'linked \u2713' };
    },
    interact: async () => undefined,
  });
  return el;
}

/** The panel's walk: one card; ✗ brings the next in place; after the last, the terminal card. */
export function renderLinkedInMatches(root: HTMLElement, suggestions: LinkedInSuggestion[], host: LinkedInCardsHost): void {
  const cards = suggestions.filter((s) => s.card_id);
  const slot = root.createDiv({ cls: 'myu-linkedin-walk' });
  const show = (index: number) => {
    slot.empty();
    const sug = cards[index];
    const component = sug ? linkedInMatchComponent(sug, host.personName, index, cards.length) : null;
    if (!component) { renderAsCanvasCard(slot, linkedInTerminalComponent(host.relationshipId, host.personName), host); return; }
    renderAsCanvasCard(slot, component, host, () => show(index + 1));
  };
  show(0);
}

/**
 * The same walk in the CHAT's register — quiet lines and small buttons, no
 * markdown card chrome (operator, 2026-08-31: "the linkedin card in the chat
 * needs to match the look/feel of the chat output"). Same wire, same
 * one-at-a-time behavior, same terminal doors.
 */
export function renderLinkedInMatchesInline(root: HTMLElement, suggestions: LinkedInSuggestion[], host: LinkedInCardsHost): void {
  const cards = suggestions.filter((s) => s.card_id);
  const slot = root.createDiv({ cls: 'myu-linkedin-inline' });

  const say = (row: HTMLElement, text: string) => {
    const status = row.querySelector<HTMLElement>('.myu-status');
    (status ?? row.createSpan({ cls: 'myu-status myu-quiet' })).setText(text);
  };

  const resolve = async (body: Record<string, unknown>): Promise<{ ok: boolean; message?: string }> => {
    const res = await host.plugin.backend.resolveLinkedInSuggestion(body as never).catch(() => null);
    if (!res?.ok) return { ok: false, message: res?.error || 'That didn\u2019t work. Try again.' };
    return { ok: true };
  };

  const terminal = () => {
    slot.empty();
    const who = host.personName || 'them';
    slot.createDiv({ cls: 'myu-quiet', text: `None of the suggested profiles matched ${who}. Paste the right LinkedIn URL below \u2014 or say ${host.personName ? `${host.personName} isn\u2019t` : 'they\u2019re not'} on LinkedIn.` });
    const row = slot.createDiv({ cls: 'myu-canvas-actions' });
    const field = row.createEl('input', { cls: 'myu-canvas-input' });
    field.type = 'text';
    field.placeholder = 'https://linkedin.com/in/...';
    const link = row.createEl('button', { cls: 'myu-affordance myu-cta', text: 'Link profile' });
    link.onclick = () => {
      void (async () => {
        const url = field.value.trim();
        if (!/linkedin\.com\//i.test(url) || !/^https?:\/\//i.test(url)) { say(row, 'Paste the full LinkedIn profile URL.'); return; }
        link.disabled = true;
        const res = await resolve({ action: 'manual_url', relationship_id: host.relationshipId, linkedin_url: url });
        if (!res.ok) { say(row, res.message ?? ''); link.disabled = false; return; }
        notifyStatus('Linked.');
        host.onResolved();
      })();
    };
    const none = row.createEl('button', { cls: 'myu-affordance', text: 'Not on LinkedIn' });
    none.onclick = () => {
      void (async () => {
        none.disabled = true;
        const res = await resolve({ action: 'no_linkedin', relationship_id: host.relationshipId });
        if (!res.ok) { say(row, res.message ?? ''); none.disabled = false; return; }
        notifyStatus('Noted \u2014 Myu won\u2019t keep guessing.');
        host.onResolved();
      })();
    };
  };

  const show = (index: number) => {
    slot.empty();
    const sug = cards[index];
    if (!sug?.card_id) { terminal(); return; }
    const line = slot.createDiv({ cls: 'myu-voice' });
    line.createSpan({ cls: 'myu-chat-li-name', text: sug.person_name || 'Unknown' });
    if (sug.profile_headline) line.createSpan({ cls: 'myu-quiet', text: ` \u2014 ${sug.profile_headline}` });
    if (cards.length > 1) slot.createDiv({ cls: 'myu-whisper', text: `${index + 1} of ${cards.length}` });
    if (sug.linkedin_url) {
      const view = slot.createEl('button', { cls: 'myu-affordance myu-link-button', text: 'View profile on LinkedIn' });
      const url = sug.linkedin_url;
      view.onclick = () => window.open(url, '_blank');
    }
    const row = slot.createDiv({ cls: 'myu-canvas-actions' });
    const confirm = row.createEl('button', { cls: 'myu-affordance myu-cta', text: 'Confirm match' });
    const reject = row.createEl('button', { cls: 'myu-affordance', text: 'Not this person' });
    confirm.onclick = () => {
      void (async () => {
        confirm.disabled = true; reject.disabled = true;
        const res = await resolve({ card_id: sug.card_id, action: 'confirm' });
        if (!res.ok) { say(row, res.message ?? ''); confirm.disabled = false; reject.disabled = false; return; }
        notifyStatus('Linked.');
        host.onResolved();
      })();
    };
    reject.onclick = () => {
      void (async () => {
        confirm.disabled = true; reject.disabled = true;
        // The user's verdict, not a request: the walk moves on even if the
        // server refused to record it — the doors at the end stay reachable.
        const res = await resolve({ card_id: sug.card_id, action: 'reject' });
        if (!res.ok) console.warn('[askmyu] linkedin reject not recorded', res.message);
        show(index + 1);
      })();
    };
  };
  show(0);
}

/** Zero candidates: the terminal card, straight away. */
export function renderLinkedInRecovery(root: HTMLElement, host: LinkedInCardsHost): void {
  renderAsCanvasCard(root, linkedInTerminalComponent(host.relationshipId, host.personName), host);
}

/** The pending LinkedIn ask this conversation actually NAMES, if any — matched on the person's name in the transcript. */
export function linkedInAskInText(queue: Array<{ item_type: string; relationship_id?: string; display_name?: string }>, text: string): { relationshipId: string; personName: string } | null {
  const haystack = text.toLowerCase();
  for (const item of queue) {
    if (item.item_type !== 'linkedin_disambiguation' || !item.relationship_id || !item.display_name) continue;
    const name = item.display_name.toLowerCase();
    // Full name, or the first name on its own — replies often say just "Jim".
    const first = name.split(/\s+/)[0] ?? name;
    if (haystack.includes(name) || (first.length > 2 && new RegExp(`\\b${first}\\b`).test(haystack))) {
      return { relationshipId: item.relationship_id, personName: item.display_name };
    }
  }
  return null;
}

