/**
 * Guards the automation ergonomics of the packaged app: under Playwright the
 * window must stay visible to the renderer but never take OS focus, so a test
 * run cannot steal the developer's keyboard and mouse.
 */
import { test, expect } from '@playwright/test';
import { launchApp } from './helpers/app';

test('the test window renders without stealing focus', async () => {
  const { app, page } = await launchApp();
  try {
    const windowState = await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      return {
        visible: win.isVisible(),
        focused: win.isFocused(),
        minimized: win.isMinimized(),
      };
    });

    // Visible so layout, fonts, and diagram rendering behave like production...
    expect(windowState.visible).toBe(true);
    expect(windowState.minimized).toBe(false);
    // ...but never frontmost, so typing elsewhere is not interrupted.
    expect(windowState.focused).toBe(false);

    // The renderer is still fully driveable over CDP despite being unfocused.
    await expect(page.locator('#markdown-content')).toHaveCount(1);
    expect(await page.evaluate(() => document.readyState)).toBe('complete');
  } finally {
    await app.close();
  }
});

test('the app does not appear in the macOS Dock during tests', async () => {
  test.skip(process.platform !== 'darwin', 'Dock visibility is a macOS concept');

  const { app } = await launchApp();
  try {
    const dockVisible = await app.evaluate(({ app: electronApp }) => electronApp.dock?.isVisible() ?? false);
    expect(dockVisible).toBe(false);
  } finally {
    await app.close();
  }
});
