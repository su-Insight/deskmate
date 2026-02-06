var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
// ============================================
// Global State
// ============================================
var mainWindow = null;
var backendProcess = null;
var aiMode = 'private';
var isDev = process.argv.includes('--dev');
// ============================================
// Window Management
// ============================================
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1000,
        minHeight: 600,
        titleBarStyle: 'hiddenInset',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, '../preload/index.js'),
            sandbox: false,
        },
        icon: path.join(__dirname, '../../build/icon.png'),
        show: false,
        backgroundColor: '#111827', // Dark mode background
    });
    // Load the app
    if (isDev) {
        mainWindow.loadURL('http://localhost:3000');
        mainWindow.webContents.openDevTools();
    }
    else {
        mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    }
    // Window events
    mainWindow.once('ready-to-show', function () {
        mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.show();
    });
    mainWindow.on('closed', function () {
        mainWindow = null;
    });
    mainWindow.on('maximize', function () {
        mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.webContents.send('window:maximized', true);
    });
    mainWindow.on('unmaximize', function () {
        mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.webContents.send('window:maximized', false);
    });
}
// ============================================
// Backend Service Management
// ============================================
function startBackendService() {
    var _a, _b;
    var backendPath = isDev
        ? path.join(__dirname, '../../backend/app.py')
        : path.join(process.resourcesPath, 'backend', 'app.py');
    // Check if Python file exists
    if (!fs.existsSync(backendPath)) {
        console.warn('Backend not found:', backendPath);
        return;
    }
    backendProcess = spawn('python', [backendPath], {
        detached: false,
        stdio: 'pipe',
        windowsHide: true,
    });
    (_a = backendProcess.stdout) === null || _a === void 0 ? void 0 : _a.on('data', function (data) {
        console.log("[Backend] ".concat(data.toString().trim()));
    });
    (_b = backendProcess.stderr) === null || _b === void 0 ? void 0 : _b.on('data', function (data) {
        console.error("[Backend Error] ".concat(data.toString().trim()));
    });
    backendProcess.on('error', function (error) {
        console.error('Failed to start backend:', error);
    });
    backendProcess.on('exit', function (code) {
        if (code !== 0) {
            console.log("Backend exited with code ".concat(code));
        }
    });
}
function stopBackendService() {
    if (backendProcess) {
        backendProcess.kill();
        backendProcess = null;
    }
}
// ============================================
// IPC Handlers - File System
// ============================================
ipcMain.handle('fs:read-dir', function (_event, dirPath) { return __awaiter(void 0, void 0, void 0, function () {
    var items, error_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                return [4 /*yield*/, fs.promises.readdir(dirPath, { withFileTypes: true })];
            case 1:
                items = _a.sent();
                return [2 /*return*/, items.map(function (item) { return ({
                        name: item.name,
                        isDirectory: item.isDirectory(),
                        path: path.join(dirPath, item.name),
                        size: 0,
                        modifiedAt: Date.now(),
                    }); })];
            case 2:
                error_1 = _a.sent();
                throw error_1;
            case 3: return [2 /*return*/];
        }
    });
}); });
ipcMain.handle('fs:select-folder', function () { return __awaiter(void 0, void 0, void 0, function () {
    var result;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, dialog.showOpenDialog(mainWindow, {
                    properties: ['openDirectory'],
                })];
            case 1:
                result = _a.sent();
                return [2 /*return*/, result.filePaths[0] || null];
        }
    });
}); });
ipcMain.handle('fs:read-file', function (_event, filePath) { return __awaiter(void 0, void 0, void 0, function () {
    var error_2;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                return [4 /*yield*/, fs.promises.readFile(filePath, 'utf-8')];
            case 1: return [2 /*return*/, _a.sent()];
            case 2:
                error_2 = _a.sent();
                throw error_2;
            case 3: return [2 /*return*/];
        }
    });
}); });
ipcMain.handle('fs:write-file', function (_event_1, _a) { return __awaiter(void 0, [_event_1, _a], void 0, function (_event, _b) {
    var error_3;
    var filePath = _b.filePath, content = _b.content;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                _c.trys.push([0, 2, , 3]);
                return [4 /*yield*/, fs.promises.writeFile(filePath, content, 'utf-8')];
            case 1:
                _c.sent();
                return [2 /*return*/, true];
            case 2:
                error_3 = _c.sent();
                throw error_3;
            case 3: return [2 /*return*/];
        }
    });
}); });
// ============================================
// IPC Handlers - Window Control
// ============================================
ipcMain.on('window-minimize', function () {
    mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.minimize();
});
ipcMain.on('window-maximize', function () {
    if (mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.isMaximized()) {
        mainWindow.unmaximize();
    }
    else {
        mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.maximize();
    }
});
ipcMain.on('window-close', function () {
    mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.close();
});
ipcMain.handle('window-is-maximized', function () {
    var _a;
    return (_a = mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.isMaximized()) !== null && _a !== void 0 ? _a : false;
});
// ============================================
// IPC Handlers - AI
// ============================================
ipcMain.handle('ai:set-mode', function (_event, mode) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        aiMode = mode;
        console.log("AI Mode switched to: ".concat(mode));
        return [2 /*return*/, { success: true, mode: mode }];
    });
}); });
ipcMain.handle('ai:get-mode', function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        return [2 /*return*/, aiMode];
    });
}); });
ipcMain.handle('ai:chat-complete', function (_event_1, _a) { return __awaiter(void 0, [_event_1, _a], void 0, function (_event, _b) {
    var responses;
    var message = _b.message, history = _b.history;
    return __generator(this, function (_c) {
        responses = [
            "\u6536\u5230\u4F60\u7684\u6D88\u606F\uFF1A".concat(message),
            '这是一个模拟的 AI 回复。',
            '后续将集成真实的 AI 模型。',
            "\u5F53\u524D\u6A21\u5F0F\uFF1A".concat(aiMode),
        ];
        return [2 /*return*/, {
                success: true,
                response: responses[message.length % responses.length],
                mode: aiMode,
            }];
    });
}); });
ipcMain.handle('ai:chat-stream', function (_event_1, _a) { return __awaiter(void 0, [_event_1, _a], void 0, function (_event, _b) {
    var message = _b.message;
    return __generator(this, function (_c) {
        // TODO: Implement streaming with backend
        return [2 /*return*/, { success: false, error: 'Not implemented yet' }];
    });
}); });
// ============================================
// IPC Handlers - Database
// ============================================
ipcMain.handle('db:query', function (_event_1, _a) { return __awaiter(void 0, [_event_1, _a], void 0, function (_event, _b) {
    var sql = _b.sql, params = _b.params;
    return __generator(this, function (_c) {
        // TODO: Implement with Better-SQLite3
        console.log('DB Query:', sql, params);
        return [2 /*return*/, []];
    });
}); });
ipcMain.handle('db:execute', function (_event_1, _a) { return __awaiter(void 0, [_event_1, _a], void 0, function (_event, _b) {
    var sql = _b.sql, params = _b.params;
    return __generator(this, function (_c) {
        // TODO: Implement with Better-SQLite3
        console.log('DB Execute:', sql, params);
        return [2 /*return*/, { success: true }];
    });
}); });
// ============================================
// IPC Handlers - User Profile
// ============================================
ipcMain.handle('db:user-profile:get', function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        // TODO: Load from config JSON
        return [2 /*return*/, {
                identity: {
                    name: 'User',
                    role: 'Software Engineer',
                    years_experience: 0,
                },
                preferences: {
                    language: 'zh-CN',
                    code_style: 'TypeScript',
                    response_conciseness: 'medium',
                },
                privacy_settings: {
                    allow_local_indexing: true,
                    cloud_sync_enabled: false,
                },
            }];
    });
}); });
ipcMain.handle('db:user-profile:set', function (_event, profile) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        // TODO: Save to config JSON
        console.log('Profile set:', profile);
        return [2 /*return*/, true];
    });
}); });
ipcMain.handle('db:user-profile:update', function (_event_1, _a) { return __awaiter(void 0, [_event_1, _a], void 0, function (_event, _b) {
    var key = _b.key, value = _b.value;
    return __generator(this, function (_c) {
        // TODO: Update config
        console.log('Profile update:', key, value);
        return [2 /*return*/, true];
    });
}); });
// ============================================
// IPC Handlers - Utilities
// ============================================
ipcMain.handle('utils:open-external', function (_event, url) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        return [2 /*return*/, shell.openExternal(url)];
    });
}); });
ipcMain.handle('utils:show-item-in-folder', function (_event, path) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        return [2 /*return*/, shell.showItemInFolder(path)];
    });
}); });
// ============================================
// App Lifecycle
// ============================================
app.whenReady().then(function () {
    createWindow();
    startBackendService();
    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});
app.on('window-all-closed', function () {
    stopBackendService();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
app.on('before-quit', function () {
    stopBackendService();
});
// ============================================
// Security Headers
// ============================================
app.on('web-contents-created', function (_event, contents) {
    contents.on('will-navigate', function (event) {
        // Prevent navigation to external URLs
        event.preventDefault();
    });
    contents.setWindowOpenHandler(function (_a) {
        var url = _a.url;
        // Only allow opening external URLs in default browser
        shell.openExternal(url);
        return { action: 'deny' };
    });
});
console.log('DeskMate Main Process Started');
