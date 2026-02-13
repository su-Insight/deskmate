#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""SSH/SFTP Service Module"""

import stat
import paramiko
from datetime import datetime
from typing import Dict, Optional

from config import SSH_POOL_SIZE, SSH_TIMEOUT

ssh_connections: Dict[str, Dict] = {}


def get_ssh_client(host: str, port: int, username: str, password: str) -> paramiko.SSHClient:
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
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
    ssh.get_transport()
    return ssh


def close_ssh_connection(conn_id: str):
    if conn_id in ssh_connections:
        try:
            ssh_connections[conn_id]['sftp'].close()
            ssh_connections[conn_id]['ssh'].close()
        except Exception:
            pass
        del ssh_connections[conn_id]


def test_connection(host: str, port: int, username: str, password: str) -> dict:
    if not all([host, username, password]):
        return {'success': False, 'error': '请填写完整的连接信息'}

    try:
        ssh = get_ssh_client(host, port, username, password)
        transport = ssh.get_transport()
        if transport is None or not transport.is_authenticated():
            ssh.close()
            return {'success': False, 'error': 'SSH 认证失败'}

        sftp = ssh.open_sftp()
        try:
            sftp.stat('/')
        finally:
            sftp.close()
        ssh.close()
        return {'success': True, 'message': '连接成功'}
    except paramiko.AuthenticationException:
        return {'success': False, 'error': '认证失败，请检查用户名和密码'}
    except paramiko.SSHException as e:
        error_msg = str(e)
        if 'No route to host' in error_msg or 'Connection refused' in error_msg:
            return {'success': False, 'error': f'无法连接到服务器，请检查主机地址和端口 ({port}) 是否正确'}
        return {'success': False, 'error': f'SSH 错误: {error_msg}'}
    except Exception as e:
        error_msg = str(e)
        if 'Name or service not known' in error_msg:
            return {'success': False, 'error': '无法解析主机名，请检查服务器地址是否正确'}
        return {'success': False, 'error': f'连接失败: {error_msg}'}


def connect(host: str, port: int, username: str, password: str, root_path: str = '/') -> dict:
    if not all([host, username, password]):
        return {'success': False, 'error': '连接信息不完整'}

    conn_id = f"{username}@{host}:{port}-{root_path}"

    close_ssh_connection(conn_id)

    try:
        ssh = get_ssh_client(host, port, username, password)
        transport = ssh.get_transport()
        if transport is None or not transport.is_authenticated():
            ssh.close()
            return {'success': False, 'error': 'SSH 认证失败'}

        sftp = ssh.open_sftp()

        try:
            sftp.stat(root_path)
        except FileNotFoundError:
            sftp.close()
            ssh.close()
            return {'success': False, 'error': f'根目录不存在: {root_path}'}

        ssh_connections[conn_id] = {
            'ssh': ssh,
            'sftp': sftp,
            'root': root_path,
            'host': host,
            'username': username,
            'last_used': datetime.now().timestamp()
        }

        return {
            'success': True,
            'connection_id': conn_id,
            'root': root_path
        }
    except paramiko.AuthenticationException:
        return {'success': False, 'error': '认证失败，请检查用户名和密码'}
    except Exception as e:
        error_msg = str(e)
        if 'No route to host' in error_msg or 'Connection refused' in error_msg:
            return {'success': False, 'error': f'无法连接到服务器 (端口 {port})'}
        return {'success': False, 'error': error_msg}


def disconnect(conn_id: str) -> bool:
    close_ssh_connection(conn_id)
    return True


def list_files(conn_id: str, path: str) -> dict:
    if conn_id not in ssh_connections:
        return {'error': '连接已断开'}

    conn = ssh_connections[conn_id]
    conn['last_used'] = datetime.now().timestamp()

    root = conn.get('root', '/')

    try:
        if path.startswith('/'):
            pass
        elif path:
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
        return {'success': True, 'files': files}
    except Exception as e:
        return {'error': str(e)}


def read_file(conn_id: str, path: str) -> dict:
    if conn_id not in ssh_connections:
        return {'error': '连接已断开'}

    conn = ssh_connections[conn_id]
    conn['last_used'] = datetime.now().timestamp()

    root = conn.get('root', '/')
    if path.startswith('/'):
        pass
    elif path:
        path = (root if root == '/' else root) + '/' + path.lstrip('/')
    else:
        path = root

    try:
        with conn['sftp'].file(path, 'r') as remote_file:
            content = remote_file.read().decode('utf-8', errors='ignore')
        return {'success': True, 'content': content}
    except Exception as e:
        return {'error': str(e)}
