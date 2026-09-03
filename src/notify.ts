/**
 * The only module in this plugin allowed to import `Notice`.
 *
 * QA invariant 4: **`Notice` is never an initiative channel.** Myu does not tap
 * you on the shoulder inside your notes — the Today pane carries what it has to
 * say, ambiently, and mobile owns push. A toast that says "Marcus has been quiet
 * for three weeks" would be exactly the thing the vault-culture research says
 * this audience installs Obsidian to avoid.
 *
 * What toasts ARE for: the user did a thing and deserves to know it worked or
 * failed. Connected. Disconnected. Capture paused, offline. Backfill finished.
 *
 * The ban is enforced by `no-restricted-imports` in eslint.config.mjs with this
 * file exempted, so "don't do that" is a build error rather than a convention
 * someone inherits and forgets. Grep for `from 'obsidian'` + `Notice` — one hit,
 * here.
 */

import { Notice } from 'obsidian';

/** Something the user just did succeeded. */
export function notifyStatus(message: string, durationMs = 4000): void {
  new Notice(message, durationMs);
}

/** Something the user just did failed, and they need to know why. */
export function notifyError(message: string, durationMs = 8000): void {
  new Notice(message, durationMs);
}

/**
 * A live account/session notice — the web's tier-A toasts, on Obsidian's one
 * in-app notification surface. Title + body as a DocumentFragment (Notice
 * accepts one); `durationMs: 0` stays until dismissed; a click runs the
 * action. Outside a DOM (the unit tier) it degrades to "Title — body".
 */
export function notifyLive(
  notice: { title: string; body?: string; kind: 'info' | 'success' | 'error'; durationMs?: number },
  onClick?: () => void,
): void {
  const duration = notice.durationMs ?? (notice.kind === 'error' ? 8000 : 5000);
  let message: string | DocumentFragment = notice.body ? `${notice.title} \u2014 ${notice.body}` : notice.title;
  if (typeof document !== 'undefined') {
    const frag = createFragment();
    frag.createEl('strong', { text: notice.title });
    if (notice.body) {
      frag.createEl('br');
      frag.appendText(notice.body);
    }
    message = frag;
  }
  const n = new Notice(message, duration);
  if (onClick) {
    n.messageEl.addClass('myu-notice-action');
    n.messageEl.onclick = () => { onClick(); n.hide(); };
  }
}
