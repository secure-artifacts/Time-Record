
import React, { useState, useEffect } from 'react';
import { Task, TaskStatus, RecurrenceType, Tag } from '../types';

interface TaskItemProps {
  task: Task;
  tag: Tag; 
  currentSegmentStartTime?: number; 
  onStatusChange: (id: string, newStatus: TaskStatus) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onEditSegments?: (task: Task) => void;
}

export const TaskItem: React.FC<TaskItemProps> = ({ task, tag, currentSegmentStartTime, onStatusChange, onEdit, onDelete, onEditSegments }) => {
  const [expanded, setExpanded] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    let interval: number;
    if (task.status === TaskStatus.RUNNING) {
      interval = window.setInterval(() => setTick(t => t + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [task.status]);

  const getDisplayDuration = () => {
    let total = task.totalDuration;
    if (task.status === TaskStatus.RUNNING && currentSegmentStartTime) {
      const currentSessionSeconds = Math.floor((Date.now() - currentSegmentStartTime) / 1000);
      total += currentSessionSeconds;
    }
    return total;
  };

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    return `${m}m ${s}s`;
  };

  const isRunning = task.status === TaskStatus.RUNNING;
  const isCompleted = task.status === TaskStatus.COMPLETED;
  const displayDuration = getDisplayDuration();

  const borderColor = tag ? tag.color.replace('bg-', 'border-l-') : 'border-l-slate-500';
  const badgeBg = tag ? tag.color.replace('bg-', 'bg-').replace('500', '500/10') : 'bg-slate-500/10';
  const badgeText = tag ? tag.color.replace('bg-', 'text-').replace('500', '400') : 'text-slate-400';

  return (
    <div className={`relative bg-slate-800/50 border border-slate-700 border-l-4 rounded-r-xl transition-all duration-300 ${borderColor} ${isRunning ? 'bg-slate-800 shadow-lg scale-[1.01] ring-1 ring-white/10' : 'hover:bg-slate-800/80'} ${isCompleted ? 'opacity-60 grayscale-[0.5]' : ''}`}>
      
      <div className="p-4 flex items-start justify-between gap-4">
        {/* Info */}
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpanded(!expanded)}>
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${badgeBg} ${badgeText}`}>
              {tag ? tag.name : 'Uncategorized'}
            </span>
            {task.recurrence !== RecurrenceType.NONE && (
              <span className="text-[10px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded flex items-center gap-1">
                <i className="fa-solid fa-repeat"></i> {task.recurrence}
              </span>
            )}
            <span className="text-xs text-slate-500">
              <i className="fa-regular fa-clock mr-1"></i>
              {/* Uses Browser Local Time by default for list items unless specific override requested */}
              {new Date(task.planTime).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
            {(task.description || task.links) && (
                <span className="text-slate-500 text-xs ml-1 flex gap-1">
                    {task.description && <i className="fa-regular fa-note-sticky"></i>}
                    {task.links && <i className="fa-solid fa-link"></i>}
                </span>
            )}
            {task.reminderOffsets.length > 0 && !isCompleted && (
                 <span className="text-amber-500/60 text-xs ml-1" title={`Reminders: ${task.reminderOffsets.join(', ')}m`}>
                    <i className="fa-solid fa-bell"></i>
                 </span>
            )}
          </div>
          
          <h3 className={`text-base font-medium text-slate-200 truncate ${isCompleted ? 'line-through decoration-slate-500' : ''}`}>
            {task.title}
          </h3>

          <div className={`mt-2 text-sm font-mono ${isRunning ? 'text-green-400 font-bold' : 'text-slate-500'}`}>
            {isRunning && <i className="fa-solid fa-stopwatch animate-pulse mr-2"></i>}
            {formatDuration(displayDuration)}
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-2 shrink-0">
            {!isCompleted ? (
                <>
                {isRunning ? (
                    <button
                        onClick={() => onStatusChange(task.id, TaskStatus.PAUSED)}
                        className="w-24 py-1.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/50 hover:bg-amber-500 hover:text-white transition-all text-xs font-bold flex items-center justify-center gap-2"
                    >
                        <i className="fa-solid fa-pause"></i> 暂停
                    </button>
                    ) : (
                    <button
                        onClick={() => onStatusChange(task.id, TaskStatus.RUNNING)}
                        className="w-24 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20 transition-all text-xs font-bold flex items-center justify-center gap-2"
                    >
                        <i className="fa-solid fa-play"></i> 开始
                    </button>
                    )}
                    
                    <button
                    onClick={() => onStatusChange(task.id, TaskStatus.COMPLETED)}
                    className="w-24 py-1.5 rounded bg-slate-700 hover:bg-green-600/20 hover:text-green-400 hover:border-green-500/50 border border-transparent text-slate-400 transition-all text-xs flex items-center justify-center gap-2"
                    >
                    <i className="fa-solid fa-check"></i> 完成
                    </button>

                    <button
                    onClick={() => onStatusChange(task.id, TaskStatus.ARCHIVED)}
                    className="w-24 py-1.5 rounded bg-slate-800 hover:bg-red-500/20 hover:text-red-400 border border-transparent text-slate-500 transition-all text-xs flex items-center justify-center gap-2"
                    >
                    <i className="fa-solid fa-xmark"></i> 放弃
                    </button>
                </>
            ) : (
                <div className="flex flex-col gap-2 shrink-0 w-24 items-center">
                    <div className="text-green-500 font-bold text-sm flex items-center gap-1">
                    <i className="fa-solid fa-check-circle"></i> Done
                    </div>
                    <button
                    onClick={() => onStatusChange(task.id, TaskStatus.WAITING)}
                    className="text-xs text-slate-500 underline hover:text-slate-300"
                    >
                    撤销
                    </button>
                </div>
            )}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-700/50 pt-3 bg-slate-800/20 animate-fade-in-down rounded-br-xl">
             <div className="flex justify-end gap-3 mb-3 border-b border-slate-700/50 pb-2">
                {onEditSegments && (
                  <button onClick={() => onEditSegments(task)} className="text-xs text-green-400 hover:text-white flex items-center gap-1">
                      <i className="fa-solid fa-clock"></i> 编辑时间
                  </button>
                )}
                <button onClick={() => onEdit(task)} className="text-xs text-blue-400 hover:text-white flex items-center gap-1">
                    <i className="fa-solid fa-pen"></i> 编辑
                </button>
                <button onClick={() => onDelete(task)} className="text-xs text-red-400 hover:text-white flex items-center gap-1">
                    <i className="fa-solid fa-trash"></i> 删除
                </button>
             </div>

             {task.description && (
                 <div className="mb-3">
                     <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">备注</div>
                     <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">{task.description}</p>
                 </div>
             )}
             
             {task.links && (
                 <div>
                     <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">链接 / 文档</div>
                     <a 
                        href={task.links} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="text-sm text-blue-400 hover:text-blue-300 underline break-all flex items-center gap-2"
                     >
                         <i className="fa-solid fa-external-link-alt text-xs"></i>
                         {task.links}
                     </a>
                 </div>
             )}
             {!task.description && !task.links && (
                 <p className="text-xs text-slate-500 italic">没有更多详细信息。</p>
             )}
        </div>
      )}
    </div>
  );
};
