const electron = require('electron');
console.log('Test electron in main process');
console.log('app:', typeof electron.app);
console.log('ipcMain:', typeof electron.ipcMain);
