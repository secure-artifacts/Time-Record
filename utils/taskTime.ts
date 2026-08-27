import { Task, TaskStatus, TimeSegment } from '../types';

/** Crash/kill recovery: credit at most 8 hours for an unclosed segment. Graceful close pauses at the real time. */
export const CRASH_RECOVERY_MAX_MS = 8 * 60 * 60 * 1000;

export const segmentDurationSeconds = (start: number, end: number | null, now = Date.now()): number => {
  return Math.max(0, Math.floor(((end ?? now) - start) / 1000));
};

export const sumDurationForTask = (segments: TimeSegment[], taskId: string, now = Date.now()): number => {
  return segments
    .filter(s => s.taskId === taskId)
    .reduce((acc, s) => acc + segmentDurationSeconds(s.startTime, s.endTime, now), 0);
};

export const recomputeAllDurations = (tasks: Task[], segments: TimeSegment[], now = Date.now()): Task[] => {
  return tasks.map(t => ({ ...t, totalDuration: sumDurationForTask(segments, t.id, now) }));
};

export const clipOverlappingSegments = (
  segments: TimeSegment[],
  startTime: number,
  endTime: number,
  options?: { preserveIds?: Set<string>; now?: number }
): { next: TimeSegment[]; affectedTaskIds: Set<string>; trimmedCount: number } => {
  const now = options?.now ?? Date.now();
  const preserveIds = options?.preserveIds;
  const next: TimeSegment[] = [];
  const affectedTaskIds = new Set<string>();
  let trimmedCount = 0;

  for (const seg of segments) {
    if (preserveIds?.has(seg.id)) {
      next.push(seg);
      continue;
    }
    const segEnd = seg.endTime ?? now;
    if (!(seg.startTime < endTime && segEnd > startTime)) {
      next.push(seg);
      continue;
    }

    affectedTaskIds.add(seg.taskId);
    trimmedCount++;

    if (seg.startTime >= startTime && segEnd <= endTime) {
      // Fully covered — drop.
    } else if (seg.startTime < startTime && segEnd > endTime) {
      next.push({ ...seg, endTime: startTime });
      next.push({
        ...seg,
        id: crypto.randomUUID(),
        startTime: endTime,
        endTime: seg.endTime,
      });
    } else if (seg.startTime < startTime && segEnd <= endTime) {
      next.push({ ...seg, endTime: startTime });
    } else if (seg.startTime >= startTime && segEnd > endTime) {
      next.push({ ...seg, startTime: endTime });
    }
  }

  return { next, affectedTaskIds, trimmedCount };
};

export const pauseTasksMissingOpenSegment = (tasks: Task[], segments: TimeSegment[]): Task[] => {
  const openTaskIds = new Set(segments.filter(s => s.endTime === null).map(s => s.taskId));
  return tasks.map(t => {
    if (t.status === TaskStatus.RUNNING && !openTaskIds.has(t.id)) {
      return { ...t, status: TaskStatus.PAUSED };
    }
    return t;
  });
};

export const applyStatusChange = (
  tasks: Task[],
  segments: TimeSegment[],
  id: string,
  newStatus: TaskStatus,
  now = Date.now()
): { tasks: Task[]; segments: TimeSegment[]; pausedId?: string } => {
  let pausedId: string | undefined;
  if (newStatus === TaskStatus.RUNNING) {
    const running = tasks.find(t => t.status === TaskStatus.RUNNING && t.id !== id);
    if (running) pausedId = running.id;
  }

  let nextSegs = segments.map(s => ({ ...s }));
  const closeOpen = (taskId: string) => {
    const idx = nextSegs.findIndex(s => s.taskId === taskId && s.endTime === null);
    if (idx !== -1) nextSegs[idx] = { ...nextSegs[idx], endTime: now };
  };

  if (pausedId) closeOpen(pausedId);
  if (newStatus === TaskStatus.PAUSED || newStatus === TaskStatus.COMPLETED || newStatus === TaskStatus.ARCHIVED) {
    closeOpen(id);
  }
  if (newStatus === TaskStatus.RUNNING) {
    nextSegs.push({ id: crypto.randomUUID(), taskId: id, startTime: now, endTime: null });
  }

  const nextTasks = tasks.map(t => {
    if (t.id === pausedId) {
      return { ...t, status: TaskStatus.PAUSED, totalDuration: sumDurationForTask(nextSegs, t.id, now) };
    }
    if (t.id === id) {
      return {
        ...t,
        status: newStatus,
        completedAt: newStatus === TaskStatus.COMPLETED ? now : undefined,
        totalDuration: sumDurationForTask(nextSegs, t.id, now),
      };
    }
    return t;
  });

  return { tasks: nextTasks, segments: nextSegs, pausedId };
};

export const closeOpenSegmentsNow = (
  tasks: Task[],
  segments: TimeSegment[],
  now = Date.now()
): { tasks: Task[]; segments: TimeSegment[]; changed: boolean } => {
  let changed = false;
  const nextSegs = segments.map(s => {
    if (s.endTime === null) {
      changed = true;
      return { ...s, endTime: now };
    }
    return s;
  });
  if (!changed) return { tasks, segments, changed: false };

  const nextTasks = tasks.map(t => {
    const duration = sumDurationForTask(nextSegs, t.id, now);
    if (t.status === TaskStatus.RUNNING) {
      return { ...t, status: TaskStatus.PAUSED, totalDuration: duration };
    }
    return { ...t, totalDuration: duration };
  });
  return { tasks: nextTasks, segments: nextSegs, changed: true };
};

export const recoverOpenSegments = (
  tasks: Task[],
  segments: TimeSegment[],
  now = Date.now(),
  maxMs = CRASH_RECOVERY_MAX_MS
): { tasks: Task[]; segments: TimeSegment[]; recovered: number; capped: number } => {
  let recovered = 0;
  let capped = 0;
  const nextSegs = segments.map(seg => {
    if (seg.endTime !== null) return seg;
    recovered++;
    const cappedEnd = Math.min(now, seg.startTime + maxMs);
    if (cappedEnd < now) capped++;
    return { ...seg, endTime: cappedEnd };
  });

  const wasRunning = new Set(segments.filter(s => s.endTime === null).map(s => s.taskId));
  const nextTasks = tasks.map(t => {
    const duration = sumDurationForTask(nextSegs, t.id, now);
    if (wasRunning.has(t.id) && t.status === TaskStatus.RUNNING) {
      return { ...t, status: TaskStatus.PAUSED, totalDuration: duration };
    }
    return { ...t, totalDuration: duration };
  });

  return { tasks: nextTasks, segments: nextSegs, recovered, capped };
};
