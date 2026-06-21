#!/usr/bin/env node
'use strict';
const path = require('path');
const { execFileSync } = require('child_process');
const { prepareFirefoxPackage } = require('./firefox-package');

const apiKey = process.env.AMO_API_KEY;
const apiSecret = process.env.AMO_API_SECRET;

if (!apiKey || !apiSecret) {
  console.error('Set AMO_API_KEY and AMO_API_SECRET environment variables.');
  console.error('Get them from: https://addons.mozilla.org/en-US/developers/addon/api/key/');
  process.exit(1);
}

const root = path.resolve(__dirname, '..');
const stageDir = prepareFirefoxPackage(root);
const artifactsDir = path.join(root, 'dist');

console.log('[sign] stage dir:', stageDir);
console.log('[sign] artifacts dir:', artifactsDir);
console.log('[sign] channel: listed (public AMO listing)');

execFileSync('npx', [
  'web-ext', 'sign',
  '--source-dir', stageDir,
  '--artifacts-dir', artifactsDir,
  '--api-key', apiKey,
  '--api-secret', apiSecret,
  '--channel', 'listed',
], { stdio: 'inherit', shell: true });
