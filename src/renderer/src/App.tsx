import React, { useState, useEffect, useCallback, useRef } from 'react';

// 扩展 Window 接口以支持 deskmate
declare global {
  interface Window {
    deskmate: {
      version: string;
      platform: string;
      fs: {
        readDir: (path: string) => Promise<any[]>;
        selectFolder: () => Promise<string>;
        readFile: (path: string) => Promise<string>;
        writeFile: (path: string, content: string) => Promise<boolean>;
      };
      window: {
        minimize: () => void;
        maximize: () => void;
        close: () => void;
        isMaximized: () => Promise<boolean>;
        openConfig: () => Promise<{ success: boolean }>;
      };
      ai: {
        chat: (message: string, history?: any[]) => Promise<{ success: boolean; response: string; mode: string }>;
        setMode: (mode: string) => Promise<{ success: boolean; mode: string }>;
        getMode: () => Promise<string>;
        chatStream: (message: string, history?: any[]) => any;
        getConfig: () => Promise<{ success: boolean; config: Record<string, string>; categories: any[] }>;
        setConfig: (config: Record<string, unknown>) => Promise<{ success: boolean }>;
        updateConfig: (key: string, value: unknown) => Promise<{ success: boolean }>;
        resetConfig: () => Promise<{ success: boolean }>;
      };
      db: {
        query: <T = unknown>(sql: string, params?: unknown[]) => Promise<T[]>;
        execute: (sql: string, params?: unknown[]) => Promise<{ success: boolean; lastId?: number }>;
      };
      profile: {
        get: () => Promise<any>;
        set: (profile: any) => Promise<boolean>;
        update: <K extends keyof any>(key: K, value: any) => Promise<boolean>;
      };
      utils: {
        openExternal: (url: string) => Promise<boolean>;
        showItemInFolder: (path: string) => Promise<boolean>;
      };
      settings: {
        get: () => Promise<any>;
        set: (settings: any) => Promise<boolean>;
      };
      on: (channel: string, listener: (...args: any[]) => void) => void;
      off: (channel: string, listener?: (...args: any[]) => void) => void;
    };
  }
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Task {
  id: number;
  title: string;
  description?: string;
  status: 'todo' | 'progress' | 'done';
  date: string;
  avatars?: string[];
  comments?: number;
}

function App() {
  const [activeNav, setActiveNav] = useState('workspace');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [rightPanelWidth, setRightPanelWidth] = useState(340);
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(0);

  const api = (window as any).deskmate;

  useEffect(() => {
    api?.profile?.get?.();
  }, []);

  const handleSendMessage = useCallback(async () => {
    if (!inputMessage.trim() || isTyping) return;

    const userMsg: Message = { role: 'user', content: inputMessage };
    setMessages(prev => [...prev, userMsg]);
    setInputMessage('');
    setIsTyping(true);

    try {
      const response = await api?.ai?.chat?.(inputMessage, messages);
      if (response?.success) {
        setMessages(prev => [...prev, { role: 'assistant', content: response.response || '' }]);
      }
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: '抱歉，发生了错误。' }]);
    } finally {
      setIsTyping(false);
    }
  }, [inputMessage, isTyping, messages, api]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Resize handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (isRightPanelCollapsed) return;
    setIsDragging(true);
    startXRef.current = e.clientX;
    startWidthRef.current = rightPanelWidth;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    const diff = startXRef.current - e.clientX;
    // 增大最小宽度到320px，确保输入框和按钮有足够空间
    const newWidth = Math.min(Math.max(startWidthRef.current + diff, 320), 600);
    setRightPanelWidth(newWidth);
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  }, [isDragging]);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const navItems = [
    { id: 'workspace', icon: 'fa-th' },
    { id: 'files', icon: 'fa-folder' },
    { id: 'tasks', icon: 'fa-check-square' },
    { id: 'calendar', icon: 'fa-calendar' },
    { id: 'ai', icon: 'fa-robot' },
  ];

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <i className="fa-solid fa-layer-group"></i>
        </div>
        <nav className="sidebar-nav">
          {navItems.map(item => (
            <div
              key={item.id}
              className={`sidebar-item ${activeNav === item.id ? 'active' : ''}`}
              onClick={() => setActiveNav(item.id)}
            >
              <i className={`fa-solid ${item.icon}`}></i>
            </div>
          ))}
        </nav>
        <div className="sidebar-add">
          <i className="fa-solid fa-plus"></i>
        </div>
        <div
          className={`sidebar-item ${activeNav === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveNav('settings')}
          style={{ marginTop: 'auto' }}
        >
          <i className="fa-solid fa-cog"></i>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {activeNav === 'workspace' && <DashboardView />}
        {activeNav === 'files' && <FilesView />}
        {activeNav === 'tasks' && <TasksView />}
        {activeNav === 'calendar' && <CalendarView />}
        {activeNav === 'ai' && (
          <AIChatView
            messages={messages}
            inputMessage={inputMessage}
            isTyping={isTyping}
            onInputChange={setInputMessage}
            onSend={handleSendMessage}
            onKeyPress={handleKeyPress}
          />
        )}
        {activeNav === 'settings' && <SettingsView />}
      </main>

      {/* Right Panel */}
      <div
        ref={panelRef}
        style={{
          width: isRightPanelCollapsed ? 48 : rightPanelWidth,
          flexShrink: 0,
          background: 'var(--surface-white)',
          borderLeft: '1px solid rgba(0,0,0,0.06)',
          display: 'flex',
          flexDirection: 'column',
          transition: isDragging ? 'none' : 'width 0.2s ease',
          overflow: 'hidden',
          position: 'relative'
        }}
      >
        {/* Resize Handle */}
        {!isRightPanelCollapsed && (
          <div
            onMouseDown={handleMouseDown}
            className="resize-handle"
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: '8px',
              cursor: 'ew-resize',
              zIndex: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              transition: 'background 0.2s ease'
            }}
          >
            <div style={{
              width: '2px',
              height: '40px',
              background: 'rgba(0,0,0,0.15)',
              borderRadius: '1px'
            }}></div>
          </div>
        )}

        {/* Collapse/Expand Button - Inside Panel */}
        {!isRightPanelCollapsed ? (
          <>
            <CommunicationPanel messages={messages} onNavigate={setActiveNav} />
            <div
              onClick={() => setIsRightPanelCollapsed(true)}
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 20,
                cursor: 'pointer',
                width: '24px',
                height: '24px',
                borderRadius: '6px',
                background: 'rgba(0,0,0,0.04)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#9CA3AF',
                transition: 'all 0.2s ease'
              }}
              title="折叠 AI 对话"
            >
              <i className="fa-solid fa-chevron-right" style={{ fontSize: '10px' }}></i>
            </div>
          </>
        ) : (
          <div style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center'
          }}>
            {/* Robot Avatar */}
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #9D50BB, #6E48AA)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: '16px',
              boxShadow: '0 4px 12px rgba(157, 80, 187, 0.3)'
            }}>
              <i className="fa-solid fa-robot" style={{ fontSize: '16px', color: 'white' }}></i>
            </div>
            {/* Expand Button - Center */}
            <button
              onClick={() => setIsRightPanelCollapsed(false)}
              style={{
                position: 'absolute',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '28px',
                height: '28px',
                borderRadius: '8px',
                background: 'rgba(0,0,0,0.04)',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#9CA3AF',
                transition: 'all 0.2s ease'
              }}
              title="展开 AI 对话"
            >
              <i className="fa-solid fa-chevron-left" style={{ fontSize: '10px' }}></i>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function DashboardView() {
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
          <button className="icon-btn">
            <i className="fa-solid fa-search"></i>
          </button>
          <button className="icon-btn" style={{ position: 'relative' }}>
            <i className="fa-solid fa-bell"></i>
            <span className="badge">3</span>
          </button>
        </div>
      </header>

      {/* Stats Grid */}
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

      {/* Content Grid */}
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

      {/* Task Row */}
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

      {/* Create Task */}
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
}

function TaskCard({ title, description, date, status, avatars, comments }: Task) {
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
}

function FilesView() {
  return (
    <div>
      <header className="page-header">
        <div>
          <h1 className="page-title">Files</h1>
        </div>
      </header>
      <div className="card" style={{ padding: '60px', textAlign: 'center' }}>
        <i className="fa-solid fa-folder-open" style={{ fontSize: '48px', color: '#FF8E53', marginBottom: '16px' }}></i>
        <p className="text-secondary">File browser coming soon</p>
      </div>
    </div>
  );
}

function TasksView() {
  const tasks: Task[] = [
    { id: 1, title: 'Complete project documentation', status: 'todo', date: 'Today' },
    { id: 2, title: 'Code review', status: 'progress', date: 'Today' },
    { id: 3, title: 'Update dependencies', status: 'done', date: 'Yesterday' },
  ];

  return (
    <div>
      <header className="page-header">
        <div>
          <h1 className="page-title">Tasks</h1>
        </div>
      </header>
      <div className="card" style={{ padding: '16px' }}>
        {tasks.map(task => (
          <div key={task.id} className="flex items-center gap-3" style={{ padding: '12px', borderRadius: '12px', marginBottom: '4px', cursor: 'pointer' }}>
            <button style={{
              width: '22px', height: '22px', borderRadius: '50%', border: '2px solid #D1D5DB',
              background: task.status === 'done' ? '#10B981' : 'transparent',
              borderColor: task.status === 'done' ? '#10B981' : '#D1D5DB',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
            }}>
              {task.status === 'done' && <i className="fa-solid fa-check" style={{ color: 'white', fontSize: '10px' }}></i>}
            </button>
            <span style={{ flex: 1, textDecoration: task.status === 'done' ? 'line-through' : 'none', color: task.status === 'done' ? '#9CA3AF' : '#1F2937' }}>{task.title}</span>
            <span className={`task-tag ${task.status === 'todo' ? 'todo' : task.status === 'progress' ? 'progress' : 'done'}`}>
              {task.status === 'todo' ? 'To-Do' : task.status === 'progress' ? 'Progress' : 'Done'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CalendarView() {
  const today = new Date();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).getDay();
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div>
      <header className="page-header">
        <h1 className="page-title">{today.getFullYear()} {today.toLocaleString('default', { month: 'long' })}</h1>
        <div className="header-actions">
          <button className="icon-btn"><i className="fa-solid fa-chevron-left"></i></button>
          <button className="icon-btn"><i className="fa-solid fa-chevron-right"></i></button>
        </div>
      </header>
      <div className="card" style={{ padding: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '12px' }}>
          {days.map(day => <div key={day} style={{ textAlign: 'center', fontSize: '12px', color: '#6B7280', padding: '8px' }}>{day}</div>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
          {Array(firstDay).fill(null).map((_, i) => <div key={`empty-${i}`} style={{ padding: '8px' }}></div>)}
          {Array(daysInMonth).fill(null).map((_, i) => {
            const day = i + 1;
            const isToday = day === today.getDate();
            return (
              <button key={day} style={{
                padding: '10px', borderRadius: '10px', textAlign: 'center',
                background: isToday ? 'linear-gradient(135deg, #FF8E53, #FF6A00)' : 'transparent',
                color: isToday ? 'white' : '#1F2937',
                cursor: 'pointer', border: 'none', fontSize: '13px',
                boxShadow: isToday ? '0 4px 12px rgba(255, 142, 83, 0.3)' : 'none'
              }}>
                {day}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AIChatView({ messages, inputMessage, isTyping, onInputChange, onSend, onKeyPress }: any) {
  // 解析结构化错误信息
  const parseError = (response: string): { isError: boolean; shortMsg: string; detailMsg: string } => {
    if (response.startsWith('__ERROR__|')) {
      const parts = response.split('|');
      return {
        isError: true,
        shortMsg: parts[1] || '连接失败',
        detailMsg: parts.slice(2).join('|') || '未知错误'
      };
    }
    return { isError: false, shortMsg: '', detailMsg: '' };
  };

  // 渲染错误消息气泡（简洁版：标题+小字）
  const renderErrorBubble = (content: string) => {
    const errorInfo = parseError(content);
    if (!errorInfo.isError) return content;

    return (
      <div
        style={{
          padding: '10px 14px',
          background: 'rgba(239, 68, 68, 0.08)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          borderRadius: '14px',
          borderBottomLeftRadius: '4px',
          fontSize: '13px',
          color: '#DC2626',
          lineHeight: 1.5,
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
          <i className="fa-solid fa-exclamation-circle" style={{ fontSize: '12px' }}></i>
          <span style={{ fontWeight: 500 }}>{errorInfo.shortMsg}</span>
        </div>
        <div style={{ fontSize: '11px', color: '#B91C1B', marginTop: '2px' }}>
          {errorInfo.detailMsg}
        </div>
      </div>
    );
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <header className="page-header">
        <div>
          <h1 className="page-title">AI Assistant</h1>
          <p className="page-subtitle">Your intelligent workspace companion</p>
        </div>
        <button className="task-tag todo">
          <i className="fa-solid fa-wand-magic-sparkles mr-2"></i>New Chat
        </button>
      </header>
      <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
          {messages.length === 0 ? (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
              <div style={{ width: '70px', height: '70px', borderRadius: '20px', background: 'linear-gradient(135deg, #9D50BB, #6E48AA)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px', boxShadow: '0 4px 20px rgba(157, 80, 187, 0.3)' }}>
                <i className="fa-solid fa-robot" style={{ fontSize: '28px', color: 'white' }}></i>
              </div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>How can I help you today?</h3>
              <p className="text-secondary">Ask me anything about your projects or tasks</p>
            </div>
          ) : (
            messages.map((msg: Message, i: number) => (
              <div key={i} className={`chat-message ${msg.role === 'user' ? 'user' : ''}`}>
                <div className="chat-avatar" style={{ background: msg.role === 'user' ? 'linear-gradient(135deg, #FF8E53, #FF6A00)' : 'linear-gradient(135deg, #9D50BB, #6E48AA)' }}>
                  <i className={`fa-solid ${msg.role === 'user' ? 'fa-user' : 'fa-robot'}`} style={{ fontSize: '11px' }}></i>
                </div>
                <div className={`chat-bubble ${msg.role === 'user' ? 'mine' : 'other'}`}>
                  {msg.role === 'assistant' && (msg.content.startsWith('__ERROR__|') ? (
                    renderErrorBubble(msg.content)
                  ) : (
                    msg.content
                  ))}
                  {msg.role === 'user' && msg.content}
                </div>
              </div>
            ))
          )}
          {isTyping && (
            <div className="chat-message">
              <div className="chat-avatar" style={{ background: 'linear-gradient(135deg, #9D50BB, #6E48AA)' }}>
                <i className="fa-solid fa-robot" style={{ fontSize: '11px' }}></i>
              </div>
              <div className="chat-bubble other">
                <div className="typing-indicator">
                  <span className="typing-dot"></span>
                  <span className="typing-dot"></span>
                  <span className="typing-dot"></span>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="chat-input-area">
          <div className="chat-input-row">
            <button className="chat-mic-btn"><i className="fa-solid fa-microphone"></i></button>
            <input
              type="text"
              className="chat-input"
              placeholder="Type a message..."
              value={inputMessage}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyPress={onKeyPress}
            />
            <button className="chat-send-btn" onClick={onSend} disabled={!inputMessage.trim() || isTyping}>
              <i className="fa-solid fa-paper-plane" style={{ fontSize: '12px' }}></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsView() {
  const [activeTab, setActiveTab] = useState('provider-hub');
  const [showApiConfig, setShowApiConfig] = useState(false); // 控制API配置内容显示
  const [selectedProvider, setSelectedProvider] = useState('openai');
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [modelName, setModelName] = useState('');
  const [thinkingModel, setThinkingModel] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(4096);
  const [topP, setTopP] = useState(0.9);
  const [userName, setUserName] = useState('User');
  const [userRole, setUserRole] = useState('Software Engineer');
  const [responseStyle, setResponseStyle] = useState('medium');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error' | 'testing'>('idle');
  const [saveErrorMsg, setSaveErrorMsg] = useState<string>('');
  const [configName, setConfigName] = useState('');
  const [configRemark, setConfigRemark] = useState('');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [historyContext, setHistoryContext] = useState(true);
  const [speedTestResults, setSpeedTestResults] = useState<Record<string, { time: string; color: string }>>({});
  const [speedTesting, setSpeedTesting] = useState<Set<string>>(new Set());

  // 动态获取 deskmate API
  const getDeskmateApi = () => {
    const deskmateApi = (window as any).deskmate;
    if (!deskmateApi) {
      showToast('[API] window.deskmate is undefined!');
      console.error('[API] window.deskmate is undefined!');
    }
    return deskmateApi;
  };

  // 便捷方法获取 API
  const api = getDeskmateApi();
  const dragItemRef = useRef<number | null>(null);
  const dragOverItemRef = useRef<number | null>(null);

  // 模型配置列表 - 可拖动排序（从 localStorage 加载）
  const [modelConfigs, setModelConfigs] = useState(() => {
    const saved = localStorage.getItem('deskmate_modelConfigs');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return [
          { id: '1', name: 'GPT-4o Main', remark: '', provider: 'openai', model: 'gpt-4o', baseUrl: 'https://api.openai.com/v1', temperature: 0.7, enabled: true },
          { id: '2', name: 'GPT-4o Mini', remark: '', provider: 'openai', model: 'gpt-4o-mini', baseUrl: 'https://api.openai.com/v1', temperature: 0.5, enabled: false },
          { id: '3', name: 'DeepSeek Code', remark: '', provider: 'deepseek', model: 'deepseek-coder', baseUrl: 'https://api.deepseek.com/v1', temperature: 0.8, enabled: false },
        ];
      }
    }
    return [
      { id: '1', name: 'GPT-4o Main', remark: '', provider: 'openai', model: 'gpt-4o', baseUrl: 'https://api.openai.com/v1', temperature: 0.7, enabled: true },
      { id: '2', name: 'GPT-4o Mini', remark: '', provider: 'openai', model: 'gpt-4o-mini', baseUrl: 'https://api.openai.com/v1', temperature: 0.5, enabled: false },
      { id: '3', name: 'DeepSeek Code', remark: '', provider: 'deepseek', model: 'deepseek-coder', baseUrl: 'https://api.deepseek.com/v1', temperature: 0.8, enabled: false },
    ];
  });

  // 保存 modelConfigs 到 localStorage
  useEffect(() => {
    localStorage.setItem('deskmate_modelConfigs', JSON.stringify(modelConfigs));
  }, [modelConfigs]);

  // API Key 获取链接
  const getApiKeyUrl = () => {
    const urls: Record<string, string> = {
      openai: 'https://platform.openai.com/api-keys',
      deepseek: 'https://platform.deepseek.com/api-keys',
      zhipu: 'https://open.bigmodel.cn/usercenter/apikeys',
      minimax: 'https://api.minimax.chat/user-center/basic-information',
      kimi: 'https://platform.moonshot.cn/console/api-keys',
      nvidia: 'https://build.nvidia.com/',
      gemini: 'https://aistudio.google.com/app/apikey',
      anthropic: 'https://console.anthropic.com/',
    };
    return urls[selectedProvider] || '';
  };

  // AI 厂商配置
  const providers = [
    { id: 'openai', name: 'OpenAI', icon: 'fa-brain', color: '#10A37F', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'], defaultUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o', websiteUrl: 'https://openai.com' },
    { id: 'deepseek', name: 'DeepSeek', icon: 'fa-bolt', color: '#0050EF', models: ['deepseek-chat', 'deepseek-coder'], defaultUrl: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat', websiteUrl: 'https://www.deepseek.com' },
    { id: 'zhipu', name: '智谱 GLM', icon: 'fa-robot', color: '#4267FF', models: ['glm-4', 'glm-4-plus', 'glm-4v', 'glm-3-turbo'], defaultUrl: 'https://open.bigmodel.cn/api/paas/v4', defaultModel: 'glm-4', websiteUrl: 'https://www.bigmodel.cn' },
    { id: 'minimax', name: 'MiniMax', icon: 'fa-microchip', color: '#6C5CE7', models: ['M2-her', 'abab6.5s-chat', 'abab6.5-chat'], defaultUrl: 'https://api.minimax.chat/v1', defaultModel: 'M2-her', websiteUrl: 'https://www.minimaxi.com' },
    { id: 'kimi', name: 'Kimi', icon: 'fa-moon', color: '#3B82F6', models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'], defaultUrl: 'https://api.moonshot.cn/v1', defaultModel: 'moonshot-v1-8k', websiteUrl: 'https://www.moonshot.cn' },
    { id: 'nvidia', name: 'NVIDIA', icon: 'fa-server', color: '#76B900', models: ['nvidia/llama-3.1-nemotron-70b-instruct', 'nvidia/llama-3.1-nemotron-80b-instruct'], defaultUrl: 'https://integrate.api.nvidia.com/v1', defaultModel: 'nvidia/llama-3.1-nemotron-70b-instruct', websiteUrl: 'https://www.nvidia.com' },
    { id: 'gemini', name: 'Google Gemini', icon: 'fa-google', color: '#4285F4', models: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.0-pro'], defaultUrl: 'https://generativelanguage.googleapis.com/v1beta', defaultModel: 'gemini-1.5-flash', websiteUrl: 'https://gemini.google.com' },
    { id: 'anthropic', name: 'Claude', icon: 'fa-comments', color: '#D97757', models: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'], defaultUrl: 'https://api.anthropic.com/v1', defaultModel: 'claude-3-5-sonnet-20241022', websiteUrl: 'https://www.anthropic.com' },
    { id: 'custom', name: '自定义', icon: 'fa-cog', color: '#6B7280', models: [], defaultUrl: '', defaultModel: '', websiteUrl: '' },
  ];

  // Tab 配置 - API配置默认隐藏，通过新建配置按钮访问
  const tabs = [
    { id: 'provider-hub', name: 'Provider Hub', icon: 'fa-server' },
    { id: 'model-config', name: '模型配置', icon: 'fa-sliders-h' },
    { id: 'profile', name: '用户画像', icon: 'fa-user' },
  ];

  // 拖动排序处理
  const handleDragStart = (index: number) => {
    dragItemRef.current = index;
  };

  const handleDragEnter = (index: number) => {
    dragOverItemRef.current = index;
  };

  const handleDragEnd = () => {
    if (dragItemRef.current !== null && dragOverItemRef.current !== null && dragItemRef.current !== dragOverItemRef.current) {
      const newConfigs = [...modelConfigs];
      const draggedItem = newConfigs[dragItemRef.current];
      newConfigs.splice(dragItemRef.current, 1);
      newConfigs.splice(dragOverItemRef.current, 0, draggedItem);
      setModelConfigs(newConfigs);
    }
    dragItemRef.current = null;
    dragOverItemRef.current = null;
  };

  // 测速功能
  const handleSpeedTest = async (configId: string) => {
    setSpeedTesting(prev => new Set(prev).add(configId));
    // 模拟测速
    await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 1000));

    // 模拟结果：80%成功，20%失败
    const isSuccess = Math.random() > 0.2;

    if (isSuccess) {
      const times = ['<50ms', '120ms', '89ms', '210ms', '67ms', '340ms', '95ms', '156ms'];
      const colors = ['#10B981', '#10B981', '#10B981', '#F59E0B', '#10B981', '#F59E0B', '#10B981', '#F59E0B'];
      const randomIndex = Math.floor(Math.random() * times.length);
      setSpeedTestResults(prev => ({
        ...prev,
        [configId]: { time: times[randomIndex], color: colors[randomIndex] }
      }));
    } else {
      // 失败情况
      const errors = [
        { time: '连接失败', color: '#EF4444' },
        { time: '401 Unauthorized', color: '#EF4444' },
        { time: '404 Not Found', color: '#EF4444' },
        { time: '500 Server Error', color: '#EF4444' },
        { time: '超时', color: '#EF4444' },
      ];
      const randomError = errors[Math.floor(Math.random() * errors.length)];
      setSpeedTestResults(prev => ({
        ...prev,
        [configId]: randomError
      }));
    }

    setSpeedTesting(prev => {
      const newSet = new Set(prev);
      newSet.delete(configId);
      return newSet;
    });
  };

  // 全部测速 - 并发执行，每批5个
  const handleSpeedTestAll = async () => {
    // 清除所有现有结果
    setSpeedTestResults({});
    // 标记所有配置为测试中
    const allIds = modelConfigs.map(c => c.id);
    setSpeedTesting(new Set(allIds));

    const configs = [...modelConfigs];
    const batchSize = 5;

    for (let i = 0; i < configs.length; i += batchSize) {
      const batch = configs.slice(i, i + batchSize);
      await Promise.all(batch.map(config => handleSpeedTest(config.id)));
    }
  };

  // 快速测试连通性
  const handleQuickTest = async () => {
    if (!apiKey.trim()) {
      showToast('请先输入 API Key', 'error');
      return;
    }

    setSaveStatus('testing');
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 500));

    const success = Math.random() > 0.2; // 模拟80%成功率
    if (success) {
      showToast('连接成功', 'success');
    } else {
      showToast('连接失败，请检查 API Key 和网络', 'error');
    }
    setTimeout(() => setSaveStatus('idle'), 2000);
  };

  // 启用开关 - 独占模式（只能开启一个）
  const handleToggleEnable = (index: number) => {
    const newConfigs = [...modelConfigs];
    if (!newConfigs[index].enabled) {
      // 如果要启用当前配置，先禁用其他所有配置
      newConfigs.forEach((c, i) => {
        if (i !== index) c.enabled = false;
      });
    }
    newConfigs[index].enabled = !newConfigs[index].enabled;
    setModelConfigs(newConfigs);
  };

  // 选择厂商时自动填充默认配置
  const handleProviderSelect = (providerId: string) => {
    setSelectedProvider(providerId);
    const provider = providers.find(p => p.id === providerId);
    if (provider && provider.id !== 'custom') {
      setBaseUrl(provider.defaultUrl || '');
      setModelName(provider.defaultModel);
    }
  };

  // 检查配置名称是否重复
  const isConfigNameExists = (name: string, excludeId?: string): boolean => {
    return modelConfigs.some(c => c.name === name && c.id !== excludeId);
  };

  // Toast 提示
  const showToast = (msg: string, type: 'success' | 'error' = 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2000);
  };

  // 复制配置 - 检查30字符限制
  const handleCopyConfig = (configId: string) => {
    const config = modelConfigs.find(c => c.id === configId);
    if (config) {
      // 生成唯一的-copy名称
      let baseName = config.name;
      if (baseName.length >= 28) {
        baseName = baseName.slice(0, 25);
      }
      let copyName = `${baseName}-copy`;
      let counter = 1;
      while (isConfigNameExists(copyName)) {
        copyName = `${baseName}-copy-${counter}`;
        counter++;
        if (copyName.length > 30) {
          copyName = `${baseName}-${counter}`;
        }
      }

      const newConfig = {
        ...config,
        id: Date.now().toString(),
        name: copyName,
        enabled: false
      };
      setModelConfigs(prev => [...prev, newConfig]);
      showToast('复制成功', 'success');
    }
  };

  // 新建配置 - 显示 API 配置内容
  const handleNewConfig = () => {
    setEditingProvider(null);
    setConfigName('');
    setConfigRemark('');
    setApiKey('');
    setThinkingModel('');
    // 使用当前选中的 provider 默认值预填
    const provider = providers.find(p => p.id === selectedProvider);
    setBaseUrl(provider?.defaultUrl || '');
    setModelName(provider?.defaultModel || '');
    setTemperature(0.7);
    setTopP(0.9);
    setMaxTokens(4096);
    setShowApiConfig(true);
    setActiveTab('provider-hub');
  };

  // 编辑配置 - 显示 API 配置内容
  const handleEditConfig = async (configId: string) => {
    const config = modelConfigs.find(c => c.id === configId);
    console.log('[Edit] 编辑配置, configId:', configId);
    console.log('[Edit] 找到的配置:', JSON.stringify(config, null, 2));
    if (config) {
      setEditingProvider(configId);
      setConfigName(config.name);
      setApiKey(config.apiKey || '');
      console.log('[Edit] 设置 apiKey:', config.apiKey ? '***已填充***' : '***为空***');
      setConfigRemark(config.remark || '');
      setSelectedProvider(config.provider);
      setBaseUrl(config.baseUrl || '');
      setModelName(config.model || '');
      setThinkingModel(config.thinkingModel || '');
      setTemperature(config.temperature || 0.7);
    }
    setShowApiConfig(true);
    setActiveTab('provider-hub');
  };

  // 返回 Provider Hub
  const handleBackToHub = () => {
    setShowApiConfig(false);
  };

  // 保存模型配置到列表
  const handleSaveModelConfig = async () => {
    if (!apiKey.trim()) {
      showToast('请先输入 API Key', 'error');
      return;
    }

    // 验证配置名称
    if (!configName.trim()) {
      showToast('请输入配置名称', 'error');
      return;
    }

    if (configName.length > 30) {
      showToast('配置名称不能超过30个字符', 'error');
      return;
    }

    setSaveStatus('saving');

    try {
      // 保存配置到数据库
      console.log('[Save] Preparing to save config...');
      console.log('[Save] apiKey 长度:', apiKey.length);
      console.log('[Save] apiKey 前5位:', apiKey.substring(0, 5));

      let saveSuccess = false;
      let errorMessage = '';

      if (api?.ai?.setConfig) {
        console.log('[Save] Trying api?.ai?.setConfig...');
        try {
          const saveData = {
            config_name: configName,
            provider: selectedProvider,
            api_key: apiKey,
            base_url: baseUrl,
            model_name: modelName,
            thinking_model: thinkingModel,
            system_prompt: 'You are DeskMate, a helpful AI assistant.',
            mode: 'private',
            stream_enabled: 'true'
          };
          console.log('[Save] 发送数据:', JSON.stringify(saveData).substring(0, 200));
          const aiResult = await api.ai.setConfig(saveData);
          console.log('[Save] AI config result:', aiResult);
          if (aiResult?.success) {
            saveSuccess = true;
          } else {
            errorMessage = aiResult?.error || '未知错误';
            console.log('[Save] Backend returned error:', errorMessage);
          }
        } catch (err: any) {
          console.error('[Save] API call failed:', err);
          errorMessage = err?.message || String(err);
        }
      } else {
        errorMessage = 'API 不可用 (window.deskmate 未加载)';
        console.error('[Save] api.ai.setConfig is undefined');
      }

      if (!saveSuccess) {
        showToast(`保存失败: ${errorMessage || '后端无响应'}`, 'error');
        setSaveStatus('idle');
        return;
      }

      // 更新前端列表
      if (editingProvider) {
        setModelConfigs(prev => prev.map(c =>
          c.id === editingProvider
            ? { ...c, name: configName, remark: configRemark, provider: selectedProvider, model: modelName, baseUrl: baseUrl, thinkingModel: thinkingModel, apiKey: apiKey }
            : c
        ));
      } else {
        const newConfig = {
          id: Date.now().toString(),
          name: configName,
          remark: configRemark,
          provider: selectedProvider,
          model: modelName,
          baseUrl: baseUrl,
          thinkingModel: thinkingModel,
          apiKey: apiKey,
          temperature: 0.7,
          enabled: false
        };
        setModelConfigs(prev => [...prev, newConfig]);
      }

      setSaveStatus('success');
      showToast('保存成功', 'success');
      setShowApiConfig(false);
    } catch (error) {
      console.error('保存配置失败:', error);
      showToast('保存失败: ' + (error instanceof Error ? error.message : '未知错误'), 'error');
    } finally {
      setTimeout(() => setSaveStatus('idle'), 2000);
    }
  };

  // 加载配置
  useEffect(() => {
    async function loadConfig() {
      const settings = await api?.settings?.get?.();
      const profile = await api?.profile?.get?.();
      if (settings) {
        // 注意：后端返回的是 api_key（snake_case）
        setApiKey(settings.apiKey || settings.api_key || '');
        setSelectedProvider(settings.provider || 'openai');
        setBaseUrl(settings.baseUrl || settings.base_url || '');
        setModelName(settings.modelName || settings.model_name || '');
        setThinkingModel(settings.thinkingModel || settings.thinking_model || '');
        setTemperature(settings.temperature ?? 0.7);
        setMaxTokens(settings.maxTokens ?? 4096);
        setTopP(settings.topP ?? 0.9);
      }
      if (profile) {
        setUserName(profile.identity?.name || 'User');
        setUserRole(profile.identity?.role || 'Software Engineer');
        setResponseStyle(profile.preferences?.response_conciseness || 'medium');
      }
    }
    loadConfig();
  }, [api]);

  // 保存用户设置
  const handleSaveProfile = async () => {
    setSaveStatus('saving');
    try {
      await api?.profile?.set?.({
        identity: { name: userName, role: userRole, years_experience: 0 },
        preferences: { language: 'zh-CN', code_style: 'TypeScript', response_conciseness: responseStyle }
      });
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (e) {
      setSaveStatus('error');
    }
  };

  return (
    <div>
      <header className="page-header">
        <h1 className="page-title">
          <i className="fa-solid fa-cog" style={{ marginRight: '8px', color: '#9D50BB' }}></i>
          Settings
        </h1>
      </header>

      <div style={{ display: 'flex', gap: '20px' }}>
        {/* 左侧 Tab 导航 */}
        <div style={{ width: '160px', flexShrink: 0 }}>
          <div className="card" style={{ padding: '8px' }}>
            {tabs.map(tab => (
              <div
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  background: activeTab === tab.id ? 'rgba(157, 80, 187, 0.1)' : 'transparent',
                  color: activeTab === tab.id ? '#6E48AA' : '#6B7280',
                  marginBottom: '4px',
                  transition: 'all 0.2s',
                  fontSize: '13px'
                }}
              >
                <i className={`fa-solid ${tab.icon}`} style={{ width: '16px' }}></i>
                <span style={{ fontWeight: activeTab === tab.id ? 500 : 400 }}>{tab.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 右侧内容 */}
        <div style={{ flex: 1 }}>
          {/* Provider Hub Tab - 多行模型配置卡片 */}
          {activeTab === 'provider-hub' && !showApiConfig && (
            <div className="card" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="fa-solid fa-server" style={{ color: '#9D50BB' }}></i>
                  Provider Hub
                </h3>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={handleSpeedTestAll}
                    style={{
                      padding: '8px 16px',
                      background: 'transparent',
                      border: '1px solid rgba(0,0,0,0.1)',
                      borderRadius: '8px',
                      color: '#6B7280',
                      fontSize: '12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <i className="fa-solid fa-bolt"></i>
                    全部测速
                  </button>
                  <button
                    onClick={handleNewConfig}
                    style={{
                      padding: '8px 16px',
                      background: 'linear-gradient(135deg, #9D50BB, #6E48AA)',
                      border: 'none',
                      borderRadius: '8px',
                      color: 'white',
                      fontSize: '12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <i className="fa-solid fa-plus"></i>
                    新建配置
                  </button>
                </div>
              </div>

              {/* 模型配置列表 - 类似CC Switch */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {modelConfigs.map((config, index) => {
                  const provider = providers.find(p => p.id === config.provider);
                  const speedResult = speedTestResults[config.id];
                  const isSpeedTesting = speedTesting.has(config.id);
                  return (
                    <div
                      key={config.id}
                      draggable
                      onDragStart={() => handleDragStart(index)}
                      onDragEnter={() => handleDragEnter(index)}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => e.preventDefault()}
                      style={{
                        padding: '16px',
                        background: config.enabled ? 'rgba(157, 80, 187, 0.05)' : 'rgba(0,0,0,0.02)',
                        border: `2px solid ${config.enabled ? '#9D50BB' : 'rgba(0,0,0,0.08)'}`,
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '16px',
                        cursor: 'grab',
                        transition: 'all 0.2s',
                        opacity: dragItemRef.current === index ? 0.5 : 1
                      }}
                    >
                      {/* 拖动手柄 */}
                      <div style={{ color: '#9CA3AF', cursor: 'grab' }}>
                        <i className="fa-solid fa-grip-vertical"></i>
                      </div>

                      {/* 启用开关 - 独占模式 */}
                      <div
                        onClick={() => handleToggleEnable(index)}
                        style={{
                          width: '44px',
                          height: '24px',
                          borderRadius: '12px',
                          background: config.enabled ? '#9D50BB' : 'rgba(0,0,0,0.1)',
                          position: 'relative',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                      >
                        <div style={{
                          width: '20px',
                          height: '20px',
                          borderRadius: '10px',
                          background: 'white',
                          position: 'absolute',
                          top: '2px',
                          left: config.enabled ? '22px' : '2px',
                          transition: 'all 0.2s',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                        }}></div>
                      </div>

                      {/* 模型信息 */}
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <span style={{ fontSize: '14px', fontWeight: 500 }}>{config.name}</span>
                          <span style={{
                            padding: '2px 8px',
                            background: provider?.color || '#6B7280',
                            color: 'white',
                            borderRadius: '4px',
                            fontSize: '10px'
                          }}>
                            {provider?.name}
                          </span>
                        </div>
                        <div style={{ fontSize: '12px', color: '#9CA3AF' }}>
                          {config.model}
                        </div>
                        {config.remark && (
                          <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '2px', fontStyle: 'italic' }}>
                            {config.remark}
                          </div>
                        )}
                      </div>

                      {/* 测速结果 */}
                      {speedResult && !isSpeedTesting && (
                        <div style={{
                          padding: '4px 10px',
                          background: `${speedResult.color}15`,
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 500,
                          color: speedResult.color
                        }}>
                          <i className="fa-solid fa-bolt" style={{ marginRight: '4px' }}></i>
                          {speedResult.time}
                        </div>
                      )}

                      {/* 操作按钮 */}
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => handleSpeedTest(config.id)}
                          disabled={isSpeedTesting}
                          style={{
                            padding: '8px',
                            background: 'transparent',
                            border: '1px solid rgba(0,0,0,0.1)',
                            borderRadius: '8px',
                            cursor: isSpeedTesting ? 'not-allowed' : 'pointer',
                            color: isSpeedTesting ? '#9CA3AF' : '#6B7280'
                          }}
                          title="测速"
                        >
                          {isSpeedTesting ? (
                            <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '12px' }}></i>
                          ) : (
                            <i className="fa-solid fa-bolt" style={{ fontSize: '12px' }}></i>
                          )}
                        </button>
                        <button
                          onClick={() => handleCopyConfig(config.id)}
                          style={{
                            padding: '8px',
                            background: 'transparent',
                            border: '1px solid rgba(0,0,0,0.1)',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            color: '#6B7280'
                          }}
                          title="复制"
                        >
                          <i className="fa-solid fa-copy"></i>
                        </button>
                        <button
                          onClick={() => handleEditConfig(config.id)}
                          style={{
                            padding: '8px',
                            background: 'transparent',
                            border: '1px solid rgba(0,0,0,0.1)',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            color: '#6B7280'
                          }}
                          title="编辑"
                        >
                          <i className="fa-solid fa-pencil"></i>
                        </button>
                        <button
                          onClick={() => {
                            const newConfigs = modelConfigs.filter(c => c.id !== config.id);
                            setModelConfigs(newConfigs);
                          }}
                          style={{
                            padding: '8px',
                            background: 'transparent',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            color: '#EF4444'
                          }}
                          title="删除"
                        >
                          <i className="fa-solid fa-trash"></i>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 提示 */}
              <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(157, 80, 187, 0.05)', borderRadius: '8px', fontSize: '12px', color: '#6B7280', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="fa-solid fa-info-circle" style={{ color: '#9D50BB' }}></i>
                点击"新建配置"添加新的模型配置，支持拖动排序调整优先级
              </div>
            </div>
          )}

          {/* API 配置内容 - 通过新建/编辑按钮显示 */}
          {activeTab === 'provider-hub' && showApiConfig && (
            <div className="card" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                <button
                  onClick={handleBackToHub}
                  style={{
                    padding: '8px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    color: '#6B7280'
                  }}
                  title="返回"
                >
                  <i className="fa-solid fa-arrow-left" style={{ fontSize: '14px' }}></i>
                </button>
                <h3 style={{ fontSize: '15px', fontWeight: 600 }}>
                  <i className="fa-solid fa-key" style={{ marginRight: '8px', color: '#9D50BB' }}></i>
                  {editingProvider ? '编辑配置' : '新建配置'}
                </h3>
              </div>

              {/* 厂商选择网格 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '24px' }}>
                {providers.map(provider => (
                  <div
                    key={provider.id}
                    onClick={() => handleProviderSelect(provider.id)}
                    style={{
                      padding: '10px',
                      border: `2px solid ${selectedProvider === provider.id ? provider.color : 'rgba(0,0,0,0.08)'}`,
                      borderRadius: '10px',
                      cursor: 'pointer',
                      background: selectedProvider === provider.id ? `${provider.color}10` : 'transparent',
                      transition: 'all 0.2s',
                      textAlign: 'center',
                      minHeight: '78px'
                    }}
                  >
                    <div style={{ width: '26px', height: '26px', borderRadius: '6px', background: provider.color, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 4px' }}>
                      <i className={`fa-solid ${provider.icon}`} style={{ color: 'white', fontSize: '11px' }}></i>
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: 500 }}>{provider.name}</span>
                    <div style={{ height: '14px', marginTop: '2px' }}>
                      {selectedProvider === provider.id && (
                        <i className="fa-solid fa-check-circle" style={{ color: provider.color, fontSize: '10px' }}></i>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* API 配置表单 */}
              <div style={{ padding: '20px', background: 'rgba(0,0,0,0.02)', borderRadius: '12px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="fa-solid fa-cog" style={{ color: '#9D50BB' }}></i>
                  API 配置 - {providers.find(p => p.id === selectedProvider)?.name}
                </h4>

                {/* 第一行：配置名称 + 官网地址 */}
                <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                  {/* 配置名称 - 左边 */}
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '11px', color: '#6B7280', marginBottom: '6px' }}>
                      配置名称 <span style={{ color: '#EF4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={configName}
                      onChange={(e) => setConfigName(e.target.value.slice(0, 30))}
                      placeholder="请输入配置名称（最多30个字符）"
                      maxLength={30}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: '1px solid rgba(0,0,0,0.1)',
                        borderRadius: '8px',
                        fontSize: '13px',
                        outline: 'none'
                      }}
                    />
                    <div style={{ fontSize: '10px', color: '#9CA3AF', marginTop: '4px', textAlign: 'right' }}>
                      {configName.length}/30
                    </div>
                  </div>

                  {/* 官网地址 - 右边 */}
                  {providers.find(p => p.id === selectedProvider)?.websiteUrl && (
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', fontSize: '11px', color: '#6B7280', marginBottom: '6px' }}>官网</label>
                      <input
                        type="text"
                        value={providers.find(p => p.id === selectedProvider)?.websiteUrl || ''}
                        disabled
                        readOnly
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          border: '1px dashed rgba(0,0,0,0.2)',
                          borderRadius: '8px',
                          fontSize: '13px',
                          outline: 'none',
                          background: 'rgba(0,0,0,0.02)',
                          color: '#6B7280'
                        }}
                      />
                    </div>
                  )}
                </div>

                {/* API Key - 单独一行 */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', fontSize: '11px', color: '#6B7280', marginBottom: '6px' }}>
                    <span>API Key <span style={{ color: '#EF4444' }}>*</span></span>
                    {selectedProvider !== 'custom' && getApiKeyUrl() && (
                      <a
                        href={getApiKeyUrl()}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ marginLeft: '12px', color: '#9D50BB', fontSize: '11px', textDecoration: 'none' }}
                      >
                        <i className="fa-solid fa-external-link-alt" style={{ marginRight: '4px' }}></i>
                        获取 API Key
                      </a>
                    )}
                  </label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-..."
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid rgba(0,0,0,0.1)',
                      borderRadius: '8px',
                      fontSize: '13px',
                      outline: 'none'
                    }}
                  />
                </div>

                {/* 模型名称 - 第二行 */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#6B7280', marginBottom: '6px' }}>模型名称</label>
                    <input
                      type="text"
                      value={modelName}
                      onChange={(e) => setModelName(e.target.value)}
                      placeholder="输入模型名称"
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: '1px solid rgba(0,0,0,0.1)',
                        borderRadius: '8px',
                        fontSize: '13px',
                        outline: 'none'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#6B7280', marginBottom: '6px' }}>Think 模型</label>
                    <input
                      type="text"
                      value={thinkingModel}
                      onChange={(e) => setThinkingModel(e.target.value)}
                      placeholder="思考模型（可选）"
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: '1px solid rgba(0,0,0,0.1)',
                        borderRadius: '8px',
                        fontSize: '13px',
                        outline: 'none',
                        background: '#F9FAFB'
                      }}
                    />
                  </div>
                </div>

                {/* Base URL - 第三行 */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '11px', color: '#6B7280', marginBottom: '6px' }}>Base URL</label>
                  <input
                    type="text"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="https://api.xxx.com/v1"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid rgba(0,0,0,0.1)',
                      borderRadius: '8px',
                      fontSize: '13px',
                      outline: 'none'
                    }}
                  />
                </div>

                {/* 备注 */}
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#6B7280', marginBottom: '6px' }}>备注</label>
                  <input
                    type="text"
                    value={configRemark}
                    onChange={(e) => setConfigRemark(e.target.value)}
                    placeholder="添加备注（可选）"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid rgba(0,0,0,0.1)',
                      borderRadius: '8px',
                      fontSize: '13px',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              {/* 保存按钮 */}
              <div style={{ marginTop: '20px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  onClick={handleQuickTest}
                  disabled={saveStatus === 'saving' || saveStatus === 'testing'}
                  style={{
                    padding: '12px 24px',
                    background: saveStatus === 'testing' ? '#F59E0B' : 'linear-gradient(135deg, #10B981, #059669)',
                    border: 'none',
                    borderRadius: '10px',
                    color: 'white',
                    fontSize: '14px',
                    fontWeight: 500,
                    cursor: saveStatus === 'saving' || saveStatus === 'testing' ? 'not-allowed' : 'pointer',
                    opacity: saveStatus === 'saving' || saveStatus === 'testing' ? 0.7 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  {saveStatus === 'testing' ? (
                    <><i className="fa-solid fa-spinner fa-spin"></i> 测试中...</>
                  ) : (
                    <><i className="fa-solid fa-plug"></i> 测试连通</>
                  )}
                </button>
                <button
                  onClick={handleSaveModelConfig}
                  disabled={saveStatus === 'saving' || saveStatus === 'testing'}
                  style={{
                    padding: '12px 32px',
                    background: 'linear-gradient(135deg, #9D50BB, #6E48AA)',
                    border: 'none',
                    borderRadius: '10px',
                    color: 'white',
                    fontSize: '14px',
                    fontWeight: 500,
                    cursor: saveStatus === 'saving' || saveStatus === 'testing' ? 'not-allowed' : 'pointer',
                    opacity: saveStatus === 'saving' || saveStatus === 'testing' ? 0.7 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  {saveStatus === 'saving' && <i className="fa-solid fa-spinner fa-spin"></i>}
                  {(saveStatus === 'idle' || saveStatus === 'testing') && <><i className="fa-solid fa-save"></i> 保存配置</>}
                  {saveStatus === 'success' && <><i className="fa-solid fa-check"></i> 保存成功</>}
                  {saveStatus === 'error' && <><i className="fa-solid fa-times"></i> {saveErrorMsg}</>}
                </button>
              </div>
            </div>
          )}

          {/* 模型配置 Tab - 只显示历史上下文选项 */}
          {activeTab === 'model-config' && (
            <div className="card" style={{ padding: '24px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '20px' }}>
                <i className="fa-solid fa-sliders-h" style={{ marginRight: '8px', color: '#9D50BB' }}></i>
                模型配置
              </h3>

              <div style={{ padding: '16px', background: 'rgba(0,0,0,0.02)', borderRadius: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <span style={{ fontSize: '14px', fontWeight: 500 }}>将历史上下文加入对话</span>
                    <p style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '4px' }}>记住对话上下文，提供连贯的回答</p>
                  </div>
                  <div
                    onClick={() => setHistoryContext(!historyContext)}
                    style={{
                      width: '48px',
                      height: '26px',
                      borderRadius: '13px',
                      background: historyContext ? '#9D50BB' : 'rgba(0,0,0,0.1)',
                      position: 'relative',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{
                      width: '22px',
                      height: '22px',
                      borderRadius: '11px',
                      background: 'white',
                      position: 'absolute',
                      top: '2px',
                      left: historyContext ? '24px' : '2px',
                      transition: 'all 0.2s',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                    }}></div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 用户画像 Tab */}
          {activeTab === 'profile' && (
            <div className="card" style={{ padding: '24px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '20px' }}>
                <i className="fa-solid fa-user" style={{ marginRight: '8px', color: '#9D50BB' }}></i>
                用户画像
              </h3>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#6B7280', marginBottom: '8px' }}>您的名称</label>
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="您的名称"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    border: '1px solid rgba(0,0,0,0.1)',
                    borderRadius: '10px',
                    fontSize: '13px',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#6B7280', marginBottom: '8px' }}>职业/角色</label>
                <input
                  type="text"
                  value={userRole}
                  onChange={(e) => setUserRole(e.target.value)}
                  placeholder="例如：软件工程师"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    border: '1px solid rgba(0,0,0,0.1)',
                    borderRadius: '10px',
                    fontSize: '13px',
                    outline: 'none'
                  }}
                />
                <p style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '6px' }}>AI 会根据您的角色调整回答的专业程度</p>
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#6B7280', marginBottom: '12px' }}>回复风格</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {[
                    { key: 'concise', icon: 'fa-compress-alt', label: '简洁' },
                    { key: 'medium', icon: 'fa-align-left', label: '适中' },
                    { key: 'detailed', icon: 'fa-list-ul', label: '详细' }
                  ].map(style => (
                    <button
                      key={style.key}
                      onClick={() => setResponseStyle(style.key)}
                      style={{
                        flex: 1,
                        padding: '12px',
                        border: `2px solid ${responseStyle === style.key ? '#9D50BB' : 'rgba(0,0,0,0.08)'}`,
                        borderRadius: '10px',
                        background: responseStyle === style.key ? 'rgba(157, 80, 187, 0.05)' : 'transparent',
                        cursor: 'pointer',
                        fontSize: '13px',
                        transition: 'all 0.2s'
                      }}
                    >
                      <i className={`fa-solid ${style.icon}`} style={{ marginRight: '6px' }}></i>
                      {style.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ padding: '16px', background: 'rgba(0,0,0,0.02)', borderRadius: '10px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>隐私设置</h4>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
                  <div>
                    <span style={{ fontSize: '13px' }}>本地索引</span>
                    <p style={{ fontSize: '11px', color: '#9CA3AF' }}>允许 AI 读取本地文件</p>
                  </div>
                  <input type="checkbox" defaultChecked style={{ accentColor: '#9D50BB', width: '18px', height: '18px' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                  <div>
                    <span style={{ fontSize: '13px' }}>云端同步</span>
                    <p style={{ fontSize: '11px', color: '#9CA3AF' }}>同步数据到云端</p>
                  </div>
                  <input type="checkbox" style={{ accentColor: '#9D50BB', width: '18px', height: '18px' }} />
                </div>
              </div>
            </div>
          )}

          {/* 保存按钮 - 只在 Profile 时显示（API配置有独立的保存按钮） */}
          {activeTab === 'profile' && (
            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: '#9CA3AF' }}>
                用户设置
              </span>
              <button
                onClick={handleSaveProfile}
                disabled={saveStatus === 'saving'}
                style={{
                  padding: '12px 32px',
                  background: 'linear-gradient(135deg, #9D50BB, #6E48AA)',
                  border: 'none',
                  borderRadius: '10px',
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: saveStatus === 'saving' ? 'not-allowed' : 'pointer',
                  opacity: saveStatus === 'saving' ? 0.7 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                {saveStatus === 'saving' && <i className="fa-solid fa-spinner fa-spin"></i>}
                {saveStatus === 'idle' && <><i className="fa-solid fa-save"></i> 保存配置</>}
                {saveStatus === 'success' && <><i className="fa-solid fa-check"></i> 保存成功</>}
                {saveStatus === 'error' && <><i className="fa-solid fa-times"></i> {saveErrorMsg}</>}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Toast 提示 */}
      {toast && (
        <div style={{
          position: 'fixed',
          top: '80px',
          left: '0',
          right: '0',
          display: 'flex',
          justifyContent: 'center',
          pointerEvents: 'none',
          zIndex: 9999
        }}>
          <div style={{
            padding: '12px 20px',
            background: toast.type === 'success' ? '#10B981' : '#EF4444',
            color: 'white',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 500,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            animation: 'fadeInOut 2s ease-in-out',
            pointerEvents: 'auto'
          }}>
            <i className={`fa-solid ${toast.type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}`}></i>
            {toast.msg}
          </div>
        </div>
      )}
    </div>
  );
}

function CommunicationPanel({ messages, onNavigate }: { messages: Message[]; onNavigate: (nav: string) => void }) {
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isConfigMissing, setIsConfigMissing] = useState(false);
  const api = (window as any).deskmate;

  // 解析结构化错误信息
  const parseError = (response: string): { isError: boolean; shortMsg: string; detailMsg: string } => {
    if (response.startsWith('__ERROR__|')) {
      const parts = response.split('|');
      return {
        isError: true,
        shortMsg: parts[1] || '连接失败',
        detailMsg: parts.slice(2).join('|') || '未知错误'
      };
    }
    return { isError: false, shortMsg: '', detailMsg: '' };
  };

  const handleSend = async () => {
    if (!inputMessage.trim() || isTyping) return;

    const userMsg: Message = { role: 'user', content: inputMessage };
    setLocalMessages(prev => [...prev, userMsg]);
    setInputMessage('');
    setIsTyping(true);

    try {
      // 检查 API 是否可用
      if (!api?.ai?.chat) {
        throw new Error('API not available');
      }

      const response = await api.ai.chat(inputMessage, localMessages);
      console.log('AI Response:', response);

      if (response?.success) {
        // 检查是否是结构化错误
        const errorInfo = parseError(response.response || '');
        if (errorInfo.isError) {
          setLocalMessages(prev => [...prev, {
            role: 'assistant',
            content: `__ERROR__|${errorInfo.shortMsg}|${errorInfo.detailMsg}`
          }]);
        } else {
          setLocalMessages(prev => [...prev, { role: 'assistant', content: response.response || '' }]);
        }
        // 检查是否需要配置API Key
        if (response.response?.includes('MINIMAX_API_KEY') || response.response?.includes('API密钥')) {
          setIsConfigMissing(true);
        }
      } else {
        // API 调用失败，显示错误信息
        const errorMsg = response?.response || '抱歉，发生了错误，请稍后重试。';
        const errorInfo = parseError(errorMsg);
        setLocalMessages(prev => [...prev, {
          role: 'assistant',
          content: errorInfo.isError ? `__ERROR__|${errorInfo.shortMsg}|${errorInfo.detailMsg}` : errorMsg
        }]);
      }
    } catch (error) {
      console.error('Chat error:', error);
      setLocalMessages(prev => [...prev, { role: 'assistant', content: '__ERROR__|连接失败|无法连接到AI服务' }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const allMessages = messages.length > 0 ? messages : localMessages;

  // 渲染错误消息气泡（简洁版：标题+小字）
  const renderErrorBubble = (content: string) => {
    const errorInfo = parseError(content);
    if (!errorInfo.isError) return content;

    return (
      <div
        style={{
          padding: '10px 14px',
          background: 'rgba(239, 68, 68, 0.08)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          borderRadius: '14px',
          borderBottomLeftRadius: '4px',
          fontSize: '13px',
          color: '#DC2626',
          lineHeight: 1.5,
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
          <i className="fa-solid fa-exclamation-circle" style={{ fontSize: '12px' }}></i>
          <span style={{ fontWeight: 500 }}>{errorInfo.shortMsg}</span>
        </div>
        <div style={{ fontSize: '11px', color: '#B91C1B', marginTop: '2px' }}>
          {errorInfo.detailMsg}
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="panel-header">
        <span className="panel-title">
          <i className="fa-solid fa-robot" style={{ marginRight: '8px', color: '#9D50BB' }}></i>
          AI Assistant
        </span>
        <div className="panel-actions">
          <button className="panel-action-btn" title="New Chat">
            <i className="fa-solid fa-plus"></i>
          </button>
          <button className="panel-action-btn" title="Settings" onClick={() => onNavigate('settings')}>
            <i className="fa-solid fa-cog"></i>
          </button>
        </div>
      </div>

      <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="ai-mode-btn active" style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: 'none', background: 'rgba(157, 80, 187, 0.12)', color: '#6E48AA', cursor: 'pointer', fontSize: '12px', fontWeight: 500 }}>
            <i className="fa-solid fa-brain" style={{ marginRight: '4px' }}></i>
            Private
          </button>
          <button className="ai-mode-btn" style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.08)', background: 'transparent', color: '#6B7280', cursor: 'pointer', fontSize: '12px' }}>
            <i className="fa-solid fa-eye-slash" style={{ marginRight: '4px' }}></i>
            Incognito
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {isConfigMissing && (
          <div style={{
            padding: '12px 20px',
            background: 'rgba(245, 158, 11, 0.1)',
            borderBottom: '1px solid rgba(245, 158, 11, 0.2)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#D97706', fontSize: '12px' }}>
              <i className="fa-solid fa-exclamation-triangle"></i>
              <span>请配置 Minimax API Key</span>
            </div>
            <div style={{ fontSize: '11px', color: '#92400E', marginTop: '4px', marginLeft: '22px' }}>
              点击右上角 <i className="fa-solid fa-cog"></i> 齿轮图标进行配置
            </div>
          </div>
        )}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {allMessages.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', color: '#6B7280' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'linear-gradient(135deg, #9D50BB, #6E48AA)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
                <i className="fa-solid fa-robot" style={{ fontSize: '20px', color: 'white' }}></i>
              </div>
              <p style={{ fontSize: '13px', marginBottom: '8px' }}>How can I help you?</p>
              <p style={{ fontSize: '11px', color: '#9CA3AF' }}>Ask me anything about your work</p>
            </div>
          ) : (
            allMessages.map((msg, i) => (
              <div
                key={i}
                className={`chat-message ${msg.role === 'user' ? 'user' : ''}`}
                style={{ marginBottom: i === allMessages.length - 1 ? 0 : 12 }}
              >
                <div className="chat-avatar" style={{ background: msg.role === 'user' ? 'linear-gradient(135deg, #FF8E53, #FF6A00)' : 'linear-gradient(135deg, #9D50BB, #6E48AA)' }}>
                  <i className={`fa-solid ${msg.role === 'user' ? 'fa-user' : 'fa-robot'}`} style={{ fontSize: '11px' }}></i>
                </div>
                <div className={`chat-bubble ${msg.role === 'user' ? 'mine' : 'other'}`}>
                  {msg.role === 'assistant' && (msg.content.startsWith('__ERROR__|') ? (
                    renderErrorBubble(msg.content)
                  ) : (
                    msg.content
                  ))}
                  {msg.role === 'user' && msg.content}
                </div>
              </div>
            ))
          )}
          {isTyping && (
            <div className="chat-message" style={{ marginBottom: 12 }}>
              <div className="chat-avatar" style={{ background: 'linear-gradient(135deg, #9D50BB, #6E48AA)' }}>
                <i className="fa-solid fa-robot" style={{ fontSize: '11px' }}></i>
              </div>
              <div className="chat-bubble other">
                <div className="typing-indicator">
                  <span className="typing-dot"></span>
                  <span className="typing-dot"></span>
                  <span className="typing-dot"></span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
          <div className="chat-input-row">
            <button className="chat-mic-btn"><i className="fa-solid fa-microphone"></i></button>
            <input
              type="text"
              className="chat-input"
              placeholder="Ask AI..."
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
            />
            <button className="chat-send-btn" onClick={handleSend} disabled={!inputMessage.trim() || isTyping}>
              <i className="fa-solid fa-paper-plane" style={{ fontSize: '12px' }}></i>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default App;
