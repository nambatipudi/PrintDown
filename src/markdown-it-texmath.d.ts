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
