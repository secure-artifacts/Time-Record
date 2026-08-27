import React, { useState, useEffect } from 'react';
import { Tag } from '../types';
import { addDaysToDateStr } from '../utils/timeUtils';
import { recentRange, validateRetroactiveRange, wallTimeAt, WallTime } from '../utils/retroactiveTime';

interface RetroactiveModalProps {
  tags: Tag[];
  timezone: string;
  onSave: (title: string, tagId: string, startTime: number, endTime: number, description: string) => void;
  onClose: () => void;
}

export const RetroactiveModal: React.FC<RetroactiveModalProps> = ({ tags, timezone, onSave, onClose }) => {
  const [now, setNow] = useState(() => Date.now());
  const [range, setRange] = useState(() => recentRange(now, timezone));
  const [title, setTitle] = useState('');
  const [tagId, setTagId] = useState(tags[0]?.id || '');
  const [description, setDescription] = useState('');
  const [confirmedLong, setConfirmedLong] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const keydown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const timer = window.setInterval(refresh, 1000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('keydown', keydown);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('keydown', keydown);
    };
  }, [onClose]);

  const current = wallTimeAt(now, timezone);
  const validation = validateRetroactiveRange(range, timezone, now);
  const changeEndpoint = (target: 'start' | 'end', patch: Partial<WallTime>) => {
    setRange(prev => ({ ...prev, [target]: { ...prev[target], ...patch } }));
    setConfirmedLong(false);
    setSubmitError('');
  };
  const setRecent = (minutes: number) => {
    const timestamp = Date.now();
    setNow(timestamp);
    setRange(recentRange(timestamp, timezone, minutes));
    setConfirmedLong(false);
    setSubmitError('');
  };
  const endNow = () => {
    const timestamp = Date.now();
    setNow(timestamp);
    changeEndpoint('end', wallTimeAt(timestamp, timezone));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Re-read the real clock in case the computer slept or its time was corrected.
    const checked = validateRetroactiveRange(range, timezone, Date.now());
    if (checked.ok === false) { setSubmitError(checked.message); return; }
    if (!title.trim()) { setSubmitError('请输入任务名称。'); return; }
    if (!tags.some(tag => tag.id === tagId)) { setSubmitError('请选择有效的分类标签。'); return; }
    if (checked.needsConfirmation && !confirmedLong) { setSubmitError('请确认这段超过 6 小时的记录。'); return; }
    onSave(title.trim(), tagId, checked.startMs, checked.endMs, description);
  };

  const canSave = title.trim() && tags.some(tag => tag.id === tagId) && validation.ok && (!validation.needsConfirmation || confirmedLong);
  const inputClass = 'w-full min-w-0 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-white outline-none focus:border-blue-400 [color-scheme:dark]';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <form onSubmit={handleSubmit} role="dialog" aria-modal="true" aria-labelledby="retro-title" className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl p-5 sm:p-6 shadow-2xl flex flex-col max-h-[92vh]">
        <div className="flex justify-between items-start mb-4 shrink-0">
          <div>
            <h2 id="retro-title" className="text-xl font-bold text-white">补录已发生的任务</h2>
            <p className="text-xs text-slate-400 mt-1">明确选择开始和结束，修改一端不会改变另一端。</p>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭补录" className="text-slate-400 hover:text-white p-1"><i className="fa-solid fa-xmark text-xl" /></button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          <div className="rounded-lg bg-slate-800/70 px-3 py-2 text-xs text-slate-400">
            <div>当前时间：<span className="text-slate-200 font-mono">{current.date} {current.time}</span><span className="ml-2">{timezone}</span></div>
            <div className="mt-1">使用应用设置的时区及电脑时钟；若这里不对，请检查系统时间或时区设置。</div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs text-slate-400">任务名称
              <input value={title} onChange={e => { setTitle(e.target.value); setSubmitError(''); }} placeholder="例如：刚才开了个会..." autoFocus required className={`${inputClass} mt-1`} />
            </label>
            <label className="text-xs text-slate-400">分类标签
              <select value={tagId} onChange={e => setTagId(e.target.value)} required className={`${inputClass} mt-1`}>
                {tags.map(tag => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-400">快速填写整个区间</span>
            {[15, 30, 60].map(minutes => <button key={minutes} type="button" onClick={() => setRecent(minutes)} className="px-3 py-1.5 rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-700">最近 {minutes} 分钟</button>)}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(['start', 'end'] as const).map(target => {
              const label = target === 'start' ? '开始' : '结束';
              const point = range[target];
              return <fieldset key={target} className={`min-w-0 rounded-xl border p-4 space-y-3 ${target === 'start' ? 'border-blue-500/40 bg-blue-500/5' : 'border-purple-500/40 bg-purple-500/5'}`}>
                <legend className={`px-1 text-sm font-bold ${target === 'start' ? 'text-blue-300' : 'text-purple-300'}`}>{label}时间</legend>
                <label className="block text-xs text-slate-400">{label}日期
                  <input type="date" value={point.date} max={current.date} required onChange={e => changeEndpoint(target, { date: e.target.value })} className={`${inputClass} mt-1`} />
                </label>
                <div className="flex gap-2">
                  {[{ name: '昨天', date: addDaysToDateStr(current.date, -1) }, { name: '今天', date: current.date }].map(day => <button type="button" key={day.name} aria-label={`${label}选${day.name}`} onClick={() => changeEndpoint(target, { date: day.date })} className={`flex-1 rounded px-2 py-1 text-xs border ${point.date === day.date ? 'border-blue-400 text-blue-200' : 'border-slate-600 text-slate-400 hover:text-white'}`}>{day.name} {day.date.slice(5)}</button>)}
                </div>
                <label className="block text-xs text-slate-400">{label}时刻（24 小时）
                  <input type="text" inputMode="numeric" placeholder="HH:mm" pattern="([01][0-9]|2[0-3]):[0-5][0-9]" maxLength={5} value={point.time} required onChange={e => changeEndpoint(target, { time: e.target.value })} className={`${inputClass} mt-1 font-mono text-lg`} />
                </label>
                {target === 'end' ? <button type="button" onClick={endNow} className="text-xs text-purple-300 hover:text-purple-200">结束设为现在</button> : <p className="text-xs text-slate-500">可直接输入，例如 09:30</p>}
              </fieldset>;
            })}
          </div>

          <label className="block text-xs text-slate-400">备注（可选）
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="任务详情..." className={`${inputClass} mt-1 h-16`} />
          </label>
        </div>

        <div className="mt-3 pt-3 border-t border-slate-700 shrink-0 space-y-2">
          <p className="text-xs text-slate-400 font-mono">{range.start.date} {range.start.time} → {range.end.date} {range.end.time}</p>
          {validation.ok === false && <p role="alert" className="text-sm text-amber-300">{validation.message}</p>}
          {submitError && <p role="alert" className="text-sm text-red-300">{submitError}</p>}
          {validation.ok && validation.needsConfirmation && <label className="flex gap-2 items-start text-xs text-amber-300"><input type="checkbox" checked={confirmedLong} onChange={e => setConfirmedLong(e.target.checked)} />这段记录超过 6 小时，我已确认开始和结束日期正确。</label>}
          <div className="flex flex-wrap justify-between items-center gap-3">
            <div className="text-green-400 font-semibold">
              {validation.ok ? <>总计：{Math.floor(validation.minutes / 60)} 小时 {validation.minutes % 60} 分钟{validation.crossesDate && <span className="text-xs text-amber-300 ml-2">跨日期</span>}</> : <span className="text-slate-400 text-sm">请先修正时间</span>}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-slate-400 hover:bg-slate-800">取消</button>
              <button type="submit" disabled={!canSave} className="px-6 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed">确认补录</button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};
