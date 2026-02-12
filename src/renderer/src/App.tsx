import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';

const iconModules = import.meta.glob('../../public/icons/*.svg', { eager: true, as: 'url' });

// 2. 辅助函数
function getProviderIconUrl(providerId: string | undefined): string {
  if (!providerId) return '';

  // 构建 key，注意这里要匹配 glob 里的相对路径写法
  const key = `../renderer/icons/${providerId}.svg`;

  return key
  
  // 返回 Vite 处理后的最终路径 (开发时是 /src/..., 打包后是 assets/xxx.hash.svg)
  // return iconModules[key] || '';
}

// 扩展 Window 接口以支持 deskmate
declare global {
  interface Window {
    deskmate?: {
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

// 集中式 API 地址构建函数
// 在 EXE 环境中，Vite 代理无效，需要直接使用完整 URL
function getServerUrl(path: string): string {
  // 如果是 Electron 环境，使用完整服务器地址
  if (typeof window !== 'undefined' && (window as any).deskmate) {
    return `http://127.0.0.1:5000${path}`;
  }
  // 开发环境使用相对路径（通过 Vite 代理）
  return path;
}

interface Message {
  role: 'user' | 'assistant' | 'system';
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
  const [isStreaming, setIsStreaming] = useState(false);
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
    { id: 'secrets', icon: 'fa-key' },
    { id: 'tasks', icon: 'fa-check-square' },
    { id: 'calendar', icon: 'fa-calendar' },
    { id: 'email', icon: 'fa-envelope' },
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
        {activeNav === 'secrets' && <SecretsView />}
        {activeNav === 'tasks' && <TasksView />}
        {activeNav === 'calendar' && <CalendarView />}
        {activeNav === 'email' && <EmailView />}
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

interface SSHFile {
  name: string;
  type: 'file' | 'folder';
  path: string;
  size?: number;
  mtime?: number;
}

interface SSHConnection {
  id: string;
  host: string;
  username: string;
  root: string;
  name?: string;
}

// 本地存储的连接配置
interface SavedConnection {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  root: string;  // SSH 根目录
  password?: string;  // 可选的记住密码
}

function SecretsView() {
  const [activeSubNav, setActiveSubNav] = useState<'passwords' | 'apikeys' | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTag, setFilterTag] = useState<string>('all');
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [toast, setToast] = useState<{msg: string, type: string} | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fetchingIcon, setFetchingIcon] = useState(false);

  // Delete confirmation modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{id: string, type: 'password' | 'apikey', title: string} | null>(null);

  // Dropdown position refs
  const tagDropdownRef = useRef<HTMLDivElement>(null);
  const platformDropdownRef = useRef<HTMLDivElement>(null);
  const [tagDropdownPos, setTagDropdownPos] = useState<{top: number, left: number} | null>(null);
  const [platformDropdownPos, setPlatformDropdownPos] = useState<{top: number, left: number} | null>(null);
  const [dropdownItems, setDropdownItems] = useState<{type: 'tag' | 'platform', items: string[]} | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    title: '', website: '', account: '', password: '', remark: '', tags: '', iconUrl: '',
    name: '', apiKey: '', platform: '', connectionUrl: '',
    expirationDate: '', expirationNever: true, reminderDays: 0
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showApiKeyPassword, setShowApiKeyPassword] = useState(false);
  const [passwordList, setPasswordList] = useState<Array<{
    id: string;
    title: string;
    website: string;
    account: string;
    password: string;
    remark: string;
    iconUrl: string;
    tags: string[];
    createdAt: number;
    updatedAt?: number;
  }>>(() => {
    const saved = localStorage.getItem('deskmate_passwords');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return [];
      }
    }
    return [];
  });

  // API Key 列表状态
  const [apiKeyList, setApiKeyList] = useState<Array<{
    id: string;
    name: string;
    apiKey: string;
    remark: string;
    platform: string;
    connectionUrl?: string;
    iconUrl?: string;
    expirationDate?: string;
    reminderDays?: number;
    tags: string[];
    createdAt: number;
    updatedAt?: number;
  }>>(() => {
    const saved = localStorage.getItem('deskmate_apikeys');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return [];
      }
    }
    return [];
  });

  // 过滤和搜索
  const filteredPasswords = passwordList.filter(p => {
    const matchesSearch = p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          p.website.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          p.remark.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTag = filterTag === 'all' || p.tags.includes(filterTag);
    return matchesSearch && matchesTag;
  });

  const filteredApiKeys = apiKeyList.filter(k => {
    const matchesSearch = k.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          k.remark.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          k.platform.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPlatform = filterTag === 'all' || k.platform === filterTag;
    return matchesSearch && matchesPlatform;
  });

  // 获取所有标签
  const allPasswordTags = [...new Set(passwordList.flatMap(p => p.tags || []))];
  const allApiKeyTags = [...new Set(apiKeyList.flatMap(k => k.tags || []))];
  const allPlatforms = [...new Set(apiKeyList.map(k => k.platform || '其他'))];

  // 添加密码
  const addPassword = (password: { title: string; website: string; account?: string; password: string; remark: string; iconUrl?: string; tags?: string[] }) => {
    const newPassword = {
      id: Date.now().toString(),
      ...password,
      account: password.account || '',
      iconUrl: password.iconUrl || '',
      tags: password.tags || [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    const newList = [...passwordList, newPassword];
    setPasswordList(newList);
    localStorage.setItem('deskmate_passwords', JSON.stringify(newList));
  };

  // 删除密码
  const deletePassword = (id: string) => {
    const newList = passwordList.filter(p => p.id !== id);
    setPasswordList(newList);
    localStorage.setItem('deskmate_passwords', JSON.stringify(newList));
  };

  // 更新密码
  const updatePassword = (id: string, data: { title: string; website: string; account?: string; password: string; remark: string; iconUrl?: string; tags?: string[] }) => {
    const newList = passwordList.map(p => p.id === id ? { ...p, ...data, account: data.account || p.account || '', iconUrl: data.iconUrl || p.iconUrl || '', tags: data.tags || p.tags, updatedAt: Date.now() } : p);
    setPasswordList(newList);
    localStorage.setItem('deskmate_passwords', JSON.stringify(newList));
  };

  // Toast 提示
  const showToast = (msg: string, type: string) => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2000);
  };

  // 复制到剪贴板
  const copyToClipboard = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${type}已复制到剪贴板`, 'success');
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // 添加 API Key
  const addApiKey = (apiKey: {
    name: string;
    apiKey: string;
    remark: string;
    platform?: string;
    connectionUrl?: string;
    iconUrl?: string;
    expirationDate?: string;
    reminderDays?: number;
    tags?: string[];
  }) => {
    const newApiKey = {
      id: Date.now().toString(),
      ...apiKey,
      platform: apiKey.platform || '自定义',
      connectionUrl: apiKey.connectionUrl || '',
      iconUrl: apiKey.iconUrl || '',
      expirationDate: apiKey.expirationDate || '',
      reminderDays: apiKey.reminderDays,
      tags: apiKey.tags || [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    const newList = [...apiKeyList, newApiKey];
    setApiKeyList(newList);
    localStorage.setItem('deskmate_apikeys', JSON.stringify(newList));
  };

  // 删除 API Key
  const deleteApiKey = (id: string) => {
    const newList = apiKeyList.filter(k => k.id !== id);
    setApiKeyList(newList);
    localStorage.setItem('deskmate_apikeys', JSON.stringify(newList));
  };

  // 更新 API Key
  const updateApiKey = (id: string, data: Partial<{
    name: string;
    apiKey: string;
    remark: string;
    platform: string;
    connectionUrl: string;
    iconUrl: string;
    expirationDate: string;
    reminderDays: number;
    tags: string[];
  }>) => {
    const newList = apiKeyList.map(k => k.id === id ? {
      ...k,
      ...data,
      platform: data.platform || k.platform || '自定义',
      connectionUrl: data.connectionUrl ?? k.connectionUrl ?? '',
      iconUrl: data.iconUrl ?? k.iconUrl ?? '',
      expirationDate: data.expirationDate ?? k.expirationDate ?? '',
      reminderDays: data.reminderDays ?? k.reminderDays,
      tags: data.tags || k.tags || [],
      updatedAt: Date.now()
    } : k);
    setApiKeyList(newList);
    localStorage.setItem('deskmate_apikeys', JSON.stringify(newList));
  };

  // 获取网站图标
  const fetchWebsiteIcon = async () => {
    // 判断是密码模式还是API Key模式
    const isPwdMode = activeSubNav === 'passwords';
    const sourceField = isPwdMode ? formData.website : formData.connectionUrl;
    const sourceValue = sourceField?.trim();

    if (!sourceValue) {
      showToast(isPwdMode ? '请先输入网站地址' : '请先输入获取地址', 'error');
      return;
    }

    setFetchingIcon(true);
    try {
      const urlForFetch = sourceValue.startsWith('http') ? sourceValue : `https://${sourceValue}`;
      console.log('[图标获取] 请求后端 API:', urlForFetch);
      const response = await fetch(getServerUrl('/api/icons/extract'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ website: urlForFetch })
      });
      const data = await response.json();
      console.log('[图标获取] 后端返回:', data);

      if (data.success && data.icon_url) {
        setFormData({ ...formData, iconUrl: data.icon_url });
        showToast('图标获取成功', 'success');
      } else if (data.icon_url === null) {
        setFormData({ ...formData, iconUrl: '' });
        showToast(data.message || '未找到图标', 'info');
      } else if (data.error) {
        showToast(data.error, 'error');
      }
    } catch (err) {
      console.error('获取图标失败:', err);
      showToast(`获取失败: ${err}`, 'error');
    } finally {
      setFetchingIcon(false);
    }
  };

  // 自动获取图标（防抖）- 仅在密码模式下，网站字段变化时自动获取
  const prevWebsiteRef = useRef('');
  useEffect(() => {
    if (activeSubNav !== 'passwords' || !formData.website.trim() || fetchingIcon) {
      prevWebsiteRef.current = formData.website.trim();
      return;
    }

    const website = formData.website.trim();
    // 只在网站变化且非空时获取
    if (website && website !== prevWebsiteRef.current) {
      prevWebsiteRef.current = website;
      const timer = setTimeout(() => {
        fetchWebsiteIcon();
      }, 1500); // 1.5秒防抖
      return () => clearTimeout(timer);
    }
  }, [formData.website, activeSubNav, fetchingIcon]);

  // 自动获取图标（防抖）- 仅在API Key模式下，获取地址字段变化时自动获取
  const prevConnectionUrlRef = useRef('');
  useEffect(() => {
    if (activeSubNav !== 'apikeys' || !formData.connectionUrl.trim() || fetchingIcon) {
      prevConnectionUrlRef.current = formData.connectionUrl.trim();
      return;
    }

    const connectionUrl = formData.connectionUrl.trim();
    // 只在获取地址变化且非空时获取
    if (connectionUrl && connectionUrl !== prevConnectionUrlRef.current) {
      prevConnectionUrlRef.current = connectionUrl;
      const timer = setTimeout(() => {
        fetchWebsiteIcon();
      }, 1500); // 1.5秒防抖
      return () => clearTimeout(timer);
    }
  }, [formData.connectionUrl, activeSubNav, fetchingIcon]);

  // 为列表中的 API Key 获取图标
  const fetchIconForApiKey = async (id: string, connectionUrl: string) => {
    const urlForFetch = connectionUrl.startsWith('http') ? connectionUrl : `https://${connectionUrl}`;
    try {
      const response = await fetch(getServerUrl('/api/icons/extract'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ website: urlForFetch })
      });
      const data = await response.json();
      if (data.success && data.icon_url) {
        updateApiKey(id, { iconUrl: data.icon_url });
      }
    } catch (err) {
      console.error('获取图标失败:', err);
    }
  };

  // 组件挂载时为没有图标的 API Key 自动获取图标
  useEffect(() => {
    if (activeSubNav === 'apikeys') {
      apiKeyList.forEach(item => {
        if (item.connectionUrl && !item.iconUrl) {
          fetchIconForApiKey(item.id, item.connectionUrl);
        }
      });
    }
  }, [activeSubNav]);

  // 格式化时间
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  // 渲染主视图（两个选项卡）
  if (!activeSubNav) {
    return (
      <>
        <div className="page-header" style={{ margin: '-20px -24px 20px -24px', padding: '16px 24px' }}>
          <div>
            <div className="page-title">秘密管理</div>
            <div className="page-subtitle">集中管理您的密码和 API Key</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '20px' }}>
          {/* 密码管理卡片 */}
          <div
            className="card"
            style={{
              flex: 1,
              cursor: 'pointer',
              overflow: 'hidden'
            }}
            onClick={() => setActiveSubNav('passwords')}
          >
            {/* 顶部大背景 */}
            <div style={{
              height: '140px',
              background: 'linear-gradient(135deg, #FF8E53 0%, #FF6A00 50%, #E55A00 100%)',
              position: 'relative',
              overflow: 'hidden'
            }}>
              {/* 背景装饰 */}
              <div style={{
                position: 'absolute',
                top: '20px',
                left: '20px',
                width: '120px',
                height: '120px',
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.08)',
                border: '2px solid rgba(255, 255, 255, 0.1)'
              }}></div>
              <div style={{
                position: 'absolute',
                bottom: '-30px',
                right: '-20px',
                width: '100px',
                height: '100px',
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.12)'
              }}></div>
              <div style={{
                position: 'absolute',
                top: '-20px',
                right: '30%',
                width: '60px',
                height: '60px',
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.08)'
              }}></div>

              {/* 中央图标 */}
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '30px',
                transform: 'translateY(-50%)',
                width: '70px',
                height: '70px',
                borderRadius: '18px',
                background: 'rgba(255, 255, 255, 0.95)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)'
              }}>
                <i className="fa-solid fa-shield-halved" style={{ fontSize: '32px', color: '#FF6A00' }}></i>
              </div>

              {/* 标题 */}
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '115px',
                transform: 'translateY(-50%)',
                color: 'white'
              }}>
                <div style={{ fontSize: '20px', fontWeight: 700, marginBottom: '4px' }}>密码管理</div>
                <div style={{ fontSize: '13px', opacity: 0.9 }}>安全存储密码</div>
              </div>
            </div>

            {/* 内容区域 */}
            <div style={{ padding: '20px' }}>
              {/* 统计行 */}
              <div style={{
                display: 'flex',
                gap: '12px',
                marginBottom: '20px'
              }}>
                <div style={{
                  flex: 1,
                  padding: '14px',
                  background: 'linear-gradient(135deg, rgba(255, 142, 83, 0.1), rgba(255, 106, 0, 0.05))',
                  borderRadius: '12px',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: '#FF6A00' }}>{passwordList.length}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>已保存</div>
                </div>
                <div style={{
                  flex: 1,
                  padding: '14px',
                  background: 'rgba(16, 185, 129, 0.08)',
                  borderRadius: '12px',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: '#10B981' }}>100%</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>本地存储</div>
                </div>
              </div>

              {/* 功能网格 */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '10px',
                marginBottom: '16px'
              }}>
                <div style={{
                  padding: '12px',
                  background: 'rgba(255, 142, 83, 0.06)',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: 'linear-gradient(135deg, #FF8E53, #FF6A00)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <i className="fa-solid fa-copy" style={{ fontSize: '14px', color: 'white' }}></i>
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 500 }}>一键复制</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>快速使用</div>
                  </div>
                </div>
                <div style={{
                  padding: '12px',
                  background: 'rgba(59, 130, 246, 0.06)',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: 'linear-gradient(135deg, #3B82F6, #2563EB)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <i className="fa-solid fa-search" style={{ fontSize: '14px', color: 'white' }}></i>
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 500 }}>智能搜索</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>快速定位</div>
                  </div>
                </div>
                <div style={{
                  padding: '12px',
                  background: 'rgba(16, 185, 129, 0.06)',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: 'linear-gradient(135deg, #10B981, #059669)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <i className="fa-solid fa-lock" style={{ fontSize: '14px', color: 'white' }}></i>
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 500 }}>加密存储</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>安全可靠</div>
                  </div>
                </div>
                <div style={{
                  padding: '12px',
                  background: 'rgba(245, 158, 11, 0.06)',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: 'linear-gradient(135deg, #F59E0B, #D97706)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <i className="fa-solid fa-tag" style={{ fontSize: '14px', color: 'white' }}></i>
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 500 }}>标签分类</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>轻松管理</div>
                  </div>
                </div>
              </div>

              {/* 进入按钮 */}
              <div style={{
                padding: '14px',
                background: 'linear-gradient(135deg, #FF8E53, #FF6A00)',
                borderRadius: '12px',
                textAlign: 'center',
                color: 'white',
                fontSize: '14px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}>
                <span>管理我的密码</span>
                <i className="fa-solid fa-arrow-right"></i>
              </div>
            </div>
          </div>

          {/* API Key 管理卡片 */}
          <div
            className="card"
            style={{
              flex: 1,
              cursor: 'pointer',
              overflow: 'hidden'
            }}
            onClick={() => setActiveSubNav('apikeys')}
          >
            {/* 顶部大背景 */}
            <div style={{
              height: '140px',
              background: 'linear-gradient(135deg, #9D50BB 0%, #6E48AA 50%, #5B3A9E 100%)',
              position: 'relative',
              overflow: 'hidden'
            }}>
              {/* 背景装饰 */}
              <div style={{
                position: 'absolute',
                top: '20px',
                left: '20px',
                width: '120px',
                height: '120px',
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.08)',
                border: '2px solid rgba(255, 255, 255, 0.1)'
              }}></div>
              <div style={{
                position: 'absolute',
                bottom: '-30px',
                right: '-20px',
                width: '100px',
                height: '100px',
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.12)'
              }}></div>
              <div style={{
                position: 'absolute',
                top: '-20px',
                right: '30%',
                width: '60px',
                height: '60px',
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.08)'
              }}></div>

              {/* 中央图标 */}
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '30px',
                transform: 'translateY(-50%)',
                width: '70px',
                height: '70px',
                borderRadius: '18px',
                background: 'rgba(255, 255, 255, 0.95)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)'
              }}>
                <i className="fa-solid fa-key" style={{ fontSize: '28px', color: '#6E48AA' }}></i>
              </div>

              {/* 标题 */}
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '115px',
                transform: 'translateY(-50%)',
                color: 'white'
              }}>
                <div style={{ fontSize: '20px', fontWeight: 700, marginBottom: '4px' }}>API Key 管理</div>
                <div style={{ fontSize: '13px', opacity: 0.9 }}>多平台密钥管理</div>
              </div>
            </div>

            {/* 内容区域 */}
            <div style={{ padding: '20px' }}>
              {/* 统计行 */}
              <div style={{
                display: 'flex',
                gap: '12px',
                marginBottom: '20px'
              }}>
                <div style={{
                  flex: 1,
                  padding: '14px',
                  background: 'linear-gradient(135deg, rgba(157, 80, 187, 0.1), rgba(110, 72, 170, 0.05))',
                  borderRadius: '12px',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: '#6E48AA' }}>{apiKeyList.length}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>已保存</div>
                </div>
                <div style={{
                  flex: 1,
                  padding: '14px',
                  background: 'rgba(139, 92, 246, 0.08)',
                  borderRadius: '12px',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: '#8B5CF6' }}>∞</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>多平台</div>
                </div>
              </div>

              {/* 支持的平台 */}
              {/* <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>支持平台</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {['OpenAI', 'Claude', 'DeepSeek', 'SiliconFlow'].slice(0, 4).map((platform, idx) => (
                    <div key={platform} style={{
                      padding: '6px 12px',
                      background: 'rgba(139, 92, 246, 0.08)',
                      borderRadius: '20px',
                      fontSize: '12px',
                      color: '#6E48AA',
                      fontWeight: 500
                    }}>
                      {platform}
                    </div>
                  ))}
                </div>
              </div> */}

              {/* 功能网格 */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '10px',
                marginBottom: '16px'
              }}>
                <div style={{
                  padding: '12px',
                  background: 'rgba(139, 92, 246, 0.06)',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: 'linear-gradient(135deg, #9D50BB, #6E48AA)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <i className="fa-solid fa-copy" style={{ fontSize: '14px', color: 'white' }}></i>
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 500 }}>一键复制</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>快速使用</div>
                  </div>
                </div>
                <div style={{
                  padding: '12px',
                  background: 'rgba(59, 130, 246, 0.06)',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: 'linear-gradient(135deg, #3B82F6, #2563EB)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <i className="fa-solid fa-server" style={{ fontSize: '14px', color: 'white' }}></i>
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 500 }}>多平台</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>统一管理</div>
                  </div>
                </div>
                <div style={{
                  padding: '12px',
                  background: 'rgba(16, 185, 129, 0.06)',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: 'linear-gradient(135deg, #10B981, #059669)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <i className="fa-solid fa-shield-alt" style={{ fontSize: '14px', color: 'white' }}></i>
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 500 }}>安全存储</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>本地保存</div>
                  </div>
                </div>
                <div style={{
                  padding: '12px',
                  background: 'rgba(245, 158, 11, 0.06)',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: 'linear-gradient(135deg, #F59E0B, #D97706)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <i className="fa-solid fa-bolt" style={{ fontSize: '14px', color: 'white' }}></i>
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 500 }}>快速接入</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>即用即取</div>
                  </div>
                </div>
              </div>

              {/* 进入按钮 */}
              <div style={{
                padding: '14px',
                background: 'linear-gradient(135deg, #9D50BB, #6E48AA)',
                borderRadius: '12px',
                textAlign: 'center',
                color: 'white',
                fontSize: '14px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}>
                <span>管理我的 Key</span>
                <i className="fa-solid fa-arrow-right"></i>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // 渲染子视图
  const isPasswordMode = activeSubNav === 'passwords';
  const currentList = isPasswordMode ? filteredPasswords : filteredApiKeys;
  const currentTags = isPasswordMode ? allPasswordTags : allApiKeyTags;
  const currentPlatforms = allPlatforms;

  return (
    <>
      <div className="page-header" style={{ margin: '-20px -24px 20px -24px', padding: '16px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            className="icon-btn"
            onClick={() => {
              setActiveSubNav(null);
              setSearchTerm('');
              setFilterTag('all');
            }}
            style={{ width: '32px', height: '32px' }}
          >
            <i className="fa-solid fa-arrow-left"></i>
          </div>
          <div>
            <div className="page-title">{isPasswordMode ? '密码管理' : 'API Key 管理'}</div>
            <div className="page-subtitle">
              {currentList.length} / {isPasswordMode ? passwordList.length : apiKeyList.length} 项
            </div>
          </div>
        </div>
        <div className="header-actions">
          <div
            className="icon-btn"
            onClick={() => {
              setModalMode('add');
              setEditingId(null);
              setFormData({
                title: '', website: '', account: '', password: '', remark: '', tags: '', iconUrl: '',
                name: '', apiKey: '', platform: '', connectionUrl: '',
                expirationDate: '', expirationNever: true, reminderDays: 0
              });
              setShowModal(true);
            }}
          >
            <i className="fa-solid fa-plus"></i>
          </div>
        </div>
      </div>

      {/* 搜索栏 */}
      <div style={{
        display: 'flex',
        gap: '12px',
        marginBottom: '16px'
      }}>
        <div style={{
          flex: 1,
          position: 'relative'
        }}>
          <i className="fa-solid fa-search" style={{
            position: 'absolute',
            left: '14px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--text-secondary)'
          }}></i>
          <input
            type="text"
            placeholder="搜索..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px 10px 40px',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: '12px',
              background: 'rgba(255, 255, 255, 0.6)',
              backdropFilter: 'blur(10px)',
              fontSize: '13px',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
          {searchTerm && (
            <i
              className="fa-solid fa-times"
              onClick={() => setSearchTerm('')}
              style={{
                position: 'absolute',
                right: '14px',
                top: '50%',
                transform: 'translateY(-50%)',
                cursor: 'pointer',
                color: 'var(--text-secondary)'
              }}
            ></i>
          )}
        </div>
        {/* 标签筛选 */}
        <div style={{
          display: 'flex',
          gap: '6px',
          padding: '4px',
          background: 'rgba(255, 255, 255, 0.4)',
          borderRadius: '10px',
          backdropFilter: 'blur(10px)',
          alignItems: 'center'
        }}>
          <div
            onClick={() => setFilterTag('all')}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '12px',
              cursor: 'pointer',
              background: filterTag === 'all' ? (isPasswordMode ? 'linear-gradient(135deg, #FF8E53, #FF6A00)' : 'linear-gradient(135deg, #9D50BB, #6E48AA)') : 'transparent',
              color: filterTag === 'all' ? 'white' : 'var(--text-secondary)',
              fontWeight: 500,
              whiteSpace: 'nowrap'
            }}
          >
            全部
          </div>
          {isPasswordMode ? (
            (() => {
              const tags = allPasswordTags;
              const maxVisible = 3;
              const visibleTags = tags.slice(0, maxVisible);
              const hiddenTags = tags.slice(maxVisible);

              return (
                <>
                  {visibleTags.map(tag => (
                    <div
                      key={tag}
                      onClick={() => setFilterTag(tag)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        cursor: 'pointer',
                        background: filterTag === tag ? 'linear-gradient(135deg, #FF8E53, #FF6A00)' : 'transparent',
                        color: filterTag === tag ? 'white' : 'var(--text-secondary)',
                        fontWeight: 500,
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {tag}
                    </div>
                  ))}
                  {hiddenTags.length > 0 && (
                    <div
                      ref={tagDropdownRef}
                      onClick={() => {
                        if (!showTagDropdown && tagDropdownRef.current) {
                          const rect = tagDropdownRef.current.getBoundingClientRect();
                          setTagDropdownPos({ top: rect.bottom + 4, left: rect.left });
                          setDropdownItems({ type: 'tag', items: hiddenTags });
                        }
                        setShowTagDropdown(!showTagDropdown);
                      }}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        cursor: 'pointer',
                        background: showTagDropdown ? 'linear-gradient(135deg, #FF8E53, #FF6A00)' : 'rgba(0,0,0,0.05)',
                        color: showTagDropdown ? 'white' : 'var(--text-secondary)',
                        fontWeight: 500,
                        whiteSpace: 'nowrap'
                      }}
                    >
                      <i className="fa-solid fa-ellipsis-h" style={{ marginRight: '4px' }}></i>
                      更多 ({hiddenTags.length})
                    </div>
                  )}
                </>
              );
            })()
          ) : (
            (() => {
              const platforms = allPlatforms;
              const maxVisible = 3;
              const visiblePlatforms = platforms.slice(0, maxVisible);
              const hiddenPlatforms = platforms.slice(maxVisible);

              return (
                <>
                  {visiblePlatforms.map(platform => (
                    <div
                      key={platform}
                      onClick={() => setFilterTag(platform)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        cursor: 'pointer',
                        background: filterTag === platform ? 'linear-gradient(135deg, #9D50BB, #6E48AA)' : 'transparent',
                        color: filterTag === platform ? 'white' : 'var(--text-secondary)',
                        fontWeight: 500,
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {platform}
                    </div>
                  ))}
                  {hiddenPlatforms.length > 0 && (
                    <div
                      ref={platformDropdownRef}
                      onClick={() => {
                        if (!showTagDropdown && platformDropdownRef.current) {
                          const rect = platformDropdownRef.current.getBoundingClientRect();
                          setPlatformDropdownPos({ top: rect.bottom + 4, left: rect.left });
                          setDropdownItems({ type: 'platform', items: hiddenPlatforms });
                        }
                        setShowTagDropdown(!showTagDropdown);
                      }}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        cursor: 'pointer',
                        background: showTagDropdown ? 'linear-gradient(135deg, #9D50BB, #6E48AA)' : 'rgba(0,0,0,0.05)',
                        color: showTagDropdown ? 'white' : 'var(--text-secondary)',
                        fontWeight: 500,
                        whiteSpace: 'nowrap'
                      }}
                    >
                      <i className="fa-solid fa-ellipsis-h" style={{ marginRight: '4px' }}></i>
                      更多 ({hiddenPlatforms.length})
                    </div>
                  )}
                </>
              );
            })()
          )}
        </div>
      </div>

      {/* 点击其他地方关闭下拉框 */}
      {showTagDropdown && (
        <div
          onClick={() => {
            setShowTagDropdown(false);
            setDropdownItems(null);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999
          }}
        />
      )}

      {/* 下拉菜单 Portal */}
      {showTagDropdown && dropdownItems && dropdownItems.items.length > 0 && (
        ((dropdownItems.type === 'tag' && tagDropdownPos) || (dropdownItems.type === 'platform' && platformDropdownPos)) &&
        ReactDOM.createPortal(
          <div style={{
            position: 'fixed',
            top: dropdownItems.type === 'tag' ? tagDropdownPos!.top : platformDropdownPos!.top,
            left: dropdownItems.type === 'tag' ? tagDropdownPos!.left : platformDropdownPos!.left,
            background: 'white',
            borderRadius: '10px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            padding: '8px',
            zIndex: 10000,
            minWidth: '150px',
            maxHeight: '200px',
            overflowY: 'auto'
          }}>
            {dropdownItems.items.map(item => (
              <div
                key={item}
                onClick={(e) => {
                  e.stopPropagation();
                  setFilterTag(item);
                  setShowTagDropdown(false);
                  setDropdownItems(null);
                }}
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  cursor: 'pointer',
                  background: filterTag === item
                    ? (dropdownItems.type === 'tag' ? 'rgba(255, 142, 83, 0.1)' : 'rgba(157, 80, 187, 0.1)')
                    : 'transparent',
                  color: filterTag === item
                    ? (dropdownItems.type === 'tag' ? '#FF6A00' : '#9D50BB')
                    : 'var(--text-secondary)',
                  fontWeight: 500
                }}
              >
                {item}
              </div>
            ))}
          </div>,
          document.body
        )
      )}

      {/* 列表 */}
      <div className="card" style={{ padding: '0' }}>
        {currentList.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '60px 20px',
            color: 'var(--text-secondary)'
          }}>
            <div style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              background: isPasswordMode ? 'rgba(255, 142, 83, 0.1)' : 'rgba(157, 80, 187, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px'
            }}>
              <i className={`fa-solid ${isPasswordMode ? 'fa-lock' : 'fa-key'}`}
                style={{
                  fontSize: '36px',
                  color: isPasswordMode ? '#FF8E53' : '#9D50BB',
                  opacity: 0.5
                }}
              ></i>
            </div>
            <p style={{ marginBottom: '8px' }}>
              {searchTerm || filterTag !== 'all' ? '未找到匹配的结果' : `暂无${isPasswordMode ? '密码' : 'API Key'}`}
            </p>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              点击右上角 + 添加
            </p>
          </div>
        ) : (
          <div style={{ background: 'transparent', padding: '4px 0' }}>
            {currentList.map((item, index) => (
              <div
                key={item.id}
                className="list-item-hover"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '14px 16px',
                  background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.85) 100%)',
                  borderRadius: '6px',
                  marginBottom: index < currentList.length - 1 ? '10px' : '0',
                  border: '1px solid rgba(255, 255, 255, 0.5)',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
                  transition: 'all 0.2s ease',
                  cursor: 'pointer',
                  marginLeft: '8px'
                }}
              >
                {/* 图标 */}
                {(isPasswordMode || (item as any).iconUrl || (!isPasswordMode && (item as any).connectionUrl)) ? (
                  <div
                    style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '12px',
                      overflow: 'hidden',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: '14px',
                      marginLeft: '8px',
                      flexShrink: 0,
                      background: 'rgba(255, 255, 255, 0.9)',
                      border: '1px solid rgba(255, 255, 255, 0.5)',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)'
                    }}
                  >
                    {(item as any).iconUrl ? (
                      <img
                        src={(item as any).iconUrl}
                        alt="网站图标"
                        style={{ width: '28px', height: '28px', objectFit: 'contain' }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <i className="fa-solid fa-key" style={{ fontSize: '16px', color: '#9D50BB' }}></i>
                    )}
                  </div>
                ) : (
                  <div
                    style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '12px',
                      marginRight: '14px',
                      marginLeft: '8px',
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                      background: (() => {
                        const platform = (item as any).platform;
                        if (platform === 'OpenAI') return 'linear-gradient(135deg, #10A37F, #0D8A6A)';
                        if (platform === 'Claude') return 'linear-gradient(135deg, #D97757, #C46547)';
                        if (platform === 'DeepSeek') return 'linear-gradient(135deg, #00C7B7, #00A89A)';
                        return 'linear-gradient(135deg, #9D50BB, #6E48AA)';
                      })()
                    }}
                  >
                    <i className="fa-solid fa-key" style={{ fontSize: '18px', color: 'white' }}></i>
                  </div>
                )}

                {/* 主体 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '4px'
                  }}>
                    <span style={{ fontWeight: 600, fontSize: '14px' }}>
                      {isPasswordMode ? (item as any).title : (item as any).name}
                    </span>
                    {!isPasswordMode && (item as any).platform && (
                      <span style={{
                        padding: '2px 8px',
                        background: 'rgba(139, 92, 246, 0.1)',
                        borderRadius: '10px',
                        fontSize: '10px',
                        color: '#8B5CF6',
                        fontWeight: 500
                      }}>
                        {(item as any).platform}
                      </span>
                    )}
                  </div>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    fontSize: '12px',
                    color: 'var(--text-secondary)'
                  }}>
                    {isPasswordMode ? (
                      <>
                        {(item as any).account && (
                          <span><i className="fa-solid fa-user" style={{ marginRight: '4px' }}></i>{(item as any).account}</span>
                        )}
                        {(item as any).website && (
                          <span style={{
                            maxWidth: '180px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            display: 'inline-block',
                            verticalAlign: 'bottom',
                            marginLeft: '16px'
                          }}><i className="fa-solid fa-globe" style={{ marginRight: '4px' }}></i>{(item as any).website}</span>
                        )}
                        {(item as any).remark && (
                          <span style={{ color: 'var(--text-muted)' }}>· {(item as any).remark}</span>
                        )}
                        {!isPasswordMode && !(item as any).account && !(item as any).website && (
                          <span style={{ color: 'var(--text-muted)' }}>-</span>
                        )}
                      </>
                    ) : (
                      <>
                        <span style={{
                          fontFamily: 'monospace',
                          background: 'rgba(0,0,0,0.05)',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '13px',
                          fontWeight: 500,
                          letterSpacing: '0.5px'
                        }}>
                          {(() => {
                            const key = (item as any).apiKey;
                            if (!key) return '-';
                            if (key.length <= 10) return key;
                            return `${key.substring(0, 5)}...${key.substring(key.length - 5)}`;
                          })()}
                        </span>
                        {(item as any).connectionUrl && (
                          <span
                            style={{
                              color: 'var(--text-muted)',
                              fontSize: '12px',
                              marginLeft: '8px',
                              cursor: 'pointer'
                            }}
                            title="打开链接"
                            onClick={() => {
                              const url = (item as any).connectionUrl;
                              if (url) {
                                const electronShell = (window as any).electron?.shell?.openExternal;
                                if (electronShell) {
                                  electronShell(url);
                                } else {
                                  window.open(url, '_blank');
                                }
                              }
                            }}
                          >
                            <i className="fa-solid fa-link" style={{ marginRight: '3px', opacity: 0.6 }}></i>
                          </span>
                        )}
                        {(item as any).remark && (
                          <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>· {(item as any).remark}</span>
                        )}
                        {/* 过期时间 */}
                        {!(item as any).expirationDate ? (
                          <span style={{
                            marginLeft: '10px',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 500,
                            background: 'rgba(16, 185, 129, 0.1)',
                            color: '#10B981'
                          }}>
                            <i className="fa-solid fa-infinity" style={{ marginRight: '4px', opacity: 0.7 }}></i>
                            永不过期
                          </span>
                        ) : (item as any).expirationDate && (
                          <span style={{
                            marginLeft: '10px',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 500,
                            background: (() => {
                              const expDate = new Date((item as any).expirationDate);
                              const now = new Date();
                              const daysLeft = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                              if (daysLeft < 0) return 'rgba(239, 68, 68, 0.15)';
                              if (daysLeft <= 7) return 'rgba(245, 158, 11, 0.15)';
                              if (daysLeft <= 30) return 'rgba(16, 185, 129, 0.15)';
                              return 'rgba(107, 114, 128, 0.1)';
                            })(),
                            color: (() => {
                              const expDate = new Date((item as any).expirationDate);
                              const now = new Date();
                              const daysLeft = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                              if (daysLeft < 0) return '#EF4444';
                              if (daysLeft <= 7) return '#F59E0B';
                              if (daysLeft <= 30) return '#10B981';
                              return '#6B7280';
                            })()
                          }}>
                            <i className="fa-solid fa-clock" style={{ marginRight: '4px', opacity: 0.7 }}></i>
                            {(() => {
                              const expDate = new Date((item as any).expirationDate);
                              const now = new Date();
                              const daysLeft = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                              if (daysLeft < 0) return `已过期`;
                              if (daysLeft === 0) return `今天过期`;
                              if (daysLeft === 1) return `明天过期`;
                              if (daysLeft <= 7) return `${daysLeft}天后过期`;
                              if (daysLeft <= 30) return `${Math.ceil(daysLeft / 7)}周后过期`;
                              return `${formatTime((item as any).expirationDate)}到期`;
                            })()}
                          </span>
                        )}
                        {/* 提醒时间 - 只在启用提醒时显示 */}
                        {(item as any).expirationDate && (item as any).reminderDays > 0 && (
                          <span style={{
                            marginLeft: '6px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            background: 'rgba(96, 165, 250, 0.1)',
                            color: '#60A5FA'
                          }}>
                            提前{(item as any).reminderDays}天提醒
                          </span>
                        )}
                      </>
                    )}
                    <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <i className="fa-solid fa-pen-to-square" style={{ opacity: 0.5, fontSize: '10px' }}></i>
                      {formatTime(item.updatedAt || item.createdAt)}
                    </span>
                  </div>
                </div>

                {/* 操作按钮 */}
                <div style={{ display: 'flex', gap: '6px', marginLeft: '12px' }}>
                  <div
                    className="icon-btn"
                    onClick={() => {
                      setModalMode('edit');
                      setEditingId(item.id);
                      if (isPasswordMode) {
                        const p = item as any;
                        setFormData({
                          title: p.title, website: p.website || '', account: p.account || '', password: p.password, remark: p.remark || '', tags: (p.tags || []).join(', '), iconUrl: p.iconUrl || '',
                          name: '', apiKey: '', platform: '', connectionUrl: '',
                          expirationDate: '', expirationNever: true, reminderDays: 0
                        });
                      } else {
                        const k = item as any;
                        setFormData({
                          title: '', website: '', account: '', password: '', remark: '', tags: '', iconUrl: k.iconUrl || '',
                          name: k.name, apiKey: k.apiKey, platform: k.platform || '',
                          connectionUrl: k.connectionUrl || '',
                          expirationDate: k.expirationDate || '',
                          expirationNever: !k.expirationDate,
                          reminderDays: k.reminderDays ?? 0
                        });
                      }
                      setShowModal(true);
                    }}
                    style={{ width: '36px', height: '36px' }}
                    title="编辑"
                  >
                    <i className="fa-solid fa-pen"></i>
                  </div>
                  <div
                    className="icon-btn"
                    onClick={() => copyToClipboard(
                      isPasswordMode ? (item as any).password : (item as any).apiKey,
                      isPasswordMode ? '密码' : 'API Key'
                    )}
                    style={{ width: '36px', height: '36px' }}
                    title="复制"
                  >
                    <i className="fa-solid fa-copy"></i>
                  </div>
                  <div
                    className="icon-btn"
                    onClick={() => {
                      setDeleteTarget({
                        id: item.id,
                        type: isPasswordMode ? 'password' : 'apikey',
                        title: isPasswordMode ? (item as any).title : (item as any).name
                      });
                      setShowDeleteModal(true);
                    }}
                    style={{ width: '36px', height: '36px', color: 'var(--accent-red)' }}
                    title="删除"
                  >
                    <i className="fa-solid fa-trash"></i>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Modal - Portal */}
      {showModal && ReactDOM.createPortal(
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000
        }} onClick={() => setShowModal(false)}>
          <div
            className="card"
            style={{
              width: '440px',
              maxWidth: '90vw',
              maxHeight: '90vh',
              overflow: 'auto',
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(255, 255, 255, 0.85))'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header with Icon */}
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid rgba(0, 0, 0, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: isPasswordMode
                ? 'linear-gradient(135deg, #FF8E53, #FF6A00)'
                : 'linear-gradient(135deg, #9D50BB, #6E48AA)',
              color: 'white'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <i className={`fa-solid ${isPasswordMode ? 'fa-lock' : 'fa-key'}`} style={{ fontSize: '18px' }}></i>
                </div>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 600 }}>
                    {modalMode === 'add' ? `添加${isPasswordMode ? '密码' : 'API Key'}` : `编辑${isPasswordMode ? '密码' : 'API Key'}`}
                  </div>
                  <div style={{ fontSize: '12px', opacity: 0.9 }}>
                    {isPasswordMode ? '安全存储您的密码' : '管理您的 API Key'}
                  </div>
                </div>
              </div>
              <div
                onClick={() => setShowModal(false)}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: 'rgba(255, 255, 255, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                <i className="fa-solid fa-times"></i>
              </div>
            </div>

            {/* Website Icon Display */}
            {isPasswordMode && (
              <div style={{
                padding: '24px 24px 16px 24px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '12px'
              }}>
                {/* Large Icon */}
                <div style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '16px',
                  background: 'rgba(255, 255, 255, 0.9)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)',
                  border: '1px solid rgba(0, 0, 0, 0.08)',
                  overflow: 'hidden'
                }}>
                  {fetchingIcon ? (
                    <i className="fa-solid fa-circle-notch fa-spin" style={{ fontSize: '28px', color: '#FF8E53' }}></i>
                  ) : formData.iconUrl ? (
                    <img
                      src={formData.iconUrl}
                      alt="网站图标"
                      style={{ width: '40px', height: '40px', objectFit: 'contain' }}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <i className="fa-solid fa-globe" style={{ fontSize: '28px', color: '#FF8E53' }}></i>
                  )}
                </div>
              </div>
            )}

            {/* API Key Icon Display */}
            {!isPasswordMode && (
              <div style={{
                padding: '24px 24px 16px 24px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '12px'
              }}>
                {/* Large Icon */}
                <div style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '16px',
                  background: 'rgba(255, 255, 255, 0.9)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)',
                  border: '1px solid rgba(0, 0, 0, 0.08)',
                  overflow: 'hidden'
                }}>
                  {fetchingIcon ? (
                    <i className="fa-solid fa-circle-notch fa-spin" style={{ fontSize: '28px', color: '#9D50BB' }}></i>
                  ) : formData.iconUrl ? (
                    <img
                      src={formData.iconUrl}
                      alt="网站图标"
                      style={{ width: '40px', height: '40px', objectFit: 'contain' }}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <i className="fa-solid fa-link" style={{ fontSize: '28px', color: '#9D50BB' }}></i>
                  )}
                </div>
              </div>
            )}

            {/* Form */}
            <div style={{ padding: isPasswordMode ? '0 24px 24px 24px' : '24px' }}>
              {isPasswordMode ? (
                <>
                  {/* 密码表单 */}
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      标题 <span style={{ color: '#EF4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      placeholder="例如：GitHub 账号"
                      style={{
                        width: '100%',
                        padding: '12px 14px',
                        border: '1px solid rgba(0, 0, 0, 0.1)',
                        borderRadius: '10px',
                        fontSize: '14px',
                        background: 'rgba(255, 255, 255, 0.8)',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      账号
                    </label>
                    <input
                      type="text"
                      value={formData.account}
                      onChange={(e) => setFormData({ ...formData, account: e.target.value })}
                      placeholder="例如：my@email.com 或用户名"
                      style={{
                        width: '100%',
                        padding: '12px 14px',
                        border: '1px solid rgba(0, 0, 0, 0.1)',
                        borderRadius: '10px',
                        fontSize: '14px',
                        background: 'rgba(255, 255, 255, 0.8)',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      网站
                    </label>
                    <input
                      type="text"
                      value={formData.website}
                      onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                      placeholder="例如：github.com"
                      style={{
                        width: '100%',
                        padding: '12px 14px',
                        border: '1px solid rgba(0, 0, 0, 0.1)',
                        borderRadius: '10px',
                        fontSize: '14px',
                        background: 'rgba(255, 255, 255, 0.8)',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                    {/* 提示：正在获取图标 */}
                    {fetchingIcon && (
                      <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#3B82F6' }}>
                        <i className="fa-solid fa-circle-notch fa-spin"></i>
                        正在获取网站图标...
                      </div>
                    )}
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      密码 <span style={{ color: '#EF4444' }}>*</span>
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        placeholder="输入密码"
                        style={{
                          width: '100%',
                          padding: '12px 14px',
                          paddingRight: '44px',
                          border: '1px solid rgba(0, 0, 0, 0.1)',
                          borderRadius: '10px',
                          fontSize: '14px',
                          background: 'rgba(255, 255, 255, 0.8)',
                          outline: 'none',
                          boxSizing: 'border-box'
                        }}
                      />
                      <div
                        onClick={() => setShowPassword(!showPassword)}
                        style={{
                          position: 'absolute',
                          right: '12px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          cursor: 'pointer',
                          color: 'var(--text-secondary)'
                        }}
                      >
                        <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      备注
                    </label>
                    <input
                      type="text"
                      value={formData.remark}
                      onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
                      placeholder="可选备注信息"
                      style={{
                        width: '100%',
                        padding: '12px 14px',
                        border: '1px solid rgba(0, 0, 0, 0.1)',
                        borderRadius: '10px',
                        fontSize: '14px',
                        background: 'rgba(255, 255, 255, 0.8)',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                </>
              ) : (
                <>
                  {/* API Key 表单 */}
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      名称 <span style={{ color: '#EF4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="例如：OpenAI 主密钥"
                      style={{
                        width: '100%',
                        padding: '12px 14px',
                        border: '1px solid rgba(0, 0, 0, 0.1)',
                        borderRadius: '10px',
                        fontSize: '14px',
                        background: 'rgba(255, 255, 255, 0.8)',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      平台 <span style={{ color: '#EF4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.platform}
                      onChange={(e) => setFormData({ ...formData, platform: e.target.value })}
                      placeholder="例如：OpenAI、Claude、DeepSeek"
                      style={{
                        width: '100%',
                        padding: '12px 14px',
                        border: '1px solid rgba(0, 0, 0, 0.1)',
                        borderRadius: '10px',
                        fontSize: '14px',
                        background: 'rgba(255, 255, 255, 0.8)',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      API Key <span style={{ color: '#EF4444' }}>*</span>
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showApiKeyPassword ? 'text' : 'password'}
                        value={formData.apiKey}
                        onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                        placeholder="sk-..."
                        style={{
                          width: '100%',
                          padding: '12px 14px',
                          paddingRight: '44px',
                          border: '1px solid rgba(0, 0, 0, 0.1)',
                          borderRadius: '10px',
                          fontSize: '14px',
                          background: 'rgba(255, 255, 255, 0.8)',
                          outline: 'none',
                          boxSizing: 'border-box',
                          fontFamily: 'monospace'
                        }}
                      />
                      <div
                        onClick={() => setShowApiKeyPassword(!showApiKeyPassword)}
                        style={{
                          position: 'absolute',
                          right: '12px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          cursor: 'pointer',
                          color: 'var(--text-secondary)'
                        }}
                      >
                        <i className={`fa-solid ${showApiKeyPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      获取地址 <span style={{ color: '#9CA3AF' }}>(可选)</span>
                    </label>
                    <input
                      type="text"
                      value={formData.connectionUrl}
                      onChange={(e) => setFormData({ ...formData, connectionUrl: e.target.value })}
                      placeholder="例如：https://api.openai.com/v1"
                      style={{
                        width: '100%',
                        padding: '12px 14px',
                        border: '1px solid rgba(0, 0, 0, 0.1)',
                        borderRadius: '10px',
                        fontSize: '14px',
                        background: 'rgba(255, 255, 255, 0.8)',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  {/* 过期时间 */}
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      过期时间 <span style={{ color: '#9CA3AF' }}>(可选)</span>
                    </label>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <input
                        type={formData.expirationNever ? 'text' : 'date'}
                        value={formData.expirationNever ? '' : formData.expirationDate}
                        onChange={(e) => setFormData({ ...formData, expirationDate: e.target.value })}
                        disabled={formData.expirationNever}
                        style={{
                          flex: 1,
                          padding: '12px 14px',
                          border: '1px solid rgba(0, 0, 0, 0.1)',
                          borderRadius: '10px',
                          fontSize: '14px',
                          background: formData.expirationNever ? 'rgba(0, 0, 0, 0.03)' : 'rgba(255, 255, 255, 0.8)',
                          outline: 'none',
                          boxSizing: 'border-box',
                          cursor: formData.expirationNever ? 'not-allowed' : 'pointer'
                        }}
                      />
                      <label style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '10px 14px',
                        background: formData.expirationNever ? 'rgba(16, 185, 129, 0.1)' : 'rgba(0, 0, 0, 0.03)',
                        borderRadius: '10px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        color: formData.expirationNever ? '#10B981' : 'var(--text-secondary)',
                        fontWeight: 500,
                        transition: 'all 0.2s ease'
                      }}>
                        <input
                          type="checkbox"
                          checked={formData.expirationNever}
                          onChange={(e) => setFormData({ ...formData, expirationNever: e.target.checked })}
                          style={{ display: 'none' }}
                        />
                        <i className={`fa-solid ${formData.expirationNever ? 'fa-check-circle' : 'fa-circle'}`}></i>
                        永不过期
                      </label>
                    </div>
                  </div>

                  {/* 过期提醒 - 只在设置了过期时间且非永不过期时显示 */}
                  {!formData.expirationNever && formData.expirationDate && (
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                        过期提醒 <span style={{ color: '#9CA3AF', fontWeight: 400 }}>(可选)</span>
                      </label>
                      <select
                        value={formData.reminderDays}
                        onChange={(e) => {
                          const value = parseInt(e.target.value);
                          setFormData({
                            ...formData,
                            reminderDays: value
                          });
                        }}
                        style={{
                          width: '100%',
                          padding: '12px 14px',
                          border: '1px solid rgba(0, 0, 0, 0.1)',
                          borderRadius: '10px',
                          fontSize: '14px',
                          background: 'rgba(255, 255, 255, 0.8)',
                          outline: 'none',
                          boxSizing: 'border-box',
                          cursor: 'pointer'
                        }}
                      >
                        <option value={0}>-- 不提醒 --</option>
                        <option value={30}>提前 1 个月提醒</option>
                        <option value={7}>提前 7 天提醒</option>
                        <option value={3}>提前 3 天提醒</option>
                        <option value={1}>提前 1 天提醒</option>
                      </select>
                    </div>
                  )}

                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      备注 <span style={{ color: '#9CA3AF' }}>(可选)</span>
                    </label>
                    <input
                      type="text"
                      value={formData.remark}
                      onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
                      placeholder="可选备注信息"
                      style={{
                        width: '100%',
                        padding: '12px 14px',
                        border: '1px solid rgba(0, 0, 0, 0.1)',
                        borderRadius: '10px',
                        fontSize: '14px',
                        background: 'rgba(255, 255, 255, 0.8)',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                </>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: '12px' }}>
                <div
                  onClick={() => setShowModal(false)}
                  style={{
                    flex: 1,
                    padding: '14px',
                    borderRadius: '12px',
                    background: 'rgba(0, 0, 0, 0.05)',
                    color: 'var(--text-secondary)',
                    fontSize: '14px',
                    fontWeight: 500,
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  取消
                </div>
                <div
                  onClick={() => {
                    const isValid = isPasswordMode
                      ? formData.title && formData.password
                      : formData.name && formData.apiKey;
                    if (!isValid) {
                      showToast('请填写必填项', 'error');
                      return;
                    }
                    // 验证过期提醒时间
                    if (!isPasswordMode && !formData.expirationNever && formData.expirationDate && formData.reminderDays > 0) {
                      const expDate = new Date(formData.expirationDate);
                      const now = new Date();
                      const daysUntilExpiry = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                      if (daysUntilExpiry < formData.reminderDays) {
                        showToast(`提醒时间不能晚于过期时间（剩余${daysUntilExpiry}天）`, 'error');
                        return;
                      }
                    }
                    if (modalMode === 'add') {
                      if (isPasswordMode) {
                        addPassword({
                          title: formData.title,
                          website: formData.website,
                          account: formData.account,
                          password: formData.password,
                          remark: formData.remark,
                          iconUrl: formData.iconUrl
                        });
                        showToast('密码添加成功', 'success');
                      } else {
                        addApiKey({
                          name: formData.name,
                          apiKey: formData.apiKey,
                          platform: formData.platform,
                          connectionUrl: formData.connectionUrl,
                          iconUrl: formData.iconUrl,
                          expirationDate: formData.expirationNever ? '' : formData.expirationDate,
                          reminderDays: formData.reminderDays,
                          remark: formData.remark
                        });
                        showToast('API Key 添加成功', 'success');
                      }
                    } else if (editingId) {
                      if (isPasswordMode) {
                        updatePassword(editingId, {
                          title: formData.title,
                          website: formData.website,
                          account: formData.account,
                          password: formData.password,
                          remark: formData.remark,
                          iconUrl: formData.iconUrl
                        });
                        showToast('密码已更新', 'success');
                      } else {
                        updateApiKey(editingId, {
                          name: formData.name,
                          apiKey: formData.apiKey,
                          platform: formData.platform,
                          connectionUrl: formData.connectionUrl,
                          iconUrl: formData.iconUrl,
                          expirationDate: formData.expirationNever ? '' : formData.expirationDate,
                          reminderDays: formData.reminderDays,
                          remark: formData.remark
                        });
                        showToast('API Key 已更新', 'success');
                      }
                    }
                    setShowModal(false);
                  }}
                  style={{
                    flex: 1,
                    padding: '14px',
                    borderRadius: '12px',
                    background: isPasswordMode ? 'linear-gradient(135deg, #FF8E53, #FF6A00)' : 'linear-gradient(135deg, #9D50BB, #6E48AA)',
                    color: 'white',
                    fontSize: '14px',
                    fontWeight: 500,
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  {modalMode === 'add' ? '添加' : '保存'}
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Toast - Portal */}
      {toast && ReactDOM.createPortal(
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          padding: '14px 28px',
          background: toast.type === 'success' ? '#10B981' : '#EF4444',
          color: 'white',
          borderRadius: '12px',
          fontSize: '14px',
          fontWeight: 500,
          boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <i className={`fa-solid ${toast.type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}`}></i>
          {toast.msg}
        </div>,
        document.body
      )}

      {/* Delete Confirmation Modal - Portal */}
      {showDeleteModal && deleteTarget && ReactDOM.createPortal(
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }} onClick={() => setShowDeleteModal(false)}>
          <div
            style={{
              width: '360px',
              maxWidth: '90vw',
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(255, 255, 255, 0.85))',
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: '0 16px 48px rgba(0, 0, 0, 0.15)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              padding: '24px',
              textAlign: 'center'
            }}>
              {/* Warning Icon */}
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'rgba(239, 68, 68, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px'
              }}>
                <i className="fa-solid fa-triangle-exclamation" style={{ fontSize: '28px', color: '#EF4444' }}></i>
              </div>

              <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-primary)' }}>
                确认删除
              </div>
              <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
                确定要删除 <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{deleteTarget.title}</span> 吗？
                <br />
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>此操作无法撤销</span>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '12px' }}>
                <div
                  onClick={() => setShowDeleteModal(false)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '12px',
                    background: 'rgba(0, 0, 0, 0.05)',
                    color: 'var(--text-secondary)',
                    fontSize: '14px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  取消
                </div>
                <div
                  onClick={() => {
                    if (deleteTarget.type === 'password') {
                      deletePassword(deleteTarget.id);
                      showToast('密码已删除', 'success');
                    } else {
                      deleteApiKey(deleteTarget.id);
                      showToast('API Key 已删除', 'success');
                    }
                    setShowDeleteModal(false);
                    setDeleteTarget(null);
                  }}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '12px',
                    background: '#EF4444',
                    color: 'white',
                    fontSize: '14px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  删除
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

    </>
  );
}

// ============================================
// 邮箱视图
// ============================================
function EmailView() {
  const [accounts, setAccounts] = useState<Array<{
    id: string;
    email: string;
    provider: string;
    unread_count: number;
    created_at: number;
  }>>([]);
  const [providers, setProviders] = useState<Array<{id: string, name: string, icon: string}>>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<{
    id: string;
    email: string;
    provider: string;
    password?: string;
  } | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<any>(null);
  const [messages, setMessages] = useState<Array<any>>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showToast, setShowToast] = useState<{msg: string, type: string} | null>(null);

  // 添加邮箱表单
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newProvider, setNewProvider] = useState('');
  const [adding, setAdding] = useState(false);

  // 编辑邮箱表单
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editProvider, setEditProvider] = useState('');
  const [editing, setEditing] = useState(false);
  const [showEditPassword, setShowEditPassword] = useState(false);

  // 打开编辑弹窗
  const handleEditAccount = async (account: any) => {
    setEditingAccount(account);
    setEditEmail(account.email);
    setEditProvider(account.provider);
    setShowEditPassword(false);

    // 获取账户详情（包括密码）
    try {
      const res = await fetch(getServerUrl(`/api/email/accounts/${account.id}`));
      const data = await res.json();
      if (data.success) {
        setEditPassword(data.account.password || '');
      } else {
        setEditPassword('');
      }
    } catch {
      setEditPassword('');
    }

    setShowEditModal(true);
  };

  // 保存编辑
  const handleSaveEdit = async () => {
    if (!editingAccount || !editEmail || !editProvider) {
      setShowToast({ msg: '请填写完整信息', type: 'error' });
      return;
    }

    setEditing(true);
    try {
      const res = await fetch(getServerUrl(`/api/email/accounts/${editingAccount.id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: editEmail,
          provider: editProvider,
          password: editPassword || undefined
        })
      });
      const data = await res.json();
      if (data.success) {
        setShowToast({ msg: '更新成功', type: 'success' });
        setShowEditModal(false);
        fetchAccounts();
      } else {
        setShowToast({ msg: data.error || '更新失败', type: 'error' });
      }
    } catch (err) {
      setShowToast({ msg: '更新失败', type: 'error' });
    } finally {
      setEditing(false);
    }
  };

  // 获取所有邮箱提供商
  const fetchProviders = async () => {
    try {
      const res = await fetch(getServerUrl('/api/email/providers'));
      const data = await res.json();
      if (data.success) {
        setProviders(data.providers);
      }
    } catch (err) {
      console.error('获取邮箱提供商失败:', err);
    }
  };

  // 获取所有邮箱账户
  const fetchAccounts = async () => {
    try {
      const res = await fetch(getServerUrl('/api/email/accounts'));
      const data = await res.json();
      if (data.success) {
        setAccounts(data.accounts);
      }
    } catch (err) {
      console.error('获取邮箱账户失败:', err);
    } finally {
      setLoading(false);
    }
  };

  // 获取邮件列表
  const fetchMessages = async (accountId: string, unreadOnly = false) => {
    setMessagesLoading(true);
    try {
      const res = await fetch(getServerUrl(`/api/email/accounts/${accountId}/messages?unread_only=${unreadOnly}`));
      const data = await res.json();
      if (data.success) {
        setMessages(data.messages || []);
      }
    } catch (err) {
      console.error('获取邮件失败:', err);
    } finally {
      setMessagesLoading(false);
    }
  };

  // 同步邮件
  const syncEmails = async (accountId: string) => {
    try {
      setSyncing(true);
      const res = await fetch(getServerUrl(`/api/email/accounts/${accountId}/sync`), { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setShowToast({ msg: `同步成功，获取 ${data.fetched_count} 封新邮件`, type: 'success' });
        fetchAccounts();
        if (selectedAccount === accountId) {
          fetchMessages(accountId, true);
        }
      } else {
        setShowToast({ msg: data.error || '同步失败', type: 'error' });
      }
    } catch (err) {
      console.error('同步失败:', err);
      setShowToast({ msg: '同步失败', type: 'error' });
    } finally {
      setSyncing(false);
    }
  };

  // 一键已读
  const markAllAsRead = async (accountId: string) => {
    try {
      const res = await fetch(getServerUrl(`/api/email/accounts/${accountId}/mark-read`), { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setShowToast({ msg: '已标记全部为已读', type: 'success' });
        fetchAccounts();
        fetchMessages(accountId, true);
      }
    } catch (err) {
      setShowToast({ msg: '操作失败', type: 'error' });
    }
  };

  // 单个标记为已读
  const markAsRead = async (accountId: string, messageId: string) => {
    try {
      const res = await fetch(getServerUrl(`/api/email/accounts/${accountId}/mark-read/${messageId}`), {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        // 更新本地状态
        setMessages(prev => prev.map(m =>
          m.id === messageId ? { ...m, is_read: true } : m
        ));
        fetchAccounts();
      }
    } catch (err) {
      console.error('标记已读失败:', err);
    }
  };

  // 选择邮件并加载详情
  const handleSelectMessage = async (previewMsg: any) => {
    // 先显示预览数据并标记加载中
    setSelectedMessage({ ...previewMsg, isLoading: true });

    // 如果这封邮件是未读的，本地先标记为已读（UI更新）
    if (!previewMsg.is_read && selectedAccount) {
      markAsRead(selectedAccount, previewMsg.id);
    }

    try {
      // 请求后端获取完整内容
      const res = await fetch(getServerUrl(`/api/email/accounts/${selectedAccount}/messages/${previewMsg.id}`));
      const data = await res.json();

      if (data.success) {
        setSelectedMessage((prev: any) => ({
          ...prev,
          ...data.message,
          isLoading: false
        }));
      } else {
        setSelectedMessage((prev: any) => ({ ...prev, isLoading: false, body: '获取失败' }));
      }
    } catch (err) {
      setSelectedMessage((prev: any) => ({ ...prev, isLoading: false, body: '网络请求错误' }));
    }
  };

  // 添加邮箱
  const handleAddEmail = async () => {
    if (!newEmail || !newPassword || !newProvider) {
      setShowToast({ msg: '请填写完整信息', type: 'error' });
      return;
    }

    setAdding(true);
    try {
      const res = await fetch(getServerUrl('/api/email/accounts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail, password: newPassword, provider: newProvider })
      });
      const data = await res.json();
      if (data.success) {
        setShowToast({ msg: '邮箱添加成功', type: 'success' });
        setShowAddModal(false);
        setNewEmail('');
        setNewPassword('');
        setNewProvider('');
        fetchAccounts();
      } else {
        setShowToast({ msg: data.error || '添加失败', type: 'error' });
      }
    } catch (err) {
      setShowToast({ msg: '添加失败', type: 'error' });
    } finally {
      setAdding(false);
    }
  };

  // 删除邮箱确认
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [accountToDelete, setAccountToDelete] = useState<string | null>(null);

  // 打开删除确认弹窗
  const confirmDeleteAccount = (accountId: string) => {
    setAccountToDelete(accountId);
    setShowDeleteConfirm(true);
  };

  // 执行删除
  const handleDeleteAccount = async () => {
    if (!accountToDelete) return;

    try {
      const res = await fetch(getServerUrl(`/api/email/accounts/${accountToDelete}`), { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setShowToast({ msg: '删除成功', type: 'success' });
        if (selectedAccount === accountToDelete) {
          setSelectedAccount(null);
        }
        fetchAccounts();
      }
    } catch (err) {
      setShowToast({ msg: '删除失败', type: 'error' });
    }
    setShowDeleteConfirm(false);
    setAccountToDelete(null);
  };

  // 取消删除
  const cancelDeleteAccount = () => {
    setShowDeleteConfirm(false);
    setAccountToDelete(null);
  };

  // 选择账户
  const handleSelectAccount = (accountId: string) => {
    setSelectedAccount(accountId);
    fetchMessages(accountId, true);
  };

  useEffect(() => {
    fetchProviders();
    fetchAccounts();
  }, []);

  useEffect(() => {
    if (showToast) {
      const timer = setTimeout(() => setShowToast(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [showToast]);

  const selectedAccountData = accounts.find(a => a.id === selectedAccount);

  return (
    <>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      <div className="page-header" style={{ margin: '-20px -24px 20px -24px', padding: '16px 24px' }}>
        <div>
          <div className="page-title">邮箱管理</div>
          <div className="page-subtitle">绑定邮箱账号，收发未读邮件</div>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => {
              // 同步所有邮箱
              accounts.forEach(acc => syncEmails(acc.id));
            }}
            disabled={accounts.length === 0 || syncing}
            className="btn-primary"
            style={{
              padding: '8px 16px',
              background: 'linear-gradient(135deg, #10B981, #059669)',
              border: 'none',
              borderRadius: '8px',
              color: 'white',
              fontSize: '14px',
              cursor: accounts.length === 0 || syncing ? 'not-allowed' : 'pointer',
              opacity: accounts.length === 0 || syncing ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <i className="fa-solid fa-sync-alt" style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }}></i>
            全部同步
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="btn-primary"
            style={{
              padding: '8px 16px',
              background: 'linear-gradient(135deg, #9D50BB, #6E48AA)',
              border: 'none',
              borderRadius: '8px',
              color: 'white',
              fontSize: '14px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <i className="fa-solid fa-plus"></i>
            添加邮箱
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '20px', height: 'calc(100vh - 180px)' }}>
        {/* 第一级：邮箱账户列表 - 默认占满全屏，选择邮箱后隐藏 */}
        {!selectedAccount && (
          <div style={{ flex: 1 }}>
            <div className="card" style={{ padding: '16px', height: '100%', display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '12px' }}>
                已绑定邮箱 ({accounts.length})
              </div>

              {loading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="fa-solid fa-circle-notch fa-spin" style={{ marginRight: '8px' }}></i>
                  加载中...
                </div>
              ) : accounts.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                  <div style={{ fontSize: '40px', marginBottom: '12px', opacity: 0.5 }}>
                    <i className="fa-solid fa-envelope"></i>
                  </div>
                  <div>暂无绑定邮箱</div>
                  <div style={{ fontSize: '12px', marginTop: '8px' }}>点击右上角添加邮箱</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, overflow: 'auto' }}>
                  {accounts.map(account => (
                    <div
                      key={account.id}
                      onClick={() => {
                        handleSelectAccount(account.id);
                        setSelectedMessage(null);
                      }}
                      style={{
                        padding: '14px',
                        borderRadius: '10px',
                        background: 'rgba(255, 255, 255, 0.5)',
                        border: '1px solid transparent',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '8px',
                            background: 'linear-gradient(135deg, #9D50BB, #6E48AA)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            <i className="fa-solid fa-envelope" style={{ color: 'white', fontSize: '14px' }}></i>
                          </div>
                          <div>
                            <div style={{ fontWeight: 500, fontSize: '13px' }}>{account.email}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{account.provider}</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {account.unread_count > 0 && (
                            <span style={{
                              background: '#EF4444',
                              color: 'white',
                              padding: '2px 8px',
                              borderRadius: '10px',
                              fontSize: '11px',
                              fontWeight: 600
                            }}>
                              {account.unread_count}
                            </span>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditAccount(account);
                            }}
                            title="编辑"
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '6px',
                              border: 'none',
                              background: 'rgba(0, 0, 0, 0.05)',
                              color: '#6B7280',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            <i className="fa-solid fa-pen" style={{ fontSize: '12px' }}></i>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              confirmDeleteAccount(account.id);
                            }}
                            title="删除"
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '6px',
                              border: 'none',
                              background: 'rgba(239, 68, 68, 0.1)',
                              color: '#EF4444',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            <i className="fa-solid fa-trash" style={{ fontSize: '12px' }}></i>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 第二级：选择邮箱后显示两列 - 左侧邮件列表，右侧邮件内容 */}
        {selectedAccount && selectedAccountData && (
          <div style={{ flex: 1, display: 'flex', gap: '20px' }}>
            {/* 左侧：邮件列表 */}
            <div style={{ width: '380px', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
              <div className="card" style={{ padding: '16px', height: '100%', display: 'flex', flexDirection: 'column' }}>
                {/* 邮件列表头部 */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button
                      onClick={() => setSelectedAccount(null)}
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '6px',
                        border: 'none',
                        background: 'rgba(0, 0, 0, 0.05)',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                      title="返回邮箱列表"
                    >
                      <i className="fa-solid fa-arrow-left"></i>
                    </button>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '14px' }}>{selectedAccountData.email}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {messages.filter(m => !m.is_read).length} 封未读邮件
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => syncEmails(selectedAccount)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      border: 'none',
                      background: 'linear-gradient(135deg, #9D50BB, #6E48AA)',
                      color: 'white',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    <i className="fa-solid fa-sync-alt" style={{ marginRight: '4px' }}></i>
                    同步
                  </button>
                </div>

                {/* 邮件列表 */}
                {messagesLoading ? (
                  <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className="fa-solid fa-circle-notch fa-spin" style={{ marginRight: '8px' }}></i>
                    加载中...
                  </div>
                ) : messages.length === 0 ? (
                  <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ fontSize: '40px', marginBottom: '12px', opacity: 0.5 }}>
                      <i className="fa-regular fa-folder-open"></i>
                    </div>
                    <div style={{marginLeft: '5px'}}>暂无未读邮件</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, overflow: 'auto' }}>
                    {messages.map(msg => (
                      <div
                        key={msg.id}
                        onClick={() => handleSelectMessage(msg)}
                        style={{
                          padding: '14px',
                          borderRadius: '8px',
                          background: selectedMessage?.id === msg.id
                            ? 'rgba(157, 80, 187, 0.1)'
                            : msg.is_read ? 'transparent' : 'rgba(157, 80, 187, 0.05)',
                          border: selectedMessage?.id === msg.id
                            ? '1px solid rgba(157, 80, 187, 0.4)'
                            : '1px solid rgba(0, 0, 0, 0.05)',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                              <span style={{ fontWeight: msg.is_read ? 400 : 600, fontSize: '13px' }}>
                                {msg.sender_email || msg.sender || '未知发件人'}
                              </span>
                              {!msg.is_read && (
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#9D50BB' }}></span>
                              )}
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                              {msg.subject || '无主题'}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                              {msg.date}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            {!msg.is_read && (
                              <button
                                onClick={(e) => { e.stopPropagation(); markAsRead(selectedAccount, msg.id); }}
                                title="标记为已读"
                                style={{
                                  width: '28px',
                                  height: '28px',
                                  borderRadius: '6px',
                                  border: 'none',
                                  background: 'rgba(16, 185, 129, 0.1)',
                                  color: '#10B981',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}
                              >
                                <i className="fa-regular fa-check-circle" style={{ fontSize: '12px' }}></i>
                              </button>
                            )}
                            {msg.sender_email && (
                              <button
                                onClick={() => {
                                  const url = `https://mail.${selectedAccountData.provider === 'gmail' ? 'google' : selectedAccountData.provider === 'qq' ? 'qq' : ''}.com/mail`;
                                  (window as any).electron?.shell?.openExternal?.(url);
                                }}
                                title="网页回复"
                                style={{
                                  width: '28px',
                                  height: '28px',
                                  borderRadius: '6px',
                                  border: 'none',
                                  background: 'rgba(157, 80, 187, 0.1)',
                                  color: '#9D50BB',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}
                              >
                                <i className="fa-regular fa-paper-plane" style={{ fontSize: '12px' }}></i>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 右侧：邮件内容 */}
            {selectedMessage ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <div className="card" style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                  {/* 邮件头部 */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid rgba(0, 0, 0, 0.08)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>
                        {selectedMessage.subject || '无主题'}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                        <div style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, #9D50BB, #6E48AA)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white',
                          fontWeight: 600,
                          fontSize: '14px'
                        }}>
                          {(selectedMessage.sender || '?')[0].toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 500, fontSize: '14px' }}>
                            {selectedMessage.sender || '未知发件人'}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            {selectedMessage.sender_email}
                          </div>
                        </div>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        收件人：{selectedMessage.recipients || selectedAccountData?.email}
                      </div>
                      {selectedMessage.from_raw && selectedMessage.from_raw !== selectedMessage.sender && (
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>原始发件人：</span>{selectedMessage.from_raw}
                        </div>
                      )}
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        {selectedMessage.date}
                      </div>
                    </div>
                  </div>

                  {/* 邮件内容 */}
                  <div style={{ flex: 1, overflow: 'auto', fontSize: '14px', lineHeight: '1.6' }}>
                    {selectedMessage.isLoading ? (
                      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        <i className="fa-solid fa-circle-notch fa-spin" style={{ marginRight: '8px' }}></i>
                        正在加载邮件内容...
                      </div>
                    ) : (
                      <>
                        {selectedMessage.body_html ? (
                          <iframe
                            title="Email Content"
                            srcDoc={`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #333; margin: 0; padding: 16px; }
img { max-width: 100%; height: auto; border-radius: 4px; }
a { color: #9D50BB; }
blockquote { border-left: 4px solid #ddd; margin: 0; padding-left: 16px; color: #666; }
pre { background: #f5f5f5; padding: 12px; border-radius: 8px; overflow-x: auto; }
</style>
</head>
<body>
${selectedMessage.body_html}
</body>
</html>`}
                            style={{ width: '100%', height: '100%', border: 'none', minHeight: '300px' }}
                            sandbox="allow-same-origin"
                          />
                        ) : selectedMessage.body ? (
                          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit', margin: 0, padding: '16px' }}>
                            {selectedMessage.body}
                          </pre>
                        ) : (
                          <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>
                            邮件内容为空
                          </div>
                        )}
                        
                        {/* 附件列表 */}
                        {selectedMessage.attachments && selectedMessage.attachments.length > 0 && (
                          <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(0,0,0,0.06)', background: 'rgba(0,0,0,0.02)' }}>
                            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                              <i className="fa-solid fa-paperclip" style={{ marginRight: '6px' }}></i>
                              附件 ({selectedMessage.attachments.length})
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                              {selectedMessage.attachments.map((att: any, idx: number) => (
                                <div 
                                  key={idx} 
                                  onClick={() => {
                                    window.open(getServerUrl(`/api/email/attachments/${att.id}`), '_blank');
                                  }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '8px 12px',
                                    background: 'white',
                                    borderRadius: '6px',
                                    border: '1px solid rgba(0,0,0,0.08)',
                                    fontSize: '12px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'rgba(157, 80, 187, 0.05)';
                                    e.currentTarget.style.borderColor = 'rgba(157, 80, 187, 0.3)';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'white';
                                    e.currentTarget.style.borderColor = 'rgba(0,0,0,0.08)';
                                  }}
                                  title="点击下载"
                                >
                                  <i className={`fa-solid ${att.content_type?.startsWith('image/') ? 'fa-image' : att.content_type?.includes('pdf') ? 'fa-file-pdf' : 'fa-file'}`} 
                                     style={{ color: '#9D50BB' }}></i>
                                  <span style={{ color: 'var(--text-primary)' }}>{att.filename}</span>
                                  {att.size && (
                                    <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                                      ({att.size > 1024 * 1024 ? `${(att.size / 1024 / 1024).toFixed(1)}MB` : `${(att.size / 1024).toFixed(0)}KB`})
                                    </span>
                                  )}
                                  <i className="fa-solid fa-download" style={{ color: 'var(--text-muted)', fontSize: '10px', marginLeft: '4px' }}></i>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                  <i className="fa-regular fa-envelope-open" style={{ fontSize: '48px', marginBottom: '12px', opacity: 0.5 }}></i>
                  <div>点击左侧邮件查看内容</div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 添加邮箱弹窗 */}
      {showAddModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999
          }}
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="card"
            style={{
              width: '420px',
              maxWidth: '90vw',
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(255, 255, 255, 0.85))'
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid rgba(0, 0, 0, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'linear-gradient(135deg, #9D50BB, #6E48AA)',
              color: 'white',
              borderRadius: '12px 12px 0 0'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <i className="fa-solid fa-envelope" style={{ fontSize: '18px' }}></i>
                </div>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 600 }}>添加邮箱</div>
                  <div style={{ fontSize: '12px', opacity: 0.9 }}>绑定您的邮箱账户</div>
                </div>
              </div>
              <div
                onClick={() => setShowAddModal(false)}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: 'rgba(255, 255, 255, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer'
                }}
              >
                <i className="fa-solid fa-times"></i>
              </div>
            </div>

            {/* Form */}
            <div style={{ padding: '24px' }}>
              {/* 邮箱提供商 */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  邮箱提供商
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {providers.map(p => (
                    <div
                      key={p.id}
                      onClick={() => setNewProvider(p.id)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: newProvider === p.id ? '2px solid #9D50BB' : '1px solid rgba(0, 0, 0, 0.1)',
                        background: newProvider === p.id ? 'rgba(157, 80, 187, 0.1)' : 'white',
                        cursor: 'pointer',
                        fontSize: '13px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <span>{p.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 邮箱地址 */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  邮箱地址
                </label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  placeholder="your@email.com"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    border: '1px solid rgba(0, 0, 0, 0.1)',
                    borderRadius: '10px',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* 密码/授权码 */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  密码或授权码
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="邮箱密码或授权码"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    border: '1px solid rgba(0, 0, 0, 0.1)',
                    borderRadius: '10px',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
                <div style={{
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                  marginTop: '6px',
                  lineHeight: '1.6',
                  padding: '10px',
                  background: 'rgba(255, 193, 7, 0.1)',
                  borderRadius: '6px'
                }}>
                  <div style={{ fontWeight: 500, color: '#F59E0B', marginBottom: '4px' }}>
                    <i className="fa-solid fa-exclamation-triangle" style={{ marginRight: '4px' }}></i>
                    重要提示
                  </div>
                  <div style={{ marginBottom: '8px' }}>
                    <strong>QQ邮箱</strong>：需要使用<strong style={{color: '#EF4444'}}>授权码</strong>，不是QQ密码！
                  </div>
                  <div style={{ marginBottom: '4px' }}>QQ邮箱授权码获取步骤：</div>
                  <div style={{ marginLeft: '10px', marginBottom: '8px' }}>
                    1. 登录 <a href="https://mail.qq.com" target="_blank" style={{color: '#9D50BB'}}>mail.qq.com</a><br/>
                    2. 点击右上角 <strong>设置</strong><br/>
                    3. 选择 <strong>账户</strong> 标签<br/>
                    4. 找到 <strong>POP3/IMAP/SMTP/Exchange</strong> 服务<br/>
                    5. 确保 <strong>IMAP/SMTP 服务</strong> 已开启<br/>
                    6. 点击 <strong>生成授权码</strong><br/>
                    7. 发送短信验证，获取16位授权码
                  </div>
                  <div>• Gmail：安全性 → 两步验证 → 应用专用密码</div>
                  <div>• 163邮箱：设置 → 账户 → 开启IMAP → 授权码</div>
                </div>
              </div>

              {/* 提交按钮 */}
              <button
                onClick={handleAddEmail}
                disabled={adding}
                style={{
                  width: '100%',
                  padding: '14px',
                  border: 'none',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #9D50BB, #6E48AA)',
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: adding ? 'not-allowed' : 'pointer',
                  opacity: adding ? 0.7 : 1
                }}
              >
                {adding ? (
                  <><i className="fa-solid fa-circle-notch fa-spin" style={{ marginRight: '8px' }}></i>添加中...</>
                ) : (
                  '添加邮箱'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast - Portal */}
      {showToast && ReactDOM.createPortal(
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          padding: '14px 28px',
          background: showToast.type === 'error' ? 'rgba(239, 68, 68, 0.95)' : 'rgba(16, 185, 129, 0.95)',
          color: 'white',
          borderRadius: '12px',
          fontSize: '14px',
          fontWeight: 500,
          zIndex: 10000,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <i className={`fa-solid ${showToast.type === 'error' ? 'fa-exclamation-circle' : 'fa-check-circle'}`}></i>
          {showToast.msg}
        </div>,
        document.body
      )}

      {/* 编辑邮箱弹窗 - Portal */}
      {showEditModal && editingAccount && ReactDOM.createPortal(
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000
        }} onClick={() => setShowEditModal(false)}>
          <div style={{
            background: 'white',
            borderRadius: '16px',
            padding: '24px',
            width: '400px',
            maxWidth: '90%',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 20px 0', fontSize: '18px', color: '#1F2937' }}>编辑邮箱</h3>

            {/* 邮箱服务商 */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#4B5563' }}>邮箱服务商</label>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '8px'
              }}>
                {['gmail', 'outlook', 'qq', '163', 'yahoo', 'icloud'].map(provider => (
                  <button
                    key={provider}
                    type="button"
                    onClick={() => setEditProvider(provider)}
                    style={{
                      padding: '10px',
                      border: editProvider === provider ? '2px solid #9D50BB' : '2px solid #E5E7EB',
                      borderRadius: '8px',
                      background: 'white',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: editProvider === provider ? 600 : 400,
                      color: editProvider === provider ? '#9D50BB' : '#374151',
                      transition: 'all 0.2s'
                    }}
                  >
                    {providers.find(p => p.id === provider)?.name || provider}
                  </button>
                ))}
              </div>
            </div>

            {/* 邮箱地址 */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#4B5563' }}>邮箱地址</label>
              <input
                type="email"
                value={editEmail}
                onChange={e => setEditEmail(e.target.value)}
                placeholder="请输入邮箱地址"
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #E5E7EB',
                  borderRadius: '8px',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.2s'
                }}
              />
            </div>

            {/* 授权码/密码 */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#4B5563' }}>授权码/密码</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showEditPassword ? 'text' : 'password'}
                  value={editPassword}
                  onChange={e => setEditPassword(e.target.value)}
                  placeholder="请输入授权码或密码"
                  style={{
                    width: '100%',
                    padding: '12px 40px 12px 12px',
                    border: '2px solid #E5E7EB',
                    borderRadius: '8px',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowEditPassword(!showEditPassword)}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#9CA3AF',
                    padding: '4px'
                  }}
                >
                  <i className={`fa-solid ${showEditPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                </button>
              </div>
            </div>

            {/* 操作按钮 */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setShowEditModal(false)}
                style={{
                  flex: 1,
                  padding: '12px',
                  border: '2px solid #E5E7EB',
                  borderRadius: '10px',
                  background: 'white',
                  color: '#6B7280',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                取消
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={editing}
                style={{
                  flex: 1,
                  padding: '12px',
                  border: 'none',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #9D50BB, #6E48AA)',
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: editing ? 'not-allowed' : 'pointer',
                  opacity: editing ? 0.7 : 1
                }}
              >
                {editing ? (
                  <><i className="fa-solid fa-circle-notch fa-spin" style={{ marginRight: '8px' }}></i>保存中...</>
                ) : (
                  '保存'
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 删除确认弹窗 - Portal */}
      {showDeleteConfirm && accountToDelete && ReactDOM.createPortal(
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000
        }} onClick={cancelDeleteAccount}>
          <div style={{
            width: '360px',
            maxWidth: '90vw',
            background: 'white',
            borderRadius: '16px',
            overflow: 'hidden',
            boxShadow: '0 16px 48px rgba(0, 0, 0, 0.2)'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '24px', textAlign: 'center' }}>
              {/* Warning Icon */}
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'rgba(239, 68, 68, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px'
              }}>
                <i className="fa-solid fa-triangle-exclamation" style={{ fontSize: '28px', color: '#EF4444' }}></i>
              </div>
              <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px', color: '#1F2937' }}>
                确认删除
              </div>
              <div style={{ fontSize: '14px', color: '#6B7280', marginBottom: '24px' }}>
                确定要删除这个邮箱账户吗？
                <br />
                <span style={{ fontSize: '12px', color: '#9CA3AF' }}>此操作无法撤销，所有邮件记录将被删除</span>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <div
                  onClick={cancelDeleteAccount}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '12px',
                    background: 'rgba(0, 0, 0, 0.05)',
                    color: '#6B7280',
                    fontSize: '14px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  取消
                </div>
                <div
                  onClick={handleDeleteAccount}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '12px',
                    background: '#EF4444',
                    color: 'white',
                    fontSize: '14px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  删除
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

function FilesView() {
  const [view, setView] = useState<'list' | 'create' | 'browse' | 'selectRoot'>('list');
  const [savedConnections, setSavedConnections] = useState<SavedConnection[]>([]);
  const [activeConnection, setActiveConnection] = useState<SSHConnection | null>(null);
  const [files, setFiles] = useState<SSHFile[]>([]);
  const [localFiles, setLocalFiles] = useState<SSHFile[]>([]);
  const [currentPath, setCurrentPath] = useState('/');
  const [localPath, setLocalPath] = useState('/');
  const [pathHistory, setPathHistory] = useState<string[]>(['/']);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [selectedFile, setSelectedFile] = useState<SSHFile | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // 连接表单
  const [connName, setConnName] = useState('');
  const [editingConnId, setEditingConnId] = useState<string | null>(null); // 追踪当前编辑的连接ID
  const [sshHost, setSshHost] = useState('');
  const [sshPort, setSshPort] = useState(22);
  const [sshUsername, setSshUsername] = useState('');
  const [sshPassword, setSshPassword] = useState('');
  const [sshRoot, setSshRoot] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberPassword, setRememberPassword] = useState(false);

  // 远程文件浏览状态（用于选择根目录）
  const [remoteFiles, setRemoteFiles] = useState<SSHFile[]>([]);
  const [remotePath, setRemotePath] = useState('/');
  const [remotePathHistory, setRemotePathHistory] = useState<string[]>(['/']);
  const [remoteHistoryIndex, setRemoteHistoryIndex] = useState(0);
  const [tempConnectionId, setTempConnectionId] = useState<string | null>(null);

  // 路径输入框状态（用于浏览视图）
  const [pathInput, setPathInput] = useState('');

  // 搜索和排序状态
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<'name' | 'size' | 'mtime'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [showSortMenu, setShowSortMenu] = useState(false);

  // 删除确认弹窗状态
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [connToDelete, setConnToDelete] = useState<SavedConnection | null>(null);

  // 加载保存的连接配置
  useEffect(() => {
    const saved = localStorage.getItem('ssh_connections');
    if (saved) {
      try {
        // 兼容旧版本：为没有 root 字段的连接添加默认值
        const parsed = JSON.parse(saved);
        const withRoot = parsed.map((c: any) => ({
          ...c,
          root: c.root || '/'
        }));
        setSavedConnections(withRoot);
      } catch {}
    }
  }, []);

  // 保存连接配置
  const saveConnection = (conn: SavedConnection) => {
    let updated;
    if (editingConnId) {
      // 编辑模式：更新指定ID的连接
      updated = savedConnections.map(c => c.id === editingConnId ? { ...conn, id: editingConnId } : c);
      setEditingConnId(null); // 重置编辑状态
    } else {
      // 新建模式：基于 username@host:port+root 去重
      const existingIndex = savedConnections.findIndex(
        c => c.username === conn.username && c.host === conn.host && c.port === conn.port && c.root === conn.root
      );
      if (existingIndex >= 0) {
        // 更新现有连接（保留原ID）
        updated = [...savedConnections];
        updated[existingIndex] = { ...conn, id: savedConnections[existingIndex].id };
      } else {
        // 添加新连接
        updated = [...savedConnections, conn];
      }
    }
    setSavedConnections(updated);
    localStorage.setItem('ssh_connections', JSON.stringify(updated));
  };

  // 删除连接配置（只有用户名 服务器地址 根目录完全相同的时候才会删除）
  const deleteConnection = async (id: string) => {
    const connToDelete = savedConnections.find(c => c.id === id);
    if (!connToDelete) return;

    // 如果正在浏览该连接，先断开
    if (activeConnection?.id === id) {
      try {
        await fetch(getServerUrl('/api/ssh/disconnect'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ connection_id: id })
        });
      } catch (e) {
        // 忽略断开错误
      }
      // 清理所有状态
      setActiveConnection(null);
      setFiles([]);
      setCurrentPath('/');
      setSelectedFile(null);
      setFileContent('');
      setSearchQuery('');
      setView('list');
    }

    // 只删除 username+host+port+root 完全匹配的连接
    const updated = savedConnections.filter(
      c => !(c.username === connToDelete.username && c.host === connToDelete.host && c.port === connToDelete.port && c.root === connToDelete.root)
    );
    setSavedConnections(updated);
    localStorage.setItem('ssh_connections', JSON.stringify(updated));
    setShowDeleteConfirm(false);
    setConnToDelete(null);
  };

  // 显示删除确认弹窗
  const confirmDelete = (conn: SavedConnection) => {
    setConnToDelete(conn);
    setShowDeleteConfirm(true);
  };

  // 取消删除
  const cancelDelete = () => {
    setShowDeleteConfirm(false);
    setConnToDelete(null);
  };

  // 测试并连接 SSH
  const connectSSH = async (name: string, host: string, port: number, username: string, password: string, root: string, saveToList: boolean = false) => {
    if (!host || !username || !password) {
      setError('请填写完整的连接信息');
      return null;
    }

    // 验证配置名称长度
    const finalName = name || `${username}@${host}`;
    if (finalName.length > 30) {
      setError('配置名称不能超过30个字符');
      return null;
    }

    setLoading(true);
    setError('');

    try {
      // 测试连接
      const testRes = await fetch(getServerUrl('/api/ssh/test'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host, port, username, password })
      });
      const testData = await testRes.json();
      if (!testData.success) {
        setError(testData.error || '测试连接失败');
        return null;
      }

      // 建立持久连接（包含根目录）
      const connRes = await fetch(getServerUrl('/api/ssh/connect'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host, port, username, password, root })
      });
      const connData = await connRes.json();
      if (!connData.success) {
        setError(connData.error || '连接失败');
        return null;
      }

      // 保存到列表
      const connId = connData.connection_id;
      const savedConn: SavedConnection = {
        id: connId,
        name: name || `${username}@${host}`,
        host,
        port,
        username,
        root
      };
      // 如果记住密码，保存密码
      if (rememberPassword && password) {
        savedConn.password = password;
      }
      if (saveToList) {
        saveConnection(savedConn);
      }

      return {
        id: connId,
        host,
        username,
        root: connData.root,
        name: savedConn.name
      };
    } catch (e) {
      setError('网络错误，请检查后端服务');
      return null;
    } finally {
      setLoading(false);
    }
  };

  // 连接到服务器
  const connectToServer = async (conn: SavedConnection) => {
    setConnName('');  // 清空名称，显示"新建连接"
    setSshHost(conn.host);
    setSshPort(conn.port);
    setSshUsername(conn.username);
    setSshRoot('');
    // 如果有保存的密码，自动填充并勾选记住密码
    if (conn.password) {
      setSshPassword(conn.password);
      setRememberPassword(true);
    } else {
      setSshPassword('');
      setRememberPassword(false);
    }
    setError('');  // 清空错误提示
    setView('create');
  };

  // 打开选择根目录弹窗
  const openRootSelector = () => {
    // 重置远程文件浏览状态
    setError('');  // 清空错误提示
    setRemotePath('/');
    setRemoteFiles([]);
    setRemotePathHistory(['/']);
    setRemoteHistoryIndex(0);
    setTempConnectionId(null);
    setError('');
    setView('selectRoot');
  };

  // 浏览本地文件系统
  const listLocalFiles = async (path: string) => {
    setLoading(true);
    try {
      const res = await fetch(getServerUrl('/api/files/list'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
      });
      const data = await res.json();
      if (data.success) {
        setLocalFiles(data.files);
        setLocalPath(path);
      } else {
        setError(data.error || '读取目录失败');
      }
    } catch (e) {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  };

  // 选择文件夹作为根目录
  const selectRootFolder = (file: SSHFile) => {
    if (file.type === 'folder') {
      setError('');  // 清空错误提示
      setSshRoot(file.path);
      setView('create');
    }
  };

  // 本地导航
  const navigateLocal = (file: SSHFile) => {
    if (file.type === 'folder') {
      setError('');  // 清空错误提示
      listLocalFiles(file.path);
    }
  };

  // 本地返回上一级
  const localGoBack = () => {
    setError('');  // 清空错误提示
    const parent = localPath.split('/').filter(Boolean).slice(0, -1).join('/');
    const targetPath = parent ? `/${parent}` : '/';
    listLocalFiles(targetPath);
  };

  // ===== 远程文件浏览（用于选择根目录）=====
  // 测试并建立 SSH 连接（仅用于浏览远程文件系统）
  const testAndConnectSSH = async () => {
    if (!sshHost || !sshUsername || !sshPassword) {
      setError('请填写服务器地址和用户名密码');
      return null;
    }

    setLoading(true);
    setError('');

    try {
      // 测试连接
      const testRes = await fetch(getServerUrl('/api/ssh/test'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: sshHost, port: sshPort, username: sshUsername, password: sshPassword })
      });
      const testData = await testRes.json();
      if (!testData.success) {
        setError(testData.error || '连接测试失败');
        setLoading(false);
        return null;
      }

      // 建立持久连接
      const connRes = await fetch(getServerUrl('/api/ssh/connect'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: sshHost, port: sshPort, username: sshUsername, password: sshPassword, root: '/' })
      });
      const connData = await connRes.json();
      if (!connData.success) {
        setError(connData.error || '连接失败');
        setLoading(false);
        return null;
      }

      setTempConnectionId(connData.connection_id);
      return connData.connection_id;
    } catch (e) {
      setError('网络错误');
      return null;
    } finally {
      setLoading(false);
    }
  };

  // 列出远程文件
  const listRemoteFiles = async (path: string, connId: string) => {
    setLoading(true);
    try {
      const res = await fetch(getServerUrl('/api/ssh/ls'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection_id: connId, path })
      });
      const data = await res.json();
      if (data.success) {
        setRemoteFiles(data.files);
        setRemotePath(path);
        // 更新历史记录
        const newHistory = remotePathHistory.slice(0, remoteHistoryIndex + 1);
        newHistory.push(path);
        setRemotePathHistory(newHistory);
        setRemoteHistoryIndex(newHistory.length - 1);
      } else {
        setError(data.error || '读取目录失败');
      }
    } catch (e) {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  };

  // 导航到远程文件夹
  const navigateRemote = (file: SSHFile, connId: string) => {
    if (file.type === 'folder') {
      listRemoteFiles(file.path, connId);
    }
  };

  // 远程返回上一级
  const remoteGoBack = (connId: string) => {
    if (remoteHistoryIndex > 0) {
      const newIndex = remoteHistoryIndex - 1;
      const targetPath = remotePathHistory[newIndex];
      setRemoteHistoryIndex(newIndex);
      listRemoteFiles(targetPath, connId);
    }
  };

  // 选择远程文件夹作为根目录
  const selectRemoteFolder = (file: SSHFile, connId: string) => {
    if (file.type === 'folder') {
      // 先断开临时连接
      fetch(getServerUrl('/api/ssh/disconnect'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection_id: connId })
      }).catch(() => {});
      setTempConnectionId(null);
      setError('');  // 清空错误提示
      setSshRoot(file.path);
      setView('create');
    }
  };

  // 返回选择根目录页面时断开临时连接
  const cancelSelectRoot = async () => {
    if (tempConnectionId) {
      try {
        await fetch(getServerUrl('/api/ssh/disconnect'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ connection_id: tempConnectionId })
        });
      } catch {}
      setTempConnectionId(null);
    }
    setError('');  // 清空错误提示
    setView('create');
  };

  // 连接成功后进入浏览
  const handleConnectSuccess = (newConn: SSHConnection) => {
    setActiveConnection(newConn);
    setCurrentPath(newConn.root);
    setPathHistory([newConn.root]);
    setHistoryIndex(0);
    setFiles([]);
    setSelectedFile(null);
    setFileContent('');
    setView('browse');
    listFiles(newConn.root, newConn.id);
  };

  // 执行连接（从创建视图）
  const handleConnect = async () => {
    const conn = await connectSSH(connName, sshHost, sshPort, sshUsername, sshPassword, sshRoot, true);
    if (conn) {
      handleConnectSuccess(conn);
    }
  };

  // 快速连接（从列表点击）- 进入编辑模式
  const handleQuickConnect = async (savedConn: SavedConnection) => {
    // 恢复保存的连接信息，进入编辑模式
    setEditingConnId(savedConn.id);
    setConnName(savedConn.name);
    setSshHost(savedConn.host);
    setSshPort(savedConn.port);
    setSshUsername(savedConn.username);
    // 如果有保存的密码，自动填充并勾选记住密码
    if (savedConn.password) {
      setSshPassword(savedConn.password);
      setRememberPassword(true);
    } else {
      setSshPassword('');
      setRememberPassword(false);
    }
    setSshRoot(savedConn.root || '/');
    setError('');
    setView('create');
  };

  // 断开连接
  const disconnect = async () => {
    if (activeConnection) {
      await fetch(getServerUrl('/api/ssh/disconnect'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection_id: activeConnection.id })
      });
    }
    setActiveConnection(null);
    setFiles([]);
    setCurrentPath('/');
    setSelectedFile(null);
    setFileContent('');
    setView('list');
  };

  // 列出文件
  const listFiles = async (path: string, connId?: string) => {
    const cid = connId || activeConnection?.id;
    if (!cid) return;
    setLoading(true);
    setError('');  // 先清空错误
    setFiles([]);  // 清空文件列表
    setSelectedFile(null);  // 切换目录时移除右侧预览
    setFileContent('');  // 清空文件内容
    try {
      const res = await fetch(getServerUrl('/api/ssh/ls'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection_id: cid, path })
      });
      const data = await res.json();
      if (data.success) {
        setFiles(data.files);
        setCurrentPath(path);
        setPathInput(path);  // 同步路径输入框
        // 记录历史
        const newHistory = pathHistory.slice(0, historyIndex + 1);
        newHistory.push(path);
        setPathHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
      } else {
        setError(data.error || '读取目录失败');
      }
    } catch (e) {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  };

  // 读取文件
  const readFile = async (file: SSHFile) => {
    if (!activeConnection) return;
    // 检查文件是否在当前文件列表中存在
    const fileExists = files.some(f => f.path === file.path);
    if (!fileExists) return;
    setLoading(true);
    setSelectedFile(file);
    try {
      const res = await fetch(getServerUrl('/api/ssh/read'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection_id: activeConnection.id, path: file.path })
      });
      const data = await res.json();
      if (data.success) {
        setFileContent(data.content);
      } else {
        setError(data.error || '读取文件失败');
      }
    } catch (e) {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  };

  // 导航
  const navigateTo = (file: SSHFile) => {
    if (file.type === 'folder') {
      listFiles(file.path);
    } else {
      readFile(file);
    }
  };

  const goBack = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      listFiles(pathHistory[newIndex]);
    }
  };

  const goForward = () => {
    if (historyIndex < pathHistory.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      listFiles(pathHistory[newIndex]);
    }
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  const formatPath = (path: string) => {
    const parts = path.split('/').filter(Boolean);
    if (parts.length <= 2) return path || '/';
    return `.../${parts.slice(-2).join('/')}`;
  };

  // 跳转到指定路径
  const navigateToPath = () => {
    if (pathInput.trim() && activeConnection) {
      // 确保路径以 / 开头
      const normalizedPath = pathInput.trim().startsWith('/')
        ? pathInput.trim()
        : '/' + pathInput.trim();
      listFiles(normalizedPath);
    }
  };

  // ===== 视图1: 文件系统列表 =====
  if (view === 'list') {
    return (
      <div>
        <header className="page-header">
          <div>
            <h1 className="page-title">Files</h1>
            <p className="page-subtitle">SSH/SFTP 文件系统</p>
          </div>
          {/* <button
            onClick={() => {
              setConnName('');
              setSshHost('');
              setSshPort(22);
              setSshUsername('');
              setSshPassword('');
              setSshRoot('');
              setRememberPassword(false);
              setError('');
              setView('create');
            }}
            className="icon-btn"
            style={{ background: 'linear-gradient(135deg, #FF8E53, #FF6A00)', color: 'white' }}
          >
            <i className="fa-solid fa-plus"></i>
          </button> */}
        </header>

        {savedConnections.length === 0 ? (
          <div className="card" style={{ padding: '60px', textAlign: 'center' }}>
            <i className="fa-solid fa-cloud" style={{ fontSize: '48px', color: '#FF8E53', marginBottom: '16px' }}></i>
            <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '8px' }}>还没有文件系统</h3>
            <p className="text-secondary" style={{ marginBottom: '20px' }}>点击按钮创建一个 SSH/SFTP 文件系统</p>
            <button
              onClick={() => {
                setConnName('');
                setSshHost('');
                setSshPort(22);
                setSshUsername('');
                setSshPassword('');
                setSshRoot('');
                setRememberPassword(false);
                setError('');
                setView('create');
              }}
              style={{
                padding: '10px 20px',
                borderRadius: '10px',
                border: 'none',
                background: 'linear-gradient(135deg, #FF8E53, #FF6A00)',
                color: 'white',
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              创建文件系统
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px', padding: '4px 0' }}>
            {savedConnections.map((conn) => (
              <div
                key={conn.id}
                style={{
                  background: 'linear-gradient(145deg, #ffffff 0%, rgba(255, 255, 255, 0.9) 100%)',
                  borderRadius: '16px',
                  padding: '0',
                  cursor: 'pointer',
                  border: '1px solid rgba(255, 255, 255, 0.8)',
                  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04)',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  overflow: 'hidden'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.boxShadow = '0 12px 40px rgba(0, 0, 0, 0.1), 0 4px 12px rgba(0, 0, 0, 0.06)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04)';
                }}
                onClick={() => handleQuickConnect(conn)}
              >
                {/* 顶部区域：图标和信息 */}
                <div style={{ padding: '20px 20px 16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                    {/* 服务器图标 */}
                    <div style={{
                      width: '48px', height: '48px', borderRadius: '14px',
                      background: 'linear-gradient(145deg, #FF8E53 0%, #FF6A00 100%)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 6px 20px rgba(255, 106, 0, 0.35)',
                      flexShrink: 0
                    }}>
                      <i className="fa-solid fa-server" style={{ color: 'white', fontSize: '20px' }}></i>
                    </div>

                    {/* 标题和副标题 */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: '16px', fontWeight: 600, color: '#1F2937',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        marginBottom: '4px'
                      }}>{conn.name}</div>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        fontSize: '13px', color: '#6B7280'
                      }}>
                        <i className="fa-solid fa-user" style={{ fontSize: '11px', opacity: 0.7 }}></i>
                        <span style={{
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                        }}>{conn.username}</span>
                        <span style={{ opacity: 0.5 }}>@</span>
                        <span style={{
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          color: '#4B5563', fontWeight: 500
                        }}>{conn.host}</span>
                        <span style={{
                          background: 'rgba(0, 0, 0, 0.06)', padding: '2px 6px',
                          borderRadius: '4px', fontSize: '11px', fontWeight: 500,
                          flexShrink: 0
                        }}>{conn.port}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 根目录信息 */}
                <div style={{
                  margin: '0 20px 16px 24px',
                  padding: '12px 14px',
                  background: 'linear-gradient(135deg, rgba(255, 142, 83, 0.08) 0%, rgba(255, 106, 0, 0.04) 100%)',
                  borderRadius: '12px',
                  display: 'flex', alignItems: 'center', gap: '10px',
                  border: '1px solid rgba(255, 142, 83, 0.12)'
                }}>
                  <div style={{
                    width: '28px', height: '28px', borderRadius: '8px',
                    background: 'linear-gradient(145deg, rgba(255, 142, 83, 0.2), rgba(255, 106, 0, 0.15))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <i className="fa-solid fa-folder" style={{ color: '#FF6A00', fontSize: '12px' }}></i>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '10px', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>
                      Root Directory
                    </div>
                    <div style={{
                      fontSize: '13px', color: '#374151',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      fontFamily: 'monospace'
                    }}>{conn.root || '/'}</div>
                  </div>
                  <i className="fa-solid fa-chevron-right" style={{ color: '#9CA3AF', fontSize: '11px', opacity: 0.5 }}></i>
                </div>

                {/* 底部操作栏 */}
                <div style={{
                  padding: '14px 20px 16px 20px',
                  borderTop: '1px solid rgba(0, 0, 0, 0.04)',
                  display: 'flex', alignItems: 'center', gap: '10px',
                  background: 'rgba(0, 0, 0, 0.01)'
                }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleQuickConnect(conn);
                    }}
                    style={{
                      flex: 1,
                      padding: '12px 16px',
                      borderRadius: '10px',
                      border: 'none',
                      background: 'linear-gradient(135deg, #FF8E53 0%, #FF6A00 100%)',
                      color: 'white',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      boxShadow: '0 4px 14px rgba(255, 106, 0, 0.35)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.boxShadow = '0 6px 20px rgba(255, 106, 0, 0.45)';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = '0 4px 14px rgba(255, 106, 0, 0.35)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    <i className="fa-solid fa-plug" style={{ marginRight: '8px' }}></i>
                    Connect
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      confirmDelete(conn);
                    }}
                    style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '10px',
                      border: 'none',
                      background: 'rgba(239, 68, 68, 0.08)',
                      color: '#EF4444',
                      fontSize: '14px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)';
                    }}
                  >
                    <i className="fa-solid fa-trash-can"></i>
                  </button>
                </div>
              </div>
            ))}
            {/* 添加更多卡片 */}
            <div
              style={{
                background: 'linear-gradient(145deg, rgba(255, 255, 255, 0.7) 0%, rgba(249, 250, 251, 0.5) 100%)',
                borderRadius: '16px',
                padding: '0',
                cursor: 'pointer',
                border: '2px dashed rgba(255, 142, 83, 0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                minHeight: '200px',
                transition: 'all 0.3s ease',
                position: 'relative',
                overflow: 'hidden'
              }}
              onClick={() => {
                setEditingConnId(null); // 重置编辑状态
                setConnName('');
                setSshHost('');
                setSshPort(22);
                setSshUsername('');
                setSshPassword('');
                setSshRoot('');
                setRememberPassword(false);
                setError('');
                setView('create');
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255, 142, 83, 0.5)';
                e.currentTarget.style.background = 'linear-gradient(145deg, rgba(255, 255, 255, 0.85) 0%, rgba(249, 250, 251, 0.65) 100%)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255, 142, 83, 0.25)';
                e.currentTarget.style.background = 'linear-gradient(145deg, rgba(255, 255, 255, 0.7) 0%, rgba(249, 250, 251, 0.5) 100%)';
              }}
            >
              <div style={{ textAlign: 'center', color: '#6B7280' }}>
                <div style={{
                  width: '56px', height: '56px', borderRadius: '16px',
                  background: 'linear-gradient(135deg, rgba(255, 142, 83, 0.15), rgba(255, 106, 0, 0.1))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 14px'
                }}>
                  <i className="fa-solid fa-plus" style={{ fontSize: '24px', color: '#FF6A00' }}></i>
                </div>
                <div style={{ fontSize: '14px', fontWeight: 500, color: '#374151' }}>添加服务器</div>
                <div style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '4px' }}>创建新的 SFTP 连接</div>
              </div>
            </div>
          </div>
        )}

        {/* 删除确认弹窗 */}
        {showDeleteConfirm && connToDelete && (
          <div style={{
            position: 'fixed', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, background: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(4px)'
          }}>
            <div style={{
              width: '360px', maxWidth: '90vw',
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(255, 255, 255, 0.85))',
              borderRadius: '16px', overflow: 'hidden',
              boxShadow: '0 16px 48px rgba(0, 0, 0, 0.15)'
            }}>
              <div style={{ padding: '24px', textAlign: 'center' }}>
                {/* Warning Icon */}
                <div style={{
                  width: '64px', height: '64px', borderRadius: '50%',
                  background: 'rgba(239, 68, 68, 0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 16px'
                }}>
                  <i className="fa-solid fa-triangle-exclamation" style={{ fontSize: '28px', color: '#EF4444' }}></i>
                </div>
                <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-primary)' }}>
                  确认删除
                </div>
                <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
                  确定要删除服务器 <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{connToDelete.name}</span> 吗？
                  <br />
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>此操作无法撤销</span>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <div
                    onClick={cancelDelete}
                    style={{
                      flex: 1, padding: '12px', borderRadius: '12px',
                      background: 'rgba(0, 0, 0, 0.05)', color: 'var(--text-secondary)',
                      fontSize: '14px', fontWeight: 500, cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    取消
                  </div>
                  <div
                    onClick={() => deleteConnection(connToDelete.id)}
                    style={{
                      flex: 1, padding: '12px', borderRadius: '12px',
                      background: '#EF4444', color: 'white',
                      fontSize: '14px', fontWeight: 500, cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    删除
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ===== 弹窗: 创建/连接文件系统 =====
  if (view === 'create') {
    return (
      <div style={{
        position: 'fixed', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 999
      }}>
        {/* 弹窗卡片 */}
        <div style={{ width: '100%', maxWidth: '420px', margin: '20px' }}>
          <div className="card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="fa-solid fa-server" style={{ color: '#FF8E53' }}></i>
                {connName ? '编辑连接' : '新建连接'}
              </h3>
              <button
                onClick={() => setView('list')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', fontSize: '18px' }}
              >
                <i className="fa-solid fa-times"></i>
              </button>
            </div>

            {error && (
              <div style={{ padding: '12px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', color: '#EF4444', fontSize: '13px', marginBottom: '16px' }}>
                {error}
              </div>
            )}

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#6B7280', marginBottom: '6px' }}>连接名称（可选，最多20字符）</label>
              <input
                type="text"
                value={connName}
                onChange={(e) => setConnName(e.target.value)}
                maxLength={20}
                placeholder="例如: 生产服务器"
                style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(0,0,0,0.02)', fontSize: '13px', outline: 'none' }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#6B7280', marginBottom: '6px' }}>服务器地址</label>
              <input
                type="text"
                value={sshHost}
                onChange={(e) => setSshHost(e.target.value)}
                placeholder="例如: 192.168.1.100"
                style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(0,0,0,0.02)', fontSize: '13px', outline: 'none' }}
              />
            </div>

            <div style={{ marginBottom: '16px', display: 'flex', gap: '12px' }}>
              <div style={{ flex: '0 0 80px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#6B7280', marginBottom: '6px' }}>端口</label>
                <input
                  type="number"
                  value={sshPort}
                  onChange={(e) => setSshPort(Number(e.target.value))}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(0,0,0,0.02)', fontSize: '13px', outline: 'none' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#6B7280', marginBottom: '6px' }}>用户名</label>
                <input
                  type="text"
                  value={sshUsername}
                  onChange={(e) => setSshUsername(e.target.value)}
                  placeholder="root 或 ubuntu"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(0,0,0,0.02)', fontSize: '13px', outline: 'none' }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#6B7280', marginBottom: '6px' }}>密码</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={sshPassword}
                  onChange={(e) => setSshPassword(e.target.value)}
                  placeholder="SSH 密码"
                  style={{ width: '100%', padding: '10px 40px 10px 14px', borderRadius: '10px', border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(0,0,0,0.02)', fontSize: '13px', outline: 'none' }}
                />
                <button
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280' }}
                >
                  <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                </button>
              </div>
            </div>

            {/* 记住密码选项 */}
            <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '13px', color: '#4B5563' }}>
                <input
                  type="checkbox"
                  checked={rememberPassword}
                  onChange={(e) => setRememberPassword(e.target.checked)}
                  style={{ marginRight: '8px', width: '16px', height: '16px', cursor: 'pointer' }}
                />
                记住密码
              </label>
            </div>

            {/* 根目录选择 */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#6B7280', marginBottom: '6px' }}>绑定根目录</label>
              <div style={{
                padding: '10px 14px', borderRadius: '10px', border: '1px solid rgba(0,0,0,0.1)',
                background: 'rgba(0,0,0,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
              }}>
                <span style={{ fontSize: '13px', fontFamily: 'monospace', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {sshRoot || '点击选择根目录文件夹'}
                </span>
                <button
                  onClick={openRootSelector}
                  style={{
                    padding: '6px 12px', borderRadius: '8px', border: 'none',
                    background: 'linear-gradient(135deg, #9D50BB, #6E48AA)',
                    color: 'white', fontSize: '12px', cursor: 'pointer', marginLeft: '8px'
                  }}
                >
                  选择
                </button>
              </div>
            </div>

            <button
              onClick={handleConnect}
              disabled={loading || !sshRoot}
              style={{
                width: '100%', padding: '12px', borderRadius: '10px', border: 'none',
                background: (loading || !sshRoot) ? '#ccc' : 'linear-gradient(135deg, #FF8E53, #FF6A00)',
                color: 'white', fontSize: '14px', fontWeight: 500,
                cursor: (loading || !sshRoot) ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
              }}
            >
              {loading ? (
                <><span className="typing-dot"></span><span className="typing-dot"></span><span className="typing-dot"></span></>
              ) : (
                <><i className="fa-solid fa-plug"></i> 连接服务器</>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ===== 弹窗: 选择根目录 =====
  if (view === 'selectRoot') {
    return (
      <div style={{
        position: 'fixed', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000
      }}>
        <div style={{ width: '100%', maxWidth: '500px', margin: '20px' }}>
          <div className="card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 600 }}>
                <i className="fa-solid fa-folder-open" style={{ color: '#FF8E53', marginRight: '8px' }}></i>
                选择根目录
              </h3>
              <button
                onClick={cancelSelectRoot}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', fontSize: '18px' }}
              >
                <i className="fa-solid fa-times"></i>
              </button>
            </div>

            {error && (
              <div style={{ padding: '10px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', color: '#EF4444', fontSize: '12px', marginBottom: '12px' }}>
                {error}
              </div>
            )}

            {!tempConnectionId ? (
              // 步骤1: 连接远程服务器
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <i className="fa-solid fa-server" style={{ fontSize: '40px', color: '#FF8E53', marginBottom: '16px' }}></i>
                <p style={{ fontSize: '13px', color: '#6B7280', marginBottom: '20px' }}>
                  需要先连接到服务器，才能浏览文件系统并选择根目录
                </p>
                <button
                  onClick={async () => {
                    const connId = await testAndConnectSSH();
                    if (connId) {
                      listRemoteFiles('/', connId);
                    }
                  }}
                  disabled={loading || !sshHost || !sshUsername || !sshPassword}
                  style={{
                    padding: '12px 24px', borderRadius: '10px', border: 'none',
                    background: (loading || !sshHost || !sshUsername || !sshPassword) ? '#ccc' : 'linear-gradient(135deg, #FF8E53, #FF6A00)',
                    color: 'white', fontSize: '14px', cursor: (loading || !sshHost || !sshUsername || !sshPassword) ? 'not-allowed' : 'pointer'
                  }}
                >
                  {loading ? (
                    <><span className="typing-dot"></span><span className="typing-dot"></span><span className="typing-dot"></span></>
                  ) : (
                    <><i className="fa-solid fa-plug"></i> 连接服务器并浏览</>
                  )}
                </button>
              </div>
            ) : (
              // 步骤2: 浏览远程文件系统
              <>
                {/* 路径导航 */}
                <div style={{
                  padding: '8px 12px', borderRadius: '8px', background: 'rgba(0,0,0,0.02)',
                  marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px'
                }}>
                  <button
                    onClick={() => remoteGoBack(tempConnectionId)}
                    disabled={remotePath === '/'}
                    style={{
                      padding: '4px 8px', borderRadius: '6px', border: 'none',
                      background: remotePath === '/' ? 'rgba(0,0,0,0.05)' : 'rgba(255, 142, 83, 0.1)',
                      color: remotePath === '/' ? '#9CA3AF' : '#FF6A00',
                      cursor: remotePath === '/' ? 'not-allowed' : 'pointer', fontSize: '12px'
                    }}
                  >
                    <i className="fa-solid fa-arrow-up"></i> 返回
                  </button>
                  <span style={{ fontSize: '12px', fontFamily: 'monospace', color: '#1F2937', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {remotePath}
                  </span>
                  <button
                    onClick={() => listRemoteFiles(remotePath, tempConnectionId)}
                    style={{ padding: '4px 8px', borderRadius: '6px', border: 'none', background: 'rgba(0,0,0,0.05)', cursor: 'pointer', fontSize: '12px' }}
                  >
                    <i className="fa-solid fa-sync-alt"></i>
                  </button>
                </div>

                {/* 文件列表 */}
                <div style={{ maxHeight: '300px', overflow: 'auto' }}>
                  {loading ? (
                    <div style={{ padding: '40px', textAlign: 'center' }}>
                      <span className="typing-dot"></span>
                      <span className="typing-dot"></span>
                      <span className="typing-dot"></span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      {remoteFiles.filter(f => f.type === 'folder').map((file, i) => (
                        <div
                          key={i}
                          onClick={() => navigateRemote(file, tempConnectionId)}
                          style={{
                            padding: '10px 12px', borderRadius: '8px', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '10px',
                            background: 'transparent', transition: 'all 0.15s'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 142, 83, 0.1)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                          <i className="fa-solid fa-folder" style={{ color: '#FF8E53', fontSize: '14px' }}></i>
                          <span style={{ flex: 1, fontSize: '13px' }}>{file.name}</span>
                          <i className="fa-solid fa-chevron-right" style={{ color: '#9CA3AF', fontSize: '12px' }}></i>
                        </div>
                      ))}
                      {/* 可选择的根目录 - 当前文件夹 */}
                      <div
                        onClick={() => selectRemoteFolder({ name: '当前目录', type: 'folder', path: remotePath } as SSHFile, tempConnectionId)}
                        style={{
                          padding: '12px 12px', borderRadius: '8px', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: '10px',
                          background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(16, 185, 129, 0.05))',
                          border: '1px solid rgba(16, 185, 129, 0.2)',
                          marginTop: '8px'
                        }}
                      >
                        <i className="fa-solid fa-check-circle" style={{ color: '#10B981', fontSize: '14px' }}></i>
                        <span style={{ flex: 1, fontSize: '13px', fontWeight: 500 }}>选择此文件夹作为根目录</span>
                        <i className="fa-solid fa-level-up-alt" style={{ color: '#10B981', fontSize: '12px', transform: 'rotate(90deg)' }}></i>
                      </div>
                      {remoteFiles.filter(f => f.type === 'folder').length === 0 && (
                        <div style={{ padding: '20px', textAlign: 'center', color: '#9CA3AF', fontSize: '13px' }}>
                          此文件夹为空
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ===== 视图3: 浏览文件 =====
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <header className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => setView('list')} className="icon-btn">
            <i className="fa-solid fa-arrow-left"></i>
          </button>
          <h1 className="page-title">{activeConnection?.name || 'SFTP'}</h1>
          <span style={{ fontSize: '12px', padding: '4px 10px', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '12px', color: '#10B981' }}>
            {activeConnection?.username}@{activeConnection?.host}
          </span>
        </div>
        <button onClick={disconnect} className="icon-btn" style={{ color: '#EF4444' }}>
          <i className="fa-solid fa-plug"></i>
        </button>
      </header>

      <div style={{ padding: '8px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <i className="fa-solid fa-folder" style={{ color: '#FF8E53', flexShrink: 0 }}></i>
        <div style={{ flex: 1, position: 'relative' }}>
          <input
            type="text"
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && navigateToPath()}
            placeholder="输入路径..."
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid rgba(0,0,0,0.1)',
              background: 'rgba(0,0,0,0.02)',
              fontSize: '13px',
              fontFamily: 'monospace',
              outline: 'none'
            }}
          />
        </div>
        <button
          onClick={navigateToPath}
          className="icon-btn"
          style={{ flexShrink: 0 }}
        >
          <i className="fa-solid fa-arrow-right"></i>
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', gap: '12px', overflow: 'hidden' }}>
        <div className="card" style={{ flex: 1, padding: '12px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* 文件列表工具栏 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
            {/* 返回上一级 */}
            <button
              onClick={() => {
                const parts = currentPath.split('/').filter(Boolean);
                if (parts.length > 0) {
                  parts.pop();
                  const parent = parts.length === 0 ? '/' : '/' + parts.join('/');
                  listFiles(parent);
                }
              }}
              disabled={currentPath === '/'}
              className="icon-btn"
              style={{ opacity: currentPath === '/' ? 0.5 : 1, flexShrink: 0 }}
              title="返回上一级"
            >
              <i className="fa-solid fa-arrow-up"></i>
            </button>
            {/* 刷新 */}
            <button onClick={() => listFiles(currentPath)} className="icon-btn" style={{ flexShrink: 0 }} title="刷新">
              <i className="fa-solid fa-sync-alt"></i>
            </button>
            {/* 搜索 */}
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索文件..."
                style={{
                  width: '100%',
                  padding: '6px 12px 6px 28px',
                  borderRadius: '8px',
                  border: '1px solid rgba(0,0,0,0.1)',
                  background: 'rgba(0,0,0,0.02)',
                  fontSize: '12px',
                  outline: 'none'
                }}
              />
              <i className="fa-solid fa-search" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF', fontSize: '11px' }}></i>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF' }}
                >
                  <i className="fa-solid fa-times" style={{ fontSize: '10px' }}></i>
                </button>
              )}
            </div>
            {/* 排序 */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowSortMenu(!showSortMenu)}
                className="icon-btn"
                style={{ flexShrink: 0 }}
                title="排序"
              >
                <i className="fa-solid fa-sort"></i>
              </button>
              {showSortMenu && (
                <div style={{
                  position: 'absolute', top: '100%', right: 0, marginTop: '4px',
                  background: 'white', borderRadius: '8px', padding: '4px',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.15)', zIndex: 100,
                  minWidth: '140px'
                }}>
                  {[
                    { key: 'name', label: '名称' },
                    { key: 'size', label: '大小' },
                    { key: 'mtime', label: '修改时间' }
                  ].map(field => (
                    <div key={field.key}>
                      <div style={{ padding: '6px 12px', fontSize: '11px', fontWeight: 500, color: '#6B7280', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                        {field.label}
                      </div>
                      <div style={{ display: 'flex' }}>
                        <button
                          onClick={() => { setSortField(field.key as any); setSortDirection('asc'); setShowSortMenu(false); }}
                          style={{
                            flex: 1, padding: '6px 12px', border: 'none', background: sortField === field.key && sortDirection === 'asc' ? 'rgba(255, 142, 83, 0.1)' : 'transparent',
                            cursor: 'pointer', fontSize: '11px', color: sortField === field.key ? '#FF6A00' : '#6B7280'
                          }}
                        >
                          <i className="fa-solid fa-arrow-up" style={{ marginRight: '4px', fontSize: '10px' }}></i>升序
                        </button>
                        <button
                          onClick={() => { setSortField(field.key as any); setSortDirection('desc'); setShowSortMenu(false); }}
                          style={{
                            flex: 1, padding: '6px 12px', border: 'none', background: sortField === field.key && sortDirection === 'desc' ? 'rgba(255, 142, 83, 0.1)' : 'transparent',
                            cursor: 'pointer', fontSize: '11px', color: sortField === field.key ? '#FF6A00' : '#6B7280'
                          }}
                        >
                          <i className="fa-solid fa-arrow-down" style={{ marginRight: '4px', fontSize: '10px' }}></i>降序
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {error && (
            <div style={{ padding: '10px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', color: '#EF4444', fontSize: '12px', marginBottom: '12px' }}>
              {error}
            </div>
          )}
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#6B7280', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '20px', marginBottom: '8px' }}></i>
              <p style={{ fontSize: '12px', margin: 0 }}>加载中...</p>
            </div>
          ) : (() => {
            // 过滤和排序
            const filteredFiles = files
              .filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
              .sort((a, b) => {
                let cmp = 0;
                if (sortField === 'name') {
                  cmp = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
                } else if (sortField === 'size') {
                  cmp = (a.size || 0) - (b.size || 0);
                } else if (sortField === 'mtime') {
                  cmp = (a.mtime || 0) - (b.mtime || 0);
                }
                return sortDirection === 'asc' ? cmp : -cmp;
              });

            if (filteredFiles.length === 0) {
              return (
                <div style={{ padding: '40px', textAlign: 'center', color: '#6B7280', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="fa-regular fa-folder-open" style={{ fontSize: '24px', marginBottom: '8px' }}></i>
                  <p style={{ fontSize: '12px', margin: 0 }}>{searchQuery ? '未找到匹配的文件' : '该目录为空'}</p>
                </div>
              );
            }

            return (
              <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {filteredFiles.map((file, i) => (
                    <div
                      key={i}
                      onClick={() => navigateTo(file)}
                      style={{
                        padding: '10px 12px', borderRadius: '8px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: '10px',
                        background: selectedFile?.path === file.path ? 'rgba(255, 142, 83, 0.15)' : 'transparent',
                        transition: 'all 0.15s'
                      }}
                    >
                      <i className={`fa-solid ${file.type === 'folder' ? 'fa-folder' : 'fa-file-code'}`}
                         style={{ color: file.type === 'folder' ? '#FF8E53' : '#6B7280', fontSize: '14px' }}></i>
                      <span style={{ flex: 1, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                      <span style={{ fontSize: '11px', color: '#9CA3AF', minWidth: '70px', textAlign: 'right' }}>{formatSize(file.size)}</span>
                      <span style={{ fontSize: '11px', color: '#9CA3AF', minWidth: '85px', textAlign: 'right' }}>{file.mtime ? new Date(file.mtime * 1000).toLocaleDateString() : '-'}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>

        {selectedFile && (
          <div className="card" style={{ flex: 2, padding: '16px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="fa-solid fa-file-code" style={{ color: '#6B48AA' }}></i>
                <span style={{ fontSize: '13px', fontWeight: 500 }}>{selectedFile.name}</span>
              </div>
              <button onClick={() => { setSelectedFile(null); setFileContent(''); }} className="icon-btn" style={{ width: '28px', height: '28px' }}>
                <i className="fa-solid fa-times" style={{ fontSize: '12px' }}></i>
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', background: '#1e1e1e', borderRadius: '8px', padding: '12px' }}>
              <pre style={{ margin: 0, fontFamily: 'monospace', fontSize: '12px', lineHeight: '1.5', color: '#d4d4d4' }}>{fileContent || '读取中...'}</pre>
            </div>
          </div>
        )}
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
        <div className="header-actions">
          <a href="https://github.com/su-Insight" target="_blank" rel="noopener noreferrer" className="icon-btn" title="GitHub">
            <i className="fa-brands fa-github"></i>
          </a>
          <a href="https://your-blog.com" target="_blank" rel="noopener noreferrer" className="icon-btn" title="Blog">
            <i className="fa-solid fa-globe"></i>
          </a>
          <a href="https://www.buymeacoffee.com/yourusername" target="_blank" rel="noopener noreferrer" className="icon-btn" style={{ color: '#FF6A00' }} title="Buy Me a Coffee">
            <i className="fa-solid fa-mug-hot"></i>
          </a>
          <button className="task-tag todo" style={{ marginLeft: '8px' }}>
            <i className="fa-solid fa-wand-magic-sparkles mr-2"></i>New Chat
          </button>
        </div>
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
  const [selectedProvider, setSelectedProvider] = useState('deepseek'); // 默认选中第一个厂商
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
  const [speedTestResults, setSpeedTestResults] = useState<Record<string, SpeedTestResult>>({});
  const [speedTesting, setSpeedTesting] = useState<Set<string>>(new Set());
  const [showApiKeyPassword, setShowApiKeyPassword] = useState(false);

  // 删除确认弹窗状态
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [configToDelete, setConfigToDelete] = useState<string | null>(null);

  // 测速结果类型
  type SpeedTestResult = {
    time: string;
    color: string;
    isError?: boolean;
    detail?: string;
    rawError?: string;
  };

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
          { id: '1', name: 'DeepSeek', remark: '测试配置', provider: 'deepseek', model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com/v1', temperature: 0.8, enabled: false },
        ];
      }
    }
    return [
      { id: '1', name: 'DeepSeek', remark: '测试配置', provider: 'deepseek', model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com/v1', temperature: 0.8, enabled: false },
    ];
  });

  // 保存 modelConfigs 到 localStorage
  useEffect(() => {
    localStorage.setItem('deskmate_modelConfigs', JSON.stringify(modelConfigs));
  }, [modelConfigs]);

  // API Key 获取链接
  const getApiKeyUrl = () => {
    const urls: Record<string, string> = {
      deepseek: 'https://platform.deepseek.com/api-keys',
      kimi: 'https://platform.moonshot.cn/console/api-keys',
      zhipu: 'https://open.bigmodel.cn/usercenter/apikeys',
      qwen: 'https://help.aliyun.com/zh/model-studio/get-api-key',
      hunyuan: 'https://console.cloud.tencent.com/hunyuan/api-key',
      minimax: 'https://platform.minimaxi.com/user-center/basic-information/interface-key',
      doubao: 'https://www.volcengine.com/docs/82379/1099522',
      baichuan: 'https://platform.baichuan-ai.com/docs/api',
      wenxin: 'https://console.bce.baidu.com/iam/#/iam/apikey/list',

      // ********** 境外访问 **********
      openrouter: 'https://openrouter.ai/settings/management-keys',
      siliconflow: 'https://cloud.siliconflow.cn/account/ak',
      xai: 'https://console.x.ai/team/default/api-keys',
      mistral: 'https://console.mistral.ai/home?workspace_dialog=apiKeys',
      nvidia: 'https://build.nvidia.com/settings/api-keys',

      // openai: 'https://platform.openai.com/api-keys',
      // gemini: 'https://aistudio.google.com/app/apikey',
      // anthropic: 'https://console.anthropic.com/',
    };
    return urls[selectedProvider] || '';
  };

// AI 厂商配置
  const providers = [
    { id: 'deepseek', name: 'DeepSeek', icon: 'fa-bolt', color: '#6069ff', models: [], defaultUrl: 'https://api.deepseek.com', defaultModel: 'deepseek-chat', websiteUrl: 'https://www.deepseek.com' },
    { id: 'kimi', name: 'Kimi', icon: 'fa-moon', color: '#ff6b4d', models: [], defaultUrl: 'https://api.moonshot.cn/v1', defaultModel: 'kimi-k2.5', websiteUrl: 'https://www.moonshot.cn' },
    { id: 'zhipu', name: '智谱 GLM', icon: 'fa-robot', color: '#3147ea', models: [], defaultUrl: 'https://open.bigmodel.cn/api/paas/v4', defaultModel: 'glm-4.7', websiteUrl: 'https://www.bigmodel.cn' },
    { id: 'qwen', name: 'Qwen', icon: 'fa-brain', color: '#615ced', models: [], defaultUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', defaultModel: 'qwen3-max', websiteUrl: 'https://tongyi.aliyun.com/' },
    { id: 'hunyuan', name: 'Hunyuan', icon: 'fa-brain', color: '#0052d9', models: [], defaultUrl: 'https://api.hunyuan.cloud.tencent.com/v1', defaultModel: 'hunyuan-T1', websiteUrl: 'https://hunyuan.tencent.com/' },
    { id: 'minimax', name: 'MiniMax', icon: 'fa-microchip', color: '#6535d2', models: [], defaultUrl: 'https://api.minimaxi.com/v1', defaultModel: 'MiniMax-M2.1', websiteUrl: 'https://www.minimaxi.com' },
    { id: 'doubao', name: 'Doubao', icon: 'fa-microchip', color: '#bbb581', models: [], defaultUrl: 'https://ark.cn-beijing.volces.com/api/v3', defaultModel: 'doubao-seed-1-6-251015', websiteUrl: 'https://www.volcengine.com/' },
    { id: 'baichuan', name: 'Baichuan', icon: 'fa-microchip', color: '#ff5a00', models: [], defaultUrl: 'https://api.baichuan-ai.com/v1/', defaultModel: 'Baichuan-M3-Plus', websiteUrl: 'https://www.baichuan-ai.com/home' },
    { id: 'wenxin', name: 'Wenxin', icon: 'fa-microchip', color: '#2a69ff', models: [], defaultUrl: 'https://qianfan.baidubce.com/v2', defaultModel: 'ernie-4.5-turbo', websiteUrl: 'https://cloud.baidu.com/' },

    // ********** 境外访问 **********
    { id: 'openrouter', name: 'OpenRouter', icon: 'fa-brain', color: '#651fff', models: [], defaultUrl: 'https://openrouter.ai/api/v1', defaultModel: 'openai/gpt-5.2', websiteUrl: 'https://openrouter.ai/' },
    { id: 'siliconflow', name: 'SiliconFlow', icon: 'fa-brain', color: '#000000', models: [], defaultUrl: 'https://api.siliconflow.cn/v1', defaultModel: 'Qwen/Qwen2.5-72B-Instruct', websiteUrl: 'https://www.siliconflow.cn/' },
    { id: 'xai', name: 'Grok', icon: 'fa-brain', color: '#000000', models: [], defaultUrl: 'https://api.x.ai/v1', defaultModel: 'grok-4-1-fast-reasoning', websiteUrl: 'https://x.ai/' },
    { id: 'mistral', name: 'Mistral', icon: 'fa-brain', color: '#f5d835', models: [], defaultUrl: 'https://api.mistral.ai/v1', defaultModel: 'open-mistral-7b', websiteUrl: 'https://mistral.ai/' },
    { id: 'nvidia', name: 'NVIDIA', icon: 'fa-server', color: '#76b900', models: [], defaultUrl: 'https://integrate.api.nvidia.com/v1', defaultModel: 'nvidia/llama-3.1-nemotron-70b-instruct', websiteUrl: 'https://build.nvidia.com/' },
    { id: 'custom', name: '自定义', icon: 'fa-cog', color: '#6B7280', models: [], defaultUrl: '', defaultModel: '', websiteUrl: '' },


    // { id: 'openai', name: 'OpenAI', icon: 'fa-brain', color: '#10A37F', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'], defaultUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o', websiteUrl: 'https://openai.com' },
    // { id: 'gemini', name: 'Google Gemini', icon: 'fa-google', color: '#4285F4', models: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.0-pro'], defaultUrl: 'https://generativelanguage.googleapis.com/v1beta', defaultModel: 'gemini-1.5-flash', websiteUrl: 'https://gemini.google.com' },
    // { id: 'anthropic', name: 'Claude', icon: 'fa-comments', color: '#D97757', models: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'], defaultUrl: 'https://api.anthropic.com/v1', defaultModel: 'claude-3-5-sonnet-20241022', websiteUrl: 'https://www.anthropic.com' },
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
    const config = modelConfigs.find(c => c.id === configId);
    if (!config) return;

    // 查找 provider（用于错误时显示名称）
    const provider = providers.find(p => p.id === config.provider);

    setSpeedTesting(prev => new Set(prev).add(configId));

    try {

      const response = await fetch(getServerUrl('/api/ai/check'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: config.apiKey,
          base_url: config.baseUrl,
          model: config.model
        })
      });
      const result = await response.json();

      if (result.valid) {
        setSpeedTestResults(prev => ({
          ...prev,
          [configId]: {
            time: `${result.latency_ms}ms`,
            color: result.latency_ms < 1000 ? '#10B981' : result.latency_ms < 2000 ? '#F59E0B' : '#EF4444',
            isError: false,
            detail: result.info || ''
          }
        }));
      } else {
        let errorText = '连接失败';
        let detailText = result.raw_error_text;
        if (result.http_status === 401) {
          errorText = '401 认证失败';
        } else if (result.http_status === 404) {
          errorText = '404 地址错误';
        } else if (result.http_status === 429) {
          errorText = '429 超出限制';
        } else if (result.http_status === 500) {
          errorText = '500 服务器错误';
        } else if (result.http_status === 503) {
          errorText = '503 服务不可用';
        } else if (result.http_status === 504) {
          errorText = '504 连接超时';
        }

        setSpeedTestResults(prev => ({
          ...prev,
          [configId]: {
            time: errorText,
            color: '#EF4444',
            isError: true,
            // detail: detailText,
            rawError: `${errorText} [${provider?.name || config.name}] ${detailText} (${result.latency_ms}ms) HTTP ${result.http_status || 'N/A'}`
          }
        }));
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '未知错误';
      setSpeedTestResults(prev => ({
        ...prev,
        [configId]: {
          time: '连接失败',
          color: '#EF4444',
          isError: true,
          // detail: errorMsg,
          rawError: `[${provider?.name || config.name}] 连接失败: ${errorMsg}`
        }
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
    // 验证必填字段
    if (!configName.trim()) {
      showToast('请先输入配置名称', 'error');
      return;
    }
    if (!apiKey.trim()) {
      showToast('请先输入 API Key', 'error');
      return;
    }
    if (!modelName.trim()) {
      showToast('请先输入模型名称', 'error');
      return;
    }
    if (!baseUrl.trim()) {
      showToast('请先输入 Base URL', 'error');
      return;
    }

    setSaveStatus('testing');

    try {
      const response = await fetch(getServerUrl('/api/ai/check'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          base_url: baseUrl
        })
      });
      const result = await response.json();

      if (result.valid) {
        showToast(`连接成功 (${result.latency_ms}ms)`, 'success');
      } else {
        let errorMsg = result.error || '连接失败';
        showToast(errorMsg, 'error');
      }
    } catch (error) {
      showToast('连接失败: ' + (error instanceof Error ? error.message : '未知错误'), 'error');
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

    // 如果启用了某个配置，保存它用于聊天
    if (newConfigs[index].enabled) {
      const enabledConfig = newConfigs.find(c => c.enabled);
      if (enabledConfig) {
        localStorage.setItem('deskmate_chatConfig', JSON.stringify(enabledConfig));
      }
    } else {
      localStorage.removeItem('deskmate_chatConfig');
    }
  };

  // 选择厂商时自动填充默认配置
  const handleProviderSelect = (providerId: string) => {
    setSelectedProvider(providerId);
    const provider = providers.find(p => p.id === providerId);
    if (provider && provider.id !== 'custom') {
      setBaseUrl(provider.defaultUrl || '');
      setModelName(provider.defaultModel);
      // 编辑模式下，只有当配置名称等于原厂商名称时才更新
      if (editingProvider) {
        const currentConfig = modelConfigs.find(c => c.id === editingProvider);
        const originalProvider = providers.find(p => p.id === currentConfig?.provider);
        if (currentConfig && currentConfig.name === originalProvider?.name) {
          setConfigName(provider.name);
        }
      } else {
        // 新建模式直接使用厂商名称
        setConfigName(provider.name);
      }
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

  // 确认删除配置
  const confirmDeleteConfig = (configId: string) => {
    setConfigToDelete(configId);
    setShowDeleteConfirm(true);
  };

  // 执行删除配置
  const deleteConfig = () => {
    if (configToDelete) {
      const newConfigs = modelConfigs.filter(c => c.id !== configToDelete);
      setModelConfigs(newConfigs);
      showToast('删除成功', 'success');
    }
    setShowDeleteConfirm(false);
    setConfigToDelete(null);
  };

  // 取消删除
  const cancelDeleteConfig = () => {
    setShowDeleteConfirm(false);
    setConfigToDelete(null);
  };

  // 新建配置 - 显示 API 配置内容
  const handleNewConfig = () => {
    setEditingProvider(null);
    setConfigName('');
    setConfigRemark('');
    setApiKey('');
    setThinkingModel('');
    // 默认选中第一个厂商（DeepSeek）并填充默认值
    const firstProvider = providers[0];
    setSelectedProvider(firstProvider.id);
    setBaseUrl(firstProvider.defaultUrl || '');
    setModelName(firstProvider.defaultModel || '');
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

    // 检查配置名称是否重复（排除自身）
    if (isConfigNameExists(configName, editingProvider || undefined)) {
      showToast('配置名称已存在，请使用其他名称', 'error');
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
        // 更新 localStorage（如果是编辑已启用的配置）
        const updatedConfigs = modelConfigs.map(c =>
          c.id === editingProvider
            ? { ...c, name: configName, remark: configRemark, provider: selectedProvider, model: modelName, baseUrl: baseUrl, thinkingModel: thinkingModel, apiKey: apiKey }
            : c
        );
        const savedConfig = updatedConfigs.find(c => c.id === editingProvider && c.enabled);
        if (savedConfig) {
          localStorage.setItem('deskmate_chatConfig', JSON.stringify(savedConfig));
        }
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
          // 如果当前没有启用的配置，自动启用
          enabled: !modelConfigs.some(c => c.enabled)
        };
        setModelConfigs(prev => [...prev, newConfig]);
        // 自动启用时同步到 localStorage
        if (newConfig.enabled) {
          localStorage.setItem('deskmate_chatConfig', JSON.stringify(newConfig));
        }
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

              {/* 模型配置列表 */}
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
                          <span style={{ fontSize: '14px', fontWeight: 500, color: '#374151' }}>{config.name}</span>
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
                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                          <div style={{ fontSize: '12px', color: '#374151', fontWeight: 500 }}>
                            {config.model}
                          </div>
                          {config.remark && (
                            <div style={{ fontSize: '11px', color: '#9CA3AF', fontStyle: 'italic' }}>
                              — {config.remark}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 测速结果 */}
                      {speedResult && !isSpeedTesting && (
                        <div
                          onClick={() => {
                            if (speedResult.isError && speedResult.rawError) {
                              navigator.clipboard.writeText(speedResult.rawError);
                              showToast('已复制到剪贴板', 'success');
                            }
                          }}
                          style={{
                            padding: '4px 10px',
                            background: `${speedResult.color}15`,
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 500,
                            color: speedResult.color,
                            cursor: speedResult.isError ? 'pointer' : 'default',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                          title={speedResult.isError ? '点击复制详细信息' : ''}
                        >
                          <i className="fa-solid fa-bolt"></i>
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
                          onClick={() => confirmDeleteConfig(config.id)}
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
                    <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 4px', padding: '6px', boxSizing: 'border-box' }}>
                      <img
                        src={getProviderIconUrl(provider.id)}
                        alt={provider.name}
                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          // 只在没有添加过回退图标时才添加
                          if (!target.parentElement?.querySelector('.icon-fallback')) {
                            target.insertAdjacentHTML('afterend',
                              `<i class="fa-solid ${provider.icon} icon-fallback" style="color: #9CA3AF; font-size: 12px;"></i>`
                            );
                          }
                        }}
                      />
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
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showApiKeyPassword ? 'text' : 'password'}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="sk-..."
                      style={{
                        width: '100%',
                        padding: '10px 40px 10px 12px',
                        border: '1px solid rgba(0,0,0,0.1)',
                        borderRadius: '8px',
                        fontSize: '13px',
                        outline: 'none'
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKeyPassword(!showApiKeyPassword)}
                      style={{
                        position: 'absolute',
                        right: '12px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#9CA3AF',
                        padding: '4px'
                      }}
                    >
                      <i className={`fa-solid ${showApiKeyPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                    </button>
                  </div>
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

      {/* Toast 提示 - 支持点击复制 */}
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
          <div
            onClick={() => {
              navigator.clipboard.writeText(toast.msg);
              showToast('已复制到剪贴板', 'success');
            }}
            style={{
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
              pointerEvents: 'auto',
              cursor: toast.type === 'error' ? 'pointer' : 'default',
              position: 'relative'
            }}
            title={toast.type === 'error' ? '点击复制错误信息' : ''}
          >
            <i className={`fa-solid ${toast.type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}`}></i>
            {toast.msg}
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {showDeleteConfirm && configToDelete && (() => {
        const config = modelConfigs.find(c => c.id === configToDelete);
        if (!config) return null;
        return (
          <div style={{
            position: 'fixed', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, background: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(4px)'
          }}>
            <div style={{
              width: '360px', maxWidth: '90vw',
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(255, 255, 255, 0.85))',
              borderRadius: '16px', overflow: 'hidden',
              boxShadow: '0 16px 48px rgba(0, 0, 0, 0.15)'
            }}>
              <div style={{ padding: '24px', textAlign: 'center' }}>
                {/* Warning Icon */}
                <div style={{
                  width: '64px', height: '64px', borderRadius: '50%',
                  background: 'rgba(239, 68, 68, 0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 16px'
                }}>
                  <i className="fa-solid fa-triangle-exclamation" style={{ fontSize: '28px', color: '#EF4444' }}></i>
                </div>
                <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-primary)' }}>
                  确认删除
                </div>
                <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
                  确定要删除模型配置 <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{config.name}</span> 吗？
                  <br />
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>此操作无法撤销</span>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <div
                    onClick={cancelDeleteConfig}
                    style={{
                      flex: 1, padding: '12px', borderRadius: '12px',
                      background: 'rgba(0, 0, 0, 0.05)', color: 'var(--text-secondary)',
                      fontSize: '14px', fontWeight: 500, cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    取消
                  </div>
                  <div
                    onClick={deleteConfig}
                    style={{
                      flex: 1, padding: '12px', borderRadius: '12px',
                      background: '#EF4444', color: 'white',
                      fontSize: '14px', fontWeight: 500, cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    删除
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function CommunicationPanel({ messages, onNavigate }: { messages: Message[]; onNavigate: (nav: string) => void }) {
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isConfigMissing, setIsConfigMissing] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  // 打字机效果：追踪已显示的字符数，-1 表示显示完整内容
  const [typewriterIndex, setTypewriterIndex] = useState<number>(-1);
  const api = (window as any).deskmate;

  // 流式响应控制 refs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const streamReaderRef = useRef<any>(null);
  const typeWriterTimerRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null); // 用于真正"挂断电话"

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

  // 获取当前聊天的 API 配置
  const getChatConfig = () => {
    try {
      const saved = localStorage.getItem('deskmate_chatConfig');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Failed to parse chat config:', e);
    }
    return null;
  };

  const handleSend = async () => {
    if (!inputMessage.trim() || isTyping) return;

    // 检查是否配置了 API
    const chatConfig = getChatConfig();
    if (!chatConfig || !chatConfig.apiKey) {
      setLocalMessages(prev => [...prev, {
        role: 'assistant',
        content: '__ERROR__|未配置 AI|请先在设置中配置 API Key'
      }]);
      return;
    }

    const userMsg: Message = { role: 'user', content: inputMessage };
    setLocalMessages(prev => [...prev, userMsg]);
    setInputMessage('');
    setIsTyping(true);
    setIsStreaming(true);

    // 用于存储 AI 回复，声明在 try-catch 外以便 catch 访问
    let assistantReply = '';

    try {
      // 创建 AbortController 用于"挂断电话"
      abortControllerRef.current = new AbortController();

      // 构建历史消息（排除系统消息）
      const history = localMessages
        .filter((m: Message) => m.role !== 'system')
        .map(m => ({ role: m.role, content: m.content }));

      // 使用流式接口，携带 API 配置和 signal
      const response = await fetch(getServerUrl('/api/ai/chat/stream'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: inputMessage,
          history: history,
          mode: 'private',
          api_key: chatConfig.apiKey,
          base_url: chatConfig.baseUrl,
          model_name: chatConfig.model
        }),
        signal: abortControllerRef.current.signal // 关键：绑定 abort signal
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      // 存储 reader 以便停止时使用
      streamReaderRef.current = reader;

      const decoder = new TextDecoder();
      let messageId = '';
      let displayIndex = 0; // 当前已显示的字符位置

      // 添加一个空的消息气泡用于流式更新
      setLocalMessages(prev => [...prev, {
        role: 'assistant',
        content: ''
      }]);
      setIsTyping(false); // 已有消息气泡，隐藏打字指示器

      // 打字机函数
      const typeWriter = () => {
        if (displayIndex < assistantReply.length) {
          displayIndex++;
          setTypewriterIndex(displayIndex);
          setLocalMessages(prev => {
            const newMsgs = [...prev];
            if (newMsgs.length > 0) {
              newMsgs[newMsgs.length - 1] = {
                role: 'assistant',
                content: assistantReply.substring(0, displayIndex)
              };
            }
            return newMsgs;
          });
        } else if (typeWriterTimerRef.current) {
          clearInterval(typeWriterTimerRef.current);
          typeWriterTimerRef.current = null;
        }
      };

      // 读取流并实时更新
      while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.slice(6);

              try {
                if (dataStr === '[DONE]') break;

                const data = JSON.parse(dataStr);

                if (data.error) {
                  if (typeWriterTimerRef.current) {
                    clearInterval(typeWriterTimerRef.current);
                    typeWriterTimerRef.current = null;
                  }
                  const parts = data.error.split('|');
                  setLocalMessages(prev => {
                    const newMsgs = [...prev];
                    if (newMsgs.length > 0) {
                      newMsgs[newMsgs.length - 1] = {
                        role: 'assistant',
                        content: `__ERROR__|${parts[0] || '错误'}|${parts.slice(1).join('|')}`
                      };
                    }
                    return newMsgs;
                  });
                  setIsStreaming(false);
                  setTypewriterIndex(-1);
                  streamReaderRef.current = null;
                  return;
                }

                if (data.content !== undefined) {
                  assistantReply += data.content;
                  messageId = data.message_id || messageId;

                  // 启动打字机定时器（极速模式：8ms）
                  if (!typeWriterTimerRef.current) {
                    displayIndex = 0;
                    typeWriterTimerRef.current = setInterval(typeWriter, 8);
                  }
                }

                if (data.done) {
                  setIsStreaming(false);
                  setTypewriterIndex(-1);
                  if (typeWriterTimerRef.current) {
                    clearInterval(typeWriterTimerRef.current);
                    typeWriterTimerRef.current = null;
                  }
                  streamReaderRef.current = null;
                  setLocalMessages(prev => {
                    const newMsgs = [...prev];
                    if (newMsgs.length > 0) {
                      newMsgs[newMsgs.length - 1] = {
                        role: 'assistant',
                        content: assistantReply
                      };
                    }
                    return newMsgs;
                  });
                }
              } catch (e) {}
            }
          }
        }

      // 检查是否需要配置API Key
      if (assistantReply.includes('MINIMAX_API_KEY') || assistantReply.includes('API密钥')) {
        setIsConfigMissing(true);
      }

    } catch (error: any) {
      // 如果是被用户停止的
      if (error.name === 'AbortError') {
        if (assistantReply && assistantReply.trim().length > 0) {
          // 有内容时：追加停止提示到已显示内容后面
          const stoppedContent = assistantReply + '\n\n_（你已停止这条回答）_';
          setLocalMessages(prev => {
            const newMsgs = [...prev];
            if (newMsgs.length > 0) {
              newMsgs[newMsgs.length - 1] = {
                role: 'assistant',
                content: stoppedContent
              };
            }
            return newMsgs;
          });
        } else {
          // 无内容时：直接显示停止提示（移除空消息，添加带提示的新消息）
          setLocalMessages(prev => {
            const newMsgs = [...prev];
            // 移除空消息
            if (newMsgs.length > 0 && newMsgs[newMsgs.length - 1].content === '') {
              newMsgs.pop();
            }
            // 添加停止提示
            newMsgs.push({
              role: 'assistant',
              content: '_（你已停止这条回答）_'
            });
            return newMsgs;
          });
        }
      } else {
        console.error('Chat error:', error);
        setLocalMessages(prev => [...prev, {
          role: 'assistant',
          content: '__ERROR__|连接失败|无法连接到AI服务'
        }]);
      }
    } finally {
      setIsTyping(false);
      setIsStreaming(false);
      // 清理 refs
      if (typeWriterTimerRef.current) {
        clearInterval(typeWriterTimerRef.current);
        typeWriterTimerRef.current = null;
      }
      streamReaderRef.current = null;
      abortControllerRef.current = null;
    }
  };

  // 停止流式响应
  const handleStop = () => {
    if (isStreaming) {
      // 真正"挂断电话"
      abortControllerRef.current?.abort();
      // 清除打字机定时器
      if (typeWriterTimerRef.current) {
        clearInterval(typeWriterTimerRef.current);
        typeWriterTimerRef.current = null;
      }
      // 更新状态
      setIsStreaming(false);
      setIsTyping(false);
      streamReaderRef.current = null;
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // 使用 react-markdown 渲染消息内容（支持完整的 Markdown 语法）
  const renderMessageContent = (content: string) => {
    // 处理错误消息
    if (content.startsWith('__ERROR__|')) {
      return renderErrorBubble(content);
    }

    // 代码块复制按钮组件
    const CodeBlockHeader = ({ language, code }: { language: string; code: string }) => {
      const [copied, setCopied] = useState(false);

      const handleCopy = async () => {
        await navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      };

      return (
        <div style={{
          background: '#2d2d2d',
          padding: '4px 12px',
          fontSize: '11px',
          color: '#888',
          textTransform: 'uppercase',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span>{language}</span>
          <button
            onClick={handleCopy}
            style={{
              background: 'transparent',
              border: 'none',
              color: copied ? '#4ade80' : '#888',
              cursor: 'pointer',
              fontSize: '11px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'color 0.2s',
            }}
          >
            <i className={copied ? 'fa-solid fa-check' : 'fa-regular fa-copy'}></i>
            {copied ? '已复制' : '复制'}
          </button>
        </div>
      );
    };

    return (
      <ReactMarkdown
        className="markdown-content"
        remarkPlugins={[remarkGfm]}
        components={{
          code({ node, inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '');
            const language = match ? match[1] : '';
            const codeContent = String(children).replace(/\n$/, '');

            if (!inline && language) {
              return (
                <div style={{
                  background: '#1e1e1e',
                  borderRadius: '8px',
                  margin: '8px 0',
                  overflow: 'hidden',
                }}>
                  <CodeBlockHeader language={language} code={codeContent} />
                  <div style={{
                    maxHeight: '300px',
                    overflow: 'auto',
                    overflowX: 'auto',
                    background: '#1e1e1e',
                  }} className="code-scroll">
                    <SyntaxHighlighter
                      style={vscDarkPlus}
                      language={language}
                      PreTag="div"
                      customStyle={{
                        margin: 0,
                        padding: '12px',
                        fontSize: '13px',
                        background: 'transparent',
                      }}
                      {...props}
                    >
                      {codeContent}
                    </SyntaxHighlighter>
                  </div>
                </div>
              );
            }

            // 行内代码
            return (
              <code
                style={{
                  background: 'rgba(99, 102, 241, 0.1)',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontSize: '0.9em',
                  color: '#6366f1',
                  fontFamily: 'monospace',
                }}
                className={className}
                {...props}
              >
                {children}
              </code>
            );
          },
          pre({ children }: any) {
            return <>{children}</>;
          },
          p({ children }: any) {
            return <p style={{ margin: '8px 0', lineHeight: 1.6 }}>{children}</p>;
          },
          ul({ children }: any) {
            return <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>{children}</ul>;
          },
          ol({ children }: any) {
            return <ol style={{ margin: '8px 0', paddingLeft: '20px' }}>{children}</ol>;
          },
          li({ children }: any) {
            return <li style={{ margin: '4px 0', lineHeight: 1.5 }}>{children}</li>;
          },
          blockquote({ children }: any) {
            return (
              <blockquote style={{
                borderLeft: '4px solid #6366f1',
                margin: '8px 0',
                paddingLeft: '12px',
                color: '#6b7280',
                background: 'rgba(99, 102, 241, 0.05)',
                borderRadius: '0 4px 4px 0',
              }}>
                {children}
              </blockquote>
            );
          },
          h1({ children }: any) {
            return <h1 style={{ fontSize: '1.5em', margin: '12px 0 8px', fontWeight: 600 }}>{children}</h1>;
          },
          h2({ children }: any) {
            return <h2 style={{ fontSize: '1.3em', margin: '10px 0 6px', fontWeight: 600 }}>{children}</h2>;
          },
          h3({ children }: any) {
            return <h3 style={{ fontSize: '1.1em', margin: '8px 0 4px', fontWeight: 600 }}>{children}</h3>;
          },
          a({ children, href }: any) {
            return (
              <a
                href={href}
                style={{ color: '#6366f1', textDecoration: 'underline' }}
                target="_blank"
                rel="noopener noreferrer"
              >
                {children}
              </a>
            );
          },
          hr() {
            return <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '12px 0' }} />;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    );
  };

  // 始终使用 localMessages（实际更新的消息列表）
  const allMessages = localMessages;

  // 渲染错误消息气泡
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
              <span>请配置 API Key</span>
            </div>
            <div style={{ fontSize: '11px', color: '#92400E', marginTop: '4px', marginLeft: '22px' }}>
              点击右上角 <i className="fa-solid fa-cog"></i> 进行配置
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
                  {msg.role === 'assistant' ? (
                    // 流式过程中边接收边渲染 Markdown，添加光标效果
                    (isStreaming || typewriterIndex >= 0) && i === allMessages.length - 1 ? (
                      <div className="markdown-content" style={{ position: 'relative' }}>
                        {renderMessageContent(msg.content)}
                        {/* 光标效果 */}
                        {typewriterIndex > 0 && typewriterIndex < msg.content.length && (
                          <span style={{
                            position: 'absolute',
                            right: '-2px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            width: '2px',
                            height: '18px',
                            background: '#9D50BB',
                            animation: 'blink 1s infinite'
                          }}></span>
                        )}
                      </div>
                    ) : (
                      renderMessageContent(msg.content)
                    )
                  ) : (
                    <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.content}</div>
                  )}
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
            {isStreaming ? (
              <button
                className="chat-send-btn"
                onClick={handleStop}
                style={{ background: 'linear-gradient(135deg, #EF4444, #DC2626)' }}
                title="停止生成"
              >
                <i className="fa-solid fa-stop" style={{ fontSize: '12px' }}></i>
              </button>
            ) : (
              <button className="chat-send-btn" onClick={handleSend} disabled={!inputMessage.trim() || isTyping}>
                <i className="fa-solid fa-paper-plane" style={{ fontSize: '12px' }}></i>
              </button>
            )}
          </div>
        </div>
      </div>

    </>
  );
}

export default App;
