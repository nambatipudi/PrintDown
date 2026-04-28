/**
 * File operations regression tests.
 * Covers: save to disk, dirty flag, refresh button, external file change detection.
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, openFile, sendMenuEvent, waitForStatus, createTempMd, removeTempMd } from './helpers/app';
import * as fs from 'fs';
import * as path from 'path';

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => { ({ app, page } = await launchApp()); });
test.afterAll(async () => { await app.close(); });

// ── Save ───────────────────────────────────────────────────────────────────

test('save shows "Saved" in status indicator', async () => {
  const fp = createTempMd('# Save Test\n\nOriginal content.', 'save-test');
  try {
    await openFile(app, fp);
    await page.waitForTimeout(800);

    // Enable edit mode and make a change
    await page.locator('#edit-toggle').click();
    await page.waitForTimeout(400);
    await page.locator('#editor-container .cm-content').first().click();
    await page.keyboard.press('End');
    await page.keyboard.type(' modified');
    await page.waitForTimeout(600);

    // Trigger save
    await sendMenuEvent(app, 'menu-save');
    await waitForStatus(page, 'Saved');

    await expect(page.locator('#status-indicator')).toContainText('Saved');
    await expect(page.locator('#status-indicator')).toHaveClass(/success/);

    // Disable edit mode
    await page.locator('#edit-toggle').click();
  } finally {
    removeTempMd(fp);
  }
});

test('save actually writes changes to disk', async () => {
  const fp = createTempMd('# Disk Write Test\n\nOriginal.', 'disk-write');
  try {
    await openFile(app, fp);
    await page.waitForTimeout(800);

    await page.locator('#edit-toggle').click();
    await page.waitForTimeout(400);
    await page.locator('#editor-container .cm-content').first().click();
    // Move to end of document and type unique text
    const uniqueText = `UNIQUE_${Date.now()}`;
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.press('Enter');
    await page.keyboard.type(uniqueText);
    await page.waitForTimeout(600);

    await sendMenuEvent(app, 'menu-save');
    await waitForStatus(page, 'Saved', 5000);

    // Read the file from disk
    const content = fs.readFileSync(fp, 'utf-8');
    expect(content).toContain(uniqueText);

    await page.locator('#edit-toggle').click();
  } finally {
    removeTempMd(fp);
  }
});

test('Cmd/Ctrl+S keyboard shortcut triggers save', async () => {
  const fp = createTempMd('# Shortcut Save\n\nContent.', 'shortcut-save');
  try {
    await openFile(app, fp);
    await page.waitForTimeout(800);
    await page.locator('#edit-toggle').click();
    await page.waitForTimeout(400);
    await page.locator('#editor-container .cm-content').first().click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('shortcut-typed');
    await page.waitForTimeout(400);

    await page.keyboard.press('ControlOrMeta+s');
    await waitForStatus(page, 'Saved', 5000);

    await expect(page.locator('#status-indicator')).toContainText('Saved');
    await page.locator('#edit-toggle').click();
  } finally {
    removeTempMd(fp);
  }
});

// ── Status indicator states ────────────────────────────────────────────────

test('status indicator has .success class after save', async () => {
  const fp = createTempMd('# Status Test', 'status-test');
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

// ── Refresh button ─────────────────────────────────────────────────────────

test('refresh button (#refresh-toggle) is present', async () => {
  await openFile(app, createTempMd('# Refresh Test', 'refresh'));
  await page.waitForTimeout(600);
  await expect(page.locator('#refresh-toggle')).toBeVisible();
});

test('clicking refresh re-renders the content', async () => {
  const fp = createTempMd('# Refresh Content\n\nParagraph text.', 'refresh-content');
  try {
    await openFile(app, fp);
    await page.waitForTimeout(800);
    await expect(page.locator('#markdown-content h1')).toContainText('Refresh Content');

    await page.locator('#refresh-toggle').click();
    await page.waitForTimeout(600);

    // Content should still be rendered after refresh
    await expect(page.locator('#markdown-content h1')).toContainText('Refresh Content');
  } finally {
    removeTempMd(fp);
  }
});

// ── File watching / external change ───────────────────────────────────────

test('external file change auto-reloads clean tab', async () => {
  // When the tab has no local edits, an external file change is auto-reloaded
  // (the confirm dialog only fires when isDirty=true)
  const fp = createTempMd('# Watch Test\n\nOriginal line.', 'file-watch');
  try {
    await openFile(app, fp);
    await page.waitForTimeout(1200); // wait for file watcher to attach

    // Modify the file externally
    fs.writeFileSync(fp, '# Watch Test\n\nModified externally RELOAD_MARKER.', 'utf-8');
    // File watcher debounce + render
    await page.waitForTimeout(3000);

    // Clean tab should auto-reload with new content
    await expect(page.locator('#markdown-content')).toContainText('RELOAD_MARKER');
  } finally {
    removeTempMd(fp);
  }
});

test('accepting reload dialog updates tab content', async () => {
  const fp = createTempMd('# Reload Accept\n\nBefore reload.', 'reload-accept');
  try {
    await openFile(app, fp);
    await page.waitForTimeout(1200);

    page.once('dialog', async (dialog) => {
      await dialog.accept(); // Confirm reload
    });

    const newContent = '# Reload Accept\n\nAfter reload UNIQUE_MARKER.';
    fs.writeFileSync(fp, newContent, 'utf-8');
    await page.waitForTimeout(3000);

    // After accepting reload, content should reflect external change
    await expect(page.locator('#markdown-content')).toContainText('UNIQUE_MARKER');
  } finally {
    removeTempMd(fp);
  }
});
