// ============================================
// User Types - 用户相关类型定义
// ============================================

// 用户身份信息
export interface UserIdentity {
  name: string;
  role: string;
  years_experience?: number;
}

// 用户偏好设置
export interface UserPreferences {
  language: string;
  code_style?: string;
  response_conciseness?: 'brief' | 'detailed';
}

// 隐私设置
export interface PrivacySettings {
  allow_local_indexing: boolean;
  cloud_sync_enabled: boolean;
}

// 完整用户资料
export interface UserProfile {
  id?: number;
  identity: UserIdentity;
  preferences: UserPreferences;
  privacy_settings: PrivacySettings;
  avatar?: string;
  email?: string;
  theme?: 'light' | 'dark';
  language?: string;
}
