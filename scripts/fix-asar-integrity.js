#!/usr/bin/env node
// Fix the ElectronAsarIntegrity hash in Info.plist after electron-builder packs.
// electron-builder 25.x can produce a stale hash in Info.plist when the ASAR is
// rebuilt from changed source. Electron verifies the SHA256 of the ASAR header
// string (not the whole file) — we recompute using the same function.

const fs = require('fs');
const path = require('path');
const { computeData } = require('../node_modules/app-builder-lib/out/asar/integrity.js');

const releaseDir = path.join(__dirname, '..', 'release');
if (!fs.existsSync(releaseDir)) process.exit(0);

const appDirs = fs.readdirSync(releaseDir)
  .map(d => path.join(releaseDir, d))
  .filter(d => fs.statSync(d).isDirectory());

(async () => {
  let fixed = 0;
  for (const appDir of appDirs) {
    const apps = fs.readdirSync(appDir).filter(f => f.endsWith('.app'));
    for (const appName of apps) {
      const resourcesPath = path.join(appDir, appName, 'Contents', 'Resources');
      const plistPath = path.join(appDir, appName, 'Contents', 'Info.plist');
      if (!fs.existsSync(plistPath) || !fs.existsSync(resourcesPath)) continue;

      // Compute the correct hashes using the same method as electron-builder
      const computed = await computeData({ resourcesPath, resourcesRelativePath: 'Resources' });
      if (!computed['Resources/app.asar']) continue;
      const correctHash = computed['Resources/app.asar'].hash;

      let plist = fs.readFileSync(plistPath, 'utf-8');
      const match = plist.match(/<key>ElectronAsarIntegrity<\/key>[\s\S]*?<string>([a-f0-9]{64})<\/string>/);
      if (!match) continue;
      const oldHash = match[1];
      if (oldHash === correctHash) continue;

      plist = plist.replace(oldHash, correctHash);
      fs.writeFileSync(plistPath, plist, 'utf-8');
      console.log(`Fixed ASAR integrity hash in ${plistPath}`);
      console.log(`  old: ${oldHash}`);
      console.log(`  new: ${correctHash}`);
      fixed++;
    }
  }
  if (fixed === 0) console.log('ASAR integrity hashes already correct.');
})().catch(e => { console.error(e); process.exit(1); });
