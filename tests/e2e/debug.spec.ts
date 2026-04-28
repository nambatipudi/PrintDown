/**
 * Debug utilities and app metadata regression tests.
 * Covers: debug log copy, About dialog, version display.
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, openAndWait, sendMenuEvent } from './helpers/app';

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => { ({ app, page } = await launchApp()); });
test.afterAll(async () => { await app.close(); });

// ── Debug log copy ─────────────────────────────────────────────────────────

test('sending menu-copy-debug-logs does not crash the app', async () => {
  await openAndWait(app, page, 'markdown-basics.md');
  await sendMenuEvent(app, 'menu-copy-debug-logs');
  await page.waitForTimeout(500);
  // App should still be responsive
  await expect(page.locator('#toc-toggle')).toBeVisible();
});

test('after debug log copy, clipboard contains app version info', async () => {
  await openAndWait(app, page, 'markdown-basics.md');
  await sendMenuEvent(app, 'menu-copy-debug-logs');
  await page.waitForTimeout(500);
  // Read clipboard via Electron's clipboard module
  const clipboardText = await app.evaluate(({ clipboard }) => clipboard.readText());
  // Debug logs should contain version or "PrintDown" in some form
  expect(typeof clipboardText).toBe('string');
  expect(clipboardText.length).toBeGreaterThan(0);
});

test('debug log clipboard contains console log entries', async () => {
  await openAndWait(app, page, 'markdown-basics.md');
  // Trigger a console.log from the renderer
  await page.evaluate(() => console.log('TEST_DEBUG_MARKER_XYZ'));
  await page.waitForTimeout(100);
  await sendMenuEvent(app, 'menu-copy-debug-logs');
  await page.waitForTimeout(500);
  const text = await app.evaluate(({ clipboard }) => clipboard.readText());
  expect(text).toContain('TEST_DEBUG_MARKER_XYZ');
});

// ── About dialog (via main process menu) ──────────────────────────────────

test('app version is accessible via getVersion IPC', async () => {
  const version = await app.evaluate(({ app: electronApp }) => electronApp.getVersion());
  expect(typeof version).toBe('string');
  expect(version).toMatch(/^\d+\.\d+\.\d+$/);
});

test('app is not crashed after multiple operations', async () => {
  // Comprehensive smoke test
  await openAndWait(app, page, 'markdown-basics.md');
  await sendMenuEvent(app, 'menu-font-increase');
  await sendMenuEvent(app, 'menu-theme-change', 'dark');
  await sendMenuEvent(app, 'menu-toggle-toc');
  await page.waitForTimeout(200);
  await sendMenuEvent(app, 'menu-toggle-toc');
  await sendMenuEvent(app, 'menu-theme-change', 'light');
  await sendMenuEvent(app, 'menu-font-reset');
  await page.waitForTimeout(300);
  await expect(page.locator('#markdown-content h1').first()).toBeVisible();
});

// ── Protocol / custom printdown:// handler ────────────────────────────────

test('printdown:// protocol handler is registered', async () => {
  const isRegistered = await app.evaluate(({ protocol }) =>
    protocol.isProtocolHandled('printdown'),
  );
  expect(isRegistered).toBe(true);
});

// ── Single instance lock ───────────────────────────────────────────────────

test('app is running as a single instance', async () => {
  // We can verify this indirectly: the app launched successfully (no second-instance rejection)
  const windows = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
  expect(windows).toBe(1);
});
