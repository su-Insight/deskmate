// ============================================
// Sidebar Component
// ============================================

import React from 'react';
import './Sidebar.css';

interface SidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
  collapsed: boolean;
  onToggle: () => void;
}

const MENU_ITEMS = [
  { id: 'workspace', icon: 'fa-home', label: '工作台' },
  { id: 'files', icon: 'fa-folder', label: '文件管理' },
  { id: 'tasks', icon: 'fa-check-square', label: '任务管理' },
  { id: 'calendar', icon: 'fa-calendar-alt', label: '日历' },
  { id: 'ai', icon: 'fa-robot', label: 'AI 助手' },
  { id: 'settings', icon: 'fa-cog', label: '系统设置' },
];

export const Sidebar: React.FC<SidebarProps> = ({ activeView, onViewChange, collapsed, onToggle }) => {
  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <div className="logo">
          <i className="fas fa-robot"></i>
          {!collapsed && <span className="logo-text">DeskMate</span>}
        </div>
        <button className="toggle-btn" onClick={onToggle}>
          <i className={`fas ${collapsed ? 'fa-chevron-right' : 'fa-chevron-left'}`}></i>
        </button>
      </div>

      <nav className="sidebar-nav">
        {MENU_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${activeView === item.id ? 'active' : ''}`}
            onClick={() => onViewChange(item.id)}
            title={collapsed ? item.label : undefined}
          >
            <i className={`fas ${item.icon}`}></i>
            {!collapsed && <span>{item.label}</span>}
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        {!collapsed && (
          <div className="user-info">
            <div className="user-avatar">
              <i className="fas fa-user"></i>
            </div>
            <div className="user-details">
              <span className="user-name">DeskMate</span>
              <span className="user-status">在线</span>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;
