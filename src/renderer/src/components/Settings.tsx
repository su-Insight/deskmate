import React, { useState, useEffect } from 'react';

function getServerUrl(path: string): string {
  if (typeof window !== 'undefined' && (window as any).deskmate) {
    return `http://127.0.0.1:5000${path}`;
  }
  return path;
}

export const SettingsView: React.FC = () => {
  const [config, setConfig] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showToast, setShowToast] = useState<{msg: string, type: string} | null>(null);

  const fetchConfig = async () => {
    try {
      const res = await fetch(getServerUrl('/api/config'));
      const data = await res.json();
      if (data.success) {
        setConfig(data.config);
      }
    } catch (err) {
      console.error('获取配置失败:', err);
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      const res = await fetch(getServerUrl('/api/config'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      const data = await res.json();
      if (data.success) {
        setShowToast({ msg: '配置已保存', type: 'success' });
      }
    } catch (err) {
      setShowToast({ msg: '保存失败', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const checkApi = async () => {
    try {
      const res = await fetch(getServerUrl('/api/check'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: config.api_key,
          base_url: config.base_url,
          model: config.model_name
        })
      });
      const data = await res.json();
      if (data.valid) {
        setShowToast({ msg: `API 可用，延迟: ${data.latency_ms}ms`, type: 'success' });
      } else {
        setShowToast({ msg: data.error || 'API 不可用', type: 'error' });
      }
    } catch (err) {
      setShowToast({ msg: '检查失败', type: 'error' });
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  useEffect(() => {
    if (showToast) {
      const timer = setTimeout(() => setShowToast(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [showToast]);

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <i className="fa-solid fa-circle-notch fa-spin"></i>
      </div>
    );
  }

  return (
    <div>
      <header className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Configure your AI assistant</p>
        </div>
      </header>

      <div className="card" style={{ maxWidth: '600px' }}>
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '8px' }}>
            API Key
          </label>
          <input
            type="password"
            value={config.api_key || ''}
            onChange={(e) => setConfig({ ...config, api_key: e.target.value })}
            placeholder="sk-..."
            style={{
              width: '100%',
              padding: '12px 16px',
              border: '1px solid rgba(0, 0, 0, 0.1)',
              borderRadius: '10px',
              fontSize: '14px',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '8px' }}>
            Base URL
          </label>
          <input
            type="text"
            value={config.base_url || ''}
            onChange={(e) => setConfig({ ...config, base_url: e.target.value })}
            placeholder="https://api.openai.com/v1"
            style={{
              width: '100%',
              padding: '12px 16px',
              border: '1px solid rgba(0, 0, 0, 0.1)',
              borderRadius: '10px',
              fontSize: '14px',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '8px' }}>
            Model Name
          </label>
          <input
            type="text"
            value={config.model_name || ''}
            onChange={(e) => setConfig({ ...config, model_name: e.target.value })}
            placeholder="gpt-4o"
            style={{
              width: '100%',
              padding: '12px 16px',
              border: '1px solid rgba(0, 0, 0, 0.1)',
              borderRadius: '10px',
              fontSize: '14px',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '8px' }}>
            System Prompt
          </label>
          <textarea
            value={config.system_prompt || ''}
            onChange={(e) => setConfig({ ...config, system_prompt: e.target.value })}
            placeholder="You are a helpful assistant."
            rows={4}
            style={{
              width: '100%',
              padding: '12px 16px',
              border: '1px solid rgba(0, 0, 0, 0.1)',
              borderRadius: '10px',
              fontSize: '14px',
              outline: 'none',
              resize: 'vertical',
              boxSizing: 'border-box'
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={checkApi}
            style={{
              flex: 1,
              padding: '12px',
              background: 'rgba(16, 185, 129, 0.1)',
              color: '#10B981',
              border: 'none',
              borderRadius: '10px',
              cursor: 'pointer',
              fontWeight: 500
            }}
          >
            <i className="fa-solid fa-check-circle" style={{ marginRight: '8px' }}></i>
            Test API
          </button>
          <button
            onClick={saveConfig}
            disabled={saving}
            style={{
              flex: 1,
              padding: '12px',
              background: 'linear-gradient(135deg, #9D50BB, #6E48AA)',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontWeight: 500,
              opacity: saving ? 0.7 : 1
            }}
          >
            {saving ? (
              <><i className="fa-solid fa-circle-notch fa-spin" style={{ marginRight: '8px' }}></i>Saving...</>
            ) : (
              <><i className="fa-solid fa-save" style={{ marginRight: '8px' }}></i>Save</>
            )}
          </button>
        </div>
      </div>

      {showToast && (
        <div
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            padding: '14px 28px',
            background: showToast.type === 'error' ? 'rgba(239, 68, 68, 0.95)' : 'rgba(16, 185, 129, 0.95)',
            color: 'white',
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: 500,
            zIndex: 10000,
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.25)'
          }}
        >
          {showToast.msg}
        </div>
      )}
    </div>
  );
};
