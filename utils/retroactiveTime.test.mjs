import assert from 'node:assert/strict';
import test from 'node:test';
import { recentRange, validateRetroactiveRange, wallTimeAt } from './retroactiveTime.ts';

const zone = 'Asia/Shanghai';
const now = Date.parse('2026-08-28T02:11:00Z');
const point = (date, time) => ({ date, time });

test('editing start past end never silently moves end to tomorrow', () => {
  const range = { start: point('2026-08-28', '10:10'), end: point('2026-08-28', '10:09') };
  const before = structuredClone(range);
  assert.equal(validateRetroactiveRange(range, zone, now).code, 'end-before-start');
  assert.deepEqual(range, before);
});

test('screenshot tomorrow end is rejected rather than saved as 23h59m', () => {
  const range = { start: point('2026-08-28', '10:10'), end: point('2026-08-29', '10:09') };
  assert.equal(validateRetroactiveRange(range, zone, now).code, 'future');
});

test('same-day intervals save exactly the displayed endpoints', () => {
  const result = validateRetroactiveRange({ start: point('2026-08-28', '09:40'), end: point('2026-08-28', '10:10') }, zone, now);
  assert.equal(result.ok, true);
  assert.equal(result.minutes, 30);
  assert.equal(result.startMs, Date.parse('2026-08-28T01:40:00Z'));
  assert.equal(result.endMs, Date.parse('2026-08-28T02:10:00Z'));
});

test('an explicitly chosen overnight interval in the past remains valid', () => {
  const result = validateRetroactiveRange({ start: point('2026-08-27', '23:30'), end: point('2026-08-28', '00:15') }, zone, now);
  assert.equal(result.ok, true);
  assert.equal(result.minutes, 45);
  assert.equal(result.crossesDate, true);
});

test('clock and recent presets use the application timezone at midnight', () => {
  const instant = Date.parse('2026-08-28T16:05:00Z');
  assert.deepEqual(wallTimeAt(instant, zone), point('2026-08-29', '00:05'));
  assert.deepEqual(wallTimeAt(instant, 'UTC'), point('2026-08-28', '16:05'));
  assert.deepEqual(recentRange(instant, zone, 30), {
    start: point('2026-08-28', '23:35'), end: point('2026-08-29', '00:05'),
  });
});

test('empty, impossible and zero-length values cannot be saved', () => {
  for (const bad of [point('', ''), point('2026-02-30', '10:00'), point('2026-08-28', '24:01')]) {
    assert.equal(validateRetroactiveRange({ start: bad, end: point('2026-08-28', '10:10') }, zone, now).ok, false);
  }
  const same = point('2026-08-28', '10:10');
  assert.equal(validateRetroactiveRange({ start: same, end: same }, zone, now).code, 'end-before-start');
});

test('DST nonexistent wall time is rejected instead of silently normalised', () => {
  const result = validateRetroactiveRange({ start: point('2026-03-08', '02:30'), end: point('2026-03-08', '03:30') }, 'America/New_York', Date.parse('2026-03-09T00:00:00Z'));
  assert.equal(result.ok, false);
});

test('long past intervals require explicit acknowledgement', () => {
  const result = validateRetroactiveRange({ start: point('2026-08-27', '10:00'), end: point('2026-08-28', '10:00') }, zone, now);
  assert.equal(result.ok, true);
  assert.equal(result.needsConfirmation, true);
});

test('submission revalidates against a clock that moved backwards', () => {
  const range = recentRange(now, zone);
  assert.equal(validateRetroactiveRange(range, zone, now).ok, true);
  assert.equal(validateRetroactiveRange(range, zone, now - 60000).code, 'future');
});
