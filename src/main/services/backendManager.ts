// ============================================
// Backend Service Manager
// ============================================

import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

interface BackendManager {
  process: ChildProcess | null;
  isRunning: boolean;
  start: () => void;
  stop: () => void;
  restart: () => void;
}

const BACKEND_PORT = 5000;
const BACKEND_HOST = '127.0.0.1';

// Get logs directory
const getLogsDir = (): string => {
  const logsDir = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'DeskMate', 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  return logsDir;
};

// Write to log file
const writeLog = (type: 'info' | 'error', message: string): void => {
  try {
    const logsDir = getLogsDir();
    const logFile = path.join(logsDir, 'backend.log');
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${type.toUpperCase()}] ${message}\n`;
    fs.appendFileSync(logFile, logLine);
  } catch (e) {
    // Ignore log write errors
  }
};

// Clear old logs on startup
const clearLogs = (): void => {
  try {
    const logsDir = getLogsDir();
    const logFile = path.join(logsDir, 'backend.log');
    if (fs.existsSync(logFile)) {
      fs.writeFileSync(logFile, `[${new Date().toISOString()}] --- Session Start ---\n`);
    }
  } catch (e) {
    // Ignore
  }
};

export function createBackendManager(): BackendManager {
  let backendProcess: ChildProcess | null = null;

  const isDev = process.argv.includes('--dev');

  const getBackendPath = (): string => {
    if (isDev) {
      return path.join(__dirname, '../../backend/app.py');
    }
    return path.join(process.resourcesPath, 'backend', 'app.py');
  };

  const start = (): void => {
    const backendPath = getBackendPath();

    clearLogs();
    writeLog('info', `Starting backend... Path: ${backendPath}`);
    console.log('[Backend] Starting... Path:', backendPath);

    // Check if Python file exists
    if (!fs.existsSync(backendPath)) {
      const error = `Backend file not found: ${backendPath}`;
      writeLog('error', error);
      console.error('[Backend]', error);
      return;
    }

    // Try pythonw first (no console window), fall back to python
    const pythonCmd = process.platform === 'win32' ? 'pythonw' : 'python';

    backendProcess = spawn(pythonCmd, [backendPath], {
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    backendProcess.stdout?.on('data', (data: any) => {
      const msg = data.toString().trim();
      writeLog('info', msg);
      console.log(`[Backend] ${msg}`);
    });

    backendProcess.stderr?.on('data', (data: any) => {
      const msg = data.toString().trim();
      writeLog('error', msg);
      console.error(`[Backend Error] ${msg}`);
    });

    backendProcess.on('error', (error: any) => {
      const msg = `Failed to start: ${error.message}`;
      writeLog('error', msg);
      console.error('[Backend]', msg);

      // Try fallback to python on Windows
      if (process.platform === 'win32') {
        writeLog('info', 'Trying fallback to python...');
        console.log('[Backend] Trying fallback to python...');
        backendProcess = spawn('python', [backendPath], {
          detached: false,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        });
        backendProcess.stdout?.on('data', (data: any) => {
          const m = data.toString().trim();
          writeLog('info', m);
          console.log(`[Backend] ${m}`);
        });
        backendProcess.stderr?.on('data', (data: any) => {
          const m = data.toString().trim();
          writeLog('error', m);
          console.error(`[Backend Error] ${m}`);
        });
      }
    });

    backendProcess.on('exit', (code: any) => {
      if (code !== null && code !== 0) {
        writeLog('info', `Backend exited with code ${code}`);
        console.log(`[Backend] Exited with code ${code}`);
      }
    });

    writeLog('info', 'Backend started successfully');
    console.log('[Backend] Started successfully');
  };

  const stop = (): void => {
    if (backendProcess) {
      backendProcess.kill();
      backendProcess = null;
      writeLog('info', 'Backend stopped');
      console.log('[Backend] Stopped');
    }
  };

  const restart = (): void => {
    stop();
    start();
  };

  return {
    process: backendProcess,
    isRunning: !!backendProcess,
    start,
    stop,
    restart,
  };
}

// Export singleton instance
export const backendManager = createBackendManager();

// Helper function to get log file path
export function getBackendLogPath(): string {
  const logsDir = getLogsDir();
  return path.join(logsDir, 'backend.log');
}
