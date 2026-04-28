const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Create build directories
const buildDir = path.join(__dirname, 'build');
const iconsDir = path.join(buildDir, 'icons');

if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir);
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });

// Source icon lives in build/icons/ (canonical location)
const sourceIcon = path.join(iconsDir, '512x512.png');

if (!fs.existsSync(sourceIcon)) {
  console.error('Error: build/icons/512x512.png not found!');
  process.exit(1);
}

const iconBuffer = fs.readFileSync(sourceIcon);

async function generateBuildIcons() {
  console.log('Generating build icons from build/icons/512x512.png...\n');

  const linuxSizes = [16, 24, 32, 48, 64, 96, 128, 256, 512, 1024];

  console.log('Generating Linux icons...');
  for (const size of linuxSizes) {
    const existing = path.join(iconsDir, `${size}x${size}.png`);
    if (fs.existsSync(existing)) {
      console.log(`  ${size}x${size}.png already exists`);
    } else {
      await sharp(iconBuffer)
        .resize(size, size, { kernel: sharp.kernel.lanczos3, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toFile(existing);
      console.log(`  ${size}x${size}.png generated`);
    }
  }

  console.log('\nGenerating Windows icon...');
  const win256 = path.join(iconsDir, '256x256.png');
  fs.copyFileSync(win256, path.join(buildDir, 'icon.png'));
  console.log('  icon.png ready');

  console.log('\nGenerating macOS icon...');
  await sharp(iconBuffer)
    .resize(1024, 1024, { kernel: sharp.kernel.lanczos3, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(buildDir, 'icon-mac.png'));
  console.log('  icon-mac.png ready');

  console.log('\nDone.');
}

generateBuildIcons().catch(console.error);
