/**
 * Cold start (PLAN_COLD_START_ONBOARDING slices 3–7), the plugin side:
 * the flags, the offer block's controls, the scope-aware OAuth query, the
 * legible self page, and the payback copy — each checked against the
 * servlet and the web renderer rather than a guess.
 */
import { strict as assert } from 'node:assert';
import test from 'node:test';
import { parseColdStartFlags, COLD_START_OFF, oauthQuery } from '../src/transport/api';
import { controlsOf } from '../src/views/canvasActions';
import { buildSelfMarkdown } from '../src/vault/myuFiles';
import { ONBOARDING_COPY } from '../src/views/OnboardingModal';
import { MockApi } from '../src/transport/mock';

test('features: every cold-start flag defaults off and parses only booleans', () => {
  assert.deepEqual(parseColdStartFlags(null), COLD_START_OFF);
  assert.deepEqual(parseColdStartFlags({}), COLD_START_OFF);
  const f = parseColdStartFlags({ cold_start: { week_state: true, offer_block: 'yes', per_card_offer: 1 } });
  assert.equal(f.week_state, true);
  assert.equal(f.offer_block, false, 'a non-boolean is off');
  assert.equal(f.per_card_offer, false);
  assert.equal(f.split_consent, false);
});

test('offer block: the six options become five buttons and one address input', () => {
  const { buttons, input } = controlsOf({
    type: 'offer_block', id: 'welcome_offer',
    data: { lead: 'x', gap_line: 'y', trust_line: 'z', options: [
      { id: 'calendar_google', label: 'Connect Google Calendar' },
      { id: 'calendar_microsoft', label: 'Connect Microsoft Calendar' },
      { id: 'calendar_ical', label: 'Paste a calendar link' },
      { id: 'calendar_ics', label: 'Upload an .ics' },
      { id: 'just_tell', label: "I'll just tell you" },
      { id: 'stop_asking', label: 'Stop asking' },
    ], stopped_ack: 'Done. Settings has the doors.' },
  } as never);
  assert.deepEqual(buttons.map((b) => b.action), ['offer:calendar_google', 'offer:calendar_microsoft', 'offer:calendar_ics', 'offer:just_tell', 'offer:stop_asking']);
  assert.deepEqual(buttons[4]?.params, { stopped_ack: 'Done. Settings has the doors.' }, 'the ack rides the button even without a moment');
  assert.equal(buttons[0]?.cta, true, 'Google Calendar is the primary door');
  assert.ok(input && input.action === 'offer:calendar_ical' && input.param_name === 'url');
  assert.equal(input?.validate, 'url');
});

test('oauth init: scope_set and return_to ride the query after origin=obsidian (Microsoft reads query only)', () => {
  assert.equal(oauthQuery({}), '', 'nothing asked → nothing added');
  assert.equal(oauthQuery({ scopeSet: 'history', returnTo: 'card:rel-9' }), '&scope_set=history&return_to=card%3Arel-9');
  assert.equal(oauthQuery({ scopeSet: 'calendar', returnTo: 'dashboard' }), '&scope_set=calendar&return_to=dashboard');
});

test('iCal add: the mock refuses anything but https:// or webcal://, like the servlet', async () => {
  const b = new MockApi();
  const bad = await b.addIcalUrl('http://cal.example/basic.ics');
  assert.equal(bad.data?.success, false);
  const good = await b.addIcalUrl('webcal://cal.example/basic.ics');
  assert.equal(good.ok && good.data?.success, true);
  assert.ok((good.data?.events_stored ?? 0) > 0);
});

test('Me.md: known facts lead, each with its source; a read is marked a read, a gap as not yet', () => {
  const md = buildSelfMarkdown({ known_facts: [
    { key: 'title', value: 'Founder, AskMyu', source: 'linkedin', kind: 'fact' },
    { key: 'career', value: 'Twelve years in product.', source: 'read', kind: 'read' },
    { key: 'mail', value: 'Where you left off', source: 'mail', kind: 'not_yet' },
    { key: 'empty', value: '   ', source: 'you', kind: 'fact' },
  ] });
  assert.match(md, /## What Myu knows so far/);
  assert.match(md, /- \*\*title\*\* — Founder, AskMyu · linkedin/);
  assert.match(md, /- \*\*career\*\* — \*Twelve years in product\.\* \(a read, worth testing · read\)/);
  assert.match(md, /- \*\*not yet\*\* — Where you left off · mail/);
  assert.doesNotMatch(md, /empty/, 'a blank value is not a fact');
  assert.doesNotMatch(md, /still forming its picture/, 'facts count as content');
  assert.match(buildSelfMarkdown({ known_facts: [] }), /still forming its picture/);
});

test('payback copy is the web’s, word for word', () => {
  assert.equal(ONBOARDING_COPY.gapLine, "What LinkedIn can't tell me is where you are right now.");
  assert.equal(ONBOARDING_COPY.situatedQuestion, "Who's the person, or the meeting, that matters most this week?");
  assert.equal(ONBOARDING_COPY.situatedPlaceholder, 'A name, a meeting, and what is at stake — a sentence or two');
});

test('offer runner: a real "no" persists the dismissal and latches every surface; iCal success latches as connected', async () => {
  const { runOfferOption } = await import('../src/views/offerActions');
  const calls: unknown[][] = [];
  const plugin = {
    settings: { account_id: 'acct-1' },
    welcomeOfferAnswered: false,
    refreshTodayNow: () => undefined,
    backend: {
      updateAccountState: async (...a: unknown[]) => { calls.push(a); return { ok: true, status: 200, error: null, data: { success: true } }; },
      addIcalUrl: async () => ({ ok: true, status: 200, error: null, data: { success: true, events_stored: 7 } }),
    },
  };
  const no = await runOfferOption(plugin as never, 'just_tell', undefined);
  assert.equal(no.done, 'dismissed');
  assert.equal(plugin.welcomeOfferAnswered, true, 'the ask ends everywhere');
  const [, patch] = calls[0] as [string, { myuScripts?: { offer_dismissed_at?: string } }];
  assert.ok(patch.myuScripts?.offer_dismissed_at, 'the "no" is server truth, like the web');

  plugin.welcomeOfferAnswered = false;
  const ical = await runOfferOption(plugin as never, 'calendar_ical', { url: 'https://cal.example/basic.ics' });
  assert.equal(ical.done, 'connected');
  assert.match(ical.message ?? '', /7 events read/);
  assert.equal(plugin.welcomeOfferAnswered, true);

  const unknown = await runOfferOption(plugin as never, 'not_a_door', undefined);
  assert.equal(unknown.ok, false, 'unknown option ids refuse politely (server may add more)');
});

test('chat-inline offer: every server-authored line renders — lead, gap, person, doors, help, trust', async () => {
  const { ChatView } = await import('../src/views/ChatView');
  const { FakeEl } = await import('./ui-stub');
  const view = Object.create(ChatView.prototype) as InstanceType<typeof ChatView> & Record<string, unknown>;
  view['plugin'] = { welcomeOfferAnswered: false, openCanvasId: () => null, canvasView: () => null, backend: {}, settings: { account_id: 'a' } };
  view['turns'] = [{ role: 'myu', text: 'hi' }];
  view['offerDone'] = null;
  view['canvasSpecs'] = new Map();
  view['inlineOffer'] = { compositionId: 'mock-welcome', component: { id: 'w2', type: 'offer_block', data: {
    lead: 'I can prepare you for Priya on Thursday.',
    gap_line: 'Right now I know nothing about when you meet.',
    trust_line: 'Read-only. Myu prepares; it never sends anything.',
    named_person: { relationship_id: 'rel-2', name: 'Priya', when_text: 'this week', from: 'you' },
    options: [
      { id: 'calendar_google', label: 'Connect Google Calendar' },
      { id: 'calendar_ical', label: 'Paste a calendar link' },
      { id: 'just_tell', label: "I'll just tell you" },
    ],
  } } };
  const parent = new FakeEl('div');
  (view as unknown as { renderInlineOffer(p: unknown): void }).renderInlineOffer(parent);
  const texts = [...parent.walk()].map((e) => e.text ?? '').join('\n');
  for (const line of ['I can prepare you for Priya', 'Right now I know nothing', 'Priya — this week', 'Connect Google Calendar', "I'll just tell you", 'Read my week', 'Read-only. Myu prepares; it never sends anything.']) {
    assert.ok(texts.includes(line), `missing: ${line}`);
  }
  assert.ok(texts.includes('Google Calendar'), 'help text names where the address lives');
});

test('delivered offers: init starts that OAuth verbatim (drive included); answers write exactly the servlet\u2019s keys', async () => {
  const { runOfferOption } = await import('../src/views/offerActions');
  const stateCalls: unknown[][] = [];
  const initCalls: unknown[][] = [];
  const opened: string[] = [];
  (globalThis as { window?: unknown }).window = { open: (u: string) => { opened.push(u); } };
  const plugin = {
    settings: { account_id: 'acct-1' },
    welcomeOfferAnswered: false,
    backend: {
      updateAccountState: async (...a: unknown[]) => { stateCalls.push(a); return { ok: true, status: 200, error: null, data: { success: true } }; },
      googleOAuthInit: async (...a: unknown[]) => { initCalls.push(a); return { ok: true, status: 200, error: null, data: { auth_url: 'https://consent.example/x' } }; },
    },
  };
  const accept = await runOfferOption(plugin as never, 'drive_google', { init: { provider: 'google', scope_set: 'drive', return_to: 'dashboard' }, moment: 'notes' });
  assert.equal(accept.ok, true);
  assert.equal(accept.done, undefined, 'consent in flight is not yet an answer');
  assert.deepEqual(initCalls[0]?.[0], { scopeSet: 'drive', returnTo: 'dashboard' }, 'init is passed verbatim');
  assert.equal(opened[0], 'https://consent.example/x');
  assert.equal(stateCalls.length, 0, 'accepting writes no state \u2014 granted scopes are the record');

  const scripts = (i: number) => (stateCalls[i] as [string, { myuScripts?: Record<string, unknown> }])[1].myuScripts;
  const stop = await runOfferOption(plugin as never, 'stop_asking', { moment: 'notes', stopped_ack: 'Done \u2014 not again. Settings has the doors.' });
  assert.equal(stop.done, 'dismissed');
  assert.equal(stop.ackText, 'Done \u2014 not again. Settings has the doors.', 'the ack replaces the offer in place');
  assert.deepEqual(scripts(0), { offer_all_stopped: true });
  assert.equal(plugin.welcomeOfferAnswered, true, 'stop asking ends EVERY surface, the welcome included');

  // The welcome surface carries stop_asking too — no moment needed (delta #3).
  plugin.welcomeOfferAnswered = false;
  const welcomeStop = await runOfferOption(plugin as never, 'stop_asking', { stopped_ack: 'Done. Settings has the doors.' });
  assert.equal(welcomeStop.done, 'dismissed');
  assert.equal(welcomeStop.ackText, 'Done. Settings has the doors.');
  assert.deepEqual(scripts(1), { offer_all_stopped: true });
  plugin.welcomeOfferAnswered = false;

  const snooze = await runOfferOption(plugin as never, 'not_now', { moment: 'connect_rest', journal_id: 'j-77' });
  assert.equal(snooze.done, 'dismissed');
  assert.deepEqual(scripts(2), { offer_snoozed_journal: 'j-77' }, 'not_now silences this conversation only');

  const none = await runOfferOption(plugin as never, 'notes_none', { moment: 'notes' });
  assert.equal(none.done, 'dismissed');
  assert.deepEqual(scripts(3), { offer_notes_state: 'none' }, 'the VALUE is the servlet\u2019s, not the option id');
  const tr = await runOfferOption(plugin as never, 'notes_transcripts', { moment: 'notes' });
  assert.deepEqual(scripts(4), { offer_notes_state: 'transcripts' });
  assert.equal(plugin.welcomeOfferAnswered, false, 'moment answers never end the welcome ask');
  delete (globalThis as { window?: unknown }).window;
});

test('delivered-offer controls: the grant is the cta, answers carry moment + journal_id + stopped_ack', async () => {
  const { controlsOf } = await import('../src/views/canvasActions');
  const { buttons } = controlsOf({ id: 'offer_moment', type: 'offer_block', data: {
    moment: 'mail',
    journal_id: 'j-9',
    stopped_ack: 'Done.',
    lead: 'x',
    options: [
      { id: 'gmail', label: 'Connect Gmail', init: { provider: 'google', scope_set: 'history', return_to: 'dashboard' } },
      { id: 'not_now', label: 'Not now' },
      { id: 'stop_asking', label: 'Stop asking' },
    ],
  } } as never);
  assert.deepEqual(buttons.map((b) => b.action), ['offer:gmail', 'offer:not_now', 'offer:stop_asking']);
  assert.equal(buttons[0]?.cta, true, 'the grant is the cta');
  assert.deepEqual(buttons[1]?.params, { moment: 'mail', journal_id: 'j-9', stopped_ack: 'Done.' });
  assert.deepEqual((buttons[0]?.params as { init?: unknown; moment?: string }).init, { provider: 'google', scope_set: 'history', return_to: 'dashboard' });
});

test('the canvas row names what needs you; a quiet canvas stays a quiet row', async () => {
  const { canvasAsksLine } = await import('../src/views/canvasAsks');
  assert.equal(canvasAsksLine({ id: 'c', components: [
    { id: '1', type: 'offer_block', data: { options: [{ id: 'calendar_google' }] } },
    { id: '2', type: 'reflection_prompt', data: {} },
    { id: '3', type: 'decision_frame', data: {} },
    { id: '4', type: 'text_block', data: { text: 'read' } },
  ] }), 'Needs you on the canvas: connect a calendar \u00b7 a decision to weigh \u00b7 a question to answer');
  assert.equal(canvasAsksLine({ id: 'c', components: [{ id: '1', type: 'text_block', data: {} }, { id: '2', type: 'chart', data: {} }] }), null, 'reads alone earn no ask line');
  assert.equal(canvasAsksLine(null), null);
});

test('the LinkedIn ask surfaces only in a conversation that names the person', async () => {
  const { linkedInAskInText } = await import('../src/views/linkedinCards');
  const queue = [
    { item_type: 'linkedin_disambiguation', relationship_id: 'rel-2', display_name: 'Priya Raman' },
    { item_type: 'merge_candidate', relationship_id: 'rel-9', display_name: 'Someone Else' },
  ];
  assert.deepEqual(linkedInAskInText(queue, 'Meeting with Priya tomorrow about the beta'), { relationshipId: 'rel-2', personName: 'Priya Raman' }, 'a first name is enough');
  assert.deepEqual(linkedInAskInText(queue, 'priya raman pushed back'), { relationshipId: 'rel-2', personName: 'Priya Raman' });
  assert.equal(linkedInAskInText(queue, 'The beta ships Friday'), null, 'no name, no ask');
  assert.equal(linkedInAskInText(queue, 'Julia and the sapriyal case'), null, 'substrings inside words do not count');
});

test('in-thread LinkedIn walk: chat register, reject advances even when refused, terminal doors reachable', async () => {
  const { renderLinkedInMatchesInline } = await import('../src/views/linkedinCards');
  const { FakeEl } = await import('./ui-stub');
  const root = new FakeEl('div');
  const plugin = { backend: { resolveLinkedInSuggestion: async () => ({ ok: false, status: 400, error: 'stale card', data: null }) } };
  let resolved = 0;
  renderLinkedInMatchesInline(root as never, [
    { card_id: 'c1', person_name: 'Priya Raman', profile_headline: 'Head of Platform at Northwind', linkedin_url: 'https://linkedin.com/in/priya' },
    { card_id: 'c2', person_name: 'Priya R.', profile_headline: 'Consultant' },
  ], { app: {} as never, owner: {} as never, plugin: plugin as never, relationshipId: 'rel-2', personName: 'Priya Raman', onResolved: () => resolved++ });

  let text = [...root.walk()].map((e) => e.text ?? '').join('\n');
  assert.ok(text.includes('Priya Raman'), 'the first candidate, by name');
  assert.ok(text.includes('— Head of Platform at Northwind'), 'headline in the quiet register');
  assert.ok(text.includes('1 of 2'), 'the walk says where you are');
  assert.ok(!text.includes('LinkedIn Match Found'), 'no canvas-card chrome in the thread');

  assert.ok(await root.click('Not this person'), 'reject door exists');
  await new Promise((r) => setTimeout(r, 0));
  text = [...root.walk()].map((e) => e.text ?? '').join('\n');
  assert.ok(text.includes('Priya R.'), 'a refused reject still advances the walk');
  assert.ok(await root.click('Not this person'));
  await new Promise((r) => setTimeout(r, 0));
  text = [...root.walk()].map((e) => e.text ?? '').join('\n');
  assert.ok(text.includes('Link profile') && text.includes('Not on LinkedIn'), 'the terminal doors are reachable');
  assert.equal(resolved, 0, 'nothing resolved yet');
});

test('an ask resolved on another surface leaves the chat: revalidation drops it and latches', async () => {
  const { ChatView } = await import('../src/views/ChatView');
  const view = Object.create(ChatView.prototype) as InstanceType<typeof ChatView> & Record<string, unknown>;
  let rendered = 0;
  const plugin = {
    helpQueue: [] as unknown[],
    linkedinAskResolved: new Set<string>(),
    loadHelpQueue: async () => undefined, // queue comes back WITHOUT rel-2 — resolved elsewhere
  };
  view['plugin'] = plugin;
  view['linkedinAsk'] = { relationshipId: 'rel-2', personName: 'Priya Raman', suggestions: [] };
  view['render'] = () => { rendered++; };
  await (view as unknown as { revalidateLinkedInAsk(): Promise<void> }).revalidateLinkedInAsk();
  assert.equal(view['linkedinAsk'], null, 'the box is gone');
  assert.ok(plugin.linkedinAskResolved.has('rel-2'), 'latched for the session');
  assert.equal(rendered, 1);

  // Still pending elsewhere → the ask stays.
  plugin.helpQueue = [{ item_type: 'linkedin_disambiguation', relationship_id: 'rel-9', display_name: 'Jim' }];
  view['linkedinAsk'] = { relationshipId: 'rel-9', personName: 'Jim', suggestions: [] };
  await (view as unknown as { revalidateLinkedInAsk(): Promise<void> }).revalidateLinkedInAsk();
  assert.ok(view['linkedinAsk'], 'an unresolved ask is not dropped');
});

test('one ask per source: a calendar ask on the canvas silences a calendar ask in the thread, not a mail one', async () => {
  const { ChatView } = await import('../src/views/ChatView');
  const { FakeEl } = await import('./ui-stub');
  const view = Object.create(ChatView.prototype) as InstanceType<typeof ChatView> & Record<string, unknown>;
  // The canvas is asking for a CALENDAR.
  const canvasSpec = { components: [{ id: 'welcome_offer', type: 'offer_block', data: { options: [{ id: 'calendar_google' }] } }] };
  const plugin = {
    welcomeOfferAnswered: false,
    openCanvasId: () => 'mock-welcome',
    canvasView: () => ({ currentSpec: () => canvasSpec }),
    settings: { account_id: 'a' },
    backend: {},
  };
  view['plugin'] = plugin;
  view['turns'] = [{ role: 'myu', text: 'hi' }];
  view['canvasSpecs'] = new Map();
  const show = (moment: string, label: string) => {
    view['offerDone'] = null;
    view['offerDoneText'] = null;
    view['inlineOffer'] = { compositionId: '', component: { id: 'offer_moment', type: 'offer_block', data: { moment, lead: 'x', options: [{ id: 'gmail', label }] } } };
    const parent = new FakeEl('div');
    (view as unknown as { renderInlineOffer(p: unknown): void }).renderInlineOffer(parent);
    return [...parent.walk()].map((e) => e.text ?? '').join('\n');
  };
  assert.equal(show('calendar', 'Connect Google Calendar').includes('Connect Google Calendar'), false, 'the same source twice is noise');
  assert.ok(show('mail', 'Connect Gmail').includes('Connect Gmail'), 'a mail ask is a different question — hiding it loses it');

  // Answered: the acknowledgement shows even while the canvas carries an offer.
  view['offerDone'] = 'dismissed';
  view['offerDoneText'] = 'Done. Settings has the doors.';
  view['inlineOffer'] = { compositionId: '', component: { id: 'offer_moment', type: 'offer_block', data: { moment: 'calendar', lead: 'x', options: [] } } };
  const parent = new FakeEl('div');
  (view as unknown as { renderInlineOffer(p: unknown): void }).renderInlineOffer(parent);
  assert.ok([...parent.walk()].map((e) => e.text ?? '').join('\n').includes('Done. Settings has the doors.'), 'an answered ask still shows its acknowledgement');
});


test('a device asking to join survives a dead stream: it is polled, shown in Today, and its fuse is honest', async () => {
  const { TodayView } = await import('../src/views/TodayView');
  const { FakeEl } = await import('./ui-stub');
  const view = Object.create(TodayView.prototype) as InstanceType<typeof TodayView> & Record<string, unknown>;
  const now = Date.now();
  view['plugin'] = {
    pendingTransfers: [
      // The server says when it dies (device_transfer_ttl_secs), never the client.
      { request_id: 'r1', device_name: 'Chrome on Linux', requested_at: now - 60_000, expires_at: now + 4 * 60_000, public_key: 'k' },
      { request_id: 'r2', device_name: 'Old phone', requested_at: now - 20 * 60_000, expires_at: now - 60_000, public_key: 'k' },
      { request_id: 'r3', device_name: 'Unknown window', requested_at: now - 60_000, public_key: 'k' },
    ],
    openSettings: () => undefined,
    backend: {},
    refreshPendingTransfers: async () => undefined,
  };
  view['app'] = {};
  const root = new FakeEl('div');
  (view as unknown as { renderDeviceRequests(r: unknown): void }).renderDeviceRequests(root);
  const text = [...root.walk()].map((e) => e.text ?? '').join('\n');
  assert.ok(text.includes('\u201cChrome on Linux\u201d wants to join your account'), 'the ask is named in Today');
  assert.ok(text.includes('Type the 4-digit code it shows.'), 'and says what to do');
  assert.ok(/About 4 minutes left/.test(text), 'the 5-minute fuse is shown honestly');
  assert.ok(text.includes('This one has expired'), 'an expired request says so rather than pretending');
  assert.ok(text.includes('\u201cUnknown window\u201d wants to join your account'), 'a request without expires_at still shows');
  assert.equal(text.split('About ').length - 1, 1, 'with no server expiry the client invents no countdown');
  assert.ok(text.includes('Approve\u2026') && text.includes('Deny'), 'both doors are here, not only in settings');
});

test('the live stream is not taken on faith: isConnected reflects a real stream, ensure() revives a dead one', async () => {
  const { SSEClient } = await import('../src/transport/sse');
  const sse = new SSEClient() as InstanceType<typeof SSEClient> & Record<string, unknown>;
  assert.equal(sse.isRunning, false);
  assert.equal(sse.isConnected, false, 'nothing is connected before start');
  let opens = 0;
  (sse as unknown as { open(): void }).open = () => { opens++; };
  sse.start('https://example.invalid/sse/get', 'tok');
  assert.equal(sse.isRunning, true, 'a stream is wanted');
  assert.equal(sse.isConnected, false, 'wanting is not having \u2014 the old isRunning conflated them');
  const before = opens;
  sse.ensure();
  assert.equal(opens, before + 1, 'a dead stream is re-opened immediately by the watchdog');
  sse.stop();
  sse.ensure();
  assert.equal(opens, before + 1, 'a stopped client stays stopped');
});

test('a refused refresh is not an empty day: prior data survives, the pane says so, and it retries in seconds', async () => {
  const { TodayView } = await import('../src/views/TodayView');
  const { FakeEl } = await import('./ui-stub');
  const view = Object.create(TodayView.prototype) as InstanceType<typeof TodayView> & Record<string, unknown>;
  const brief = { date: '2026-09-01', sections: [{ section: 'today', visible: true, items: [{ text: '34 new emails since yesterday', type: 'email_activity' }] }] };
  const refused = { ok: false, status: 403, error: 'http_403', data: null };
  let retried = 0;
  view['plugin'] = {
    unlock: { current: 'unlocked' },
    settings: {},
    backend: {
      getBrief: async () => refused,
      getCalendarEvents: async () => refused,
      getMirrorEdition: async () => refused,
      getWeeklyReview: async () => refused,
      getPersonalLoop: async () => refused,
    },
    loadHelpQueue: async () => undefined,
    helpQueue: [],
    pendingTransfers: [],
  };
  view['brief'] = brief;                    // a good earlier load
  view['loadedOnce'] = true;
  view['meetings'] = [];
  view['render'] = () => { /* counted below via renderBrief */ };
  view['scheduleRetry'] = () => { retried++; };
  await (view as unknown as { refresh(): Promise<void> }).refresh();
  assert.equal(view['brief'], brief, 'a refused fetch must NOT clobber the day with null');
  assert.equal(retried, 1, 'and it retries rather than waiting out the 5-minute tick');
  assert.ok(view['staleSince'], 'the pane knows it is showing stale data');

  // Before any successful load, an empty brief says "still reading", not "nothing".
  const fresh = Object.create(TodayView.prototype) as InstanceType<typeof TodayView> & Record<string, unknown>;
  fresh['plugin'] = { helpQueue: [] };
  fresh['brief'] = null;
  fresh['loadedOnce'] = false;
  fresh['briefExpanded'] = false;
  const root = new FakeEl('div');
  (fresh as unknown as { renderBrief(r: unknown): void }).renderBrief(root);
  const text = [...root.walk()].map((e) => e.text ?? '').join('\n');
  assert.ok(text.includes('Still reading your day'), `expected the honest line, got: ${text}`);
  assert.ok(!text.includes('Nothing pressing'), 'never claim an empty day it has not verified');
});

test('the canvas pane follows the newest canvas unless pinned — no more digging through history', async () => {
  const { routeOffer } = await import('../src/composition/offers');
  const now = Date.now();
  const payload = { composition_id: 'c-new', summary_text: 'Team read' };

  // Pane closed: it lands as an offer row, as before.
  assert.equal(routeOffer('ready', payload, null, now).kind, 'offer');

  // Pane OPEN and following: the newest takes the pane — including an `offer`,
  // which used to be ignored and left the pane stale.
  assert.deepEqual(routeOffer('ready', payload, 'c-old', now, true), { kind: 'replace', compositionId: 'c-new', summaryText: 'Team read' });
  assert.deepEqual(routeOffer('offer', payload, 'c-old', now, true), { kind: 'replace', compositionId: 'c-new', summaryText: 'Team read' });

  // PINNED: the pane holds still and the canvas still reaches you as a row.
  const pinned = routeOffer('ready', payload, 'c-old', now, false);
  assert.equal(pinned.kind, 'offer', 'a pinned pane is never swapped underneath you');

  // Already showing it: nothing to do either way.
  assert.equal(routeOffer('ready', payload, 'c-new', now, true).kind, 'none');
  assert.equal(routeOffer('ready', payload, 'c-new', now, false).kind, 'none');
});

test('the canvas header names the canvas and steps through history in place', async () => {
  const { CanvasView } = await import('../src/views/CanvasView');
  const { FakeEl } = await import('./ui-stub');
  const view = Object.create(CanvasView.prototype) as InstanceType<typeof CanvasView> & Record<string, unknown>;
  view['spec'] = { id: 'c2', summary_text: 'Team read — platform group', components: [] };
  view['compositionId'] = 'c2';
  view['history'] = [
    { composition_id: 'c3', summary_text: 'Newest' },
    { composition_id: 'c2', summary_text: 'Team read — platform group' },
    { composition_id: 'c1', summary_text: 'Oldest' },
  ];
  view['pinned'] = false;
  view['newer'] = null;
  const root = new FakeEl('div');
  (view as unknown as { renderHeader(r: unknown): void }).renderHeader(root);
  const text = [...root.walk()].map((e) => e.text ?? '').join('\n');
  assert.ok(text.includes('Team read — platform group'), 'the pane says WHICH canvas this is');
  assert.ok(text.includes('2 of 3'), 'and where it sits in the run');
  const buttons = [...root.walk()].filter((e) => e.tag === 'button');
  assert.deepEqual(buttons.map((b) => b.attrs['aria-label'] ?? b.text), [
    'Older canvas', 'Newer canvas',
    'Following the newest: a new canvas takes this pane. Pin to hold this one.',
    'Show in the conversation',
  ], 'steppers, the pin, and the way back to the reply that made it — all in place, not in a modal');
  assert.equal((buttons[0] as unknown as { disabled: boolean }).disabled, false, 'an older canvas is one click away');
  assert.equal((buttons[1] as unknown as { disabled: boolean }).disabled, false, 'so is the newer one');

  // Pinned, with something newer waiting: the pane says so instead of swapping.
  view['pinned'] = true;
  view['newer'] = { compositionId: 'c9', summary: 'Prep for Priya' };
  const root2 = new FakeEl('div');
  (view as unknown as { renderHeader(r: unknown): void }).renderHeader(root2);
  const text2 = [...root2.walk()].map((e) => e.text ?? '').join('\n');
  assert.ok(text2.includes('A newer canvas is ready'), 'a held pane still tells you what arrived');
});

test('a canvas in the thread: compact by default — only connect and identity asks stay open', async () => {
  const { renderInlineCanvas, staysOpen } = await import('../src/views/inlineCanvas');
  const { FakeEl, markdownRenders } = await import('./ui-stub');
  const spec = { id: 'c1', summary_text: 'Team read — platform group', components: [
    { id: 't1', type: 'text_block', label: 'Where it stands', data: { text: 'The platform group is steadier than last month.' } },
    { id: 'ch1', type: 'chart', label: 'Trust over time', data: {} },
    { id: 'd1', type: 'decision_frame', label: 'Who owns it', data: { question: 'Who takes the vendor thread?', options: [{ label: 'Marcus' }, { label: 'Priya' }] } },
    { id: 'welcome_offer', type: 'offer_block', data: { lead: 'Connect a calendar and I read your week.', options: [{ id: 'calendar_google', label: 'Connect Google Calendar' }] } },
    { id: 'linkedin_confirm_x', type: 'prepared_content', data: { title: 'Is this Julie?', content: 'julie — teacher', channel_actions: [{ label: '✓ Confirm Match', action: 'resolve_linkedin', params: { card_id: 'x', resolve_action: 'confirm' } }] } },
  ] };

  // The thread stays a thread: a question folds like any other read; the two
  // asks that block Myu from working do not.
  assert.equal(staysOpen(spec.components[2] as never), false, 'a decision folds — the canvas holds the whole of it');
  assert.equal(staysOpen(spec.components[3] as never), true, 'connecting a source stays open');
  assert.equal(staysOpen(spec.components[4] as never), true, 'placing a person stays open');

  markdownRenders.length = 0;
  const root = new FakeEl('div');
  let opened = '';
  renderInlineCanvas(root as never, 'c1', spec as never, {
    app: {} as never, component: {} as never, plugin: {} as never,
    expanded: new Set<string>(), refresh: () => undefined,
    openCanvas: (id) => { opened = id; }, saveCanvas: () => undefined,
  } as never);
  const all = [...root.walk()];
  const text = all.map((e) => e.text ?? '').join('\n');

  assert.ok(text.includes('canvas · Team read — platform group'), 'it is still called the canvas, so the reply\u2019s prose stays true');
  const folds = all.filter((e) => e.tag === 'details');
  assert.equal(folds.length, 3, 'prose, chart AND the decision fold');
  assert.equal(folds.filter((f) => f.attrs.open !== undefined).length, 0, 'all shut until asked for');
  assert.ok(text.includes('Where it stands') && text.includes('Trust over time') && text.includes('Who owns it'), 'each fold says what it holds');

  // The open asks wear Obsidian's own callout.
  const callouts = all.filter((e) => e.classes.has('callout'));
  assert.equal(callouts.length, 2, 'the connect ask and the identity ask, both open');
  assert.deepEqual(callouts.map((c) => c.attrs['data-callout']), ['tip', 'question'], 'native callout kinds, so the theme styles them');
  assert.ok(text.includes('Connect Google Calendar'), 'the connect door is right there');
  assert.ok(text.includes('Confirm Match'), 'so is the identity one');

  // The door to the whole thing.
  const door = all.find((e) => e.tag === 'button' && e.text === 'Open canvas');
  assert.ok(door, 'a link to the canvas sits at the top');
  await door!.click?.('Open canvas');
  assert.equal(opened, 'c1', 'and it opens that canvas');

  const ids = all.map((e) => e.attrs['data-myu-component-id']).filter(Boolean);
  assert.deepEqual(ids, ['t1', 'ch1', 'd1', 'welcome_offer', 'linkedin_confirm_x'], 'every component addressable');
});


test('a triggered ask is never suppressed by a stale canvas; the quiet ladder still defers', async () => {
  const { ChatView } = await import('../src/views/ChatView');
  const { FakeEl } = await import('./ui-stub');
  const make = (triggered: boolean) => {
    const view = Object.create(ChatView.prototype) as InstanceType<typeof ChatView> & Record<string, unknown>;
    view['plugin'] = {
      // An unanswered MAIL offer sitting in the canvas tab — the same source.
      canvasView: () => ({ currentSpec: () => ({ components: [{ id: 'welcome_offer', type: 'offer_block', data: { moment: 'mail', options: [{ id: 'gmail' }] } }] }) }),
      openCanvasId: () => null,
      welcomeOfferAnswered: false,
      settings: { account_id: 'a' },
      backend: {},
    };
    view['turns'] = [{ role: 'myu', text: 'hi' }];
    view['offerDone'] = null;
    view['offerDoneText'] = null;
    view['canvasSpecs'] = new Map();
    view['inlineOffer'] = { compositionId: '', component: { id: 'offer_moment', type: 'offer_block', data: {
      moment: 'mail', triggered, lead: 'Connect mail and prep gets the history.',
      options: [{ id: 'gmail', label: 'Connect Gmail', init: { provider: 'google', scope_set: 'mail' } }],
    } } };
    const parent = new FakeEl('div');
    (view as unknown as { renderInlineOffer(p: unknown): void }).renderInlineOffer(parent);
    return [...parent.walk()].map((e) => e.text ?? '').join('\n');
  };
  assert.ok(make(true).includes('Connect Gmail'), 'an ask the user earned outranks a stale canvas');
  assert.equal(make(false).includes('Connect Gmail'), false, 'the quiet ladder still defers when the same source is already asking');
});

test('a canvas that only updated the pane still reaches the thread', async () => {
  const { routeOffer } = await import('../src/composition/offers');
  // Taking the pane is not the end of the story: the step carries the summary so
  // the conversation can name the canvas it just gained (operator, 2026-09-01:
  // "there was a canvas pane… that's my point").
  const step = routeOffer('ready', { composition_id: 'c-new', summary_text: 'Where things stand with Jill' }, 'c-old', Date.now(), true);
  assert.equal(step.kind, 'replace');
  if (step.kind === 'replace') {
    assert.equal(step.compositionId, 'c-new');
    assert.equal(step.summaryText, 'Where things stand with Jill', 'the thread needs the words, not just the id');
  }
});

test('a new conversation is reachable from inside one, and leaves nothing of the last behind', async () => {
  const { ChatView } = await import('../src/views/ChatView');
  const view = Object.create(ChatView.prototype) as InstanceType<typeof ChatView> & Record<string, unknown>;
  view['turns'] = [{ role: 'myu', text: 'about Henry…' }];
  view['journalId'] = 'j-1';
  view['pendingContext'] = { entity_id: 'rel-9' };
  view['pendingTemplateType'] = 'onboarding_moment';
  view['draft'] = 'half a thought';
  view['browsing'] = true;
  view['canvasSpecs'] = new Map([['c1', { id: 'c1', components: [] }]]);
  view['canvasFetching'] = new Set(['c1']);
  view['canvasAsks'] = new Map([['c1', 'needs you']]);
  view['expandedComponents'] = new Set(['x']);
  view['inlineOffer'] = { compositionId: 'c1', component: { id: 'o', type: 'offer_block', data: {} } };
  view['offerDone'] = 'dismissed';
  view['offerDoneText'] = 'Done.';
  view['linkedinAsk'] = { relationshipId: 'rel-2', personName: 'Priya', suggestions: [] };
  view['ratings'] = new Map([[0, 1]]);
  let rendered = 0;
  view['render'] = () => { rendered++; };

  (view as unknown as { startNew(): void }).startNew();

  assert.deepEqual(view['turns'], [], 'the thread is empty');
  assert.equal(view['journalId'], null, 'and it is a NEW journal — not a reply to the last one');
  assert.equal(view['pendingContext'], null);
  assert.equal(view['pendingTemplateType'], null);
  assert.equal(view['draft'], '');
  assert.equal(view['browsing'], false, 'and you are looking at the fresh thread, not the browser');
  assert.equal((view['canvasSpecs'] as Map<string, unknown>).size, 0, 'the last conversation\u2019s canvases do not follow you');
  assert.equal((view['expandedComponents'] as Set<string>).size, 0);
  assert.equal(view['inlineOffer'], null, 'nor its asks');
  assert.equal(view['linkedinAsk'], null);
  assert.equal((view['ratings'] as Map<number, unknown>).size, 0, 'nor its ratings, which are keyed by turn index');
  assert.equal(rendered, 1);
});

test('a canvas belongs to the reply that made it, not to the bottom of the thread', async () => {
  const { ChatView } = await import('../src/views/ChatView');
  const view = Object.create(ChatView.prototype) as InstanceType<typeof ChatView> & Record<string, unknown>;
  view['render'] = () => undefined;
  view['turns'] = [
    { role: 'user', text: 'about Henry' },
    { role: 'myu', text: 'Here is the read on Henry.' },
    { role: 'user', text: 'and the vendor thread?' },
    { role: 'myu', text: 'Here is that comparison.' },
  ];
  const offer = (view as unknown as { offerCanvas(id: string, s: string, a: string): void });

  // A canvas that lands after the reply attaches to THAT reply.
  offer.offerCanvas('c-2', 'The vendor comparison', 'Open canvas');
  assert.equal(view['turns'].length, 4, 'no floating turn appended');
  const last = (view['turns'] as Array<{ blocks?: Array<{ composition_id?: string }> }>)[3];
  assert.equal(last.blocks?.[0]?.composition_id, 'c-2', 'it sits with the reply it belongs to');

  // A second canvas does not hide behind the first: it gets its own row.
  offer.offerCanvas('c-3', 'Another read', 'Open canvas');
  assert.equal(view['turns'].length, 5, 'a reply already carrying a canvas does not take another');
  assert.equal((view['turns'] as Array<{ blocks?: Array<{ composition_id?: string }> }>)[4].blocks?.[0]?.composition_id, 'c-3');

  // The same canvas twice is noise.
  offer.offerCanvas('c-2', 'The vendor comparison', 'Open canvas');
  assert.equal(view['turns'].length, 5, 'never the same canvas twice');

  // With no reply to belong to, it stands on its own.
  const fresh = Object.create(ChatView.prototype) as InstanceType<typeof ChatView> & Record<string, unknown>;
  fresh['render'] = () => undefined;
  fresh['turns'] = [];
  (fresh as unknown as { offerCanvas(id: string, s: string, a: string): void }).offerCanvas('c-9', 'Prepared while you were away', 'Open canvas');
  assert.equal(fresh['turns'].length, 1, 'a canvas with no reply gets its own turn');
});

test('a resumed conversation puts each canvas beside the reply that made it', async () => {
  const { ChatView } = await import('../src/views/ChatView');
  const view = Object.create(ChatView.prototype) as InstanceType<typeof ChatView> & Record<string, unknown>;
  const turns = () => [
    { role: 'user', text: 'about Henry' },
    { role: 'myu', text: 'The read on Henry.' },      // myu turn 1
    { role: 'user', text: 'and the vendor thread?' },
    { role: 'myu', text: 'That comparison.' },         // myu turn 2
  ];
  const block = [{ type: 'composition_offer', composition_id: 'c-1', summary_text: 'The read on Henry' }];
  const place = (view as unknown as { placeCanvasOnTurn(b: unknown, n?: number): void });

  // The server says which turn made it — the canvas goes THERE, not at the end.
  view['turns'] = turns();
  place.placeCanvasOnTurn(block, 1);
  const first = (view['turns'] as Array<{ blocks?: Array<{ composition_id?: string }> }>)[1];
  assert.equal(first.blocks?.[0]?.composition_id, 'c-1', 'an old canvas sticks to the reply it belongs to');
  assert.equal((view['turns'] as Array<{ blocks?: unknown }>)[3].blocks, undefined, 'and not to the last thing said');

  // Without a turn number, the most recent reply is the only honest guess.
  view['turns'] = turns();
  place.placeCanvasOnTurn(block, undefined);
  assert.equal((view['turns'] as Array<{ blocks?: Array<{ composition_id?: string }> }>)[3].blocks?.[0]?.composition_id, 'c-1');

  // A turn number past the end does not throw the canvas away.
  view['turns'] = turns();
  place.placeCanvasOnTurn(block, 99);
  const anywhere = (view['turns'] as Array<{ blocks?: Array<{ composition_id?: string }> }>).some((t) => t.blocks?.[0]?.composition_id === 'c-1');
  assert.ok(anywhere, 'a bad turn number still leaves the canvas reachable');
});

test('a resumed conversation shows ALL its canvases, each on its own reply', async () => {
  const { ChatView } = await import('../src/views/ChatView');
  const view = Object.create(ChatView.prototype) as InstanceType<typeof ChatView> & Record<string, unknown>;
  const turns = () => [
    { role: 'user', text: 'about Henry' },
    { role: 'myu', text: 'The read on Henry.' },       // myu turn 1
    { role: 'user', text: 'and the vendor thread?' },
    { role: 'myu', text: 'That comparison.' },          // myu turn 2
    { role: 'user', text: 'the platform group?' },
    { role: 'myu', text: 'Steadier than last month.' }, // myu turn 3
  ];
  const place = (view as unknown as { placeCanvases(r: Array<{ compositionId: string; summaryText: string; turnNumber: number }>): void });
  const idsAt = (i: number) => ((view['turns'] as Array<{ blocks?: Array<{ composition_id?: string }> }>)[i].blocks ?? []).map((b) => b.composition_id);

  // Three canvases, three replies. Before this, only the live one came back —
  // and it landed at the bottom (operator, 2026-09-01).
  view['turns'] = turns();
  place.placeCanvases([
    { compositionId: 'c-1', summaryText: 'Henry', turnNumber: 1 },
    { compositionId: 'c-2', summaryText: 'Vendors', turnNumber: 2 },
    { compositionId: 'c-3', summaryText: 'Platform', turnNumber: 3 },
  ]);
  assert.deepEqual(idsAt(1), ['c-1']);
  assert.deepEqual(idsAt(3), ['c-2']);
  assert.deepEqual(idsAt(5), ['c-3']);

  // A canvas already in the thread is not doubled by the resume.
  place.placeCanvases([{ compositionId: 'c-2', summaryText: 'Vendors', turnNumber: 2 }]);
  assert.deepEqual(idsAt(3), ['c-2'], 'never the same canvas twice');

  // An unplaceable turn gets its own row — and that extra row must not shift
  // where the canvases after it land.
  view['turns'] = turns();
  place.placeCanvases([
    { compositionId: 'c-x', summaryText: 'Orphan', turnNumber: 99 },
    { compositionId: 'c-2', summaryText: 'Vendors', turnNumber: 2 },
  ]);
  assert.deepEqual(idsAt(3), ['c-2'], 'the orphan row does not move the others');
  assert.deepEqual(idsAt(6), ['c-x'], 'and it is still reachable at the end');
});

test('canvasesOnResume — every canvas, in turn order, and never one it cannot place', async () => {
  const { canvasesOnResume, Api } = await import('../src/transport/api');

  const rows = canvasesOnResume({ compositions: [
    { composition_id: 'c-1', turn_number: 1, summary_text: 'Henry', is_expired: true },
    { composition_id: 'c-2', turn_number: 3, summary_text: 'Vendors', is_expired: false },
  ] });
  assert.deepEqual(rows, [
    { compositionId: 'c-1', summaryText: 'Henry', turnNumber: 1 },
    { compositionId: 'c-2', summaryText: 'Vendors', turnNumber: 3 },
  ], 'expired is bookkeeping, not "gone" — every canvas but the newest is expired by construction');

  // Unplaceable rows are dropped, never pinned to the wrong reply: that is the
  // bug this path exists to fix. Pre-V077 canvases carry turn_number: null.
  assert.deepEqual(canvasesOnResume({ compositions: [
    { composition_id: 'c-null', turn_number: null, summary_text: 'Unanchored' },
    { composition_id: 'c-zero', turn_number: 0 },
    { turn_number: 2, summary_text: 'no id' },
    { composition_id: 'c-1', turn_number: 1 },
    { composition_id: 'c-1', turn_number: 2 },
  ] }), [{ compositionId: 'c-1', summaryText: '', turnNumber: 1 }]);

  // A backend without the flag answers the single shape → fall back, silently.
  for (const none of [null, undefined, {}, { composition: null, composition_id: 'c-1', turn_number: 1 }]) {
    assert.deepEqual(canvasesOnResume(none as never), [], JSON.stringify(none));
  }

  let seen = '';
  const api = new Api({ get: async (path: string) => { seen = path; return { ok: true, status: 200, data: {} }; }, post: async () => ({ ok: true, status: 200, data: {} }) } as never);
  await api.getCompositionsForJournal('j/1 2');
  assert.equal(seen, '/composition/for-journal?journal_id=j%2F1%202&all=true');
});


// ── beta terms (2026-09-02) — PLAN_BETA_TERMS_ACCEPTANCE_20260901 ───────────
// Affirmative assent at the door; the backend's gate as the guarantee. The
// pure rules, the wire, the stream's 428, and the door itself.

test('terms — what /terms, /features and a 428 mean for the pane', async () => {
  const { parseTermsInfo, parseTermsState, termsStateFrom428, termsStanding, termsLinks, TERMS_FALLBACK_URLS } = await import('../src/terms');

  // /terms — the door's question. The live answer, verbatim (local-dev, 2026-09-02).
  const info = parseTermsInfo({ success: true, current_version: '2026-09-01', required: ['beta_participation', 'privacy_policy'], urls: { beta_participation: 'https://www.askmyu.com/terms-of-service', privacy_policy: 'https://www.askmyu.com/privacy-policy' } });
  assert.equal(info?.currentVersion, '2026-09-01');
  assert.deepEqual(info?.required, ['beta_participation', 'privacy_policy']);
  // No version → nothing to agree to. A non-https link → the public page instead.
  assert.equal(parseTermsInfo({ success: true }), null);
  assert.deepEqual(parseTermsInfo({ current_version: 'v', urls: { beta_participation: 'javascript:alert(1)' } })?.urls, TERMS_FALLBACK_URLS);

  // /features → standing. First acceptance BLOCKS.
  const gated = parseTermsState({ terms: { current_version: '2026-09-01', required: ['beta_participation', 'privacy_policy'], satisfied: false, accepted_versions: {}, gate_enabled: true } });
  assert.equal(termsStanding(gated), 'gated');
  const fine = parseTermsState({ terms: { current_version: '2026-09-01', required: [], satisfied: true, accepted_versions: { beta_participation: '2026-09-01', privacy_policy: '2026-09-01' }, gate_enabled: true } });
  assert.equal(termsStanding(fine), 'ok');
  // A later bundle: an update, never a lockout (decision 7).
  const older = parseTermsState({ terms: { current_version: '2026-10-01', required: [], satisfied: true, accepted_versions: { beta_participation: '2026-09-01', privacy_policy: '2026-10-01' }, gate_enabled: true } });
  assert.equal(termsStanding(older), 'update');
  // Gate off → never gated, even unsatisfied. No block at all → nothing to do.
  assert.equal(termsStanding(parseTermsState({ terms: { current_version: '2026-09-01', satisfied: false, gate_enabled: false } })), 'ok');
  assert.equal(parseTermsState({ cold_start: {} }), null);
  assert.equal(termsStanding(null), 'ok');

  // The 428 body, read as the standing it implies.
  const from428 = termsStateFrom428({ error: 'terms_required', terms_required: ['beta_participation'], terms_version: '2026-09-01', urls: {} });
  assert.equal(termsStanding(from428), 'gated');
  assert.deepEqual(from428?.required, ['beta_participation']);
  assert.equal(termsStateFrom428({ error: 'something_else' }), null);

  // The links carry the agreement's own titles, in reading order.
  assert.deepEqual(termsLinks({}).map((l) => l.label), ['Beta Participation Terms', 'Privacy Policy']);
});

test('terms — the wire: /terms is public, the version rides every door, accept names the client', async () => {
  const { Api } = await import('../src/transport/api');
  const calls: Array<{ method: string; path: string; body?: Record<string, unknown>; anonymous?: boolean }> = [];
  const api = new Api({
    get: async (path: string) => { calls.push({ method: 'GET', path }); return { ok: true, status: 200, data: {} }; },
    post: async (path: string, body: Record<string, unknown>, opts?: { anonymous?: boolean }) => { calls.push({ method: 'POST', path, body, anonymous: opts?.anonymous }); return { ok: true, status: 200, data: {} }; },
  } as never);
  await api.getTerms();
  await api.requestMagicLink('a@b.co', 'Ann', '2026-09-01');
  await api.requestMagicLink('a@b.co', 'Ann');
  await api.createAccount('a@b.co', 'Ann', 'password1', '2026-09-01');
  await api.acceptTerms('2026-09-01');
  assert.equal(calls[0].path, '/terms');
  assert.deepEqual(calls[1].body, { email: 'a@b.co', name: 'Ann', client: 'obsidian', terms_version: '2026-09-01' });
  assert.equal(calls[1].anonymous, true, 'no session at the door');
  assert.ok(!('terms_version' in (calls[2].body ?? {})), 'nothing agreed → nothing claimed; the gate catches it');
  assert.deepEqual(calls[3].body, { email: 'a@b.co', name: 'Ann', password: 'password1', client: 'obsidian', terms_version: '2026-09-01' });
  assert.deepEqual(calls[4], { method: 'POST', path: '/account/terms/accept', body: { terms_version: '2026-09-01', client: 'obsidian' }, anonymous: undefined });
});

test('terms — the stream: 428 stops it, 401/403 back off, everything else retries', async () => {
  const { sseErrorPlan } = await import('../src/transport/sse');
  assert.equal(sseErrorPlan(428), 'gated', 'a screen, not a loop on the short backoff');
  assert.equal(sseErrorPlan(401), 'refused');
  assert.equal(sseErrorPlan(403), 'refused');
  assert.equal(sseErrorPlan(500), 'retry');
  assert.equal(sseErrorPlan(undefined), 'retry');
});

test('terms — the Create-account door: inert until ticked, then the version the person saw rides the request', async () => {
  const { SignupModal } = await import('../src/views/SignupModal');
  const { notices, FakeEl } = await import('./ui-stub');
  type El = InstanceType<typeof FakeEl>;
  const requests: unknown[][] = [];
  const plugin = {
    settings: { base_url: 'http://localhost/api' },
    backend: {
      getTerms: async () => ({ ok: true, status: 200, data: { current_version: '2026-09-01', required: ['beta_participation', 'privacy_policy'], urls: {} } }),
      // Refused on purpose: the 'sent' stage would arm a window timer the test has no window for.
      requestMagicLink: async (...args: unknown[]) => { requests.push(args); return { ok: false, status: 0, data: null }; },
    },
  };
  const modal = new SignupModal({} as never, plugin as never, () => undefined);
  modal.open();
  await new Promise((r) => setTimeout(r, 0)); // /terms answers
  const root = modal.contentEl as unknown as El;
  const box = () => root.find((e) => e.tag === 'input' && e.attrs.type === 'checkbox');
  assert.ok(box(), 'the checkbox is at the door');
  const links = [...root.walk()].filter((e) => e.tag === 'a').map((e) => [e.text, e.attrs.href]);
  assert.deepEqual(links, [
    ['Beta Participation Terms', 'https://www.askmyu.com/beta-program-participation-terms'],
    ['Privacy Policy', 'https://www.askmyu.com/privacy-policy'],
  ], 'both documents, built as links — the public pages when /terms names none');
  const google = () => root.find((e) => e.classes.has('myu-google-door'))!;
  assert.ok(google().classes.has('myu-inert'), 'the Google door waits for the tick');

  // Unticked: every door says why and sends nothing. (Google would reach
  // window.open, which this environment lacks — not reaching it IS the test.)
  (modal as unknown as Record<string, unknown>).email = 'a@b.co';
  const before = notices.length;
  assert.ok(await root.click('Email me a sign-in link'));
  await google().onclick!();
  assert.equal(requests.length, 0, 'inert until ticked');
  assert.ok(notices.slice(before).some((n) => /Tick the box to continue/.test(n)), 'and it says why');

  // Ticked: the request carries exactly the version that was shown.
  box()!.checked = true;
  box()!.onchange!();
  assert.ok(!google().classes.has('myu-inert'), 'the doors wake up');
  assert.ok(await root.click('Email me a sign-in link'));
  assert.deepEqual(requests[0], ['a@b.co', undefined, '2026-09-01']);

  // Sign-in flavour: no box, nothing sent, nothing inert — returning users never tick.
  const signin = new SignupModal({} as never, plugin as never, () => undefined, 'signin');
  signin.open();
  await new Promise((r) => setTimeout(r, 0));
  const sroot = signin.contentEl as unknown as El;
  assert.ok(!sroot.find((e) => e.tag === 'input' && e.attrs.type === 'checkbox'));
  assert.ok(!sroot.find((e) => e.classes.has('myu-inert')));
});

test('terms — the Today pane: gated shows one screen and nothing else; an update is a row', async () => {
  const { TodayView } = await import('../src/views/TodayView');
  const { FakeEl } = await import('./ui-stub');
  type El = InstanceType<typeof FakeEl>;
  let accepted = 0;
  let dismissed = 0;
  const make = (standing: 'gated' | 'update' | 'ok') => {
    const view = Object.create(TodayView.prototype) as InstanceType<typeof TodayView> & Record<string, unknown>;
    view['contentEl'] = new FakeEl('div');
    view['loading'] = false;
    view['errorState'] = null;
    view['plugin'] = {
      terms: { currentVersion: '2026-10-01' },
      termsStanding: () => standing,
      termsUpdateVisible: () => standing === 'update',
      termsLinkTargets: () => [{ label: 'Beta Participation Terms', url: 'https://www.askmyu.com/terms-of-service' }, { label: 'Privacy Policy', url: 'https://www.askmyu.com/privacy-policy' }],
      acceptTerms: async () => { accepted++; return true; },
      dismissTermsUpdate: () => { dismissed++; },
      unlock: { current: 'unlocked', disconnect: async () => undefined },
      settings: { setup_hidden: true, consent_completed: true, materialize_consented: true, myu_file_hashes: {} },
      pendingTransfers: [], pendingOffers: [], helpQueue: [], flags: {},
    };
    // Everything below the gate is someone else's test; stub the day's renderers.
    for (const m of ['renderSyncBar', 'renderDeviceRequests', 'renderSetup', 'renderMaterializeProgress', 'renderCues', 'renderInsights', 'renderOffers', 'renderHelpMyu', 'renderWeekEdition', 'renderLoop', 'renderBrief', 'renderNext', 'renderWeek', 'renderMonthlyPointer', 'renderMirror', 'renderChatDoor']) {
      view[m] = () => undefined;
    }
    (view as unknown as { render(): void }).render();
    return view['contentEl'] as El;
  };

  const gate = make('gated');
  const texts = gate.visibleTexts();
  assert.ok(texts.includes('Before you start'), 'the gate screen');
  assert.ok(texts.some((t) => /Read the Beta Participation Terms/.test(t)) && texts.some((t) => /Read the Privacy Policy/.test(t)), 'both documents');
  const go = gate.find((e) => e.text === 'Continue')!;
  assert.equal(go.disabled, true, 'Continue waits for the tick');
  const box = gate.find((e) => e.tag === 'input' && e.attrs.type === 'checkbox')!;
  box.checked = true;
  box.onchange!();
  assert.equal(go.disabled, false);
  await go.onclick!();
  assert.equal(accepted, 1, 'Continue is the way out');
  assert.ok(gate.find((e) => e.text === 'Sign out'), 'and Sign out is the other');

  const row = make('update');
  assert.ok(row.visibleTexts().some((t) => /updated the terms/.test(t)), 'a later version is a row');
  assert.ok(await row.click('Not now'));
  assert.equal(dismissed, 1, 'dismissible — never a lockout');

  assert.ok(!make('ok').visibleTexts().some((t) => /Before you start|updated the terms/.test(t)), 'nothing when nothing is owed');
});
