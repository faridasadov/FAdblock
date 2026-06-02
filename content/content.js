(function () {
  'use strict';

  const STYLE_ID = '__adblock_pro_css__';

  const COSMETIC_SELECTORS = [
    // Google Ads
    'ins.adsbygoogle',
    '[id^="google_ads_"]',
    '[id^="div-gpt-ad"]',
    'iframe[src*="googlesyndication.com"]',
    'iframe[src*="doubleclick.net"]',
    'iframe[src*="googleadservices.com"]',

    // Generic patterns
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

    // Ad networks
    '[id*="taboola"]', '[class*="taboola"]',
    '[id*="outbrain"]', '[class*="outbrain"]',
    '[id*="mgid"]', '[class*="mgid"]',
    '.OUTBRAIN', '#taboola-below-article',

    // Popup/overlay ads
    '.popup-ad', '.pop-up-ad', '.overlay-ad',

    // YouTube ads
    '.ytp-ad-overlay-container',
    '.ytp-ad-text-overlay',
    '.ytp-ad-skip-button-container',
    '.video-ads',

    // Data attribute patterns
    '[data-adtype]',
    '[data-ad-comet-type]',
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

  injectCosmeticCSS();

  const observer = new MutationObserver(() => {
    if (!document.getElementById(STYLE_ID)) injectCosmeticCSS();
  });

  document.addEventListener('DOMContentLoaded', () => {
    observer.observe(document.documentElement, { childList: true, subtree: false });
  });
})();
