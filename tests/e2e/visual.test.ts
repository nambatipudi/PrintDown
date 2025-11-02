/**
 * Visual regression tests for PrintDown
 * These tests capture screenshots and compare them against baselines
 */

import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import { compareScreenshots } from '../helpers/screenshot-compare';
import path from 'path';
import fs from 'fs';

let electronApp: ElectronApplication;
let window: Page;

test.beforeAll(async () => {
  // Launch Electron app
  electronApp = await electron.launch({
    args: [path.join(__dirname, '../../dist/main.js')],
  });

  // Get the first window
  window = await electronApp.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  await window.waitForTimeout(2000); // Wait for initial render
});

test.afterAll(async () => {
  await electronApp.close();
});

describe('Visual Regression Tests', () => {
  const fixturesPath = path.join(__dirname, '../fixtures');
  const baselinePath = path.join(__dirname, '../visual-baselines');
  const screenshotsPath = path.join(__dirname, '../../test-results/screenshots');

  test.beforeEach(async () => {
    // Ensure screenshots directory exists
    if (!fs.existsSync(screenshotsPath)) {
      fs.mkdirSync(screenshotsPath, { recursive: true });
    }
  });

  test('should match dark theme screenshot', async () => {
    // Load test document
    const testFile = path.join(fixturesPath, 'test-document.md');
    
    await electronApp.evaluate(async ({ app }, testFilePath) => {
      const { BrowserWindow } = require('electron');
      const mainWindow = BrowserWindow.getAllWindows()[0];
      mainWindow.webContents.send('open-file', testFilePath);
    }, testFile);

    await window.waitForTimeout(2000); // Wait for rendering

    // Set dark theme
    await electronApp.evaluate(async ({ app }) => {
      const { BrowserWindow } = require('electron');
      const mainWindow = BrowserWindow.getAllWindows()[0];
      mainWindow.webContents.send('menu-theme-change', 'dark');
    });

    await window.waitForTimeout(500);

    // Take screenshot
    const screenshot = await window.screenshot({ 
      path: path.join(screenshotsPath, 'dark-theme.png'),
      fullPage: false 
    });

    // Compare with baseline (if exists)
    const baselineFile = path.join(baselinePath, 'dark-theme.png');
    if (fs.existsSync(baselineFile)) {
      const mismatchPercentage = await compareScreenshots(
        baselineFile,
        screenshot,
        path.join(screenshotsPath, 'dark-theme-diff.png')
      );
      
      // Allow 1% difference for anti-aliasing, font rendering variations
      expect(mismatchPercentage).toBeLessThan(1);
    } else {
      // Create baseline if it doesn't exist
      console.log('Creating baseline screenshot for dark theme');
      fs.mkdirSync(baselinePath, { recursive: true });
      fs.writeFileSync(baselineFile, screenshot);
    }
  });

  test('should match light theme screenshot', async () => {
    // Set light theme
    await electronApp.evaluate(async ({ app }) => {
      const { BrowserWindow } = require('electron');
      const mainWindow = BrowserWindow.getAllWindows()[0];
      mainWindow.webContents.send('menu-theme-change', 'light');
    });

    await window.waitForTimeout(500);

    // Take screenshot
    const screenshot = await window.screenshot({ 
      path: path.join(screenshotsPath, 'light-theme.png'),
      fullPage: false 
    });

    // Compare with baseline (if exists)
    const baselineFile = path.join(baselinePath, 'light-theme.png');
    if (fs.existsSync(baselineFile)) {
      const mismatchPercentage = await compareScreenshots(
        baselineFile,
        screenshot,
        path.join(screenshotsPath, 'light-theme-diff.png')
      );
      
      expect(mismatchPercentage).toBeLessThan(1);
    } else {
      console.log('Creating baseline screenshot for light theme');
      fs.mkdirSync(baselinePath, { recursive: true });
      fs.writeFileSync(baselineFile, screenshot);
    }
  });

  test('should match TOC expanded state', async () => {
    // Ensure TOC is visible
    const tocToggle = window.locator('#toc-toggle');
    await tocToggle.click();
    await window.waitForTimeout(500);

    // Take screenshot
    const screenshot = await window.screenshot({ 
      path: path.join(screenshotsPath, 'toc-expanded.png'),
      fullPage: false 
    });

    const baselineFile = path.join(baselinePath, 'toc-expanded.png');
    if (fs.existsSync(baselineFile)) {
      const mismatchPercentage = await compareScreenshots(
        baselineFile,
        screenshot,
        path.join(screenshotsPath, 'toc-expanded-diff.png')
      );
      
      expect(mismatchPercentage).toBeLessThan(1);
    } else {
      console.log('Creating baseline screenshot for TOC expanded');
      fs.mkdirSync(baselinePath, { recursive: true });
      fs.writeFileSync(baselineFile, screenshot);
    }
  });

  test('should match math rendering', async () => {
    // Find a math element and take a focused screenshot
    const mathElement = window.locator('mjx-container').first();
    await mathElement.waitFor({ state: 'visible' });

    const screenshot = await mathElement.screenshot({ 
      path: path.join(screenshotsPath, 'math-rendering.png')
    });

    const baselineFile = path.join(baselinePath, 'math-rendering.png');
    if (fs.existsSync(baselineFile)) {
      const mismatchPercentage = await compareScreenshots(
        baselineFile,
        screenshot,
        path.join(screenshotsPath, 'math-rendering-diff.png')
      );
      
      // Math rendering should be exact
      expect(mismatchPercentage).toBeLessThan(0.5);
    } else {
      console.log('Creating baseline screenshot for math rendering');
      fs.mkdirSync(baselinePath, { recursive: true });
      fs.writeFileSync(baselineFile, screenshot);
    }
  });

  test('should match code block rendering', async () => {
    // Find a code block and take a focused screenshot
    const codeBlock = window.locator('pre code').first();
    await codeBlock.waitFor({ state: 'visible' });

    const screenshot = await codeBlock.screenshot({ 
      path: path.join(screenshotsPath, 'code-block.png')
    });

    const baselineFile = path.join(baselinePath, 'code-block.png');
    if (fs.existsSync(baselineFile)) {
      const mismatchPercentage = await compareScreenshots(
        baselineFile,
        screenshot,
        path.join(screenshotsPath, 'code-block-diff.png')
      );
      
      expect(mismatchPercentage).toBeLessThan(0.5);
    } else {
      console.log('Creating baseline screenshot for code block');
      fs.mkdirSync(baselinePath, { recursive: true });
      fs.writeFileSync(baselineFile, screenshot);
    }
  });
});
