#!/usr/bin/env node
'use strict';
// ytInitialPlayerResponse.streamingData extension İLƏ və EXTENSION-SİZ müqayisəsi.
const { spawn } = require('child_process');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run(withExt, port) {
  const BASE = `http://127.0.0.1:${port}`;
  async function rq(m, u, b) {
    const res = await fetch(BASE + u, { method: m, headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined });
    const j = await res.json().catch(() => ({}));
    if (j.value && j.value.error) throw new Error(j.value.error + ': ' + j.value.message);
    return j.value;
  }
  const gd = spawn(path.join(ROOT, 'geckodriver.exe'), ['--port', String(port)], { stdio: 'ignore' });
  await sleep(2500);
  let sid;
  try {
    const s = await rq('POST', '/session', { capabilities: { alwaysMatch: {
      browserName: 'firefox', pageLoadStrategy: 'eager', timeouts: { pageLoad: 60000, script: 30000 },
      'moz:firefoxOptions': { prefs: { 'media.autoplay.default': 0, 'media.autoplay.blocking_policy': 0 } } } } });
    sid = s.sessionId;
    if (withExt) {
      const { prepareFirefoxPackage } = require('./firefox-package');
      await rq('POST', `/session/${sid}/moz/addon/install`, { path: prepareFirefoxPackage(ROOT), temporary: true });
      await sleep(7000);
    }
    await rq('POST', `/session/${sid}/url`, { url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ' });
    await sleep(16000);
    const probe = `
      const w = window.wrappedJSObject || window;
      const pr = w.ytInitialPlayerResponse;
      const sd = pr && pr.streamingData;
      const v = document.querySelector('video');
      return {
        hasPlayerResponse: !!pr,
        playability: pr && pr.playabilityStatus ? pr.playabilityStatus.status : null,
        reason: pr && pr.playabilityStatus ? (pr.playabilityStatus.reason || '') : null,
        hasStreamingData: !!sd,
        formats: sd && sd.formats ? sd.formats.length : 0,
        adaptive: sd && sd.adaptiveFormats ? sd.adaptiveFormats.length : 0,
        hlsOrDash: !!(sd && (sd.hlsManifestUrl || sd.dashManifestUrl)),
        firstUrlPresent: !!(sd && sd.adaptiveFormats && sd.adaptiveFormats[0] && (sd.adaptiveFormats[0].url || sd.adaptiveFormats[0].signatureCipher)),
        gvRequests: performance.getEntriesByType('resource').filter(r=>/googlevideo/.test(r.name)).length,
        readyState: v?v.readyState:null, t: v?v.currentTime:null };`;
    return await rq('POST', `/session/${sid}/execute/sync`, { script: probe, args: [] });
  } finally { if (sid) await rq('DELETE', `/session/${sid}`).catch(()=>{}); gd.kill(); }
}

(async () => {
  console.log('=== EXTENSION YOXDUR ===');
  const base = await run(false, 4477);
  console.log(JSON.stringify(base, null, 1));
  console.log('\n=== EXTENSION VAR ===');
  const ext = await run(true, 4478);
  console.log(JSON.stringify(ext, null, 1));
  console.log('\n===== FERQ =====');
  for (const k of Object.keys(base)) {
    if (JSON.stringify(base[k]) !== JSON.stringify(ext[k])) console.log(` ${k}: baseline=${JSON.stringify(base[k])}  ext=${JSON.stringify(ext[k])}`);
  }
})().catch(e => { console.error('XETA:', e.message); process.exit(1); });
