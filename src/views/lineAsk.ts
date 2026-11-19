/**
 * One of Myu's questions outside a space, drawn with its buttons (2026-09-25): the Today pane's
 * rows and the opening question of a person's chat both use this. The rules (which buttons, what
 * they answer, what a reply shows) are `lineAnswers.ts`; this only draws them. The pages the
 * question is about (2026-10-28, a LinkedIn match question's profile) go above the buttons, and
 * each choice's under them (`lineLinks.ts`).
 *
 * What else falls on that day (2026-11-13): "Move it" opens "Which day?" under the buttons (the line's free days, then a date for
 * another day); a day picked answers the line. The open "Which day?" stays open across the pane's redraws until the line is answered.
 *
 * Who someone is (2026-11-15): "No, someone else" (or "Choose who") opens "Who is it?" under the question's buttons: a box to type
 * in, the person's people whose names match under it (one press sends that person), and the name as typed ("Use “Rowan Field”"),
 * then Back. It stays open, with what was typed, across the pane's redraws until the line is answered. The assumed tie shows its
 * claim, with "Not her?" as its button.
 */

import type { MyuLineLite } from '../transport/api';
import { LINE_ANSWER_WORDS, lineButtons, lineSentences, showEstimate, type LineButton, type LineDraft, type LineUi } from '../lineAnswers';
import { lineIdAttr } from '../linesSeenWatch';
import { eachLinkWords, lineLinks, type ShownLink } from '../lineLinks';
import { LAST_MOMENTS_WORDS } from '../lastMoments';
import { LAST_MOMENTS_VAULT_WORDS, freeDaysOf, isDay, moveAnswer, todayIso } from '../lastMomentsVault';
import { lineWords, type PersonPick } from '../identityLines';
import { IDENTITY_WORDS, someoneElseAnswer } from '../personIdentities';

/** Lines whose "Which day?" is open, and the day typed in it, by line id: kept across the pane's redraws until the line is answered. */
const choosingDay = new Set<string>();
const typedDay = new Map<string, string>();
/** Lines whose "Who is it?" is open, and the words typed in it, by line id: kept the same way. */
const choosingWho = new Set<string>();
const typedWho = new Map<string, string>();
/** The people last found for a line's typed words: drawn again on a redraw without asking again. */
const foundWho = new Map<string, { q: string; people: PersonPick[] }>();

/** Finds the person's people for the typed words (`peopleFinder` in `identityLines.ts`); absent, only a typed name can be sent. */
export type FindPeople = (query: string) => Promise<PersonPick[]>;

/**
 * "Who is it?" under the question's buttons: the box, the person's people that match what is typed (a press sends that person,
 * `{choice_id: "someone_else", relationship_id}`), the name as typed (`{…, text}`), and Back. Enter sends the typed name when no
 * one matches it; Escape is Back. Nothing while it is closed.
 */
function renderWho(
  host: HTMLElement,
  line: MyuLineLite,
  opener: LineButton,
  busy: boolean,
  press: (b: LineButton) => void,
  find: FindPeople | undefined,
  closed: () => void,
  focus = false,
): void {
  host.empty();
  const id = line.line_id;
  if (!choosingWho.has(id)) return;
  const answerWith = (who: { relationship_id: string } | { text: string }): LineButton => ({ ...opener, answer: someoneElseAnswer(who) });
  host.createDiv({ cls: 'myu-line myu-who-ask', text: IDENTITY_WORDS.pickPrompt });
  const field = host.createEl('input', { cls: 'myu-who-name', attr: { type: 'text', placeholder: IDENTITY_WORDS.pickPlaceholder, 'aria-label': IDENTITY_WORDS.pickPrompt } });
  field.value = typedWho.get(id) ?? '';
  field.disabled = busy;
  const found = host.createDiv({ cls: 'myu-who-found' });
  const acts = host.createDiv({ cls: 'myu-mrow-acts myu-line-choices myu-who-acts' });
  let shown: PersonPick[] = [];
  let asked = 0;
  const back = () => {
    choosingWho.delete(id);
    typedWho.delete(id);
    foundWho.delete(id);
    host.empty();
    closed();
  };
  const drawFound = (people: PersonPick[]) => {
    shown = people;
    found.empty();
    for (const p of people) {
      const b = found.createEl('button', { cls: 'myu-aff myu-who-person', text: p.name, attr: { 'data-person': p.id } });
      if (p.sub) b.createSpan({ cls: 'myu-quiet myu-who-sub', text: ` · ${p.sub}` });
      b.disabled = busy;
      b.onclick = () => press(answerWith({ relationship_id: p.id }));
    }
  };
  const drawActs = () => {
    acts.empty();
    const name = field.value.trim();
    if (name) {
      const use = acts.createEl('button', { cls: 'myu-aff myu-who-use', text: IDENTITY_WORDS.nameTyped(name) });
      use.disabled = busy;
      use.onclick = () => press(answerWith({ text: name }));
    }
    const b = acts.createEl('button', { cls: 'myu-aff myu-line-quiet myu-who-back', text: IDENTITY_WORDS.back });
    b.disabled = busy;
    b.onclick = back;
  };
  const look = () => {
    const name = field.value.trim();
    const mine = ++asked;
    if (!find || !name) {
      drawFound([]);
      return;
    }
    const kept = foundWho.get(id);
    if (kept?.q === name) {
      drawFound(kept.people);
      return;
    }
    find(name)
      .then((people) => {
        if (mine !== asked || !choosingWho.has(id)) return;
        foundWho.set(id, { q: name, people });
        drawFound(people);
      })
      .catch(() => {
        if (mine === asked) drawFound([]);
      });
  };
  field.addEventListener('input', () => {
    typedWho.set(id, field.value);
    drawActs();
    look();
  });
  field.addEventListener('keydown', (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') back();
    else if (ev.key === 'Enter' && field.value.trim() && !shown.length && !busy) {
      ev.preventDefault?.();
      press(answerWith({ text: field.value.trim() }));
    }
  });
  drawActs();
  look();
  // The box takes the keys when "No, someone else" was just pressed; never on a redraw (Today's refresh must not take them from a note).
  if (focus && !busy) field.focus?.();
}

/**
 * "Which day?" under a full-day line's buttons: the line's free days first ("Monday 16 November"), then "Another day" with a date and
 * the move button beside it. A day picked answers the line with it (`{choice_id: "move", day}`). Nothing while it is closed.
 */
function renderWhichDay(host: HTMLElement, line: MyuLineLite, move: LineButton, busy: boolean, press: (b: LineButton) => void): void {
  host.empty();
  if (!choosingDay.has(line.line_id)) return;
  const answerWith = (day: string): LineButton => ({ ...move, answer: moveAnswer(move.id, day) });
  host.createDiv({ cls: 'myu-line myu-lm-which', text: LAST_MOMENTS_WORDS.fullDay.whichDay });
  const days = freeDaysOf(line);
  if (days.length) {
    const row = host.createDiv({ cls: 'myu-mrow-acts myu-line-choices myu-lm-free' });
    for (const d of days) {
      const b = row.createEl('button', { cls: 'myu-aff', text: d.label, attr: { 'data-day': d.day } });
      b.disabled = busy;
      b.onclick = () => press(answerWith(d.day));
    }
  }
  const other = host.createDiv({ cls: 'myu-mrow-acts myu-line-choices myu-lm-another' });
  other.createSpan({ cls: 'myu-quiet', text: LAST_MOMENTS_VAULT_WORDS.anotherDay });
  const field = other.createEl('input', { cls: 'myu-lm-date', attr: { type: 'date', min: todayIso(), 'aria-label': LAST_MOMENTS_VAULT_WORDS.anotherDay } });
  field.value = typedDay.get(line.line_id) ?? '';
  field.disabled = busy;
  const go = other.createEl('button', { cls: 'myu-aff myu-lm-move', text: move.label });
  const typed = () => {
    typedDay.set(line.line_id, field.value);
    go.disabled = busy || !isDay(field.value);
  };
  field.addEventListener('input', typed);
  field.addEventListener('change', typed);
  typed();
  go.onclick = () => {
    if (isDay(field.value)) press(answerWith(field.value.trim()));
  };
}

/** The question's links, or each choice's after the words that say what they are. They open in the browser. */
function renderLinks(host: HTMLElement, links: ShownLink[], lead: string | null): void {
  if (!links.length) return;
  const row = host.createDiv({ cls: 'myu-quiet myu-line-note' });
  if (lead) row.createSpan({ text: `${lead} ` });
  links.forEach((l, i) => {
    if (i > 0) row.createSpan({ text: ' · ' });
    row.createEl('a', { cls: 'myu-line-link', text: `${l.label} ↗`, href: l.url, attr: { target: '_blank', rel: 'noopener' } });
  });
}

/**
 * R19: the message an answer wrote ("Write a message to Sam"), in a box the person can edit, with
 * Copy and the link it is about. Nothing is sent from the vault.
 */
export function renderLineDraft(host: HTMLElement, draft: LineDraft): void {
  const wrap = host.createDiv({ cls: 'myu-line-draft' });
  // Who or where it is for (2026-11-13): "Myu's message to Priya:", "To prd-review in Slack".
  if (draft.lead) wrap.createDiv({ cls: 'myu-quiet myu-line-note myu-line-draft-lead', text: draft.lead });
  const box = wrap.createEl('textarea', { cls: 'myu-line-draft-box' });
  box.value = draft.text;
  box.setAttr('rows', String(Math.min(9, Math.max(3, Math.ceil(draft.text.length / 45)))));
  box.setAttr('aria-label', draft.to_name ? `Your message to ${draft.to_name}` : 'Your message');
  const acts = wrap.createDiv({ cls: 'myu-mrow-acts myu-line-draft-acts' });
  const copy = acts.createEl('button', { cls: 'myu-aff', text: LINE_ANSWER_WORDS.copy });
  let failed: HTMLElement | null = null;
  copy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(box.value);
      copy.setText(LINE_ANSWER_WORDS.copied);
      failed?.remove();
      failed = null;
      window.setTimeout(() => copy.setText(LINE_ANSWER_WORDS.copy), 2500);
    } catch {
      // The words are selected, so the person can copy them with the keyboard.
      box.focus?.();
      box.select?.();
      failed ??= wrap.createDiv({ cls: 'myu-quiet myu-line-note', text: LINE_ANSWER_WORDS.copyFailed });
    }
  };
  box.oninput = () => copy.setText(LINE_ANSWER_WORDS.copy);
  if (draft.url) acts.createEl('a', { cls: 'myu-line-link', text: draft.label, href: draft.url, attr: { target: '_blank', rel: 'noopener' } });
}

/** Notes and links an answer left under the line (a consent opened, the invite's file, the event, a message). */
function renderAfter(host: HTMLElement, ui: LineUi): void {
  for (const n of ui.notes ?? []) host.createDiv({ cls: 'myu-quiet myu-line-note', text: n });
  for (const l of ui.links ?? []) {
    const row = host.createDiv({ cls: 'myu-quiet myu-line-note' });
    if (l.text) row.createSpan({ text: `${l.text} ` });
    row.createEl('a', { cls: 'myu-line-link', text: l.label, href: l.url, attr: { target: '_blank', rel: 'noopener' } });
  }
  if (ui.draft) renderLineDraft(host, ui.draft);
}

/**
 * The line, then its buttons (the quiet way out as quiet text). Answered here, it is replaced
 * by what Myu said back. `showText: false` when the words are already on screen (the chat's turn).
 */
export function renderLineAsk(
  host: HTMLElement,
  line: MyuLineLite,
  ui: LineUi,
  on: { press: (button: LineButton) => void; people?: FindPeople },
  opts: { showText?: boolean } = {},
): void {
  if (ui.said !== undefined && ui.said !== null) {
    choosingDay.delete(line.line_id);
    typedDay.delete(line.line_id);
    choosingWho.delete(line.line_id);
    typedWho.delete(line.line_id);
    foundWho.delete(line.line_id);
    if (ui.said) host.createDiv({ cls: ui.good ? 'myu-done myu-line-said myu-line-words' : 'myu-quiet myu-line-said myu-line-words', text: ui.said });
    renderAfter(host, ui);
    return;
  }
  if (opts.showText !== false) {
    const cls = line.ask_kind === 'tell' ? 'myu-done' : line.ask_kind === 'wait' ? 'myu-quiet' : 'myu-line';
    // The words carry the line's id: in view for a second, the line is reported as seen (linesSeenWatch.ts). Their own line breaks
    // show (`myu-line-words`, 2026-11-13: a promise someone else's decision affects is several lines, as the server writes them).
    // The assumed tie (2026-11-15) shows its claim; its "Not her?" is the button under it.
    const el = host.createDiv({ cls: `${cls} myu-line-words`, text: lineWords(line), attr: lineIdAttr(line.line_id) });
    // "One tap to answer." only where a tap answers it.
    if (showEstimate(line)) el.createSpan({ cls: 'myu-est', text: (line.est ?? '').trim() });
    // The Friday line (2026-11-13): "Myu: your week.", then each of the server's sentences on its own line.
    for (const sentence of lineSentences(line)) host.createDiv({ cls: 'myu-line-sentence', text: sentence });
  }
  // A question closed elsewhere while it was on screen (2026-11-15): its words, and "Already answered." where its buttons were.
  if (ui.closed) {
    choosingWho.delete(line.line_id);
    typedWho.delete(line.line_id);
    foundWho.delete(line.line_id);
    host.createDiv({ cls: 'myu-quiet myu-line-note myu-line-closed', text: ui.closed });
    return;
  }
  if (ui.note) host.createDiv({ cls: 'myu-quiet myu-line-note', text: ui.note });
  if (line.kind === 'new_device') host.createDiv({ cls: 'myu-quiet myu-line-note', text: LINE_ANSWER_WORDS.newDevice });
  const links = lineLinks(line);
  renderLinks(host, links.own, null);
  const buttons = lineButtons(line);
  if (buttons.length > 0) {
    const acts = host.createDiv({ cls: 'myu-mrow-acts myu-line-choices' });
    let days: HTMLElement | null = null;
    let who: HTMLElement | null = null;
    // "No, someone else" itself: Back closes "Who is it?" and says so on it.
    let whoOpener: HTMLElement | null = null;
    const whoShut = () => whoOpener?.setAttr('aria-expanded', 'false');
    for (const b of buttons) {
      const el = acts.createEl('button', { cls: b.quiet ? 'myu-aff myu-line-quiet' : 'myu-aff', text: b.label });
      el.disabled = !!ui.busy;
      if (b.opens === 'who') {
        // "No, someone else": "Who is it?" opens (and closes) under the buttons; nothing is answered until someone is picked or typed.
        whoOpener = el;
        el.setAttr('aria-expanded', String(choosingWho.has(line.line_id)));
        el.onclick = () => {
          if (choosingWho.has(line.line_id)) choosingWho.delete(line.line_id);
          else choosingWho.add(line.line_id);
          el.setAttr('aria-expanded', String(choosingWho.has(line.line_id)));
          if (who) renderWho(who, line, b, !!ui.busy, on.press, on.people, whoShut, true);
        };
        continue;
      }
      if (b.opens !== 'day') {
        el.onclick = () => on.press(b);
        continue;
      }
      // "Move it": "Which day?" opens (and closes) under the buttons; nothing is answered until a day is picked.
      el.setAttr('aria-expanded', String(choosingDay.has(line.line_id)));
      el.onclick = () => {
        if (choosingDay.has(line.line_id)) choosingDay.delete(line.line_id);
        else choosingDay.add(line.line_id);
        el.setAttr('aria-expanded', String(choosingDay.has(line.line_id)));
        if (days) renderWhichDay(days, line, b, !!ui.busy, on.press);
      };
    }
    const move = buttons.find((b) => b.opens === 'day');
    if (move) {
      days = host.createDiv({ cls: 'myu-lm-days' });
      renderWhichDay(days, line, move, !!ui.busy, on.press);
    }
    const someoneElse = buttons.find((b) => b.opens === 'who');
    if (someoneElse) {
      who = host.createDiv({ cls: 'myu-who' });
      renderWho(who, line, someoneElse, !!ui.busy, on.press, on.people, whoShut);
    }
  }
  renderLinks(host, links.byChoice, eachLinkWords(links.byChoice));
  renderAfter(host, ui);
}
