#!/usr/bin/env node
'use strict';
// EXTENSION-SİZ baseline: video oynayırmı, #error-screen normal səhifədə varmı?
const { spawn } = require('child_process');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const PORT = 4466, BASE = `http://127.0.0.1:${PORT}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function rq(m, u, b) {
  const res = await fetch(BASE + u, { method: m, headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined });
  const j = await res.json().catch(() => ({}));
  if (j.value && j.value.error) throw new Error(j.value.error + ': ' + j.value.message);
  return j.value;
}
(async () => {
  const gd = spawn(path.join(ROOT, 'geckodriver.exe'), ['--port', String(PORT)], { stdio: 'ignore' });
  await sleep(2500);
  let sid;
  try {
    const s = await rq('POST', '/session', { capabilities: { alwaysMatch: {
      browserName: 'firefox', pageLoadStrategy: 'eager', timeouts: { pageLoad: 60000, script: 30000 },
      'moz:firefoxOptions': { prefs: { 'media.autoplay.default': 0, 'media.autoplay.blocking_policy': 0 } } } } });
    sid = s.sessionId;
    console.log('[base] EXTENSION YOXDUR');
    await rq('POST', `/session/${sid}/url`, { url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ' });
    await sleep(14000);
    const probe = `
      const v = document.querySelector('#movie_player video, video');
      return {
        errorScreenCount: document.querySelectorAll('#error-screen').length,
        enforcementCount: document.querySelectorAll('ytd-enforcement-message-view-model').length,
        playabilityCount: document.querySelectorAll('yt-playability-error-supported-renderers').length,
        unstartedMode: !!document.querySelector('#movie_player.unstarted-mode'),
        videoVar: !!v, t: v?v.currentTime:null, paused: v?v.paused:null,
        readyState: v?v.readyState:null, networkState: v?v.networkState:null,
        srcSet: v?(!!v.src||!!v.currentSrc):null, duration: v?v.duration:null };`;
    const a = await rq('POST', `/session/${sid}/execute/sync`, { script: probe, args: [] });
    await sleep(8000);
    const b = await rq('POST', `/session/${sid}/execute/sync`, { script: probe, args: [] });
    console.log('t=14s:', JSON.stringify(a));
    console.log('t=22s:', JSON.stringify(b));
    console.log('\n===== BASELINE =====');
    console.log('#error-screen normal səhifədə var?:', b.errorScreenCount, b.errorScreenCount > 0 ? '<-- HƏMİŞƏ VAR (selektor yanlışdır!)' : '');
    console.log('həqiqi enforcement elementi     :', b.enforcementCount + b.playabilityCount);
    console.log('video oynayır (t artdı)         :', ((b.t||0)-(a.t||0)).toFixed(2), 's');
    console.log('srcSet / readyState             :', b.srcSet, '/', b.readyState);
    const shot = await rq('GET', `/session/${sid}/screenshot`);
    require('fs').writeFileSync(path.join(ROOT, 'yt-baseline.png'), Buffer.from(shot, 'base64'));
  } finally { if (sid) await rq('DELETE', `/session/${sid}`).catch(()=>{}); gd.kill(); }
})().catch(e => { console.error('XETA:', e.message); process.exit(1); });
