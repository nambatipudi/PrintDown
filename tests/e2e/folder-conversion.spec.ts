import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { launchApp, sendMenuEvent } from './helpers/app';

test('Tools folder conversion shows progress and preserves open tabs', async () => {
  const rootDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'printdown-tools-folder-'));
  const nestedDirectory = path.join(rootDirectory, 'nested');
  const firstMarkdown = path.join(rootDirectory, 'first.md');
  const secondMarkdown = path.join(nestedDirectory, 'second.md');
  fs.mkdirSync(nestedDirectory);
  fs.writeFileSync(firstMarkdown, '# First conversion', 'utf-8');
  fs.writeFileSync(secondMarkdown, '# Second conversion', 'utf-8');

  const { app, page } = await launchApp();
  try {
    await sendMenuEvent(app, 'menu-convert-folder-to-pdf', [firstMarkdown, secondMarkdown]);
    await expect(page.locator('#folder-conversion-modal')).toBeVisible();
    await expect(page.locator('#folder-conversion-progress-label')).toContainText('Converted 2 Markdown files to PDF');
    await expect(page.locator('#folder-conversion-progress-bar')).toHaveAttribute('value', '2');
    expect(fs.readFileSync(firstMarkdown.replace(/\.md$/, '.pdf')).subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(fs.readFileSync(secondMarkdown.replace(/\.md$/, '.pdf')).subarray(0, 5).toString('ascii')).toBe('%PDF-');
    await expect(page.locator('#tabs .tab')).toHaveCount(0);
  } finally {
    await app.close();
    fs.rmSync(rootDirectory, { recursive: true, force: true });
  }
});
