#!/usr/bin/env node
'use strict';
const { firefox } = require('playwright');
const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Load DNR rules and convert to route patterns
const rules = JSON.parse(fs.readFileSync(path.join(ROOT, 'rules', 'rules.json'), 'utf8'));

// Convert urlFilter to a URL pattern test function
function makeUrlTest(rule) {
  if (rule.condition.regexFilter) {
    const re = new RegExp(rule.condition.regexFilter, 'i');
    return url => re.test(url);
  }
  if (rule.condition.urlFilter) {
    // Simple conversion: || = domain anchor, * = wildcard, ^ = separator
    let pattern = rule.condition.urlFilter
      .replace(/\|\|/, '')  // remove domain anchor
      .replace(/\^/g, '')   // remove separator
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*');
    const re = new RegExp(pattern, 'i');
    return url => re.test(url);
  }
  return () => false;
}

const BLOCK_TESTS = rules
  .filter(r => r.action?.type === 'block')
  .map(r => ({ id: r.id, test: makeUrlTest(r), filter: r.condition.urlFilter || r.condition.regexFilter }));

(async () => {
  console.log('=== comss.ru WITH DNR RULES SIMULATION ===');
  console.log('Block rules loaded:', BLOCK_TESTS.length);

  const browser = await firefox.launch({ headless: false, slowMo: 20 });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
    viewport: { width: 1280, height: 900 },
  });

  const blockedUrls = [];

  // Simulate DNR rules via page.route
  await context.route('**/*', (route) => {
    const url = route.request().url();
    const matched = BLOCK_TESTS.find(r => r.test(url));
    if (matched) {
      blockedUrls.push({ url: url.slice(0, 100), rule: matched.id });
      route.abort('blockedbyclient');
    } else {
      route.continue();
    }
  });

  const page = await context.newPage();

  console.log('\nLoading comss.ru WITH rules active…');
  try {
    await page.goto('https://www.comss.ru/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (e) { console.log('  goto error:', e.message.slice(0,60)); }
  await sleep(5000);

  // Screenshot WITH rules
  const ssWithRules = path.join(ROOT, 'ss-comss-with-rules.png');
  await page.screenshot({ path: ssWithRules, fullPage: false });

  const state = await page.evaluate(() => {
    const iframes = Array.from(document.querySelectorAll('iframe'))
      .filter(f => f.offsetWidth > 50 && f.offsetHeight > 50)
      .map(f => ({ src: f.src.slice(0, 80) || '(no src)', w: f.offsetWidth, h: f.offsetHeight }));

    // Check for visible ad content
    const allText = document.body?.innerText || '';
    const hasReklama = allText.includes('РЕКЛАМА') || allText.includes('реклама') || allText.includes('Реклама');

    // Check for Yandex ad containers
    const yandexEls = Array.from(document.querySelectorAll('*')).filter(el => {
      const id = el.id || '';
      const cls = el.className || '';
      return (id.includes('Ya') || id.includes('yandex') || cls.includes('yandex')) && el.offsetWidth > 50;
    }).map(el => ({ tag: el.tagName, id: el.id.slice(0,30), cls: String(el.className).slice(0,30) }));

    return { iframes, hasReklama, yandexEls: yandexEls.slice(0,5) };
  });

  console.log('\n=== RESULTS ===');
  console.log('iframes visible:', state.iframes.length, state.iframes.map(f => `${f.w}x${f.h} ${f.src}`).join(', '));
  console.log('РЕКЛАМА text visible:', state.hasReklama ? '❌ AD SHOWING' : '✅ NO AD TEXT');
  console.log('Yandex ad elements:', state.yandexEls.length);

  if (blockedUrls.length) {
    const uniqueBlocked = [...new Map(blockedUrls.map(b => [b.url, b])).values()];
    console.log('\nBlocked by rules:');
    uniqueBlocked.slice(0, 20).forEach(b => console.log(`  [rule ${b.rule}]`, b.url));
    console.log('Total blocked:', blockedUrls.length, 'requests');
  } else {
    console.log('\nNothing was blocked — rules may not have matched comss.ru requests');
  }

  console.log('\nScreenshot saved:', ssWithRules);

  await sleep(3000);
  await browser.close();
})().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
