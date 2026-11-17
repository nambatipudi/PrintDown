/**
 * Merge Markdown regression tests.
 * Covers: merge semantics (order, page breaks, front matter, image paths),
 * the modal's UI controls, and the cancellation paths.
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AUTOMATION_CANCEL, launchApp, sendMenuEvent } from './helpers/app';

const PAGE_BREAK_MARKER = 'page-break-before';

interface Workspace {
  dir: string;
  alpha: string;
  beta: string;
  output: string;
  pdf: string;
}

function makeWorkspace(): Workspace {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'printdown-merge-'));
  const alphaDir = path.join(dir, 'alpha');
  const betaDir = path.join(dir, 'beta');
  fs.mkdirSync(alphaDir);
  fs.mkdirSync(betaDir);

  const alpha = path.join(alphaDir, 'alpha.md');
  const beta = path.join(betaDir, 'beta.md');
  fs.writeFileSync(alpha, '# Alpha Document\n\nAlpha body text.\n\n![pic](assets/alpha.png)\n', 'utf-8');
  fs.writeFileSync(beta, '---\ntitle: Beta\n---\n\n# Beta Document\n\nBeta body text.\n', 'utf-8');

  return {
    dir,
    alpha,
    beta,
    output: path.join(dir, 'merged.md'),
    pdf: path.join(dir, 'merged.pdf'),
  };
}

/** Count pages in a Chromium-generated PDF via the page tree's /Count entry. */
function countPdfPages(pdf: Buffer): number {
  const text = pdf.toString('latin1');
  const counts = [...text.matchAll(/\/Type\s*\/Pages[^>]*?\/Count\s+(\d+)/g)].map(m => Number(m[1]));
  if (counts.length > 0) return Math.max(...counts);
  return (text.match(/\/Type\s*\/Page[^s]/g) || []).length;
}

async function openMergeModal(app: ElectronApplication, page: Page): Promise<void> {
  await sendMenuEvent(app, 'menu-merge-markdown');
  await page.waitForSelector('#merge-markdown-modal', { state: 'visible' });
}

async function runMerge(page: Page): Promise<void> {
  await page.click('#merge-confirm');
  await page.waitForSelector('#merge-markdown-modal', { state: 'hidden', timeout: 15_000 });
}

function row(page: Page, index: number) {
  return page.locator('#merge-file-list li').nth(index);
}

test.describe('Merge Markdown files - merging', () => {
  let app: ElectronApplication;
  let page: Page;
  let files: Workspace;

  test.beforeEach(async () => {
    files = makeWorkspace();
    ({ app, page } = await launchApp({
      mergePickPaths: [files.alpha, files.beta],
      mergeSavePath: files.output,
      pdfExportPath: files.pdf,
    }));
  });

  test.afterEach(async () => {
    await app?.close();
    fs.rmSync(files.dir, { recursive: true, force: true });
  });

  test('merges selected files in list order with page breaks', async () => {
    await openMergeModal(app, page);
    await page.click('#merge-add-files');
    await expect(page.locator('#merge-file-list li')).toHaveCount(2);

    await runMerge(page);

    const merged = fs.readFileSync(files.output, 'utf-8');
    expect(merged.indexOf('# Alpha Document')).toBeGreaterThanOrEqual(0);
    expect(merged.indexOf('# Beta Document')).toBeGreaterThan(merged.indexOf('# Alpha Document'));
    expect(merged).toContain(PAGE_BREAK_MARKER);
    // Front matter from the first file that has one is hoisted to the top.
    expect(merged.trimStart().startsWith('---')).toBe(true);
    expect(merged.match(/^---$/gm)!.length).toBe(2);
    // Relative image paths are rewritten against the merged file's own folder.
    expect(merged).toContain('![pic](alpha/assets/alpha.png)');
  });

  test('reordering changes the merge order and page breaks can be disabled', async () => {
    await openMergeModal(app, page);
    await page.click('#merge-add-files');
    await expect(page.locator('#merge-file-list li')).toHaveCount(2);

    await row(page, 1).locator('button[title="Move up"]').click();
    await expect(row(page, 0).locator('.merge-file-name')).toHaveText('beta.md');

    await page.uncheck('#merge-page-break');
    await runMerge(page);

    const merged = fs.readFileSync(files.output, 'utf-8');
    expect(merged.indexOf('# Beta Document')).toBeLessThan(merged.indexOf('# Alpha Document'));
    expect(merged).not.toContain(PAGE_BREAK_MARKER);
  });

  test('duplicate files are skipped and merging needs at least two files', async () => {
    await openMergeModal(app, page);
    await expect(page.locator('#merge-confirm')).toBeDisabled();

    await page.click('#merge-add-files');
    await page.click('#merge-add-files');
    await expect(page.locator('#merge-file-list li')).toHaveCount(2);
    await expect(page.locator('#merge-status-message')).toContainText('skipped');

    await row(page, 1).locator('button[title="Remove from merge"]').click();
    await expect(page.locator('#merge-file-list li')).toHaveCount(1);
    await expect(page.locator('#merge-confirm')).toBeDisabled();
  });

  test('merged file opens in a new tab', async () => {
    await openMergeModal(app, page);
    await page.click('#merge-add-files');
    await runMerge(page);

    await expect(page.locator('#tabs .tab', { hasText: 'merged.md' })).toHaveCount(1);
    await expect(page.locator('#markdown-content')).toContainText('Alpha body text.');
    await expect(page.locator('#markdown-content')).toContainText('Beta body text.');

    // The page-break marker must survive sanitization and keep its forced break.
    const breakStyle = await page.locator('#markdown-content div[style*="page-break-before"]').first()
      .evaluate(el => getComputedStyle(el).breakBefore);
    expect(breakStyle).toBe('page');
  });

  test('the file list is emptied after a successful merge', async () => {
    await openMergeModal(app, page);
    await page.click('#merge-add-files');
    await runMerge(page);

    await openMergeModal(app, page);
    await expect(page.locator('#merge-file-list li')).toHaveCount(0);
    await expect(page.locator('#merge-empty-message')).toBeVisible();
    await expect(page.locator('#merge-confirm')).toBeDisabled();
  });

  test('merged file with page breaks exports a multi-page PDF', async () => {
    await openMergeModal(app, page);
    await page.click('#merge-add-files');
    await runMerge(page);

    await sendMenuEvent(app, 'menu-export-pdf');
    await expect.poll(() => fs.existsSync(files.pdf), { timeout: 30_000 }).toBe(true);

    const pdf = fs.readFileSync(files.pdf);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(countPdfPages(pdf)).toBeGreaterThanOrEqual(2);
  });

  test('a source file that disappears surfaces a read error and keeps the modal open', async () => {
    await openMergeModal(app, page);
    await page.click('#merge-add-files');
    await expect(page.locator('#merge-file-list li')).toHaveCount(2);

    fs.rmSync(files.alpha);
    await page.click('#merge-confirm');

    await expect(page.locator('#merge-status-message')).toContainText('alpha.md');
    await expect(page.locator('#merge-status-message')).toHaveClass(/error/);
    await expect(page.locator('#merge-markdown-modal')).toBeVisible();
  });
});

test.describe('Merge Markdown files - modal UI', () => {
  let app: ElectronApplication;
  let page: Page;
  let files: Workspace;

  test.beforeEach(async () => {
    files = makeWorkspace();
    ({ app, page } = await launchApp({
      mergePickPaths: [files.alpha, files.beta],
      mergeSavePath: files.output,
    }));
  });

  test.afterEach(async () => {
    await app?.close();
    fs.rmSync(files.dir, { recursive: true, force: true });
  });

  test('opens from the Tools menu in an empty state', async () => {
    await openMergeModal(app, page);

    await expect(page.locator('#merge-markdown-title')).toHaveText('Merge Markdown Files');
    await expect(page.locator('#merge-file-list li')).toHaveCount(0);
    await expect(page.locator('#merge-empty-message')).toBeVisible();
    await expect(page.locator('#merge-confirm')).toBeDisabled();
    // Page breaks are opt-out, matching the common "one document per page" case.
    await expect(page.locator('#merge-page-break')).toBeChecked();
  });

  test('lists each file with its name and containing folder', async () => {
    await openMergeModal(app, page);
    await page.click('#merge-add-files');

    await expect(page.locator('#merge-empty-message')).toBeHidden();
    await expect(row(page, 0).locator('.merge-file-name')).toHaveText('alpha.md');
    await expect(row(page, 1).locator('.merge-file-name')).toHaveText('beta.md');
    // Files come from different folders, so the folder disambiguates them.
    await expect(row(page, 0).locator('.merge-file-dir')).toHaveText(path.dirname(files.alpha));
    await expect(row(page, 1).locator('.merge-file-dir')).toHaveText(path.dirname(files.beta));
    await expect(row(page, 0).locator('.merge-file-index')).toHaveText('1.');
    await expect(row(page, 1).locator('.merge-file-index')).toHaveText('2.');
  });

  test('reorder buttons are disabled at the list boundaries', async () => {
    await openMergeModal(app, page);
    await page.click('#merge-add-files');

    await expect(row(page, 0).locator('button[title="Move up"]')).toBeDisabled();
    await expect(row(page, 0).locator('button[title="Move down"]')).toBeEnabled();
    await expect(row(page, 1).locator('button[title="Move up"]')).toBeEnabled();
    await expect(row(page, 1).locator('button[title="Move down"]')).toBeDisabled();
  });

  test('move down reorders rows and renumbers them', async () => {
    await openMergeModal(app, page);
    await page.click('#merge-add-files');

    await row(page, 0).locator('button[title="Move down"]').click();

    await expect(row(page, 0).locator('.merge-file-name')).toHaveText('beta.md');
    await expect(row(page, 1).locator('.merge-file-name')).toHaveText('alpha.md');
    await expect(row(page, 0).locator('.merge-file-index')).toHaveText('1.');
    await expect(row(page, 1).locator('.merge-file-index')).toHaveText('2.');
    // The boundary state follows the new positions.
    await expect(row(page, 0).locator('button[title="Move up"]')).toBeDisabled();
    await expect(row(page, 1).locator('button[title="Move down"]')).toBeDisabled();
  });

  test('clear all empties the list and restores the empty state', async () => {
    await openMergeModal(app, page);
    await page.click('#merge-add-files');
    await expect(page.locator('#merge-file-list li')).toHaveCount(2);

    await page.click('#merge-clear-files');

    await expect(page.locator('#merge-file-list li')).toHaveCount(0);
    await expect(page.locator('#merge-empty-message')).toBeVisible();
    await expect(page.locator('#merge-confirm')).toBeDisabled();
  });

  test('the close button, Cancel, and Escape all dismiss the modal', async () => {
    await openMergeModal(app, page);
    await page.click('#merge-markdown-close');
    await expect(page.locator('#merge-markdown-modal')).toBeHidden();

    await openMergeModal(app, page);
    await page.click('#merge-cancel');
    await expect(page.locator('#merge-markdown-modal')).toBeHidden();

    await openMergeModal(app, page);
    await page.keyboard.press('Escape');
    await expect(page.locator('#merge-markdown-modal')).toBeHidden();
  });

  test('the pending file list survives closing and reopening the modal', async () => {
    await openMergeModal(app, page);
    await page.click('#merge-add-files');
    await row(page, 0).locator('button[title="Move down"]').click();
    await page.click('#merge-cancel');
    await expect(page.locator('#merge-markdown-modal')).toBeHidden();

    await openMergeModal(app, page);
    await expect(page.locator('#merge-file-list li')).toHaveCount(2);
    await expect(row(page, 0).locator('.merge-file-name')).toHaveText('beta.md');
  });
});

test.describe('Merge Markdown files - cancellation', () => {
  let files: Workspace;

  test.beforeEach(() => {
    files = makeWorkspace();
  });

  test.afterEach(() => {
    fs.rmSync(files.dir, { recursive: true, force: true });
  });

  test('cancelling the file picker leaves the list untouched', async () => {
    const { app, page } = await launchApp({
      mergePickPaths: [AUTOMATION_CANCEL],
      mergeSavePath: files.output,
    });
    try {
      await openMergeModal(app, page);
      await page.click('#merge-add-files');

      await expect(page.locator('#merge-file-list li')).toHaveCount(0);
      await expect(page.locator('#merge-empty-message')).toBeVisible();
      await expect(page.locator('#merge-status-message')).toHaveText('');
    } finally {
      await app.close();
    }
  });

  test('cancelling the save dialog writes nothing and keeps the modal open', async () => {
    const { app, page } = await launchApp({
      mergePickPaths: [files.alpha, files.beta],
      mergeSavePath: AUTOMATION_CANCEL,
    });
    try {
      await openMergeModal(app, page);
      await page.click('#merge-add-files');
      await page.click('#merge-confirm');

      await expect(page.locator('#merge-markdown-modal')).toBeVisible();
      await expect(page.locator('#merge-status-message')).toHaveText('');
      // The selection is preserved so the user can retry without re-adding files.
      await expect(page.locator('#merge-file-list li')).toHaveCount(2);
      await expect(page.locator('#merge-confirm')).toBeEnabled();
      expect(fs.existsSync(files.output)).toBe(false);
    } finally {
      await app.close();
    }
  });
});

test.describe('Merge Markdown files - image path rewriting', () => {
  let dir: string;

  test.afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('rewrites relative references and leaves everything else alone', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'printdown-merge-img-'));
    const sourceDir = path.join(dir, 'chapters');
    fs.mkdirSync(sourceDir);

    const mixed = path.join(sourceDir, 'mixed.md');
    const trailer = path.join(sourceDir, 'trailer.md');
    const output = path.join(dir, 'merged.md');
    const fence = '```';

    fs.writeFileSync(
      mixed,
      [
        '# Mixed References',
        '',
        '![relative](img/pic.png)',
        '![dot slash](./img/dot.png)',
        '![parent](../shared/up.png)',
        '![absolute](/var/tmp/absolute.png)',
        '![remote](https://example.com/remote.png)',
        '![inline data](data:image/png;base64,AAAA)',
        '<img src="img/html.png" alt="html tag">',
        '<img src="https://example.com/html-remote.png" alt="remote html">',
        '',
        `${fence}markdown`,
        '![inside a code fence](img/untouched.png)',
        fence,
        '',
      ].join('\n'),
      'utf-8',
    );
    fs.writeFileSync(trailer, '# Trailer\n\nEnd matter.\n', 'utf-8');

    const { app, page } = await launchApp({
      mergePickPaths: [mixed, trailer],
      mergeSavePath: output,
    });
    try {
      await openMergeModal(app, page);
      await page.click('#merge-add-files');
      await runMerge(page);

      const merged = fs.readFileSync(output, 'utf-8');

      // Relative paths are re-pointed at the merged file's own folder.
      expect(merged).toContain('![relative](chapters/img/pic.png)');
      expect(merged).toContain('![dot slash](chapters/img/dot.png)');
      expect(merged).toContain('![parent](shared/up.png)');
      expect(merged).toContain('<img src="chapters/img/html.png" alt="html tag">');

      // Absolute, remote, and data references must survive untouched.
      expect(merged).toContain('![absolute](/var/tmp/absolute.png)');
      expect(merged).toContain('![remote](https://example.com/remote.png)');
      expect(merged).toContain('![inline data](data:image/png;base64,AAAA)');
      expect(merged).toContain('<img src="https://example.com/html-remote.png" alt="remote html">');

      // Code fences are literal content and must not be rewritten.
      expect(merged).toContain('![inside a code fence](img/untouched.png)');
    } finally {
      await app.close();
    }
  });
});
