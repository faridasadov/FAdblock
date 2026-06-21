(function () {
  'use strict';

  function fadLog(event, data) {
    const entry = { t: Date.now(), ev: event, world: 'ISOLATED', d: data || {}, url: location.href };
    console.log('[FAD]', event, data || '');
    try {
      const logs = JSON.parse(sessionStorage.getItem('fadblock_log') || '[]');
      logs.push(entry);
      if (logs.length > 1000) logs = logs.slice(-1000);
      sessionStorage.setItem('fadblock_log', JSON.stringify(logs));
    } catch (e) {}
    try {
      fetch('http://localhost:4317/fadblock-log', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ exported_at: new Date().toISOString(), logs: [{ source: 'isolated', event, data: data || {}, url: location.href, at: new Date().toISOString() }] }),
      }).catch(() => {});
    } catch (e) {}
  }

  // Reload diagnostic: log what happened before the last page reload
  try {
    var _un = sessionStorage.getItem('fadblock_unload');
    var _bl = sessionStorage.getItem('fadblock_blocked');
    if (_un || _bl) {
      fadLog('reload_detected', { unload_at: _un ? new Date(+_un).toISOString() : null, blocked: _bl });
      sessionStorage.removeItem('fadblock_unload');
      sessionStorage.removeItem('fadblock_blocked');
    }
  } catch (e) {}

  const STYLE_ID = '__adblock_pro_css__';
  const YT_STYLE_ID = '__fadblock_youtube_css__';
  const CUSTOM_STYLE_ID = '__adblock_custom_css__';
  const HIDDEN_ATTR = 'data-fb-generic-hidden';
  const HOST = location.hostname.replace(/^www\./, '');
  const CATEGORY_SETTINGS_KEY = 'category_settings';
  const SITE_RULES_KEY = 'site_rules';
  const IS_FIREFOX = /firefox/i.test(navigator.userAgent);

  const SPECIFIC_SELECTORS = [
    '.adsbygoogle', 'ins.adsbygoogle',
    '[id^="google_ads_"]', '[id^="div-gpt-ad"]',
    'iframe[src*="googlesyndication.com"]',
    'iframe[src*="doubleclick.net"]',
    'iframe[src*="googleadservices.com"]',
    'ytd-display-ad-renderer',
    'ytd-promoted-sparkles-web-renderer',
    'ytd-promoted-video-renderer',
    'ytd-search-pyv-renderer',
    'ytd-ad-slot-renderer',
    'masthead-ad',
    '#player-ads',
    '#masthead-ad',
    '#related ytd-display-ad-renderer',
    '#related ytd-ad-slot-renderer',
    'ytd-companion-slot-renderer',
    '[id*="taboola"]', '[class*="taboola"]',
    '[id*="outbrain"]', '[class*="outbrain"]',
    '[id*="mgid"]', '[class*="mgid"]',
    '.OUTBRAIN', '#taboola-below-article',
    '.popup-ad', '.pop-up-ad', '.overlay-ad',
    // YouTube overlay ads only — NOT .video-ads (breaks player) or .ytp-ad-skip-button-container (we click it)
    '.ytp-ad-overlay-container', '.ytp-ad-text-overlay',
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
    return state.enabled && !hasRecovery() && state.categories.youtubeBypass !== false;
  }

  function isYouTubeWatchPage() {
    return location.hostname.includes('youtube.com') &&
      (/^\/watch/.test(location.pathname) || /^\/shorts\//.test(location.pathname) || /^\/live\//.test(location.pathname));
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
      if (effectiveYouTubeBypassEnabled()) setupYouTubeOverlayCleanup();
      else teardownYouTubeOverlayCleanup();
    }
  }

  function refreshStateFromStorage(changes) {
    if ('adblock_enabled' in changes) state.enabled = changes.adblock_enabled.newValue !== false;
    if (changes.custom_selectors) state.customSelectors = changes.custom_selectors.newValue || [];
    if (changes[CATEGORY_SETTINGS_KEY]) state.categories = { ...DEFAULT_CATEGORY_SETTINGS, ...(changes[CATEGORY_SETTINGS_KEY].newValue || {}) };
    if (changes[SITE_RULES_KEY]) state.siteRule = (changes[SITE_RULES_KEY].newValue || {})[HOST] || {};
    applyState();
  }

  // Inject CSS immediately to prevent ad flash. Storage response may remove it if disabled.
  injectSpecificCosmeticCSS();
  state.cosmeticActive = true;
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

  function setupYouTubeOverlayCleanup() {
    const shared = window.__fadblockYoutubeOverlayState || (window.__fadblockYoutubeOverlayState = {
      observer: null,
      navHandler: null,
      navStartHandler: null,
      pageDataHandler: null,
      pageShowHandler: null,
      visibilityHandler: null,
      scheduled: false,
      timer: null,
      currentUrl: '',
      clearCount: 0,
      lastClearAt: 0,
    });
    function resetClearState() {
      shared.currentUrl = location.href;
      shared.clearCount = 0;
      shared.lastClearAt = 0;
    }

    function ensureClearState() {
      if (shared.currentUrl !== location.href) {
        resetClearState();
      }
    }
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
      const target = document.head || document.documentElement || document.body;
      if (!target) {
        document.addEventListener('DOMContentLoaded', injectYouTubeCSS, { once: true });
        return;
      }
      target.prepend(style);
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
      if (!isYouTubeWatchPage()) return;
      ensureClearState();

      const directMatches = document.querySelectorAll([
        'ytd-enforcement-message-view-model',
        'yt-playability-error-supported-renderers',
        '#error-screen'
      ].join(','));

      directMatches.forEach((el) => {
        const isPlayabilityNode = el.matches?.('yt-playability-error-supported-renderers, #error-screen');
        if (!isPlayabilityNode && !looksLikeYouTubeAntiAdblock(el)) return;
        if (!IS_FIREFOX) {
          el.remove?.();
          return;
        }
        el.remove?.();
      });

      const containers = document.querySelectorAll([
        'tp-yt-paper-dialog',
        'ytd-popup-container'
      ].join(','));

      containers.forEach((el) => {
        if (!looksLikeYouTubeAntiAdblock(el) &&
            !el.querySelector?.('ytd-enforcement-message-view-model, yt-playability-error-supported-renderers')) {
          return;
        }
        if (!IS_FIREFOX) {
          el.setAttribute?.('hidden', 'hidden');
          el.style?.setProperty('display', 'none', 'important');
          el.style?.setProperty('visibility', 'hidden', 'important');
          el.style?.setProperty('pointer-events', 'none', 'important');
          return;
        }
        el.remove?.();
      });

      if (!IS_FIREFOX) {
        document.querySelectorAll('tp-yt-paper-dialog[open], ytd-popup-container').forEach((el) => {
          if (!looksLikeYouTubeAntiAdblock(el) &&
              !el.querySelector?.('ytd-enforcement-message-view-model, yt-playability-error-supported-renderers')) {
            return;
          }
          el.remove?.();
        });
      }

      const watchFlexy = document.querySelector('ytd-watch-flexy[player-unavailable]');
      watchFlexy?.removeAttribute?.('player-unavailable');

      const player = document.querySelector('#movie_player, .html5-video-player');
      const hadAdInterrupting = player?.classList?.contains('ad-interrupting');
      const hadUnstarted = player?.classList?.contains('unstarted-mode');
      const hadError = !!document.querySelector('.ytp-error');
      player?.classList?.remove('unstarted-mode');
      player?.classList?.remove('buffering-mode');
      player?.classList?.remove('ad-interrupting');
      document.querySelector('.ytp-error')?.remove?.();

      const playButton = document.querySelector('.ytp-play-button');
      const video = document.querySelector('#movie_player video, .html5-video-player video');
      const hadEnforcement = hadAdInterrupting || hadUnstarted || hadError || !!watchFlexy ||
        directMatches.length > 0;
      if (!hadEnforcement) return;

      const now = Date.now();
      const maxClearCount = IS_FIREFOX ? 1 : 4;
      if (shared.clearCount >= maxClearCount && (now - shared.lastClearAt) < 15000) {
        return;
      }
      shared.clearCount += 1;
      shared.lastClearAt = now;

      if (hadEnforcement) {
        fadLog('enforcement_cleared', {
          directMatches: directMatches.length,
          hadAdInterrupting,
          hadUnstarted,
          hadError,
          hadWatchFlexy: !!watchFlexy,
          videoPaused: !!video?.paused,
        });
      }
      if (!IS_FIREFOX && video?.paused && hadEnforcement) {
        fadLog('video_play_triggered', {});
        playButton?.click?.();
        video.play?.().catch?.(() => {});
      }
      // On Firefox, only trigger playback recovery when an actual enforcement overlay
      // was found and removed (directMatches.length > 0). Triggering on hadUnstarted
      // alone causes a cascade: loadVideoById resets player → unstarted again → loop.
      // On Firefox, only recover playback when an actual enforcement overlay was found
      // (directMatches.length > 0). Using loadVideoById forces a fresh fetch that our
      // MAIN-world interceptor catches and fixes (UNPLAYABLE→OK). playVideo() alone
      // fails when the player's internal state is UNPLAYABLE.
      if (IS_FIREFOX && directMatches.length > 0) {
        setTimeout(() => {
          try {
            const player = document.getElementById('movie_player');
            const playerPw = player?.wrappedJSObject || player;
            const pw = window.wrappedJSObject;
            fadLog('ff_play_state', { scriptInjected: !!pw?.__fadblockPlayerFix, paused: !!video?.paused });
            const videoId = new URLSearchParams(location.search).get('v');
            if (videoId && typeof playerPw?.loadVideoById === 'function') {
              playerPw.loadVideoById(videoId);
              fadLog('ff_play_triggered', { method: 'loadVideoById', videoId });
            } else if (typeof playerPw?.playVideo === 'function') {
              playerPw.playVideo();
              fadLog('ff_play_triggered', { method: 'playVideo' });
            } else if (video?.paused) {
              video.play?.()?.catch?.(() => {});
              fadLog('ff_play_triggered', { method: 'video.play' });
            }
          } catch (e) {
            fadLog('ff_play_error', { err: String(e).slice(0, 120) });
          }
        }, 200);
      }

      document.body?.style?.removeProperty('overflow');
      document.documentElement?.style?.removeProperty('overflow');
    }

    function scheduleClear() {
      if (shared.scheduled) return;
      shared.scheduled = true;
      requestAnimationFrame(() => {
        shared.scheduled = false;
        clearYouTubeEnforcement();
      });
    }

    injectYouTubeCSS();
    resetClearState();
    scheduleClear();
    if (!shared.timer) {
      let ticks = 0;
      shared.timer = setInterval(() => {
        ticks += 1;
        clearYouTubeEnforcement();
        if (ticks >= 40 || !isYouTubeWatchPage() || !effectiveYouTubeBypassEnabled()) {
          clearInterval(shared.timer);
          shared.timer = null;
        }
      }, 500);
    }
    shared.observer?.disconnect();
    shared.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (
            node.matches?.('ytd-enforcement-message-view-model, yt-playability-error-supported-renderers, tp-yt-paper-dialog, ytd-popup-container') ||
            node.querySelector?.('ytd-enforcement-message-view-model, yt-playability-error-supported-renderers')
          ) {
            scheduleClear();
            return;
          }
        }
      }
    });
    shared.observer.observe(document.documentElement, { childList: true, subtree: true });
    if (!shared.navHandler) {
      shared.navHandler = () => {
        resetClearState();
        if (isYouTubeWatchPage() && effectiveYouTubeBypassEnabled()) scheduleClear();
        else teardownYouTubeOverlayCleanup();
      };
      document.addEventListener('yt-navigate-finish', shared.navHandler);
    }
    if (!shared.navStartHandler) {
      shared.navStartHandler = () => {
        resetClearState();
        if (isYouTubeWatchPage() && effectiveYouTubeBypassEnabled()) scheduleClear();
      };
      document.addEventListener('yt-navigate-start', shared.navStartHandler);
    }
    if (!shared.pageDataHandler) {
      shared.pageDataHandler = () => {
        resetClearState();
        if (isYouTubeWatchPage() && effectiveYouTubeBypassEnabled()) scheduleClear();
      };
      document.addEventListener('yt-page-data-updated', shared.pageDataHandler);
    }
    if (!shared.pageShowHandler) {
      shared.pageShowHandler = () => {
        resetClearState();
        if (isYouTubeWatchPage() && effectiveYouTubeBypassEnabled()) scheduleClear();
      };
      window.addEventListener('pageshow', shared.pageShowHandler);
    }
    if (!shared.visibilityHandler) {
      shared.visibilityHandler = () => {
        if (document.visibilityState === 'visible' && isYouTubeWatchPage() && effectiveYouTubeBypassEnabled()) {
          scheduleClear();
        }
      };
      document.addEventListener('visibilitychange', shared.visibilityHandler);
    }
  }

  function teardownYouTubeOverlayCleanup() {
    const shared = window.__fadblockYoutubeOverlayState;
    if (!shared) {
      document.getElementById(YT_STYLE_ID)?.remove();
      return;
    }
    shared.observer?.disconnect();
    shared.observer = null;
    if (shared.navHandler) {
      document.removeEventListener('yt-navigate-finish', shared.navHandler);
      shared.navHandler = null;
    }
    if (shared.navStartHandler) {
      document.removeEventListener('yt-navigate-start', shared.navStartHandler);
      shared.navStartHandler = null;
    }
    if (shared.pageDataHandler) {
      document.removeEventListener('yt-page-data-updated', shared.pageDataHandler);
      shared.pageDataHandler = null;
    }
    if (shared.pageShowHandler) {
      window.removeEventListener('pageshow', shared.pageShowHandler);
      shared.pageShowHandler = null;
    }
    if (shared.visibilityHandler) {
      document.removeEventListener('visibilitychange', shared.visibilityHandler);
      shared.visibilityHandler = null;
    }
    if (shared.timer) {
      clearInterval(shared.timer);
      shared.timer = null;
    }
    document.getElementById(YT_STYLE_ID)?.remove();
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type !== 'FADBLOCK_REARM_YOUTUBE') return;
    if (!isYouTubeWatchPage() || !effectiveYouTubeBypassEnabled()) return;
    setupYouTubeOverlayCleanup();
  });

})();
