import React, { useState, useEffect } from 'react';
import { TimeSegment, Tag, Task } from '../types';
import {
  addDaysToDateStr,
  getTrailingWeekDateStrs,
  splitRangeByZonedHours,
  zonedWallTimeToUtc,
} from '../utils/timeUtils';

interface WeeklyHeatmapProps {
  segments: TimeSegment[];
  tasks: Task[];
  tags: Tag[];
  timezone: string;
}

export const WeeklyHeatmap: React.FC<WeeklyHeatmapProps> = ({ segments, tasks, tags, timezone }) => {
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const daysMap = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  
  const [includeTimeColumn, setIncludeTimeColumn] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [weekOffset, setWeekOffset] = useState(0);

  // Auto-hide toast
  useEffect(() => {
      if (toastMsg) {
          const timer = setTimeout(() => setToastMsg(''), 3000);
          return () => clearTimeout(timer);
      }
  }, [toastMsg]);

  const weekDateStrs = getTrailingWeekDateStrs(timezone, weekOffset);
  const weekDates = weekDateStrs.map(s => {
      const [y, m, d] = s.split('-').map(Number);
      return new Date(y, m - 1, d);
  });

  // grid[dIndex][hour] = array of task segments
  const grid: { id: string, name: string, color: string, tagName: string, topPct: number, heightPct: number }[][][] = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => []));

  const now = Date.now();
  segments.forEach(seg => {
    const actualEnd = Math.min(seg.endTime ?? now, seg.startTime + 7 * 24 * 3600 * 1000);
    const slices = splitRangeByZonedHours(seg.startTime, actualEnd, timezone);
    const task = tasks.find(t => t.id === seg.taskId);
    const tag = tags.find(t => t.id === task?.tagId);

    slices.forEach(slice => {
        const dIndex = weekDateStrs.indexOf(slice.dateStr);
        if (dIndex === -1) return;
        const topPct = (slice.minuteStartInHour / 60) * 100;
        let heightPct = (slice.durationMin / 60) * 100;
        if (heightPct < 5) heightPct = 5;

        grid[dIndex][slice.hour].push({
            id: seg.id + slice.start,
            name: task?.title || 'Unknown',
            tagName: tag?.name || 'Unknown',
            color: tag?.color || 'bg-slate-600',
            topPct,
            heightPct
        });
    });
  });

  const copyToSpreadsheet = (datesToExport: Date[], label: string) => {
    let tsv = (includeTimeColumn ? "时间 \\ 日期\t" : "") + datesToExport.map(d => `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} ${daysMap[d.getDay()]}`).join("\t") + "\n";
    
    for (let h = 0; h < 24; h++) {
        const timeLabel = `${h}:00`;
        let row = includeTimeColumn ? [timeLabel] : [];
        
        for (const d of datesToExport) {
            const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const blockStart = new Date(zonedWallTimeToUtc(dateStr, h, 0, timezone));
            const blockEnd = new Date(
              h === 23
                ? zonedWallTimeToUtc(addDaysToDateStr(dateStr, 1), 0, 0, timezone)
                : zonedWallTimeToUtc(dateStr, h + 1, 0, timezone)
            );
            
            const overlappingSegs = segments.filter(seg => {
                const s = new Date(seg.startTime);
                const e = seg.endTime ? new Date(seg.endTime) : new Date();
                return s < blockEnd && e > blockStart;
            });
            
            if (overlappingSegs.length > 0) {
                // Aggregate durations by task name
                const taskDurations: Record<string, number> = {};
                let activeMins = 0;
                
                overlappingSegs.forEach(seg => {
                    const t = tasks.find(tsk => tsk.id === seg.taskId);
                    const taskName = t ? t.title : '未知';
                    
                    const s = new Date(seg.startTime);
                    const e = seg.endTime ? new Date(seg.endTime) : new Date();
                    const overlapStart = s > blockStart ? s : blockStart;
                    const overlapEnd = e < blockEnd ? e : blockEnd;
                    const mins = Math.round((overlapEnd.getTime() - overlapStart.getTime()) / 60000);
                    
                    if (mins > 0) {
                        taskDurations[taskName] = (taskDurations[taskName] || 0) + mins;
                        activeMins += mins;
                    }
                });
                
                const cellData = Object.entries(taskDurations)
                    .map(([name, mins]) => {
                        const hr = Math.floor(mins / 60);
                        const remMin = mins % 60;
                        let timeStr = "";
                        if (hr > 0) timeStr += `${hr}小时`;
                        if (remMin > 0 || hr === 0) timeStr += `${remMin}分钟`;
                        return `${name}(${timeStr})`; // Time is always included, formatted in Chinese
                    });
                
                const idleMins = 60 - activeMins;
                if (idleMins > 0) {
                    cellData.push(`[空闲: ${idleMins}分钟]`);
                }
                    
                // Use quotes and true newlines for multi-line cells in spreadsheets
                const cellContent = cellData.length > 1 ? `"${cellData.join('\n')}"` : cellData[0];
                row.push(cellContent);
            } else {
                // 100% idle
                row.push("");
            }
        }
        tsv += row.join("\t") + "\n";
    }

    // Append Daily Totals
    const formatMins = (mins: number) => {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `${h > 0 ? h + '小时' : ''}${m > 0 || h === 0 ? m + '分钟' : ''}`;
    };

    const dailyTotals = datesToExport.map(d => {
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const dayStart = new Date(zonedWallTimeToUtc(dateStr, 0, 0, timezone));
        const dayEnd = new Date(zonedWallTimeToUtc(addDaysToDateStr(dateStr, 1), 0, 0, timezone));
        
        let totalActiveMins = 0;
        segments.forEach(seg => {
            const s = new Date(seg.startTime);
            const e = seg.endTime ? new Date(seg.endTime) : new Date();
            const overlapStart = s > dayStart ? s : dayStart;
            const overlapEnd = e < dayEnd ? e : dayEnd;
            if (overlapEnd > overlapStart) {
                totalActiveMins += Math.round((overlapEnd.getTime() - overlapStart.getTime()) / 60000);
            }
        });
        
        const idleMins = (24 * 60) - totalActiveMins;
        return `"总记录: ${formatMins(totalActiveMins)}\n总空闲: ${formatMins(idleMins)}"`;
    });
    
    let finalTsv = tsv + (includeTimeColumn ? "单日汇总\t" : "") + dailyTotals.join("\t") + "\n";
    
    navigator.clipboard.writeText(finalTsv).then(() => {
        setToastMsg(`已复制 [${label}] 的排期表`);
    });
  };

  return (
    <div className="p-4 bg-slate-900 rounded-xl border border-slate-800 overflow-x-auto relative">
      {/* Custom Toast */}
      {toastMsg && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white px-4 py-2 rounded-lg shadow-xl shadow-green-900/50 text-sm font-medium animate-fade-in-down flex items-center gap-2">
              <i className="fa-solid fa-circle-check"></i> {toastMsg}
          </div>
      )}

      <div className="flex justify-between items-center mb-4 sticky left-0 z-20">
        <div>
            <div className="flex items-center gap-3">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <i className="fa-solid fa-border-all"></i> {weekOffset === 0 ? '近7天时间分布' : '7天时间分布'}
                </h3>
                <div className="flex items-center gap-1 bg-slate-800/50 rounded-lg p-0.5 border border-slate-700/50">
                    <button 
                        onClick={() => setWeekOffset(prev => prev - 1)}
                        className="p-1 px-2 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded transition-colors"
                        title="上一周"
                    >
                        <i className="fa-solid fa-chevron-left text-xs"></i>
                    </button>
                    <button 
                        onClick={() => setWeekOffset(0)}
                        className={`text-xs px-2 py-1 rounded transition-colors ${weekOffset === 0 ? 'text-slate-500 cursor-default' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'}`}
                        disabled={weekOffset === 0}
                    >
                        回到本周
                    </button>
                    <button 
                        onClick={() => setWeekOffset(prev => prev + 1)}
                        className={`p-1 px-2 rounded transition-colors ${weekOffset >= 0 ? 'text-slate-600 cursor-not-allowed' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'}`}
                        title="下一周"
                        disabled={weekOffset >= 0}
                    >
                        <i className="fa-solid fa-chevron-right text-xs"></i>
                    </button>
                </div>
            </div>
            <div className="text-xs text-slate-500 mt-2 flex items-center gap-5">
                <label className="flex items-center gap-1.5 cursor-pointer hover:text-slate-300 transition-colors">
                    <input 
                        type="checkbox" 
                        checked={includeTimeColumn} 
                        onChange={(e) => setIncludeTimeColumn(e.target.checked)}
                        className="accent-blue-500 w-3 h-3"
                    />
                    <span>复制时附带左侧时间列 (如 10:00)</span>
                </label>
            </div>
        </div>
        <div className="flex gap-2">
            <button 
                onClick={() => copyToSpreadsheet([weekDates[6]], weekOffset === 0 ? '今日' : '所选最后一天')}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg border border-slate-700 transition-colors flex items-center gap-2"
            >
                <i className="fa-regular fa-copy"></i> {weekOffset === 0 ? '复制今日' : '复制最后一天'}
            </button>
            <button 
                onClick={() => copyToSpreadsheet(weekDates, weekOffset === 0 ? '本周' : '该周')}
                className="px-3 py-1.5 bg-blue-900/30 hover:bg-blue-800/50 text-blue-400 text-xs rounded-lg border border-blue-800/50 transition-colors flex items-center gap-2"
            >
                <i className="fa-regular fa-calendar-days"></i> {weekOffset === 0 ? '复制本周' : '复制该周'}
            </button>
        </div>
      </div>

      <div className="min-w-[800px]">
        {/* Header Row */}
        <div className="grid grid-cols-[50px_repeat(7,1fr)] gap-1 mb-2 sticky top-0 bg-slate-900 z-10 py-2">
           <div className="text-xs text-slate-500"></div>
           {weekDates.map((d, idx) => (
               <div key={idx} className="flex flex-col items-center justify-center group relative">
                   <div className="text-xs text-slate-400 font-medium">{daysMap[d.getDay()]}</div>
                   <div className="text-[10px] text-slate-500 font-mono mt-0.5">{d.getMonth()+1}/{d.getDate()}</div>
                   <button 
                       onClick={() => copyToSpreadsheet([d], `${d.getMonth()+1}月${d.getDate()}日`)}
                       className="absolute -top-1 -right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 text-blue-400 hover:text-blue-300"
                       title="复制此日记录"
                   >
                       <i className="fa-regular fa-copy text-xs"></i>
                   </button>
               </div>
           ))}
        </div>
        
        {/* Grid Body */}
        <div className="grid grid-cols-[50px_repeat(7,1fr)] gap-x-1 gap-y-0.5">
          {hours.map(h => (
            <React.Fragment key={h}>
              <div className="text-[10px] text-slate-600 text-right pr-2 -mt-2 z-10">{h}:00</div>
              {weekDates.map((_, dIndex) => {
                const cellItems = grid[dIndex][h];

                return (
                  <div 
                    key={`${dIndex}-${h}`} 
                    className="h-12 border-t border-slate-800/50 relative bg-slate-800/10 hover:bg-slate-800/30 transition-colors"
                  >
                     {cellItems.map((item, idx) => (
                         <div 
                            key={item.id + idx}
                            className={`absolute left-0 right-0 ${item.color} rounded-sm opacity-90 hover:opacity-100 hover:scale-[1.02] hover:z-30 shadow-sm cursor-help transition-all group`}
                            style={{ 
                                top: `${item.topPct}%`, 
                                height: `${item.heightPct}%`,
                                minHeight: '4px' // Ensure it doesn't disappear completely
                            }}
                         >
                            {/* Tiny label if height allows */}
                            {item.heightPct >= 25 && (
                               <div className="w-full h-full flex items-start justify-center pt-0.5 overflow-hidden">
                                  <span className="text-[8px] text-white/90 font-medium truncate px-1 drop-shadow-md leading-none">
                                     {item.name}
                                  </span>
                               </div>
                            )}

                            {/* Tooltip on Hover */}
                            <div className="absolute opacity-0 group-hover:opacity-100 bottom-full left-1/2 -translate-x-1/2 mb-1 bg-slate-900 text-white text-xs px-2 py-1.5 rounded-lg border border-slate-700 whitespace-nowrap z-50 pointer-events-none shadow-2xl transition-opacity">
                              <div className="font-bold mb-0.5">{item.name}</div>
                              <div className="text-[10px] text-slate-400 flex items-center gap-1">
                                  <span className={`w-1.5 h-1.5 rounded-full ${item.color}`}></span>
                                  {item.tagName}
                              </div>
                            </div>
                         </div>
                     ))}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
      
      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-8 justify-center text-[10px] text-slate-400 sticky left-0 pt-4 border-t border-slate-800">
        {tags.map(t => (
          <div key={t.id} className="flex items-center gap-1.5 bg-slate-800/50 px-2 py-1 rounded">
            <div className={`w-2.5 h-2.5 rounded-sm ${t.color}`}></div> 
            <span>{t.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
};