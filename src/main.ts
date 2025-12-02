import { app, BrowserWindow, ipcMain, dialog, Menu, clipboard, protocol, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import Store from 'electron-store';

interface SessionData {
  openFiles: string[];
  activeIndex: number;
  theme?: string;
  fontSizeFactor?: number;
}

const store = new Store<{ session: SessionData }>();

let mainWindow: BrowserWindow | null = null;
let pendingFileToOpen: string | null = null;
let currentTheme: string = 'dark'; // Track current theme

// File watchers: Map<filePath, FSWatcher>
const fileWatchers = new Map<string, fs.FSWatcher>();

// Track file stats to detect actual changes
const fileStats = new Map<string, { mtime: Date; size: number }>();

// Toggle to enable/disable verbose protocol logging
const PROTOCOL_DEBUG = false;

// Register custom protocol to serve local files for images
try {
  protocol.registerSchemesAsPrivileged([
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
} catch (error) {
  console.error('[PROTOCOL] Scheme registration failed:', error);
}

function createWindow() {
  // Set window icon (Windows and Linux only - macOS ignores this option)
  // macOS uses the .icns file from the app bundle automatically
  let iconPath: string | undefined;
  
  if (process.platform !== 'darwin') {
    // Windows and Linux: Set icon path
    iconPath = app.isPackaged
      ? path.join(process.resourcesPath, 'icon.png')
      : path.join(__dirname, '..', 'build', 'icon.png');
  }
  
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'PrintDown',  // Set window title (appears in print dialog)
    ...(iconPath && { icon: iconPath }), // Only set icon for Windows/Linux
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
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow?.webContents.send('menu-save')
        },
        { type: 'separator' },
        {
          label: 'Export to PDF...',
          accelerator: 'CmdOrCtrl+P',
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
              checked: currentTheme === 'dark',
              click: () => mainWindow?.webContents.send('menu-theme-change', 'dark')
            },
            {
              label: 'Light',
              type: 'radio',
              checked: currentTheme === 'light',
              click: () => mainWindow?.webContents.send('menu-theme-change', 'light')
            },
            {
              label: 'Sepia',
              type: 'radio',
              checked: currentTheme === 'sepia',
              click: () => mainWindow?.webContents.send('menu-theme-change', 'sepia')
            },
            {
              label: 'Nord',
              type: 'radio',
              checked: currentTheme === 'nord',
              click: () => mainWindow?.webContents.send('menu-theme-change', 'nord')
            },
            {
              label: 'Dracula',
              type: 'radio',
              checked: currentTheme === 'dracula',
              click: () => mainWindow?.webContents.send('menu-theme-change', 'dracula')
            },
            {
              label: 'Solarized Light',
              type: 'radio',
              checked: currentTheme === 'solarized-light',
              click: () => mainWindow?.webContents.send('menu-theme-change', 'solarized-light')
            },
            {
              label: 'GitHub',
              type: 'radio',
              checked: currentTheme === 'github',
              click: () => mainWindow?.webContents.send('menu-theme-change', 'github')
            },
            {
              label: 'Monokai',
              type: 'radio',
              checked: currentTheme === 'monokai',
              click: () => mainWindow?.webContents.send('menu-theme-change', 'monokai')
            },
            {
              label: 'Literary',
              type: 'radio',
              checked: currentTheme === 'literary',
              click: () => mainWindow?.webContents.send('menu-theme-change', 'literary')
            },
            {
              label: 'Terminal',
              type: 'radio',
              checked: currentTheme === 'terminal',
              click: () => mainWindow?.webContents.send('menu-theme-change', 'terminal')
            },
            {
              label: 'Oceanic',
              type: 'radio',
              checked: currentTheme === 'oceanic',
              click: () => mainWindow?.webContents.send('menu-theme-change', 'oceanic')
            },
            {
              label: 'Newspaper',
              type: 'radio',
              checked: currentTheme === 'newspaper',
              click: () => mainWindow?.webContents.send('menu-theme-change', 'newspaper')
            },
            {
              label: 'Cyberpunk',
              type: 'radio',
              checked: currentTheme === 'cyberpunk',
              click: () => mainWindow?.webContents.send('menu-theme-change', 'cyberpunk')
            },
            {
              label: 'Forest',
              type: 'radio',
              checked: currentTheme === 'forest',
              click: () => mainWindow?.webContents.send('menu-theme-change', 'forest')
            },
            {
              label: 'Minimal',
              type: 'radio',
              checked: currentTheme === 'minimal',
              click: () => mainWindow?.webContents.send('menu-theme-change', 'minimal')
            },
            {
              label: 'Academic',
              type: 'radio',
              checked: currentTheme === 'academic',
              click: () => mainWindow?.webContents.send('menu-theme-change', 'academic')
            },
            { type: 'separator' },
            {
              label: 'Print Classic',
              type: 'radio',
              checked: currentTheme === 'print-classic',
              click: () => mainWindow?.webContents.send('menu-theme-change', 'print-classic')
            },
            {
              label: 'Print Modern',
              type: 'radio',
              checked: currentTheme === 'print-modern',
              click: () => mainWindow?.webContents.send('menu-theme-change', 'print-modern')
            },
            {
              label: 'Print Elegant',
              type: 'radio',
              checked: currentTheme === 'print-elegant',
              click: () => mainWindow?.webContents.send('menu-theme-change', 'print-elegant')
            },
            {
              label: 'Print Technical',
              type: 'radio',
              checked: currentTheme === 'print-technical',
              click: () => mainWindow?.webContents.send('menu-theme-change', 'print-technical')
            },
            {
              label: 'Print Report',
              type: 'radio',
              checked: currentTheme === 'print-report',
              click: () => mainWindow?.webContents.send('menu-theme-change', 'print-report')
            },
            {
              label: 'Print Minimalist',
              type: 'radio',
              checked: currentTheme === 'print-minimalist',
              click: () => mainWindow?.webContents.send('menu-theme-change', 'print-minimalist')
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
    
    try {
      // Handle URL-encoded paths
      url = decodeURIComponent(url);
      
      // On Windows, normalize common malformed drive-letter patterns from URL parsing
      if (process.platform === 'win32') {
        // Case 1: starts with /C:/... (triple-slash URL form) → drop the leading slash
        if (/^\/[A-Za-z]:\//.test(url)) {
          url = url.slice(1);
        }
        // Case 2: starts with c/Users/... (host interpreted as drive without colon) → insert colon
        else if (/^[A-Za-z]\//.test(url)) {
          const drive = url.charAt(0).toUpperCase();
          const rest = url.slice(2); // skip 'c/'
          url = `${drive}:/${rest}`;
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
      
      // If file doesn't exist, try alternative path formats
      if (!fs.existsSync(normalizedPath)) {
        
        // Try with different case combinations
        const alternatives = [
          normalizedPath,
          normalizedPath.replace(/^C:/, 'c:'),
          normalizedPath.replace(/^C:/, 'C:'),
          path.resolve(process.cwd(), url),
          path.resolve(process.cwd(), url.replace(/^[A-Za-z]:/, ''))
        ];
        
        for (const altPath of alternatives) {
          if (fs.existsSync(altPath)) {
            callback({ path: altPath });
            return;
          }
        }
      } else {
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
  
  if (!protocolSuccess) {
    console.error('[PROTOCOL] CRITICAL: Protocol registration failed! Images will not load.');
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

ipcMain.handle('write-file', async (event, filePath: string, content: string) => {
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return { success: true };
  } catch (error) {
    console.error('Error writing file:', error);
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
    
    console.log('[PDF] Received theme data:', themeData);
    
    // Check what's actually in the document
    console.log('[PDF] Analyzing content...');
    await mainWindow.webContents.executeJavaScript(`
      (function() {
        const content = document.getElementById('markdown-content');
        if (content) {
          console.log('[PDF] Content height:', content.scrollHeight, 'px');
          console.log('[PDF] Content has', content.children.length, 'child elements');
          
          // Count math elements
          const mathElements = content.querySelectorAll('mjx-container');
          console.log('[PDF] Found', mathElements.length, 'MathJax elements');
          
          // Count diagrams
          const diagrams = content.querySelectorAll('.mermaid-diagram, .sequence-diagram');
          console.log('[PDF] Found', diagrams.length, 'diagram elements');
        }
        
        return 'content-check-complete';
      })();
    `);
    console.log('[PDF] Content check completed');
    
    // Inject theme styles for PDF if theme data is provided
    if (themeData) {
      console.log('[PDF] Injecting theme CSS with colors:', {
        body: themeData.body,
        text: themeData.text,
        heading: themeData.heading,
        codeBg: themeData.codeBg
      });
      
      const themeCSS = `
        @media print {
          body {
            background: ${themeData.body} !important;
            color: ${themeData.text} !important;
          }
          #content {
            background: ${themeData.content} !important;
          }
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
          #markdown-content pre code {
            background: transparent !important;
          }
          #markdown-content blockquote {
            background: ${themeData.quoteBg} !important;
            border-color: ${themeData.quoteBorder} !important;
            color: ${themeData.quoteText} !important;
          }
        }
      `;
      
      console.log('[PDF] Generated CSS:', themeCSS.substring(0, 200));
      
      await mainWindow.webContents.executeJavaScript(`
        (function() {
          const existingStyle = document.getElementById('pdf-theme-override');
          if (existingStyle) {
            console.log('[PDF] Removing existing theme style');
            existingStyle.remove();
          }
          
          const style = document.createElement('style');
          style.id = 'pdf-theme-override';
          style.textContent = ${JSON.stringify(themeCSS)};
          document.head.appendChild(style);
          console.log('[PDF] Theme style injected, total styles in head:', document.head.querySelectorAll('style').length);
          return true;
        })();
      `);
    }
    
    // Wait for renderer to signal all rendering complete (MathJax, Mermaid, UML)
    try {
      console.log('[PDF] Requesting renderer render completion handshake');
      const renderComplete = await mainWindow.webContents.executeJavaScript(`
        (async function() {
          try {
            if (window.waitForRenderingComplete) {
              await window.waitForRenderingComplete();
              return true;
            }
            console.warn('[PDF] waitForRenderingComplete not found on window');
            return false;
          } catch (err) {
            console.error('[PDF] Error during waitForRenderingComplete:', err);
            return false;
          }
        })();
      `);
      console.log('[PDF] Renderer render completion status:', renderComplete);
    } catch (err) {
      console.warn('[PDF] Handshake error (continuing anyway):', err);
    }

    // Log what we're about to capture AFTER handshake
    const contentInfo = await mainWindow.webContents.executeJavaScript(`
      (function() {
        const content = document.getElementById('markdown-content');
        if (content) {
          return {
            height: content.scrollHeight,
            children: content.children.length,
            mathElements: content.querySelectorAll('mjx-container').length,
            diagrams: content.querySelectorAll('.mermaid-diagram, .sequence-diagram').length
          };
        }
        return null;
      })();
    `);
    console.log('[PDF] Content analysis:', JSON.stringify(contentInfo, null, 2));
    console.log('[PDF] Wait completed, ready to generate PDF');
    
    // Generate PDF from the current page
    // Use explicit page size and margins for better control
    console.log('[PDF] Starting PDF generation...');
    console.log('[PDF] Document dimensions - height:', contentInfo?.height, 'px');
    
    // CRITICAL FIX: Remove scroll containers so printToPDF captures all content
    // The #content div has overflow:auto which limits what gets captured
    await mainWindow.webContents.executeJavaScript(`
      (function() {
        const content = document.getElementById('content');
        const markdownContent = document.getElementById('markdown-content');
        const mainContainer = document.querySelector('.main-container');
        const tocSidebar = document.getElementById('toc-sidebar');
        
        // Store original styles
        window._pdfOriginalStyles = {
          contentOverflow: content.style.overflow,
          contentHeight: content.style.height,
          contentMaxHeight: content.style.maxHeight,
          htmlHeight: document.documentElement.style.height,
          bodyHeight: document.body.style.height,
          bodyDisplay: document.body.style.display,
          bodyFlex: document.body.style.flex,
          mainContainerOverflow: mainContainer ? mainContainer.style.overflow : '',
          mainContainerHeight: mainContainer ? mainContainer.style.height : '',
          mainContainerDisplay: mainContainer ? mainContainer.style.display : '',
          tocSidebarDisplay: tocSidebar ? tocSidebar.style.display : '',
          tocSidebarWidth: tocSidebar ? tocSidebar.style.width : '',
          tocSidebarVisibility: tocSidebar ? tocSidebar.style.visibility : ''
        };
        
        // FORCE hide TOC sidebar regardless of its open state
        if (tocSidebar) {
          tocSidebar.style.display = 'none';
          tocSidebar.style.width = '0';
          tocSidebar.style.visibility = 'hidden';
          console.log('[PDF] TOC sidebar forcefully hidden');
        }
        
        // Remove all height/overflow constraints to show full content
        // Fix body flex layout that constrains height
        document.body.style.display = 'block';
        document.body.style.height = 'auto';
        document.body.style.overflow = 'visible';
        document.documentElement.style.height = 'auto';
        document.documentElement.style.overflow = 'visible';
        
        // Fix main container that has overflow:hidden
        if (mainContainer) {
          mainContainer.style.overflow = 'visible';
          mainContainer.style.height = 'auto';
          mainContainer.style.display = 'block';
        }
        
        // Fix content div
        content.style.overflow = 'visible';
        content.style.height = 'auto';
        content.style.maxHeight = 'none';
        
        console.log('[PDF] Removed scroll constraints, content now visible');
        console.log('[PDF] Content scrollHeight:', markdownContent.scrollHeight, 'px');
      })();
    `);
    
    const pdfData = await mainWindow.webContents.printToPDF({
      printBackground: true,         
      landscape: false,
      pageSize: 'A4',               
      margins: {                    
        top: 0.5,
        bottom: 0.5, 
        left: 0.75,
        right: 0.75
      },
      preferCSSPageSize: false,     
      displayHeaderFooter: false,
      generateDocumentOutline: false,
      generateTaggedPDF: false,
      pageRanges: ''                
    });
    console.log('[PDF] PDF generation completed, size:', pdfData.length, 'bytes');
    
    // Restore original styles
    await mainWindow.webContents.executeJavaScript(`
      (function() {
        if (window._pdfOriginalStyles) {
          const content = document.getElementById('content');
          const mainContainer = document.querySelector('.main-container');
          const tocSidebar = document.getElementById('toc-sidebar');
          const styles = window._pdfOriginalStyles;
          
          // Restore body styles
          document.body.style.display = styles.bodyDisplay;
          document.body.style.height = styles.bodyHeight;
          document.body.style.overflow = '';
          document.documentElement.style.height = styles.htmlHeight;
          document.documentElement.style.overflow = '';
          
          // Restore main container
          if (mainContainer) {
            mainContainer.style.overflow = styles.mainContainerOverflow;
            mainContainer.style.height = styles.mainContainerHeight;
            mainContainer.style.display = styles.mainContainerDisplay;
          }
          
          // Restore TOC sidebar
          if (tocSidebar) {
            tocSidebar.style.display = styles.tocSidebarDisplay;
            tocSidebar.style.width = styles.tocSidebarWidth;
            tocSidebar.style.visibility = styles.tocSidebarVisibility;
            console.log('[PDF] TOC sidebar restored');
          }
          
          // Restore content
          content.style.overflow = styles.contentOverflow;
          content.style.height = styles.contentHeight;
          content.style.maxHeight = styles.contentMaxHeight;
          
          delete window._pdfOriginalStyles;
          console.log('[PDF] Restored original styles');
        }
      })();
    `);    // Clean up the injected theme style
    if (themeData) {
      await mainWindow.webContents.executeJavaScript(`
        (function() {
          const style = document.getElementById('pdf-theme-override');
          if (style) style.remove();
        })();
      `);
    }

    // Write PDF to file asynchronously with proper error handling
    try {
      await fs.promises.writeFile(savePath, pdfData as any);
      console.log('[PDF] File written successfully:', savePath);
      
      // Verify file was actually written and has correct size
      const stats = await fs.promises.stat(savePath);
      console.log('[PDF] File size:', stats.size, 'bytes');
      
      if (stats.size === 0) {
        throw new Error('PDF file is empty');
      }
      
      // Now open the PDF with the default PDF viewer
      console.log('[PDF] Opening PDF file:', savePath);
      const error = await shell.openPath(savePath);
      
      if (error) {
        console.error('Failed to open PDF:', error);
        // Still return success since the PDF was created, just couldn't open it
      } else {
        console.log('PDF opened successfully:', savePath);
      }
      
    } catch (writeError) {
      console.error('[PDF] Failed to write PDF file:', writeError);
      throw writeError;
    }
    
    return savePath;
  } catch (error) {
    console.error('Failed to generate PDF:', error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('Error details:', errorMsg);
    dialog.showErrorBox('PDF Export Failed', `Failed to save PDF file: ${errorMsg}`);
    return null;
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

ipcMain.handle('set-current-theme', async (_event, themeName: string) => {
  console.log('[THEME] Received theme update from renderer:', themeName);
  currentTheme = themeName;
  // Recreate the window to update the menu with new checked state
  if (mainWindow) {
    const currentMenu = Menu.getApplicationMenu();
    if (currentMenu) {
      // Find and update theme menu items under the View menu
      const viewMenu = currentMenu.items.find(item => item.label === 'View');
      const themeMenuItem = viewMenu?.submenu?.items.find(item => item.label === 'Theme');
      if (themeMenuItem?.submenu) {
        themeMenuItem.submenu.items.forEach(item => {
          const normalizedLabel = item.label?.toLowerCase().replace(/\s+/g, '-');
          item.checked = (normalizedLabel === themeName);
        });
      }
    }
  }
});

ipcMain.handle('get-app-version', async () => {
  return app.getVersion();
});

// IPC handler to get file stats (for detecting conflicts)
ipcMain.handle('get-file-stats', async (_event, filePath: string) => {
  try {
    const stats = fs.statSync(filePath);
    return { success: true, mtime: stats.mtime.getTime(), size: stats.size };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

// Watcher handler for external file changes
function handleFileChange(filePath: string) {
  console.log(`[WATCHER] File changed: ${filePath}`);
  
  // Notify renderer process about the file change
  if (mainWindow) {
    mainWindow.webContents.send('file-changed', filePath);
  }
}

// Watch a file for changes
function watchFile(filePath: string) {
  if (fileWatchers.has(filePath)) {
    console.log(`[WATCHER] Already watching file: ${filePath}`);
    return;
  }
  
  try {
    // Store initial file stats
    const stats = fs.statSync(filePath);
    fileStats.set(filePath, { mtime: stats.mtime, size: stats.size });
    
    const watcher = fs.watch(filePath, { persistent: false }, (eventType) => {
      console.log(`[WATCHER] Event: ${eventType} on ${filePath}`);
      
      try {
        // Check if file actually changed
        const newStats = fs.statSync(filePath);
        const oldStats = fileStats.get(filePath);
        
        if (oldStats && (newStats.mtime.getTime() !== oldStats.mtime.getTime() || newStats.size !== oldStats.size)) {
          fileStats.set(filePath, { mtime: newStats.mtime, size: newStats.size });
          handleFileChange(filePath);
        }
      } catch (err) {
        console.error('[WATCHER] Error checking file stats:', err);
      }
    });
    
    fileWatchers.set(filePath, watcher);
    console.log(`[WATCHER] Started watching file: ${filePath}`);
  } catch (error) {
    console.error(`[WATCHER] Failed to watch file ${filePath}:`, error);
  }
}

// Unwatch a file
function unwatchFile(filePath: string) {
  const watcher = fileWatchers.get(filePath);
  if (watcher) {
    watcher.close();
    fileWatchers.delete(filePath);
    console.log(`[WATCHER] Stopped watching file: ${filePath}`);
  }
}

// Watch a directory for changes
function watchDirectory(dirPath: string) {
  if (fileWatchers.has(dirPath)) {
    console.log(`[WATCHER] Already watching directory: ${dirPath}`);
    return;
  }
  
  const watcher = fs.watch(dirPath, { persistent: true, recursive: true }, (eventType, filename) => {
    if (filename) {
      handleFileChange(path.join(dirPath, filename));
    }
  });
  
  fileWatchers.set(dirPath, watcher);
  console.log(`[WATCHER] Started watching directory: ${dirPath}`);
}

// Unwatch a directory
function unwatchDirectory(dirPath: string) {
  const watcher = fileWatchers.get(dirPath);
  if (watcher) {
    watcher.close();
    fileWatchers.delete(dirPath);
    console.log(`[WATCHER] Stopped watching directory: ${dirPath}`);
  }
}

// IPC handler to start watching a file
ipcMain.handle('watch-file', async (_event, filePath: string) => {
  try {
    watchFile(filePath);
    return { success: true };
  } catch (error) {
    console.error('Error watching file:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

// IPC handler to stop watching a file
ipcMain.handle('unwatch-file', async (_event, filePath: string) => {
  try {
    unwatchFile(filePath);
    return { success: true };
  } catch (error) {
    console.error('Error unwatching file:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

// IPC handler to watch a directory
ipcMain.handle('watch-directory', async (_event, dirPath: string) => {
  try {
    watchDirectory(dirPath);
    return { success: true };
  } catch (error) {
    console.error('Error watching directory:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

// IPC handler to unwatch a directory
ipcMain.handle('unwatch-directory', async (_event, dirPath: string) => {
  try {
    unwatchDirectory(dirPath);
    return { success: true };
  } catch (error) {
    console.error('Error unwatching directory:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});
