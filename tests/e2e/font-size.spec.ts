/**
 * Font size control regression tests.
 * Covers: increase, decrease, reset keyboard shortcuts and menu actions,
 * inline fontSize on #markdown-content, localStorage persistence.
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, openAndWait, sendMenuEvent, getContentFontSize } from './helpers/app';

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => { ({ app, page } = await launchApp()); });
test.afterAll(async () => { await app.close(); });

test.beforeEach(async () => {
  await openAndWait(app, page, 'markdown-basics.md');
  // Reset to default before each test
  await sendMenuEvent(app, 'menu-font-reset');
  await page.waitForTimeout(200);
});

// ── Helpers ────────────────────────────────────────────────────────────────

function parsePx(value: string): number {
  return parseFloat(value.replace('px', ''));
}

// ── Font increase ──────────────────────────────────────────────────────────

test('font increase makes #markdown-content font-size larger', async () => {
  const before = parsePx(await getContentFontSize(page));
  await sendMenuEvent(app, 'menu-font-increase');
  await page.waitForTimeout(200);
  const after = parsePx(await getContentFontSize(page));
  expect(after).toBeGreaterThan(before);
});

test('multiple font increases accumulate', async () => {
  const base = parsePx(await getContentFontSize(page));
  await sendMenuEvent(app, 'menu-font-increase');
  await sendMenuEvent(app, 'menu-font-increase');
  await sendMenuEvent(app, 'menu-font-increase');
  await page.waitForTimeout(200);
  const after = parsePx(await getContentFontSize(page));
  expect(after).toBeGreaterThan(base + 1);
});

// ── Font decrease ──────────────────────────────────────────────────────────

test('font decrease makes #markdown-content font-size smaller', async () => {
  const before = parsePx(await getContentFontSize(page));
  await sendMenuEvent(app, 'menu-font-decrease');
  await page.waitForTimeout(200);
  const after = parsePx(await getContentFontSize(page));
  expect(after).toBeLessThan(before);
});

// ── Font reset ─────────────────────────────────────────────────────────────

test('font reset returns font-size to base after increase', async () => {
  const base = parsePx(await getContentFontSize(page));
  await sendMenuEvent(app, 'menu-font-increase');
  await sendMenuEvent(app, 'menu-font-increase');
  await page.waitForTimeout(200);
  await sendMenuEvent(app, 'menu-font-reset');
  await page.waitForTimeout(200);
  const reset = parsePx(await getContentFontSize(page));
  expect(reset).toBeCloseTo(base, 0);
});

test('font reset returns font-size to base after decrease', async () => {
  const base = parsePx(await getContentFontSize(page));
  await sendMenuEvent(app, 'menu-font-decrease');
  await sendMenuEvent(app, 'menu-font-decrease');
  await page.waitForTimeout(200);
  await sendMenuEvent(app, 'menu-font-reset');
  await page.waitForTimeout(200);
  const reset = parsePx(await getContentFontSize(page));
  expect(reset).toBeCloseTo(base, 0);
});

// ── Keyboard shortcuts ─────────────────────────────────────────────────────

test('Cmd/Ctrl+= increases font size', async () => {
  const before = parsePx(await getContentFontSize(page));
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${mod}+=`);
  await page.waitForTimeout(200);
  const after = parsePx(await getContentFontSize(page));
  expect(after).toBeGreaterThan(before);
  // Restore
  await sendMenuEvent(app, 'menu-font-reset');
});

test('Cmd/Ctrl+- decreases font size', async () => {
  const before = parsePx(await getContentFontSize(page));
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${mod}+-`);
  await page.waitForTimeout(200);
  const after = parsePx(await getContentFontSize(page));
  expect(after).toBeLessThan(before);
  // Restore
  await sendMenuEvent(app, 'menu-font-reset');
});

test('Cmd/Ctrl+0 resets font size', async () => {
  const base = parsePx(await getContentFontSize(page));
  await sendMenuEvent(app, 'menu-font-increase');
  await sendMenuEvent(app, 'menu-font-increase');
  await page.waitForTimeout(150);
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${mod}+0`);
  await page.waitForTimeout(200);
  const reset = parsePx(await getContentFontSize(page));
  expect(reset).toBeCloseTo(base, 0);
});

// ── localStorage persistence ──────────────────────────────────────────────

test('fontSizeFactor is saved to localStorage', async () => {
  await sendMenuEvent(app, 'menu-font-increase');
  await page.waitForTimeout(200);
  const stored = await page.evaluate(() => localStorage.getItem('fontSizeFactor'));
  expect(stored).not.toBeNull();
  expect(parseFloat(stored!)).toBeGreaterThan(1);
  await sendMenuEvent(app, 'menu-font-reset');
});

// ── Boundary: content still renders after extreme font size ───────────────

test('content h1 still visible at large font size', async () => {
  for (let i = 0; i < 6; i++) await sendMenuEvent(app, 'menu-font-increase');
  await page.waitForTimeout(300);
  await expect(page.locator('#markdown-content h1').first()).toBeVisible();
  await sendMenuEvent(app, 'menu-font-reset');
});

test('content h1 still visible at small font size', async () => {
  for (let i = 0; i < 6; i++) await sendMenuEvent(app, 'menu-font-decrease');
  await page.waitForTimeout(300);
  await expect(page.locator('#markdown-content h1').first()).toBeVisible();
  await sendMenuEvent(app, 'menu-font-reset');
});
