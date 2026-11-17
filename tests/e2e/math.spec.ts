/**
 * MathJax / math rendering regression tests.
 * Verifies VS Code-compatible math parsing via @vscode/markdown-it-katex
 * with MathJax as the final renderer.
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, openAndWait, createTempMd, removeTempMd } from './helpers/app';

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
  await page.waitForTimeout(3000);
});

test('math content section is present', async () => {
  await expect(page.locator('#markdown-content h1')).toContainText('Math Equations Test');
});

test('inline math renders (MathJax output elements present)', async () => {
  const mathOutput = page.locator(
    '[class*="MathJax"], [class*="mjx"], mjx-container, .MathJax_Display, .MathJax',
  );
  const count = await mathOutput.count();
  expect(count).toBeGreaterThan(0);
});

test('display math block is rendered', async () => {
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
  const rows = table.locator('tbody tr');
  await expect(rows).toHaveCount(2);
});

test('fenced math block renders via MathJax', async () => {
  // The ```math block should produce MathJax output, not a code block
  const content = page.locator('#markdown-content');
  const mjxContainers = content.locator('mjx-container');
  const count = await mjxContainers.count();
  // At least 1 container from the fenced math block (plus inline/display ones)
  expect(count).toBeGreaterThan(2);
});

test('currency dollar amounts stay literal (not parsed as math)', async () => {
  const content = await page.locator('#markdown-content').textContent();
  expect(content).toContain('$20,000');
  expect(content).toContain('$30,000');
});

test('word-adjacent dollars stay literal', async () => {
  const content = await page.locator('#markdown-content').textContent();
  expect(content).toContain('word$x$word');
});

test('escaped dollar is literal', async () => {
  const tempFile = createTempMd('\\$x$ and real math: $y^2$');
  try {
    await openAndWait(app, page, tempFile);
    await page.waitForTimeout(3000);
    const content = await page.locator('#markdown-content').textContent();
    // The escaped dollar should remain as literal text
    expect(content).toContain('$x$');
    // Real math should be rendered by MathJax (not visible as raw $y^2$)
    const mjx = page.locator('#markdown-content mjx-container');
    const count = await mjx.count();
    expect(count).toBeGreaterThanOrEqual(1);
  } finally {
    removeTempMd(tempFile);
  }
});

test('math inside inline code is not rendered', async () => {
  const codeSpans = page.locator('#markdown-content code');
  const count = await codeSpans.count();
  let foundDollarX = false;
  for (let i = 0; i < count; i++) {
    const text = await codeSpans.nth(i).textContent();
    if (text?.includes('$x$')) {
      foundDollarX = true;
      break;
    }
  }
  expect(foundDollarX).toBe(true);
});

test('math inside code fence is not rendered as MathJax', async () => {
  // The ```text block containing $x$ should stay as a code block
  const pres = page.locator('#markdown-content pre code');
  const count = await pres.count();
  let foundDollarX = false;
  for (let i = 0; i < count; i++) {
    const text = await pres.nth(i).textContent();
    if (text?.includes('$x$')) {
      foundDollarX = true;
      break;
    }
  }
  expect(foundDollarX).toBe(true);
});

test('real inline math after code-protected content renders', async () => {
  // $x^2$ in the "Real math:" line should render via MathJax
  const mjx = page.locator('#markdown-content mjx-container');
  const count = await mjx.count();
  expect(count).toBeGreaterThan(0);
});

test('display math inside a list renders', async () => {
  const listItems = page.locator('#markdown-content li');
  const count = await listItems.count();
  expect(count).toBeGreaterThanOrEqual(2);
  // MathJax should have rendered inside the list
  const mjxInList = page.locator('#markdown-content li mjx-container, #markdown-content li .math-display');
  const mjxCount = await mjxInList.count();
  expect(mjxCount).toBeGreaterThanOrEqual(1);
});

test('display math inside a blockquote renders', async () => {
  const blockquote = page.locator('#markdown-content blockquote');
  await expect(blockquote).toBeVisible();
  const mjxInQuote = blockquote.locator('mjx-container, .math-display');
  const count = await mjxInQuote.count();
  expect(count).toBeGreaterThanOrEqual(1);
});

test('Chemistry_sample renders math and does not crash', async () => {
  await openAndWait(app, page, '../../../Test_Files/Chemistry_sample.md');
  await page.waitForTimeout(3000);
  await expect(page.locator('#markdown-content h1, #markdown-content h2').first()).toBeVisible();
});
