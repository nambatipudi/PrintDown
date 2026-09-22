import { test, expect } from '@playwright/test';
import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { APP_ROOT, createTempMd, removeTempMd } from './helpers/app';

function findPackagedBinary(): string {
  const candidates = [
    path.join(APP_ROOT, 'release', 'mac-arm64', 'Print Down.app', 'Contents', 'MacOS', 'Print Down'),
    path.join(APP_ROOT, 'release', 'mac', 'Print Down.app', 'Contents', 'MacOS', 'Print Down'),
    path.join(APP_ROOT, 'release', 'mac-x64', 'Print Down.app', 'Contents', 'MacOS', 'Print Down'),
  ];
  const binary = candidates.find(fs.existsSync);
  if (!binary) {
    throw new Error('Packaged binary not found. Run npm run pack first.');
  }
  return binary;
}

test('headless conversion writes adjacent valid PDFs for every argument', async () => {
  const sourcePath = createTempMd('# Command conversion\n\nGenerated without the editor UI.', 'headless-conversion');
  const secondSourcePath = createTempMd('# Second command conversion', 'headless-conversion-second');
  const outputPath = sourcePath.replace(/\.md$/, '.pdf');
  const secondOutputPath = secondSourcePath.replace(/\.md$/, '.pdf');

  try {
    const result = await new Promise<{ exitCode: number | null; stderr: string }>((resolve, reject) => {
      const child = childProcess.spawn(findPackagedBinary(), ['--convert-to-pdf', sourcePath, secondSourcePath], {
        env: {
          ...process.env,
          PLAYWRIGHT_TEST: '',
          PLAYWRIGHT_TEST_USERDATA: '',
          ELECTRON_RUN_AS_NODE: '0',
        },
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      let stderr = '';
      child.stderr.on('data', chunk => {
        stderr += chunk.toString();
      });
      child.once('error', reject);
      child.once('close', exitCode => {
        resolve({ exitCode, stderr });
      });
    });
    expect(result.exitCode, result.stderr).toBe(0);
    expect(fs.existsSync(outputPath)).toBe(true);
    expect(fs.existsSync(secondOutputPath)).toBe(true);
    for (const pdfPath of [outputPath, secondOutputPath]) {
      const pdf = fs.readFileSync(pdfPath);
      expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    }
  } finally {
    removeTempMd(sourcePath);
    removeTempMd(secondSourcePath);
  }
});
