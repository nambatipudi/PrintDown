import { contextBridge, ipcRenderer, webUtils } from 'electron';

// Expose webUtils API for getting file paths from File objects
contextBridge.exposeInMainWorld('webUtils', {
  getPathForFile: (file: File) => {
    return webUtils.getPathForFile(file);
  }
});

// Expose file picker API to renderer process
contextBridge.exposeInMainWorld('filePicker', {
  pickFile: async () => {
    const result = await ipcRenderer.invoke('open-file-dialog');
    if (result.canceled) {
      return null;
    }
    return result.filePaths; // array of strings
  }
});

// Expose file system API to renderer process
contextBridge.exposeInMainWorld('fileSystem', {
  readFile: async (filePath: string) => {
    return await ipcRenderer.invoke('read-file', filePath);
  }
});

// Expose session management API
contextBridge.exposeInMainWorld('session', {
  save: async (sessionData: any) => {
    return await ipcRenderer.invoke('save-session', sessionData);
  }
});

// Expose export/print APIs
contextBridge.exposeInMainWorld('printExport', {
  exportPDF: async (filePath: string, themeData?: any) => {
    return await ipcRenderer.invoke('export-pdf', filePath, themeData);
  }
});

// Expose menu event listeners
contextBridge.exposeInMainWorld('menuEvents', {
  onMenuOpen: (callback: () => void) => {
    ipcRenderer.removeAllListeners('menu-open');
    ipcRenderer.on('menu-open', callback);
  },
  onMenuExportPDF: (callback: () => void) => {
    ipcRenderer.removeAllListeners('menu-export-pdf');
    ipcRenderer.on('menu-export-pdf', callback);
  },
  onMenuCopyDebugLogs: (callback: () => void) => {
    ipcRenderer.removeAllListeners('menu-copy-debug-logs');
    ipcRenderer.on('menu-copy-debug-logs', callback);
  },
  onRestoreSession: (callback: (event: any, session: any) => void) => {
    ipcRenderer.removeAllListeners('restore-session');
    ipcRenderer.on('restore-session', callback);
  },
  onOpenFileFromSystem: (callback: (event: any, filePath: string) => void) => {
    ipcRenderer.removeAllListeners('open-file-from-system');
    ipcRenderer.on('open-file-from-system', callback);
  },
  onMenuFontIncrease: (callback: () => void) => {
    ipcRenderer.removeAllListeners('menu-font-increase');
    ipcRenderer.on('menu-font-increase', callback);
  },
  onMenuFontDecrease: (callback: () => void) => {
    ipcRenderer.removeAllListeners('menu-font-decrease');
    ipcRenderer.on('menu-font-decrease', callback);
  },
  onMenuFontReset: (callback: () => void) => {
    ipcRenderer.removeAllListeners('menu-font-reset');
    ipcRenderer.on('menu-font-reset', callback);
  },
  onMenuThemeChange: (callback: (event: any, theme: string) => void) => {
    ipcRenderer.removeAllListeners('menu-theme-change');
    ipcRenderer.on('menu-theme-change', callback);
  },
  onMenuToggleTOC: (callback: () => void) => {
    ipcRenderer.removeAllListeners('menu-toggle-toc');
    ipcRenderer.on('menu-toggle-toc', callback);
  },
  onTogglePagePreview: (cb: () => void) => {
    ipcRenderer.removeAllListeners('menu-toggle-page-preview');
    ipcRenderer.on('menu-toggle-page-preview', cb);
  },
  onOpenPageSetup: (cb: () => void) => {
    ipcRenderer.removeAllListeners('menu-open-page-setup');
    ipcRenderer.on('menu-open-page-setup', cb);
  }
});

// Expose clipboard API via IPC
contextBridge.exposeInMainWorld('clipboard', {
  writeText: async (text: string) => {
    return await ipcRenderer.invoke('clipboard-write', text);
  }
});

// Expose theme API
contextBridge.exposeInMainWorld('themeAPI', {
  setCurrentTheme: async (themeName: string) => {
    return await ipcRenderer.invoke('set-current-theme', themeName);
  }
});

// Expose page API for page settings
contextBridge.exposeInMainWorld('pageAPI', {
  getSettings: () => ipcRenderer.invoke('pd:get-page-settings'),
  setSettings: (s: any) => ipcRenderer.invoke('pd:set-page-settings', s)
});

// Expose app version
contextBridge.exposeInMainWorld('appVersion', async () => {
  return await ipcRenderer.invoke('get-app-version');
});

// Expose IPC communication for PDF export handshake
contextBridge.exposeInMainWorld('ipc', {
  on: (channel: string, callback: (...args: any[]) => void) => {
    ipcRenderer.on(channel, (_event, ...args) => callback(...args));
  },
  send: (channel: string, ...args: any[]) => {
    ipcRenderer.send(channel, ...args);
  },
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args)
});

// TEST MODE: Expose limited env flags for renderer diagnostics
contextBridge.exposeInMainWorld('env', {
  PD_TEST_MODE: process.env.PD_TEST_MODE || ''
});

if (process.env.PD_TEST_MODE) {
  console.log('[PRELOAD] Loaded with PD_TEST_MODE=1');
}
