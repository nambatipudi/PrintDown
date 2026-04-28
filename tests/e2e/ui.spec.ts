/**
 * UI interaction regression tests.
 *
 * Verifies that structural UI elements work correctly and don't break
 * after code changes to the renderer or main process.
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, openAndWait, openFile, fixture } from './helpers/app';

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  ({ app, page } = await launchApp());
});

test.afterAll(async () => {
  await app.close();
});

// ── Initial state ──────────────────────────────────────────────────────────

test('app launches and shows empty state', async () => {
  await expect(page.locator('.empty-state')).toBeVisible();
});

test('header buttons are visible on launch', async () => {
  await expect(page.locator('#toc-toggle')).toBeVisible();
  await expect(page.locator('#edit-toggle')).toBeVisible();
});

// ── Tab management ─────────────────────────────────────────────────────────

test.describe('tabs', () => {
  test.beforeEach(async () => {
    await openAndWait(app, page, 'markdown-basics.md');
  });

  test('tab appears after opening a file', async () => {
    const tabs = page.locator('#tabs .tab');
    expect(await tabs.count()).toBeGreaterThanOrEqual(1);
  });

  test('tab label contains filename', async () => {
    const tab = page.locator('#tabs .tab').last();
    await expect(tab).toContainText('markdown-basics');
  });

  test('opening a second file creates a second tab', async () => {
    const before = await page.locator('#tabs .tab').count();
    await openAndWait(app, page, 'math-equations.md');
    const after = await page.locator('#tabs .tab').count();
    expect(after).toBeGreaterThan(before);
  });

  test('content area is visible after opening a file', async () => {
    await expect(page.locator('#markdown-content')).toBeVisible();
    await expect(page.locator('.empty-state')).not.toBeVisible();
  });
});

// ── TOC sidebar ────────────────────────────────────────────────────────────

test.describe('table of contents', () => {
  test.beforeEach(async () => {
    await openAndWait(app, page, 'markdown-basics.md');
  });

  test('TOC toggle button exists', async () => {
    await expect(page.locator('#toc-toggle')).toBeVisible();
  });

  test('TOC sidebar toggles open and closed', async () => {
    const sidebar = page.locator('#toc-sidebar');
    const initialClass = await sidebar.getAttribute('class') ?? '';

    await page.locator('#toc-toggle').click();
    await page.waitForTimeout(400);

    const newClass = await sidebar.getAttribute('class') ?? '';
    expect(newClass).not.toBe(initialClass);

    // Toggle back to restore state
    await page.locator('#toc-toggle').click();
    await page.waitForTimeout(400);
  });

  test('TOC content is populated for file with headings', async () => {
    // Open TOC
    const sidebar = page.locator('#toc-sidebar');
    const cls = await sidebar.getAttribute('class') ?? '';
    if (!cls.includes('open')) {
      await page.locator('#toc-toggle').click();
      await page.waitForTimeout(400);
    }
    const tocContent = page.locator('#toc-content');
    await expect(tocContent).not.toContainText('No headings found');
    // Close TOC
    await page.locator('#toc-toggle').click();
    await page.waitForTimeout(400);
  });
});

// ── Edit mode ──────────────────────────────────────────────────────────────

test.describe('edit mode', () => {
  test.beforeEach(async () => {
    await openAndWait(app, page, 'markdown-basics.md');
    // Ensure we start in view-only mode
    const pane = page.locator('#editor-pane');
    const display = await pane.evaluate(el => (el as HTMLElement).style.display);
    if (display !== 'none') {
      await page.locator('#edit-toggle').click();
      await page.waitForTimeout(300);
    }
  });

  test('edit toggle button exists', async () => {
    await expect(page.locator('#edit-toggle')).toBeVisible();
  });

  test('clicking edit toggle shows the editor pane', async () => {
    await page.locator('#edit-toggle').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#editor-pane')).toBeVisible();
    // Restore
    await page.locator('#edit-toggle').click();
    await page.waitForTimeout(300);
  });

  test('content area remains visible in edit mode', async () => {
    await page.locator('#edit-toggle').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#content')).toBeVisible();
    // Restore
    await page.locator('#edit-toggle').click();
    await page.waitForTimeout(300);
  });
});

// ── Status indicator ───────────────────────────────────────────────────────

test('status indicator exists in DOM', async () => {
  await expect(page.locator('#status-indicator')).toBeAttached();
});

// ── Page settings modal ────────────────────────────────────────────────────

test('page settings button opens modal', async () => {
  const modal = page.locator('#page-settings-modal');
  await expect(modal).toHaveClass(/hidden/);
  await page.locator('#page-settings-btn').click();
  await page.waitForTimeout(200);
  await expect(modal).not.toHaveClass(/hidden/);
  // Close by pressing Escape or clicking outside
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
});
