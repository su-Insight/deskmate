#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
DeskMate Backend Service - 生产级最终版
集成功能：AI流式对话(动态厂商)、连接池复用、数据库持久化、任务管理、文件系统
"""

import os
import sys
import json
import sqlite3
import uuid
import httpx
import hashlib
from datetime import datetime
from typing import Optional, Dict, List, Any
from contextlib import contextmanager

from flask import Flask, jsonify, request, stream_with_context, Response
from flask_cors import CORS
from flask_socketio import SocketIO, emit
from openai import OpenAI

# ============================================
# 1. 基础配置与性能优化
# ============================================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, 'data', 'deskmate.db')
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})
socketio = SocketIO(app, cors_allowed_origins="*")

# 【性能关键】复用底层的 HTTP 连接池
shared_http_client = httpx.Client(
    limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
    timeout=httpx.Timeout(60.0)
)

# ============================================
# 2. 数据库增强管理
# ============================================

class DatabaseManager:
    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    @contextmanager
    def get_connection(self):
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
        with self.get_connection() as conn:
            # 会话、消息、任务、AI配置表
            conn.execute("CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, title TEXT, mode TEXT DEFAULT 'private', created_at INTEGER, updated_at INTEGER)")
            conn.execute("CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, session_id TEXT, role TEXT, content TEXT, created_at INTEGER, FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE)")
            conn.execute("CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT, status INTEGER DEFAULT 0, priority INTEGER DEFAULT 1, due_date INTEGER, created_at INTEGER, updated_at INTEGER)")
            conn.execute("CREATE TABLE IF NOT EXISTS ai_config (config_key TEXT PRIMARY KEY, config_value TEXT, config_type TEXT, description TEXT, updated_at INTEGER)")
            
            # 初始化默认配置
            defaults = [
                ('api_key', '', 'secret', 'API密钥'),
                ('base_url', 'https://api.openai.com/v1', 'string', 'API地址'),
                ('model_name', 'gpt-4o', 'string', '默认模型'),
                ('system_prompt', '你是一个 DeskMate 助手。', 'string', '系统提示词')
            ]
            for k, v, t, d in defaults:
                conn.execute("INSERT OR IGNORE INTO ai_config (config_key, config_value, config_type, description) VALUES (?, ?, ?, ?)", (k, v, t, d))

db = DatabaseManager()

# ============================================
# 3. 动态 AI 逻辑 (OpenRouter 风格)
# ============================================

def get_ai_config() -> Dict[str, str]:
    with db.get_connection() as conn:
        rows = conn.execute("SELECT config_key, config_value FROM ai_config").fetchall()
    return {row['config_key']: row['config_value'] for row in rows}

def get_dynamic_client():
    config = get_ai_config()
    key = config.get('api_key')
    url = config.get('base_url')
    if not key: return None
    # 动态创建 Client，但注入全局 shared_http_client 以保持极速
    return OpenAI(api_key=key, base_url=url, http_client=shared_http_client)

# ============================================
# 4. 核心 API 路由 (流式输出 + 自动保存)
# ============================================


import httpx
import time
from flask import request, jsonify

@app.route('/api/ai/check', methods=['POST'])
def check_api_availability():
    """拨测校验模式 - 验证 API 是否能正常生成内容"""
    data = request.get_json() or {}
    api_key = data.get('api_key', '').strip()
    base_url = data.get('base_url', '').strip()
    # 允许前端传入想测试的模型，默认用最便宜的
    model = data.get('model', 'gpt-4o-mini')

    if not api_key:
        return jsonify({'valid': False, 'error': 'API Key 未配置'}), 400

    # 1. 规范化地址：确保指向 /chat/completions
    base_url = base_url.rstrip('/')
    if not base_url.endswith('/chat/completions'):
        if '/v1' in base_url:
            test_url = f"{base_url}/chat/completions"
        else:
            test_url = f"{base_url}/v1/chat/completions"
    else:
        test_url = base_url

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "User-Agent": "LLM-Checker/1.0" # 简单的身份标识
    }

    # 2. 极简请求体：只拿 1 个 token，且开启流式以测首字延迟
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": "hi"}],
        "max_tokens": 1,
        "stream": True 
    }

    start_time = time.perf_counter()
    
    try:
        # 使用 stream 模式发起请求
        with httpx.Client(timeout=15.0) as client:
            with client.stream("POST", test_url, headers=headers, json=payload) as response:
                
                # 检查 HTTP 状态码
                if response.status_code != 200:
                    # 尝试读取错误详情
                    error_msg = response.read().decode('utf-8')
                    return handle_error(response.status_code, error_msg, response.json(), start_time)

                # 3. 核心改进：读取首个数据块（TTFT 计时）
                for line in response.iter_lines():
                    if line.startswith("data:"):
                        # 只要收到了第一个 data 块，就代表通路了
                        ttft_latency = round((time.perf_counter() - start_time) * 1000 / 2, 0)
                        
                        return jsonify({
                            'valid': True,
                            'latency_ms': ttft_latency,
                            'status': 'operational' if ttft_latency < 5000 else 'degraded',
                            'info': f"响应正常 (首字延迟: {ttft_latency}ms)",
                            'model_tested': model,
                            'http_status': 200
                        })

                return jsonify({'valid': False, 'error': '未收到流式数据'}), 500

    except httpx.ConnectError as e:
        return jsonify({'valid': False, 'error': '无法连接到服务器，请检查 Base URL 或代理', 'raw_error_text': e}), 500
    except httpx.TimeoutException as e:
        return jsonify({'valid': False, 'error': '请求超时，网络状况不佳', 'raw_error_text': e}), 504
    except Exception as e:
        return jsonify({'valid': False, 'error': "网络连接失败", 'raw_error_text': e}), 500

def handle_error(status_code, error_text, raw_error_text, start_time):
    """根据状态码返回人性化的错误信息"""
    latency = round((time.perf_counter() - start_time) * 1000 / 2, 0)
    msgs = {
        401: "API Key 无效或已过期",
        404: "接口路径错误，请确认 Base URL 是否包含 /v1",
        429: "额度不足或触发频率限制",
        500: "供应商服务器内部错误",
        503: "服务不可用，请确认模型填写是否正确",
        504: "请求超时，网络状况不佳"
    }
    return jsonify({
        'valid': False,
        'error': msgs.get(status_code, f"HTTP {status_code}: {error_text[:100]}"),
        'latency_ms': latency,
        'raw_error_text': str(raw_error_text),
        'http_status': status_code
    }), status_code


@app.route('/api/ai/chat/stream', methods=['POST'])
def ai_chat_stream():
    data = request.get_json()
    user_msg = data.get('message', '')
    session_id = data.get('session_id') or str(uuid.uuid4())
    history = data.get('history', [])

    # 优先使用请求中的配置，其次使用数据库配置
    api_key = data.get('api_key', '').strip() or get_ai_config().get('api_key', '')
    base_url = data.get('base_url', '').strip() or get_ai_config().get('base_url', '')
    model_name = data.get('model_name', '').strip() or get_ai_config().get('model_name', 'gpt-4o')

    if not user_msg:
        return jsonify({'error': '内容不能为空'}), 400

    if not api_key:
        return jsonify({'error': '请先配置 API Key'}), 400

    # 预先保存用户输入
    with db.get_connection() as conn:
        conn.execute("INSERT OR IGNORE INTO sessions (id, title, updated_at) VALUES (?, ?, unixepoch())", (session_id, user_msg[:20]))
        conn.execute("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, 'user', ?, unixepoch())",
                     (str(uuid.uuid4()), session_id, user_msg))

    # 动态创建客户端
    try:
        client = OpenAI(api_key=api_key, base_url=base_url.rstrip('/') + '/v1' if base_url and not base_url.rstrip('/').endswith('/v1') else base_url, http_client=shared_http_client)
    except Exception as e:
        return jsonify({'error': f'API 配置错误: {str(e)}'}), 400

    system_prompt = get_ai_config().get('system_prompt', '你是一个 DeskMate 助手。')

    @stream_with_context
    def generate():
        messages = [{"role": "system", "content": system_prompt}]
        for m in history: messages.append({"role": m['role'], "content": m['content']})
        messages.append({"role": "user", "content": user_msg})

        try:
            full_reply = ""
            response = client.chat.completions.create(
                model=model_name,
                messages=messages,
                stream=True
            )

            for chunk in response:
                # 安全获取内容，处理各种边缘情况
                try:
                    if chunk.choices and len(chunk.choices) > 0:
                        delta = getattr(chunk.choices[0], 'delta', None)
                        if delta is not None:
                            txt = getattr(delta, 'content', None) or ''
                        else:
                            txt = ''
                    else:
                        txt = ''

                    if txt:
                        full_reply += txt
                        yield f"data: {json.dumps({'content': txt, 'done': False})}\n\n"
                except Exception as chunk_err:
                    # 忽略单块解析错误，继续处理
                    print(f"[Stream Chunk Error] {chunk_err}")
                    continue

            # 自动保存 AI 回复
            with db.get_connection() as conn:
                conn.execute("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, 'assistant', ?, unixepoch())",
                             (str(uuid.uuid4()), session_id, full_reply))
                conn.execute("UPDATE sessions SET updated_at = unixepoch() WHERE id = ?", (session_id,))

            yield f"data: {json.dumps({'done': True, 'session_id': session_id})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return Response(generate(), mimetype='text/event-stream')

# ============================================
# 5. 任务与文件管理 (CRUD)
# ============================================

@app.route('/api/tasks', methods=['GET', 'POST'])
def manage_tasks():
    if request.method == 'GET':
        with db.get_connection() as conn:
            tasks = conn.execute("SELECT * FROM tasks ORDER BY priority DESC, created_at DESC").fetchall()
        return jsonify({'tasks': [dict(t) for t in tasks]})
    
    data = request.json
    with db.get_connection() as conn:
        conn.execute("INSERT INTO tasks (content, priority, created_at) VALUES (?, ?, unixepoch())", 
                     (data['content'], data.get('priority', 1)))
    return jsonify({'success': True})

@app.route('/api/files/list', methods=['POST'])
def list_files():
    path = request.json.get('path', os.path.expanduser('~'))
    try:
        items = []
        for n in os.listdir(path):
            p = os.path.join(path, n)
            items.append({'name': n, 'type': 'folder' if os.path.isdir(p) else 'file', 'path': p})
        return jsonify({'success': True, 'files': items})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ============================================
# 6. 配置管理
# ============================================

@app.route('/api/ai/config', methods=['GET', 'POST'])
def handle_config():
    if request.method == 'GET':
        return jsonify({'config': get_ai_config()})
    
    data = request.json
    with db.get_connection() as conn:
        for k, v in data.items():
            conn.execute("UPDATE ai_config SET config_value = ?, updated_at = unixepoch() WHERE config_key = ?", (str(v), k))
    return jsonify({'success': True})

# ============================================
# 7. WebSocket 与 启动
# ============================================

@socketio.on('connect')
def test_connect():
    emit('status', {'data': 'Connected'})

if __name__ == '__main__':
    print(f"DeskMate Backend 运行中... 数据库: {DB_PATH}")
    socketio.run(app, host='127.0.0.1', port=5000, debug=True)