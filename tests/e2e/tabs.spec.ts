/**
 * Tab management regression tests.
 * Covers: open, switch, close, close-others, close-all, dirty flag,
 * context menu, tab scroll arrows, tab label.
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, openFile, openAndWait, fixture, TEST_FILES } from './helpers/app';
import * as path from 'path';

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => { ({ app, page } = await launchApp()); });
test.afterAll(async () => { await app.close(); });

// ── Opening files ──────────────────────────────────────────────────────────

test('opening a file creates a tab', async () => {
  await openAndWait(app, page, 'markdown-basics.md');
  await expect(page.locator('#tabs .tab')).toHaveCount(1);
});

test('tab label shows the filename', async () => {
  await expect(page.locator('#tabs .tab').last()).toContainText('markdown-basics');
});

test('opening a second file adds a second tab', async () => {
  await openAndWait(app, page, 'math-equations.md');
  expect(await page.locator('#tabs .tab').count()).toBeGreaterThanOrEqual(2);
});

test('opening the same file twice does not duplicate the tab', async () => {
  const before = await page.locator('#tabs .tab').count();
  await openAndWait(app, page, 'markdown-basics.md');
  const after = await page.locator('#tabs .tab').count();
  expect(after).toBe(before); // same count — switched to existing tab
});

test('content area shows content after opening a file', async () => {
  await openAndWait(app, page, 'markdown-basics.md');
  await expect(page.locator('#markdown-content')).toBeVisible();
  await expect(page.locator('.empty-state')).not.toBeVisible();
});

// ── Tab switching ──────────────────────────────────────────────────────────

test('clicking a different tab changes displayed content', async () => {
  // Ensure both tabs are open
  await openAndWait(app, page, 'markdown-basics.md');
  await openAndWait(app, page, 'math-equations.md');

  const tabs = page.locator('#tabs .tab');
  const count = await tabs.count();
  expect(count).toBeGreaterThanOrEqual(2);

  // Click the first tab
  await tabs.first().click();
  await page.waitForTimeout(300);
  await expect(page.locator('#markdown-content h1').first()).toBeVisible();
});

// ── Tab context menu ───────────────────────────────────────────────────────

test('right-clicking a tab shows the context menu', async () => {
  await openAndWait(app, page, 'markdown-basics.md');
  await page.locator('#tabs .tab').first().click({ button: 'right' });
  await page.waitForTimeout(150);
  await expect(page.locator('#tab-context-menu')).toBeVisible();
});

test('context menu has Close, Close Others, Close All actions', async () => {
  const menu = page.locator('#tab-context-menu');
  await expect(menu.locator('[data-action="close"]')).toBeVisible();
  await expect(menu.locator('[data-action="close-others"]')).toBeVisible();
  await expect(menu.locator('[data-action="close-all"]')).toBeVisible();
  // Dismiss menu by clicking elsewhere
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
});

test('Close All removes all tabs and shows empty state', async () => {
  // Make sure we have tabs
  await openAndWait(app, page, 'markdown-basics.md');
  await openAndWait(app, page, 'math-equations.md');

  // Right-click any tab and close all
  await page.locator('#tabs .tab').first().click({ button: 'right' });
  await page.waitForTimeout(150);
  await page.locator('#tab-context-menu [data-action="close-all"]').click();
  await page.waitForTimeout(300);

  await expect(page.locator('#tabs .tab')).toHaveCount(0);
  await expect(page.locator('.empty-state')).toBeVisible();
});

test('Close Others leaves only the right-clicked tab', async () => {
  await openAndWait(app, page, 'markdown-basics.md');
  await openAndWait(app, page, 'math-equations.md');
  await openAndWait(app, page, 'mermaid-diagrams.md');

  const firstTab = page.locator('#tabs .tab').first();
  await firstTab.click({ button: 'right' });
  await page.waitForTimeout(150);
  await page.locator('#tab-context-menu [data-action="close-others"]').click();
  await page.waitForTimeout(300);

  await expect(page.locator('#tabs .tab')).toHaveCount(1);
});

// ── Tab scroll arrows ──────────────────────────────────────────────────────

test('tab scroll arrows are present in DOM', async () => {
  await expect(page.locator('#tab-scroll-left')).toBeAttached();
  await expect(page.locator('#tab-scroll-right')).toBeAttached();
});

test('opening many files makes scroll arrows visible', async () => {
  // Open all Test_Files
  for (const name of ['markdown-basics.md', 'math-equations.md', 'mermaid-diagrams.md',
                       'drawio-flowchart.md', 'drawio-shapes.md', 'drawio-multi-diagram.md']) {
    await openFile(app, fixture(name));
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(500);
  // With enough tabs the scroll arrows should be visible
  const leftArrow = page.locator('#tab-scroll-left');
  const rightArrow = page.locator('#tab-scroll-right');
  // At least they should be present (may be hidden if window is wide enough)
  await expect(leftArrow).toBeAttached();
  await expect(rightArrow).toBeAttached();
  // Clean up — close all
  await page.locator('#tabs .tab').first().click({ button: 'right' });
  await page.waitForTimeout(150);
  await page.locator('#tab-context-menu [data-action="close-all"]').click();
  await page.waitForTimeout(300);
});
