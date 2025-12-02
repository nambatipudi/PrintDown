import MarkdownIt from 'markdown-it';
import texmath from 'markdown-it-texmath';
// CodeMirror imports
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { search, searchKeymap } from '@codemirror/search';

// Declare the APIs exposed by preload script
declare global {
  interface Window {
    webUtils: {
      getPathForFile: (file: File) => string;
    };
    filePicker: {
      pickFile: () => Promise<string[] | null>;
    };
    fileSystem: {
      readFile: (filePath: string) => Promise<{ success: boolean; content?: string; error?: string }>;
      writeFile: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>;
    };
    session: {
      save: (sessionData: any) => Promise<any>;
    };
    printExport: {
      exportPDF: (filePath: string, themeData?: any) => Promise<string | null>;
    };
    menuEvents: {
      onMenuOpen: (callback: () => void) => void;
      onMenuExportPDF: (callback: () => void) => void;
      onMenuCopyDebugLogs: (callback: () => void) => void;
      onRestoreSession: (callback: (event: any, session: any) => void) => void;
      onOpenFileFromSystem: (callback: (event: any, filePath: string) => void) => void;
      onMenuFontIncrease: (callback: () => void) => void;
      onMenuFontDecrease: (callback: () => void) => void;
      onMenuFontReset: (callback: () => void) => void;
      onMenuThemeChange: (callback: (event: any, theme: string) => void) => void;
      onMenuToggleTOC: (callback: () => void) => void;
      onMenuSave: (callback: () => void) => void;
    };
      themeAPI: {
        setCurrentTheme: (themeName: string) => Promise<void>;
      };
    clipboard: {
      writeText: (text: string) => void;
    };
    fileWatch: {
      watchFile: (filePath: string) => Promise<{ success: boolean; error?: string }>;
      unwatchFile: (filePath: string) => Promise<{ success: boolean; error?: string }>;
      getFileStats: (filePath: string) => Promise<{ success: boolean; mtime?: number; size?: number; error?: string }>;
      onFileChanged: (callback: (filePath: string) => void) => void;
    };
    appVersion: () => Promise<string>;
    MathJax: any;
    mermaid: any;
    Diagram: any;
  }
}

interface Tab {
  filePath: string;
  content: string;
  title: string;
  isRendered?: boolean; // Track if tab has been rendered
  tocItems?: TOCItem[]; // Table of contents items
  isDirty?: boolean; // Track unsaved changes
  lastModified?: number; // Track when file was last loaded/saved (mtime)
}

interface TOCItem {
  id: string;
  text: string;
  level: number;
  element?: HTMLElement;
}

const tabs: Tab[] = [];
let activeTabIndex = -1;
let sessionRestored = false; // Flag to prevent multiple session restorations
let isEditMode = false;
let editorElement: HTMLTextAreaElement | null = null;
let cmView: EditorView | null = null; // CodeMirror instance
let editableCompartment = new Compartment(); // For toggling editable state
let editToggleButton: HTMLButtonElement | null = null;
let refreshButton: HTMLButtonElement | null = null;
let renderDebounceHandle: number | null = null;
const RENDER_DEBOUNCE_MS = 250;
const SESSION_SAVE_DEBOUNCE_MS = 1500;
let sessionSaveHandle: number | null = null;
let currentThemeBaseFontSize = '16px';

// Initialize markdown-it with texmath plugin for VS Code-style math rendering
const md = new MarkdownIt({
  html: true,
  breaks: true,
  linkify: true,
  typographer: true
}).use(texmath, {
  engine: {
    // Custom engine that preserves LaTeX for MathJax to render
    renderToString(tex: string, options: any) {
      // texmath passes display:true for block math, false for inline
      if (options && options.display) {
        return `$$${tex}$$`;
      }
      return `$${tex}$`;
    }
  },
  delimiters: ['dollars', 'brackets', 'gitlab', 'julia', 'kramdown'], // Support all common delimiters
});

// Patch the dollars inline regex to support spaces in math expressions
// The default regex /\$((?:[^\s\\])|(?:\S.*?[^\s\\]))\$/gy rejects expressions with spaces
// We add a custom rule that matches $...$ with any content (including spaces)
const customDollarRule = (state: any, silent: boolean) => {
  const pos = state.pos;
  const str = state.src;
  
  // Match $...$ with any content (including spaces)
  const rex = /\$([^$]+?)\$/gy;
  rex.lastIndex = pos;
  const pre = str.startsWith('$', pos);
  const match = pre && rex.exec(str);
  const res = !!match && pos < rex.lastIndex;
  
  if (res) {
    if (!silent) {
      const token = state.push('math_inline_fixed', 'math', 0);
      token.content = match[1];
      token.markup = '$';
    }
    state.pos = rex.lastIndex;
  }
  return res;
};

// Register custom renderer for our fixed inline math
md.renderer.rules['math_inline_fixed'] = (tokens, idx) => {
  const tex = tokens[idx].content;
  // Use our custom engine to render
  return `$${tex}$`;
};

// Insert our custom rule before 'escape' to catch space-containing math before other rules
md.inline.ruler.before('escape', 'math_inline_fixed', customDollarRule);

// Declare MathJax window object
declare global {
  interface Window {
    MathJax: any;
  }
}

// Track current theme
let currentThemeName: keyof typeof themes = 'dark';

// Theme definitions
const themes = {
  dark: {
    body: '#1e1e1e',
    content: '#1e1e1e',
    text: '#d4d4d4',
    heading: '#4ec9b0',
    link: '#4fc3f7',
    codeBg: '#2d2d30',
    codeText: '#ce9178',
    quoteBg: 'rgba(255, 255, 255, 0.03)',
    quoteBorder: '#4fc3f7',
    quoteText: '#b0b0b0',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    codeFontFamily: '"Consolas", "Monaco", "Courier New", monospace',
    fontSize: '16px',
    lineHeight: '1.6'
  },
  light: {
    body: '#ffffff',
    content: '#ffffff',
    text: '#24292e',
    heading: '#0366d6',
    link: '#0366d6',
    codeBg: '#f6f8fa',
    codeText: '#d73a49',
    quoteBg: '#f6f8fa',
    quoteBorder: '#0366d6',
    quoteText: '#6a737d',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    codeFontFamily: '"Consolas", "Monaco", "Courier New", monospace',
    fontSize: '16px',
    lineHeight: '1.6'
  },
  sepia: {
    body: '#f4ecd8',
    content: '#f4ecd8',
    text: '#5b4636',
    heading: '#8b6914',
    link: '#aa6708',
    codeBg: '#e8dcc0',
    codeText: '#aa6708',
    quoteBg: '#e8dcc0',
    quoteBorder: '#aa6708',
    quoteText: '#7d6c56',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    codeFontFamily: '"Consolas", "Monaco", "Courier New", monospace',
    fontSize: '16px',
    lineHeight: '1.6'
  },
  nord: {
    body: '#2e3440',
    content: '#2e3440',
    text: '#d8dee9',
    heading: '#88c0d0',
    link: '#81a1c1',
    codeBg: '#3b4252',
    codeText: '#a3be8c',
    quoteBg: '#3b4252',
    quoteBorder: '#88c0d0',
    quoteText: '#d8dee9',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    codeFontFamily: '"Consolas", "Monaco", "Courier New", monospace',
    fontSize: '16px',
    lineHeight: '1.6'
  },
  dracula: {
    body: '#282a36',
    content: '#282a36',
    text: '#f8f8f2',
    heading: '#ff79c6',
    link: '#8be9fd',
    codeBg: '#44475a',
    codeText: '#50fa7b',
    quoteBg: '#44475a',
    quoteBorder: '#bd93f9',
    quoteText: '#f8f8f2',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    codeFontFamily: '"Consolas", "Monaco", "Courier New", monospace',
    fontSize: '16px',
    lineHeight: '1.6'
  },
  'solarized-light': {
    body: '#fdf6e3',
    content: '#fdf6e3',
    text: '#657b83',
    heading: '#268bd2',
    link: '#2aa198',
    codeBg: '#eee8d5',
    codeText: '#cb4b16',
    quoteBg: '#eee8d5',
    quoteBorder: '#268bd2',
    quoteText: '#93a1a1',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    codeFontFamily: '"Consolas", "Monaco", "Courier New", monospace',
    fontSize: '16px',
    lineHeight: '1.6'
  },
  github: {
    body: '#ffffff',
    content: '#ffffff',
    text: '#24292f',
    heading: '#1f2328',
    link: '#0969da',
    codeBg: '#f6f8fa',
    codeText: '#cf222e',
    quoteBg: '#f6f8fa',
    quoteBorder: '#d0d7de',
    quoteText: '#57606a',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    codeFontFamily: '"Consolas", "Monaco", "Courier New", monospace',
    fontSize: '16px',
    lineHeight: '1.6'
  },
  monokai: {
    body: '#272822',
    content: '#272822',
    text: '#f8f8f2',
    heading: '#f92672',
    link: '#66d9ef',
    codeBg: '#3e3d32',
    codeText: '#a6e22e',
    quoteBg: '#3e3d32',
    quoteBorder: '#f92672',
    quoteText: '#f8f8f2',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    codeFontFamily: '"Consolas", "Monaco", "Courier New", monospace',
    fontSize: '16px',
    lineHeight: '1.6'
  },
  literary: {
    body: '#f9f7f4',
    content: '#f9f7f4',
    text: '#2c2416',
    heading: '#8b4513',
    link: '#c65d2b',
    codeBg: '#f0ebe3',
    codeText: '#8b4513',
    quoteBg: '#f0ebe3',
    quoteBorder: '#c65d2b',
    quoteText: '#5d4e37',
    fontFamily: '"Times New Roman", "Georgia", "Garamond", "Book Antiqua", serif',
    codeFontFamily: '"Consolas", "Monaco", "SF Mono", "Menlo", "Courier New", monospace',
    fontSize: '18px',
    lineHeight: '1.8'
  },
  terminal: {
    body: '#0c0c0c',
    content: '#0c0c0c',
    text: '#00ff00',
    heading: '#00ff00',
    link: '#00ffff',
    codeBg: '#1a1a1a',
    codeText: '#00ff00',
    quoteBg: '#1a1a1a',
    quoteBorder: '#00ff00',
    quoteText: '#00cc00',
    fontFamily: '"Consolas", "SF Mono", "Monaco", "Menlo", "Liberation Mono", "Courier New", monospace',
    codeFontFamily: '"Consolas", "SF Mono", "Monaco", "Menlo", "Liberation Mono", monospace',
    fontSize: '15px',
    lineHeight: '1.5'
  },
  oceanic: {
    body: '#1b2b34',
    content: '#1b2b34',
    text: '#cdd3de',
    heading: '#6699cc',
    link: '#5fb3b3',
    codeBg: '#343d46',
    codeText: '#99c794',
    quoteBg: '#343d46',
    quoteBorder: '#5fb3b3',
    quoteText: '#a7adba',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif',
    codeFontFamily: '"Consolas", "SF Mono", "Monaco", "Menlo", monospace',
    fontSize: '16px',
    lineHeight: '1.7'
  },
  newspaper: {
    body: '#ffffff',
    content: '#ffffff',
    text: '#1a1a1a',
    heading: '#000000',
    link: '#0051a5',
    codeBg: '#f5f5f5',
    codeText: '#d32f2f',
    quoteBg: '#f5f5f5',
    quoteBorder: '#cccccc',
    quoteText: '#555555',
    fontFamily: '"Georgia", "Times New Roman", "Book Antiqua", serif',
    codeFontFamily: '"Courier New", monospace',
    fontSize: '17px',
    lineHeight: '1.75'
  },
  cyberpunk: {
    body: '#0a0e27',
    content: '#0a0e27',
    text: '#e0d9ff',
    heading: '#ff00ff',
    link: '#00ffff',
    codeBg: '#1a1f3a',
    codeText: '#ff00ff',
    quoteBg: '#1a1f3a',
    quoteBorder: '#ff00ff',
    quoteText: '#c9b3ff',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif',
    codeFontFamily: '"Consolas", "SF Mono", "Monaco", "Menlo", monospace',
    fontSize: '16px',
    lineHeight: '1.6'
  },
  forest: {
    body: '#1a2e1a',
    content: '#1a2e1a',
    text: '#d4e7d4',
    heading: '#8bc34a',
    link: '#4caf50',
    codeBg: '#2d4a2d',
    codeText: '#aed581',
    quoteBg: '#2d4a2d',
    quoteBorder: '#8bc34a',
    quoteText: '#c5e1a5',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif',
    codeFontFamily: '"Consolas", "SF Mono", "Monaco", "Menlo", monospace',
    fontSize: '16px',
    lineHeight: '1.65'
  },
  minimal: {
    body: '#fafafa',
    content: '#fafafa',
    text: '#333333',
    heading: '#111111',
    link: '#666666',
    codeBg: '#eeeeee',
    codeText: '#333333',
    quoteBg: '#f5f5f5',
    quoteBorder: '#dddddd',
    quoteText: '#666666',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif',
    codeFontFamily: '"Consolas", "SF Mono", "Monaco", "Menlo", monospace',
    fontSize: '15px',
    lineHeight: '1.6'
  },
  academic: {
    body: '#f8f8f8',
    content: '#f8f8f8',
    text: '#1a1a1a',
    heading: '#1a237e',
    link: '#3949ab',
    codeBg: '#eeeeee',
    codeText: '#c62828',
    quoteBg: '#e8eaf6',
    quoteBorder: '#3f51b5',
    quoteText: '#1a237e',
    fontFamily: '"Georgia", "Times New Roman", "Book Antiqua", serif',
    codeFontFamily: '"Consolas", "SF Mono", "Monaco", "Menlo", monospace',
    fontSize: '17px',
    lineHeight: '1.8'
  },
  'print-classic': {
    body: '#ffffff',
    content: '#ffffff',
    text: '#1a1a1a',
    heading: '#8b4513',
    link: '#2c5aa0',
    codeBg: '#f9f6f2',
    codeText: '#a0522d',
    quoteBg: '#f5f2ed',
    quoteBorder: '#8b7355',
    quoteText: '#4a4a4a',
    fontFamily: '"Georgia", "Times New Roman", "Garamond", serif',
    codeFontFamily: '"Courier New", "Courier", monospace',
    fontSize: '12pt',
    lineHeight: '1.5'
  },
  'print-modern': {
    body: '#ffffff',
    content: '#ffffff',
    text: '#2a2a2a',
    heading: '#0066cc',
    link: '#0052a3',
    codeBg: '#f0f4f8',
    codeText: '#0077b6',
    quoteBg: '#e8f4f8',
    quoteBorder: '#4a9bd1',
    quoteText: '#1a5490',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif',
    codeFontFamily: '"SF Mono", "Menlo", "Consolas", "Monaco", monospace',
    fontSize: '11pt',
    lineHeight: '1.6'
  },
  'print-elegant': {
    body: '#fefefe',
    content: '#fefefe',
    text: '#2d2d2d',
    heading: '#5f3dc4',
    link: '#6741d9',
    codeBg: '#f8f5fb',
    codeText: '#7950f2',
    quoteBg: '#f3f0ff',
    quoteBorder: '#9775fa',
    quoteText: '#5f3dc4',
    fontFamily: '"Palatino Linotype", "Book Antiqua", Palatino, serif',
    codeFontFamily: '"Courier New", Courier, monospace',
    fontSize: '12pt',
    lineHeight: '1.7'
  },
  'print-technical': {
    body: '#ffffff',
    content: '#ffffff',
    text: '#1a1a1a',
    heading: '#2f7c31',
    link: '#1b5e20',
    codeBg: '#f1f8f4',
    codeText: '#2e7d32',
    quoteBg: '#e8f5e9',
    quoteBorder: '#66bb6a',
    quoteText: '#2e7d32',
    fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    codeFontFamily: '"Consolas", "Monaco", "Courier New", monospace',
    fontSize: '11pt',
    lineHeight: '1.5'
  },
  'print-report': {
    body: '#ffffff',
    content: '#ffffff',
    text: '#212121',
    heading: '#b8860b',
    link: '#9a7e0a',
    codeBg: '#fffef5',
    codeText: '#b8860b',
    quoteBg: '#fff9e6',
    quoteBorder: '#daa520',
    quoteText: '#855d00',
    fontFamily: '"Calibri", "Trebuchet MS", sans-serif',
    codeFontFamily: '"Courier New", Courier, monospace',
    fontSize: '11pt',
    lineHeight: '1.6'
  },
  'print-minimalist': {
    body: '#ffffff',
    content: '#ffffff',
    text: '#333333',
    heading: '#c92a2a',
    link: '#e03131',
    codeBg: '#fff5f5',
    codeText: '#c92a2a',
    quoteBg: '#ffe3e3',
    quoteBorder: '#fa5252',
    quoteText: '#c92a2a',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    codeFontFamily: '"SF Mono", "Menlo", "Consolas", monospace',
    fontSize: '11pt',
    lineHeight: '1.55'
  }
};

function applyTheme(themeName: keyof typeof themes) {
  currentThemeName = themeName; // Track current theme
  window.themeAPI.setCurrentTheme(themeName); // Notify main process
  const theme = themes[themeName];
  
  // Only apply theme to the content area, not the whole app
  const content = document.getElementById('content')!;
  content.style.backgroundColor = theme.content;
  
  const mdContent = document.getElementById('markdown-content')!;
  mdContent.style.color = theme.text;
  mdContent.style.fontFamily = theme.fontFamily;
  mdContent.style.lineHeight = theme.lineHeight;
  currentThemeBaseFontSize = theme.fontSize || '16px';
  updateContentFontSize();
  
  // Apply theme via CSS custom properties
  document.documentElement.style.setProperty('--theme-body', theme.body);
  document.documentElement.style.setProperty('--theme-content', theme.content);
  document.documentElement.style.setProperty('--theme-text', theme.text);
  document.documentElement.style.setProperty('--theme-heading', theme.heading);
  document.documentElement.style.setProperty('--theme-link', theme.link);
  document.documentElement.style.setProperty('--theme-code-bg', theme.codeBg);
  document.documentElement.style.setProperty('--theme-code-text', theme.codeText);
  document.documentElement.style.setProperty('--theme-quote-bg', theme.quoteBg);
  document.documentElement.style.setProperty('--theme-quote-border', theme.quoteBorder);
  document.documentElement.style.setProperty('--theme-quote-text', theme.quoteText);
  
  // Update all themed elements
  const headings = mdContent.querySelectorAll('h1, h2, h3, h4, h5, h6');
  headings.forEach(h => (h as HTMLElement).style.color = theme.heading);
  
  const links = mdContent.querySelectorAll('a');
  links.forEach(a => (a as HTMLElement).style.color = theme.link);
  
  const codes = mdContent.querySelectorAll('code');
  codes.forEach(c => {
    const code = c as HTMLElement;
    code.style.fontFamily = theme.codeFontFamily;
    if (!code.parentElement?.matches('pre')) {
      code.style.backgroundColor = theme.codeBg;
      code.style.color = theme.codeText;
    }
  });
  
  const pres = mdContent.querySelectorAll('pre');
  pres.forEach(p => {
    const pre = p as HTMLElement;
    pre.style.backgroundColor = theme.codeBg;
    pre.style.fontFamily = theme.codeFontFamily;
  });
  
  const quotes = mdContent.querySelectorAll('blockquote');
  quotes.forEach(q => {
    const quote = q as HTMLElement;
    quote.style.backgroundColor = theme.quoteBg;
    quote.style.borderColor = theme.quoteBorder;
    quote.style.color = theme.quoteText;
  });
  
  // Reinitialize Mermaid with appropriate theme
  const isDarkTheme = ['dark', 'nord', 'dracula', 'monokai', 'terminal', 'oceanic', 'cyberpunk', 'forest'].includes(themeName);
  initMermaid(isDarkTheme, themeName, theme);
  
  // Save theme preference
  localStorage.setItem('selectedTheme', themeName);
}

// Mermaid diagram counter
let mermaidCounter = 0;

// Initialize Mermaid
function initMermaid(isDarkTheme: boolean = true, themeName: string = 'default', theme?: any) {
  if (window.mermaid) {
    // Create custom theme variables based on current PrintDown theme
    const themeVariables = theme ? {
      primaryColor: theme.heading,
      primaryTextColor: theme.text,
      primaryBorderColor: theme.quoteBorder,
      lineColor: theme.link,
      secondaryColor: theme.codeBg,
      tertiaryColor: theme.quoteBg,
      background: theme.body,
      mainBkg: theme.body,
      secondBkg: theme.codeBg,
      tertiaryBkg: theme.quoteBg,
      textColor: theme.text,
      fontSize: '16px',
      fontFamily: theme.fontFamily
    } : undefined;

    window.mermaid.initialize({
      startOnLoad: false,
      theme: themeVariables ? 'base' : (isDarkTheme ? 'dark' : 'default'),
      themeVariables: themeVariables,
      securityLevel: 'loose',
      fontFamily: theme?.fontFamily || '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    });
  }
}

// Process Mermaid diagrams
async function processMermaidDiagrams(container: HTMLElement) {
  if (!window.mermaid) {
    return;
  }

  // Find unprocessed mermaid code blocks
  const mermaidBlocks = container.querySelectorAll('code.language-mermaid:not([data-mermaid-processed])');
  
  for (const block of Array.from(mermaidBlocks)) {
    const pre = block.parentElement;
    if (!pre || pre.tagName !== 'PRE') {
      continue;
    }
    
    // Get the diagram code
    const code = block.textContent || '';
    
    // Create a container for the diagram
    const diagramId = `mermaid-diagram-${mermaidCounter++}`;
    const diagramDiv = document.createElement('div');
    diagramDiv.className = 'mermaid-diagram';
    diagramDiv.id = diagramId;
  diagramDiv.textContent = code;
  (block as HTMLElement).setAttribute('data-mermaid-processed', 'true');
    
    // Replace the code block with the diagram container
    pre.replaceWith(diagramDiv);
  }
  
  // Render all diagrams
  try {
    await window.mermaid.run({
      querySelector: '.mermaid-diagram'
    });
  } catch (err) {
    console.error('[MERMAID] Mermaid rendering error:', err);
    console.error('[MERMAID] Error details:', JSON.stringify(err, null, 2));
  }
}

// Process UML sequence diagrams
function processUMLSequenceDiagrams(container: HTMLElement) {
  if (!window.Diagram) {
    return;
  }

  // Find unprocessed UML sequence diagram blocks
  const umlBlocks = container.querySelectorAll('code.language-uml-sequence-diagram:not([data-uml-processed])');
  
  for (const block of Array.from(umlBlocks)) {
    const pre = block.parentElement;
    if (!pre || pre.tagName !== 'PRE') {
      continue;
    }
    
    // Get the diagram code
    const code = block.textContent || '';
    
    // Create a container for the diagram
    const diagramDiv = document.createElement('div');
    diagramDiv.className = 'uml-sequence-diagram';
    
    // Replace the code block with the diagram container
  pre.replaceWith(diagramDiv);
    (block as HTMLElement).setAttribute('data-uml-processed', 'true');    // Render the diagram
    try {
      const diagram = window.Diagram.parse(code);
      diagram.drawSVG(diagramDiv, { theme: 'simple' });
    } catch (err) {
      console.error('[UML] UML sequence diagram rendering error:', err);
      console.error('[UML] Error details:', JSON.stringify(err, null, 2));
      diagramDiv.textContent = 'Error rendering diagram: ' + (err as Error).message;
    }
  }
}

function initializeEditor() {
  const container = document.getElementById('editor-container');
  if (!container) {
    return;
  }
  if (cmView) {
    refreshEditorFromTab();
    return;
  }
  
  // Custom theme following CodeMirror styling best practices
  const customTheme = EditorView.theme({
    "&": {
      height: "100%",
      backgroundColor: "#1e1e1e",
      fontSize: "14px",
      color: "#d4d4d4"
    },
    "&.cm-focused": {
      outline: "none"
    },
    ".cm-scroller": {
      overflow: "auto"
    },
    ".cm-content": {
      padding: "12px"
    },
    ".cm-line": {
      padding: "0",
      lineHeight: "1.6"
    },
    ".cm-gutters": {
      backgroundColor: "#1e1e1e",
      color: "#858585",
      border: "none"
    },
    ".cm-activeLineGutter": {
      backgroundColor: "#2d2d30"
    }
  });
  
  const initialDoc = activeTabIndex >= 0 ? tabs[activeTabIndex].content : '';
  const onUpdate = EditorView.updateListener.of(v => {
    if (v.docChanged && activeTabIndex >= 0 && isEditMode) {
      const tab = tabs[activeTabIndex];
      tab.content = v.state.doc.toString();
      tab.isDirty = true;
      updateTabUI();
      schedulePreviewRender();
      scheduleSessionSave();
    }
  });
  const state = EditorState.create({
    doc: initialDoc,
    extensions: [
      customTheme,
      markdown(), 
      history(), 
      search(),
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]), 
      onUpdate,
      editableCompartment.of(EditorView.editable.of(false))
    ]
  });
  cmView = new EditorView({ state, parent: container });
  
  // Immediately reset scroll position to prevent blank space at top
  try {
    cmView.scrollDOM.scrollTop = 0;
  } catch {}
  
  // Force CodeMirror to recalculate layout after insertion into DOM
  requestAnimationFrame(() => {
    try {
      if (cmView) {
        // Trigger a measure/layout pass
        cmView.requestMeasure();
        // Reset scroll again after measure
        cmView.scrollDOM.scrollTop = 0;
        cmView.scrollDOM.scrollLeft = 0;
        // Force viewport to start at line 0
        cmView.dispatch({
          effects: EditorView.scrollIntoView(0, { y: "start", yMargin: 0 })
        });
      }
    } catch (e) {
      // Layout measure failed, continue
    }
  });
}

function refreshEditorFromTab(skipContentUpdate = false) {
  if (!cmView) return;
  const tab = tabs[activeTabIndex];
  if (!tab) {
    cmView.dispatch({ changes: { from: 0, to: cmView.state.doc.length, insert: '' } });
    return;
  }
  if (!skipContentUpdate) {
    const current = cmView.state.doc.toString();
    if (current !== tab.content) {
      cmView.dispatch({ changes: { from: 0, to: cmView.state.doc.length, insert: tab.content } });
    }
    // Reset scroll to top when loading a new tab's content to prevent large blank offset
    try { cmView.scrollDOM.scrollTop = 0; } catch {}
  }
  // Update editable state based on isEditMode
  cmView.dispatch({
    effects: editableCompartment.reconfigure(EditorView.editable.of(isEditMode))
  });
  cmView.dom.classList.toggle('cm-readonly', !isEditMode);
}

// Ensure editor focuses after async rendering/layout settles
function focusEditorDeferred() {
  if (!cmView || !isEditMode) return;
  try { cmView.focus(); } catch {}
  setTimeout(() => { try { cmView?.focus(); } catch {} }, 0);
  requestAnimationFrame(() => { try { cmView?.focus(); } catch {} });
}

// Enforce editable state if it was lost (diagnostic + recovery)
function enforceEditable() {
  if (!cmView) return;
  const current = cmView.state.facet(EditorView.editable);
  // Always reassert compartment to current desired mode
  cmView.dispatch({ effects: editableCompartment.reconfigure(EditorView.editable.of(isEditMode)) });
  cmView.dom.classList.toggle('cm-readonly', !isEditMode);
  if (isEditMode && !current) {
    // Small doc no-op change can sometimes wake CM after facet flip
    cmView.dispatch({ changes: [] });
  }
  // Ensure editor pane is visible when edit mode is enabled
  if (isEditMode) {
    const editorPane = document.getElementById('editor-pane');
    const splitter = document.getElementById('splitter');
    if (editorPane && splitter) {
      editorPane.style.display = 'flex';
      splitter.style.display = 'block';
    }
  }
}

function setEditMode(enabled: boolean) {
  const splitContainer = document.getElementById('split-container');
  const editorPane = document.getElementById('editor-pane');
  const splitter = document.getElementById('splitter');
  if (!splitContainer || !editorPane || !splitter) {
    return;
  }

  isEditMode = enabled;
  splitContainer.classList.toggle('split-view', enabled);
  splitContainer.classList.toggle('view-only', !enabled);

  if (enabled) {
    // Make pane visible before creating CodeMirror so measurements are correct
    editorPane.style.display = 'flex';
    splitter.style.display = 'block';
    if (!cmView) {
      initializeEditor();
    }
  } else {
    editorPane.style.display = 'none';
    splitter.style.display = 'none';
  }
  editToggleButton?.classList.toggle('active', enabled);

  if (cmView) {
    refreshEditorFromTab();
    // Force a re-measure & reset scroll after layout changes
    requestAnimationFrame(() => {
      try { if (cmView) cmView.scrollDOM.scrollTop = 0; } catch {}
    });
  }
}

function handleEditorInput() {
  // CodeMirror handles updates via updateListener
}

function schedulePreviewRender() {
  if (renderDebounceHandle) {
    window.clearTimeout(renderDebounceHandle);
  }
  renderDebounceHandle = window.setTimeout(() => {
    renderDebounceHandle = null;
    if (activeTabIndex >= 0) {
      renderTab(activeTabIndex, { skipEditorUpdate: true }).catch(error => {
        console.error('[EDITOR] Failed to re-render preview:', error);
      });
    }
  }, RENDER_DEBOUNCE_MS);
}
function scheduleSessionSave() {
  if (sessionSaveHandle) {
    window.clearTimeout(sessionSaveHandle);
  }
  const indicator = document.getElementById('status-indicator');
  if (indicator) {
    indicator.textContent = 'Saving…';
    indicator.className = 'saving';
  }
  sessionSaveHandle = window.setTimeout(() => {
    sessionSaveHandle = null;
    saveSession();
    showStatus('Session saved', 'success');
  }, SESSION_SAVE_DEBOUNCE_MS);
}

// Note: Math extraction/restoration functions removed - markdown-it-texmath handles this now

interface RenderOptions {
  skipEditorUpdate?: boolean;
}

async function renderTab(index: number, options: RenderOptions = {}) {
  activeTabIndex = index;
  const tab = tabs[index];
  
  if (!tab) return;

  const contentDiv = document.getElementById('markdown-content')!;
  const emptyState = document.querySelector('.empty-state') as HTMLElement;
  
  // Process markdown with markdown-it (no manual math extraction needed!)
  let html = md.render(tab.content);
  
  // SAFE image path rewriting using DOM (preserve absolute, file://, UNC, drive-letter paths)
  if (tab.filePath) {
    try {
      const pathParts = tab.filePath.split(/[/\\]/);
      pathParts.pop();
      const baseDir = pathParts.join('/');
      const temp = document.createElement('div');
      temp.innerHTML = html;
      const imgs = Array.from(temp.querySelectorAll('img')) as HTMLImageElement[];
      imgs.forEach(img => {
        const originalSrc = img.getAttribute('src') || '';
        if (!originalSrc) return;
        if (/^(https?:|data:|printdown:|file:\/\/)/i.test(originalSrc)) return; // already absolute/protocol
        if (/^\\\\/.test(originalSrc)) return; // UNC path
        if (/^[A-Za-z]:[\\/]/.test(originalSrc)) return; // Windows absolute
        if (originalSrc.startsWith('/')) return; // Unix absolute
        let cleaned = originalSrc.replace(/^\.\//, '').replace(/^\.\\/, '');
        const joined = `${baseDir}/${cleaned}`;
        const normalized = joined.replace(/\\/g, '/').replace(/\/+/g, '/');
        const pathWithLeadingSlash = normalized.startsWith('/') ? normalized : `/${normalized}`;
        const protocolUrl = `printdown://${pathWithLeadingSlash}`;
        img.setAttribute('src', protocolUrl);
        img.setAttribute('data-original-src', originalSrc);
        img.setAttribute('onerror', "console.error('[IMAGE] Failed to load:', this.src);");
      });
      html = temp.innerHTML;
    } catch (err) {
      console.error('[IMAGE] DOM rewrite error:', err);
    }
  }
  
  // Set the HTML
  contentDiv.innerHTML = html;
  // Enhance images with per-image resizing controls before further processing
  setupResizableImages(contentDiv);
  
  // No-op delay previously used for protocol tests has been removed
  contentDiv.style.display = 'block';
  emptyState.style.display = 'none';

  // Process diagrams and math on every render (tabs rebuild the DOM each time)
    // Process Mermaid diagrams first
    await processMermaidDiagrams(contentDiv);
    setupResizableMermaidDiagrams(contentDiv);

    // Process UML sequence diagrams
    processUMLSequenceDiagrams(contentDiv);

    // Typeset math with MathJax
    if (window.MathJax && window.MathJax.typesetPromise) {
      try {
        await window.MathJax.typesetPromise([contentDiv]);        // Give MathJax a bit more time to complete DOM updates
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (err) {
        console.error('[MATHJAX] MathJax typeset error:', err);
        console.error('[MATHJAX] Error details:', JSON.stringify(err, null, 2));
      }
    }
    
  
  
  // Apply current theme
  const themeSelect = document.getElementById('theme-select') as HTMLSelectElement;
  if (themeSelect) {
    applyTheme(themeSelect.value as keyof typeof themes);
  }

  updateTabUI();
  if (!options.skipEditorUpdate) {
    scheduleSessionSave();
  }
  refreshEditorFromTab(options.skipEditorUpdate);
  
  // Generate and update TOC for the active tab
  generateTOC();
}

// Function to wait for all content rendering to complete
// This ensures MathJax, Mermaid, and UML diagrams are fully rendered
async function waitForRenderingComplete(): Promise<void> {
  // Wait for MathJax rendering
  if (window.MathJax && window.MathJax.typesetPromise) {
    try {
      await window.MathJax.typesetPromise();
    } catch (err) {
      // MathJax error handled elsewhere
    }
  }
  
  // Wait for Mermaid diagrams (if any are pending)
  if (window.mermaid) {
    try {
      const mermaidElements = document.querySelectorAll('.mermaid-diagram');
      if (mermaidElements.length > 0) {
        await window.mermaid.run({ querySelector: '.mermaid-diagram' });
      }
    } catch (err) {
      // Mermaid error handled elsewhere
    }
  }
  
  // Wait for UML sequence diagrams to settle
  // These use Raphael.js which is synchronous, but give them a moment
  const umlElements = document.querySelectorAll('.sequence-diagram');
  if (umlElements.length > 0) {
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  // Wait one more frame for any final DOM updates
  await new Promise(resolve => requestAnimationFrame(resolve));
}

// Expose function globally for PDF export
(window as any).waitForRenderingComplete = waitForRenderingComplete;
(window as any).renderTab = renderTab;
(window as any).activeTabIndex = () => activeTabIndex;

// Generate Table of Contents from headings
function generateTOC() {
  const contentDiv = document.getElementById('markdown-content');
  const tocContent = document.getElementById('toc-content');
  
  if (!contentDiv || !tocContent || activeTabIndex < 0) {
    showEmptyTOC();
    return;
  }

  const tab = tabs[activeTabIndex];
  if (!tab) {
    showEmptyTOC();
    return;
  }

  // Find all headings in the rendered content
  const headings = contentDiv.querySelectorAll('h1, h2, h3, h4, h5, h6');
  
  if (headings.length === 0) {
    showEmptyTOC();
    return;
  }

  // Generate TOC items
  const tocItems: TOCItem[] = [];
  headings.forEach((heading, index) => {
    const level = parseInt(heading.tagName.charAt(1)); // Extract number from h1, h2, etc.
    const text = heading.textContent?.trim() || `Heading ${index + 1}`;
    const id = `toc-heading-${index}`;
    
    // Add ID to heading for navigation
    heading.id = id;
    
    tocItems.push({
      id,
      text,
      level,
      element: heading as HTMLElement
    });
  });

  // Store TOC items in tab
  tab.tocItems = tocItems;

  // Render TOC
  renderTOC(tocItems);
}

// Render TOC items in sidebar
function renderTOC(tocItems: TOCItem[]) {
  const tocContent = document.getElementById('toc-content');
  if (!tocContent) return;

  // Clear existing content
  tocContent.innerHTML = '';

  // Create TOC items
  tocItems.forEach(item => {
    const tocItem = document.createElement('div');
    tocItem.className = `toc-item level-${item.level}`;
    tocItem.textContent = item.text;
    tocItem.title = item.text;
    
    // Add click handler for smooth scrolling
    tocItem.addEventListener('click', () => {
      scrollToHeading(item.id);
      setActiveTOCItem(item.id);
    });
    
    tocContent.appendChild(tocItem);
  });
}

// Show empty TOC state
function showEmptyTOC() {
  const tocContent = document.getElementById('toc-content');
  if (!tocContent) return;
  
  tocContent.innerHTML = '<div class="toc-empty">No headings found</div>';
}

// Scroll to heading with smooth animation
function scrollToHeading(headingId: string) {
  const heading = document.getElementById(headingId);
  const contentDiv = document.getElementById('content');
  
  if (!heading || !contentDiv) return;
  
  // Calculate position relative to content div
  const headingRect = heading.getBoundingClientRect();
  const contentRect = contentDiv.getBoundingClientRect();
  const offset = headingRect.top - contentRect.top + contentDiv.scrollTop - 20; // 20px padding
  
  contentDiv.scrollTo({
    top: offset,
    behavior: 'smooth'
  });
}

// Set active TOC item
function setActiveTOCItem(activeId: string) {
  const tocItems = document.querySelectorAll('.toc-item');
  tocItems.forEach((item, index) => {
    item.classList.remove('active');
    if (tabs[activeTabIndex]?.tocItems?.[index]?.id === activeId) {
      item.classList.add('active');
    }
  });
}

// Toggle TOC sidebar
function toggleTOC() {
  const sidebar = document.getElementById('toc-sidebar');
  if (!sidebar) {
    console.error('[TOC] Sidebar element not found!');
    return;
  }
  
  sidebar.classList.toggle('open');
  
  // Save TOC state
  const isOpen = sidebar.classList.contains('open');
  localStorage.setItem('tocOpen', isOpen.toString());
}

// Initialize TOC toggle handlers
function initializeTOC() {
  const tocToggle = document.getElementById('toc-toggle');
  const tocClose = document.getElementById('toc-close');
  const tocSidebar = document.getElementById('toc-sidebar');
  
  if (tocToggle) {
    // Check if we already have a click handler by checking for a data attribute
    if (tocToggle.hasAttribute('data-toc-initialized')) {
      return;
    }
    
    // Single click event listener with a more specific handler
    const clickHandler = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      toggleTOC();
    };
    
    tocToggle.addEventListener('click', clickHandler);
    // Mark as initialized
    tocToggle.setAttribute('data-toc-initialized', 'true');
  } else {
    console.error('[TOC] Toggle button not found!');
  }
  
  if (tocClose) {
    tocClose.addEventListener('click', () => {
      if (tocSidebar) {
        tocSidebar.classList.remove('open');
        localStorage.setItem('tocOpen', 'false');
      }
    });
  }
  
  // Restore TOC state
  const savedTOCState = localStorage.getItem('tocOpen');
  if (savedTOCState === 'true' && tocSidebar) {
    tocSidebar.classList.add('open');
  }
  
  // Auto-update active TOC item on scroll
  const contentDiv = document.getElementById('content');
  if (contentDiv) {
    let scrollTimeout: number;
    contentDiv.addEventListener('scroll', () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = window.setTimeout(() => {
        updateActiveTOCOnScroll();
      }, 150); // Debounce scroll events
    });
  }
}

// Update active TOC item based on scroll position
function updateActiveTOCOnScroll() {
  if (activeTabIndex < 0 || !tabs[activeTabIndex]?.tocItems) return;
  
  const contentDiv = document.getElementById('content');
  if (!contentDiv) return;
  
  const tocItems = tabs[activeTabIndex].tocItems!;
  const contentRect = contentDiv.getBoundingClientRect();
  let closestItem: TOCItem | null = null;
  let closestDistance = Infinity;
  
  // Find the heading that's closest to the top of the viewport
  for (const item of tocItems) {
    if (!item.element) continue;
    
    const headingRect = item.element.getBoundingClientRect();
    const distance = Math.abs(headingRect.top - contentRect.top);
    
    if (distance < closestDistance && headingRect.top <= contentRect.top + 100) {
      closestDistance = distance;
      closestItem = item;
    }
  }
  
  if (closestItem) {
    setActiveTOCItem(closestItem.id);
  }
}

// Add per-image resizing with aspect ratio preserved, persisted by src
function setupResizableImages(container: HTMLElement) {
  const imgs = Array.from(container.querySelectorAll('img')) as HTMLImageElement[];
  imgs.forEach((img) => {
    // Skip if already wrapped
    if (img.parentElement && img.parentElement.classList.contains('resizable-image')) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'resizable-image';

    // Create unique key based on src
    const sizeKey = `imageSize:${img.src}`;
    const posKey = `imagePos:${img.src}`;

    // Determine initial width percent (saved or image natural percent)
    const containerEl = container as HTMLElement;
    const containerWidth = containerEl.clientWidth || 1;

    // Use saved percent if available
    const savedSize = localStorage.getItem(sizeKey);
    let percent = savedSize ? parseFloat(savedSize) : Math.min(100, Math.round((img.clientWidth / containerWidth) * 100));
    if (!isFinite(percent) || percent <= 0) percent = 100;

    // Use saved position if available
    const savedPos = localStorage.getItem(posKey);
    let position = savedPos || 'center'; // 'left', 'center', 'right'

    // Move the image into wrapper
    img.replaceWith(wrapper);
    wrapper.appendChild(img);
    wrapper.style.width = `${percent}%`;
    
    // Apply horizontal position
    if (position === 'left') {
      wrapper.style.marginLeft = '0';
      wrapper.style.marginRight = 'auto';
    } else if (position === 'right') {
      wrapper.style.marginLeft = 'auto';
      wrapper.style.marginRight = '0';
    } else {
      wrapper.style.marginLeft = 'auto';
      wrapper.style.marginRight = 'auto';
    }
    
    (wrapper as any)._imgSizeKey = sizeKey;
    (wrapper as any)._imgPosKey = posKey;
    (wrapper as any)._position = position;

    // Add drag handle for positioning
    const dragHandle = document.createElement('div');
    dragHandle.className = 'drag-handle';
    dragHandle.innerHTML = '⋮⋮';
    dragHandle.title = 'Drag to reposition horizontally (Left/Center/Right)';
    wrapper.appendChild(dragHandle);

    // Add resize handle
    const handle = document.createElement('div');
    handle.className = 'resize-handle';
    wrapper.appendChild(handle);

    let isResizing = false;
    let isDragging = false;
    let startX = 0;
    let startWidthPx = 0;

    const onMouseMove = (e: MouseEvent) => {
      if (isResizing) {
        const dx = e.clientX - startX;
        const newWidthPx = Math.max(50, startWidthPx + dx);
        const parentWidth = containerEl.clientWidth || 1;
        let newPercent = (newWidthPx / parentWidth) * 100;
        newPercent = Math.max(20, Math.min(150, newPercent)); // 20%–150%
        wrapper.style.width = `${newPercent}%`;
      } else if (isDragging) {
        const containerRect = containerEl.getBoundingClientRect();
        const mousePercent = ((e.clientX - containerRect.left) / containerRect.width) * 100;
        
        // Determine position based on mouse location percentage
        if (mousePercent < 33) {
          wrapper.style.marginLeft = '0';
          wrapper.style.marginRight = 'auto';
          (wrapper as any)._position = 'left';
        } else if (mousePercent > 66) {
          wrapper.style.marginLeft = 'auto';
          wrapper.style.marginRight = '0';
          (wrapper as any)._position = 'right';
        } else {
          wrapper.style.marginLeft = 'auto';
          wrapper.style.marginRight = 'auto';
          (wrapper as any)._position = 'center';
        }
      }
    };
    
    const onMouseUp = () => {
      if (isResizing) {
        isResizing = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        // Persist size
        const parentWidth = containerEl.clientWidth || 1;
        const widthPx = wrapper.getBoundingClientRect().width;
        const savePercent = Math.max(1, Math.min(500, (widthPx / parentWidth) * 100));
        localStorage.setItem(sizeKey, savePercent.toFixed(2));
      } else if (isDragging) {
        isDragging = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        wrapper.style.cursor = 'default';
        // Persist position
        localStorage.setItem(posKey, (wrapper as any)._position);
      }
    };

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      isResizing = true;
      startX = e.clientX;
      startWidthPx = wrapper.getBoundingClientRect().width;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });

    dragHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      isDragging = true;
      startX = e.clientX;
      wrapper.style.cursor = 'move';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });

    // Double-click to reset both size and position
    wrapper.addEventListener('dblclick', () => {
      wrapper.style.width = '100%';
      wrapper.style.marginLeft = 'auto';
      wrapper.style.marginRight = 'auto';
      (wrapper as any)._position = 'center';
      localStorage.removeItem(sizeKey);
      localStorage.removeItem(posKey);
    });
  });
}

function setupResizableMermaidDiagrams(container: HTMLElement) {
  const diagrams = Array.from(container.querySelectorAll('.mermaid-diagram')) as HTMLElement[];
  diagrams.forEach((diagram) => {
    // Skip if already wrapped
    if (diagram.parentElement && diagram.parentElement.classList.contains('resizable-mermaid')) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'resizable-mermaid';

    // Create unique key based on diagram id
    const sizeKey = `mermaidSize:${diagram.id || 'default'}`;
    const posKey = `mermaidPos:${diagram.id || 'default'}`;

    // Determine initial width percent (saved or default 100%)
    const containerEl = container as HTMLElement;
    const containerWidth = containerEl.clientWidth || 1;

    // Use saved percent if available
    const savedSize = localStorage.getItem(sizeKey);
    let percent = savedSize ? parseFloat(savedSize) : 100;
    if (!isFinite(percent) || percent <= 0) percent = 100;

    // Use saved position if available
    const savedPos = localStorage.getItem(posKey);
    let position = savedPos || 'center'; // 'left', 'center', 'right'

    // Move the diagram into wrapper
    diagram.replaceWith(wrapper);
    wrapper.appendChild(diagram);
    wrapper.style.width = `${percent}%`;
    
    // Apply horizontal position
    if (position === 'left') {
      wrapper.style.marginLeft = '0';
      wrapper.style.marginRight = 'auto';
    } else if (position === 'right') {
      wrapper.style.marginLeft = 'auto';
      wrapper.style.marginRight = '0';
    } else {
      wrapper.style.marginLeft = 'auto';
      wrapper.style.marginRight = 'auto';
    }
    
    (wrapper as any)._diagramSizeKey = sizeKey;
    (wrapper as any)._diagramPosKey = posKey;
    (wrapper as any)._position = position;

    // Add drag handle for positioning
    const dragHandle = document.createElement('div');
    dragHandle.className = 'drag-handle';
    dragHandle.innerHTML = '⋮⋮';
    dragHandle.title = 'Drag to reposition horizontally (Left/Center/Right)';
    wrapper.appendChild(dragHandle);

    // Add resize handle
    const handle = document.createElement('div');
    handle.className = 'resize-handle';
    wrapper.appendChild(handle);

    let isResizing = false;
    let isDragging = false;
    let startX = 0;
    let startWidthPx = 0;

    const onMouseMove = (e: MouseEvent) => {
      if (isResizing) {
        const dx = e.clientX - startX;
        const newWidthPx = Math.max(50, startWidthPx + dx);
        const parentWidth = containerEl.clientWidth || 1;
        let newPercent = (newWidthPx / parentWidth) * 100;
        newPercent = Math.max(20, Math.min(150, newPercent)); // 20%–150%
        wrapper.style.width = `${newPercent}%`;
      } else if (isDragging) {
        const containerRect = containerEl.getBoundingClientRect();
        const mousePercent = ((e.clientX - containerRect.left) / containerRect.width) * 100;
        
        // Determine position based on mouse location percentage
        if (mousePercent < 33) {
          wrapper.style.marginLeft = '0';
          wrapper.style.marginRight = 'auto';
          (wrapper as any)._position = 'left';
        } else if (mousePercent > 66) {
          wrapper.style.marginLeft = 'auto';
          wrapper.style.marginRight = '0';
          (wrapper as any)._position = 'right';
        } else {
          wrapper.style.marginLeft = 'auto';
          wrapper.style.marginRight = 'auto';
          (wrapper as any)._position = 'center';
        }
      }
    };
    
    const onMouseUp = () => {
      if (isResizing) {
        isResizing = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        // Persist size
        const parentWidth = containerEl.clientWidth || 1;
        const widthPx = wrapper.getBoundingClientRect().width;
        const savePercent = Math.max(1, Math.min(500, (widthPx / parentWidth) * 100));
        localStorage.setItem(sizeKey, savePercent.toFixed(2));
      } else if (isDragging) {
        isDragging = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        wrapper.style.cursor = 'default';
        // Persist position
        localStorage.setItem(posKey, (wrapper as any)._position);
      }
    };

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      isResizing = true;
      startX = e.clientX;
      startWidthPx = wrapper.getBoundingClientRect().width;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });

    dragHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      isDragging = true;
      startX = e.clientX;
      wrapper.style.cursor = 'move';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });

    // Double-click to reset both size and position
    wrapper.addEventListener('dblclick', () => {
      wrapper.style.width = '100%';
      wrapper.style.marginLeft = 'auto';
      wrapper.style.marginRight = 'auto';
      (wrapper as any)._position = 'center';
      localStorage.removeItem(sizeKey);
      localStorage.removeItem(posKey);
    });
  });
}

function updateTabUI() {
  const tabsContainer = document.getElementById('tabs')!;
  tabsContainer.innerHTML = '';

  tabs.forEach((tab, index) => {
    const tabEl = document.createElement('div');
    tabEl.className = 'tab' + (index === activeTabIndex ? ' active' : '');
    const dirtyMark = tab.isDirty ? '*' : '';
    tabEl.innerHTML = `
      <span>${tab.title}${dirtyMark}</span>
      <span class="tab-close" data-index="${index}">✕</span>
    `;
    
    tabEl.addEventListener('click', (e) => {
      if (!(e.target as HTMLElement).classList.contains('tab-close')) {
        renderTab(index);
      }
    });

    const closeBtn = tabEl.querySelector('.tab-close');
    closeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      closeTab(index);
    });

    // Context menu (right click) on tab
    tabEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const menu = document.getElementById('tab-context-menu') as HTMLDivElement | null;
      if (!menu) return;
      menu.style.display = 'block';
      menu.style.left = `${e.clientX}px`;
      menu.style.top = `${e.clientY}px`;
      (menu as any)._tabIndex = index;
    });

    tabsContainer.appendChild(tabEl);
  });

  // Dismiss context menu on click elsewhere
  document.addEventListener('click', () => {
    const menu = document.getElementById('tab-context-menu') as HTMLDivElement | null;
    if (menu) menu.style.display = 'none';
  });

  // Wire context menu actions once
  const menu = document.getElementById('tab-context-menu') as HTMLDivElement | null;
  if (menu && !(menu as any)._wired) {
    menu.addEventListener('click', (ev) => {
      const target = ev.target as HTMLElement;
      const action = target.getAttribute('data-action');
      const idx = (menu as any)._tabIndex as number | undefined;
      menu.style.display = 'none';
      if (action === 'close' && idx !== undefined) {
        closeTab(idx);
      } else if (action === 'close-others' && idx !== undefined) {
        closeOthers(idx);
      } else if (action === 'close-all') {
        closeAllTabs();
      }
    });
    (menu as any)._wired = true;
  }
}

function closeTab(index: number) {
  const closingTab = tabs[index];
  
  // Stop watching the file
  if (closingTab?.filePath) {
    window.fileWatch.unwatchFile(closingTab.filePath);
  }
  
  tabs.splice(index, 1);
  
  if (tabs.length === 0) {
    activeTabIndex = -1;
    const contentDiv = document.getElementById('markdown-content')!;
    const emptyState = document.querySelector('.empty-state') as HTMLElement;
    contentDiv.style.display = 'none';
    emptyState.style.display = 'flex';
    // Clear TOC when no documents are open
    const tocContent = document.getElementById('toc-content');
    if (tocContent) {
      tocContent.innerHTML = '<div class="toc-empty">No document open</div>';
    }
  } else if (index === activeTabIndex) {
    renderTab(Math.min(index, tabs.length - 1));
  } else if (index < activeTabIndex) {
    activeTabIndex--;
    // Regenerate TOC for newly shifted active tab
    generateTOC();
  }
  
  updateTabUI();
  saveSession();
  refreshEditorFromTab();
}

function closeAllTabs() {
  // Stop watching all files
  tabs.forEach(tab => {
    if (tab.filePath) {
      window.fileWatch.unwatchFile(tab.filePath);
    }
  });
  
  tabs.splice(0, tabs.length);
  activeTabIndex = -1;
  const contentDiv = document.getElementById('markdown-content')!;
  const emptyState = document.querySelector('.empty-state') as HTMLElement;
  contentDiv.style.display = 'none';
  emptyState.style.display = 'flex';
  // Clear TOC fully
  const tocContent = document.getElementById('toc-content');
  if (tocContent) {
    tocContent.innerHTML = '<div class="toc-empty">No document open</div>';
  }
  updateTabUI();
  saveSession(); // This will save an empty session, preventing unwanted restoration
  refreshEditorFromTab();
}

function closeOthers(index: number) {
  const keep = tabs[index];
  if (!keep) return;
  tabs.splice(0, tabs.length, keep);
  activeTabIndex = 0;
  renderTab(0);
  updateTabUI();
  saveSession();
}

async function openFile() {
  try {
    const filePaths = await window.filePicker.pickFile();
    
    if (filePaths && filePaths.length > 0) {
      const filePath = filePaths[0];
      const existingIndex = tabs.findIndex(t => t.filePath === filePath);
      
      if (existingIndex >= 0) {
        renderTab(existingIndex);
        return;
      }

      // Read file content
      const fileResult = await window.fileSystem.readFile(filePath);
      if (!fileResult.success) {
        console.error('Error reading file:', fileResult.error);
        return;
      }

      // Get file modification time
      const statsResult = await window.fileWatch.getFileStats(filePath);
      const lastModified = statsResult.success ? statsResult.mtime : Date.now();

      tabs.push({
        filePath: filePath,
        content: fileResult.content!,
        title: filePath.split(/[/\\]/).pop() || 'Untitled',
        lastModified: lastModified
      });

      // Start watching the file
      window.fileWatch.watchFile(filePath);

      renderTab(tabs.length - 1);
    }
  } catch (error) {
    console.error('Error opening file:', error);
  }
}

// Open a specific file path (used by drag-and-drop)
async function openFilePath(filePath: string) {
  try {
    const existingIndex = tabs.findIndex(t => t.filePath === filePath);
    if (existingIndex >= 0) {
      renderTab(existingIndex);
      return;
    }

    const fileResult = await window.fileSystem.readFile(filePath);
    if (!fileResult.success) {
      console.error('Error reading dropped file:', fileResult.error);
      showStatus('Open failed', 'error');
      return;
    }

    const statsResult = await window.fileWatch.getFileStats(filePath);
    const lastModified = statsResult.success ? statsResult.mtime : Date.now();

    tabs.push({
      filePath,
      content: fileResult.content!,
      title: filePath.split(/[/\\]/).pop() || 'Untitled',
      lastModified
    });

    window.fileWatch.watchFile(filePath);
    renderTab(tabs.length - 1);
  } catch (error) {
    console.error('Error opening dropped file:', error);
    showStatus('Open error', 'error');
  }
}

function saveSession() {
  window.session.save({
    openFiles: tabs.map(t => t.filePath),
     activeIndex: activeTabIndex,
     theme: currentThemeName,
     fontSizeFactor: fontSizeFactor
  });
}

async function saveActiveTab() {
  if (activeTabIndex < 0) {
    return;
  }

  const tab = tabs[activeTabIndex];
  if (!tab?.filePath) {
    return;
  }

  try {
    const result = await window.fileSystem.writeFile(tab.filePath, tab.content);
    if (!result.success) {
      console.error('[SAVE] Failed to write file:', result.error || 'Unknown error');
      showStatus('Save failed', 'error');
    } else {
      tab.isDirty = false;
      
      // Update last modified time after save
      const statsResult = await window.fileWatch.getFileStats(tab.filePath);
      if (statsResult.success) {
        tab.lastModified = statsResult.mtime;
      }
      
      updateTabUI();
      showStatus('Saved', 'success');
    }
  } catch (error) {
    console.error('[SAVE] Unexpected error while saving file:', error);
    showStatus('Save error', 'error');
  }
}
function showStatus(message: string, type: 'success' | 'error' | 'saving') {
  const indicator = document.getElementById('status-indicator');
  if (!indicator) return;
  indicator.textContent = message;
  indicator.className = type;
  if (type !== 'saving') {
    setTimeout(() => {
      if (indicator.textContent === message) {
        indicator.textContent = '';
        indicator.className = '';
      }
    }, 2500);
  }
}

async function exportPDF() {
  if (activeTabIndex >= 0) {
    const tab = tabs[activeTabIndex];
    
    // Use the currently active theme
    const currentTheme = themes[currentThemeName];
    
    const savePath = await window.printExport.exportPDF(tab.filePath, currentTheme);
    
    if (savePath) {
      // PDF saved successfully
      console.log('PDF saved to:', savePath);
    }
  }
}

// Store console logs for debug copying with tab information
interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  tabIndex: number | null;
}
const consoleLogs: LogEntry[] = [];
const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error,
  info: console.info
};

// Helper function to get current tab index
function getCurrentTabIndex(): number | null {
  return activeTabIndex >= 0 ? activeTabIndex : null;
}

// Override console methods to capture logs with tab information
console.log = (...args: any[]) => {
  const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  consoleLogs.push({
    timestamp: new Date().toISOString(),
    level: 'LOG',
    message,
    tabIndex: getCurrentTabIndex()
  });
  originalConsole.log(...args);
};

console.warn = (...args: any[]) => {
  const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  consoleLogs.push({
    timestamp: new Date().toISOString(),
    level: 'WARN',
    message,
    tabIndex: getCurrentTabIndex()
  });
  originalConsole.warn(...args);
};

console.error = (...args: any[]) => {
  const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  consoleLogs.push({
    timestamp: new Date().toISOString(),
    level: 'ERROR',
    message,
    tabIndex: getCurrentTabIndex()
  });
  originalConsole.error(...args);
};

console.info = (...args: any[]) => {
  const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  consoleLogs.push({
    timestamp: new Date().toISOString(),
    level: 'INFO',
    message,
    tabIndex: getCurrentTabIndex()
  });
  originalConsole.info(...args);
};

async function copyDebugLogs() {
  // Get app version
  const appVersion = await window.appVersion();
  
  // Filter logs for the active tab only
  const activeTabLogs = activeTabIndex >= 0 
    ? consoleLogs.filter(log => log.tabIndex === activeTabIndex || log.tabIndex === null)
    : consoleLogs;
  
  // Format logs as strings
  const formattedLogs = activeTabLogs.slice(-500).map(log => {
    const tabInfo = log.tabIndex !== null ? `[Tab ${log.tabIndex}]` : '[Global]';
    return `[${log.level}] ${log.timestamp} ${tabInfo} ${log.message}`;
  });
  
  const debugInfo = [
    '=== PrintDown Debug Logs ===',
   
   
    `Generated: ${new Date().toISOString()}`,
    `App Version: ${appVersion}`,
    '',
    'Environment:',
    `User Agent: ${navigator.userAgent}`,
    `Platform: ${navigator.platform}`,
    '',
    'Active Tab:',
    activeTabIndex >= 0 
      ? `Index: ${activeTabIndex}, File: ${tabs[activeTabIndex]?.filePath || 'N/A'}` 
      : 'No active tab',
    '',
    'MathJax Info:',
             `Available: ${window.MathJax ? 'Yes' : 'No'}`,
    `Version: ${window.MathJax?.version || 'N/A'}`,
    '',
    'Mermaid Info:',
    `Available: ${window.mermaid ? 'Yes' : 'No'}`,
    `Version: ${window.mermaid?.version || 'N/A'}`,
    '',
    'UML Info:',
    `Available: ${window.Diagram ? 'Yes' : 'No'}`,
    '',
    'Console Logs (Active Tab Only):',
    '---',
    ...formattedLogs,
    '---',
    '',
    `Logs for this tab: ${activeTabLogs.length}`,
    `Total logs captured: ${consoleLogs.length}`
  ].join('\n');
  
  await window.clipboard.writeText(debugInfo);
  console.log(`[DEBUG] Debug logs copied to clipboard (App v${appVersion}, Tab ${activeTabIndex >= 0 ? activeTabIndex : 'N/A'})`);
}

// Log app version on startup
window.appVersion().then(version => {
  console.log(`[APP] PrintDown renderer loaded, version: ${version}`);
});

// Event listeners
window.menuEvents.onMenuOpen(openFile);
window.menuEvents.onMenuExportPDF(exportPDF);
window.menuEvents.onMenuCopyDebugLogs(copyDebugLogs);
window.menuEvents.onMenuSave(async () => {
  await saveActiveTab();
});

// Font size menu events
window.menuEvents.onMenuFontIncrease(() => {
  if (fontSizeFactor < MAX_FACTOR) {
    fontSizeFactor = Math.min(MAX_FACTOR, fontSizeFactor + STEP);
    applyFontSizeFactor(fontSizeFactor);
  }
});

window.menuEvents.onMenuFontDecrease(() => {
  if (fontSizeFactor > MIN_FACTOR) {
    fontSizeFactor = Math.max(MIN_FACTOR, fontSizeFactor - STEP);
    applyFontSizeFactor(fontSizeFactor);
  }
});

window.menuEvents.onMenuFontReset(() => {
  fontSizeFactor = 1.0;
  applyFontSizeFactor(fontSizeFactor);
});

// Theme change menu event
window.menuEvents.onMenuThemeChange((_event: any, theme: string) => {
  applyTheme(theme as keyof typeof themes);
  // Update the dropdown if it exists (for consistency)
  const themeSelect = document.getElementById('theme-select') as HTMLSelectElement;
  if (themeSelect) {
    themeSelect.value = theme;
  }
});

// TOC toggle menu event
window.menuEvents.onMenuToggleTOC(() => {
  toggleTOC();
});

// Handle files opened from system (double-click on .md file)
window.menuEvents.onOpenFileFromSystem(async (_event: any, filePath: string) => {
  try {
    const fileResult = await window.fileSystem.readFile(filePath);
    if (fileResult.success && fileResult.content) {
      // Check if file is already open
      const existingIndex = tabs.findIndex(tab => tab.filePath === filePath);
      if (existingIndex !== -1) {
        // Switch to existing tab
        await renderTab(existingIndex);
        updateTabUI();
      } else {
        // Get file modification time
        const statsResult = await window.fileWatch.getFileStats(filePath);
        const lastModified = statsResult.success ? statsResult.mtime : Date.now();
        
        // Open as new tab
        tabs.push({
          filePath,
          content: fileResult.content,
          title: filePath.split(/[\\/]/).pop() || 'Untitled',
          lastModified: lastModified
        });
        
        // Start watching the file
        window.fileWatch.watchFile(filePath);
        
        await renderTab(tabs.length - 1);
        updateTabUI();
      }
    }
  } catch (error) {
    console.error('Error opening file from system:', error);
  }
});

window.menuEvents.onRestoreSession(async (_event: any, session: any) => {
  // Only restore session once and only if no tabs are currently open
  if (sessionRestored || tabs.length > 0) {
    return;
  }
  
    // Restore theme and font size from session, or use saved values, or detect system preference
    let themeToApply: keyof typeof themes;
    let fontFactorToApply: number;
  
    if (session.theme) {
      // Use theme from session
      themeToApply = session.theme as keyof typeof themes;
    } else {
      // Check localStorage, then system preference
      const savedTheme = localStorage.getItem('selectedTheme');
      if (savedTheme) {
        themeToApply = savedTheme as keyof typeof themes;
      } else {
        // Detect system theme preference
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        themeToApply = prefersDark ? 'dark' : 'light';
      }
    }
  
    if (session.fontSizeFactor !== undefined) {
      fontFactorToApply = session.fontSizeFactor;
    } else {
      fontFactorToApply = 1.0; // Default
    }
  
    // Apply theme
    currentThemeName = themeToApply;
    const isDarkTheme = ['dark', 'nord', 'dracula', 'monokai', 'terminal', 'oceanic', 'cyberpunk', 'forest'].includes(themeToApply);
    const themeConfig = themes[themeToApply];
    initMermaid(isDarkTheme, themeToApply, themeConfig);
    applyTheme(themeToApply);
  
    // Apply font size
    fontSizeFactor = fontFactorToApply;
    applyFontSizeFactor(fontSizeFactor);
  
  if (session.openFiles && session.openFiles.length > 0) {
    sessionRestored = true; // Mark as restored to prevent future restorations
    
    for (const filePath of session.openFiles) {
      try {
        const fileResult = await window.fileSystem.readFile(filePath);
        if (fileResult.success) {
          // Get file modification time
          const statsResult = await window.fileWatch.getFileStats(filePath);
          const lastModified = statsResult.success ? statsResult.mtime : Date.now();
          
          tabs.push({
            filePath,
            content: fileResult.content!,
            title: filePath.split(/[/\\]/).pop() || 'Untitled',
            lastModified: lastModified
          });
          
          // Start watching the file
          window.fileWatch.watchFile(filePath);
        }
      } catch (err) {
        console.error('Failed to restore file:', filePath);
      }
    }
    
    if (tabs.length > 0) {
      renderTab(Math.min(session.activeIndex, tabs.length - 1));
    }
  }
});

// Theme will be initialized either from session restore or after page load

// Font size management with scaling factor
let fontSizeFactor = 1.0; // Default scale factor
const MIN_FACTOR = 0.5;   // Minimum 50% of base size
const MAX_FACTOR = 2.0;   // Maximum 200% of base size
const STEP = 0.05;        // 5% change per click

function applyFontSizeFactor(factor: number) {
  fontSizeFactor = factor;
  updateContentFontSize();
  // Save to localStorage
  localStorage.setItem('fontSizeFactor', factor.toString());
}

function updateContentFontSize() {
  const mdContent = document.getElementById('markdown-content');
  if (!mdContent) return;
  mdContent.style.fontSize = getScaledFontSize(currentThemeBaseFontSize, fontSizeFactor);
}

function getScaledFontSize(baseSize: string, factor: number): string {
  const match = baseSize.trim().match(/^([\d.]+)([a-z%]+)$/i);
  if (!match) {
    const fallback = 16 * factor;
    return `${fallback}px`;
  }
  const value = parseFloat(match[1]) || 16;
  const unit = match[2];
  return `${value * factor}${unit}`;
}

// Initialize font size with saved value
const savedFactor = localStorage.getItem('fontSizeFactor');
if (savedFactor !== null) {
  fontSizeFactor = parseFloat(savedFactor);
  applyFontSizeFactor(fontSizeFactor);
} else {
  applyFontSizeFactor(fontSizeFactor);
}

// Image scaling controls
let imageScaleFactor = 1.0;
const IMG_MIN = 0.3;
const IMG_MAX = 2.0;
const IMG_STEP = 0.1;

function applyImageScaleFactor(factor: number) {
  document.documentElement.style.setProperty('--image-scale', factor.toString());
  localStorage.setItem('imageScaleFactor', factor.toString());
}

// Initialize image scaling with saved value
const savedImg = localStorage.getItem('imageScaleFactor');
if (savedImg !== null) {
  imageScaleFactor = parseFloat(savedImg);
}
applyImageScaleFactor(imageScaleFactor);

// Print/PDF styles
const style = document.createElement('style');
style.textContent = `
  @media print {
    @page {
      size: A4;
      margin: 0;  /* Let Electron handle margins */
    }
    
    * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    
    html, body { 
      height: auto !important;
      overflow: visible !important;
      margin: 0 !important;
      padding: 0 !important;
      display: block !important;
    }
    
    .main-container {
      height: auto !important;
      overflow: visible !important;
      display: block !important;
    }
    
    .header { display: none !important; }
    .tabs { display: none !important; }
    .font-size-controls { display: none !important; }
    .theme-selector { display: none !important; }
    .empty-state { display: none !important; }
    .toc-sidebar { display: none !important; width: 0 !important; min-width: 0 !important; visibility: hidden !important; }
    .toc-sidebar.open { display: none !important; width: 0 !important; min-width: 0 !important; visibility: hidden !important; }
    
    /* Hide interactive handles in print/PDF */
    .resize-handle { display: none !important; }
    .drag-handle { display: none !important; }
    .resizable-image:hover { outline: none !important; }
    .resizable-mermaid:hover { outline: none !important; }
    
    #content {
      padding: 0 !important;
      margin: 0 !important;
      height: auto !important;
      overflow: visible !important;
      max-height: none !important;
    }
    
    #markdown-content { 
      max-width: none !important;
      width: 100% !important;
      margin: 0 !important;
      padding: 20px !important;
      height: auto !important;
      overflow: visible !important;
    }
    
    /* Ensure MathJax renders properly in print/PDF */
    mjx-container { 
      page-break-inside: avoid;
      overflow: visible !important;
    }
    
    /* Better typography and page breaks for PDF */
    h1 {
      page-break-before: auto;
      page-break-after: avoid;
      break-before: auto;
      break-after: avoid;
    }
    
    h2, h3, h4, h5, h6 {
      page-break-after: avoid;
      break-after: avoid;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    
    p {
      page-break-inside: avoid;
      break-inside: avoid;
      orphans: 3;
      widows: 3;
    }
    
    li {
      page-break-inside: avoid;
      break-inside: avoid;
      orphans: 3;
      widows: 3;
    }
    
    ul, ol {
      page-break-inside: auto;
      break-inside: auto;
    }
    
    pre, code, blockquote, table {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    
    img {
      max-width: 100% !important;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    
    /* Mermaid diagrams in print/PDF */
    .mermaid-diagram {
      page-break-inside: avoid;
      break-inside: avoid;
      text-align: center;
      max-height: none !important;
      overflow: visible !important;
    }
    
    .mermaid-diagram svg {
      max-width: 100% !important;
      height: auto !important;
      width: auto !important;
    }
    
    /* UML sequence diagrams in print/PDF */
    .uml-sequence-diagram {
      page-break-inside: avoid;
      break-inside: avoid;
      text-align: center;
      max-height: none !important;
      overflow: visible !important;
    }
    
    .uml-sequence-diagram svg {
      max-width: 100% !important;
      height: auto !important;
      width: auto !important;
    }
  }
`;
document.head.appendChild(style);

// Responsive on-screen styles: scale images and diagrams to container/window
const screenStyle = document.createElement('style');
screenStyle.textContent = `
  #markdown-content img {
    max-width: calc(var(--image-scale, 1) * 100%);
    max-height: 80vh; /* keep within viewport height */
    height: auto;
    width: auto;
    display: block;
    margin: 12px auto; /* center and add breathing room */
  }

  #markdown-content .mermaid-diagram svg,
  #markdown-content .uml-sequence-diagram svg {
    max-width: 100%;
    height: auto;
  }

  /* Ensure inline math doesn't stick to neighboring text */
  #markdown-content mjx-container[display="inline"] {
    margin: 0 0.2em !important;
  }

  /* Resizable image wrapper */
  .resizable-image {
    position: relative;
    display: block;
    margin: 12px auto;
    cursor: default;
  }
  .resizable-image img {
    display: block;
    width: 100%;
    height: auto;
  }
  .resizable-image:hover {
    outline: 1px dashed rgba(128,128,128,0.6);
  }
  .resize-handle {
    position: absolute;
    right: 0;
    bottom: 0;
    width: 14px;
    height: 14px;
    background: rgba(255,255,255,0.7);
    border: 1px solid rgba(0,0,0,0.25);
    border-radius: 2px;
    cursor: nwse-resize;
    z-index: 10;
  }
  
  .drag-handle {
    position: absolute;
    top: 4px;
    left: 50%;
    transform: translateX(-50%);
    padding: 4px 8px;
    background: rgba(100,149,237,0.9);
    border: 1px solid rgba(0,0,0,0.3);
    border-radius: 4px;
    cursor: move;
    font-size: 14px;
    font-weight: bold;
    line-height: 14px;
    color: white;
    user-select: none;
    opacity: 0.8;
    transition: opacity 0.2s, background 0.2s;
    z-index: 10;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
  }
  
  .drag-handle:hover {
    opacity: 1;
    background: rgba(65,105,225,1);
  }
  
  .resizable-image:hover .drag-handle,
  .resizable-mermaid:hover .drag-handle {
    opacity: 0.9;
  }

  /* Resizable Mermaid diagram wrapper */
  .resizable-mermaid {
    position: relative;
    display: block;
    margin: 12px auto;
    cursor: default;
  }
  .resizable-mermaid .mermaid-diagram {
    width: 100%;
    height: auto;
  }
  .resizable-mermaid:hover {
    outline: 1px dashed rgba(128,128,128,0.6);
  }
`;
document.head.appendChild(screenStyle);

// PDF Export Handshake - Wait for all async rendering to complete
if ((window as any).ipc) {
  (window as any).ipc.on('export-pdf-start', async () => {
    try {
      // 1. Ensure Mermaid diagrams are fully rendered
      if (window.mermaid) {
        // Get all mermaid diagrams that haven't been rendered yet
        const unrenderedDiagrams = document.querySelectorAll('.mermaid-diagram:not([data-processed])');
        if (unrenderedDiagrams.length > 0) {
          await window.mermaid.run({
            nodes: Array.from(unrenderedDiagrams) as HTMLElement[]
          });
        }
      }

      // 2. Ensure UML sequence diagrams are drawn
      // (js-sequence-diagrams draws synchronously, so if they exist they're already done)

      // 3. Ensure MathJax is finished typesetting
      if (window.MathJax && window.MathJax.typesetPromise) {
        await window.MathJax.typesetPromise();
      }

      // 4. Give browser one more tick to settle layout
      await new Promise(resolve => setTimeout(resolve, 100));

      // 5. Tell main process we're ready
      (window as any).ipc.send('export-pdf-ready');
    } catch (error) {
      console.error('Error during PDF preparation:', error);
      // Still send ready signal to avoid hanging
      (window as any).ipc.send('export-pdf-ready');
    }
  });
}

// Drag and drop support for Markdown files
document.addEventListener('DOMContentLoaded', () => {
  // Initialize TOC functionality
  initializeTOC();
  
  // Setup tab scroll buttons
  const tabsContainer = document.getElementById('tabs')!;
  const scrollLeftBtn = document.getElementById('tab-scroll-left')!;
  const scrollRightBtn = document.getElementById('tab-scroll-right')!;
  
  scrollLeftBtn.addEventListener('click', () => {
    tabsContainer.scrollBy({ left: -200, behavior: 'smooth' });
  });
  
  scrollRightBtn.addEventListener('click', () => {
    tabsContainer.scrollBy({ left: 200, behavior: 'smooth' });
  });
  
  editToggleButton = document.getElementById('edit-toggle') as HTMLButtonElement | null;
  refreshButton = document.getElementById('refresh-toggle') as HTMLButtonElement | null;
  
  initializeEditor();
  
  editToggleButton?.addEventListener('click', () => {
    setEditMode(!isEditMode);
  });
  
  refreshButton?.addEventListener('click', () => {
    refreshActiveFile();
  });
  
  // Listen for external file changes
  window.fileWatch.onFileChanged((filePath) => {
    handleFileChanged(filePath);
  });

  // Drag-and-drop handlers for opening markdown files
  const dropTarget = document.body;
  if (dropTarget) {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    dropTarget.addEventListener('dragenter', handleDragEnter);
    dropTarget.addEventListener('dragover', handleDragOver);

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!e.dataTransfer) {
        return;
      }
      
      const candidates: string[] = [];
      
      // Priority 1: Try File.path from Electron files
      const files = Array.from(e.dataTransfer.files);
      
      if (files.length > 0) {
        for (const file of files) {
          let resolvedPath = (file as any).path as string | undefined;
          
          // Fall back to Electron's webUtils helper when sandbox strips file.path
          if (!resolvedPath && window.webUtils?.getPathForFile) {
            try {
              resolvedPath = window.webUtils.getPathForFile(file);
            } catch (err) {
              // Fallback to other methods
            }
          }

          if (resolvedPath && !candidates.includes(resolvedPath)) {
            candidates.push(resolvedPath);
          }
        }
      }
      
      // Priority 2: Parse file:// URIs from text/uri-list
      const uriList = e.dataTransfer.getData('text/uri-list');
      if (uriList) {
        uriList.split(/\r?\n/).forEach(line => {
          const trimmed = line.trim();
          if (!trimmed) return;
          if (/^file:\/\//i.test(trimmed)) {
            try {
              const u = new URL(trimmed);
              let fp = decodeURIComponent(u.pathname);
              if (/^\/[A-Za-z]:/.test(fp)) fp = fp.slice(1);
              candidates.push(fp);
            } catch (err) {
              // Failed to parse URI
            }
          }
          else if (/^[A-Za-z]:[\\/]/.test(trimmed)) {
            candidates.push(trimmed);
          }
        });
      }
      
      // Priority 3: Parse Windows paths from text/plain
      const plain = e.dataTransfer.getData('text/plain');
      if (plain) {
        plain.split(/\r?\n/).forEach(item => {
          const s = item.trim();
          if (!s) return;
          if (/^[A-Za-z]:[\\/]/.test(s)) {
            candidates.push(s);
          }
        });
      }
      
      // Try candidates in order and open the first that exists
      for (const path of candidates) {
        if (!path) continue;
        try {
          const stats = await window.fileWatch.getFileStats(path);
          if (stats.success) {
            await openFilePath(path);
            return;
          }
        } catch (err) {
          // Continue to next candidate
        }
      }
      
      // If we have files but couldn't get their paths, offer file picker
      if (files.length > 0 && candidates.length === 0) {
        showStatus('Please select the file you dropped', 'success');
        const picked = await window.filePicker.pickFile();
        if (picked && picked.length > 0) {
          await openFilePath(picked[0]);
          return;
        }
      }
      
      console.error('[DROP] No valid file path could be resolved from drop. Candidates tried:', candidates);
      showStatus('Could not open dropped file', 'error');
    };
    dropTarget.addEventListener('drop', handleDrop);
  }
});

// Refresh active file content
async function refreshActiveFile() {
  if (activeTabIndex < 0) {
    return;
  }

  const tab = tabs[activeTabIndex];
  if (!tab?.filePath) {
    return;
  }

  try {
    // Check if file was modified externally
    const statsResult = await window.fileWatch.getFileStats(tab.filePath);
    if (!statsResult.success) {
      console.error('[REFRESH] Cannot read file stats:', statsResult.error);
      showStatus('Refresh failed', 'error');
      return;
    }

    // If file has local changes, ask user
    if (tab.isDirty) {
      const choice = confirm(
        `The file "${tab.title}" has unsaved changes.\n\n` +
        'Click OK to discard your changes and reload the file.\n' +
        'Click Cancel to keep your changes.'
      );
      
      if (!choice) {
        return; // User wants to keep their changes
      }
    }

    // Reload file
    const fileResult = await window.fileSystem.readFile(tab.filePath);
    if (!fileResult.success) {
      console.error('[REFRESH] Error reading file:', fileResult.error);
      showStatus('Refresh failed', 'error');
      return;
    }

    // Update tab content
    tab.content = fileResult.content!;
    tab.isDirty = false;
    tab.lastModified = statsResult.mtime;

    // Re-render
    await renderTab(activeTabIndex);
    showStatus('Refreshed', 'success');
    focusEditorDeferred();
    enforceEditable();
    // Re-assert editable state and classes after full render
    refreshEditorFromTab();
  } catch (error) {
    console.error('[REFRESH] Error refreshing file:', error);
    showStatus('Refresh error', 'error');
  }
}

// Handle external file changes
async function handleFileChanged(changedFilePath: string) {
  // Find the tab for this file
  const tabIndex = tabs.findIndex(t => t.filePath === changedFilePath);
  if (tabIndex < 0) {
    return; // File not open
  }

  const tab = tabs[tabIndex];
  
  try {
    // Get current file stats
    const statsResult = await window.fileWatch.getFileStats(changedFilePath);
    if (!statsResult.success) {
      return;
    }

    // Check if file actually changed (compare mtime)
    if (tab.lastModified && statsResult.mtime === tab.lastModified) {
      return;
    }

    // If file has no local changes, auto-reload
    if (!tab.isDirty) {
      const fileResult = await window.fileSystem.readFile(changedFilePath);
      if (fileResult.success) {
        tab.content = fileResult.content!;
        tab.lastModified = statsResult.mtime;
        
        // Re-render if it's the active tab
        if (tabIndex === activeTabIndex) {
          await renderTab(tabIndex);
        }
        
        if (tabIndex === activeTabIndex) {
          showStatus('File reloaded', 'success');
        }
      }
    } else {
      // File has local changes - show conflict warning
      const isActive = (tabIndex === activeTabIndex);
      const choice = confirm(
        `The file "${tab.title}" was modified externally and you have unsaved changes.\n\n` +
        'Click OK to discard your changes and reload the file.\n' +
        'Click Cancel to keep your changes (you can save over the external changes).'
      );
      
      if (choice) {
        // User chose to reload
        const fileResult = await window.fileSystem.readFile(changedFilePath);
        if (fileResult.success) {
          tab.content = fileResult.content!;
          tab.isDirty = false;
          tab.lastModified = statsResult.mtime;
          
          if (isActive) {
            await renderTab(tabIndex);
          }
          
          updateTabUI();
          if (isActive) {
            showStatus('File reloaded', 'success');
          }
          if (isActive) {
            focusEditorDeferred();
            enforceEditable();
            // Re-assert editable state and classes after full render
            refreshEditorFromTab();
          }
        }
      } else {
        // User chose to keep local changes
        if (isActive) {
          showStatus('Kept local changes', 'success');
        }
      }
    }
  } catch (error) {
    console.error('[FILE-WATCH] Error handling file change:', error);
  }
}
