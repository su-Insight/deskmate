// ============================================
// Dashboard Component
// ============================================

import React, { useState, useEffect } from 'react';
import { formatRelativeTime } from '../../utils';
import type { Task } from '../../types';
import './Dashboard.css';

interface DashboardStats {
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  recentFiles: number;
}

export const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats>({
    totalTasks: 0,
    completedTasks: 0,
    pendingTasks: 0,
    recentFiles: 0,
  });
  const [recentTasks, setRecentTasks] = useState<Task[]>([]);
  const [greeting, setGreeting] = useState('');

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('早上好');
    else if (hour < 18) setGreeting('下午好');
    else setGreeting('晚上好');

    // Load tasks from localStorage
    const saved = localStorage.getItem('deskmate_tasks');
    if (saved) {
      try {
        const tasks: Task[] = JSON.parse(saved);
        setRecentTasks(tasks.slice(0, 5));
        setStats((prev) => ({
          ...prev,
          totalTasks: tasks.length,
          completedTasks: tasks.filter((t) => t.status === 2).length,
          pendingTasks: tasks.filter((t) => t.status !== 2).length,
        }));
      } catch (e) {
        console.error('Failed to load tasks:', e);
      }
    }
  }, []);

  const getGreetingMessage = (): string => {
    const messages = [
      '今天也要元气满满哦！',
      '开始新的一天吧！',
      '工作顺利，事半功倍！',
      '记得多喝水，适当休息~',
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div className="greeting">
          <h1>{greeting}，主人！</h1>
          <p>{getGreetingMessage()}</p>
        </div>
        <div className="quick-stats">
          <div className="stat-card">
            <div className="stat-icon tasks">
              <i className="fas fa-tasks"></i>
            </div>
            <div className="stat-info">
              <span className="stat-value">{stats.totalTasks}</span>
              <span className="stat-label">任务总数</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon completed">
              <i className="fas fa-check-circle"></i>
            </div>
            <div className="stat-info">
              <span className="stat-value">{stats.completedTasks}</span>
              <span className="stat-label">已完成</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon pending">
              <i className="fas fa-clock"></i>
            </div>
            <div className="stat-info">
              <span className="stat-value">{stats.pendingTasks}</span>
              <span className="stat-label">待办</span>
            </div>
          </div>
        </div>
      </div>

      <div className="dashboard-content">
        <div className="dashboard-section">
          <h3><i className="fas fa-bolt"></i> 快捷功能</h3>
          <div className="quick-actions">
            <div className="quick-action">
              <i className="fas fa-robot"></i>
              <span>AI 对话</span>
            </div>
            <div className="quick-action">
              <i className="fas fa-plus-circle"></i>
              <span>新建任务</span>
            </div>
            <div className="quick-action">
              <i className="fas fa-folder-open"></i>
              <span>浏览文件</span>
            </div>
            <div className="quick-action">
              <i className="fas fa-cog"></i>
              <span>系统设置</span>
            </div>
          </div>
        </div>

        <div className="dashboard-section">
          <h3><i className="fas fa-clock"></i> 最近任务</h3>
          <div className="recent-tasks">
            {recentTasks.length === 0 ? (
              <div className="empty-tasks">
                <i className="fas fa-clipboard-list"></i>
                <p>暂无任务</p>
              </div>
            ) : (
              recentTasks.map((task) => (
                <div key={task.id} className={`recent-task ${task.status === 2 ? 'completed' : ''}`}>
                  <div className="task-status">
                    <i className={`fas ${task.status === 2 ? 'fa-check-circle' : 'fa-circle'}`}></i>
                  </div>
                  <span className="task-title">{task.title}</span>
                  <span className="task-time">{formatRelativeTime(task.created_at)}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="dashboard-section">
          <h3><i className="fas fa-chart-line"></i> 今日概览</h3>
          <div className="overview-cards">
            <div className="overview-card">
              <div className="card-header">
                <i className="fas fa-percentage"></i>
                <span>完成率</span>
              </div>
              <div className="card-value">
                {stats.totalTasks > 0
                  ? Math.round((stats.completedTasks / stats.totalTasks) * 100)
                  : 0}%
              </div>
              <div className="card-progress">
                <div
                  className="progress-bar"
                  style={{
                    width: `${stats.totalTasks > 0 ? (stats.completedTasks / stats.totalTasks) * 100 : 0}%`,
                  }}
                ></div>
              </div>
            </div>
            <div className="overview-card">
              <div className="card-header">
                <i className="fas fa-fire"></i>
                <span>连续天数</span>
              </div>
              <div className="card-value">7 <small>天</small></div>
              <div className="card-hint">保持好习惯！</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
