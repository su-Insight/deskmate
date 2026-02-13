#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Flask Extensions Initialization"""

import httpx
from flask import Flask
from flask_cors import CORS
from flask_socketio import SocketIO
from openai import OpenAI

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})
socketio = SocketIO(app, cors_allowed_origins="*")

shared_http_client = httpx.Client(
    limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
    timeout=httpx.Timeout(60.0)
)


def get_openai_client(api_key: str, base_url: str) -> OpenAI:
    url = base_url.rstrip('/') + '/v1' if base_url and not base_url.rstrip('/').endswith('/v1') else base_url
    return OpenAI(api_key=api_key, base_url=url, http_client=shared_http_client)
