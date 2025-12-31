import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { debugLogger, DebugLog } from '../utils/debug';

interface DebugPanelProps {
  enabled: boolean;
}

export function DebugPanel({ enabled }: DebugPanelProps) {
  const [logs, setLogs] = useState<DebugLog[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const logContainerRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled) return;

    const updateLogs = () => {
      setLogs(debugLogger.getRecentLogs(100));
    };

    // Update logs every 500ms
    const interval = setInterval(updateLogs, 500);
    updateLogs();

    return () => clearInterval(interval);
  }, [enabled]);

  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const timeStr = date.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit'
    });
    const ms = date.getMilliseconds().toString().padStart(3, '0');
    return `${timeStr}.${ms}`;
  };

  const getLogColor = (level: DebugLog['level']) => {
    switch (level) {
      case 'error': return 'text-red-400';
      case 'warn': return 'text-yellow-400';
      case 'info': return 'text-blue-400';
      default: return 'text-slate-300';
    }
  };

  const getLogBg = (level: DebugLog['level']) => {
    switch (level) {
      case 'error': return 'bg-red-900/20';
      case 'warn': return 'bg-yellow-900/20';
      case 'info': return 'bg-blue-900/20';
      default: return 'bg-slate-800/50';
    }
  };

  if (!enabled) return null;

  // Render directly to body using portal to ensure it's always visible
  const debugPanelContent = (
    <div className="fixed bottom-0 left-0 right-0 h-64 bg-slate-900 border-t border-slate-700 z-[9999] flex flex-col" style={{ pointerEvents: 'auto' }}>
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-200">Debug Log</span>
          <span className="text-xs text-slate-400">({logs.length} entries)</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded"
            />
            Auto-scroll
          </label>
          <button
            onClick={() => {
              debugLogger.clearLogs();
              setLogs([]);
            }}
            className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 rounded"
          >
            Clear
          </button>
        </div>
      </div>
      <div
        ref={logContainerRef}
        className="flex-1 overflow-y-auto p-2 font-mono text-xs"
        style={{ maxHeight: 'calc(16rem - 3rem)' }}
      >
        {logs.length === 0 ? (
          <div className="text-slate-500 text-center py-4">No logs yet...</div>
        ) : (
          logs.map((log, index) => (
            <div
              key={index}
              className={`mb-1 px-2 py-1 rounded ${getLogBg(log.level)}`}
            >
              <div className="flex items-start gap-2">
                <span className="text-slate-500 flex-shrink-0">{formatTime(log.timestamp)}</span>
                <span className={`flex-shrink-0 font-semibold ${getLogColor(log.level)}`}>
                  [{log.level.toUpperCase()}]
                </span>
                <span className="text-slate-400 flex-shrink-0">[{log.category}]</span>
                <span className={`flex-1 ${getLogColor(log.level)}`}>{log.message}</span>
              </div>
              {log.data && (
                <div className="mt-1 ml-8 text-slate-400">
                  <pre className="whitespace-pre-wrap break-words">
                    {typeof log.data === 'object' ? JSON.stringify(log.data, null, 2) : String(log.data)}
                  </pre>
                </div>
              )}
              {log.stack && (
                <div className="mt-1 ml-8 text-red-400 text-xs">
                  <pre className="whitespace-pre-wrap break-words">{log.stack}</pre>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );

  // Use portal to render outside React tree
  return createPortal(debugPanelContent, document.body);
}

