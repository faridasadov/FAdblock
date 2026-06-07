(function () {
  'use strict';

  if (!/firefox/i.test(navigator.userAgent)) return;
  if (!location.hostname.endsWith('youtube.com')) return;

  const path = location.pathname;
  const isWatchPage =
    /^\/watch/.test(path) ||
    /^\/shorts\//.test(path) ||
    /^\/live\//.test(path);

  if (!isWatchPage) return;

  function shouldInject() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['adblock_enabled', 'category_settings'], (data) => {
        const enabled = data.adblock_enabled !== false;
        const categories = { youtubeBypass: true, ...(data.category_settings || {}) };
        resolve(enabled && categories.youtubeBypass !== false);
      });
    });
  }

  function injectPageScript() {
    if (document.getElementById('__fadblock_ff_yt_bridge__')) return;
    const script = document.createElement('script');
    script.id = '__fadblock_ff_yt_bridge__';
    script.textContent = `(() => {
      'use strict';
      if (window.__fadblockFirefoxBridgeActive) return;
      window.__fadblockFirefoxBridgeActive = true;

      const PLAYER_RE = /\\/youtubei\\/v\\d+\\/(player|next)\\b/i;
      const AD_KEYS = new Set([
        'adPlacements',
        'playerAds',
        'adSlots',
        'adBreakHeartbeatParams',
        'adBreaks',
        'adSignalsInfo',
        'adRenderers',
        'adInfoRenderer',
        'adParams',
        'adPod',
        'adMarkers',
        'playerAdsOverlay',
        'watchAdsInfo',
        'promotedVideoRenderer',
        'promotedSkippableVideoRenderer',
        'promotedProductRenderer',
        'paidContentOverlayRenderer',
        'adBlockerMessageRenderer',
        'enforcementMessageRenderer',
        'enforcementEntity',
        'adBreakServiceSettings',
        'instreamVideoAdRenderer',
        'linearAdSequenceRenderer',
        'adDurationRemaining',
        'adVideoId',
        'adPlacementConfig',
        'carouselAdRenderer',
        'displayAd',
        'searchPyvRenderer',
        'promotedSpotlightVideoRenderer',
        'adBadgeRenderer',
        'ads',
        'adUnitRenderer',
        'fullscreenAdRenderer',
        'invideoOverlayAdRenderer',
        'mastHeadAdRenderer'
      ]);

      function isObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
      }

      function sanitize(value, depth = 0) {
        if (depth > 20 || value === null || typeof value !== 'object') return value;

        if (Array.isArray(value)) {
          return value
            .map((item) => sanitize(item, depth + 1))
            .filter((item) => item !== undefined);
        }

        const out = {};
        for (const [key, child] of Object.entries(value)) {
          if (AD_KEYS.has(key)) continue;
          out[key] = sanitize(child, depth + 1);
        }

        const status = out.playabilityStatus;
        if (isObject(status)) {
          const reason = String(status.reason || '');
          const errorScreen = status.errorScreen || {};
          const isAdblockEnforcement =
            !!errorScreen.enforcementMessageRenderer ||
            !!errorScreen.adBlockerMessageRenderer ||
            /adblock|ad block|disable.+ad blocker|allow youtube ads/i.test(reason);
          if (isAdblockEnforcement) {
            out.playabilityStatus = {
              status: 'OK',
              playableInEmbed: true
            };
          }
        }

        if (Array.isArray(out.messages) && out.messages[0]?.youThereRenderer) {
          try { delete out.messages[0].youThereRenderer; } catch (e) {}
        }

        return out;
      }

      function cleanJson(text) {
        try {
          return JSON.stringify(sanitize(JSON.parse(text)));
        } catch (e) {
          return text;
        }
      }

      function getUrl(input) {
        try {
          if (typeof input === 'string') return input;
          if (input instanceof URL) return input.href;
          if (input instanceof Request) return input.url;
        } catch (e) {}
        return '';
      }

      function patchInitialPlayerResponse() {
        try {
          if (window.ytInitialPlayerResponse) {
            window.ytInitialPlayerResponse = sanitize(window.ytInitialPlayerResponse);
          }
        } catch (e) {}
      }

      try {
        Object.defineProperty(window, 'google_ad_status', {
          configurable: true,
          get() { return '1'; },
          set() {}
        });
      } catch (e) {}

      const nativeFetch = typeof window.fetch === 'function' ? window.fetch.bind(window) : null;
      if (nativeFetch) {
        window.fetch = function (input, init) {
          const url = getUrl(input);
          if (!PLAYER_RE.test(url)) return nativeFetch(input, init);
          return nativeFetch(input, init).then((response) => {
            const source = response.clone();
            return source.text().then((text) => {
              return new Response(cleanJson(text), {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers
              });
            }).catch(() => response);
          });
        };
      }

      const xhrOpen = XMLHttpRequest.prototype.open;
      const xhrSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function (method, url) {
        this.__fadblockYoutubeUrl = typeof url === 'string' ? url : '';
        return xhrOpen.apply(this, arguments);
      };
      XMLHttpRequest.prototype.send = function () {
        if (PLAYER_RE.test(this.__fadblockYoutubeUrl || '')) {
          this.addEventListener('readystatechange', function () {
            if (this.readyState !== 4) return;
            try {
              const cleaned = cleanJson(this.responseText);
              Object.defineProperty(this, 'responseText', {
                configurable: true,
                value: cleaned
              });
              Object.defineProperty(this, 'response', {
                configurable: true,
                value: cleaned
              });
            } catch (e) {}
          });
        }
        return xhrSend.apply(this, arguments);
      };

      patchInitialPlayerResponse();
      document.addEventListener('yt-navigate-finish', patchInitialPlayerResponse);
      setTimeout(patchInitialPlayerResponse, 800);
      setTimeout(patchInitialPlayerResponse, 2000);
    })();`;

    (document.documentElement || document.head || document.body).appendChild(script);
    script.remove();
  }

  shouldInject().then((ok) => {
    if (ok) injectPageScript();
  });
})();
