#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
IMAP IDLE 监听服务 - 实时邮件推送
支持多账户并发监听，自动重连，新邮件实时推送
"""

import imaplib
import ssl
import email
import json
import re
import uuid
import threading
import time
import socket
import select
import os
import base64
import imghdr
from email.header import decode_header
from datetime import datetime
from typing import Optional, Dict, Any, Callable, List

imaplib.Debug = 0

imaplib.Commands['IDLE'] = ('NONAUTH', 'AUTH', 'SELECTED')


class IMAP4_SSL_IDLE(imaplib.IMAP4_SSL):
    def idle(self):
        tag = self._new_tag()
        self.send(tag + ' IDLE\r\n'.encode())
        response = self.readline()
        if not response.startswith(b'+'):
            raise imaplib.IMAP4.error(response.decode())
        return response
    
    def idle_done(self):
        self.send(b'DONE\r\n')
        return self.readline()
    
    def idle_check(self, timeout=60):
        sock = self.sock
        original_timeout = sock.gettimeout()
        sock.settimeout(timeout)
        
        try:
            ready = select.select([sock], [], [], timeout)
            if ready[0]:
                try:
                    data = sock.recv(8192)
                    if data:
                        return [data]
                except socket.timeout:
                    pass
                except Exception:
                    pass
        finally:
            sock.settimeout(original_timeout)
        return []


class IMAPIdleListener:
    def __init__(self, account_id: str, email_addr: str, provider: str,
                 imap_host: str, imap_port: int, username: str, password: str,
                 on_new_email: Callable[[Dict[str, Any]], None],
                 on_status_change: Callable[[str, str], None]):
        self.account_id = account_id
        self.email_addr = email_addr
        self.provider = provider
        self.imap_host = imap_host
        self.imap_port = imap_port
        self.username = username
        self.password = password
        self.on_new_email = on_new_email
        self.on_status_change = on_status_change
        
        # 双连接策略
        self.idle_conn: Optional[IMAP4_SSL_IDLE] = None  # 监听专用
        self.operation_conn: Optional[imaplib.IMAP4_SSL] = None  # 操作专用
        self.operation_lock = threading.Lock()
        
        self.running = False
        self.thread: Optional[threading.Thread] = None
        self.last_activity = time.time()
        self.supports_idle = True
        
        self.last_processed_uid: Optional[str] = None  # 跟踪已处理的最新 UID
        
    # 操作连接管理（标记已读、删除等）
    def get_operation_connection(self) -> Optional[imaplib.IMAP4_SSL]:
        with self.operation_lock:
            if self.operation_conn:
                try:
                    self.operation_conn.noop()
                    return self.operation_conn
                except:
                    self.operation_conn = None
            
            try:
                ctx = ssl.create_default_context()
                conn = imaplib.IMAP4_SSL(self.imap_host, self.imap_port, ssl_context=ctx)
                
                login_username = self.username
                if self.provider == 'qq' and '@' in login_username:
                    login_username = login_username.split('@')[0]
                
                conn.login(login_username, self.password)
                conn.select('INBOX', readonly=False)
                self.operation_conn = conn
                return conn
            except Exception as e:
                print(f"[IMAP] 操作连接失败: {e}")
                return None
    
    def release_operation_connection(self):
        with self.operation_lock:
            if self.operation_conn:
                try:
                    self.operation_conn.close()
                    self.operation_conn.logout()
                except:
                    pass
                self.operation_conn = None
    
    def mark_as_read(self, uid: str) -> bool:
        conn = self.get_operation_connection()
        if not conn:
            return False
        
        try:
            result = conn.uid('STORE', uid, '+FLAGS', '\\Seen')
            print(f"[IMAP] 标记已读结果: {result}")
            return True
        except Exception as e:
            print(f"[IMAP] 标记已读失败: {e}")
            self.operation_conn = None
            return False
        
    def decode_text(self, header_value):
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
    
    def check_idle_support(self) -> bool:
        try:
            status, capabilities = self.idle_conn.capability()
            if status == 'OK':
                caps = capabilities[0].decode().upper()
                return 'IDLE' in caps
        except:
            pass
        return False
    
    def connect(self) -> bool:
        try:
            ctx = ssl.create_default_context()
            
            self.idle_conn = IMAP4_SSL_IDLE(self.imap_host, self.imap_port, ssl_context=ctx)
            
            login_username = self.username
            if self.provider == 'qq' and '@' in login_username:
                login_username = login_username.split('@')[0]
            
            self.idle_conn.login(login_username, self.password)
            
            if self.provider in ['163', '126', 'yeah', '188']:
                try:
                    imaplib.Commands['ID'] = ('AUTH', 'SELECTED')
                    args = ("name", "DeskMate", "version", "1.0.0")
                    self.idle_conn._simple_command('ID', '("' + '" "'.join(args) + '")')
                except:
                    pass
            
            self.supports_idle = self.check_idle_support()
            print(f"[IMAP IDLE] {self.email_addr} 连接成功, IDLE支持: {self.supports_idle}")
            
            self.idle_conn.select('INBOX', readonly=True)
            return True
            
        except Exception as e:
            print(f"[IMAP IDLE] {self.email_addr} 连接失败: {e}")
            return False
    
    def fetch_new_email(self, uid: bytes) -> Optional[Dict[str, Any]]:
        try:
            status, msg_data = self.idle_conn.uid('FETCH', uid, '(RFC822)')
            if status != 'OK' or not msg_data or not msg_data[0]:
                return None
            
            raw_email = msg_data[0][1]
            msg = email.message_from_bytes(raw_email)
            
            subject = self.decode_text(msg.get('subject', '无主题'))
            from_raw = msg.get('from', '')
            from_decoded = self.decode_text(from_raw)
            
            sender_email = ''
            email_match = re.search(r'([a-zA-Z0-9._%+-]+@[a-zA-Z0-9._%+-]+)', from_raw)
            if email_match:
                sender_email = email_match.group(1)
            
            date = msg.get('date', '')
            
            body = ''
            body_html = ''
            
            def parse_part(part):
                nonlocal body, body_html
                try:
                    content_type = part.get_content_type()
                    if part.is_multipart():
                        for sub_part in part.get_payload():
                            parse_part(sub_part)
                    else:
                        payload = part.get_payload(decode=True)
                        if content_type == 'text/html':
                            charset = part.get_content_charset() or 'utf-8'
                            body_html += payload.decode(charset, errors='ignore')
                        elif content_type == 'text/plain':
                            charset = part.get_content_charset() or 'utf-8'
                            body += payload.decode(charset, errors='ignore')
                except:
                    pass
            
            parse_part(msg)
            
            msg_uuid = str(uuid.uuid4())
            uid_str = uid.decode() if isinstance(uid, bytes) else str(uid)
            
            return {
                'id': msg_uuid,
                'account_id': self.account_id,
                'uid': uid_str,
                'subject': subject,
                'sender': from_decoded,
                'sender_email': sender_email,
                'body': body[:10000],
                'body_html': body_html[:50000],
                'date': date,
                'is_read': 0,
                'fetched_at': int(datetime.now().timestamp())
            }
            
        except Exception as e:
            print(f"[IMAP IDLE] {self.email_addr} 获取邮件失败: {e}")
            return None
    
    def idle_loop(self):
        retry_count = 0
        max_retries = 5
        retry_delay = 5
        poll_interval = 30
        
        while self.running:
            try:
                if not self.idle_conn:
                    self.on_status_change(self.account_id, 'connecting')
                    if not self.connect():
                        retry_count += 1
                        if retry_count >= max_retries:
                            print(f"[IMAP IDLE] {self.email_addr} 重试次数超限，停止监听")
                            self.on_status_change(self.account_id, 'error')
                            break
                        time.sleep(retry_delay * retry_count)
                        continue
                    retry_count = 0
                
                self.on_status_change(self.account_id, 'listening')
                
                # 搜索新邮件（只获取比 last_processed_uid 更大的 UID）
                if self.last_processed_uid:
                    try:
                        status, uids = self.idle_conn.uid('SEARCH', None, f'UID {int(self.last_processed_uid) + 1}:*')
                        if status == 'OK' and uids[0]:
                            new_uids = uids[0].split()
                            print(f"[IMAP IDLE] {self.email_addr} 发现 {len(new_uids)} 封新邮件")
                            for uid in new_uids:
                                uid_str = uid.decode() if isinstance(uid, bytes) else uid
                                email_data = self.fetch_new_email(uid)
                                if email_data:
                                    self.on_new_email(email_data)
                                    self.last_processed_uid = uid_str
                    except Exception as e:
                        print(f"[IMAP IDLE] {self.email_addr} 搜索新邮件失败: {e}")
                
                if self.supports_idle:
                    try:
                        self.idle_conn.idle()
                        
                        timeout = 29 * 60
                        start_time = time.time()
                        
                        while self.running and (time.time() - start_time) < timeout:
                            try:
                                responses = self.idle_conn.idle_check(timeout=60)
                                
                                if responses:
                                    for response in responses:
                                        if isinstance(response, bytes):
                                            data_str = response.decode('utf-8', errors='ignore')
                                            if 'EXISTS' in data_str or 'RECENT' in data_str:
                                                print(f"[IMAP IDLE] {self.email_addr} 收到新邮件通知")
                                                
                                                self.idle_conn.idle_done()
                                                
                                                # 搜索新邮件（只获取比 last_processed_uid 更大的 UID）
                                                if self.last_processed_uid:
                                                    try:
                                                        status, uids = self.idle_conn.uid('SEARCH', None, f'UID {int(self.last_processed_uid) + 1}:*')
                                                        if status == 'OK' and uids[0]:
                                                            new_uids = uids[0].split()
                                                            print(f"[IMAP IDLE] {self.email_addr} 发现 {len(new_uids)} 封新邮件")
                                                            for uid in new_uids:
                                                                uid_str = uid.decode() if isinstance(uid, bytes) else uid
                                                                email_data = self.fetch_new_email(uid)
                                                                if email_data:
                                                                    self.on_new_email(email_data)
                                                                    self.last_processed_uid = uid_str
                                                    except Exception as e:
                                                        print(f"[IMAP IDLE] {self.email_addr} 搜索新邮件失败: {e}")
                                                
                                                self.idle_conn.idle()
                                                break
                            except Exception as e:
                                print(f"[IMAP IDLE] {self.email_addr} IDLE检查异常: {e}")
                                break
                        
                        if self.idle_conn:
                            try:
                                self.idle_conn.idle_done()
                            except:
                                pass
                    except Exception as e:
                        print(f"[IMAP IDLE] {self.email_addr} IDLE模式异常: {e}, 切换到轮询模式")
                        self.supports_idle = False
                else:
                    for _ in range(poll_interval):
                        if not self.running:
                            break
                        time.sleep(1)
                    
                    if self.running:
                        try:
                            self.idle_conn.select('INBOX', readonly=True)
                        except:
                            self.idle_conn = None
                
            except Exception as e:
                print(f"[IMAP IDLE] {self.email_addr} 监听异常: {e}")
                self.on_status_change(self.account_id, 'reconnecting')
                
                if self.idle_conn:
                    try:
                        self.idle_conn.logout()
                    except:
                        pass
                    self.idle_conn = None
                
                retry_count += 1
                if retry_count >= max_retries:
                    print(f"[IMAP IDLE] {self.email_addr} 重试次数超限，停止监听")
                    self.on_status_change(self.account_id, 'error')
                    break
                
                time.sleep(retry_delay * retry_count)
        
        self.on_status_change(self.account_id, 'stopped')
        print(f"[IMAP IDLE] {self.email_addr} 监听线程结束")
    
    def start(self):
        if self.running:
            return
        
        self.running = True
        self.thread = threading.Thread(target=self.idle_loop, daemon=True)
        self.thread.start()
        print(f"[IMAP IDLE] {self.email_addr} 开始监听")
    
    def stop(self):
        self.running = False
        if self.idle_conn:
            try:
                self.idle_conn.idle_done()
                self.idle_conn.logout()
            except:
                pass
            self.idle_conn = None
        
        self.release_operation_connection()


class IMAPIdleManager:
    def __init__(self, socketio, db_manager):
        self.socketio = socketio
        self.db = db_manager
        self.listeners: Dict[str, IMAPIdleListener] = {}
        self.lock = threading.Lock()
        
        self.provider_config = {
            'qq': {'host': 'imap.qq.com', 'port': 993},
            '163': {'host': 'imap.163.com', 'port': 993},
            '126': {'host': 'imap.126.com', 'port': 993},
            'yeah': {'host': 'imap.yeah.net', 'port': 993},
            '188': {'host': 'imap.188.com', 'port': 993},
            'gmail': {'host': 'imap.gmail.com', 'port': 993},
            'outlook': {'host': 'outlook.office365.com', 'port': 993},
            'hotmail': {'host': 'outlook.office365.com', 'port': 993},
            'yahoo': {'host': 'imap.mail.yahoo.com', 'port': 993},
            'icloud': {'host': 'imap.mail.me.com', 'port': 993},
        }
    
    def get_provider_config(self, email_addr: str, provider: str) -> tuple:
        if provider in self.provider_config:
            config = self.provider_config[provider]
            return config['host'], config['port']
        
        domain = email_addr.split('@')[-1] if '@' in email_addr else ''
        
        domain_map = {
            'qq.com': ('imap.qq.com', 993),
            '163.com': ('imap.163.com', 993),
            '126.com': ('imap.126.com', 993),
            'yeah.net': ('imap.yeah.net', 993),
            '188.com': ('imap.188.com', 993),
            'gmail.com': ('imap.gmail.com', 993),
            'outlook.com': ('outlook.office365.com', 993),
            'hotmail.com': ('outlook.office365.com', 993),
            'yahoo.com': ('imap.mail.yahoo.com', 993),
            'icloud.com': ('imap.mail.me.com', 993),
        }
        
        return domain_map.get(domain, ('imap.' + domain, 993))
    
    def save_email_to_db(self, email_data: Dict[str, Any]) -> bool:
        try:
            with self.db.get_connection() as conn:
                cursor = conn.cursor()
                
                cursor.execute("""
                    INSERT OR IGNORE INTO email_messages
                    (id, account_id, uid, subject, sender, sender_email, 
                     date, body, body_html, is_read, folder, fetched_at, attachments)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'INBOX', ?, ?)
                """, (
                    email_data['id'],
                    email_data['account_id'],
                    email_data['uid'],
                    email_data['subject'],
                    email_data['sender'],
                    email_data['sender_email'],
                    email_data['date'],
                    email_data.get('body', ''),
                    email_data.get('body_html', ''),
                    email_data.get('is_read', 0),
                    email_data.get('fetched_at', int(datetime.now().timestamp())),
                    email_data.get('attachments', '[]')
                ))
                
                if cursor.rowcount > 0:
                    conn.commit()
                    print(f"[IMAP IDLE] 邮件已保存到数据库: {email_data.get('subject', '无主题')[:30]}")
                    return True
                else:
                    print(f"[IMAP IDLE] 邮件已存在，跳过: {email_data.get('subject', '无主题')[:30]}")
                    return False
                    
        except Exception as e:
            print(f"[IMAP IDLE] 保存邮件到数据库失败: {e}")
            return False
    
    def on_new_email(self, email_data: Dict[str, Any]):
        try:
            account_id = email_data['account_id']
            
            saved = self.save_email_to_db(email_data)
            
            if saved:
                self.socketio.emit('new_email', {
                    'account_id': account_id,
                    'email': email_data,
                    'saved_to_db': True
                }, namespace='/')
                
                print(f"[IMAP IDLE] 推送新邮件通知: {email_data.get('subject', '无主题')}")
            else:
                print(f"[IMAP IDLE] 邮件已存在，不推送通知")
            
        except Exception as e:
            print(f"[IMAP IDLE] 处理新邮件失败: {e}")
    
    def on_status_change(self, account_id: str, status: str):
        try:
            self.socketio.emit('idle_status', {
                'account_id': account_id,
                'status': status
            }, namespace='/')
        except Exception as e:
            print(f"[IMAP IDLE] 状态推送失败: {e}")
    
    def start_listening(self, account_id: str) -> bool:
        with self.lock:
            if account_id in self.listeners:
                return True
            
            try:
                account = self.db.get_email_account(account_id)
                if not account:
                    print(f"[IMAP IDLE] 账户不存在: {account_id}")
                    return False
                
                email_addr = account['email']
                provider = account['provider']
                username = account['email']
                password = account['password']
                
                imap_host, imap_port = self.get_provider_config(email_addr, provider)
                
                listener = IMAPIdleListener(
                    account_id=account_id,
                    email_addr=email_addr,
                    provider=provider,
                    imap_host=imap_host,
                    imap_port=imap_port,
                    username=username,
                    password=password,
                    on_new_email=self.on_new_email,
                    on_status_change=self.on_status_change
                )
                
                self.listeners[account_id] = listener
                listener.start()
                
                self.on_status_change(account_id, 'connecting')
                
                return True
                
            except Exception as e:
                print(f"[IMAP IDLE] 启动监听失败: {e}")
                return False
    
    def stop_listening(self, account_id: str):
        with self.lock:
            if account_id in self.listeners:
                self.listeners[account_id].stop()
                del self.listeners[account_id]
    
    def stop_all(self):
        with self.lock:
            for listener in self.listeners.values():
                listener.stop()
            self.listeners.clear()
    
    def is_listening(self, account_id: str) -> bool:
        return account_id in self.listeners and self.listeners[account_id].running
    
    def mark_as_read(self, account_id: str, uid: str) -> bool:
        with self.lock:
            if account_id in self.listeners:
                return self.listeners[account_id].mark_as_read(uid)
        return False
    
    def get_status(self, account_id: str = None):
        if account_id:
            if account_id in self.listeners:
                return {account_id: 'listening' if self.listeners[account_id].running else 'stopped'}
            return {account_id: 'stopped'}
        
        return {
            acc_id: 'listening' if listener.running else 'stopped'
            for acc_id, listener in self.listeners.items()
        }
