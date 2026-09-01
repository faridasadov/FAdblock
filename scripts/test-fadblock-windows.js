#!/usr/bin/env node
// Test: YouTube reklam bloklama yoxlanışı (Windows + Firefox)
const { firefox } = require('playwright');
const fs = require('fs');
const path = require('path');

const FIREFOX_PATH = 'C:\\Program Files\\Mozilla Firefox\\firefox.exe';
const EXT_ROOT = path.resolve(__dirname, '..');

const INJECT_V2 = fs.readFileSync(path.join(EXT_ROOT, 'content', 'youtube-inject-v2.js'), 'utf8');

function log(label, ok, detail = '') {
  const mark = ok ? '✓' : '✗';
  const color = ok ? '\x1b[32m' : '\x1b[31m';
  console.log(`${color}${mark}\x1b[0m ${label}${detail ? ` (${detail})` : ''}`);
}

// Inject script-in sanitize funksiyasını birbaşa test et
function testSanitizeLogic() {
  console.log('\n── Unit testlər: sanitize funksiyası ──');

  // AD_KEYS siyahısını v2 faylından çək
  const newKeys = ['serverStitchedDaiRenderer', 'daiAdRenderer', 'youtubeAdsRenderer',
    'adLayoutLoggingData', 'mutedAutoplayAdRenderer', 'adMetadataContainer',
    'adBreakServiceRenderer', 'externalAdsConfig'];

  let allFound = true;
  for (const key of newKeys) {
    const found = INJECT_V2.includes(`'${key}'`);
    log(`AD_KEYS içində: ${key}`, found);
    if (!found) allFound = false;
  }

  // adBreakServiceSettings boşaldılır yoxlanışı
  const hasEmptyObj = INJECT_V2.includes("'adBreakServiceSettings' || childKey === 'adBreakService'");
  log('adBreakServiceSettings/adBreakService boşaldılır ({})', hasEmptyObj);

  // bridge manifest-də yoxlanışı
  const manifest = JSON.parse(fs.readFileSync(path.join(EXT_ROOT, 'manifest.json'), 'utf8'));
  const bridgeEntry = manifest.content_scripts.find(s =>
    s.js && s.js.includes('content/youtube-firefox-bridge.js')
  );
  log('youtube-firefox-bridge.js manifest-də var', !!bridgeEntry);

  // Yeni youtube-rules.json qaydaları
  const rules = JSON.parse(fs.readFileSync(path.join(EXT_ROOT, 'rules', 'youtube-rules.json'), 'utf8'));
  const ruleUrls = rules.map(r => r.condition.urlFilter);
  const newRules = [
    '||youtube.com/api/stats/ads^',
    '||youtube.com/ptracking^',
    '||youtube.com/youtubei/v1/ad_break^'
  ];
  for (const url of newRules) {
    log(`Yeni qayda: ${url}`, ruleUrls.includes(url));
  }

  return allFound && !!bridgeEntry;
}

async function testYouTubePage() {
  console.log('\n── Playwright testi: YouTube səhifəsi ──');

  const browser = await firefox.launch({
    headless: true,
  });

  const context = await browser.newContext();

  // youtube-inject-v2.js skriptini MAIN world-da simulyasiya et
  await context.addInitScript(INJECT_V2);

  const page = await context.newPage();

  let pass = true;

  try {
    await page.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    await page.waitForTimeout(4000);

    const result = await page.evaluate(() => {
      // 1. Reklam elementlər görünürmü?
      const adSlots = document.querySelectorAll(
        'ytd-display-ad-renderer, ytd-ad-slot-renderer, .ytp-ad-module, .video-ads'
      );
      const visibleAds = Array.from(adSlots).filter(el => {
        const s = getComputedStyle(el);
        return s.display !== 'none' && s.visibility !== 'hidden' && el.offsetHeight > 0;
      });

      // 2. Ad-skipping düyməsi görünürmü?
      const skipBtn = document.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button');
      const skipVisible = skipBtn && getComputedStyle(skipBtn).display !== 'none';

      // 3. Enforce mesajı varmı?
      const enforceMsg = document.querySelector(
        'ytd-enforcement-message-view-model, #enforcement-message, .ytd-ad-blocker-message-renderer'
      );

      // 4. Player hazırdırmı?
      const video = document.querySelector('video');
      const playerReady = !!video;

      // 5. FADblock aktiv olubmu?
      const fadActive = !!(window.__fadblockYoutubePruneActive || window.__fadblockPlayerFix);

      return {
        visibleAdCount: visibleAds.length,
        skipButtonVisible: !!skipVisible,
        enforceMessagePresent: !!enforceMsg,
        playerReady,
        fadActive,
        playerStage: window.__fadblockYoutubeStage || 'unknown'
      };
    });

    log('FADblock inject aktiv', result.fadActive, `stage: ${result.playerStage}`);
    log('Görünən reklam yoxdur', result.visibleAdCount === 0, `${result.visibleAdCount} reklam`);
    log('Skip düyməsi yoxdur', !result.skipButtonVisible);
    log('Enforce mesajı yoxdur', !result.enforceMessagePresent);
    log('Player yüklənib', result.playerReady);

    pass = result.fadActive && result.visibleAdCount === 0 && !result.skipButtonVisible && !result.enforceMessagePresent;

  } catch (err) {
    log('Səhifə yükləndi', false, err.message);
    pass = false;
  }

  await browser.close();
  return pass;
}

async function main() {
  console.log('fadblock YouTube Reklam Test\n' + '='.repeat(40));

  const unitOk = testSanitizeLogic();
  const pageOk = await testYouTubePage();

  console.log('\n' + '='.repeat(40));
  const allOk = unitOk && pageOk;
  console.log(allOk ? '\x1b[32mBütün testlər keçdi ✓\x1b[0m' : '\x1b[31mBəzi testlər uğursuz oldu ✗\x1b[0m');
  process.exit(allOk ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
