// 19b3, the plugin's copy of "What you owe": the check's day is `next_check_day` when sent (New York and Tokyo).
import { strict as assert } from 'node:assert';
import test from 'node:test';
import { COMMITMENTS_FOLD_WORDS, commitmentRow } from '../src/commitmentsFold';
import type { Commitment } from '../src/wire';

function inZone<T>(tz: string, f: () => T): T {
  const before = process.env.TZ;
  process.env.TZ = tz;
  try {
    return f();
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
}
const C = (over: Partial<Commitment>): Commitment => ({ commitment_id: 'c1', what: 'the deck', owner: 'me', status: 'open', counterparty: { type: 'person', id: 'p1', name: 'Priya' }, ...over }) as Commitment;
const NY_CHECK = { next_check: '2026-11-21T04:59:59Z', next_check_day: '2026-11-20' };

test('New York and Tokyo: a New York check on the 20th reads "tomorrow" on the 19th by its day field', () => {
  inZone('America/New_York', () => assert.equal(commitmentRow(C(NY_CHECK), new Date('2026-11-19T17:00:00Z')).check, COMMITMENTS_FOLD_WORDS.nextCheck('tomorrow')));
  inZone('Asia/Tokyo', () => {
    const noon19 = new Date('2026-11-19T03:00:00Z');
    assert.equal(commitmentRow(C(NY_CHECK), noon19).check, COMMITMENTS_FOLD_WORDS.nextCheck('tomorrow'));
    assert.notEqual(commitmentRow(C({ next_check: NY_CHECK.next_check }), noon19).check, COMMITMENTS_FOLD_WORDS.nextCheck('tomorrow'), 'the instant alone: the 21st in Tokyo');
  });
});
