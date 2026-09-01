#!/usr/bin/env node
'use strict';
// YouTube ARXA FONDA olanda nə baş verir? (video davam edirmi, döngə varmı)
const { spawn } = require('child_process');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const WITH_EXT = process.env.NOEXT !== '1';
const PORT = WITH_EXT ? 4499 : 4500, BASE = `http://127.0.0.1:${PORT}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function rq(m, u, b) {
  const res = await fetch(BASE + u, { method: m, headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined });
  const j = await res.json().catch(() => ({}));
  if (j.value && j.value.error) throw new Error(j.value.error + ': ' + j.value.message);
  return j.value;
}
const PROBE = `const v=document.querySelector('video');
  let log=[]; try{log=JSON.parse(sessionStorage.getItem('fadblock_log')||'[]')}catch(e){}
  return { t: v?v.currentTime:null, paused: v?v.paused:null, rs: v?v.readyState:null,
           gv: performance.getEntriesByType('resource').filter(r=>/googlevideo/.test(r.name)).length,
           logCount: log.length,
           reloads: log.filter(e=>e.ev==='ff_play_triggered'||e.ev==='enforcement_cleared').length,
           errorScreen: document.querySelectorAll('#error-screen').length,
           hidden: document.hidden, lastEvents: log.slice(-5).map(e=>e.ev+(e.d&&e.d.method?(":"+e.d.method):"")) };`;

(async () => {
  const { prepareFirefoxPackage } = require('./firefox-package');
  const stage = prepareFirefoxPackage(ROOT);
  const gd = spawn(path.join(ROOT, 'geckodriver.exe'), ['--port', String(PORT)], { stdio: 'ignore' });
  await sleep(2500);
  let sid;
  try {
    const s = await rq('POST', '/session', { capabilities: { alwaysMatch: {
      browserName: 'firefox', pageLoadStrategy: 'eager', timeouts: { pageLoad: 60000, script: 30000 },
      'moz:firefoxOptions': { prefs: { 'media.autoplay.default': 0, 'media.autoplay.blocking_policy': 0 } } } } });
    sid = s.sessionId;
    if (WITH_EXT) { await rq('POST', `/session/${sid}/moz/addon/install`, { path: stage, temporary: true }); await sleep(7000); }
    else console.log('*** EXTENSION YOXDUR (baseline) ***');
    await rq('POST', `/session/${sid}/url`, { url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ' });
    await sleep(15000);
    const ytHandle = await rq('GET', `/session/${sid}/window`);
    const a = await rq('POST', `/session/${sid}/execute/sync`, { script: PROBE, args: [] });
    console.log('ÖN PLAN      :', JSON.stringify(a));

    // yeni tab aç -> YouTube arxa fona düşür
    const nt = await rq('POST', `/session/${sid}/window/new`, { type: 'tab' });
    await rq('POST', `/session/${sid}/window`, { handle: nt.handle });
    await rq('POST', `/session/${sid}/url`, { url: 'https://example.com' });
    console.log('… YouTube 40 saniyə ARXA FONDA …');
    await sleep(40000);

    await rq('POST', `/session/${sid}/window`, { handle: ytHandle });
    const b = await rq('POST', `/session/${sid}/execute/sync`, { script: PROBE, args: [] });
    console.log('ARXA FONDAN SONRA:', JSON.stringify(b));

    await sleep(10000);
    const c = await rq('POST', `/session/${sid}/execute/sync`, { script: PROBE, args: [] });
    console.log('QAYITDIQDAN 10s  :', JSON.stringify(c));

    console.log('\n===== ARXA FON QİYMƏTLƏNDİRMƏSİ =====');
    console.log('arxa fonda video irəlilədi :', (b.t - a.t).toFixed(1), 's  (40s ərzində)');
    console.log('qayıtdıqdan sonra irəlilədi:', (c.t - b.t).toFixed(1), 's  (10s ərzində)', (c.t - b.t) > 5 ? 'OK' : 'PROBLEM');
    console.log('log artımı (döngə əlaməti) :', a.logCount, '->', b.logCount, '->', c.logCount);
    console.log('enforcement/reload sayı    :', a.reloads, '->', b.reloads, '->', c.reloads, c.reloads > 3 ? '<-- DÖNGƏ VAR' : 'OK');
    console.log('video vəziyyəti            :', 'paused=' + c.paused, 'readyState=' + c.rs);
  } finally { if (sid) await rq('DELETE', `/session/${sid}`).catch(()=>{}); gd.kill(); }
})().catch(e => { console.error('XETA:', e.message); process.exit(1); });
