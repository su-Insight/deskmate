import React from 'react';

interface Task {
  id: number;
  title: string;
  description?: string;
  status: 'todo' | 'progress' | 'done';
  date: string;
  avatars?: string[];
  comments?: number;
}

interface TaskCardProps extends Task {}

export const TaskCard: React.FC<TaskCardProps> = ({ title, description, date, status, avatars, comments }) => {
  const statusMap = {
    todo: { class: 'todo', label: 'To-Do' },
    progress: { class: 'progress', label: 'In Progress' },
    done: { class: 'done', label: 'Done' },
  };

  return (
    <div className="card task-card">
      <div className="task-card-header">
        <span className={`task-tag ${statusMap[status].class}`}>{statusMap[status].label}</span>
        <span className="task-date">{date}</span>
      </div>
      <div className="task-title">{title}</div>
      {description && <div className="task-desc">{description}</div>}
      <div className="task-footer">
        <div className="avatar-group">
          {avatars?.map((a, i) => <div key={i} className="avatar">{a}</div>)}
        </div>
        <div className="task-comments">
          <i className="fa-regular fa-comment"></i>
          <span>{comments}</span>
        </div>
      </div>
    </div>
  );
};

export const DashboardView: React.FC = () => {
  const stats = [
    { label: 'Daily Average', value: '6h 42m', trend: '+12%', trendUp: true, icon: 'fa-clock' },
    { label: 'Time Spent', value: '8h 15m', trend: '+5%', trendUp: true, icon: 'fa-chart-line' },
    { label: 'Tasks Done', value: '24', trend: '-2%', trendUp: false, icon: 'fa-check-circle' },
    { label: 'Streak', value: '15 days', trend: 'Best!', trendUp: true, icon: 'fa-fire' },
  ];

  return (
    <div>
      <header className="page-header">
        <div>
          <h1 className="page-title">My Project</h1>
          <p className="page-subtitle">Good morning, welcome back!</p>
        </div>
        <div className="header-actions">
          <a href="https://github.com/su-Insight" target="_blank" rel="noopener noreferrer" className="icon-btn" title="GitHub" style={{ marginRight: '8px' }}>
            <i className="fa-brands fa-github"></i>
          </a>
          <a href="https://your-blog.com" target="_blank" rel="noopener noreferrer" className="icon-btn" title="Blog" style={{ marginRight: '8px' }}>
            <i className="fa-solid fa-globe"></i>
          </a>
          <a href="https://www.buymeacoffee.com/yourusername" target="_blank" rel="noopener noreferrer" className="icon-btn" style={{ color: '#FF6A00', marginRight: '16px' }} title="Buy Me a Coffee">
            <i className="fa-solid fa-mug-hot"></i>
          </a>
          <button className="icon-btn" style={{ position: 'relative' }}>
            <i className="fa-solid fa-bell"></i>
            <span className="badge">3</span>
          </button>
        </div>
      </header>

      <div className="stats-grid">
        {stats.map((stat, i) => (
          <div key={i} className="card stat-card">
            <div className="stat-header">
              <div className="stat-icon">
                <i className={`fa-solid ${stat.icon}`}></i>
              </div>
              <span className={`stat-trend ${stat.trendUp ? 'up' : 'down'}`}>{stat.trend}</span>
            </div>
            <div className="stat-label">{stat.label}</div>
            <div className="stat-value">{stat.value}</div>
          </div>
        ))}
      </div>

      <div className="content-grid">
        <div className="card chart-card">
          <div className="chart-header">
            <span className="chart-title">Activity Overview</span>
            <span className="chart-legend">
              <span className="chart-legend-dot"></span>
              This Week
            </span>
          </div>
          <div className="chart-area">
            {[40, 65, 45, 80, 55, 90, 70].map((h, i) => (
              <div key={i} className="chart-bar" style={{ height: `${h}%` }}></div>
            ))}
          </div>
        </div>

        <div className="card image-card">
          <div className="image-card-banner">
            <i className="fa-solid fa-dumbbell"></i>
          </div>
          <div className="image-card-content">
            <div className="image-card-title">Massive Arm Workout</div>
            <div className="image-card-meta">45 min • 320 cal</div>
            <div className="flex items-center justify-between">
              <div className="avatar-group">
                <div className="avatar">A</div>
                <div className="avatar">B</div>
                <div className="avatar">+3</div>
              </div>
              <span className="text-xs text-secondary">Just now</span>
            </div>
          </div>
        </div>
      </div>

      <div className="task-row">
        <TaskCard
          id={1}
          title="Webhook Integration"
          description="Connect payment gateway API"
          date="Today"
          status="todo"
          avatars={['JD', 'MK']}
          comments={12}
        />
        <TaskCard
          id={2}
          title="Landing Page Design"
          description="Create new marketing page"
          date="Tomorrow"
          status="progress"
          avatars={['SL']}
          comments={8}
        />
      </div>

      <div className="card create-task">
        <div className="create-task-title">Create a new task</div>
        <div className="create-task-form">
          <div className="avatar-group">
            <div className="avatar">ME</div>
          </div>
          <input type="text" placeholder="What needs to be done?" className="create-task-input" />
          <span className="task-tag todo">To-Do</span>
          <button className="task-action-btn purple">
            <i className="fa-solid fa-paperclip"></i>
          </button>
          <button className="task-action-btn orange">
            <i className="fa-solid fa-plus"></i>
          </button>
        </div>
      </div>
    </div>
  );
};
