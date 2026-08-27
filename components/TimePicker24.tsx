import React, { useEffect, useId, useRef, useState } from 'react';

interface TimePicker24Props {
  label: string;
  date: string;
  value: string;
  maxTime?: string;
  onChange: (time: string) => void;
}

const pad = (value: number) => String(value).padStart(2, '0');
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const MINUTES = Array.from({ length: 60 }, (_, minute) => minute);
const QUICK_MINUTES = MINUTES.filter(minute => minute % 5 === 0);

// Native modal dialog supplies focus containment, Escape handling and focus
// restoration without adding a UI dependency or making any network requests.
export const TimePicker24: React.FC<TimePicker24Props> = ({ label, date, value, maxTime, onChange }) => {
  const [open, setOpen] = useState(false);
  const [hour, setHour] = useState(0);
  const [minute, setMinute] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const selectedHourRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    dialog?.showModal();
    selectedHourRef.current?.focus();
    return () => dialog?.close();
  }, [open]);

  const showPicker = () => {
    const [h, m] = value.split(':').map(Number);
    setHour(Number.isInteger(h) && h >= 0 && h < 24 ? h : 0);
    setMinute(Number.isInteger(m) && m >= 0 && m < 60 ? m : 0);
    setOpen(true);
  };
  const allowed = (h: number, m: number) => !maxTime || `${pad(h)}:${pad(m)}` <= maxTime;
  const commit = (h: number, m: number) => {
    if (!allowed(h, m)) return;
    onChange(`${pad(h)}:${pad(m)}`);
    setOpen(false);
  };
  const buttonClass = 'rounded-lg border py-2 font-mono text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 disabled:opacity-25 disabled:cursor-not-allowed';
  const preview = `${pad(hour)}:${pad(minute)}`;

  return <>
    <button type="button" aria-label={`选择${label}时刻`} aria-haspopup="dialog" aria-expanded={open} onClick={showPicker} className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-3 text-left hover:border-blue-400 focus-visible:outline focus-visible:outline-blue-400">
      <span className="flex items-center justify-between gap-2"><span className="text-xl font-mono text-white">{value}</span><span className="text-xs text-blue-300">点选时间 ▦</span></span>
    </button>
    <dialog ref={dialogRef} aria-labelledby={titleId} onCancel={e => { e.preventDefault(); setOpen(false); }} onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); } }} onClick={e => { if (e.target === e.currentTarget) setOpen(false); }} className="m-auto w-[min(460px,calc(100vw-32px))] max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-600 bg-slate-900 p-0 text-white shadow-2xl backdrop:bg-black/70">
      <div className="p-5 space-y-4">
        <div className="flex justify-between items-start gap-2">
          <div><h3 id={titleId} className="text-lg font-bold">选择{label}时刻</h3><p className="text-xs text-slate-400 mt-1">{date} · 24 小时制 · 日期保持不变</p></div>
          <button type="button" aria-label="取消选时间" onClick={() => setOpen(false)} className="px-2 py-1 text-slate-400 hover:text-white">✕</button>
        </div>
        <div className="flex items-center justify-between"><span className="text-xs text-slate-400">先点小时，再点常用分钟即可完成</span><output aria-label="待选时刻" className="text-2xl font-mono font-semibold text-blue-300">{preview}</output></div>
        <div role="group" aria-label="小时 00 至 23">
          <p className="text-xs text-slate-400 mb-2">小时</p>
          <div className="grid grid-cols-6 gap-2">{HOURS.map(h => <button ref={h === hour ? selectedHourRef : undefined} type="button" key={h} aria-label={`${pad(h)} 时`} aria-pressed={h === hour} disabled={!allowed(h, 0)} onClick={() => setHour(h)} className={`${buttonClass} ${h === hour ? 'border-blue-400 bg-blue-600 text-white' : 'border-slate-700 bg-slate-800 hover:border-blue-400'}`}>{pad(h)}</button>)}</div>
        </div>
        <div role="group" aria-label="常用分钟">
          <p className="text-xs text-slate-400 mb-2">常用分钟（点击即选定）</p>
          <div className="grid grid-cols-6 gap-2">{QUICK_MINUTES.map(m => <button type="button" key={m} aria-label={`${pad(m)} 分`} aria-pressed={minute === m} disabled={!allowed(hour, m)} onClick={() => commit(hour, m)} className={`${buttonClass} ${minute === m ? 'border-purple-400 bg-purple-600 text-white' : 'border-slate-700 bg-slate-800 hover:border-purple-400'}`}>{pad(m)}</button>)}</div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <label className="text-xs text-slate-400">精确到每一分钟
            <select aria-label="精确分钟" value={minute} onChange={e => setMinute(Number(e.target.value))} className="ml-2 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white [color-scheme:dark]">{MINUTES.map(m => <option key={m} value={m} disabled={!allowed(hour, m)}>{pad(m)} 分</option>)}</select>
          </label>
          <button type="button" onClick={() => commit(hour, minute)} disabled={!allowed(hour, minute)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500 disabled:opacity-30">使用 {preview}</button>
        </div>
        {maxTime && <p className="text-xs text-amber-300">今天只能选择 {maxTime} 及之前的时刻。</p>}
      </div>
    </dialog>
  </>;
};
