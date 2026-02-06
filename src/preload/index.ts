import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

// ============================================
// IPC Channel Definitions
// ============================================

// File System Channels
const FS_CHANNELS = {
  READ_DIR: 'fs:read-dir',
  SELECT_FOLDER: 'fs:select-folder',
  READ_FILE: 'fs:read-file',
  WRITE_FILE: 'fs:write-file',
  WATCH_FILE: 'fs:watch-file',
} as const;

// Window Control Channels
const WIN_CHANNELS = {
  MINIMIZE: 'window-minimize',
  MAXIMIZE: 'window-maximize',
  CLOSE: 'window-close',
  IS_MAXIMIZED: 'window-is-maximized',
} as const;

// AI Channels
const AI_CHANNELS = {
  CHAT_STREAM: 'ai:chat-stream',
  CHAT_COMPLETE: 'ai:chat-complete',
  SET_MODE: 'ai:set-mode',
  GET_MODE: 'ai:get-mode',
  CONFIG_GET: 'ai-config:get',
  CONFIG_SET: 'ai-config:set',
  CONFIG_UPDATE: 'ai-config:update',
  CONFIG_RESET: 'ai-config:reset',
} as const;

// Database Channels
const DB_CHANNELS = {
  QUERY: 'db:query',
  EXECUTE: 'db:execute',
  INSERT: 'db:insert',
  UPDATE: 'db:update',
  DELETE: 'db:delete',
} as const;

// User Profile Channels
const PROFILE_CHANNELS = {
  GET: 'db:user-profile:get',
  SET: 'db:user-profile:set',
  UPDATE: 'db:user-profile:update',
} as const;

// Settings Channels
const SETTINGS_CHANNELS = {
  GET: 'settings:get',
  SET: 'settings:set',
} as const;

// ============================================
// Type Definitions
// ============================================

export interface FileInfo {
  name: string;
  isDirectory: boolean;
  path: string;
  size?: number;
  modifiedAt?: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AIResponse {
  success: boolean;
  response?: string;
  error?: string;
  mode: 'private' | 'incognito';
}

export interface AIConfig {
  config: Record<string, string>;
  categories: Array<{
    id: number;
    category_name: string;
    display_name: string;
    icon: string;
    sort_order: number;
  }>;
}

export interface UserProfile {
  identity: {
    name: string;
    role: string;
    years_experience: number;
  };
  preferences: {
    language: string;
    code_style: string;
    response_conciseness: 'high' | 'medium' | 'low';
  };
  privacy_settings: {
    allow_local_indexing: boolean;
    cloud_sync_enabled: boolean;
  };
}

// ============================================
// Context Bridge API
// ============================================

contextBridge.exposeInMainWorld('deskmate', {
  // Version info
  version: '1.0.0',
  platform: process.platform,

  // File System API
  fs: {
    readDir: (dirPath: string): Promise<FileInfo[]> =>
      ipcRenderer.invoke(FS_CHANNELS.READ_DIR, dirPath),

    selectFolder: (): Promise<string> =>
      ipcRenderer.invoke(FS_CHANNELS.SELECT_FOLDER),

    readFile: (filePath: string): Promise<string> =>
      ipcRenderer.invoke(FS_CHANNELS.READ_FILE, filePath),

    writeFile: (filePath: string, content: string): Promise<boolean> =>
      ipcRenderer.invoke(FS_CHANNELS.WRITE_FILE, { filePath, content }),
  },

  // Window Control API
  window: {
    minimize: (): void => ipcRenderer.send(WIN_CHANNELS.MINIMIZE),
    maximize: (): void => ipcRenderer.send(WIN_CHANNELS.MAXIMIZE),
    close: (): void => ipcRenderer.send(WIN_CHANNELS.CLOSE),
    isMaximized: (): Promise<boolean> =>
      ipcRenderer.invoke(WIN_CHANNELS.IS_MAXIMIZED),
    openConfig: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('window-open-config'),
  },

  // AI API
  ai: {
    chat: (message: string, history?: ChatMessage[]): Promise<AIResponse> =>
      ipcRenderer.invoke(AI_CHANNELS.CHAT_COMPLETE, { message, history }),

    setMode: (mode: 'private' | 'incognito'): Promise<{ success: boolean; mode: string }> =>
      ipcRenderer.invoke(AI_CHANNELS.SET_MODE, mode),

    getMode: (): Promise<string> =>
      ipcRenderer.invoke(AI_CHANNELS.GET_MODE),

    // Stream-based chat (for real-time response)
    chatStream: (message: string, history?: ChatMessage[]) => {
      ipcRenderer.send(AI_CHANNELS.CHAT_STREAM, { message, history });
      return ipcRenderer.on(
        AI_CHANNELS.CHAT_STREAM,
        (_event: IpcRendererEvent, data: { chunk: string; done: boolean }) => data
      );
    },

    // AI Configuration
    getConfig: (): Promise<AIConfig> =>
      ipcRenderer.invoke(AI_CHANNELS.CONFIG_GET),

    setConfig: (config: Record<string, unknown>): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(AI_CHANNELS.CONFIG_SET, config),

    updateConfig: (key: string, value: unknown): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(AI_CHANNELS.CONFIG_UPDATE, { key, value }),

    resetConfig: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(AI_CHANNELS.CONFIG_RESET),
  },

  // Database API
  db: {
    query: <T = unknown>(sql: string, params?: unknown[]): Promise<T[]> =>
      ipcRenderer.invoke(DB_CHANNELS.QUERY, { sql, params }),

    execute: (sql: string, params?: unknown[]): Promise<{ success: boolean; lastId?: number }> =>
      ipcRenderer.invoke(DB_CHANNELS.EXECUTE, { sql, params }),
  },

  // User Profile API
  profile: {
    get: (): Promise<UserProfile> =>
      ipcRenderer.invoke(PROFILE_CHANNELS.GET),

    set: (profile: Partial<UserProfile>): Promise<boolean> =>
      ipcRenderer.invoke(PROFILE_CHANNELS.SET, profile),

    update: <K extends keyof UserProfile>(key: K, value: UserProfile[K]): Promise<boolean> =>
      ipcRenderer.invoke(PROFILE_CHANNELS.UPDATE, { key, value }),
  },

  // Utility API
  utils: {
    openExternal: (url: string): Promise<boolean> =>
      ipcRenderer.invoke('utils:open-external', url),

    showItemInFolder: (path: string): Promise<boolean> =>
      ipcRenderer.invoke('utils:show-item-in-folder', path),
  },

  // Settings API
  settings: {
    get: (): Promise<{ provider?: string; apiKey?: string; model?: string; baseUrl?: string; temperature?: number; maxTokens?: number }> =>
      ipcRenderer.invoke(SETTINGS_CHANNELS.GET),

    set: (settings: { provider?: string; apiKey?: string; model?: string; baseUrl?: string; temperature?: number; maxTokens?: number }): Promise<boolean> =>
      ipcRenderer.invoke(SETTINGS_CHANNELS.SET, settings),
  },

  // Debug API
  debug: {
    testBackend: (data: Record<string, unknown>): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('debug:test-backend', data),

    healthCheck: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('debug:health'),
  },

  // Event listeners
  on: (channel: string, listener: (event: IpcRendererEvent, ...args: unknown[]) => void) => {
    ipcRenderer.on(channel, listener);
  },

  off: (channel: string, listener?: (event: IpcRendererEvent, ...args: unknown[]) => void) => {
    ipcRenderer.removeListener(channel, listener ?? (() => {}));
  },
});
