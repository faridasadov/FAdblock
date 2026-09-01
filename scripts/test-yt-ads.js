#!/usr/bin/env node
'use strict';
const { firefox } = require('playwright');
const fs = require('fs');
const path = require('path');

// Full fix code from youtube-inject-v2.js
const FIX_CODE = fs.readFileSync(
  path.join(__dirname, '..', 'content', 'youtube-inject-v2.js'),
  'utf8'
);

const VIDEOS = [
  'https://www.youtube.com/watch?v=jNQXAC9IVRw',
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'https://www.youtube.com/watch?v=9bZkp7q19f0',
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function checkVideo(page, label) {
  const result = await page.evaluate(() => {
    const player = document.querySelector('#movie_player,.html5-video-player');
    const video  = document.querySelector('video');
    return {
      url:          location.href,
      adShowing:    player?.classList?.contains('ad-showing') ?? false,
      skipBtn:      !!document.querySelector('.ytp-ad-skip-button,.ytp-skip-ad-button,.ytp-ad-skip-button-modern'),
      enforcement:  !!document.querySelector('ytd-enforcement-message-view-model'),
      adText:       !!document.querySelector('.ytp-ad-text,.ytp-ad-preview-text'),
      fixActive:    !!window.__fadblockYoutubePruneActive,
      stage:        window.__fadblockYoutubeStage || 'none',
      videoTime:    video?.currentTime ?? -1,
      videoPaused:  video?.paused ?? true,
      captcha:      location.href.includes('/sorry/'),
    };
  });

  const clean = !result.adShowing && !result.skipBtn && !result.enforcement && !result.adText;
  const icon  = result.captcha ? '🤖' : clean ? '✅' : '❌';
  console.log(`\n[${label}] ${icon} ${result.captcha ? 'CAPTCHA' : clean ? 'CLEAN' : 'ADS'}`);
  console.log(`  fix:${result.fixActive} stage:${result.stage} time:${result.videoTime.toFixed(1)}s paused:${result.videoPaused}`);
  console.log(`  adShowing:${result.adShowing} skipBtn:${result.skipBtn} enforcement:${result.enforcement} adText:${result.adText}`);
  console.log(`  url: ${result.url.slice(0, 80)}`);
  return result;
}

(async () => {
  console.log('=== YouTube Ad Block Test ===');
  console.log('Videos:', VIDEOS.length);

  const ctx = await firefox.launch({ headless: false, slowMo: 50 });
  const context = await ctx.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
    viewport: { width: 1280, height: 720 },
  });

  // Inject fix code before any page script runs
  await context.addInitScript(FIX_CODE);

  // Capture [FAD] console logs
  const fadLogs = [];
  context.on('page', p => {
    p.on('console', msg => {
      const t = msg.text();
      if (t.startsWith('[FAD]')) fadLogs.push(t);
    });
  });

  const page = await context.newPage();

  const results = [];
  for (let i = 0; i < VIDEOS.length; i++) {
    const url = VIDEOS[i];
    console.log(`\n--- Video ${i + 1}/${VIDEOS.length} ---`);
    console.log('Navigating to:', url);

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    } catch (e) {
      console.log('  goto timeout/error:', e.message.slice(0, 60));
    }

    // Wait for player to initialize
    await sleep(4000);

    // Check initial state (ads at start)
    const r1 = await checkVideo(page, `V${i + 1} t=4s`);
    if (r1.captcha) { console.log('CAPTCHA detected — stopping'); break; }

    // Wait more to see if ad clears or persists
    await sleep(8000);
    const r2 = await checkVideo(page, `V${i + 1} t=12s`);

    results.push({ video: i + 1, url, at4s: r1, at12s: r2 });

    if (i < VIDEOS.length - 1) {
      console.log('\nWaiting 5s before next video...');
      await sleep(5000);
    }
  }

  console.log('\n========== SUMMARY ==========');
  for (const r of results) {
    const s4  = !r.at4s.adShowing  && !r.at4s.skipBtn  && !r.at4s.enforcement  ? '✅' : '❌';
    const s12 = !r.at12s.adShowing && !r.at12s.skipBtn && !r.at12s.enforcement ? '✅' : '❌';
    console.log(`Video ${r.video}: 4s=${s4}  12s=${s12}`);
  }

  if (fadLogs.length) {
    console.log('\n[FAD] logs (last 10):');
    fadLogs.slice(-10).forEach(l => console.log(' ', l));
  } else {
    console.log('\n⚠️  No [FAD] logs — fix code may not have run');
  }

  await sleep(3000);
  await ctx.close();
})().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
