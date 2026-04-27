import MarkdownIt from 'markdown-it';
import texmath from 'markdown-it-texmath';
import DOMPurify from 'dompurify';
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
      exportPDF: (filePath: string, themeData?: any, pageSettings?: any) => Promise<string | null>;
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
    menuState: {
      setFileActionsEnabled: (enabled: boolean) => Promise<void>;
    };
      themeAPI: {
        setCurrentTheme: (themeName: string) => Promise<void>;
      };
    clipboard: {
      writeText: (text: string) => void;
    };
    protocolDirs: {
      allow: (dirPath: string) => Promise<void>;
      disallow: (dirPath: string) => Promise<void>;
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
let renderGeneration = 0;

type PageSizePreset = 'A4' | 'Letter' | 'Legal' | 'Custom';

interface PageSettings {
  size: PageSizePreset;
  customWidthMm: number;
  customHeightMm: number;
  orientation: 'portrait' | 'landscape';
  marginsMm: { top: number; bottom: number; left: number; right: number };
  pageView: boolean;
}

const defaultPageSettings: PageSettings = {
  size: 'A4',
  customWidthMm: 210,
  customHeightMm: 297,
  orientation: 'portrait',
  marginsMm: { top: 15, bottom: 15, left: 12, right: 12 },
  pageView: false,
};

// Normalize stray square-bracket math blocks into $$...$$ so they render without visible brackets.
function normalizeBracketMath(md: string): string {
  // Match blocks that start at line beginning with '[' and end with ']' on their own line
  return md.replace(/(^|\n)\[\s*\n([\s\S]*?)\n\]\s*(\n|$)/g, (_m, lead, inner, trail) => {
    const trimmed = inner.trim();
    return `${lead}$$\n${trimmed}\n$$${trail}`;
  });
}

function isLikelyMathContent(content: string): boolean {
  const trimmed = content.trim().replace(/^\$+|\$+$/g, '').trim();
  if (!trimmed) return false;
  return /\\[A-Za-z]+|[\^_=]|\d\s*[/+*=<>-]\s*\d|\\(?:times|cdot|frac|dfrac|tfrac|sqrt|left|right|overline|neq|approx|subset|ge|le|in|mathbb|text)/.test(trimmed);
}

function normalizeEscapedMathDelimiters(md: string): string {
  const normalizeMathContent = (content: string) =>
    content
      .trim()
      .replace(/^\$+|\$+$/g, '')
      .trim()
      // Some generated Markdown escapes TeX commands as \\frac inside \( ... \).
      // MathJax expects a single command backslash.
      .replace(/\\\\(?=[A-Za-z])/g, '\\');

  const normalizeInline = (_match: string, inner: string) => {
    const trimmed = normalizeMathContent(inner);
    if (!trimmed) return '';
    return isLikelyMathContent(trimmed) ? `$${trimmed}$` : trimmed;
  };

  const normalizeBlock = (_match: string, inner: string) => {
    const trimmed = normalizeMathContent(inner);
    if (!trimmed) return '';
    return isLikelyMathContent(trimmed) ? `$$\n${trimmed}\n$$` : trimmed;
  };

  return md
    .replace(/\\+\(([\s\S]*?)\\+\)/g, normalizeInline)
    .replace(/\\+\[([\s\S]*?)\\+\]/g, normalizeBlock);
}

function normalizeMathDelimiters(md: string): string {
  return normalizeEscapedMathDelimiters(normalizeBracketMath(md));
}

function normalizeSvgCodeFences(md: string): string {
  // Some generated documents wrap SVG in triple-backtick fences, which makes
  // markdown-it render it as code instead of HTML. If a fenced block is pure
  // SVG markup, unwrap it so the SVG renders normally.
  const fencedBlockRegex = /(^|\n)[ \t]*```(?:svg|xml|html)?[^\n]*\n([\s\S]*?)\n[ \t]*```(?=\n|$)/gi;
  return md.replace(fencedBlockRegex, (fullMatch, prefix, body) => {
    const trimmed = body.trim();
    if (/^<svg\b[\s\S]*<\/svg>$/i.test(trimmed)) {
      return `${prefix}${trimmed}`;
    }
    return fullMatch;
  });
}

function normalizeDocumentHtmlAndSvg(md: string): string {
  let normalized = md;

  // Markdown files are fragments. Document-level wrappers can confuse block parsing
  // and make the rest of the document render as a single malformed HTML block.
  normalized = normalized
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<\/?html[^>]*>/gi, '')
    .replace(/<\/?head[^>]*>/gi, '')
    .replace(/<\/?body[^>]*>/gi, '');

  // Ensure inline SVG explicitly declares the SVG namespace.
  normalized = normalized.replace(
    /<svg(?![^>]*\bxmlns\s*=\s*['"]http:\/\/www\.w3\.org\/2000\/svg['"])([^>]*)>/gi,
    '<svg xmlns="http://www.w3.org/2000/svg"$1>'
  );

  // If an SVG opening tag is left unclosed, markdown-it may treat everything after
  // it as raw HTML, which looks like a truncated document. Close unmatched SVG tags.
  const openSvgCount = (normalized.match(/<svg\b[^>]*>/gi) || []).length;
  const closeSvgCount = (normalized.match(/<\/svg>/gi) || []).length;
  const missingClosers = openSvgCount - closeSvgCount;
  if (missingClosers > 0) {
    normalized += `\n${'</svg>\n'.repeat(missingClosers)}`;
  }

  return normalized;
}

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
      // texmath sets options.displayMode (not options.display) for block math.
      // Also detect multiline content (from $$\n...\n$$ blocks) which math_block passes
      // with no displayMode flag on the rule. Use \[...\] for display math to avoid
      // the JavaScript String.replace() special pattern where $$ → $ in replacement strings.
      const isDisplay = !!(options && (options.display || options.displayMode)) || tex.includes('\n');
      if (isDisplay) {
        return `\\[${tex}\\]`;
      }
      return `$${tex}$`;
    }
  },
  delimiters: ['dollars', 'brackets', 'gitlab', 'julia', 'kramdown'], // Support all common delimiters
});

// Simple YAML frontmatter extractor for MathJax macros
function extractFrontmatter(markdown: string) {
  if (!markdown.startsWith('---')) return { body: markdown, macros: {} as Record<string, string> };
  const end = markdown.indexOf('\n---', 3);
  if (end === -1) return { body: markdown, macros: {} as Record<string, string> };
  const front = markdown.slice(3, end).trim(); // between the --- markers
  const bodyStart = markdown.indexOf('\n', end + 4);
  const body = bodyStart === -1 ? '' : markdown.slice(bodyStart + 1);
  const macros: Record<string, string> = {};
  let inMacros = false;
  front.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (/^macros\s*:\s*$/i.test(trimmed)) {
      inMacros = true;
      return;
    }
    if (!inMacros) return;
    const match = trimmed.match(/^([A-Za-z][A-Za-z0-9]*)\s*:\s*(.+)$/);
    if (match) {
      const [, name, value] = match;
      macros[name] = value;
    }
  });
  return { body, macros };
}

function applyMathJaxMacros(macros: Record<string, string>) {
  if (!macros || Object.keys(macros).length === 0) return;
  const mj = (window as any).MathJax;
  const texConfig = mj?.config?.tex;
  if (!texConfig) return;
  texConfig.macros = { ...(texConfig.macros || {}), ...macros };
  // Refresh MathJax so new macros are honored
  if (mj.texReset) mj.texReset();
  if (mj.typesetClear) mj.typesetClear();
}

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

function isValidThemeName(themeName: string | null | undefined): themeName is keyof typeof themes {
  return !!themeName && themeName in themes;
}

function resolveInitialTheme(preferredTheme?: string | null): keyof typeof themes {
  if (isValidThemeName(preferredTheme)) {
    return preferredTheme;
  }

  const savedTheme = localStorage.getItem('selectedTheme');
  if (isValidThemeName(savedTheme)) {
    return savedTheme;
  }

  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'dark' : 'light';
}

function initializeTheme(preferredTheme?: string | null) {
  const themeToApply = resolveInitialTheme(preferredTheme);
  applyTheme(themeToApply);
}

function applyActiveTheme() {
  applyTheme(currentThemeName);
}

function applyTheme(themeName: keyof typeof themes) {
  currentThemeName = themeName; // Track current theme
  window.themeAPI.setCurrentTheme(themeName); // Notify main process
  const theme = themes[themeName];
  
  // Only apply theme to the content area, not the whole app
  const content = document.getElementById('content')!;
  content.style.backgroundColor = theme.content;
  
  const mdContent = document.getElementById('markdown-content')!;
  // If page view is active, sync markdown-content background inline so it always matches
  if (loadPageSettings().pageView) {
    mdContent.style.backgroundColor = theme.content;
  }
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
  document.documentElement.style.setProperty('--page-paper-bg', theme.content);
  
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

// Draw.io diagram counter
let drawioCounter = 0;

// Cache rendered draw.io SVGs by exact XML to avoid repeated iframe exports
const drawioSvgCache = new Map<string, string>();

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

// Page settings helpers
function loadPageSettings(): PageSettings {
  try {
    const raw = localStorage.getItem('pageSettings');
    if (!raw) return { ...defaultPageSettings };
    const parsed = JSON.parse(raw);
    return { ...defaultPageSettings, ...parsed, marginsMm: { ...defaultPageSettings.marginsMm, ...(parsed.marginsMm || {}) } };
  } catch {
    return { ...defaultPageSettings };
  }
}

function savePageSettings(settings: PageSettings) {
  localStorage.setItem('pageSettings', JSON.stringify(settings));
}

function mmToIn(mm: number) {
  return mm / 25.4;
}

function pageSettingsToInches(ps: PageSettings) {
  const presetDimensionsMm: Record<PageSizePreset, { w: number; h: number }> = {
    A4: { w: 210, h: 297 },
    Letter: { w: 216, h: 279 },
    Legal: { w: 216, h: 356 },
    Custom: { w: ps.customWidthMm, h: ps.customHeightMm },
  };
  const { w, h } = presetDimensionsMm[ps.size];
  const width = ps.orientation === 'portrait' ? w : h;
  const height = ps.orientation === 'portrait' ? h : w;
  return {
    widthIn: mmToIn(width),
    heightIn: mmToIn(height),
    marginsIn: {
      top: mmToIn(ps.marginsMm.top),
      bottom: mmToIn(ps.marginsMm.bottom),
      left: mmToIn(ps.marginsMm.left),
      right: mmToIn(ps.marginsMm.right),
    },
  };
}

function applyPageView(settings: PageSettings) {
  const content = document.getElementById('markdown-content');
  const viewerPane = document.getElementById('content');
  if (!content) return;
  if (!settings.pageView) {
    viewerPane?.classList.remove('page-view-active');
    content.classList.remove('page-view');
    content.style.maxWidth = '';
    content.style.padding = '';
    content.style.position = '';
    content.style.backgroundColor = ''; // Let applyTheme inline style control it again
    clearPageGuides();
    clearPageBreakMarkers();
    return;
  }
  const presetMm = settings.size === 'A4' ? { w: 210, h: 297 } :
    settings.size === 'Letter' ? { w: 216, h: 279 } :
    settings.size === 'Legal' ? { w: 216, h: 356 } :
    { w: settings.customWidthMm, h: settings.customHeightMm };
  const w = settings.orientation === 'portrait' ? presetMm.w : presetMm.h;
  const h = settings.orientation === 'portrait' ? presetMm.h : presetMm.w;
  const dpi = 96;
  const widthPx = mmToIn(w) * dpi;
  const paddingTop = mmToIn(settings.marginsMm.top) * dpi;
  const paddingBottom = mmToIn(settings.marginsMm.bottom) * dpi;
  const paddingLeft = mmToIn(settings.marginsMm.left) * dpi;
  const paddingRight = mmToIn(settings.marginsMm.right) * dpi;
  // Determine paper background: use inline style already set by applyTheme, or CSS variable, or fallback
  const paperBg = (viewerPane as HTMLElement | null)?.style.backgroundColor
    || getComputedStyle(document.documentElement).getPropertyValue('--page-paper-bg').trim()
    || '#ffffff';
  if (viewerPane) viewerPane.style.backgroundColor = paperBg;
  content.style.backgroundColor = paperBg;
  viewerPane?.classList.add('page-view-active');
  content.classList.add('page-view');
  content.style.position = 'relative';
  content.style.maxWidth = `${widthPx}px`;
  content.style.marginLeft = 'auto';
  content.style.marginRight = 'auto';
  content.style.padding = `${paddingTop}px ${paddingRight}px ${paddingBottom}px ${paddingLeft}px`;
  renderPageGuides(settings, content, widthPx, paddingTop, paddingBottom);
  computePageBreaks(settings);
}

function clearPageGuides() {
  const content = document.getElementById('markdown-content');
  if (!content) return;
  content.querySelectorAll('.page-guide').forEach(el => el.remove());
}

function clearPageBreakMarkers() {
  const content = document.getElementById('markdown-content');
  if (!content) return;
  content.querySelectorAll('.page-break-before').forEach(el => el.classList.remove('page-break-before'));
}

function renderPageGuides(settings: PageSettings, content: HTMLElement, pageWidthPx: number, paddingTopPx: number, paddingBottomPx: number) {
  clearPageGuides();
  const dpi = 96;
  const presetMm = settings.size === 'A4' ? { w: 210, h: 297 } :
    settings.size === 'Letter' ? { w: 216, h: 279 } :
    settings.size === 'Legal' ? { w: 216, h: 356 } :
    { w: settings.customWidthMm, h: settings.customHeightMm };
  const hMm = settings.orientation === 'portrait' ? presetMm.h : presetMm.w;
  const pageHeightPx = mmToIn(hMm) * dpi;
  const usableHeightPx = pageHeightPx - paddingTopPx - paddingBottomPx;
  if (usableHeightPx <= 0) return;
  const total = content.scrollHeight;
  let y = usableHeightPx + paddingTopPx;
  let pageNum = 1;
  while (y < total) {
    const line = document.createElement('div');
    line.className = 'page-guide';
    line.style.top = `${y}px`;
    line.textContent = `${pageNum + 1}`;
    line.setAttribute('data-page-break', String(pageNum + 1));
    content.appendChild(line);
    y += usableHeightPx;
    pageNum += 1;
  }
}

function computePageBreaks(settings: PageSettings) {
  const content = document.getElementById('markdown-content');
  if (!content) return;
  clearPageBreakMarkers();
  const presetMm = settings.size === 'A4' ? { w: 210, h: 297 } :
    settings.size === 'Letter' ? { w: 216, h: 279 } :
    settings.size === 'Legal' ? { w: 216, h: 356 } :
    { w: settings.customWidthMm, h: settings.customHeightMm };
  const hMm = settings.orientation === 'portrait' ? presetMm.h : presetMm.w;
  const dpi = 96;
  const pageHeightPx = mmToIn(hMm) * dpi;
  const paddingTopPx = mmToIn(settings.marginsMm.top) * dpi;
  const paddingBottomPx = mmToIn(settings.marginsMm.bottom) * dpi;
  const usableHeightPx = pageHeightPx - paddingTopPx - paddingBottomPx;
  if (usableHeightPx <= 0) return;

  const blocks = Array.from(content.querySelectorAll<HTMLElement>(
    'h1, h2, h3, h4, h5, h6, p, ul, ol, pre, blockquote, table, img, svg, mjx-container, .mermaid-diagram, .uml-sequence-diagram, .resizable-mermaid, .resizable-image'
  ));

  const isQuestionHeading = (el: HTMLElement) => /^H[1-6]$/.test(el.tagName) && /^\d+\.$/.test((el.textContent || '').trim());

  const findQuestionHeadingIndex = (startIndex: number) => {
    for (let index = startIndex; index >= 0; index -= 1) {
      if (isQuestionHeading(blocks[index])) return index;
    }
    return -1;
  };

  const contentRect = content.getBoundingClientRect();
  let currentLimit = paddingTopPx + usableHeightPx;

  for (let index = 0; index < blocks.length; index += 1) {
    const el = blocks[index];
    const rect = el.getBoundingClientRect();
    const top = rect.top - contentRect.top;
    const bottom = rect.bottom - contentRect.top;
    if (bottom > currentLimit) {
      let breakTarget = el;
      let breakTop = top;

      const questionHeadingIndex = findQuestionHeadingIndex(index);
      if (questionHeadingIndex >= 0) {
        const questionHeading = blocks[questionHeadingIndex];
        const nextQuestionIndex = blocks.findIndex((candidate, candidateIndex) => candidateIndex > questionHeadingIndex && isQuestionHeading(candidate));
        const questionEndIndex = nextQuestionIndex >= 0 ? nextQuestionIndex - 1 : blocks.length - 1;
        const questionTop = questionHeading.getBoundingClientRect().top - contentRect.top;
        const questionBottom = blocks[questionEndIndex].getBoundingClientRect().bottom - contentRect.top;
        const questionHeight = questionBottom - questionTop;

        if (questionHeadingIndex < index && questionHeight <= usableHeightPx) {
          breakTarget = questionHeading;
          breakTop = questionTop;
        }
      }

      breakTarget.classList.add('page-break-before');
      currentLimit = breakTop + usableHeightPx;
    }
  }
}

function setupPageSettingsUI() {
  const btn = document.getElementById('page-settings-btn');
  const modal = document.getElementById('page-settings-modal');
  if (!btn || !modal) return;
  const closeBtn = document.getElementById('page-settings-close');
  const cancelBtn = document.getElementById('page-settings-cancel');
  const saveBtn = document.getElementById('page-settings-save');
  const pageSizeSelect = document.getElementById('page-size-select') as HTMLSelectElement;
  const customRow = document.getElementById('custom-size-row');
  const customW = document.getElementById('custom-width') as HTMLInputElement;
  const customH = document.getElementById('custom-height') as HTMLInputElement;
  const orientSelect = document.getElementById('orientation-select') as HTMLSelectElement;
  const mTop = document.getElementById('margin-top') as HTMLInputElement;
  const mBottom = document.getElementById('margin-bottom') as HTMLInputElement;
  const mLeft = document.getElementById('margin-left') as HTMLInputElement;
  const mRight = document.getElementById('margin-right') as HTMLInputElement;
  const pageViewToggle = document.getElementById('page-view-toggle') as HTMLInputElement;

  const refreshCustomVisibility = () => {
    if (pageSizeSelect.value === 'Custom') {
      customRow?.classList.remove('hidden');
    } else {
      customRow?.classList.add('hidden');
    }
  };

  const loadUI = () => {
    const s = loadPageSettings();
    pageSizeSelect.value = s.size;
    customW.value = String(s.customWidthMm);
    customH.value = String(s.customHeightMm);
    orientSelect.value = s.orientation;
    mTop.value = String(s.marginsMm.top);
    mBottom.value = String(s.marginsMm.bottom);
    mLeft.value = String(s.marginsMm.left);
    mRight.value = String(s.marginsMm.right);
    pageViewToggle.checked = s.pageView;
    refreshCustomVisibility();
  };

  const closeModal = () => modal.classList.add('hidden');
  const openModal = () => {
    loadUI();
    modal.classList.remove('hidden');
  };

  btn.addEventListener('click', openModal);
  closeBtn?.addEventListener('click', closeModal);
  cancelBtn?.addEventListener('click', closeModal);
  pageSizeSelect.addEventListener('change', refreshCustomVisibility);

  saveBtn?.addEventListener('click', () => {
    const settings: PageSettings = {
      ...defaultPageSettings,
      size: pageSizeSelect.value as PageSizePreset,
      customWidthMm: parseFloat(customW.value) || defaultPageSettings.customWidthMm,
      customHeightMm: parseFloat(customH.value) || defaultPageSettings.customHeightMm,
      orientation: orientSelect.value as 'portrait' | 'landscape',
      marginsMm: {
        top: parseFloat(mTop.value) || defaultPageSettings.marginsMm.top,
        bottom: parseFloat(mBottom.value) || defaultPageSettings.marginsMm.bottom,
        left: parseFloat(mLeft.value) || defaultPageSettings.marginsMm.left,
        right: parseFloat(mRight.value) || defaultPageSettings.marginsMm.right,
      },
      pageView: pageViewToggle.checked,
    };
    savePageSettings(settings);
    applyPageView(settings);
    closeModal();
    showStatus('Page settings saved', 'success');
  });

  // Apply on load
  applyPageView(loadPageSettings());
}

// Debounced helper for resize-driven pagination
let resizeTimer: number | null = null;
function scheduleReflow() {
  if (resizeTimer) window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    resizeTimer = null;
    const ps = loadPageSettings();
    if (ps.pageView) {
      applyPageView(ps);
      computePageBreaks(ps);
    }
  }, 150);
}
// Process Mermaid diagrams
async function processMermaidDiagrams(container: HTMLElement) {
  if (!window.mermaid) {
    return;
  }

  const validateMermaid = (code: string): string | null => {
    try {
      window.mermaid.parse(code);
      return null;
    } catch (err: any) {
      const loc = err?.hash?.loc;
      const where = loc ? ` (line ${loc.first_line})` : '';
      return `Mermaid parse error${where}: ${err?.message || err}`;
    }
  };

  const checkDanglingArrows = (code: string) => {
    const lines = code.split('\n');
    return lines
      .map((line, idx) => ({ line: line.trim(), idx }))
      .filter(({ line }) => {
        if (!line) return false;
        if (/^(note\s+(left|right|over)|title|box|end|participant|actor)\b/i.test(line)) return false;
        return /^[^:\n]+[-.]+>\s*$/i.test(line);
      })
      .map(({ idx }) => idx + 1);
  };

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
    (block as HTMLElement).setAttribute('data-mermaid-processed', 'true');

    const dangling = checkDanglingArrows(code);
    if (dangling.length > 0) {
      diagramDiv.textContent = `Error rendering diagram: Line(s) ${dangling.join(', ')} are missing a target actor`;
      diagramDiv.setAttribute('data-mermaid-error', 'true');
      pre.replaceWith(diagramDiv);
      continue;
    }

    const parseError = validateMermaid(code);
    if (parseError) {
      diagramDiv.textContent = parseError;
      diagramDiv.setAttribute('data-mermaid-error', 'true');
      pre.replaceWith(diagramDiv);
      continue;
    }

    diagramDiv.textContent = code;
    
    // Replace the code block with the diagram container
    pre.replaceWith(diagramDiv);
  }
  
  // Render all diagrams
  try {
    await window.mermaid.run({
      querySelector: '.mermaid-diagram:not([data-mermaid-error])'
    });
  } catch (err) {
    console.error('[MERMAID] Mermaid rendering error:', err);
    console.error('[MERMAID] Error details:', JSON.stringify(err, null, 2));
  }
}

// Process UML sequence diagrams
// We map `uml-sequence-diagram` fences into Mermaid sequence diagrams for a single renderer path.
// A light pre-parse check surfaces the most common authoring error (dangling arrows).
async function processUMLSequenceDiagrams(container: HTMLElement) {
  if (!window.mermaid) {
    return;
  }

  const validateMermaid = (code: string): string | null => {
    try {
      window.mermaid.parse(code);
      return null;
    } catch (err: any) {
      const loc = err?.hash?.loc;
      const where = loc ? ` (line ${loc.first_line})` : '';
      return `Mermaid parse error${where}: ${err?.message || err}`;
    }
  };

  const umlBlocks = container.querySelectorAll('code.language-uml-sequence-diagram:not([data-uml-processed])');

  for (const block of Array.from(umlBlocks)) {
    const pre = block.parentElement;
    if (!pre || pre.tagName !== 'PRE') {
      continue;
    }

    const code = (block.textContent || '').trimEnd();
    const lines = code.split('\n');

    // Detect lines with an arrow but no target actor (e.g., "Alice-->")
    const danglingArrowLines = lines
      .map((line, idx) => ({ line, idx }))
      .filter(({ line }) => {
        const trimmed = line.trim();
        if (!trimmed) return false;
        // Skip note/title/box keywords that intentionally lack arrows
        if (/^(note\s+(left|right|over)|title|box|end|participant|actor)\b/i.test(trimmed)) return false;
        return /^[^:\n]+[-.]+>\s*$/i.test(trimmed);
      });

    // Create a container for the diagram
    const diagramId = `mermaid-diagram-${mermaidCounter++}`;
    const diagramDiv = document.createElement('div');
    diagramDiv.className = 'mermaid-diagram';
    diagramDiv.id = diagramId;

    (block as HTMLElement).setAttribute('data-uml-processed', 'true');

    if (danglingArrowLines.length > 0) {
      const msg = danglingArrowLines
        .map(({ idx }) => `Line ${idx + 1}: message is missing a target actor`)
        .join('\n');
      diagramDiv.textContent = `Error rendering diagram: ${msg}`;
      pre.replaceWith(diagramDiv);
      continue;
    }

    // Convert to Mermaid sequenceDiagram syntax if the author didn't include the directive
    const mermaidCode = /^sequenceDiagram\b/.test(code) ? code : `sequenceDiagram\n${code}`;
    const parseError = validateMermaid(mermaidCode);
    if (parseError) {
      diagramDiv.textContent = parseError;
      diagramDiv.setAttribute('data-mermaid-error', 'true');
      pre.replaceWith(diagramDiv);
      continue;
    }

    diagramDiv.textContent = mermaidCode;
    pre.replaceWith(diagramDiv);
  }

  // Render all diagrams (Mermaid and converted UML)
  try {
    await window.mermaid.run({ querySelector: '.mermaid-diagram:not([data-mermaid-error])' });
  } catch (err) {
    console.error('[UML→MERMAID] Rendering error:', err);
    console.error('[UML→MERMAID] Error details:', JSON.stringify(err, null, 2));
  }
}

// Process Draw.io diagrams (XML-based)
// Parses mxGraphModel XML and renders as SVG
async function processDrawioDiagrams(container: HTMLElement) {
  // Find all XML code blocks containing draw.io diagrams
  const xmlBlocks = container.querySelectorAll('code.language-xml:not([data-drawio-processed])');
  
  for (const block of Array.from(xmlBlocks)) {
    const pre = block.parentElement;
    if (!pre || pre.tagName !== 'PRE') {
      continue;
    }
    
    // Get the XML content
    const xmlContent = block.textContent || '';
    
    // Check if this is a draw.io diagram (must contain mxGraphModel)
    if (!xmlContent.toLowerCase().includes('<mxgraphmodel')) {
      (block as HTMLElement).setAttribute('data-drawio-processed', 'true');
      continue;
    }
    
    (block as HTMLElement).setAttribute('data-drawio-processed', 'true');
    
    // Create a container for the draw.io diagram
    const diagramId = `drawio-diagram-${drawioCounter++}`;
    const diagramDiv = document.createElement('div');
    diagramDiv.className = 'drawio-diagram';
    diagramDiv.id = diagramId;
    diagramDiv.setAttribute('data-drawio-xml', 'true');
    
    // Store the XML in a data attribute for later access/export
    diagramDiv.setAttribute('data-drawio-content', xmlContent);
    
    // Create a toolbar for diagram actions
    const toolbar = document.createElement('div');
    toolbar.className = 'drawio-toolbar';
    
    // Add "Open in Draw.io" button
    const openButton = document.createElement('button');
    openButton.className = 'drawio-action-btn';
    openButton.textContent = '✎ Edit in Draw.io';
    openButton.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Encode the XML for use in draw.io URL
      const encoded = btoa(xmlContent);
      const drawioUrl = `https://app.diagrams.net/?splash=0&mode=browser#H${encoded}`;
      window.open(drawioUrl, '_blank');
    };
    toolbar.appendChild(openButton);
    
    // Add copy button
    const copyButton = document.createElement('button');
    copyButton.className = 'drawio-action-btn';
    copyButton.textContent = '📋 Copy XML';
    copyButton.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      navigator.clipboard.writeText(xmlContent).then(() => {
        copyButton.textContent = '✓ Copied!';
        setTimeout(() => {
          copyButton.textContent = '📋 Copy XML';
        }, 2000);
      });
    };
    toolbar.appendChild(copyButton);
    
    diagramDiv.appendChild(toolbar);
    
    // Create SVG container
    const svgContainer = document.createElement('div');
    svgContainer.className = 'drawio-svg-container';
    svgContainer.id = `${diagramId}-svg`;
    diagramDiv.appendChild(svgContainer);
    
    // Replace the code block with the diagram container
    pre.replaceWith(diagramDiv);
  }
  
  // Render all draw.io diagrams
  const diagrams = container.querySelectorAll('[data-drawio-xml]:not([data-drawio-rendered])');
  for (const diagram of Array.from(diagrams)) {
    try {
      const xmlContent = (diagram as HTMLElement).getAttribute('data-drawio-content');
      if (!xmlContent) continue;
      
      (diagram as HTMLElement).setAttribute('data-drawio-rendered', 'true');
      const svgContainer = (diagram as HTMLElement).querySelector('.drawio-svg-container') as HTMLElement;
      if (!svgContainer) continue;
      
      // Parse and render the draw.io diagram using diagrams.net engine first
      const svg = await renderDrawioDiagramToSVG(xmlContent);
      if (svg) {
        svgContainer.appendChild(svg);
      } else {
        svgContainer.textContent = 'Error rendering diagram';
        svgContainer.style.color = '#f44747';
      }
    } catch (err) {
      console.error('[DRAWIO] Error processing diagram:', err);
      const svgContainer = (diagram as HTMLElement).querySelector('.drawio-svg-container') as HTMLElement;
      if (svgContainer) {
        svgContainer.textContent = 'Error rendering diagram';
        svgContainer.style.color = '#f44747';
      }
    }
  }
}

function parseSvgDataUri(dataUri: string): SVGElement | null {
  try {
    const comma = dataUri.indexOf(',');
    if (comma === -1) return null;
    const header = dataUri.slice(0, comma);
    const payload = dataUri.slice(comma + 1);
    let svgText = '';
    if (/;base64/i.test(header)) {
      svgText = atob(payload);
    } else {
      svgText = decodeURIComponent(payload);
    }
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
    const svg = svgDoc.documentElement;
    if (!svg || svg.tagName.toLowerCase() !== 'svg') return null;
    return document.importNode(svg, true) as unknown as SVGElement;
  } catch (err) {
    console.error('[DRAWIO] Failed to parse SVG data URI:', err);
    return null;
  }
}

async function renderDrawioDiagramToSVGViaEmbed(xmlContent: string): Promise<SVGElement | null> {
  const cached = drawioSvgCache.get(xmlContent);
  if (cached) {
    return parseSvgDataUri(cached);
  }

  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.style.width = '1px';
    iframe.style.height = '1px';
    iframe.style.opacity = '0';
    iframe.style.position = 'absolute';
    iframe.style.left = '-9999px';
    iframe.style.top = '-9999px';
    iframe.setAttribute('aria-hidden', 'true');
    iframe.setAttribute('tabindex', '-1');
    iframe.src = 'https://embed.diagrams.net/?embed=1&proto=json&spin=0&ui=min&noSaveBtn=1&saveAndExit=0&noExitBtn=1';

    let settled = false;
    const timeoutId = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanup();
        resolve(null);
      }
    }, 12000);

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener('message', onMessage);
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    };

    const postToEmbed = (msg: Record<string, any>) => {
      if (!iframe.contentWindow) return;
      iframe.contentWindow.postMessage(JSON.stringify(msg), 'https://embed.diagrams.net');
    };

    const onMessage = (evt: MessageEvent) => {
      if (evt.origin !== 'https://embed.diagrams.net') return;
      if (evt.source !== iframe.contentWindow) return;

      let msg: any = evt.data;
      if (typeof msg === 'string') {
        try {
          msg = JSON.parse(msg);
        } catch {
          return;
        }
      }
      if (!msg || typeof msg !== 'object') return;

      if (msg.event === 'init') {
        postToEmbed({
          action: 'load',
          xml: xmlContent,
          noSaveBtn: 1,
          noExitBtn: 1,
          saveAndExit: 0,
          modified: 0,
          autosave: 0
        });
        return;
      }

      if (msg.event === 'load') {
        postToEmbed({ action: 'export', format: 'svg', border: 0, embedImages: true });
        return;
      }

      if (msg.event === 'export' && typeof msg.data === 'string') {
        const svg = parseSvgDataUri(msg.data);
        if (svg) {
          drawioSvgCache.set(xmlContent, msg.data);
          svg.style.border = '1px solid #e0e0e0';
          svg.style.borderRadius = '4px';
          svg.style.backgroundColor = '#ffffff';
          svg.style.maxWidth = '100%';
          svg.style.height = 'auto';
        }
        if (!settled) {
          settled = true;
          cleanup();
          resolve(svg);
        }
        return;
      }

      if ((msg.event === 'export' && msg.error) || msg.error) {
        if (!settled) {
          settled = true;
          cleanup();
          resolve(null);
        }
      }
    };

    window.addEventListener('message', onMessage);
    document.body.appendChild(iframe);
  });
}

// Primary draw.io renderer: official diagrams.net export path with local fallback
async function renderDrawioDiagramToSVG(xmlContent: string): Promise<SVGElement | null> {
  const officialSvg = await renderDrawioDiagramToSVGViaEmbed(xmlContent);
  if (officialSvg) {
    return officialSvg;
  }
  return renderDrawioDiagramToSVGLegacy(xmlContent);
}

// Helper function to render draw.io XML to SVG (legacy local fallback)
function renderDrawioDiagramToSVGLegacy(xmlContent: string): SVGElement | null {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');
    
    // Check for parser errors
    if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
      return null;
    }
    
    const mxGraphModel = xmlDoc.getElementsByTagName('mxGraphModel')[0];
    if (!mxGraphModel) {
      return null;
    }
    
    // Get canvas dimensions
    const modelWidth = parseInt(mxGraphModel.getAttribute('dx') || '800');
    const modelHeight = parseInt(mxGraphModel.getAttribute('dy') || '600');
    
    // Get all cells - first pass to compute bounding box
    const root = xmlDoc.getElementsByTagName('root')[0];
    if (!root) {
      return null;
    }

    // Pre-pass: collect raw geometry for every non-edge vertex cell so we can resolve parent chains
    interface RawCell { id: string; parent: string; x: number; y: number; width: number; height: number; value: string; style: string; isEdge: boolean; }
    const rawCells = new Map<string, RawCell>();
    const allCells = root.getElementsByTagName('mxCell');
    for (let i = 0; i < allCells.length; i++) {
      const cell = allCells[i];
      const id = cell.getAttribute('id');
      if (!id) continue;
      const isEdge = cell.getAttribute('edge') === '1';
      const parent = cell.getAttribute('parent') || '1';
      const geom = cell.getElementsByTagName('mxGeometry')[0];
      if (!geom || geom.getAttribute('relative') === '1') continue;
      rawCells.set(id, {
        id, parent,
        x: parseFloat(geom.getAttribute('x') || '0'),
        y: parseFloat(geom.getAttribute('y') || '0'),
        width: parseFloat(geom.getAttribute('width') || '0'),
        height: parseFloat(geom.getAttribute('height') || '0'),
        value: cell.getAttribute('value') || '',
        style: cell.getAttribute('style') || '',
        isEdge
      });
    }

    // Resolve absolute position by walking parent chain (max depth 10 to avoid cycles)
    const resolveAbsPos = (id: string): {x: number; y: number} => {
      const rc = rawCells.get(id);
      if (!rc || rc.parent === '0' || rc.parent === '1' || !rawCells.has(rc.parent)) {
        return { x: rc ? rc.x : 0, y: rc ? rc.y : 0 };
      }
      const parentPos = resolveAbsPos(rc.parent);
      // For swimlane children, draw.io adds startSize (header height) to y when rendering
      const parentCell = rawCells.get(rc.parent);
      const parentStyle = parentCell ? parentCell.style : '';
      const isSwimlane = parentStyle.includes('swimlane');
      const startSize = isSwimlane ? parseFloat(extractStyleAttribute(parentStyle, 'startSize') || '30') : 0;
      return { x: parentPos.x + rc.x, y: parentPos.y + startSize + rc.y };
    };

    // Compute actual content bounds from VERTEX cells only (using absolute positions)
    let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
    for (const [id, rc] of rawCells) {
      if (!id || id === '0' || id === '1') continue;
      if (rc.isEdge) continue;
      if (rc.width === 0 && rc.height === 0) continue;
      const absPos = resolveAbsPos(id);
      minX = Math.min(minX, absPos.x);
      minY = Math.min(minY, absPos.y);
      maxX = Math.max(maxX, absPos.x + rc.width);
      maxY = Math.max(maxY, absPos.y + rc.height);
    }
    if (minX === Infinity) { minX = 0; minY = 0; }
    const padding = 20;
    const contentW = maxX - minX + padding * 2;
    const contentH = maxY - minY + padding * 2;
    const offsetX = -minX + padding;
    const offsetY = -minY + padding;

    // Create SVG element
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', String(contentW));
    svg.setAttribute('height', String(contentH));
    svg.setAttribute('viewBox', `0 0 ${contentW} ${contentH}`);
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svg.style.border = '1px solid #e0e0e0';
    svg.style.borderRadius = '4px';
    svg.style.backgroundColor = '#ffffff';
    svg.style.maxWidth = '100%';
    svg.style.height = 'auto';

    // Draw background
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', String(contentW));
    bg.setAttribute('height', String(contentH));
    bg.setAttribute('fill', '#ffffff');
    svg.appendChild(bg);
    
    const cells = root.getElementsByTagName('mxCell');
    interface EdgeData { source: string; target: string; style: string; waypoints: Array<{x:number,y:number}>; label: string; }
    const edges: Array<EdgeData> = [];
    const cellMap = new Map<string, any>();
    // Track which cell IDs are edges (so we can skip their label children)
    const edgeIds = new Set<string>();
    
    // First pass: extract cells using resolved absolute positions from pre-pass
    for (const [id, rc] of rawCells) {
      if (id === '0' || id === '1') continue;
      if (rc.isEdge) {
        edgeIds.add(id);
        continue;
      }
      if (rc.width === 0 && rc.height === 0) continue;
      const absPos = resolveAbsPos(id);
      cellMap.set(id, { x: absPos.x, y: absPos.y, width: rc.width, height: rc.height, value: rc.value, style: rc.style });
    }

    // Collect edges from cells (needs the DOM for waypoints and edge labels)
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const id = cell.getAttribute('id');
      if (!id || id === '0' || id === '1') continue;
      if (cell.getAttribute('edge') !== '1') continue;
      const source = cell.getAttribute('source');
      const target = cell.getAttribute('target');
      if (source && target) {
        const waypoints: Array<{x:number,y:number}> = [];
        const mxGeom = cell.getElementsByTagName('mxGeometry')[0];
        if (mxGeom) {
          const pts = mxGeom.getElementsByTagName('mxPoint');
          for (let j = 0; j < pts.length; j++) {
            const px = parseFloat(pts[j].getAttribute('x') || '0');
            const py = parseFloat(pts[j].getAttribute('y') || '0');
            waypoints.push({ x: px, y: py });
          }
        }
        let label = '';
        for (let j = 0; j < cells.length; j++) {
          const lc = cells[j];
          if (lc.getAttribute('parent') === id && lc.getAttribute('connectable') === '0') {
            label = lc.getAttribute('value') || '';
            break;
          }
        }
        const edgeStyle = cell.getAttribute('style') || '';
        edges.push({ source, target, style: edgeStyle, waypoints, label });
      }
    }
    
    // Second pass: draw vertex cells
    const renderedIds = new Set<string>();
    // We need a defs section for clipPaths - create it lazily
    let svgDefs: SVGDefsElement | null = null;
    const getOrCreateDefs = () => {
      if (!svgDefs) {
        svgDefs = document.createElementNS('http://www.w3.org/2000/svg', 'defs') as unknown as SVGDefsElement;
        svg.insertBefore(svgDefs, svg.firstChild);
      }
      return svgDefs;
    };
    let clipPathCounter = 0;

    for (const [id, cellData] of cellMap) {
      if (renderedIds.has(id)) continue;
      renderedIds.add(id);
      
      // Apply offset to translate content into view
      const x = cellData.x + offsetX;
      const y = cellData.y + offsetY;
      const { width, height, value, style } = cellData;
      
      // Parse style
      const isSwimlane = style.includes('swimlane');
      const shape = extractStyleAttribute(style, 'shape') || (style.includes('ellipse') ? 'ellipse' : (style.includes('rhombus') ? 'rhombus' : ''));
      const fillColor = extractStyleAttribute(style, 'fillColor') || '#dae8fc';
      const strokeColor = extractStyleAttribute(style, 'strokeColor') || '#6c8ebf';
      const rounded = extractStyleAttribute(style, 'rounded') === '1';
      let fontSize = parseInt(extractStyleAttribute(style, 'fontSize') || '12');
      if (isNaN(fontSize) || fontSize < 8) fontSize = 12;
      if (fontSize > 48) fontSize = 48;
      const opacityVal = extractStyleAttribute(style, 'opacity');
      const fillOpacity = opacityVal ? String(parseFloat(opacityVal) / 100) : '1';
      
      // Draw based on shape
      if (shape === 'ellipse' || shape === 'circle') {
        // Draw ellipse
        const ellipse = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
        ellipse.setAttribute('cx', String(x + width / 2));
        ellipse.setAttribute('cy', String(y + height / 2));
        ellipse.setAttribute('rx', String(width / 2));
        ellipse.setAttribute('ry', String(height / 2));
        ellipse.setAttribute('fill', fillColor);
        ellipse.setAttribute('fill-opacity', fillOpacity);
        ellipse.setAttribute('stroke', strokeColor);
        ellipse.setAttribute('stroke-width', '1.5');
        svg.appendChild(ellipse);
      } else if (shape === 'rhombus') {
        // Draw diamond
        const points = [
          [x + width / 2, y],
          [x + width, y + height / 2],
          [x + width / 2, y + height],
          [x, y + height / 2]
        ];
        const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        polygon.setAttribute('points', points.map(p => p.join(',')).join(' '));
        polygon.setAttribute('fill', fillColor);
        polygon.setAttribute('fill-opacity', fillOpacity);
        polygon.setAttribute('stroke', strokeColor);
        polygon.setAttribute('stroke-width', '1.5');
        svg.appendChild(polygon);
      } else {
        // Draw rectangle (default). For swimlane, also draw header bar.
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', String(x));
        rect.setAttribute('y', String(y));
        rect.setAttribute('width', String(width));
        rect.setAttribute('height', String(height));
        rect.setAttribute('fill', fillColor);
        rect.setAttribute('fill-opacity', fillOpacity);
        rect.setAttribute('stroke', strokeColor);
        rect.setAttribute('stroke-width', '1.5');
        if (rounded) {
          rect.setAttribute('rx', '5');
          rect.setAttribute('ry', '5');
        }
        svg.appendChild(rect);

        if (isSwimlane) {
          const startSize = parseFloat(extractStyleAttribute(style, 'startSize') || '30');
          // Draw header bar background
          const hdr = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          hdr.setAttribute('x', String(x));
          hdr.setAttribute('y', String(y));
          hdr.setAttribute('width', String(width));
          hdr.setAttribute('height', String(startSize));
          hdr.setAttribute('fill', fillColor);
          hdr.setAttribute('fill-opacity', fillOpacity);
          hdr.setAttribute('stroke', strokeColor);
          hdr.setAttribute('stroke-width', '1.5');
          svg.appendChild(hdr);
          // Draw separator line
          const sep = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          sep.setAttribute('x1', String(x));
          sep.setAttribute('y1', String(y + startSize));
          sep.setAttribute('x2', String(x + width));
          sep.setAttribute('y2', String(y + startSize));
          sep.setAttribute('stroke', strokeColor);
          sep.setAttribute('stroke-width', '1.5');
          svg.appendChild(sep);
        }
      }
      
      // Add text label
      if (value && value.trim()) {
        // Decode XML/HTML entities including &#xa; (newline), &#x27; etc.
        let textContent = value.trim();
        textContent = textContent
          .replace(/&#xa;/gi, '\n')
          .replace(/&#xA;/g, '\n')
          .replace(/<br\s*\/?\s*>/gi, '\n')
          .replace(/<\/div>\s*<div>/gi, '\n')
          .replace(/<\/p>\s*<p>/gi, '\n')
          .replace(/\n/g, '\n')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .replace(/&#x27;/g, "'")
          .replace(/<[^>]+>/g, '');

        const rawLines = textContent.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
        const whiteSpace = extractStyleAttribute(style, 'whiteSpace') || '';
        const doWrap = whiteSpace === 'wrap';
        const approxCharsPerLine = Math.max(8, Math.floor((width - 10) / Math.max(1, fontSize * 0.56)));
        const lines: string[] = [];
        for (const rawLine of rawLines) {
          if (!doWrap || rawLine.length <= approxCharsPerLine) {
            lines.push(rawLine);
            continue;
          }
          const words = rawLine.split(/\s+/);
          let current = '';
          for (const word of words) {
            const next = current ? `${current} ${word}` : word;
            if (next.length > approxCharsPerLine && current) {
              lines.push(current);
              current = word;
            } else {
              current = next;
            }
          }
          if (current) lines.push(current);
        }
        const lineHeight = fontSize + 3;
        const totalTextHeight = lines.length * lineHeight;

        // Handle text alignment from style
        // For swimlane: text goes in the header (top startSize px), verticalAlign=top
        const verticalAlign = isSwimlane ? 'top' : (extractStyleAttribute(style, 'verticalAlign') || 'middle');
        const alignH = extractStyleAttribute(style, 'align') || 'center';
        const spacingLeft = parseFloat(extractStyleAttribute(style, 'spacingLeft') || '0');
        const fontColor = extractStyleAttribute(style, 'fontColor') || '#000000';
        const fontStyleAttr = parseInt(extractStyleAttribute(style, 'fontStyle') || '0');
        const isBold = (fontStyleAttr & 1) === 1;

        // For swimlane: render text only in header
        const swimStartSize = isSwimlane ? parseFloat(extractStyleAttribute(style, 'startSize') || '30') : 0;
        const textAreaHeight = isSwimlane ? swimStartSize : height;

        // Compute text x position and anchor
        let textX: number;
        let textAnchor: string;
        if (alignH === 'left') {
          textX = x + spacingLeft + 4;
          textAnchor = 'start';
        } else if (alignH === 'right') {
          textX = x + width - 4;
          textAnchor = 'end';
        } else {
          textX = x + width / 2;
          textAnchor = 'middle';
        }

        // Compute text y start position
        let startY: number;
        if (verticalAlign === 'top') {
          startY = y + fontSize + 4;
        } else if (verticalAlign === 'bottom') {
          startY = y + textAreaHeight - totalTextHeight + lineHeight / 2;
        } else {
          startY = (y + textAreaHeight / 2) - (totalTextHeight / 2) + (lineHeight / 2);
        }

        // Create clipPath to prevent text overflow outside cell bounds
        const clipId = `clip_${++clipPathCounter}`;
        const defs = getOrCreateDefs();
        const clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
        clipPath.setAttribute('id', clipId);
        const clipRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        clipRect.setAttribute('x', String(x + 1));
        clipRect.setAttribute('y', String(y + 1));
        clipRect.setAttribute('width', String(Math.max(0, width - 2)));
        clipRect.setAttribute('height', String(Math.max(0, textAreaHeight - 2)));
        clipPath.appendChild(clipRect);
        defs.appendChild(clipPath);

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', String(textX));
        text.setAttribute('y', String(startY));
        text.setAttribute('text-anchor', textAnchor);
        text.setAttribute('dominant-baseline', 'middle');
        text.setAttribute('font-size', String(fontSize));
        text.setAttribute('font-family', 'Arial, sans-serif');
        text.setAttribute('fill', fontColor);
        text.setAttribute('pointer-events', 'none');
        text.setAttribute('clip-path', `url(#${clipId})`);
        if (isBold) text.setAttribute('font-weight', 'bold');

        if (lines.length === 1) {
          text.textContent = lines[0];
        } else {
          lines.forEach((line: string, idx: number) => {
            const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
            tspan.setAttribute('x', String(textX));
            tspan.setAttribute('y', String(startY + idx * lineHeight));
            tspan.setAttribute('dominant-baseline', 'middle');
            tspan.textContent = line;
            text.appendChild(tspan);
          });
        }

        svg.appendChild(text);
      }
    }
    
    // Third pass: draw edges with orthogonal routing
    // Build unique marker ids per color to avoid conflicts
    const markerColors = new Map<string, string>();
    const defsEl = document.createElementNS('http://www.w3.org/2000/svg', 'defs');

    const getMarkerId = (color: string, open: boolean) => {
      const key = color + (open ? '-open' : '-filled');
      if (!markerColors.has(key)) {
        markerColors.set(key, key.replace(/[^a-zA-Z0-9]/g, '_'));
        const mk = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        const mkId = 'arrow_' + markerColors.get(key);
        mk.setAttribute('id', mkId);
        mk.setAttribute('markerWidth', '8');
        mk.setAttribute('markerHeight', '8');
        mk.setAttribute('refX', open ? '6' : '5');
        mk.setAttribute('refY', '3');
        mk.setAttribute('orient', 'auto');
        const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        if (open) {
          // Open arrow: just two lines (use polyline)
          const pl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
          pl.setAttribute('points', '0,0 6,3 0,6');
          pl.setAttribute('fill', 'none');
          pl.setAttribute('stroke', color);
          pl.setAttribute('stroke-width', '1.5');
          mk.appendChild(pl);
        } else {
          poly.setAttribute('points', '0 0, 8 3, 0 6');
          poly.setAttribute('fill', color);
          mk.appendChild(poly);
        }
        defsEl.appendChild(mk);
      }
      return 'arrow_' + markerColors.get(key);
    };

    const getBorderAnchor = (cell: any, towardX: number, towardY: number) => {
      const left = cell.x + offsetX;
      const right = left + cell.width;
      const top = cell.y + offsetY;
      const bottom = top + cell.height;
      const cx = left + cell.width / 2;
      const cy = top + cell.height / 2;
      const dx = towardX - cx;
      const dy = towardY - cy;
      if (Math.abs(dx) >= Math.abs(dy)) {
        return { x: dx >= 0 ? right : left, y: cy };
      }
      return { x: cx, y: dy >= 0 ? bottom : top };
    };

    for (const edge of edges) {
      const sourceCell = cellMap.get(edge.source);
      const targetCell = cellMap.get(edge.target);
      if (!sourceCell || !targetCell) continue;

      const strokeColor = extractStyleAttribute(edge.style, 'strokeColor') ||
                          extractStyleAttribute(edge.style, 'stroke') || '#666666';
      const strokeWidth = extractStyleAttribute(edge.style, 'strokeWidth') || '1.5';
      const dashed = edge.style.includes('dashed=1') || edge.style.includes('dashed');
      const openArrow = edge.style.includes('endArrow=open') || edge.style.includes('endFill=0');
      const noArrow = edge.style.includes('endArrow=none');

      // Compute edge endpoints on cell borders (not centers)
      const scx = sourceCell.x + offsetX + sourceCell.width / 2;
      const scy = sourceCell.y + offsetY + sourceCell.height / 2;
      const tcx = targetCell.x + offsetX + targetCell.width / 2;
      const tcy = targetCell.y + offsetY + targetCell.height / 2;

      let pts: Array<{x:number,y:number}>;
      if (edge.waypoints.length > 0) {
        // Use explicit waypoints - connect source edge → waypoints → target edge
        const firstWp = { x: edge.waypoints[0].x + offsetX, y: edge.waypoints[0].y + offsetY };
        const lastWp = { x: edge.waypoints[edge.waypoints.length-1].x + offsetX, y: edge.waypoints[edge.waypoints.length-1].y + offsetY };
        // Exit source toward first waypoint
        const sx = Math.abs(firstWp.x - scx) > Math.abs(firstWp.y - scy)
          ? (firstWp.x > scx ? sourceCell.x + offsetX + sourceCell.width : sourceCell.x + offsetX)
          : scx;
        const sy = Math.abs(firstWp.x - scx) > Math.abs(firstWp.y - scy)
          ? scy
          : (firstWp.y > scy ? sourceCell.y + offsetY + sourceCell.height : sourceCell.y + offsetY);
        // Enter target from last waypoint
        const tx = Math.abs(lastWp.x - tcx) > Math.abs(lastWp.y - tcy)
          ? (lastWp.x < tcx ? targetCell.x + offsetX : targetCell.x + offsetX + targetCell.width)
          : tcx;
        const ty = Math.abs(lastWp.x - tcx) > Math.abs(lastWp.y - tcy)
          ? tcy
          : (lastWp.y < tcy ? targetCell.y + offsetY : targetCell.y + offsetY + targetCell.height);
        pts = [
          { x: sx, y: sy },
          ...edge.waypoints.map(p => ({ x: p.x + offsetX, y: p.y + offsetY })),
          { x: tx, y: ty }
        ];
      } else {
        // Auto-route: orthogonal path using border anchors to avoid crossing node text
        const start = getBorderAnchor(sourceCell, tcx, tcy);
        const end = getBorderAnchor(targetCell, scx, scy);
        const sx = start.x, sy = start.y, tx = end.x, ty = end.y;
        const midX = (sx + tx) / 2;
        pts = [{ x: sx, y: sy }, { x: midX, y: sy }, { x: midX, y: ty }, { x: tx, y: ty }];
      }

      // Build SVG path
      let d = `M ${pts[0].x} ${pts[0].y}`;
      for (let j = 1; j < pts.length; j++) {
        d += ` L ${pts[j].x} ${pts[j].y}`;
      }

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', strokeColor);
      path.setAttribute('stroke-width', strokeWidth);
      if (dashed) path.setAttribute('stroke-dasharray', '5,4');
      if (!noArrow) path.setAttribute('marker-end', `url(#${getMarkerId(strokeColor, openArrow)})`);
      svg.appendChild(path);

      // Draw edge label if present
      if (edge.label && edge.label.trim()) {
        const midIdx = Math.floor(pts.length / 2);
        const lx = (pts[midIdx-1].x + pts[midIdx].x) / 2;
        const ly = (pts[midIdx-1].y + pts[midIdx].y) / 2;
        const lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        lbl.setAttribute('x', String(lx));
        lbl.setAttribute('y', String(ly - 4));
        lbl.setAttribute('text-anchor', 'middle');
        lbl.setAttribute('font-size', '10');
        lbl.setAttribute('font-family', 'Arial, sans-serif');
        lbl.setAttribute('fill', '#333333');
        lbl.setAttribute('pointer-events', 'none');
        // White background rect for readability
        const bbox_w = edge.label.length * 5.5;
        const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bgRect.setAttribute('x', String(lx - bbox_w / 2));
        bgRect.setAttribute('y', String(ly - 16));
        bgRect.setAttribute('width', String(bbox_w));
        bgRect.setAttribute('height', '12');
        bgRect.setAttribute('fill', 'white');
        bgRect.setAttribute('fill-opacity', '0.85');
        svg.appendChild(bgRect);
        lbl.textContent = edge.label;
        svg.appendChild(lbl);
      }
    }

    svg.insertBefore(defsEl, svg.firstChild);
    
    return svg;
  } catch (err) {
    console.error('[DRAWIO] SVG rendering error:', err);
    return null;
  }
}

// Helper to extract style attributes
function extractStyleAttribute(style: string, attr: string): string {
  if (!style) return '';
  const regex = new RegExp(`${attr}=([^;]+)`);
  const match = style.match(regex);
  return match ? match[1].replace(/^['"]|['"]$/g, '') : '';
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
    if (cmView.state.doc.length > 0) {
      cmView.dispatch({ changes: { from: 0, to: cmView.state.doc.length, insert: '' } });
    }
    cmView.dispatch({
      effects: editableCompartment.reconfigure(EditorView.editable.of(isEditMode))
    });
    cmView.dom.classList.toggle('cm-readonly', !isEditMode);
    try { cmView.scrollDOM.scrollTop = 0; } catch {}
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

function clearActiveDocumentView() {
  renderGeneration++;
  activeTabIndex = -1;

  const contentDiv = document.getElementById('markdown-content');
  const contentPane = document.getElementById('content');
  const emptyState = document.querySelector('.empty-state') as HTMLElement | null;
  const tocContent = document.getElementById('toc-content');

  clearPageGuides();
  clearPageBreakMarkers();

  if (contentDiv) {
    contentDiv.innerHTML = '';
    contentDiv.style.display = 'none';
    contentDiv.style.backgroundColor = '';
    contentDiv.classList.remove('page-view');
  }

  if (contentPane) {
    contentPane.classList.remove('page-view-active');
  }

  if (emptyState) {
    emptyState.style.display = 'flex';
  }

  if (tocContent) {
    tocContent.innerHTML = '<div class="toc-empty">No document open</div>';
  }

  refreshEditorFromTab();
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
  const renderId = ++renderGeneration;
  activeTabIndex = index;
  const tab = tabs[index];
  
  if (!tab) return;

  const contentDiv = document.getElementById('markdown-content')!;
  const emptyState = document.querySelector('.empty-state') as HTMLElement;
  
  // Extract frontmatter macros (optional) and strip it from the rendered body
  const { body: markdownBodyRaw, macros } = extractFrontmatter(tab.content);
  const markdownBody = normalizeDocumentHtmlAndSvg(
    normalizeSvgCodeFences(normalizeMathDelimiters(markdownBodyRaw))
  );
  applyMathJaxMacros(macros);

  // Process markdown with markdown-it (no manual math extraction needed!)
  let html = md.render(markdownBody);
  
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
  
  // Set the HTML — sanitize to prevent XSS from malicious markdown files.
  // ADD_TAGS/ADD_ATTR allow MathJax (mjx-*), Mermaid (svg, foreignObject), and Draw.io (svg, defs, marker) to survive.
  contentDiv.innerHTML = DOMPurify.sanitize(html, {
    ADD_TAGS: ['mjx-container', 'mjx-math', 'mjx-mrow', 'mjx-mo', 'mjx-mi', 'mjx-mn',
               'mjx-msup', 'mjx-msub', 'mjx-msubsup', 'mjx-mfrac', 'mjx-sqrt',
               'mjx-mtext', 'mjx-mspace', 'mjx-merror', 'mjx-semantics',
               'math', 'mrow', 'mi', 'mo', 'mn', 'msup', 'msub', 'msubsup',
               'mfrac', 'msqrt', 'mtext', 'mspace', 'semantics', 'annotation',
               'foreignObject', 'svg', 'defs', 'marker', 'polygon', 'polyline', 'ellipse',
               'line', 'path', 'g', 'text', 'tspan', 'use'],
    ADD_ATTR: ['jax', 'display', 'style', 'class', 'id', 'data-original-src',
               'xmlns', 'xmlns:xlink', 'viewBox', 'preserveAspectRatio', 'focusable',
               'aria-hidden', 'role', 'tabindex', 'href', 'xlink:href',
               'data-drawio-xml', 'data-drawio-content', 'data-drawio-rendered',
               'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'rx', 'ry', 'r', 'd',
               'width', 'height', 'points', 'fill', 'fill-opacity', 'stroke', 'stroke-width',
               'stroke-dasharray', 'text-anchor', 'font-size', 'font-weight', 'font-family', 'marker-end',
               'markerWidth', 'markerHeight', 'refX', 'refY', 'orient'],
    FORCE_BODY: false,
  });
  // Tag raw markdown SVGs before MathJax runs so our responsive SVG CSS
  // does not accidentally target MathJax's own internal SVG output.
  contentDiv.querySelectorAll('svg').forEach(svg => {
    svg.classList.add('raw-markdown-svg');
  });
  if (renderId !== renderGeneration || tabs[index] !== tab || activeTabIndex !== index) return;
  applyActiveTheme();
  const psInitial = loadPageSettings();
  applyPageView(psInitial);
  // Enhance images with per-image resizing controls before further processing
  setupResizableImages(contentDiv);
  
  // No-op delay previously used for protocol tests has been removed
  contentDiv.style.display = 'block';
  emptyState.style.display = 'none';

  // Process diagrams and math on every render (tabs rebuild the DOM each time)
  // Process Mermaid diagrams first
  await processMermaidDiagrams(contentDiv);
  if (renderId !== renderGeneration || tabs[index] !== tab || activeTabIndex !== index) return;
  setupResizableMermaidDiagrams(contentDiv);

  // Process UML sequence diagrams (converted to Mermaid under the hood)
  await processUMLSequenceDiagrams(contentDiv);
  if (renderId !== renderGeneration || tabs[index] !== tab || activeTabIndex !== index) return;

  // Process Draw.io diagrams
  await processDrawioDiagrams(contentDiv);
  if (renderId !== renderGeneration || tabs[index] !== tab || activeTabIndex !== index) return;

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
  if (renderId !== renderGeneration || tabs[index] !== tab || activeTabIndex !== index) return;
  
  // Apply page view and recompute breaks after all rendering is settled
  const psAfterRender = loadPageSettings();
  if (psAfterRender.pageView) {
    applyPageView(psAfterRender);
    computePageBreaks(psAfterRender);
  }
  
  // Apply page view and compute pagination after all rendering/MathJax
  const ps = loadPageSettings();
  if (ps.pageView) {
    applyPageView(ps);
    computePageBreaks(ps);
  }
  
  // Reapply the active theme after async rendering adds/replaces content.
  applyActiveTheme();

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
  
  // Wait for Draw.io diagrams to render (SVG-based, synchronous but give rendering time)
  const drawioElements = document.querySelectorAll('.drawio-svg-container');
  if (drawioElements.length > 0) {
    // SVG rendering is synchronous, but give a moment for DOM updates
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  // Wait one more frame for any final DOM updates
  await new Promise(resolve => requestAnimationFrame(resolve));
}

// Expose function globally for PDF export
(window as any).waitForRenderingComplete = waitForRenderingComplete;
(window as any).renderTab = renderTab;
(window as any).activeTabIndex = () => activeTabIndex;
(window as any).automationExportPDF = exportPDF;

// Automation helper: load content into a new tab (used by Playwright tests)
function automationLoadFile(content: string, filePath: string) {
  const title = filePath.split(/[/\\]/).pop() || 'untitled';
  const tab = { filePath, content, title } as Tab;
  tabs.push(tab);
  renderTab(tabs.length - 1, { skipEditorUpdate: true });
}
(window as any).automationLoadFile = automationLoadFile;

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

  syncFileMenuState();
}

function syncFileMenuState() {
  const hasOpenFile = activeTabIndex >= 0 && !!tabs[activeTabIndex];
  window.menuState.setFileActionsEnabled(hasOpenFile).catch((error) => {
    console.error('[MENU] Failed to sync file menu state:', error);
  });
}

function fileDir(filePath: string): string {
  const i = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  return i > 0 ? filePath.substring(0, i) : filePath;
}

function maybeDisallowProtocolDir(closedFilePath: string): void {
  const dir = fileDir(closedFilePath);
  const stillInUse = tabs.some(t => t.filePath && fileDir(t.filePath) === dir);
  if (!stillInUse) {
    window.protocolDirs.disallow(dir);
  }
}

function closeTab(index: number) {
  const closingTab = tabs[index];

  // Stop watching the file
  if (closingTab?.filePath) {
    window.fileWatch.unwatchFile(closingTab.filePath);
  }

  tabs.splice(index, 1);

  // Revoke protocol access if no remaining tab uses the same directory
  if (closingTab?.filePath) {
    maybeDisallowProtocolDir(closingTab.filePath);
  }
  
  if (tabs.length === 0) {
    clearActiveDocumentView();
  } else if (index === activeTabIndex) {
    renderTab(Math.min(index, tabs.length - 1));
  } else if (index < activeTabIndex) {
    activeTabIndex--;
    // Regenerate TOC for newly shifted active tab
    generateTOC();
  }
  
  updateTabUI();
  saveSession();
  if (tabs.length > 0) {
    refreshEditorFromTab();
  }
}

function closeAllTabs() {
  // Stop watching all files and revoke protocol access for all dirs
  const dirsToDisallow = new Set(tabs.filter(t => t.filePath).map(t => fileDir(t.filePath)));
  tabs.forEach(tab => {
    if (tab.filePath) {
      window.fileWatch.unwatchFile(tab.filePath);
    }
  });
  dirsToDisallow.forEach(dir => window.protocolDirs.disallow(dir));

  tabs.splice(0, tabs.length);
  clearActiveDocumentView();
  updateTabUI();
  saveSession(); // This will save an empty session, preventing unwanted restoration
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
      const uniquePaths = Array.from(new Set(filePaths.filter(Boolean)));
      for (let index = 0; index < uniquePaths.length; index++) {
        await openFilePath(uniquePaths[index], { activate: index === uniquePaths.length - 1 });
      }
    }
  } catch (error) {
    console.error('Error opening file:', error);
  }
}

// Open a specific file path (used by drag-and-drop)
async function openFilePath(filePath: string, options: { activate?: boolean } = {}) {
  const { activate = true } = options;
  try {
    const existingIndex = tabs.findIndex(t => t.filePath === filePath);
    if (existingIndex >= 0) {
      if (activate) {
        await renderTab(existingIndex);
      }
      return true;
    }

    const fileResult = await window.fileSystem.readFile(filePath);
    if (!fileResult.success) {
      console.error('Error reading dropped file:', fileResult.error);
      showStatus('Open failed', 'error');
      return false;
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
    window.protocolDirs.allow(fileDir(filePath));
    if (activate) {
      await renderTab(tabs.length - 1);
    }
    return true;
  } catch (error) {
    console.error('Error opening dropped file:', error);
    showStatus('Open error', 'error');
    return false;
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

    // Ensure page breaks are up to date and hide guides during export
    const ps = loadPageSettings();
    if (ps.pageView) {
      // Ensure layout matches pagination: apply page view and recompute breaks
      applyPageView(ps);
      clearPageGuides();
      computePageBreaks(ps);
    }

    const pageSettings = loadPageSettings();
    const { widthIn, heightIn, marginsIn } = pageSettingsToInches(pageSettings);
    const savePath = await window.printExport.exportPDF(tab.filePath, currentTheme, {
      pageSize: { width: widthIn, height: heightIn },
      margins: marginsIn,
      orientation: pageSettings.orientation,
      pageView: pageSettings.pageView,
    });
    
    if (savePath) {
      // PDF saved successfully
      console.log('PDF saved to:', savePath);
    }

    // Restore guides if page view was on
    if (ps.pageView) {
      applyPageView(ps);
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
const MAX_LOG_ENTRIES = 1000;
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

function pushLog(level: string, args: any[]): void {
  const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  if (consoleLogs.length >= MAX_LOG_ENTRIES) {
    consoleLogs.splice(0, Math.floor(MAX_LOG_ENTRIES / 4)); // drop oldest 25%
  }
  consoleLogs.push({ timestamp: new Date().toISOString(), level, message, tabIndex: getCurrentTabIndex() });
}

// Override console methods to capture logs with tab information
console.log   = (...args: any[]) => { pushLog('LOG',   args); originalConsole.log(...args);   };
console.warn  = (...args: any[]) => { pushLog('WARN',  args); originalConsole.warn(...args);  };
console.error = (...args: any[]) => { pushLog('ERROR', args); originalConsole.error(...args); };
console.info  = (...args: any[]) => { pushLog('INFO',  args); originalConsole.info(...args);  };

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
setupPageSettingsUI();

// Recompute pagination on window resize
window.addEventListener('resize', scheduleReflow);
// Also after mouse/touch interactions (e.g., resizable diagrams/images)
['mouseup', 'touchend'].forEach(evt => window.addEventListener(evt, scheduleReflow));

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
        
        // Start watching the file and allow its directory via the protocol handler
        window.fileWatch.watchFile(filePath);
        window.protocolDirs.allow(fileDir(filePath));

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
  
    themeToApply = resolveInitialTheme(session.theme);
  
    if (session.fontSizeFactor !== undefined) {
      fontFactorToApply = session.fontSizeFactor;
    } else {
      fontFactorToApply = 1.0; // Default
    }
  
    // Apply theme
    initializeTheme(themeToApply);
  
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
          
          // Start watching the file and allow its directory via the protocol handler
          window.fileWatch.watchFile(filePath);
          window.protocolDirs.allow(fileDir(filePath));
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
    /*
     * Single authoritative @page rule.
     * Margins are set here so Chromium uses them when paginating content
     * (calculating where page breaks fall). printToPDF() margins are set to
     * zero to avoid double-counting. If CSS @page margin: 0 were used,
     * Chromium would paginate as if the full page height is available, then
     * printToPDF would add physical whitespace — causing content to overflow
     * into the margin area on pages 2+.
     */
    @page {
      size: A4;
      margin: 0.5in 0.75in;
    }

    /* Preserve background colours & images (themes, code blocks, etc.) */
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
      background: var(--theme-body, #ffffff) !important;
    }

    .main-container {
      height: auto !important;
      overflow: visible !important;
      display: block !important;
    }

    /* Hide chrome UI */
    .header, .tabs, .font-size-controls, .theme-selector,
    .empty-state, .toc-sidebar, .toc-sidebar.open {
      display: none !important;
      width: 0 !important;
      min-width: 0 !important;
      visibility: hidden !important;
    }

    .editor-pane, .splitter {
      display: none !important;
      width: 0 !important;
      min-width: 0 !important;
      flex: 0 0 0 !important;
    }

    .split-container {
      display: block !important;
      overflow: visible !important;
    }

    .viewer-pane {
      width: 100% !important;
      flex: 1 1 auto !important;
      overflow: visible !important;
    }

    /* Hide interactive resize/drag handles */
    .resize-handle, .drag-handle { display: none !important; }
    .resizable-image:hover, .resizable-mermaid:hover { outline: none !important; }

    #content {
      padding: 0 !important;
      margin: 0 !important;
      height: auto !important;
      overflow: visible !important;
      max-height: none !important;
      background: var(--theme-content, var(--theme-body, #ffffff)) !important;
    }

    #markdown-content {
      max-width: none !important;
      width: 100% !important;
      margin: 0 !important;
      padding: 20px !important;
      height: auto !important;
      overflow: visible !important;
      background: var(--theme-content, var(--theme-body, #ffffff)) !important;
    }

    /* ── Page-break rules ─────────────────────────────────────────────── */

    /* Never orphan a heading: keep at least the next element on the same page */
    h1, h2, h3, h4, h5, h6 {
      break-after: avoid;
      page-break-after: avoid;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    /* Let paragraphs break naturally — forcing avoid causes large whitespace
       gaps when a paragraph is pushed to the next page. Use orphans/widows
       instead to avoid ugly 1-line splits. */
    p {
      orphans: 3;
      widows: 3;
    }

    li {
      orphans: 2;
      widows: 2;
    }

    /* Keep code blocks, blockquotes, and small tables together */
    pre, blockquote {
      break-inside: avoid;
      page-break-inside: avoid;
    }

    /* Tables: allow page breaks between rows, but not inside a row.
       thead repeats on every page so readers always have column headers. */
    table {
      break-inside: auto;
      page-break-inside: auto;
      width: 100% !important;
      max-width: 100% !important;
      border-collapse: collapse !important;
      table-layout: fixed !important;
      box-sizing: border-box !important;
    }

    thead {
      display: table-header-group; /* repeat header on every page */
    }

    tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }

    td, th {
      border: 1px solid rgba(127, 127, 127, 0.45) !important;
      padding: 8px 10px !important;
      text-align: left !important;
      vertical-align: top !important;
      word-wrap: break-word !important;
      overflow-wrap: break-word !important;
      overflow: visible !important;
      box-sizing: border-box !important;
    }

    /* Images: scale to fit the printable width, never split across pages */
    img {
      max-width: 100% !important;
      height: auto !important;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    /* Raw inline SVG (from markdown HTML): scale to printable bounds so
       oversized diagrams do not clip or truncate following content. */
    svg.raw-markdown-svg {
      display: block !important;
      max-width: 100% !important;
      max-height: 220mm !important;
      width: auto !important;
      height: auto !important;
      margin: 0 auto !important;
      overflow: visible !important;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    /* MathJax: keep equations together */
    mjx-container {
      break-inside: avoid;
      page-break-inside: avoid;
      overflow: visible !important;
    }

    /* Mermaid / UML diagrams ─────────────────────────────────────────── */
    /* Cap height so a tall diagram cannot overflow a full A4 page.
       A4 printable height (minus printToPDF margins 0.5+0.5in) ≈ 247mm.
       Using 220mm leaves a little breathing room. */
    .mermaid-diagram,
    .uml-sequence-diagram {
      break-inside: avoid;
      page-break-inside: avoid;
      text-align: center;
      overflow: visible !important;
      max-height: 220mm;
    }

    .mermaid-diagram svg,
    .uml-sequence-diagram svg {
      max-width: 100% !important;
      max-height: 220mm !important;
      width: auto !important;
      height: auto !important;
      display: block !important;
      margin: 0 auto !important;
    }

    /* Code blocks: wrap long lines, never overflow the page width */
    pre {
      white-space: pre-wrap !important;
      word-wrap: break-word !important;
      overflow-wrap: break-word !important;
      max-width: 100% !important;
      overflow: visible !important;
      box-sizing: border-box !important;
    }

    code {
      white-space: pre-wrap !important;
      word-wrap: break-word !important;
      overflow-wrap: break-word !important;
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

  /* Keep raw inline SVGs responsive in the editor/preview pane too. */
  #markdown-content svg.raw-markdown-svg {
    display: block;
    max-width: 100%;
    height: auto;
    margin: 12px auto;
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
  syncFileMenuState();
  initializeTheme();

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
      
      // Resolve all valid dropped files and open them in order
      const validPaths: string[] = [];
      for (const path of candidates) {
        if (!path) continue;
        try {
          const stats = await window.fileWatch.getFileStats(path);
          if (stats.success && !validPaths.includes(path)) {
            validPaths.push(path);
          }
        } catch (err) {
          // Continue to next candidate
        }
      }

      if (validPaths.length > 0) {
        for (let index = 0; index < validPaths.length; index++) {
          await openFilePath(validPaths[index], { activate: index === validPaths.length - 1 });
        }
        if (validPaths.length > 1) {
          showStatus(`Opened ${validPaths.length} files`, 'success');
        }
        return;
      }
      
      // If we have files but couldn't get their paths, offer file picker
      if (files.length > 0 && candidates.length === 0) {
        showStatus('Please select the files you dropped', 'success');
        const picked = await window.filePicker.pickFile();
        if (picked && picked.length > 0) {
          const uniquePicked = Array.from(new Set(picked.filter(Boolean)));
          for (let index = 0; index < uniquePicked.length; index++) {
            await openFilePath(uniquePicked[index], { activate: index === uniquePicked.length - 1 });
          }
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
    // Get current file stats — failure most likely means the file was deleted
    const statsResult = await window.fileWatch.getFileStats(changedFilePath);
    if (!statsResult.success) {
      if (tabIndex === activeTabIndex) {
        showStatus(`"${tab.title}" was deleted or moved`, 'error');
      }
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
