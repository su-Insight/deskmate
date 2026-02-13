#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""API Routes Module"""

import json
import uuid
import os
from datetime import datetime
from flask import request, jsonify, Response

from extensions import app, socketio
from models.database import db
from config import EMAIL_PROVIDERS, INLINE_IMAGES_DIR
from services import ai_service, email_service, ssh_service
from utils.icon_extractor import extract_icons, select_best_icon


@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'ok'})


@app.route('/api/config', methods=['GET'])
def get_config():
    config = ai_service.get_ai_config()
    return jsonify({'success': True, 'config': config})


@app.route('/api/config', methods=['POST'])
def update_config():
    data = request.json
    with db.get_connection() as conn:
        for k, v in data.items():
            conn.execute("UPDATE ai_config SET config_value = ?, updated_at = unixepoch() WHERE config_key = ?", (v, k))
    return jsonify({'success': True})


@app.route('/api/check', methods=['POST'])
def check_api():
    data = request.json
    api_key = data.get('api_key', '')
    base_url = data.get('base_url', '')
    model = data.get('model', 'gpt-4o-mini')
    result = ai_service.check_api_availability(api_key, base_url, model)
    return jsonify(result)


@app.route('/api/chat', methods=['POST'])
def chat():
    data = request.json
    user_msg = data.get('message', '')
    session_id = data.get('session_id', str(uuid.uuid4()))
    history = data.get('history', [])
    
    config = ai_service.get_ai_config()
    api_key = config.get('api_key', '')
    base_url = config.get('base_url', '')
    model_name = config.get('model_name', 'gpt-4o')
    
    return ai_service.stream_chat(user_msg, session_id, history, api_key, base_url, model_name)


@app.route('/api/sessions', methods=['GET'])
def get_sessions():
    with db.get_connection() as conn:
        rows = conn.execute("SELECT id, title, mode, created_at, updated_at FROM sessions ORDER BY updated_at DESC").fetchall()
    return jsonify({'success': True, 'sessions': [dict(r) for r in rows]})


@app.route('/api/sessions/<session_id>', methods=['GET'])
def get_session(session_id):
    with db.get_connection() as conn:
        session = conn.execute("SELECT id, title, mode, created_at, updated_at FROM sessions WHERE id = ?", (session_id,)).fetchone()
        messages = conn.execute("SELECT id, role, content, created_at FROM messages WHERE session_id = ? ORDER BY created_at ASC", (session_id,)).fetchall()
    
    if not session:
        return jsonify({'success': False, 'error': 'Session not found'}), 404
    
    return jsonify({
        'success': True,
        'session': dict(session),
        'messages': [dict(m) for m in messages]
    })


@app.route('/api/sessions/<session_id>', methods=['DELETE'])
def delete_session(session_id):
    with db.get_connection() as conn:
        conn.execute("DELETE FROM messages WHERE session_id = ?", (session_id,))
        conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
    return jsonify({'success': True})


@app.route('/api/tasks', methods=['GET'])
def get_tasks():
    with db.get_connection() as conn:
        rows = conn.execute("SELECT * FROM tasks ORDER BY priority DESC, created_at DESC").fetchall()
    return jsonify({'success': True, 'tasks': [dict(r) for r in rows]})


@app.route('/api/tasks', methods=['POST'])
def add_task():
    data = request.json
    content = data.get('content', '')
    priority = data.get('priority', 1)
    due_date = data.get('due_date')
    
    with db.get_connection() as conn:
        conn.execute(
            "INSERT INTO tasks (content, priority, due_date, created_at, updated_at) VALUES (?, ?, ?, unixepoch(), unixepoch())",
            (content, priority, due_date)
        )
    return jsonify({'success': True})


@app.route('/api/tasks/<int:task_id>', methods=['PUT'])
def update_task(task_id):
    data = request.json
    status = data.get('status')
    priority = data.get('priority')
    
    with db.get_connection() as conn:
        if status is not None:
            conn.execute("UPDATE tasks SET status = ?, updated_at = unixepoch() WHERE id = ?", (status, task_id))
        if priority is not None:
            conn.execute("UPDATE tasks SET priority = ?, updated_at = unixepoch() WHERE id = ?", (priority, task_id))
    return jsonify({'success': True})


@app.route('/api/tasks/<int:task_id>', methods=['DELETE'])
def delete_task(task_id):
    with db.get_connection() as conn:
        conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
    return jsonify({'success': True})


@socketio.on('connect')
def test_connect():
    socketio.emit('status', {'data': 'Connected'})


@app.route('/api/ssh/test', methods=['POST'])
def test_ssh_connection():
    data = request.json
    host = data.get('host', '').strip()
    port = int(data.get('port', 22))
    username = data.get('username', '').strip()
    password = data.get('password', '')
    result = ssh_service.test_connection(host, port, username, password)
    if result['success']:
        return jsonify(result)
    return jsonify(result), 401 if '认证' in result.get('error', '') else 500


@app.route('/api/ssh/connect', methods=['POST'])
def ssh_connect():
    data = request.json
    host = data.get('host', '').strip()
    port = int(data.get('port', 22))
    username = data.get('username', '').strip()
    password = data.get('password', '')
    root_path = data.get('root', '/').strip()
    result = ssh_service.connect(host, port, username, password, root_path)
    if result['success']:
        return jsonify(result)
    return jsonify(result), 401 if '认证' in result.get('error', '') else 500


@app.route('/api/ssh/disconnect', methods=['POST'])
def ssh_disconnect():
    data = request.json
    conn_id = data.get('connection_id', '')
    ssh_service.disconnect(conn_id)
    return jsonify({'success': True})


@app.route('/api/ssh/ls', methods=['POST'])
def ssh_list_files():
    data = request.json
    conn_id = data.get('connection_id', '')
    path = data.get('path', '')
    result = ssh_service.list_files(conn_id, path)
    if 'error' in result:
        return jsonify(result), 400
    return jsonify(result)


@app.route('/api/ssh/read', methods=['POST'])
def ssh_read_file():
    data = request.json
    conn_id = data.get('connection_id', '')
    path = data.get('path', '')
    result = ssh_service.read_file(conn_id, path)
    if 'error' in result:
        return jsonify(result), 400
    return jsonify(result)


@app.route('/api/icons/extract', methods=['POST'])
def get_website_icon():
    try:
        data = request.get_json() or {}
        website = data.get('website', '').strip()

        if not website:
            return jsonify({'success': False, 'error': '网站地址不能为空'}), 400

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


@app.route('/api/email/providers', methods=['GET'])
def get_email_providers():
    providers = email_service.get_providers()
    return jsonify({'success': True, 'providers': providers})


@app.route('/api/email/accounts', methods=['GET'])
def get_email_accounts():
    accounts = email_service.get_accounts()
    return jsonify({'success': True, 'accounts': accounts})


@app.route('/api/email/accounts', methods=['POST'])
def add_email_account():
    data = request.get_json() or {}
    email_addr = data.get('email', '').strip().lower()
    password = data.get('password', '').strip()
    provider = data.get('provider', '').strip()
    result = email_service.add_account(email_addr, password, provider)
    if result['success']:
        return jsonify(result)
    return jsonify(result), 401 if '登录失败' in result.get('error', '') or '认证' in result.get('error', '') else 400


@app.route('/api/email/accounts/<account_id>', methods=['GET'])
def get_email_account(account_id):
    account = email_service.get_account(account_id)
    if not account:
        return jsonify({'success': False, 'error': '账户不存在'}), 404
    return jsonify({'success': True, 'account': account})


@app.route('/api/email/accounts/<account_id>', methods=['DELETE'])
def delete_email_account(account_id):
    email_service.delete_account(account_id)
    return jsonify({'success': True})


@app.route('/api/email/accounts/<account_id>', methods=['PUT'])
def update_email_account(account_id):
    data = request.get_json() or {}
    email_addr = data.get('email', '').strip().lower()
    password = data.get('password', '').strip()
    provider = data.get('provider', '').strip()

    if not email_addr or not provider:
        return jsonify({'success': False, 'error': '邮箱地址和提供商不能为空'}), 400

    if provider not in EMAIL_PROVIDERS:
        return jsonify({'success': False, 'error': '不支持的邮箱提供商'}), 400

    provider_config = EMAIL_PROVIDERS[provider]

    if provider == 'qq':
        username = email_addr.split('@')[0]
    else:
        username = email_addr

    with db.get_connection() as conn:
        old_account = conn.execute(
            "SELECT * FROM email_accounts WHERE id = ?", (account_id,)
        ).fetchone()

    if not old_account:
        return jsonify({'success': False, 'error': '账户不存在'}), 404

    if password:
        from utils.email_parser import get_imap_connection
        try:
            test_account = {
                'imap_host': provider_config['imap_host'],
                'imap_port': provider_config['imap_port'],
                'username': username,
                'password': password,
                'provider': provider
            }
            conn = get_imap_connection(test_account)
            conn.logout()
        except Exception as e:
            error_msg = str(e)
            if 'LOGIN' in error_msg or 'authentication' in error_msg.lower():
                return jsonify({'success': False, 'error': '密码验证失败，请检查新密码是否正确'}), 401
            return jsonify({'success': False, 'error': f'连接验证失败: {error_msg}'}), 401

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
                email_addr, provider,
                provider_config['imap_host'], provider_config['smtp_host'],
                username, password,
                provider_config['imap_port'], provider_config['smtp_port'],
                now, account_id
            ))
        else:
            conn.execute("""
                UPDATE email_accounts
                SET email = ?, provider = ?, imap_host = ?, smtp_host = ?,
                    username = ?, imap_port = ?, smtp_port = ?,
                    updated_at = ?
                WHERE id = ?
            """, (
                email_addr, provider,
                provider_config['imap_host'], provider_config['smtp_host'],
                username,
                provider_config['imap_port'], provider_config['smtp_port'],
                now, account_id
            ))

    return jsonify({'success': True, 'email': email_addr})


@app.route('/api/email/accounts/<account_id>/sync', methods=['POST'])
def sync_email_messages(account_id):
    result = email_service.sync_messages(account_id)
    if result['success']:
        return jsonify(result)
    return jsonify(result), 500


@app.route('/api/email/accounts/<account_id>/messages', methods=['GET'])
def get_email_messages(account_id):
    unread_only = request.args.get('unread_only', 'false') == 'true'
    result = email_service.get_messages(account_id, unread_only)
    if result['success']:
        return jsonify(result)
    return jsonify(result), 404


@app.route('/api/email/accounts/<account_id>/messages/<msg_id>', methods=['GET'])
def get_email_message_detail(account_id, msg_id):
    result = email_service.get_message_detail(account_id, msg_id)
    if result['success']:
        return jsonify(result)
    return jsonify(result), 404


@app.route('/api/email/attachments/<attachment_id>', methods=['GET'])
def download_email_attachment(attachment_id):
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
    result = email_service.mark_all_read(account_id)
    return jsonify(result)


@app.route('/api/email/accounts/<account_id>/mark-read/<msg_id>', methods=['POST'])
def mark_single_as_read(account_id, msg_id):
    result = email_service.mark_single_read(account_id, msg_id)
    return jsonify(result)


@app.route('/api/email/accounts/<account_id>/reply-url/<msg_id>', methods=['GET'])
def get_reply_url(account_id, msg_id):
    try:
        with db.get_connection() as conn:
            account = conn.execute(
                "SELECT provider, email FROM email_accounts WHERE id = ?", (account_id,)
            ).fetchone()
            msg = conn.execute(
                "SELECT sender_email FROM email_messages WHERE id = ?", (msg_id,)
            ).fetchone()

        if not account or not msg:
            return jsonify({'success': False, 'error': '账户或邮件不存在'}), 404

        provider = account['provider']
        sender_email = msg['sender_email']

        reply_urls = {
            'qq': f"https://mail.qq.com/cgi-bin/readtemplate?check=false&t=compose&to={sender_email}",
            '163': f"https://mail.163.com/js6/main.jsp?sid=&func=mbox:compose&to={sender_email}",
            'gmail': f"https://mail.google.com/mail/?view=cm&fs=1&to={sender_email}",
            'outlook': f"https://outlook.live.com/mail/0/deeplink/compose?to={sender_email}",
            'yahoo': f"https://mail.yahoo.com/d/compose-message?to={sender_email}",
            'icloud': f"https://www.icloud.com/mail/compose?to={sender_email}"
        }

        reply_url = reply_urls.get(provider)
        if not reply_url:
            return jsonify({'success': False, 'error': '暂不支持该邮箱提供商的网页回复'}), 400

        return jsonify({'success': True, 'reply_url': reply_url})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
