#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Database Manager Module"""

import sqlite3
from contextlib import contextmanager
from config import DB_PATH


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
            conn.execute("CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, title TEXT, mode TEXT DEFAULT 'private', created_at INTEGER, updated_at INTEGER)")
            conn.execute("CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, session_id TEXT, role TEXT, content TEXT, created_at INTEGER, FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE)")
            conn.execute("CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT, status INTEGER DEFAULT 0, priority INTEGER DEFAULT 1, due_date INTEGER, created_at INTEGER, updated_at INTEGER)")
            conn.execute("CREATE TABLE IF NOT EXISTS ai_config (config_key TEXT PRIMARY KEY, config_value TEXT, config_type TEXT, description TEXT, updated_at INTEGER)")

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

            try:
                conn.execute("ALTER TABLE email_messages ADD COLUMN from_raw TEXT")
            except:
                pass

            try:
                conn.execute("ALTER TABLE email_messages ADD COLUMN attachments TEXT")
            except:
                pass

            try:
                conn.execute("ALTER TABLE email_messages ADD COLUMN recipients TEXT")
            except:
                pass
            
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
