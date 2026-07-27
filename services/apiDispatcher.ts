import { Task, TaskStatus, TimeSegment, Tag, RecurrenceType, Priority, AppSettings } from '../types';

export interface ApiCommandPayload {
  reqId: string;
  method: string;
  pathname: string;
  query: Record<string, string>;
  body: any;
}

export interface ApiHandlerContext {
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  tags: Tag[];
  setTags: React.Dispatch<React.SetStateAction<Tag[]>>;
  segments: TimeSegment[];
  setSegments: React.Dispatch<React.SetStateAction<TimeSegment[]>>;
  settings: AppSettings;
  handleStartTask: (taskId: string) => void;
  handlePauseTask: (taskId: string) => void;
  handleCompleteTask: (taskId: string) => void;
  handleDeleteTask: (taskId: string) => void;
  handleRetroactiveAdd: (title: string, tagId: string, startTimeMs: number, endTimeMs: number) => void;
}

export function handleApiCommand(payload: ApiCommandPayload, ctx: ApiHandlerContext) {
  const { reqId, method, pathname, query, body } = payload;
  const responder = (status: number, data: any) => {
    if (typeof window !== 'undefined' && (window as any).require) {
      try {
        const { ipcRenderer } = (window as any).require('electron');
        ipcRenderer.send(`api-response-${reqId}`, { status, data });
      } catch (e) {
        console.error('Failed to send IPC response:', e);
      }
    }
  };

  try {
    const parts = pathname.replace(/^\/api\/v1\/?/, '').split('/').filter(Boolean);
    const resource = parts[0];
    const subId = parts[1];
    const action = parts[2];

    // 1. GET /api/v1/status
    if (method === 'GET' && resource === 'status') {
      const activeSegment = ctx.segments.find(s => s.endTime === null);
      const activeTask = activeSegment ? ctx.tasks.find(t => t.id === activeSegment.taskId) || null : null;
      return responder(200, {
        activeTask: activeTask ? {
          ...activeTask,
          activeSegmentStartTime: activeSegment?.startTime
        } : null,
        totalTasksCount: ctx.tasks.length,
        runningTasksCount: ctx.tasks.filter(t => t.status === TaskStatus.RUNNING).length,
        waitingTasksCount: ctx.tasks.filter(t => t.status === TaskStatus.WAITING).length,
        completedTasksCount: ctx.tasks.filter(t => t.status === TaskStatus.COMPLETED).length,
        serverTime: Date.now()
      });
    }

    // 2. /api/v1/tasks
    if (resource === 'tasks') {
      // 2.1 GET /api/v1/tasks
      if (method === 'GET' && !subId) {
        let filtered = [...ctx.tasks];
        if (query.status) {
          filtered = filtered.filter(t => t.status.toLowerCase() === query.status.toLowerCase());
        }
        if (query.tagId) {
          filtered = filtered.filter(t => t.tagId === query.tagId);
        }
        if (query.priority) {
          filtered = filtered.filter(t => t.priority.toLowerCase() === query.priority.toLowerCase());
        }
        return responder(200, { tasks: filtered, count: filtered.length });
      }

      // 2.2 POST /api/v1/tasks/retroactive (补录任务)
      if (method === 'POST' && subId === 'retroactive') {
        if (!body.title || !body.startTime || !body.endTime) {
          return responder(400, { error: 'Missing required fields: title, startTime, endTime' });
        }
        const tagId = body.tagId || (ctx.tags[0]?.id || 't-work');
        ctx.handleRetroactiveAdd(body.title, tagId, Number(body.startTime), Number(body.endTime));
        return responder(201, { message: 'Retroactive task created successfully' });
      }

      // 2.3 GET /api/v1/tasks/:id
      if (method === 'GET' && subId) {
        const task = ctx.tasks.find(t => t.id === subId);
        if (!task) return responder(404, { error: 'Task not found' });
        const taskSegments = ctx.segments.filter(s => s.taskId === task.id);
        return responder(200, { task, segments: taskSegments });
      }

      // 2.4 POST /api/v1/tasks (创建新任务)
      if (method === 'POST' && !subId) {
        if (!body.title || typeof body.title !== 'string' || body.title.trim() === '') {
          return responder(400, { error: 'Task title is required' });
        }

        const newTask: Task = {
          id: Date.now().toString(),
          title: body.title.trim(),
          tagId: body.tagId || (ctx.tags[0]?.id || 't-work'),
          status: TaskStatus.WAITING,
          planTime: body.planTime || new Date().toISOString(),
          recurrence: body.recurrence || RecurrenceType.NONE,
          priority: body.priority || Priority.MEDIUM,
          description: body.description || '',
          links: body.links || '',
          reminderOffsets: body.reminderOffsets || [5, 15],
          createdAt: Date.now(),
          totalDuration: 0
        };

        ctx.setTasks(prev => [newTask, ...prev]);
        return responder(201, { message: 'Task created successfully', task: newTask });
      }

      // 2.5 POST /api/v1/tasks/:id/start
      if (method === 'POST' && subId && (action === 'start' || !action)) {
        const task = ctx.tasks.find(t => t.id === subId);
        if (!task) return responder(404, { error: 'Task not found' });
        ctx.handleStartTask(subId);
        return responder(200, { message: `Task '${task.title}' started`, taskId: subId });
      }

      // 2.6 POST /api/v1/tasks/:id/pause
      if (method === 'POST' && subId && action === 'pause') {
        const task = ctx.tasks.find(t => t.id === subId);
        if (!task) return responder(404, { error: 'Task not found' });
        ctx.handlePauseTask(subId);
        return responder(200, { message: `Task '${task.title}' paused`, taskId: subId });
      }

      // 2.7 POST /api/v1/tasks/:id/complete
      if (method === 'POST' && subId && action === 'complete') {
        const task = ctx.tasks.find(t => t.id === subId);
        if (!task) return responder(404, { error: 'Task not found' });
        ctx.handleCompleteTask(subId);
        return responder(200, { message: `Task '${task.title}' marked as completed`, taskId: subId });
      }

      // 2.8 DELETE /api/v1/tasks/:id
      if (method === 'DELETE' && subId) {
        const task = ctx.tasks.find(t => t.id === subId);
        if (!task) return responder(404, { error: 'Task not found' });
        ctx.handleDeleteTask(subId);
        return responder(200, { message: `Task '${task.title}' deleted`, taskId: subId });
      }
    }

    // 3. /api/v1/tags
    if (resource === 'tags') {
      if (method === 'GET') {
        return responder(200, { tags: ctx.tags });
      }
      if (method === 'POST') {
        if (!body.name) return responder(400, { error: 'Tag name is required' });
        const newTag: Tag = {
          id: 't-' + Date.now().toString().slice(-6),
          name: body.name,
          color: body.color || 'bg-blue-500',
          description: body.description || ''
        };
        ctx.setTags(prev => [...prev, newTag]);
        return responder(201, { message: 'Tag created', tag: newTag });
      }
      if (method === 'DELETE' && subId) {
        ctx.setTags(prev => prev.filter(t => t.id !== subId));
        return responder(200, { message: 'Tag deleted', tagId: subId });
      }
    }

    // 4. /api/v1/segments
    if (resource === 'segments') {
      if (method === 'GET') {
        let result = ctx.segments;
        if (query.taskId) {
          result = result.filter(s => s.taskId === query.taskId);
        }
        return responder(200, { segments: result, count: result.length });
      }
    }

    // 5. /api/v1/analytics
    if (resource === 'analytics') {
      const tagDurationMap: Record<string, number> = {};
      ctx.tasks.forEach(t => {
        const dur = t.totalDuration || 0;
        tagDurationMap[t.tagId] = (tagDurationMap[t.tagId] || 0) + dur;
      });

      return responder(200, {
        totalDurationSeconds: ctx.tasks.reduce((acc, t) => acc + (t.totalDuration || 0), 0),
        tagDurationMap,
        totalTasks: ctx.tasks.length,
        totalSegments: ctx.segments.length
      });
    }

    // 6. /api/v1/export
    if (resource === 'export') {
      return responder(200, {
        exportedAt: new Date().toISOString(),
        tasks: ctx.tasks,
        tags: ctx.tags,
        segments: ctx.segments,
        settings: ctx.settings
      });
    }

    return responder(404, { error: `Endpoint not found: ${method} ${pathname}` });
  } catch (err: any) {
    console.error('[API Dispatcher Error]', err);
    return responder(500, { error: 'Internal Server Error', message: err.message });
  }
}
