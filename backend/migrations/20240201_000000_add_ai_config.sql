-- ============================================
-- Migration: Add AI Configuration Table
-- Applied: 20240201_000000_add_ai_config
-- ============================================

-- 创建 AI 配置表
CREATE TABLE IF NOT EXISTS ai_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    config_key TEXT NOT NULL UNIQUE,
    config_value TEXT NOT NULL,
    config_type TEXT DEFAULT 'string',
    description TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
);

-- 创建设置类别表
CREATE TABLE IF NOT EXISTS ai_config_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    icon TEXT,
    sort_order INTEGER DEFAULT 0
);

-- 插入默认配置类别
INSERT OR IGNORE INTO ai_config_categories (category_name, display_name, icon, sort_order) VALUES
    ('provider', 'Provider Settings', 'fa-cloud', 1),
    ('model', 'Model Settings', 'fa-brain', 2),
    ('parameters', 'Generation Parameters', 'fa-sliders', 3),
    ('security', 'Security Settings', 'fa-shield', 4);

-- 插入默认 AI 配置项
INSERT OR IGNORE INTO ai_config (config_key, config_value, config_type, description) VALUES
    ('provider', 'openai', 'string', 'AI service provider: openai, anthropic, minimax'),
    ('api_key', '', 'secret', 'API key for the AI service'),
    ('base_url', 'https://api.openai.com/v1', 'string', 'API base URL'),
    ('model_name', 'gpt-4o', 'string', 'Model name to use'),
    ('temperature', '0.7', 'number', 'Sampling temperature (0-2)'),
    ('max_tokens', '4096', 'number', 'Maximum tokens in response'),
    ('top_p', '1.0', 'number', 'Top-p sampling parameter'),
    ('system_prompt', 'You are DeskMate, a helpful AI assistant.', 'string', 'System prompt for the AI'),
    ('mode', 'private', 'string', 'AI mode: private (with history) or incognito (no history)'),
    ('stream_enabled', 'false', 'boolean', 'Enable streaming responses');

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_ai_config_key ON ai_config(config_key);
CREATE INDEX IF NOT EXISTS idx_ai_config_category ON ai_config_categories(category_name);
