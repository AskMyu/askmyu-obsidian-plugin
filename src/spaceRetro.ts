/**
 * A space in the vault: the row it gets on Today, and the team's retro as the chat pane
 * shows it (where it stands, each question with what people wrote, the summary the team
 * chose, the tasks).
 *
 * Until 0.1.3 a space could only be reached through a line Myu happened to have about it
 * today, and the team's side of a retro was left to the web ("the room is web and phone",
 * one clause in the retro plan, with no reason behind it; the terminal has had the whole
 * retro since it shipped). A space the person belongs to is always on Today now, and the
 * retro can be read here. Acting on it (ranking, accepting, taking a task) already happens
 * in the space's conversation: Myu asks, one thing at a time.
 *
 * No host calls, so this is tested without Obsidian. Every sentence about the retro comes
 * from the backend; the few words owned here are plain labels.
 *
 * R20 (2026-09-26, the retro leaner): a rule is explained once, where the person first meets
 * it; after that it lives in "How this works", folded, holding the backend's `how_it_works`
 * as sent. The page's top is one line (`retroTopLine`, a mirror of shared
 * `types/retroLean.ts`), the counts are short ("1 of 4 done", "0 of 4 voted"), and no rule
 * sentence stands under a question. `tests/internal/retroLeanParity.test.ts` holds the
 * mirrors to shared.
 */

import type { AskMyuApi, MyuLineLite, RetroReadResult, RetroThreadLite, RetroTodoLite, SpaceLite } from './transport/api';
import { SPACE_MODE_WORDS, isLockedText } from './spaceModeLogic';
import { debriefSmall, isDebriefSpace } from './debriefPane';

export const SPACE_RETRO_WORDS = {
  /** The door on a space's row in Today. */
  show: "See the team's retro ▸",
  /** The two tabs of a space's pane. */
  tabConversation: 'Your conversation',
  tabRetro: "The team's retro",
  loading: "Opening the team's retro",
  failed: "The team's retro could not be read. Try again in a moment.",
  /** Nothing is running and nothing has been held. */
  none: 'No retro is running in this space right now.',
  /** R20: the fold under the top; it holds the backend's `how_it_works`. Shared `RETRO_LEAN_WORDS.howThisWorks`. */
  howThisWorks: 'How this works',
  results: 'Since the last retro',
  question: 'Question',
  from: 'from',
  replies: 'What people wrote',
  noReplies: 'Nobody has written here yet.',
  summary: 'The summary the team chose',
  tasks: 'Tasks',
  /** Under the page: this page is for reading; the answers go in the conversation. */
  howToAct: 'To vote, accept a summary or take a task, answer Myu in your conversation.',
  goToConversation: 'Go to your conversation ▸',
  /** Locked words arrive as a placeholder; say what to do instead of showing it. */
  locked: 'Unlock this space to read what the team wrote.',
} as const;

// ---- Today: one row per space -----------------------------------------------

export interface SpaceRow {
  space_id: string;
  name: string;
  /** "Cofounders · 2 members" — quiet, beside the name. Empty when the list did not say. */
  small: string;
  /** Myu's lines about this space today (may be none: the space is on Today all the same). */
  lines: MyuLineLite[];
  /** An interview debrief's space (`work = "debrief"`): one door, into its conversation, and no retro. */
  debrief?: boolean;
}

/** The kind of team, in words. Mirrors shared `spaceKindWords`; the list's own `kind_label` (R20) goes first where it is sent. */
export function spaceKindWords(kind: string | undefined): string {
  switch (kind) {
    case 'small_team':
      return 'Small team';
    case 'cofounder':
      return 'Cofounders';
    case 'dyad':
      return 'Two people';
    case 'remote_team':
      return 'Remote team';
    case 'family':
      return 'Family';
    case 'matrix':
      return 'Several teams';
    default: {
      const words = (kind ?? '').replace(/_/g, ' ').trim();
      return words ? words.charAt(0).toUpperCase() + words.slice(1) : '';
    }
  }
}

/** How many space rows show on Today before the rest fold. A space that needs you is never folded. */
export const SPACE_ROWS = 3;

/** Which space rows show and which fold: the ones that need you first, then the list's order. */
export function foldSpaceRows(rows: SpaceRow[], needsYou: (row: SpaceRow) => boolean, limit: number = SPACE_ROWS): { shown: SpaceRow[]; folded: SpaceRow[] } {
  const ordered = [...rows.filter(needsYou), ...rows.filter((r) => !needsYou(r))];
  const keep = Math.max(limit, rows.filter(needsYou).length);
  return { shown: ordered.slice(0, keep), folded: ordered.slice(keep) };
}

function spaceIdOf(line: MyuLineLite): string | null {
  if (line.conversation?.subject_type === 'space' && line.conversation.subject_id) return line.conversation.subject_id;
  const s = (line.subjects ?? []).find((x) => x.type === 'space' && x.id);
  return s?.id ?? null;
}

/** Is this line about a space? Such a line rides its space's row, never a row under "for you". */
export function isSpaceLine(line: MyuLineLite): boolean {
  return spaceIdOf(line) !== null;
}

/**
 * Today's space rows: every active space the person belongs to, in the list's order, each
 * with Myu's lines about it.
 *
 * When the list WAS read it is the whole truth: a space that is not on it was archived,
 * dissolved or left, and an old line about it must not bring it back (the operator's Today
 * showed two archived spaces this way, 2026-09-21). Only when the list could not be read
 * (`spaces` is null: an older server, a failed call) do the lines stand in for it.
 */
export function spaceRows(spaces: SpaceLite[] | null | undefined, lines: MyuLineLite[]): SpaceRow[] {
  const bySpace = new Map<string, MyuLineLite[]>();
  const labels = new Map<string, string>();
  for (const l of lines) {
    const id = spaceIdOf(l);
    if (!id) continue;
    const at = bySpace.get(id);
    if (at) at.push(l);
    else bySpace.set(id, [l]);
    const label = (l.subjects ?? []).find((x) => x.type === 'space' && x.id === id)?.label?.trim();
    if (label && !labels.has(id)) labels.set(id, label);
  }
  const rows: SpaceRow[] = [];
  const seen = new Set<string>();
  for (const s of spaces ?? []) {
    if (!s?.space_id || seen.has(s.space_id)) continue;
    if (s.status && s.status !== 'active' && s.status !== 'forming') continue;
    seen.add(s.space_id);
    const members = typeof s.member_count === 'number' && s.member_count > 0 ? `${s.member_count} ${s.member_count === 1 ? 'member' : 'members'}` : '';
    const debrief = isDebriefSpace(s);
    rows.push({
      space_id: s.space_id,
      name: s.name?.trim() || labels.get(s.space_id) || 'A space',
      small: debrief ? debriefSmall(s.member_count) : [s.kind_label?.trim() || spaceKindWords(s.kind), members].filter(Boolean).join(' · '),
      lines: bySpace.get(s.space_id) ?? [],
      ...(debrief ? { debrief: true } : {}),
    });
  }
  if (spaces) return rows;
  for (const [id, ls] of bySpace) rows.push({ space_id: id, name: labels.get(id) || 'A space', small: '', lines: ls });
  return rows;
}

// ---- the team's retro, as the pane shows it ----------------------------------

export interface RetroQuestionView {
  key: string;
  /** "Question 1". */
  title: string;
  /** Who asked it: "Myu, for the team", a person's name, or empty. */
  from: string;
  text: string;
  /** Where this question stands, in the backend's words as sent (R21: with its count, "1 of 4 done."). Empty when it says nothing. */
  state: string;
  replies: Array<{ name: string; text: string }>;
  /** The summary the team chose, once it is shown. */
  summary: string | null;
}

export interface RetroView {
  /** R20: the page's top, one line: "Retro 1 · getting ready · 1 of 4 shared · questions up on Thursday at 2pm". Null when nothing is running. */
  top: string | null;
  /** R20: the backend's `how_it_works` as sent, for the fold under the top. Null when it sends none. */
  how: string | null;
  /** What became of the tasks since the last retro. */
  results: { text: string; items: string[] } | null;
  questions: RetroQuestionView[];
  tasks: Array<{ text: string; standing: string }>;
  /** Said instead of everything else when there is nothing to show (the fold still follows it). */
  none: string | null;
  /** True when the team's words came back locked: the pane offers the unlock. */
  locked: boolean;
}

// ---- R20: the room's top, the short counts, the fold (mirror of shared `types/retroLean.ts`) ----

/** The retro's state in the top line's words. Mirrors shared `retroLean.ts` STATE_PHRASE. */
const STATE_PHRASE: Record<string, string> = {
  offered: 'offered',
  declined: 'not this time',
  preparing: 'getting ready',
  agenda: 'questions going up',
  discussing: 'open for answers',
  soaking: 'questions agreed',
  asking: 'handing out tasks',
  closed: 'finished',
  archived: 'archived',
};

/** `GET /retro` → `retro`, the fields the top line reads. */
export interface RetroTopFields {
  number: number;
  state: string;
  reflects?: { pushed?: number; members?: number } | null;
  agenda_when?: string | null;
  open_until?: string | null;
}

/** The page's top, one line. Mirrors shared `retroTopLine`. */
export function retroTopLine(retro: RetroTopFields): string {
  const parts = [`Retro ${retro.number}`, STATE_PHRASE[retro.state] ?? String(retro.state)];
  if (retro.state === 'preparing') {
    const pushed = retro.reflects?.pushed ?? 0;
    const members = retro.reflects?.members ?? 0;
    if (members > 0) parts.push(`${pushed} of ${members} shared`);
    if (retro.agenda_when?.trim()) parts.push(`questions up ${retro.agenda_when.trim()}`);
  }
  if (retro.state === 'discussing' && retro.open_until?.trim()) parts.push(`until ${retro.open_until.trim()}`); // worded to follow "until" (backend R21 addendum)
  return parts.join(' · ');
}

/** The fold's remembered state, per account. Mirrors shared `howThisWorksKey`. */
export function howThisWorksKey(accountId: string): string {
  return `myu-retro-how-seen:${accountId}`;
}

/** What became of a task since the last retro. Mirrors shared `outcomeWords`. */
export function outcomeWords(outcome: string | undefined): string {
  switch (outcome) {
    case 'kept':
      return 'done';
    case 'renegotiated':
      return 'given more time';
    case 'dropped':
      return 'dropped';
    case 'unowned':
      return 'nobody took it';
    case 'open':
      return 'still open';
    default:
      return (outcome ?? '').replace(/_/g, ' ');
  }
}

/** A task's standing: the backend's words first, plain ones when it sends none. Mirrors shared `todoStandingWords`. */
export function taskStanding(td: RetroTodoLite): string {
  const said = td.status_text?.trim();
  if (said) return said;
  if (td.state === 'unowned') return 'nobody took it';
  if (td.state === 'asking') return 'Myu is asking someone to take it';
  if (td.state === 'drafted' || !td.state) return 'not handed out yet';
  const who = td.owner?.name ? `taken by ${td.owner.name}` : 'taken';
  const status = td.status && td.status !== 'on_track' ? ` · ${td.status.replace(/_/g, ' ')}` : '';
  return `${who}${status}`;
}

function questionTitle(t: RetroThreadLite, index: number): string {
  const n = typeof t.position === 'number' && t.position > 0 ? t.position : index + 1;
  return `${SPACE_RETRO_WORDS.question} ${n}`;
}

function questionFrom(t: RetroThreadLite): string {
  return t.author_kind === 'team_myu' ? SPACE_MODE_WORDS.teamMyu : t.author?.name?.trim() || '';
}

/** What the pane shows of the team's retro, from one `GET /retro` read. */
export function retroView(read: RetroReadResult | null | undefined): RetroView {
  const threads = [...(read?.threads ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const retro = read?.retro;
  // One line, from the read's fields (R21: the backend sends no header).
  const top = retro?.number && retro.state ? retroTopLine({ number: retro.number, state: retro.state, reflects: retro.reflects, agenda_when: retro.agenda_when, open_until: retro.open_until }) : null;
  const how = read?.how_it_works?.trim() || null;
  const resultItems = (read?.pinned?.results?.items ?? [])
    .map((it) => {
      const what = (it.what ?? '').trim();
      if (!what) return '';
      const who = it.owner?.name ? ` (${it.owner.name})` : '';
      const outcome = outcomeWords(it.outcome);
      return outcome ? `${what}${who} — ${outcome}` : `${what}${who}`;
    })
    .filter((x) => x.length > 0);
  const resultsText = (read?.pinned?.results?.text ?? '').trim();
  const results = resultsText || resultItems.length ? { text: resultsText, items: resultItems } : null;

  let locked = false;
  const open = (text: string | undefined): string => {
    const t = (text ?? '').trim();
    if (isLockedText(t)) {
      locked = true;
      return '';
    }
    return t;
  };
  const questions: RetroQuestionView[] = threads.map((t, i) => {
    return {
      key: t.thread_id || `q${i}`,
      title: questionTitle(t, i),
      from: questionFrom(t),
      text: open(t.text),
      // R21: the server's sentence as sent; it carries its own short count ("… 1 of 4 done.", "0 of 4 voted.").
      state: (t.state_text ?? '').trim(),
      replies: (t.replies ?? [])
        .map((r) => ({ name: r.participant?.name?.trim() || '', text: open(r.text) }))
        .filter((r) => r.text.length > 0),
      summary: open(t.merged?.text) || null,
    };
  });
  const tasks = (read?.todos ?? [])
    .map((td) => ({ text: open(td.text), standing: taskStanding(td) }))
    .filter((td) => td.text.length > 0);

  const nothing = !top && questions.length === 0 && tasks.length === 0 && !results;
  return { top, how, results, questions, tasks, none: nothing ? SPACE_RETRO_WORDS.none : null, locked };
}

// ---- the panel's own small state ---------------------------------------------

export interface RetroPanelScreen {
  open: boolean;
  loading: boolean;
  failed: boolean;
  view: RetroView | null;
  /** R20: "How this works" is open: the first time this account sees a retro page, closed after. */
  howOpen: boolean;
}

/** R20: the fold's memory, per account (`howThisWorksKey`), kept in the plugin's own data. */
export interface HowSeenStore {
  seen(): boolean;
  markSeen(): void;
}

/**
 * The team's retro, the second tab of a space's pane: not read until the tab is chosen, read
 * when it is, read again when the space changes while it is showing. No host calls.
 */
export class SpaceRetroPanel {
  private open = false;
  private loading = false;
  private failed = false;
  private view: RetroView | null = null;
  private howOpen: boolean | null = null;
  private seq = 0;

  constructor(
    readonly spaceId: string,
    private deps: { backend: Pick<AskMyuApi, 'getRetro'>; onChange: () => void; howSeen?: HowSeenStore },
  ) {}

  screen(): RetroPanelScreen {
    return { open: this.open, loading: this.loading, failed: this.failed, view: this.view, howOpen: this.howOpen === true };
  }

  /** Open it (and read), or close it. */
  async toggle(): Promise<void> {
    this.open = !this.open;
    if (!this.open) {
      this.deps.onChange();
      return;
    }
    await this.read();
  }

  /** Show the retro tab, if it is not showing already. */
  async show(): Promise<void> {
    if (!this.open) await this.toggle();
  }

  /** Back to the conversation. */
  hide(): void {
    if (!this.open) return;
    this.open = false;
    this.deps.onChange();
  }

  /** "How this works ▸": open or close the fold. */
  toggleHow(): void {
    this.howOpen = !this.howOpen;
    this.deps.onChange();
  }

  /** The space changed (a reply, a vote, an unlock): read again, only while it is showing. */
  async refresh(): Promise<void> {
    if (this.open) await this.read();
  }

  private async read(): Promise<void> {
    const mine = ++this.seq;
    this.loading = this.view === null;
    this.failed = false;
    this.deps.onChange();
    const res = await this.deps.backend.getRetro(this.spaceId).catch(() => null);
    if (mine !== this.seq) return;
    this.loading = false;
    if (res?.ok && res.data) {
      this.view = retroView(res.data);
      // The fold opens the first time this account sees the rules, and is closed from then on.
      if (this.howOpen === null && this.view.how) {
        const seen = this.deps.howSeen?.seen() ?? false;
        this.howOpen = !seen;
        if (!seen) this.deps.howSeen?.markSeen();
      }
    } else this.failed = true;
    this.deps.onChange();
  }
}
