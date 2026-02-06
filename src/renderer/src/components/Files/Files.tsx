// ============================================
// FileExplorer Component
// ============================================

import React, { useEffect } from 'react';
import { useFileSystem } from '../../hooks';
import { formatFileSize, formatRelativeTime } from '../../utils';
import type { FileInfo } from '../../types';
import './Files.css';

export const FileExplorer: React.FC = () => {
  const { currentPath, files, isLoading, error, loadDirectory, navigateUp, navigateTo, selectFolder } = useFileSystem();

  useEffect(() => {
    // Start with user's home directory or desktop
    const homePath = process.env.HOME || process.env.USERPROFILE || 'C:\\Users\\' + process.env.USERNAME;
    loadDirectory(homePath);
  }, [loadDirectory]);

  const getFileIcon = (file: FileInfo): string => {
    if (file.isDirectory) return 'fa-folder';
    const ext = file.name.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'txt': return 'fa-file-alt';
      case 'md': return 'fa-file-alt';
      case 'js': return 'fa-file-code';
      case 'ts': return 'fa-file-code';
      case 'py': return 'fa-file-code';
      case 'json': return 'fa-file-code';
      case 'html': return 'fa-file-code';
      case 'css': return 'fa-file-code';
      case 'png': return 'fa-file-image';
      case 'jpg': case 'jpeg': return 'fa-file-image';
      case 'gif': return 'fa-file-image';
      case 'pdf': return 'fa-file-pdf';
      case 'zip': case 'rar': case '7z': return 'fa-file-archive';
      case 'mp3': return 'fa-file-audio';
      case 'mp4': case 'avi': case 'mkv': return 'fa-file-video';
      case 'xlsx': case 'xls': return 'fa-file-excel';
      case 'docx': case 'doc': return 'fa-file-word';
      default: return 'fa-file';
    }
  };

  const handleFileClick = (file: FileInfo) => {
    if (file.isDirectory) {
      navigateTo(file.path);
    }
  };

  const handleOpenFolder = async () => {
    await selectFolder();
  };

  return (
    <div className="files-container">
      <div className="files-header">
        <h2><i className="fas fa-folder-open"></i> 文件管理</h2>
        <button className="open-folder-btn" onClick={handleOpenFolder}>
          <i className="fas fa-folder-plus"></i>
          打开文件夹
        </button>
      </div>

      <div className="files-toolbar">
        <button className="toolbar-btn" onClick={() => navigateTo('/')} title="根目录">
          <i className="fas fa-home"></i>
        </button>
        <button className="toolbar-btn" onClick={navigateUp} disabled={currentPath === '/'} title="上级目录">
          <i className="fas fa-arrow-up"></i>
        </button>
        <button className="toolbar-btn" onClick={() => loadDirectory(currentPath)} title="刷新">
          <i className="fas fa-sync-alt"></i>
        </button>
        <div className="current-path">
          <i className="fas fa-folder"></i>
          <span>{currentPath}</span>
        </div>
      </div>

      {error && <div className="files-error">{error}</div>}

      <div className="files-content">
        {isLoading ? (
          <div className="loading"><i className="fas fa-spinner fa-spin"></i> 加载中...</div>
        ) : files.length === 0 ? (
          <div className="empty-state">
            <i className="fas fa-folder-open"></i>
            <p>此文件夹为空</p>
          </div>
        ) : (
          <div className="files-grid">
            {files.map((file) => (
              <div
                key={file.path}
                className={`file-item ${file.isDirectory ? 'directory' : ''}`}
                onClick={() => handleFileClick(file)}
              >
                <div className="file-icon">
                  <i className={`fas ${getFileIcon(file)}`}></i>
                </div>
                <div className="file-info">
                  <span className="file-name" title={file.name}>{file.name}</span>
                  <span className="file-meta">
                    {file.isDirectory ? '文件夹' : formatFileSize(file.size || 0)}
                    {!file.isDirectory && ` • ${formatRelativeTime(file.modifiedAt || 0)}`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default FileExplorer;
