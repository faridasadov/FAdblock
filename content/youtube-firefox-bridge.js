(function () {
  'use strict';

  if (!/firefox/i.test(navigator.userAgent)) return;
  if (!location.hostname.endsWith('youtube.com')) return;

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

      const PLAYER_RE = /\\/youtubei\\/v\\d+\\/(player|next)\\b|\\/player(?!.*get_drm_license)|\\/playlist\\?list=|\\/watch\\?[tv]=|\\/get_watch\\?/i;
      const AD_KEYS = new Set([
        'adPlacements',
        'playerAds',
        'adClientParams',
        'adSlots',

        'adBreaks',
        'adServingData',
        'adState',
        'adTag',
        'adTagParameters',
        'adSafetyReason',
        'adSignalsInfo',
        'adTrackingParams',
        'adDisplayConfig',
        'adMetadata',
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
        'sponsorshipsRenderer',
        'paidContentOverlayRenderer',
        'campaign',
        'adBlockerMessageRenderer',
        'enforcementMessageRenderer',
        'enforcementEntity',
        'adBlockerMessage',
        'adBreakServiceSettings',
        'adAttribution',
        'instreamVideoAdRenderer',
        'linearAdSequenceRenderer',
        'adDurationRemaining',
        'adBreakService',
        'adLayoutServiceSettings',
        'adVideoId',
        'adSlotLoggingData',
        'adPlacementConfig',
        'companionAds',
        'carouselAdRenderer',
        'displayAd',
        'searchPyvRenderer',
        'promotedSpotlightVideoRenderer',
        'adHoverTextButtonRenderer',
        'adBadgeRenderer',
        'ads',
        'adUnitRenderer',
        'adTextImageButtonRenderer',
        'adActionInterstitialRenderer',
        'fullscreenAdRenderer',
        'invideoOverlayAdRenderer',
        'mastHeadAdRenderer',
        'brightcoveAdRenderer'
      ]);

      function isObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
      }

      function isAdObject(value) {
        if (!isObject(value)) return false;
        const keys = Object.keys(value);
        return keys.length > 0 && keys.every((k) => AD_KEYS.has(k));
      }

      function sanitize(value, depth = 0) {
        if (depth > 16 || value === null || typeof value !== 'object') return value;

        if (Array.isArray(value)) {
          return value
            .filter((item) => !isAdObject(item))
            .map((item) => sanitize(item, depth + 1))
            .filter((item) => item !== undefined);
        }

        const out = {};
        for (const [key, child] of Object.entries(value)) {
          if (key === 'adBreakHeartbeatParams') { out[key] = { heartbeatIntervals: [] }; continue; }
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

        if (out.adClientParams?.isAd) return undefined;
        if (out.command?.reelWatchEndpoint?.adClientParams?.isAd) return undefined;

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
        try {
          if (window.playerResponse) {
            window.playerResponse = sanitize(window.playerResponse);
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
          return nativeFetch(input, init).then((response) => {
            if (!PLAYER_RE.test(url)) return response;
            const clone = response.clone();
            return response.text().then((text) => {
              return new Response(cleanJson(text), {
                status: clone.status,
                statusText: clone.statusText,
                headers: clone.headers
              });
            }).catch(() => clone);
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
