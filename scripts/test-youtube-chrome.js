#!/usr/bin/env node
const path = require('path');
const { chromium } = require('playwright');

const EXT_PATH = path.resolve(__dirname, '..');
const TEST_URL = process.argv[2] || 'https://www.youtube.com/watch?v=X5IkL48wBKk&list=RDX5IkL48wBKk&start_radio=1';
const DURATION_MS = Number(process.argv[3] || 45000);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const ctx = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
      '--no-sandbox'
    ],
    viewport: { width: 1440, height: 960 },
  });

  try {
    await delay(2500);
    const page = await ctx.newPage();
    await page.goto(TEST_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.bringToFront();
    await page.waitForTimeout(12000);
    await page.evaluate(() => {
      const video = document.querySelector('#movie_player video, .html5-video-player video');
      if (video?.paused) {
        const playButton = document.querySelector('.ytp-play-button');
        playButton?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        video.play?.().catch?.(() => {});
      }
    });

    const samples = [];
    const startedAt = Date.now();

    while (Date.now() - startedAt < DURATION_MS) {
      const snapshot = await page.evaluate(() => {
        const video = document.querySelector('#movie_player video, .html5-video-player video');
        const player = document.querySelector('#movie_player, .html5-video-player');
        const rect = video?.getBoundingClientRect?.() || null;
        return {
          href: location.href,
          title: document.title,
          currentTime: video?.currentTime ?? null,
          duration: video?.duration ?? null,
          paused: video?.paused ?? null,
          ended: video?.ended ?? null,
          readyState: video?.readyState ?? null,
          playbackRate: video?.playbackRate ?? null,
          muted: video?.muted ?? null,
          videoWidth: video?.videoWidth ?? null,
          videoHeight: video?.videoHeight ?? null,
          decodedFrames: video?.webkitDecodedFrameCount ?? null,
          droppedFrames: video?.webkitDroppedFrameCount ?? null,
          src: video?.currentSrc || video?.src || null,
          playerClasses: player?.className || '',
          isAdShowing: !!player?.classList?.contains('ad-showing') || !!document.querySelector('.ad-showing'),
          skipButtons: document.querySelectorAll([
            '.ytp-skip-ad-button',
            '.ytp-skip-ad-button-modern',
            '.ytp-ad-skip-button-container button',
            '.ytp-skip-ad-button-container button'
          ].join(', ')).length,
          visibleCompanionAds: Array.from(document.querySelectorAll('ytd-display-ad-renderer, ytd-promoted-sparkles-web-renderer, ytd-promoted-video-renderer, ytd-ad-slot-renderer, ytd-companion-slot-renderer'))
            .filter((el) => {
              const style = getComputedStyle(el);
              return style.display !== 'none' && style.visibility !== 'hidden';
            }).length,
          videoRect: rect ? { width: rect.width, height: rect.height } : null,
          blackScreenLikely: !!video && video.readyState >= 2 && !video.paused && (video.videoWidth || 0) > 0 && (video.videoHeight || 0) > 0 && ((video.webkitDecodedFrameCount || 0) === 0),
        };
      });
      samples.push(snapshot);
      console.log(JSON.stringify(snapshot));
      await page.waitForTimeout(2500);
    }

    await page.screenshot({ path: '/tmp/fadblock-youtube-chrome-test.png' });

    const adSeen = samples.some((sample) => sample.isAdShowing || sample.skipButtons > 0);
    const blackSeen = samples.some((sample) => sample.blackScreenLikely);
    const first = samples[0] || {};
    const maxCurrentTime = Math.max(...samples.map((sample) => Number.isFinite(sample.currentTime) ? sample.currentTime : 0));
    const maxDecodedFrames = Math.max(...samples.map((sample) => Number.isFinite(sample.decodedFrames) ? sample.decodedFrames : 0));
    const progressed = samples.length > 1 && (
      (first.currentTime !== null && maxCurrentTime > first.currentTime + 2) ||
      (first.decodedFrames !== null && maxDecodedFrames > first.decodedFrames + 30)
    );
    const playerSized = samples.some((sample) => sample.videoRect?.width > 200 && sample.videoRect?.height > 100);
    const companionCleared = samples.every((sample) => sample.visibleCompanionAds === 0);

    console.log('\nSummary');
    console.log(`progressed=${progressed}`);
    console.log(`adSeen=${adSeen}`);
    console.log(`blackSeen=${blackSeen}`);
    console.log(`playerSized=${playerSized}`);
    console.log(`companionCleared=${companionCleared}`);

    if (!progressed || blackSeen || !playerSized) {
      process.exitCode = 1;
    }
  } finally {
    await ctx.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
