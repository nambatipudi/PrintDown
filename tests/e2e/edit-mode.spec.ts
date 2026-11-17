/**
 * Edit mode regression tests.
 * Covers: toggle, CodeMirror init, split view, live preview sync, splitter.
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { launchApp, openAndWait, createTempMd, openFile, removeTempMd } from './helpers/app';

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => { ({ app, page } = await launchApp()); });
test.afterAll(async () => { await app.close(); });

async function enableEditMode(page: Page) {
  const pane = page.locator('#editor-pane');
  const display = await pane.evaluate(el => (el as HTMLElement).style.display);
  if (display === 'none' || display === '') {
    await page.locator('#edit-toggle').click();
    await page.waitForTimeout(400);
  }
}

async function disableEditMode(page: Page) {
  const pane = page.locator('#editor-pane');
  const display = await pane.evaluate(el => (el as HTMLElement).style.display);
  if (display !== 'none' && display !== '') {
    await page.locator('#edit-toggle').click();
    await page.waitForTimeout(400);
  }
}

// ── Toggle ─────────────────────────────────────────────────────────────────

test('edit toggle button is visible', async () => {
  await openAndWait(app, page, 'markdown-basics.md');
  await expect(page.locator('#edit-toggle')).toBeVisible();
});

test('edit mode shows #editor-pane', async () => {
  await openAndWait(app, page, 'markdown-basics.md');
  await enableEditMode(page);
  await expect(page.locator('#editor-pane')).toBeVisible();
  await disableEditMode(page);
});

test('disabling edit mode hides #editor-pane', async () => {
  await openAndWait(app, page, 'markdown-basics.md');
  await enableEditMode(page);
  await disableEditMode(page);
  await expect(page.locator('#editor-pane')).not.toBeVisible();
});

test('#split-container gets .split-view class in edit mode', async () => {
  await openAndWait(app, page, 'markdown-basics.md');
  await enableEditMode(page);
  await expect(page.locator('#split-container')).toHaveClass(/split-view/);
  await disableEditMode(page);
});

test('#split-container gets .view-only class outside edit mode', async () => {
  await openAndWait(app, page, 'markdown-basics.md');
  await disableEditMode(page);
  await expect(page.locator('#split-container')).toHaveClass(/view-only/);
});

test('splitter is visible in edit mode', async () => {
  await openAndWait(app, page, 'markdown-basics.md');
  await enableEditMode(page);
  await expect(page.locator('#splitter')).toBeVisible();
  await disableEditMode(page);
});

test('splitter is hidden outside edit mode', async () => {
  await openAndWait(app, page, 'markdown-basics.md');
  await disableEditMode(page);
  await expect(page.locator('#splitter')).not.toBeVisible();
});

test('#edit-toggle has .active class when in edit mode', async () => {
  await openAndWait(app, page, 'markdown-basics.md');
  await enableEditMode(page);
  await expect(page.locator('#edit-toggle')).toHaveClass(/active/);
  await disableEditMode(page);
});

// ── CodeMirror ─────────────────────────────────────────────────────────────

test('CodeMirror editor is present in #editor-container after enabling edit mode', async () => {
  await openAndWait(app, page, 'markdown-basics.md');
  await enableEditMode(page);
  await expect(page.locator('#editor-container .cm-editor').first()).toBeVisible();
  await disableEditMode(page);
});

test('CodeMirror contains the file content', async () => {
  await openAndWait(app, page, 'markdown-basics.md');
  await enableEditMode(page);
  const editor = page.locator('#editor-container .cm-content').first();
  await expect(editor).toContainText('Heading');
  await disableEditMode(page);
});

// ── Live preview sync ─────────────────────────────────────────────────────

test('typing in editor updates the preview panel', async () => {
  const fp = createTempMd('# Initial Title\n\nSome content.', 'live-sync');
  try {
    await openFile(app, fp);
    await page.waitForTimeout(800);
    await enableEditMode(page);

    // Focus the editor and type
    const editorContent = page.locator('#editor-container .cm-content').first();
    await editorContent.click();
    await page.keyboard.press('ControlOrMeta+Home'); // ensure cursor at start of document
    await page.keyboard.press('End'); // go to end of first line
    await page.keyboard.type(' EDITED');
    // Wait for debounced re-render (250ms + buffer)
    await page.waitForTimeout(1500);

    // Preview should contain the new text
    await expect(page.locator('#markdown-content h1')).toContainText('EDITED');
    await disableEditMode(page);
  } finally {
    removeTempMd(fp);
  }
});

test('a stale image render cannot overwrite a newer editor update', async () => {
  const workDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'printdown-render-race-'));
  const markdownPath = path.join(workDirectory, 'race.md');
  fs.writeFileSync(
    path.join(workDirectory, 'dot.png'),
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    ),
  );
  fs.writeFileSync(markdownPath, '# Initial preview\n\n![dot](./dot.png)\n', 'utf-8');

  const delayed = await launchApp({ protocolFilesDelayMs: 600 });
  try {
    await openFile(delayed.app, markdownPath);
    const previewImage = delayed.page.locator('#markdown-content img');
    await expect.poll(() => previewImage.evaluate(element => (element as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);

    await enableEditMode(delayed.page);
    const editor = delayed.page.locator('#editor-container .cm-content').first();
    await editor.click();
    await delayed.page.keyboard.press('ControlOrMeta+A');
    await delayed.page.keyboard.insertText('# Stale preview\n\n![dot](./dot.png)\n');

    // Let the first debounced render enter the intentionally delayed IPC call.
    await delayed.page.waitForTimeout(350);

    await delayed.page.keyboard.press('ControlOrMeta+A');
    await delayed.page.keyboard.insertText('# Latest preview\n\nNo image remains.\n');
    await delayed.page.waitForTimeout(1_100);

    await expect(delayed.page.locator('#markdown-content h1')).toHaveText('Latest preview');
    await expect(delayed.page.locator('#markdown-content')).toContainText('No image remains.');
    await expect(delayed.page.locator('#markdown-content')).not.toContainText('Stale preview');
  } finally {
    await delayed.app.close();
    fs.rmSync(workDirectory, { recursive: true, force: true });
  }
});

// ── Preview still works in view-only mode ─────────────────────────────────

test('preview pane is visible in view-only mode', async () => {
  await openAndWait(app, page, 'markdown-basics.md');
  await disableEditMode(page);
  await expect(page.locator('#content')).toBeVisible();
  await expect(page.locator('#markdown-content')).toBeVisible();
});
