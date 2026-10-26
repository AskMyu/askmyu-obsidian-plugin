// Files on a feedback report (2026-10-14, the operator's decision): a person can add any file from their own device
// (a screenshot they took, a PDF, a recording), and the web's "picture of this page" is taken when its chip is pressed
// and shown before it goes. Files travel by email only, as the page picture does; nothing of them is kept anywhere
// else. One rule for every surface: the web's window, the phone-width web, the phone, the Obsidian plugin (its copy of
// this file is held equal by a test).
//
// The caps: 10 MB a file, 15 MB in all, 5 files. The email carrying them may be 30 MB after encoding (SendGrid), and
// it also carries the page picture (under 2.5 MB) and the transcript, so 15 MB of files is the room there is. The
// server refuses more with 413 `attachment_too_large`.
//
// On the wire, `attachments.files: [{name, content_type, size_bytes, base64}]` on `POST /feedback/submit`. The server
// answers `files_attached: <n>`; a server from before this (or one that dropped them) answers none, and the surface
// says the files did not go (`filesWentThrough`). The refusals in words: `fileRefusalWords`.

export const FEEDBACK_FILE_MAX_BYTES = 10 * 1024 * 1024;
export const FEEDBACK_FILES_TOTAL_MAX_BYTES = 15 * 1024 * 1024;
export const FEEDBACK_FILES_MAX = 5;

/** A file as it goes on the report. */
export interface FeedbackFile {
  name: string;
  content_type: string;
  size_bytes: number;
  /** The file's bytes, base64, no data-URL prefix. */
  base64: string;
}

/** A file as the person picked it, before it is read: enough to decide whether it can go. */
export interface FeedbackFilePick {
  name: string;
  size: number;
  type?: string | null;
}

export type FeedbackFileRefusal = 'too_big' | 'too_much' | 'too_many' | 'already';

export const FEEDBACK_FILE_WORDS = {
  addFile: 'Add a file',
  /** The chip before the picture is taken, and the preview's name after. */
  pagePicture: 'Picture of this page',
  takingPicture: 'Taking the picture…',
  takeAgain: 'Take it again',
  remove: 'Remove',
  removeFile: (name: string) => `Remove ${name}`,
  /** Under the attach row. */
  caps: 'Any file, up to 10 MB each and 15 MB in all.',
  byEmail: 'Everything you attach goes by email to feedback@askmyu.com.',
  pictureFailed: 'The picture didn’t come out. Try again, or send without it.',
  /** The message went; the server took no files (one from before files). */
  filesNotTaken: 'Your message was sent, but the files didn’t go through.',
  /** 413 from the server. */
  tooBigToSend: 'That’s too much to send at once. Try fewer or smaller files.',
  /** A kept file that could not be read as the report went: named, and left out. */
  couldNotRead: (names: readonly string[]): string => {
    const list = names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
    return `Couldn’t read ${list}, so ${names.length === 1 ? 'it isn’t' : 'they aren’t'} going.`;
  },
} as const;

const MB = 1024 * 1024;
const mb = (bytes: number): string => `${Math.round(bytes / MB)} MB`;

/** "1.2 MB", "840 KB", "12 bytes". */
export function fileSizeWords(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes >= MB) return `${(bytes / MB).toFixed(1).replace(/\.0$/, '')} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} byte${bytes === 1 ? '' : 's'}`;
}

const BY_EXTENSION: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic', svg: 'image/svg+xml',
  pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', json: 'application/json', log: 'text/plain',
  zip: 'application/zip', mp4: 'video/mp4', mov: 'video/quicktime', m4a: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

/** The file's type as the email will name it: what the device said, else by its extension, else bytes. */
export function contentTypeOf(name: string, type?: string | null): string {
  if (type && type.trim()) return type.trim();
  const ext = (name.split('.').pop() ?? '').toLowerCase();
  return (ext && ext !== name.toLowerCase() && BY_EXTENSION[ext]) || 'application/octet-stream';
}

/**
 * Which of the files just picked can go beside the ones already there, in the order picked, and why each of the others
 * cannot: over the cap for one file, over the cap for all together, past the count, or already there (same name and
 * size).
 */
export function takeFiles<T extends FeedbackFilePick>(
  have: readonly FeedbackFilePick[],
  picked: readonly T[],
): { taken: T[]; refused: Array<{ file: T; why: FeedbackFileRefusal }> } {
  const taken: T[] = [];
  const refused: Array<{ file: T; why: FeedbackFileRefusal }> = [];
  let count = have.length;
  let total = have.reduce((n, f) => n + Math.max(0, f.size || 0), 0);
  for (const f of picked) {
    const size = Math.max(0, f.size || 0);
    if ([...have, ...taken].some((h) => h.name === f.name && h.size === f.size)) refused.push({ file: f, why: 'already' });
    else if (size > FEEDBACK_FILE_MAX_BYTES) refused.push({ file: f, why: 'too_big' });
    else if (count >= FEEDBACK_FILES_MAX) refused.push({ file: f, why: 'too_many' });
    else if (total + size > FEEDBACK_FILES_TOTAL_MAX_BYTES) refused.push({ file: f, why: 'too_much' });
    else {
      taken.push(f);
      count += 1;
      total += size;
    }
  }
  return { taken, refused };
}

/** The refusals in words, one line each kind, for the note under the list. Empty when nothing was refused. */
export function fileRefusalWords(refused: ReadonlyArray<{ file: FeedbackFilePick; why: FeedbackFileRefusal }>): string[] {
  const names = (why: FeedbackFileRefusal) => refused.filter((r) => r.why === why).map((r) => r.file.name);
  const list = (ns: string[]) => (ns.length <= 2 ? ns.join(' and ') : `${ns.slice(0, -1).join(', ')} and ${ns[ns.length - 1]}`);
  const out: string[] = [];
  const big = names('too_big');
  if (big.length) out.push(`${list(big)} ${big.length === 1 ? 'is' : 'are'} over ${mb(FEEDBACK_FILE_MAX_BYTES)}, so ${big.length === 1 ? 'it' : 'they'} can’t go.`);
  const much = names('too_much');
  if (much.length) out.push(`Files can be ${mb(FEEDBACK_FILES_TOTAL_MAX_BYTES)} in all, so ${list(much)} didn’t fit.`);
  const many = names('too_many');
  if (many.length) out.push(`Up to ${FEEDBACK_FILES_MAX} files, so ${list(many)} ${many.length === 1 ? 'was' : 'were'} left out.`);
  const already = names('already');
  if (already.length) out.push(`${list(already)} ${already.length === 1 ? 'is' : 'are'} already on it.`);
  return out;
}

/** How many files the server took, from its answer's body; null when it does not say (a server from before files). */
export function filesAttached(body: unknown): number | null {
  const n = body && typeof body === 'object' ? (body as { files_attached?: unknown }).files_attached : undefined;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
}

/** Whether the files that were sent went through: none were sent, or the server took them all. */
export function filesWentThrough(sent: number, body: unknown): boolean {
  if (sent <= 0) return true;
  const n = filesAttached(body);
  return n !== null && n >= sent;
}
