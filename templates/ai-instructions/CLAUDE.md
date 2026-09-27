# PrintDown Markdown Authoring Instructions

Use this file as `CLAUDE.md` in a project whose Markdown will be opened or
exported by PrintDown.

When creating or editing Markdown:

- Start each document with exactly one `#` title and use heading levels in
  order without skipping levels.
- Use standard Markdown for emphasis, lists, task lists, tables, links, and
  fenced code blocks. Always put a language after a code fence.
- Use `$...$` for inline mathematics and `$$...$$` for display mathematics.
  MathJax supports the `ams`, `mathtools`, `color`, `cancel`, `bbox`, `mhchem`,
  and `physics` packages.
- Use `mermaid` fenced blocks for Mermaid diagrams. Keep diagrams below about
  220 mm tall and split complex diagrams into smaller ones.
- Use `xml` fenced blocks with a standalone `<mxGraphModel>` for Draw.io
  diagrams. Use `uml-sequence-diagram` fenced blocks for UML sequence diagrams.
- Reference images with relative paths where possible. PNG, JPG, GIF, WebP,
  and SVG are supported. Keep images below about 186 mm wide for A4 PDF output.
- Inline HTML is limited to safe presentation elements such as `div`, `span`,
  `details`, `summary`, `table`, `img`, `br`, `sup`, `sub`, `mark`, `kbd`,
  `abbr`, `p`, `ul`, `ol`, and `li`.
- Never generate `<script>` tags, event handler attributes such as `onclick`
  or `onerror`, or `javascript:` URLs. PrintDown removes unsafe HTML.
- Use `---` for horizontal rules. Do not use footnotes, definition lists,
  `[toc]` directives, emoji shortcodes, or admonition-block syntax because
  they are not supported consistently.
- Keep code lines under about 100 characters and tables narrow enough to fit
  an A4 page. Break very large tables or diagrams into smaller sections.

Prefer clean, portable Markdown. Do not rely on color, custom CSS, JavaScript,
or unsupported extensions to communicate essential meaning.
