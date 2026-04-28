/**
 * Mermaid and UML sequence diagram rendering regression tests.
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

// ── Mermaid ────────────────────────────────────────────────────────────────

test.describe('mermaid diagrams', () => {
  test.beforeEach(async () => {
    await openAndWait(app, page, 'mermaid-diagrams.md');
    // Give Mermaid extra time — it initialises lazily
    await page.waitForTimeout(3000);
  });

  test('mermaid containers exist in DOM', async () => {
    // Mermaid renders into .mermaid divs or wraps them
    const containers = page.locator('.mermaid, .mermaid-container, [class*="mermaid"]');
    expect(await containers.count()).toBeGreaterThanOrEqual(1);
  });

  test('mermaid renders SVG output', async () => {
    const mermaidSvg = page.locator('.mermaid svg, [class*="mermaid"] svg, #markdown-content svg').first();
    await expect(mermaidSvg).toBeVisible({ timeout: 10_000 });
  });

  test('flowchart SVG contains nodes', async () => {
    const svgs = page.locator('#markdown-content svg');
    const count = await svgs.count();
    expect(count).toBeGreaterThanOrEqual(1);
    // At least one SVG should have child elements (shapes/text)
    const firstSvgChildren = await svgs.first().evaluate(el => el.childElementCount);
    expect(firstSvgChildren).toBeGreaterThan(0);
  });

  test('renders without JS errors thrown to page', async () => {
    // If mermaid throws, it typically shows a red error div or console error
    const errBoxes = page.locator('[class*="error"][class*="mermaid"], .mermaid-error');
    await expect(errBoxes).toHaveCount(0);
  });
});

// ── Full test-fixture smoke tests ─────────────────────────────────────────

test.describe('existing diagram fixture files', () => {
  test('Sequence_Diagram_Example.md renders diagrams', async () => {
    await openAndWait(app, page, '../../../Test_Files/Sequence_Diagram_Example.md');
    await page.waitForTimeout(3000);
    const svgs = page.locator('#markdown-content svg');
    expect(await svgs.count()).toBeGreaterThanOrEqual(1);
  });

  test('Torture_Test.md renders without crash', async () => {
    await openAndWait(app, page, '../../../Test_Files/Torture_Test.md');
    await page.waitForTimeout(12000); // torture test has lots of diagrams + MathJax
    // The page should render content (not empty state)
    await expect(page.locator('#markdown-content h1').first()).toBeVisible();
    // No uncaught error banner
    await expect(page.locator('.error-banner, [data-error]')).toHaveCount(0);
  });
});
