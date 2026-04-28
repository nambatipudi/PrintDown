/**
 * Drag-and-drop file opening regression tests.
 * Verifies the drop event handler is wired, prevents default browser behavior,
 * and opens files when real paths are supplied via the DataTransfer.
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, fixture, createTempMd, removeTempMd } from './helpers/app';

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => { ({ app, page } = await launchApp()); });
test.afterAll(async () => { await app.close(); });

// ── Drop event handler is registered ──────────────────────────────────────

test('document.body has a drop event listener', async () => {
  const hasListener = await page.evaluate(() => {
    // Dispatch a custom dragover event and check if it was prevented
    const e = new DragEvent('dragover', { bubbles: true, cancelable: true });
    document.body.dispatchEvent(e);
    return e.defaultPrevented;
  });
  expect(hasListener).toBe(true);
});

test('document.body has a dragenter event listener', async () => {
  const handled = await page.evaluate(() => {
    const e = new DragEvent('dragenter', { bubbles: true, cancelable: true });
    document.body.dispatchEvent(e);
    return e.defaultPrevented;
  });
  expect(handled).toBe(true);
});

// ── Simulated drop with file path via DataTransfer text ───────────────────

test('dropping a file via text/uri-list opens it as a tab', async () => {
  const fp = createTempMd('# Dropped File\n\nViaDrop.', 'drop-file');
  try {
    const uri = `file://${fp}`;
    const tabsBefore = await page.locator('#tabs .tab').count();

    await page.evaluate((fileUri) => {
      const dt = new DataTransfer();
      dt.setData('text/uri-list', fileUri);
      const dropEvt = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: dt,
      });
      document.body.dispatchEvent(dropEvt);
    }, uri);

    // Wait for file open processing
    await page.waitForTimeout(1500);
    const tabsAfter = await page.locator('#tabs .tab').count();
    expect(tabsAfter).toBeGreaterThan(tabsBefore);
  } finally {
    removeTempMd(fp);
  }
});

test('dropping a non-md file does not crash the app', async () => {
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData('text/uri-list', 'file:///tmp/not-a-real-file.txt');
    document.body.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  });
  await page.waitForTimeout(500);
  // App should still respond
  await expect(page.locator('#toc-toggle')).toBeVisible();
});

// ── Multiple files dropped ────────────────────────────────────────────────

test('dropping multiple files opens them as multiple tabs', async () => {
  const f1 = createTempMd('# Multi Drop 1', 'drop-multi-1');
  const f2 = createTempMd('# Multi Drop 2', 'drop-multi-2');
  try {
    const tabsBefore = await page.locator('#tabs .tab').count();

    await page.evaluate(([uri1, uri2]) => {
      const dt = new DataTransfer();
      dt.setData('text/uri-list', `${uri1}\n${uri2}`);
      document.body.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    }, [`file://${f1}`, `file://${f2}`]);

    await page.waitForTimeout(2000);
    const tabsAfter = await page.locator('#tabs .tab').count();
    expect(tabsAfter).toBeGreaterThanOrEqual(tabsBefore + 2);
  } finally {
    removeTempMd(f1);
    removeTempMd(f2);
  }
});
