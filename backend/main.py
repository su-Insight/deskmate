#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""DeskMate Backend Application Entry Point"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from extensions import app, socketio
from routes import api

if __name__ == '__main__':
    print("[DeskMate] Starting backend server...")
    socketio.run(app, host='127.0.0.1', port=5000, debug=True)
