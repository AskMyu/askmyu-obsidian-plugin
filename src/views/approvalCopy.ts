/**
 * What to tell a person when a device approval could not go on — by the step
 * that failed and the server's answer. One sentence, the cause, the next move.
 */

import type { ApprovalFailure } from '../auth/UnlockMachine';
import { loadFailure } from './settingsLoad';

export function approvalFailureText(f: ApprovalFailure): string {
  if (f.step === 'handover') return 'The key handover did not finish on this device. Try again.';
  if (f.step === 'request' && f.status === 429) {
    return 'Too many approval requests in the last hour, so askMyu asked for a pause. Try again later, or use your recovery phrase.';
  }
  const why = loadFailure({ ok: false, status: f.status, error: f.error }) ?? 'Something went wrong.';
  return f.step === 'request' ? `Could not start the approval. ${why}` : `Could not check on the approval. ${why}`;
}
