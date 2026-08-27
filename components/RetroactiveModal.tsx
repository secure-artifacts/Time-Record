import React, { useState, useEffect } from 'react';
import { Tag } from '../types';
import { addDaysToDateStr, parseLocalDateTime, toLocalDateStr, toLocalTimeStr } from '../utils/timeUtils';

interface RetroactiveModalProps {
  tags: Tag[];
  onSave: (title: string, tagId: string, startTime: number, endTime: number, description: string) => void;
  onClose: () => void;
}

const MINUTE_CHIPS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

const HOUR_BANDS: { label: string; hours: number[]; cls: string }[] = [
  { label: '凌晨', hours: [0, 1, 2, 3, 4, 5], cls: 'text-slate-400' },
  { label: '上午', hours: [6, 7, 8, 9, 10, 11], cls: 'text-orange-400' },
  { label: '下午', hours: [12, 13, 14, 15, 16, 17], cls: 'text-sky-400' },
  { label: '晚上', hours: [18, 19, 20, 21, 22, 23], cls: 'text-indigo-400' },
];

function ensureEndAfterStart(startDate: string, startTime: string, endDate: string, endTime: string) {
  const startMs = parseLocalDateTime(startDate, startTime).getTime();
  let nextEndDate = endDate;
  let crossed = false;
  let guard = 0;
  while (parseLocalDateTime(nextEndDate, endTime).getTime() <= startMs && guard < 7) {
    nextEndDate = addDaysToDateStr(nextEndDate, 1);
    crossed = true;
    guard++;
  }
  return { endDate: nextEndDate, crossed };
}

export const RetroactiveModal: React.FC<RetroactiveModalProps> = ({ tags, onSave, onClose }) => {
  const now = new Date();
  const startDefault = new Date(now.getTime() - 30 * 60 * 1000);

  const [title, setTitle] = useState('');
  const [tagId, setTagId] = useState(tags[0]?.id || '');
  const [startDate, setStartDate] = useState(toLocalDateStr(startDefault));
  const [endDate, setEndDate] = useState(toLocalDateStr(now));
  const [startTime, setStartTime] = useState(toLocalTimeStr(startDefault));
  const [endTime, setEndTime] = useState(toLocalTimeStr(now));
  const [description, setDescription] = useState('');
  const [editingTarget, setEditingTarget] = useState<'start' | 'end'>('start');
  const [crossedNight, setCrossedNight] = useState(startDefault.getDate() !== now.getDate());

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const applyStart = (nextDate: string, nextTime: string) => {
    const synced = ensureEndAfterStart(nextDate, nextTime, endDate, endTime);
    setStartDate(nextDate);
    setStartTime(nextTime);
    setEndDate(synced.endDate);
    setCrossedNight(synced.crossed);
  };

  const applyEnd = (nextDate: string, nextTime: string) => {
    const synced = ensureEndAfterStart(startDate, startTime, nextDate, nextTime);
    setEndDate(synced.endDate);
    setEndTime(nextTime);
    setCrossedNight(synced.crossed);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
        alert("请输入任务名称！");
        return;
    }

    const synced = ensureEndAfterStart(startDate, startTime, endDate, endTime);
    const startObj = parseLocalDateTime(startDate, startTime);
    const endObj = parseLocalDateTime(synced.endDate, endTime);

    if (endObj.getTime() <= startObj.getTime()) {
        alert("结束时间必须晚于开始时间。");
        return;
    }

    onSave(title, tagId, startObj.getTime(), endObj.getTime(), description);
  };

  const getDurationPreview = () => {
    const synced = ensureEndAfterStart(startDate, startTime, endDate, endTime);
    const start = parseLocalDateTime(startDate, startTime).getTime();
    const end = parseLocalDateTime(synced.endDate, endTime).getTime();
    if (end <= start) return { text: '时间无效', minutes: 0 };
    const diffMin = Math.floor((end - start) / 60000);
    const h = Math.floor(diffMin / 60);
    const m = diffMin % 60;
    return { text: `${h}小时 ${m}分钟`, minutes: diffMin };
  };

  const last3Days = Array.from({ length: 3 }).map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (2 - i));
      return d;
  });

  const activeDate = editingTarget === 'start' ? startDate : endDate;
  const activeTime = editingTarget === 'start' ? startTime : endTime;
  const activeHour = parseInt(activeTime.split(':')[0], 10) || 0;
  const activeMinute = parseInt(activeTime.split(':')[1], 10) || 0;

  const handleDateClick = (dStr: string) => {
      if (editingTarget === 'start') applyStart(dStr, startTime);
      else applyEnd(dStr, endTime);
  };

  const handleHourClick = (h: number) => {
      const next = `${String(h).padStart(2, '0')}:${String(activeMinute).padStart(2, '0')}`;
      if (editingTarget === 'start') applyStart(startDate, next);
      else applyEnd(endDate, next);
  };

  const handleMinuteChange = (m: number) => {
      const clamped = Math.max(0, Math.min(59, Number.isFinite(m) ? m : 0));
      const next = `${String(activeHour).padStart(2, '0')}:${String(clamped).padStart(2, '0')}`;
      if (editingTarget === 'start') applyStart(startDate, next);
      else applyEnd(endDate, next);
  };

  const setNow = () => {
      const d = new Date();
      if (editingTarget === 'start') applyStart(toLocalDateStr(d), toLocalTimeStr(d));
      else applyEnd(toLocalDateStr(d), toLocalTimeStr(d));
  };

  const duration = getDurationPreview();
  const displayEndDate = ensureEndAfterStart(startDate, startTime, endDate, endTime).endDate;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl p-6 shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center mb-6 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-green-600/20 flex items-center justify-center text-green-400">
               <i className="fa-solid fa-calendar-plus"></i>
            </div>
            <h2 className="text-xl font-bold text-white">补录历史任务</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <i className="fa-solid fa-xmark text-xl"></i>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="text-xs text-slate-400 block mb-1">任务名称</label>
                    <input 
                    type="text" 
                    placeholder="例如：刚才开了个会..."
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-blue-500"
                    autoFocus
                    />
                </div>
                <div>
                    <label className="text-xs text-slate-400 block mb-1">分类标签</label>
                    <select 
                        value={tagId}
                        onChange={e => setTagId(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none"
                    >
                    {tags.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                    </select>
                </div>
            </div>

            <div className="flex gap-4 p-1 bg-slate-800/50 rounded-xl border border-slate-700/50">
                <button 
                    type="button"
                    onClick={() => setEditingTarget('start')}
                    className={`flex-1 p-3 rounded-lg flex flex-col items-center justify-center transition-all ${editingTarget === 'start' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-400 hover:bg-slate-800'}`}
                >
                    <span className="text-[10px] uppercase font-bold opacity-80 mb-1">开始时间</span>
                    <span className="font-mono text-lg">{startDate} {startTime}</span>
                </button>
                <div className="flex items-center justify-center text-slate-500">
                    <i className="fa-solid fa-arrow-right"></i>
                </div>
                <button 
                    type="button"
                    onClick={() => setEditingTarget('end')}
                    className={`flex-1 p-3 rounded-lg flex flex-col items-center justify-center transition-all ${editingTarget === 'end' ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/20' : 'text-slate-400 hover:bg-slate-800'}`}
                >
                    <span className="text-[10px] uppercase font-bold opacity-80 mb-1">结束时间</span>
                    <span className="font-mono text-lg">{displayEndDate} {endTime}</span>
                    {crossedNight && <span className="text-[10px] mt-1 text-amber-300">跨夜</span>}
                </button>
            </div>

            <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-4">
                <div className="flex justify-between items-center">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <i className="fa-solid fa-calendar-days text-blue-400"></i> 选择 {editingTarget === 'start' ? '开始' : '结束'} 日期
                    </h3>
                    <button type="button" onClick={setNow} className="text-xs bg-slate-700 hover:bg-slate-600 text-white px-3 py-1 rounded transition-colors">
                        设定为现在
                    </button>
                </div>
                
                <div className="flex gap-2">
                    {last3Days.map((d, index) => {
                        const dStr = toLocalDateStr(d);
                        const isSelected = activeDate === dStr;
                        const labelName = index === 2 ? '今天' : (index === 1 ? '昨天' : '前天');
                        return (
                            <button
                                key={dStr}
                                type="button"
                                onClick={() => handleDateClick(dStr)}
                                className={`flex-1 flex flex-col items-center justify-center py-2 rounded-lg border transition-all ${isSelected ? 'bg-blue-600/20 border-blue-500 text-blue-400' : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'}`}
                            >
                                <span className="text-xs uppercase font-bold mb-1">{labelName}</span>
                                <span className="text-lg font-bold">{d.getDate()}</span>
                                <span className="text-[9px] opacity-50">{d.getMonth()+1}月</span>
                            </button>
                        );
                    })}
                </div>

                <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 shrink-0">更早日期</span>
                    <input
                        type="date"
                        value={activeDate}
                        onChange={(e) => { if (e.target.value) handleDateClick(e.target.value); }}
                        className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-blue-500"
                    />
                </div>

                <div className="border-t border-slate-700/50 pt-4 space-y-4">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <i className="fa-regular fa-clock text-blue-400"></i> 选择具体时间（24 小时）
                    </h3>

                    {HOUR_BANDS.map(band => (
                        <div key={band.label}>
                            <div className={`text-[10px] font-bold mb-1.5 ${band.cls}`}>{band.label}</div>
                            <div className="grid grid-cols-6 gap-2">
                                {band.hours.map(h => {
                                    const isSelected = activeHour === h;
                                    return (
                                        <button
                                            key={`h-${h}`}
                                            type="button"
                                            onClick={() => handleHourClick(h)}
                                            className={`py-2 rounded-lg text-sm font-bold border transition-all ${isSelected ? 'bg-blue-600 border-blue-500 text-white shadow-lg' : 'bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-800'}`}
                                        >
                                            {String(h).padStart(2, '0')}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}

                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <div className="text-xs text-slate-500 font-bold">分钟</div>
                            <div className="flex items-center gap-2">
                                <input
                                    type="number"
                                    min={0}
                                    max={59}
                                    value={activeMinute}
                                    onChange={(e) => handleMinuteChange(parseInt(e.target.value, 10))}
                                    className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-sm text-white text-center outline-none focus:border-blue-500 font-mono"
                                />
                                <span className="text-xs text-slate-500">可直接输入 0–59</span>
                            </div>
                        </div>
                        <div className="grid grid-cols-12 gap-1">
                            {MINUTE_CHIPS.map(m => (
                                <button
                                    key={`m-${m}`}
                                    type="button"
                                    onClick={() => handleMinuteChange(m)}
                                    className={`py-1 rounded text-[10px] font-bold border transition-all ${activeMinute === m ? 'bg-purple-600 border-purple-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-800'}`}
                                >
                                    {String(m).padStart(2, '0')}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <div>
             <label className="text-xs text-slate-400 block mb-1">备注 (可选)</label>
             <textarea 
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="任务详情..."
                className="w-full h-16 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none"
             />
            </div>
          </div>
        </div>

        <div className="pt-4 mt-4 border-t border-slate-800 flex justify-between items-center shrink-0">
             <div className="flex flex-col gap-1">
                <span className={`text-sm font-mono px-3 py-1.5 rounded-lg border ${duration.minutes > 6 * 60 ? 'text-amber-300 bg-amber-900/20 border-amber-500/20' : 'text-green-400 bg-green-900/20 border-green-500/20'}`}>
                    总计: {duration.text}
                </span>
                {crossedNight && (
                    <span className="text-[11px] text-amber-400 px-1">结束早于开始，已自动把结束日期 +1 天（跨夜）</span>
                )}
                {duration.minutes > 6 * 60 && (
                    <span className="text-[11px] text-amber-400/80 px-1">超过 6 小时，请确认不是忘了改结束时间</span>
                )}
             </div>
             <div className="flex gap-3">
                <button 
                type="button" 
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-slate-400 hover:bg-slate-800 transition-colors font-medium"
                >
                取消
                </button>
                <button 
                onClick={handleSubmit}
                className="px-6 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white font-bold shadow-lg shadow-green-600/20"
                >
                确认补录
                </button>
             </div>
        </div>
      </div>
    </div>
  );
};
