# DeskMate

DeskMate (墨谈) - 智能桌面模块化工作空间

## 简介

DeskMate 是下一代智能桌面模块化工作空间，采用 Local-First 架构，结合 Electron 的跨平台能力与本地部署的大语言模型（LLM），为用户提供一个安全、可高度定制的沉浸式工作台。

## 核心功能

- **模块化桌面** - 磁贴形式自由组合，支持拖拽、缩放
- **文件管理** - 本地文件系统实时映射
- **待办事项** - 任务管理看板
- **日历** - 日程管理
- **AI 助手** - 支持私人模式(本地存储)和无痕模式

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Electron 28 |
| 前端框架 | React 18 + Vite |
| 主进程 | Node.js 18 + TypeScript |
| 后端服务 | Python + Flask |
| 本地数据库 | Better-SQLite3 |
| 向量数据库 | LanceDB |

## 快速开始

### 环境要求

- Node.js >= 18
- Python 3.9+
- npm 或 yarn

### 安装依赖

```bash
# 安装 Node.js 依赖
npm install

# 安装 Python 依赖
cd backend
pip install -r requirements.txt
```

### 启动开发服务器

```bash
# 启动前后端 (并行)
npm run dev

# 分别启动
npm run dev:electron  # 前端 + Electron
npm run dev:backend  # 后端服务
```

### 构建

```bash
# 构建生产版本
npm run build

# 构建并预览
npm run preview
```

## 项目结构

```
deskmate/
├── src/
│   ├── main/           # Electron 主进程 (TypeScript)
│   │   └── index.ts
│   ├── preload/        # 预加载脚本 (IPC 桥接)
│   │   └── index.ts
│   └── renderer/        # 渲染进程 (React + Vite)
│       ├── index.html
│       └── src/
│           ├── App.tsx
│           ├── main.tsx
│           └── styles/
│               └── main.css
├── backend/
│   ├── app.py          # Flask 后端
│   ├── requirements.txt
│   └── migrations/      # 数据库迁移
├── build/              # 构建资源
├── dist/               # 构建输出
├── vite.config.ts
├── tsconfig.json
└── package.json
```

## 开发规范

### Git 工作流

遵循 GitFlow 分支管理：

- `main` - 生产环境分支
- `develop` - 开发主干
- `feat/*` - 新功能分支
- `fix/*` - Bug 修复分支
- `hotfix/*` - 紧急修复分支

### Commit 规范

遵循 Conventional Commits：

- `feat`: 新增功能
- `fix`: 修复 Bug
- `docs`: 仅修改文档
- `style`: 格式修改
- `refactor`: 代码重构
- `chore`: 构建过程或辅助工具变动

## API 接口

### 健康检查

```bash
GET /api/health
```

### AI 聊天

```bash
POST /api/ai/chat
Content-Type: application/json

{
  "message": "你好",
  "mode": "private",  // 或 "incognito"
  "session_id": "uuid"  // 可选
}
```

### 会话管理

```bash
GET /api/sessions              # 获取会话列表
GET /api/sessions/:id          # 获取会话详情
DELETE /api/sessions/:id      # 删除会话
```

### 任务管理

```bash
GET /api/tasks                # 获取任务列表
POST /api/tasks               # 创建任务
PUT /api/tasks/:id            # 更新任务
DELETE /api/ttasks/:id        # 删除任务
```

## 配置

用户配置存储在 `backend/config/profile.json`:

```json
{
  "identity": {
    "name": "User",
    "role": "Software Engineer",
    "years_experience": 0
  },
  "preferences": {
    "language": "zh-CN",
    "code_style": "TypeScript",
    "response_conciseness": "medium"
  },
  "privacy_settings": {
    "allow_local_indexing": true,
    "cloud_sync_enabled": false
  }
}
```

## 许可证

MIT License

## 作者

DeskMate Team
