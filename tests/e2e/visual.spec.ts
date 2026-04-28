/**
 * Visual regression tests — screenshot comparisons.
 *
 * On first run (no baselines yet): run `npm run test:update-snapshots` to generate
 * the golden images.  Subsequent runs compare against those baselines.
 *
 * Run threshold is 0.2% pixel difference to tolerate minor anti-aliasing changes.
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, openAndWait, waitForDrawio } from './helpers/app';

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  ({ app, page } = await launchApp());
});

test.afterAll(async () => {
  await app.close();
});

const SNAP_OPTS = {
  maxDiffPixelRatio: 0.005, // 0.5% tolerance for font/AA differences
};

async function screenshotContent(page: Page, name: string) {
  // Locator screenshots are unreliable with executablePath Electron; use a
  // full-page screenshot clipped to the #content bounding box instead.
  const box = await page.locator('#content').boundingBox();
  const screenshot = await page.screenshot(box ? { clip: box } : {});
  expect(screenshot).toMatchSnapshot(`${name}.png`, SNAP_OPTS);
}

// ── Markdown visual snapshots ──────────────────────────────────────────────

test('markdown-basics renders consistently', async () => {
  await openAndWait(app, page, 'markdown-basics.md');
  await screenshotContent(page, 'markdown-basics');
});

// ── Math visual snapshots ──────────────────────────────────────────────────

test('math-equations renders consistently', async () => {
  await openAndWait(app, page, 'math-equations.md');
  await page.waitForTimeout(3000); // MathJax
  await screenshotContent(page, 'math-equations');
});

// ── Draw.io visual snapshots ───────────────────────────────────────────────

test('drawio-flowchart renders consistently', async () => {
  await openAndWait(app, page, 'drawio-flowchart.md', { drawio: true });
  await screenshotContent(page, 'drawio-flowchart');
});

test('drawio-shapes renders consistently', async () => {
  await openAndWait(app, page, 'drawio-shapes.md', { drawio: true });
  await screenshotContent(page, 'drawio-shapes');
});

test('drawio multi-diagram renders consistently', async () => {
  await openAndWait(app, page, 'drawio-multi-diagram.md', { drawio: true });
  await screenshotContent(page, 'drawio-multi-diagram');
});

test('drawio text-wrap renders consistently', async () => {
  await openAndWait(app, page, 'drawio-text-wrap.md', { drawio: true });
  await screenshotContent(page, 'drawio-text-wrap');
});

// ── Mermaid visual snapshots ───────────────────────────────────────────────

test('mermaid-diagrams renders consistently', async () => {
  await openAndWait(app, page, 'mermaid-diagrams.md');
  await page.waitForTimeout(3000); // Mermaid is async
  await screenshotContent(page, 'mermaid-diagrams');
});

// ── Full-page screenshot of existing test fixtures ────────────────────────

test('Draw.io_Diagram_Example renders consistently', async () => {
  await openAndWait(app, page, '../../../Test_Files/Draw.io_Diagram_Example.md', { drawio: true });
  await screenshotContent(page, 'Draw.io_Diagram_Example');
});
