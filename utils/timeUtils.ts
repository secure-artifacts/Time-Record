
/**
 * Formats a date string or timestamp into a readable time string based on timezone
 */
export const formatTimeInZone = (dateInput: string | number | Date, timezone: string): string => {
  try {
    const date = new Date(dateInput);
    return new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: timezone
    }).format(date);
  } catch (e) {
    console.error(`Timezone error: ${timezone}`, e);
    return new Date(dateInput).toLocaleTimeString();
  }
};

/**
 * Formats a date into "Month/Day Time" format
 */
export const formatDateTimeInZone = (dateInput: string | number | Date, timezone: string): string => {
  try {
    const date = new Date(dateInput);
    return new Intl.DateTimeFormat('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: timezone
    }).format(date);
  } catch (e) {
      return new Date(dateInput).toLocaleString();
  }
};

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export const getZonedParts = (date: Date, timezone: string): ZonedParts => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }

  let hour = parseInt(map.hour || '0', 10);
  if (hour === 24) hour = 0;

  return {
    year: parseInt(map.year, 10),
    month: parseInt(map.month, 10),
    day: parseInt(map.day, 10),
    hour,
    minute: parseInt(map.minute || '0', 10),
    second: parseInt(map.second || '0', 10),
  };
};

/**
 * Returns the hour (0-23) of a date in a specific timezone
 */
export const getHourInZone = (date: Date, timezone: string): number => {
    try {
        return getZonedParts(date, timezone).hour;
    } catch (e) {
        return date.getHours();
    }
};

export const getMinuteInZone = (date: Date, timezone: string): number => {
    try {
        return getZonedParts(date, timezone).minute;
    } catch (e) {
        return date.getMinutes();
    }
};

/**
 * YYYY-MM-DD in the given timezone (civil date, not UTC).
 */
export const getDateStringInZone = (dateInput: string | number | Date, timezone: string): string => {
  try {
    const p = getZonedParts(new Date(dateInput), timezone);
    return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
  } catch {
    const d = new Date(dateInput);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
};

/** Shift a YYYY-MM-DD civil date by whole days (not UTC arithmetic). */
export const addDaysToDateStr = (dateStr: string, days: number): string => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export const formatDateLabel = (dateStr: string): string => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });
};

export const weekdayLabel = (dateStr: string): string => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('zh-CN', { weekday: 'short' });
};

/** Parse YYYY-MM-DD + HH:mm as a local Date (browser timezone). */
export const parseLocalDateTime = (dateStr: string, timeHHmm: string): Date => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeHHmm.split(':').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0);
};

export const toLocalDateStr = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const toLocalTimeStr = (d: Date): string =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/**
 * UTC timestamp for a wall-clock time in `timeZone`.
 */
export const zonedWallTimeToUtc = (
  dateStr: string,
  hour: number,
  minute: number,
  timeZone: string
): number => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = Date.UTC(y, m - 1, d, hour, minute, 0);
  let t = target;
  for (let i = 0; i < 8; i++) {
    const p = getZonedParts(new Date(t), timeZone);
    const actual = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const diff = target - actual;
    if (Math.abs(diff) < 500) return t - p.second * 1000;
    t += diff;
  }
  return t;
};

const nextBoundary = (
  fromMs: number,
  timeZone: string,
  sameBucket: (from: ZonedParts, at: ZonedParts) => boolean
): number => {
  const startParts = getZonedParts(new Date(fromMs), timeZone);
  let lo = fromMs + 1;
  let hi = fromMs + 36 * 3600 * 1000;
  if (!sameBucket(startParts, getZonedParts(new Date(hi), timeZone))) {
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (sameBucket(startParts, getZonedParts(new Date(mid), timeZone))) lo = mid;
      else hi = mid;
    }
    return hi;
  }
  return fromMs + 24 * 3600 * 1000;
};

export const nextZonedMidnightUtc = (fromMs: number, timeZone: string): number => {
  const currentDate = getDateStringInZone(fromMs, timeZone);
  return nextBoundary(fromMs, timeZone, (_from, at) =>
    `${at.year}-${String(at.month).padStart(2, '0')}-${String(at.day).padStart(2, '0')}` === currentDate
  );
};

export interface DaySlice {
  dateStr: string;
  start: number;
  end: number;
  durationMs: number;
}

export const splitRangeByZonedDays = (startMs: number, endMs: number, timeZone: string): DaySlice[] => {
  if (endMs <= startMs) return [];
  const slices: DaySlice[] = [];
  let cursor = startMs;
  let guard = 0;
  while (cursor < endMs && guard < 400) {
    guard++;
    const dateStr = getDateStringInZone(cursor, timeZone);
    const pieceEnd = Math.min(endMs, nextZonedMidnightUtc(cursor, timeZone));
    slices.push({ dateStr, start: cursor, end: pieceEnd, durationMs: pieceEnd - cursor });
    cursor = pieceEnd;
  }
  return slices;
};

export interface HourSlice {
  dateStr: string;
  hour: number;
  start: number;
  end: number;
  minuteStartInHour: number;
  durationMin: number;
}

export const splitRangeByZonedHours = (startMs: number, endMs: number, timeZone: string): HourSlice[] => {
  if (endMs <= startMs) return [];
  const slices: HourSlice[] = [];
  let cursor = startMs;
  let guard = 0;
  while (cursor < endMs && guard < 24 * 14) {
    guard++;
    const parts = getZonedParts(new Date(cursor), timeZone);
    const dateStr = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
    const nextHour = nextBoundary(cursor, timeZone, (from, at) =>
      from.year === at.year && from.month === at.month && from.day === at.day && from.hour === at.hour
    );
    const pieceEnd = Math.min(endMs, nextHour);
    slices.push({
      dateStr,
      hour: parts.hour,
      start: cursor,
      end: pieceEnd,
      minuteStartInHour: parts.minute + parts.second / 60,
      durationMin: (pieceEnd - cursor) / 60000,
    });
    cursor = pieceEnd;
  }
  return slices;
};

/** Last 7 civil dates in zone, ending at today + weekOffset*7. */
export const getTrailingWeekDateStrs = (timezone: string, weekOffset = 0): string[] => {
  const todayStr = getDateStringInZone(new Date(), timezone);
  const endStr = addDaysToDateStr(todayStr, weekOffset * 7);
  return Array.from({ length: 7 }, (_, i) => addDaysToDateStr(endStr, i - 6));
};

/**
 * Returns the UTC offset string for a given timezone, e.g., "UTC+8" or "UTC-5"
 */
export const getTimezoneOffset = (timezone: string): string => {
  try {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        timeZoneName: 'shortOffset'
    }).formatToParts(now);
    
    const offsetPart = parts.find(p => p.type === 'timeZoneName');
    if (offsetPart) {
        return offsetPart.value.replace('GMT', 'UTC');
    }
    return 'UTC';
  } catch (e) {
    return 'UTC';
  }
};

/**
 * Creates a Date that represents a specific hour today in a specific timezone
 */
export const getDateForZoneHour = (hour: number, timezone: string): Date => {
    const dateStr = getDateStringInZone(new Date(), timezone);
    return new Date(zonedWallTimeToUtc(dateStr, hour, 0, timezone));
};

export const addMonthsClamped = (date: Date, months: number): Date => {
  const day = date.getDate();
  const next = new Date(date);
  next.setDate(1);
  next.setMonth(next.getMonth() + months);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, lastDay));
  next.setHours(date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());
  return next;
};
