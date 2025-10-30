import { Marked } from 'marked';

// Declare the APIs exposed by preload script
declare global {
  interface Window {
    filePicker: {
      pickFile: () => Promise<string[] | null>;
    };
    fileSystem: {
      readFile: (filePath: string) => Promise<{ success: boolean; content?: string; error?: string }>;
    };
    session: {
      save: (sessionData: any) => Promise<any>;
    };
    printExport: {
      exportPDF: (filePath: string, themeData?: any) => Promise<string | null>;
      print: () => Promise<void>;
    };
    menuEvents: {
      onMenuOpen: (callback: () => void) => void;
      onMenuExportPDF: (callback: () => void) => void;
      onMenuPrint: (callback: () => void) => void;
      onMenuCopyDebugLogs: (callback: () => void) => void;
      onRestoreSession: (callback: (event: any, session: any) => void) => void;
      onOpenFileFromSystem: (callback: (event: any, filePath: string) => void) => void;
    };
    clipboard: {
      writeText: (text: string) => void;
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
  processedContent?: string; // Content after extractMath (with placeholders)
  mathStore?: Map<string, string>; // Store math expressions per tab
  isRendered?: boolean; // Track if tab has been rendered
}

const tabs: Tab[] = [];
let activeTabIndex = -1;

const marked = new Marked({
  breaks: true,
  gfm: true,
  async: false
});

// Declare MathJax window object
declare global {
  interface Window {
    MathJax: any;
  }
}

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
    fontFamily: '"Crimson Pro", "Georgia", "Times New Roman", serif',
    codeFontFamily: '"Fira Code", "Monaco", monospace',
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
    fontFamily: '"JetBrains Mono", "Roboto Mono", "Courier New", monospace',
    codeFontFamily: '"JetBrains Mono", "Roboto Mono", monospace',
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
    fontFamily: '"Inter", -apple-system, sans-serif',
    codeFontFamily: '"Fira Code", monospace',
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
    fontFamily: '"Merriweather", "Georgia", serif',
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
    fontFamily: '"Space Grotesk", -apple-system, sans-serif',
    codeFontFamily: '"JetBrains Mono", monospace',
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
    fontFamily: '"Source Sans 3", -apple-system, sans-serif',
    codeFontFamily: '"Fira Code", monospace',
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
    fontFamily: '"Inter", -apple-system, sans-serif',
    codeFontFamily: '"Roboto Mono", monospace',
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
    fontFamily: '"Spectral", "Georgia", serif',
    codeFontFamily: '"Fira Code", monospace',
    fontSize: '17px',
    lineHeight: '1.8'
  }
};

function applyTheme(themeName: keyof typeof themes) {
  const theme = themes[themeName];
  
  // Only apply theme to the content area, not the whole app
  const content = document.getElementById('content')!;
  content.style.backgroundColor = theme.content;
  
  const mdContent = document.getElementById('markdown-content')!;
  mdContent.style.color = theme.text;
  mdContent.style.fontFamily = theme.fontFamily;
  mdContent.style.fontSize = theme.fontSize;
  mdContent.style.lineHeight = theme.lineHeight;
  
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
  initMermaid(isDarkTheme);
  
  // Save theme preference
  localStorage.setItem('selectedTheme', themeName);
}

// Store for math placeholders
const mathStore: Map<string, string> = new Map();
let mathCounter = 0;

// Mermaid diagram counter
let mermaidCounter = 0;

// Normalize TeX before sending to MathJax (tweak rendering consistency)
function normalizeMathTex(tex: string): string {
  // Prefer \ldots (ellipsis on baseline) for compact dots
  return tex.replace(/\\dots/g, '\\ldots');
}

// Initialize Mermaid
function initMermaid(isDarkTheme: boolean = true) {
  if (window.mermaid) {
    window.mermaid.initialize({
      startOnLoad: false,
      theme: isDarkTheme ? 'dark' : 'default',
      securityLevel: 'loose',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    });
  }
}

// Process Mermaid diagrams
async function processMermaidDiagrams(container: HTMLElement) {
  console.log('[MERMAID] Starting Mermaid diagram processing');
  
  if (!window.mermaid) {
    console.warn('[MERMAID] Mermaid is not loaded yet');
    return;
  }

  // Find all code blocks with language "mermaid"
  const mermaidBlocks = container.querySelectorAll('code.language-mermaid');
  console.log(`[MERMAID] Found ${mermaidBlocks.length} Mermaid diagram blocks`);
  
  for (const block of Array.from(mermaidBlocks)) {
    const pre = block.parentElement;
    if (!pre || pre.tagName !== 'PRE') {
      console.warn('[MERMAID] Mermaid code block has no pre parent, skipping');
      continue;
    }
    
    // Get the diagram code
    const code = block.textContent || '';
    console.log(`[MERMAID] Processing diagram:\n${code}`);
    
    // Create a container for the diagram
    const diagramId = `mermaid-diagram-${mermaidCounter++}`;
    const diagramDiv = document.createElement('div');
    diagramDiv.className = 'mermaid-diagram';
    diagramDiv.id = diagramId;
    diagramDiv.textContent = code;
    
    // Replace the code block with the diagram container
    pre.replaceWith(diagramDiv);
    console.log(`[MERMAID] Replaced code block with diagram container: ${diagramId}`);
  }
  
  // Render all diagrams
  try {
    console.log('[MERMAID] Starting Mermaid.run()');
    await window.mermaid.run({
      querySelector: '.mermaid-diagram'
    });
    console.log('[MERMAID] Mermaid.run() completed successfully');
  } catch (err) {
    console.error('[MERMAID] Mermaid rendering error:', err);
    console.error('[MERMAID] Error details:', JSON.stringify(err, null, 2));
  }
}

// Process UML sequence diagrams
function processUMLSequenceDiagrams(container: HTMLElement) {
  console.log('[UML] Starting UML sequence diagram processing');
  
  if (!window.Diagram) {
    console.warn('[UML] js-sequence-diagrams is not loaded yet');
    return;
  }

  // Find all code blocks with language "uml-sequence-diagram"
  const umlBlocks = container.querySelectorAll('code.language-uml-sequence-diagram');
  console.log(`[UML] Found ${umlBlocks.length} UML sequence diagram blocks`);
  
  for (const block of Array.from(umlBlocks)) {
    const pre = block.parentElement;
    if (!pre || pre.tagName !== 'PRE') {
      console.warn('[UML] UML code block has no pre parent, skipping');
      continue;
    }
    
    // Get the diagram code
    const code = block.textContent || '';
    console.log(`[UML] Processing diagram:\n${code}`);
    
    // Create a container for the diagram
    const diagramDiv = document.createElement('div');
    diagramDiv.className = 'uml-sequence-diagram';
    
    // Replace the code block with the diagram container
    pre.replaceWith(diagramDiv);
    console.log('[UML] Replaced code block with diagram container');
    
    // Render the diagram
    try {
      console.log('[UML] Starting Diagram.parse()');
      const diagram = window.Diagram.parse(code);
      console.log('[UML] Starting drawSVG()');
      diagram.drawSVG(diagramDiv, { theme: 'simple' });
      console.log('[UML] drawSVG() completed successfully');
    } catch (err) {
      console.error('[UML] UML sequence diagram rendering error:', err);
      console.error('[UML] Error details:', JSON.stringify(err, null, 2));
      diagramDiv.textContent = 'Error rendering diagram: ' + (err as Error).message;
    }
  }
  
  console.log('[UML] UML sequence diagram processing complete');
}

// Extract math before markdown processing to prevent escaping
function extractMath(content: string): string {
  mathStore.clear();
  mathCounter = 0;
  
  // Handle bracket-wrapped math on separate lines: [ \n $ math $ \n ]
  // Join them into one line: [ $ math $ ]
  content = content.replace(/\[\s*\n\s*(\$[^$]+?\$)\s*\n\s*\]/g, '[ $1 ]');
  
  // Extract ```math code blocks (GitHub style) and convert to $$
  content = content.replace(/```math\s*\n([\s\S]+?)\n```/g, (match, mathContent) => {
    const id = `MATH_DISPLAY_${mathCounter++}`;
    mathStore.set(id, `$$${normalizeMathTex(mathContent)}$$`);
    return id;
  });
  
  // Extract display math $$...$$ and \[...\]
  content = content.replace(/\$\$([\s\S]+?)\$\$/g, (match) => {
    const id = `MATH_DISPLAY_${mathCounter++}`;
    mathStore.set(id, normalizeMathTex(match));
    return id;
  });
  
  content = content.replace(/\\\[([\s\S]+?)\\\]/g, (match) => {
    const id = `MATH_DISPLAY_${mathCounter++}`;
    mathStore.set(id, normalizeMathTex(match));
    return id;
  });
  
  // Extract inline math with parentheses ( ... ) (GitHub/VS Code style)
  // Only match if preceded by whitespace or start of line
  content = content.replace(/(^|[\ \t\n\r])(\(\s*\\?[a-zA-Z\\{][^\(\)]*?\s*\))/g, (match, prefix, mathContent) => {
    // Check if it looks like math (contains backslash or math symbols)
    if (mathContent.includes('\\') || mathContent.match(/[\\{}\^_]/)) {
      const id = `MATH_INLINE_${mathCounter++}`;
      // Convert to $ syntax
      const cleaned = mathContent.replace(/^\(\s*/, '').replace(/\s*\)$/, '');
      mathStore.set(id, `$${cleaned}$`);
      return prefix + id;
    }
    return match;
  });
  
  // Extract inline math $...$ (allow any content except dollar signs)
  // Use non-greedy matching to get the shortest span
  content = content.replace(/\$([^\$]+?)\$/g, (match) => {
    const id = `MATH_INLINE_${mathCounter++}`;
    mathStore.set(id, match);
    return id;
  });
  
  // Extract inline math \(...\) (LaTeX style)
  content = content.replace(/\\\((.+?)\\\)/g, (match) => {
    const id = `MATH_INLINE_${mathCounter++}`;
    mathStore.set(id, match);
    return id;
  });
  
  return content;
}

// Restore math after markdown processing
function restoreMath(html: string): string {
  mathStore.forEach((math, id) => {
    html = html.replace(id, math);
  });
  return html;
}

async function renderTab(index: number) {
  activeTabIndex = index;
  const tab = tabs[index];
  
  if (!tab) return;

  const contentDiv = document.getElementById('markdown-content')!;
  const emptyState = document.querySelector('.empty-state') as HTMLElement;
  
  // If tab hasn't been processed yet, extract math and store it per-tab
  if (!tab.processedContent) {
    console.log('[MATH] Starting math extraction for tab');
    
    // Create a temporary store for this tab's math
    const tempMathStore: Map<string, string> = new Map();
    let tempCounter = 0;
    
    // Extract math with a custom implementation that doesn't use global store
    let content = tab.content;
    
    // Handle bracket-wrapped math on separate lines: [ \n $ math $ \n ]
    // Join them into one line: [ $ math $ ]
    const beforeBracketFix = content;
    content = content.replace(/\[\s*\n\s*(\$[^$]+?\$)\s*\n\s*\]/g, (match, mathContent) => {
      console.log('[MATH] Found bracket-wrapped math on separate lines:', match);
      return `[ ${mathContent} ]`;
    });

    // Extract square bracket inline math: [ $...$ ] (VS Code style display math)
    // Do this BEFORE generic inline $...$ extraction so the inner dollars are not consumed first
    content = content.replace(/\[\s*\$([^$]+?)\$\s*\]/g, (match, mathContent) => {
      const id = `MATH_DISPLAY_${tempCounter++}`;
      tempMathStore.set(id, `$$${normalizeMathTex(mathContent)}$$`);
      console.log(`[MATH] Extracted square bracket math [${id}]:`, mathContent);
      // Wrap in HTML comment so Marked doesn't process or remove it
      return `<!-- ${id} -->`;
    });
    
    // Extract ```math code blocks (GitHub style) and convert to $$
    content = content.replace(/```math\s*\n([\s\S]+?)\n```/g, (match, mathContent) => {
      const id = `MATH_DISPLAY_${tempCounter++}`;
      tempMathStore.set(id, `$$${normalizeMathTex(mathContent)}$$`);
      console.log(`[MATH] Extracted math code block [${id}]:`, mathContent);
      // Wrap in HTML comment so Marked doesn't process or remove it
      return `<!-- ${id} -->`;
    });
    
    // Extract display math $$...$$ and \[...\]
    content = content.replace(/\$\$([\s\S]+?)\$\$/g, (match, mathContent) => {
      const id = `MATH_DISPLAY_${tempCounter++}`;
      tempMathStore.set(id, normalizeMathTex(match));
      console.log(`[MATH] Extracted display math $$ [${id}]:`, mathContent);
      // Wrap in HTML comment so Marked doesn't process or remove it
      return `<!-- ${id} -->`;
    });
    
    content = content.replace(/\\\[([\s\S]+?)\\\]/g, (match, mathContent) => {
      const id = `MATH_DISPLAY_${tempCounter++}`;
      tempMathStore.set(id, normalizeMathTex(match));
      console.log(`[MATH] Extracted display math \\[ [${id}]:`, mathContent);
      // Wrap in HTML comment so Marked doesn't process or remove it
      return `<!-- ${id} -->`;
    });
    
    // Extract inline math with parentheses ( ... ) (GitHub/VS Code style)
    // Only match if preceded by whitespace or start of line
    content = content.replace(/(^|[\ \t\n\r])(\(\s*\\?[a-zA-Z\\{][^\(\)]*?\s*\))/g, (match, prefix, mathContent) => {
      // Check if it looks like math (contains backslash or math symbols)
      if (mathContent.includes('\\') || mathContent.match(/[\\{}\^_]/)) {
        const id = `MATH_INLINE_${tempCounter++}`;
        // Convert to $ syntax
        const cleaned = mathContent.replace(/^\(\s*/, '').replace(/\s*\)$/, '');
        tempMathStore.set(id, normalizeMathTex(`$${cleaned}$`));
        console.log(`[MATH] Extracted inline math ( ... ) [${id}]:`, cleaned);
        // Wrap in HTML comment so Marked doesn't process or remove it
        return prefix + `<!-- ${id} -->`;
      }
      return match;
    });
    
    // Extract inline math $...$ (only if it contains LaTeX commands or math operators)
    // Use non-greedy matching to get the shortest span
    // Skip plain numbers or text without math symbols
    content = content.replace(/\$([^\$]+?)\$/g, (match, mathContent) => {
      // Skip if this contains nested dollar signs (already processed math)
      if (mathContent.includes('$')) {
        console.log(`[MATH] Skipped nested $ in:`, mathContent);
        return match;
      }
      
      // Only treat as math if it contains:
      // - backslash (LaTeX commands like \times, \div, \text, \dots, etc.)
      // - math operators (×, ÷, ≠, ≤, ≥)
      // - subscripts/superscripts (^, _)
      // - grouping (braces {})
      // - complex expressions with spaces and operators
      const isMath = mathContent.includes('\\') || 
                     mathContent.match(/[×÷≠≤≥\+\-\*\/=<>≤≥±∞∫∑∏√]/) ||
                     mathContent.includes('^') || 
                     mathContent.includes('_') ||
                     mathContent.includes('{') ||
                     (/\s/.test(mathContent) && /[+\-×÷=]/.test(mathContent));
      
      if (isMath) {
        const id = `MATH_INLINE_${tempCounter++}`;
        tempMathStore.set(id, normalizeMathTex(match));
        console.log(`[MATH] Extracted inline math $ [${id}]:`, mathContent);
        // Wrap in HTML comment so Marked doesn't process or remove it
        return `<!-- ${id} -->`;
      } else {
        // Not math - don't extract, just return as-is
        console.log(`[MATH] Skipped non-math $:`, mathContent);
        return match;
      }
    });
    
    // Extract inline math \(...\) (LaTeX style)
    content = content.replace(/\\\((.+?)\\\)/g, (match, mathContent) => {
      const id = `MATH_INLINE_${tempCounter++}`;
      tempMathStore.set(id, normalizeMathTex(match));
      console.log(`[MATH] Extracted inline math \\( ... \\) [${id}]:`, mathContent);
      // Wrap in HTML comment so Marked doesn't process or remove it
      return `<!-- ${id} -->`;
    });
    
    // (square bracket math extracted earlier)
    
    console.log(`[MATH] Extraction complete. Total math expressions: ${tempMathStore.size}`);
    console.log('[MATH] Math store contents:', Array.from(tempMathStore.entries()));
    
    tab.processedContent = content;
    tab.mathStore = tempMathStore;
  }
  
  // Process markdown
  console.log('[MARKDOWN] Starting Marked.parse()');
  let html = marked.parse(tab.processedContent) as string;
  
  // Restore math from this tab's store
  if (tab.mathStore) {
    console.log('[MATH] Starting math restoration');
    console.log(`[MATH] Restoring ${tab.mathStore.size} math expressions`);
    
    // Debug: log a sample of the HTML to see what Marked produced
    const htmlSample = html.substring(0, 500);
    console.log('[MATH] HTML sample after Marked (first 500 chars):', htmlSample);
    
    let restoredCount = 0;
    let failedCount = 0;
    tab.mathStore.forEach((math, id) => {
      // Try multiple patterns: HTML comment wrapper, plain ID, HTML-encoded ID, etc.
      const patterns = [
        new RegExp(`<!--\\s*${id}\\s*-->`, 'g'),  // HTML comment wrapper (our new format)
        new RegExp(id, 'g'),  // Plain ID (old format, for backward compatibility)
        new RegExp(id.replace(/_/g, '&#95;'), 'g'),  // Underscores HTML-encoded
        new RegExp(`<code>${id}</code>`, 'g'),  // ID in code tags
        new RegExp(`&lt;${id}&gt;`, 'g'),  // ID in escaped tags
      ];
      
      let restored = false;
      for (const regex of patterns) {
        const beforeRestore = html;
        html = html.replace(regex, math);
        if (beforeRestore !== html) {
          restored = true;
          break;
        }
      }
      
      if (restored) {
        restoredCount++;
        console.log(`[MATH] Restored [${id}]:`, math.substring(0, 50) + (math.length > 50 ? '...' : ''));
      } else {
        failedCount++;
        // Check if the ID appears in the HTML at all (even if we can't replace it)
        const found = html.includes(id) || html.includes(`<!-- ${id} -->`) || html.includes(id.replace(/_/g, '&#95;'));
        console.warn(`[MATH] Failed to restore [${id}], not found in HTML. ID appears (plain): ${html.includes(id)}, ID appears (comment): ${html.includes(`<!-- ${id} -->`)}`);
        if (!found && tab.mathStore) {
          // Log a sample of where similar IDs might be
          const similarIds = Array.from(tab.mathStore.keys()).slice(0, 5);
          console.warn(`[MATH] Sample IDs in store:`, similarIds);
        }
      }
    });
    console.log(`[MATH] Restoration complete: ${restoredCount} restored, ${failedCount} failed`);
  }
  
  // Post-restoration check: look for any remaining unrendered math
  // This catches cases where markdown processing might have escaped math
  const suspiciousMath = html.match(/\\?\\[\[(.*?)\\\]\\]/g) || html.match(/\[\\?\$.*?\\?\$\]/g);
  if (suspiciousMath && suspiciousMath.length > 0) {
    console.warn('[MATH] Found potentially escaped/unrendered math after restoration:');
    suspiciousMath.forEach(m => console.warn('  -', m));
  }
  
  // Convert relative image paths to use the custom protocol
  // This allows Electron to load images from the same directory as the markdown file
  if (tab.filePath) {
    // Get directory path (handle both / and \ as separators)
    const pathParts = tab.filePath.split(/[/\\]/);
    pathParts.pop(); // Remove filename
    const baseDir = pathParts.join('/'); // Rejoin with forward slashes
    console.log('[IMAGE] Base directory:', baseDir);
    
    html = html.replace(/<img([^>]*?)src="([^"]*?)"/g, (match, attrs, src) => {
      // Skip absolute URLs (http://, https://, data:, printdown:)
      if (src.match(/^(https?:|data:|printdown:)/)) {
        return match;
      }
      
      // For relative paths, convert to absolute using the custom protocol
      const absolutePath = `${baseDir}/${src}`.replace(/\/+/g, '/'); // Normalize multiple slashes
      // Remove any leading slashes from absolutePath as the protocol already provides them
      const cleanPath = absolutePath.replace(/^\/+/, '');
      const imageUrl = `printdown:///${cleanPath}`;
      console.log('[IMAGE] Converting:', src, '→', imageUrl);
      // Add error handler to debug image loading issues
      return `<img${attrs}src="${imageUrl}" onerror="console.error('[IMAGE] Failed to load:', this.src); console.error('[IMAGE] Error details:', event);"`;
    });
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

    // Process UML sequence diagrams
    processUMLSequenceDiagrams(contentDiv);

    // Typeset math with MathJax
    if (window.MathJax && window.MathJax.typesetPromise) {
      try {
        console.log('[MATHJAX] Starting MathJax.typesetPromise()');
        console.log('[MATHJAX] MathJax version:', window.MathJax.version);
        console.log('[MATHJAX] Content div has HTML length:', contentDiv.innerHTML.length);
        
        await window.MathJax.typesetPromise([contentDiv]);
        console.log('[MATHJAX] typesetPromise completed');
        
        // Give MathJax a bit more time to complete DOM updates
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Log information about what was rendered
        const mathContainers = contentDiv.querySelectorAll('mjx-container');
        console.log(`[MATHJAX] Successfully rendered ${mathContainers.length} math expressions`);
        mathContainers.forEach((container, index) => {
          const content = container.textContent || '';
          console.log(`[MATHJAX] Rendered math [${index}]:`, content);
        });
        
        // Check for any text that might look like unrendered math
        const mathElements = contentDiv.querySelectorAll('.MathJax, mjx-container');
        const allText = contentDiv.textContent || '';
        const suspiciousPatterns = allText.match(/[\\][\w\{\}^_]+/g);
        if (suspiciousPatterns && suspiciousPatterns.length > 0) {
          console.warn('[MATHJAX] Found potential unrendered LaTeX commands:', suspiciousPatterns);
        }
      } catch (err) {
        console.error('[MATHJAX] MathJax typeset error:', err);
        console.error('[MATHJAX] Error details:', JSON.stringify(err, null, 2));
      }
    } else {
      console.warn('[MATHJAX] MathJax not available or typesetPromise not found');
      console.warn('[MATHJAX] window.MathJax:', window.MathJax);
    }
    
  
  
  // Apply current theme
  const themeSelect = document.getElementById('theme-select') as HTMLSelectElement;
  if (themeSelect) {
    applyTheme(themeSelect.value as keyof typeof themes);
  }

  updateTabUI();
  saveSession();
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
    const key = `imageSize:${img.src}`;

    // Determine initial width percent (saved or image natural percent)
    const containerEl = container as HTMLElement;
    const containerWidth = containerEl.clientWidth || 1;

    // Use saved percent if available
    const saved = localStorage.getItem(key);
    let percent = saved ? parseFloat(saved) : Math.min(100, Math.round((img.clientWidth / containerWidth) * 100));
    if (!isFinite(percent) || percent <= 0) percent = 100;

    // Move the image into wrapper
    img.replaceWith(wrapper);
    wrapper.appendChild(img);
    wrapper.style.width = `${percent}%`;
    (wrapper as any)._imgKey = key;

    // Add resize handle
    const handle = document.createElement('div');
    handle.className = 'resize-handle';
    wrapper.appendChild(handle);

    let isResizing = false;
    let startX = 0;
    let startWidthPx = 0;

    const onMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const dx = e.clientX - startX;
      const newWidthPx = Math.max(50, startWidthPx + dx);
      const parentWidth = containerEl.clientWidth || 1;
      let newPercent = (newWidthPx / parentWidth) * 100;
      newPercent = Math.max(20, Math.min(150, newPercent)); // 20%–150%
      wrapper.style.width = `${newPercent}%`;
    };
    const onMouseUp = () => {
      if (!isResizing) return;
      isResizing = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      // Persist
      const parentWidth = containerEl.clientWidth || 1;
      const widthPx = wrapper.getBoundingClientRect().width;
      const savePercent = Math.max(1, Math.min(500, (widthPx / parentWidth) * 100));
      localStorage.setItem(key, savePercent.toFixed(2));
    };

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      isResizing = true;
      startX = e.clientX;
      startWidthPx = wrapper.getBoundingClientRect().width;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });

    // Double-click to reset
    wrapper.addEventListener('dblclick', () => {
      wrapper.style.width = '100%';
      localStorage.removeItem(key);
    });
  });
}

function updateTabUI() {
  const tabsContainer = document.getElementById('tabs')!;
  tabsContainer.innerHTML = '';

  tabs.forEach((tab, index) => {
    const tabEl = document.createElement('div');
    tabEl.className = 'tab' + (index === activeTabIndex ? ' active' : '');
    tabEl.innerHTML = `
      <span>${tab.title}</span>
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
  tabs.splice(index, 1);
  
  if (tabs.length === 0) {
    activeTabIndex = -1;
    const contentDiv = document.getElementById('markdown-content')!;
    const emptyState = document.querySelector('.empty-state') as HTMLElement;
    contentDiv.style.display = 'none';
    emptyState.style.display = 'flex';
  } else if (index === activeTabIndex) {
    renderTab(Math.min(index, tabs.length - 1));
  } else if (index < activeTabIndex) {
    activeTabIndex--;
  }
  
  updateTabUI();
  saveSession();
}

function closeAllTabs() {
  tabs.splice(0, tabs.length);
  activeTabIndex = -1;
  const contentDiv = document.getElementById('markdown-content')!;
  const emptyState = document.querySelector('.empty-state') as HTMLElement;
  contentDiv.style.display = 'none';
  emptyState.style.display = 'flex';
  updateTabUI();
  saveSession();
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

      tabs.push({
        filePath: filePath,
        content: fileResult.content!,
        title: filePath.split(/[/\\]/).pop() || 'Untitled'
      });

      renderTab(tabs.length - 1);
    }
  } catch (error) {
    console.error('Error opening file:', error);
  }
}

function saveSession() {
  window.session.save({
    openFiles: tabs.map(t => t.filePath),
    activeIndex: activeTabIndex
  });
}

async function exportPDF() {
  if (activeTabIndex >= 0) {
    const tab = tabs[activeTabIndex];
    
    // Get the current theme data
    const themeSelect = document.getElementById('theme-select') as HTMLSelectElement;
    const currentTheme = themes[themeSelect.value as keyof typeof themes];
    
    const savePath = await window.printExport.exportPDF(tab.filePath, currentTheme);
    
    if (savePath) {
      // PDF saved successfully
      console.log('PDF saved to:', savePath);
    }
  }
}

function print() {
  if (activeTabIndex >= 0) {
    window.print();
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
window.menuEvents.onMenuPrint(print);
window.menuEvents.onMenuCopyDebugLogs(copyDebugLogs);

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
        // Open as new tab
        tabs.push({
          filePath,
          content: fileResult.content,
          title: filePath.split(/[\\/]/).pop() || 'Untitled'
        });
        await renderTab(tabs.length - 1);
        updateTabUI();
      }
    }
  } catch (error) {
    console.error('Error opening file from system:', error);
  }
});

window.menuEvents.onRestoreSession(async (_event: any, session: any) => {
  if (session.openFiles && session.openFiles.length > 0) {
    for (const filePath of session.openFiles) {
      try {
        const fileResult = await window.fileSystem.readFile(filePath);
        if (fileResult.success) {
          tabs.push({
            filePath,
            content: fileResult.content!,
            title: filePath.split(/[/\\]/).pop() || 'Untitled'
          });
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

// Initialize theme selector
const themeSelect = document.getElementById('theme-select') as HTMLSelectElement;
if (themeSelect) {
  // Load saved theme
  const savedTheme = localStorage.getItem('selectedTheme') || 'dark';
  themeSelect.value = savedTheme;
  
  // Initialize Mermaid with theme before applying theme
  const isDarkTheme = ['dark', 'nord', 'dracula', 'monokai', 'terminal', 'oceanic', 'cyberpunk', 'forest'].includes(savedTheme);
  initMermaid(isDarkTheme);
  
  applyTheme(savedTheme as keyof typeof themes);
  
  // Listen for theme changes
  themeSelect.addEventListener('change', () => {
    applyTheme(themeSelect.value as keyof typeof themes);
  });
}

// Font size management with scaling factor
let fontSizeFactor = 1.0; // Default scale factor
const MIN_FACTOR = 0.5;   // Minimum 50% of base size
const MAX_FACTOR = 2.0;   // Maximum 200% of base size
const STEP = 0.05;        // 5% change per click

function applyFontSizeFactor(factor: number) {
  const mdContent = document.getElementById('markdown-content');
  if (!mdContent) return;
  
  // Apply the scaling factor directly to font-size
  const baseFontSize = 16; // Base font size in pixels
  const scaledSize = baseFontSize * factor;
  mdContent.style.fontSize = `${scaledSize}px`;
  
  // Save to localStorage
  localStorage.setItem('fontSizeFactor', factor.toString());
}

// Initialize font size controls
const decreaseFontBtn = document.getElementById('decrease-font');
const resetFontBtn = document.getElementById('reset-font');
const increaseFontBtn = document.getElementById('increase-font');

// Image scaling controls
let imageScaleFactor = 1.0;
const IMG_MIN = 0.3;
const IMG_MAX = 2.0;
const IMG_STEP = 0.1;

function applyImageScaleFactor(factor: number) {
  document.documentElement.style.setProperty('--image-scale', factor.toString());
  localStorage.setItem('imageScaleFactor', factor.toString());
}

const decreaseImageBtn = document.getElementById('decrease-image');
const resetImageBtn = document.getElementById('reset-image');
const increaseImageBtn = document.getElementById('increase-image');

if (decreaseFontBtn && resetFontBtn && increaseFontBtn) {
  // Load saved font size factor
  const savedFactor = localStorage.getItem('fontSizeFactor');
  if (savedFactor !== null) {
    fontSizeFactor = parseFloat(savedFactor);
    applyFontSizeFactor(fontSizeFactor);
  } else {
    applyFontSizeFactor(fontSizeFactor);
  }
  
  // Decrease font size
  decreaseFontBtn.addEventListener('click', () => {
    if (fontSizeFactor > MIN_FACTOR) {
      fontSizeFactor = Math.max(MIN_FACTOR, fontSizeFactor - STEP);
      applyFontSizeFactor(fontSizeFactor);
    }
  });
  
  // Reset font size to default (1.0)
  resetFontBtn.addEventListener('click', () => {
    fontSizeFactor = 1.0;
    applyFontSizeFactor(fontSizeFactor);
  });
  
  // Increase font size
  increaseFontBtn.addEventListener('click', () => {
    if (fontSizeFactor < MAX_FACTOR) {
      fontSizeFactor = Math.min(MAX_FACTOR, fontSizeFactor + STEP);
      applyFontSizeFactor(fontSizeFactor);
    }
  });
}

// Wire image size controls
if (decreaseImageBtn && resetImageBtn && increaseImageBtn) {
  const savedImg = localStorage.getItem('imageScaleFactor');
  if (savedImg !== null) {
    imageScaleFactor = parseFloat(savedImg);
  }
  applyImageScaleFactor(imageScaleFactor);

  decreaseImageBtn.addEventListener('click', () => {
    if (imageScaleFactor > IMG_MIN) {
      imageScaleFactor = Math.max(IMG_MIN, Math.round((imageScaleFactor - IMG_STEP) * 100) / 100);
      applyImageScaleFactor(imageScaleFactor);
    }
  });

  resetImageBtn.addEventListener('click', () => {
    imageScaleFactor = 1.0;
    applyImageScaleFactor(imageScaleFactor);
  });

  increaseImageBtn.addEventListener('click', () => {
    if (imageScaleFactor < IMG_MAX) {
      imageScaleFactor = Math.min(IMG_MAX, Math.round((imageScaleFactor + IMG_STEP) * 100) / 100);
      applyImageScaleFactor(imageScaleFactor);
    }
  });
}

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
    }
    
    .header { display: none !important; }
    .tabs { display: none !important; }
    .font-size-controls { display: none !important; }
    .theme-selector { display: none !important; }
    .empty-state { display: none !important; }
    
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
    display: inline-block;
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
  const dropZone = document.body;

  // Prevent default drag behaviors on the entire document
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    document.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
    }, false);
  });

  // Track drag depth to handle nested elements
  let dragDepth = 0;

  // Visual feedback when dragging over the window
  dropZone.addEventListener('dragenter', (e) => {
    dragDepth++;
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', (e) => {
    dragDepth--;
    if (dragDepth === 0) {
      dropZone.classList.remove('drag-over');
    }
  });

  dropZone.addEventListener('drop', async (e) => {
    // Reset drag state
    dragDepth = 0;
    dropZone.classList.remove('drag-over');

    // Get dropped files
    const files = Array.from(e.dataTransfer?.files || []);
    
    // Filter for Markdown files
    const markdownFiles = files.filter(file => 
      file.name.endsWith('.md') || file.name.endsWith('.markdown')
    );

    // Open each Markdown file
    for (const file of markdownFiles) {
      try {
        const filePath = (file as any).path; // Electron adds 'path' property to File objects
        
        if (filePath) {
          const fileResult = await window.fileSystem.readFile(filePath);
          if (fileResult.success && fileResult.content) {
            // Check if file is already open
            const existingIndex = tabs.findIndex(tab => tab.filePath === filePath);
            if (existingIndex !== -1) {
              // Switch to existing tab (only for the last file)
              if (file === markdownFiles[markdownFiles.length - 1]) {
                await renderTab(existingIndex);
                updateTabUI();
              }
            } else {
              // Open as new tab
              tabs.push({
                filePath,
                content: fileResult.content,
                title: filePath.split(/[\\/]/).pop() || 'Untitled'
              });
              // Only render the last tab to avoid multiple renders
              if (file === markdownFiles[markdownFiles.length - 1]) {
                await renderTab(tabs.length - 1);
                updateTabUI();
              }
            }
          }
        }
      } catch (error) {
        console.error('Error opening dropped file:', error);
      }
    }

    // Render all tabs if multiple were added
    if (markdownFiles.length > 1) {
      updateTabUI();
    }

    // Show message if non-Markdown files were dropped
    if (markdownFiles.length === 0 && files.length > 0) {
      console.warn('Only .md and .markdown files are supported');
      // You could show a user-friendly notification here
    }
  });
});
