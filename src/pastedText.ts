/**
 * Pasted text (2026-10-06): a long paste goes beside the typed words as its own block, and is never cut.
 *
 * One paste or drop of PASTE_CHIP_MIN_CHARS characters or PASTE_CHIP_MIN_LINES lines becomes a chip above the box
 * instead of typed text, and goes as `pasted_blocks` beside `content` (the typed words). "Ask Myu about this note"
 * and "…this selection" send the note or the selection the same way, as a `vault_note` / `vault_selection` block,
 * with nothing typed on the person's behalf. A server that answers without counting the blocks it received
 * (`pasted_blocks_received`) did not keep them, and the box gets the chips back (pastedTextLost).
 *
 * The web, the phone and the terminal take the constants, the words and the helpers from `@askmyu/shared`
 * (`types/chatSend.ts`). The plugin may not: only TYPES cross its boundary, because the public mirror has no
 * workspace to resolve shared code against. So the ones the composers use are copied here, and
 * `tests/internal/pastedTextParity.test.ts` (monorepo-only) holds them to shared's. The vault labels at the end are
 * the plugin's own.
 */

import type { PastedBlockRef, PastedBlockWire, PastedSource } from './wire';

// ── the copies (shared `types/chatSend.ts`) ──────────────────────────────────

/** The typed text's limit; here only for Put back, which must not take the typed text over it. */
export const CHAT_MESSAGE_MAX_CHARS = 10000;
export const PASTE_CHIP_MIN_CHARS = 1000;
export const PASTE_CHIP_MIN_LINES = 15;
export const PASTED_BLOCK_MAX_CHARS = 50000;
export const PASTED_BLOCKS_MAX = 5;
export const PASTED_TEXT_TOO_LONG = 'pasted_text_too_long';
export const PASTED_BLOCKS_RECEIVED = 'pasted_blocks_received';

/** Where a block came from. The server accepts only these and returns only these. */
export const PASTED_SOURCES: readonly PastedSource[] = ['paste', 'drop', 'burst', 'vault_note', 'vault_selection'];

/** 1240 → "1,240". */
export function formatCount(n: number): string {
  return String(Math.max(0, Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Shared's MESSAGE_CONTROL (`/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g`), by character code: the control characters a
 * message never holds are dropped; tab and the line breaks stay. (The plugin's lint refuses control characters in a
 * regular expression.)
 */
function dropControls(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 0x7f || (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d)) continue;
    out += text[i];
  }
  return out;
}

/** Leading lines that hold only spaces or tabs (any whitespace but a line break). */
const LEADING_BLANK_LINES = /^(?:[^\S\n]*\n)+/;

/**
 * Pasted text as it is counted and sent: CRLF and CR become LF, control characters other than tab and line break
 * are dropped, whitespace-only lines at the start are removed, and trailing whitespace is removed. Nothing else is
 * changed (indentation and inner blank lines stay).
 */
export function pastedText(raw: string): string {
  if (typeof raw !== 'string') return '';
  return dropControls(raw.replace(/\r\n?/g, '\n')).replace(LEADING_BLANK_LINES, '').trimEnd();
}

/** Lines in a text: none when it is empty, else one more than its line breaks. */
export function countLines(text: string): number {
  if (!text) return 0;
  let lines = 1;
  for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) lines++;
  return lines;
}

/** One paste or drop this long becomes a chip; shorter stays inline as typed text. */
export function shouldChip(raw: string): boolean {
  const text = pastedText(raw);
  return text.length >= PASTE_CHIP_MIN_CHARS || countLines(text) >= PASTE_CHIP_MIN_LINES;
}

export function makePastedBlock(raw: string, source: PastedSource, id: string, ref?: PastedBlockRef): PastedBlockWire {
  const text = pastedText(raw);
  return { id, text, chars: text.length, lines: countLines(text), source, ...(ref ? { ref } : {}) };
}

/** The next id: `p` and one more than the largest number ending any id here (`p1` for none). */
export function nextPastedBlockId(blocks: readonly PastedBlockWire[]): string {
  let max = 0;
  for (const block of blocks) {
    const m = /(\d+)$/.exec(block.id);
    const n = m ? Number(m[1]) : 0;
    if (Number.isSafeInteger(n) && n > max) max = n;
  }
  return `p${max + 1}`;
}

const PREVIEW_MAX = 40;

/** A chip's preview: the first non-blank line with its spaces collapsed, up to `max` characters and then "…". */
export function pastedPreview(text: string, max: number = PREVIEW_MAX): string {
  const line = (typeof text === 'string' ? text.split('\n') : []).find((l) => l.trim()) ?? '';
  const flat = line.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  let cut = flat.slice(0, max);
  if (/[\uD800-\uDBFF]$/.test(cut)) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

/** Put back: the block's text at the end of the typed text, after a blank line when there is typed text. */
export function putBackText(typed: string, block: PastedBlockWire): string {
  const before = typeof typed === 'string' ? typed.trimEnd() : '';
  return before.trim() ? `${before}\n\n${block.text}` : block.text;
}

/** Whether putting a block back keeps the typed text within the message limit, and the length it would be. */
export function canPutBack(typed: string, block: PastedBlockWire): { ok: boolean; length: number } {
  // Shared `chatLength`: the trimmed length against the typed limit.
  const length = putBackText(typed, block).trim().length;
  return { ok: !(length > CHAT_MESSAGE_MAX_CHARS), length };
}

export type PastedProblem = { code: 'too_long'; n?: number; chars: number } | { code: 'too_many'; count: number };

/**
 * Why these blocks cannot go, with the words to show (the server's words for the same refusal), or null. More than
 * PASTED_BLOCKS_MAX blocks, or a block over PASTED_BLOCK_MAX_CHARS (the first one; numbered only when there are
 * several). Send waits while there is a problem.
 */
export function pastedBlocksProblem(blocks: readonly PastedBlockWire[]): { problem: PastedProblem; words: string } | null {
  if (blocks.length > PASTED_BLOCKS_MAX) {
    return { problem: { code: 'too_many', count: blocks.length }, words: PASTE_WORDS.tooMany(blocks.length) };
  }
  for (let i = 0; i < blocks.length; i++) {
    const chars = blocks[i].text.length;
    if (chars > PASTED_BLOCK_MAX_CHARS) {
      const n = blocks.length > 1 ? i + 1 : undefined;
      return { problem: { code: 'too_long', ...(n ? { n } : {}), chars }, words: PASTE_WORDS.blockTooLong(chars, n) };
    }
  }
  return null;
}

/**
 * After a 2xx answer to a send that carried `sent` blocks: true when the server did not count them all as received
 * (a server without pasted text drops the field and answers the typed words). The composer then puts the chips back
 * with PASTE_WORDS.lost; the typed words were saved and answered.
 */
export function pastedTextLost(sent: number, body: unknown): boolean {
  const received = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>)[PASTED_BLOCKS_RECEIVED] : undefined;
  return sent > 0 && received !== sent;
}

const VAULT_SOURCES: readonly PastedSource[] = ['vault_note', 'vault_selection'];

function pastedRefOf(raw: unknown): PastedBlockRef | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const { path, line_from, line_to } = raw as Record<string, unknown>;
  if (typeof path !== 'string' || typeof line_from !== 'number' || typeof line_to !== 'number') return null;
  return { path, line_from, line_to };
}

/**
 * The blocks on a stored turn as the server returned them (shared `pastedBlocksOf`), read tolerantly: rows with
 * non-blank text only, counts recomputed from the text, an unknown source read as `paste`, a missing id as
 * `p<position>`. Anything that is not an array reads as no blocks.
 */
export function readPastedBlocks(raw: unknown): PastedBlockWire[] {
  if (!Array.isArray(raw)) return [];
  const blocks: PastedBlockWire[] = [];
  raw.forEach((row: unknown, i: number) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return;
    const r = row as Record<string, unknown>;
    const text = r.text;
    if (typeof text !== 'string' || !text.trim()) return;
    const source = (PASTED_SOURCES as readonly unknown[]).includes(r.source) ? (r.source as PastedSource) : 'paste';
    const ref = VAULT_SOURCES.includes(source) ? pastedRefOf(r.ref) : null;
    blocks.push({
      id: typeof r.id === 'string' && r.id ? r.id : `p${i + 1}`,
      text,
      chars: text.length,
      lines: countLines(text),
      source,
      ...(ref ? { ref } : {}),
    });
  });
  return blocks;
}

/** "Pasted text", or "Pasted text 2" when the message has several and this is the second. */
const pastedLabel = (n?: number): string => (n === undefined ? 'Pasted text' : `Pasted text ${n}`);

/** Shared `PASTE_WORDS`, the entries the plugin shows. */
export const PASTE_WORDS = {
  /** A chip: "Pasted text 2 · 1,240 chars · 18 lines" ("1 line"). */
  chip: (chars: number, lines: number, n?: number): string =>
    `${pastedLabel(n)} · ${formatCount(chars)} chars · ${formatCount(lines)} ${lines === 1 ? 'line' : 'lines'}`,
  /** A sent turn's collapsed card: "Pasted text · 1,240 chars". */
  card: (chars: number, n?: number): string => `${pastedLabel(n)} · ${formatCount(chars)} chars`,
  /** Under the box after a paste became a chip, followed by an Undo button. */
  hint: 'Added as pasted text',
  undo: 'Undo',
  remove: 'Remove',
  putBack: 'Put back in message',
  /** Read out once when a paste becomes a chip. */
  announce: (chars: number): string =>
    `Pasted text added as an attachment, ${formatCount(chars)} characters. Undo available.`,
  /** The × on a chip: "Remove pasted text 2". */
  removeLabel: (n?: number): string => (n === undefined ? 'Remove pasted text' : `Remove pasted text ${n}`),
  /** Why Put back is held: the typed text would go over the message limit. */
  putBackTooLong: (length: number, max: number = CHAT_MESSAGE_MAX_CHARS): string =>
    `Putting this back would make the message ${formatCount(length)} characters, and a message can be up to ${formatCount(max)}.`,
  /** One block over the limit: the server's words for the same refusal. */
  blockTooLong: (chars: number, n?: number, max: number = PASTED_BLOCK_MAX_CHARS): string =>
    `${pastedLabel(n)} is ${formatCount(chars)} characters, and pasted text can be up to ${formatCount(max)} characters.`,
  /** Too many blocks: the server's words for the same refusal. */
  tooMany: (count: number, max: number = PASTED_BLOCKS_MAX): string =>
    `This message has ${formatCount(count)} pasted texts, and a message can carry up to ${formatCount(max)}.`,
  /** pastedTextLost: the chips are back in the box. */
  lost: "The pasted text didn't reach Myu. It's back in the box; send it again.",
} as const;

// ── the vault's own ──────────────────────────────────────────────────────────

/** A note's name as the file explorer shows it: the last part of its path, without `.md`. */
function noteName(path: string): string {
  const last = path.split('/').pop() ?? path;
  return last.replace(/\.md$/i, '');
}

/**
 * A vault block's words: "Note: Plan · 1,240 chars · 18 lines" for a note, "Selection from Plan · lines 12–30 ·
 * 1,240 chars" for a selection. Null for any other block, and for a vault block that does not say where it is from.
 */
export function vaultLabel(block: PastedBlockWire): string | null {
  const ref = block.ref;
  if (!ref?.path) return null;
  if (block.source === 'vault_note') {
    return `Note: ${noteName(ref.path)} · ${formatCount(block.chars)} chars · ${formatCount(block.lines)} ${block.lines === 1 ? 'line' : 'lines'}`;
  }
  if (block.source === 'vault_selection') {
    return `Selection from ${noteName(ref.path)} · lines ${ref.line_from}–${ref.line_to} · ${formatCount(block.chars)} chars`;
  }
  return null;
}

/** A chip's words: the vault label for a note or a selection, else "Pasted text 2 · 1,240 chars · 18 lines". */
export function chipLabel(block: PastedBlockWire, n?: number): string {
  return vaultLabel(block) ?? PASTE_WORDS.chip(block.chars, block.lines, n);
}

/** A sent turn's card, and a saved note's callout: the vault label, else "Pasted text 2 · 1,240 chars". */
export function cardLabel(block: PastedBlockWire, n?: number): string {
  return vaultLabel(block) ?? PASTE_WORDS.card(block.chars, n);
}

// The box's chips: what a paste, an Undo and a lost send do to them (the four composers share these).

/** The last paste that became a chip, while Undo can put it back inline at `at`. */
export interface PasteUndo {
  id: string;
  at: number;
}

/** A paste became a chip: the chips with it last, the chip, and the undo that puts it back inline at `at`. */
export function chipAdded(chips: readonly PastedBlockWire[], text: string, source: 'paste' | 'drop', at: number): { chips: PastedBlockWire[]; chip: PastedBlockWire; undo: PasteUndo } {
  const chip = makePastedBlock(text, source, nextPastedBlockId(chips));
  return { chips: [...chips, chip], chip, undo: { id: chip.id, at } };
}

/** Undo: the chip's text back in the box at its offset, the caret after it, the chip gone. Null once the chip is gone. */
export function undoChip(value: string, chips: readonly PastedBlockWire[], undo: PasteUndo): { value: string; caret: number; chips: PastedBlockWire[] } | null {
  const chip = chips.find((c) => c.id === undo.id);
  if (!chip) return null;
  const at = Math.min(Math.max(0, undo.at), value.length);
  return { value: value.slice(0, at) + chip.text + value.slice(at), caret: at + chip.text.length, chips: chips.filter((c) => c !== chip) };
}

/** Chips put back in the box after a send (pastedTextLost): ahead of any added since, numbered afresh. */
export function chipsBack(back: readonly PastedBlockWire[], current: readonly PastedBlockWire[]): PastedBlockWire[] {
  return [...back, ...current].map((chip, i) => ({ ...chip, id: `p${i + 1}` }));
}

/**
 * "Ask Myu about this note": the whole note as one `vault_note` block, from line 1 to its last line with text.
 * Null for a note with nothing in it.
 */
export function noteBlock(raw: string, path: string): PastedBlockWire | null {
  const lineTo = Math.max(1, countLines(raw.replace(/\r\n?/g, '\n').trimEnd()));
  const block = makePastedBlock(raw, 'vault_note', 'p1', { path, line_from: 1, line_to: lineTo });
  return block.text ? block : null;
}

/**
 * "Ask Myu about this selection": the selection as one `vault_selection` block, with the note's path and its lines
 * 1-based (the editor's cursors count from 0). A selection outside a note goes without them.
 */
export function selectionBlock(selection: string, path: string | null | undefined, from: { line: number }, to: { line: number }): PastedBlockWire {
  return makePastedBlock(selection, 'vault_selection', 'p1', path ? { path, line_from: from.line + 1, line_to: to.line + 1 } : undefined);
}
