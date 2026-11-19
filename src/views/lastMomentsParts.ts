/**
 * The last moments of the week, drawn (2026-11-13; BRIEF_FRONTEND_LAST_MOMENTS_20261112 §1, §3, §5): what has repeated on a person's
 * card, they may ask about on the prep, your side of the work on the weekly review. Each sentence is the server's; one that rests on
 * something opens to it in place (the exact words, the day, the link, or what a count counted), and stays open across the pane's
 * redraws (`opened`, the pane's own set). Nothing is drawn when there is nothing. What is read, and the few words the vault owns, are in
 * `lastMomentsVault.ts`; the contract's words in `lastMoments.ts`. No chart, no score.
 */

import { LAST_MOMENTS_WORDS, type MayAsk, type Repeated, type Source, type YourWeek } from '../lastMoments';
import { goalWords, sourceWhen, stepWhen, toldWords, webLink, weekItemWords } from '../lastMomentsVault';

/** A link that opens in the browser. */
function link(host: HTMLElement, text: string, href: string, cls = 'myu-line-link'): void {
  host.createEl('a', { cls, text, href, attr: { target: '_blank', rel: 'noopener' } });
}

/** The sources under a sentence: "Monday: “Can you add a change summary?”", the words a link when there is one. */
export function renderSources(host: HTMLElement, sources: Source[], now: number = Date.now()): void {
  if (!sources.length) return;
  const list = host.createDiv({ cls: 'myu-lm-sources' });
  for (const s of sources) {
    const row = list.createDiv({ cls: 'myu-lm-source' });
    const when = sourceWhen(s, now);
    if (when) row.createSpan({ cls: 'myu-lm-when', text: `${when}: ` });
    const quote = `“${s.quote}”`;
    const href = webLink(s.link);
    if (href) link(row, quote, href);
    else row.createSpan({ text: quote });
  }
}

/**
 * A sentence that opens to what is under it: the sentence is the button (its words exactly), `under` fills when it is open. The open
 * ones are kept by key in the pane's `opened`, so a redraw keeps them open.
 */
function opener(head: HTMLElement, under: HTMLElement, key: string, opened: Set<string>, fill: (under: HTMLElement) => void): void {
  const paint = () => {
    under.empty();
    head.setAttr('aria-expanded', String(opened.has(key)));
    if (opened.has(key)) fill(under);
  };
  head.onclick = () => {
    if (opened.has(key)) opened.delete(key);
    else opened.add(key);
    paint();
  };
  paint();
}

/** The sentence: a button when something is under it, else its words alone. */
function sentence(host: HTMLElement, text: string, opens: boolean, cls: string): HTMLElement {
  return opens ? host.createEl('button', { cls: `myu-aff myu-lm-open ${cls}`, text }) : host.createDiv({ cls, text });
}

/**
 * "What has repeated" on a person's card (§3): each sentence as the server gives it ("You asked Omar for a change summary on 3 pull
 * requests this month"), opening to its sources. Nothing when there is nothing.
 */
export function renderRepeated(root: HTMLElement, items: Repeated[], opened: Set<string>, now: number = Date.now()): void {
  if (!items.length) return;
  const zone = root.createDiv({ cls: 'myu-zone myu-lm-repeated' });
  zone.createDiv({ cls: 'myu-whisper', text: LAST_MOMENTS_WORDS.repeated });
  items.forEach((r, i) => {
    const item = zone.createDiv({ cls: 'myu-lm-item' });
    const head = sentence(item, r.text, r.sources.length > 0, 'myu-lm-text');
    if (!r.sources.length) return;
    opener(head, item.createDiv({ cls: 'myu-lm-under' }), `repeated:${i}:${r.text}`, opened, (under) => renderSources(under, r.sources, now));
  });
}

/**
 * "They may ask about" on the prep (§5): each item the server's sentence (three at most, read by `mayAskOf`), what happened in order
 * with its day and time, what the person already told them ("You told Sofia yesterday: “…”"), and the sources under the sentence when
 * it is opened. Nothing when there is nothing.
 */
export function renderMayAsk(root: HTMLElement, items: MayAsk[], opened: Set<string>, now: number = Date.now()): void {
  if (!items.length) return;
  const zone = root.createDiv({ cls: 'myu-zone myu-lm-may-ask' });
  zone.createDiv({ cls: 'myu-whisper', text: LAST_MOMENTS_WORDS.mayAsk });
  items.forEach((m, i) => {
    const item = zone.createDiv({ cls: 'myu-lm-item' });
    const head = sentence(item, m.text, m.sources.length > 0, 'myu-lm-text');
    for (const s of m.steps) {
      const step = item.createDiv({ cls: 'myu-lm-step' });
      const when = stepWhen(s.atMs, now);
      if (when) step.createSpan({ cls: 'myu-time', text: when });
      step.createSpan({ text: s.text });
    }
    for (const t of m.told) {
      const said = toldWords(t, now);
      if (said) item.createDiv({ cls: 'myu-lm-told', text: said });
    }
    if (!m.sources.length) return;
    opener(head, item.createDiv({ cls: 'myu-lm-under' }), `may-ask:${i}:${m.text}`, opened, (under) => renderSources(under, m.sources, now));
  });
}

/**
 * "Your side of the work" on the weekly review (§1): each count's sentence (a count of zero is already left out by the reader), opening
 * to what it counted (the words, who an open one waits on, the link); "Your goals" beside it, each with its count and one example.
 * No chart, no score.
 */
export function renderYourWeek(host: HTMLElement, week: YourWeek, opened: Set<string>): void {
  if (!week.counts.length && !week.goals.length) return;
  const part = host.createDiv({ cls: 'myu-lm-week' });
  if (week.counts.length) {
    const side = part.createDiv({ cls: 'myu-lm-week-side' });
    side.createDiv({ cls: 'myu-whisper', text: LAST_MOMENTS_WORDS.week.yourSide });
    week.counts.forEach((c, i) => {
      const item = side.createDiv({ cls: 'myu-lm-item' });
      const head = sentence(item, c.sentence, c.items.length > 0, 'myu-lm-text');
      if (!c.items.length) return;
      opener(head, item.createDiv({ cls: 'myu-lm-under' }), `week:${i}:${c.key}`, opened, (under) => {
        const list = under.createDiv({ cls: 'myu-lm-sources' });
        for (const it of c.items) {
          const row = list.createDiv({ cls: 'myu-lm-source' });
          const href = webLink(it.link);
          if (href) {
            link(row, it.text, href);
            if (it.who) row.createSpan({ text: ` · ${it.who}` });
          } else {
            row.createSpan({ text: weekItemWords(it) });
          }
        }
      });
    });
  }
  if (week.goals.length) {
    const goals = part.createDiv({ cls: 'myu-lm-week-goals' });
    goals.createDiv({ cls: 'myu-whisper', text: LAST_MOMENTS_WORDS.week.goals });
    for (const g of week.goals) {
      const item = goals.createDiv({ cls: 'myu-lm-item' });
      item.createDiv({ cls: 'myu-lm-text', text: goalWords(g) });
      if (!g.example) continue;
      const ex = item.createDiv({ cls: 'myu-lm-example' });
      const href = webLink(g.example.link);
      if (href) link(ex, g.example.text, href);
      else ex.createSpan({ text: g.example.text });
    }
  }
}
