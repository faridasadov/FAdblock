#!/usr/bin/env node
/**
 * Tests the extension by:
 * 1. Launching Firefox with persistent profile via Playwright
 * 2. Installing extension XPI into it
 * 3. Testing YouTube and comss.ru
 */
'use strict';
const { firefox } = require('playwright');
const { prepareFirefoxPackage } = require('./firefox-package');
const { execFileSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const ROOT      = path.resolve(__dirname, '..');
const PROFILE   = path.join(os.tmpdir(), 'fadblock-ff-profile');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function runTest() {
  // 1. Build extension stage directory
  console.log('[setup] Building extension package…');
  const stageDir = prepareFirefoxPackage(ROOT);

  // 2. Build XPI
  const artifactsDir = path.join(os.tmpdir(), 'fadblock-amo-build');
  fs.mkdirSync(artifactsDir, { recursive: true });
  let xpiPath;
  try {
    const out = execFileSync('npx', [
      'web-ext', 'build',
      '--source-dir', stageDir,
      '--artifacts-dir', artifactsDir,
      '--overwrite-dest',
    ], { encoding: 'utf8', shell: true });
    const m = out.match(/Your web extension is ready: (.+\.(?:zip|xpi))/);
    xpiPath = m ? m[1].trim() : null;
  } catch (e) {
    console.error('[setup] web-ext build failed:', e.message);
    process.exit(1);
  }
  if (!xpiPath || !fs.existsSync(xpiPath)) {
    // Try to find any zip/xpi in artifactsDir
    const files = fs.readdirSync(artifactsDir).filter(f => f.endsWith('.zip') || f.endsWith('.xpi'));
    if (!files.length) { console.error('[setup] No XPI found'); process.exit(1); }
    xpiPath = path.join(artifactsDir, files[0]);
  }
  console.log('[setup] XPI:', xpiPath);

  // 3. Launch Firefox with persistent context + install addon
  console.log('[setup] Launching Firefox with persistent profile…');
  fs.mkdirSync(PROFILE, { recursive: true });

  const context = await firefox.launchPersistentContext(PROFILE, {
    headless: false,
    slowMo: 20,
    firefoxUserPrefs: {
      'xpinstall.signatures.required': false,
      'extensions.autoDisableScopes': 0,
      'extensions.enabledScopes': 15,
    },
    args: [],
  });

  // Install the extension
  try {
    console.log('[setup] Installing extension…');
    await context.addInitScript(() => {}); // ensure context is initialized
    // Use CDP-style install via evaluate — Firefox Playwright API
    const page = context.pages()[0] || await context.newPage();

    // Install via about:debugging approach using page.evaluate
    // Or install via the firefox devtools protocol
    try {
      const addonId = await context.installAddon(xpiPath, false);
      console.log('[setup] Extension installed! addon id:', addonId);
    } catch (installErr) {
      console.warn('[setup] installAddon failed:', installErr.message);
      console.warn('[setup] Falling back to addInitScript injection…');
      // Fall back: inject the content scripts manually
      const injectV2 = fs.readFileSync(path.join(ROOT, 'content', 'youtube-inject-v2.js'), 'utf8');
      await context.addInitScript(injectV2);
      console.log('[setup] Content scripts injected via addInitScript');
    }
  } catch (e) {
    console.error('[setup] Extension setup error:', e.message);
  }

  const consoleLogs = [];
  const failedReqs  = [];

  context.on('page', page => {
    page.on('console', msg => {
      const text = msg.text();
      consoleLogs.push({ type: msg.type(), text });
      if (text.startsWith('[FAD]') || msg.type() === 'error') {
        console.log(`  [${msg.type()}]`, text.slice(0, 120));
      }
    });
    page.on('pageerror', e => {
      console.log('  [PAGEERR]', e.message.slice(0, 100));
      consoleLogs.push({ type: 'pageerror', text: e.message });
    });
    page.on('requestfailed', req => {
      const url = req.url();
      failedReqs.push(url);
      if (!url.includes('analytics') && !url.includes('doubleclick') && !url.includes('googlesyndication')) {
        console.log('  [FAIL]', url.slice(0, 100));
      }
    });
  });

  const page = context.pages()[0] || await context.newPage();

  // ── TEST 1: YouTube Home ────────────────────────────────────────────────
  console.log('\n=== TEST 1: YouTube Home ===');
  consoleLogs.length = 0;
  try {
    await page.goto('https://www.youtube.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(5000);
  } catch (e) { console.log('  goto error:', e.message.slice(0, 60)); }

  const homeSnap = await page.evaluate(() => ({
    title:      document.title,
    videos:     document.querySelectorAll('ytd-rich-item-renderer,ytd-video-renderer').length,
    fadActive:  !!window.__fadblockYoutubePruneActive,
    fadStage:   window.__fadblockYoutubeStage || 'none',
    fadErr:     window.__fadblockYoutubeError || null,
    bodyLen:    document.body?.innerHTML?.length || 0,
  }));
  console.log('  title:', homeSnap.title);
  console.log('  videos visible:', homeSnap.videos);
  console.log('  fad active:', homeSnap.fadActive, '| stage:', homeSnap.fadStage);
  if (homeSnap.fadErr) console.log('  FAD ERROR:', homeSnap.fadErr);
  if (homeSnap.bodyLen < 1000) console.log('  WARN: very short body — page may not have loaded!', homeSnap.bodyLen, 'bytes');
  await page.screenshot({ path: path.join(ROOT, 'ss-home.png') });
  console.log('  Screenshot: ss-home.png');

  // ── TEST 2: YouTube Video ───────────────────────────────────────────────
  console.log('\n=== TEST 2: YouTube Video ===');
  consoleLogs.length = 0; failedReqs.length = 0;
  try {
    await page.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
      waitUntil: 'domcontentloaded', timeout: 30000
    });
    await sleep(7000);
  } catch (e) { console.log('  goto error:', e.message.slice(0, 60)); }

  const vidSnap = await page.evaluate(() => {
    const player = document.querySelector('#movie_player,.html5-video-player');
    const video  = document.querySelector('video');
    let fadLogs  = [];
    try { fadLogs = JSON.parse(sessionStorage.getItem('fadblock_log') || '[]').slice(-15); } catch(e) {}
    return {
      title:       document.title,
      playerClass: (player?.className || '').split(' ').filter(c => c.startsWith('ad-') || c.includes('error') || c.includes('unstarted')).join(' '),
      videoTime:   video?.currentTime ?? -1,
      videoPaused: video?.paused ?? null,
      videoErr:    video?.error ? 'code:' + video.error.code : null,
      adShowing:   player?.classList?.contains('ad-showing') ?? false,
      skipBtn:     !!document.querySelector('.ytp-ad-skip-button,.ytp-skip-ad-button'),
      enforcement: !!document.querySelector('ytd-enforcement-message-view-model'),
      fadActive:   !!window.__fadblockYoutubePruneActive,
      fadStage:    window.__fadblockYoutubeStage || 'none',
      fadErr:      window.__fadblockYoutubeError || null,
      hasAds:      !!(window.ytInitialPlayerResponse?.adPlacements?.length || window.ytInitialPlayerResponse?.playerAds?.length),
      fadLogs:     fadLogs.map(l => l.ev + (l.d?.url ? ' ' + String(l.d.url).slice(0,50) : '')),
    };
  });

  const clean = !vidSnap.adShowing && !vidSnap.skipBtn && !vidSnap.enforcement;
  console.log('  title:', vidSnap.title.slice(0, 60));
  console.log('  Ads:', clean ? '✅ CLEAN' : '❌ ADS SHOWING');
  console.log('  video time:', vidSnap.videoTime.toFixed(2), 's | paused:', vidSnap.videoPaused);
  console.log('  videoErr:', vidSnap.videoErr, '| playerClass:', vidSnap.playerClass || '(none)');
  console.log('  fad:', vidSnap.fadActive, '| stage:', vidSnap.fadStage);
  if (vidSnap.fadErr) console.log('  FAD ERROR:', vidSnap.fadErr);
  if (vidSnap.fadLogs.length) {
    console.log('  FAD logs:', vidSnap.fadLogs.join(' | '));
  }
  if (failedReqs.length) {
    const important = failedReqs.filter(u => !u.includes('stats') && !u.includes('analytics') && !u.includes('log_event'));
    if (important.length) console.log('  Failed reqs:', important.slice(0,5).join('\n    '));
  }
  await page.screenshot({ path: path.join(ROOT, 'ss-video.png') });
  console.log('  Screenshot: ss-video.png');

  // ── TEST 3: comss.ru ───────────────────────────────────────────────────
  console.log('\n=== TEST 3: comss.ru ===');
  consoleLogs.length = 0; failedReqs.length = 0;
  try {
    await page.goto('https://www.comss.ru/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(5000);
  } catch (e) { console.log('  goto error:', e.message.slice(0, 60)); }
  await page.screenshot({ path: path.join(ROOT, 'ss-comss.png'), fullPage: false });
  const comssSnap = await page.evaluate(() => {
    const iframes = Array.from(document.querySelectorAll('iframe'))
      .filter(f => f.offsetWidth > 100 && f.offsetHeight > 50)
      .map(f => f.src.slice(0, 80) || '(no src)');
    const adVisible = !!document.querySelector('.yandex-ad,.ya-ad,[class*="adsbygoogle"],[id*="yandex_rtb"]');
    return { iframes, adVisible, bodyLen: document.body?.innerHTML?.length || 0 };
  });
  console.log('  iframes:', comssSnap.iframes);
  console.log('  ad visible:', comssSnap.adVisible);
  console.log('  Screenshot: ss-comss.png');

  await sleep(2000);
  await context.close();
  console.log('\n=== DONE ===');
  console.log('Check screenshots: ss-home.png, ss-video.png, ss-comss.png in', ROOT);
}

runTest().catch(e => { console.error('[FATAL]', e.message); process.exit(1); });
