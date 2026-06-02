#!/usr/bin/env node
const { chromium } = require('playwright');
const path = require('path');

const EXT_PATH = path.resolve(__dirname, '..');
const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
const results = [];

function check(label, passed, detail = '') {
  results.push({ label, passed, detail });
  console.log(`${passed ? PASS : FAIL} ${label}${detail ? ' — ' + detail : ''}`);
}

async function getExtId(ctx) {
  for (const sw of ctx.serviceWorkers()) {
    const m = sw.url().match(/chrome-extension:\/\/([^/]+)/);
    if (m) return m[1];
  }
  return null;
}

const http = require('http');

const AD_TEST_HTML_BODY = `<!DOCTYPE html><html><body>
<h1>Test Page</h1>
<div class="adsbygoogle" style="width:300px;height:50px;background:red">GOOGLE AD</div>
<ins class="adsbygoogle" style="display:block;width:300px;height:90px;background:orange">INS AD</ins>
<div id="taboola-below-article" style="background:yellow;height:40px">TABOOLA</div>
<div class="advertisement" style="background:pink;height:40px">ADVERTISEMENT</div>
<p id="real-content" style="color:green;font-size:20px">Real content visible</p>
</body></html>`;

function startServer() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(AD_TEST_HTML_BODY);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

async function main() {
  const ctx = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
    viewport: { width: 1280, height: 800 },
  });

  await new Promise(r => setTimeout(r, 2000));

  // 1. Extension loads
  const extId = await getExtId(ctx);
  check('Extension yükləndi', !!extId, extId || 'ID tapılmadı');

  if (!extId) { await ctx.close(); return; }

  // 2. Popup opens
  const popupPage = await ctx.newPage();
  await popupPage.goto(`chrome-extension://${extId}/popup/popup.html`);
  await popupPage.waitForLoadState('networkidle');
  const popupTitle = await popupPage.textContent('.logo-text').catch(() => null);
  check('Popup açıldı', popupTitle === 'FAdblock', `başlıq: "${popupTitle}"`);
  check('Toggle mövcuddur', await popupPage.$('#siteToggle').then(Boolean), '');
  check('3 statistika kartı var', await popupPage.$$('.stat-card').then(a => a.length === 3), '');
  await popupPage.screenshot({ path: '/tmp/test_01_popup.png' });

  // 3. Options page opens
  const optPage = await ctx.newPage();
  await optPage.goto(`chrome-extension://${extId}/options/options.html`);
  await optPage.waitForLoadState('networkidle');
  const optTitle = await optPage.textContent('h1').catch(() => null);
  check('Options açıldı', optTitle === 'FAdblock', `başlıq: "${optTitle}"`);
  check('Whitelist input mövcuddur', await optPage.$('#domainInput').then(Boolean), '');
  await optPage.screenshot({ path: '/tmp/test_02_options.png', fullPage: true });

  // 4. Whitelist add/remove
  await optPage.fill('#domainInput', 'testsite.com');
  await optPage.click('#addDomain');
  await new Promise(r => setTimeout(r, 500));
  const whitelistItems = await optPage.$$('.whitelist li:not(.empty-hint)');
  check('Whitelist əlavə işləyir', whitelistItems.length === 1, `${whitelistItems.length} item`);
  if (whitelistItems.length > 0) {
    await optPage.click('.remove-btn');
    await new Promise(r => setTimeout(r, 300));
    const afterRemove = await optPage.$$('.whitelist li:not(.empty-hint)');
    check('Whitelist silmə işləyir', afterRemove.length === 0, '');
  }
  await optPage.screenshot({ path: '/tmp/test_03_whitelist.png', fullPage: true });

  // 5. Cosmetic filter test — real HTTP page (content scripts don't run on data: URLs)
  const srv = await startServer();
  const port = srv.address().port;
  const testUrl = `http://127.0.0.1:${port}/test`;

  const adPage = await ctx.newPage();
  await adPage.goto(testUrl, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1000));

  const cosmeticStyleInjected = await adPage.evaluate(() =>
    !!document.getElementById('__adblock_pro_css__')
  );
  const AD_SELECTORS = '.adsbygoogle, ins.adsbygoogle, #taboola-below-article, .advertisement';
  const adsFound = await adPage.evaluate(sel =>
    document.querySelectorAll(sel).length, AD_SELECTORS
  );
  const adsVisible = await adPage.evaluate(sel =>
    Array.from(document.querySelectorAll(sel))
      .filter(el => {
        const s = getComputedStyle(el);
        return s.display !== 'none' && s.visibility !== 'hidden';
      }).length, AD_SELECTORS
  );
  const realContent = await adPage.evaluate(() =>
    getComputedStyle(document.getElementById('real-content')).display !== 'none'
  );

  check('Kosmetik CSS inject edildi', cosmeticStyleInjected, '');
  check(`Ad elementlər tapıldı (${adsFound})`, adsFound > 0, '');
  check(`Reklamlar gizlədildi (${adsFound - adsVisible}/${adsFound})`, adsVisible === 0, `görünən: ${adsVisible}`);
  check('Real content görünür', realContent, '');
  await adPage.screenshot({ path: '/tmp/test_04_cosmetic.png' });
  srv.close();

  // 6. Stats reset
  await optPage.bringToFront();
  await optPage.click('#resetStats');
  await new Promise(r => setTimeout(r, 300));
  const totalAfterReset = await optPage.textContent('#totalBlocked');
  check('Statistika sıfırlandı', totalAfterReset.trim() === '0', `dəyər: "${totalAfterReset.trim()}"`);

  // Summary
  console.log('\n── Xülasə ──────────────────');
  const passed = results.filter(r => r.passed).length;
  console.log(`${passed}/${results.length} test keçdi`);

  await ctx.close();
}

main().catch(e => { console.error(e); process.exit(1); });
