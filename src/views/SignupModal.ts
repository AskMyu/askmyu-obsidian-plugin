/**
 * P9 — signup, in the vault.
 *
 * PASSWORDLESS FIRST (2026-08-22): the product's real front door is the
 * magic-link flow — RequestMagicLink → emailed link → the landing page's
 * "Open in Obsidian" hands the token to our protocol handler, which validates
 * it API-side (the mobile pattern) and creates the account when the email is
 * new. No password at the door; keys are born silently on success and
 * recovery hardening is a follow-up prompt.
 *
 * Resilience doors, because email links meet the real world:
 *  · paste-the-link fallback — Linux protocol handlers and corporate mail
 *    clients both misbehave; pasting the emailed URL here extracts the token;
 *  · a password door, collapsed — for the person who just wants one;
 *
 * An EXISTING account arriving through any door is never re-keyed: the auth
 * response says whether keys exist, and the machine lands in BLOCKED for the
 * normal approval/recovery flow instead of minting a second mDEK.
 */

import { App, Modal, Setting } from 'obsidian';
import type AskMyuPlugin from '../main';
import { ApprovalModal } from './ApprovalModal';
import { signupDoors } from '../devHooks';
import { notifyError } from '../notify';
import { appendBrand } from '../brand';
import { parseTermsInfo, termsLinks, TERMS_FALLBACK_URLS, type TermsInfo } from '../terms';

/** Google's four-color G. Shape data only — never markup. */
const GOOGLE_G_PATHS: ReadonlyArray<readonly [string, string]> = [
  ['#4285F4', 'M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92a8.78 8.78 0 0 0 2.68-6.62z'],
  ['#34A853', 'M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z'],
  ['#FBBC05', 'M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z'],
  ['#EA4335', 'M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z'],
];

export class SignupModal extends Modal {
  private email = '';
  private name = '';
  private password = '';
  private pasted = '';
  private stage: 'form' | 'sent' = 'form';
  private showPassword = false;
  /** Which door the 'sent' stage is waiting on — tunes its copy. */
  private sentVia: 'email' | 'google' = 'email';
  /** Polls the machine while 'sent' — the deep link lands OUTSIDE this modal,
      and a modal that can't notice its own success just sits there (live
      finding, 2026-08-25: sign-in completed behind the modal; the user saw
      nothing but "Check your email"). */
  private sentWatch: number | null = null;
  private working = false;
  /**
   * Beta terms (2026-09-02): affirmative assent at the one moment an account
   * is created. `/terms` is public and read here because the door has no
   * session yet; the version the person SAW is the version sent back. When it
   * cannot be reached the links fall back to the public pages and no version
   * is sent — the backend's gate catches that on first load.
   */
  private agreed = false;
  private terms: TermsInfo | null = null;
  private termsAsked = false;

  constructor(
    app: App,
    private plugin: AskMyuPlugin,
    private onFinished: () => void,
    /** 'signin' trims the form to what a RETURNING user needs — no Name
        field, sign-in copy. The doors behind it are identical (the email
        step detects the account either way). */
    private flavor: 'create' | 'signin' = 'create',
  ) {
    super(app);
  }

  override onOpen(): void {
    this.render();
    void this.loadTerms();
  }

  private async loadTerms(): Promise<void> {
    if (this.termsAsked) return;
    this.termsAsked = true;
    const res = await this.plugin.backend.getTerms().catch(() => null);
    this.terms = res?.ok ? parseTermsInfo(res.data) : null;
    if (this.stage === 'form') this.render();
  }

  /** The bundle to send: only what was shown and agreed to. */
  private termsVersion(): string | undefined {
    return this.agreed && this.terms ? this.terms.currentVersion : undefined;
  }

  /** Create-flavour doors are inert until the box is ticked; pressing one says why. */
  private doorOpen(): boolean {
    if (this.flavor !== 'create' || this.agreed) return true;
    notifyError('Tick the box to continue.');
    return false;
  }

  private markDoor(el: HTMLElement): void {
    if (this.flavor !== 'create' || this.agreed) return;
    el.addClass('myu-inert');
    el.setAttr('aria-disabled', 'true');
  }

  /**
   * The sentence uses the agreement's own words ("I agree"), both documents
   * are links that open in the browser, and the links are BUILT — Obsidian's
   * review rejects assigned markup categorically.
   */
  private renderTermsRow(host: HTMLElement): void {
    const row = host.createDiv({ cls: 'myu-terms-row' });
    const label = row.createEl('label', { cls: 'myu-terms-label' });
    // eslint-disable-next-line obsidianmd/ui/sentence-case -- the documents' titles, and the agreement's own §12 wording
    const box = label.createEl('input', { cls: 'myu-terms-box', attr: { type: 'checkbox', 'aria-label': 'I agree to the Beta Participation Terms and the Privacy Policy' } });
    box.checked = this.agreed;
    box.onchange = () => {
      this.agreed = box.checked;
      this.render();
    };
    const sentence = label.createSpan({ cls: 'myu-terms-sentence' });
    sentence.appendText('I agree to the ');
    const links = termsLinks(this.terms?.urls ?? TERMS_FALLBACK_URLS);
    links.forEach((link, i) => {
      sentence.createEl('a', { text: link.label, href: link.url, attr: { target: '_blank', rel: 'noopener' } });
      sentence.appendText(i === 0 ? ' and the ' : '.');
    });
  }

  private watchWhileSent(): void {
    if (this.sentWatch !== null) return;
    this.sentWatch = window.setInterval(() => {
      const state = this.plugin.unlock.current;
      if (state === 'unlocked') {
        this.close();
      } else if (state === 'blocked') {
        if (this.plugin.unlock.genesisPending) {
          // Fresh account: the ceremony modal has opened on top — just get
          // out of its way. (The machine parks in blocked/genesis_pending
          // during the ceremony; 'ceremony' is a door OUTCOME, not a state —
          // the mirror's type-check caught the confusion, 2026-08-25.)
          this.close();
        } else {
          // Existing account — hand straight to the approve/recovery UI
          // instead of leaving a welcome-back toast to die behind this modal.
          this.close();
          new ApprovalModal(this.app, this.plugin.unlock, () => this.onFinished()).open();
        }
      }
    }, 700);
  }

  override onClose(): void {
    if (this.sentWatch !== null) {
      window.clearInterval(this.sentWatch);
      this.sentWatch = null;
    }
    this.contentEl.empty();
  }

  /** The web app's origin for this stack: the backend origin, minus /api. */
  private webOrigin(): string {
    return this.plugin.settings.base_url.replace(/\/api\/?$/, '');
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('myu-power-down');

    if (this.stage === 'sent') {
      this.renderSent();
      return;
    }

    if (this.flavor === 'signin') {
      appendBrand(contentEl);
      contentEl.createEl('h2', { text: 'Sign in to Myu' });
      contentEl.createEl('p', {
        cls: 'myu-prose',
        text: 'Welcome back. Any door below reaches your existing account.',
      });
    } else {
      appendBrand(contentEl);
    contentEl.createEl('h2', { text: 'Start with Myu, right here' });
      contentEl.createEl('p', {
        cls: 'myu-prose',
        text:
          'Your account starts in the vault. Share a meeting-notes folder and Myu ' +
          'builds your people, decisions, and commitments from notes you already ' +
          'have — no calendar or email needed to begin.',
      });
    }

    // Google FIRST, then "or", then the email form — the universal sign-in
    // layout, because Google needs nothing from the form (it IS the identity;
    // a live run showed the old order implied the email field fed it).
    const google = contentEl.createEl('button', { cls: 'myu-google-door' });
    // The official four-color G (Google Identity branding guidelines), BUILT
    // rather than assigned as markup: Obsidian's automated review rejects
    // `innerHTML` categorically and rescans every release, so a static string
    // here is a delisting risk for no benefit.
    const gMark = google.createSpan({ cls: 'myu-google-mark' });
    const gSvg = gMark.createSvg('svg', {
      attr: { viewBox: '0 0 18 18', width: '16', height: '16', 'aria-hidden': 'true' },
    });
    for (const [fill, d] of GOOGLE_G_PATHS) gSvg.createSvg('path', { attr: { fill, d } });
    google.createSpan({ text: 'Continue with Google' });
    this.markDoor(google);
    google.onclick = () => {
      if (!this.doorOpen()) return;
      // The version rides the handoff: the web hides its own checkbox and
      // stamps client: obsidian (plan decision 8).
      const version = this.termsVersion();
      window.open(`${this.webOrigin()}/?origin=obsidian${version ? `&terms_version=${encodeURIComponent(version)}` : ''}`, '_blank');
      this.stage = 'sent';
      this.sentVia = 'google';
      this.render();
    };
    contentEl.createDiv({ cls: 'myu-door-divider', text: 'or with your email' });

    new Setting(contentEl).setName('Email').addText((t) => {
      t.setPlaceholder('you@company.com').setValue(this.email).onChange((v) => (this.email = v.trim()));
      t.inputEl.type = 'email';
    });
    if (this.flavor === 'create') {
      // A returning user's account already knows their name (live finding,
      // 2026-08-25: being asked your name on SIGN-IN reads as a broken form).
      new Setting(contentEl).setName('Name').addText((t) => {
        t.setPlaceholder('Your name').setValue(this.name).onChange((v) => (this.name = v.trim()));
      });
      this.renderTermsRow(contentEl);
    }

    if (this.showPassword) {
      new Setting(contentEl)
        .setName('Password')
        .setDesc(
          'For signing in to askMyu on the web or your phone later. It is not an ' +
          'encryption passphrase — your notes’ key is created separately on this ' +
          'device and never comes from this password.',
        )
        .addText((t) => {
          t.setPlaceholder('••••••••').onChange((v) => (this.password = v));
          t.inputEl.type = 'password';
        });
    }

    const buttons = new Setting(contentEl);
    buttons.addButton((b) => b.setButtonText('Not now').onClick(() => this.close()));
    if (this.showPassword) {
      buttons.addButton((b) => {
        b.setButtonText('Create my account').setCta().onClick(() => void this.submitPassword(b.buttonEl));
        this.markDoor(b.buttonEl);
      });
    } else {
      buttons.addButton((b) => {
        b.setButtonText('Email me a sign-in link').setCta().onClick(() => void this.submitMagic(b.buttonEl));
        this.markDoor(b.buttonEl);
      });
    }

    // The quiet toggles, STACKED — one per line with real air between them.
    // (Google lives at the top of the modal; the browser hand-off mints a
    // one-time token that comes back through the same obsidian://myu-signin?
    // magic redeem the email link uses. One door, every key — and it works on
    // mobile Obsidian, which a loopback server can't.)
    const doors = contentEl.createDiv({ cls: 'myu-modal-doors' });

    const alt = doors.createEl('button', {
      cls: 'myu-affordance',
      text: this.showPassword ? 'Use a sign-in link instead' : 'Use a password instead',
    });
    alt.onclick = () => {
      this.showPassword = !this.showPassword;
      this.render();
    };

    // Extension point: internal development builds may add doors of their
    // own here; release and community builds register none.
    for (const door of signupDoors) {
      door(doors, { app: this.app, plugin: this.plugin, email: () => this.email, close: () => this.close(), finished: () => this.onFinished() });
    }

    // The create/sign-in switch — the SAME modal, re-flavored. The doors reach
    // the same account either way (the email step detects an existing one), but
    // the framing must offer BOTH plainly (operator, 2026-08-25: the welcome
    // only advertised 'create'). A footer line, always present.
    const switchRow = contentEl.createDiv({ cls: 'myu-modal-switch' });
    if (this.flavor === 'create') {
      switchRow.createSpan({ cls: 'myu-quiet', text: 'Already use Myu?' });
      const toSignin = switchRow.createEl('button', { cls: 'myu-affordance', text: 'Sign in' });
      toSignin.onclick = () => {
        this.flavor = 'signin';
        this.showPassword = false;
        this.render();
      };
    } else {
      switchRow.createSpan({ cls: 'myu-quiet', text: 'New to Myu?' });
      const toCreate = switchRow.createEl('button', { cls: 'myu-affordance', text: 'Create an account' });
      toCreate.onclick = () => {
        this.flavor = 'create';
        this.render();
      };
    }
  }

  private renderSent(): void {
    this.watchWhileSent();
    const { contentEl } = this;
    if (this.sentVia === 'google') {
      contentEl.createEl('h2', { text: 'Finish in your browser' });
      contentEl.createEl('p', {
        cls: 'myu-prose',
        text:
          'A browser tab is open with the Google sign-in. When it finishes, ' +
          'press “Open in Obsidian” on the page it lands on — you come right back here.',
      });
    } else {
      contentEl.createEl('h2', { text: 'Check your email' });
      contentEl.createEl('p', {
        cls: 'myu-prose',
        text:
          `A sign-in link is on its way to ${this.email}. It opens right back ` +
          'here — press “Open in Obsidian” on the page it lands on.',
      });
    }
    contentEl.createEl('p', {
      cls: 'myu-prose myu-quiet',
      text: 'Nothing happening when you click? Paste the link from the page below.',
    });

    new Setting(contentEl).setName('Paste the sign-in link').addText((t) => {
      t.setPlaceholder('https://…token=…').onChange((v) => (this.pasted = v.trim()));
    });

    new Setting(contentEl)
      .addButton((b) => b.setButtonText('Close').onClick(() => this.close()))
      .addButton((b) =>
        b.setButtonText('Sign in with the pasted link').setCta().onClick(() => void this.submitPasted(b.buttonEl)),
      );
  }

  // ── doors ─────────────────────────────────────────────────────────────────

  private async submitMagic(button: HTMLButtonElement): Promise<void> {
    if (this.working || !this.doorOpen()) return;
    if (!this.email) {
      notifyError('Email first — the sign-in link needs somewhere to go.');
      return;
    }
    this.working = true;
    button.disabled = true;
    button.textContent = 'Sending…';
    const res = await this.plugin.backend.requestMagicLink(this.email, this.name || undefined, this.termsVersion());
    this.working = false;
    if (res.ok) {
      this.stage = 'sent';
      this.render();
    } else {
      notifyError('Could not send the link. Check the connection and try again.');
      button.disabled = false;
      button.textContent = 'Email me a sign-in link';
    }
  }

  private async submitPasted(button: HTMLButtonElement): Promise<void> {
    // Accept the full link OR a bare token — people paste what they managed
    // to copy (the protocol-broken fallback path, 2026-08-24).
    const token = /[?&]token=([^&\s]+)/.exec(this.pasted)?.[1]
      ?? (/^[a-fA-F0-9]{32}$/.test(this.pasted) ? this.pasted : undefined);
    if (!token) {
      notifyError("That doesn't look like the sign-in link — it carries a token= part.");
      return;
    }
    button.disabled = true;
    await this.plugin.completeMagicSignup(decodeURIComponent(token));
    this.close();
  }

  private async submitPassword(button: HTMLButtonElement): Promise<void> {
    if (this.working || !this.doorOpen()) return;
    if (!this.email || !this.name || this.password.length < 8) {
      notifyError('Email, name, and a password of at least 8 characters.');
      return;
    }
    this.working = true;
    button.disabled = true;
    button.textContent = 'Creating…';

    const deviceId = await this.plugin.ensureDeviceId();
    const outcome = await this.plugin.unlock.signup(this.email, this.name, this.password, deviceId, this.termsVersion());
    this.working = false;

    if (outcome === 'ceremony') {
      this.close();
      this.onFinished();
      this.plugin.openGenesisCeremony();
    } else if (outcome === 'existing_account') {
      // Same hand-off the sent-watcher gives the link doors: welcome-back goes
      // STRAIGHT to approve/recovery — a toast pointing at settings is a dead
      // end (parity fix, 2026-08-25).
      this.close();
      new ApprovalModal(this.app, this.plugin.unlock, () => this.onFinished()).open();
    } else if (outcome === 'email_not_allowed') {
      notifyError('askMyu is in closed beta — this email isn’t on the list yet. Ask for an invite.');
      button.disabled = false;
      button.textContent = 'Create my account';
    } else {
      notifyError('Could not create the account. Check the connection and try again.');
      button.disabled = false;
      button.textContent = 'Create my account';
    }
  }

}
