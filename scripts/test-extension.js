#!/usr/bin/env node
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const http = require('http');
const path = require('path');
const fs   = require('fs');
const { prepareFirefoxPackage } = require('./firefox-package');

const EXT_PATH = path.resolve(__dirname, '..');
const BROWSER  = process.argv[2] || 'all';
const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
const HEAD = '\x1b[36m►\x1b[0m';
const AD_SEL = '.adsbygoogle,ins.adsbygoogle,#taboola-below-article,.advertisement';
const AD_HTML = `<!DOCTYPE html><html><body>
<div class="adsbygoogle" style="width:300px;height:50px;background:red">AD</div>
<ins class="adsbygoogle" style="display:block;background:orange;height:50px">INS</ins>
<div id="taboola-below-article" style="background:yellow;height:40px">TABOOLA</div>
<div class="advertisement" style="background:pink;height:40px">ADVERT</div>
<p id="real-content" style="color:green;font-size:20px">Real content</p>
</body></html>`;

function srv() {
  return new Promise(r => {
    const s = http.createServer((_,res) => { res.writeHead(200,{'Content-Type':'text/html'}); res.end(AD_HTML); });
    s.listen(0,'127.0.0.1',() => r(s));
  });
}
function check(res, label, ok, detail='') {
  res.push(ok);
  console.log(`  ${ok?PASS:FAIL} ${label}${detail?' — '+detail:''}`);
}

async function testChrome() {
  console.log(`\n${HEAD} Chrome\n`);
  const res = [];
  const ctx = await chromium.launchPersistentContext('', {
    headless: false,
    args:[`--disable-extensions-except=${EXT_PATH}`,`--load-extension=${EXT_PATH}`,'--no-sandbox'],
    viewport:{width:1280,height:800},
  });
  await new Promise(r=>setTimeout(r,2000));

  let extId=null;
  for(const sw of ctx.serviceWorkers()){const m=sw.url().match(/chrome-extension:\/\/([^/]+)/);if(m){extId=m[1];break;}}
  check(res,'Extension yükləndi',!!extId, extId?extId.slice(0,12)+'…':'');
  if(!extId){await ctx.close();return res;}

  const popup=await ctx.newPage();
  await popup.goto(`chrome-extension://${extId}/popup/popup.html`);
  await popup.waitForLoadState('networkidle');
  check(res,'Popup başlığı "FAdblock"', await popup.textContent('.logo-text').catch(()=>null)==='FAdblock');
  check(res,'Global toggle',  !!(await popup.$('#globalToggle')));
  check(res,'Sayt toggle',    !!(await popup.$('#siteToggle')));
  check(res,'3 stat kartı',   await popup.$$('.stat-card').then(a=>a.length===3));
  check(res,'Donate düyməsi', !!(await popup.$('#donateBtn')));
  await popup.evaluate(()=>document.getElementById('globalToggle').click());
  await new Promise(r=>setTimeout(r,400));
  check(res,'Global OFF → is-off', ((await popup.getAttribute('#app','class'))||'').includes('is-off'));
  await popup.evaluate(()=>document.getElementById('globalToggle').click());
  await popup.screenshot({path:'/tmp/chrome_01_popup.png'});

  const opt=await ctx.newPage();
  await opt.goto(`chrome-extension://${extId}/options/options.html`);
  await opt.waitForLoadState('networkidle');
  check(res,'Options başlığı',await opt.textContent('h1').catch(()=>null)==='FAdblock');
  check(res,'Attribution: faridasadov',(await opt.textContent('.author-link').catch(()=>'')).includes('faridasadov'));
  check(res,'PayPal URL',(await opt.evaluate(()=>document.getElementById('donateBtn')?.href||'')).includes('paypal.com'));
  await opt.fill('#domainInput','test.az');
  await opt.click('#addDomain');
  await new Promise(r=>setTimeout(r,400));
  check(res,'Whitelist əlavə',await opt.$$('.whitelist li:not(.empty-hint)').then(a=>a.length===1));
  await opt.click('.remove-btn');
  await new Promise(r=>setTimeout(r,300));
  check(res,'Whitelist silmə',await opt.$$('.whitelist li:not(.empty-hint)').then(a=>a.length===0));
  await opt.screenshot({path:'/tmp/chrome_02_options.png',fullPage:true});

  const server=await srv();
  const ap=await ctx.newPage();
  await ap.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded'});
  await new Promise(r=>setTimeout(r,800));
  check(res,'Kosmetik CSS inject',await ap.evaluate(()=>!!document.getElementById('__adblock_pro_css__')));
  const vis=await ap.evaluate(s=>[...document.querySelectorAll(s)].filter(el=>{const c=getComputedStyle(el);return c.display!=='none'&&c.visibility!=='hidden';}).length,AD_SEL);
  const tot=await ap.evaluate(s=>document.querySelectorAll(s).length,AD_SEL);
  check(res,`Reklamlar gizlədildi ${tot-vis}/${tot}`,vis===0,`görünən:${vis}`);
  check(res,'Real content görünür',await ap.evaluate(()=>getComputedStyle(document.getElementById('real-content')).display!=='none'));
  await ap.screenshot({path:'/tmp/chrome_03_cosmetic.png'});
  server.close();

  await ctx.close();
  console.log(`\n  ${res.filter(Boolean).length}/${res.length} test keçdi`);
  return res;
}

async function testFirefox() {
  console.log(`\n${HEAD} Firefox (lint + build + manifest)\n`);
  const res=[];
  const firefoxSource = prepareFirefoxPackage(EXT_PATH);

  try{
    const out=execSync(`npx web-ext lint --source-dir ${firefoxSource} 2>&1`,{encoding:'utf8'});
    const e=(out.match(/errors\s+(\d+)/)||['','0'])[1];
    check(res,'web-ext lint: 0 error',e==='0',`${e} error`);
  }catch(e){check(res,'web-ext lint',false,String(e.stdout||e).slice(0,60));}

  let xpi;
  try{
    const out=execSync(`npx web-ext build --source-dir ${firefoxSource} --artifacts-dir /tmp/fadblock-build --overwrite-dest 2>&1`,{encoding:'utf8'});
    const m=out.match(/Your web extension is ready: (.+\.(?:zip|xpi))/);
    xpi=m?m[1].trim():null;
    check(res,'web-ext build artifact',!!xpi,xpi?path.basename(xpi):'failed');
  }catch(e){check(res,'web-ext build',false,String(e).slice(0,60));}

  const mf=JSON.parse(fs.readFileSync(path.join(firefoxSource,'manifest.json'),'utf8'));
  check(res,'manifest_version:3',           mf.manifest_version===3);
  check(res,'background.service_worker',     mf.background?.service_worker==='background/service-worker.js');
  check(res,'strict_min_version>=128',       parseFloat(mf.browser_specific_settings?.gecko?.strict_min_version||'0')>=128);
  check(res,'gecko id',                      !!mf.browser_specific_settings?.gecko?.id);

  const cs=fs.readFileSync(path.join(EXT_PATH,'content','content.js'),'utf8');
  check(res,'YouTube bypass kodu',           cs.includes('setupYouTubeAdBypass'));
  check(res,'Global state yoxlaması',        cs.includes('adblock_enabled'));

  const rules=JSON.parse(fs.readFileSync(path.join(EXT_PATH,'rules','rules.json'),'utf8'));
  check(res,`rules.json ${rules.length} qayda`, rules.length>=90);

  console.log(`\n  ${res.filter(Boolean).length}/${res.length} test keçdi`);
  if(xpi) console.log(`  Artifact: ${xpi}`);
  return res;
}

(async()=>{
  let cr=[],ff=[];
  if(BROWSER==='chrome'||BROWSER==='all') cr=await testChrome().catch(e=>{console.error(e.message);return[];});
  if(BROWSER==='firefox'||BROWSER==='all') ff=await testFirefox().catch(e=>{console.error(e.message);return[];});
  const total=cr.length+ff.length, passed=[...cr,...ff].filter(Boolean).length;
  console.log(`\n══ Ümumi: ${passed}/${total} ══\n`);
  process.exit(passed===total?0:1);
})();
