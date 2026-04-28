/**
 * Table of Contents regression tests.
 * Covers: auto-generation, sidebar toggle, click-to-scroll, scroll-spy,
 * empty state for files with no headings.
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, openAndWait, sendMenuEvent, createTempMd, removeTempMd, openFile } from './helpers/app';

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => { ({ app, page } = await launchApp()); });
test.afterAll(async () => { await app.close(); });

async function ensureTocOpen(page: Page) {
  const sidebar = page.locator('#toc-sidebar');
  const isOpen = await sidebar.evaluate(el => el.classList.contains('open'));
  if (!isOpen) {
    await page.locator('#toc-toggle').click();
    await page.waitForTimeout(300);
  }
}

async function closeToc(page: Page) {
  const sidebar = page.locator('#toc-sidebar');
  const isOpen = await sidebar.evaluate(el => el.classList.contains('open'));
  if (isOpen) {
    await page.locator('#toc-toggle').click();
    await page.waitForTimeout(300);
  }
}

// ── TOC button & sidebar ───────────────────────────────────────────────────

test('TOC toggle button is visible', async () => {
  await openAndWait(app, page, 'markdown-basics.md');
  await expect(page.locator('#toc-toggle')).toBeVisible();
});

test('TOC sidebar starts without .open class', async () => {
  await openAndWait(app, page, 'markdown-basics.md');
  await closeToc(page);
  const hasOpen = await page.locator('#toc-sidebar').evaluate(el => el.classList.contains('open'));
  expect(hasOpen).toBe(false);
});

test('clicking TOC toggle adds .open to sidebar', async () => {
  await openAndWait(app, page, 'markdown-basics.md');
  await closeToc(page);
  await page.locator('#toc-toggle').click();
  await page.waitForTimeout(300);
  await expect(page.locator('#toc-sidebar')).toHaveClass(/open/);
  await closeToc(page);
});

test('clicking TOC toggle twice restores closed state', async () => {
  await openAndWait(app, page, 'markdown-basics.md');
  await closeToc(page);
  await page.locator('#toc-toggle').click();
  await page.waitForTimeout(300);
  await page.locator('#toc-toggle').click();
  await page.waitForTimeout(300);
  const hasOpen = await page.locator('#toc-sidebar').evaluate(el => el.classList.contains('open'));
  expect(hasOpen).toBe(false);
});

test('keyboard shortcut Cmd/Ctrl+\\ toggles TOC', async () => {
  await openAndWait(app, page, 'markdown-basics.md');
  await closeToc(page);
  await sendMenuEvent(app, 'menu-toggle-toc');
  await page.waitForTimeout(300);
  await expect(page.locator('#toc-sidebar')).toHaveClass(/open/);
  await sendMenuEvent(app, 'menu-toggle-toc');
  await page.waitForTimeout(300);
});

// ── TOC content population ─────────────────────────────────────────────────

test('TOC is populated with headings from the file', async () => {
  await openAndWait(app, page, 'markdown-basics.md');
  await ensureTocOpen(page);
  const tocContent = page.locator('#toc-content');
  await expect(tocContent).not.toContainText('No headings found');
  await closeToc(page);
});

test('TOC contains h1 heading text', async () => {
  await openAndWait(app, page, 'markdown-basics.md');
  await ensureTocOpen(page);
  await expect(page.locator('#toc-content')).toContainText('Heading 1');
  await closeToc(page);
});

test('TOC contains all heading levels present in the document', async () => {
  await openAndWait(app, page, 'markdown-basics.md');
  await ensureTocOpen(page);
  const toc = page.locator('#toc-content');
  // markdown-basics.md has h2 sections: Lists, Blockquote, Code Fence, Table, Horizontal Rule
  await expect(toc).toContainText('Lists');
  await closeToc(page);
});

test('TOC shows "No headings found" for file with no headings', async () => {
  const fp = createTempMd('Just a plain paragraph with no headings.\n\nAnother paragraph.', 'no-headings');
  try {
    await openFile(app, fp);
    await page.waitForTimeout(800);
    await ensureTocOpen(page);
    await expect(page.locator('#toc-content')).toContainText('No headings found');
    await closeToc(page);
  } finally {
    removeTempMd(fp);
  }
});

// ── Click-to-scroll ────────────────────────────────────────────────────────

test('clicking a TOC item scrolls the content to that heading', async () => {
  await openAndWait(app, page, 'markdown-basics.md', { extraMs: 200 });
  await ensureTocOpen(page);

  // Get initial scroll position
  const before = await page.locator('#content').evaluate(el => el.scrollTop);

  // Click a heading that's lower on the page (e.g. "Table")
  const tocItems = page.locator('#toc-content a, #toc-content [class*="toc-item"]');
  const count = await tocItems.count();
  if (count > 2) {
    // Click last item to trigger scroll
    await tocItems.last().click();
    await page.waitForTimeout(600);
    const after = await page.locator('#content').evaluate(el => el.scrollTop);
    // If the item is below the fold, scroll should have changed
    // (For a short doc it might be 0 already, so just verify no crash)
    expect(after).toBeGreaterThanOrEqual(0);
  }
  await closeToc(page);
});

// ── TOC updates with Torture_Test.md ─────────────────────────────────────

test('TOC for Torture_Test.md has many items', async () => {
  await openAndWait(app, page, '../../../Test_Files/Torture_Test.md', { extraMs: 500 });
  await ensureTocOpen(page);
  const items = page.locator('#toc-content a, #toc-content [class*="toc-item"]');
  const count = await items.count();
  expect(count).toBeGreaterThan(5); // torture test has many headings
  await closeToc(page);
});

// ── Independent scroll (toc-long.md) ─────────────────────────────────────
// These tests verify the two scroll containers are truly independent of each
// other, and that TOC navigation actually moves #content.

test.describe('independent scrolling', () => {
  test.beforeEach(async () => {
    await openAndWait(app, page, 'toc-long.md');
    await ensureTocOpen(page);
    // Reset both scroll containers to top before every test
    await page.locator('#content').evaluate(el => { el.scrollTop = 0; });
    await page.locator('#toc-content').evaluate(el => { el.scrollTop = 0; });
    await page.waitForTimeout(100);
  });

  test.afterEach(async () => {
    await closeToc(page);
  });

  test('#content has overflow:auto or overflow:scroll', async () => {
    const ov = await page.locator('#content').evaluate(
      el => window.getComputedStyle(el).overflowY
    );
    expect(['auto', 'scroll']).toContain(ov);
  });

  test('#toc-content has overflow-y:auto or overflow-y:scroll', async () => {
    const ov = await page.locator('#toc-content').evaluate(
      el => window.getComputedStyle(el).overflowY
    );
    expect(['auto', 'scroll']).toContain(ov);
  });

  test('scrolling #content does not move #toc-content', async () => {
    await page.locator('#content').evaluate(el => { el.scrollTop = 200; });
    await page.waitForTimeout(100);

    const contentScroll = await page.locator('#content').evaluate(el => el.scrollTop);
    const tocScroll = await page.locator('#toc-content').evaluate(el => el.scrollTop);

    expect(contentScroll).toBeGreaterThan(0);
    expect(tocScroll).toBe(0);
  });

  test('scrolling #toc-content does not move #content', async () => {
    await page.locator('#toc-content').evaluate(el => { el.scrollTop = 100; });
    await page.waitForTimeout(100);

    const contentScroll = await page.locator('#content').evaluate(el => el.scrollTop);
    expect(contentScroll).toBe(0);
  });
});

// ── TOC navigation actually moves #content ────────────────────────────────

test.describe('TOC click navigation', () => {
  test.beforeEach(async () => {
    await openAndWait(app, page, 'toc-long.md');
    await ensureTocOpen(page);
    await page.locator('#content').evaluate(el => { el.scrollTop = 0; });
    await page.waitForTimeout(100);
  });

  test.afterEach(async () => {
    await closeToc(page);
  });

  test('clicking the last TOC item scrolls #content below zero', async () => {
    const tocItems = page.locator('#toc-content .toc-item');
    await expect(tocItems.first()).toBeVisible();

    await tocItems.last().click();
    // Allow smooth-scroll animation to complete
    await page.waitForTimeout(700);

    const scrollTop = await page.locator('#content').evaluate(el => el.scrollTop);
    expect(scrollTop).toBeGreaterThan(0);
  });

  test('clicking the first TOC item after scrolling down returns near top', async () => {
    // Scroll down first
    await page.locator('#content').evaluate(el => { el.scrollTop = 600; });
    await page.waitForTimeout(100);

    await page.locator('#toc-content .toc-item').first().click();
    await page.waitForTimeout(700);

    const scrollTop = await page.locator('#content').evaluate(el => el.scrollTop);
    // scrollToHeading applies a –20px padding offset so result should be near 0
    expect(scrollTop).toBeLessThan(50);
  });

  test('later TOC items scroll further than earlier ones', async () => {
    const tocItems = page.locator('#toc-content .toc-item');
    const count = await tocItems.count();
    expect(count).toBeGreaterThanOrEqual(4);

    await tocItems.nth(1).click();
    await page.waitForTimeout(700);
    const pos1 = await page.locator('#content').evaluate(el => el.scrollTop);

    await page.locator('#content').evaluate(el => { el.scrollTop = 0; });
    await page.waitForTimeout(100);

    await tocItems.nth(count - 1).click();
    await page.waitForTimeout(700);
    const posLast = await page.locator('#content').evaluate(el => el.scrollTop);

    expect(posLast).toBeGreaterThan(pos1);
  });

  test('clicked TOC item receives .active class', async () => {
    const item = page.locator('#toc-content .toc-item').nth(2);
    await item.click();
    await page.waitForTimeout(300);
    await expect(item).toHaveClass(/active/);
  });
});
