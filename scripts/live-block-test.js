#!/usr/bin/env node
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const results = [];
const PAGE = `<!doctype html><meta charset=utf-8><title>fadblock probe</title>
<h1>probe</h1><div id=out>running…</div>
<div class="ad-container" style="width:300px;height:250px"><iframe src="about:blank"></iframe></div>
<ins class="adsbygoogle" style="display:block;width:300px;height:250px"></ins>
<script>
const targets = [
 'https://adriver.ru/x.js',
 'https://yabs.yandex.ru/x.js',
 'https://directadvert.ru/x.js',
 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js',
 'https://googlesyndication.com/x.js',
 'https://tpc.googlesyndication.com/simgad/1',
 'https://pagead2.googlesyndication.com/x.js',
 'https://static.doubleclick.net/instream/ad_status.js',
 'https://an.yandex.ru/system/context.js',
 'https://ingosstrah.ru/favicon.ico',
 'https://example.com/favicon.ico'
];
(async () => {
  const out = [];
  function loadScript(u){return new Promise(r=>{const s=document.createElement('script');s.src=u;s.onload=()=>r('LOADED');s.onerror=()=>r('BLOCKED');document.head.appendChild(s);setTimeout(()=>r('TIMEOUT'),8000);});}
  await new Promise(r=>setTimeout(r,15000)); // dinamik qaydalarin qurulmasini gozle
  for (const t of targets) {
    const v = await loadScript(t);
    const e = performance.getEntriesByName(t)[0];
    out.push(t+' => '+v+' (transferSize='+(e?e.transferSize:'n/a')+', dur='+(e?Math.round(e.duration):'n/a')+')');
  }
  const cosmetic = {
    adsbygoogle: getComputedStyle(document.querySelector('ins.adsbygoogle')).display,
    adContainer: getComputedStyle(document.querySelector('.ad-container')).display
  };
  document.getElementById('out').textContent = 'done';
  await fetch('http://localhost:4318/result', {method:'POST', body: JSON.stringify({out, cosmetic})});
})();
</script>`;

const pageSrv = http.createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end(PAGE);});
const sink = http.createServer((req,res)=>{
  let b='';req.on('data',d=>b+=d);req.on('end',()=>{results.push(b);res.writeHead(200,{'access-control-allow-origin':'*'});res.end('ok');});
});

(async () => {
  await new Promise(r=>pageSrv.listen(4319,'127.0.0.1',r));
  await new Promise(r=>sink.listen(4318,'127.0.0.1',r));

  const { prepareFirefoxPackage } = require('./firefox-package');
  const stageDir = prepareFirefoxPackage(ROOT);
  const NOEXT = process.env.NOEXT === '1';

  const args = NOEXT
    ? ['web-ext','run','--source-dir', require('path').join(ROOT,'scripts','empty-ext'),'--start-url','http://localhost:4319/','--no-reload']
    : ['web-ext','run','--source-dir',stageDir,'--start-url','http://localhost:4319/','--no-reload'];
  const proc = spawn('npx', args,
    {cwd:ROOT,shell:true,stdio:['ignore','pipe','pipe']});
  proc.stdout.on('data',d=>process.stdout.write('[webext] '+d));

  const deadline = Date.now()+120000;
  while (!results.length && Date.now()<deadline) await new Promise(r=>setTimeout(r,1000));

  console.log('\n===== EXTENSION AKTİV =====');
  if (!results.length) console.log('nəticə gəlmədi (timeout)');
  else console.log(JSON.stringify(JSON.parse(results[0]),null,2));

  try{proc.kill('SIGTERM');}catch{}
  pageSrv.close(); sink.close();
  setTimeout(()=>process.exit(0),1000);
})().catch(e=>{console.error(e);process.exit(1);});
