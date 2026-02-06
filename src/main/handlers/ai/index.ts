// ============================================
// AI IPC Handlers
// ============================================

import { ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';

const BACKEND_PORT = 5000;
const BACKEND_HOST = '127.0.0.1';

interface HttpRequestOptions {
  hostname: string;
  port: number;
  path: string;
  method: string;
  headers: Record<string, string>;
  timeout: number;
}

let aiMode: 'private' | 'incognito' = 'private';

function httpRequest(endpoint: string, method: string = 'GET', data?: unknown): Promise<unknown> {
  return new Promise((resolve) => {
    const postData = data ? JSON.stringify(data) : null;
    console.log(`[HTTP] ${method} ${endpoint}`, postData ? JSON.parse(postData) : '');

    const options: HttpRequestOptions = {
      hostname: BACKEND_HOST,
      port: BACKEND_PORT,
      path: endpoint,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    };

    const req = require('http').request(options, (res: any) => {
      let body = '';
      res.on('data', (chunk: string) => body += chunk);
      res.on('end', () => {
        console.log(`[HTTP] Response ${res.statusCode}:`, body);
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve({ success: false, error: body });
        }
      });
    });

    req.on('error', (e: any) => {
      console.error('[HTTP] Error:', e.message);
      resolve({ success: false, error: e.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, error: 'Request timeout' });
    });

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

export function registerAIHandlers(): void {
  ipcMain.handle(
    'ai:set-mode',
    async (_event: IpcMainInvokeEvent, mode: 'private' | 'incognito'): Promise<{ success: boolean; mode: string }> => {
      aiMode = mode;
      console.log(`AI Mode switched to: ${mode}`);
      return { success: true, mode };
    }
  );

  ipcMain.handle('ai:get-mode', async (): Promise<string> => {
    return aiMode;
  });

  ipcMain.handle(
    'ai:chat-complete',
    async (
      _event: IpcMainInvokeEvent,
      { message, history }: { message: string; history?: Array<{ role: string; content: string }> }
    ): Promise<{ success: boolean; response: string; mode: string }> => {
      try {
        const result = await httpRequest('/api/ai/chat', 'POST', {
          message,
          history: history || [],
          mode: aiMode,
        }) as { success: boolean; response?: string; error?: string };

        if (result.success) {
          return {
            success: true,
            response: result.response || '',
            mode: aiMode,
          };
        } else {
          return {
            success: false,
            response: `__ERROR__|AI 错误|${result.error || '未知错误'}`,
            mode: aiMode,
          };
        }
      } catch (error: any) {
        console.error('AI Chat error:', error);
        return {
          success: false,
          response: `__ERROR__|连接失败|无法连接到 AI 服务: ${error.message || '未知错误'}`,
          mode: aiMode,
        };
      }
    }
  );

  ipcMain.handle(
    'ai:chat-stream',
    async (
      _event: IpcMainInvokeEvent,
      { message }: { message: string; history?: Array<{ role: string; content: string }> }
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const result = await httpRequest('/api/ai/chat/stream', 'POST', {
          message,
          mode: aiMode,
        }) as { success: boolean };
        return result;
      } catch (error: any) {
        console.error('AI Chat stream error:', error);
        return { success: false, error: error.message };
      }
    }
  );
}
