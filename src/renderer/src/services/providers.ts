// ============================================
// AI Providers Configuration
// ============================================

import type { AIProvider } from '../types';

export const AI_PROVIDERS: AIProvider[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    icon: 'fa-robot',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'],
    requiresApiKey: true,
    getKeyUrl: 'https://platform.openai.com/api-keys',
    websiteUrl: 'https://openai.com',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    icon: 'fa-deepfm',
    baseUrl: 'https://api.deepseek.com',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    requiresApiKey: true,
    getKeyUrl: 'https://platform.deepseek.com/',
    websiteUrl: 'https://www.deepseek.com',
  },
  {
    id: 'zhipu',
    name: '智谱 AI',
    icon: 'fa-brain',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-4', 'glm-4v', 'glm-3-turbo'],
    requiresApiKey: true,
    getKeyUrl: 'https://open.bigmodel.cn/user-center/apikeys',
    websiteUrl: 'https://www.bigmodel.cn',
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    icon: 'fa-microchip',
    baseUrl: 'https://api.minimax.chat/v1',
    models: ['abab6.5s-chat', 'abab6.5-chat', 'abab5.5s-chat'],
    requiresApiKey: true,
    getKeyUrl: 'https://platform.minimax.chat/',
    websiteUrl: 'https://www.minimaxi.com',
  },
  {
    id: 'kimi',
    name: 'Kimi (Moonshot)',
    icon: 'fa-moon',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    requiresApiKey: true,
    getKeyUrl: 'https://platform.moonshot.cn/',
    websiteUrl: 'https://www.moonshot.cn',
  },
  {
    id: 'nvidia',
    name: 'NVIDIA',
    icon: 'fa-nvidia',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    models: ['llama-3.1-405b-instruct', 'llama-3.1-70b-instruct', 'llama-3.1-8b-instruct'],
    requiresApiKey: true,
    getKeyUrl: 'https://build.nvidia.com/',
    websiteUrl: 'https://www.nvidia.com',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    icon: 'fa-gem',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    models: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.0-pro'],
    requiresApiKey: true,
    getKeyUrl: 'https://aistudio.google.com/app/apikey',
    websiteUrl: 'https://gemini.google.com',
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    icon: 'fa-cloudscale',
    baseUrl: 'https://api.anthropic.com/v1',
    models: ['claude-sonnet-4-20250514', 'claude-haiku-3-20250514', 'claude-opus-4-20250514'],
    requiresApiKey: true,
    getKeyUrl: 'https://console.anthropic.com/',
    websiteUrl: 'https://www.anthropic.com',
  },
  {
    id: 'custom',
    name: '自定义',
    icon: 'fa-cog',
    baseUrl: '',
    models: [],
    requiresApiKey: true,
  },
  {
    id: 'free',
    name: '免费/本地 (Ollama)',
    icon: 'fa-wifi',
    baseUrl: 'http://localhost:11434/v1',
    models: ['llama3', 'mistral', 'codellama', 'qwen'],
    requiresApiKey: false,
    websiteUrl: 'https://ollama.com',
  },
];

export function getProviderById(id: string): AIProvider | undefined {
  return AI_PROVIDERS.find((p) => p.id === id);
}

export function getProviderModels(providerId: string): string[] {
  const provider = getProviderById(providerId);
  return provider?.models || [];
}

export function getDefaultModel(providerId: string): string {
  const models = getProviderModels(providerId);
  return models[0] || '';
}

export const DEFAULT_PROVIDERS: Record<string, { name: string; model: string; baseUrl: string }> = {
  openai: { name: 'OpenAI', model: 'gpt-4o', baseUrl: 'https://api.openai.com/v1' },
  deepseek: { name: 'DeepSeek', model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com' },
  zhipu: { name: '智谱 AI', model: 'glm-4', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
  minimax: { name: 'MiniMax', model: 'abab6.5s-chat', baseUrl: 'https://api.minimax.chat/v1' },
  kimi: { name: 'Kimi', model: 'moonshot-v1-8k', baseUrl: 'https://api.moonshot.cn/v1' },
  nvidia: { name: 'NVIDIA', model: 'llama-3.1-70b-instruct', baseUrl: 'https://integrate.api.nvidia.com/v1' },
  gemini: { name: 'Gemini', model: 'gemini-1.5-flash', baseUrl: 'https://generativelanguage.googleapis.com/v1beta' },
  anthropic: { name: 'Claude', model: 'claude-sonnet-4-20250514', baseUrl: 'https://api.anthropic.com/v1' },
  custom: { name: '自定义', model: '', baseUrl: '' },
  free: { name: 'Ollama', model: 'llama3', baseUrl: 'http://localhost:11434/v1' },
};
