// ============================================
// DeskMate API Service
// ============================================

import type { AIConfig, ChatMessage, UserProfile, FileInfo } from '../types';

// DeskMate API interface (for documentation - actual types come from preload)
interface IDeskMateAPI {
  version: string;
  platform: string;
  fs: {
    readDir: (dirPath: string) => Promise<FileInfo[]>;
    selectFolder: () => Promise<string>;
    readFile: (filePath: string) => Promise<string>;
    writeFile: (filePath: string, content: string) => Promise<boolean>;
  };
  window: {
    minimize: () => void;
    maximize: () => void;
    close: () => void;
    isMaximized: () => Promise<boolean>;
    openConfig: () => Promise<{ success: boolean }>;
  };
  ai: {
    chat: (message: string, history?: ChatMessage[]) => Promise<{ success: boolean; response: string; mode: string }>;
    setMode: (mode: 'private' | 'incognito') => Promise<{ success: boolean; mode: string }>;
    getMode: () => Promise<string>;
    chatStream: (message: string, history?: ChatMessage[]) => void;
    getConfig: () => Promise<AIConfig & { config: Record<string, string>; categories: Array<{ id: number; category_name: string; display_name: string; icon: string; sort_order: number }> }>;
    setConfig: (config: Record<string, unknown>) => Promise<{ success: boolean }>;
    updateConfig: (key: string, value: unknown) => Promise<{ success: boolean }>;
    resetConfig: () => Promise<{ success: boolean }>;
  };
  db: {
    query: <T = unknown>(sql: string, params?: unknown[]) => Promise<T[]>;
    execute: (sql: string, params?: unknown[]) => Promise<{ success: boolean; lastId?: number }>;
  };
  profile: {
    get: () => Promise<UserProfile>;
    set: (profile: Partial<UserProfile>) => Promise<boolean>;
    update: <K extends keyof UserProfile>(key: K, value: UserProfile[K]) => Promise<boolean>;
  };
  settings: {
    get: () => Promise<{ provider?: string; apiKey?: string; model?: string; baseUrl?: string; temperature?: number; maxTokens?: number }>;
    set: (settings: Record<string, unknown>) => Promise<boolean>;
  };
  debug: {
    testBackend: (data: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>;
    healthCheck: () => Promise<{ success: boolean; error?: string }>;
  };
  utils: {
    openExternal: (url: string) => Promise<boolean>;
    showItemInFolder: (path: string) => Promise<boolean>;
  };
  onEvent: (channel: string, listener: (...args: unknown[]) => void) => void;
  offEvent: (channel: string, listener?: (...args: unknown[]) => void) => void;
}

class DeskMateAPI {
  private static instance: DeskMateAPI;
  private cachedApi: IDeskMateAPI | null = null;

  private getApi(): IDeskMateAPI {
    if (!this.cachedApi) {
      if (!(window as any).deskmate) {
        throw new Error('DeskMate API not available. Please restart the application.');
      }
      this.cachedApi = (window as any).deskmate;
    }
    return this.cachedApi;
  }

  // Version info
  getVersion(): string {
    return this.getApi().version;
  }

  getPlatform(): string {
    return this.getApi().platform;
  }

  // File System API
  async readDir(dirPath: string): Promise<FileInfo[]> {
    return this.getApi().fs.readDir(dirPath);
  }

  async selectFolder(): Promise<string> {
    return this.getApi().fs.selectFolder();
  }

  async readFile(filePath: string): Promise<string> {
    return this.getApi().fs.readFile(filePath);
  }

  async writeFile(filePath: string, content: string): Promise<boolean> {
    return this.getApi().fs.writeFile(filePath, content);
  }

  // Window Control API
  minimize(): void {
    this.getApi().window.minimize();
  }

  maximize(): void {
    this.getApi().window.maximize();
  }

  close(): void {
    this.getApi().window.close();
  }

  async isMaximized(): Promise<boolean> {
    return this.getApi().window.isMaximized();
  }

  async openConfig(): Promise<boolean> {
    const result = await this.getApi().window.openConfig();
    return result.success;
  }

  // AI API
  async chat(message: string, history?: ChatMessage[]): Promise<{ success: boolean; response: string; mode: string }> {
    return this.getApi().ai.chat(message, history);
  }

  async setMode(mode: 'private' | 'incognito'): Promise<{ success: boolean; mode: string }> {
    return this.getApi().ai.setMode(mode);
  }

  async getMode(): Promise<string> {
    return this.getApi().ai.getMode();
  }

  chatStream(message: string, history?: ChatMessage[]): void {
    this.getApi().ai.chatStream(message, history);
  }

  async getAIConfig(): Promise<AIConfig & { config: Record<string, string>; categories: Array<{ id: number; category_name: string; display_name: string; icon: string; sort_order: number }> }> {
    return this.getApi().ai.getConfig();
  }

  async setAIConfig(config: Record<string, unknown>): Promise<{ success: boolean }> {
    return this.getApi().ai.setConfig(config);
  }

  async updateAIConfig(key: string, value: unknown): Promise<{ success: boolean }> {
    return this.getApi().ai.updateConfig(key, value);
  }

  async resetAIConfig(): Promise<{ success: boolean }> {
    return this.getApi().ai.resetConfig();
  }

  // Database API
  async query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
    return this.getApi().db.query<T>(sql, params);
  }

  async execute(sql: string, params?: unknown[]): Promise<{ success: boolean; lastId?: number }> {
    return this.getApi().db.execute(sql, params);
  }

  // User Profile API
  async getProfile(): Promise<UserProfile> {
    return this.getApi().profile.get();
  }

  async setProfile(profile: Partial<UserProfile>): Promise<boolean> {
    return this.getApi().profile.set(profile);
  }

  async updateProfile<K extends keyof UserProfile>(key: K, value: UserProfile[K]): Promise<boolean> {
    return this.getApi().profile.update(key, value);
  }

  // Settings API
  async getSettings(): Promise<{ provider?: string; apiKey?: string; model?: string; baseUrl?: string; temperature?: number; maxTokens?: number }> {
    return this.getApi().settings.get();
  }

  async setSettings(settings: Record<string, unknown>): Promise<boolean> {
    return this.getApi().settings.set(settings);
  }

  // Debug API
  async debugTestBackend(data: Record<string, unknown>): Promise<{ success: boolean; error?: string }> {
    return this.getApi().debug.testBackend(data);
  }

  async debugHealthCheck(): Promise<{ success: boolean; error?: string }> {
    return this.getApi().debug.healthCheck();
  }

  // Utility API
  async openExternal(url: string): Promise<boolean> {
    return this.getApi().utils.openExternal(url);
  }

  async showItemInFolder(path: string): Promise<boolean> {
    return this.getApi().utils.showItemInFolder(path);
  }

  // Event listeners
  onEvent(channel: string, listener: (...args: unknown[]) => void): void {
    this.getApi().onEvent(channel, listener);
  }

  offEvent(channel: string, listener?: (...args: unknown[]) => void): void {
    this.getApi().offEvent(channel, listener);
  }

  // Static method to get singleton instance
  static getInstance(): DeskMateAPI {
    if (!DeskMateAPI.instance) {
      DeskMateAPI.instance = new DeskMateAPI();
    }
    return DeskMateAPI.instance;
  }
}

export const api = DeskMateAPI.getInstance();
export default api;
