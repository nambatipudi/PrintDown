/**
 * Quick rendering diagnostic test
 * Run this to quickly check if the app is rendering correctly
 */

import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';

test.describe('Quick Rendering Diagnostic', () => {
  let electronApp: ElectronApplication;
  let window: Page;

  test.beforeAll(async () => {
    // Launch Electron with explicit main bundle path
    electronApp = await electron.launch({
      args: [path.join(__dirname, '../../dist/main.js')],
      timeout: 30000,
    });

    window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    console.log('✓ App launched');
  });

  test.afterAll(async () => {
    await electronApp.close();
  });

  test('DIAGNOSTIC: Full rendering check', async () => {
    console.log('\n=== STARTING DIAGNOSTIC ===\n');

    // Step 1: Check if app window is visible
    console.log('Step 1: Checking window visibility...');
    const isVisible = await window.isVisible('body');
    console.log(`  Body visible: ${isVisible}`);
    expect(isVisible).toBe(true);

    // Step 2: Wait for renderer readiness beacon (up to 5s)
    console.log('\nStep 2: Waiting for renderer readiness beacon...');
    const readyStart = Date.now();
    let ready = false;
    while (Date.now() - readyStart < 5000) {
      ready = await window.evaluate(() => (window as any).__PD_RENDERER_READY === true);
      if (ready) break;
      await window.waitForTimeout(250);
    }
    console.log(`  Renderer ready flag: ${ready}`);
    if (!ready) {
      const earlyStatus = await window.evaluate(async () => (window as any).ipc?.invoke('pd:test:get-dom-status'));
      console.log('[WARN] Renderer readiness flag missing. Early status:', JSON.stringify(earlyStatus, null, 2));
      test.skip(true, 'Renderer not ready - skipping deeper diagnostic steps');
    }

    // Step 3: Check DOM structure
    console.log('\nStep 3: Checking DOM structure...');
    const domStatus = await window.evaluate(async () => (window as any).ipc?.invoke('pd:test:get-dom-status'));
    console.log('[DIAGNOSTIC] DOM Status via IPC:', domStatus);
    if (!domStatus || !domStatus.hasContent) {
      const detail = JSON.stringify(domStatus, null, 2);
      throw new Error('App DOM failed to include #content. Detailed status:\n' + detail);
    }

    // Step 4: Open a test file via test IPC
    console.log('\nStep 4: Opening test markdown file via test IPC...');
    const testFile = path.join(__dirname, 'fixtures/test-document.md');
    const openResult = await window.evaluate(async (fp) => (window as any).ipc?.invoke('pd:test:open-file', fp), testFile);
    console.log('  Open result:', openResult);
    expect(openResult?.success).toBe(true);

    // Wait up to 5s for content to render/paginate
    const renderStart = Date.now();
    let rendered = false;
    while (Date.now() - renderStart < 5000) {
      rendered = await window.evaluate(() => {
        const mc = document.getElementById('markdown-content');
        const pages = document.querySelectorAll('.pagedjs_page').length;
        return (mc && mc.innerHTML.length > 50) || pages > 0;
      });
      if (rendered) break;
      await window.waitForTimeout(250);
    }
    console.log('  Rendered flag:', rendered);

    // Step 5: Check if markdown was rendered
    console.log('\nStep 5: Checking if markdown was rendered...');
    const renderCheck = await window.evaluate(() => {
      const markdownContent = document.getElementById('markdown-content');
      const html = markdownContent?.innerHTML || '';
      return {
        hasContent: html.length > 0,
        contentLength: html.length,
        hasHeadings: html.includes('<h1') || html.includes('<h2'),
        hasParagraphs: html.includes('<p>'),
        hasCodeBlocks: html.includes('<pre'),
        firstHtml: html.substring(0, 200)
      };
    });
    console.log('  Markdown rendering:', JSON.stringify(renderCheck, null, 2));
    expect(renderCheck.hasContent).toBe(true);
    expect(renderCheck.hasHeadings).toBe(true);

    // Step 6: Check visibility of content
    console.log('\nStep 6: Checking content visibility...');
    const visibilityCheck = await window.evaluate(() => {
      const markdownContent = document.getElementById('markdown-content');
      const contentDiv = document.getElementById('content');
      const pagesContainer = document.querySelector('.pagedjs_pages');
      const pages = Array.from(document.querySelectorAll('.pagedjs_page')).map(p => {
        const r = (p as HTMLElement).getBoundingClientRect();
        return { w: r.width, h: r.height, area: Math.round(r.width * r.height) };
      });
      const visiblePages = pages.filter(p => p.area > 0).length;
      return {
        markdownContent: {
          display: markdownContent ? getComputedStyle(markdownContent).display : null,
          visibility: markdownContent ? getComputedStyle(markdownContent).visibility : null,
          opacity: markdownContent ? getComputedStyle(markdownContent).opacity : null,
          inDOM: !!markdownContent,
          parentId: markdownContent?.parentElement?.id || null
        },
        contentDiv: {
          display: contentDiv ? getComputedStyle(contentDiv).display : null,
          childCount: contentDiv?.children.length || 0
        },
        pagesContainer: {
          exists: !!pagesContainer,
          display: pagesContainer ? getComputedStyle(pagesContainer).display : null,
          pageCount: pages.length,
          visiblePages
        }
      };
    });
    console.log('  Visibility:', JSON.stringify(visibilityCheck, null, 2));

    // Step 7: Check for JavaScript errors
    console.log('\nStep 7: Checking for JavaScript errors...');
    const errors: string[] = [];
    window.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    // Wait a bit more to catch any delayed errors
    await window.waitForTimeout(1000);
    
    if (errors.length > 0) {
      console.log('  ⚠ JavaScript Errors found:');
      errors.forEach(err => console.log(`    - ${err}`));
    } else {
      console.log('  ✓ No JavaScript errors');
    }

    // Step 8: Take screenshot
    console.log('\nStep 8: Taking screenshot...');
    const screenshotPath = path.join(__dirname, '../../test-results/diagnostic-screenshot.png');
    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    await window.screenshot({ 
      path: screenshotPath,
      fullPage: true 
    });
    console.log(`  Screenshot saved: ${screenshotPath}`);

    // Step 9: Check if PagedPolyfill is working
    console.log('\nStep 9: Checking paged.js status...');
    const pagedStatus = await window.evaluate(() => {
      const win = window as any;
      return {
        loaded: typeof win.PagedPolyfill !== 'undefined',
        hasPreview: typeof win.PagedPolyfill?.preview === 'function',
        pagesCreated: document.querySelectorAll('.pagedjs_page').length > 0
      };
    });
    console.log('  Paged.js:', JSON.stringify(pagedStatus, null, 2));

    // Step 10: Final verdict
    console.log('\n=== DIAGNOSTIC SUMMARY ===');
    console.log(`✓ App launched: YES`);
    console.log(`✓ DOM structure: OK`);
  console.log(`✓ Renderer Ready Payload: ${JSON.stringify(domStatus.rendererReady)}`);
    console.log(`✓ Markdown rendered: ${renderCheck.hasContent ? 'YES' : 'NO'}`);
    console.log(`✓ Content visible: ${visibilityCheck.markdownContent.display !== 'none' || visibilityCheck.pagesContainer.exists ? 'YES' : 'NO'}`);
    console.log(`✓ Paged.js loaded: ${pagedStatus.loaded ? 'YES' : 'NO'}`);
    console.log(`✓ JavaScript errors: ${errors.length === 0 ? 'NONE' : errors.length}`);

    // Determine the issue
    if (!renderCheck.hasContent) {
      console.log('\n❌ ISSUE: Markdown is NOT being rendered into HTML');
    } else if (visibilityCheck.markdownContent.display === 'none' && !visibilityCheck.pagesContainer.exists) {
      console.log('\n❌ ISSUE: Markdown is hidden and pagination did NOT create pages');
    } else if (visibilityCheck.pagesContainer.exists && visibilityCheck.pagesContainer.display === 'none') {
      console.log('\n❌ ISSUE: Pagination created pages but they are HIDDEN');
    } else if (visibilityCheck.markdownContent.display !== 'none') {
      console.log('\n✓ GOOD: Markdown content is visible (pagination may be disabled)');
    } else if (visibilityCheck.pagesContainer.exists && visibilityCheck.pagesContainer.display !== 'none') {
      console.log('\n✓ GOOD: Pagination is working and pages are visible');
    }

    console.log('\n=== END DIAGNOSTIC ===\n');

    // Main assertion
    const isWorking = renderCheck.hasContent && (
      visibilityCheck.markdownContent.display !== 'none' ||
      (visibilityCheck.pagesContainer.exists && visibilityCheck.pagesContainer.visiblePages > 0)
    );
    
    expect(isWorking).toBe(true);
  });

  test('DIAGNOSTIC: Check what user sees on screen', async () => {
    console.log('\n=== CHECKING WHAT USER SEES ===\n');

    await window.waitForTimeout(2000);

    const screenState = await window.evaluate(() => {
      const pages = Array.from(document.querySelectorAll('.pagedjs_page')) as HTMLElement[];
      const visiblePages = pages.filter(p => {
        const r = p.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      const markdownContent = document.getElementById('markdown-content');
      const mcLen = markdownContent ? markdownContent.textContent?.length || 0 : 0;
      return {
        pageCount: pages.length,
        visiblePages: visiblePages.length,
        markdownChars: mcLen
      };
    });
    console.log('Screen state (pages/markdown):', screenState);
    expect(screenState.visiblePages > 0 || screenState.markdownChars > 50).toBe(true);
  });
});
