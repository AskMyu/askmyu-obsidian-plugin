// conversation.txt, the transcript a feedback report attaches (pasted text, 2026-10-06): a copy of shared
// `formatConversationTranscript` (`types/feedbackTranscript.ts`), which the web and the phone use. The plugin may take
// only TYPES from `@askmyu/shared`, so the formatter is copied here and `tests/internal/pastedTextParity.test.ts`
// (monorepo-only) holds its output to shared's on the shared fixture.
//
// Both readers (the feedback tool's parser and the server's readable renderer) start a turn only at a column-0 header
// with a date, `[<chatter> <timestamp>]`, and a section only at a column-0 `--- Name ---` line. So what a person wrote
// is indented: typed continuation lines and entry lines by two spaces, and each pasted block as an indented header
// `  [pasted text 1 · 1,240 chars · 18 lines · paste]` followed by `  | ` lines. Myu's turns are written as before:
// their text, not indented.
//
// The server keeps the first 2,097,152 characters of an attachment. Past `maxChars`, the oldest blocks are shortened
// to their first 2,000 characters, with a line saying so, until the text fits; typed words and Myu's turns never are.

import { countLines, formatCount } from './pastedText';
import type { PastedBlockWire as PastedBlock } from './wire';

export interface TranscriptTurn {
  /** `agent` for Myu, else who wrote it (an account id). */
  chatter: string;
  /** ISO time; a turn without one is written with `now()`, since both readers need a date to see a turn. */
  ts: string;
  /** The typed words as the caller has them (storedAsTyped where it is used today); Myu's JSON for an agent turn. */
  typed: string;
  blocks?: readonly PastedBlock[];
}

const DEFAULT_MAX_CHARS = 2_000_000;
const SHORTENED_TO = 2000;
const INDENT = '  ';
const AGENT = 'agent';

function blockHeader(n: number, block: PastedBlock): string {
  const lines = countLines(block.text);
  return `${INDENT}[pasted text ${n} · ${formatCount(block.text.length)} chars · ${formatCount(lines)} ${lines === 1 ? 'line' : 'lines'} · ${block.source}]`;
}

/** A block's text, one `  | ` line per line (`  |` for an empty one). Never decoded or escaped. */
function blockBody(text: string): string {
  return text
    .split('\n')
    .map((line) => (line ? `${INDENT}| ${line}` : `${INDENT}|`))
    .join('\n');
}

/** Rows read from the server are cast, not checked: a missing text reads as none, so a report never fails here. */
const textOf = (value: unknown): string => (typeof value === 'string' ? value : '');

function shortenedBody(text: string): string {
  return `${blockBody(text.slice(0, SHORTENED_TO))}\n${INDENT}| [pasted text shortened for this attachment: ${formatCount(SHORTENED_TO)} of ${formatCount(text.length)} chars]`;
}

/**
 * The journal entry and its conversation as conversation.txt. The chat section is left out when there are no chats;
 * without an entry the text starts at `--- Journal Chat ---`. `maxChars` defaults to 2,000,000 and `now` to the
 * current ISO time.
 */
export function formatConversationTranscript(
  input: {
    entry?: { id: string; ts: string; typed: string; blocks?: readonly PastedBlock[] };
    chats: readonly TranscriptTurn[];
  },
  opts?: { maxChars?: number; now?: () => string },
): string {
  const maxChars = opts?.maxChars ?? DEFAULT_MAX_CHARS;
  const now = opts?.now ?? (() => new Date().toISOString());
  // Joined with line breaks at the end. Each block's body is one part, so it can be shortened in place; `bodies`
  // lists them oldest first.
  const parts: string[] = [];
  const bodies: Array<{ at: number; text: string }> = [];
  const pushBlocks = (blocks: readonly PastedBlock[] | undefined): void => {
    (blocks ?? []).forEach((block, i) => {
      parts.push(blockHeader(i + 1, block));
      bodies.push({ at: parts.length, text: block.text });
      parts.push(blockBody(block.text));
    });
  };

  const { entry, chats } = input;
  if (entry) {
    parts.push('--- Journal Entry ---', `ID: ${entry.id}`, `Timestamp: ${entry.ts}`, '');
    const typed = textOf(entry.typed);
    if (typed.trim()) {
      for (const line of typed.split('\n')) parts.push(INDENT + line);
    } else if (!entry.blocks?.length) {
      parts.push(`${INDENT}(empty content)`);
    }
    pushBlocks(entry.blocks);
  }
  if (chats.length > 0) {
    if (entry) parts.push('');
    parts.push('--- Journal Chat ---');
    for (const turn of chats) {
      const typed = textOf(turn.typed);
      const lines = typed.trim() ? typed.split('\n') : [];
      const first = lines.shift() ?? '';
      parts.push(`[${turn.chatter} ${turn.ts || now()}]${first ? ` ${first}` : ''}`);
      const agent = turn.chatter === AGENT;
      for (const line of lines) parts.push(agent ? line : INDENT + line);
      pushBlocks(turn.blocks);
    }
  }

  let total = parts.reduce((sum, part) => sum + part.length, 0) + Math.max(0, parts.length - 1);
  for (const body of bodies) {
    if (total <= maxChars) break;
    if (body.text.length <= SHORTENED_TO) continue;
    const shortened = shortenedBody(body.text);
    // Just over 2,000 characters, the marker line would make it longer.
    if (shortened.length >= parts[body.at].length) continue;
    total -= parts[body.at].length - shortened.length;
    parts[body.at] = shortened;
  }
  return parts.join('\n');
}
