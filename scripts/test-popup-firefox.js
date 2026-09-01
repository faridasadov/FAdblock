#!/usr/bin/env node
'use strict';
const { firefox } = require('playwright');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { prepareFirefoxPackage } = require('./firefox-package');

(async () => {
  const root = path.resolve(__dirname, '..');
  const stageDir = prepareFirefoxPackage(root);
  const buildDir = path.join(root, 'dist', 'ptest');
  fs.mkdirSync(buildDir, { recursive: true });

  const out = execSync(
    `npx web-ext build --source-dir "${stageDir}" --artifacts-dir "${buildDir}" --overwrite-dest`,
    { encoding: 'utf8', shell: true }
  );
  const m = out.match(/Your web extension is ready: (.+\.zip)/);
  if (!m) { console.error('build failed:', out); process.exit(1); }
  const xpiPath = m[1].trim();
  console.log('[test] XPI:', xpiPath);

  // Use a fixed UUID so we can navigate directly to the popup
  const FIXED_UUID = 'fadblock0-0000-0000-0000-000000000001';
  const ctx = await firefox.launchPersistentContext('', {
    headless: true,
    firefoxUserPrefs: {
      'xpinstall.signatures.required': false,
      'extensions.autoDisableScopes': 0,
      'extensions.webextensions.uuids': JSON.stringify({ 'adblock-pro@farid.dev': FIXED_UUID }),
    },
  });

  // Install extension via about:config trick — navigate to the XPI
  const extPage = await ctx.newPage();
  await extPage.goto(`file://${xpiPath}`, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
  await extPage.waitForTimeout(3000);
  await extPage.close();

  const uuid = FIXED_UUID;
  const popupUrl = `moz-extension://${uuid}/popup/popup.html`;
  const optionsUrl = `moz-extension://${uuid}/options/options.html`;
  console.log('[test] UUID:', uuid);
  console.log('[test] Popup URL:', popupUrl);

  const popupPage = await ctx.newPage();
  const errors = [];
  popupPage.on('pageerror', e => errors.push('PAGE_ERR: ' + e.message));
  popupPage.on('console', msg => {
    if (msg.type() === 'error') errors.push('CONSOLE_ERR: ' + msg.text());
  });

  await popupPage.goto(popupUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
  await popupPage.waitForTimeout(2500);

  const globalToggle = await popupPage.locator('#globalToggle').isVisible().catch(() => false);
  const openOptionsBtn = await popupPage.locator('#openOptions').isVisible().catch(() => false);
  const pauseBtn = await popupPage.locator('.btn-pause').first().isVisible().catch(() => false);
  const bodyText = await popupPage.locator('body').innerText().catch(() => '');

  console.log('[test] globalToggle visible:', globalToggle);
  console.log('[test] Parametrler button visible:', openOptionsBtn);
  console.log('[test] Pause button visible:', pauseBtn);
  console.log('[test] Body text length:', bodyText.length);
  console.log('[test] JS errors:', errors.length ? '\n  ' + errors.join('\n  ') : 'NONE');

  // Test options page
  console.log('\n[test] --- Options page ---');
  const optPage = await ctx.newPage();
  const optErrors = [];
  optPage.on('pageerror', e => optErrors.push('PAGE_ERR: ' + e.message));
  optPage.on('console', msg => {
    if (msg.type() === 'error') optErrors.push('CONSOLE_ERR: ' + msg.text());
  });
  await optPage.goto(optionsUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
  await optPage.waitForTimeout(2000);
  const optBodyText = await optPage.locator('body').innerText().catch(() => '');
  console.log('[test] Options body length:', optBodyText.length);
  console.log('[test] Options JS errors:', optErrors.length ? '\n  ' + optErrors.join('\n  ') : 'NONE');

  const ok = globalToggle && openOptionsBtn && errors.length === 0;
  console.log('\n[test] RESULT:', ok ? '✓ PASS - popup works' : '✗ FAIL');

  await ctx.close();
})().catch(e => { console.error('[test] FATAL:', e.message); process.exit(1); });
