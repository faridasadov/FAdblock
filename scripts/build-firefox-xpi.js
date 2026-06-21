#!/usr/bin/env node
'use strict';
const path = require('path');
const { execSync } = require('child_process');
const fs = require('fs');
const { prepareFirefoxPackage } = require('./firefox-package');

const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');
fs.mkdirSync(distDir, { recursive: true });

// Remove old firefox zip/xpi builds
fs.readdirSync(distDir)
  .filter(f => f.endsWith('.xpi') || f.endsWith('.zip'))
  .forEach(f => { fs.unlinkSync(path.join(distDir, f)); console.log('Removed:', f); });

const stageDir = prepareFirefoxPackage(root);
const out = execSync(
  `npx web-ext build --source-dir "${stageDir}" --artifacts-dir "${distDir}" --overwrite-dest`,
  { encoding: 'utf8', shell: true }
);
console.log(out.trim());
