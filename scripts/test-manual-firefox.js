#!/usr/bin/env node
'use strict';
const { spawn } = require('child_process');
const { chromium } = require('playwright');
const { prepareFirefoxPackage } = require('./firefox-package.js');
const path = require('path');
const fs = require('fs');

const FIREFOX = 'C:\\Program Files\\Mozilla Firefox\\firefox.exe';
const PLAYLIST = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLbpi6ZahtOH6Ar_3GPy3workV0OaZ2xNQ';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitForFirefox(port, tries = 20) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`http://localhost:${port}/json/version`);
      if (res.ok) return await res.json();
    } catch {}
    await sleep(1000);
  }
  throw new Error('Firefox did not start on port ' + port);
}

(async () => {
  const stageDir = prepareFirefoxPackage();
  console.log('Stage dir:', stageDir);

  const PORT = 9333;
  console.log(`\nLaunching Firefox with extension on port ${PORT}...`);

  const proc = spawn('npx', [
    'web-ext', 'run',
    '--source-dir', stageDir,
    '--firefox', FIREFOX,
    '--start-url', PLAYLIST,
    '--no-reload',
    '--firefox-profile', path.join(require('os').tmpdir(), 'ff-test-' + Date.now()),
    '--remote-debugging-port', String(PORT),
    '--verbose',
  ], { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });

  proc.stdout.on('data', d => process.stdout.write('[web-ext] ' + d));
  proc.stderr.on('data', d => process.stderr.write('[web-ext] ' + d));

  let browser;
  try {
    const info = await waitForFirefox(PORT, 30);
    console.log('\nFirefox ready:', info.Browser);

    browser = await chromium.connectOverCDP(`http://localhost:${PORT}`);
    const contexts = browser.contexts();
    const pages = contexts.flatMap(c => c.pages());
    let page = pages.find(p => p.url().includes('youtube')) || pages[0];

    if (!page) {
      const ctx = contexts[0] || await browser.newContext();
      page = await ctx.newPage();
      await page.goto(PLAYLIST, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }

    console.log('\n[1] First video — waiting 9s...');
    await sleep(9000);

    const v1 = await page.evaluate(() => {
      const player = document.querySelector('#movie_player, .html5-video-player');
      const video = document.querySelector('video');
      return {
        adShowing: player?.classList?.contains('ad-showing') || false,
        skipBtn: !!document.querySelector('.ytp-ad-skip-button, .ytp-skip-ad-button'),
        enforcement: !!document.querySelector('ytd-enforcement-message-view-model'),
        fixActive: !!window.__fadblockPlayerFix,
        bridgeActive: !!window.__fadblockFirefoxBridgeActive,
        rate: video?.playbackRate ?? null,
        url: location.href,
      };
    });
    const v1Clean = !v1.adShowing && !v1.skipBtn && !v1.enforcement;
    console.log(`Video 1: ${v1Clean ? '✅ CLEAN' : '❌ ADS'} | fix:${v1.fixActive} | bridge:${v1.bridgeActive} | rate:${v1.rate}`);

    console.log('\n[2] Navigating to next playlist video...');
    await page.evaluate(() => {
      const items = document.querySelectorAll('ytd-playlist-panel-video-renderer');
      if (items.length >= 2) { items[1].querySelector('a')?.click(); return; }
      document.querySelector('.ytp-next-button')?.click();
    });
    await sleep(10000);

    const v2 = await page.evaluate(() => {
      const player = document.querySelector('#movie_player, .html5-video-player');
      const video = document.querySelector('video');
      return {
        adShowing: player?.classList?.contains('ad-showing') || false,
        skipBtn: !!document.querySelector('.ytp-ad-skip-button, .ytp-skip-ad-button'),
        enforcement: !!document.querySelector('ytd-enforcement-message-view-model'),
        fixActive: !!window.__fadblockPlayerFix,
        bridgeActive: !!window.__fadblockFirefoxBridgeActive,
        rate: video?.playbackRate ?? null,
        url: location.href,
      };
    });
    const v2Clean = !v2.adShowing && !v2.skipBtn && !v2.enforcement;
    console.log(`Video 2: ${v2Clean ? '✅ CLEAN' : '❌ ADS'} | fix:${v2.fixActive} | bridge:${v2.bridgeActive} | rate:${v2.rate}`);
    console.log('  URL:', v2.url);

    console.log('\n=== RESULT ===');
    if (v1Clean && v2Clean) {
      console.log('✅ PLAYLIST FIX WORKS — no ads on both videos');
    } else {
      if (!v1Clean) console.log('❌ Video 1 had ads');
      if (!v2Clean) console.log('❌ Video 2 (auto-advance) had ads');
    }

    await sleep(3000);
  } finally {
    if (browser) await browser.close().catch(() => {});
    proc.kill();
    try { fs.rmSync(stageDir, { recursive: true }); } catch {}
  }
})().catch(e => { console.error('Error:', e.message); process.exit(1); });
