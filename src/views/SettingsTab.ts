/**
 * Settings — connect, consent, status.
 *
 * The connect card is the whole of P0's user-facing surface: paste a token,
 * approve the device, see what state you're in. The allowlist section is P1's
 * and is deliberately *visible but empty* before consent, because the fastest
 * way to explain "nothing is read until you choose" is to show the empty list
 * that proves it.
 *
 * Status copy names the real state rather than a spinner. "Waiting for network"
 * and "approve this device" are different problems with different fixes, and a
 * user who can't tell them apart files the wrong bug report.
 */

import { type SettingDefinitionItem, App, PluginSettingTab, Setting } from 'obsidian';
import type AskMyuPlugin from '../main';
import { mountInRow } from './settingsMount';
import { ZulipConnectModal } from './ZulipConnectModal';
import { pickFile } from './pickFile';
import { DEFAULT_SETTINGS } from '../settings';
import type { OAuthInitOptions, OAuthStatusResult, ScopeSet } from '../transport/api';

/** YYYY-MM-DD, n months before today. */
function ymdMonthsAgo(n: number): string {
  const d = new Date(); d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}
/** The nearest of the offered caps (3/6/12/24) for a stored YYYY-MM-DD. */
function monthsBack(ymd: string): number {
  const t = Date.parse(ymd); if (!Number.isFinite(t)) return 12;
  const months = (Date.now() - t) / (30.44 * 86400e3);
  return [3, 6, 12, 24].reduce((best, m) => (Math.abs(m - months) < Math.abs(best - months) ? m : best), 12);
}
function ago(when: string | number): string {
  const t = typeof when === 'number' ? when : Date.parse(when);
  if (!Number.isFinite(t)) return 'a while ago';
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}
import { ApprovalModal } from './ApprovalModal';
import { ConsentModal } from './ConsentModal';
import { MeetingConsentModal } from './MeetingConsentModal';
import { MaterializeConsentModal } from './MaterializeConsentModal';
import { SignupModal } from './SignupModal';
import { SetupRecoveryModal } from './SetupRecoveryModal';
import { ApproveDeviceModal } from './ApproveDeviceModal';
import { notifyError, notifyStatus } from '../notify';
import { AddSourceModal } from './AddSourceModal';
import { DeleteAccountModal } from './DeleteAccountModal';
import { AddAccountEmailModal } from './AddAccountEmailModal';
import { firstPresent, parseWhen } from '../vault/myuFiles';
import { BUILD_STAMP } from '../buildStamp';
import { normalizePreferences } from '../transport/api';
import { appendBrand } from '../brand';
import { PersonActionConfirmModal } from './PersonActionConfirmModal';
import { loadFailure } from './settingsLoad';

/** The optional look, as a file the reader saves — on the public repo. */
const MYU_LOOK_URL = 'https://github.com/AskMyu/askmyu-obsidian-plugin/raw/main/snippets/myu-look.css';

/** The two OAuth cards, before their status lands — and again after a refused status is retried. */
const INTEGRATION_CARDS = {
  google: {
    name: 'Google Calendar & Gmail',
    desc: 'Connect and Myu preps your meetings and reads the room from your threads. One browser tab for Google’s consent screen; it sends you right back.',
  },
  microsoft: {
    name: 'Microsoft Outlook & calendar',
    desc: 'Same idea for the Microsoft side of your life. One browser tab for the consent screen; it sends you right back.',
  },
} as const;

export class AskMyuSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: AskMyuPlugin,
  ) {
    super(app, plugin);
  }

  /**
   * Re-render, but only when the tab is actually on screen. State transitions
   * (unlock, relock, genesis completing behind a modal) otherwise leave a
   * stale one-shot render showing rows for a state that no longer exists.
   */
  refreshIfVisible(): void {
    if (this.containerEl.isConnected) this.rerender();
  }

  /**
   * Re-render the way Obsidian paints us: `update()` re-reads the definitions
   * and repaints the active tab in place — groups, search, one section order.
   * (The legacy `display()` path is gone with minAppVersion 1.13: calling it
   * over a definitions render reshuffled the pane after every click, 2026-09-03.)
   * Every re-render in this file goes here.
   */
  rerender(): void {
    this.update();
  }

  /**
   * The declarative settings API (1.13, our floor). Each section is a
   * searchable group (name + aliases reach Obsidian's settings search) whose
   * one item renders the section's UI into the group. (Migrating each toggle
   * to a `control` definition — individually searchable — is the follow-up.)
   */
  override getSettingDefinitions(): SettingDefinitionItem[] {
    const section = (heading: string, aliases: string[], render: (root: HTMLElement) => void, visible?: () => boolean): SettingDefinitionItem => ({
      type: 'group',
      heading,
      ...(visible ? { visible } : {}),
      items: [{ name: heading, aliases, render: (setting: Setting) => mountInRow(setting, render) }],
    });
    return [
      // The brandmark, first — the one brand moment in settings. A render item
      // outside any group, unsearchable, so 1.13's definitions render paints it
      // exactly where display() does (live, 2026-09-03: it only ever appeared
      // after a legacy repaint, never on open).
      { name: 'askMyu', searchable: false, render: (setting: Setting) => mountInRow(setting, (root) => appendBrand(root, 'myu-brand myu-brand-settings')) },
      section('Connection', ['account', 'sign in', 'devices', 'backend', 'token'], (r) => this.renderConnection(r)),
      section('What Myu can read', ['consent', 'folders', 'tags', 'journal', 'sharing'], (r) => this.renderSharing(r)),
      section('Meeting notes', ['meetings', 'transcripts', 'capture'], (r) => this.renderMeetingNotes(r)),
      section("Myu's folder", ['materialize', 'people', 'companies', 'calendar', 'commitments', 'bases', 'sync', 'sync on open'], (r) => this.renderMaterialization(r)),
      section('Weave Myu in', ['integrations', 'recipes', 'snippets', 'bases embed', 'tasks', 'dataview', 'daily notes', 'template'], (r) => this.renderIntegrations(r)),
      section('Weekly review', ['review', 'week'], (r) => this.renderWeeklyReview(r)),
      section('Account', ['delete account', 'email', 'aliases', 'sign out', 'export', 'archive', 'uninstall'], (r) => this.renderAccount(r), () => this.plugin.unlock.current === 'unlocked'),
      section('Advanced', ['backend url', 'debug', 'snippet', 'styling'], (r) => this.renderAdvanced(r)),
    ];
  }

  // ── P8: the shared surface ──────────────────────────────────────────────────

  private renderMaterialization(root: HTMLElement): void {
    const s = this.plugin.settings;

    if (!s.materialize_consented) {
      root.createEl('p', {
        cls: 'myu-prose myu-quiet',
        text:
          'Myu can keep a folder in your vault — a page per person, today, the week, ' +
          'and your commitments as real checkboxes. Off until you say so.',
      });
      new Setting(root).addButton((b) =>
        b.setButtonText('Let Myu write…').onClick(() => {
          new MaterializeConsentModal(this.app, this.plugin, (accepted) => {
            if (!accepted) return;
            this.plugin.restartCapture();
            void this.plugin.materializer.materializeAll();
            this.rerender();
          }).open();
        }),
      );
      return;
    }

    new Setting(root)
      .setName('Writing on')
      .setDesc(`Myu maintains ${s.materialize_folder}/ — ticking a checkbox there marks it done in Myu.`)
      .addToggle((t) =>
        t.setValue(s.materialize_enabled).onChange(async (v) => {
          s.materialize_enabled = v;
          await this.plugin.saveSettings();
          this.plugin.restartCapture();
        }),
      )
      .addButton((b) =>
        b.setButtonText('Sync now').onClick(async () => {
          b.setButtonText('Syncing…').setDisabled(true);
          await this.plugin.materializer.materializeAll();
          notifyStatus('Synced — Myu’s folder is current.');
          this.rerender();
        }),
      );

    new Setting(root)
      .setName('People')
      .addToggle((t) =>
        t.setValue(s.materialize_people).onChange(async (v) => {
          s.materialize_people = v;
          await this.plugin.saveSettings();
        }),
      );
    new Setting(root)
      .setName('Today and the week')
      .addToggle((t) =>
        t.setValue(s.materialize_today).onChange(async (v) => {
          s.materialize_today = v;
          await this.plugin.saveSettings();
        }),
      );
    new Setting(root)
      .setName('Commitments')
      .addToggle((t) =>
        t.setValue(s.materialize_commitments).onChange(async (v) => {
          s.materialize_commitments = v;
          await this.plugin.saveSettings();
        }),
      );
    new Setting(root)
      .setName('Meeting history')
      .setDesc('Your past meetings, from every source, as notes in Myu/Meetings/.')
      .addToggle((t) =>
        t.setValue(s.materialize_meetings_history).onChange(async (v) => {
          s.materialize_meetings_history = v;
          await this.plugin.saveSettings();
        }),
      );
    new Setting(root)
      .setName('Calendar')
      .setDesc('A month grid (Myu/Calendar.md) and a note per day — schedule, meetings, journal.')
      .addToggle((t) =>
        t.setValue(s.materialize_calendar).onChange(async (v) => {
          s.materialize_calendar = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(root)
      .setName('Sync when the vault opens')
      .setDesc('A full pass in the background every time you open the vault, so Today is current. Off: nothing runs until you press the sync button (Today pane, or the command).')
      .addToggle((tg) => tg.setValue(this.plugin.settings.sync_on_open).onChange(async (v) => { this.plugin.settings.sync_on_open = v; await this.plugin.saveSettings(); }));
    new Setting(root)
      .setName('Journal history')
      .setDesc('Your journal from every surface, decrypted into Myu/Journal/ — one note per day.')
      .addToggle((t) =>
        t.setValue(s.materialize_journal_history).onChange(async (v) => {
          s.materialize_journal_history = v;
          await this.plugin.saveSettings();
        }),
      );
  }

  // ── P8.5: weave Myu in — copyable snippets, pasted by THEIR hand ───────────

  private renderIntegrations(root: HTMLElement): void {
    // One row, one door. The recipes live in a pane where each snippet is a
    // code block with a copy button — the text in view before it is copied.
    // (Seven rows with a blind Copy each until 2026-09-03.)
    new Setting(root)
      .setName('Recipes')
      .setDesc(
        'Your day inside every daily note, the brief, the week, a Tasks query for your commitments, ' +
          'the people table, a Dataview table, a button to Today. Myu never edits your files: you paste them, ' +
          'or put one at the cursor with the command "Insert a Myu snippet…".',
      )
      .addButton((b) => b.setButtonText('Open the recipes').onClick(() => void this.plugin.openWeave()));
  }

  /**
   * The account itself — devices, login aliases, how Myu addresses you, and
   * the door out.
   *
   * Added by the parity review (2026-08-26). Each of these was reachable on the
   * web and nowhere in the vault, which is rule 3 ("no webapp-only ceremonies")
   * being quietly broken: a vault-primary user could be revoked but could not
   * revoke, could be addressed but could not say how, and could not leave.
   * Everything here calls the same endpoint the webapp calls, with the same
   * method and body.
   */
  private renderAccount(containerEl: HTMLElement): void {
    if (this.plugin.unlock.current !== 'unlocked') return;

    // Every fetching row gets its place NOW, in reading order, and fills in
    // when its answer lands — so the order never depends on which answer came
    // first, and the door out stays last. (Live, 2026-09-03: the name and
    // address rows appended themselves after "Delete my account", in whichever
    // order the server answered, and the name's copy pointed "above" at a row
    // that had landed below.)
    const devicesHost = containerEl.createDiv();
    const emailsHost = containerEl.createDiv();
    const nameHost = containerEl.createDiv();
    const addressHost = containerEl.createDiv();
    const careerHost = containerEl.createDiv();
    void this.renderDevices(devicesHost);
    void this.renderAccountEmails(emailsHost);
    void this.renderProfile(nameHost, careerHost);
    void this.renderPreferences(addressHost);

    // The door out — the web's DELETE-to-confirm, from inside the vault (parity
    // review 2026-08-26). Last, on purpose: the one irreversible thing in the
    // pane sits after everything it would take with it.
    new Setting(containerEl)
      .setName('Delete my account')
      .setDesc('Irreversible. Everything Myu holds about you is deleted, immediately. Your vault is untouched.')
      .addButton((b) =>
        b.setButtonText('Delete…').setDestructive().onClick(() => {
          new DeleteAccountModal(this.app, this.plugin, () => this.rerender()).open();
        }),
      );
  }

  /** A section that could not load says so — and offers the one thing that helps. */
  private renderLoadFailure(host: HTMLElement, what: string, why: string, retry: () => void): void {
    new Setting(host)
      .setName(what)
      .setDesc(`Couldn't load — ${why}`)
      .addButton((b) => b.setButtonText('Retry').onClick(retry));
  }

  /** The web's General → Profile: your name (account/update) and what Myu knows of your career (account/career). */
  private async renderProfile(nameHost: HTMLElement, careerHost: HTMLElement): Promise<void> {
    const accountId = this.plugin.settings.account_id;
    if (!accountId) return;
    const retry = () => {
      nameHost.empty();
      careerHost.empty();
      void this.renderProfile(nameHost, careerHost);
    };
    const [self, career] = await Promise.all([
      this.plugin.backend.getSelfCard().catch(() => null),
      this.plugin.backend.getAccountCareer(accountId).catch(() => null),
    ]);
    const why = loadFailure(self);
    if (why) {
      this.renderLoadFailure(nameHost, 'Your name', why, retry);
      return;
    }
    const current = (self?.data as { card?: { header?: { display_name?: string } } } | null)?.card?.header?.display_name ?? '';
    let name = current;
    new Setting(nameHost)
      .setName('Your name')
      .setDesc('How Myu writes you into your own notes.')
      .addText((t) => t.setPlaceholder('Your name').setValue(current).onChange((v) => { name = v; }))
      .addButton((b) => b.setButtonText('Save').onClick(async () => {
        const trimmed = name.trim();
        if (!trimmed || trimmed === current) return;
        const r = await this.plugin.backend.updateAccountName(accountId, trimmed);
        if (r.ok && r.data?.success !== false) notifyStatus('Name saved.'); else notifyError(r.data?.message || "Couldn’t save the name.");
      }));
    // The career row exists only when Myu knows something. A fetch that failed
    // reads as "nothing known" here — accepted for a supplementary row; the
    // name row above is the one that says so and carries the retry.
    const c = career?.data;
    if (c && c.status !== 'no_data' && (c.summary || c.resume_summary || c.linkedin_data_id || c.linkedin_id)) {
      const handle = c.linkedin_id || c.linkedin_data_id;
      const row = new Setting(careerHost).setName('Career, as Myu knows it').setDesc((c.summary || c.resume_summary || '').slice(0, 280));
      if (handle) row.addButton((b) => b.setButtonText('LinkedIn').onClick(() => window.open(`https://linkedin.com/in/${encodeURIComponent(handle)}`, '_blank')));
    }
  }

  /**
   * Devices holding custody, with the revoke.
   *
   * This is the kill switch the listing copy already promises — "removing this
   * device in askMyu deletes the wrapping key, which makes the local blob
   * permanently inert." Until now the plugin could only ever be ON the
   * receiving end of that. THIS device is marked and cannot be revoked from
   * here: pulling your own custody out from under yourself mid-session is a
   * footgun, and Disconnect above already does the local half honestly.
   */
  private async renderDevices(host: HTMLElement): Promise<void> {
    const res = await this.plugin.backend.listDevices().catch(() => null);
    const why = loadFailure(res);
    if (why) {
      // Never "no other devices" on a refused fetch: that reads as a fact, and
      // a reader with nine devices acted on it (live, 2026-09-03).
      this.renderLoadFailure(host, 'Devices', why, () => {
        host.empty();
        void this.renderDevices(host);
      });
      return;
    }
    const devices = res?.data?.devices ?? [];
    const mine = this.plugin.settings.device_id;

    if (devices.length === 0) {
      new Setting(host).setName('Devices').setDesc('askMyu lists no devices for this account yet.');
      return;
    }

    new Setting(host)
      .setName('Devices')
      .setDesc(`${devices.length} device${devices.length === 1 ? '' : 's'} can open your content. Removing one makes its stored copy permanently unreadable.`);

    for (const device of devices) {
      const id = String(device.device_id ?? '');
      if (!id) continue;
      const name = String(device.device_name ?? device.device_type ?? 'Unnamed device');
      const isThis = mine !== null && id === mine;
      const lastUsed = parseWhen(firstPresent(device.last_used_at, device.last_seen_at, device.created_at));
      const when = lastUsed ? lastUsed.toISOString().slice(0, 10) : null;

      const row = new Setting(host)
        .setName(isThis ? `${name} — this vault` : name)
        .setDesc(when ? `Last used ${when}` : 'Never used');

      if (isThis) {
        row.addButton((b) => b.setButtonText('In use').setDisabled(true));
        continue;
      }
      row.addButton((b) =>
        b.setButtonText('Remove').setDestructive().onClick(async () => {
          const done = await this.plugin.backend.removeDevice(id);
          if (done.ok) {
            notifyStatus(`${name} removed — its stored copy can no longer be opened.`);
            this.rerender();
          } else {
            notifyError("Couldn't remove that device. Check the connection and try again.");
          }
        }),
      );
    }
  }

  /**
   * Login aliases (V046).
   *
   * No verify button: verification happens by clicking a link in an email, and
   * a vault cannot open mail. The row says so rather than offering a control
   * that could not work.
   */
  private async renderAccountEmails(host: HTMLElement): Promise<void> {
    const res = await this.plugin.backend.listAccountEmails().catch(() => null);
    const why = loadFailure(res);
    if (why) {
      this.renderLoadFailure(host, 'Email addresses', why, () => {
        host.empty();
        void this.renderAccountEmails(host);
      });
      return;
    }
    const emails = res?.data?.emails ?? [];

    new Setting(host)
      .setName('Email addresses')
      .setDesc('Any verified address can sign you in. Add one and Myu emails it a link to confirm.')
      .addButton((b) =>
        b.setButtonText('Add…').onClick(() => {
          new AddAccountEmailModal(this.app, this.plugin, () => this.rerender()).open();
        }),
      );

    for (const entry of emails) {
      const address = String(entry.email ?? '');
      if (!address) continue;
      const isPrimary = entry.is_primary === true;
      const verified = entry.verified === true;

      const row = new Setting(host)
        .setName(address)
        .setDesc(isPrimary ? 'Primary' : verified ? 'Verified' : 'Waiting for you to click the link Myu emailed');

      if (!verified) {
        row.addButton((b) =>
          b.setButtonText('Resend').onClick(async () => {
            await this.plugin.backend.resendAccountEmail(address);
            notifyStatus(`Sent another link to ${address}.`);
          }),
        );
      }
      if (verified && !isPrimary) {
        row.addButton((b) =>
          b.setButtonText('Make primary').onClick(async () => {
            await this.plugin.backend.setPrimaryAccountEmail(address);
            notifyStatus(`${address} is now your primary address.`);
            this.rerender();
          }),
        );
      }
      if (!isPrimary) {
        row.addButton((b) =>
          b.setButtonText('Remove').setDestructive().onClick(async () => {
            await this.plugin.backend.removeAccountEmail(address);
            notifyStatus(`${address} removed.`);
            this.rerender();
          }),
        );
      }
    }
  }

  /** How Myu addresses you, and how directly it speaks. Account state, so it
      is written back rather than mirrored (rule 3). */
  private async renderPreferences(host: HTMLElement): Promise<void> {
    const res = await this.plugin.backend.getAccountPreferences().catch(() => null);
    const why = loadFailure(res);
    if (why) {
      this.renderLoadFailure(host, 'What Myu calls you', why, () => {
        host.empty();
        void this.renderPreferences(host);
      });
      return;
    }
    // `{ preferences: {...} }` in both directions — see normalizePreferences,
    // which owns that knowledge so a test can reach it.
    const prefs = normalizePreferences(res?.data);
    const address = typeof prefs.preferred_address === 'string' ? prefs.preferred_address : '';
    const coaching = typeof prefs.coaching_preference === 'string' ? prefs.coaching_preference : 'auto';

    new Setting(host)
      .setName('What Myu calls you')
      .setDesc('In conversation. Leave empty and Myu uses your name.')
      .addText((t) =>
        t.setPlaceholder('E.g. Boss').setValue(address).onChange(async (value) => {
          await this.plugin.backend.updateAccountPreferences({ preferred_address: value.trim() });
        }),
      );

    new Setting(host)
      .setName('How directly Myu speaks')
      .setDesc('Auto follows the moment. The rest hold Myu to one register.')
      .addDropdown((d) =>
        d
          .addOptions({
            auto: 'Auto',
            socratic: 'Ask, don\'t tell',
            balanced: 'Balanced',
            directive: 'Say what you think',
            didactic: 'Teach me',
          })
          .setValue(coaching)
          .onChange(async (value) => {
            await this.plugin.backend.updateAccountPreferences({ coaching_preference: value });
            notifyStatus('Saved.');
          }),
      );
  }

  /**
   * The webapp's origin, derived from the configured API base.
   *
   * They share an origin — `myu.askmyu.com` serves both the app and `/api`.
   * This used to also rewrite `api.` → `myu.`, from when prod's API lived on a
   * separate host; that host is gone (2026-08-26) and the rewrite with it.
   */
  private webOrigin(): string {
    return this.plugin.settings.base_url.replace(/\/api\/?$/, '');
  }

  /** IMAP mailboxes, CalDAV calendars, Slack, Zulip — listed with remove/add. */
  private async renderOtherSources(host: HTMLElement): Promise<void> {
    const [imap, caldav, slack, zulip] = await Promise.all([
      this.plugin.backend.listGenericEmailAccounts().catch(() => null),
      this.plugin.backend.listCalDavAccounts().catch(() => null),
      this.plugin.backend.getSlackConnections().catch(() => null),
      this.plugin.backend.getZulipConnections().catch(() => null),
    ]);
    // A list that could not be fetched says so in its own row — never the
    // "nothing connected" copy, which invites connecting again. One retry
    // re-asks for all four: a refusal rarely comes alone.
    const retry = () => {
      host.empty();
      void this.renderOtherSources(host);
    };

    const imapWhy = loadFailure(imap);
    if (imapWhy) this.renderLoadFailure(host, 'Other email (IMAP)', imapWhy, retry);
    else {
      const imapRow = new Setting(host).setName('Other email (IMAP)');
      const imapAccounts = imap?.data?.accounts ?? [];
      imapRow.setDesc(
        imapAccounts.length > 0
          ? `Connected: ${imapAccounts.map((a) => a.email).filter(Boolean).join(', ')}`
          : 'Fastmail, Proton (bridge), your own server — any IMAP mailbox.',
      );
      for (const account of imapAccounts) {
        if (!account.credential_id) continue;
        const id = account.credential_id;
        imapRow.addButton((b) =>
          b.setButtonText(`Remove ${account.email ?? ''}`).onClick(async () => {
            await this.plugin.backend.removeGenericEmailAccount(id);
            notifyStatus('Removed.');
            this.rerender();
          }),
        );
      }
      imapRow.addButton((b) =>
        b.setButtonText('Add…').onClick(() => new AddSourceModal(this.app, this.plugin, 'imap', () => this.rerender()).open()),
      );
    }

    const caldavWhy = loadFailure(caldav);
    if (caldavWhy) this.renderLoadFailure(host, 'Other calendars (CalDAV)', caldavWhy, retry);
    else {
      const caldavRow = new Setting(host).setName('Other calendars (CalDAV)');
      const caldavAccounts = caldav?.data?.accounts ?? [];
      caldavRow.setDesc(
        caldavAccounts.length > 0
          ? `Connected: ${caldavAccounts.map((a) => a.email).filter(Boolean).join(', ')}`
          : 'Fastmail, iCloud, Nextcloud — any CalDAV calendar.',
      );
      for (const account of caldavAccounts) {
        if (!account.credential_id) continue;
        const id = account.credential_id;
        caldavRow.addButton((b) =>
          b.setButtonText(`Remove ${account.email ?? ''}`).onClick(async () => {
            await this.plugin.backend.removeCalDavAccount(id);
            notifyStatus('Removed.');
            this.rerender();
          }),
        );
      }
      caldavRow.addButton((b) =>
        b.setButtonText('Add…').onClick(() => new AddSourceModal(this.app, this.plugin, 'caldav', () => this.rerender()).open()),
      );
    }

    // Without an admin's approval (cold start): a private iCal address, or an
    // .ics export — read-only by construction, no OAuth, no admin.
    let icalUrl = '';
    new Setting(host)
      .setName('Calendar link')
      .setDesc('A private iCal address — Google Calendar: Settings → your calendar → secret address in iCal format; Outlook: Publish calendar. Read-only by construction.')
      .addText((t) => t.setPlaceholder('https://…/basic.ics').onChange((v) => { icalUrl = v.trim(); }))
      .addButton((b) => b.setButtonText('Read my week').onClick(async () => {
        if (!/^(https:\/\/|webcal:\/\/)/i.test(icalUrl)) { notifyError('Paste the full address — it starts with https://'); return; }
        const r = await this.plugin.backend.addIcalUrl(icalUrl).catch(() => null);
        if (r?.ok && r.data?.success !== false) { notifyStatus(`Calendar added — ${r.data?.events_stored ?? 0} events. Your week starts painting in Today.`); void this.plugin.refreshTodayNow(); }
        else notifyError(r?.data?.error || 'That address did not read as a calendar. Check it ends with .ics and try again.');
      }));
    new Setting(host)
      .setName('Calendar file')
      .setDesc('An .ics export from any calendar. Read once; nothing to revoke.')
      .addButton((b) => b.setButtonText('Upload an .ics…').onClick(async () => {
        const picked = await pickFile('.ics,text/calendar');
        if (!picked) return;
        const r = await this.plugin.backend.uploadIcs(picked.bytes).catch(() => null);
        if (r?.ok && r.data?.success !== false) { notifyStatus(`Calendar file read — ${r.data?.events_stored ?? 0} events. Your week starts painting in Today.`); void this.plugin.refreshTodayNow(); }
        else notifyError(r?.data?.error || 'That file did not read as a calendar export. Export an .ics and try again.');
      }));

    // Slack — the web's card: each workspace with its own Disconnect; Connect
    // opens Slack's consent screen (the return lands on the web's integrations
    // page; this list refreshes when the tab is reopened).
    const slackWhy = loadFailure(slack);
    if (slackWhy) this.renderLoadFailure(host, 'Slack', slackWhy, retry);
    else {
      const slackRows = (slack?.data?.connections ?? []).filter((c) => c.status !== 'disconnected');
      const slackRow = new Setting(host)
        .setName('Slack')
        .setDesc(slackRows.length > 0 ? `${slackRows.length} workspace${slackRows.length === 1 ? '' : 's'} connected.` : 'Myu reads the DMs and channels you choose. Consent happens on Slack’s own screen.');
      for (const c of slackRows) {
        const id = String(c.connection_id ?? '');
        if (!id) continue;
        new Setting(host)
          .setName(String(c.workspace_name ?? 'Workspace'))
          .setDesc([c.user_email, c.user_name].filter(Boolean).join(' · '))
          .addButton((b) => { let armed = false; b.setButtonText('Disconnect').onClick(async () => {
            if (!armed) { armed = true; b.setButtonText('Disconnect — sure?').setDestructive(); return; }
            const r = await this.plugin.backend.slackDisconnect(id);
            if (r.ok) { notifyStatus('Slack workspace disconnected.'); this.rerender(); } else notifyError("Couldn’t disconnect.");
          }); });
      }
      slackRow.addButton((b) => b.setButtonText(slackRows.length ? 'Connect another…' : 'Connect…').onClick(async () => {
        const r = await this.plugin.backend.slackConnect().catch(() => null);
        const url = r?.data?.authorization_url;
        if (r?.ok && url) { window.open(url, '_blank'); notifyStatus('Finish on Slack’s screen; the workspace shows here when you reopen settings.'); }
        else notifyError('Could not start the Slack connect.');
      }));
    }

    // Zulip — the web's card: a form (realm URL, email, API key) and per-realm Disconnect.
    const zulipWhy = loadFailure(zulip);
    if (zulipWhy) this.renderLoadFailure(host, 'Zulip', zulipWhy, retry);
    else {
      const zulipRows = (zulip?.data?.connections ?? []).filter((c) => c.status !== 'disconnected');
      const zulipRow = new Setting(host)
        .setName('Zulip')
        .setDesc(zulipRows.length > 0 ? `${zulipRows.length} organization${zulipRows.length === 1 ? '' : 's'} connected.` : 'Connects with a bot email and API key from your Zulip settings.');
      for (const c of zulipRows) {
        const id = String(c.connection_id ?? '');
        if (!id) continue;
        new Setting(host)
          .setName(String(c.workspace_name ?? c.workspace_id ?? 'Organization'))
          .setDesc([c.user_email, c.user_name].filter(Boolean).join(' · '))
          .addButton((b) => { let armed = false; b.setButtonText('Disconnect').onClick(async () => {
            if (!armed) { armed = true; b.setButtonText('Disconnect — sure?').setDestructive(); return; }
            const r = await this.plugin.backend.zulipDisconnect(id);
            if (r.ok) { notifyStatus('Zulip organization disconnected.'); this.rerender(); } else notifyError("Couldn’t disconnect.");
          }); });
      }
      zulipRow.addButton((b) => b.setButtonText(zulipRows.length ? 'Connect another…' : 'Connect…').onClick(() => new ZulipConnectModal(this.app, this.plugin, () => this.rerender()).open()));
    }
  }

  /**
   * Async: the card says CONNECTED — as whom — or offers Connect…; and when
   * the status call was refused it says THAT. A refused call used to paint
   * "Connect…" over an account that was already syncing (live, 2026-09-03):
   * the reader saw the service rows syncing under a card inviting a connect.
   */
  private async renderIntegrationStatus(row: Setting, provider: 'google' | 'microsoft', host: HTMLElement): Promise<void> {
    const res = provider === 'google'
      ? await this.plugin.backend.googleOAuthStatus().catch(() => null)
      : await this.plugin.backend.microsoftOAuthStatus().catch(() => null);
    const why = loadFailure(res);
    if (why) {
      row.setDesc(`Couldn't check whether it is connected — ${why}`);
      row.addButton((b) =>
        b.setButtonText('Retry').onClick(() => {
          row.controlEl.empty();
          row.setDesc(INTEGRATION_CARDS[provider].desc);
          host.empty();
          void this.renderIntegrationStatus(row, provider, host);
        }),
      );
      return;
    }
    const connected = res?.data?.connected === true;
    const creds = (res?.data?.credentials ?? []).filter((c) => c.email || c.credential_id);
    const split = res?.data?.split_consent === true;
    if (connected) {
      // "Connected" leads, whatever the consent shape — the split-consent copy
      // used to REPLACE it, so a connected card never said so.
      const who = creds.length === 1 ? `as ${creds[0]?.email ?? 'one account'}` : `— ${creds.length} accounts`;
      row.setDesc(
        split
          ? `Connected ${who}. Read-only — Myu prepares and never sends. Each piece below is its own permission.`
          : `Connected ${who}. Myu is reading calendar and mail from it.`,
      );
      // The web's connection card: one row per signed-in account, with Set
      // primary and a two-press Disconnect (the web confirms inline too).
      for (const c of creds) {
        if (!c.credential_id) continue;
        const id = c.credential_id;
        const line = new Setting(host).setName(c.email ?? id).setDesc(c.is_primary ? 'Primary — meetings and mail are read from this account first.' : '');
        if (!c.is_primary) line.addButton((b) => b.setButtonText('Set primary').onClick(async () => {
          const r = provider === 'google' ? await this.plugin.backend.googleSetPrimaryCredential(id) : await this.plugin.backend.microsoftSetPrimaryCredential(id);
          if (r.ok && r.data?.success !== false) { notifyStatus(r.data?.message || 'Primary set.'); this.rerender(); } else notifyError(r.data?.error || "Couldn’t set primary.");
        }));
        // Scope-aware rows (cold start, slice 2): Calendar · Mail · Meeting notes,
        // each with its state and — with split consent — its own Connect.
        if (c.services) this.renderServiceRows(host, provider, c.services, split, c.credential_id);
        line.addButton((b) => {
          let armed = false;
          b.setButtonText('Disconnect').onClick(async () => {
            if (!armed) { armed = true; b.setButtonText('Disconnect — sure?').setDestructive(); return; }
            const r = provider === 'google' ? await this.plugin.backend.googleOAuthDisconnect(id) : await this.plugin.backend.microsoftOAuthDisconnect(id);
            if (r.ok && r.data?.success !== false) { notifyStatus(r.data?.message || 'Disconnected.'); this.rerender(); } else { notifyError(r.data?.error || "Couldn’t disconnect."); armed = false; b.setButtonText('Disconnect'); }
          });
        });
      }
      row.addButton((b) => b.setButtonText('Connect another…').onClick(() => void this.startOAuth(provider)));
    } else {
      row.addButton((b) => b.setButtonText('Connect…').onClick(() => void this.startOAuth(provider)));
    }
  }

  private renderServiceRows(host: HTMLElement, provider: 'google' | 'microsoft', services: NonNullable<NonNullable<OAuthStatusResult['credentials']>[number]['services']>, split: boolean, credentialId: string | undefined): void {
    const rows: Array<[string, keyof typeof services, ScopeSet, string]> = [
      ['Calendar', 'calendar', 'calendar', 'Not yet \u2014 who you are meeting, and the homework before each one'],
      ['Mail', 'mail', 'history', 'Not yet \u2014 where you left off with people, what you owe and are owed'],
      [provider === 'google' ? 'Meeting notes (Drive)' : 'Meeting notes', 'meeting_notes', 'history', 'Not yet \u2014 decisions and commitments from your meeting notes, automatically'],
    ];
    let anyNot = false;
    for (const [name, key, scope, notYet] of rows) {
      const svc = services[key];
      const state = svc?.state ?? 'not_yet';
      const sub = state === 'connected'
        ? [svc?.last_sync_at ? `synced ${ago(svc.last_sync_at)}` : 'connected', key === 'calendar' && svc?.events_synced != null ? `${svc.events_synced} events` : '', key === 'mail' && svc?.understood_back_to ? `understood back to ${svc.understood_back_to}${svc.still_reading ? ' \u00b7 still reading' : ''}` : ''].filter(Boolean).join(' \u00b7 ')
        : state === 'needs_reconnect' ? 'Stopped syncing \u2014 the permission expired' : notYet;
      const r = new Setting(host).setName(name).setDesc(sub);
      if (state === 'connected' && key === 'mail' && credentialId) {
        // The mail cap (cold start): how far back Myu reads. Verified servlet:
        // {credential_id, mail_oldest_date: YYYY-MM-DD | null} → {success}.
        const current = svc?.oldest_date_limit ?? '';
        r.addDropdown((d) => {
          d.addOption('', 'Read everything');
          for (const m of [3, 6, 12, 24]) d.addOption(String(m), `Stop at ${m} months back`);
          d.setValue(current ? String(monthsBack(current)) : '').onChange(async (v) => {
            const ymd = v ? ymdMonthsAgo(Number(v)) : null;
            const res = await this.plugin.backend.setMailOldestDate(provider, credentialId, ymd).catch(() => null);
            if (res?.ok && res.data?.success !== false) notifyStatus(ymd ? `Myu reads mail back to ${ymd}, no further.` : 'Myu reads all of it.');
            else notifyError(res?.data?.error || 'That did not save. Try again.');
          });
        });
      }
      if (state === 'connected') r.addExtraButton((b) => b.setIcon('check').setTooltip('Connected').setDisabled(true));
      else if (state === 'needs_reconnect') r.addButton((b) => b.setButtonText('Reconnect').setDestructive().onClick(() => void this.startOAuth(provider, { scopeSet: 'all' })));
      else { anyNot = true; if (split) r.addButton((b) => b.setButtonText(key === 'calendar' ? 'Connect calendar' : key === 'mail' ? 'Connect mail' : 'Connect notes').onClick(() => void this.startOAuth(provider, { scopeSet: scope }))); }
    }
    if (anyNot && split) new Setting(host).setName('Connect everything').setDesc('One consent for calendar, mail and meeting notes.').addButton((b) => b.setButtonText('Connect everything\u2026').onClick(() => void this.startOAuth(provider, { scopeSet: 'all' })));
  }

  private async startOAuth(provider: 'google' | 'microsoft', opts: OAuthInitOptions = {}): Promise<void> {
    const init = provider === 'google' ? await this.plugin.backend.googleOAuthInit(opts) : await this.plugin.backend.microsoftOAuthInit(opts);
    const url = init.data?.auth_url;
    if (init.ok && url) window.open(url, '_blank');
    else notifyStatus('Could not start the connect — check the connection.');
  }

  /** Async section: fetch pending transfer requests, render approve/deny rows. */
  private async renderPendingApprovals(root: HTMLElement): Promise<void> {
    const host = root.createDiv();
    const res = await this.plugin.backend.getPendingTransfers().catch(() => null);
    const pending = res?.data?.pending_requests ?? [];
    if (pending.length === 0) return;

    for (const request of pending) {
      const row = new Setting(host)
        .setName(`“${request.device_name ?? 'A device'}” wants to join`)
        .setDesc('Type the 4-digit code shown on that device to let it in — its own key custody, revocable any time.');
      row.addButton((b) =>
        b.setButtonText('Deny').onClick(async () => {
          await this.plugin.backend.denyDeviceTransfer(request.request_id);
          notifyStatus('Denied.');
          this.rerender();
        }),
      );
      row.addButton((b) =>
        b
          .setButtonText('Approve…')
          .setCta()
          .onClick(() => {
            if (!request.public_key) {
              notifyStatus('This request is from an older app version — approve it from the web instead.');
              return;
            }
            new ApproveDeviceModal(this.app, this.plugin, request.request_id, request.public_key, () =>
              this.rerender(),
            ).open();
          }),
      );
    }
  }

  /**
   * The Myu look: install, turn on/off, update, remove — a CSS snippet in the
   * reader's own config folder, written only when they press the button, and
   * undone from the same row. Bundled with the build (no network), so what
   * this row installs is the look for the plugin they are running.
   */
  private async renderLook(host: HTMLElement): Promise<void> {
    const installer = this.plugin.lookInstaller();
    const path = installer.path();
    const again = () => {
      host.empty();
      void this.renderLook(host);
    };
    let standing;
    try {
      standing = await installer.standing();
    } catch {
      this.renderLoadFailure(host, 'Myu look', 'the snippets folder could not be read.', again);
      return;
    }
    const on = installer.isOn();
    const row = new Setting(host).setName('Myu look');
    const linkToFile = () => {
      row.descEl.appendText(' ');
      row.descEl.createEl('a', { text: 'The file on GitHub', href: MYU_LOOK_URL, attr: { target: '_blank', rel: 'noopener' } });
    };
    const install = async () => {
      const r = await installer.install().catch(() => null);
      if (r === 'installed') notifyStatus('The Myu look is on. Turn it off or remove it from this row.');
      else if (r === 'installed_off') notifyStatus(`Installed at ${path}. Turn it on under Appearance \u2192 CSS snippets.`);
      else notifyError('Could not write the snippet. Check the vault folder is writable.');
      again();
    };

    if (standing.state === 'absent') {
      row.setDesc(`Myu\u2019s own look on Myu\u2019s panes only \u2014 cyan and amber, a serif voice. Optional: your theme stays yours. Installs as a CSS snippet at ${path}, yours to edit, turn off, or remove.`);
      linkToFile();
      row.addButton((b) => b.setButtonText('Install the look').setCta().onClick(() => void install()));
      return;
    }

    if (standing.state === 'current') {
      row.setDesc(
        on === false
          ? `Installed from ${standing.version}, off. The file is ${path} \u2014 yours to edit.`
          : `Installed from ${standing.version}${on ? ' and on' : ''}. The file is ${path} \u2014 yours to edit; an edit is kept until you update it here.`,
      );
      if (on !== null) row.addButton((b) => b.setButtonText(on ? 'Turn off' : 'Turn on').onClick(async () => { await installer.setOn(!on).catch(() => undefined); again(); }));
      row.addButton((b) =>
        b.setButtonText('Remove').setDestructive().onClick(async () => {
          await installer.remove().catch(() => undefined);
          notifyStatus('The Myu look is gone. Install it again any time.');
          again();
        }),
      );
      return;
    }

    // A copy from an older build, or one the reader edited or wrote: never replaced or deleted without asking.
    row.setDesc(`${standing.version ? `A copy from ${standing.version}` : 'A copy Myu did not write'} is at ${path}. Updating replaces it with this build\u2019s look, edits included.`);
    row.addButton((b) =>
      b.setButtonText('Update the look').onClick(() =>
        new PersonActionConfirmModal(
          this.app,
          { title: 'Replace the installed look?', body: `${path} is replaced with the look for ${this.plugin.manifest.version}. Any edits you made to it are lost \u2014 copy them out first if you want them.`, cta: 'Replace it' },
          (yes) => { if (yes) void install(); },
        ).open(),
      ),
    );
    row.addButton((b) =>
      b.setButtonText('Remove').setDestructive().onClick(() =>
        new PersonActionConfirmModal(
          this.app,
          { title: 'Remove the look?', body: `${path} is deleted. It may carry edits of yours.`, cta: 'Remove it' },
          async (yes) => { if (!yes) return; await installer.remove().catch(() => undefined); notifyStatus('The Myu look is gone.'); again(); },
        ).open(),
      ),
    );
  }

  // ── connection ────────────────────────────────────────────────────────────

  private renderConnection(root: HTMLElement): void {

    const state = this.plugin.unlock.current;
    const status = root.createDiv({ cls: 'myu-status' });
    status.createSpan({ cls: 'myu-status-label', text: 'status' });
    status.createSpan({ cls: 'myu-status-value', text: describeState(state, this.plugin.lastStateDetail) });

    // Which build is LOADED (not which is on disk) — the running plugin
    // stamps itself, so a stale window is visible instead of a mystery.
    const build = root.createDiv({ cls: 'myu-status' });
    build.createSpan({ cls: 'myu-status-label', text: 'build' });
    build.createSpan({ cls: 'myu-status-value', text: BUILD_STAMP });

    if (this.plugin.unlock.genesisPending) {
      // Signup's ceremony was closed mid-way: session exists, keys don't.
      new Setting(root)
        .setName('Finish creating your keys')
        .setDesc('Your account is waiting on the twelve-word step — two minutes, then everything works.')
        .addButton((b) =>
          b.setButtonText('Finish setup…').setCta().onClick(() => this.plugin.openGenesisCeremony()),
        );
    }

    if (state === 'unlocked' && this.plugin.onboardingComplete === false) {
      // P10 — the server says the arc/moment never happened. Resumable from
      // here forever, exactly like the genesis-pending row: server truth
      // drives the affordance, so it disappears the moment any surface
      // completes it (and never nags once it has).
      new Setting(root)
        .setName('Tell Myu who you are')
        .setDesc(
          'Your notes teach Myu what you did — not where you are right now. ' +
          'Two minutes: your arc and your current moment. Briefs get sharper the same day.',
        )
        .addButton((b) => b.setButtonText('Start…').setCta().onClick(() => this.plugin.openOnboarding(() => this.rerender())));
    }

    if (state !== 'disconnected' && this.plugin.settings.recovery_pending) {
      // P9 — the deferred hardening prompt. Honest about the stakes, never a
      // wall: the account works fully without it.
      new Setting(root)
        .setName('Add a recovery method')
        .setDesc(
          'Your key lives on this device. Until a recovery method exists, losing ' +
          'it means bringing your vault in again. Twelve words, two minutes, ' +
          'right here — or a passkey on the web.',
        )
        .addButton((b) =>
          b
            .setButtonText('Set up recovery phrase…')
            .setCta()
            .onClick(() => new SetupRecoveryModal(this.app, this.plugin, () => this.rerender()).open()),
        )
        .addButton((b) =>
          b.setButtonText('I used the web instead').onClick(async () => {
            this.plugin.settings.recovery_pending = false;
            await this.plugin.saveSettings();
            this.rerender();
          }),
        );
    }

    if (state === 'unlocked') {
      // The APPROVING side of device transfer (gateway primacy: a vault-primary
      // user welcomes their NEXT device — their phone — from the vault, no
      // recovery phrase needed). Rows appear when another device has asked in.
      void this.renderPendingApprovals(root);
    }

    if (state === 'unlocked') {
      // The Google connect — earned, not demanded (vault-only start is a full
      // citizen). One browser hop for the consent screen; the callback lands
      // on /connected/obsidian, which deep-links straight back here.
      const googleRow = new Setting(root).setName(INTEGRATION_CARDS.google.name).setDesc(INTEGRATION_CARDS.google.desc);
      const googleCreds = root.createDiv();
      const microsoftRow = new Setting(root).setName(INTEGRATION_CARDS.microsoft.name).setDesc(INTEGRATION_CARDS.microsoft.desc);
      const microsoftCreds = root.createDiv();
      // STATUS-AWARE (live finding, 2026-08-25: an already-connected account
      // was shown "Connect…", reading as never-synced). Async fill-in — the
      // rows render immediately, the verdict lands a beat later.
      void this.renderIntegrationStatus(googleRow, 'google', googleCreds);
      void this.renderIntegrationStatus(microsoftRow, 'microsoft', microsoftCreds);

      // The rest of the data sources — full controls, not mirrors (the
      // parity-ledger item, 2026-08-25). IMAP + CalDAV are credential POSTs
      // any surface can make; Slack's OAuth lives on the web, so its card is
      // status + the door.
      const sourcesHost = root.createDiv();
      void this.renderOtherSources(sourcesHost);
    }

    if (state !== 'disconnected') {
      // The account-level background-work switch — a REAL toggle. It was
      // display-only for months on the theory that "the ceremony is the
      // webapp's"; the endpoint is a plain authenticated POST any surface can
      // call, and gateway primacy means the vault doesn't get read-only
      // mirrors of its own account (operator call, 2026-08-25). Server-side,
      // OFF is a kill switch: warm account escrow purged immediately.
      // The delivered-offer master switch (offer delta #3): the same boolean the
      // web and mobile toggles write; stopped_ack points users here.
      new Setting(root)
        .setName('Offers in conversation')
        .setDesc('Myu occasionally offers to connect a calendar, mail or notes right in the conversation. Off: it stops asking; everything stays connectable here.')
        .addToggle((t) =>
          t.setValue((this.plugin.onboardingScripts?.offer_all_stopped as boolean | undefined) !== true).onChange(async (v) => {
            const accountId = this.plugin.settings.account_id;
            if (!accountId) return;
            await this.plugin.backend.updateAccountState(accountId, { myuScripts: { offer_all_stopped: !v } }).catch(() => undefined);
            await this.plugin.refreshOnboardingState();
          }),
        );

      const consented = this.plugin.settings.background_work_consented;
      new Setting(root)
        .setName('Work between visits')
        .setDesc(
          consented === true
            ? 'On — Myu can keep working on your notes while you are away (compositions, extraction, cards). Turning off stops it immediately.'
            : 'Off — Myu works on your notes only while you are here. Turn on and Myu can prepare things between visits.',
        )
        .addToggle((tg) =>
          tg.setValue(consented === true).onChange(async (v) => {
            const res = await this.plugin.backend.setBackgroundWorkConsent(v);
            if (res.ok) {
              this.plugin.settings.background_work_consented = res.data?.background_work_consented ?? v;
              await this.plugin.saveSettings();
              this.rerender();
            } else {
              notifyStatus('Could not change it — check the connection.');
              tg.setValue(consented === true);
            }
          }),
        );
    }

    if (state === 'disconnected') {
      // P9 — gateway primacy: for the person who arrived THROUGH Obsidian,
      // the account starts here. The token card below is for existing users.
      new Setting(root)
        .setName('New to Myu?')
        .setDesc('Create your account right here — no website first. Vault-only start is fine.')
        .addButton((b) =>
          b
            .setButtonText('Create my account…')
            .setCta()
            .onClick(() => new SignupModal(this.app, this.plugin, () => this.rerender()).open()),
        );

      let pasted = '';
      new Setting(root)
        .setName('Plugin token')
        .setDesc('Already use Myu? Create a token in askMyu → settings → integrations. You will only see it once.')
        .addText((t) => {
          t.setPlaceholder('Paste the token').onChange((v) => {
            pasted = v.trim();
          });
          t.inputEl.type = 'password';
          t.inputEl.addClass('myu-token-input');
        })
        .addButton((b) =>
          b
            .setButtonText('Connect')
            .setCta()
            .onClick(async () => {
              if (!pasted) return;
              await this.plugin.connect(pasted);
              this.rerender();
            }),
        );
      return;
    }

    if (state === 'blocked' && !this.plugin.unlock.genesisPending) {
      const inFlight = this.plugin.unlock.approval;
      new Setting(root)
        .setName('Approve this device')
        .setDesc(
          inFlight?.status === 'pending'
            ? `Waiting for approval — enter ${inFlight.code} on a device that is already signed in. It finishes on its own; the Today pane shows the same code.`
            : 'Your notes are encrypted with a key only your devices hold. Approve this ' +
                'one from a device you are already signed in on, or use your recovery phrase.',
        )
        .addButton((b) =>
          b
            .setButtonText('Approve')
            .setCta()
            .onClick(() => {
              new ApprovalModal(this.app, this.plugin.unlock, () => this.rerender()).open();
            }),
        );
    }

    if (state === 'relocked') {
      new Setting(root)
        .setName('Locked until this device reaches askMyu')
        .setDesc(
          'This vault holds your notes encrypted; the key that opens them is on the ' +
            'server, fetched fresh each time Obsidian starts. Capture is paused until then.',
        )
        .addButton((b) =>
          b.setButtonText('Try now').onClick(async () => {
            await this.plugin.unlock.unlockFromServerKEK();
            this.rerender();
          }),
        );
    }

    new Setting(root)
      .setName('Disconnect')
      .setDesc('Clears this vault\'s token and its encrypted key material. Your notes are untouched.')
      .addButton((b) =>
        b.setDestructive().setButtonText('Disconnect').onClick(async () => {
          await this.plugin.unlock.disconnect();
          notifyStatus('askMyu disconnected. Nothing further leaves this vault.');
          this.rerender();
        }),
      );
  }

  // ── sharing (the allowlist — consent lives here) ──────────────────────────

  private renderSharing(root: HTMLElement): void {

    const { allowlist_folders, allowlist_tags } = this.plugin.settings;
    const nothingShared = allowlist_folders.length === 0 && allowlist_tags.length === 0;

    if (nothingShared) {
      root.createEl('p', {
        cls: 'myu-prose myu-quiet',
        text:
          'Nothing. No folder or tag is shared, so the vault watcher is not running ' +
          'and no note has been read.',
      });
    } else {
      const list = root.createDiv({ cls: 'myu-list' });
      for (const folder of allowlist_folders) {
        list.createDiv({ cls: 'myu-list-row' }).createSpan({ text: `${folder}/` });
      }
      for (const tag of allowlist_tags) {
        list.createDiv({ cls: 'myu-list-row' }).createSpan({ text: `#${tag}` });
      }
      root.createEl('p', {
        cls: 'myu-prose myu-quiet',
        text: 'Any note with `myu: false` in its frontmatter is skipped, wherever it lives.',
      });
    }

    new Setting(root)
      .setName('Choose what to share')
      .setDesc('Pick the folders and tags Myu may read. Nothing outside them is ever opened.')
      .addButton((b) =>
        b
          .setButtonText(nothingShared ? 'Choose folders' : 'Change')
          .setCta()
          .onClick(() => {
            new ConsentModal(this.app, this.plugin, () => this.rerender()).open();
          }),
      );
  }

  // ── meeting notes (second allowlist — its own consent) ────────────────────

  private renderMeetingNotes(root: HTMLElement): void {

    const folders = this.plugin.settings.meeting_folders;
    root.createEl('p', {
      cls: 'myu-prose myu-quiet',
      text:
        folders.length === 0
          ? 'Off. No meeting-notes folder is shared; notes can still opt in one at a time with `myu-meeting: true`.'
          : `Sharing: ${folders.map((f) => `${f}/`).join(', ')} — processed server-side like every meeting source.`,
    });

    new Setting(root)
      .setName('Choose meeting-notes folders')
      .setDesc('A separate consent from journal capture — meeting notes are a different kind of data.')
      .addButton((b) =>
        b.setButtonText(folders.length === 0 ? 'Choose folders' : 'Change').onClick(() => {
          new MeetingConsentModal(this.app, this.plugin, () => this.rerender()).open();
        }),
      );
  }

  // ── the one vault write ───────────────────────────────────────────────────

  private renderWeeklyReview(root: HTMLElement): void {

    const enabled = this.plugin.settings.weekly_review_enabled;

    root.createEl('p', {
      cls: 'myu-prose myu-quiet',
      text: enabled
        ? 'Myu adds a short section to your weekly note when you ask it to. It is the only thing Myu writes into your vault.'
        : 'Off. Myu writes nothing into your vault — its reads live in panes that close.',
    });

    new Setting(root)
      .setName('Write a weekly review into my weekly note')
      .setDesc('Movement across your relationships, as counts. Opt-in, and never automatic.')
      .addToggle((t) =>
        t.setValue(enabled).onChange((wanted) => {
          if (!wanted) {
            void (async () => {
              this.plugin.settings.weekly_review_enabled = false;
              await this.plugin.saveSettings();
              this.rerender();
            })();
            return;
          }
          // Turning it ON always goes through the exposure warning — a toggle is
          // too small a gesture for a permanent, syncing artefact.
          this.plugin.offerWeeklyReview(() => this.rerender());
        }),
      );

    if (enabled) {
      new Setting(root)
        .setName("Write this week's now")
        .addButton((b) => b.setButtonText('Write it').onClick(() => void this.plugin.writeWeeklyReview()));
    }
  }

  // ── advanced ──────────────────────────────────────────────────────────────

  private renderAdvanced(root: HTMLElement): void {

    // The Myu look lives outside the plugin now — snippets/myu-look.css, the
    // way Tasks and Minimal ship optional styling: the plugin exposes stable
    // `.myu-*` classes; the look is the user's file to keep or edit.
    new Setting(root).setName('Your data').setHeading();
    new Setting(root)
      .setName('Export everything into the vault')
      .setDesc('Every surface, every conversation, every canvas that still exists \u2014 as files under Myu/, with a receipt (Myu/Export.md) that says what landed and what did not.')
      .addButton((b) => b.setButtonText('Export now').onClick(() => void this.plugin.exportEverything()));
    new Setting(root)
      .setName('Request my data archive')
      .setDesc('Everything the server holds, as one encrypted zip: link by email, passphrase shown once. The part no vault file can carry \u2014 account, devices, keys.')
      .addButton((b) => b.setButtonText('Request\u2026').onClick(() => this.plugin.openDataExport()));
    new Setting(root)
      .setName('Remove everything Myu wrote')
      .setDesc('Every page, note, table and canvas Myu wrote goes to the trash (recoverable). Your own notes are untouched. Turn writing off above first if you want it to stay gone.')
      .addButton((b) => b.setButtonText('Remove\u2026').setDestructive().onClick(() => this.plugin.removeEverythingMyuWrote()));
    new Setting(root)
      .setName('If you uninstall')
      .setDesc('Everything under Myu/ stays exactly as it is and needs no plugin to open. Notes stop refreshing; nothing breaks. The plugin\u2019s own data.json (your token and wrapped key) goes with it, so no custody is left on this device. Your account is untouched \u2014 delete it above, or on the web.');

    const lookHost = root.createDiv();
    void this.renderLook(lookHost);

    new Setting(root)
      .setName('Subscription')
      .setDesc('Billing lives with the payment provider — one door, on the web.')
      .addButton((b) =>
        b.setButtonText('Manage on the web').onClick(() => {
          window.open(`${this.webOrigin()}/settings/subscription`, '_blank');
        }),
      );

    new Setting(root)
      .setName('Quiet period before capture')
      .setDesc('Seconds of no editing before a note is sent. Notes are living documents; short values capture half-sentences.')
      .addText((t) =>
        t.setValue(String(this.plugin.settings.quiescence_seconds)).onChange(async (v) => {
          const parsed = Number.parseInt(v, 10);
          if (Number.isFinite(parsed) && parsed >= 10) {
            this.plugin.settings.quiescence_seconds = parsed;
            await this.plugin.saveSettings();
          }
        }),
      );

    const queued = this.plugin.settings.queue.length;
    if (queued > 0) {
      new Setting(root)
        .setName('Waiting to send')
        .setDesc(`${queued} encrypted ${queued === 1 ? 'note is' : 'notes are'} queued — they go out when this device reconnects.`)
        .addButton((b) =>
          b.setButtonText('Send now').onClick(async () => {
            await this.plugin.capture.flushQueue();
            this.rerender();
          }),
        );
    }

    // Development doors, collapsed so nobody trips on them (operator call,
    // 2026-08-31: "i just dont want ppl getting confused"). Everything inside
    // is still plain settings — the disclosure is native <details>, keyboard
    // and screen-reader friendly, closed unless a NON-DEFAULT value is live
    // (someone already on a dev stack should see where that is set).
    const dev = root.createEl('details', { cls: 'myu-dev-doors' });
    if (this.plugin.settings.use_mock_backend || this.plugin.settings.base_url !== DEFAULT_SETTINGS.base_url) dev.setAttribute('open', '');
    dev.createEl('summary', { text: 'Development' });
    new Setting(dev)
      .setName('Backend URL')
      .setDesc('Change only if you are pointing at a development stack.')
      .addText((t) =>
        t
          .setValue(this.plugin.settings.base_url)
          .setPlaceholder('https://myu.askmyu.com/api')
          .onChange(async (v) => {
            this.plugin.settings.base_url = v.trim();
            await this.plugin.saveSettings();
            this.plugin.transport.setBaseUrl(this.plugin.settings.base_url);
          }),
      );
    new Setting(dev)
      .setName('Use mock backend')
      .setDesc('Runs against an in-memory stand-in instead of askMyu. For development before the server endpoints land.')
      .addToggle((t) =>
        t.setValue(this.plugin.settings.use_mock_backend).onChange(async (v) => {
          this.plugin.settings.use_mock_backend = v;
          await this.plugin.saveSettings();
          notifyStatus('Reload Obsidian for the backend change to take effect.');
        }),
      );
  }
}

function describeState(state: string, detail: string | null): string {
  if (detail === 'offline') return 'waiting for network';
  switch (state) {
    case 'unlocked':
      return 'connected';
    case 'relocked':
      return 'locked — needs the network to reopen';
    case 'blocked':
      if (detail === 'genesis_pending') return 'one step left — the twelve words';
      if (detail === 'genesis_failed') return 'key setup didn’t finish — try again';
      if (detail === 'existing_account') return 'welcome back — approve this device or use your phrase';
      return detail === 'device_revoked' ? 'this device was removed — approve it again' : 'needs approval';
    default:
      return 'not connected';
  }
}
