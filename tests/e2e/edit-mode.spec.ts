/**
 * Edit mode regression tests.
 * Covers: toggle, CodeMirror init, split view, live preview sync, splitter.
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
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

// ── Preview still works in view-only mode ─────────────────────────────────

test('preview pane is visible in view-only mode', async () => {
  await openAndWait(app, page, 'markdown-basics.md');
  await disableEditMode(page);
  await expect(page.locator('#content')).toBeVisible();
  await expect(page.locator('#markdown-content')).toBeVisible();
});
