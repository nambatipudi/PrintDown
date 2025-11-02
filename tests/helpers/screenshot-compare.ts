/**
 * Screenshot comparison helper using pixelmatch
 */

import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import fs from 'fs';

/**
 * Compare two screenshots and return the mismatch percentage
 * @param baselinePath Path to the baseline image
 * @param currentImage Buffer of the current screenshot
 * @param diffPath Path to save the diff image
 * @returns Mismatch percentage (0-100)
 */
export async function compareScreenshots(
  baselinePath: string,
  currentImage: Buffer,
  diffPath: string
): Promise<number> {
  // Read baseline image
  const baselineBuffer = fs.readFileSync(baselinePath);
  const baseline = PNG.sync.read(baselineBuffer);
  
  // Parse current image
  const current = PNG.sync.read(currentImage);
  
  // Ensure dimensions match
  if (baseline.width !== current.width || baseline.height !== current.height) {
    throw new Error(
      `Image dimensions don't match. Baseline: ${baseline.width}x${baseline.height}, ` +
      `Current: ${current.width}x${current.height}`
    );
  }
  
  // Create diff image
  const diff = new PNG({ width: baseline.width, height: baseline.height });
  
  // Compare images
  const mismatchedPixels = pixelmatch(
    baseline.data,
    current.data,
    diff.data,
    baseline.width,
    baseline.height,
    { threshold: 0.1 } // Allow slight differences in anti-aliasing
  );
  
  // Save diff image
  fs.writeFileSync(diffPath, PNG.sync.write(diff));
  
  // Calculate mismatch percentage
  const totalPixels = baseline.width * baseline.height;
  const mismatchPercentage = (mismatchedPixels / totalPixels) * 100;
  
  return mismatchPercentage;
}

/**
 * Create a baseline screenshot if it doesn't exist
 * @param baselinePath Path to save the baseline
 * @param screenshot Buffer of the screenshot
 */
export function createBaseline(baselinePath: string, screenshot: Buffer): void {
  const dir = require('path').dirname(baselinePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(baselinePath, screenshot);
  console.log(`Created baseline: ${baselinePath}`);
}
