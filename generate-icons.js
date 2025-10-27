const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Create icons directory if it doesn't exist
const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir);
}

// Read SVG
const svgBuffer = fs.readFileSync('icon.svg');

// Generate PNG icons in different sizes
const sizes = [16, 32, 64, 128, 256, 512];

async function generateIcons() {
  console.log('Generating icons...');
  
  for (const size of sizes) {
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(path.join(iconsDir, `icon-${size}.png`));
    console.log(`✓ Generated ${size}x${size} icon`);
  }
  
  // Copy 256x256 as main icon
  await sharp(svgBuffer)
    .resize(256, 256)
    .png()
    .toFile('icon.png');
  console.log('✓ Generated main icon.png');
  
  console.log('\nAll icons generated successfully!');
}

generateIcons().catch(console.error);

