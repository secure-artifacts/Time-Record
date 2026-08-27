
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Sidebar } from './components/Sidebar';
import { TaskItem } from './components/TaskItem';
import { SmartBar } from './components/SmartBar';
import { FocusWidget } from './components/FocusWidget';
import { WeeklyHeatmap } from './components/WeeklyHeatmap';
import { TagManager } from './components/TagManager';
import { BackupModal } from './components/BackupModal';
import { EditSegmentsModal } from './components/EditSegmentsModal';
import { checkAndPerformBackup } from './utils/backupService';
import { AnalyticsView } from './components/AnalyticsView';
import { DailyTimeline } from './components/DailyTimeline';
import { WorldClockView } from './components/WorldClockView';
import { ReminderModal } from './components/ReminderModal';
import { EditTaskModal } from './components/EditTaskModal';
import { DeleteConfirmModal } from './components/DeleteConfirmModal';
import { ResumeModal } from './components/ResumeModal';
import { SettingsModal } from './components/SettingsModal';
import { RetroactiveModal } from './components/RetroactiveModal';
import { handleApiCommand } from './services/apiDispatcher';
import { Task, TaskStatus, TimeSegment, RecurrenceType, Tag, AIReminder, Priority, AppSettings } from './types';
import { addMonthsClamped, getDateStringInZone } from './utils/timeUtils';
import {
  applyStatusChange,
  clipOverlappingSegments,
  closeOpenSegmentsNow,
  pauseTasksMissingOpenSegment,
  recoverOpenSegments,
  recomputeAllDurations,
  sumDurationForTask,
} from './utils/taskTime';

const SETTINGS_KEY = 'mindflow_settings_v7';

const defaultSettings = (): AppSettings => ({
  model: 'gemini-2.5-flash',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  autoBackupInterval: 1,
  enableApiServer: true,
  apiPort: 3618,
  apiToken: '',
});

const pushApiConfig = (next: AppSettings) => {
  if (typeof window === 'undefined' || !(window as any).require) return;
  try {
    const { ipcRenderer } = (window as any).require('electron');
    ipcRenderer.send('update-api-config', {
      port: next.apiPort || 3618,
      enabled: next.enableApiServer !== false,
      token: next.apiToken || '',
    });
  } catch (e) {
    console.error('Failed to notify Electron API config:', e);
  }
};

const DEFAULT_TAGS: Tag[] = [
  { id: 't-work', name: '工作', color: 'bg-blue-500', description: '代码, 会议, 文档, 业务' },
  { id: 't-study', name: '学习', color: 'bg-indigo-500', description: '阅读, 课程, 研究' },
  { id: 't-life', name: '生活', color: 'bg-orange-500', description: '吃饭, 睡觉, 家务, 购物' },
  { id: 't-spiritual', name: '灵生活', color: 'bg-purple-500', description: '祷告, 读神话, 写文章, 聚会, 听讲道' },
  { id: 't-health', name: '健康', color: 'bg-green-500', description: '运动, 健身, 跑步' },
  { id: 't-play', name: '娱乐', color: 'bg-red-500', description: '游戏, 电影, 音乐' },
];

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'tasks' | 'heatmap' | 'analytics' | 'timeline' | 'worldclock'>('tasks');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [segments, setSegments] = useState<TimeSegment[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showTagManager, setShowTagManager] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showBackup, setShowBackup] = useState(false);
  const [showRetroactive, setShowRetroactive] = useState(false);
  const [focusMode, setFocusMode] = useState<string | null>(null);
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [autoBackupInterval, setAutoBackupInterval] = useState(1);

  const [interruptedTaskId, setInterruptedTaskId] = useState<string | null>(null);
  const [aiPopup, setAiPopup] = useState<AIReminder | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingSegmentsTask, setEditingSegmentsTask] = useState<Task | null>(null);
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);
  const [resumeTask, setResumeTask] = useState<Task | null>(null);
  const [showOlderCompleted, setShowOlderCompleted] = useState(false);

  const audioCtx = useRef<AudioContext | null>(null);
  const tasksRef = useRef<Task[]>([]);
  const segmentsRef = useRef<TimeSegment[]>([]);
  const tagsRef = useRef<Tag[]>([]);
  tasksRef.current = tasks;
  segmentsRef.current = segments;
  tagsRef.current = tags;

// --- Initialization ---
  const [isLoaded, setIsLoaded] = useState(false); // 新增：防止初始数据被覆盖的锁
  useEffect(() => {
    let loadedSettings = defaultSettings();
    const savedSettings = localStorage.getItem(SETTINGS_KEY);
    if (savedSettings) {
        try {
            loadedSettings = { ...loadedSettings, ...JSON.parse(savedSettings) };
        } catch (e) {}
    }
    setTimezone(loadedSettings.timezone);
    setAutoBackupInterval(loadedSettings.autoBackupInterval || 1);
    pushApiConfig(loadedSettings);

    // 1. Load Tags
    const savedTags = localStorage.getItem('mindflow_tags_v7');
    if (savedTags) {
      setTags(JSON.parse(savedTags));
    } else {
      setTags(DEFAULT_TAGS);
    }

    // 2. Load Tasks and Segments together to fix unexpected closes
    let loadedTasks: Task[] = [];
    let loadedSegments: TimeSegment[] = [];

    const savedTasks = localStorage.getItem('mindflow_tasks_v7');
    if (savedTasks) {
      try {
        loadedTasks = JSON.parse(savedTasks);
      } catch (e) {
        console.error("Failed to parse tasks", e);
      }
    }

    const savedSegments = localStorage.getItem('mindflow_segments_v7');
    if (savedSegments) {
        try {
            loadedSegments = JSON.parse(savedSegments);
        } catch (e) {}
    }

    const recovered = recoverOpenSegments(loadedTasks, loadedSegments);
    loadedTasks = recovered.tasks;
    loadedSegments = recovered.segments;

    setTasks(loadedTasks);
    setSegments(loadedSegments);
    tasksRef.current = loadedTasks;
    segmentsRef.current = loadedSegments;

    if (recovered.recovered > 0) {
      const capNote = recovered.capped > 0
        ? `未正常关闭的时段最多计入 8 小时（共 ${recovered.capped} 段被封顶）。`
        : '已按关闭前的实际时间暂停。';
      setTimeout(() => {
        setAiPopup({
          show: true,
          message: `检测到上次有进行中的计时，已自动暂停。${capNote}`,
          type: 'undo',
        });
      }, 300);
    }

    // 4. Request Permissions
    if (Notification.permission !== 'granted') Notification.requestPermission();
    audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)();

    // Fix Audio autoplay policy by resuming on first interaction
    const resumeAudio = () => {
      if (audioCtx.current && audioCtx.current.state === 'suspended') {
        audioCtx.current.resume();
      }
      document.removeEventListener('click', resumeAudio);
      document.removeEventListener('keydown', resumeAudio);
    };
    document.addEventListener('click', resumeAudio);
    document.addEventListener('keydown', resumeAudio);

    // ✅ 新增：标记加载已完成，允许后续的保存操作
    setIsLoaded(true); 
  }, []);

  useEffect(() => {
    // ❌ 如果还没加载完，或者数据是空的（且不是刚初始化），就不要保存，防止覆盖
    if (!isLoaded) return;

    localStorage.setItem('mindflow_tasks_v7', JSON.stringify(tasks));
    localStorage.setItem('mindflow_segments_v7', JSON.stringify(segments));
    localStorage.setItem('mindflow_tags_v7', JSON.stringify(tags));

    checkAndPerformBackup(tasks, segments, tags, autoBackupInterval);
  }, [tasks, segments, tags, isLoaded, autoBackupInterval]);

  // Graceful close/refresh: pause running tasks at the real clock time so a restart does not hit the crash cap.
  useEffect(() => {
    if (!isLoaded) return;

    const flush = () => {
      const closed = closeOpenSegmentsNow(tasksRef.current, segmentsRef.current);
      const nextTasks = closed.changed ? closed.tasks : tasksRef.current;
      const nextSegs = closed.changed ? closed.segments : segmentsRef.current;
      try {
        localStorage.setItem('mindflow_tasks_v7', JSON.stringify(nextTasks));
        localStorage.setItem('mindflow_segments_v7', JSON.stringify(nextSegs));
        localStorage.setItem('mindflow_tags_v7', JSON.stringify(tagsRef.current));
      } catch (e) {
        console.error('Failed to flush on exit', e);
      }
    };

    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
    };
  }, [isLoaded]);

  // --- Reminder System ---
  useEffect(() => {
    const checkReminders = async () => {
        const now = Date.now();
        
        for (const task of tasks) {
            if (task.status === TaskStatus.COMPLETED || task.status === TaskStatus.ARCHIVED) continue;

            const planTime = new Date(task.planTime).getTime();
            
            for (const offsetMin of task.reminderOffsets) {
                const triggerTime = planTime - (offsetMin * 60 * 1000);
                if (now >= triggerTime && now < triggerTime + 10 * 60 * 1000) {
                     if (!task.lastRemindedAt || task.lastRemindedAt < triggerTime) {
                         triggerAlert(task, 'reminder', offsetMin);
                         return;
                     }
                }
            }

            if (task.status === TaskStatus.WAITING && now > planTime && now < planTime + 10 * 60 * 1000) {
                if (!task.lastRemindedAt || task.lastRemindedAt < planTime) {
                    triggerAlert(task, 'alert', 0);
                }
            }
        }
    };

    checkReminders();
    const interval = setInterval(checkReminders, 30000); 
    return () => clearInterval(interval);
  }, [tasks]);

  const triggerAlert = async (task: Task, type: 'reminder' | 'alert', offsetMin: number) => {
      playSound('alert');
      const msg = `提醒：任务 "${task.title}" 就要开始了。`;
      
      const sortedWaiting = tasks
        .filter(t => t.status === TaskStatus.WAITING && t.id !== task.id && new Date(t.planTime).getTime() > Date.now())
        .sort((a,b) => new Date(a.planTime).getTime() - new Date(b.planTime).getTime());
      
      const nextTitle = sortedWaiting[0]?.title;

      setAiPopup({
          show: true,
          message: offsetMin > 0 ? `${msg} (还有 ${offsetMin} 分钟)` : `时间到了！该开始 "${task.title}" 了。`,
          type: type,
          relatedTaskId: task.id,
          nextTaskTitle: nextTitle
      });

      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, lastRemindedAt: Date.now() } : t));
  };


  const playSound = (type: 'start' | 'complete' | 'alert') => {
    if (!audioCtx.current) return;
    const osc = audioCtx.current.createOscillator();
    const gain = audioCtx.current.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.current.destination);

    if (type === 'start') {
      osc.frequency.setValueAtTime(400, audioCtx.current.currentTime);
      osc.frequency.exponentialRampToValueAtTime(800, audioCtx.current.currentTime + 0.1);
    } else if (type === 'complete') {
      osc.frequency.setValueAtTime(600, audioCtx.current.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, audioCtx.current.currentTime + 0.2);
    } else {
      osc.frequency.setValueAtTime(800, audioCtx.current.currentTime);
      osc.type = 'triangle';
      osc.frequency.linearRampToValueAtTime(600, audioCtx.current.currentTime + 0.3);
      osc.frequency.linearRampToValueAtTime(800, audioCtx.current.currentTime + 0.6);
    }

    gain.gain.setValueAtTime(0.1, audioCtx.current.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.current.currentTime + (type === 'alert' ? 0.8 : 0.3));
    osc.start();
    osc.stop(audioCtx.current.currentTime + (type === 'alert' ? 0.8 : 0.3));
  };

  const handleExportCSV = () => {
    const header = "Task Name,Tag,Start Time,End Time,Duration,Duration(Minutes)\n";
    const rows = segments.map(seg => {
        const task = tasks.find(t => t.id === seg.taskId);
        if (!task) return null;
        const tag = tags.find(t => t.id === task.tagId);
        
        const start = new Date(seg.startTime);
        const end = seg.endTime ? new Date(seg.endTime) : new Date();
        const durationMin = Math.floor((end.getTime() - start.getTime()) / 60000);
        
        const h = Math.floor(durationMin / 60);
        const m = durationMin % 60;
        const durationStr = h > 0 ? `${h}h ${m}m` : `${m}m`;

        return `"${task.title}","${tag?.name || ''}","${start.toLocaleString()}","${seg.endTime ? new Date(seg.endTime).toLocaleString() : 'Running'}","${durationStr}",${durationMin}`;
    }).filter(row => row !== null).join("\n");

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + header + rows;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}-${String(now.getMinutes()).padStart(2,'0')}-${String(now.getSeconds()).padStart(2,'0')}`;
    
    link.setAttribute("download", `MindFlow_Record_${timestamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleClearData = () => {
      tasksRef.current = [];
      segmentsRef.current = [];
      tagsRef.current = DEFAULT_TAGS;
      setTasks([]);
      setSegments([]);
      setTags(DEFAULT_TAGS);
      setInterruptedTaskId(null);
      localStorage.removeItem('mindflow_tasks_v7');
      localStorage.removeItem('mindflow_segments_v7');
      localStorage.setItem('mindflow_tags_v7', JSON.stringify(DEFAULT_TAGS));
  };

  const handleImportData = (data: { tasks: Task[], tags: Tag[], segments: TimeSegment[] }) => {
      if (data.tasks) {
        tasksRef.current = data.tasks;
        setTasks(data.tasks);
      }
      if (data.tags) {
        tagsRef.current = data.tags;
        setTags(data.tags);
      }
      if (data.segments) {
        segmentsRef.current = data.segments;
        setSegments(data.segments);
      }
  };

// --- Task CRUD Logic ---

  const addTask = async (title: string, date: Date, recurrence: RecurrenceType, isInterruption: boolean, details: { description: string, links: string, reminderOffsets: number[], tagId?: string }) => {
    const tempId = crypto.randomUUID();
    
    // Auto-pause if interruption
    if (isInterruption) {
      const currentRunning = tasksRef.current.find(t => t.status === TaskStatus.RUNNING);
      if (currentRunning) {
        setInterruptedTaskId(currentRunning.id); // Save ID to resume later
        await changeTaskStatus(currentRunning.id, TaskStatus.PAUSED);
      }
    }

    // ✅ 如果用户手动选择了标签，直接使用；否则使用默认标签并等待 AI 分类
    const safeTagId = details.tagId || ((tags && tags.length > 0) ? tags[0].id : 't-work');

    const newTask: Task = {
      id: tempId,
      title,
      tagId: safeTagId,
      status: isInterruption ? TaskStatus.RUNNING : TaskStatus.WAITING,
      planTime: date.toISOString(),
      recurrence,
      priority: Priority.MEDIUM,
      description: details.description,
      links: details.links,
      reminderOffsets: details.reminderOffsets,
      createdAt: Date.now(),
      totalDuration: 0
    };

    const nextTasks = [...tasksRef.current, newTask];
    let nextSegs = segmentsRef.current;
    if (isInterruption) {
      nextSegs = [...nextSegs, {
        id: crypto.randomUUID(),
        taskId: newTask.id,
        startTime: Date.now(),
        endTime: null
      }];
      playSound('start');
    }
    tasksRef.current = nextTasks;
    segmentsRef.current = nextSegs;
    setTasks(nextTasks);
    setSegments(nextSegs);

    return newTask; 
  };
  
  const addRetroactiveTask = (title: string, tagId: string, startTime: number, endTime: number, description: string) => {
    const taskId = crypto.randomUUID();
    const now = Date.now();
    const durationSec = Math.max(0, Math.floor((endTime - startTime) / 1000));
    
    const newTask: Task = {
      id: taskId,
      title,
      tagId,
      status: TaskStatus.COMPLETED,
      planTime: new Date(startTime).toISOString(), 
      recurrence: RecurrenceType.NONE,
      priority: Priority.MEDIUM,
      description: description,
      links: '',
      reminderOffsets: [],
      createdAt: now,
      totalDuration: durationSec,
      completedAt: endTime
    };

    const newSegment: TimeSegment = {
      id: crypto.randomUUID(),
      taskId,
      startTime,
      endTime
    };

    const currentTasks = tasksRef.current;
    const currentSegments = segmentsRef.current;
    const historyState = { tasks: [...currentTasks], segments: [...currentSegments] };

    const clipped = clipOverlappingSegments(currentSegments, startTime, endTime, { now });
    const nextSegments = [...clipped.next, newSegment];
    const nextTasks = pauseTasksMissingOpenSegment(
      recomputeAllDurations([...currentTasks, newTask], nextSegments, now),
      nextSegments
    );

    setSegments(nextSegments);
    setTasks(nextTasks);
    segmentsRef.current = nextSegments;
    tasksRef.current = nextTasks;

    if (clipped.trimmedCount > 0) {
        setAiPopup({
            show: true,
            message: `已补录任务，并自动扣除了 ${clipped.trimmedCount} 段与之重叠的时间，防止重复计算。`,
            type: 'undo',
            undoData: historyState
        });
        setTimeout(() => setAiPopup(null), 8000);
    } else {
        setAiPopup({
            show: true,
            message: `已成功补录历史任务：${title}`,
            type: 'suggestion'
        });
        setTimeout(() => setAiPopup(null), 3000);
    }

    setShowRetroactive(false);
  };

  const handleUpdateTask = (updatedTask: Task) => {
    setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
    setEditingTask(null);
  };

  const handleUpdateSegments = (taskId: string, newSegments: TimeSegment[], _newTotalDuration: number) => {
    const now = Date.now();
    const others = segmentsRef.current.filter(s => s.taskId !== taskId);
    const preserveIds = new Set(newSegments.map(s => s.id));
    let next = [...others, ...newSegments];
    const affected = new Set<string>([taskId]);

    for (const seg of newSegments) {
      const end = seg.endTime ?? now;
      if (end <= seg.startTime) continue;
      const clipped = clipOverlappingSegments(next, seg.startTime, end, { preserveIds, now });
      clipped.affectedTaskIds.forEach(id => affected.add(id));
      next = [...clipped.next.filter(s => !preserveIds.has(s.id)), ...newSegments];
    }

    const nextTasks = pauseTasksMissingOpenSegment(
      recomputeAllDurations(tasksRef.current, next, now).map(t =>
        t.id === taskId ? { ...t, totalDuration: sumDurationForTask(next, taskId, now) } : t
      ),
      next
    );

    setSegments(next);
    setTasks(nextTasks);
    segmentsRef.current = next;
    tasksRef.current = nextTasks;
    setEditingSegmentsTask(null);
  };

  const handleDeleteTask = (scope: 'single' | 'all') => {
    if (!deletingTask) return;
    
    if (scope === 'single') {
        const nextTasks = tasksRef.current.filter(t => t.id !== deletingTask.id);
        const nextSegs = segmentsRef.current.filter(s => s.taskId !== deletingTask.id);
        tasksRef.current = nextTasks;
        segmentsRef.current = nextSegs;
        setTasks(nextTasks);
        setSegments(nextSegs);
    } else {
        const title = deletingTask.title;
        const idsToDelete = new Set(tasksRef.current.filter(t => t.title === title).map(t => t.id));
        const nextTasks = tasksRef.current.filter(t => t.title !== title);
        const nextSegs = segmentsRef.current.filter(s => !idsToDelete.has(s.taskId));
        tasksRef.current = nextTasks;
        segmentsRef.current = nextSegs;
        setTasks(nextTasks);
        setSegments(nextSegs);
    }
    setDeletingTask(null);
  };

  const changeTaskStatus = async (id: string, newStatus: TaskStatus) => {
    const now = Date.now();
    const result = applyStatusChange(tasksRef.current, segmentsRef.current, id, newStatus, now);

    if (result.pausedId) setInterruptedTaskId(result.pausedId);

    tasksRef.current = result.tasks;
    segmentsRef.current = result.segments;
    setTasks(result.tasks);
    setSegments(result.segments);
    
    const task = result.tasks.find(t => t.id === id);
    if (newStatus === TaskStatus.COMPLETED && task) {
       playSound('complete');
       if (task.recurrence !== RecurrenceType.NONE) handleRecurrence(task);
       if (interruptedTaskId && interruptedTaskId !== id) {
           const prevTask = result.tasks.find(t => t.id === interruptedTaskId);
           if (prevTask && prevTask.status !== TaskStatus.COMPLETED) {
               setResumeTask(prevTask);
           } else {
               setInterruptedTaskId(null);
           }
           }
           const msg = `任务 "${task.title}" 已完成！做得好。`;
           setAiPopup({ show: true, message: msg, type: 'suggestion' });       setTimeout(() => setAiPopup(null), 8000);
    } else if (newStatus === TaskStatus.RUNNING) {
       playSound('start');
    }
  };

  const handleRecurrence = (task: Task) => {
    const nextDate = new Date(task.planTime);
    do {
      if (task.recurrence === RecurrenceType.DAILY) nextDate.setDate(nextDate.getDate() + 1);
      else if (task.recurrence === RecurrenceType.WEEKLY) nextDate.setDate(nextDate.getDate() + 7);
      else if (task.recurrence === RecurrenceType.MONTHLY) {
        const shifted = addMonthsClamped(nextDate, 1);
        nextDate.setTime(shifted.getTime());
      }
      else break;
    } while (nextDate.getTime() <= Date.now());

    const nextTask: Task = {
      ...task,
      id: crypto.randomUUID(),
      status: TaskStatus.WAITING,
      planTime: nextDate.toISOString(),
      createdAt: Date.now(),
      totalDuration: 0,
      completedAt: undefined,
      lastRemindedAt: undefined
    };
    const withNext = [...tasksRef.current, nextTask];
    tasksRef.current = withNext;
    setTasks(withNext);
  };

  // --- API Command Dispatcher Listener ---
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).require) {
      try {
        const { ipcRenderer } = (window as any).require('electron');
        const apiListener = (_event: any, payload: any) => {
          handleApiCommand(payload, {
            tasks,
            setTasks,
            tags,
            setTags,
            segments,
            setSegments,
            settings: {
              model: 'gemini-2.5-flash',
              timezone,
              autoBackupInterval,
              enableApiServer: true,
              apiPort: 3618
            },
            handleStartTask: (taskId: string) => changeTaskStatus(taskId, TaskStatus.RUNNING),
            handlePauseTask: (taskId: string) => changeTaskStatus(taskId, TaskStatus.PAUSED),
            handleCompleteTask: (taskId: string) => changeTaskStatus(taskId, TaskStatus.COMPLETED),
            handleDeleteTask: (taskId: string) => {
              setTasks(prev => prev.filter(t => t.id !== taskId));
              setSegments(prev => prev.filter(s => s.taskId !== taskId));
            },
            handleRetroactiveAdd: (title: string, tagId: string, startTimeMs: number, endTimeMs: number) => {
              addRetroactiveTask(title, tagId, startTimeMs, endTimeMs, '');
            }
          });
        };
        ipcRenderer.on('api-command', apiListener);
        return () => {
          ipcRenderer.removeListener('api-command', apiListener);
        };
      } catch (e) {}
    }
  }, [tasks, tags, segments, timezone, autoBackupInterval]);

  const snoozeTask = () => {
      if (!aiPopup?.relatedTaskId) return;
      setAiPopup(null);
      setTimeout(() => {
          const task = tasks.find(t => t.id === aiPopup.relatedTaskId);
          if (task && task.status === TaskStatus.WAITING) {
             setAiPopup({ ...aiPopup, message: `(推迟) ${aiPopup.message}` });
             playSound('alert');
          }
      }, 5 * 60 * 1000); 
  };

  const getLocalDateString = (dateInput: string | Date, tz: string) => {
    return getDateStringInZone(dateInput, tz);
  };

  const getDayGroup = (dateStr: string) => {
      const targetDate = getLocalDateString(dateStr, timezone);
      const todayDate = getLocalDateString(new Date(), timezone);
      
      const tmrw = new Date();
      tmrw.setDate(tmrw.getDate() + 1);
      const tmrwDate = getLocalDateString(tmrw, timezone);

      if (targetDate === todayDate) return 'Today';
      if (targetDate === tmrwDate) return 'Tomorrow';
      if (targetDate < todayDate) return 'Today'; // Treat overdue past tasks as Today to bring them to attention
      return 'Future';
  };

  const runningTasks = tasks.filter(t => t.status === TaskStatus.RUNNING);
  const completedTasks = tasks.filter(t => t.status === TaskStatus.COMPLETED);
  const waitingTasks = tasks.filter(t => t.status === TaskStatus.WAITING || t.status === TaskStatus.PAUSED).sort((a,b) => new Date(a.planTime).getTime() - new Date(b.planTime).getTime());

  const tasksToday = waitingTasks.filter(t => getDayGroup(t.planTime) === 'Today');
  const tasksTomorrow = waitingTasks.filter(t => getDayGroup(t.planTime) === 'Tomorrow');
  const tasksFuture = waitingTasks.filter(t => getDayGroup(t.planTime) === 'Future');

  const groupedCompleted = useMemo(() => {
    const todayStr = getLocalDateString(new Date(), timezone);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = getLocalDateString(yesterday, timezone);

    const groups: Record<string, Task[]> = {
      'Today': [],
      'Yesterday': [],
      'Older': []
    };

    completedTasks
      .sort((a, b) => (b.completedAt || b.createdAt) - (a.completedAt || a.createdAt))
      .forEach(t => {
        const dateStr = getLocalDateString(new Date(t.completedAt || t.createdAt), timezone);
        if (dateStr === todayStr) groups['Today'].push(t);
        else if (dateStr === yesterdayStr) groups['Yesterday'].push(t);
        else groups['Older'].push(t);
      });

    return groups;
  }, [completedTasks, timezone]);

  const focusedTask = tasks.find(t => t.id === focusMode);

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200 font-sans overflow-hidden">
      {showSettings && (
          <SettingsModal 
              onClose={() => setShowSettings(false)} 
              tasks={tasks}
              tags={tags}
              segments={segments}
              onImportData={handleImportData}
              onClearData={handleClearData}
              onSettingsChange={(next) => {
                setTimezone(next.timezone);
                setAutoBackupInterval(next.autoBackupInterval || 1);
              }}
          />
      )}

      {showRetroactive && (
        <RetroactiveModal
            tags={tags}
            onSave={addRetroactiveTask}
            onClose={() => setShowRetroactive(false)}
        />
      )}

      {showBackup && (
        <BackupModal
           onClose={() => setShowBackup(false)}
           onRestore={(t, s, tg) => {
              setTasks(t);
              setSegments(s);
              setTags(tg);
           }}
        />
      )}

      {showTagManager && (
        <TagManager 
          tags={tags} 
          onUpdateTags={setTags} 
          onClose={() => setShowTagManager(false)} 
        />
      )}

      {editingTask && (
        <EditTaskModal 
            task={editingTask} 
            tags={tags} 
            onSave={handleUpdateTask} 
            onClose={() => setEditingTask(null)} 
        />
      )}

      {editingSegmentsTask && (
        <EditSegmentsModal
          task={editingSegmentsTask}
          segments={segments}
          onSave={handleUpdateSegments}
          onClose={() => setEditingSegmentsTask(null)}
        />
      )}

      {deletingTask && (
        <DeleteConfirmModal 
            taskTitle={deletingTask.title}
            count={tasks.filter(t => t.title === deletingTask.title).length}
            onConfirm={handleDeleteTask}
            onCancel={() => setDeletingTask(null)}
        />
      )}
      
      {resumeTask && (
         <ResumeModal 
           taskTitle={resumeTask.title}
           onConfirm={() => {
              changeTaskStatus(resumeTask.id, TaskStatus.RUNNING);
              setResumeTask(null);
              setInterruptedTaskId(null);
           }}
           onCancel={() => {
              setResumeTask(null);
              setInterruptedTaskId(null);
           }}
         />
      )}
      
      {aiPopup && aiPopup.type !== 'suggestion' && (
          <ReminderModal 
            message={aiPopup.message} 
            nextTaskPreview={aiPopup.nextTaskTitle}
            onClose={() => setAiPopup(null)} 
            onSnooze={snoozeTask}
          />
      )}

      {focusMode && focusedTask && (
        <FocusWidget 
          task={focusedTask}
          currentSegmentStartTime={segments.find(s => s.taskId === focusedTask.id && s.endTime === null)?.startTime}
          onStop={() => { changeTaskStatus(focusedTask.id, TaskStatus.PAUSED); setFocusMode(null); }}
          onComplete={() => { changeTaskStatus(focusedTask.id, TaskStatus.COMPLETED); setFocusMode(null); }}
          onExit={() => setFocusMode(null)}
        />
      )}

      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        onOpenTagManager={() => setShowTagManager(true)}
        onExportCSV={handleExportCSV}
        onOpenSettings={() => setShowSettings(true)}
        onOpenRetroactive={() => setShowRetroactive(true)}
        onOpenBackup={() => setShowBackup(true)}
      />

      {/* Main Content */}
      <main className={`flex-1 flex flex-col relative transition-all duration-300 ${sidebarOpen ? 'ml-64' : 'ml-0'}`}>
        
        <header className="h-20 flex items-center justify-between px-8 border-b border-slate-800 bg-slate-900/50 backdrop-blur z-20">
          <h2 className="text-xl font-bold text-white">
            {activeTab === 'tasks' ? '我的执行台' : activeTab === 'timeline' ? '每日详情 & 分析' : activeTab === 'worldclock' ? '世界时钟对照表' : activeTab === 'heatmap' ? '周视图复盘' : 'AI 效率分析'}
          </h2>
          <div className="flex gap-4">
             {runningTasks.length > 0 && (
               <button 
                onClick={() => setFocusMode(runningTasks[0].id)}
                className="px-3 py-1.5 bg-blue-600/20 text-blue-400 border border-blue-500/50 rounded-lg text-sm hover:bg-blue-600 hover:text-white transition-all"
               >
                 <i className="fa-solid fa-expand mr-2"></i> 进入专注模式
               </button>
             )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 pb-32 custom-scrollbar">
          {activeTab === 'tasks' && (
            <div className="max-w-4xl mx-auto space-y-8">
              {runningTasks.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-green-400 uppercase tracking-wider flex items-center gap-2">
                    <i className="fa-solid fa-fire"></i> 正在进行
                  </h3>
                  {runningTasks.map(t => (
                    <TaskItem 
                      key={t.id} 
                      task={t} 
                      tag={tags.find(tag => tag.id === t.tagId)!} 
                      currentSegmentStartTime={segments.find(s => s.taskId === t.id && s.endTime === null)?.startTime}
                      onStatusChange={changeTaskStatus} 
                      onEdit={setEditingTask}
                      onDelete={setDeletingTask}
                    />
                  ))}
                </div>
              )}

              <div className="space-y-6">
                 {tasksToday.length > 0 && (
                     <div className="space-y-3">
                        <h3 className="text-sm font-bold text-blue-400 uppercase tracking-wider pl-1 border-l-2 border-blue-500">今天任务</h3>
                        {tasksToday.map(t => (
                            <TaskItem 
                                key={t.id} 
                                task={t} 
                                tag={tags.find(tag => tag.id === t.tagId)!} 
                                onStatusChange={changeTaskStatus} 
                                onEdit={setEditingTask}
                                onEditSegments={setEditingSegmentsTask}
                                onDelete={setDeletingTask}
                            />
                        ))}
                     </div>
                 )}
                 
                 {tasksTomorrow.length > 0 && (
                     <div className="space-y-3">
                        <h3 className="text-sm font-bold text-purple-400 uppercase tracking-wider pl-1 border-l-2 border-purple-500">明天任务</h3>
                        {tasksTomorrow.map(t => (
                            <TaskItem 
                                key={t.id} 
                                task={t} 
                                tag={tags.find(tag => tag.id === t.tagId)!} 
                                onStatusChange={changeTaskStatus} 
                                onEdit={setEditingTask}
                                onEditSegments={setEditingSegmentsTask}
                                onDelete={setDeletingTask}
                            />
                        ))}
                     </div>
                 )}
                 
                 {tasksFuture.length > 0 && (
                     <div className="space-y-3">
                        <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider pl-1 border-l-2 border-slate-500">后续计划</h3>
                        {tasksFuture.map(t => (
                            <TaskItem 
                                key={t.id} 
                                task={t} 
                                tag={tags.find(tag => tag.id === t.tagId)!} 
                                onStatusChange={changeTaskStatus} 
                                onEdit={setEditingTask}
                                onEditSegments={setEditingSegmentsTask}
                                onDelete={setDeletingTask}
                            />
                        ))}
                     </div>
                 )}

                 {waitingTasks.length === 0 && runningTasks.length === 0 && (
                   <div className="text-center py-12 border-2 border-dashed border-slate-800 rounded-xl">
                     <p className="text-slate-600">空空如也，从下方 Smart Bar 添加一个任务吧</p>
                   </div>
                 )}
              </div>

              {completedTasks.length > 0 && (
                 <div className="space-y-6 pt-8 border-t border-slate-800/50">
                    <h3 className="text-sm font-bold text-slate-600 uppercase tracking-wider mb-4">已完成任务回顾</h3>

                    {groupedCompleted['Today'].length > 0 && (
                        <div className="space-y-3">
                            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1 border-l border-slate-700">今天完成</h4>
                            {groupedCompleted['Today'].map(t => (
                                <TaskItem key={t.id} task={t} tag={tags.find(tag => tag.id === t.tagId)!} onStatusChange={changeTaskStatus} onEdit={setEditingTask} onEditSegments={setEditingSegmentsTask} onDelete={setDeletingTask} />
                            ))}
                        </div>
                    )}

                    {groupedCompleted['Yesterday'].length > 0 && (
                        <div className="space-y-3">
                            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1 border-l border-slate-700">昨天完成</h4>
                            {groupedCompleted['Yesterday'].map(t => (
                                <TaskItem key={t.id} task={t} tag={tags.find(tag => tag.id === t.tagId)!} onStatusChange={changeTaskStatus} onEdit={setEditingTask} onEditSegments={setEditingSegmentsTask} onDelete={setDeletingTask} />
                            ))}
                        </div>
                    )}

                    {groupedCompleted['Older'].length > 0 && (
                        <div className="space-y-3">
                            <button 
                                onClick={() => setShowOlderCompleted(!showOlderCompleted)}
                                className="flex items-center gap-2 text-[10px] font-bold text-slate-600 hover:text-slate-400 uppercase tracking-widest transition-colors outline-none"
                            >
                                <i className={`fa-solid ${showOlderCompleted ? 'fa-chevron-down' : 'fa-chevron-right'}`}></i>
                                更早以前 ({groupedCompleted['Older'].length})
                            </button>

                            {showOlderCompleted && (
                                <div className="space-y-3 animate-fade-in">
                                    {groupedCompleted['Older'].map(t => (
                                        <TaskItem key={t.id} task={t} tag={tags.find(tag => tag.id === t.tagId)!} onStatusChange={changeTaskStatus} onEdit={setEditingTask} onEditSegments={setEditingSegmentsTask} onDelete={setDeletingTask} />
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                 </div>
              )}            </div>
          )}

          {activeTab === 'timeline' && (
              <DailyTimeline tasks={tasks} segments={segments} tags={tags} timezone={timezone} />
          )}

          {activeTab === 'worldclock' && (
              <WorldClockView baseTimezone={timezone} />
          )}

          {activeTab === 'heatmap' && (
            <div className="max-w-5xl mx-auto">
              <WeeklyHeatmap segments={segments} tasks={tasks} tags={tags} timezone={timezone} />
            </div>
          )}
          
          {activeTab === 'analytics' && (
            <AnalyticsView tasks={tasks} tags={tags} segments={segments} timezone={timezone} />
          )}
        </div>

        <div className="shrink-0 z-20">
          <SmartBar onAdd={addTask} timezone={timezone} tags={tags} />
        </div>
      </main>

      {aiPopup && aiPopup.type === 'undo' && (
        <div className="fixed bottom-24 right-8 max-w-sm bg-slate-800 border border-yellow-500/50 shadow-2xl shadow-yellow-900/50 p-4 rounded-xl animate-fade-in-up z-50 flex gap-4">
          <div className="w-10 h-10 rounded-full bg-yellow-600 flex items-center justify-center shrink-0">
            <i className="fa-solid fa-clock-rotate-left text-white"></i>
          </div>
          <div className="flex-1">
             <h4 className="font-bold text-white text-sm mb-1">{aiPopup.undoData ? '时间轴已调整' : '计时已恢复'}</h4>
             <p className="text-sm text-slate-300 mb-3">{aiPopup.message}</p>
             {aiPopup.undoData && (
             <button 
                 onClick={() => {
                     if (aiPopup.undoData) {
                         setTasks(aiPopup.undoData.tasks);
                         setSegments(aiPopup.undoData.segments);
                         tasksRef.current = aiPopup.undoData.tasks;
                         segmentsRef.current = aiPopup.undoData.segments;
                         setAiPopup(null);
                     }
                 }}
                 className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs rounded transition-colors"
             >
                 <i className="fa-solid fa-rotate-left mr-1"></i> 撤销调整
             </button>
             )}
          </div>
          <button onClick={() => setAiPopup(null)} className="text-slate-500 hover:text-white self-start">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
      )}

      {aiPopup && aiPopup.type === 'suggestion' && (
        <div className="fixed bottom-24 right-8 max-w-sm bg-slate-800 border border-green-500/50 shadow-2xl shadow-green-900/50 p-4 rounded-xl animate-fade-in-up z-50 flex gap-4">
          <div className="w-10 h-10 rounded-full bg-green-600 flex items-center justify-center shrink-0">
            <i className="fa-solid fa-check text-white"></i>
          </div>
          <div>
             <h4 className="font-bold text-white text-sm mb-1">干得漂亮！</h4>
             <p className="text-sm text-slate-300">{aiPopup.message}</p>
          </div>
          <button onClick={() => setAiPopup(null)} className="text-slate-500 hover:text-white self-start">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
      )}
    </div>
  );
};

export default App;
