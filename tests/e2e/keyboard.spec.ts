/**
 * Keyboard shortcut regression tests.
 * Verifies all documented shortcuts work.
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, openAndWait, sendMenuEvent, getContentFontSize, createTempMd, openFile, removeTempMd, waitForStatus } from './helpers/app';

let app: ElectronApplication;
let page: Page;
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

test.beforeAll(async () => { ({ app, page } = await launchApp()); });
test.afterAll(async () => { await app.close(); });

test.beforeEach(async () => {
  await openAndWait(app, page, 'markdown-basics.md');
  await sendMenuEvent(app, 'menu-font-reset');
  await page.waitForTimeout(150);
});

// ── Font size shortcuts ────────────────────────────────────────────────────

test('Ctrl/Cmd+= increases font size', async () => {
  const before = parseFloat((await getContentFontSize(page)).replace('px', ''));
  await page.keyboard.press(`${MOD}+=`);
  await page.waitForTimeout(200);
  const after = parseFloat((await getContentFontSize(page)).replace('px', ''));
  expect(after).toBeGreaterThan(before);
  await sendMenuEvent(app, 'menu-font-reset');
});

test('Ctrl/Cmd+- decreases font size', async () => {
  const before = parseFloat((await getContentFontSize(page)).replace('px', ''));
  await page.keyboard.press(`${MOD}+-`);
  await page.waitForTimeout(200);
  const after = parseFloat((await getContentFontSize(page)).replace('px', ''));
  expect(after).toBeLessThan(before);
  await sendMenuEvent(app, 'menu-font-reset');
});

test('Ctrl/Cmd+0 resets font size', async () => {
  const base = parseFloat((await getContentFontSize(page)).replace('px', ''));
  await page.keyboard.press(`${MOD}+=`);
  await page.keyboard.press(`${MOD}+=`);
  await page.waitForTimeout(200);
  await page.keyboard.press(`${MOD}+0`);
  await page.waitForTimeout(200);
  const reset = parseFloat((await getContentFontSize(page)).replace('px', ''));
  expect(reset).toBeCloseTo(base, 0);
});

// ── Save shortcut ──────────────────────────────────────────────────────────

test('Ctrl/Cmd+S triggers save', async () => {
  const fp = createTempMd('# Shortcut Test', 'kb-save');
  try {
    await openFile(app, fp);
    await page.waitForTimeout(800);
    await page.keyboard.press(`${MOD}+s`);
    await waitForStatus(page, 'Saved', 5000);
    await expect(page.locator('#status-indicator')).toContainText('Saved');
  } finally {
    removeTempMd(fp);
  }
});

// ── TOC shortcut ──────────────────────────────────────────────────────────

test('Ctrl/Cmd+Backslash toggles TOC', async () => {
  const sidebar = page.locator('#toc-sidebar');
  const wasOpen = await sidebar.evaluate(el => el.classList.contains('open'));

  await page.keyboard.press(`${MOD}+\\`);
  await page.waitForTimeout(300);
  const nowOpen = await sidebar.evaluate(el => el.classList.contains('open'));
  expect(nowOpen).not.toBe(wasOpen);

  // Toggle back
  await page.keyboard.press(`${MOD}+\\`);
  await page.waitForTimeout(300);
  const restored = await sidebar.evaluate(el => el.classList.contains('open'));
  expect(restored).toBe(wasOpen);
});

// ── F12 DevTools ───────────────────────────────────────────────────────────

test('F12 does not crash the renderer', async () => {
  await page.keyboard.press('F12');
  await page.waitForTimeout(500);
  // App should still be responsive
  await expect(page.locator('#toc-toggle')).toBeVisible();
});

// ── Escape closes modals ───────────────────────────────────────────────────

test('Escape key closes page settings modal', async () => {
  await page.locator('#page-settings-btn').click();
  await page.waitForTimeout(200);
  await expect(page.locator('#page-settings-modal')).not.toHaveClass(/hidden/);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await expect(page.locator('#page-settings-modal')).toHaveClass(/hidden/);
});
