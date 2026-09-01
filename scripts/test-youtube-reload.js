#!/usr/bin/env node
'use strict';
const { firefox } = require('playwright');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  console.log('=== YouTube Reload Test v1.3.2 ===');

  const browser = await firefox.launch({ headless: false, slowMo: 0 });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });

  // Inject all MAIN world scripts
  const injectV2 = fs.readFileSync(path.join(ROOT, 'content', 'youtube-inject-v2.js'), 'utf8');
  await context.addInitScript(injectV2);

  // Also inject DNR simulation for youtube-rules
  const ytRules = JSON.parse(fs.readFileSync(path.join(ROOT, 'rules', 'youtube-rules.json'), 'utf8'));
  const mainRules = JSON.parse(fs.readFileSync(path.join(ROOT, 'rules', 'rules.json'), 'utf8'));
  const allRules = [...mainRules, ...ytRules].filter(r => r.action?.type === 'block');

  function makeTest(rule) {
    if (rule.condition?.regexFilter) {
      const re = new RegExp(rule.condition.regexFilter, 'i');
      return url => re.test(url);
    }
    if (rule.condition?.urlFilter) {
      let p = rule.condition.urlFilter
        .replace(/^\|\|/, '').replace(/\^/g, '').replace(/\./g, '\\.').replace(/\*/g, '.*');
      const re = new RegExp(p, 'i');
      return url => re.test(url);
    }
    return () => false;
  }
  const blockTests = allRules.map(r => ({ id: r.id, test: makeTest(r) }));

  await context.route('**/*', (route) => {
    const url = route.request().url();
    const matched = blockTests.find(r => r.test(url));
    if (matched) {
      console.log(`  [DNR block rule ${matched.id}]`, url.slice(0, 80));
      return route.abort('blockedbyclient');
    }
    route.continue();
  });

  const page = await context.newPage();
  const events = [];
  let reloadCount = 0;
  let navCount = 0;

  page.on('console', msg => {
    const t = msg.text();
    if (t.startsWith('[FAD]')) {
      const entry = `[${new Date().toISOString().slice(11,19)}] ${t.slice(0, 120)}`;
      events.push(entry);
      console.log(entry);
    }
    if (msg.type() === 'error') {
      console.log(`  [ERR] ${t.slice(0, 100)}`);
    }
  });

  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) {
      navCount++;
      const entry = `[${new Date().toISOString().slice(11,19)}] NAV #${navCount}: ${frame.url().slice(0, 80)}`;
      events.push(entry);
      console.log(entry);
    }
  });

  page.on('requestfailed', req => {
    const url = req.url();
    if (!url.includes('analytics') && !url.includes('stats') && !url.includes('log_event')) {
      console.log(`  [FAIL] ${url.slice(0, 80)} — ${req.failure()?.errorText}`);
    }
  });

  // Use the video from the user's recording
  const VIDEO_URL = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
  console.log('\nNavigating to:', VIDEO_URL);
  await page.goto(VIDEO_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);

  // Check initial state
  const initial = await page.evaluate(() => ({
    title: document.title,
    fadActive: !!window.__fadblockYoutubePruneActive,
    fadStage: window.__fadblockYoutubeStage,
    adShowing: document.querySelector('#movie_player')?.classList?.contains('ad-showing') ?? false,
    enforcement: !!document.querySelector('ytd-enforcement-message-view-model'),
    videoTime: document.querySelector('video')?.currentTime ?? -1,
    videoPaused: document.querySelector('video')?.paused ?? null,
  }));
  console.log('\n--- Initial state ---');
  console.log('Title:', initial.title?.slice(0, 60));
  console.log('FAD active:', initial.fadActive, '| stage:', initial.fadStage);
  console.log('Ad showing:', initial.adShowing, '| enforcement:', initial.enforcement);
  console.log('Video:', initial.videoTime.toFixed(1) + 's', '| paused:', initial.videoPaused);

  await page.screenshot({ path: path.join(ROOT, 'ss-reload-test-initial.png') });
  console.log('Screenshot: ss-reload-test-initial.png');

  // Try to play the video
  await page.evaluate(() => {
    const v = document.querySelector('video');
    if (v && v.paused) v.play().catch(() => {});
  });

  // Monitor for 90 seconds — watch for reloads, navigation, ad enforcement
  console.log('\nMonitoring for 90 seconds...');
  const prevNavCount = navCount;
  for (let i = 0; i < 18; i++) {
    await sleep(5000);
    const state = await page.evaluate(() => ({
      title: document.title?.slice(0, 50),
      url: location.href.slice(0, 80),
      videoTime: document.querySelector('video')?.currentTime?.toFixed(1) ?? 'N/A',
      videoPaused: document.querySelector('video')?.paused ?? null,
      videoError: document.querySelector('video')?.error ? 'code:' + document.querySelector('video').error.code : null,
      adShowing: document.querySelector('#movie_player')?.classList?.contains('ad-showing') ?? false,
      enforcement: !!document.querySelector('ytd-enforcement-message-view-model'),
      skipBtn: !!document.querySelector('.ytp-ad-skip-button,.ytp-skip-ad-button'),
      fadBlocked: (() => { try { return sessionStorage.getItem('fadblock_blocked'); } catch(e) { return null; } })(),
    }));

    const elapsed = (i + 1) * 5;
    const navDiff = navCount - prevNavCount;
    console.log(`[${elapsed}s] time=${state.videoTime}s paused=${state.videoPaused} navs=${navCount} adShowing=${state.adShowing} enforcement=${state.enforcement} blocked=${state.fadBlocked}`);

    if (state.enforcement) {
      console.log('  *** ENFORCEMENT MESSAGE DETECTED ***');
      await page.screenshot({ path: path.join(ROOT, `ss-enforcement-${elapsed}s.png`) });
    }
    if (state.adShowing) {
      console.log('  *** AD SHOWING ***');
      await page.screenshot({ path: path.join(ROOT, `ss-ad-${elapsed}s.png`) });
    }
    if (navCount > prevNavCount + 1) {
      reloadCount++;
      console.log(`  *** PAGE RELOAD/NAV DETECTED! Total reloads: ${reloadCount} ***`);
      await page.screenshot({ path: path.join(ROOT, `ss-reload-${elapsed}s.png`) });
    }
  }

  await page.screenshot({ path: path.join(ROOT, 'ss-reload-test-final.png') });
  console.log('\n--- Final state ---');
  console.log('Total navigations:', navCount);
  console.log('Reloads detected:', reloadCount);
  console.log('FAD events logged:', events.filter(e => e.includes('[FAD]')).length);
  console.log('\nScreenshot: ss-reload-test-final.png');

  await sleep(3000);
  await browser.close();
})().catch(e => { console.error('[FATAL]', e.message); process.exit(1); });


