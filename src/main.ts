import { app, BrowserWindow, ipcMain, dialog, Menu, clipboard, protocol } from 'electron';
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
  
  // Toggle to enable/disable verbose protocol logging
  const PROTOCOL_DEBUG = false;

// Register custom protocol to serve local files for images
console.log('[PROTOCOL] Registering printdown scheme...');
try {
  const schemeResult = protocol.registerSchemesAsPrivileged([
    {
      scheme: 'printdown',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true
      }
    }
  ]);
  console.log('[PROTOCOL] Scheme registration result:', schemeResult);
} catch (error) {
  console.error('[PROTOCOL] Scheme registration failed:', error);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, '../icon.png'),
    backgroundColor: '#1e1e1e', // Set explicit background color to prevent white showing through
    titleBarStyle: 'default', // Ensure consistent title bar
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
      label: 'View',
      submenu: [
        {
          label: 'Font Size',
          submenu: [
            {
              label: 'Increase Font Size',
              accelerator: 'CmdOrCtrl+=',
              click: () => mainWindow?.webContents.send('menu-font-increase')
            },
            {
              label: 'Decrease Font Size',
              accelerator: 'CmdOrCtrl+-',
              click: () => mainWindow?.webContents.send('menu-font-decrease')
            },
            {
              label: 'Reset Font Size',
              accelerator: 'CmdOrCtrl+0',
              click: () => mainWindow?.webContents.send('menu-font-reset')
            }
          ]
        },
        {
          label: 'Theme',
          submenu: [
            {
              label: 'Dark',
              type: 'radio',
              click: () => mainWindow?.webContents.send('menu-theme-change', 'dark')
            },
            {
              label: 'Light',
              type: 'radio',
              click: () => mainWindow?.webContents.send('menu-theme-change', 'light')
            },
            {
              label: 'Sepia',
              type: 'radio',
              click: () => mainWindow?.webContents.send('menu-theme-change', 'sepia')
            },
            {
              label: 'Nord',
              type: 'radio',
              click: () => mainWindow?.webContents.send('menu-theme-change', 'nord')
            },
            {
              label: 'Dracula',
              type: 'radio',
              click: () => mainWindow?.webContents.send('menu-theme-change', 'dracula')
            },
            {
              label: 'Solarized Light',
              type: 'radio',
              click: () => mainWindow?.webContents.send('menu-theme-change', 'solarized-light')
            },
            {
              label: 'GitHub',
              type: 'radio',
              click: () => mainWindow?.webContents.send('menu-theme-change', 'github')
            },
            {
              label: 'Monokai',
              type: 'radio',
              click: () => mainWindow?.webContents.send('menu-theme-change', 'monokai')
            },
            {
              label: 'Literary',
              type: 'radio',
              click: () => mainWindow?.webContents.send('menu-theme-change', 'literary')
            },
            {
              label: 'Terminal',
              type: 'radio',
              click: () => mainWindow?.webContents.send('menu-theme-change', 'terminal')
            },
            {
              label: 'Oceanic',
              type: 'radio',
              click: () => mainWindow?.webContents.send('menu-theme-change', 'oceanic')
            },
            {
              label: 'Newspaper',
              type: 'radio',
              click: () => mainWindow?.webContents.send('menu-theme-change', 'newspaper')
            },
            {
              label: 'Cyberpunk',
              type: 'radio',
              click: () => mainWindow?.webContents.send('menu-theme-change', 'cyberpunk')
            },
            {
              label: 'Forest',
              type: 'radio',
              click: () => mainWindow?.webContents.send('menu-theme-change', 'forest')
            },
            {
              label: 'Minimal',
              type: 'radio',
              click: () => mainWindow?.webContents.send('menu-theme-change', 'minimal')
            },
            {
              label: 'Academic',
              type: 'radio',
              click: () => mainWindow?.webContents.send('menu-theme-change', 'academic')
            }
          ]
        },
        { type: 'separator' },
        {
          label: 'Toggle Table of Contents',
          accelerator: 'CmdOrCtrl+\\',
          click: () => mainWindow?.webContents.send('menu-toggle-toc')
        },
        { type: 'separator' },
        {
          label: 'Toggle Developer Tools',
          accelerator: 'F12',
          click: () => mainWindow?.webContents.toggleDevTools()
        },
        { type: 'separator' },
        {
          label: 'Copy Debug Logs',
          click: () => mainWindow?.webContents.send('menu-copy-debug-logs')
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
  // Log app version on startup
  console.log(`[APP] PrintDown starting, version: ${app.getVersion()}`);
  
  // Set up custom protocol handler for local file access
  const protocolSuccess = protocol.registerFileProtocol('printdown', (request, callback) => {
    // Remove the protocol part (printdown://)
    let url = request.url.replace(/^printdown:\/\//, '');
    
    if (PROTOCOL_DEBUG) console.log(`[PROTOCOL] ===== PROTOCOL REQUEST RECEIVED =====`);
    if (PROTOCOL_DEBUG) console.log(`[PROTOCOL] Request received: ${request.url}`);
    if (PROTOCOL_DEBUG) console.log(`[PROTOCOL] Parsed URL after protocol removal: ${url}`);
    if (PROTOCOL_DEBUG) console.log(`[PROTOCOL] Request headers:`, request.headers);
    
    try {
      // Handle URL-encoded paths
      url = decodeURIComponent(url);
      if (PROTOCOL_DEBUG) console.log(`[PROTOCOL] URL decoded: ${url}`);
      
      // On Windows, normalize common malformed drive-letter patterns from URL parsing
      if (process.platform === 'win32') {
        // Case 1: starts with /C:/... (triple-slash URL form) → drop the leading slash
        if (/^\/[A-Za-z]:\//.test(url)) {
          url = url.slice(1);
          if (PROTOCOL_DEBUG) console.log(`[PROTOCOL] Stripped leading slash for drive path: ${url}`);
        }
        // Case 2: starts with c/Users/... (host interpreted as drive without colon) → insert colon
        else if (/^[A-Za-z]\//.test(url)) {
          const drive = url.charAt(0).toUpperCase();
          const rest = url.slice(2); // skip 'c/'
          url = `${drive}:/${rest}`;
          if (PROTOCOL_DEBUG) console.log(`[PROTOCOL] Reconstructed drive path: ${url}`);
        }
      }
      
      // On Windows, handle drive letter paths and case sensitivity
      let normalizedPath: string;
      if (process.platform === 'win32') {
        // If it starts with a drive letter (C:, D:, etc.), normalize case and slashes
        if (url.match(/^[A-Za-z]:/)) {
          // Convert to uppercase drive letter for Windows
          const driveLetter = url.charAt(0).toUpperCase();
          const restOfPath = url.slice(1);
          const correctedUrl = driveLetter + restOfPath;
          if (PROTOCOL_DEBUG) console.log(`[PROTOCOL] Corrected drive letter: ${correctedUrl}`);
          
          // Windows path - normalize slashes
          normalizedPath = path.normalize(correctedUrl.replace(/\//g, path.sep));
        } else {
          // No drive letter - might be relative, resolve from current working directory
          normalizedPath = path.resolve(url);
        }
      } else {
        // Unix-like systems
        normalizedPath = path.resolve(url);
      }
      
      if (PROTOCOL_DEBUG) console.log(`[PROTOCOL] Normalized path: ${normalizedPath}`);
      if (PROTOCOL_DEBUG) console.log(`[PROTOCOL] File exists: ${fs.existsSync(normalizedPath)}`);
      
      // If file doesn't exist, try alternative path formats
      if (!fs.existsSync(normalizedPath)) {
        if (PROTOCOL_DEBUG) console.log(`[PROTOCOL] File not found, trying alternative paths...`);
        
        // Try with different case combinations
        const alternatives = [
          normalizedPath,
          normalizedPath.replace(/^C:/, 'c:'),
          normalizedPath.replace(/^C:/, 'C:'),
          path.resolve(process.cwd(), url),
          path.resolve(process.cwd(), url.replace(/^[A-Za-z]:/, ''))
        ];
        
        for (const altPath of alternatives) {
          if (PROTOCOL_DEBUG) console.log(`[PROTOCOL] Trying alternative: ${altPath}`);
          if (fs.existsSync(altPath)) {
            if (PROTOCOL_DEBUG) console.log(`[PROTOCOL] ✓ Found file at alternative path: ${altPath}`);
            const stats = fs.statSync(altPath);
            if (PROTOCOL_DEBUG) console.log(`[PROTOCOL] ✓ File exists (${stats.size} bytes), serving: ${altPath}`);
            callback({ path: altPath });
            return;
          }
        }
      } else {
        const stats = fs.statSync(normalizedPath);
        if (PROTOCOL_DEBUG) console.log(`[PROTOCOL] ✓ File exists (${stats.size} bytes), serving: ${normalizedPath}`);
        callback({ path: normalizedPath });
        return;
      }
      
      // If we get here, no file was found
      console.error(`[PROTOCOL] ✗ File not found: ${normalizedPath}`);
      // Log directory contents for debugging
      const dirPath = path.dirname(normalizedPath);
      if (fs.existsSync(dirPath)) {
        const dirContents = fs.readdirSync(dirPath);
        console.error(`[PROTOCOL] Directory exists. Contents (${dirContents.length} items):`, dirContents.slice(0, 20).join(', '));
        
        // Try to find similar files
        const similarFiles = dirContents.filter(file => 
          file.toLowerCase().includes('forces') || 
          file.toLowerCase().includes('box') ||
          file.toLowerCase().includes('.png')
        );
        if (similarFiles.length > 0) {
          console.error(`[PROTOCOL] Similar files found:`, similarFiles);
        }
      } else {
        console.error(`[PROTOCOL] Directory does not exist: ${dirPath}`);
      }
      callback({ error: -6 }); // FILE_NOT_FOUND
    } catch (error) {
      console.error('[PROTOCOL] Error processing request:', error);
      callback({ error: -6 }); // FILE_NOT_FOUND
    }
  });
  
  if (PROTOCOL_DEBUG) console.log(`[PROTOCOL] Protocol registration ${protocolSuccess ? 'succeeded' : 'failed'}`);
  
  if (!protocolSuccess) {
    console.error('[PROTOCOL] CRITICAL: Protocol registration failed! Images will not load.');
  } else {
    if (PROTOCOL_DEBUG) console.log('[PROTOCOL] Protocol handler is ready and waiting for requests...');
    
    // Test if the expected image file exists
    const testImagePath = path.join(process.cwd(), 'Test_Files', 'Science', 'Module 4', 'forces_box.png');
    if (PROTOCOL_DEBUG) console.log(`[PROTOCOL] Testing if image exists at: ${testImagePath}`);
    if (PROTOCOL_DEBUG) console.log(`[PROTOCOL] Image exists: ${fs.existsSync(testImagePath)}`);
    if (fs.existsSync(testImagePath)) {
      const stats = fs.statSync(testImagePath);
      if (PROTOCOL_DEBUG) console.log(`[PROTOCOL] Image file size: ${stats.size} bytes`);
    }
    
    // Test if protocol is actually registered
    try {
      const isProtocolRegistered = protocol.isProtocolRegistered('printdown');
      if (PROTOCOL_DEBUG) console.log(`[PROTOCOL] Protocol 'printdown' is registered: ${isProtocolRegistered}`);
    } catch (error) {
      console.error('[PROTOCOL] Error checking protocol registration:', error);
    }
  }
  
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

ipcMain.handle('clipboard-write', async (_event, text: string) => {
  try {
    clipboard.writeText(text);
    return { success: true };
  } catch (error) {
    console.error('Clipboard write failed:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

ipcMain.handle('get-app-version', async () => {
  return app.getVersion();
});
