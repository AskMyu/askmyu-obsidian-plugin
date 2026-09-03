/**
 * P10 — the identity onboarding the WEBAPP runs, in the vault. Two beats,
 * rendered as a small chat transcript (the web renders the same conversation
 * in its dashboard chat area):
 *
 *   Beat 1 (ARC):    LinkedIn URL / resume file / skip → Myu learns the
 *                    professional history. linkedinSeek → saveLinkedinId →
 *                    queryCurrentEmployment → confirmCurrentEmployment; a
 *                    CURRENT role found = arc carried onboarding.
 *   Beat 2 (MOMENT): "where are you right now?" → classifyCareerMoment.
 *                    Completion mirrors the web verbatim: arc_provided OR
 *                    confidence ≥ 0.5 OR (2nd attempt AND ≥ 0.2). The text
 *                    also lands as the first journal entry (template-routed),
 *                    and Myu's reply closes the conversation.
 *
 * THE SERVER IS THE ONLY SOURCE OF TRUTH for whether this happened —
 * onboarding_complete + the onboard_* myu_scripts flags on /account/state.
 * Vault ingestion never substitutes: months of notes tell Myu what the user
 * DID, not who they are right now (and the engine's briefs and cards are
 * measurably dumber until it knows). Closable without guilt: an incomplete
 * onboarding resurfaces from server state — settings row + Today cue — the
 * same resumability pattern as the genesis-pending row.
 */

import { Component, MarkdownRenderer, App, Modal, Platform, Setting } from 'obsidian';
import type AskMyuPlugin from '../main';
import { componentMarkdown } from '../vault/myuFiles';

/** The web's ONBOARDING_COPY (OnboardingChat.tsx), verbatim — the payback beats. */
export const ONBOARDING_COPY = {
  gapLine: "What LinkedIn can't tell me is where you are right now.",
  situatedQuestion: "Who's the person, or the meeting, that matters most this week?",
  situatedPlaceholder: 'A name, a meeting, and what is at stake \u2014 a sentence or two',
  partialArc: "I can see your past roles, and I can't tell what you're doing right now.",
  skipped: "No problem. Who's the person, or the meeting, that matters most this week?",
};
import { notifyError } from '../notify';

/**
 * The conversation, at PLUGIN scope — the web's `onboardingSession` pattern
 * ("opening the career canvas mid-arc … a remount now restores the
 * conversation"). An Obsidian modal dies on any outside click, so someone who
 * glances at the canvas behind it loses the popup; reopening from the Today
 * row or settings must land them back in the same conversation, career read
 * included. Cleared when the moment hands off to chat, or when the account
 * changes.
 */
const onboardingSession: {
  accountId: string | null;
  transcript: Array<{ role: 'myu' | 'you' | 'read'; text: string }>;
  careerReadMd: string | null;
  /** Where the conversation stands — server scripts can lag a just-finished arc. */
  stage: Stage | null;
} = { accountId: null, transcript: [], careerReadMd: null, stage: null };

const CONFIDENCE_SUFFICIENT = 0.5;
const CONFIDENCE_BORDERLINE_MIN = 0.2;

type Stage = 'arc' | 'moment';

export class OnboardingModal extends Modal {
  private stage: Stage = 'arc';
  private setStage(stage: Stage): void {
    this.stage = stage;
    onboardingSession.stage = stage;
  }
  private transcript: Array<{ role: 'myu' | 'you' | 'read'; text: string }> = [];
  /** The career read's fold, open or shut — held here because the modal re-renders on every beat. */
  private readOpen = false;
  private working = false;
  /** Arc succeeded WITH a current role during this session. */
  private arcCompleted = false;

  constructor(
    app: App,
    private plugin: AskMyuPlugin,
    private onFinished: () => void,
  ) {
    super(app);
  }

  private isOpen = false;

  override onOpen(): void {
    this.isOpen = true;
    this.contentEl.addClass('myu-power-down');
    // Bind to the plugin-scope session: a dismissed conversation comes back.
    const accountId = this.plugin.settings.account_id ?? null;
    if (onboardingSession.accountId !== accountId) {
      onboardingSession.accountId = accountId;
      onboardingSession.transcript = [];
      onboardingSession.careerReadMd = null;
      onboardingSession.stage = null;
    }
    this.transcript = onboardingSession.transcript;
    // A read captured while the popup was dismissed rejoins the conversation.
    if (onboardingSession.careerReadMd && !this.transcript.some((l) => l.role === 'read')) {
      this.transcript.push({ role: 'read', text: onboardingSession.careerReadMd });
    }
    const resuming = this.transcript.length > 0;
    if (resuming && onboardingSession.stage) this.stage = onboardingSession.stage;
    const scripts = this.scripts();
    if (scripts.onboard_moment_captured === true || scripts.onboard_arc_provided === true) {
      // Arc already on file (another surface, or a prior session) — only the
      // moment can be missing. Start there.
      this.setStage('moment');
      if (!resuming) this.say(this.momentPrompt(scripts));
    } else if (!resuming) {
      this.say("Hey — I'm Myu. Your notes will teach me plenty over time, but they can't tell me where you are RIGHT NOW. Two minutes fixes that. To start: your career arc — share your LinkedIn, or a resume.");
    }
    this.render();
  }

  /** Finished or dismissed — the caller hears exactly once. */
  private handedOff = false;
  private handOff(): void {
    if (this.handedOff) return;
    this.handedOff = true;
    this.onFinished();
  }

  override onClose(): void {
    // The career-canvas listener stays armed: if the canvas lands while the
    // popup is dismissed, the read is written into the session and greets the
    // reopen. (main.ts clears the listener on plugin unload.)
    this.isOpen = false;
    this.mdHost.unload();
    this.contentEl.empty();
    // Closing is an answer too: the ladder must not stall on a dismissed dialog.
    this.handOff();
  }

  private scripts(): Record<string, unknown> {
    return this.plugin.onboardingScripts ?? {};
  }

  /**
   * The career canvas, shown in the conversation: the narrative and the
   * position timeline as markdown (the same arms the vault note uses), so the
   * paste is visibly paid back without leaving the modal.
   */
  private async showCareerRead(compositionId: string): Promise<void> {
    const res = await this.plugin.backend.getComposition(compositionId).catch(() => null);
    const components = res?.data?.composition?.components ?? [];
    const wanted = components.filter((c) => c.type === 'text_block' || c.type === 'career_position_timeline' || c.type === 'career_trajectory');
    const md = wanted.map((c) => componentMarkdown(c, 3, () => null, components, 'pane').trim()).filter(Boolean).join('\n\n');
    if (!md) return;
    onboardingSession.careerReadMd = md;
    // IN THE CONVERSATION'S ORDER: the read lands where it happened — after the
    // summary that announced it — not pinned above everything (operator,
    // 2026-09-01: "a bit of a mess order wise"). It folds, like a book's aside:
    // one line until you want it.
    if (!this.transcript.some((l) => l.role === 'read')) this.transcript.push({ role: 'read', text: md });
    if (!this.isOpen) return; // dismissed — the session holds it for the reopen
    this.render();
  }

  /** Markdown render lifecycle scoped to this modal, not the plugin (obsidianmd/no-plugin-as-component). */
  private mdHost = new Component();

  private say(text: string): void {
    this.transcript.push({ role: 'myu', text });
  }

  private you(text: string): void {
    this.transcript.push({ role: 'you', text });
  }

  // ── render ─────────────────────────────────────────────────────────────────

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: 'Tell Myu who you are' });

    const log = contentEl.createDiv({ cls: 'myu-onboard-log' });
    for (const line of this.transcript) {
      if (line.role === 'read') {
        const fold = log.createEl('details', { cls: 'myu-fold myu-onboard-read' });
        if (this.readOpen) fold.setAttr('open', '');
        fold.createEl('summary', { text: 'What Myu read from your career' });
        const body = fold.createDiv({ cls: 'markdown-rendered' });
        void MarkdownRenderer.render(this.app, line.text, body, '/', this.mdHost);
        body.createDiv({ cls: 'myu-quiet', text: 'The full canvas is open behind this window \u2014 yours to keep, and to explore after.' });
        fold.addEventListener('toggle', () => { this.readOpen = fold.hasAttribute('open'); });
        continue;
      }
      const row = log.createDiv({ cls: `myu-onboard-line myu-onboard-${line.role}` });
      row.createSpan({ cls: 'myu-onboard-role', text: line.role === 'myu' ? 'myu' : 'you' });
      row.createSpan({ cls: 'myu-onboard-text', text: line.text });
    }

    if (this.working) {
      contentEl.createEl('p', { cls: 'myu-quiet myu-thinking', text: 'Thinking' });
      return;
    }
    if (this.stage === 'arc') this.renderArc(contentEl);
    if (this.stage === 'moment') this.renderMoment(contentEl);
  }

  private renderArc(root: HTMLElement): void {
    let url = '';
    new Setting(root)
      .setName('LinkedIn')
      .addText((t) => {
        t.setPlaceholder('https://linkedin.com/in/you').onChange((v) => (url = v.trim()));
      })
      .addButton((b) =>
        b.setButtonText('Share').setCta().onClick(() => void this.submitLinkedin(url)),
      );

    const row = new Setting(root);
    if (Platform.isDesktopApp) {
      row.addButton((b) => b.setButtonText('Upload a resume').onClick(() => void this.submitResume()));
    }
    row.addButton((b) =>
      b.setButtonText('Skip for now').onClick(() => {
        this.you('Skip for now');
        this.say("No worries. So tell me — what's going on in your work life right now?");
        this.setStage('moment');
        this.render();
      }),
    );
  }

  private renderMoment(root: HTMLElement): void {
    let text = '';
    let field: { setValue(v: string): unknown; inputEl: HTMLInputElement } | null = null;
    // The give, as a way in: the people your links already name, one press
    // each, so the moment starts from someone real (PLAN_OBSIDIAN_FIRST_RUN §3, row 7).
    const seeds = root.createDiv({ cls: 'myu-prep-chips' });
    void Promise.resolve().then(() => this.plugin.linkSurvey()).then((people) => {
      if (people.length === 0) return;
      seeds.createSpan({ cls: 'myu-quiet', text: 'Start from someone: ' });
      for (const p of people.slice(0, 3)) {
        const chip = seeds.createEl('button', { cls: 'myu-chip myu-chip-amber', text: p.name });
        chip.onclick = () => { text = `About ${p.name}: `; field?.setValue(text); field?.inputEl.focus(); };
      }
    }).catch(() => undefined);
    new Setting(root)
      .setName('Right now')
      .addText((t) => {
        field = t;
        t.setPlaceholder(this.payback() ? ONBOARDING_COPY.situatedPlaceholder : 'A sentence or two, in your words').onChange((v) => (text = v));
      })
      .addButton((b) =>
        b.setButtonText('Tell Myu').setCta().onClick(() => void this.submitMoment(text.trim())),
      );
    new Setting(root).addButton((b) =>
      b.setButtonText('Not now').onClick(() => {
        // Server state is untouched → the settings row and Today cue keep
        // offering the resume. Closing is an answer, not a loss.
        this.close();
        this.handOff();
      }),
    );
  }

  // ── beat 1: arc ────────────────────────────────────────────────────────────

  private async submitLinkedin(url: string): Promise<void> {
    if (!url || !url.includes('linkedin.com/in/')) {
      notifyError('That does not look like a LinkedIn profile URL.');
      return;
    }
    this.you(url);
    this.working = true;
    this.render();

    const accountId = this.plugin.settings.account_id;
    if (!accountId) return;
    const seek = await this.plugin.backend.linkedinSeek(accountId, url);
    this.working = false;
    // A dead or private profile now passes through as body.code 404 (no more
    // polite 200 wrapper) — either shape is "couldn't read it", never a summary.
    const failCode = seek.data?.body?.code;
    if (!seek.ok || (typeof failCode === 'number' && failCode >= 400)) {
      this.say("I couldn't access that LinkedIn profile. Want to try again, or we can skip this for now?");
      this.render();
      return;
    }
    const summary = seek.data?.body?.content ?? 'LinkedIn profile found.';
    const lid = url.match(/linkedin\.com\/in\/([^/?]+)/)?.[1] ?? '';
    if (lid) await this.plugin.backend.saveLinkedinId(accountId, lid);
    await this.finishArc('linkedin', summary);
  }

  private async submitResume(): Promise<void> {
    const w = window as unknown as { require?: (m: string) => unknown };
    const electron = w.require?.('electron') as
      | { remote?: { dialog?: { showOpenDialog: (o: unknown) => Promise<{ canceled: boolean; filePaths?: string[] }> } } }
      | undefined;
    const dialog = electron?.remote?.dialog;
    const fs = w.require?.('fs') as { readFileSync: (p: string) => Uint8Array } | undefined;
    if (!dialog || !fs) {
      notifyError('Resume upload needs the desktop app — paste your LinkedIn instead.');
      return;
    }
    const picked = await dialog.showOpenDialog({
      title: 'Choose your resume',
      filters: [{ name: 'Resume', extensions: ['pdf', 'doc', 'docx', 'txt'] }],
      properties: ['openFile'],
    });
    if (picked.canceled || !picked.filePaths?.[0]) return;
    const path = picked.filePaths[0];
    const name = path.split(/[\\/]/).pop() ?? 'resume.pdf';
    this.you(`(uploaded ${name})`);
    this.working = true;
    this.render();

    const accountId = this.plugin.settings.account_id;
    if (!accountId) return;
    const bytes = fs.readFileSync(path);
    const upload = await this.plugin.backend.resumeUpload(accountId, name, bytes.buffer as ArrayBuffer);
    this.working = false;
    if (!upload.ok) {
      this.say("That upload didn't take. Try again, paste your LinkedIn, or skip for now.");
      this.render();
      return;
    }
    // The SUMMARY comes back on the upload itself (summarize=true) — showing
    // it is the give-before-take beat: Myu proves it read the thing before
    // asking the next question (2026-08-24: a hardcoded placeholder here made
    // the arc feel like a filing cabinet, not a companion).
    if (upload.data?.resume_id) await this.plugin.backend.saveResumeId(accountId, upload.data.resume_id);
    await this.finishArc('resume', upload.data?.summary ?? 'Resume processed.');
  }

  /** Shared arc tail: employment extraction decides full vs partial arc. */
  private async finishArc(source: 'linkedin' | 'resume', summary: string): Promise<void> {
    const accountId = this.plugin.settings.account_id;
    if (!accountId) return;
    this.working = true;
    this.render();
    await this.plugin.backend.queryCurrentEmployment(accountId, source);
    const confirm = await this.plugin.backend.confirmCurrentEmployment(accountId);
    this.working = false;

    // The response IS the employment object; a CURRENT role means a companies[]
    // entry, or a role/company_name (audit 2026-08-25 — the `.employment`
    // wrapper never existed, so the arc never completed onboarding).
    const d = confirm.data as { companies?: unknown[]; role?: string; company_name?: string } | undefined;
    const hasCurrent =
      (Array.isArray(d?.companies) && d.companies.length > 0) ||
      (typeof d?.role === 'string' && d.role.trim().length > 0) ||
      (typeof d?.company_name === 'string' && d.company_name.trim().length > 0);
    if (hasCurrent) {
      // Full arc — onboarding is carried; the moment is still asked because
      // it seeds the first journal entry, but it can no longer fail.
      this.arcCompleted = true;
      await this.plugin.backend.updateAccountState(accountId, {
        onboardingComplete: true,
        myuScripts: { onboard_arc_provided: true, onboard_arc_source: source },
      });
      if (this.payback()) {
        // Pay the paste back (cold start, slice 3): the read, the gap, the
        // situated question — and the career canvas. The web flips the canvas
        // open BESIDE the chat; a modal has no beside, so the timeline and
        // summary are rendered INTO the conversation when composition_ready
        // lands, and the full canvas tab waits behind for afterwards.
        this.say(`${summary}\n\n${ONBOARDING_COPY.gapLine}\n\n${ONBOARDING_COPY.situatedQuestion}`);
        this.plugin.careerCanvasListener = (id) => void this.showCareerRead(id);
        this.plugin.expectCareerCanvas();
      } else {
        this.say(`${summary}\n\nSo tell me — where does it feel like you are right now? What's the work situation?`);
      }
    } else {
      await this.plugin.backend.updateAccountState(accountId, {
        myuScripts: { onboard_arc_partial: true, onboard_arc_source: source },
      });
      this.say(this.payback()
        ? `${summary}\n\n${ONBOARDING_COPY.partialArc} ${ONBOARDING_COPY.situatedQuestion}`
        : `${summary}\n\nI can see your past roles, but couldn't quite tell what you're doing right now. Tell me what you're working on these days?`);
    }
    await this.plugin.refreshOnboardingState();
    this.setStage('moment');
    this.render();
  }

  /** The payback flag, read defensively — test doubles carry no flags. */
  private payback(): boolean {
    return (this.plugin as { flags?: { onboarding_payback?: boolean } }).flags?.onboarding_payback === true;
  }

  // ── beat 2: moment ─────────────────────────────────────────────────────────

  private momentPrompt(scripts: Record<string, unknown>): string {
    const attempts = (scripts.onboard_moment_attempt_count as number) ?? 0;
    const role = scripts.onboard_moment_role_title as string | null | undefined;
    if (attempts >= 1 && role) {
      return `Last time I heard something about "${role}" — say a bit more about where that stands right now?`;
    }
    if (attempts >= 1) {
      return "Let's try once more — in a sentence or two, where are you in your career right now?";
    }
    if (this.payback()) return ONBOARDING_COPY.situatedQuestion;
    return 'Where are you in your career right now? A sentence or two, in your own words.';
  }

  private async submitMoment(text: string): Promise<void> {
    if (!text) return;
    const accountId = this.plugin.settings.account_id;
    if (!accountId) return;
    this.you(text);
    this.working = true;
    this.render();

    const arcProvided = this.arcCompleted || this.scripts().onboard_arc_provided === true;
    const priorAttempts = (this.scripts().onboard_moment_attempt_count as number) ?? 0;

    // The web's completion rules, verbatim: arc carries; sufficient carries;
    // second-attempt borderline is the smart escape; two thins stay incomplete.
    let shouldComplete = arcProvided;
    try {
      const classify = await this.plugin.backend.classifyCareerMoment(accountId, text);
      const confidence = classify.data?.confidence ?? 0;
      const captured = classify.data?.moment_captured === true || confidence >= CONFIDENCE_SUFFICIENT;
      const borderline = !captured && confidence >= CONFIDENCE_BORDERLINE_MIN;
      shouldComplete = arcProvided || captured || (priorAttempts >= 1 && (captured || borderline));
    } catch {
      shouldComplete = arcProvided;
    }

    if (shouldComplete) {
      await this.plugin.backend.updateAccountState(accountId, { onboardingComplete: true });
    }
    this.working = false;

    // THE WEB'S TRANSITION, verbatim in spirit: the moment answer doesn't get
    // a reply inside a modal — it BECOMES the first journal entry, and the
    // user lands in the chat with Myu's reply arriving there. The modal's job
    // ends the moment the conversation starts (operator call, 2026-08-24:
    // answering in-place made onboarding a form; the chat makes it a
    // relationship that has already begun).
    void this.plugin.refreshOnboardingState();
    // The conversation is over — the chat carries it from here. A later
    // reopen (if onboarding stayed incomplete) starts at the right beat
    // without replaying a finished transcript.
    onboardingSession.transcript = [];
    onboardingSession.careerReadMd = null;
    onboardingSession.stage = null;
    this.close();
    this.handOff();
    void this.plugin.openChat({ text, send: true, templateType: 'onboarding_moment' });
  }
}
