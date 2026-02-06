// ============================================
// Settings & Config IPC Handlers
// ============================================

import { ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import fs from 'fs';
import path from 'path';

const BACKEND_PORT = 5000;
const BACKEND_HOST = '127.0.0.1';

interface DeskMateConfig {
  minimaxApiKey?: string;
  minimaxModel?: string;
  minimaxBaseUrl?: string;
  provider?: string;
  apiKey?: string;
  baseUrl?: string;
  modelName?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  userName?: string;
  userRole?: string;
  language?: string;
  codeStyle?: string;
  responseConciseness?: string;
  allowLocalIndexing?: boolean;
  cloudSyncEnabled?: boolean;
}

const configPath = path.join(process.cwd(), '..', 'deskmate-config.json');

function loadConfig(): DeskMateConfig {
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Failed to load config:', e);
  }
  return {};
}

function saveConfig(config: DeskMateConfig): void {
  try {
    const currentConfig = loadConfig();
    const newConfig = { ...currentConfig, ...config };
    fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to save config:', e);
  }
}

function httpRequest(endpoint: string, method: string = 'GET', data?: unknown): Promise<unknown> {
  return new Promise((resolve) => {
    const postData = data ? JSON.stringify(data) : null;

    console.log(`[HTTP] ${method} ${endpoint}`, {
      hasData: !!postData,
      dataPreview: postData ? postData.substring(0, 200) : null
    });

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (postData) {
      headers['Content-Length'] = Buffer.byteLength(postData, 'utf8').toString();
    }

    const options = {
      hostname: BACKEND_HOST,
      port: BACKEND_PORT,
      path: endpoint,
      method: method,
      headers: headers,
      timeout: 30000,
    };

    const req = require('http').request(options, (res: any) => {
      // Check status code
      const statusCode = res.statusCode;
      console.log(`[HTTP] Response status: ${statusCode}`);

      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        console.log(`[HTTP] Response body:`, body.substring(0, 500));

        // Check if status code indicates error
        if (statusCode && statusCode >= 400) {
          resolve({ success: false, error: `HTTP ${statusCode}: ${body}` });
          return;
        }

        try {
          const parsed = JSON.parse(body);
          resolve(parsed);
        } catch (e) {
          resolve({ success: false, error: body });
        }
      });
    });

    req.on('error', (e: any) => {
      console.error(`[HTTP] Request error:`, e);
      resolve({ success: false, error: e.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, error: 'Request timeout' });
    });

    if (postData) req.write(postData);
    req.end();
  });
}

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:get', async () => {
    try {
      const result = await httpRequest('/api/ai/config', 'GET') as {
        success: boolean;
        config: Record<string, string>;
      };
      if (result.success && result.config) {
        return {
          provider: result.config.provider,
          apiKey: result.config.api_key,
          baseUrl: result.config.base_url,
          modelName: result.config.model_name,
          model: result.config.model_name,
          temperature: result.config.temperature ? parseFloat(result.config.temperature) : 0.7,
          maxTokens: result.config.max_tokens ? parseInt(result.config.max_tokens) : 4096,
          topP: result.config.top_p ? parseFloat(result.config.top_p) : 0.9,
        };
      }
    } catch (e) {
      console.error('Failed to load settings:', e);
    }
    return loadConfig();
  });

  ipcMain.handle(
    'settings:set',
    async (_event: IpcMainInvokeEvent, settings: Record<string, unknown>): Promise<boolean> => {
      try {
        const result = await httpRequest('/api/ai/config', 'POST', settings) as { success: boolean };
        if (result.success) {
          return true;
        }
      } catch (e) {
        console.error('Failed to save settings:', e);
      }
      const configToSave: DeskMateConfig = {};
      if (settings.apiKey) configToSave.minimaxApiKey = settings.apiKey as string;
      if (settings.model) configToSave.minimaxModel = settings.model as string;
      if (settings.baseUrl) configToSave.minimaxBaseUrl = settings.baseUrl as string;
      if (settings.provider) configToSave.provider = settings.provider as string;
      saveConfig(configToSave);
      return true;
    }
  );
}

export function registerConfigHandlers(): void {
  ipcMain.handle('ai-config:get', async () => {
    try {
      const result = await httpRequest('/api/ai/config', 'GET') as {
        success: boolean;
        config: Record<string, string>;
        categories: Array<{ id: number; category_name: string; display_name: string; icon: string; sort_order: number }>;
      };
      if (result.success) {
        return {
          success: true,
          config: result.config || {},
          categories: result.categories || [],
        };
      }
      return { success: false, error: (result as { error?: string }).error };
    } catch (e) {
      console.error('Failed to get AI config:', e);
      return { success: false, error: String(e) };
    }
  });

  ipcMain.handle(
    'ai-config:set',
    async (_event: IpcMainInvokeEvent, config: Record<string, unknown>): Promise<{ success: boolean; error?: string }> => {
      try {
        console.log('[AI-Config] Saving to backend:', JSON.stringify(config, null, 2));
        const result = await httpRequest('/api/ai/config', 'POST', config) as { success: boolean; error?: string };
        console.log('[AI-Config] Backend response:', result);
        return { success: result.success, error: result.error };
      } catch (e) {
        console.error('[AI-Config] Failed to save AI config:', e);
        return { success: false, error: String(e) };
      }
    }
  );

  ipcMain.handle(
    'ai-config:update',
    async (
      _event: IpcMainInvokeEvent,
      { key, value }: { key: string; value: unknown }
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const result = await httpRequest(`/api/ai/config/${key}`, 'PUT', { value }) as { success: boolean; error?: string };
        return { success: result.success, error: result.error };
      } catch (e) {
        console.error('Failed to update AI config:', e);
        return { success: false, error: String(e) };
      }
    }
  );

  ipcMain.handle('ai-config:reset', async () => {
    try {
      const result = await httpRequest('/api/ai/config/reset', 'POST') as { success: boolean; error?: string };
      return { success: result.success, error: result.error };
    } catch (e) {
      console.error('Failed to reset AI config:', e);
      return { success: false, error: String(e) };
    }
  });

  // Debug endpoint to test backend connection
  ipcMain.handle('debug:test-backend', async (_event: IpcMainInvokeEvent, data: Record<string, unknown>) => {
    console.log('[Debug] Testing backend with data:', JSON.stringify(data, null, 2));
    try {
      const result = await httpRequest('/api/ai/config/test', 'POST', data) as { success: boolean; error?: string };
      console.log('[Debug] Backend response:', result);
      return result;
    } catch (e) {
      console.error('[Debug] Backend test failed:', e);
      return { success: false, error: String(e) };
    }
  });

  // Debug endpoint to check backend health
  ipcMain.handle('debug:health', async () => {
    try {
      const result = await httpRequest('/api/health', 'GET') as { success: boolean };
      return result;
    } catch (e) {
      return { success: false, error: String(e) };
    }
  });
}

export function registerProfileHandlers(): void {
  ipcMain.handle('db:user-profile:get', async () => {
    const config = loadConfig();
    return {
      identity: {
        name: config.userName || 'User',
        role: config.userRole || 'Software Engineer',
        years_experience: 0,
      },
      preferences: {
        language: config.language || 'zh-CN',
        code_style: config.codeStyle || 'TypeScript',
        response_conciseness: config.responseConciseness || 'medium',
      },
      privacy_settings: {
        allow_local_indexing: config.allowLocalIndexing ?? true,
        cloud_sync_enabled: config.cloudSyncEnabled ?? false,
      },
      minimaxApiKey: config.minimaxApiKey || '',
      minimaxModel: config.minimaxModel || 'M2-her',
      minimaxBaseUrl: config.minimaxBaseUrl || 'https://api.openai.com/v1',
    };
  });

  ipcMain.handle(
    'db:user-profile:set',
    async (_event: IpcMainInvokeEvent, profile: Record<string, unknown>): Promise<boolean> => {
      const configToSave: DeskMateConfig = {};

      if (profile.minimaxApiKey) configToSave.minimaxApiKey = profile.minimaxApiKey as string;
      if (profile.minimaxModel) configToSave.minimaxModel = profile.minimaxModel as string;
      if (profile.minimaxBaseUrl) configToSave.minimaxBaseUrl = profile.minimaxBaseUrl as string;

      if (profile.identity) {
        const identity = profile.identity as Record<string, unknown>;
        configToSave.userName = identity.name as string;
        configToSave.userRole = identity.role as string;
      }

      if (profile.preferences) {
        const prefs = profile.preferences as Record<string, unknown>;
        configToSave.language = prefs.language as string;
        configToSave.codeStyle = prefs.code_style as string;
        configToSave.responseConciseness = prefs.response_conciseness as string;
      }

      if (profile.privacy_settings) {
        const privacy = profile.privacy_settings as Record<string, unknown>;
        configToSave.allowLocalIndexing = privacy.allow_local_indexing as boolean;
        configToSave.cloudSyncEnabled = privacy.cloud_sync_enabled as boolean;
      }

      saveConfig(configToSave);
      return true;
    }
  );
}
