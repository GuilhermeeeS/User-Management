class Logger {
  constructor() {
    this.logs = [];
    this.maxLogs = 1000; 
  }

  getTimestamp() {
    const now = new Date();
    return now.toLocaleTimeString('pt-BR', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
  }

  addLog(type, message, data = null) {
    const logEntry = {
      timestamp: this.getTimestamp(),
      type,
      message,
      data,
      datetime: new Date().toISOString()
    };

    this.logs.unshift(logEntry); 

    
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }

    
    const icon = this.getIcon(type);
    console.log(`[${logEntry.timestamp}] ${icon} ${message}`, data || '');

    return logEntry;
  }

  getIcon(type) {
    const icons = {
      info: 'ℹ️',
      success: '✓',
      error: '✗',
      warning: '⚠️',
      progress: '→',
      complete: '✅'
    };
    return icons[type] || '•';
  }

  info(message, data) {
    return this.addLog('info', message, data);
  }

  success(message, data) {
    return this.addLog('success', message, data);
  }

  error(message, data) {
    return this.addLog('error', message, data);
  }

  warning(message, data) {
    return this.addLog('warning', message, data);
  }

  progress(message, data) {
    return this.addLog('progress', message, data);
  }

  complete(message, data) {
    return this.addLog('complete', message, data);
  }

  getRecent(limit = 50) {
    return this.logs.slice(0, limit);
  }

  clear() {
    this.logs = [];
    console.log('Logs limpos');
  }
}

const logger = new Logger();
module.exports = logger;