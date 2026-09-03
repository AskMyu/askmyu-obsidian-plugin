/**
 * The controls a component carries, as real buttons under its markdown.
 *
 * Markdown can say "Is this the right person?"; it cannot let you answer. The
 * web answers through `/composition/action`; so does this, with the same
 * component id, action name and params the web's renderers send — read from
 * PreparedContent / ActionControls / DecisionFrame / PersonDisambiguation
 * renderers, not guessed. Its own module so it is testable with the ui-stub.
 *
 * Two wires, both the web's: `/composition/action` does the thing; the
 * interaction record (`/composition/interaction`, `generate_response`) makes
 * Myu ANSWER IN THE CONVERSATION afterwards — option_selected, prompt_answered,
 * action_clicked (2026-08-29 audit: the click talked back on the web, not here).
 *
 * Not yet covered (rendered as prose only): decision_frame `multi_select`,
 * seed_follow_up, stakeholder person_card `actions`. Each has a wire shape
 * not yet read; adding one is one `case` here.
 */

import type { CompositionComponentLite } from '../wire';

export interface CanvasActionHost {
  /** Press: returns whether it worked and anything the server said. */
  run(componentId: string, action: string, params: Record<string, unknown> | undefined): Promise<{ ok: boolean; message?: string }>;
  /** Record a high-signal interaction so Myu answers in the conversation. */
  interact(componentId: string, spec: InteractionSpec): Promise<void>;
}

/** The interaction record for a press — event_type + component_type + what was chosen. */
export interface InteractionSpec { event_type: string; component_type: string; action_value: string; metadata?: Record<string, unknown> }

interface Control { label: string; action: string; params?: Record<string, unknown>; cta?: boolean; interaction?: InteractionSpec }

interface InputControl {
  /** '' = interaction only (a reflection answer has no /composition/action). */
  action: string;
  /** Built from the typed value at submit time. */
  interaction?: (value: string) => InteractionSpec;
  params?: Record<string, unknown>;
  param_name: string;
  placeholder?: string;
  submit_label?: string;
  submitting_label?: string;
  validate?: string;
  help_text?: string;
}

function str(v: unknown): string { return typeof v === 'string' ? v.trim() : ''; }
function rec(v: unknown): Record<string, unknown> | null { return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null; }
function arr(v: unknown): Array<Record<string, unknown>> { return Array.isArray(v) ? (v.filter((x) => rec(x)) as Array<Record<string, unknown>>) : []; }

/** What this component lets the reader DO, in the web's wire vocabulary. */
export function controlsOf(component: CompositionComponentLite): { buttons: Control[]; input: InputControl | null } {
  const data = component.data ?? {};
  const buttons: Control[] = [];
  let input: InputControl | null = null;

  switch (component.type) {
    case 'prepared_content': {
      for (const a of arr(data.channel_actions)) {
        if (str(a.label) && str(a.action)) buttons.push({ label: str(a.label), action: str(a.action), params: rec(a.params) ?? undefined });
      }
      const f = rec(data.input_field);
      if (f && str(f.action) && str(f.param_name)) {
        input = { action: str(f.action), params: rec(f.params) ?? undefined, param_name: str(f.param_name), placeholder: str(f.placeholder), submit_label: str(f.submit_label), submitting_label: str(f.submitting_label), validate: str(f.validate), help_text: str(f.help_text) };
      }
      break;
    }
    case 'action_controls':
      for (const a of arr(data.actions)) {
        if (str(a.label) && str(a.action)) buttons.push({ label: str(a.label), action: str(a.action), params: rec(a.params) ?? undefined, cta: a.priority === 'high' || a.style === 'primary', interaction: { event_type: 'action_clicked', component_type: 'action_controls', action_value: str(a.label) || str(a.action), metadata: { action_name: str(a.action) } } });
      }
      break;
    case 'reflection_prompt':
      // The web only RECORDS the answer (prompt_answered, generate_response) —
      // Myu picks it up in the conversation. No /composition/action exists for it.
      input = { action: '', param_name: 'answer', placeholder: str(data.placeholder) || 'Your answer\u2026', submit_label: 'Answer', submitting_label: 'Sending\u2026', interaction: (value) => ({ event_type: 'prompt_answered', component_type: 'reflection_prompt', action_value: value, metadata: { action_name: 'prompt_answered' } }) };
      break;
    case 'offer_block': {
      // The Welcome canvas's offer (cold start, slice 4): each option is a
      // door. `offer:<id>` never goes to /composition/action — the pane
      // handles it (Google consent for calendar only, a pasted iCal address,
      // an .ics upload, or "I'll just tell you"). The paste sheet is the input.
      // The moment variant (id offer_moment, data.moment notes|mail|connect_rest):
      // options with `init` start that OAuth verbatim; options without are
      // declines, persisted so the server stops delivering the rung.
      const moment = str(data.moment);
      const ids = arr(data.options).map((o) => ({ id: str(o.id), label: str(o.label), init: rec(o.init) ?? undefined })).filter((o) => o.id && o.label);
      let ctaGiven = false;
      for (const o of ids) {
        if (o.id === 'calendar_ical') continue; // the input below IS this option
        if (o.id === 'archive') continue; // no plugin door for a mail-archive upload yet
        const cta = moment ? !!o.init && !ctaGiven : o.id === 'calendar_google';
        if (cta) ctaGiven = true;
        buttons.push({ label: o.label, action: `offer:${o.id}`, cta, params: { ...(o.init ? { init: o.init } : {}), ...(moment ? { moment, journal_id: str(data.journal_id) || undefined } : {}), ...(str(data.stopped_ack) ? { stopped_ack: str(data.stopped_ack) } : {}) } });
      }
      if (ids.some((o) => o.id === 'calendar_ical')) {
        input = { action: 'offer:calendar_ical', param_name: 'url', placeholder: 'https://calendar.google.com/calendar/ical/\u2026/basic.ics', submit_label: 'Read my week', submitting_label: 'Reading\u2026', validate: 'url', help_text: 'Google Calendar \u2192 Settings \u2192 your calendar \u2192 Secret address in iCal format. Outlook: Shared calendars \u2192 Publish. Read-only by construction.' };
      }
      break;
    }
    case 'inline_chat':
      input = { action: 'inline_chat', param_name: 'message', placeholder: str(data.placeholder) || 'Ask a follow-up about this\u2026', submit_label: 'Ask', submitting_label: 'Asking\u2026' };
      break;
    case 'decision_frame':
      if (component.variant === 'multi_select') break; // needs the multi_select wire — prose for now
      arr(data.options).forEach((o, i) => {
        if (str(o.label)) buttons.push({ label: str(o.label), action: 'select_option', params: { option_index: i, option_label: str(o.label) }, cta: o.recommended === true, interaction: { event_type: 'option_selected', component_type: 'decision_frame', action_value: str(o.label), metadata: { action_name: 'select_option', option_index: i, option_label: str(o.label) } } });
      });
      break;
    case 'person_disambiguation': {
      for (const c of arr(data.candidates)) {
        if (str(c.name) && str(c.relationship_id)) buttons.push({ label: `\u2713 ${str(c.name)}`, action: 'resolve_person', params: { type: 'confirm', relationship_id: str(c.relationship_id), person_name: str(c.name) } });
      }
      if (buttons.length) buttons.push({ label: 'None of these', action: 'resolve_person', params: { type: 'reject_all' } });
      break;
    }
    default:
      break;
  }
  return { buttons, input };
}

/** Render the controls under `parent`. Returns true if anything was rendered. */
export function renderComponentActions(parent: HTMLElement, component: CompositionComponentLite, host: CanvasActionHost): boolean {
  const { buttons, input } = controlsOf(component);
  if (buttons.length === 0 && !input) return false;

  const row = parent.createDiv({ cls: 'myu-canvas-actions' });
  const controls: HTMLButtonElement[] = [];
  let status: HTMLElement | null = null;
  const say = (text: string) => {
    if (!status) status = row.createSpan({ cls: 'myu-status myu-quiet' });
    status.setText(text);
  };

  const press = async (action: string, params: Record<string, unknown> | undefined, working: string, interaction?: InteractionSpec) => {
    for (const b of controls) b.disabled = true;
    say(working);
    if (!action) {
      // Interaction only: the answer goes to the conversation, not to a card.
      await host.interact(component.id, interaction as InteractionSpec).catch(() => undefined);
      say('Sent \u2014 Myu will pick this up in the conversation.');
      return;
    }
    const res = await host.run(component.id, action, params);
    if (res.ok) {
      say(res.message ?? 'done \u2713');
      // The record that makes the click talk back — after the action, like the web.
      if (interaction) void host.interact(component.id, interaction).catch(() => undefined);
      return;
    }
    // Never a silent failure: say it, and give the buttons back.
    say(res.message ?? "That didn\u2019t work. Try again.");
    for (const b of controls) b.disabled = false;
  };

  for (const c of buttons) {
    const b = row.createEl('button', { cls: `myu-affordance${c.cta ? ' myu-cta' : ''}`, text: c.label });
    b.onclick = () => void press(c.action, c.params, 'working\u2026', c.interaction);
    controls.push(b);
  }

  if (input) {
    const field = row.createEl('input', { cls: 'myu-canvas-input' });
    field.type = 'text';
    if (input.placeholder) field.placeholder = input.placeholder;
    const submit = row.createEl('button', { cls: 'myu-affordance myu-cta', text: input.submit_label || 'Submit' });
    controls.push(submit);
    const spec = input;
    submit.onclick = () => {
      const value = field.value.trim();
      if (!value) { say('Type something first.'); return; }
      if (spec.validate === 'linkedin_url' && !/linkedin\.com\//i.test(value)) { say('That doesn\u2019t look like a LinkedIn profile URL.'); return; }
      if ((spec.validate === 'url' || spec.validate === 'linkedin_url') && !/^https?:\/\//i.test(value)) { say('Paste the full URL, starting with https://'); return; }
      void press(spec.action, { ...(spec.params ?? {}), [spec.param_name]: value }, spec.submitting_label || 'Submitting\u2026', spec.interaction?.(value));
      field.value = '';
    };
    if (input.help_text) row.createDiv({ cls: 'myu-quiet myu-help', text: input.help_text });
  }
  return true;
}
