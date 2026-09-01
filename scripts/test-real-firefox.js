#!/usr/bin/env node
/**
 * Launches REAL Firefox with the extension installed (via web-ext),
 * then connects Playwright to it and tests YouTube + comss.ru.
 */
'use strict';
const { chromium, firefox } = require('playwright');
const { spawn, execFileSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const CDP_PORT = 9222;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── 1. Package extension ───────────────────────────────────────────────────
function buildExtension() {
  const { prepareFirefoxPackage } = require('./firefox-package');
  const stageDir = prepareFirefoxPackage(ROOT);
  console.log('[ext] Stage dir:', stageDir);
  return stageDir;
}

// ─── 2. Launch Firefox with extension + remote-debug port ───────────────────
function launchWebExt(stageDir) {
  return new Promise((resolve, reject) => {
    console.log('[webext] Launching Firefox with extension…');
    const proc = spawn('npx', [
      'web-ext', 'run',
      '--source-dir', stageDir,
      '--start-url', 'about:blank',
      '--firefox-profile', 'fadblock-test',
      '--keep-profile-changes',
      '--args', `--remote-debugging-port=${CDP_PORT}`,
    ], {
      cwd: ROOT,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    proc.stdout.on('data', d => {
      const t = d.toString();
      process.stdout.write('[webext] ' + t);
      if (t.includes('The extension will reload')) resolve(proc);
    });
    proc.stderr.on('data', d => process.stderr.write('[webext!] ' + d));
    proc.on('error', reject);

    // Fallback: resolve after 10s regardless
    setTimeout(() => resolve(proc), 10000);
  });
}

// ─── 3. Wait for CDP endpoint ───────────────────────────────────────────────
function waitForCDP(port, maxMs = 30000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + maxMs;
    function attempt() {
      http.get(`http://localhost:${port}/json/version`, (res) => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => {
          try { resolve(JSON.parse(body)); } catch(e) { retry(); }
        });
      }).on('error', retry);
    }
    function retry() {
      if (Date.now() > deadline) return reject(new Error('CDP timeout'));
      setTimeout(attempt, 500);
    }
    attempt();
  });
}

// ─── Main ───────────────────────────────────────────────────────────────────
(async () => {
  let webExtProc = null;
  let browser    = null;

  try {
    // Build extension
    const stageDir = buildExtension();

    // Launch Firefox with extension
    webExtProc = await launchWebExt(stageDir);
    console.log('[test] Waiting for CDP endpoint on port', CDP_PORT, '…');
    await sleep(5000); // Give Firefox time to start
    const cdpInfo = await waitForCDP(CDP_PORT);
    console.log('[test] CDP ready:', cdpInfo.Browser || cdpInfo.webSocketDebuggerUrl);

    // Connect Playwright
    browser = await chromium.connectOverCDP(`http://localhost:${CDP_PORT}`);
    const contexts = browser.contexts();
    console.log('[test] Contexts:', contexts.length);
    const ctx  = contexts[0] || await browser.newContext();
    const page = contexts[0]?.pages()[0] || await ctx.newPage();

    // Capture all logs + requests
    const consoleLogs  = [];
    const failedReqs   = [];
    const allReqs      = [];

    page.on('console', msg => {
      const text = msg.text();
      consoleLogs.push({ level: msg.type(), text });
      if (text.startsWith('[FAD]') || msg.type() === 'error') {
        console.log(`[${msg.type().toUpperCase()}]`, text.slice(0, 120));
      }
    });
    page.on('pageerror', err => {
      consoleLogs.push({ level: 'pageerror', text: err.message });
      console.log('[PAGEERR]', err.message.slice(0, 120));
    });
    page.on('requestfailed', req => {
      failedReqs.push({ url: req.url().slice(0, 100), err: req.failure()?.errorText });
      console.log('[FAIL]', req.url().slice(0, 100));
    });
    page.on('request', req => allReqs.push(req.url().slice(0, 80)));

    // ── Test 1: YouTube homepage ──────────────────────────────────────────
    console.log('\n=== TEST 1: YouTube Homepage ===');
    await page.goto('https://www.youtube.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(4000);
    const ssHome = path.join(ROOT, 'test-home.png');
    await page.screenshot({ path: ssHome });
    console.log('[ss] Homepage:', ssHome);

    const homeState = await page.evaluate(() => ({
      title: document.title,
      hasContent: document.querySelectorAll('ytd-rich-item-renderer,ytd-video-renderer').length,
      errors: document.querySelectorAll('yt-icon[icon="error"]').length,
      fadActive: !!window.__fadblockYoutubePruneActive,
      fadStage: window.__fadblockYoutubeStage || 'none',
      fadErr: window.__fadblockYoutubeError || null,
      bodyText: document.body?.textContent?.slice(0, 200) || '',
    }));
    console.log('[home]', JSON.stringify(homeState, null, 2));

    // ── Test 2: YouTube video ─────────────────────────────────────────────
    console.log('\n=== TEST 2: YouTube Video ===');
    consoleLogs.length = 0;
    failedReqs.length  = 0;

    await page.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
      waitUntil: 'domcontentloaded', timeout: 30000
    });
    await sleep(6000);

    const ssVideo = path.join(ROOT, 'test-video.png');
    await page.screenshot({ path: ssVideo });
    console.log('[ss] Video:', ssVideo);

    const vidState = await page.evaluate(() => {
      const player = document.querySelector('#movie_player,.html5-video-player');
      const video  = document.querySelector('video');
      return {
        title:        document.title,
        playerClass:  player?.className?.split(' ').filter(c => c.startsWith('ad-') || c.includes('error')).join(' ') || '',
        videoTime:    video?.currentTime ?? -1,
        videoPaused:  video?.paused ?? null,
        videoError:   video?.error ? 'code:' + video.error.code : null,
        adShowing:    player?.classList?.contains('ad-showing') ?? false,
        enforcement:  !!document.querySelector('ytd-enforcement-message-view-model'),
        fadActive:    !!window.__fadblockYoutubePruneActive,
        fadStage:     window.__fadblockYoutubeStage || 'none',
        fadErr:       window.__fadblockYoutubeError || null,
        sessionLogs:  (() => {
          try { return JSON.parse(sessionStorage.getItem('fadblock_log') || '[]').slice(-20); }
          catch(e) { return []; }
        })(),
      };
    });
    console.log('[video]', JSON.stringify(vidState, null, 2));

    if (failedReqs.length) {
      console.log('\n[FAILED REQUESTS]');
      [...new Set(failedReqs.map(r => r.url))].slice(0, 15).forEach(u => console.log(' ', u));
    }

    // ── Test 3: comss.ru ──────────────────────────────────────────────────
    console.log('\n=== TEST 3: comss.ru ===');
    consoleLogs.length = 0;
    failedReqs.length  = 0;
    await page.goto('https://www.comss.ru/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(4000);
    const ssComss = path.join(ROOT, 'test-comss2.png');
    await page.screenshot({ path: ssComss, fullPage: false });
    console.log('[ss] comss.ru:', ssComss);

    const comssState = await page.evaluate(() => {
      const iframes = Array.from(document.querySelectorAll('iframe'))
        .filter(f => f.offsetWidth > 50 && f.offsetHeight > 50)
        .map(f => ({ src: f.src.slice(0,80), w: f.offsetWidth, h: f.offsetHeight }));
      const adEls = Array.from(document.querySelectorAll('[id*="Ya"],[class*="yandex-ad"],[id*="yandex"]'))
        .filter(el => el.offsetWidth > 0)
        .map(el => ({ tag: el.tagName, id: el.id, cls: el.className.slice(0,40) }));
      return { iframes, adEls };
    });
    console.log('[comss]', JSON.stringify(comssState, null, 2));

    console.log('\n=== SUMMARY ===');
    console.log('Screenshots: test-home.png, test-video.png, test-comss2.png');
    console.log('FAD active on video page:', vidState.fadActive, '| stage:', vidState.fadStage);
    if (vidState.fadErr) console.log('FAD ERROR:', vidState.fadErr);
    console.log('Video time:', vidState.videoTime, '| paused:', vidState.videoPaused);
    console.log('Ads showing:', vidState.adShowing, '| enforcement:', vidState.enforcement);

    await sleep(3000);

  } catch (e) {
    console.error('[FATAL]', e.message);
  } finally {
    if (browser) await browser.close().catch(()=>{});
    if (webExtProc) { webExtProc.kill(); }
  }
})();
