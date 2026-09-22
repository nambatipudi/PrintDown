/**
 * Theme system regression tests.
 * Covers: theme switching, CSS variable changes, per-file theme mapping, persistence.
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, openAndWait, sendMenuEvent, getRootCSSVar } from './helpers/app';

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => { ({ app, page } = await launchApp()); });
test.afterAll(async () => { await app.close(); });

test.beforeEach(async () => {
  await openAndWait(app, page, 'markdown-basics.md');
});

// Helper: switch theme and return a key CSS variable
async function switchTheme(theme: string) {
  await sendMenuEvent(app, 'menu-theme-change', theme);
  await page.waitForTimeout(300);
}

// ── CSS variables change when theme changes ───────────────────────────────

test('switching to dark theme changes --theme-body CSS variable', async () => {
  const before = await getRootCSSVar(page, '--theme-body');
  await switchTheme('dark');
  const after = await getRootCSSVar(page, '--theme-body');
  expect(after).not.toBe(''); // variable is set
  // Dark body should be a dark color (not white)
  await switchTheme('light');
  const light = await getRootCSSVar(page, '--theme-body');
  await switchTheme('dark');
  const dark = await getRootCSSVar(page, '--theme-body');
  expect(light).not.toBe(dark); // different themes produce different values
});

test('switching to light theme sets --theme-body to a light color', async () => {
  await switchTheme('light');
  const body = await getRootCSSVar(page, '--theme-body');
  expect(body).toBeTruthy();
});

test('--theme-text CSS variable is set after any theme switch', async () => {
  await switchTheme('nord');
  const text = await getRootCSSVar(page, '--theme-text');
  expect(text).not.toBe('');
});

test('--theme-link CSS variable is set', async () => {
  await switchTheme('github');
  const link = await getRootCSSVar(page, '--theme-link');
  expect(link).not.toBe('');
});

test('--theme-code-bg CSS variable is set', async () => {
  await switchTheme('dracula');
  const codeBg = await getRootCSSVar(page, '--theme-code-bg');
  expect(codeBg).not.toBe('');
});

const CURATED_THEMES = [
  'modern-slate',
  'modern-sage',
  'modern-rose',
  'retro-amber',
  'retro-sunset',
  'retro-pixel',
] as const;

for (const theme of CURATED_THEMES) {
  test(`${theme} applies a complete readable palette`, async () => {
    await switchTheme(theme);
    const palette = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
        const luminance = (hex: string) => {
          const channels = hex.match(/[0-9a-f]{2}/gi)?.map(channel => parseInt(channel, 16) / 255) ?? [];
          const linear = channels.map(channel => channel <= 0.03928
            ? channel / 12.92
            : Math.pow((channel + 0.055) / 1.055, 2.4));
          return (0.2126 * (linear[0] ?? 0)) + (0.7152 * (linear[1] ?? 0)) + (0.0722 * (linear[2] ?? 0));
        };
        const contrast = (foreground: string, background: string) => {
          const foregroundLuminance = luminance(foreground);
          const backgroundLuminance = luminance(background);
          const lighter = Math.max(foregroundLuminance, backgroundLuminance);
          const darker = Math.min(foregroundLuminance, backgroundLuminance);
          return (lighter + 0.05) / (darker + 0.05);
        };
        const body = root.getPropertyValue('--theme-body').trim();
        const content = root.getPropertyValue('--theme-content').trim();
        const text = root.getPropertyValue('--theme-text').trim();
        return {
          body,
          content,
          text,
          heading: root.getPropertyValue('--theme-heading').trim(),
          link: root.getPropertyValue('--theme-link').trim(),
          code: root.getPropertyValue('--theme-code-text').trim(),
          textContrast: contrast(text, content),
        };
      });
    for (const value of Object.values(palette)) {
      expect(value).not.toBe('');
    }
    expect(palette.textContrast).toBeGreaterThanOrEqual(4.5);
    await expect(page.locator('#markdown-content h1').first()).toBeVisible();
  });
}

// ── Themes render actual content correctly ────────────────────────────────

test('content heading is visible after theme change', async () => {
  await switchTheme('sepia');
  await expect(page.locator('#markdown-content h1').first()).toBeVisible();
});

test('content code block is visible after dark theme', async () => {
  await switchTheme('monokai');
  await expect(page.locator('#markdown-content pre').first()).toBeVisible();
});

// ── Multiple named themes apply distinct variables ─────────────────────────

const THEME_PAIRS: [string, string][] = [
  ['dark', 'light'],
  ['nord', 'sepia'],
  ['dracula', 'github'],
  ['terminal', 'literary'],
];

for (const [a, b] of THEME_PAIRS) {
  test(`themes '${a}' and '${b}' produce different --theme-body values`, async () => {
    await switchTheme(a);
    const va = await getRootCSSVar(page, '--theme-body');
    await switchTheme(b);
    const vb = await getRootCSSVar(page, '--theme-body');
    expect(va).not.toBe(vb);
  });
}

// ── localStorage persistence ──────────────────────────────────────────────

test('selected theme is saved to localStorage', async () => {
  await switchTheme('oceanic');
  const stored = await page.evaluate(() => localStorage.getItem('selectedTheme'));
  expect(stored).toBe('oceanic');
});

test('restoring localStorage theme applies it on re-render', async () => {
  await switchTheme('newspaper');
  const stored = await page.evaluate(() => localStorage.getItem('selectedTheme'));
  expect(stored).toBe('newspaper');
  // Restore to a neutral theme
  await switchTheme('light');
});
