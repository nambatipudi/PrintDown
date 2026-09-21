/**
 * Page settings and PDF export regression tests.
 * Covers: modal open/close, page size, margins, orientation,
 * page view toggle, persistence, PDF export trigger.
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, openAndWait, sendMenuEvent } from './helpers/app';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let app: ElectronApplication;
let page: Page;
let exportDirectory: string;
let exportPath: string;

test.beforeAll(async () => {
  exportDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'printdown-pdf-export-'));
  exportPath = path.join(exportDirectory, 'document.pdf');
  ({ app, page } = await launchApp({ pdfExportPath: exportPath }));
});
test.afterAll(async () => {
  await app.close();
  fs.rmSync(exportDirectory, { recursive: true, force: true });
});

test.beforeEach(async () => {
  await openAndWait(app, page, 'markdown-basics.md');
});

// ── Modal open / close ─────────────────────────────────────────────────────

test('page settings button (#page-settings-btn) is visible', async () => {
  await expect(page.locator('#page-settings-btn')).toBeVisible();
});

test('clicking page settings button removes .hidden from modal', async () => {
  await expect(page.locator('#page-settings-modal')).toHaveClass(/hidden/);
  await page.locator('#page-settings-btn').click();
  await page.waitForTimeout(200);
  await expect(page.locator('#page-settings-modal')).not.toHaveClass(/hidden/);
  // Close
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
});

test('modal contains page size selector', async () => {
  await page.locator('#page-settings-btn').click();
  await page.waitForTimeout(200);
  // There should be a selector for page size (A4, Letter, etc.)
  const selects = page.locator('#page-settings-modal select');
  expect(await selects.count()).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
});

test('modal contains margin inputs', async () => {
  await page.locator('#page-settings-btn').click();
  await page.waitForTimeout(200);
  const inputs = page.locator('#page-settings-modal input[type="number"]');
  expect(await inputs.count()).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
});

test('modal contains orientation toggle', async () => {
  await page.locator('#page-settings-btn').click();
  await page.waitForTimeout(200);
  const orientControls = page.locator('#page-settings-modal input[type="radio"], #page-settings-modal select');
  expect(await orientControls.count()).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
});

// ── Close with Escape ──────────────────────────────────────────────────────

test('pressing Escape closes the modal', async () => {
  await page.locator('#page-settings-btn').click();
  await page.waitForTimeout(200);
  await expect(page.locator('#page-settings-modal')).not.toHaveClass(/hidden/);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await expect(page.locator('#page-settings-modal')).toHaveClass(/hidden/);
});

// ── Page view toggle ───────────────────────────────────────────────────────

test('page view checkbox exists in modal', async () => {
  await page.locator('#page-settings-btn').click();
  await page.waitForTimeout(200);
  const pageViewToggle = page.locator('#page-settings-modal input[type="checkbox"]');
  expect(await pageViewToggle.count()).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
});

test('enabling page view adds .page-view-active to #content', async () => {
  await page.locator('#page-settings-btn').click();
  await page.waitForTimeout(200);

  const checkbox = page.locator('#page-settings-modal input[type="checkbox"]').first();
  const isChecked = await checkbox.isChecked();

  if (!isChecked) {
    await checkbox.click();
    await page.waitForTimeout(300);
    await expect(page.locator('#content')).toHaveClass(/page-view-active/);
    // Toggle back off
    await checkbox.click();
    await page.waitForTimeout(300);
  } else {
    // Already on — check class is present
    await expect(page.locator('#content')).toHaveClass(/page-view-active/);
    // Toggle off
    await checkbox.click();
    await page.waitForTimeout(300);
  }

  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
});

test('disabling page view removes .page-view-active from #content', async () => {
  // Ensure page view is off
  const content = page.locator('#content');
  if (await content.evaluate(el => el.classList.contains('page-view-active'))) {
    await page.locator('#page-settings-btn').click();
    await page.waitForTimeout(200);
    await page.locator('#page-settings-modal input[type="checkbox"]').first().click();
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }
  await expect(content).not.toHaveClass(/page-view-active/);
});

// ── Settings persistence ───────────────────────────────────────────────────

test('page settings are saved to localStorage', async () => {
  await page.locator('#page-settings-btn').click();
  await page.waitForTimeout(200);
  // Interact with a margin input to trigger save (use #margin-top directly; custom-width is hidden)
  const marginInput = page.locator('#margin-top');
  await marginInput.fill('25');
  await page.waitForTimeout(400);
  await page.locator('#page-settings-save').click();
  await page.waitForTimeout(200);

  // Check localStorage for page settings
  const stored = await page.evaluate(() => localStorage.getItem('pageSettings'));
  expect(stored).not.toBeNull();
});

test('A3 page view uses the documented A3 width', async () => {
  await page.locator('#page-settings-btn').click();
  await page.locator('#page-size-select').selectOption('A3');

  const pageViewToggle = page.locator('#page-view-toggle');
  if (!await pageViewToggle.isChecked()) {
    await pageViewToggle.check();
  }
  await page.locator('#page-settings-save').click();

  const maxWidth = await page.locator('#markdown-content').evaluate(
    element => parseFloat((element as HTMLElement).style.maxWidth),
  );
  expect(maxWidth).toBeCloseTo((297 / 25.4) * 96, 1);

  const stored = await page.evaluate(() => localStorage.getItem('pageSettings'));
  expect(JSON.parse(stored!)).toMatchObject({ size: 'A3', pageView: true });
});

// ── PDF export ─────────────────────────────────────────────────────────────

test('menu export writes a non-empty PDF file', async () => {
  await sendMenuEvent(app, 'menu-export-pdf');

  await expect.poll(() => fs.existsSync(exportPath)).toBe(true);
  const pdf = fs.readFileSync(exportPath);
  expect(pdf.length).toBeGreaterThan(0);
  expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
});
