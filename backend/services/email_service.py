#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Email Service Module"""

import json
import uuid
import re
import os
import ssl
import imaplib
import email
from datetime import datetime
from typing import Dict, List, Optional

from models.database import db
from config import EMAIL_PROVIDERS, INLINE_IMAGES_DIR
from utils.email_parser import decode_text, extract_original_sender, get_imap_connection, parse_email_content


def get_providers() -> List[dict]:
    return [
        {'id': k, 'name': v['name'], 'icon': v['icon']}
        for k, v in EMAIL_PROVIDERS.items()
    ]


def get_accounts() -> List[dict]:
    with db.get_connection() as conn:
        accounts = conn.execute(
            "SELECT id, email, provider, created_at FROM email_accounts ORDER BY created_at DESC"
        ).fetchall()

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

    return result


def add_account(email_addr: str, password: str, provider: str) -> dict:
    if not email_addr or not password or not provider:
        return {'success': False, 'error': '请填写完整信息'}

    if provider not in EMAIL_PROVIDERS:
        return {'success': False, 'error': '不支持的邮箱提供商'}

    provider_config = EMAIL_PROVIDERS[provider]
    account_id = str(uuid.uuid4())
    now = int(datetime.now().timestamp())

    if provider == 'qq':
        username = email_addr.split('@')[0]
    else:
        username = email_addr

    try:
        test_account = {
            'imap_host': provider_config['imap_host'],
            'imap_port': provider_config['imap_port'],
            'username': username,
            'password': password,
            'provider': provider
        }
        print(f"[IMAP] 尝试连接 {provider}: {username}@{provider_config['imap_host']}:{provider_config['imap_port']}")
        conn = get_imap_connection(test_account)
        print(f"[IMAP] 连接成功")
        conn.logout()
    except Exception as e:
        error_msg = str(e)
        print(f"[IMAP] 连接失败: {error_msg}")

        if provider == 'qq' and 'Account is abnormal' in error_msg:
            return {
                'success': False,
                'error': 'QQ邮箱账户异常。请登录 mail.qq.com 检查：\n\n1. 账户是否被冻结或限制\n2. IMAP/SMTP服务是否已开启\n3. 登录频率是否过高'
            }

        if 'LOGIN' in error_msg or 'authentication' in error_msg.lower():
            hints = {
                'gmail': 'Gmail 登录失败。请确保：1) 已开启 IMAP 访问；2) 使用应用专用密码而非登录密码',
                'qq': 'QQ邮箱登录失败。请使用授权码（不是QQ密码）',
                '163': '163邮箱登录失败。请确保已开启 IMAP 服务，并使用授权码',
                'outlook': 'Outlook 登录失败。请使用 Microsoft 账户密码或应用专用密码'
            }
            return {'success': False, 'error': hints.get(provider, '请检查邮箱地址和密码/授权码是否正确')}

        return {'success': False, 'error': f'连接失败: {error_msg}'}

    with db.get_connection() as conn:
        conn.execute("""
            INSERT INTO email_accounts
            (id, email, provider, imap_host, smtp_host, username, password, imap_port, smtp_port, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            account_id, email_addr, provider,
            provider_config['imap_host'], provider_config['smtp_host'],
            username, password,
            provider_config['imap_port'], provider_config['smtp_port'],
            now, now
        ))

    return {'success': True, 'account_id': account_id, 'email': email_addr}


def get_account(account_id: str) -> Optional[dict]:
    with db.get_connection() as conn:
        acc = conn.execute(
            "SELECT id, email, provider, username, password, imap_host, imap_port, smtp_host, smtp_port FROM email_accounts WHERE id = ?",
            (account_id,)
        ).fetchone()

    if not acc:
        return None

    return {
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


def delete_account(account_id: str) -> bool:
    with db.get_connection() as conn:
        conn.execute("DELETE FROM email_messages WHERE account_id = ?", (account_id,))
        conn.execute("DELETE FROM email_accounts WHERE id = ?", (account_id,))
    return True


def sync_messages(account_id: str) -> dict:
    with db.get_connection() as conn:
        account = conn.execute(
            "SELECT * FROM email_accounts WHERE id = ?", (account_id,)
        ).fetchone()

    if not account:
        return {'success': False, 'error': '账户不存在'}

    print(f"[邮件同步] 开始同步: {account['email']}")

    ctx = ssl.create_default_context()
    try:
        if account['imap_port'] == 993:
            imap_conn = imaplib.IMAP4_SSL(account['imap_host'], account['imap_port'], ssl_context=ctx)
        else:
            imap_conn = imaplib.IMAP4(account['imap_host'], account['imap_port'])
        
        login_username = account['username']
        if account['provider'] == 'qq' and '@' in login_username:
            login_username = login_username.split('@')[0]
        
        imap_conn.login(login_username, account['password'])
        
        if account['provider'] == '163':
            try:
                imaplib.Commands['ID'] = ('AUTH', 'SELECTED')
                args = ("name", "client", "version", "1.0.0")
                imap_conn._simple_command('ID', '("' + '" "'.join(args) + '")')
            except: pass

        imap_conn.select('INBOX', readonly=True)

    except Exception as e:
        return {'success': False, 'error': f'连接/登录失败: {str(e)}'}

    email_uids = []
    try:
        status, messages = imap_conn.uid('SEARCH', None, 'UNSEEN')
        if status == 'OK':
            email_uids = messages[0].split()
    except Exception:
        pass

    fetched_emails = []
    fetched_count = 0
    now = int(datetime.now().timestamp())

    process_uids = email_uids[-20:] if email_uids else [] 
    
    if process_uids:
        print(f"[邮件同步] 发现 {len(process_uids)} 封未读邮件")

    for uid in process_uids:
        try:
            status, msg_data = imap_conn.uid('FETCH', uid, '(RFC822)')
            if status != 'OK': continue

            raw_email = msg_data[0][1]
            msg = email.message_from_bytes(raw_email)

            subject = decode_text(msg.get('subject', '无主题'))
            from_raw = msg.get('from', '')
            from_decoded = decode_text(from_raw)
            
            sender_email = ''
            email_match = re.search(r'([a-zA-Z0-9._%+-]+@[a-zA-Z0-9._%+-]+)', from_raw)
            if email_match:
                sender_email = email_match.group(1)

            date = msg.get('date', '')

            msg_uuid = str(uuid.uuid4())
            body, body_html, attachments = parse_email_content(msg, msg_uuid)

            reply_to = decode_text(msg.get('Reply-To', ''))
            original_sender_info = from_decoded
            if reply_to and reply_to != from_decoded:
                original_sender_info = f"{reply_to} (via {from_decoded})"
            elif "fwd:" in subject.lower() or "转发" in subject:
                original_sender_info = extract_original_sender(body, from_decoded)

            uid_str = uid.decode() if isinstance(uid, bytes) else str(uid)
            
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
            print(f"[邮件同步] 处理单封邮件失败 {uid}: {e}")
            continue

    imap_conn.logout()

    return {
        'success': True,
        'fetched_count': fetched_count,
        'messages': fetched_emails
    }


def get_messages(account_id: str, unread_only: bool = False) -> dict:
    with db.get_connection() as conn:
        account = conn.execute(
            "SELECT email, provider FROM email_accounts WHERE id = ?", (account_id,)
        ).fetchone()

    if not account:
        return {'success': False, 'error': '账户不存在'}

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

    return {
        'success': True,
        'account': {'email': account['email'], 'provider': account['provider']},
        'messages': result
    }


def get_message_detail(account_id: str, msg_id: str) -> dict:
    with db.get_connection() as conn:
        msg = conn.execute(
            "SELECT * FROM email_messages WHERE id = ? AND account_id = ?",
            (msg_id, account_id)
        ).fetchone()

    if not msg:
        return {'success': False, 'error': '邮件不存在'}

    with db.get_connection() as conn:
        conn.execute("UPDATE email_messages SET is_read = 1 WHERE id = ?", (msg_id,))
        unread = conn.execute(
            "SELECT COUNT(*) as count FROM email_messages WHERE account_id = ? AND is_read = 0",
            (account_id,)
        ).fetchone()

    return {
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
    }


def mark_single_read(account_id: str, msg_id: str) -> dict:
    with db.get_connection() as conn:
        account = conn.execute(
            "SELECT * FROM email_accounts WHERE id = ?", (account_id,)
        ).fetchone()
        msg = conn.execute(
            "SELECT uid FROM email_messages WHERE id = ?", (msg_id,)
        ).fetchone()

    if not account or not msg:
        return {'success': False, 'error': '邮件不存在'}

    try:
        imap_conn = get_imap_connection(dict(account))
        select_result = imap_conn.select('INBOX', readonly=False)
        print(f"[IMAP] 选择INBOX结果: {select_result}")

        if msg['uid']:
            uid = str(msg['uid'])
            print(f"[IMAP] 尝试标记已读: UID={uid}")
            
            before_flags = imap_conn.uid('FETCH', uid, '(FLAGS)')
            print(f"[IMAP] 标记前FLAGS: {before_flags}")
            
            if before_flags[1] == [None] or not before_flags[1]:
                print(f"[IMAP] UID {uid} 不存在，使用UID SEARCH搜索...")
                status, search_data = imap_conn.uid('SEARCH', None, 'ALL')
                print(f"[IMAP] UID SEARCH结果: {status}, {search_data}")
                if search_data[0]:
                    all_uids = search_data[0].split()
                    print(f"[IMAP] INBOX中共有 {len(all_uids)} 封邮件，UIDs: {all_uids[-5:]}")
                    for test_uid in all_uids[-3:]:
                        test_flags = imap_conn.uid('FETCH', test_uid.decode() if isinstance(test_uid, bytes) else test_uid, '(FLAGS)')
                        print(f"[IMAP] UID {test_uid}: {test_flags}")
            
            result = imap_conn.uid('STORE', uid, '+FLAGS', '\\Seen')
            print(f"[IMAP] 标记结果: {result}")
            
            after_flags = imap_conn.uid('FETCH', uid, '(FLAGS)')
            print(f"[IMAP] 标记后FLAGS: {after_flags}")

        imap_conn.close()
        imap_conn.logout()
    except Exception as e:
        print(f"[IMAP] 标记已读失败: {e}")

    with db.get_connection() as conn:
        conn.execute(
            "UPDATE email_messages SET is_read = 1 WHERE id = ? AND account_id = ?",
            (msg_id, account_id)
        )

    return {'success': True}


def mark_all_read(account_id: str) -> dict:
    with db.get_connection() as conn:
        account = conn.execute(
            "SELECT * FROM email_accounts WHERE id = ?", (account_id,)
        ).fetchone()

    if not account:
        return {'success': False, 'error': '账户不存在'}

    try:
        ctx = ssl.create_default_context()
        if account['imap_port'] == 993:
            imap_conn = imaplib.IMAP4_SSL(account['imap_host'], account['imap_port'], ssl_context=ctx)
        else:
            imap_conn = imaplib.IMAP4(account['imap_host'], account['imap_port'])

        imap_conn.login(account['username'], account['password'])

        try:
            imap_conn.select('INBOX', readonly=False)
        except Exception as select_err:
            print(f"[IMAP] 选择文件夹失败: {select_err}")
            try:
                imap_conn = imaplib.IMAP4_SSL(account['imap_host'], account['imap_port'], ssl_context=ctx)
                imap_conn.login(account['username'], account['password'])
                imap_conn.select('INBOX', readonly=False)
            except Exception as re_err:
                print(f"[IMAP] 重新连接失败: {re_err}")

        try:
            _, messages = imap_conn.search(None, 'UNSEEN')
            email_ids = messages[0].split() if messages[0] else []
            print(f"[IMAP] 找到 {len(email_ids)} 封未读邮件")

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

    with db.get_connection() as conn:
        conn.execute(
            "UPDATE email_messages SET is_read = 1 WHERE account_id = ?",
            (account_id,)
        )

    return {'success': True}
