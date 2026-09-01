#!/usr/bin/env node
/**
 * Real Firefox + real extension installed via installAddon.
 * Monitors YouTube for 200s to catch the 1:54 enforcement restart.
 * Logs all FAD events, navigation, video state.
 */
'use strict';
const { firefox } = require('playwright');
const { prepareFirefoxPackage } = require('./firefox-package');
const { execFileSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const ROOT = path.resolve(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // 1. Build XPI
  console.log('[setup] Building extension…');
  const stageDir = prepareFirefoxPackage(ROOT);
  const artDir   = path.join(os.tmpdir(), 'fadblock-154-build');
  fs.mkdirSync(artDir, { recursive: true });
  const buildOut = execFileSync('npx', [
    'web-ext', 'build', '--source-dir', stageDir,
    '--artifacts-dir', artDir, '--overwrite-dest',
  ], { encoding: 'utf8', shell: true });
  const m = buildOut.match(/ready: (.+\.(?:zip|xpi))/);
  const xpiPath = m ? m[1].trim() : fs.readdirSync(artDir).map(f => path.join(artDir, f)).find(f => f.endsWith('.zip') || f.endsWith('.xpi'));
  if (!xpiPath) { console.error('No XPI found'); process.exit(1); }
  console.log('[setup] XPI:', xpiPath);

  // 2. Launch Firefox with persistent profile (keeps extension state)
  const profile = path.join(os.tmpdir(), 'fadblock-154-profile');
  fs.mkdirSync(profile, { recursive: true });

  const context = await firefox.launchPersistentContext(profile, {
    headless: false,
    firefoxUserPrefs: {
      'xpinstall.signatures.required': false,
      'extensions.autoDisableScopes': 0,
      'extensions.enabledScopes': 15,
    },
  });

  // 3. Install extension
  let addonId = null;
  try {
    addonId = await context.installAddon(xpiPath, false);
    console.log('[setup] Extension installed, id:', addonId);
  } catch (e) {
    console.error('[setup] installAddon failed:', e.message);
    await context.close(); process.exit(1);
  }

  // 4. Open YouTube watch page
  const page = context.pages()[0] || await context.newPage();
  const startTime = Date.now();
  const events = [];

  function elapsed() { return ((Date.now() - startTime) / 1000).toFixed(1); }
  function log(msg) {
    const line = `[${elapsed()}s] ${msg}`;
    events.push(line);
    console.log(line);
  }

  page.on('console', msg => {
    const t = msg.text();
    if (t.startsWith('[FAD]') || t.includes('[NAV]')) {
      log('CONSOLE: ' + t.slice(0, 160));
    }
    if (msg.type() === 'error') {
      log('ERR: ' + t.slice(0, 100));
    }
  });

  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) {
      log('FRAME-NAV: ' + frame.url().slice(0, 80));
    }
  });

  // 5. Navigate to YouTube video (longer video so it won't end)
  const VIDEO_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  log('Going to: ' + VIDEO_URL);
  await page.goto(VIDEO_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);

  // Start playback
  await page.evaluate(() => {
    document.querySelector('video')?.play().catch(() => {});
  });
  log('Playback started');

  // 6. Monitor for 200 seconds
  let lastVideoTime = 0;
  let restartDetected = false;

  for (let i = 0; i < 40; i++) {
    await sleep(5000);

    const state = await page.evaluate(() => {
      const v = document.querySelector('video');
      let fadLogs = [];
      try { fadLogs = JSON.parse(sessionStorage.getItem('fadblock_log') || '[]').slice(-5); } catch(e) {}
      return {
        vt: v ? parseFloat(v.currentTime.toFixed(1)) : -1,
        paused: v ? v.paused : null,
        url: location.href.slice(0, 80),
        enforcement: !!document.querySelector('ytd-enforcement-message-view-model'),
        adOverlay: !!document.querySelector('.ad-interrupting,.ad-showing'),
        fadStage: window.__fadblockYoutubeStage,
        fadLogs: fadLogs.map(l => l.ev + (l.d && Object.keys(l.d).length ? ' ' + JSON.stringify(l.d).slice(0, 60) : '')),
        blocked: sessionStorage.getItem('fadblock_blocked') || '',
        unload: sessionStorage.getItem('fadblock_unload') || '',
      };
    });

    // Detect restart: video time dropped significantly (>10s) from last check
    if (lastVideoTime > 25 && state.vt >= 0 && state.vt < lastVideoTime - 10) {
      log(`⚠️  RESTART DETECTED! was ${lastVideoTime}s → now ${state.vt}s`);
      restartDetected = true;
    }
    lastVideoTime = state.vt > 0 ? state.vt : lastVideoTime;

    log(`vt=${state.vt}s paused=${state.paused} enforcement=${state.enforcement} adOverlay=${state.adOverlay} blocked="${state.blocked}"`);
    if (state.fadLogs.length) log('  FAD: ' + state.fadLogs.join(' | '));
  }

  // 7. Final: dump full FAD log from sessionStorage
  const finalState = await page.evaluate(() => {
    let fadLogs = [];
    try { fadLogs = JSON.parse(sessionStorage.getItem('fadblock_log') || '[]'); } catch(e) {}
    return {
      fadLogs,
      blocked: sessionStorage.getItem('fadblock_blocked') || '',
      posKey: Object.keys(sessionStorage).filter(k => k.startsWith('fb_pos_')).join(','),
      posVal: Object.keys(sessionStorage).filter(k => k.startsWith('fb_pos_') && !k.endsWith('_ts'))
               .map(k => k + '=' + sessionStorage.getItem(k)).join(', '),
    };
  });

  console.log('\n=== FAD LOG (all events) ===');
  finalState.fadLogs.forEach(l => {
    console.log(`  ${new Date(l.t).toISOString().slice(11,19)} ${l.ev}`, JSON.stringify(l.d || {}).slice(0, 100));
  });
  console.log('\n=== SUMMARY ===');
  console.log('Restart detected:', restartDetected);
  console.log('fadblock_blocked:', finalState.blocked);
  console.log('Saved positions:', finalState.posVal || '(none)');

  await page.screenshot({ path: path.join(ROOT, 'ss-ext-154.png') });
  fs.writeFileSync(path.join(ROOT, 'ext-154-events.log'), events.join('\n'));
  console.log('\nLog: ext-154-events.log | Screenshot: ss-ext-154.png');

  await sleep(2000);
  await context.close();
})().catch(e => { console.error('[FATAL]', e.message); process.exit(1); });
