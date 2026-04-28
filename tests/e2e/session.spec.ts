/**
 * Session restore regression tests.
 * Verifies that open files, font size, and theme are remembered across app restarts.
 */
import { test, expect } from '@playwright/test';
import { launchApp, openFile, sendMenuEvent, createTempMd, removeTempMd, waitForContent, getRootCSSVar } from './helpers/app';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// These tests close and relaunch the app — each test manages its own lifecycle

test('session restores previously open file on relaunch', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pd-session-test-'));
  const fp = createTempMd('# Session File\n\nPersisted content.', 'session-file');
  try {
    // First launch — open the file
    let { app, page } = await launchApp({ userDataDir });
    await openFile(app, fp);
    await waitForContent(page);
    // Wait for session debounce (1500ms) to save
    await page.waitForTimeout(2500);
    await app.close();

    // Second launch — verify file is restored
    ({ app, page } = await launchApp({ userDataDir }));
    await page.waitForTimeout(1500); // allow session restore to run

    // The file should be open in a tab
    const tabLabels = await page.locator('#tabs .tab').allTextContents();
    const restored = tabLabels.some(t => t.includes('session-file'));
    expect(restored).toBe(true);

    await app.close();
  } finally {
    removeTempMd(fp);
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});

test('session restores font size across relaunch', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pd-session-test-'));
  let { app, page } = await launchApp({ userDataDir });
  const fp = createTempMd('# Font Session', 'font-session');
  try {
    await openFile(app, fp);
    await waitForContent(page);

    // Increase font size 3 times
    await sendMenuEvent(app, 'menu-font-increase');
    await sendMenuEvent(app, 'menu-font-increase');
    await sendMenuEvent(app, 'menu-font-increase');
    await page.waitForTimeout(2500); // session debounce

    const factorBefore = await page.evaluate(() => localStorage.getItem('fontSizeFactor'));
    await app.close();

    // Relaunch and check localStorage has the same factor
    ({ app, page } = await launchApp({ userDataDir }));
    await page.waitForTimeout(1000);
    const factorAfter = await page.evaluate(() => localStorage.getItem('fontSizeFactor'));
    expect(factorAfter).toBe(factorBefore);

    // Reset font size
    await sendMenuEvent(app, 'menu-font-reset');
    await app.close();
  } finally {
    removeTempMd(fp);
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});

test('session restores theme across relaunch', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pd-session-test-'));
  let { app, page } = await launchApp({ userDataDir });
  const fp = createTempMd('# Theme Session', 'theme-session');
  try {
    await openFile(app, fp);
    await waitForContent(page);
    await sendMenuEvent(app, 'menu-theme-change', 'sepia');
    await page.waitForTimeout(500);

    // Record the CSS variable while sepia is active
    const sepiaBodyColor = await getRootCSSVar(page, '--theme-body');
    expect(sepiaBodyColor).toBeTruthy();

    await page.waitForTimeout(2500); // session debounce
    await app.close();

    // Relaunch — verify theme is restored in localStorage AND applied to DOM
    ({ app, page } = await launchApp({ userDataDir }));
    await page.waitForTimeout(1500);

    const stored = await page.evaluate(() => localStorage.getItem('selectedTheme'));
    expect(stored).toBe('sepia');

    const restoredBodyColor = await getRootCSSVar(page, '--theme-body');
    expect(restoredBodyColor).toBe(sepiaBodyColor); // CSS variable actually applied, not just stored

    // Reset theme
    await sendMenuEvent(app, 'menu-theme-change', 'dark');
    await app.close();
  } finally {
    removeTempMd(fp);
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});
