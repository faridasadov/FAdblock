(function () {
  'use strict';

  const STYLE_ID = '__adblock_pro_css__';

  const COSMETIC_SELECTORS = [
    '.adsbygoogle', 'ins.adsbygoogle',
    '[id^="google_ads_"]', '[id^="div-gpt-ad"]',
    'iframe[src*="googlesyndication.com"]',
    'iframe[src*="doubleclick.net"]',
    'iframe[src*="googleadservices.com"]',
    '.ad', '.ad-unit', '.ad-wrapper', '.ad-container', '.ad-slot',
    '.ads', '.ads-wrapper', '.ads-container',
    '#ad', '#ads', '#ad-container', '#ad-wrapper',
    '.advertisement', '.advertisements',
    '[class*="advert"]:not(article):not(section)',
    '[id*="advert"]:not(article):not(section)',
    '.banner-ad', '.ad-banner', '.leaderboard-ad',
    '.sidebar-ad', '.sticky-ad', '.inline-ad',
    '.sponsored-content', '.sponsored-links', '.sponsored-post',
    '[class*="sponsored"]:not(article):not(section)',
    '[id*="taboola"]', '[class*="taboola"]',
    '[id*="outbrain"]', '[class*="outbrain"]',
    '[id*="mgid"]', '[class*="mgid"]',
    '.OUTBRAIN', '#taboola-below-article',
    '.popup-ad', '.pop-up-ad', '.overlay-ad',
    '.ytp-ad-overlay-container', '.ytp-ad-text-overlay',
    '.ytp-ad-skip-button-container', '.video-ads',
    '[data-adtype]', '[data-ad-comet-type]',
  ];

  function injectCosmeticCSS() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
      COSMETIC_SELECTORS.join(',\n') +
      ' {\n  display: none !important;\n  visibility: hidden !important;\n}';
    (document.head || document.documentElement).prepend(style);
  }

  function removeCosmeticCSS() {
    document.getElementById(STYLE_ID)?.remove();
  }

  function startObserver() {
    const obs = new MutationObserver(() => {
      if (!document.getElementById(STYLE_ID)) injectCosmeticCSS();
    });
    document.addEventListener('DOMContentLoaded', () => {
      obs.observe(document.documentElement, { childList: true, subtree: true });
    }, { once: true });
  }

  // Check global enabled state before doing anything
  chrome.storage.local.get('adblock_enabled', ({ adblock_enabled }) => {
    if (adblock_enabled === false) return;
    injectCosmeticCSS();
    startObserver();
    if (location.hostname.includes('youtube.com')) setupYouTubeAdSkip();
  });

  // React to global toggle changes in real time
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !('adblock_enabled' in changes)) return;
    changes.adblock_enabled.newValue === false ? removeCosmeticCSS() : injectCosmeticCSS();
  });

  // --- YouTube ad handling ---
  function setupYouTubeAdSkip() {
    let timer = null;

    function startTick() {
      if (timer) clearInterval(timer);
      timer = setInterval(() => {
        const skipBtn = document.querySelector(
          '.ytp-skip-ad-button, .ytp-ad-skip-button-container button'
        );
        if (skipBtn) { skipBtn.click(); return; }
        const video = document.querySelector('video');
        const isAd  = document.querySelector('.ad-showing');
        if (video && isAd && !video.ended) {
          if (!video.muted) video.muted = true;
          if (video.playbackRate < 16) video.playbackRate = 16;
        }
      }, 300);
    }

    startTick();
    // YouTube uses client-side navigation — restart on each page transition
    document.addEventListener('yt-navigate-finish', startTick);
    window.addEventListener('unload', () => clearInterval(timer), { once: true });
  }
})();
