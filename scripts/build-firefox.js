#!/usr/bin/env node
const path = require('path');
const { execFileSync } = require('child_process');
const { prepareFirefoxPackage } = require('./firefox-package');

const root = path.resolve(__dirname, '..');
const stageDir = prepareFirefoxPackage(root);

execFileSync('npx', [
  'web-ext', 'build',
  '--source-dir', stageDir,
  '--artifacts-dir', path.join(root, 'dist'),
  '--overwrite-dest',
], { stdio: 'inherit' });
