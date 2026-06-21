#!/usr/bin/env node
'use strict';
const { firefox } = require('playwright');
const { execSync } = require('child_process');
const fs = require('fs');
const { prepareFirefoxPackage } = require('./firefox-package.js');

(async () => {
  const stageDir = prepareFirefoxPackage();
  const buildDir = require('path').join(__dirname, '..', 'dist', 'ptest');
  fs.mkdirSync(buildDir, { recursive: true });

  const out = execSync(
    `npx web-ext build --source-dir "${stageDir}" --artifacts-dir "${buildDir}" --overwrite-dest`,
    { encoding: 'utf8', shell: true }
  );
  const m = out.match(/Your web extension is ready: (.+\.(?:zip|xpi))/);
  if (!m) { console.error('XPI build failed:', out); process.exit(1); }
  const xpiPath = m[1].trim();
  console.log('[test] XPI:', xpiPath);

  const ctx = await firefox.launchPersistentContext('', {
    headless: true,
    firefoxUserPrefs: {
      'xpinstall.signatures.required': false,
      'extensions.autoDisableScopes': 0,
    },
  });

  // Install extension via about:debugging in Firefox
  const extPage = await ctx.newPage();
  await extPage.goto('about:debugging#/runtime/this-firefox');
  await extPage.waitForTimeout(1000);
  const [fileChooser] = await Promise.all([
    extPage.waitForEvent('filechooser'),
    extPage.click('text=Load Temporary Add-on'),
  ]);
  await fileChooser.setFiles(xpiPath);
  await extPage.waitForTimeout(2000);
  await extPage.close();
  console.log('[test] extension installed');

  const page = await ctx.newPage();
  await page.goto('https://www.youtube.com/watch?v=jNQXAC9IVRw', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  console.log('[test] page loaded');

  await page.waitForTimeout(10000);

  const enforcement = await page.locator('ytd-enforcement-message-view-model').count();
  const videoEl = page.locator('video').first();
  const paused1 = await videoEl.evaluate(v => v.paused).catch(() => null);
  const time1 = await videoEl.evaluate(v => v.currentTime).catch(() => null);
  const readyState = await videoEl.evaluate(v => v.readyState).catch(() => null);
  const error = await videoEl.evaluate(v => v.error ? v.error.message : null).catch(() => null);

  console.log('[test] enforcement overlay visible:', enforcement > 0);
  console.log('[test] video paused:', paused1);
  console.log('[test] video currentTime:', time1);
  console.log('[test] video readyState:', readyState);
  console.log('[test] video error:', error);

  await page.waitForTimeout(4000);
  const paused2 = await videoEl.evaluate(v => v.paused).catch(() => null);
  const time2 = await videoEl.evaluate(v => v.currentTime).catch(() => null);
  console.log('[test] video paused (4s later):', paused2);
  console.log('[test] video currentTime (4s later):', time2);
  console.log('[test] VIDEO PLAYING:', !paused2 && time2 > (time1 || 0));

  await ctx.close();
})().catch(e => { console.error('[test] ERROR:', e.message); process.exit(1); });
