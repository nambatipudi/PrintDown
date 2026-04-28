import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

export const APP_ROOT = path.resolve(__dirname, '../../..');
export const FIXTURES = path.resolve(__dirname, '../fixtures');
export const TEST_FILES = path.resolve(APP_ROOT, 'Test_Files');

function findPackagedBinary(): string {
  // electron-builder --dir output varies by platform/arch
  const candidates = [
    path.join(APP_ROOT, 'release', 'mac-arm64', 'Print Down.app', 'Contents', 'MacOS', 'Print Down'),
    path.join(APP_ROOT, 'release', 'mac', 'Print Down.app', 'Contents', 'MacOS', 'Print Down'),
    path.join(APP_ROOT, 'release', 'mac-x64', 'Print Down.app', 'Contents', 'MacOS', 'Print Down'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error(
    'Packaged binary not found. Run `npm run pack` (electron-builder --dir) first.\n' +
    'Searched: ' + candidates.join(', ')
  );
}

/** Launch the PrintDown Electron app and return the main window.
 *  @param userDataDir Optional fixed userData directory. When provided (e.g. for session
 *  restore tests), PLAYWRIGHT_TEST_USERDATA is set so main.ts uses this dir instead of
 *  creating a fresh tmpdir per PID. */
export async function launchApp(
  { userDataDir }: { userDataDir?: string } = {},
): Promise<{ app: ElectronApplication; page: Page }> {
  const executablePath = findPackagedBinary();
  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    NODE_ENV: 'test',
    PLAYWRIGHT_TEST: '1',
  };
  if (userDataDir) env.PLAYWRIGHT_TEST_USERDATA = userDataDir;
  const app = await electron.launch({ executablePath, env });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1000);
  return { app, page };
}

/** Send a file path to the renderer via the same IPC channel the OS uses for "open with". */
export async function openFile(app: ElectronApplication, filePath: string): Promise<void> {
  const absolute = path.isAbsolute(filePath) ? filePath : path.resolve(APP_ROOT, filePath);
  await app.evaluate(
    ({ BrowserWindow }, fp) => BrowserWindow.getAllWindows()[0].webContents.send('open-file-from-system', fp),
    absolute,
  );
}

/** Send a menu IPC event (e.g. 'menu-font-increase', 'menu-theme-change') with optional arguments. */
export async function sendMenuEvent(app: ElectronApplication, channel: string, ...args: unknown[]): Promise<void> {
  await app.evaluate(
    ({ BrowserWindow }, [ch, ...a]) => BrowserWindow.getAllWindows()[0].webContents.send(ch as string, ...a),
    [channel, ...args] as [string, ...unknown[]],
  );
}

/** Return absolute path to a test fixture file. */
export function fixture(name: string): string {
  return path.isAbsolute(name) ? name : path.resolve(FIXTURES, name);
}

/** Create a writable temp .md file with given content, returns its path. */
export function createTempMd(content: string, name = 'test'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'printdown-test-'));
  const fp = path.join(dir, `${name}.md`);
  fs.writeFileSync(fp, content, 'utf-8');
  return fp;
}

/** Remove a temp file/directory created by createTempMd. */
export function removeTempMd(filePath: string): void {
  try { fs.rmSync(path.dirname(filePath), { recursive: true, force: true }); } catch { /* ignore */ }
}

/** Wait until all draw.io diagrams in the page have completed rendering. */
export async function waitForDrawio(page: Page, timeout = 20_000): Promise<void> {
  await page.waitForFunction(
    () => {
      const all = document.querySelectorAll('[data-drawio-xml]').length;
      const done = document.querySelectorAll('[data-drawio-xml][data-drawio-rendered]').length;
      return all > 0 && all === done;
    },
    { timeout },
  );
}

/** Wait until the markdown-content div is visible. */
export async function waitForContent(page: Page, timeout = 10_000): Promise<void> {
  await page.waitForSelector(
    '#markdown-content:not([style*="display: none"])',
    { timeout },
  );
  await page.waitForTimeout(300);
}

/** Open a fixture file and wait for content (+ diagrams if requested) to finish rendering. */
export async function openAndWait(
  app: ElectronApplication,
  page: Page,
  fixtureName: string,
  { drawio = false, extraMs = 0 }: { drawio?: boolean; extraMs?: number } = {},
): Promise<void> {
  await openFile(app, fixture(fixtureName));
  await waitForContent(page);
  if (drawio) await waitForDrawio(page);
  if (extraMs > 0) await page.waitForTimeout(extraMs);
}

/** Wait for #status-indicator to show specific text (case-insensitive substring). */
export async function waitForStatus(page: Page, text: string, timeout = 5000): Promise<void> {
  await page.waitForFunction(
    (t) => (document.getElementById('status-indicator')?.textContent ?? '').toLowerCase().includes(t.toLowerCase()),
    text,
    { timeout },
  );
}

/** Get the current inline font-size of #markdown-content (returns e.g. "16px"). */
export async function getContentFontSize(page: Page): Promise<string> {
  return page.locator('#markdown-content').evaluate(el => (el as HTMLElement).style.fontSize);
}

/** Get a CSS custom property value from :root. */
export async function getRootCSSVar(page: Page, varName: string): Promise<string> {
  return page.evaluate(
    (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim(),
    varName,
  );
}

/** Close all open tabs by sending close-all via the context menu action directly in the page. */
export async function closeAllTabs(page: Page): Promise<void> {
  // Click close on every tab
  const tabs = page.locator('#tabs .tab');
  const count = await tabs.count();
  for (let i = count - 1; i >= 0; i--) {
    const closeBtn = tabs.nth(i).locator('.tab-close, [class*="close"]');
    const exists = await closeBtn.count() > 0;
    if (exists) await closeBtn.click();
    else {
      // Right-click → close all
      await tabs.nth(0).click({ button: 'right' });
      await page.waitForTimeout(100);
      await page.locator('#tab-context-menu [data-action="close-all"]').click();
      break;
    }
    await page.waitForTimeout(100);
  }
}
