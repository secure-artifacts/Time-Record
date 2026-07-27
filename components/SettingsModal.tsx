import React, { useState, useEffect, useRef } from 'react';
import { AppSettings, Task, Tag, TimeSegment } from '../types';
import { GLOBAL_CITIES, getCountryName } from '../utils/cityData';
import { getTimezoneOffset } from '../utils/timeUtils';

interface SettingsModalProps {
  onClose: () => void;
  tasks?: Task[];
  tags?: Tag[];
  segments?: TimeSegment[];
  onImportData?: (data: any) => void;
  onClearData?: () => void;
}

const STORAGE_KEY = 'mindflow_settings_v7';

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose, tasks, tags, segments, onImportData, onClearData }) => {
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [autoBackupInterval, setAutoBackupInterval] = useState(1);
  const [clearConfirm, setClearConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // API Server State
  const [enableApiServer, setEnableApiServer] = useState(true);
  const [apiPort, setApiPort] = useState(3618);
  const [apiToken, setApiToken] = useState('');
  const [copiedToken, setCopiedToken] = useState(false);
  const [showApiDocs, setShowApiDocs] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed: AppSettings = JSON.parse(saved);
      if (parsed.timezone) setTimezone(parsed.timezone);
      if (parsed.autoBackupInterval) setAutoBackupInterval(parsed.autoBackupInterval);
      if (parsed.enableApiServer !== undefined) setEnableApiServer(parsed.enableApiServer);
      if (parsed.apiPort) setApiPort(parsed.apiPort);
      if (parsed.apiToken !== undefined) setApiToken(parsed.apiToken);
    }
  }, []);

  const handleGenerateToken = () => {
    const newToken = 'mf_' + Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
    setApiToken(newToken);
  };

  const handleCopyToken = () => {
    navigator.clipboard.writeText(apiToken);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  const handleSave = () => {
    const savedRaw = localStorage.getItem(STORAGE_KEY);
    const existing = savedRaw ? JSON.parse(savedRaw) : { model: 'gemini-2.5-flash' };
    
    const settings: AppSettings = {
      ...existing,
      timezone: timezone,
      autoBackupInterval: autoBackupInterval,
      enableApiServer: enableApiServer,
      apiPort: apiPort,
      apiToken: apiToken
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));

    // Notify Electron main process about updated API server config
    if (typeof window !== 'undefined' && (window as any).require) {
      try {
        const { ipcRenderer } = (window as any).require('electron');
        ipcRenderer.send('update-api-config', {
          port: apiPort,
          enabled: enableApiServer,
          token: apiToken
        });
      } catch (e) {
        console.error('Failed to notify Electron main process:', e);
      }
    }
    
    onClose();
  };

  const handleExport = () => {
      const data = {
          tasks,
          tags,
          segments,
          exportDate: new Date().toISOString()
      };
      const jsonString = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      
      const now = new Date();
      const timestamp = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}-${String(now.getMinutes()).padStart(2,'0')}-${String(now.getSeconds()).padStart(2,'0')}`;
      
      link.download = `MindFlow_Record_${timestamp}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const handleImportClick = () => {
      fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
          try {
              const text = ev.target?.result as string;
              const data = JSON.parse(text);
              if (onImportData) {
                  onImportData(data);
                  alert('数据恢复成功！');
                  onClose();
              }
          } catch (err) {
              alert('文件解析失败，请确保是有效的备份 JSON 文件。');
          }
      };
      reader.readAsText(file);
  };

  const handleClearClick = () => {
      if (!clearConfirm) {
          setClearConfirm(true);
          return;
      }
      if (onClearData) {
          onClearData();
          setClearConfirm(false);
          onClose();
      }
  };

  const sortedCities = [...GLOBAL_CITIES].sort((a, b) => {
      const offsetA = getTimezoneOffset(a.timezone);
      const offsetB = getTimezoneOffset(b.timezone);
      return offsetA.localeCompare(offsetB) || a.countryCode.localeCompare(b.countryCode);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg p-6 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
        <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400">
               <i className="fa-solid fa-gear"></i>
            </div>
            <h2 className="text-xl font-bold text-white">系统设置</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <i className="fa-solid fa-xmark text-xl"></i>
          </button>
        </div>

        <div className="space-y-8">
          
          {/* Section: General Config */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800 pb-2">基础配置</h3>
            
            <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400">所在时区 (国家/城市)</label>
                <div className="relative">
                    <select
                        value={timezone}
                        onChange={(e) => setTimezone(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg pl-10 pr-8 py-2.5 outline-none focus:border-blue-500 appearance-none cursor-pointer text-xs"
                    >
                        {sortedCities.map((city, idx) => (
                            <option key={`${city.timezone}-${idx}`} value={city.timezone}>
                                {getCountryName(city.countryCode)}/{city.name} - {city.timezone} ({getTimezoneOffset(city.timezone)})
                            </option>
                        ))}
                    </select>
                    <i className="fa-solid fa-globe absolute left-3 top-3.5 text-slate-500 text-xs"></i>
                    <i className="fa-solid fa-chevron-down absolute right-3 top-3.5 text-slate-500 text-xs pointer-events-none"></i>
                </div>
            </div>

            <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400">自动备份频率</label>
                <div className="relative">
                    <select
                        value={autoBackupInterval}
                        onChange={(e) => setAutoBackupInterval(Number(e.target.value))}
                        className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg pl-10 pr-8 py-2.5 outline-none focus:border-blue-500 appearance-none cursor-pointer text-xs"
                    >
                        <option value={1}>每 1 小时 (推荐)</option>
                        <option value={4}>每 4 小时</option>
                        <option value={12}>每 12 小时</option>
                        <option value={24}>每 24 小时</option>
                    </select>
                    <i className="fa-solid fa-clock-rotate-left absolute left-3 top-3.5 text-slate-500 text-xs"></i>
                    <i className="fa-solid fa-chevron-down absolute right-3 top-3.5 text-slate-500 text-xs pointer-events-none"></i>
                </div>
            </div>
          </div>

          {/* Section: Local REST API Server */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">开放 API 服务 (RESTful API)</h3>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableApiServer}
                  onChange={(e) => setEnableApiServer(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {enableApiServer && (
              <div className="space-y-4 bg-slate-800/40 p-4 rounded-xl border border-slate-800">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-400">服务端口 (Port)</label>
                    <input
                      type="number"
                      value={apiPort}
                      onChange={(e) => setApiPort(Number(e.target.value))}
                      className="w-full mt-1 bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-xs focus:border-blue-500 outline-none"
                      placeholder="3618"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-400">网络地址</label>
                    <div className="mt-1 px-3 py-2 bg-slate-800 border border-slate-700/60 text-blue-400 rounded-lg text-xs font-mono truncate">
                      http://localhost:{apiPort}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-bold text-slate-400">API 访问密钥 Token (可选)</label>
                    <button
                      type="button"
                      onClick={handleGenerateToken}
                      className="text-[11px] text-blue-400 hover:underline"
                    >
                      随机生成
                    </button>
                  </div>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      value={apiToken}
                      onChange={(e) => setApiToken(e.target.value)}
                      placeholder="无需鉴权请留空"
                      className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg pl-3 pr-16 py-2 text-xs font-mono focus:border-blue-500 outline-none"
                    />
                    {apiToken && (
                      <button
                        type="button"
                        onClick={handleCopyToken}
                        className="absolute right-2 px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 text-[10px] rounded transition-colors"
                      >
                        {copiedToken ? '已复制' : '复制'}
                      </button>
                    )}
                  </div>
                </div>

                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setShowApiDocs(!showApiDocs)}
                    className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1.5 font-medium"
                  >
                    <i className={`fa-solid ${showApiDocs ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
                    {showApiDocs ? '隐藏 API 接口说明' : '查看 API 接口调用法 (cURL / Python 示例)'}
                  </button>

                  {showApiDocs && (
                    <div className="mt-3 p-3 bg-slate-950 rounded-lg border border-slate-800 text-[11px] font-mono text-slate-300 space-y-3 overflow-x-auto">
                      <div>
                        <div className="text-green-400 font-bold mb-1">1. 获取当前系统与任务状态</div>
                        <div className="text-slate-400 select-all bg-slate-900 p-2 rounded border border-slate-800">
                          {`curl http://localhost:${apiPort}/api/v1/status ${apiToken ? `-H "Authorization: Bearer ${apiToken}"` : ''}`}
                        </div>
                      </div>

                      <div>
                        <div className="text-blue-400 font-bold mb-1">2. 创建新任务 (POST)</div>
                        <div className="text-slate-400 select-all bg-slate-900 p-2 rounded border border-slate-800">
                          {`curl -X POST http://localhost:${apiPort}/api/v1/tasks ${apiToken ? `-H "Authorization: Bearer ${apiToken}" ` : ''}-H "Content-Type: application/json" -d '{"title":"写代码","priority":"High"}'`}
                        </div>
                      </div>

                      <div>
                        <div className="text-purple-400 font-bold mb-1">3. 启动/暂停任务计时</div>
                        <div className="text-slate-400 select-all bg-slate-900 p-2 rounded border border-slate-800">
                          {`curl -X POST http://localhost:${apiPort}/api/v1/tasks/<TASK_ID>/start`}<br/>
                          {`curl -X POST http://localhost:${apiPort}/api/v1/tasks/<TASK_ID>/pause`}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Section: Data Management */}
          <div className="space-y-4">
             <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800 pb-2">数据管理</h3>
             
             <div className="grid grid-cols-2 gap-3">
                 <button 
                    onClick={handleExport}
                    className="flex flex-col items-center justify-center p-3 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 transition-colors"
                 >
                     <i className="fa-solid fa-file-export text-blue-400 text-xl mb-2"></i>
                     <span className="text-sm font-medium text-slate-300">备份导出</span>
                     <span className="text-[10px] text-slate-500">.json 格式</span>
                 </button>

                 <button 
                    onClick={handleImportClick}
                    className="flex flex-col items-center justify-center p-3 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 transition-colors"
                 >
                     <i className="fa-solid fa-file-import text-green-400 text-xl mb-2"></i>
                     <span className="text-sm font-medium text-slate-300">恢复数据</span>
                     <span className="text-[10px] text-slate-500">覆盖当前记录</span>
                 </button>
                 <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept=".json" 
                    onChange={handleFileChange}
                 />
             </div>

             <div className="pt-2">
                 <button 
                    onClick={handleClearClick}
                    onMouseLeave={() => setClearConfirm(false)}
                    className={`w-full py-2.5 rounded-lg text-sm font-bold border transition-all flex items-center justify-center gap-2 ${
                        clearConfirm 
                        ? 'bg-red-600 text-white border-red-500 animate-pulse' 
                        : 'bg-red-900/20 text-red-400 border-red-900/30 hover:bg-red-900/30'
                    }`}
                 >
                     <i className={`fa-solid ${clearConfirm ? 'fa-triangle-exclamation' : 'fa-trash-can'}`}></i>
                     {clearConfirm ? '再次点击确认清空所有数据！' : '清空所有数据'}
                 </button>
             </div>
          </div>

          <div className="pt-4 border-t border-slate-800">
             <button 
                onClick={handleSave}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-600/20 active:scale-[0.98]"
             >
                保存设置
             </button>
          </div>
        </div>
      </div>
    </div>
  );
};