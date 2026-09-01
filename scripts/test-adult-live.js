#!/usr/bin/env node
'use strict';
// Adult filter-i real Firefox-da HƏQİQƏTƏN açıb yanlış müsbətləri yoxlayır.
// geckodriver moz-extension:// naviqasiyasını bloklayır, ona görə YALNIZ müvəqqəti
// staged kopyaya kiçik test körpüsü əlavə olunur — mənbə kodu toxunulmur.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const PORT = 4455;
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function rq(method, url, body) {
  const res = await fetch(BASE + url, {
    method, headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await res.json().catch(() => ({}));
  if (j.value && j.value.error) throw new Error(j.value.error + ': ' + j.value.message);
  return j.value;
}
const exec = (sid, script) => rq('POST', `/session/${sid}/execute/async`, { script, args: [] });

function addTestBridge(stageDir) {
  fs.writeFileSync(path.join(stageDir, 'content', 'test-bridge.js'), `
// TEST-ONLY bridge (staged copy only, never shipped)
window.addEventListener('message', (e) => {
  if (!e.data || e.data.__fbtest !== 'req') return;
  const reply = (payload) => window.postMessage({ __fbtest: 'res', id: e.data.id, payload }, '*');
  if (e.data.kind === 'msg') {
    chrome.runtime.sendMessage(e.data.message, (r) => reply(r));
  }
});
`);
  const mp = path.join(stageDir, 'manifest.json');
  const m = JSON.parse(fs.readFileSync(mp, 'utf8'));
  m.content_scripts.push({
    matches: ['*://example.com/*'],
    js: ['content/test-bridge.js'],
    run_at: 'document_idle',
    all_frames: false,
  });
  fs.writeFileSync(mp, JSON.stringify(m, null, 2) + '\n');
}

const call = (payload) => `const cb=arguments[arguments.length-1];
  const id=Math.random().toString(36).slice(2);
  const h=(e)=>{ if(e.data&&e.data.__fbtest==='res'&&e.data.id===id){window.removeEventListener('message',h);cb(e.data.payload);} };
  window.addEventListener('message',h);
  window.postMessage(Object.assign({__fbtest:'req',id:id}, ${JSON.stringify(payload)}), '*');`;

(async () => {
  const { prepareFirefoxPackage } = require('./firefox-package');
  const stageDir = prepareFirefoxPackage(ROOT);
  addTestBridge(stageDir);

  const gd = spawn(path.join(ROOT, 'geckodriver.exe'), ['--port', String(PORT)], { stdio: 'ignore' });
  await sleep(2500);
  let sid;
  try {
    const s = await rq('POST', '/session', { capabilities: { alwaysMatch: {
      browserName: 'firefox', pageLoadStrategy: 'eager',
      timeouts: { pageLoad: 30000, script: 90000 } } } });
    sid = s.sessionId;
    await rq('POST', `/session/${sid}/moz/addon/install`, { path: stageDir, temporary: true });
    console.log('[adult] quraşdırıldı, filter siyahısı gözlənilir…');
    await sleep(12000);
    await rq('POST', `/session/${sid}/url`, { url: 'https://example.com' });
    await sleep(2000);


    await exec(sid, call({ kind: 'msg', message: { type: 'SET_ADULT_FILTER', enabled: true } }));
    console.log('[adult] SET_ADULT_FILTER=true göndərildi, siyahı endirilir…');
    await sleep(30000);

    const meta = await exec(sid, call({ kind:'msg', message:{ type:'GET_ADULT_META' } }));
    const en = await exec(sid, call({ kind:'msg', message:{ type:'GET_ADULT_FILTER' } }));
    console.log('[adult] filter aciq?', en && en.enabled, '| endirilmis domen:', meta && meta.meta ? meta.meta.count : 'yox');

    const cases = [
      ['ingosstrah.ru', 'https://www.ingosstrah.ru/favicon.ico', true],
      ['strahovka.ru',  'https://strahovka.ru/favicon.ico',      true],
      ['nsfwjs.com',    'https://nsfwjs.com/favicon.ico',        true],
      ['pornhub.com',   'https://www.pornhub.com/favicon.ico',   false],
      ['xvideos.com',   'https://www.xvideos.com/favicon.ico',   false],
    ];
    console.log('\n--- yanlış müsbət / real bloklama ---');
    let fail = 0;
    for (const [name, url, shouldOpen] of cases) {
      const r = await exec(sid, `const cb=arguments[arguments.length-1];
        fetch(${JSON.stringify(url)},{mode:'no-cors',cache:'no-store'})
          .then(()=>cb('ACILDI')).catch(()=>cb('BLOKLANDI'));`);
      const ok = shouldOpen === (r === 'ACILDI');
      if (!ok) fail++;
      console.log(` ${ok ? 'OK  ' : 'XETA'} ${name.padEnd(15)} ${r.padEnd(10)} (gözlənilən: ${shouldOpen ? 'AÇILMALI' : 'BLOKLANMALI'})`);
    }
    console.log(fail ? `\n${fail} TEST UĞURSUZ` : '\nBÜTÜN TESTLƏR KEÇDİ');
  } finally {
    if (sid) await rq('DELETE', `/session/${sid}`).catch(() => {});
    gd.kill();
  }
})().catch(e => { console.error('XETA:', e.message); process.exit(1); });
