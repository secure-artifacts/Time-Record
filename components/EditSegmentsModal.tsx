import React, { useState } from 'react';
import { Task, TimeSegment } from '../types';

interface EditSegmentsModalProps {
  task: Task;
  segments: TimeSegment[];
  onSave: (taskId: string, newSegments: TimeSegment[], newTotalDuration: number) => void;
  onClose: () => void;
}

export const EditSegmentsModal: React.FC<EditSegmentsModalProps> = ({ task, segments, onSave, onClose }) => {
  // Only edit segments for this task
  const taskSegments = segments.filter(s => s.taskId === task.id);
  const [localSegments, setLocalSegments] = useState<TimeSegment[]>(taskSegments);

  const formatDateTimeLocal = (ts: number) => {
    const d = new Date(ts);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  };

  const handleUpdateSegment = (id: string, field: 'startTime' | 'endTime', value: string) => {
    if (!value) return; // Prevent invalid date from clearing it unexpectedly if partially typed
    setLocalSegments(prev => prev.map(seg => {
      if (seg.id === id) {
        const newTime = new Date(value).getTime();
        return { ...seg, [field]: newTime };
      }
      return seg;
    }));
  };

  const handleDeleteSegment = (id: string) => {
    setLocalSegments(prev => prev.filter(seg => seg.id !== id));
  };

  const handleSave = () => {
    for (const seg of localSegments) {
        const end = seg.endTime ?? Date.now();
        if (end <= seg.startTime) {
            alert('每个时间段的结束时间必须晚于开始时间。');
            return;
        }
    }

    const sorted = [...localSegments].sort((a, b) => a.startTime - b.startTime);
    for (let i = 1; i < sorted.length; i++) {
        const prevEnd = sorted[i - 1].endTime ?? Date.now();
        if (sorted[i].startTime < prevEnd) {
            alert('同一任务的时间段之间不能重叠。请先改开，再保存。');
            return;
        }
    }

    const newTotalDuration = localSegments.reduce((acc, curr) => {
        const end = curr.endTime || Date.now();
        const duration = Math.max(0, Math.floor((end - curr.startTime) / 1000));
        return acc + duration;
    }, 0);

    onSave(task.id, localSegments, newTotalDuration);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl p-6 shadow-2xl flex flex-col max-h-[80vh]">
        <div className="flex justify-between items-center mb-6 shrink-0">
          <h2 className="text-xl font-bold text-white">编辑时间段 - {task.title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <i className="fa-solid fa-xmark text-xl"></i>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pr-2 space-y-4 custom-scrollbar">
            {localSegments.length === 0 ? (
                <p className="text-slate-500 text-center py-4">没有记录的时间段。</p>
            ) : (
                localSegments.map(seg => (
                    <div key={seg.id} className="bg-slate-800 border border-slate-700 p-4 rounded-xl flex items-center gap-4">
                        <div className="flex-1">
                            <label className="text-xs text-slate-400 block mb-1">开始时间</label>
                            <input 
                                type="datetime-local"
                                value={formatDateTimeLocal(seg.startTime)}
                                onChange={(e) => handleUpdateSegment(seg.id, 'startTime', e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white outline-none focus:border-blue-500"
                            />
                        </div>
                        <div className="flex-1">
                            <label className="text-xs text-slate-400 block mb-1">结束时间</label>
                            {seg.endTime ? (
                                <input 
                                    type="datetime-local"
                                    value={formatDateTimeLocal(seg.endTime)}
                                    onChange={(e) => handleUpdateSegment(seg.id, 'endTime', e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white outline-none focus:border-blue-500"
                                />
                            ) : (
                                <div className="text-sm text-green-400 py-1 flex items-center h-full">进行中...</div>
                            )}
                        </div>
                        <button onClick={() => handleDeleteSegment(seg.id)} className="shrink-0 text-red-400 hover:text-red-300 p-2 mt-5 transition-colors">
                            <i className="fa-solid fa-trash"></i>
                        </button>
                    </div>
                ))
            )}
        </div>

        <div className="pt-6 shrink-0 flex justify-end gap-3 border-t border-slate-800 mt-4">
            <button 
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-slate-400 hover:bg-slate-800 transition-colors"
            >
              取消
            </button>
            <button 
              onClick={handleSave}
              className="px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium shadow-lg transition-colors"
            >
              保存更改
            </button>
        </div>
      </div>
    </div>
  );
};
