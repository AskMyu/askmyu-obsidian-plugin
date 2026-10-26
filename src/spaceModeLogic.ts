/**
 * Space mode (R14) — what goes where in a space's conversation. The plugin's own copy.
 *
 * The web column, the phone sheet, the side panel and the terminal take these decisions
 * from `@askmyu/shared` (`types/spaceMode.ts`, `types/retroWords.ts`). The plugin may not:
 * its boundary rule allows TYPES from shared and never runtime code, because the public
 * mirror has no workspace to resolve it against. So the same decisions live here, typed
 * against the vendored wire shapes, and `tests/internal/spaceModeParity.test.ts`
 * (monorepo-only) runs both over the same fixtures and fails when they differ.
 *
 * Every sentence on screen is the backend's. The words below are the few the pane owns;
 * each reads plainly to someone who never used a work tool.
 */

import type { SpaceAnswerReply, SpaceAsk, SpaceChoice, SpaceConversationRead, SpaceEffect, SpacePrepMine, SpaceTurn, SpaceTurnReply } from './wire';

export const SPACE_MODE_WORDS = {
  /** From the moment a typed message leaves until Myu's answer lands. */
  reading: 'Myu is reading…',
  /** The quiet lead over the hints under the box. */
  hintsLead: 'If it helps:',
  /** The quiet line above the history that loads what came before this retro. */
  earlier: 'Earlier ▸',
  /** Said in its place once there is nothing before it. */
  nothingEarlier: 'Nothing earlier.',
  /** The box when the backend sends no placeholder. */
  placeholder: 'Write to Myu…',
  /** A team post written by the team's Myu. */
  teamMyu: 'Myu, for the team',
  unlock: 'Unlock this space',
  unlocking: 'Unlocking…',
  unlockFailed: 'This space could not be unlocked here. Sign out and sign in again, then come back.',
  /** A session that may only read (403 `scope_required`). */
  agentRefused: "This session can read the retro's state, not act in it.",
} as const;

export const LOCKED_TEXT = '[Encrypted content - unlock required]';
export function isLockedText(text: string | null | undefined): boolean {
  return text === LOCKED_TEXT || text === 'locked';
}

/** What Myu says back to a button: a filled `readback` effect wins over a template still carrying `{placeholders}`. */
export function readbackText(res: SpaceAnswerReply | null | undefined): string | null {
  if (!res) return null;
  const eff = res.effects?.find((e) => e.type === 'readback' && typeof e.text === 'string');
  const effText = typeof eff?.text === 'string' ? eff.text : undefined;
  const text = effText ?? res.readback?.text ?? null;
  const filled = (t: string | null | undefined) => !!t && !/\{[a-z_]+\}/.test(t);
  return filled(text) ? text : filled(res.readback?.text) ? (res.readback?.text ?? null) : text;
}

export function isSpaceMode(conv: Pick<SpaceConversationRead, 'mode'> | null | undefined): boolean {
  return conv?.mode === 'space';
}

// ---- what the conversation shows ------------------------------------------------

export interface SpaceModeAsk {
  line_id: string;
  /** The ask itself, for answering it. */
  line: SpaceAsk;
  text: string;
  choices: SpaceChoice[];
  /** The quiet way out ("Leave it"), beside three real choices. */
  quiet: SpaceChoice | null;
}

export interface SpaceModeView {
  box: { placeholder: string; hints: string[]; hintsLead: string };
  /** Where things stand right now (`stage.first_line` of THIS read): a quiet strip under the title. Always current, never a turn. */
  status: string | null;
  /** The history without the one ask. A tell stays where it was said. */
  turns: SpaceTurn[];
  /** The ONE ask that is up, drawn after the history. Only ever an ASK, never a tell. */
  ask: SpaceModeAsk | null;
  earlier: boolean;
}

/** A talk's version sends four choices: three real ones and "Leave it", which reads as a quiet link. */
export function layoutChoices(choices: SpaceChoice[] | undefined): { choices: SpaceChoice[]; quiet: SpaceChoice | null } {
  const all = choices ?? [];
  if (all.length >= 4) {
    const leave = all.find((c) => c.id === 'leave');
    if (leave) return { choices: all.filter((c) => c !== leave), quiet: leave };
  }
  return { choices: all, quiet: null };
}

/** An ask wants an answer. A tell and a waiting note do not. (Mirror of shared `isAsk`.) */
export function isAsk(line: Pick<SpaceAsk, 'ask_kind'> | null | undefined): boolean {
  return !!line && line.ask_kind !== 'tell' && line.ask_kind !== 'wait';
}

/**
 * What a space's conversation shows (mirror of shared `spaceModeView`).
 *
 * One ask at a time. More than one can be open underneath (a "Take this back?" confirm beside the
 * "Anything else?" it interrupted), and the backend's `open_line` is the oldest. The ask shown is
 * the one Myu said LAST: `focusLineId` (the `line_id` a typed message came back with) while it is
 * open, else the open ask made most recently (`created_at`), else `open_line`. `open_lines` is
 * only ever used to pick that one; it is never shown as a list.
 *
 * Only an ASK is ever drawn after the history. An open TELL lives where it was said, as its own
 * turn. A turn belongs to a line by `line_id`, never by its text.
 */
export function spaceModeView(conv: SpaceConversationRead, focusLineId?: string | null): SpaceModeView {
  const history = conv.history ?? [];
  // R18b: an ask held behind the open one waits its turn; it is never the one ask.
  const waiting = (l: SpaceAsk | null | undefined) => l?.state === 'held';
  const candidates: SpaceAsk[] = (conv.open_lines ?? []).filter((l) => isAsk(l) && !waiting(l));
  const backendOpen = isAsk(conv.open_line) && !waiting(conv.open_line) ? conv.open_line : undefined;
  if (backendOpen && !candidates.some((l) => l.line_id === backendOpen.line_id)) candidates.push(backendOpen);
  let open: SpaceAsk | undefined = focusLineId ? candidates.find((l) => l.line_id === focusLineId) : undefined;
  if (!open && candidates.length > 0) {
    // Not every ask has a turn in `history` (a confirm may have none), so the history cannot
    // decide it: the open ask made most recently is the one Myu said last. On a tie the
    // backend's own `open_line` stands.
    const made = (l: SpaceAsk) => {
      const at = new Date(l.created_at ?? '').getTime();
      return Number.isNaN(at) ? 0 : at;
    };
    open = candidates.reduce((best, l) => (made(l) > made(best) ? l : best), backendOpen ?? candidates[0]);
  }
  // The ask's own turn, by line id (the last one that is unanswered and not a readback).
  let askTurnIndex = -1;
  if (open) {
    for (let i = history.length - 1; i >= 0; i--) {
      const t = history[i];
      if (t && t.from === 'myu' && !t.readback && !t.answered && t.line_id === open.line_id) {
        askTurnIndex = i;
        break;
      }
    }
  }
  const turns = askTurnIndex >= 0 ? history.filter((_, i) => i !== askTurnIndex) : history.slice();
  const laid = layoutChoices(open?.choices);
  const ask: SpaceModeAsk | null = open ? { line_id: open.line_id, line: open, text: open.text, choices: laid.choices, quiet: laid.quiet } : null;

  const stage = conv.stage?.first_line?.trim() || null;
  const status = stage && !(ask && ask.text.trim() === stage) ? stage : null;

  return {
    box: {
      placeholder: conv.input?.placeholder?.trim() || SPACE_MODE_WORDS.placeholder,
      hints: (conv.input?.hints ?? []).filter((h) => typeof h === 'string' && h.trim().length > 0),
      hintsLead: SPACE_MODE_WORDS.hintsLead,
    },
    status,
    turns,
    ask,
    earlier: !!conv.history_from && conv.has_earlier !== false,
  };
}

// ---- the share readback ---------------------------------------------------------

export interface ReadbackParts {
  lead: string[];
  bullets: string[];
  closing: string[];
  /** Any line after the closing one: shown in the quiet warning style. */
  warning: string[];
}

/** A text with "• " lines, split for display; null when it has none and prints as it came. */
export function readbackParts(text: string | undefined | null): ReadbackParts | null {
  if (!text) return null;
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  const isBullet = (l: string) => l.startsWith('•');
  const firstBullet = lines.findIndex(isBullet);
  if (firstBullet < 0) return null;
  let lastBullet = firstBullet;
  for (let i = firstBullet; i < lines.length; i++) if (isBullet(lines[i] ?? '')) lastBullet = i;
  const after = lines.slice(lastBullet + 1);
  return {
    lead: lines.slice(0, firstBullet),
    bullets: lines.slice(firstBullet, lastBullet + 1).filter(isBullet).map((l) => l.replace(/^•\s*/, '')),
    closing: after.slice(0, 1),
    warning: after.slice(1),
  };
}

// ---- after a typed message, and after a button ----------------------------------

export type SpaceModeStep =
  | { do: 'reload'; focus_line_id?: string }
  | { do: 'say'; text: string }
  | { do: 'open_journal'; text: string }
  | { do: 'unlock_space' }
  | { do: 'open_onboarding'; step: 'linkedin' | 'resume' }
  | { do: 'focus_box' }
  | { do: 'refused_scope'; text: string };

export function effectSteps(effects: SpaceEffect[] | undefined | null): SpaceModeStep[] {
  const out: SpaceModeStep[] = [];
  for (const e of effects ?? []) {
    if (e.type === 'open_journal') out.push({ do: 'open_journal', text: typeof e.text === 'string' ? e.text : '' });
    else if (e.type === 'consent_needed' && e.provider === 'space') out.push({ do: 'unlock_space' });
    else if (e.type === 'open_onboarding' && (e.step === 'linkedin' || e.step === 'resume')) out.push({ do: 'open_onboarding', step: e.step });
  }
  return out;
}

/** What to do with the answer to a typed message, in order. */
export function afterTyped(res: SpaceTurnReply | null | undefined): SpaceModeStep[] {
  if (!res) return [{ do: 'reload' }];
  if (res.error === 'scope_required' || res.scope_required) return [{ do: 'refused_scope', text: SPACE_MODE_WORDS.agentRefused }];
  const steps: SpaceModeStep[] = [];
  const handled = res.space_mode?.handled;
  const content = typeof res.content === 'string' ? res.content.trim() : '';
  if (handled === 'confirm' || handled === 'clarify') {
    steps.push({ do: 'reload', focus_line_id: res.space_mode?.line_id });
  } else {
    if (content) steps.push({ do: 'say', text: content });
    steps.push({ do: 'reload' });
  }
  steps.push(...effectSteps(res.effects));
  return steps;
}

/** After a button: the effects, and "Change it" / "Change something" puts the cursor back in the box. */
export function afterChoice(choiceId: string | undefined, effects: SpaceEffect[] | undefined | null): SpaceModeStep[] {
  const steps: SpaceModeStep[] = [...effectSteps(effects)];
  if (choiceId === 'change') steps.push({ do: 'focus_box' });
  return steps;
}

/** A team post's label: "Myu, for the team" for the team's Myu; a person's name otherwise. */
export function authorLabel(kind: string | undefined | null, name?: string | null): string | null {
  if (kind === 'team_myu') return SPACE_MODE_WORDS.teamMyu;
  return name?.trim() || null;
}

// ---- the door -------------------------------------------------------------------

/**
 * The door's words, from the step of my getting-ready (`GET /retro/prep/mine`). There is no count:
 * Myu asks one thing at a time. Every state still opens the conversation.
 */
export function spaceDoorWords(mine: SpacePrepMine | null | undefined): { kind: 'asking' | 'share' | 'shared' | 'ask'; text: string; door: boolean } {
  const asking = { kind: 'asking' as const, text: 'Myu is asking what you want to bring up ▸', door: true };
  const share = { kind: 'share' as const, text: 'Ready to share with the team ▸', door: true };
  const shared = { kind: 'shared' as const, text: 'Shared. Myu will tell you when the questions are up.', door: false };
  const ask = { kind: 'ask' as const, text: 'Ask Myu about this space ▸', door: true };
  if (!mine) return ask;
  switch (mine.step) {
    case 'open':
    case 'words':
    case 'suggestions':
    case 'capacity':
      return asking;
    case 'readback':
      return share;
    case 'shared':
      return shared;
    case 'list':
      return ask;
    default:
      break;
  }
  // A stack that does not send `step` yet: the same states from the fields it does send.
  if (mine.share_line_open) return share;
  if (mine.shared) return shared;
  if ((mine.open_asks ?? 0) > 0) return asking;
  return ask;
}
