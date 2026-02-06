import { contextBridge, ipcRenderer } from 'electron';
// ============================================
// IPC Channel Definitions
// ============================================
// File System Channels
var FS_CHANNELS = {
    READ_DIR: 'fs:read-dir',
    SELECT_FOLDER: 'fs:select-folder',
    READ_FILE: 'fs:read-file',
    WRITE_FILE: 'fs:write-file',
    WATCH_FILE: 'fs:watch-file',
};
// Window Control Channels
var WIN_CHANNELS = {
    MINIMIZE: 'window-minimize',
    MAXIMIZE: 'window-maximize',
    CLOSE: 'window-close',
    IS_MAXIMIZED: 'window-is-maximized',
};
// AI Channels
var AI_CHANNELS = {
    CHAT_STREAM: 'ai:chat-stream',
    CHAT_COMPLETE: 'ai:chat-complete',
    SET_MODE: 'ai:set-mode',
    GET_MODE: 'ai:get-mode',
};
// Database Channels
var DB_CHANNELS = {
    QUERY: 'db:query',
    EXECUTE: 'db:execute',
    INSERT: 'db:insert',
    UPDATE: 'db:update',
    DELETE: 'db:delete',
};
// User Profile Channels
var PROFILE_CHANNELS = {
    GET: 'db:user-profile:get',
    SET: 'db:user-profile:set',
    UPDATE: 'db:user-profile:update',
};
// ============================================
// Context Bridge API
// ============================================
contextBridge.exposeInMainWorld('deskmate', {
    // Version info
    version: '1.0.0',
    platform: process.platform,
    // File System API
    fs: {
        readDir: function (dirPath) {
            return ipcRenderer.invoke(FS_CHANNELS.READ_DIR, dirPath);
        },
        selectFolder: function () {
            return ipcRenderer.invoke(FS_CHANNELS.SELECT_FOLDER);
        },
        readFile: function (filePath) {
            return ipcRenderer.invoke(FS_CHANNELS.READ_FILE, filePath);
        },
        writeFile: function (filePath, content) {
            return ipcRenderer.invoke(FS_CHANNELS.WRITE_FILE, { filePath: filePath, content: content });
        },
    },
    // Window Control API
    window: {
        minimize: function () { return ipcRenderer.send(WIN_CHANNELS.MINIMIZE); },
        maximize: function () { return ipcRenderer.send(WIN_CHANNELS.MAXIMIZE); },
        close: function () { return ipcRenderer.send(WIN_CHANNELS.CLOSE); },
        isMaximized: function () {
            return ipcRenderer.invoke(WIN_CHANNELS.IS_MAXIMIZED);
        },
    },
    // AI API
    ai: {
        chat: function (message, history) {
            return ipcRenderer.invoke(AI_CHANNELS.CHAT_COMPLETE, { message: message, history: history });
        },
        setMode: function (mode) {
            return ipcRenderer.invoke(AI_CHANNELS.SET_MODE, mode);
        },
        getMode: function () {
            return ipcRenderer.invoke(AI_CHANNELS.GET_MODE);
        },
        // Stream-based chat (for real-time response)
        chatStream: function (message, history) {
            ipcRenderer.send(AI_CHANNELS.CHAT_STREAM, { message: message, history: history });
            return ipcRenderer.on(AI_CHANNELS.CHAT_STREAM, function (_event, data) { return data; });
        },
    },
    // Database API
    db: {
        query: function (sql, params) {
            return ipcRenderer.invoke(DB_CHANNELS.QUERY, { sql: sql, params: params });
        },
        execute: function (sql, params) {
            return ipcRenderer.invoke(DB_CHANNELS.EXECUTE, { sql: sql, params: params });
        },
    },
    // User Profile API
    profile: {
        get: function () {
            return ipcRenderer.invoke(PROFILE_CHANNELS.GET);
        },
        set: function (profile) {
            return ipcRenderer.invoke(PROFILE_CHANNELS.SET, profile);
        },
        update: function (key, value) {
            return ipcRenderer.invoke(PROFILE_CHANNELS.UPDATE, { key: key, value: value });
        },
    },
    // Utility API
    utils: {
        openExternal: function (url) {
            return ipcRenderer.invoke('utils:open-external', url);
        },
        showItemInFolder: function (path) {
            return ipcRenderer.invoke('utils:show-item-in-folder', path);
        },
    },
    // Event listeners
    on: function (channel, listener) {
        ipcRenderer.on(channel, listener);
    },
    off: function (channel, listener) {
        ipcRenderer.removeListener(channel, listener !== null && listener !== void 0 ? listener : (function () { }));
    },
});
