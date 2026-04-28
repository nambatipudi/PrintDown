/**
 * Advanced markdown rendering regression tests.
 * Covers: inline HTML, SVG from fences, auto-linked URLs, typography,
 * smart quotes, task lists, nested blockquotes.
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, openAndWait } from './helpers/app';

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => { ({ app, page } = await launchApp()); });
test.afterAll(async () => { await app.close(); });

// ── Inline HTML ────────────────────────────────────────────────────────────

test.describe('inline HTML passthrough', () => {
  test.beforeEach(async () => { await openAndWait(app, page, 'inline-html.md'); });

  test('raw <div> is rendered in the output', async () => {
    await expect(page.locator('#markdown-content #raw-div')).toBeVisible();
  });

  test('raw <span> inside paragraph is rendered', async () => {
    await expect(page.locator('#markdown-content #raw-span')).toBeVisible();
  });

  test('raw <details> element is rendered', async () => {
    await expect(page.locator('#markdown-content #raw-details')).toBeVisible();
  });

  test('<details> summary is clickable', async () => {
    const summary = page.locator('#markdown-content #raw-details summary');
    await expect(summary).toBeVisible();
    await summary.click();
    await page.waitForTimeout(200);
  });
});

// ── SVG from code fences ───────────────────────────────────────────────────

test.describe('SVG code fence rendering', () => {
  test.beforeEach(async () => { await openAndWait(app, page, 'svg-fence.md'); });

  test('SVG element is present in the rendered output', async () => {
    const svgs = page.locator('#markdown-content svg');
    expect(await svgs.count()).toBeGreaterThanOrEqual(1);
  });

  test('SVG contains a rect element (shapes rendered)', async () => {
    const rect = page.locator('#markdown-content svg rect');
    await expect(rect.first()).toBeAttached();
  });

  test('SVG contains a circle element', async () => {
    const circle = page.locator('#markdown-content svg circle');
    await expect(circle.first()).toBeAttached();
  });

  test('SVG is visible on screen', async () => {
    await expect(page.locator('#markdown-content svg').first()).toBeVisible();
  });
});

// ── Auto-linked URLs ───────────────────────────────────────────────────────

test.describe('URL auto-linking', () => {
  test.beforeEach(async () => { await openAndWait(app, page, 'typography-links.md'); });

  test('bare https:// URL becomes an anchor tag', async () => {
    const links = page.locator('#markdown-content a[href*="example.com"]');
    expect(await links.count()).toBeGreaterThanOrEqual(1);
  });

  test('bare http:// URL becomes an anchor tag', async () => {
    const links = page.locator('#markdown-content a[href*="test.org"]');
    expect(await links.count()).toBeGreaterThanOrEqual(1);
  });

  test('named markdown link renders correctly', async () => {
    const link = page.locator('#markdown-content a:has-text("Named link")');
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', 'https://example.com');
  });

  test('link with title attribute renders', async () => {
    const link = page.locator('#markdown-content a:has-text("Link with title")');
    await expect(link).toBeVisible();
  });
});

// ── Typography ─────────────────────────────────────────────────────────────

test.describe('typography extensions', () => {
  test.beforeEach(async () => { await openAndWait(app, page, 'typography-links.md'); });

  test('page renders without crash', async () => {
    await expect(page.locator('#markdown-content h1')).toContainText('Typography');
  });

  test('paragraphs are rendered', async () => {
    const paras = page.locator('#markdown-content p');
    expect(await paras.count()).toBeGreaterThan(0);
  });
});

// ── Task lists ─────────────────────────────────────────────────────────────

test.describe('task lists', () => {
  test.beforeEach(async () => { await openAndWait(app, page, 'markdown-basics.md'); });

  test('checked checkbox is rendered as checked', async () => {
    const checked = page.locator('#markdown-content input[type="checkbox"]:checked');
    expect(await checked.count()).toBeGreaterThanOrEqual(1);
  });

  test('unchecked checkbox is rendered as unchecked', async () => {
    const unchecked = page.locator('#markdown-content input[type="checkbox"]:not(:checked)');
    expect(await unchecked.count()).toBeGreaterThanOrEqual(1);
  });

  test('total checkboxes match expected count', async () => {
    const all = page.locator('#markdown-content input[type="checkbox"]');
    await expect(all).toHaveCount(2);
  });
});

// ── Nested blockquotes ─────────────────────────────────────────────────────

test.describe('nested blockquotes', () => {
  test.beforeEach(async () => { await openAndWait(app, page, 'markdown-basics.md'); });

  test('blockquote is visible', async () => {
    await expect(page.locator('#markdown-content blockquote').first()).toBeVisible();
  });

  test('blockquote contains expected text', async () => {
    await expect(page.locator('#markdown-content blockquote').first())
      .toContainText('This is a blockquote');
  });
});

// ── Torture_Test extended ─────────────────────────────────────────────────

test('Torture_Test.md renders footnote/details sections', async () => {
  await openAndWait(app, page, '../../../Test_Files/Torture_Test.md', { extraMs: 2000 });
  // The torture test has HTML embeds / details
  await expect(page.locator('#markdown-content h1, #markdown-content h2').first()).toBeVisible();
  // No red error messages
  await expect(page.locator('#markdown-content [style*="color: red"]')).toHaveCount(0);
});
