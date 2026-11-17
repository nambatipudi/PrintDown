/**
 * EPUB export regression tests.
 * Covers: single-file export via the File menu, archive structure/validity,
 * image embedding, and Tools folder conversion to EPUB.
 */
import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import { createServer, type Server } from 'http';
import * as os from 'os';
import * as path from 'path';
import sharp from 'sharp';
import { launchApp, openFile, sendMenuEvent, waitForContent } from './helpers/app';

function listArchiveEntries(epubPath: string): string[] {
  return execFileSync('unzip', ['-Z1', epubPath], { encoding: 'utf-8' })
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

function readArchiveEntry(epubPath: string, entry: string): string {
  return execFileSync('unzip', ['-p', epubPath, entry], { encoding: 'utf-8' });
}

/** Parse an archive entry with xmllint; throws if the XML is not well formed. */
function assertWellFormedXml(epubPath: string, entry: string): void {
  const content = execFileSync('unzip', ['-p', epubPath, entry]);
  execFileSync('xmllint', ['--noout', '-'], { input: content, stdio: ['pipe', 'pipe', 'pipe'] });
}

/** A 1x1 transparent PNG, small enough to inline. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function startImageServer(): Promise<{ server: Server; source: string }> {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'image/png' });
    response.end(TINY_PNG);
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Image test server did not expose a TCP port'));
        return;
      }
      resolve({ server, source: `http://127.0.0.1:${address.port}/dot.png` });
    });
  });
}

function stopServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
}

test('File menu export writes a valid EPUB archive', async () => {
  const workDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'printdown-epub-'));
  const markdownPath = path.join(workDirectory, 'book.md');
  const epubPath = path.join(workDirectory, 'book.epub');
  fs.writeFileSync(
    markdownPath,
    '# Chapter One\n\nHello **world**.\n\n# Chapter Two\n\nSecond section with `code`.\n',
    'utf-8',
  );

  const { app, page } = await launchApp({ epubExportPath: epubPath });
  try {
    await openFile(app, markdownPath);
    await waitForContent(page);
    await sendMenuEvent(app, 'menu-export-epub');
    await expect.poll(() => fs.existsSync(epubPath), { timeout: 20_000 }).toBe(true);

    const entries = listArchiveEntries(epubPath);
    expect(entries[0]).toBe('mimetype');
    expect(entries).toContain('META-INF/container.xml');
    expect(entries).toContain('OEBPS/content.opf');
    expect(entries).toContain('OEBPS/nav.xhtml');
    expect(entries).toContain('OEBPS/toc.ncx');

    expect(readArchiveEntry(epubPath, 'mimetype')).toBe('application/epub+zip');

    const opf = readArchiveEntry(epubPath, 'OEBPS/content.opf');
    expect(opf).toContain('<dc:title>Chapter One</dc:title>');
    expect(opf).toContain('idref="chapter-2"');

    // Each top-level heading becomes its own spine item.
    expect(entries).toContain('OEBPS/text/chapter-1.xhtml');
    expect(entries).toContain('OEBPS/text/chapter-2.xhtml');
    expect(readArchiveEntry(epubPath, 'OEBPS/text/chapter-2.xhtml')).toContain('Chapter Two');
  } finally {
    await app.close();
    fs.rmSync(workDirectory, { recursive: true, force: true });
  }
});

/** Run a single-document EPUB export and hand the archive path to the assertions. */
async function exportEpub(
  markdown: string,
  assertions: (epubPath: string, page: Page) => Promise<void>,
  { fileName = 'doc', extraFiles = {} as Record<string, Buffer | string> } = {},
): Promise<void> {
  const workDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'printdown-epub-'));
  const markdownPath = path.join(workDirectory, `${fileName}.md`);
  const epubPath = path.join(workDirectory, `${fileName}.epub`);
  for (const [name, contents] of Object.entries(extraFiles)) {
    fs.writeFileSync(path.join(workDirectory, name), contents as never);
  }
  fs.writeFileSync(markdownPath, markdown, 'utf-8');

  const { app, page } = await launchApp({ epubExportPath: epubPath });
  try {
    await openFile(app, markdownPath);
    await waitForContent(page);
    await sendMenuEvent(app, 'menu-export-epub');
    await expect.poll(() => fs.existsSync(epubPath), { timeout: 30_000 }).toBe(true);
    await assertions(epubPath, page);
  } finally {
    await app.close();
    fs.rmSync(workDirectory, { recursive: true, force: true });
  }
}

test('EPUB export embeds referenced images as archive resources', async () => {  const workDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'printdown-epub-img-'));
  const markdownPath = path.join(workDirectory, 'with-image.md');
  const epubPath = path.join(workDirectory, 'with-image.epub');
  fs.writeFileSync(
    path.join(workDirectory, 'dot.png'),
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    ),
  );
  fs.writeFileSync(markdownPath, '# Illustrated\n\n![dot](./dot.png)\n', 'utf-8');

  const { app, page } = await launchApp({ epubExportPath: epubPath });
  try {
    await openFile(app, markdownPath);
    await waitForContent(page);
    await sendMenuEvent(app, 'menu-export-epub');
    await expect.poll(() => fs.existsSync(epubPath), { timeout: 20_000 }).toBe(true);

    const entries = listArchiveEntries(epubPath);
    const imageEntry = entries.find(entry => entry.startsWith('OEBPS/images/'));
    expect(imageEntry).toBeTruthy();
    expect(readArchiveEntry(epubPath, 'OEBPS/content.opf')).toContain('media-type="image/png"');
    expect(readArchiveEntry(epubPath, 'OEBPS/text/chapter-1.xhtml')).toContain('../images/');
  } finally {
    await app.close();
    fs.rmSync(workDirectory, { recursive: true, force: true });
  }
});

test('EPUB export embeds remote images without CORS response headers', async () => {
  const { server, source } = await startImageServer();
  try {
    await exportEpub(
      `# Remote illustration\n\n![dot](${source})\n`,
      async (epubPath) => {
        const entries = listArchiveEntries(epubPath);
        const imageEntry = entries.find(entry => entry.startsWith('OEBPS/images/'));
        expect(imageEntry).toBeTruthy();

        const chapter = readArchiveEntry(epubPath, 'OEBPS/text/chapter-1.xhtml');
        expect(chapter).toContain(`../images/${path.basename(imageEntry!)}`);
        expect(readArchiveEntry(epubPath, 'OEBPS/content.opf')).toContain('media-type="image/png"');
      },
      { fileName: 'remote-image' },
    );
  } finally {
    await stopServer(server);
  }
});

test('EPUB export converts WebP and AVIF images to portable PNG resources', async () => {
  const source = {
    create: {
      width: 2,
      height: 2,
      channels: 4 as const,
      background: { r: 12, g: 34, b: 56, alpha: 1 },
    },
  };
  const [webp, avif] = await Promise.all([
    sharp(source).webp().toBuffer(),
    sharp(source).avif().toBuffer(),
  ]);

  await exportEpub(
    '# Portable images\n\n![webp](./sample.webp)\n\n![avif](./sample.avif)\n',
    async (epubPath) => {
      const imageEntries = listArchiveEntries(epubPath)
        .filter(entry => entry.startsWith('OEBPS/images/'));
      expect(imageEntries).toHaveLength(2);
      expect(imageEntries.every(entry => entry.endsWith('.png'))).toBe(true);

      const opf = readArchiveEntry(epubPath, 'OEBPS/content.opf');
      expect(opf.match(/media-type="image\/png"/g)).toHaveLength(2);

      for (const imageEntry of imageEntries) {
        const metadata = await sharp(execFileSync('unzip', ['-p', epubPath, imageEntry])).metadata();
        expect(metadata.format).toBe('png');
      }
    },
    {
      fileName: 'portable-images',
      extraFiles: {
        'sample.webp': webp,
        'sample.avif': avif,
      },
    },
  );
});

test('Tools folder conversion produces an EPUB per Markdown file', async () => {
  const rootDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'printdown-tools-epub-'));
  const firstMarkdown = path.join(rootDirectory, 'first.md');
  const secondMarkdown = path.join(rootDirectory, 'second.md');
  fs.writeFileSync(firstMarkdown, '# First conversion', 'utf-8');
  fs.writeFileSync(secondMarkdown, '# Second conversion', 'utf-8');

  const { app, page } = await launchApp();
  try {
    await sendMenuEvent(app, 'menu-convert-folder-to-epub', [firstMarkdown, secondMarkdown]);
    await expect(page.locator('#folder-conversion-modal')).toBeVisible();
    await expect(page.locator('#folder-conversion-progress-label'))
      .toContainText('Converted 2 Markdown files to EPUB');

    for (const markdownPath of [firstMarkdown, secondMarkdown]) {
      const epubPath = markdownPath.replace(/\.md$/, '.epub');
      expect(fs.existsSync(epubPath)).toBe(true);
      expect(listArchiveEntries(epubPath)[0]).toBe('mimetype');
    }
    await expect(page.locator('#tabs .tab')).toHaveCount(0);
  } finally {
    await app.close();
    fs.rmSync(rootDirectory, { recursive: true, force: true });
  }
});

test('Tools converts a selected Markdown file to a sibling EPUB', async () => {
  const workDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'printdown-tools-single-epub-'));
  const markdownPath = path.join(workDirectory, 'single.md');
  const epubPath = path.join(workDirectory, 'single.epub');
  fs.writeFileSync(markdownPath, '# Single file\n\nMath: $x^2$.', 'utf-8');

  const { app, page } = await launchApp();
  try {
    await sendMenuEvent(app, 'menu-convert-file-to-epub', markdownPath);
    await expect(page.locator('#folder-conversion-modal')).toBeVisible();
    await expect(page.locator('#folder-conversion-title')).toContainText('Convert Markdown File to EPUB');
    await expect.poll(() => fs.existsSync(epubPath), { timeout: 20_000 }).toBe(true);
    expect(listArchiveEntries(epubPath)).toContain('OEBPS/text/chapter-1.xhtml');
    await expect(page.locator('#tabs .tab')).toHaveCount(0);
  } finally {
    await app.close();
    fs.rmSync(workDirectory, { recursive: true, force: true });
  }
});

test('EPUB package declares the required metadata, nav, and stylesheet', async () => {
  await exportEpub(
    '# Guide Title\n\nIntro paragraph.\n\n# Second Part\n\nMore text.\n',
    async (epubPath) => {
      const entries = listArchiveEntries(epubPath);
      expect(entries).toContain('OEBPS/styles.css');

      const container = readArchiveEntry(epubPath, 'META-INF/container.xml');
      expect(container).toContain('full-path="OEBPS/content.opf"');

      const opf = readArchiveEntry(epubPath, 'OEBPS/content.opf');
      expect(opf).toContain('version="3.0"');
      expect(opf).toContain('<dc:language>');
      expect(opf).toContain('properties="nav"');
      expect(opf).toContain('media-type="application/xhtml+xml"');

      // The navigation document lists every chapter in spine order.
      const nav = readArchiveEntry(epubPath, 'OEBPS/nav.xhtml');
      expect(nav).toContain('Guide Title');
      expect(nav).toContain('Second Part');
      expect(nav.indexOf('Guide Title')).toBeLessThan(nav.indexOf('Second Part'));

      // The EPUB 2 fallback table of contents stays in sync.
      const ncx = readArchiveEntry(epubPath, 'OEBPS/toc.ncx');
      expect(ncx).toContain('Guide Title');
      expect(ncx).toContain('Second Part');
    },
  );
});

test('a document without a top-level heading still yields one readable chapter', async () => {
  await exportEpub(
    'Just a paragraph with no heading at all.\n\n## A second level heading\n\nMore prose.\n',
    async (epubPath) => {
      const entries = listArchiveEntries(epubPath);
      expect(entries).toContain('OEBPS/text/chapter-1.xhtml');
      expect(entries).not.toContain('OEBPS/text/chapter-2.xhtml');

      const chapter = readArchiveEntry(epubPath, 'OEBPS/text/chapter-1.xhtml');
      expect(chapter).toContain('Just a paragraph with no heading at all.');
      expect(chapter).toContain('A second level heading');

      // Falls back to the document name for the book title.
      expect(readArchiveEntry(epubPath, 'OEBPS/content.opf')).toContain('<dc:title>');
    },
    { fileName: 'headingless' },
  );
});

test('chapter markup is valid XHTML with viewer-only chrome removed', async () => {
  await exportEpub(
    [
      '# Clean Output',
      '',
      'Body text with a hard break,',
      'continued on the next line.',
      '',
      '- list item',
      '',
      '> quoted line',
      '',
      '![dot](./dot.png)',
      '',
      '| A | B |',
      '|---|---|',
      '| 1 | 2 |',
      '',
      'Inline $x^2$ math and an <br> tag.',
      '',
    ].join('\n'),
    async (epubPath) => {
      const chapter = readArchiveEntry(epubPath, 'OEBPS/text/chapter-1.xhtml');

      expect(chapter.startsWith('<?xml')).toBe(true);
      expect(chapter).toContain('xmlns="http://www.w3.org/1999/xhtml"');
      expect(chapter).toContain('styles.css');

      // The fixture deliberately contains constructs that break naive
      // serialization: <br>, <img>, a table, and MathJax output (now rasterized).
      expect(chapter).toContain('<br');
      expect(chapter).toContain('<img');
      expect(chapter).toContain('<table');
      expect(chapter).not.toContain('<svg');

      // Every XML document in the package must actually parse.
      for (const entry of ['OEBPS/text/chapter-1.xhtml', 'OEBPS/content.opf', 'OEBPS/nav.xhtml', 'OEBPS/toc.ncx', 'META-INF/container.xml']) {
        expect(() => assertWellFormedXml(epubPath, entry)).not.toThrow();
      }

      // Editor/viewer affordances must not leak into the book.
      expect(chapter).not.toContain('contenteditable');
      expect(chapter).not.toContain('page-guide');
      expect(chapter).not.toContain('resize-handle');
      expect(chapter).not.toContain('<script');
      expect(chapter).not.toContain('printdown:');
    },
    { fileName: 'clean', extraFiles: { 'dot.png': TINY_PNG } },
  );
});

test('math is rasterized to PNG images for e-reader compatibility', async () => {
  await exportEpub(
    '# Equations\n\nInline $E = mc^2$ within a sentence.\n\n$$\\int_0^\\infty e^{-x}\\,dx = 1$$\n',
    async (epubPath) => {
      const chapter = readArchiveEntry(epubPath, 'OEBPS/text/chapter-1.xhtml');

      expect(chapter).not.toContain('mjx-container');
      expect(chapter).not.toContain('<mjx-');
      expect(chapter).toContain('math-inline');
      expect(chapter).toContain('math-display');

      // Inline SVGs are rasterized to PNG for maximum e-reader compatibility.
      expect(chapter).not.toContain('<svg');
      expect(chapter).not.toContain('MJX-SVG-global-cache');
      expect(chapter).toContain('<img');

      const entries = listArchiveEntries(epubPath);
      const imageEntries = entries.filter(entry => entry.startsWith('OEBPS/images/'));
      expect(imageEntries.length).toBeGreaterThanOrEqual(2);
      expect(imageEntries.every(entry => entry.endsWith('.png'))).toBe(true);

      const opf = readArchiveEntry(epubPath, 'OEBPS/content.opf');
      expect(opf).toContain('media-type="image/png"');
    },
    { fileName: 'equations' },
  );
});

test('mermaid diagrams are rasterized to PNG for e-reader compatibility', async () => {
  await exportEpub(
    '# Diagram\n\n```mermaid\ngraph TD\n    A[Start] --> B[Finish]\n```\n',
    async (epubPath) => {
      const chapter = readArchiveEntry(epubPath, 'OEBPS/text/chapter-1.xhtml');

      // Inline SVGs are rasterized to PNG for maximum e-reader compatibility.
      expect(chapter).not.toContain('<svg');
      expect(chapter).not.toContain('<foreignObject');
      expect(chapter).toContain('<img');

      const entries = listArchiveEntries(epubPath);
      const imageEntries = entries.filter(entry => entry.startsWith('OEBPS/images/'));
      expect(imageEntries.length).toBeGreaterThanOrEqual(1);
      expect(imageEntries.every(entry => entry.endsWith('.png'))).toBe(true);

      const opf = readArchiveEntry(epubPath, 'OEBPS/content.opf');
      expect(opf).toContain('media-type="image/png"');
    },
    { fileName: 'diagram' },
  );
});

test('titles containing XML special characters are escaped', async () => {
  await exportEpub(
    '# Fish & Chips <tasty>\n\nBody text.\n',
    async (epubPath) => {
      const opf = readArchiveEntry(epubPath, 'OEBPS/content.opf');
      expect(opf).toContain('Fish &amp; Chips');
      expect(opf).not.toContain('<tasty>');
      // A raw ampersand would make the package document unparseable.
      expect(/&(?!(amp|lt|gt|quot|apos|#\d+);)/.test(opf)).toBe(false);
    },
    { fileName: 'escaping' },
  );
});

test('images that fail to load are dropped instead of left broken', async () => {
  await exportEpub(
    '# Missing Art\n\n![gone](./does-not-exist.png)\n\nText after the image.\n',
    async (epubPath) => {
      const entries = listArchiveEntries(epubPath);
      expect(entries.some(entry => entry.startsWith('OEBPS/images/'))).toBe(false);

      const chapter = readArchiveEntry(epubPath, 'OEBPS/text/chapter-1.xhtml');
      expect(chapter).toContain('Text after the image.');
      expect(chapter).not.toContain('does-not-exist.png');
      expect(chapter).not.toContain('printdown:');
    },
    { fileName: 'missing-image' },
  );
});

test('EPUB export menu item is disabled until a document is open', async () => {
  const workDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'printdown-epub-menu-'));
  const markdownPath = path.join(workDirectory, 'menu.md');
  fs.writeFileSync(markdownPath, '# Menu State\n\nBody.\n', 'utf-8');

  const readMenuItemEnabled = (app: Awaited<ReturnType<typeof launchApp>>['app']) =>
    app.evaluate(({ Menu }) => ({
      epub: Menu.getApplicationMenu()?.getMenuItemById('file-export-epub')?.enabled,
      pdf: Menu.getApplicationMenu()?.getMenuItemById('file-export-pdf')?.enabled,
    }));

  const { app, page } = await launchApp();
  try {
    await expect.poll(async () => (await readMenuItemEnabled(app)).epub, { timeout: 10_000 }).toBe(false);

    await openFile(app, markdownPath);
    await waitForContent(page);

    // EPUB export tracks the same "a document is open" state as PDF export.
    await expect.poll(async () => (await readMenuItemEnabled(app)).epub, { timeout: 10_000 }).toBe(true);
    expect((await readMenuItemEnabled(app)).pdf).toBe(true);
  } finally {
    await app.close();
    fs.rmSync(workDirectory, { recursive: true, force: true });
  }
});
