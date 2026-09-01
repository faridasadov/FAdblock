#!/usr/bin/env node
'use strict';
// Hansı content script videonu dayandırır? Staged kopyadan bir-bir çıxarıb ölçürük.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run(label, dropScripts, port) {
  const BASE = `http://127.0.0.1:${port}`;
  async function rq(m, u, b) {
    const res = await fetch(BASE + u, { method: m, headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined });
    const j = await res.json().catch(() => ({}));
    if (j.value && j.value.error) throw new Error(j.value.error + ': ' + j.value.message);
    return j.value;
  }
  const { prepareFirefoxPackage } = require('./firefox-package');
  const stage = prepareFirefoxPackage(ROOT);
  if (dropScripts.length) {
    const mp = path.join(stage, 'manifest.json');
    const m = JSON.parse(fs.readFileSync(mp, 'utf8'));
    m.content_scripts = m.content_scripts.filter(e =>
      !(e.js || []).some(js => dropScripts.some(d => js.endsWith(d))));
    fs.writeFileSync(mp, JSON.stringify(m, null, 2) + '\n');
  }
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
               readyState: v?v.readyState:null, t: v?v.currentTime:null, paused: v?v.paused:null };`, args: [] });
    const playing = r.gv > 0 && r.readyState >= 2;
    console.log(` ${playing ? 'OYNAYIR ' : 'DAYANIB '} ${label.padEnd(34)} gv=${String(r.gv).padEnd(3)} readyState=${r.readyState} t=${(r.t||0).toFixed(1)}`);
    return playing;
  } finally { if (sid) await rq('DELETE', `/session/${sid}`).catch(()=>{}); gd.kill(); }
}

(async () => {
  console.log('=== BISECT: hansı skript videonu dayandırır? ===');
  await run('TAM extension (hamısı)', [], 4481);
  await run('bridge YOX', ['youtube-firefox-bridge.js'], 4482);
  await run('inject-v2 YOX', ['youtube-inject-v2.js'], 4483);
  await run('content.js YOX', ['content/content.js'], 4484);
  await run('hər üç YT skripti YOX', ['youtube-firefox-bridge.js','youtube-inject-v2.js','content/content.js'], 4485);
})().catch(e => { console.error('XETA:', e.message); process.exit(1); });
