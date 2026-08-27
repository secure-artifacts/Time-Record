import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import test from 'node:test';
import { splitRangeByZonedDays, splitRangeByZonedHours } from './timeUtils.ts';

const timestamp = value => Date.parse(value);

test('analysis and heatmap calculations do not block navigation with 3000 records', () => {
  const base = timestamp('2026-08-27T01:00:00Z');
  for (const split of [splitRangeByZonedDays, splitRangeByZonedHours]) {
    const started = performance.now();
    let total = 0;
    for (let i = 0; i < 3000; i++) {
      const start = base - i * 3600000;
      for (const slice of split(start, start + 1800000, 'Asia/Shanghai')) {
        total += slice.end - slice.start;
      }
    }
    const elapsed = performance.now() - started;
    assert.equal(total, 3000 * 1800000);
    assert.ok(elapsed < 1500, `${split.name} blocked the main thread for ${Math.round(elapsed)}ms`);
  }
});

test('overnight records retain their exact duration in each timezone', () => {
  const start = timestamp('2026-08-27T15:30:00Z');
  const end = timestamp('2026-08-27T16:30:00Z');
  assert.deepEqual(splitRangeByZonedDays(start, end, 'Asia/Shanghai').map(s => [s.dateStr, s.durationMs]), [
    ['2026-08-27', 1800000], ['2026-08-28', 1800000],
  ]);
  assert.deepEqual(splitRangeByZonedDays(start, end, 'UTC').map(s => [s.dateStr, s.durationMs]), [
    ['2026-08-27', 3600000],
  ]);
  assert.deepEqual(splitRangeByZonedHours(start, end, 'Asia/Shanghai').map(s => [s.hour, s.durationMin]), [
    [23, 30], [0, 30],
  ]);
});

test('a record ending exactly at midnight does not create an empty next day', () => {
  const start = timestamp('2026-08-27T15:30:00Z');
  const end = timestamp('2026-08-27T16:00:00Z');
  assert.deepEqual(splitRangeByZonedDays(start, end, 'Asia/Shanghai').map(s => [s.dateStr, s.durationMs]), [
    ['2026-08-27', 1800000],
  ]);
  assert.deepEqual(splitRangeByZonedDays(end, end, 'Asia/Shanghai'), []);
});

test('DST days conserve elapsed time instead of assuming every day is 24 hours', () => {
  for (const [start, end, hours] of [
    ['2026-03-08T05:00:00Z', '2026-03-09T04:00:00Z', 23],
    ['2026-11-01T04:00:00Z', '2026-11-02T05:00:00Z', 25],
  ]) {
    const slices = splitRangeByZonedDays(timestamp(start), timestamp(end), 'America/New_York');
    assert.equal(slices.length, 1);
    assert.equal(slices[0].durationMs, hours * 3600000);
    const hourly = splitRangeByZonedHours(timestamp(start), timestamp(end), 'America/New_York');
    assert.equal(hourly.reduce((sum, s) => sum + s.end - s.start, 0), hours * 3600000);
  }
});
