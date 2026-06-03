(function () {
  'use strict';

  const STYLE_ID = '__adblock_pro_css__';
  const YT_STYLE_ID = '__fadblock_youtube_css__';

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
    document.getElementById(YT_STYLE_ID)?.remove();
  }

  function startObserver() {
    const obs = new MutationObserver(() => {
      if (!document.getElementById(STYLE_ID)) injectCosmeticCSS();
    });
    document.addEventListener('DOMContentLoaded', () => {
      obs.observe(document.documentElement, { childList: true, subtree: true });
    }, { once: true });
  }

  const CUSTOM_STYLE_ID = '__adblock_custom_css__';

  function applyCustomSelectors(selectors) {
    let el = document.getElementById(CUSTOM_STYLE_ID);
    if (!selectors || !selectors.length) { el?.remove(); return; }
    if (!el) {
      el = document.createElement('style');
      el.id = CUSTOM_STYLE_ID;
      (document.head || document.documentElement).prepend(el);
    }
    el.textContent = selectors.join(',\n') + ' {\n  display: none !important;\n  visibility: hidden !important;\n}';
  }

  // Check global enabled state before doing anything
  chrome.storage.local.get(['adblock_enabled', 'custom_selectors'], ({ adblock_enabled, custom_selectors }) => {
    if (adblock_enabled === false) return;
    injectCosmeticCSS();
    applyCustomSelectors(custom_selectors || []);
    startObserver();
    if (location.hostname.includes('youtube.com')) setupYouTubeAdBypass();
  });

  // React to global toggle and custom selector changes in real time
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if ('adblock_enabled' in changes) {
      if (changes.adblock_enabled.newValue === false) {
        removeCosmeticCSS();
        applyCustomSelectors([]);
      } else {
        injectCosmeticCSS();
        chrome.storage.local.get('custom_selectors', ({ custom_selectors }) => {
          applyCustomSelectors(custom_selectors || []);
        });
        if (location.hostname.includes('youtube.com')) setupYouTubeAdBypass();
      }
    }
    if ('custom_selectors' in changes) {
      applyCustomSelectors(changes.custom_selectors.newValue || []);
    }
  });

  // --- YouTube ad handling ---
  function setupYouTubeAdBypass() {
    let timer = null;
    let observer = null;

    function injectYouTubeCSS() {
      if (document.getElementById(YT_STYLE_ID)) return;
      const style = document.createElement('style');
      style.id = YT_STYLE_ID;
      style.textContent = `
        ytd-enforcement-message-view-model,
        yt-playability-error-supported-renderers,
        .yt-playability-error-supported-renderers,
        .ytd-enforcement-message-view-model,
        .ytd-popup-container:has(ytd-enforcement-message-view-model) {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }
      `;
      (document.head || document.documentElement).prepend(style);
    }

    function looksLikeYouTubeAntiAdblock(el) {
      const text = (el?.textContent || '').toLowerCase();
      return [
        'ad blockers violate youtube',
        'ad blockers are not allowed on youtube',
        'disable your ad blocker',
        'allow youtube ads',
        'youtube premium',
        'блокировщики рекламы нарушают условия',
        'отключите блокировщик рекламы',
        'engelleyicinizi kapatın',
        'reklam engelleyici',
        'bloklayıcını söndür',
        'reklam blokeri'
      ].some((needle) => text.includes(needle));
    }

    function clearYouTubeEnforcement() {
      injectYouTubeCSS();

      const candidates = [
        ...document.querySelectorAll('ytd-enforcement-message-view-model'),
        ...document.querySelectorAll('yt-playability-error-supported-renderers'),
        ...document.querySelectorAll('tp-yt-paper-dialog'),
        ...document.querySelectorAll('ytd-popup-container'),
        ...document.querySelectorAll('ytd-watch-flexy[player-unavailable]'),
        ...document.querySelectorAll('ytmusic-you-there-renderer')
      ];

      candidates.forEach((el) => {
        if (!looksLikeYouTubeAntiAdblock(el) &&
            !el.querySelector?.('ytd-enforcement-message-view-model, yt-playability-error-supported-renderers')) {
          return;
        }
        el.remove?.();
        el.setAttribute?.('hidden', 'hidden');
        el.style?.setProperty('display', 'none', 'important');
      });

      document.body?.style?.removeProperty('overflow');
      document.documentElement?.style?.removeProperty('overflow');

      const player = document.querySelector('#movie_player, .html5-video-player');
      player?.classList.remove('ad-showing', 'ytp-hide-info-bar');
      player?.removeAttribute('style');

      const video = document.querySelector('video');
      if (video) {
        if (video.playbackRate > 2 && !document.querySelector('.ad-showing')) {
          video.playbackRate = 1;
        }
        video.muted = false;
        video.play().catch(() => {});
      }

      document.querySelector('yt-playability-error-supported-renderers')?.remove();
    }

    function startTick() {
      if (timer) clearInterval(timer);
      timer = setInterval(() => {
        clearYouTubeEnforcement();
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
    observer?.disconnect();
    observer = new MutationObserver(() => clearYouTubeEnforcement());
    observer.observe(document.documentElement, { childList: true, subtree: true });
    // YouTube uses client-side navigation — restart on each page transition
    document.addEventListener('yt-navigate-finish', startTick);
    window.addEventListener('unload', () => {
      clearInterval(timer);
      observer?.disconnect();
    }, { once: true });
  }
})();
