/**
 * The cold-start calendar offer's doors, shared between surfaces: the chat
 * thread (canonical — the offer is conversational content) and the welcome
 * canvas (a panel copy, never a second ask). One runner so both behave
 * identically; option ids and copy are server-authored and rendered verbatim.
 */
import type AskMyuPlugin from '../main';
import { pickFile } from './pickFile';

export type OfferOutcome = {
  ok: boolean;
  message?: string;
  /** The offer is ANSWERED: a calendar landed, or a real "no". Undefined = still open (e.g. the browser consent is in flight). */
  done?: 'connected' | 'dismissed';
  /** Server-authored acknowledgement to show IN PLACE of the offer (stop_asking's stopped_ack). */
  ackText?: string;
};

export async function runOfferOption(
  plugin: AskMyuPlugin,
  option: string,
  params: Record<string, unknown> | undefined,
): Promise<OfferOutcome> {
  const moment = typeof params?.moment === 'string' ? params.moment : '';
  // An option carrying `init` starts that OAuth verbatim — provider, scope_set
  // (calendar | history | all | drive), return_to all server-authored.
  const init = params?.init && typeof params.init === 'object' ? (params.init as { provider?: string; scope_set?: string; return_to?: string }) : null;
  if (init?.provider === 'google' || init?.provider === 'microsoft') {
    const opts = { scopeSet: init.scope_set as import('../transport/api').ScopeSet | undefined, returnTo: init.return_to };
    const res = init.provider === 'google'
      ? await plugin.backend.googleOAuthInit(opts).catch(() => null)
      : await plugin.backend.microsoftOAuthInit(opts).catch(() => null);
    const url = res?.data?.auth_url;
    if (!res?.ok || !url) return { ok: false, message: 'The consent screen did not answer. Try again in a moment.' };
    window.open(url, '_blank');
    return { ok: true, message: 'Finish in your browser \u2014 Myu starts reading when you come back.' };
  }
  // "Stop asking" ends every rung, on every surface that carries an offer —
  // the welcome canvas included (delta #3). The payload's stopped_ack replaces
  // the offer verbatim; it names Settings as the way back.
  if (option === 'stop_asking') {
    const accountId = plugin.settings.account_id;
    if (accountId) await plugin.backend.updateAccountState(accountId, { myuScripts: { offer_all_stopped: true } }).catch(() => undefined);
    plugin.welcomeOfferAnswered = true;
    const ack = typeof params?.stopped_ack === 'string' && params.stopped_ack ? params.stopped_ack : 'Done \u2014 Myu won\u2019t bring this up again. Settings stays the door.';
    return { ok: true, done: 'dismissed', ackText: ack, message: ack };
  }
  // A moment option WITHOUT init is an ANSWER (OfferMoments): stop_asking ends
  // every rung everywhere (reversible in Settings), not_now snoozes THIS
  // conversation, the notes answers record where notes live. The server reads
  // exactly these keys and values.
  if (moment) {
    const accountId = plugin.settings.account_id;
    const answer = async (myuScripts: Record<string, unknown>) => {
      if (accountId) await plugin.backend.updateAccountState(accountId, { myuScripts }).catch(() => undefined);
    };
    if (option === 'not_now') {
      const journalId = typeof params?.journal_id === 'string' ? params.journal_id : '';
      if (journalId) await answer({ offer_snoozed_journal: journalId });
      return { ok: true, done: 'dismissed', message: 'Noted.' };
    }
    if (option === 'notes_none' || option === 'notes_transcripts') {
      await answer({ offer_notes_state: option === 'notes_none' ? 'none' : 'transcripts' });
      return { ok: true, done: 'dismissed', message: 'Noted.' };
    }
    return { ok: false, message: 'Not an option here.' };
  }
  if (option === 'calendar_google' || option === 'calendar_microsoft') {
    const opts = { scopeSet: 'calendar' as const, returnTo: 'dashboard' };
    const init = option === 'calendar_google'
      ? await plugin.backend.googleOAuthInit(opts).catch(() => null)
      : await plugin.backend.microsoftOAuthInit(opts).catch(() => null);
    const url = init?.data?.auth_url;
    if (!init?.ok || !url) return { ok: false, message: `${option === 'calendar_google' ? 'Google' : 'Microsoft'} did not answer. Try again, or paste a calendar link.` };
    window.open(url, '_blank');
    // Not answered yet — the consent may be abandoned in the browser.
    return { ok: true, message: 'Finish in your browser \u2014 your week starts painting in Today when you come back.' };
  }
  if (option === 'calendar_ical') {
    const url = String(params?.url ?? '').trim();
    const res = await plugin.backend.addIcalUrl(url).catch(() => null);
    if (!res?.ok || res.data?.success === false) return { ok: false, message: res?.data?.error || 'That address did not read as a calendar. Check it ends with .ics and try again.' };
    if (!moment) plugin.welcomeOfferAnswered = true;
    void plugin.refreshTodayNow();
    return { ok: true, done: 'connected', message: `${res.data?.events_stored ?? 0} events read \u2713` };
  }
  if (option === 'calendar_ics') {
    const picked = await pickFile('.ics,text/calendar');
    if (!picked) return { ok: false, message: 'No file chosen.' };
    const res = await plugin.backend.uploadIcs(picked.bytes).catch(() => null);
    if (!res?.ok || res.data?.success === false) return { ok: false, message: res?.data?.error || 'That file did not read as a calendar export. Export an .ics and try again.' };
    if (!moment) plugin.welcomeOfferAnswered = true;
    void plugin.refreshTodayNow();
    return { ok: true, done: 'connected', message: `${res.data?.events_stored ?? 0} events read \u2713` };
  }
  if (option === 'just_tell') {
    // A real "no" ends the ask everywhere; Settings stays the durable path.
    const accountId = plugin.settings.account_id;
    if (accountId) await plugin.backend.updateAccountState(accountId, { myuScripts: { offer_dismissed_at: new Date().toISOString() } }).catch(() => undefined);
    plugin.welcomeOfferAnswered = true;
    return { ok: true, done: 'dismissed', message: 'Noted \u2014 just tell Myu as you go.' };
  }
  return { ok: false, message: 'Not an option here.' };
}

/**
 * Which source an offer is asking for — calendar, mail, notes, or everything.
 * Two asks for the same source on one screen is noise; two asks for different
 * sources are two different questions, and hiding one loses it.
 */
export function offerSource(moment: string | undefined, component: { data?: unknown }): string {
  if (moment === 'calendar' || moment === 'mail' || moment === 'notes' || moment === 'connect_rest' || moment === 'history') return moment;
  const options = ((component.data as { options?: Array<{ id?: string }> } | undefined)?.options ?? []).map((o) => o.id ?? '');
  if (options.some((id) => id.startsWith('calendar'))) return 'calendar';
  if (options.some((id) => id === 'gmail' || id === 'microsoft' || id.startsWith('mail'))) return 'mail';
  if (options.some((id) => id.startsWith('drive') || id.startsWith('notes'))) return 'notes';
  return 'unknown';
}
