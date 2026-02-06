// ============================================
// File System IPC Handlers
// ============================================

import { ipcMain, dialog, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import type { IpcMainInvokeEvent } from 'electron';

type ReadDirResult = Array<{
  name: string;
  isDirectory: boolean;
  path: string;
  size: number;
  modifiedAt: number;
}>;

export function registerFileSystemHandlers(): void {
  ipcMain.handle(
    'fs:read-dir',
    async (_event: IpcMainInvokeEvent, dirPath: string): Promise<ReadDirResult> => {
      try {
        const items = await fs.promises.readdir(dirPath, { withFileTypes: true });
        return items.map((item) => ({
          name: item.name,
          isDirectory: item.isDirectory(),
          path: path.join(dirPath, item.name),
          size: 0,
          modifiedAt: Date.now(),
        }));
      } catch (error) {
        throw error;
      }
    }
  );

  ipcMain.handle('fs:select-folder', async (): Promise<string | null> => {
    const { BrowserWindow } = require('electron');
    const result = await dialog.showOpenDialog(BrowserWindow.getAllWindows()[0] || new BrowserWindow(), {
      properties: ['openDirectory'],
    });
    return result.filePaths[0] || null;
  });

  ipcMain.handle(
    'fs:read-file',
    async (_event: IpcMainInvokeEvent, filePath: string): Promise<string> => {
      try {
        return await fs.promises.readFile(filePath, 'utf-8');
      } catch (error) {
        throw error;
      }
    }
  );

  ipcMain.handle(
    'fs:write-file',
    async (
      _event: IpcMainInvokeEvent,
      { filePath, content }: { filePath: string; content: string }
    ): Promise<boolean> => {
      try {
        await fs.promises.writeFile(filePath, content, 'utf-8');
        return true;
      } catch (error) {
        throw error;
      }
    }
  );

  ipcMain.handle('utils:open-external', async (_event: IpcMainInvokeEvent, url: string): Promise<boolean> => {
    await shell.openExternal(url);
    return true;
  });

  ipcMain.handle(
    'utils:show-item-in-folder',
    async (_event: IpcMainInvokeEvent, path: string): Promise<boolean> => {
      shell.showItemInFolder(path);
      return true;
    }
  );
}
