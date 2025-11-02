import { _electron as electron, ElectronApplication, Page } from 'playwright';
import { test, expect } from '@playwright/test';
import * as path from 'path';

let electronApp: ElectronApplication;
let window: Page;

test.beforeAll(async () => {
  // Launch Electron app
  electronApp = await electron.launch({
    args: [path.join(__dirname, '../../dist/main.js')],
  });
  
  // Get the first window
  window = await electronApp.firstWindow();
  
  // Wait for the app to be ready
  await window.waitForLoadState('domcontentloaded');
  await window.waitForTimeout(1000); // Give app time to initialize
});

test.afterAll(async () => {
  await electronApp.close();
});

test.describe('PrintDown E2E Tests', () => {
  
  test('should launch and show main window', async () => {
    // Check window exists and is visible
    expect(window).toBeTruthy();
    
    // Check title
    const title = await window.title();
    expect(title).toContain('PrintDown');
    
    // Check that main UI elements exist
    const tocToggle = await window.locator('#toc-toggle');
    expect(await tocToggle.isVisible()).toBe(true);
  });

  test('should open a markdown file and render content', async () => {
    const testFile = path.join(__dirname, '../fixtures/test-document.md');
    
    // Simulate file opening via IPC
    await electronApp.evaluate(async ({ app }, filePath) => {
      const { BrowserWindow } = require('electron');
      const mainWindow = BrowserWindow.getAllWindows()[0];
      mainWindow.webContents.send('file-opened', filePath);
    }, testFile);
    
    // Wait for content to render
    await window.waitForSelector('#markdown-content', { timeout: 5000 });
    
    // Check that content was rendered
    const content = await window.locator('#markdown-content');
    const html = await content.innerHTML();
    
    // Verify markdown was converted to HTML
    expect(html).toContain('<h1>'); // Heading
    expect(html).toContain('<code>'); // Code block
    expect(html).toContain('<table>'); // Table
    expect(html).toContain('<a'); // Link
  });

  test('should toggle TOC visibility', async () => {
    const tocSidebar = window.locator('#toc-sidebar');
    const tocToggle = window.locator('#toc-toggle');
    
    // Get initial state
    const initialDisplay = await tocSidebar.evaluate((el: HTMLElement) => 
      getComputedStyle(el).display
    );
    
    // Click toggle
    await tocToggle.click();
    await window.waitForTimeout(500);
    
    // Check state changed
    const newDisplay = await tocSidebar.evaluate((el: HTMLElement) => 
      getComputedStyle(el).display
    );
    
    expect(newDisplay).not.toBe(initialDisplay);
  });

  test('should change theme', async () => {
    // Get current background color
    const contentDiv = window.locator('#content');
    const initialBg = await contentDiv.evaluate((el: HTMLElement) => 
      getComputedStyle(el).backgroundColor
    );
    
    // Simulate theme change via menu
    await electronApp.evaluate(async ({ app }) => {
      const { BrowserWindow } = require('electron');
      const mainWindow = BrowserWindow.getAllWindows()[0];
      mainWindow.webContents.send('menu-theme-change', 'light');
    });
    
    await window.waitForTimeout(500);
    
    // Check background color changed
    const newBg = await contentDiv.evaluate((el: HTMLElement) => 
      getComputedStyle(el).backgroundColor
    );
    
    expect(newBg).not.toBe(initialBg);
  });

  test('should increase font size', async () => {
    const contentDiv = window.locator('#markdown-content');
    
    // Get initial font size
    const initialFontSize = await contentDiv.evaluate((el: HTMLElement) => 
      getComputedStyle(el).fontSize
    );
    
    // Simulate font size increase
    await electronApp.evaluate(async ({ app }) => {
      const { BrowserWindow } = require('electron');
      const mainWindow = BrowserWindow.getAllWindows()[0];
      mainWindow.webContents.send('menu-font-increase');
    });
    
    await window.waitForTimeout(500);
    
    // Check font size increased
    const newFontSize = await contentDiv.evaluate((el: HTMLElement) => 
      getComputedStyle(el).fontSize
    );
    
    const initialSize = parseFloat(initialFontSize);
    const newSize = parseFloat(newFontSize);
    
    expect(newSize).toBeGreaterThan(initialSize);
  });

  test('should render math equations', async () => {
    // Check if MathJax SVG elements are rendered
    const mathElements = window.locator('mjx-container');
    const count = await mathElements.count();
    
    expect(count).toBeGreaterThan(0);
    
    // Check if SVG is properly styled
    const firstMath = mathElements.first();
    const display = await firstMath.evaluate((el: HTMLElement) => 
      getComputedStyle(el).display
    );
    
    expect(display).not.toBe('none');
  });
});
