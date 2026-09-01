#!/usr/bin/env node
'use strict';
const { firefox } = require('playwright');
const fs = require('fs');
const path = require('path');

const FIX_CODE = fs.readFileSync(
  path.join(__dirname, '..', 'content', 'youtube-inject-v2.js'), 'utf8'
);

const VIDEOS = [
  'https://www.youtube.com/watch?v=jNQXAC9IVRw',
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'https://www.youtube.com/watch?v=9bZkp7q19f0',
  'https://www.youtube.com/watch?v=kJQP7kiw5Fk',
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function runTest(withFix) {
  const label = withFix ? 'WITH FIX' : 'BASELINE';
  console.log(`\n${'='.repeat(50)}`);
  console.log(`TEST: ${label}`);
  console.log('='.repeat(50));

  const ctx = await firefox.launch({
    headless: false,
    slowMo: 30,
    args: ['--no-sandbox'],
  });
  const context = await ctx.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
    viewport: { width: 1280, height: 720 },
  });

  if (withFix) await context.addInitScript(FIX_CODE);

  const failedReqs = [];
  const blockedByFix = [];
  context.on('page', p => {
    p.on('requestfailed', req => {
      const url = req.url();
      const err = req.failure()?.errorText || '';
      if (!url.includes('analytics') && !url.includes('tracking') &&
          !url.includes('doubleclick') && !url.includes('googlesyndication')) {
        failedReqs.push({ url: url.slice(0, 100), err });
      }
    });
    p.on('console', msg => {
      if (msg.text().startsWith('[FAD]') && msg.text().includes('blocked')) {
        blockedByFix.push(msg.text().slice(0, 100));
      }
    });
  });

  const page = await context.newPage();
  const results = [];

  for (let i = 0; i < VIDEOS.length; i++) {
    const url = VIDEOS[i];
    console.log(`\n--- [${label}] Video ${i + 1}/${VIDEOS.length} ---`);

    const pageErrors = [];
    page.on('pageerror', e => pageErrors.push(e.message.slice(0, 80)));

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e) {
      console.log('  goto error:', e.message.slice(0, 60));
      results.push({ i: i + 1, url, error: e.message.slice(0, 60) });
      continue;
    }

    // Check for CAPTCHA
    const isCaptcha = await page.evaluate(() => location.href.includes('/sorry/'));
    if (isCaptcha) {
      console.log('  🤖 CAPTCHA — stopping');
      results.push({ i: i + 1, url, captcha: true });
      break;
    }

    // Wait for player
    await sleep(3000);

    // Try to click play button if paused
    try {
      await page.click('button.ytp-play-button', { timeout: 3000 });
      console.log('  Clicked play button');
    } catch (_) {}

    await sleep(5000);

    const r = await page.evaluate(() => {
      const player = document.querySelector('#movie_player,.html5-video-player');
      const video  = document.querySelector('video');
      const err    = player?.querySelector('.ytp-error-content-wrap-reason');
      return {
        url:         location.href,
        adShowing:   player?.classList?.contains('ad-showing') ?? false,
        skipBtn:     !!document.querySelector('.ytp-ad-skip-button,.ytp-skip-ad-button,.ytp-ad-skip-button-modern'),
        enforcement: !!document.querySelector('ytd-enforcement-message-view-model'),
        adText:      !!document.querySelector('.ytp-ad-text,.ytp-ad-preview-text'),
        videoTime:   video?.currentTime ?? -1,
        videoPaused: video?.paused ?? null,
        videoError:  video?.error ? `code:${video.error.code}` : null,
        playerError: err?.textContent?.trim() ?? null,
        playerClass: player?.className?.split(' ').filter(c => c.includes('error') || c.includes('ad-')).join(' ') ?? '',
        fixActive:   !!window.__fadblockYoutubePruneActive,
        fixStage:    window.__fadblockYoutubeStage ?? 'none',
        streamData:  !!window.ytInitialPlayerResponse?.streamingData,
        hasAds:      !!(window.ytInitialPlayerResponse?.adPlacements?.length ||
                        window.ytInitialPlayerResponse?.playerAds?.length),
      };
    });

    const clean   = !r.adShowing && !r.skipBtn && !r.enforcement && !r.adText;
    const playing = !r.videoPaused && r.videoTime > 0;
    const adIcon  = clean ? '✅' : '❌';
    const playIcon = playing ? '▶' : r.videoError ? '💥' : '⏸';

    console.log(`  Ads:${adIcon}  Play:${playIcon}  fix:${r.fixActive}/${r.fixStage}`);
    console.log(`  time:${r.videoTime.toFixed(2)}s  paused:${r.videoPaused}  videoErr:${r.videoError}  playerErr:${r.playerError}`);
    console.log(`  streamData:${r.streamData}  hasAds:${r.hasAds}  classes:[${r.playerClass}]`);

    if (pageErrors.length) console.log(`  pageErrors:`, pageErrors.slice(0, 3));

    results.push({ ...r, i: i + 1, clean, playing });

    await sleep(3000);
  }

  await ctx.close();

  console.log(`\n--- [${label}] SUMMARY ---`);
  for (const r of results) {
    if (r.captcha) { console.log(`  V${r.i}: 🤖 CAPTCHA`); continue; }
    if (r.error)   { console.log(`  V${r.i}: ❌ error: ${r.error}`); continue; }
    const a = r.clean   ? '✅ no-ads' : '❌ ADS';
    const p = r.playing ? '▶ playing' : r.videoError ? `💥 ${r.videoError}` : '⏸ paused';
    console.log(`  V${r.i}: ${a} | ${p} | time:${r.videoTime?.toFixed(2)}s`);
  }

  if (failedReqs.length) {
    console.log(`\n  Failed requests (non-ad, ${failedReqs.length} total):`);
    // Show unique patterns
    const unique = [...new Set(failedReqs.map(r => {
      try { return new URL(r.url).hostname + new URL(r.url).pathname.slice(0,40); } catch { return r.url; }
    }))];
    unique.slice(0, 10).forEach(u => console.log('   ', u));
  }

  if (blockedByFix.length) {
    console.log(`\n  Fix blocked (${blockedByFix.length}):`);
    [...new Set(blockedByFix)].slice(0, 5).forEach(b => console.log('   ', b));
  }

  return results;
}

(async () => {
  console.log('=== FULL YOUTUBE TEST ===');
  console.log('Videos:', VIDEOS.length, '| Date:', new Date().toISOString());

  const baseline = await runTest(false);
  await sleep(2000);
  const withFix  = await runTest(true);

  console.log('\n' + '='.repeat(50));
  console.log('COMPARISON');
  console.log('='.repeat(50));
  for (let i = 0; i < Math.max(baseline.length, withFix.length); i++) {
    const b = baseline[i]; const f = withFix[i];
    const bn = b ? (b.captcha ? '🤖' : b.error ? '❌err' : `${b.clean?'✅':'❌ads'} ${b.playing?'▶':'⏸'}`) : '-';
    const fn = f ? (f.captcha ? '🤖' : f.error ? '❌err' : `${f.clean?'✅':'❌ads'} ${f.playing?'▶':'⏸'}`) : '-';
    console.log(`  V${i+1}: base=${bn}  fix=${fn}`);
  }
})().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
