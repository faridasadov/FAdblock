#!/usr/bin/env node
'use strict';
// Körpünün HANSI hissəsi videonu dayandırır?
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run(label, mutate, port) {
  const BASE = `http://127.0.0.1:${port}`;
  async function rq(m, u, b) {
    const res = await fetch(BASE + u, { method: m, headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined });
    const j = await res.json().catch(() => ({}));
    if (j.value && j.value.error) throw new Error(j.value.error + ': ' + j.value.message);
    return j.value;
  }
  const { prepareFirefoxPackage } = require('./firefox-package');
  const stage = prepareFirefoxPackage(ROOT);
  const bp = path.join(stage, 'content', 'youtube-firefox-bridge.js');
  fs.writeFileSync(bp, mutate(fs.readFileSync(bp, 'utf8')));
  const gd = spawn(path.join(ROOT, 'geckodriver.exe'), ['--port', String(port)], { stdio: 'ignore' });
  await sleep(2500);
  let sid;
  try {
    const s = await rq('POST', '/session', { capabilities: { alwaysMatch: {
      browserName: 'firefox', pageLoadStrategy: 'eager', timeouts: { pageLoad: 60000, script: 30000 },
      'moz:firefoxOptions': { prefs: { 'media.autoplay.default': 0, 'media.autoplay.blocking_policy': 0 } } } } });
    sid = s.sessionId;
    await rq('POST', `/session/${sid}/moz/addon/install`, { path: stage, temporary: true });
    await sleep(7000);
    await rq('POST', `/session/${sid}/url`, { url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ' });
    await sleep(16000);
    const r = await rq('POST', `/session/${sid}/execute/sync`, { script: `
      const v=document.querySelector('video');
      return { gv: performance.getEntriesByType('resource').filter(r=>/googlevideo/.test(r.name)).length,
               readyState: v?v.readyState:null, t: v?v.currentTime:null };`, args: [] });
    console.log(` ${(r.gv>0&&r.readyState>=2) ? 'OYNAYIR ' : 'DAYANIB '} ${label.padEnd(32)} gv=${String(r.gv).padEnd(3)} rs=${r.readyState} t=${(r.t||0).toFixed(1)}`);
  } finally { if (sid) await rq('DELETE', `/session/${sid}`).catch(()=>{}); gd.kill(); }
}

const noAdStatus = s => s.replace(/Object\.defineProperty\(pw, 'google_ad_status'[\s\S]*?\}\);/, '/*disabled*/');
const noInject   = s => s.replace('if (!pw.__fadblockPlayerFixActive && !pw.__fadblockYoutubePruneActive) {', 'if (false) {');
const noSW       = s => s.replace(/unregisterSW\(\);\s*\n\s*document\.addEventListener\('yt-navigate-start',unregisterSW\);\s*\n\s*document\.addEventListener\('yt-navigate-finish',unregisterSW\);/, '');
const noGoogletag= s => s.replace(/if \(!pw\.googletag\) \{/, 'if (false) {');

(async () => {
  console.log('=== KÖRPÜ DAXİLİ BISECT ===');
  await run('dəyişməz (kontrol)',      s => s,          4491);
  await run('google_ad_status YOX',    noAdStatus,      4492);
  await run('MAIN inject YOX',         noInject,        4493);
  await run('unregisterSW YOX',        noSW,            4494);
  await run('googletag stub YOX',      noGoogletag,     4495);
})().catch(e => { console.error('XETA:', e.message); process.exit(1); });
