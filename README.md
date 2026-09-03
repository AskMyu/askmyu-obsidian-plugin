# askMyu — Obsidian plugin

Capture your journal notes to askMyu, encrypted before they leave, and read your
day beside your vault.

Working home: `packages/obsidian` in the `askmyu-frontend` monorepo. The public
mirror (`AskMyu/askmyu-obsidian-plugin`) carries the same source plus the three release
artifacts — `main.js`, `manifest.json`, `styles.css`.

## What it does

- **Prep.** A pane with Myu's read before each meeting — the signal, the read,
  the one move — claims rendered exactly as the server gated them. Unresolved
  meetings ask `who is this? ▸` instead of guessing.
- **Chat.** Talk to Myu beside your notes: about a note, a selection, a person's
  card, a prep. First-class conversation, same contract as the web app.
- **Live Today.** The brief, the meeting rail, the week, the monthly mirror —
  refreshed ambiently, updated live over SSE, cues as pane rows (never popups).
- **Capture (B1).** Notes in the folders *you choose* are encrypted on this
  device and sent to askMyu when they go quiet. One note stays one entry, however
  many times you edit it. Notes keep their own dates, so backfilled history
  arrives as history.
- **Meeting notes (opt-in, separate consent).** Notes in folders you choose (or
  tagged `myu-meeting: true`) become meetings Myu understands — decisions,
  owners, follow-ups. **This content is processed on askMyu's servers like every
  meeting source (it is not end-to-end encrypted like journal capture)** — the
  consent screen says exactly that before anything is shared.
- **Save to vault (opt-in, per item).** A composition as an Obsidian `.canvas`;
  a conversation as a note. Always behind an exposure warning, never automatic,
  always marked `myu-generated: true` so everything Myu ever wrote stays one
  search away.
- **The canvas talks back.** A decision, a prompt, an action pressed on a
  canvas card is recorded the way the web records it, and Myu answers in the
  conversation. Expired canvases say so and offer Refresh; canvases Myu makes
  while you are elsewhere are offered as rows (in the thread and in Today),
  never opened on you. Undo, past canvases, and a reply 👍/👎.
- **Help Myu.** People Myu cannot place — a LinkedIn to confirm, a possible
  duplicate — appear as rows in Today, each one decision. Cards show what is
  around a person (related people, memories, where a memory came from), and
  "what's up with X" on demand.
- **Weave Myu in.** Settings → Weave Myu in → *Open the recipes*: embeds for
  your daily and weekly notes, a Tasks query for your commitments, the people
  table, a Dataview table, a button to Today — each a code block with a copy
  button, the text in view. *Insert a Myu snippet…* puts one at the cursor.
  Nothing is written to your vault unless you press *Keep a copy in Myu/*.
  For scripts: `app.plugins.plugins.askmyu.api` — `getBrief()`, `getPrep(id)`,
  `getPersonCard(name)`, `getWeeklyReview()`; read-only, null while locked.
- **Connections, in place.** Google and Microsoft accounts with Set primary and
  Disconnect per account; Slack and Zulip connect and disconnect from settings.
- **Entities (B2).** `[[Marcus Webb]]` in a note is a person-tag, for free. The
  plugin passes the names as hints; it never decides who anyone is.
- **Today (B3).** A right-sidebar pane with the brief and the day's meetings, in
  your theme. It refreshes every five minutes and otherwise sits still.

## Six questions, answered

- **Can I self-host, or use it offline?** No self-hosting: one server, `myu.askmyu.com`, and that is the only remote host the plugin talks to. Offline, everything Myu already wrote into your vault still opens (it is plain markdown, `.canvas` and `.base`); capture pauses and catches up when the connection returns.
- **What exactly is sent?** Only notes in the folders (or tags) you chose, encrypted on this device before they leave with a key your devices hold — plus the requests listed under "Network use" below. No telemetry, no third-party analytics.
- **Can I exclude my journal, or any note?** Yes: share only the folders you choose (nothing is preselected), and any single note opts out with `myu: false` in its frontmatter.
- **Will it touch my existing notes?** No. Myu writes only inside its own folder (`Myu/` by default). Your notes are read (when shared) and linked to, never edited.
- **Can I change the folder?** Yes — one folder, renameable in settings; everything Myu writes lives under it, every file marked `myu-generated: true`.
- **How do I delete my data?** "Remove everything Myu wrote" (settings, or the command) sends every generated file to the trash; "Delete my account" removes everything the server holds; "Export everything" and "Request my data archive" get you a copy first.

## What it will not do

- **No toasts.** `Notice` is used for errors and status only, never to tell you
  something about a person. Obsidian is a desk, not a notification channel.
- **No writes into your vault until you ask.** Everything Myu writes is opt-in
  behind its own consent screen, lands under one folder you choose (default
  `Myu/`), and carries `myu-generated: true` frontmatter so everything Myu ever
  wrote stays one search — and one delete — away. Myu never writes into notes
  you authored: not your daily notes, not your `People/` pages, not your
  templates. It links to them. Card views are ephemeral panes.
- **No reading before you choose.** The vault watcher is not registered while the
  shared-folder list is empty. Not "registered and skipping" — not registered.

## What survives if you uninstall

Everything. That is the point of writing files.

- **Every file under `Myu/` stays** exactly as it is — people, companies, journal, meetings, calendar, commitments, canvases, conversations. None of it needs the plugin to open: markdown, `.canvas` (an open standard), `.base` (an Obsidian core feature). They stop refreshing; nothing breaks.
- **Your own notes were never touched.** Myu links to them; it does not write into them.
- **The plugin's `data.json` goes with the plugin** — your plugin token and wrapped key. No custody is left on this device.
- **Your account is untouched.** Delete it from Settings → askMyu → Delete account, or on the web.

## Export everything

Two doors, for two different things:

- **Export everything into the vault** (Settings → askMyu → Advanced, or the command) — every surface regardless of your toggles, every conversation as a note, every canvas that still exists on the server, and a receipt at `Myu/Export.md` saying what landed, what could not, and what was never vault material.
- **Request my data archive** — what no vault file can carry: your account, devices, keys, consents, and everything the server holds, as one encrypted zip. The link is emailed when it is ready; the passphrase is shown once and never stored.

## Encryption, plainly

Your notes are encrypted on this device before they leave, with the same key your
other askMyu devices use.

At rest, that key is split: **this device holds it wrapped** under a key it does
not have, and **the server holds the wrapping key** with nothing to wrap. Neither
half is useful alone. On start-up the plugin fetches the wrapping key over your
session, opens the blob in memory, and keeps it there — nothing raw is ever
written to disk.

Consequences worth knowing before you install:

- **Offline start-up stays locked.** No network, no key, so capture pauses with a
  badge until you reconnect. This is the price of not keeping a usable key on
  disk, and we would rather pay it than pretend.
- **Every unlock leaves a receipt** and can be revoked. Removing this device in
  askMyu deletes the wrapping key, which makes the local blob permanently inert —
  a working remote wipe, not a promise.
- **Obsidian has no plugin sandbox.** Any plugin you install can read any other
  plugin's files, including this one's `data.json` (which holds your token and
  the wrapped blob). We designed around that as far as it can be designed around;
  we cannot design around a plugin that hooks the browser's crypto before we
  load. That is true of every plugin you install, and we would rather say it.

## Capabilities (what the plugin accesses)

- **Network** — only the askMyu backend you configure; every endpoint is listed below.
- **File system** — the vault, through Obsidian's Vault API only: reads the notes and folders you allow in Settings → What Myu can read; writes only under the `Myu/` folder (and `Myu/Canvas/`, `Myu/Conversations/`) after your explicit consent, plus one CSS snippet in your vault's config folder (`.obsidian/snippets/myu-look.css`) when you press *Install the look* — removable from the same row. Never outside the vault.
- **Clipboard** — user-initiated copies only: your recovery phrase (the key ceremony) and a recipe from the Weave Myu in pane (the copy button on its code block). Nothing is read from the clipboard except to clear the phrase you just copied.
- **Account** — required. askMyu is a service; the plugin is a client for it.
- **Pricing** — free during the beta. Creating an account means agreeing to the [Beta Participation Terms](https://www.askmyu.com/beta-program-participation-terms) and the [Privacy Policy](https://www.askmyu.com/privacy-policy): a checkbox at the door, and the backend records which version you agreed to. An account that has not agreed yet sees one screen asking, and nothing else, until it does.

## Network use (full disclosure)

Obsidian's developer policies require network use to be disclosed; here is all
of it. The plugin talks ONLY to the askMyu backend you configure (default
`myu.askmyu.com`) — no third-party services, no analytics endpoints, no CDN.

**There is no client-side telemetry in this plugin.** It does not measure,
count, or report your use of it, and there is no toggle to turn on — the
capability is absent, and a build check (`pnpm verify`) fails if any module
outside the transport layer opens a network connection at all. askMyu's servers
record their own API usage the way any service does; that is described in the
[privacy policy](https://www.askmyu.com/privacy-policy).

### Account, keys and sign-in

| endpoint | when | carries |
|---|---|---|
| `POST /account/plugin-token/exchange` | connect + every app start | your plugin token |
| `POST /account/plugin-token/create` | after sign-in | nothing outbound but the request |
| `POST /account/session/escrow-key` | every unlock | your content key, to your session |
| `POST /account/device/kek/store` · `kek/get` | device setup · each unlock | the wrapping key (split custody) |
| `POST /account/device/transfer-request` · `-approve` · `-deny` | device approval | ECDH public keys; the 4-digit code |
| `GET /account/device/transfer-pending` · `-receive` | device approval | requests only |
| `GET /account/recovery/wrapped-key` | recovery-phrase unlock | requests only |
| `POST /account/recovery/setup` | recovery ceremony | your key wrapped under the phrase — **the phrase never leaves this device** |
| `POST /account/create` | in-plugin signup (password door) | email, name, password, the terms version you agreed to |
| `POST /auth/magic-link/request` · `GET /auth/magic-link/validate` | in-plugin signup | email, name, the terms version you agreed to; then the emailed single-use token |
| `GET /terms` | opening the Create-account door | nothing — public; it says which version the door shows |
| `POST /account/terms/accept` | the "Before you start" screen | the terms version you agreed to |
| `POST /account/background-work/set` | settings toggle | your choice |

### What you share

| endpoint | when | carries |
|---|---|---|
| `POST /journal/add` | journal capture | your note, **encrypted on this device** |
| `POST /meetings/ingest_note` | meeting-note capture (opt-in) | the note, **plaintext by disclosed consent** |
| `POST /journal/add` · `POST /journal_chats/add` | chat | your messages (+ any note or selection you seeded) |

### Reading your day

| endpoint | when | carries |
|---|---|---|
| `GET /feed/brief` · `/review/weekly` · `/initiative/mirror` · `/card/self` | Today pane (5-min ambient) | requests only |
| `POST /calendar/events` | Today + calendar | the date range |
| `GET /prep/meeting` · `POST /prep/subject/link` | prep pane | the event id; the link you choose |
| `GET /feed/entities` · `/feed/entities/search` · `/card/person` · `/card/company` | lookups + cards | your queries |
| `POST /card/board-lite` | a card's extra takes | the entity id |
| `POST /card/identity/confirm` · `/v2/relationships/linkedin/suggestion/resolve` | card `confirm ▸` / disambiguation | the identity you picked |
| `GET /memories/relationship/{id}` | person pages | the relationship id |
| `GET /meetings/list` · `/meetings/get` | meeting history | requests only |
| `GET /journal/get` · `/journal_chats/get` | journal history | requests only — entries decrypt on this device |
| `GET /composition?id=` | save-to-vault | the composition you asked for |
| `POST /initiative/pattern-feedback/submit` | the mirror's confirm | your yes or no |
| `POST /composition/interaction` · `/composition/refresh` · `/composition/history` | a canvas card pressed; Refresh; Past canvases | the card and choice you pressed (composition + component ids, the option label); requests otherwise |
| `GET /feed/help-myu` · `/feed/related-persons` · `/feed/related-memories` · `/feed/entities/dispatch` · `/feed/search` · `/card/source-detail` | Today's Help Myu; a card's "around them"; "what's up with X"; Search Myu; "where this came from" | ids, or the words you typed into search |
| `POST /feed/entities/dismiss` · `/relationships/merge` (reject) · `/v2/relationships/linkedin/{id}` (unlink) | dismissing a dispatch; "Not the same"; Unlink LinkedIn | the ids involved |
| `POST /meetings/add-decision` · `/meetings/add-commitment` · `GET/POST /meetings/drive/*` · `POST /meetings/import/drive` | a bullet you type under a meeting note's Decisions/Commitments; Drive import | that bullet's text (and owner); the Drive file ids you choose |
| `GET /personal_loop/get` · `POST /feedback/signal` · `POST /feedback/submit` | Today's loop strip and its 👍/👎; a reply's 👍/👎; Send feedback | your rating; your feedback text, the build number, and (for a reply) the conversation id — never a screenshot, never your notes |
| `GET <origin>/sse/get` | live updates (streaming) | nothing outbound; events inbound |

### Myu's folder (opt-in)

| endpoint | when | carries |
|---|---|---|
| `POST /vault/commitments` | Myu's folder | nothing outbound but the request |
| `POST /vault/interaction` | Myu's folder | which Myu checkbox you ticked (ids + that line, never your own notes) |

### Telling Myu who you are, and connecting sources (all opt-in)

| endpoint | when | carries |
|---|---|---|
| `GET /account/state/check` · `POST /account/state/update` | onboarding | your onboarding answers |
| `GET /linkedin/seek` · `POST /account/career/update` | onboarding arc | the LinkedIn profile you chose |
| `GET /onboard/current_employment` · `POST /onboard/current_employment_confirm` | onboarding arc | your confirmation |
| `POST /resume/upload` | onboarding arc (optional) | the resume file you chose |
| `POST /onboard/classify_career_moment` | onboarding moment | what you wrote |
| `POST /oauth/google/init` · `/oauth/microsoft/init` (`scope_set`, `return_to` in the query) | connect (opt-in) — calendar, mail and meeting notes each on their own when the server splits consent | nothing outbound; consent happens in your browser |
| `GET /oauth/google/status` · `/oauth/microsoft/status` · `/slack/connections` · `/zulip/connections` | settings | requests only |
| `POST /oauth/{google,microsoft}/disconnect` · `/oauth/{google,microsoft}/credential/set-primary` · `/slack/connect` · `/slack/disconnect` · `/zulip/connect` · `/zulip/disconnect` | settings, when you press them | the account/connection you chose; for Zulip the realm, email and API key you entered (sent once, kept on the server) |
| `POST /account/update` · `GET /account/career` | settings → Account | your name; requests only |
| `GET/POST /email/generic/*` | IMAP source (opt-in) | the mail-server credentials you entered |
| `GET/POST /calendar/caldav/*` | CalDAV source (opt-in) | the calendar credentials you entered |
| `POST /calendar/ical/add` · `POST /calendar/ics/upload` | calendar link or file (opt-in; settings → Connection, or the offer in the welcome canvas) | the private iCal address you pasted, or the .ics file you chose |
| `GET /features` | on sign-in | requests only (which server-side features are on) |
| `POST /composition/career-trajectory` | after you confirm your LinkedIn read | requests only (asks for the career canvas) |

The plugin also registers six `obsidian://` URL verbs — `myu`, `myu-prep`,
`myu-card`, `myu-chat`, `myu-signin`, `myu-connected` — so askMyu's emails and
its web sign-in page can open the right pane. Mail clients strip custom-scheme
links, so emails link an HTTPS page on the askMyu backend that fires the verb;
no data rides those links beyond the meeting id or name in the URL itself, and
the sign-in verb carries a single-use token that expires in five minutes.

## Development

```
pnpm install
pnpm --filter @askmyu/obsidian dev          # esbuild watch → main.js
pnpm --filter @askmyu/obsidian type-check
pnpm --filter @askmyu/obsidian lint
pnpm --filter @askmyu/obsidian test         # behavioural QA invariants
pnpm --filter @askmyu/obsidian verify       # structural QA invariants
pnpm --filter @askmyu/obsidian build        # production bundle
```

`pnpm verify` enforces the structural invariants, including the two that keep
this plugin listable: all network egress goes through `src/transport/` (so
client-side telemetry cannot be added by accident — Obsidian's developer
policies forbid it), and no module assigns HTML as a string.

Turn on **Settings → askMyu → Use mock backend** to run the whole unlock path
against an in-memory stand-in, including its failure modes.

To test in a real vault, symlink the package into it:

```
ln -s "$PWD" "$VAULT/.obsidian/plugins/askmyu"
```

then enable askMyu in Community plugins (Restricted Mode off).

## Styling Myu

Everything Myu renders carries a stable `myu-*` class — `.myu-voice` (Myu's
words), `.myu-whisper` (quiet labels), `.myu-chat-block`, `.myu-canvas-component`,
`.myu-affordance` (buttons) — so you can restyle Myu's panes with an ordinary
CSS snippet, the same way you style any plugin. The plugin itself never
overrides your theme.

One look ships with the plugin: [`snippets/myu-look.css`](snippets/myu-look.css)
— Myu's own identity, the web app's accents, a serif voice. **Settings → askMyu
→ Advanced → Myu look → Install the look** writes it into your vault's config
folder (`.obsidian/snippets/myu-look.css`) and turns it on; the same row turns
it off, updates it after a plugin update, or removes it. Nothing is fetched:
the look for the build you are running is the look it installs. The file is
yours after that — edit it (the row will not overwrite an edited copy without
asking), or take the raw file from
`https://github.com/AskMyu/askmyu-obsidian-plugin/raw/main/snippets/myu-look.css` and manage it by hand.

