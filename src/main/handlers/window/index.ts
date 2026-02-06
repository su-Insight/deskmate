// ============================================
// Window Control IPC Handlers
// ============================================

import { ipcMain, BrowserWindow } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';

let configWindow: BrowserWindow | null = null;
let mainWindowRef: BrowserWindow | null = null;

export function registerWindowHandlers(mainWindow: BrowserWindow | null): void {
  mainWindowRef = mainWindow;

  ipcMain.on('window-minimize', () => {
    mainWindowRef?.minimize();
  });

  ipcMain.on('window-maximize', () => {
    if (mainWindowRef?.isMaximized()) {
      mainWindowRef.unmaximize();
    } else {
      mainWindowRef?.maximize();
    }
  });

  ipcMain.on('window-close', () => {
    mainWindowRef?.close();
  });

  ipcMain.handle('window-is-maximized', (): boolean => {
    return mainWindowRef?.isMaximized() ?? false;
  });

  ipcMain.handle('window-open-config', async (): Promise<{ success: boolean }> => {
    createConfigWindow();
    return { success: true };
  });
}

function createConfigWindow(): void {
  if (configWindow) {
    configWindow.focus();
    return;
  }

  const path = require('path');

  const configHtmlPath = path.join(__dirname, '../../renderer/config.html');

  configWindow = new BrowserWindow({
    width: 700,
    height: 600,
    minWidth: 600,
    minHeight: 500,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../../preload/index.js'),
      sandbox: false,
    },
    backgroundColor: '#1a1a2e',
  });

  configWindow.loadFile(configHtmlPath);

  configWindow.once('ready-to-show', () => {
    configWindow?.show();
  });

  configWindow.on('closed', () => {
    configWindow = null;
  });
}

export function setMainWindow(window: BrowserWindow | null): void {
  mainWindowRef = window;
}
