const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const buildDir = path.join(root, 'build');
const iconsDir = path.join(buildDir, 'icons');
const iconSource = path.join(buildDir, 'printdown-icon.svg');
const dmgBackgroundSource = path.join(buildDir, 'dmg-background.svg');

async function renderPng(source, destination, size) {
  await sharp(source)
    .resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toFile(destination);
}

async function generateBrandAssets() {
  fs.mkdirSync(iconsDir, { recursive: true });
  const iconSizes = [16, 24, 32, 48, 64, 96, 128, 256, 512, 1024];

  await Promise.all(iconSizes.map(size => (
    renderPng(iconSource, path.join(iconsDir, `${size}x${size}.png`), size)
  )));
  await renderPng(iconSource, path.join(buildDir, 'icon.png'), 256);
  await renderPng(iconSource, path.join(root, 'icon.png'), 256);
  await renderPng(iconSource, path.join(buildDir, 'icon-mac.png'), 1024);
  await sharp(dmgBackgroundSource).png().toFile(path.join(buildDir, 'dmg-background.png'));
}

generateBrandAssets().catch(error => {
  console.error('Failed to generate Print Down brand assets:', error);
  process.exitCode = 1;
});
