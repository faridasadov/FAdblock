#!/usr/bin/env node
/**
 * Launches REAL Firefox + extension via web-ext, connects via CDP,
 * then monitors YouTube for 200s to catch the 1:54 enforcement restart.
 */
'use strict';
const { chromium } = require('playwright');
const { prepareFirefoxPackage } = require('./firefox-package');
const { spawn } = require('child_process');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');

const ROOT     = path.resolve(__dirname, '..');
const CDP_PORT = 9222;
const sleep    = ms => new Promise(r => setTimeout(r, ms));

// Build extension stage dir
function buildStage() {
  return prepareFirefoxPackage(ROOT);
}

// Launch Firefox+extension via web-ext
function launchWebExt(stageDir) {
  console.log('[webext] Launching Firefox with extension…');
  const proc = spawn('npx', [
    'web-ext', 'run',
    '--source-dir', stageDir,
    '--start-url', 'about:blank',
    '--firefox-profile', path.join(require('os').tmpdir(), 'fadblock-cdp-profile'),
    '--keep-profile-changes',
    '--args', `--remote-debugging-port=${CDP_PORT}`,
  ], { cwd: ROOT, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });

  proc.stdout.on('data', d => process.stdout.write('[webext] ' + d));
  proc.stderr.on('data', d => process.stderr.write('[webext!] ' + d));
  proc.on('error', e => console.error('[webext] error:', e.message));
  return proc;
}

// Poll until CDP endpoint is ready
function waitForCDP(maxMs = 30000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + maxMs;
    function attempt() {
      http.get(`http://localhost:${CDP_PORT}/json/version`, res => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => {
          try { resolve(JSON.parse(body)); } catch { retry(); }
        });
      }).on('error', retry);
    }
    function retry() {
      if (Date.now() > deadline) return reject(new Error('CDP timeout'));
      setTimeout(attempt, 800);
    }
    attempt();
  });
}

(async () => {
  let weProc  = null;
  let browser = null;

  try {
    const stageDir = buildStage();
    weProc = launchWebExt(stageDir);

    console.log('[test] Waiting for CDP on port', CDP_PORT, '…');
    await waitForCDP();
    console.log('[test] CDP ready. Connecting…');
    await sleep(2000); // extra settle time

    browser = await chromium.connectOverCDP(`http://localhost:${CDP_PORT}`);
    const ctx  = browser.contexts()[0];
    if (!ctx) { console.error('[test] No context found'); return; }
    const page = ctx.pages()[0] || await ctx.newPage();

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
      if (t.startsWith('[FAD]') || t.includes('nav_blocked') || t.includes('unexpected_reset') || t.includes('position_restored')) {
        log('CONSOLE: ' + t.slice(0, 160));
      }
    });
    page.on('framenavigated', frame => {
      if (frame === page.mainFrame()) log('FRAME-NAV: ' + frame.url().slice(0, 80));
    });

    // Navigate to YouTube
    const VIDEO = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    log('Navigating to ' + VIDEO);
    await page.goto(VIDEO, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(4000);

    // Start playback
    await page.evaluate(() => {
      const v = document.querySelector('video');
      if (v) v.play().catch(() => {});
    });
    log('Playback started');

    let lastVt = 0;
    let restartCount = 0;

    // Monitor 200 seconds
    for (let i = 0; i < 40; i++) {
      await sleep(5000);

      const state = await page.evaluate(() => {
        const v = document.querySelector('video');
        let fadLogs = [];
        try { fadLogs = JSON.parse(sessionStorage.getItem('fadblock_log') || '[]').slice(-8); } catch(e) {}
        return {
          vt:          v ? parseFloat(v.currentTime.toFixed(2)) : -1,
          paused:      v ? v.paused : null,
          url:         location.href.slice(30, 80),
          enforcement: !!document.querySelector('ytd-enforcement-message-view-model'),
          adClass:     (document.querySelector('#movie_player')?.className || '').includes('ad-showing'),
          fadStage:    window.__fadblockYoutubeStage || '?',
          fadErr:      window.__fadblockYoutubeError || null,
          blocked:     sessionStorage.getItem('fadblock_blocked') || '',
          savedPos:    (() => {
            const keys = Object.keys(sessionStorage).filter(k => k.startsWith('fb_pos_') && !k.endsWith('_ts'));
            return keys.map(k => k + '=' + sessionStorage.getItem(k)).join(', ');
          })(),
          fadLogs: fadLogs.map(l => l.ev + (l.d ? ' ' + JSON.stringify(l.d).slice(0,60) : '')),
        };
      }).catch(e => ({ vt: -1, error: e.message }));

      if (state.error) { log('eval error: ' + state.error); continue; }

      // Detect restart
      if (lastVt > 25 && state.vt >= 0 && state.vt < lastVt - 10) {
        log(`⚠️  RESTART! was ${lastVt}s → now ${state.vt}s`);
        restartCount++;
      }
      if (state.vt > 0) lastVt = state.vt;

      log(`vt=${state.vt}s paused=${state.paused} enf=${state.enforcement} fadStage=${state.fadStage} blocked="${state.blocked}" savedPos="${state.savedPos}"`);
      if (state.fadLogs.length) log('  FAD: ' + state.fadLogs.join(' | '));
      if (state.fadErr) log('  FAD ERROR: ' + state.fadErr);
    }

    // Final dump
    const final = await page.evaluate(() => {
      let fadLogs = [];
      try { fadLogs = JSON.parse(sessionStorage.getItem('fadblock_log') || '[]'); } catch(e) {}
      return { fadLogs, blocked: sessionStorage.getItem('fadblock_blocked') };
    }).catch(() => ({ fadLogs: [] }));

    console.log('\n=== ALL FAD EVENTS ===');
    final.fadLogs.forEach(l => {
      console.log(`  ${new Date(l.t).toISOString().slice(11,19)} ${l.ev}`, JSON.stringify(l.d || {}).slice(0, 100));
    });

    console.log('\n=== SUMMARY ===');
    console.log('Restarts detected:', restartCount);
    console.log('fadblock_blocked:', final.blocked);

    await page.screenshot({ path: path.join(ROOT, 'ss-ext-cdp.png') }).catch(() => {});
    fs.writeFileSync(path.join(ROOT, 'ext-cdp-events.log'), events.join('\n'));
    console.log('Log: ext-cdp-events.log | Screenshot: ss-ext-cdp.png');

    await sleep(2000);
  } catch (e) {
    console.error('[FATAL]', e.message);
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (weProc)  { weProc.kill('SIGTERM'); }
  }
})();
