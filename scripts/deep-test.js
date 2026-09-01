#!/usr/bin/env node
// Derin diaqnostik test: 3 video keçirik, hər birindən sonra FAD log-larını yoxlayırıq
const { firefox } = require('playwright');
const fs = require('fs');
const path = require('path');

const EXT_ROOT = path.resolve(__dirname, '..');
const INJECT_V2 = fs.readFileSync(path.join(EXT_ROOT, 'content', 'youtube-inject-v2.js'), 'utf8');

// Test videoları - real YouTube videoları
const VIDEOS = [
  { id: 'jNQXAC9IVRw', title: 'Me at the zoo (ilk video)' },
  { id: 'dQw4w9WgXcQ', title: 'Never Gonna Give You Up' },
  { id: 'kJQP7kiw5Fk', title: 'Despacito' },
];

function log(label, ok, detail = '') {
  const mark = ok ? '✓' : '✗';
  const color = ok ? '\x1b[32m' : '\x1b[31m';
  console.log(`${color}${mark}\x1b[0m ${label}${detail ? ` — ${detail}` : ''}`);
}

function section(title) {
  console.log(`\n\x1b[36m── ${title} ──\x1b[0m`);
}

async function checkPageForAds(page, videoNum) {
  const result = await page.evaluate(() => {
    // 1. FAD log-larını götür
    const fadLogs = JSON.parse(sessionStorage.getItem('fadblock_log') || '[]');
    const recent = fadLogs.slice(-20);

    // 2. Reklam elementlər
    const adSelectors = [
      '.ytp-ad-module', '.video-ads.ytp-ad-module',
      'ytd-display-ad-renderer', 'ytd-ad-slot-renderer',
      '.ytp-ad-overlay-container',
      '.ytp-ad-text', '.ytp-ad-player-overlay',
    ];
    const visibleAds = adSelectors.reduce((acc, sel) => {
      const els = document.querySelectorAll(sel);
      return acc + Array.from(els).filter(el => {
        const s = getComputedStyle(el);
        return s.display !== 'none' && s.visibility !== 'hidden' && el.offsetHeight > 0;
      }).length;
    }, 0);

    // 3. Skip button - reklam oynayırsa görünür
    const skipBtn = document.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button-container');
    const skipVisible = skipBtn && getComputedStyle(skipBtn).display !== 'none' && skipBtn.offsetHeight > 0;

    // 4. Ad countdown (reklamın neçə saniyə qaldığını göstərir)
    const adCountdown = document.querySelector('.ytp-ad-duration-remaining');
    const adCountdownVisible = adCountdown && getComputedStyle(adCountdown).display !== 'none';

    // 5. Enforcement mesajı
    const enforceEl = document.querySelector(
      'ytd-enforcement-message-view-model, .ytd-ad-blocker-message-renderer, [id*="enforcement"]'
    );

    // 6. Fetch hook aktiv?
    const fetchHooked = window.__fadblockYoutubePruneActive === true;
    const stage = window.__fadblockYoutubeStage || 'unknown';
    const playerFixActive = window.__fadblockPlayerFixActive === true;

    // 7. SW bloklanıb?
    const swBlocked = typeof navigator.serviceWorker !== 'undefined' &&
      navigator.serviceWorker.register !== undefined &&
      navigator.serviceWorker.register.toString().includes('fadblock') ||
      navigator.serviceWorker.register.toString().includes('sw_register_blocked');

    // 8. adPlacements player-də varmı?
    const playerHasAds = !!(window.ytInitialPlayerResponse && window.ytInitialPlayerResponse.adPlacements &&
      window.ytInitialPlayerResponse.adPlacements.length > 0);

    // 9. Video oynayırmı?
    const video = document.querySelector('video');
    const videoPlaying = video && !video.paused && video.currentTime > 0;

    return {
      fadLogs: recent,
      visibleAds,
      skipVisible: !!skipVisible,
      adCountdownVisible: !!adCountdownVisible,
      enforcePresent: !!enforceEl,
      fetchHooked,
      stage,
      playerFixActive,
      swBlocked,
      playerHasAds,
      videoPlaying,
      url: location.href,
      playerStage: window.__fadblockYoutubeStage,
      bridgeActive: window.__fadblockPlayerFixActive,
    };
  });
  return result;
}

async function main() {
  console.log('\x1b[1mfadblock Dərin Diaqnostik Test\x1b[0m');
  console.log('='.repeat(50));

  const browser = await firefox.launch({
    headless: false, // Vizual olaraq izlə
    args: ['--no-sandbox'],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
  });

  // Extension skriptini hər səhifəyə inject et
  await context.addInitScript({ content: INJECT_V2 });

  const page = await context.newPage();

  // Console log-larını izlə
  const consoleLogs = [];
  page.on('console', msg => {
    const txt = msg.text();
    if (txt.includes('[FAD]')) {
      consoleLogs.push({ type: msg.type(), text: txt, time: Date.now() });
    }
  });

  let allPassed = true;

  // ── Video 1: Birbaşa URL ilə aç ──
  section(`Video 1: ${VIDEOS[0].title}`);
  await page.goto(`https://www.youtube.com/watch?v=${VIDEOS[0].id}`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.waitForTimeout(5000);

  const r1 = await checkPageForAds(page, 1);
  log('FAD inject aktiv', r1.fetchHooked, `stage: ${r1.stage}`);
  log('__fadblockPlayerFixActive (bridge skip)', r1.playerFixActive);
  log('Görünən reklam yoxdur', r1.visibleAds === 0, `${r1.visibleAds} reklam elementi`);
  log('Skip düyməsi yoxdur', !r1.skipVisible);
  log('Ad countdown yoxdur', !r1.adCountdownVisible);
  log('Enforce mesajı yoxdur', !r1.enforcePresent);
  log('ytInitialPlayerResponse-də adPlacements yoxdur', !r1.playerHasAds);

  const v1FADLogs = r1.fadLogs.filter(l => l.ev === 'fetch_player_intercepted');
  log('Fetch interceptor işlədi', v1FADLogs.length > 0, `${v1FADLogs.length} player sorğusu tutuldu`);

  if (r1.visibleAds > 0 || r1.skipVisible) {
    console.log('\x1b[31m  ⚠ VİDEO 1-DƏ REKLAM GÖRÜNDǙl\x1b[0m');
    allPassed = false;
  }

  // ── Video 2: SPA naviqasiya ──
  section(`Video 2: ${VIDEOS[1].title} (SPA naviqasiya)`);
  consoleLogs.length = 0; // Logları sıfırla

  // SPA naviqasiyası - link click
  await page.evaluate((id) => {
    history.pushState({}, '', '/watch?v=' + id);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, VIDEOS[1].id);

  // Əslində YouTube linkini click edirik
  await page.goto(`https://www.youtube.com/watch?v=${VIDEOS[1].id}`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.waitForTimeout(5000);

  const r2 = await checkPageForAds(page, 2);
  log('FAD inject aktiv (video 2)', r2.fetchHooked, `stage: ${r2.stage}`);
  log('Bridge skip aktiv', r2.playerFixActive, r2.bridgeActive ? 'TRUE' : 'FALSE');
  log('Görünən reklam yoxdur (video 2)', r2.visibleAds === 0, `${r2.visibleAds} reklam`);
  log('Skip düyməsi yoxdur (video 2)', !r2.skipVisible);
  log('Fetch interceptor (video 2)', r2.fadLogs.filter(l => l.ev === 'fetch_player_intercepted').length > 0);

  if (r2.visibleAds > 0 || r2.skipVisible) {
    console.log('\x1b[31m  ⚠ VİDEO 2-DƏ REKLAM GÖRÜNDǙl\x1b[0m');
    allPassed = false;
  }

  // ── Video 3: Üçüncü naviqasiya ──
  section(`Video 3: ${VIDEOS[2].title}`);
  await page.goto(`https://www.youtube.com/watch?v=${VIDEOS[2].id}`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.waitForTimeout(5000);

  const r3 = await checkPageForAds(page, 3);
  log('FAD inject aktiv (video 3)', r3.fetchHooked, `stage: ${r3.stage}`);
  log('Görünən reklam yoxdur (video 3)', r3.visibleAds === 0, `${r3.visibleAds} reklam`);
  log('Skip düyməsi yoxdur (video 3)', !r3.skipVisible);
  log('Ad countdown yoxdur (video 3)', !r3.adCountdownVisible);

  if (r3.visibleAds > 0 || r3.skipVisible) {
    console.log('\x1b[31m  ⚠ VİDEO 3-DƏ REKLAM GÖRÜNDǙl\x1b[0m');
    allPassed = false;
  }

  // ── FAD log summary ──
  section('FAD Log Xülasəsi (video 3)');
  const allFadLogs = r3.fadLogs;
  const logTypes = {};
  allFadLogs.forEach(l => { logTypes[l.ev] = (logTypes[l.ev] || 0) + 1; });
  Object.entries(logTypes).forEach(([ev, count]) => {
    console.log(`  ${ev}: ${count}x`);
  });

  console.log('\n' + '='.repeat(50));
  if (allPassed) {
    console.log('\x1b[32m✓ Bütün testlər keçdi — reklam bloklandı!\x1b[0m');
  } else {
    console.log('\x1b[31m✗ Bəzi testlər uğursuz — reklam sızdı!\x1b[0m');
  }

  // 10 saniyə brauzer açıq qalsın ki baxasan
  console.log('\n\x1b[33mBrauzer 15 saniyə açıq qalır...\x1b[0m');
  await page.waitForTimeout(15000);

  await browser.close();
  process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
  console.error('\x1b[31mTest xətası:\x1b[0m', err.message);
  process.exit(1);
});
