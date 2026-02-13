#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""DeskMate Backend Configuration"""

import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, 'data', 'deskmate.db')
STORAGE_DIR = os.path.join(BASE_DIR, 'storage')
INLINE_IMAGES_DIR = os.path.join(STORAGE_DIR, 'inline_images')

os.makedirs(INLINE_IMAGES_DIR, exist_ok=True)
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

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

SSH_POOL_SIZE = 10
SSH_TIMEOUT = 300
