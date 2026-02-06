// ============================================
// useAI Hook - AI Chat and Configuration
// ============================================

import { useState, useCallback, useEffect, useRef } from 'react';
import api from '../services/api';
import { storage } from '../utils';
import type { ChatMessage, AIConfig } from '../types';

interface UseAIOptions {
  initialMode?: 'private' | 'incognito';
}

interface UseAIState {
  mode: 'private' | 'incognito';
  isLoading: boolean;
  isStreaming: boolean;
  error: string | null;
}

interface UseAIActions {
  chat: (message: string) => Promise<string>;
  setMode: (mode: 'private' | 'incognito') => Promise<void>;
  clearError: () => void;
  messageRef: React.RefObject<HTMLTextAreaElement>;
}

export function useAI(options: UseAIOptions = {}): UseAIState & UseAIActions {
  const { initialMode = 'private' } = options;

  const [mode, setModeState] = useState<'private' | 'incognito'>(initialMode);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messageRef = useRef<HTMLTextAreaElement>(null);

  // Load mode from backend on mount
  useEffect(() => {
    const loadMode = async () => {
      try {
        const savedMode = await api.getMode();
        if (savedMode === 'private' || savedMode === 'incognito') {
          setModeState(savedMode);
        }
      } catch (err) {
        console.error('Failed to load AI mode:', err);
      }
    };
    loadMode();
  }, []);

  const chat = useCallback(async (message: string): Promise<string> => {
    if (!message.trim()) return '';

    setIsLoading(true);
    setError(null);

    try {
      const result = await api.chat(message);
      if (result.success) {
        return result.response;
      } else {
        // Parse error format: __ERROR__|标题|内容
        const parts = result.response.split('|');
        if (parts[0] === '__ERROR__') {
          setError(parts[2] || parts[1] || 'AI 响应失败');
          return '';
        }
        return result.response;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '连接失败';
      setError(errorMessage);
      return '';
    } finally {
      setIsLoading(false);
    }
  }, []);

  const setMode = useCallback(async (newMode: 'private' | 'incognito') => {
    try {
      await api.setMode(newMode);
      setModeState(newMode);
    } catch (err) {
      console.error('Failed to set AI mode:', err);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    mode,
    isLoading,
    isStreaming,
    error,
    chat,
    setMode,
    clearError,
    messageRef,
  };
}

// ============================================
// useAIConfig Hook - AI Configuration Management
// ============================================

interface UseAIConfigState {
  config: AIConfig & { config: Record<string, string>; categories: Array<{ id: number; category_name: string; display_name: string; icon: string; sort_order: number }> };
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
}

interface UseAIConfigActions {
  loadConfig: () => Promise<void>;
  saveConfig: (updates: Record<string, unknown>) => Promise<boolean>;
  updateConfig: (key: string, value: unknown) => Promise<boolean>;
  resetConfig: () => Promise<boolean>;
}

export function useAIConfig(): UseAIConfigState & UseAIConfigActions {
  const [config, setConfig] = useState<AIConfig & { config: Record<string, string>; categories: Array<{ id: number; category_name: string; display_name: string; icon: string; sort_order: number }> }>({
    provider: 'openai',
    apiKey: '',
    baseUrl: '',
    websiteUrl: '',
    modelName: 'gpt-4o',
    model: 'gpt-4o',
    thinkingModel: '',
    temperature: 0.7,
    maxTokens: 4096,
    topP: 0.9,
    config: {},
    categories: [],
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await api.getAIConfig();
      setConfig(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载配置失败');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const saveConfig = useCallback(async (updates: Record<string, unknown>): Promise<boolean> => {
    setIsSaving(true);
    setError(null);

    try {
      const result = await api.setAIConfig(updates);
      if (result.success) {
        await loadConfig();
        return true;
      }
      setError('保存配置失败');
      return false;
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存配置失败');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [loadConfig]);

  const updateConfig = useCallback(async (key: string, value: unknown): Promise<boolean> => {
    setIsSaving(true);
    setError(null);

    try {
      const result = await api.updateAIConfig(key, value);
      if (result.success) {
        await loadConfig();
        return true;
      }
      setError('更新配置失败');
      return false;
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新配置失败');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [loadConfig]);

  const resetConfig = useCallback(async (): Promise<boolean> => {
    setIsSaving(true);
    setError(null);

    try {
      const result = await api.resetAIConfig();
      if (result.success) {
        await loadConfig();
        return true;
      }
      setError('重置配置失败');
      return false;
    } catch (err) {
      setError(err instanceof Error ? err.message : '重置配置失败');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [loadConfig]);

  return {
    config,
    isLoading,
    isSaving,
    error,
    loadConfig,
    saveConfig,
    updateConfig,
    resetConfig,
  };
}
