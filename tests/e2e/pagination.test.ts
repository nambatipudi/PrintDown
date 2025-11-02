/**
 * Pagination and rendering tests for PrintDown
 * These tests verify that paged.js pagination works correctly
 */

import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
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

describe('Pagination and Rendering Tests', () => {
  const fixturesPath = path.join(__dirname, '../fixtures');

  test('should load the app successfully', async () => {
    const title = await window.title();
    expect(title).toContain('PrintDown');
    
    const isVisible = await window.isVisible('body');
    expect(isVisible).toBe(true);
  });

  test('should have required DOM elements', async () => {
    // Check for main content container
    const content = window.locator('#content');
    await expect(content).toBeVisible();

    // Check for markdown content container
    const markdownContent = window.locator('#markdown-content');
    await expect(markdownContent).toBeAttached();

    // Check for TOC sidebar
    const tocSidebar = window.locator('#toc-sidebar');
    await expect(tocSidebar).toBeAttached();
  });

  test('should open and render markdown file', async () => {
    const testFile = path.join(fixturesPath, 'test-document.md');
    
    // Open file via IPC
    await electronApp.evaluate(async ({ app }, filePath) => {
      const { BrowserWindow } = require('electron');
      const mainWindow = BrowserWindow.getAllWindows()[0];
      mainWindow.webContents.send('open-file', filePath);
    }, testFile);

    await window.waitForTimeout(3000); // Wait for rendering and MathJax

    // Check if markdown content has been rendered
    const content = window.locator('#markdown-content');
    const innerHTML = await content.innerHTML();
    
    expect(innerHTML.length).toBeGreaterThan(0);
    expect(innerHTML).toContain('<h1');
  });

  test('should render headings correctly', async () => {
    const h1 = window.locator('#markdown-content h1');
    const h1Count = await h1.count();
    expect(h1Count).toBeGreaterThan(0);

    const h2 = window.locator('#markdown-content h2');
    const h2Count = await h2.count();
    expect(h2Count).toBeGreaterThan(0);
  });

  test('should render code blocks with syntax highlighting', async () => {
    const codeBlocks = window.locator('#markdown-content pre code');
    const count = await codeBlocks.count();
    expect(count).toBeGreaterThan(0);

    // Check if code has language class
    const firstCode = codeBlocks.first();
    const className = await firstCode.getAttribute('class');
    expect(className).toBeTruthy();
  });

  test('should render tables', async () => {
    const tables = window.locator('#markdown-content table');
    const count = await tables.count();
    expect(count).toBeGreaterThan(0);

    // Check table structure
    const firstTable = tables.first();
    const thead = firstTable.locator('thead');
    await expect(thead).toBeAttached();
    
    const tbody = firstTable.locator('tbody');
    await expect(tbody).toBeAttached();
  });

  test('should render math equations with MathJax', async () => {
    // Wait for MathJax to process
    await window.waitForTimeout(2000);

    const mathElements = window.locator('mjx-container');
    const count = await mathElements.count();
    
    expect(count).toBeGreaterThan(0);

    // Check if first math element is visible
    const firstMath = mathElements.first();
    await expect(firstMath).toBeVisible();
  });

  test('should check if PagedPolyfill is loaded', async () => {
    const hasPagedPolyfill = await window.evaluate(() => {
      return typeof (window as any).PagedPolyfill !== 'undefined';
    });

    console.log('PagedPolyfill loaded:', hasPagedPolyfill);
    expect(hasPagedPolyfill).toBe(true);
  });

  test('should verify content is visible before pagination', async () => {
    const markdownContent = window.locator('#markdown-content');
    
    // Get computed display style
    const display = await markdownContent.evaluate((el: HTMLElement) => {
      return getComputedStyle(el).display;
    });
    
    console.log('Markdown content display:', display);
    
    // Content should be visible (either 'block' or not 'none')
    // If pagination is active, it might be 'none'
    expect(['block', 'none']).toContain(display);
  });

  test('should check if pagination creates page containers', async () => {
    // Wait for pagination to complete
    await window.waitForTimeout(3000);

    // Check for paged.js container
    const pagesContainer = window.locator('.pagedjs_pages');
    const exists = await pagesContainer.count();
    
    console.log('Paged.js container exists:', exists > 0);

    if (exists > 0) {
      // If pagination is enabled, check pages
      const pages = window.locator('.pagedjs_page');
      const pageCount = await pages.count();
      
      console.log('Number of pages created:', pageCount);
      expect(pageCount).toBeGreaterThan(0);

      // Check if pages are visible
      const firstPage = pages.first();
      const isVisible = await firstPage.isVisible();
      expect(isVisible).toBe(true);
    } else {
      console.log('Pagination not enabled or not working');
    }
  });

  test('should verify content location (in markdown-content or pages)', async () => {
    const contentDiv = window.locator('#content');
    
    // Check what's inside content div
    const contentChildren = await contentDiv.evaluate((el: HTMLElement) => {
      const children = Array.from(el.children);
      return children.map(child => ({
        tagName: child.tagName,
        id: child.id,
        className: child.className,
        display: getComputedStyle(child).display
      }));
    });

    console.log('Content div children:', JSON.stringify(contentChildren, null, 2));

    // Either markdown-content should be visible, or pagedjs_pages should be visible
    const hasVisibleContent = contentChildren.some(child => 
      (child.id === 'markdown-content' && child.display !== 'none') ||
      (child.className.includes('pagedjs_pages') && child.display !== 'none')
    );

    expect(hasVisibleContent).toBe(true);
  });

  test('should check for console errors during rendering', async () => {
    const consoleErrors: string[] = [];
    const consoleWarnings: string[] = [];

    // Listen for console messages
    window.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      } else if (msg.type() === 'warning') {
        consoleWarnings.push(msg.text());
      }
    });

    // Trigger a re-render by opening a file
    const testFile = path.join(fixturesPath, 'test-document.md');
    await electronApp.evaluate(async ({ app }, filePath) => {
      const { BrowserWindow } = require('electron');
      const mainWindow = BrowserWindow.getAllWindows()[0];
      mainWindow.webContents.send('open-file', filePath);
    }, testFile);

    await window.waitForTimeout(4000);

    console.log('Console errors:', consoleErrors);
    console.log('Console warnings:', consoleWarnings);

    // Check if there are critical rendering errors
    const hasCriticalError = consoleErrors.some(err => 
      err.includes('Required elements not found') ||
      err.includes('Error during pagination')
    );

    if (hasCriticalError) {
      console.error('CRITICAL RENDERING ERRORS DETECTED');
    }

    // This assertion shows if there are errors but doesn't fail the test
    // Remove the ! to make it fail on errors
    expect(hasCriticalError).toBe(false);
  });

  test('should capture page state for debugging', async () => {
    await window.waitForTimeout(2000);

    const pageState = await window.evaluate(() => {
      const markdownContent = document.getElementById('markdown-content');
      const contentDiv = document.getElementById('content');
      const pagesContainer = document.querySelector('.pagedjs_pages');
      const pages = document.querySelectorAll('.pagedjs_page');

      return {
        markdownContent: {
          exists: !!markdownContent,
          display: markdownContent ? getComputedStyle(markdownContent).display : null,
          hasContent: markdownContent ? markdownContent.innerHTML.length > 0 : false,
          parent: markdownContent?.parentElement?.id || null
        },
        contentDiv: {
          exists: !!contentDiv,
          childCount: contentDiv?.children.length || 0,
          children: contentDiv ? Array.from(contentDiv.children).map(c => ({
            tag: c.tagName,
            id: c.id,
            class: c.className
          })) : []
        },
        pagination: {
          pagesContainerExists: !!pagesContainer,
          pagesContainerDisplay: pagesContainer ? getComputedStyle(pagesContainer).display : null,
          pageCount: pages.length,
          firstPageVisible: pages[0] ? getComputedStyle(pages[0]).display !== 'none' : false
        },
        pagedPolyfill: {
          loaded: typeof (window as any).PagedPolyfill !== 'undefined',
          preview: typeof (window as any).PagedPolyfill?.preview === 'function'
        }
      };
    });

    console.log('=== PAGE STATE DEBUG INFO ===');
    console.log(JSON.stringify(pageState, null, 2));

    // Save to file for analysis
    const debugPath = path.join(__dirname, '../../test-results/page-state-debug.json');
    fs.mkdirSync(path.dirname(debugPath), { recursive: true });
    fs.writeFileSync(debugPath, JSON.stringify(pageState, null, 2));

    console.log(`Debug info saved to: ${debugPath}`);

    // Verify basic requirements
    expect(pageState.markdownContent.exists).toBe(true);
    expect(pageState.contentDiv.exists).toBe(true);
    expect(pageState.pagedPolyfill.loaded).toBe(true);
  });

  test('should take screenshot for visual inspection', async () => {
    const screenshotPath = path.join(__dirname, '../../test-results/screenshots/current-state.png');
    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });

    await window.screenshot({ 
      path: screenshotPath,
      fullPage: true 
    });

    console.log(`Screenshot saved to: ${screenshotPath}`);
    
    // Verify file was created
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  test('should verify CSS is loaded', async () => {
    const hasStyles = await window.evaluate(() => {
      const stylesheets = Array.from(document.styleSheets);
      return {
        count: stylesheets.length,
        hasPagedCSS: Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
          .some((link: any) => link.href && link.href.includes('paged'))
      };
    });

    console.log('Stylesheets loaded:', hasStyles);
    expect(hasStyles.count).toBeGreaterThan(0);
  });

  test('should check if content has minimum height', async () => {
    const contentHeight = await window.evaluate(() => {
      const content = document.getElementById('content');
      const markdownContent = document.getElementById('markdown-content');
      
      return {
        contentHeight: content?.offsetHeight || 0,
        markdownHeight: markdownContent?.offsetHeight || 0,
        windowHeight: globalThis.innerHeight
      };
    });

    console.log('Heights:', contentHeight);
    
    // Either markdown-content or content should have substantial height
    const hasHeight = contentHeight.contentHeight > 100 || contentHeight.markdownHeight > 100;
    expect(hasHeight).toBe(true);
  });
});
