#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');

function prepareFirefoxPackage(rootDir = path.resolve(__dirname, '..')) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fadblock-firefox-'));
  const stageDir = path.join(tempDir, 'package');

  fs.mkdirSync(stageDir, { recursive: true });

  for (const entry of fs.readdirSync(rootDir)) {
    if (['.git', 'node_modules', 'dist'].includes(entry)) continue;
    fs.cpSync(path.join(rootDir, entry), path.join(stageDir, entry), { recursive: true });
  }

  const manifestPath = path.join(stageDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.background = {
    ...manifest.background,
    scripts: ['background/service-worker.js'],
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

  return stageDir;
}

if (require.main === module) {
  process.stdout.write(prepareFirefoxPackage() + '\n');
}

module.exports = { prepareFirefoxPackage };
