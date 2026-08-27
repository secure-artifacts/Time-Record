
import React, { useState, useRef, useEffect } from 'react';
import { RecurrenceType, Tag } from '../types';
import { formatTimeInZone, getHourInZone } from '../utils/timeUtils';

interface SmartBarProps {
  onAdd: (
    title: string, 
    date: Date, 
    recurrence: RecurrenceType, 
    isInterruption: boolean,
    details: { description: string; links: string; reminderOffsets: number[], tagId?: string }
  ) => void;
  timezone: string;
  tags: Tag[];
}

export const SmartBar: React.FC<SmartBarProps> = ({ onAdd, timezone, tags }) => {
  const [title, setTitle] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [mode, setMode] = useState<'simple' | 'detailed'>('simple');
  
  // Details
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [description, setDescription] = useState('');
  const [links, setLinks] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [recurrence, setRecurrence] = useState<RecurrenceType>(RecurrenceType.NONE);
  const [reminderOffsets, setReminderOffsets] = useState<number[]>([15]); // Default 15 min
  const [selectedTagId, setSelectedTagId] = useState<string>(''); // empty means AI auto-classify

  // Calendar State
  const [calViewDate, setCalViewDate] = useState(new Date()); 

  const pickerRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // If clicking inside picker, do nothing
      if (pickerRef.current && pickerRef.current.contains(event.target as Node)) return;
      
      // If clicking inside form, do nothing
      if (formRef.current && formRef.current.contains(event.target as Node)) return;

      // Clicked outside: Collapse everything
      setIsExpanded(false);
      setShowTimePicker(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd(title, selectedDate, recurrence, false, { description, links, reminderOffsets, tagId: selectedTagId || undefined });
    resetForm();
  };

  const handleFlashTask = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent form submit
    if (!title.trim()) return;
    onAdd(title, new Date(), RecurrenceType.NONE, true, { description, links, reminderOffsets: [], tagId: selectedTagId || undefined });
    resetForm();
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setLinks('');
    setSelectedDate(new Date());
    setRecurrence(RecurrenceType.NONE);
    setShowTimePicker(false);
    setIsExpanded(false);
    setReminderOffsets([15]);
    setSelectedTagId('');
  };

  const toggleReminder = (min: number) => {
    setReminderOffsets(prev => 
      prev.includes(min) ? prev.filter(m => m !== min) : [...prev, min]
    );
  };

  const formatTimeDisplay = () => {
      try {
        return formatTimeInZone(selectedDate, timezone);
      } catch(e) {
        return selectedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      }
  };

  // --- Calendar Logic ---
  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay(); 

  const renderCalendar = () => {
      const year = calViewDate.getFullYear();
      const month = calViewDate.getMonth();
      const totalDays = daysInMonth(year, month);
      const startDay = getFirstDayOfMonth(year, month);
      
      const days = [];
      for (let i = 0; i < startDay; i++) {
          days.push(<div key={`empty-${i}`} className="h-6"></div>);
      }
      for (let d = 1; d <= totalDays; d++) {
          const isSelected = selectedDate.getDate() === d && selectedDate.getMonth() === month && selectedDate.getFullYear() === year;
          const isToday = new Date().getDate() === d && new Date().getMonth() === month && new Date().getFullYear() === year;
          
          days.push(
              <button
                  key={d}
                  type="button"
                  onClick={() => {
                      const newDate = new Date(selectedDate);
                      newDate.setFullYear(year); newDate.setMonth(month); newDate.setDate(d);
                      setSelectedDate(newDate);
                  }}
                  className={`h-6 w-6 rounded-full text-[10px] flex items-center justify-center transition-all ${
                      isSelected ? 'bg-blue-600 text-white font-bold' : isToday ? 'text-blue-400 font-bold border border-blue-500/30' : 'text-slate-300 hover:bg-slate-700'
                  }`}
              >
                  {d}
              </button>
          );
      }
      return days;
  };

  const changeMonth = (offset: number) => {
      const newDate = new Date(calViewDate);
      newDate.setMonth(newDate.getMonth() + offset);
      setCalViewDate(newDate);
  };

  const currentZoneHour = getHourInZone(new Date(), timezone);

  // If in simple mode, we force expanded to be false unless we type, but we render simpler UI
  const effectiveExpanded = mode === 'detailed' && isExpanded;

  return (
    <div ref={formRef} className={`bg-slate-900/90 backdrop-blur-xl border-t border-slate-700 relative z-40 transition-all duration-300 ${effectiveExpanded ? 'p-6' : 'p-3'}`}>
      
      {/* Time Picker Popup */}
      {showTimePicker && (
        <div ref={pickerRef} className="absolute bottom-full left-4 mb-2 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl p-4 w-[380px] animate-fade-in-up z-50">
          {/* Quick Shortcuts */}
          <div className="flex gap-2 mb-3">
             <button type="button" onClick={() => { const d = new Date(selectedDate); const now = new Date(); d.setFullYear(now.getFullYear(), now.getMonth(), now.getDate()); setSelectedDate(d); setCalViewDate(d); }} className="flex-1 py-1 text-[10px] bg-slate-700/50 hover:bg-slate-700 text-slate-300 rounded border border-slate-600 transition-colors">今天</button>
             <button type="button" onClick={() => { const d = new Date(selectedDate); const tmrw = new Date(); tmrw.setDate(tmrw.getDate() + 1); d.setFullYear(tmrw.getFullYear(), tmrw.getMonth(), tmrw.getDate()); setSelectedDate(d); setCalViewDate(d); }} className="flex-1 py-1 text-[10px] bg-slate-700/50 hover:bg-slate-700 text-slate-300 rounded border border-slate-600 transition-colors">明天</button>
             <button type="button" onClick={() => { const d = new Date(selectedDate); const nextMon = new Date(); nextMon.setDate(nextMon.getDate() + ((1 + 7 - nextMon.getDay()) % 7 || 7)); d.setFullYear(nextMon.getFullYear(), nextMon.getMonth(), nextMon.getDate()); setSelectedDate(d); setCalViewDate(d); }} className="flex-1 py-1 text-[10px] bg-slate-700/50 hover:bg-slate-700 text-slate-300 rounded border border-slate-600 transition-colors">下周一</button>
          </div>

          {/* Calendar Header */}
          <div className="flex justify-between items-center mb-2 px-1">
              <button type="button" onClick={() => changeMonth(-1)} className="text-slate-400 hover:text-white"><i className="fa-solid fa-chevron-left text-xs"></i></button>
              <span className="text-slate-200 font-bold text-xs">{calViewDate.toLocaleString('zh-CN', { month: 'long', year: 'numeric' })}</span>
              <button type="button" onClick={() => changeMonth(1)} className="text-slate-400 hover:text-white"><i className="fa-solid fa-chevron-right text-xs"></i></button>
          </div>
          <div className="grid grid-cols-7 text-center mb-1">
              {['日', '一', '二', '三', '四', '五', '六'].map(d => <div key={d} className="text-[9px] text-slate-500 font-bold">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-y-1 justify-items-center mb-3 border-b border-slate-700 pb-3">{renderCalendar()}</div>
          
          {/* Time & Recurrence */}
          <div className="space-y-3">
               <div>
                   <div className="flex justify-between items-center mb-1">
                       <div className="text-[9px] text-slate-500 font-bold">小时</div>
                       <div className="text-[9px] text-blue-400">{timezone}</div>
                   </div>
                   <div className="grid grid-cols-8 gap-1">
                        {Array.from({ length: 24 }).map((_, h) => (
                            <button
                                key={h}
                                type="button"
                                onClick={() => { const d = new Date(selectedDate); d.setHours(h); setSelectedDate(d); }}
                                className={`h-6 text-[10px] rounded flex items-center justify-center font-medium ${selectedDate.getHours() === h ? 'bg-blue-600 text-white' : h === currentZoneHour ? 'border border-blue-500/50 text-blue-300' : 'bg-slate-700/50 text-slate-400 hover:bg-slate-600'}`}
                            >
                                {h}
                            </button>
                        ))}
                   </div>
               </div>
               <div>
                   <div className="flex items-center justify-between mb-1">
                       <div className="text-[9px] text-slate-500 font-bold">分钟</div>
                       <input
                           type="number"
                           min={0}
                           max={59}
                           value={selectedDate.getMinutes()}
                           onChange={(e) => {
                               const m = Math.max(0, Math.min(59, parseInt(e.target.value, 10) || 0));
                               const d = new Date(selectedDate);
                               d.setMinutes(m);
                               setSelectedDate(d);
                           }}
                           className="w-12 bg-slate-900 border border-slate-600 rounded px-1 py-0.5 text-[10px] text-white text-center outline-none focus:border-blue-500 font-mono"
                       />
                   </div>
                   <div className="grid grid-cols-6 gap-1">
                        {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(m => (
                        <button key={m} type="button" onClick={() => { const d = new Date(selectedDate); d.setMinutes(m); setSelectedDate(d); }} className={`py-1 text-[10px] rounded border ${selectedDate.getMinutes() === m ? 'bg-slate-200 text-slate-900 border-white font-bold' : 'border-slate-600 text-slate-400 hover:border-slate-500'}`}>:{m.toString().padStart(2, '0')}</button>
                        ))}
                   </div>
               </div>
          </div>
          <div className="pt-3 mt-3 border-t border-slate-700 flex gap-1">
             {Object.values(RecurrenceType).map(r => (
               <button key={r} type="button" onClick={() => setRecurrence(r)} className={`flex-1 text-[9px] py-1 rounded ${recurrence === r ? 'bg-purple-600 text-white' : 'bg-slate-700 text-slate-400'}`}>
                 {r === RecurrenceType.NONE ? '无' : r}
               </button>
             ))}
          </div>
          <button type="button" onClick={() => setShowTimePicker(false)} className="w-full mt-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-bold shadow-lg">确认时间</button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto flex flex-col gap-2">
        <div className="flex items-center gap-2">
            {/* Toggle Mode Button (Left Side) */}
            <button
                type="button"
                onClick={() => {
                   const newMode = mode === 'simple' ? 'detailed' : 'simple';
                   setMode(newMode);
                   if (newMode === 'detailed') setIsExpanded(true);
                   else setIsExpanded(false);
                }}
                className={`w-9 h-9 shrink-0 rounded-lg flex items-center justify-center transition-all border ${
                    mode === 'detailed' 
                    ? 'bg-blue-600/20 text-blue-400 border-blue-500/50' 
                    : 'bg-slate-800 text-slate-500 border-slate-600 hover:text-slate-300'
                }`}
                title={mode === 'simple' ? "切换到详细模式" : "切换到极简模式"}
            >
                <i className={`fa-solid ${mode === 'detailed' ? 'fa-list-check' : 'fa-minus'}`}></i>
            </button>

            {/* Time Trigger (Detailed Mode only) */}
            {mode === 'detailed' && (
                <button
                type="button"
                onClick={() => { setShowTimePicker(!showTimePicker); setIsExpanded(true); }}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border transition-colors ${recurrence !== RecurrenceType.NONE ? 'bg-purple-900/30 border-purple-500/50 text-purple-300' : 'bg-slate-800 border-slate-600 text-slate-300 hover:border-slate-500'}`}
                >
                    <i className={`fa-regular ${recurrence !== RecurrenceType.NONE ? 'fa-arrows-rotate' : 'fa-clock'} text-xs`}></i>
                    <span className="text-xs font-medium whitespace-nowrap">{formatTimeDisplay()}</span>
                </button>
            )}

            {/* Main Input */}
            <div className="flex-1 relative">
                <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onFocus={() => {
                        if (mode === 'detailed') setIsExpanded(true);
                    }}
                    placeholder={mode === 'simple' ? "快速添加任务..." : "任务名称..."}
                    className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder-slate-500"
                />
            </div>

            {/* Flash Button */}
            <button
            type="button"
            onClick={handleFlashTask}
            title="突发任务：暂停当前任务并立即开始此任务"
            className="w-9 h-9 rounded-lg bg-red-500/20 border border-red-500/50 text-red-400 hover:bg-red-500 hover:text-white transition-all flex items-center justify-center group"
            >
                <i className="fa-solid fa-bolt text-xs group-hover:animate-pulse"></i>
            </button>

            {/* Submit Button */}
            <button
            type="submit"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors shadow-lg shadow-blue-600/20 text-sm"
            >
                {mode === 'simple' ? <i className="fa-solid fa-plus"></i> : '添加'}
            </button>
        </div>
        
        {/* Expanded Details */}
        {effectiveExpanded && (
            <div className="pt-3 border-t border-slate-700/50 grid grid-cols-1 md:grid-cols-2 gap-3 animate-fade-in-down">
                <div className="space-y-2 col-span-1 md:col-span-2">
                    <label className="text-[10px] text-slate-400 uppercase font-bold">分类标签</label>
                    <div className="flex flex-wrap gap-2">
                        {tags.map(t => {
                             const safeColor = t.color || 'bg-slate-500';
                             const activeColor = safeColor.replace('bg-', 'bg-').replace('500', '600') + ' text-white border-transparent shadow-md';
                             const inactiveColor = 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700';
                             return (
                                <button key={t.id} type="button" onClick={() => setSelectedTagId(t.id)} className={`px-2 py-1 rounded text-xs border transition-colors ${selectedTagId === t.id ? activeColor : inactiveColor}`}>
                                    {t.name}
                                </button>
                             );
                        })}
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="flex gap-2">
                        <textarea 
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="备注..."
                            className="flex-1 h-16 bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-slate-200 outline-none focus:border-blue-500"
                        />
                    </div>
                    <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1">
                        <i className="fa-solid fa-link text-slate-500 text-xs"></i>
                        <input type="text" value={links} onChange={e => setLinks(e.target.value)} placeholder="链接 URL..." className="flex-1 bg-transparent border-none text-xs text-blue-400 outline-none" />
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-[10px] text-slate-400 uppercase font-bold">提前提醒</label>
                    <div className="flex gap-1">
                        {[5, 15, 30, 60].map(min => (
                            <button
                                key={min}
                                type="button"
                                onClick={() => toggleReminder(min)}
                                className={`flex-1 py-1.5 rounded text-xs border transition-all ${reminderOffsets.includes(min) ? 'bg-amber-500/20 border-amber-500 text-amber-400' : 'bg-slate-800 border-slate-700 text-slate-500 hover:bg-slate-700'}`}
                            >
                                {min}m
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        )}
      </form>
    </div>
  );
};
