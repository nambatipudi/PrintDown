declare module 'markdown-it-texmath' {
  import type MarkdownIt from 'markdown-it';
  
  interface TexmathOptions {
    engine?: any;
    delimiters?: string;
    katexOptions?: any;
  }
  
  function texmath(md: MarkdownIt, options?: TexmathOptions): void;
  
  export = texmath;
}

// Global augmentation for Window APIs exposed via preload
declare global {
  interface Window {
    fileSystem: {
      readFile: (filePath: string) => Promise<{ success: boolean; content?: string; error?: string }>;
      writeFile: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>;
    };
  }
}

export {}; // Ensure this file is treated as a module
