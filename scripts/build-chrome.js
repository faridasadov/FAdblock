#!/usr/bin/env node
const path = require('path');
const { execFileSync } = require('child_process');
const { prepareChromePackage } = require('./chrome-package');

const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');
const stageDir = prepareChromePackage(root);

require('fs').mkdirSync(distDir, { recursive: true });
const zipPath = path.join(distDir, 'fadblock-chrome.zip');
try { require('fs').unlinkSync(zipPath); } catch {}

execFileSync('zip', ['-r', zipPath, '.','-x','*.DS_Store'], {
  cwd: stageDir,
  stdio: 'inherit',
});
