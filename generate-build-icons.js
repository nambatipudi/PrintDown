const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Create build directories
const buildDir = path.join(__dirname, 'build');
const iconsDir = path.join(buildDir, 'icons');

if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir);
}
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir);
}

// Use the 512px icon from icons folder as source
const sourceIcon = path.join(__dirname, 'icons', 'icon-512.png');

if (!fs.existsSync(sourceIcon)) {
  console.error('❌ Error: icons/icon-512.png not found!');
  console.log('Please ensure the icons folder contains icon-512.png');
  process.exit(1);
}

const iconBuffer = fs.readFileSync(sourceIcon);

async function generateBuildIcons() {
  console.log('Generating build icons from icons/icon-512.png...\n');
  
  // Linux icons (PNG at various sizes)
  const linuxSizes = [16, 24, 32, 48, 64, 96, 128, 256, 512, 1024];
  
  console.log('📦 Generating Linux icons...');
  for (const size of linuxSizes) {
    // Use existing icons if available, otherwise resize from 512
    const existingIcon = path.join(__dirname, 'icons', `icon-${size}.png`);
    
    if (fs.existsSync(existingIcon) && size <= 512) {
      // Copy existing icon
      fs.copyFileSync(existingIcon, path.join(iconsDir, `${size}x${size}.png`));
      console.log(`  ✓ ${size}x${size}.png (copied from icons folder)`);
    } else {
      // Resize from 512px source
      await sharp(iconBuffer)
        .resize(size, size, {
          kernel: sharp.kernel.lanczos3,
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .png()
        .toFile(path.join(iconsDir, `${size}x${size}.png`));
      console.log(`  ✓ ${size}x${size}.png (resized)`);
    }
  }
  
  // Windows icon (256x256 PNG - electron-builder will convert to .ico)
  console.log('\n🪟 Generating Windows icon...');
  const win256Icon = path.join(__dirname, 'icons', 'icon-256.png');
  
  if (fs.existsSync(win256Icon)) {
    fs.copyFileSync(win256Icon, path.join(buildDir, 'icon.png'));
    console.log('  ✓ icon.png (copied from icons/icon-256.png)');
  } else {
    await sharp(iconBuffer)
      .resize(256, 256, {
        kernel: sharp.kernel.lanczos3,
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toFile(path.join(buildDir, 'icon.png'));
    console.log('  ✓ icon.png (resized from 512px)');
  }
  console.log('  (electron-builder will convert to .ico)');
  
  // macOS icon (1024x1024 PNG - electron-builder will convert to .icns)
  console.log('\n🍎 Generating macOS icon...');
  await sharp(iconBuffer)
    .resize(1024, 1024, {
      kernel: sharp.kernel.lanczos3,
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toFile(path.join(buildDir, 'icon-mac.png'));
  console.log('  ✓ icon-mac.png (1024x1024 for .icns conversion)');
  console.log('  (electron-builder will convert to .icns)');
  
  console.log('\n✅ All build icons generated successfully from icons folder!');
  console.log('\nNote: electron-builder will automatically convert:');
  console.log('  • build/icon.png → icon.ico for Windows');
  console.log('  • build/icon-mac.png → icon.icns for macOS');
}

generateBuildIcons().catch(console.error);

generateBuildIcons().catch(console.error);

