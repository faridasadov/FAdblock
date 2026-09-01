#!/usr/bin/env node
'use strict';
const { firefox } = require('playwright');
const path = require('path');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  console.log('=== comss.ru Ad Analysis ===');
  const browser = await firefox.launch({
    headless: false,
    slowMo: 50,
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
    viewport: { width: 1280, height: 900 },
  });

  const adDomains = new Set();
  const adRequests = [];
  const allRequests = [];

  const AD_PATTERNS = [
    /doubleclick\.net/i, /googlesyndication/i, /adservice/i, /adnxs\.com/i,
    /adsystem/i, /adserver/i, /advertising/i, /adfox/i, /yandex\.ru\/an\//i,
    /begun\.ru/i, /ssp\.rambler/i, /ads\.vk\.com/i, /mytarget/i,
    /pagead/i, /banner/i, /sponsor/i, /reklama/i, /reevoo/i,
    /criteo/i, /openx/i, /rubiconproject/i, /pubmatic/i, /appnexus/i,
    /33across/i, /sharethrough/i, /media\.net/i, /taboola/i, /outbrain/i,
    /smartadserver/i, /ad\.mail\.ru/i, /adtech/i, /sizmek/i, /bidswitch/i,
  ];

  context.on('page', (page) => {
    page.on('request', (req) => {
      const url = req.url();
      const isAd = AD_PATTERNS.some(p => p.test(url));
      if (isAd) {
        try {
          const hostname = new URL(url).hostname;
          adDomains.add(hostname);
          adRequests.push({ url: url.slice(0, 120), type: req.resourceType() });
        } catch {}
      }
      allRequests.push(url.slice(0, 80));
    });

    page.on('requestfailed', (req) => {
      const url = req.url();
      if (AD_PATTERNS.some(p => p.test(url))) {
        console.log('  [blocked?]', url.slice(0, 80));
      }
    });
  });

  const page = await context.newPage();
  console.log('\nLoading comss.ru...');
  try {
    await page.goto('https://www.comss.ru/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (e) {
    console.log('goto error:', e.message.slice(0, 60));
  }

  await sleep(5000);

  // Find visible ad elements
  const adElements = await page.evaluate(() => {
    const iframes = Array.from(document.querySelectorAll('iframe')).map(f => ({
      src: f.src || f.getAttribute('data-src') || '',
      id: f.id,
      className: f.className,
      w: f.offsetWidth,
      h: f.offsetHeight,
    })).filter(f => f.w > 0 && f.h > 0);

    const imgs = Array.from(document.querySelectorAll('img[data-src],img[src]')).filter(img => {
      const src = img.src || img.dataset.src || '';
      return /ad|banner|promo/i.test(src) && img.offsetWidth > 100;
    }).map(img => ({ src: (img.src || img.dataset.src).slice(0, 80), w: img.offsetWidth, h: img.offsetHeight }));

    const adContainers = Array.from(document.querySelectorAll('[id*="ad"],[id*="banner"],[class*="ad"],[class*="banner"],[data-ad]'))
      .filter(el => el.offsetWidth > 50 && el.offsetHeight > 20)
      .map(el => ({ tag: el.tagName, id: el.id, cls: el.className.slice(0, 60), w: el.offsetWidth, h: el.offsetHeight }))
      .slice(0, 20);

    return { iframes, imgs, adContainers };
  });

  console.log('\n=== VISIBLE IFRAMES ===');
  adElements.iframes.forEach(f => console.log(`  ${f.w}x${f.h}  src:${f.src.slice(0, 80)}`));

  console.log('\n=== AD-RELATED ELEMENTS ===');
  adElements.adContainers.forEach(el => console.log(`  <${el.tag} id="${el.id}" class="${el.cls}"> ${el.w}x${el.h}`));

  console.log('\n=== AD NETWORK REQUESTS ===');
  if (adDomains.size === 0) {
    console.log('  No known ad network requests detected');
  } else {
    adDomains.forEach(d => console.log('  Domain:', d));
    console.log('\nSample ad requests:');
    adRequests.slice(0, 15).forEach(r => console.log(`  [${r.type}] ${r.url}`));
  }

  // Take screenshot
  const ssPath = path.join(__dirname, '..', 'comss-test.png');
  await page.screenshot({ path: ssPath, fullPage: false });
  console.log('\nScreenshot saved:', ssPath);

  // Also check page source for ad scripts
  const pageContent = await page.content();
  const adScriptMatches = [];
  const scriptRe = /<script[^>]*src=['"]([^'"]+)['"]/gi;
  let m;
  while ((m = scriptRe.exec(pageContent)) !== null) {
    const src = m[1];
    if (AD_PATTERNS.some(p => p.test(src))) {
      adScriptMatches.push(src.slice(0, 100));
    }
  }
  if (adScriptMatches.length) {
    console.log('\n=== AD SCRIPTS IN PAGE SOURCE ===');
    adScriptMatches.forEach(s => console.log(' ', s));
  }

  // Check all unique hostnames from requests
  const allHosts = [...new Set(allRequests.map(u => { try { return new URL(u).hostname; } catch { return ''; } }).filter(Boolean))];
  console.log('\n=== ALL UNIQUE HOSTS (sorted) ===');
  allHosts.sort().forEach(h => console.log(' ', h));

  await sleep(3000);
  await browser.close();
})().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
