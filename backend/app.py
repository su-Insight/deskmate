#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
DeskMate Backend Service - 完整版本
提供 AI 对话、文件管理、数据库操作等 API 接口
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_socketio import SocketIO, emit
import os
import sys
import json
import sqlite3
import hashlib
import uuid
from datetime import datetime
from typing import Optional, Dict, List, Any
from contextlib import contextmanager

# ============================================
# 配置
# ============================================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, 'data', 'deskmate.db')
CONFIG_DIR = os.path.join(BASE_DIR, 'config')

# 确保目录存在
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
os.makedirs(CONFIG_DIR, exist_ok=True)

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})
socketio = SocketIO(app, cors_allowed_origins="*")

# ============================================
# 数据库管理
# ============================================

class DatabaseManager:
    """SQLite 数据库管理器"""

    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        """获取数据库连接"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    @contextmanager
    def get_connection(self):
        """上下文管理器形式的数据库连接"""
        conn = self._get_connection()
        try:
            yield conn
            conn.commit()
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            conn.close()

    def _init_db(self):
        """初始化数据库表"""
        with self.get_connection() as conn:
            # 创建迁移记录表
            conn.execute("""
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    migration_name TEXT NOT NULL UNIQUE,
                    applied_at INTEGER DEFAULT (unixepoch())
                )
            """)

            # 创建会话表
            conn.execute("""
                CREATE TABLE IF NOT EXISTS sessions (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    mode TEXT DEFAULT 'private',
                    created_at INTEGER DEFAULT (unixepoch()),
                    updated_at INTEGER DEFAULT (unixepoch())
                )
            """)

            # 创建消息表
            conn.execute("""
                CREATE TABLE IF NOT EXISTS messages (
                    id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    role TEXT CHECK(role IN ('user', 'assistant', 'system')) NOT NULL,
                    content TEXT NOT NULL,
                    tokens INTEGER,
                    created_at INTEGER DEFAULT (unixepoch()),
                    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
                )
            """)

            # 创建任务表
            conn.execute("""
                CREATE TABLE IF NOT EXISTS tasks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    content TEXT NOT NULL,
                    status INTEGER DEFAULT 0,
                    priority INTEGER DEFAULT 1,
                    due_date INTEGER,
                    created_at INTEGER DEFAULT (unixepoch()),
                    updated_at INTEGER DEFAULT (unixepoch())
                )
            """)

            # 创建 AI 配置表
            conn.execute("""
                CREATE TABLE IF NOT EXISTS ai_config (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    config_key TEXT NOT NULL UNIQUE,
                    config_value TEXT NOT NULL,
                    config_type TEXT DEFAULT 'string',
                    description TEXT,
                    created_at INTEGER DEFAULT (unixepoch()),
                    updated_at INTEGER DEFAULT (unixepoch())
                )
            """)

            # 创建设置类别表
            conn.execute("""
                CREATE TABLE IF NOT EXISTS ai_config_categories (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    category_name TEXT NOT NULL UNIQUE,
                    display_name TEXT NOT NULL,
                    icon TEXT,
                    sort_order INTEGER DEFAULT 0
                )
            """)

            # 创建索引
            conn.execute("CREATE INDEX IF NOT EXISTS idx_session ON messages(session_id)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_ai_config_key ON ai_config(config_key)")

        # 运行初始迁移
        self._run_initial_migrations()

    def _run_initial_migrations(self):
        """运行初始数据迁移"""
        # 插入默认配置类别
        with self.get_connection() as conn:
            categories = [
                ('provider', 'Provider Settings', 'fa-cloud', 1),
                ('model', 'Model Settings', 'fa-brain', 2),
                ('parameters', 'Generation Parameters', 'fa-sliders', 3),
                ('security', 'Security Settings', 'fa-shield', 4),
            ]
            for category_name, display_name, icon, sort_order in categories:
                conn.execute(
                    "INSERT OR IGNORE INTO ai_config_categories (category_name, display_name, icon, sort_order) VALUES (?, ?, ?, ?)",
                    (category_name, display_name, icon, sort_order)
                )

            # 插入默认 AI 配置项
            default_configs = [
                ('provider', 'openai', 'string', 'AI service provider'),
                ('api_key', '', 'secret', 'API key for the AI service'),
                ('base_url', 'https://api.openai.com/v1', 'string', 'API base URL'),
                ('model_name', 'gpt-4o', 'string', 'Model name to use'),
                ('thinking_model', '', 'string', 'Thinking model for advanced reasoning'),
                ('config_name', '', 'string', 'Configuration name'),
                ('system_prompt', 'You are DeskMate, a helpful AI assistant.', 'string', 'System prompt'),
                ('mode', 'private', 'string', '对话模式: private(保留历史) 或 incognito(不保留历史)'),
                ('stream_enabled', 'true', 'boolean', 'Enable streaming responses'),
            ]
            for config_key, config_value, config_type, description in default_configs:
                conn.execute(
                    "INSERT OR IGNORE INTO ai_config (config_key, config_value, config_type, description) VALUES (?, ?, ?, ?)",
                    (config_key, config_value, config_type, description)
                )

    def run_migration(self, migration_name: str, sql: str):
        """运行迁移脚本"""
        with self.get_connection() as conn:
            cursor = conn.execute(
                "SELECT id FROM schema_migrations WHERE migration_name = ?",
                (migration_name,)
            )
            if cursor.fetchone():
                print(f"Migration {migration_name} already applied")
                return

            conn.execute(sql)
            conn.execute(
                "INSERT INTO schema_migrations (migration_name) VALUES (?)",
                (migration_name,)
            )
            print(f"Migration {migration_name} applied")

# 初始化数据库
db = DatabaseManager()

# ============================================
# API 路由 - 健康检查
# ============================================

@app.route('/api/health', methods=['GET'])
def health_check():
    """健康检查接口"""
    return jsonify({
        'status': 'ok',
        'message': 'DeskMate Backend is running',
        'version': '1.0.0',
        'timestamp': datetime.now().isoformat()
    })

# ============================================
# API 路由 - AI 对话
# ============================================

@app.route('/api/ai/chat', methods=['POST'])
def ai_chat():
    """AI 聊天接口"""
    data = request.get_json()
    message = data.get('message', '')
    session_id = data.get('session_id')
    mode = data.get('mode', 'private')
    history = data.get('history', [])

    if not message:
        return jsonify({'success': False, 'error': '消息不能为空'}), 400

    # 创建或获取会话
    if not session_id:
        session_id = str(uuid.uuid4())
        with db.get_connection() as conn:
            conn.execute(
                "INSERT INTO sessions (id, title, mode) VALUES (?, ?, ?)",
                (session_id, message[:50], mode)
            )

    # 保存用户消息
    message_id = str(uuid.uuid4())
    with db.get_connection() as conn:
        conn.execute(
            "INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, ?, ?)",
            (message_id, session_id, 'user', message)
        )
        conn.execute(
            "UPDATE sessions SET updated_at = unixepoch() WHERE id = ?",
            (session_id,)
        )

    # 生成 AI 响应 (模拟)
    response_text = generate_ai_response(message, mode, history)

    # 保存 AI 消息
    response_id = str(uuid.uuid4())
    with db.get_connection() as conn:
        conn.execute(
            "INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, ?, ?)",
            (response_id, session_id, 'assistant', response_text)
        )

    return jsonify({
        'success': True,
        'response': response_text,
        'session_id': session_id,
        'message_id': response_id,
        'mode': mode
    })

@app.route('/api/ai/chat/stream', methods=['POST'])
def ai_chat_stream():
    """AI 流式聊天接口"""
    data = request.get_json()
    message = data.get('message', '')
    mode = data.get('mode', 'private')

    def generate():
        response = generate_ai_response(message, mode, [])
        for chunk in response:
            yield f"data: {json.dumps({'chunk': chunk, 'done': False})}\n\n"
        yield f"data: {json.dumps({'chunk': '', 'done': True})}\n\n"

    return app.response_class(
        generate(),
        mimetype='text/event-stream'
    )

@app.route('/api/ai/mode', methods=['POST'])
def set_ai_mode():
    """设置 AI 模式"""
    data = request.get_json()
    mode = data.get('mode', 'private')

    if mode not in ['private', 'incognito']:
        return jsonify({'success': False, 'error': '无效的模式'}), 400

    return jsonify({'success': True, 'mode': mode})

def generate_ai_response(message: str, mode: str, history: List[Dict]) -> str:
    """生成 AI 响应 (模拟实现)"""
    responses = [
        f"收到你的消息：{message}",
        "这是一个模拟的 AI 回复。",
        "我理解你的意思，让我思考一下...",
        f"当前模式：{mode}",
        "我正在学习如何更好地回答你的问题。",
        "感谢你的输入，我会继续改进的。"
    ]
    return responses[len(message) % len(responses)]

# ============================================
# API 路由 - 会话管理
# ============================================

@app.route('/api/sessions', methods=['GET'])
def get_sessions():
    """获取所有会话"""
    with db.get_connection() as conn:
        sessions = conn.execute(
            "SELECT * FROM sessions ORDER BY updated_at DESC LIMIT 50"
        ).fetchall()

    return jsonify({
        'success': True,
        'sessions': [dict(s) for s in sessions]
    })

@app.route('/api/sessions/<session_id>', methods=['GET'])
def get_session(session_id: str):
    """获取指定会话及其消息"""
    with db.get_connection() as conn:
        session = conn.execute(
            "SELECT * FROM sessions WHERE id = ?", (session_id,)
        ).fetchone()

        messages = conn.execute(
            "SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC",
            (session_id,)
        ).fetchall()

    if not session:
        return jsonify({'success': False, 'error': '会话不存在'}), 404

    return jsonify({
        'success': True,
        'session': dict(session),
        'messages': [dict(m) for m in messages]
    })

@app.route('/api/sessions/<session_id>', methods=['DELETE'])
def delete_session(session_id: str):
    """删除会话"""
    with db.get_connection() as conn:
        conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))

    return jsonify({'success': True})

# ============================================
# API 路由 - 任务管理
# ============================================

@app.route('/api/tasks', methods=['GET'])
def get_tasks():
    """获取所有任务"""
    with db.get_connection() as conn:
        tasks = conn.execute(
            "SELECT * FROM tasks ORDER BY priority DESC, created_at DESC"
        ).fetchall()

    return jsonify({
        'success': True,
        'tasks': [dict(t) for t in tasks]
    })

@app.route('/api/tasks', methods=['POST'])
def create_task():
    """创建任务"""
    data = request.get_json()
    content = data.get('content', '')
    priority = data.get('priority', 1)
    due_date = data.get('due_date')

    if not content:
        return jsonify({'success': False, 'error': '任务内容不能为空'}), 400

    with db.get_connection() as conn:
        conn.execute(
            "INSERT INTO tasks (content, priority, due_date) VALUES (?, ?, ?)",
            (content, priority, due_date)
        )

    return jsonify({'success': True})

@app.route('/api/tasks/<int:task_id>', methods=['PUT'])
def update_task(task_id: int):
    """更新任务"""
    data = request.get_json()
    updates = []
    values = []

    for field in ['content', 'status', 'priority', 'due_date']:
        if field in data:
            updates.append(f"{field} = ?")
            values.append(data[field])

    if not updates:
        return jsonify({'success': False, 'error': '没有可更新的字段'}), 400

    values.append(datetime.now().timestamp())
    values.append(task_id)

    with db.get_connection() as conn:
        conn.execute(
            f"UPDATE tasks SET {', '.join(updates)}, updated_at = ? WHERE id = ?",
            values
        )

    return jsonify({'success': True})

@app.route('/api/tasks/<int:task_id>', methods=['DELETE'])
def delete_task(task_id: int):
    """删除任务"""
    with db.get_connection() as conn:
        conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))

    return jsonify({'success': True})

# ============================================
# API 路由 - AI 配置管理
# ============================================

@app.route('/api/ai/config', methods=['GET'])
def get_ai_config():
    """获取所有 AI 配置"""
    try:
        with db.get_connection() as conn:
            configs = conn.execute(
                "SELECT config_key, config_value, config_type, description FROM ai_config"
            ).fetchall()

            categories = conn.execute(
                "SELECT * FROM ai_config_categories ORDER BY sort_order"
            ).fetchall()

        config_dict = {c['config_key']: c['config_value'] for c in configs}

        return jsonify({
            'success': True,
            'config': config_dict,
            'categories': [dict(c) for c in categories]
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# 测试端点 - 调试用
@app.route('/api/ai/config/test', methods=['POST'])
def test_config():
    """测试配置接收 - 返回接收到的数据"""
    print(f"[TEST] Content-Type: {request.content_type}")
    print(f"[TEST] Raw data: {request.data}")
    print(f"[TEST] Raw data length: {len(request.data)}")

    # 尝试不同方式解析
    result = {}
    result['get_json'] = None
    result['get_json_silent'] = None
    result['get_json_force'] = None

    try:
        result['get_json'] = request.get_json()
    except Exception as e:
        result['get_json_error'] = str(e)

    try:
        result['get_json_silent'] = request.get_json(silent=True)
    except Exception as e:
        result['get_json_silent_error'] = str(e)

    try:
        result['get_json_force'] = request.get_json(force=True)
    except Exception as e:
        result['get_json_force_error'] = str(e)

    return jsonify({
        'success': True,
        'received': result,
        'headers': dict(request.headers)
    })


@app.route('/api/ai/config/<config_key>', methods=['GET'])
def get_ai_config_item(config_key: str):
    """获取单个 AI 配置项"""
    try:
        with db.get_connection() as conn:
            config = conn.execute(
                "SELECT * FROM ai_config WHERE config_key = ?", (config_key,)
            ).fetchone()

        if not config:
            return jsonify({'success': False, 'error': '配置项不存在'}), 404

        return jsonify({'success': True, 'config': dict(config)})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/ai/config', methods=['POST'])
def save_ai_config():
    """保存 AI 配置"""
    # 添加详细日志
    print(f"[DEBUG] Content-Type: {request.content_type}")
    print(f"[DEBUG] Raw data: {request.data}")

    try:
        data = request.get_json()
        print(f"[DEBUG] Parsed JSON: {data}")
    except Exception as e:
        print(f"[ERROR] JSON parse failed: {e}")
        return jsonify({'success': False, 'error': f'JSON 解析失败: {str(e)}'}), 400

    if not data:
        print("[DEBUG] Data is empty or None")
        return jsonify({'success': False, 'error': '请求数据为空'}), 400

    try:
        with db.get_connection() as conn:
            for key, value in data.items():
                print(f"[DEBUG] Saving config: {key} = {value}")
                # 根据配置类型处理值
                config_type_result = conn.execute(
                    "SELECT config_type FROM ai_config WHERE config_key = ?", (key,)
                ).fetchone()

                if config_type_result:
                    config_type = config_type_result['config_type']
                    # 更新现有配置
                    if config_type == 'number':
                        conn.execute(
                            "UPDATE ai_config SET config_value = ?, updated_at = unixepoch() WHERE config_key = ?",
                            (str(value), key)
                        )
                    elif config_type == 'boolean':
                        conn.execute(
                            "UPDATE ai_config SET config_value = ?, updated_at = unixepoch() WHERE config_key = ?",
                            (str(value).lower(), key)
                        )
                    else:  # string or secret
                        conn.execute(
                            "UPDATE ai_config SET config_value = ?, updated_at = unixepoch() WHERE config_key = ?",
                            (str(value), key)
                        )
                else:
                    # Key 不存在，创建新记录
                    conn.execute(
                        "INSERT OR IGNORE INTO ai_config (config_key, config_value, config_type) VALUES (?, ?, 'string')",
                        (key, str(value))
                    )

        print("[DEBUG] Config saved successfully")
        return jsonify({'success': True})
    except Exception as e:
        print(f"[ERROR] save_ai_config: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/ai/config/<config_key>', methods=['PUT'])
def update_ai_config_item(config_key: str):
    """更新单个 AI 配置项"""
    data = request.get_json()

    if not data or 'value' not in data:
        return jsonify({'success': False, 'error': '缺少 value 字段'}), 400

    value = data['value']

    try:
        with db.get_connection() as conn:
            result = conn.execute(
                "UPDATE ai_config SET config_value = ?, updated_at = unixepoch() WHERE config_key = ?",
                (str(value).lower() if isinstance(value, bool) else str(value), config_key)
            )

            if result.rowcount == 0:
                return jsonify({'success': False, 'error': '配置项不存在'}), 404

        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/ai/config/reset', methods=['POST'])
def reset_ai_config():
    """重置 AI 配置为默认值"""
    try:
        with db.get_connection() as conn:
            # 重置默认配置项
            default_configs = [
                ('provider', 'openai', 'string'),
                ('base_url', 'https://api.openai.com/v1', 'string'),
                ('model_name', 'gpt-4o', 'string'),
                ('system_prompt', 'You are DeskMate, a helpful AI assistant.', 'string'),
                ('mode', 'private', 'string'),
                ('stream_enabled', 'true', 'boolean'),
            ]

            for config_key, config_value, config_type in default_configs:
                conn.execute(
                    "UPDATE ai_config SET config_value = ?, updated_at = unixepoch() WHERE config_key = ?",
                    (config_value, config_key)
                )

            # 不重置 api_key，保留原有值（为空）
            conn.execute(
                "UPDATE ai_config SET config_value = '' WHERE config_key = 'api_key'"
            )

        return jsonify({'success': True, 'message': '配置已重置为默认值'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================
# API 路由 - 文件管理
# ============================================

@app.route('/api/files/list', methods=['POST'])
def list_files():
    """获取文件列表"""
    data = request.get_json()
    dir_path = data.get('path', os.path.expanduser('~'))

    try:
        items = []
        for name in os.listdir(dir_path):
            item_path = os.path.join(dir_path, name)
            is_dir = os.path.isdir(item_path)
            size = os.path.getsize(item_path) if not is_dir else 0
            items.append({
                'name': name,
                'type': 'folder' if is_dir else 'file',
                'size': size,
                'path': item_path
            })

        # 按类型排序，文件夹在前
        items.sort(key=lambda x: (x['type'] != 'folder', x['name'].lower()))

        return jsonify({
            'success': True,
            'files': items,
            'path': dir_path
        })
    except PermissionError:
        return jsonify({'success': False, 'error': '没有权限访问此目录'}), 403
    except FileNotFoundError:
        return jsonify({'success': False, 'error': '目录不存在'}), 404
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# ============================================
# API 路由 - 用户配置
# ============================================

PROFILE_PATH = os.path.join(CONFIG_DIR, 'profile.json')

@app.route('/api/profile', methods=['GET'])
def get_profile():
    """获取用户配置"""
    try:
        if os.path.exists(PROFILE_PATH):
            with open(PROFILE_PATH, 'r', encoding='utf-8') as f:
                profile = json.load(f)
        else:
            profile = {
                'identity': {
                    'name': 'User',
                    'role': 'Software Engineer',
                    'years_experience': 0
                },
                'preferences': {
                    'language': 'zh-CN',
                    'code_style': 'TypeScript',
                    'response_conciseness': 'medium'
                },
                'privacy_settings': {
                    'allow_local_indexing': True,
                    'cloud_sync_enabled': False
                }
            }

        return jsonify({'success': True, 'profile': profile})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/profile', methods=['POST'])
def save_profile():
    """保存用户配置"""
    data = request.get_json()

    try:
        with open(PROFILE_PATH, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# ============================================
# WebSocket 事件
# ============================================

@socketio.on('connect')
def handle_connect():
    print('Client connected')
    emit('status', {'message': 'Connected to DeskMate Backend'})

@socketio.on('disconnect')
def handle_disconnect():
    print('Client disconnected')

# ============================================
# 主入口
# ============================================

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = '--dev' in sys.argv

    print(f"""
    ╔═══════════════════════════════════════════════════╗
    ║                                                   ║
    ║   DeskMate Backend Service                        ║
    ║   =============================                   ║
    ║                                                   ║
    ║   Version: 1.0.0                                 ║
    ║   Port: {port:<5}                                  ║
    ║   Debug: {debug:<5}                                 ║
    ║   Database: {DB_PATH}              ║
    ║                                                   ║
    ╚═══════════════════════════════════════════════════╝
    """)

    socketio.run(
        app,
        host='127.0.0.1',
        port=port,
        debug=debug,
        allow_unsafe_werkzeug=True
    )
