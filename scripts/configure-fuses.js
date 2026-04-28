#!/usr/bin/env node
// Flip Electron fuses after electron-builder packs, then re-sign with ad-hoc cert.
// - RunAsNode OFF: prevents --inspect=0 from triggering Node.js mode when
//   Playwright launches the packaged binary (which would exit immediately with no script)
// - EnableEmbeddedAsarIntegrityValidation OFF: avoids stale-hash issues during dev
// Re-signing is required on macOS because flipFuses modifies the Electron Framework
// binary, invalidating any existing code signature.

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');

const releaseDir = path.join(__dirname, '..', 'release');
if (!fs.existsSync(releaseDir)) process.exit(0);

const appDirs = fs.readdirSync(releaseDir)
  .map(d => path.join(releaseDir, d))
  .filter(d => fs.statSync(d).isDirectory());

(async () => {
  for (const appDir of appDirs) {
    const apps = fs.readdirSync(appDir).filter(f => f.endsWith('.app'));
    for (const appName of apps) {
      const appPath = path.join(appDir, appName);
      console.log(`Configuring fuses for ${appPath}`);
      try {
        await flipFuses(appPath, {
          version: FuseVersion.V1,
          [FuseV1Options.RunAsNode]: false,
          [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: false,
        });
        console.log('  RunAsNode: OFF');
        console.log('  EnableEmbeddedAsarIntegrityValidation: OFF');
      } catch (e) {
        console.error(`  Failed: ${e.message}`);
      }

      // Re-sign with ad-hoc cert after fuse flip (macOS only).
      // flipFuses modifies the Electron Framework binary, invalidating any existing signature.
      if (process.platform === 'darwin') {
        console.log(`  Re-signing ${appPath} with ad-hoc cert...`);
        try {
          execSync(`codesign --force --deep -s - "${appPath}"`, { stdio: 'inherit' });
          console.log('  Re-signed OK');
        } catch (e) {
          console.error(`  codesign failed: ${e.message}`);
          process.exit(1);
        }
      }
    }
  }
})().catch(e => { console.error(e); process.exit(1); });
