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
import stat
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
STORAGE_DIR = os.path.join(BASE_DIR, 'storage')
INLINE_IMAGES_DIR = os.path.join(STORAGE_DIR, 'inline_images')

# 确保 storage 目录存在
os.makedirs(INLINE_IMAGES_DIR, exist_ok=True)
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

            # 邮箱账户表
            conn.execute("""CREATE TABLE IF NOT EXISTS email_accounts (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL,
                provider TEXT NOT NULL,
                imap_host TEXT NOT NULL,
                smtp_host TEXT NOT NULL,
                username TEXT NOT NULL,
                password TEXT NOT NULL,
                imap_port INTEGER DEFAULT 993,
                smtp_port INTEGER DEFAULT 465,
                created_at INTEGER,
                updated_at INTEGER
            )""")

            # 邮箱邮件表
            conn.execute("""CREATE TABLE IF NOT EXISTS email_messages (
                id TEXT PRIMARY KEY,
                account_id TEXT NOT NULL,
                uid TEXT NOT NULL,
                subject TEXT,
                sender TEXT,
                sender_email TEXT,
                from_raw TEXT,
                recipients TEXT,
                date TEXT,
                body TEXT,
                body_html TEXT,
                is_read INTEGER DEFAULT 0,
                folder TEXT DEFAULT 'INBOX',
                fetched_at INTEGER,
                attachments TEXT,
                FOREIGN KEY(account_id) REFERENCES email_accounts(id) ON DELETE CASCADE,
                UNIQUE(account_id, uid)
            )""")

            # 添加 from_raw 列（如果不存在）
            try:
                conn.execute("ALTER TABLE email_messages ADD COLUMN from_raw TEXT")
            except:
                pass

            # 添加 attachments 列（如果不存在）
            try:
                conn.execute("ALTER TABLE email_messages ADD COLUMN attachments TEXT")
            except:
                pass

            # 添加 recipients 列（如果不存在）
            try:
                conn.execute("ALTER TABLE email_messages ADD COLUMN recipients TEXT")
            except:
                pass
            
            # 附件存储表
            conn.execute("""CREATE TABLE IF NOT EXISTS email_attachments (
                id TEXT PRIMARY KEY,
                message_id TEXT NOT NULL,
                filename TEXT NOT NULL,
                content_type TEXT,
                content_id TEXT,
                size INTEGER,
                data BLOB,
                is_inline INTEGER DEFAULT 0,
                FOREIGN KEY(message_id) REFERENCES email_messages(id) ON DELETE CASCADE
            )""")
            
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
    model_name = data.get('model_name', '').strip() or get_ai_config().get('model_name', '')

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

# ============================================
# 8. SSH/SFTP 连接管理
# ============================================

import paramiko

# 全局 SSH 连接池 {connection_id: {'ssh': SSHClient, 'sftp': SFTPClient, 'last_used': timestamp}}
ssh_connections: Dict[str, Dict] = {}
SSH_POOL_SIZE = 10
SSH_TIMEOUT = 300  # 5分钟超时

def get_ssh_client(host: str, port: int, username: str, password: str) -> paramiko.SSHClient:
    """创建并验证 SSH 连接"""
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    # 使用更可靠的连接参数
    ssh.connect(
        hostname=host,
        port=port,
        username=username,
        password=password,
        timeout=15,
        banner_timeout=15,
        auth_timeout=15,
        allow_agent=False,
        look_for_keys=False
    )
    # 确保连接会话已建立
    ssh.get_transport()
    return ssh

def close_ssh_connection(conn_id: str):
    """关闭 SSH 连接"""
    if conn_id in ssh_connections:
        try:
            ssh_connections[conn_id]['sftp'].close()
            ssh_connections[conn_id]['ssh'].close()
        except Exception:
            pass
        del ssh_connections[conn_id]

@app.route('/api/ssh/test', methods=['POST'])
def test_ssh_connection():
    """测试 SSH 连接"""
    data = request.json
    host = data.get('host', '').strip()
    port = int(data.get('port', 22))
    username = data.get('username', '').strip()
    password = data.get('password', '')

    if not all([host, username, password]):
        return jsonify({'success': False, 'error': '请填写完整的连接信息'}), 400

    try:
        ssh = get_ssh_client(host, port, username, password)
        # 确保传输层完全建立
        transport = ssh.get_transport()
        if transport is None or not transport.is_authenticated():
            ssh.close()
            return jsonify({'success': False, 'error': 'SSH 认证失败'}), 401

        # 打开 SFTP 并测试
        sftp = ssh.open_sftp()
        try:
            # 测试访问根目录
            sftp.stat('/')
        finally:
            sftp.close()
        ssh.close()
        return jsonify({'success': True, 'message': '连接成功'})
    except paramiko.AuthenticationException:
        return jsonify({'success': False, 'error': '认证失败，请检查用户名和密码'}), 401
    except paramiko.SSHException as e:
        error_msg = str(e)
        if 'No route to host' in error_msg or 'Connection refused' in error_msg:
            return jsonify({'success': False, 'error': f'无法连接到服务器，请检查主机地址和端口 ({port}) 是否正确'}), 500
        return jsonify({'success': False, 'error': f'SSH 错误: {error_msg}'}), 500
    except Exception as e:
        error_msg = str(e)
        if 'Name or service not known' in error_msg:
            return jsonify({'success': False, 'error': '无法解析主机名，请检查服务器地址是否正确'}), 500
        return jsonify({'success': False, 'error': f'连接失败: {error_msg}'}), 500

@app.route('/api/ssh/connect', methods=['POST'])
def ssh_connect():
    """建立持久 SSH 连接"""
    data = request.json
    host = data.get('host', '').strip()
    port = int(data.get('port', 22))
    username = data.get('username', '').strip()
    password = data.get('password', '')
    root_path = data.get('root', '/').strip()  # 支持自定义根目录

    if not all([host, username, password]):
        return jsonify({'success': False, 'error': '连接信息不完整'}), 400

    # 生成连接 ID
    conn_id = f"{username}@{host}:{port}-{root_path}"

    # 如果已有连接，先关闭
    close_ssh_connection(conn_id)

    try:
        ssh = get_ssh_client(host, port, username, password)
        # 再次确认连接已认证
        transport = ssh.get_transport()
        if transport is None or not transport.is_authenticated():
            ssh.close()
            return jsonify({'success': False, 'error': 'SSH 认证失败'}), 401

        # 打开 SFTP
        sftp = ssh.open_sftp()

        # 验证自定义根目录是否存在
        try:
            sftp.stat(root_path)
        except FileNotFoundError:
            sftp.close()
            ssh.close()
            return jsonify({'success': False, 'error': f'根目录不存在: {root_path}'}), 400

        ssh_connections[conn_id] = {
            'ssh': ssh,
            'sftp': sftp,
            'root': root_path,
            'host': host,
            'username': username,
            'last_used': datetime.now().timestamp()
        }

        return jsonify({
            'success': True,
            'connection_id': conn_id,
            'root': root_path
        })
    except paramiko.AuthenticationException:
        return jsonify({'success': False, 'error': '认证失败，请检查用户名和密码'}), 401
    except Exception as e:
        error_msg = str(e)
        if 'No route to host' in error_msg or 'Connection refused' in error_msg:
            return jsonify({'success': False, 'error': f'无法连接到服务器 (端口 {port})'}), 500
        return jsonify({'success': False, 'error': error_msg}), 500

@app.route('/api/ssh/disconnect', methods=['POST'])
def ssh_disconnect():
    """断开 SSH 连接"""
    data = request.json
    conn_id = data.get('connection_id', '')
    close_ssh_connection(conn_id)
    return jsonify({'success': True})

@app.route('/api/ssh/ls', methods=['POST'])
def ssh_list_files():
    """列出远程目录文件"""
    data = request.json
    conn_id = data.get('connection_id', '')
    path = data.get('path', '')

    if conn_id not in ssh_connections:
        return jsonify({'error': '连接已断开'}), 400

    conn = ssh_connections[conn_id]
    conn['last_used'] = datetime.now().timestamp()

    # 使用存储的根目录作为基础路径
    root = conn.get('root', '/')

    try:
        # 确保路径以根目录开头（绝对路径直接使用，相对路径则基于root）
        if path.startswith('/'):
            # 绝对路径直接使用
            pass
        elif path:
            # 相对路径，基于root构建
            path = root if root == '/' else root
            if not path.endswith('/'):
                path += '/'
            path += path.lstrip('/')
        else:
            path = root

        files = []
        for entry in conn['sftp'].listdir_attr(path):
            file_type = 'folder' if stat.S_ISDIR(entry.st_mode) else 'file'
            files.append({
                'name': entry.filename,
                'type': file_type,
                'path': f"{path}/{entry.filename}".replace('//', '/'),
                'size': entry.st_size,
                'mtime': entry.st_mtime
            })
        return jsonify({'success': True, 'files': files})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/ssh/read', methods=['POST'])
def ssh_read_file():
    """读取远程文件内容"""
    data = request.json
    conn_id = data.get('connection_id', '')
    path = data.get('path', '')

    if conn_id not in ssh_connections:
        return jsonify({'error': '连接已断开'}), 400

    conn = ssh_connections[conn_id]
    conn['last_used'] = datetime.now().timestamp()

    # 确保路径以根目录开头（绝对路径直接使用，相对路径则基于root）
    root = conn.get('root', '/')
    if path.startswith('/'):
        pass  # 绝对路径直接使用
    elif path:
        path = (root if root == '/' else root) + '/' + path.lstrip('/')
    else:
        path = root

    try:
        with conn['sftp'].file(path, 'r') as remote_file:
            content = remote_file.read().decode('utf-8', errors='ignore')
        return jsonify({'success': True, 'content': content})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ============================================
# 9. 网站图标获取
# ============================================

import re
from bs4 import BeautifulSoup
from urllib.parse import urljoin


def extract_icons(target_url):
    """从网站提取图标"""
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }

    try:
        # 处理 URL，去除路径只保留域名
        from urllib.parse import urlparse
        parsed = urlparse(target_url)
        base_url = f"{parsed.scheme}://{parsed.netloc}"

        response = httpx.get(base_url, headers=headers, timeout=10, follow_redirects=True)
        response.raise_for_status()
        html_content = response.text

        soup = BeautifulSoup(html_content, 'html.parser')
        icons = []

        for link in soup.find_all('link'):
            rel = link.get('rel')
            href = link.get('href')

            if not rel or not href:
                continue

            if isinstance(rel, str):
                rel = rel.split()

            rel_lower = [r.lower() for r in rel]

            if 'icon' in rel_lower or 'apple-touch-icon' in rel_lower:
                if href.startswith('http://') or href.startswith('https://'):
                    final_url = href
                elif href.startswith('//'):
                    final_url = 'https:' + href
                else:
                    cur_url = response.url
                    final_url = urljoin(str(cur_url), href)

                icons.append({
                    'type': link.get('type', 'unknown'),
                    'sizes': link.get('sizes', 'any'),
                    'url': final_url
                })

        return icons

    except Exception as e:
        print(f"解析图标出错: {e}")
        return []


def score_icon(icon_data):
    """为图标打分"""
    score = 0
    url = icon_data['url'].lower()
    rel = str(icon_data.get('rel', '')).lower()
    size_str = str(icon_data.get('sizes', 'any')).lower()

    if 'apple-touch-icon' in rel:
        score += 100
    elif 'manifest' in rel:
        score += 90
    elif 'fluid-icon' in rel:
        score += 80
    elif 'mask-icon' in rel:
        score += 70

    sizes = re.findall(r'\d+', size_str)
    if sizes:
        width = int(sizes[0])
        if 120 <= width <= 256:
            score += 50
        elif width > 256:
            score += 40
        elif width < 64:
            score -= 20

    if url.endswith('.svg'):
        score += 60
    elif url.endswith('.png'):
        score += 30
    elif url.endswith('.ico'):
        score += 10

    return score


def select_best_icon(icon_list):
    """选择最优图标"""
    if not icon_list:
        return None
    sorted_icons = sorted(icon_list, key=score_icon, reverse=True)
    return sorted_icons[0]


@app.route('/api/icons/extract', methods=['POST'])
def get_website_icon():
    """获取网站图标 API"""
    try:
        data = request.get_json() or {}
        website = data.get('website', '').strip()

        if not website:
            return jsonify({'success': False, 'error': '网站地址不能为空'}), 400

        # 确保 URL 有协议头
        if not website.startswith(('http://', 'https://')):
            website = 'https://' + website

        print(f"[图标获取] 正在请求: {website}")
        icons = extract_icons(website)
        print(f"[图标获取] 找到 {len(icons)} 个图标")

        if not icons:
            return jsonify({'success': True, 'icon_url': None, 'message': '未找到图标'})

        best = select_best_icon(icons)
        print(f"[图标获取] 选择最佳图标: {best['url'] if best else 'None'}")

        return jsonify({
            'success': True,
            'icon_url': best['url'] if best else None,
            'all_icons': icons
        })

    except Exception as e:
        print(f"[图标获取] 错误: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================
# 邮箱系统 API
# ============================================

# 邮箱提供商配置
EMAIL_PROVIDERS = {
    'gmail': {
        'name': 'Gmail',
        'imap_host': 'imap.gmail.com',
        'smtp_host': 'smtp.gmail.com',
        'imap_port': 993,
        'smtp_port': 465,
        'icon': 'https://www.google.com/favicon.ico'
    },
    'outlook': {
        'name': 'Outlook',
        'imap_host': 'imap-mail.outlook.com',
        'smtp_host': 'smtp-mail.outlook.com',
        'imap_port': 993,
        'smtp_port': 587,
        'icon': 'https://www.microsoft.com/favicon.ico'
    },
    'qq': {
        'name': 'QQ邮箱',
        'imap_host': 'imap.qq.com',
        'smtp_host': 'smtp.qq.com',
        'imap_port': 993,
        'smtp_port': 465,
        'icon': 'https://mail.qq.com/favicon.ico'
    },
    '163': {
        'name': '163邮箱',
        'imap_host': 'imap.163.com',
        'smtp_host': 'smtp.163.com',
        'imap_port': 993,
        'smtp_port': 465,
        'icon': 'https://www.163.com/favicon.ico'
    },
    'yahoo': {
        'name': 'Yahoo',
        'imap_host': 'imap.mail.yahoo.com',
        'smtp_host': 'smtp.mail.yahoo.com',
        'imap_port': 993,
        'smtp_port': 587,
        'icon': 'https://www.yahoo.com/favicon.ico'
    },
    'icloud': {
        'name': 'iCloud',
        'imap_host': 'imap.mail.me.com',
        'smtp_host': 'smtp.mail.me.com',
        'imap_port': 993,
        'smtp_port': 587,
        'icon': 'https://www.icloud.com/favicon.ico'
    }
}


def get_imap_connection(account):
    """创建 IMAP 连接"""
    import imaplib
    import ssl

    context = ssl.create_default_context()
    try:
        if account['imap_port'] == 993:
            conn = imaplib.IMAP4_SSL(account['imap_host'], account['imap_port'], ssl_context=context)
        else:
            conn = imaplib.IMAP4(account['imap_host'], account['imap_port'])
        conn.login(account['username'], account['password'])
        return conn
    except Exception as e:
        print(f"[IMAP] 连接失败: {e}")
        raise e


@app.route('/api/email/providers', methods=['GET'])
def get_email_providers():
    """获取支持的邮箱提供商列表"""
    return jsonify({
        'success': True,
        'providers': [
            {'id': k, 'name': v['name'], 'icon': v['icon']}
            for k, v in EMAIL_PROVIDERS.items()
        ]
    })


@app.route('/api/email/accounts', methods=['GET'])
def get_email_accounts():
    """获取所有已绑定的邮箱账户"""
    try:
        with db.get_connection() as conn:
            accounts = conn.execute(
                "SELECT id, email, provider, created_at FROM email_accounts ORDER BY created_at DESC"
            ).fetchall()

        # 获取每个账户的未读邮件数
        result = []
        for acc in accounts:
            with db.get_connection() as conn:
                unread = conn.execute(
                    "SELECT COUNT(*) as count FROM email_messages WHERE account_id = ? AND is_read = 0",
                    (acc['id'],)
                ).fetchone()

            result.append({
                'id': acc['id'],
                'email': acc['email'],
                'provider': acc['provider'],
                'unread_count': unread['count'] if unread else 0,
                'created_at': acc['created_at']
            })

        return jsonify({'success': True, 'accounts': result})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/email/accounts', methods=['POST'])
def add_email_account():
    """添加邮箱账户"""
    try:
        data = request.get_json() or {}
        email = data.get('email', '').strip().lower()
        password = data.get('password', '').strip()
        provider = data.get('provider', '').strip()

        if not email or not password or not provider:
            return jsonify({'success': False, 'error': '请填写完整信息'}), 400

        if provider not in EMAIL_PROVIDERS:
            return jsonify({'success': False, 'error': '不支持的邮箱提供商'}), 400

        provider_config = EMAIL_PROVIDERS[provider]

        # 创建账户ID
        account_id = str(uuid.uuid4())
        now = int(datetime.now().timestamp())

        # QQ邮箱用户名处理：去掉 @qq.com 后缀
        if provider == 'qq':
            username = email.split('@')[0]
        else:
            username = email

        # 尝试连接验证
        try:
            test_account = {
                'imap_host': provider_config['imap_host'],
                'imap_port': provider_config['imap_port'],
                'username': username,
                'password': password
            }
            print(f"[IMAP] 尝试连接 {provider}: {username}@{provider_config['imap_host']}:{provider_config['imap_port']}")
            conn = get_imap_connection(test_account)
            print(f"[IMAP] 连接成功")
            conn.logout()
        except Exception as e:
            error_msg = str(e)
            print(f"[IMAP] 连接失败: {error_msg}")

            # QQ邮箱特殊错误处理（优先检测）
            if provider == 'qq' and 'Account is abnormal' in error_msg:
                return jsonify({
                    'success': False,
                    'error': 'QQ邮箱账户异常。请登录 mail.qq.com 检查：\n\n1. 账户是否被冻结或限制\n2. IMAP/SMTP服务是否已开启\n3. 登录频率是否过高\n\n建议：\n- 稍等几分钟后再试\n- 检查是否已开启 IMAP/SMTP 服务\n- 确认授权码正确（不是QQ密码）'
                }), 401

            if 'LOGIN' in error_msg or 'authentication' in error_msg.lower():
                if provider == 'gmail':
                    hint = 'Gmail 登录失败。请确保：1) 已开启 IMAP 访问；2) 使用应用专用密码而非登录密码'
                elif provider == 'qq':
                    hint = 'QQ邮箱登录失败。\n\n解决方法：\n1. 登录 QQ 邮箱网页版 (mail.qq.com)\n2. 点击设置 → 账户 → 开启 IMAP/SMTP 服务\n3. 生成授权码（注意：不是 QQ 密码！）\n4. 使用授权码作为密码登录'
                elif provider == '163':
                    hint = '163邮箱登录失败。请确保已开启 IMAP 服务，并使用授权码'
                elif provider == 'outlook':
                    hint = 'Outlook 登录失败。请使用 Microsoft 账户密码或应用专用密码'
                else:
                    hint = '请检查邮箱地址和密码/授权码是否正确'
                return jsonify({'success': False, 'error': hint}), 401

            return jsonify({'success': False, 'error': f'连接失败: {error_msg}'}), 401

        # 保存到数据库
        with db.get_connection() as conn:
            conn.execute("""
                INSERT INTO email_accounts
                (id, email, provider, imap_host, smtp_host, username, password, imap_port, smtp_port, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                account_id, email, provider,
                provider_config['imap_host'], provider_config['smtp_host'],
                username, password,
                provider_config['imap_port'], provider_config['smtp_port'],
                now, now
            ))

        return jsonify({'success': True, 'account_id': account_id, 'email': email})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/email/accounts/<account_id>', methods=['GET'])
def get_email_account(account_id):
    """获取单个邮箱账户详情（包括密码）"""
    try:
        with db.get_connection() as conn:
            acc = conn.execute(
                "SELECT id, email, provider, username, password, imap_host, imap_port, smtp_host, smtp_port FROM email_accounts WHERE id = ?",
                (account_id,)
            ).fetchone()

        if not acc:
            return jsonify({'success': False, 'error': '账户不存在'}), 404

        return jsonify({
            'success': True,
            'account': {
                'id': acc['id'],
                'email': acc['email'],
                'provider': acc['provider'],
                'username': acc['username'],
                'password': acc['password'],
                'imap_host': acc['imap_host'],
                'imap_port': acc['imap_port'],
                'smtp_host': acc['smtp_host'],
                'smtp_port': acc['smtp_port']
            }
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/email/accounts/<account_id>', methods=['DELETE'])
def delete_email_account(account_id):
    """删除邮箱账户"""
    try:
        with db.get_connection() as conn:
            conn.execute("DELETE FROM email_messages WHERE account_id = ?", (account_id,))
            conn.execute("DELETE FROM email_accounts WHERE id = ?", (account_id,))
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/email/accounts/<account_id>', methods=['PUT'])
def update_email_account(account_id):
    """更新邮箱账户"""
    try:
        data = request.get_json() or {}
        email = data.get('email', '').strip().lower()
        password = data.get('password', '').strip()  # 可选，留空则不更新密码
        provider = data.get('provider', '').strip()

        if not email or not provider:
            return jsonify({'success': False, 'error': '邮箱地址和提供商不能为空'}), 400

        if provider not in EMAIL_PROVIDERS:
            return jsonify({'success': False, 'error': '不支持的邮箱提供商'}), 400

        provider_config = EMAIL_PROVIDERS[provider]

        # QQ邮箱用户名处理：去掉 @qq.com 后缀
        if provider == 'qq':
            username = email.split('@')[0]
        else:
            username = email

        # 获取原账户信息
        with db.get_connection() as conn:
            old_account = conn.execute(
                "SELECT * FROM email_accounts WHERE id = ?", (account_id,)
            ).fetchone()

        if not old_account:
            return jsonify({'success': False, 'error': '账户不存在'}), 404

        # 如果提供了新密码，需要验证密码是否正确
        if password:
            try:
                test_account = {
                    'imap_host': provider_config['imap_host'],
                    'imap_port': provider_config['imap_port'],
                    'username': username,
                    'password': password
                }
                conn = get_imap_connection(test_account)
                conn.logout()
            except Exception as e:
                error_msg = str(e)
                if 'LOGIN' in error_msg or 'authentication' in error_msg.lower():
                    return jsonify({'success': False, 'error': '密码验证失败，请检查新密码是否正确'}), 401
                return jsonify({'success': False, 'error': f'连接验证失败: {error_msg}'}), 401

        # 更新数据库
        now = int(datetime.now().timestamp())
        with db.get_connection() as conn:
            if password:
                conn.execute("""
                    UPDATE email_accounts
                    SET email = ?, provider = ?, imap_host = ?, smtp_host = ?,
                        username = ?, password = ?, imap_port = ?, smtp_port = ?,
                        updated_at = ?
                    WHERE id = ?
                """, (
                    email, provider,
                    provider_config['imap_host'], provider_config['smtp_host'],
                    username, password,
                    provider_config['imap_port'], provider_config['smtp_port'],
                    now, account_id
                ))
            else:
                # 不更新密码
                conn.execute("""
                    UPDATE email_accounts
                    SET email = ?, provider = ?, imap_host = ?, smtp_host = ?,
                        username = ?, imap_port = ?, smtp_port = ?,
                        updated_at = ?
                    WHERE id = ?
                """, (
                    email, provider,
                    provider_config['imap_host'], provider_config['smtp_host'],
                    username,
                    provider_config['imap_port'], provider_config['smtp_port'],
                    now, account_id
                ))

        return jsonify({'success': True, 'email': email})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/email/accounts/<account_id>/sync', methods=['POST'])
def sync_email_messages(account_id):
    """同步邮件 - 获取未读邮件（含附件与原始发件人解析）"""
    import imaplib
    import ssl
    import email
    import json
    import re
    import uuid
    from email.header import decode_header
    from datetime import datetime

    # --- 辅助函数：解码头部 ---
    def decode_text(header_value):
        if not header_value:
            return ''
        try:
            decoded_parts = decode_header(header_value)
            text_parts = []
            for part, encoding in decoded_parts:
                if isinstance(part, bytes):
                    try:
                        if encoding:
                            text = part.decode(encoding)
                        else:
                            text = part.decode('utf-8', errors='ignore')
                    except:
                        text = part.decode('gbk', errors='ignore')
                else:
                    text = str(part)
                text_parts.append(text)
            return ''.join(text_parts).strip()
        except Exception:
            return str(header_value)

    # --- 辅助函数：尝试解析转发邮件中的原始发件人 ---
    def extract_original_sender(text_body, default_sender):
        if not text_body:
            return default_sender
        
        # 常见转发分隔符模式
        patterns = [
            r"From:\s*([^\n\r]+)",              # 通用 From: xxx
            r"发件人[:：]\s*([^\n\r]+)",         # 中文 发件人: xxx
            r"-----Original Message-----.*?From:\s*([^\n\r]+)" # Outlook风格
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text_body, re.IGNORECASE | re.DOTALL)
            if match:
                raw_extracted = match.group(1).strip()
                # 清理提取出的内容（去掉可能的HTML标签或多余字符）
                clean_match = re.sub(r'<.*?>', '', raw_extracted)
                return f"{clean_match} (via {default_sender})"
        
        return default_sender

    try:
        # 1. 获取账户信息
        with db.get_connection() as conn:
            account = conn.execute(
                "SELECT * FROM email_accounts WHERE id = ?", (account_id,)
            ).fetchone()

        if not account:
            return jsonify({'success': False, 'error': '账户不存在'}), 404

        print(f"[邮件同步] 开始同步: {account['email']}")

        # 2. 连接 IMAP
        ctx = ssl.create_default_context()
        try:
            if account['imap_port'] == 993:
                imap_conn = imaplib.IMAP4_SSL(account['imap_host'], account['imap_port'], ssl_context=ctx)
            else:
                imap_conn = imaplib.IMAP4(account['imap_host'], account['imap_port'])
            
            # 登录处理
            login_username = account['username']
            if account['provider'] == 'qq' and '@' in login_username:
                login_username = login_username.split('@')[0]
            
            imap_conn.login(login_username, account['password'])
            
            # 163 ID 命令
            if account['provider'] == '163':
                try:
                    imaplib.Commands['ID'] = ('AUTH', 'SELECTED')
                    args = ("name", "client", "version", "1.0.0")
                    imap_conn._simple_command('ID', '("' + '" "'.join(args) + '")')
                except: pass

            imap_conn.select('INBOX', readonly=True)

        except Exception as e:
            return jsonify({'success': False, 'error': f'连接/登录失败: {str(e)}'}), 500

        # 3. 搜索邮件
        email_ids = []
        try:
            # 优先搜索未读，如果没有则不搜索ALL（避免量太大），或者按需策略
            status, messages = imap_conn.search(None, 'UNSEEN')
            if status == 'OK':
                email_ids = messages[0].split()
        except Exception:
            pass

        fetched_emails = [] # 用于返回给前端的列表
        fetched_count = 0
        now = int(datetime.now().timestamp())

        # 限制单次同步数量，防止超时
        process_ids = email_ids[-20:] if email_ids else [] 
        
        if process_ids:
            print(f"[邮件同步] 发现 {len(process_ids)} 封未读邮件")

        for email_id in process_ids:
            try:
                status, msg_data = imap_conn.fetch(email_id, '(RFC822)')
                if status != 'OK': continue

                raw_email = msg_data[0][1]
                msg = email.message_from_bytes(raw_email)

                # --- 基础信息解析 ---
                subject = decode_text(msg.get('subject', '无主题'))
                from_raw = msg.get('from', '')
                from_decoded = decode_text(from_raw)
                
                # 提取标准邮箱地址
                sender_email = ''
                email_match = re.search(r'([a-zA-Z0-9._%+-]+@[a-zA-Z0-9._%+-]+)', from_raw)
                if email_match:
                    sender_email = email_match.group(1)

                date = msg.get('date', '')

                # --- 内容与附件解析 ---
                body = ''
                body_html = ''
                attachments = []
                inline_images = {}

                def parse_part(part):
                    """递归解析邮件部分"""
                    nonlocal body, body_html, attachments, inline_images
                    try:
                        content_type = part.get_content_type()
                        content_disposition = str(part.get('Content-Disposition', ''))
                        content_id = part.get('Content-ID', '')

                        # 获取文件名
                        filename = part.get_filename()
                        if filename:
                            filename = decode_text(filename)

                        # 获取附件内容
                        payload = part.get_payload(decode=True)
                        
                        # 调试：打印所有非文本部分
                        if not content_type.startswith('text/'):
                            print(f"[调试] 非文本部分: type={content_type}, cid={content_id}, filename={filename}, disposition={content_disposition}")
                        
                        # 检查是否是图片（通过 Content-Type 或文件扩展名）
                        image_extensions = ('.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp')
                        is_image = content_type.startswith('image/') or (filename and filename.lower().endswith(image_extensions))
                        
                        # === 内嵌图片处理 ===
                        if is_image:
                            # 有 Content-ID 的图片
                            if content_id:
                                cid = content_id.strip('<>')
                                # 根据文件扩展名确定实际类型
                                actual_type = content_type
                                if filename:
                                    ext = filename.lower().rsplit('.', 1)[-1]
                                    type_map = {'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'gif': 'image/gif', 'webp': 'image/webp', 'bmp': 'image/bmp'}
                                    if ext in type_map:
                                        actual_type = type_map[ext]
                                inline_images[cid] = {
                                    'filename': filename or f"image_{len(inline_images) + 1}",
                                    'content_type': actual_type,
                                    'data': payload,
                                    'size': len(payload) if payload else 0
                                }
                                print(f"[调试] 添加内嵌图片(CID): {cid}")
                                return
                            # inline disposition 的图片
                            elif 'inline' in content_disposition.lower():
                                if filename:
                                    inline_images[filename] = {
                                        'filename': filename,
                                        'content_type': content_type,
                                        'data': payload,
                                        'size': len(payload) if payload else 0
                                    }
                                    print(f"[调试] 添加内嵌图片(inline): {filename}")
                                    return
                            # 有文件名但没有明确标记为 attachment 的图片，也作为内嵌图片
                            elif filename and 'attachment' not in content_disposition.lower():
                                inline_images[filename] = {
                                    'filename': filename,
                                    'content_type': content_type,
                                    'data': payload,
                                    'size': len(payload) if payload else 0
                                }
                                print(f"[调试] 添加内嵌图片(文件名): {filename}")
                                return

                        # === 真正的附件处理 ===
                        if filename or 'attachment' in content_disposition.lower():
                            if not filename:
                                filename = "unknown_file"

                            attachments.append({
                                'id': str(uuid.uuid4()),
                                'filename': filename,
                                'size': len(payload) if payload else 0,
                                'content_type': content_type,
                                'data': payload
                            })
                            return

                        # === 正文处理逻辑 ===
                        if content_type == 'text/html' or content_type == 'text/plain':
                            try:
                                charset = part.get_content_charset() or 'utf-8'
                                content = payload.decode(charset, errors='ignore')
                            except:
                                content = str(part.get_payload())

                            if content_type == 'text/html':
                                body_html += content
                            elif content_type == 'text/plain':
                                body += content
                    except Exception as e:
                        print(f"[邮件解析] 解析部分失败: {e}")

                # 递归遍历邮件部分（支持 multipart）
                def walk_parts(msg_part):
                    """递归遍历 multipart 的所有子部分"""
                    if msg_part.is_multipart():
                        for sub_part in msg_part.get_payload():
                            walk_parts(sub_part)
                    else:
                        parse_part(msg_part)

                walk_parts(msg)

                # --- 将内嵌图片保存到本地文件 ---
                def detect_image_extension(data):
                    """根据图片数据头部检测文件扩展名"""
                    if not data or len(data) < 8:
                        return 'png'
                    if data[:8] == b'\x89PNG\r\n\x1a\n':
                        return 'png'
                    elif data[:2] == b'\xff\xd8':
                        return 'jpg'
                    elif data[:6] in (b'GIF87a', b'GIF89a'):
                        return 'gif'
                    elif data[:4] == b'RIFF' and len(data) > 12 and data[8:12] == b'WEBP':
                        return 'webp'
                    return 'png'
                
                print(f"[调试] 内嵌图片数量: {len(inline_images)}, keys: {list(inline_images.keys())}")
                for cid, img_info in inline_images.items():
                    if img_info['data']:
                        ext = detect_image_extension(img_info['data'])
                        safe_cid = re.sub(r'[<>:"/\\|?*]', '_', cid)
                        filename = f"{msg_uuid}_{safe_cid}.{ext}"
                        filepath = os.path.join(INLINE_IMAGES_DIR, filename)
                        
                        with open(filepath, 'wb') as f:
                            f.write(img_info['data'])
                        
                        img_url = f"http://127.0.0.1:5000/api/email/inline-images/{filename}"
                        print(f"[调试] 替换 CID: {cid} -> {img_url}")
                        body_html = body_html.replace(f'cid:{cid}', img_url)
                        body_html = body_html.replace(f'src="cid:{cid}"', f'src="{img_url}"')
                        body_html = body_html.replace(f"src='cid:{cid}'", f"src='{img_url}'")
                
                import re
                remaining_cids = re.findall(r'cid:([^"\'\s>]+)', body_html)
                if remaining_cids:
                    print(f"[调试] 未替换的 CID: {remaining_cids}")
                    for remaining_cid in remaining_cids:
                        for stored_cid, img_info in inline_images.items():
                            if remaining_cid.lower() in stored_cid.lower() or stored_cid.lower() in remaining_cid.lower():
                                ext = detect_image_extension(img_info['data'])
                                safe_cid = re.sub(r'[<>:"/\\|?*]', '_', stored_cid)
                                filename = f"{msg_uuid}_{safe_cid}.{ext}"
                                filepath = os.path.join(INLINE_IMAGES_DIR, filename)
                                
                                with open(filepath, 'wb') as f:
                                    f.write(img_info['data'])
                                
                                img_url = f"http://127.0.0.1:5000/api/email/inline-images/{filename}"
                                body_html = body_html.replace(f'cid:{remaining_cid}', img_url)
                                break

                # --- 原始发件人逻辑 ---
                # 1. 优先看 Reply-To
                reply_to = decode_text(msg.get('Reply-To', ''))
                # 2. 如果是转发(Fwd)，尝试从正文提取
                original_sender_info = from_decoded
                if reply_to and reply_to != from_decoded:
                     original_sender_info = f"{reply_to} (via {from_decoded})"
                elif "fwd:" in subject.lower() or "转发" in subject:
                    # 尝试从纯文本正文中提取
                    original_sender_info = extract_original_sender(body, from_decoded)

                msg_uuid = str(uuid.uuid4())
                
                uid_str = str(email_id.decode())
                
                # 构造数据对象 (不包含附件数据，附件单独存储)
                email_data = {
                    'id': msg_uuid,
                    'account_id': account_id,
                    'uid': uid_str,
                    'subject': subject,
                    'sender': original_sender_info,
                    'sender_email': sender_email,
                    'body': body[:10000],
                    'body_html': body_html[:50000],
                    'attachments': json.dumps([{'id': a['id'], 'filename': a['filename'], 'size': a['size'], 'content_type': a['content_type']} for a in attachments]),
                    'date': date,
                    'is_read': 0,
                    'fetched_at': now
                }

                # --- 存入数据库 ---
                with db.get_connection() as db_conn:
                    cursor = db_conn.cursor()
                    cursor.execute("""
                        INSERT OR IGNORE INTO email_messages
                        (id, account_id, uid, subject, sender, sender_email, 
                         date, body, body_html, is_read, folder, fetched_at, attachments)
                        VALUES (:id, :account_id, :uid, :subject, :sender, :sender_email, 
                                :date, :body, :body_html, :is_read, 'INBOX', :fetched_at, :attachments)
                    """, email_data)
                    
                    if cursor.rowcount > 0:
                        # 保存附件到附件表
                        for att in attachments:
                            cursor.execute("""
                                INSERT INTO email_attachments (id, message_id, filename, content_type, size, data)
                                VALUES (?, ?, ?, ?, ?, ?)
                            """, (att['id'], msg_uuid, att['filename'], att['content_type'], att['size'], att['data']))
                        
                        fetched_count += 1
                        email_data['attachments'] = [{'id': a['id'], 'filename': a['filename'], 'size': a['size'], 'content_type': a['content_type']} for a in attachments]
                        fetched_emails.append(email_data)
                        print(f"[邮件同步] 新邮件: {subject[:30]} | 附件: {len(attachments)}")
                    else:
                        print(f"[邮件同步] 邮件已存在: {subject[:30]}")

            except Exception as e:
                print(f"[邮件同步] 处理单封邮件失败 {email_id}: {e}")
                continue

        imap_conn.logout()

        return jsonify({
            'success': True,
            'fetched_count': fetched_count,
            'messages': fetched_emails # 直接返回抓取到的邮件内容
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/email/accounts/<account_id>/messages', methods=['GET'])
def get_email_messages(account_id):
    """获取邮件列表"""
    try:
        unread_only = request.args.get('unread_only', 'false') == 'true'

        with db.get_connection() as conn:
            account = conn.execute(
                "SELECT email, provider FROM email_accounts WHERE id = ?", (account_id,)
            ).fetchone()

        if not account:
            return jsonify({'success': False, 'error': '账户不存在'}), 404

        query = "SELECT * FROM email_messages WHERE account_id = ?"
        params = [account_id]

        if unread_only:
            query += " AND is_read = 0"

        query += " ORDER BY fetched_at DESC LIMIT 100"

        with db.get_connection() as conn:
            messages = conn.execute(query, params).fetchall()

        result = []
        for msg in messages:
            result.append({
                'id': msg['id'],
                'subject': msg['subject'],
                'sender': msg['sender'],
                'sender_email': msg['sender_email'],
                'date': msg['date'],
                'is_read': msg['is_read'],
                'has_body': bool(msg['body'] or msg['body_html'])
            })

        return jsonify({
            'success': True,
            'account': {'email': account['email'], 'provider': account['provider']},
            'messages': result
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/email/accounts/<account_id>/messages/<msg_id>', methods=['GET'])
def get_email_message_detail(account_id, msg_id):
    """获取邮件详情"""
    try:
        with db.get_connection() as conn:
            msg = conn.execute(
                "SELECT * FROM email_messages WHERE id = ? AND account_id = ?",
                (msg_id, account_id)
            ).fetchone()

        if not msg:
            return jsonify({'success': False, 'error': '邮件不存在'}), 404

        # 标记为已读
        with db.get_connection() as conn:
            conn.execute(
                "UPDATE email_messages SET is_read = 1 WHERE id = ?",
                (msg_id,)
            )

        # 返回未读数量
        with db.get_connection() as conn:
            unread = conn.execute(
                "SELECT COUNT(*) as count FROM email_messages WHERE account_id = ? AND is_read = 0",
                (account_id,)
            ).fetchone()

        return jsonify({
            'success': True,
            'message': {
                'id': msg['id'],
                'subject': msg['subject'],
                'sender': msg['sender'],
                'sender_email': msg['sender_email'],
                'from_raw': msg['from_raw'],
                'recipients': msg['recipients'],
                'date': msg['date'],
                'body': msg['body'],
                'body_html': msg['body_html'],
                'is_read': msg['is_read'],
                'attachments': json.loads(msg['attachments']) if msg['attachments'] else []
            },
            'unread_count': unread['count'] if unread else 0
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/email/attachments/<attachment_id>', methods=['GET'])
def download_email_attachment(attachment_id):
    """下载附件"""
    try:
        with db.get_connection() as conn:
            att = conn.execute(
                "SELECT * FROM email_attachments WHERE id = ?",
                (attachment_id,)
            ).fetchone()

        if not att:
            return jsonify({'success': False, 'error': '附件不存在'}), 404

        from flask import Response
        response = Response(
            att['data'],
            mimetype=att['content_type'] or 'application/octet-stream',
            headers={
                'Content-Disposition': f'attachment; filename="{att["filename"]}"',
                'Content-Length': att['size']
            }
        )
        return response
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/email/inline-images/<filename>', methods=['GET'])
def get_inline_image(filename):
    """获取内嵌图片"""
    try:
        safe_filename = os.path.basename(filename)
        if not safe_filename:
            return jsonify({'success': False, 'error': '无效的文件名'}), 400
        
        filepath = os.path.join(INLINE_IMAGES_DIR, safe_filename)
        if not os.path.exists(filepath):
            return jsonify({'success': False, 'error': '图片不存在'}), 404
        
        ext = safe_filename.rsplit('.', 1)[-1].lower()
        mime_types = {
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'gif': 'image/gif',
            'webp': 'image/webp'
        }
        mime_type = mime_types.get(ext, 'application/octet-stream')
        
        from flask import send_file
        return send_file(filepath, mimetype=mime_type)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/email/accounts/<account_id>/mark-read', methods=['POST'])
def mark_all_as_read(account_id):
    """一键已读 - 同步到服务器"""
    try:
        # 获取账户信息
        with db.get_connection() as conn:
            account = conn.execute(
                "SELECT * FROM email_accounts WHERE id = ?", (account_id,)
            ).fetchone()

        if not account:
            return jsonify({'success': False, 'error': '账户不存在'}), 404

        # 连接到 IMAP 并标记所有未读邮件为已读
        try:
            import imaplib
            import ssl

            ctx = ssl.create_default_context()
            if account['imap_port'] == 993:
                imap_conn = imaplib.IMAP4_SSL(account['imap_host'], account['imap_port'], ssl_context=ctx)
            else:
                imap_conn = imaplib.IMAP4(account['imap_host'], account['imap_port'])

            # 登录
            imap_conn.login(account['username'], account['password'])

            # 选择邮箱文件夹
            try:
                imap_conn.select('INBOX', readonly=False)
            except Exception as select_err:
                print(f"[IMAP] 选择文件夹失败: {select_err}")
                # 尝试重新连接
                try:
                    imap_conn = imaplib.IMAP4_SSL(account['imap_host'], account['imap_port'], ssl_context=ctx)
                    imap_conn.login(account['username'], account['password'])
                    imap_conn.select('INBOX', readonly=False)
                except Exception as re_err:
                    print(f"[IMAP] 重新连接失败: {re_err}")

            # 搜索未读邮件
            try:
                _, messages = imap_conn.search(None, 'UNSEEN')
                email_ids = messages[0].split() if messages[0] else []
                print(f"[IMAP] 找到 {len(email_ids)} 封未读邮件")

                # 标记为已读
                if email_ids:
                    for email_id in email_ids:
                        try:
                            imap_conn.store(email_id, '+FLAGS', '\\Seen')
                        except Exception as store_err:
                            print(f"[IMAP] 标记失败: {store_err}")
                            continue
            except Exception as search_err:
                print(f"[IMAP] 搜索失败: {search_err}")

            imap_conn.logout()
        except Exception as e:
            print(f"[IMAP] 标记已读失败: {e}")

        # 更新本地数据库
        with db.get_connection() as conn:
            conn.execute(
                "UPDATE email_messages SET is_read = 1 WHERE account_id = ?",
                (account_id,)
            )

        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/email/accounts/<account_id>/mark-read/<msg_id>', methods=['POST'])
def mark_single_as_read(account_id, msg_id):
    """标记单封邮件为已读 - 同步到服务器"""
    try:
        # 获取账户信息
        with db.get_connection() as conn:
            account = conn.execute(
                "SELECT * FROM email_accounts WHERE id = ?", (account_id,)
            ).fetchone()
            msg = conn.execute(
                "SELECT uid FROM email_messages WHERE id = ?", (msg_id,)
            ).fetchone()

        if not account or not msg:
            return jsonify({'success': False, 'error': '邮件不存在'}), 404

        # 连接到 IMAP 并标记该邮件为已读
        try:
            imap_conn = get_imap_connection(dict(account))
            imap_conn.select('INBOX')

            # 使用 UID 标记已读
            if msg['uid']:
                try:
                    imap_conn.uid('STORE', msg['uid'], '+FLAGS', '\\Seen')
                except:
                    pass

            imap_conn.logout()
        except Exception as e:
            print(f"[IMAP] 标记已读失败: {e}")

        # 更新本地数据库
        with db.get_connection() as conn:
            conn.execute(
                "UPDATE email_messages SET is_read = 1 WHERE id = ? AND account_id = ?",
                (msg_id, account_id)
            )

        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/email/accounts/<account_id>/reply-url/<msg_id>', methods=['GET'])
def get_reply_url(account_id, msg_id):
    """获取网页回复链接"""
    try:
        with db.get_connection() as conn:
            account = conn.execute(
                "SELECT provider, email FROM email_accounts WHERE id = ?", (account_id,)
            ).fetchone()
            msg = conn.execute(
                "SELECT sender_email FROM email_messages WHERE id = ?", (msg_id,)
            ).fetchone()

        if not account or not msg:
            return jsonify({'success': False, 'error': '信息不存在'}), 404

        # 根据提供商返回不同的网页链接
        reply_urls = {
            'gmail': f"https://mail.google.com/mail/u/{account['email']}/#compose",
            'outlook': "https://outlook.live.com/mail/compose",
            'qq': "https://mail.qq.com/",
            '163': "https://mail.163.com/",
            'yahoo': "https://mail.yahoo.com/compose",
            'icloud': "https://www.icloud.com/mail/"
        }

        return jsonify({
            'success': True,
            'reply_url': reply_urls.get(account['provider'], ''),
            'to': msg['sender_email']
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


if __name__ == '__main__':
    print(f"DeskMate Backend 运行中... 数据库: {DB_PATH}")
    socketio.run(app, host='127.0.0.1', port=5000, debug=True)