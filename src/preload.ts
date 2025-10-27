import { contextBridge, ipcRenderer } from 'electron';

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
  },
  print: async () => {
    return await ipcRenderer.invoke('print');
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
  onMenuPrint: (callback: () => void) => {
    ipcRenderer.removeAllListeners('menu-print');
    ipcRenderer.on('menu-print', callback);
  },
  onRestoreSession: (callback: (event: any, session: any) => void) => {
    ipcRenderer.removeAllListeners('restore-session');
    ipcRenderer.on('restore-session', callback);
  },
  onOpenFileFromSystem: (callback: (event: any, filePath: string) => void) => {
    ipcRenderer.removeAllListeners('open-file-from-system');
    ipcRenderer.on('open-file-from-system', callback);
  }
});

// Expose IPC communication for PDF export handshake
contextBridge.exposeInMainWorld('ipc', {
  on: (channel: string, callback: (...args: any[]) => void) => {
    ipcRenderer.on(channel, (_event, ...args) => callback(...args));
  },
  send: (channel: string, ...args: any[]) => {
    ipcRenderer.send(channel, ...args);
  }
});
