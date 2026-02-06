// ============================================
// File Types - 文件系统相关类型定义
// ============================================

// 文件信息
export interface FileInfo {
  name: string;
  path: string;
  type: 'file' | 'folder';
  isDirectory?: boolean;
  size?: number;
  modified?: number;
  modifiedAt?: number;
}

// 通用 API 响应
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// 窗口状态
export interface WindowState {
  isMaximized: boolean;
  width: number;
  height: number;
}
