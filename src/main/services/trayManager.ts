// ============================================
// Tray Icon Manager
// ============================================

import { Tray, Menu, BrowserWindow } from 'electron';
import path from 'path';

interface TrayManagerOptions {
  mainWindow: BrowserWindow | null;
  onOpenConfig: () => void;
}

export function createTrayManager({ mainWindow, onOpenConfig }: TrayManagerOptions): Tray | null {
  const iconPath = path.join(__dirname, '../../build/icon.png');

  try {
    const tray = new Tray(iconPath);
    const contextMenu = Menu.buildFromTemplate([
      {
        label: '显示主窗口',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          }
        },
      },
      {
        label: '打开配置',
        click: () => {
          onOpenConfig();
        },
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          const { app } = require('electron');
          app.quit();
        },
      },
    ]);

    tray.setToolTip('DeskMate');
    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    });

    return tray;
  } catch (e) {
    console.warn('Failed to create tray icon:', e);
    return null;
  }
}
