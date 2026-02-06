// ============================================
// Settings Component - Provider Hub & Model Config
// ============================================

import React, { useState, useEffect } from 'react';
import { AI_PROVIDERS, DEFAULT_PROVIDERS } from '../../services/providers';
import { useAIConfig } from '../../hooks';
import { formatRelativeTime } from '../../utils';
import type { ModelConfig, AIProvider } from '../../types';
import './Settings.css';

interface SettingsProps {
  onClose?: () => void;
}

interface ProviderCardProps {
  provider: AIProvider;
  isSelected: boolean;
  onSelect: () => void;
}

const ProviderCard: React.FC<ProviderCardProps> = ({ provider, isSelected, onSelect }) => (
  <div className={`provider-card ${isSelected ? 'selected' : ''}`} onClick={onSelect}>
    <div className="provider-icon">
      <i className={`fas ${provider.icon}`}></i>
    </div>
    <div className="provider-info">
      <span className="provider-name">{provider.name}</span>
      <span className="provider-models">{provider.models.length} 个模型</span>
    </div>
    {isSelected && <div className="selected-badge"><i className="fas fa-check"></i></div>}
  </div>
);

interface ModelCardProps {
  model: ModelConfig;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const ModelCard: React.FC<ModelCardProps> = ({ model, isSelected, onSelect, onEdit, onDelete }) => (
  <div className={`model-card ${isSelected ? 'selected' : ''} ${!model.enabled ? 'disabled' : ''}`} onClick={() => model.enabled && onSelect()}>
    <div className="model-header">
      <div className="model-icon">
        <i className="fas fa-microchip"></i>
      </div>
      <div className="model-status">
        {model.enabled ? (
          <span className="status-active"><i className="fas fa-circle"></i> 活跃</span>
        ) : (
          <span className="status-inactive"><i className="fas fa-circle"></i> 停用</span>
        )}
      </div>
    </div>
    <div className="model-body">
      <h4 className="model-name">{model.name || '未命名配置'}</h4>
      <p className="model-provider">{DEFAULT_PROVIDERS[model.provider]?.name || model.provider}</p>
      <p className="model-model">{model.model}</p>
    </div>
    <div className="model-footer">
      <span className="model-time">{formatRelativeTime(model.createdAt)}</span>
      <div className="model-actions">
        <button className="action-btn edit" onClick={(e) => { e.stopPropagation(); onEdit(); }}>
          <i className="fas fa-edit"></i>
        </button>
        <button className="action-btn delete" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
          <i className="fas fa-trash"></i>
        </button>
      </div>
    </div>
  </div>
);

export const Settings: React.FC<SettingsProps> = ({ onClose }) => {
  const { config, isLoading, isSaving, error, loadConfig, saveConfig, updateConfig, resetConfig } = useAIConfig();
  const [selectedProvider, setSelectedProvider] = useState(config.provider);
  const [modelConfigs, setModelConfigs] = useState<ModelConfig[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingModel, setEditingModel] = useState<ModelConfig | null>(null);
  const [activeTab, setActiveTab] = useState<'providers' | 'models' | 'parameters'>('providers');

  // Load model configs from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('deskmate_modelConfigs');
    if (saved) {
      try {
        setModelConfigs(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse model configs:', e);
      }
    }
  }, []);

  // Save model configs to localStorage
  const saveModelConfigs = (configs: ModelConfig[]) => {
    setModelConfigs(configs);
    localStorage.setItem('deskmate_modelConfigs', JSON.stringify(configs));
  };

  // Provider selection
  const handleProviderSelect = async (providerId: string) => {
    setSelectedProvider(providerId);
    const provider = AI_PROVIDERS.find((p) => p.id === providerId);
    if (provider) {
      await saveConfig({
        provider: providerId,
        baseUrl: provider.baseUrl,
        model: provider.models[0] || '',
      });
    }
  };

  // Model config CRUD
  const handleAddModel = async (modelData: Partial<ModelConfig>) => {
    const newModel: ModelConfig = {
      id: `model-${Date.now()}`,
      name: modelData.name || '新配置',
      provider: modelData.provider || selectedProvider,
      apiKey: modelData.apiKey || '',
      baseUrl: modelData.baseUrl || AI_PROVIDERS.find((p) => p.id === modelData.provider)?.baseUrl || '',
      model: modelData.model || AI_PROVIDERS.find((p) => p.id === modelData.provider)?.models[0] || '',
      temperature: modelData.temperature ?? 0.7,
      maxTokens: modelData.maxTokens ?? 4096,
      topP: modelData.topP ?? 0.9,
      enabled: true,
      createdAt: Date.now(),
    };
    saveModelConfigs([...modelConfigs, newModel]);
    setShowAddModal(false);
  };

  const handleUpdateModel = async (id: string, updates: Partial<ModelConfig>) => {
    saveModelConfigs(modelConfigs.map((m) => (m.id === id ? { ...m, ...updates } : m)));
    setEditingModel(null);
  };

  const handleDeleteModel = (id: string) => {
    if (confirm('确定要删除此配置吗？')) {
      saveModelConfigs(modelConfigs.filter((m) => m.id !== id));
      if (selectedModelId === id) setSelectedModelId(null);
    }
  };

  const handleSaveParameters = async (params: { temperature: number; maxTokens: number; topP: number }) => {
    await saveConfig(params);
  };

  return (
    <div className="settings-container">
      <div className="settings-header">
        <h2><i className="fas fa-cog"></i> 系统设置</h2>
        {onClose && (
          <button className="close-btn" onClick={onClose}>
            <i className="fas fa-times"></i>
          </button>
        )}
      </div>

      <div className="settings-tabs">
        <button className={`tab ${activeTab === 'providers' ? 'active' : ''}`} onClick={() => setActiveTab('providers')}>
          <i className="fas fa-cloud"></i> 模型供应商
        </button>
        <button className={`tab ${activeTab === 'models' ? 'active' : ''}`} onClick={() => setActiveTab('models')}>
          <i className="fas fa-microchip"></i> 模型配置
        </button>
        <button className={`tab ${activeTab === 'parameters' ? 'active' : ''}`} onClick={() => setActiveTab('parameters')}>
          <i className="fas fa-sliders-h"></i> 生成参数
        </button>
      </div>

      {error && <div className="settings-error"><i className="fas fa-exclamation-circle"></i> {error}</div>}

      {activeTab === 'providers' && (
        <div className="settings-content">
          <div className="provider-grid">
            {AI_PROVIDERS.map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                isSelected={selectedProvider === provider.id}
                onSelect={() => handleProviderSelect(provider.id)}
              />
            ))}
          </div>

          <div className="provider-config">
            <h3>当前供应商配置</h3>
            {AI_PROVIDERS.filter((p) => p.id === selectedProvider).map((provider) => (
              <div key={provider.id} className="config-form">
                <div className="form-group">
                  <label>供应商</label>
                  <input type="text" value={provider.name} disabled />
                </div>
                {provider.websiteUrl && (
                  <div className="form-group">
                    <label>官网</label>
                    <input
                      type="text"
                      value={provider.websiteUrl}
                      disabled
                      className="website-display"
                    />
                  </div>
                )}
                <div className="form-group">
                  <label>API Base URL</label>
                  <input
                    type="url"
                    value={config.baseUrl}
                    onChange={(e) => updateConfig('baseUrl', e.target.value)}
                    placeholder={provider.baseUrl}
                  />
                </div>
                <div className="form-group">
                  <label>API Key</label>
                  <div className="api-key-input">
                    <input
                      type="password"
                      value={config.apiKey}
                      onChange={(e) => updateConfig('apiKey', e.target.value)}
                      placeholder="输入 API Key"
                    />
                    {provider.getKeyUrl && (
                      <a
                        href={provider.getKeyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="get-key-btn"
                        title="获取 API Key"
                      >
                        <i className="fas fa-external-link-alt"></i>
                        获取 API Key
                      </a>
                    )}
                  </div>
                </div>
                <div className="form-group">
                  <label>模型</label>
                  <select
                    value={config.model}
                    onChange={(e) => updateConfig('model', e.target.value)}
                  >
                    {provider.models.map((model) => (
                      <option key={model} value={model}>{model}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'models' && (
        <div className="settings-content">
          <div className="models-header">
            <h3>模型配置列表</h3>
            <button className="add-btn" onClick={() => setShowAddModal(true)}>
              <i className="fas fa-plus"></i> 添加配置
            </button>
          </div>
          <div className="models-grid">
            {modelConfigs.length === 0 ? (
              <div className="empty-state">
                <i className="fas fa-robot"></i>
                <p>暂无模型配置</p>
                <button onClick={() => setShowAddModal(true)}>添加第一个配置</button>
              </div>
            ) : (
              modelConfigs.map((model) => (
                <ModelCard
                  key={model.id}
                  model={model}
                  isSelected={selectedModelId === model.id}
                  onSelect={() => setSelectedModelId(model.id)}
                  onEdit={() => setEditingModel(model)}
                  onDelete={() => handleDeleteModel(model.id)}
                />
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'parameters' && (
        <div className="settings-content">
          <h3>生成参数</h3>
          <div className="parameters-form">
            <div className="form-group">
              <label>Temperature: {config.temperature}</label>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={config.temperature}
                onChange={(e) => updateConfig('temperature', parseFloat(e.target.value))}
              />
              <span className="hint">较低的值使输出更确定性，较高的值使输出更有创造性</span>
            </div>
            <div className="form-group">
              <label>Max Tokens: {config.maxTokens}</label>
              <input
                type="range"
                min="100"
                max="16384"
                step="100"
                value={config.maxTokens}
                onChange={(e) => updateConfig('maxTokens', parseInt(e.target.value))}
              />
              <span className="hint">单次回复的最大token数量</span>
            </div>
            <div className="form-group">
              <label>Top P: {config.topP}</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={config.topP}
                onChange={(e) => updateConfig('topP', parseFloat(e.target.value))}
              />
              <span className="hint">控制采样的概率质量</span>
            </div>
          </div>
        </div>
      )}

      {/* Add Model Modal */}
      {showAddModal && (
        <ModelConfigModal
          providers={AI_PROVIDERS}
          onSave={handleAddModel}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {/* Edit Model Modal */}
      {editingModel && (
        <ModelConfigModal
          model={editingModel}
          providers={AI_PROVIDERS}
          onSave={(data) => handleUpdateModel(editingModel.id, data)}
          onClose={() => setEditingModel(null)}
        />
      )}
    </div>
  );
};

// ============================================
// Model Config Modal Component
// ============================================

interface ModelConfigModalProps {
  model?: ModelConfig;
  providers: AIProvider[];
  onSave: (data: Partial<ModelConfig>) => void;
  onClose: () => void;
}

const ModelConfigModal: React.FC<ModelConfigModalProps> = ({ model, providers, onSave, onClose }) => {
  const [formData, setFormData] = useState<Partial<ModelConfig>>({
    name: model?.name || '',
    provider: model?.provider || 'openai',
    apiKey: model?.apiKey || '',
    baseUrl: model?.baseUrl || '',
    model: model?.model || '',
    temperature: model?.temperature ?? 0.7,
    maxTokens: model?.maxTokens ?? 4096,
    topP: model?.topP ?? 0.9,
    enabled: model?.enabled ?? true,
  });

  const selectedProvider = providers.find((p) => p.id === formData.provider);

  // Get website URL from provider, fallback to model's websiteUrl
  const websiteUrl = selectedProvider?.websiteUrl || '';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{model ? '编辑配置' : '添加配置'}</h3>
          <button className="close-btn" onClick={onClose}>
            <i className="fas fa-times"></i>
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>配置名称</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="给我的配置起个名字"
              maxLength={30}
            />
          </div>
          {websiteUrl && (
            <div className="form-group">
              <label>官网</label>
              <input
                type="text"
                value={websiteUrl}
                disabled
                className="website-display"
              />
            </div>
          )}
          <div className="form-group">
            <label>供应商</label>
            <select
              value={formData.provider}
              onChange={(e) => setFormData({ ...formData, provider: e.target.value, baseUrl: '', model: '' })}
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>API Base URL</label>
            <input
              type="url"
              value={formData.baseUrl}
              onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
              placeholder={selectedProvider?.baseUrl || 'https://api.example.com/v1'}
            />
          </div>
          <div className="form-group">
            <label>API Key</label>
            <input
              type="password"
              value={formData.apiKey}
              onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
              placeholder="输入 API Key"
            />
          </div>
          <div className="form-group">
            <label>模型</label>
            <input
              type="text"
              value={formData.model}
              onChange={(e) => setFormData({ ...formData, model: e.target.value })}
              placeholder={selectedProvider?.models[0] || '模型名称'}
              list="model-suggestions"
            />
            <datalist id="model-suggestions">
              {selectedProvider?.models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </datalist>
          </div>
          <div className="modal-actions">
            <button type="button" className="cancel-btn" onClick={onClose}>取消</button>
            <button type="submit" className="save-btn">保存</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Settings;
