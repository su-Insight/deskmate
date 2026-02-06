// ============================================
// DeskMate Main Process - Modular Entry Point
// ============================================

import { app, BrowserWindow, Menu, shell } from 'electron';
import path from 'path';

// Import handlers and services
import { registerFileSystemHandlers, registerWindowHandlers, registerAIHandlers, registerSettingsHandlers, registerConfigHandlers, registerProfileHandlers, setMainWindow } from './handlers';
import { backendManager } from './services';

// Global state
let mainWindow: BrowserWindow | null = null;
const isDev = process.argv.includes('--dev');

// ============================================
// Window Management
// ============================================

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
    icon: path.join(__dirname, '../../build/icon.png'),
    show: false,
    backgroundColor: '#111827',
  });

  if (isDev) {
    const port = process.env.VITE_PORT || '3000';
    mainWindow.loadURL(`http://localhost:${port}`);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:maximized', true);
  });

  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:maximized', false);
  });
}

// ============================================
// Security Headers
// ============================================

app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event) => {
    event.preventDefault();
  });

  contents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
});

// ============================================
// App Lifecycle
// ============================================

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();

  // Register IPC handlers
  registerFileSystemHandlers();
  registerWindowHandlers(mainWindow);
  registerAIHandlers();
  registerSettingsHandlers();
  registerConfigHandlers();
  registerProfileHandlers();

  // Update window reference for handlers
  setMainWindow(mainWindow);

  // Start backend service
  backendManager.start();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  backendManager.stop();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  backendManager.stop();
});

console.log('DeskMate Main Process Started (Modular)');
