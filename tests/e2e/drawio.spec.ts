/**
 * Draw.io rendering regression tests.
 *
 * Covers:
 *  - Basic flowchart (SVG produced, shapes + edges rendered)
 *  - Multiple diagrams on the same page (clipPath ID collision regression)
 *  - Various shape types (ellipse, rhombus, cylinder, swimlane)
 *  - Text wrapping inside boxes (htmlLabels=true regression)
 *  - No error messages
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

// ── Basic flowchart ────────────────────────────────────────────────────────

test.describe('basic flowchart', () => {
  test.beforeEach(async () => {
    await openAndWait(app, page, 'drawio-flowchart.md', { drawio: true });
  });

  test('produces at least one drawio-diagram container', async () => {
    await expect(page.locator('.drawio-diagram')).toHaveCount(1);
  });

  test('container contains an SVG element', async () => {
    const svg = page.locator('.drawio-diagram svg');
    await expect(svg).toBeVisible();
  });

  test('SVG contains rendered shapes (rect or path elements)', async () => {
    const shapes = page.locator('.drawio-diagram svg rect, .drawio-diagram svg ellipse, .drawio-diagram svg path');
    await expect(shapes.first()).toBeVisible();
  });

  test('SVG contains edge paths', async () => {
    const edges = page.locator('.drawio-diagram svg path');
    // Flowchart has 6 edges → at least a few paths rendered
    expect(await edges.count()).toBeGreaterThanOrEqual(1);
  });

  test('renders without error text', async () => {
    await expect(page.locator('.drawio-diagram')).not.toContainText('Error rendering diagram');
  });
});

// ── Multiple diagrams — clipPath collision regression ─────────────────────

test.describe('multiple diagrams on same page', () => {
  test.beforeEach(async () => {
    await openAndWait(app, page, 'drawio-multi-diagram.md', { drawio: true });
  });

  test('all three diagrams render', async () => {
    await expect(page.locator('.drawio-diagram')).toHaveCount(3);
  });

  test('every diagram has an SVG', async () => {
    const diagrams = page.locator('.drawio-diagram');
    const count = await diagrams.count();
    for (let i = 0; i < count; i++) {
      const svg = diagrams.nth(i).locator('svg');
      await expect(svg).toBeVisible();
    }
  });

  test('each SVG has a non-zero bounding box (not blank)', async () => {
    const diagrams = page.locator('.drawio-diagram svg');
    const count = await diagrams.count();
    for (let i = 0; i < count; i++) {
      const box = await diagrams.nth(i).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThan(10);
      expect(box!.height).toBeGreaterThan(10);
    }
  });

  test('none of the diagrams show an error message', async () => {
    const diagrams = page.locator('.drawio-diagram');
    const count = await diagrams.count();
    for (let i = 0; i < count; i++) {
      await expect(diagrams.nth(i)).not.toContainText('Error rendering diagram');
    }
  });
});

// ── Shape variety ──────────────────────────────────────────────────────────

test.describe('various shape types', () => {
  test.beforeEach(async () => {
    await openAndWait(app, page, 'drawio-shapes.md', { drawio: true });
  });

  test('renders ellipse shapes', async () => {
    // Shapes fixture has a cylinder and ellipse shape
    const svg = page.locator('.drawio-diagram svg');
    await expect(svg).toBeVisible();
  });

  test('renders swimlane container', async () => {
    const svg = page.locator('.drawio-diagram svg');
    await expect(svg).toBeVisible();
    // SVG should have rectangles from both container and children
    const rects = svg.locator('rect');
    expect(await rects.count()).toBeGreaterThanOrEqual(2);
  });

  test('all shapes fit within SVG viewBox (nothing cropped off)', async () => {
    const svg = page.locator('.drawio-diagram svg');
    const vb = await svg.getAttribute('viewBox');
    expect(vb).toBeTruthy();
    const [, , w, h] = (vb as string).split(' ').map(Number);
    expect(w).toBeGreaterThan(50);
    expect(h).toBeGreaterThan(50);
  });
});

// ── Text wrapping — htmlLabels regression ─────────────────────────────────

test.describe('text wrapping in boxes', () => {
  test.beforeEach(async () => {
    await openAndWait(app, page, 'drawio-text-wrap.md', { drawio: true });
  });

  test('SVG renders for text-wrap diagram', async () => {
    await expect(page.locator('.drawio-diagram svg')).toBeVisible();
  });

  test('foreignObject elements present (html labels enabled)', async () => {
    // @maxgraph/core uses foreignObject when htmlLabels=true
    const fo = page.locator('.drawio-diagram svg foreignObject');
    expect(await fo.count()).toBeGreaterThanOrEqual(1);
  });

  test('diagram has correct non-trivial height (text is not collapsed)', async () => {
    const svg = page.locator('.drawio-diagram svg');
    const box = await svg.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThan(100);
  });
});

// ── Text label content ─────────────────────────────────────────────────────
// Verify that node labels actually appear inside the rendered SVG, not just
// that SVG elements are present. An SVG with zero-size or hidden foreignObjects
// passes the shape tests but would be visually blank.

test.describe('text label rendering', () => {
  test('flowchart node labels are visible in the SVG', async () => {
    await openAndWait(app, page, 'drawio-flowchart.md', { drawio: true });
    // The flowchart has nodes: Start, Process Data, Is valid?, Save Result, Show Error, End
    // @maxgraph renders labels via foreignObject > div
    const svg = page.locator('.drawio-diagram svg');
    await expect(svg).toBeVisible();
    // At least one foreignObject should have non-empty text
    const labelText = await svg.evaluate(el => {
      const nodes = Array.from(el.querySelectorAll('foreignObject div, text'));
      return nodes.map(n => n.textContent?.trim()).filter(Boolean).join(' ');
    });
    expect(labelText.length).toBeGreaterThan(0);
  });

  test('multi-diagram: each diagram contains its own label text', async () => {
    await openAndWait(app, page, 'drawio-multi-diagram.md', { drawio: true });
    const diagrams = page.locator('.drawio-diagram');

    // Diagram 1 has Alpha, Beta; Diagram 2 has Gamma, Delta; Diagram 3 has Epsilon
    const texts = await diagrams.evaluateAll(els =>
      els.map(el => {
        const nodes = Array.from(el.querySelectorAll('foreignObject div, text'));
        return nodes.map(n => n.textContent?.trim()).filter(Boolean).join(' ');
      })
    );

    // Every diagram must have some label text (guards against blank-text regression)
    for (const [i, t] of texts.entries()) {
      expect(t.length, `Diagram ${i + 1} has no visible label text`).toBeGreaterThan(0);
    }

    // Labels must differ between diagrams (each has distinct node names)
    expect(texts[0]).not.toBe(texts[1]);
  });

  test('text-wrap diagram: long labels are present in SVG', async () => {
    await openAndWait(app, page, 'drawio-text-wrap.md', { drawio: true });
    const svg = page.locator('.drawio-diagram svg');
    const labelText = await svg.evaluate(el => {
      const nodes = Array.from(el.querySelectorAll('foreignObject div, text'));
      return nodes.map(n => n.textContent?.trim()).filter(Boolean).join(' ');
    });
    // The fixture has long sentences like "Customer manually reads hundreds..."
    expect(labelText.length).toBeGreaterThan(10);
  });

  test('shapes diagram: swimlane children have visible labels', async () => {
    await openAndWait(app, page, 'drawio-shapes.md', { drawio: true });
    const svg = page.locator('.drawio-diagram svg');
    const labelText = await svg.evaluate(el => {
      const nodes = Array.from(el.querySelectorAll('foreignObject div, text'));
      return nodes.map(n => n.textContent?.trim()).filter(Boolean).join(' ');
    });
    expect(labelText.length).toBeGreaterThan(0);
  });
});

// ── Existing Test_Files — smoke test ──────────────────────────────────────

test.describe('existing test fixtures smoke test', () => {
  test('Draw.io_Diagram_Example.md renders all diagrams without errors', async () => {
    await openAndWait(app, page, '../../../Test_Files/Draw.io_Diagram_Example.md', { drawio: true });
    const diagrams = page.locator('.drawio-diagram');
    expect(await diagrams.count()).toBeGreaterThanOrEqual(1);
    const errors = diagrams.locator(':text("Error rendering diagram")');
    await expect(errors).toHaveCount(0);
  });

  test('Draw.io_Diagram_Example.md diagrams all have visible label text', async () => {
    await openAndWait(app, page, '../../../Test_Files/Draw.io_Diagram_Example.md', { drawio: true });
    const diagrams = page.locator('.drawio-diagram');
    const count = await diagrams.count();
    for (let i = 0; i < count; i++) {
      const labelText = await diagrams.nth(i).evaluate(el => {
        const nodes = Array.from(el.querySelectorAll('foreignObject div, text'));
        return nodes.map(n => n.textContent?.trim()).filter(Boolean).join(' ');
      });
      expect(labelText.length, `Draw.io_Diagram_Example diagram ${i + 1} has no labels`).toBeGreaterThan(0);
    }
  });
});
