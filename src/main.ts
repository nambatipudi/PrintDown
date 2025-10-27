import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import Store from 'electron-store';

interface SessionData {
  openFiles: string[];
  activeIndex: number;
}

const store = new Store<{ session: SessionData }>();

let mainWindow: BrowserWindow | null = null;
let pendingFileToOpen: string | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, '../icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Create menu
  const menu = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        {
          label: 'Open...',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow?.webContents.send('menu-open')
        },
        { type: 'separator' },
        {
          label: 'Print',
          accelerator: 'CmdOrCtrl+P',
          click: () => mainWindow?.webContents.send('menu-print')
        },
        {
          label: 'Export to PDF...',
          accelerator: 'CmdOrCtrl+E',
          click: () => mainWindow?.webContents.send('menu-export-pdf')
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => app.quit()
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About PrintDown',
          click: () => {
            dialog.showMessageBox(mainWindow!, {
              type: 'info',
              title: 'About PrintDown',
              message: 'PrintDown',
              detail: `Version: ${app.getVersion()}\n\nA beautiful Markdown viewer and PDF exporter with:\n• Live preview with themes\n• Math equations (MathJax)\n• Mermaid diagrams\n• UML sequence diagrams\n• Adjustable font size\n• Export to PDF with proper margins\n\nCreated by: Nambatipudi\nGitHub: https://github.com/nambatipudi`,
              buttons: ['OK']
            });
          }
        },
        { type: 'separator' },
        {
          label: 'View on GitHub',
          click: () => {
            require('electron').shell.openExternal('https://github.com/nambatipudi');
          }
        }
      ]
    }
  ]);
  Menu.setApplicationMenu(menu);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Restore session
  const session = store.get('session');
  if (session?.openFiles?.length > 0) {
    mainWindow.webContents.on('did-finish-load', () => {
      mainWindow?.webContents.send('restore-session', session);
    });
  }
}

// Handle file opening from command line or double-click
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('open-file-from-system', filePath);
  } else {
    pendingFileToOpen = filePath;
  }
});

// Handle command line arguments (Windows)
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, focus our window and handle the file
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      
      // Check for file path in command line arguments
      const filePath = commandLine.find(arg => arg.endsWith('.md') || arg.endsWith('.markdown'));
      if (filePath && fs.existsSync(filePath)) {
        mainWindow.webContents.send('open-file-from-system', filePath);
      }
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  
  // Check if app was opened with a file (Windows)
  if (process.platform === 'win32' && process.argv.length >= 2) {
    const filePath = process.argv.find(arg => arg.endsWith('.md') || arg.endsWith('.markdown'));
    if (filePath && fs.existsSync(filePath)) {
      pendingFileToOpen = filePath;
    }
  }
  
  // Send pending file to renderer after a short delay to ensure it's ready
  if (pendingFileToOpen && mainWindow) {
    setTimeout(() => {
      mainWindow?.webContents.send('open-file-from-system', pendingFileToOpen);
      pendingFileToOpen = null;
    }, 1000);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC Handlers
ipcMain.handle('open-file-dialog', async () => {
  try {
    // Use process.nextTick to ensure dialog opens cleanly
    await new Promise(resolve => process.nextTick(resolve));
    
    const result = await dialog.showOpenDialog({
      title: 'Open Markdown File',
      properties: ['openFile'],
      filters: [
        { name: 'Markdown', extensions: ['md', 'markdown'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    
    console.log('Dialog result:', result);
    return result;
  } catch (error) {
    console.error('Dialog error:', error);
    return { canceled: true, filePaths: [] };
  }
});

ipcMain.handle('read-file', async (event, filePath: string) => {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return { success: true, content };
  } catch (error) {
    console.error('Error reading file:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
});

ipcMain.handle('save-session', (_event, session: SessionData) => {
  store.set('session', session);
});

ipcMain.handle('export-pdf', async (_event, filePath: string, themeData?: any) => {
  if (!mainWindow) return null;
  
  // Show save dialog first
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: filePath.replace(/\.(md|markdown)$/, '.pdf'),
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  try {
    const savePath = result.filePath;
    
    // Small delay to ensure dialog closes and content is stable
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Inject theme styles for PDF if theme data is provided
    if (themeData) {
      const themeCSS = `
        @media print {
          #markdown-content {
            background: ${themeData.content} !important;
            color: ${themeData.text} !important;
          }
          #markdown-content h1, #markdown-content h2, #markdown-content h3,
          #markdown-content h4, #markdown-content h5, #markdown-content h6 {
            color: ${themeData.heading} !important;
          }
          #markdown-content a {
            color: ${themeData.link} !important;
          }
          #markdown-content code {
            background: ${themeData.codeBg} !important;
            color: ${themeData.codeText} !important;
          }
          #markdown-content pre {
            background: ${themeData.codeBg} !important;
          }
          #markdown-content blockquote {
            background: ${themeData.quoteBg} !important;
            border-color: ${themeData.quoteBorder} !important;
            color: ${themeData.quoteText} !important;
          }
        }
      `;
      
      await mainWindow.webContents.executeJavaScript(`
        (function() {
          const existingStyle = document.getElementById('pdf-theme-override');
          if (existingStyle) existingStyle.remove();
          
          const style = document.createElement('style');
          style.id = 'pdf-theme-override';
          style.textContent = ${JSON.stringify(themeCSS)};
          document.head.appendChild(style);
        })();
      `);
    }
    
    // Give Chromium one more frame to apply @media print + layout
    await mainWindow.webContents.executeJavaScript(
      'new Promise(requestAnimationFrame)'
    );
    
    // Generate PDF from the current page
    // Use CSS @page rules for size and margins
    const pdfData = await mainWindow.webContents.printToPDF({
      printBackground: true,         // Keep dark boxes / code blocks etc.
      preferCSSPageSize: true,       // Trust @page for size + margins
      landscape: false
      // Don't pass pageSize or margins here; CSS @page wins
    });

    // Clean up the injected theme style
    if (themeData) {
      await mainWindow.webContents.executeJavaScript(`
        (function() {
          const style = document.getElementById('pdf-theme-override');
          if (style) style.remove();
        })();
      `);
    }

    // Write PDF to file
    fs.writeFileSync(savePath, pdfData as any);
    
    return savePath;
  } catch (error) {
    console.error('Failed to generate PDF:', error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('Error details:', errorMsg);
    dialog.showErrorBox('PDF Export Failed', `Failed to save PDF file: ${errorMsg}`);
    return null;
  }
});

ipcMain.handle('print', async () => {
  if (mainWindow) {
    mainWindow.webContents.print({}, (success, errorType) => {
      if (!success) console.error('Print failed:', errorType);
    });
  }
});
