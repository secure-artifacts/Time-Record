import { getZonedParts, zonedWallTimeToUtc } from './timeUtils.ts';

export interface WallTime { date: string; time: string }
export interface RetroactiveRange { start: WallTime; end: WallTime }

export const wallTimeAt = (timestamp: number, timezone: string): WallTime => {
  const p = getZonedParts(new Date(timestamp), timezone);
  const pad = (n: number) => String(n).padStart(2, '0');
  return { date: `${p.year}-${pad(p.month)}-${pad(p.day)}`, time: `${pad(p.hour)}:${pad(p.minute)}` };
};

export const recentRange = (now: number, timezone: string, minutes = 30): RetroactiveRange => ({
  start: wallTimeAt(now - minutes * 60000, timezone),
  end: wallTimeAt(now, timezone),
});

const parseWallTime = (point: WallTime, timezone: string): number | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(point.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(point.time)) return null;
  try {
    const [hour, minute] = point.time.split(':').map(Number);
    const timestamp = zonedWallTimeToUtc(point.date, hour, minute, timezone);
    const roundTrip = wallTimeAt(timestamp, timezone);
    // Reject invalid dates and nonexistent DST times instead of normalising them.
    return roundTrip.date === point.date && roundTrip.time === point.time ? timestamp : null;
  } catch {
    return null;
  }
};

type RangeResult =
  | { ok: false; code: 'invalid' | 'end-before-start' | 'future'; message: string }
  | { ok: true; startMs: number; endMs: number; minutes: number; crossesDate: boolean; needsConfirmation: boolean };

// Validation never edits either endpoint. Preview and submission use this same rule.
export const validateRetroactiveRange = (range: RetroactiveRange, timezone: string, now: number): RangeResult => {
  const startMs = parseWallTime(range.start, timezone);
  const endMs = parseWallTime(range.end, timezone);
  if (startMs === null || endMs === null) {
    return { ok: false, code: 'invalid', message: '请填写有效的日期和时间（夏令时跳过的时刻不可选）。' };
  }
  if (endMs <= startMs) {
    return { ok: false, code: 'end-before-start', message: '结束必须晚于开始。若确实跨夜，请手动选择对应日期，不会自动加一天。' };
  }
  if (endMs > now) {
    return { ok: false, code: 'future', message: '补录只能记录已经发生的时间，结束不能晚于现在。' };
  }
  const minutes = Math.floor((endMs - startMs) / 60000);
  return { ok: true, startMs, endMs, minutes, crossesDate: range.start.date !== range.end.date, needsConfirmation: minutes > 360 };
};
