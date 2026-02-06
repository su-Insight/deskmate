// ============================================
// useSettings Hook - Application Settings
// ============================================

import { useState, useCallback, useEffect } from 'react';
import api from '../services/api';
import { storage } from '../utils';

interface Settings {
  provider: string;
  apiKey: string;
  model: string;
  baseUrl: string;
  temperature: number;
  maxTokens: number;
}

interface UseSettingsState {
  settings: Settings;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
}

interface UseSettingsActions {
  loadSettings: () => Promise<void>;
  saveSettings: (updates: Partial<Settings>) => Promise<boolean>;
  clearSettings: () => Promise<void>;
}

const DEFAULT_SETTINGS: Settings = {
  provider: 'openai',
  apiKey: '',
  model: 'gpt-4o',
  baseUrl: 'https://api.openai.com/v1',
  temperature: 0.7,
  maxTokens: 4096,
};

export function useSettings(): UseSettingsState & UseSettingsActions {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load settings from backend and localStorage
  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // First try to load from backend
      const backendSettings = await api.getSettings();
      if (backendSettings.provider) {
        setSettings({
          provider: backendSettings.provider || DEFAULT_SETTINGS.provider,
          apiKey: backendSettings.apiKey || '',
          model: backendSettings.model || DEFAULT_SETTINGS.model,
          baseUrl: backendSettings.baseUrl || DEFAULT_SETTINGS.baseUrl,
          temperature: backendSettings.temperature || DEFAULT_SETTINGS.temperature,
          maxTokens: backendSettings.maxTokens || DEFAULT_SETTINGS.maxTokens,
        });
      } else {
        // Fallback to localStorage
        const savedSettings = storage.get<Settings | null>('deskmate_settings', null);
        setSettings(savedSettings || DEFAULT_SETTINGS);
      }
    } catch (err) {
      // Fallback to localStorage
      const savedSettings = storage.get<Settings | null>('deskmate_settings', null);
      setSettings(savedSettings || DEFAULT_SETTINGS);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Save settings to backend and localStorage
  const saveSettings = useCallback(async (updates: Partial<Settings>): Promise<boolean> => {
    setIsSaving(true);
    setError(null);

    try {
      const newSettings = { ...settings, ...updates };
      setSettings(newSettings);

      // Save to backend
      await api.setSettings(updates);

      // Also save to localStorage as backup
      storage.set('deskmate_settings', newSettings);

      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存设置失败');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [settings]);

  // Clear all settings
  const clearSettings = useCallback(async () => {
    setSettings(DEFAULT_SETTINGS);
    storage.remove('deskmate_settings');
  }, []);

  return {
    settings,
    isLoading,
    isSaving,
    error,
    loadSettings,
    saveSettings,
    clearSettings,
  };
}

// ============================================
// useProfile Hook - User Profile Management
// ============================================

import type { UserProfile } from '../types';

interface UseProfileState {
  profile: UserProfile;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
}

interface UseProfileActions {
  loadProfile: () => Promise<void>;
  saveProfile: (updates: Partial<UserProfile>) => Promise<boolean>;
  updateIdentity: (identity: Partial<UserProfile['identity']>) => Promise<boolean>;
  updatePreferences: (prefs: Partial<UserProfile['preferences']>) => Promise<boolean>;
}

const DEFAULT_PROFILE: UserProfile = {
  identity: {
    name: 'User',
    role: 'Software Engineer',
    years_experience: 0,
  },
  preferences: {
    language: 'zh-CN',
    code_style: 'TypeScript',
    response_conciseness: 'brief',
  },
  privacy_settings: {
    allow_local_indexing: true,
    cloud_sync_enabled: false,
  },
};

export function useProfile(): UseProfileState & UseProfileActions {
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await api.getProfile();
      setProfile(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载配置失败');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const saveProfile = useCallback(async (updates: Partial<UserProfile>): Promise<boolean> => {
    setIsSaving(true);
    setError(null);

    try {
      const newProfile = { ...profile, ...updates };
      setProfile(newProfile);

      await api.setProfile(updates);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存配置失败');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [profile]);

  const updateIdentity = useCallback(
    async (identity: Partial<UserProfile['identity']>): Promise<boolean> => {
      return saveProfile({ identity: { ...profile.identity, ...identity } });
    },
    [profile.identity, saveProfile]
  );

  const updatePreferences = useCallback(
    async (prefs: Partial<UserProfile['preferences']>): Promise<boolean> => {
      return saveProfile({ preferences: { ...profile.preferences, ...prefs } });
    },
    [profile.preferences, saveProfile]
  );

  return {
    profile,
    isLoading,
    isSaving,
    error,
    loadProfile,
    saveProfile,
    updateIdentity,
    updatePreferences,
  };
}
