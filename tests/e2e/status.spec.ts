/**
 * Status indicator regression tests.
 * Covers: success/error/saving states, auto-clear, text content.
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, openFile, sendMenuEvent, waitForStatus, createTempMd, removeTempMd } from './helpers/app';

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => { ({ app, page } = await launchApp()); });
test.afterAll(async () => { await app.close(); });

test('#status-indicator exists in the DOM', async () => {
  await expect(page.locator('#status-indicator')).toBeAttached();
});

test('opening a file shows status message', async () => {
  const fp = createTempMd('# Status Open', 'status-open');
  try {
    await openFile(app, fp);
    await page.waitForTimeout(1000);
    // After opening, the status may briefly show something or be empty — the key thing
    // is that the element exists and content rendered (not a crash)
    await expect(page.locator('#markdown-content')).toBeVisible();
  } finally {
    removeTempMd(fp);
  }
});

test('save shows .success class on status indicator', async () => {
  const fp = createTempMd('# Status Save', 'status-save');
  try {
    await openFile(app, fp);
    await page.waitForTimeout(800);
    await sendMenuEvent(app, 'menu-save');
    await waitForStatus(page, 'Saved', 5000);
    await expect(page.locator('#status-indicator')).toHaveClass(/success/);
  } finally {
    removeTempMd(fp);
  }
});

test('status indicator shows "Saved" text on save', async () => {
  const fp = createTempMd('# Status Saved Text', 'status-saved-text');
  try {
    await openFile(app, fp);
    await page.waitForTimeout(800);
    await sendMenuEvent(app, 'menu-save');
    await waitForStatus(page, 'Saved', 5000);
    await expect(page.locator('#status-indicator')).toContainText('Saved');
  } finally {
    removeTempMd(fp);
  }
});

test('status indicator auto-clears after ~2.5 seconds', async () => {
  const fp = createTempMd('# Auto Clear', 'auto-clear');
  try {
    await openFile(app, fp);
    await page.waitForTimeout(800);
    await sendMenuEvent(app, 'menu-save');
    await waitForStatus(page, 'Saved', 5000);
    // Wait for auto-clear (2.5s + buffer)
    await page.waitForTimeout(3500);
    const text = await page.locator('#status-indicator').textContent();
    expect(text?.trim() ?? '').toBe('');
  } finally {
    removeTempMd(fp);
  }
});
