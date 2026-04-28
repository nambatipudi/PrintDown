import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, openAndWait } from './helpers/app';

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  ({ app, page } = await launchApp());
});

test.afterAll(async () => {
  await app.close();
});

test.beforeEach(async () => {
  await openAndWait(app, page, 'markdown-basics.md');
});

// ── Headings ───────────────────────────────────────────────────────────────

test('renders h1 through h6', async () => {
  const mc = page.locator('#markdown-content');
  await expect(mc.locator('h1')).toContainText('Heading 1');
  await expect(mc.locator('h2').first()).toContainText('Heading 2');
  await expect(mc.locator('h3').first()).toContainText('Heading 3');
  await expect(mc.locator('h4').first()).toContainText('Heading 4');
  await expect(mc.locator('h5').first()).toContainText('Heading 5');
  await expect(mc.locator('h6').first()).toContainText('Heading 6');
});

// ── Inline formatting ──────────────────────────────────────────────────────

test('renders bold text', async () => {
  await expect(page.locator('#markdown-content strong').first()).toContainText('bold text');
});

test('renders italic text', async () => {
  await expect(page.locator('#markdown-content em').first()).toContainText('italic text');
});

test('renders inline code', async () => {
  await expect(page.locator('#markdown-content code').first()).toContainText('code snippet');
});

// ── Lists ──────────────────────────────────────────────────────────────────

test('renders unordered list', async () => {
  const ul = page.locator('#markdown-content ul').first();
  await expect(ul).toBeVisible();
  await expect(ul.locator('li').first()).toContainText('Unordered item one');
});

test('renders ordered list', async () => {
  const ol = page.locator('#markdown-content ol').first();
  await expect(ol).toBeVisible();
  await expect(ol.locator('li').first()).toContainText('Ordered item one');
});

test('renders task list checkboxes', async () => {
  const checkboxes = page.locator('#markdown-content input[type="checkbox"]');
  await expect(checkboxes).toHaveCount(2);
  await expect(checkboxes.first()).toBeChecked();
  await expect(checkboxes.nth(1)).not.toBeChecked();
});

// ── Blockquote ─────────────────────────────────────────────────────────────

test('renders blockquote', async () => {
  const bq = page.locator('#markdown-content blockquote').first();
  await expect(bq).toBeVisible();
  await expect(bq).toContainText('This is a blockquote');
});

// ── Code fence ─────────────────────────────────────────────────────────────

test('renders fenced code block', async () => {
  const pre = page.locator('#markdown-content pre').first();
  await expect(pre).toBeVisible();
  await expect(pre).toContainText('function hello');
});

// ── Table ──────────────────────────────────────────────────────────────────

test('renders table with header and rows', async () => {
  const table = page.locator('#markdown-content table').first();
  await expect(table).toBeVisible();
  await expect(table.locator('th').first()).toContainText('Column A');
  await expect(table.locator('td').first()).toContainText('left');
});

// ── Horizontal rule ────────────────────────────────────────────────────────

test('renders horizontal rule', async () => {
  await expect(page.locator('#markdown-content hr').first()).toBeVisible();
});

// ── No errors ─────────────────────────────────────────────────────────────

test('renders without error messages', async () => {
  const errors = page.locator('#markdown-content .error, #markdown-content [style*="color: red"], #markdown-content [style*="color:#f44"]');
  await expect(errors).toHaveCount(0);
});
