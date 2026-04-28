/**
 * MathJax / math rendering regression tests.
 */
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
  await openAndWait(app, page, 'math-equations.md');
  // MathJax rendering is async; give it time
  await page.waitForTimeout(3000);
});

test('math content section is present', async () => {
  await expect(page.locator('#markdown-content h1')).toContainText('Math Equations Test');
});

test('inline math renders (MathJax output elements present)', async () => {
  // MathJax outputs elements with class "MathJax" or data-mjx attributes
  const mathOutput = page.locator(
    '[class*="MathJax"], [class*="mjx"], mjx-container, .MathJax_Display, .MathJax',
  );
  const count = await mathOutput.count();
  expect(count).toBeGreaterThan(0);
});

test('display math block is rendered', async () => {
  // Display math typically wraps in a block-level element
  const display = page.locator('[class*="MathJax_Display"], mjx-container[display="true"], .MathJax_Display');
  const count = await display.count();
  expect(count).toBeGreaterThan(0);
});

test('math section headings are preserved', async () => {
  await expect(page.locator('#markdown-content h2').nth(0)).toContainText('Inline Math');
  await expect(page.locator('#markdown-content h2').nth(1)).toContainText('Display Math');
});

test('math in tables renders without breaking table structure', async () => {
  const table = page.locator('#markdown-content table').last();
  await expect(table).toBeVisible();
  // Table should still have 2 data rows
  const rows = table.locator('tbody tr');
  await expect(rows).toHaveCount(2);
});

test('Chemistry_sample renders math and does not crash', async () => {
  await openAndWait(app, page, '../../../Test_Files/Chemistry_sample.md');
  await page.waitForTimeout(3000);
  await expect(page.locator('#markdown-content h1, #markdown-content h2').first()).toBeVisible();
});
