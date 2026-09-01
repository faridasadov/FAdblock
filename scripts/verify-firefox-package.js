#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { prepareFirefoxPackage } = require('./firefox-package');

const root = path.resolve(__dirname, '..');
const stageDir = prepareFirefoxPackage(root);
console.log('Stage:', stageDir);

let ok = true;
function check(label, condition, detail) {
  const sym = condition ? '✓' : '✗';
  console.log(sym + ' ' + label + (detail !== undefined ? ' — ' + detail : ''));
  if (!condition) ok = false;
}

const needed = [
  'manifest.json',
  'background/service-worker.js',
  'content/content.js',
  'content/youtube-firefox-bridge.js',
  'common/i18n.js',
  'popup/popup.html',
  'popup/popup.js',
  'popup/popup.css',
  'options/options.html',
  'options/options.js',
  'options/options.css',
  'rules/rules.json',
];
console.log('\n--- Files ---');
for (const f of needed) {
  check(f, fs.existsSync(path.join(stageDir, f)));
}

const manifest = JSON.parse(fs.readFileSync(path.join(stageDir, 'manifest.json'), 'utf8'));
console.log('\n--- Manifest ---');
check('manifest_version 3', manifest.manifest_version === 3);
check('gecko.id', !!manifest.browser_specific_settings?.gecko?.id, manifest.browser_specific_settings?.gecko?.id);
check('options_ui.page', !!manifest.options_ui?.page, manifest.options_ui?.page);
check('data_collection_permissions', !!manifest.browser_specific_settings?.gecko?.data_collection_permissions);
check('no youtube_ads ruleset', !manifest.declarative_net_request?.rule_resources?.find(r => r.id === 'youtube_ads'));
check('background.scripts (no service_worker)', !!manifest.background?.scripts);

console.log('\n--- JS imports ---');
function checkImports(jsFile) {
  const full = path.join(stageDir, jsFile);
  if (!fs.existsSync(full)) { check(jsFile, false, 'file missing'); return; }
  const content = fs.readFileSync(full, 'utf8');
  const re = /from ['"](\.[^'"]+)['"]/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const rel = m[1];
    const resolved = path.resolve(path.join(stageDir, path.dirname(jsFile), rel));
    const exists = fs.existsSync(resolved) || fs.existsSync(resolved + '.js');
    check(jsFile + ' -> ' + rel, exists);
  }
}
checkImports('popup/popup.js');
checkImports('options/options.js');
checkImports('background/service-worker.js');

console.log('\n--- Bridge.js ---');
const bridge = fs.readFileSync(path.join(stageDir, 'content/youtube-firefox-bridge.js'), 'utf8');
check('googletag stub', bridge.includes('googletag'));
check('fetch interceptor', bridge.includes('window.fetch'));
check('hookProp', bridge.includes('hookProp'));
check('google_ad_status spoof', bridge.includes('google_ad_status'));

console.log('\n--- content.js ---');
const content = fs.readFileSync(path.join(stageDir, 'content/content.js'), 'utf8');
check('loadVideoById recovery', content.includes('loadVideoById'));
check('directMatches rate limit bypass', content.includes('hasRealOverlay'));
check('IS_FIREFOX check', content.includes('IS_FIREFOX'));

console.log('\n' + (ok ? '✓ ALL OK' : '✗ ISSUES FOUND'));
process.exit(ok ? 0 : 1);
