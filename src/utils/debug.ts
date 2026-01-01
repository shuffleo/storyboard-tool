/**
 * Debug logging system
 * Collects verbose logs and errors for debugging
 */

export interface DebugLog {
  timestamp: number;
  level: 'log' | 'warn' | 'error' | 'info';
  category: string;
  message: string;
  data?: any;
  stack?: string;
}

class DebugLogger {
  private logs: DebugLog[] = [];
  private maxLogs = 100;
  private enabled = false;

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (enabled) {
      this.log('system', 'Debug mode enabled');
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  log(category: string, message: string, data?: any) {
    if (!this.enabled) return;
    
    const log: DebugLog = {
      timestamp: Date.now(),
      level: 'log',
      category,
      message,
      data,
    };
    
    this.addLog(log);
    console.log(`[${category}]`, message, data || '');
  }

  warn(category: string, message: string, data?: any) {
    if (!this.enabled) return;
    
    const log: DebugLog = {
      timestamp: Date.now(),
      level: 'warn',
      category,
      message,
      data,
    };
    
    this.addLog(log);
    console.warn(`[${category}]`, message, data || '');
  }

  error(category: string, message: string, error?: Error | any, data?: any) {
    if (!this.enabled) return;
    
    const log: DebugLog = {
      timestamp: Date.now(),
      level: 'error',
      category,
      message,
      data: data || error,
      stack: error instanceof Error ? error.stack : undefined,
    };
    
    this.addLog(log);
    console.error(`[${category}]`, message, error || data || '');
  }

  info(category: string, message: string, data?: any) {
    if (!this.enabled) return;
    
    const log: DebugLog = {
      timestamp: Date.now(),
      level: 'info',
      category,
      message,
      data,
    };
    
    this.addLog(log);
    console.info(`[${category}]`, message, data || '');
  }

  private addLog(log: DebugLog) {
    this.logs.push(log);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
  }

  getLogs(): DebugLog[] {
    return [...this.logs];
  }

  clearLogs() {
    this.logs = [];
  }

  getRecentLogs(count: number = 50): DebugLog[] {
    return this.logs.slice(-count);
  }
}

export const debugLogger = new DebugLogger();

// Auto-enable if localStorage has debug flag
if (typeof window !== 'undefined') {
  const saved = localStorage.getItem('debug-mode');
  if (saved === 'true') {
    debugLogger.setEnabled(true);
  }
}

