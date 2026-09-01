#!/usr/bin/env node
/**
 * Pre-installs extension into Firefox profile, then launches via Playwright.
 * Monitors YouTube video for 200s with REAL extension + DNR rules active.
 */
'use strict';
const { firefox } = require('playwright');
const { prepareFirefoxPackage } = require('./firefox-package');
const { execFileSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const ROOT  = path.resolve(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Build XPI
function buildXpi() {
  const stageDir = prepareFirefoxPackage(ROOT);
  const artDir   = path.join(os.tmpdir(), 'fadblock-profile-build');
  fs.mkdirSync(artDir, { recursive: true });
  const out = execFileSync('npx', [
    'web-ext', 'build', '--source-dir', stageDir,
    '--artifacts-dir', artDir, '--overwrite-dest',
  ], { encoding: 'utf8', shell: true });
  const m = out.match(/ready: (.+\.(?:zip|xpi))/);
  return m ? m[1].trim() : null;
}

// Pre-install extension into a Firefox profile directory
function setupProfile(xpiPath) {
  const profile = path.join(os.tmpdir(), 'fadblock-ext-profile');
  fs.mkdirSync(profile, { recursive: true });

  // user.js: bypass signature checking
  fs.writeFileSync(path.join(profile, 'user.js'), [
    'user_pref("xpinstall.signatures.required", false);',
    'user_pref("extensions.autoDisableScopes", 0);',
    'user_pref("extensions.enabledScopes", 15);',
    'user_pref("extensions.install.requireBuiltInCerts", false);',
    'user_pref("extensions.langpacks.signatures.required", false);',
    'user_pref("browser.aboutConfig.showWarning", false);',
    'user_pref("media.autoplay.default", 0);',
  ].join('\n'));

  // Copy XPI into extensions dir with the addon GUID as filename
  const extDir = path.join(profile, 'extensions');
  fs.mkdirSync(extDir, { recursive: true });
  const ADDON_ID = 'adblock-pro@farid.dev';
  fs.copyFileSync(xpiPath, path.join(extDir, ADDON_ID + '.xpi'));
  console.log('[setup] Extension XPI copied to profile/extensions/');

  return profile;
}

(async () => {
  // 1. Build
  console.log('[setup] Building XPI…');
  const xpiPath = buildXpi();
  if (!xpiPath) { console.error('XPI not found'); process.exit(1); }
  console.log('[setup] XPI:', xpiPath);

  // 2. Setup profile with pre-installed extension
  const profile = setupProfile(xpiPath);
  console.log('[setup] Profile:', profile);

  // 3. Launch Firefox with persistent context + profile
  const context = await firefox.launchPersistentContext(profile, {
    headless: false,
    firefoxUserPrefs: {
      'xpinstall.signatures.required': false,
      'extensions.autoDisableScopes': 0,
      'extensions.enabledScopes': 15,
      'media.autoplay.default': 0,
    },
    // Give extension time to load
    slowMo: 0,
  });

  // 4. Wait for extension to initialize
  await sleep(3000);

  // Verify extension is active
  const extCheck = await (context.pages()[0] || await context.newPage()).evaluate(async () => {
    // Check if extension added any globals or if we can detect it
    return {
      hasFadblock: !!window.__fadblockYoutubePruneActive,
      userAgent: navigator.userAgent.slice(0, 50),
    };
  });
  console.log('[check] Extension globals on blank page:', extCheck);

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
    if (t.startsWith('[FAD]') || t.includes('nav_blocked') || t.includes('reset') || t.includes('restore') || t.includes('pos_tracker')) {
      log('CON: ' + t.slice(0, 160));
    }
  });
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) log('NAV: ' + frame.url().slice(0, 80));
  });
  page.on('requestfailed', req => {
    const u = req.url();
    if (u.includes('doubleclick') || u.includes('googlesyndication') || u.includes('googlevideo')) {
      log('FAIL: ' + u.slice(0, 80));
    }
  });

  // 5. Go to YouTube
  const VIDEO = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  log('Navigating → ' + VIDEO);
  await page.goto(VIDEO, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(5000);

  // Check extension active on YouTube
  const ytCheck = await page.evaluate(() => ({
    fadActive:  !!window.__fadblockYoutubePruneActive,
    fadStage:   window.__fadblockYoutubeStage || '?',
    fadErr:     window.__fadblockYoutubeError || null,
    hasAdPlacement: !!(window.ytInitialPlayerResponse?.adPlacements?.length),
  }));
  log('Extension on YT: active=' + ytCheck.fadActive + ' stage=' + ytCheck.fadStage + ' adPlacements=' + ytCheck.hasAdPlacement);
  if (ytCheck.fadErr) log('FAD ERROR: ' + ytCheck.fadErr);

  // Start playback
  await page.evaluate(() => {
    const v = document.querySelector('video');
    if (v) { v.muted = true; v.play().catch(() => {}); }
  });
  log('Playback started');

  let lastVt = 0, restarts = 0;

  // 6. Monitor 200 seconds
  for (let i = 0; i < 40; i++) {
    await sleep(5000);

    const st = await page.evaluate(() => {
      const v  = document.querySelector('video');
      let fl = [];
      try { fl = JSON.parse(sessionStorage.getItem('fadblock_log') || '[]').slice(-5); } catch(e) {}
      return {
        vt:  v ? parseFloat(v.currentTime.toFixed(1)) : -1,
        psd: v ? v.paused : null,
        enf: !!document.querySelector('ytd-enforcement-message-view-model'),
        adS: !!(document.querySelector('#movie_player')?.classList?.contains('ad-showing')),
        blk: sessionStorage.getItem('fadblock_blocked') || '',
        pos: (() => {
          const k = Object.keys(sessionStorage).find(k => k.startsWith('fb_pos_') && !k.endsWith('_ts'));
          return k ? k + '=' + sessionStorage.getItem(k) : '';
        })(),
        fev: fl.map(l => l.ev).join(','),
      };
    }).catch(e => ({ vt: -1, err: e.message }));

    if (st.err) { log('err: ' + st.err); continue; }

    if (lastVt > 25 && st.vt >= 0 && st.vt < lastVt - 10) {
      log(`⚠️ RESTART: ${lastVt}s→${st.vt}s`);
      restarts++;
    }
    if (st.vt > 0) lastVt = st.vt;

    log(`vt=${st.vt}s psd=${st.psd} enf=${st.enf} adS=${st.adS} blk="${st.blk}" pos="${st.pos}" events="${st.fev}"`);
  }

  // 7. Final FAD log
  const final = await page.evaluate(() => {
    let fl = [];
    try { fl = JSON.parse(sessionStorage.getItem('fadblock_log') || '[]'); } catch(e) {}
    return { fl, blk: sessionStorage.getItem('fadblock_blocked') };
  }).catch(() => ({ fl: [] }));

  console.log('\n=== ALL FAD EVENTS ===');
  final.fl.forEach(l => console.log(
    `  ${new Date(l.t).toISOString().slice(11,19)} ${l.ev}`,
    JSON.stringify(l.d || {}).slice(0, 120)
  ));
  console.log('\nRestarts:', restarts, '| blocked:', final.blk);

  await page.screenshot({ path: path.join(ROOT, 'ss-ext-profile.png') }).catch(() => {});
  fs.writeFileSync(path.join(ROOT, 'ext-profile-events.log'), events.join('\n'));
  console.log('Log: ext-profile-events.log | Screenshot: ss-ext-profile.png');

  await sleep(2000);
  await context.close();
})().catch(e => { console.error('[FATAL]', e.message); process.exit(1); });
