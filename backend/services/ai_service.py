#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""AI Service Module"""

import json
import uuid
from typing import Dict, List, Optional
from flask import stream_with_context, Response

from models.database import db
from extensions import get_openai_client


def get_ai_config() -> Dict[str, str]:
    with db.get_connection() as conn:
        rows = conn.execute("SELECT config_key, config_value FROM ai_config").fetchall()
    return {row['config_key']: row['config_value'] for row in rows}


def check_api_availability(api_key: str, base_url: str, model: str = 'gpt-4o-mini') -> dict:
    import httpx
    import time
    
    if not api_key:
        return {'valid': False, 'error': 'API Key 未配置'}

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
        "User-Agent": "LLM-Checker/1.0"
    }

    payload = {
        "model": model,
        "messages": [{"role": "user", "content": "hi"}],
        "max_tokens": 1,
        "stream": True 
    }

    start_time = time.perf_counter()
    
    try:
        with httpx.Client(timeout=15.0) as client:
            with client.stream("POST", test_url, headers=headers, json=payload) as response:
                if response.status_code != 200:
                    error_msg = response.read().decode('utf-8')
                    return _handle_error(response.status_code, error_msg, str(error_msg), start_time)

                for line in response.iter_lines():
                    if line.startswith("data:"):
                        ttft_latency = round((time.perf_counter() - start_time) * 1000 / 2, 0)
                        return {
                            'valid': True,
                            'latency_ms': ttft_latency,
                            'status': 'operational' if ttft_latency < 5000 else 'degraded',
                            'info': f"响应正常 (首字延迟: {ttft_latency}ms)",
                            'model_tested': model,
                            'http_status': 200
                        }

                return {'valid': False, 'error': '未收到流式数据'}

    except httpx.ConnectError as e:
        return {'valid': False, 'error': '无法连接到服务器，请检查 Base URL 或代理', 'raw_error_text': str(e)}
    except httpx.TimeoutException as e:
        return {'valid': False, 'error': '请求超时，网络状况不佳', 'raw_error_text': str(e)}
    except Exception as e:
        return {'valid': False, 'error': "网络连接失败", 'raw_error_text': str(e)}


def _handle_error(status_code, error_text, raw_error_text, start_time):
    latency = round((time.perf_counter() - start_time) * 1000 / 2, 0)
    msgs = {
        401: "API Key 无效或已过期",
        404: "接口路径错误，请确认 Base URL 是否包含 /v1",
        429: "额度不足或触发频率限制",
        500: "供应商服务器内部错误",
        503: "服务不可用，请确认模型填写是否正确",
        504: "请求超时，网络状况不佳"
    }
    return {
        'valid': False,
        'error': msgs.get(status_code, f"HTTP {status_code}: {error_text[:100]}"),
        'latency_ms': latency,
        'raw_error_text': str(raw_error_text),
        'http_status': status_code
    }


def stream_chat(user_msg: str, session_id: str, history: List[dict], 
                api_key: str, base_url: str, model_name: str):
    
    if not user_msg:
        return {'error': '内容不能为空'}, 400

    if not api_key:
        return {'error': '请先配置 API Key'}, 400

    with db.get_connection() as conn:
        conn.execute("INSERT OR IGNORE INTO sessions (id, title, updated_at) VALUES (?, ?, unixepoch())", (session_id, user_msg[:20]))
        conn.execute("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, 'user', ?, unixepoch())",
                     (str(uuid.uuid4()), session_id, user_msg))

    try:
        client = get_openai_client(api_key, base_url)
    except Exception as e:
        return {'error': f'API 配置错误: {str(e)}'}, 400

    system_prompt = get_ai_config().get('system_prompt', '你是一个 DeskMate 助手。')

    @stream_with_context
    def generate():
        messages = [{"role": "system", "content": system_prompt}]
        for m in history:
            messages.append({"role": m['role'], "content": m['content']})
        messages.append({"role": "user", "content": user_msg})

        try:
            full_reply = ""
            response = client.chat.completions.create(
                model=model_name,
                messages=messages,
                stream=True
            )

            for chunk in response:
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
                    print(f"[Stream Chunk Error] {chunk_err}")
                    continue

            with db.get_connection() as conn:
                conn.execute("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, 'assistant', ?, unixepoch())",
                             (str(uuid.uuid4()), session_id, full_reply))
                conn.execute("UPDATE sessions SET updated_at = unixepoch() WHERE id = ?", (session_id,))

            yield f"data: {json.dumps({'done': True, 'session_id': session_id})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return Response(generate(), mimetype='text/event-stream')
