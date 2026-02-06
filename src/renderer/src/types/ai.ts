// ============================================
// AI Types - AI 相关类型定义
// ============================================

// AI 提供商配置
export interface AIProvider {
  id: string;
  name: string;
  icon?: string;
  baseUrl: string;
  models: string[];
  requiresApiKey: boolean;
  getKeyUrl?: string;      // 获取 API Key 的链接，不存在则不显示按钮
  websiteUrl?: string;     // 官网地址
}

// 单个模型配置
export interface ModelConfig {
  id: string;
  name: string;
  provider: string;
  apiKey?: string;
  baseUrl?: string;
  model: string;
  thinkingModel?: string;
  enabled?: boolean;
  remark?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  createdAt?: number;
}

// 全局 AI 配置
export interface AIConfig {
  provider: string;
  apiKey?: string;
  baseUrl?: string;
  websiteUrl?: string;
  modelName?: string;
  model: string;
  thinkingModel?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}

// 聊天消息
export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
  sessionId?: string;
}

// 聊天会话
export interface ChatSession {
  id: string;
  name: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

// AI 聊天响应
export interface AIChatResponse {
  success: boolean;
  response: string;
  mode: string;
}
