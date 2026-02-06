// ============================================
// Task Types - 任务相关类型定义
// ============================================

// 任务状态
export type TaskStatus = 0 | 1 | 2;  // 0=待办, 1=进行中, 2=已完成

// 任务优先级
export type TaskPriority = 0 | 1 | 2;  // 0=低, 1=中, 2=高

// 任务
export interface Task {
  id: number;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  description?: string;
  due_date?: number;
  created_at: number;
  updated_at: number;
}

// 任务统计
export interface TaskStats {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
}
