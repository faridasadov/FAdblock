#!/usr/bin/env node
'use strict';
// Real Firefox + geckodriver: extension-i temporary quraşdırır, YouTube videosunu
// açır və videonun həqiqətən oynadığını yoxlayır.
const { spawn } = require('child_process');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const PORT = 4444;
const BASE = `http://127.0.0.1:${PORT}`;

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function rq(method, url, body) {
  const res = await fetch(BASE + url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await res.json().catch(() => ({}));
  if (j.value && j.value.error) throw new Error(j.value.error + ': ' + j.value.message);
  return j.value;
}

(async () => {
  const { prepareFirefoxPackage } = require('./firefox-package');
  const stageDir = prepareFirefoxPackage(ROOT);
  console.log('[yt] stage:', stageDir);

  const gd = spawn(path.join(ROOT, 'geckodriver.exe'), ['--port', String(PORT)], { stdio: 'ignore' });
  await sleep(2500);

  let sid;
  try {
    const s = await rq('POST', '/session', {
      capabilities: { alwaysMatch: { browserName: 'firefox', pageLoadStrategy: 'eager', timeouts: { pageLoad: 60000, script: 30000 }, 'moz:firefoxOptions': { args: [], prefs: { 'media.autoplay.default': 0, 'media.autoplay.blocking_policy': 0 } } } },
    });
    sid = s.sessionId;
    console.log('[yt] session:', sid);

    await rq('POST', `/session/${sid}/moz/addon/install`, { path: stageDir, temporary: true });
    console.log('[yt] extension quraşdırıldı');
    await sleep(6000); // service worker + DNR qaydaları

    const VIDEO = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ'; // Big Buck Bunny, uzun
    await rq('POST', `/session/${sid}/url`, { url: VIDEO });
    console.log('[yt] naviqasiya edildi, 20s gözlənilir…');
    await sleep(20000);

    const probe = `
      const v = document.querySelector('#movie_player video, video');
      const player = document.querySelector('#movie_player');
      const enforcement = document.querySelector('ytd-enforcement-message-view-model');
      let log = [];
      try { log = JSON.parse(sessionStorage.getItem('fadblock_log') || '[]'); } catch(e) {}
      return {
        url: location.href,
        title: document.title,
        videoVar: !!v,
        t0: v ? v.currentTime : null,
        paused: v ? v.paused : null,
        duration: v ? v.duration : null,
        adShowing: !!(player && player.classList.contains('ad-showing')),
        adInterrupting: !!(player && player.classList.contains('ad-interrupting')),
        enforcement: !!enforcement,
        errorScreen: !!document.querySelector('.ytp-error'),
        readyState: v ? v.readyState : null,
        networkState: v ? v.networkState : null,
        srcSet: v ? !!v.src || !!v.currentSrc : null,
        videoErr: v && v.error ? v.error.code : null,
        gv: (function(){var e=performance.getEntriesByType('resource').filter(function(r){return /googlevideo.com/.test(r.name)}); return {count:e.length, bytes:e.reduce(function(a,b){return a+(b.transferSize||0)},0), zero:e.filter(function(r){return (r.transferSize||0)===0}).length, sample:e.slice(0,2).map(function(r){return r.name.slice(0,90)+' ts='+r.transferSize})};})(),
        mse: (function(){try{return {sb: (window.__fbms&&window.__fbms.length)||0}}catch(e){return null}})(),
        adModules: document.querySelectorAll('.video-ads .ytp-ad-module *').length,
        logCount: log.length,
        logEvents: log.slice(-6).map(e => e.ev),
      };`;
    const a = await rq('POST', `/session/${sid}/execute/sync`, { script: probe, args: [] });
    console.log('\n--- 20s sonra ---');
    console.log(JSON.stringify(a, null, 2));

    await sleep(20000);
    const b = await rq('POST', `/session/${sid}/execute/sync`, { script: probe, args: [] });
    console.log('\n--- 20s sonra ---');
    console.log(JSON.stringify(b, null, 2));

    console.log('\n===== QIYMƏTLƏNDİRMƏ =====');
    const advanced = (b.t0 ?? 0) - (a.t0 ?? 0);
    console.log('video mövcud       :', a.videoVar ? 'BƏLİ' : 'XEYR');
    console.log('currentTime artdı  :', advanced.toFixed(2), 's', advanced > 1 ? 'OK (oynayır)' : 'PROBLEM');
    console.log('paused             :', b.paused);
    console.log('enforcement dialoq :', b.enforcement ? 'VAR — PROBLEM' : 'yoxdur OK');
    console.log('xəta ekranı        :', b.errorScreen ? 'VAR — PROBLEM' : 'yoxdur OK');
    console.log('reklam oynayır     :', b.adShowing ? 'BƏLİ — PROBLEM' : 'xeyr OK');
    console.log('fadblock log sayı  :', b.logCount, b.logEvents.join(','));

    const shot = await rq('GET', `/session/${sid}/screenshot`);
    require('fs').writeFileSync(path.join(ROOT, 'yt-live-test.png'), Buffer.from(shot, 'base64'));
    console.log('screenshot: yt-live-test.png');
  } finally {
    if (sid) await rq('DELETE', `/session/${sid}`).catch(() => {});
    gd.kill();
  }
})().catch(e => { console.error('XƏTA:', e.message); process.exit(1); });
