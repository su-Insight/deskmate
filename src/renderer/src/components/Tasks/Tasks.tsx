// ============================================
// Tasks Component
// ============================================

import React, { useState, useEffect } from 'react';
import { useTasks } from '../../hooks';
import { formatRelativeTime } from '../../utils';
import type { Task } from '../../types';
import './Tasks.css';

export const Tasks: React.FC = () => {
  const { tasks, isLoading, error, loadTasks, addTask, updateTask, deleteTask, toggleTaskStatus } = useTasks();
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('all');

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const filteredTasks = tasks.filter((task) => {
    if (filter === 'pending') return task.status !== 2;
    if (filter === 'completed') return task.status === 2;
    return true;
  });

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newTaskTitle.trim()) {
      await addTask(newTaskTitle.trim());
      setNewTaskTitle('');
    }
  };

  const getStatusLabel = (status: number): string => {
    switch (status) {
      case 0: return '待办';
      case 1: return '进行中';
      case 2: return '已完成';
      default: return '';
    }
  };

  const getPriorityClass = (priority: number): string => {
    switch (priority) {
      case 1: return 'low';
      case 2: return 'medium';
      case 3: return 'high';
      default: return '';
    }
  };

  return (
    <div className="tasks-container">
      <div className="tasks-header">
        <h2><i className="fas fa-check-square"></i> 任务管理</h2>
        <div className="task-stats">
          <span className="stat total">总计: {tasks.length}</span>
          <span className="stat pending">待办: {tasks.filter((t) => t.status !== 2).length}</span>
          <span className="stat completed">已完成: {tasks.filter((t) => t.status === 2).length}</span>
        </div>
      </div>

      <form className="task-form" onSubmit={handleAddTask}>
        <input
          type="text"
          value={newTaskTitle}
          onChange={(e) => setNewTaskTitle(e.target.value)}
          placeholder="添加新任务..."
          className="task-input"
        />
        <button type="submit" className="add-task-btn" disabled={!newTaskTitle.trim()}>
          <i className="fas fa-plus"></i>
        </button>
      </form>

      <div className="task-filters">
        {(['all', 'pending', 'completed'] as const).map((f) => (
          <button
            key={f}
            className={`filter-btn ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? '全部' : f === 'pending' ? '待办' : '已完成'}
          </button>
        ))}
      </div>

      {error && <div className="tasks-error">{error}</div>}

      <div className="tasks-list">
        {isLoading ? (
          <div className="loading"><i className="fas fa-spinner fa-spin"></i> 加载中...</div>
        ) : filteredTasks.length === 0 ? (
          <div className="empty-state">
            <i className="fas fa-tasks"></i>
            <p>暂无任务</p>
          </div>
        ) : (
          filteredTasks.map((task) => (
            <div key={task.id} className={`task-item ${task.status === 2 ? 'completed' : ''}`}>
              <button
                className={`task-checkbox ${task.status === 2 ? 'checked' : ''}`}
                onClick={() => toggleTaskStatus(task.id)}
              >
                {task.status === 2 && <i className="fas fa-check"></i>}
              </button>
              <div className="task-content">
                <div className="task-header">
                  <span className={`task-title ${task.status === 2 ? 'done' : ''}`}>{task.title}</span>
                  <span className={`task-priority priority-${getPriorityClass(task.priority)}`}>
                    {task.priority === 2 ? '高' : task.priority === 1 ? '中' : '低'}
                  </span>
                </div>
                <div className="task-meta">
                  <span className="task-status">{getStatusLabel(task.status)}</span>
                  <span className="task-time">{formatRelativeTime(task.created_at)}</span>
                </div>
              </div>
              <div className="task-actions">
                <button className="action-btn delete" onClick={() => deleteTask(task.id)}>
                  <i className="fas fa-trash"></i>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Tasks;
