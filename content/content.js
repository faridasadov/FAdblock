(function () {
  'use strict';

  const STYLE_ID = '__adblock_pro_css__';
  const YT_STYLE_ID = '__fadblock_youtube_css__';
  const CUSTOM_STYLE_ID = '__adblock_custom_css__';
  const HIDDEN_ATTR = 'data-fb-generic-hidden';
  const HOST = location.hostname.replace(/^www\./, '');
  const CATEGORY_SETTINGS_KEY = 'category_settings';
  const SITE_RULES_KEY = 'site_rules';

  const SPECIFIC_SELECTORS = [
    '.adsbygoogle', 'ins.adsbygoogle',
    '[id^="google_ads_"]', '[id^="div-gpt-ad"]',
    'iframe[src*="googlesyndication.com"]',
    'iframe[src*="doubleclick.net"]',
    'iframe[src*="googleadservices.com"]',
    '[id*="taboola"]', '[class*="taboola"]',
    '[id*="outbrain"]', '[class*="outbrain"]',
    '[id*="mgid"]', '[class*="mgid"]',
    '.OUTBRAIN', '#taboola-below-article',
    '.popup-ad', '.pop-up-ad', '.overlay-ad',
    '.ytp-ad-overlay-container', '.ytp-ad-text-overlay',
    '.ytp-ad-skip-button-container', '.video-ads',
    '[data-adtype]', '[data-ad-comet-type]',
  ];

  const GENERIC_SELECTORS = [
    '.ad', '.ad-unit', '.ad-wrapper', '.ad-container', '.ad-slot',
    '.ads', '.ads-wrapper', '.ads-container',
    '#ad', '#ads', '#ad-container', '#ad-wrapper',
    '.advertisement', '.advertisements',
    '.banner-ad', '.ad-banner', '.leaderboard-ad',
    '.sidebar-ad', '.sticky-ad', '.inline-ad',
    '.sponsored-content', '.sponsored-links', '.sponsored-post',
    '[class*="advert"]', '[id*="advert"]', '[class*="sponsored"]'
  ];

  const HOST_GENERIC_EXCLUSIONS = [
    /mail\.google\.com$/,
    /outlook\.live\.com$/,
    /outlook\.office\.com$/,
    /mail\.yahoo\.com$/,
    /mail\.proton\.me$/,
    /docs\.google\.com$/,
    /notion\.so$/,
    /figma\.com$/,
  ];

  const DEFAULT_CATEGORY_SETTINGS = {
    cosmetic: true,
    customSelectors: true,
    youtubeBypass: true,
  };

  const state = {
    enabled: true,
    categories: { ...DEFAULT_CATEGORY_SETTINGS },
    customSelectors: [],
    siteRule: {},
    observer: null,
    genericTimer: null,
    cosmeticActive: false,
  };

  function isYouTubeWatchPage() {
    return location.hostname.includes('youtube.com') &&
      (/^\/watch/.test(location.pathname) || /^\/shorts\//.test(location.pathname) || /^\/live\//.test(location.pathname));
  }

  function getYouTubeMainVideo() {
    return document.querySelector('#movie_player video, .html5-video-player video');
  }

  function hasRecovery() {
    return !!(state.siteRule?.recoveryUntil && state.siteRule.recoveryUntil > Date.now());
  }

  function effectiveCosmeticEnabled() {
    return state.enabled && !hasRecovery() && state.categories.cosmetic !== false && !state.siteRule.disableCosmetic;
  }

  function effectiveCustomSelectorsEnabled() {
    return state.enabled && !hasRecovery() && state.categories.customSelectors !== false && !state.siteRule.disableCustomSelectors;
  }

  function effectiveYouTubeBypassEnabled() {
    return state.enabled && !hasRecovery() && state.categories.youtubeBypass !== false && !state.siteRule.disableYouTubeBypass;
  }

  function injectSpecificCosmeticCSS() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `${SPECIFIC_SELECTORS.join(',\n')} {\n  display: none !important;\n  visibility: hidden !important;\n}`;
    (document.head || document.documentElement).prepend(style);
  }

  function removeCosmeticCSS() {
    document.getElementById(STYLE_ID)?.remove();
    document.getElementById(YT_STYLE_ID)?.remove();
  }

  function applyCustomSelectors(selectors) {
    let el = document.getElementById(CUSTOM_STYLE_ID);
    if (!effectiveCustomSelectorsEnabled() || !selectors?.length) {
      el?.remove();
      return;
    }
    if (!el) {
      el = document.createElement('style');
      el.id = CUSTOM_STYLE_ID;
      (document.head || document.documentElement).prepend(el);
    }
    el.textContent = `${selectors.join(',\n')} {\n  display: none !important;\n  visibility: hidden !important;\n}`;
  }

  function shouldSkipGenericSweep() {
    return HOST_GENERIC_EXCLUSIONS.some((pattern) => pattern.test(HOST));
  }

  function isProbablyAdNode(el) {
    if (!(el instanceof HTMLElement)) return false;
    if (el.closest('main article, article main, form, nav, header, footer, aside[role="complementary"]')) return false;
    if (el.matches('body, html, main, article, section, nav, header, footer, form, input, textarea, button, [role="button"]')) return false;

    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;

    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    if (rect.width > window.innerWidth * 0.9 && rect.height > window.innerHeight * 0.5) return false;
    if (rect.height > 900) return false;

    const text = `${el.id} ${el.className} ${el.getAttribute('aria-label') || ''}`.toLowerCase();
    const hasAdSignal = /(ad|ads|advert|sponsor|promo|banner|taboola|outbrain|mgid)/.test(text);
    const fixedBox = style.position === 'fixed' || style.position === 'sticky';
    const likelyMediaAd = !!el.querySelector('iframe, img, video');
    return hasAdSignal && (fixedBox || likelyMediaAd || rect.height < 420);
  }

  function restoreGenericHidden() {
    document.querySelectorAll(`[${HIDDEN_ATTR}]`).forEach((el) => {
      el.removeAttribute(HIDDEN_ATTR);
      el.style.removeProperty('display');
      el.style.removeProperty('visibility');
    });
  }

  function applyGenericSweep() {
    state.genericTimer = null;
    if (!effectiveCosmeticEnabled() || shouldSkipGenericSweep()) {
      restoreGenericHidden();
      return;
    }
    document.querySelectorAll(GENERIC_SELECTORS.join(',')).forEach((el) => {
      if (!isProbablyAdNode(el)) return;
      el.setAttribute(HIDDEN_ATTR, '1');
      el.style.setProperty('display', 'none', 'important');
      el.style.setProperty('visibility', 'hidden', 'important');
    });
  }

  function scheduleGenericSweep() {
    if (state.genericTimer) return;
    state.genericTimer = setTimeout(applyGenericSweep, 250);
  }

  function ensureBaseObserver() {
    if (state.observer) return;
    state.observer = new MutationObserver(() => {
      if (state.cosmeticActive && !document.getElementById(STYLE_ID)) injectSpecificCosmeticCSS();
      scheduleGenericSweep();
    });
    const attach = () => state.observer.observe(document.documentElement, { childList: true, subtree: true });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach, { once: true });
    else attach();
  }

  function syncCosmeticState() {
    state.cosmeticActive = effectiveCosmeticEnabled();
    if (state.cosmeticActive) injectSpecificCosmeticCSS();
    else removeCosmeticCSS();
    if (!state.cosmeticActive) restoreGenericHidden();
    scheduleGenericSweep();
  }

  function applyState() {
    syncCosmeticState();
    applyCustomSelectors(state.customSelectors);
    if (isYouTubeWatchPage()) {
      if (effectiveYouTubeBypassEnabled()) setupYouTubeAdBypass();
      else teardownYouTubeBypass();
    }
  }

  function refreshStateFromStorage(changes) {
    if (changes.adblock_enabled) state.enabled = changes.adblock_enabled.newValue !== false;
    if (changes.custom_selectors) state.customSelectors = changes.custom_selectors.newValue || [];
    if (changes[CATEGORY_SETTINGS_KEY]) state.categories = { ...DEFAULT_CATEGORY_SETTINGS, ...(changes[CATEGORY_SETTINGS_KEY].newValue || {}) };
    if (changes[SITE_RULES_KEY]) state.siteRule = (changes[SITE_RULES_KEY].newValue || {})[HOST] || {};
    applyState();
  }

  ensureBaseObserver();
  chrome.storage.local.get(['adblock_enabled', 'custom_selectors', CATEGORY_SETTINGS_KEY, SITE_RULES_KEY], (data) => {
    state.enabled = data.adblock_enabled !== false;
    state.customSelectors = data.custom_selectors || [];
    state.categories = { ...DEFAULT_CATEGORY_SETTINGS, ...(data[CATEGORY_SETTINGS_KEY] || {}) };
    state.siteRule = (data[SITE_RULES_KEY] || {})[HOST] || {};
    applyState();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    refreshStateFromStorage(changes);
  });

  function setupYouTubeAdBypass() {
    const shared = window.__fadblockYoutubeBypassState || (window.__fadblockYoutubeBypassState = {
      timer: null,
      observer: null,
      scheduled: false,
      lastRun: 0,
      lastForcedSeekAt: 0,
      navHandler: null,
      unloadHandler: null,
    });

    if (shared.timer || shared.observer) return;

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
      const now = Date.now();
      if (now - shared.lastRun < 100) return;
      shared.lastRun = now;
      injectYouTubeCSS();
      if (!isYouTubeWatchPage()) return;

      const candidates = document.querySelectorAll([
        'ytd-enforcement-message-view-model',
        'yt-playability-error-supported-renderers',
        'tp-yt-paper-dialog',
        'ytd-popup-container',
        'ytd-watch-flexy[player-unavailable]',
        'ytmusic-you-there-renderer'
      ].join(','));

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

      const video = getYouTubeMainVideo();
      if (video && video.playbackRate > 2 && !document.querySelector('.ad-showing')) {
        video.playbackRate = 1;
      }

      document.querySelector('yt-playability-error-supported-renderers')?.remove();
    }

    function scheduleEnforcementClear() {
      if (shared.scheduled) return;
      shared.scheduled = true;
      requestAnimationFrame(() => {
        shared.scheduled = false;
        clearYouTubeEnforcement();
      });
    }

    function tick() {
      if (!isYouTubeWatchPage() || !effectiveYouTubeBypassEnabled()) return;
      let nextDelay = 1000;
      const skipBtn = document.querySelector([
        '.ytp-skip-ad-button',
        '.ytp-skip-ad-button-modern',
        '.ytp-ad-skip-button-container button',
        '.ytp-skip-ad-button-container button',
        'button[class*="skip-ad"]'
      ].join(', '));
      if (skipBtn) {
        skipBtn.click();
        nextDelay = 80;
      } else {
        const video = getYouTubeMainVideo();
        const player = document.querySelector('#movie_player, .html5-video-player');
        const isAd = document.querySelector('.ad-showing, .ytp-ad-player-overlay, .ytp-ad-preview-container, .video-ads');
        if (video && isAd && !video.ended) {
          if (!video.muted) video.muted = true;
          if (video.playbackRate < 16) video.playbackRate = 16;
          if (typeof video.play === 'function') {
            const promise = video.play();
            if (promise?.catch) promise.catch(() => {});
          }

          const remaining = Number.isFinite(video.duration) ? (video.duration - video.currentTime) : Infinity;
          if (remaining > 0.35) {
            const target = Math.max(video.currentTime, video.duration - 0.12);
            try {
              if (typeof video.fastSeek === 'function') video.fastSeek(target);
              else video.currentTime = target;
            } catch {}
            if (typeof player?.seekTo === 'function') {
              try { player.seekTo(target, true); } catch {}
            }
            shared.lastForcedSeekAt = Date.now();
            nextDelay = 80;
          } else if (Date.now() - shared.lastForcedSeekAt > 250) {
            nextDelay = 120;
          }
        }
      }
      shared.timer = setTimeout(tick, nextDelay);
    }

    function startTick() {
      if (shared.timer) clearTimeout(shared.timer);
      scheduleEnforcementClear();
      shared.timer = setTimeout(tick, 250);
    }

    startTick();
    shared.observer?.disconnect();
    shared.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (
            node.matches?.('ytd-enforcement-message-view-model, yt-playability-error-supported-renderers, tp-yt-paper-dialog, ytd-popup-container, ytd-watch-flexy[player-unavailable]') ||
            node.querySelector?.('ytd-enforcement-message-view-model, yt-playability-error-supported-renderers')
          ) {
            scheduleEnforcementClear();
            return;
          }
        }
      }
    });
    shared.observer.observe(document.documentElement, { childList: true, subtree: true });
    shared.navHandler = () => {
      if (isYouTubeWatchPage() && effectiveYouTubeBypassEnabled()) startTick();
      else teardownYouTubeBypass();
    };
    document.addEventListener('yt-navigate-finish', shared.navHandler);
    shared.unloadHandler = teardownYouTubeBypass;
    window.addEventListener('pagehide', shared.unloadHandler, { once: true });
  }

  function teardownYouTubeBypass() {
    const shared = window.__fadblockYoutubeBypassState;
    if (!shared) {
      document.getElementById(YT_STYLE_ID)?.remove();
      return;
    }
    if (shared.timer) clearTimeout(shared.timer);
    shared.timer = null;
    shared.observer?.disconnect();
    shared.observer = null;
    if (shared.navHandler) {
      document.removeEventListener('yt-navigate-finish', shared.navHandler);
      shared.navHandler = null;
    }
    if (shared.unloadHandler) {
      window.removeEventListener('pagehide', shared.unloadHandler);
      shared.unloadHandler = null;
    }
    document.getElementById(YT_STYLE_ID)?.remove();
  }
})();
