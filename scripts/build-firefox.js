#!/usr/bin/env node
const path = require('path');
const { execFileSync } = require('child_process');
const { prepareFirefoxPackage } = require('./firefox-package');

const root = path.resolve(__dirname, '..');
const stageDir = prepareFirefoxPackage(root);

// shell:true does not quote arguments, so a path containing a space (the repo
// lives under "D:\calude tmp\") reached web-ext split in two. Quote them here.
const quote = (value) => `"${value}"`;

execFileSync('npx', [
  'web-ext', 'build',
  '--source-dir', quote(stageDir),
  '--artifacts-dir', quote(path.join(root, 'dist')),
  '--overwrite-dest',
], { stdio: 'inherit', shell: true });
