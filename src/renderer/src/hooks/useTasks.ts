// ============================================
// useTasks Hook - Task Management
// ============================================

import { useState, useCallback, useEffect } from 'react';
import api from '../services/api';
import type { Task } from '../types';

interface UseTasksState {
  tasks: Task[];
  isLoading: boolean;
  error: string | null;
}

interface UseTasksActions {
  loadTasks: () => Promise<void>;
  addTask: (title: string, description?: string) => Promise<boolean>;
  updateTask: (id: number, updates: Partial<Task>) => Promise<boolean>;
  deleteTask: (id: number) => Promise<boolean>;
  toggleTaskStatus: (id: number) => Promise<boolean>;
}

export function useTasks(): UseTasksState & UseTasksActions {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await api.query<Task[]>('SELECT * FROM tasks ORDER BY created_at DESC');
      if (result && Array.isArray(result)) {
        setTasks(result as unknown as Task[]);
      } else {
        setTasks([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载任务失败');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const addTask = useCallback(
    async (title: string, description?: string): Promise<boolean> => {
      try {
        const result = await api.execute(
          'INSERT INTO tasks (title, description, status, priority, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
          [title, description || '', 0, 1, Date.now(), Date.now()]
        );
        if (result.success) {
          await loadTasks();
          return true;
        }
        return false;
      } catch (err) {
        setError(err instanceof Error ? err.message : '添加任务失败');
        return false;
      }
    },
    [loadTasks]
  );

  const updateTask = useCallback(
    async (id: number, updates: Partial<Task>): Promise<boolean> => {
      try {
        const setClause = Object.entries(updates)
          .map(([key]) => `${key} = ?`)
          .join(', ');
        const values = [...Object.values(updates), id];

        const result = await api.execute(`UPDATE tasks SET ${setClause}, updated_at = ? WHERE id = ?`, [...values, Date.now(), id]);
        if (result.success) {
          await loadTasks();
          return true;
        }
        return false;
      } catch (err) {
        setError(err instanceof Error ? err.message : '更新任务失败');
        return false;
      }
    },
    [loadTasks]
  );

  const deleteTask = useCallback(
    async (id: number): Promise<boolean> => {
      try {
        const result = await api.execute('DELETE FROM tasks WHERE id = ?', [id]);
        if (result.success) {
          await loadTasks();
          return true;
        }
        return false;
      } catch (err) {
        setError(err instanceof Error ? err.message : '删除任务失败');
        return false;
      }
    },
    [loadTasks]
  );

  const toggleTaskStatus = useCallback(
    async (id: number): Promise<boolean> => {
      const task = tasks.find((t) => t.id === id);
      if (!task) return false;

      const newStatus = task.status === 2 ? 0 : task.status + 1;
      return updateTask(id, { status: newStatus as 0 | 1 | 2 });
    },
    [tasks, updateTask]
  );

  return {
    tasks,
    isLoading,
    error,
    loadTasks,
    addTask,
    updateTask,
    deleteTask,
    toggleTaskStatus,
  };
}

// ============================================
// useFileSystem Hook - File System Operations
// ============================================

import type { FileInfo } from '../types';

interface UseFileSystemState {
  currentPath: string;
  files: FileInfo[];
  isLoading: boolean;
  error: string | null;
}

interface UseFileSystemActions {
  loadDirectory: (path: string) => Promise<void>;
  navigateUp: () => Promise<void>;
  navigateTo: (path: string) => Promise<void>;
  selectFolder: () => Promise<string | null>;
}

export function useFileSystem(): UseFileSystemState & UseFileSystemActions {
  const [currentPath, setCurrentPath] = useState('/');
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDirectory = useCallback(async (path: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await api.readDir(path);
      setFiles(result);
      setCurrentPath(path);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载目录失败');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const navigateUp = useCallback(async () => {
    const parent = currentPath.split('/').slice(0, -1).join('/') || '/';
    await loadDirectory(parent);
  }, [currentPath, loadDirectory]);

  const navigateTo = useCallback(async (path: string) => {
    await loadDirectory(path);
  }, [loadDirectory]);

  const selectFolder = useCallback(async (): Promise<string | null> => {
    try {
      const path = await api.selectFolder();
      if (path) {
        await loadDirectory(path);
        return path;
      }
      return null;
    } catch (err) {
      setError(err instanceof Error ? err.message : '选择文件夹失败');
      return null;
    }
  }, [loadDirectory]);

  return {
    currentPath,
    files,
    isLoading,
    error,
    loadDirectory,
    navigateUp,
    navigateTo,
    selectFolder,
  };
}
