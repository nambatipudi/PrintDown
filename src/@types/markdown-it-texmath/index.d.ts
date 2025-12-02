import type MarkdownIt from 'markdown-it';

interface TexmathOptions {
  engine?: any;
  delimiters?: string;
  katexOptions?: any;
}

declare function texmath(md: MarkdownIt, options?: TexmathOptions): void;

export default texmath;
