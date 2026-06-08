// Chrome-only MAIN world YouTube response sanitizer.
(function () {
  'use strict';

  try {
    if (/firefox/i.test(navigator.userAgent)) return;
    if (!location.hostname.endsWith('youtube.com')) return;
    if (window.__fadblockYoutubePruneActive) return;
    window.__fadblockYoutubePruneActive = true;
    window.__fadblockYoutubeStage = 'init';

    var PLAYER_RE = /\/youtubei\/v\d+\/(player|next)\b|\/player(?!.*get_drm_license)|\/playlist\?list=|\/watch\?[tv]=|\/get_watch\?/i;
    var AD_KEYS = new Set([
      'adPlacements',
      'playerAds',
      'adClientParams',
      'adSlots',
      'adBreakHeartbeatParams',
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
      var keys = Object.keys(value);
      return keys.length > 0 && keys.every(function (k) { return AD_KEYS.has(k); });
    }

    function sanitizeString(text) {
      if (typeof text !== 'string') return text;
      return text
        .replace(/"(adPlacements|adSlots|playerAds|adBreaks|adBreakHeartbeatParams|companionAds)":/g, '"no_ads":')
        .replace(/"youThereRenderer":/g, '"no_youThereRenderer":');
    }

    function sanitize(value, depth) {
      depth = depth || 0;
      if (depth > 16 || value == null || typeof value !== 'object') return value;

      if (Array.isArray(value)) {
        return value
          .filter(function (item) { return !isAdObject(item); })
          .map(function (item) { return sanitize(item, depth + 1); })
          .filter(function (item) { return item !== undefined; });
      }

      for (var key of AD_KEYS) {
        if (Object.prototype.hasOwnProperty.call(value, key)) {
          try { delete value[key]; } catch (e) {}
        }
      }

      var entries = Object.entries(value);
      for (var i = 0; i < entries.length; i += 1) {
        var pair = entries[i];
        var childKey = pair[0];
        var childVal = pair[1];
        if (AD_KEYS.has(childKey)) {
          try { delete value[childKey]; } catch (e) {}
          continue;
        }
        value[childKey] = sanitize(childVal, depth + 1);
      }

      if (Array.isArray(value.entries)) {
        value.entries = value.entries.filter(function (entry) {
          return !entry?.command?.reelWatchEndpoint?.adClientParams?.isAd;
        });
      }

      if (value.adClientParams?.isAd) {
        return undefined;
      }

      if (value.command?.reelWatchEndpoint?.adClientParams?.isAd) {
        return undefined;
      }

      if (value.messages?.[0]?.youThereRenderer) {
        try { delete value.messages[0].youThereRenderer; } catch (e) {}
      }

      var status = value.playabilityStatus;
      if (isObject(status)) {
        var reason = String(status.reason || '');
        var errorScreen = status.errorScreen || {};
        var isAdblockEnforcement =
          !!errorScreen.enforcementMessageRenderer ||
          !!errorScreen.adBlockerMessageRenderer ||
          /adblock|ad block|disable.+ad blocker|allow youtube ads/i.test(reason);
        if (isAdblockEnforcement) {
          value.playabilityStatus = {
            status: 'OK',
            playableInEmbed: true
          };
        }
      }

      return value;
    }

    function cleanJson(text) {
      try {
        var parsed = JSON.parse(sanitizeString(text));
        var cleaned = sanitize(parsed);
        return JSON.stringify(cleaned);
      } catch (e) {
        return sanitizeString(text);
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

    function hookSanitizedProperty(target, key) {
      if (!target || typeof target !== 'object') return;
      var descriptor;
      try {
        descriptor = Object.getOwnPropertyDescriptor(target, key);
      } catch (e) {
        return;
      }
      if (descriptor && descriptor.configurable === false) return;

      var current;
      try {
        current = sanitize(target[key]);
      } catch (e) {
        current = target[key];
      }

      try {
        Object.defineProperty(target, key, {
          configurable: true,
          enumerable: descriptor ? descriptor.enumerable !== false : true,
          get: function () {
            return current;
          },
          set: function (value) {
            current = sanitize(value);
          }
        });
      } catch (e) {}
    }

    try {
      Object.defineProperty(window, 'google_ad_status', {
        configurable: true,
        get: function () { return '1'; },
        set: function () {}
      });
    } catch (e) {}

    hookSanitizedProperty(window, 'ytInitialPlayerResponse');
    hookSanitizedProperty(window, 'playerResponse');

    var nativeFetch = typeof window.fetch === 'function' ? window.fetch.bind(window) : null;
    if (nativeFetch) {
      window.fetch = function (input, init) {
        var url = getUrl(input);
        return nativeFetch(input, init).then(function (response) {
          if (!PLAYER_RE.test(url)) return response;
          var clone = response.clone();
          return response.text().then(function (text) {
            return new Response(cleanJson(text), {
              status: clone.status,
              statusText: clone.statusText,
              headers: clone.headers
            });
          }).catch(function () {
            return clone;
          });
        });
      };
    }

    var nativeOpen = XMLHttpRequest.prototype.open;
    var nativeSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
      this.__fbYtUrl = typeof url === 'string' ? url : '';
      return nativeOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function (body) {
      if (PLAYER_RE.test(this.__fbYtUrl || '')) {
        this.addEventListener('readystatechange', function () {
          if (this.readyState !== 4) return;
          try {
            var cleaned = cleanJson(this.responseText);
            Object.defineProperty(this, 'responseText', { configurable: true, value: cleaned });
            Object.defineProperty(this, 'response', { configurable: true, value: cleaned });
          } catch (e) {}
        });
      }
      return nativeSend.call(this, body);
    };

    patchInitialPlayerResponse();
    document.addEventListener('yt-navigate-finish', patchInitialPlayerResponse);
    setTimeout(patchInitialPlayerResponse, 800);
    setTimeout(patchInitialPlayerResponse, 2000);
    window.__fadblockYoutubeStage = 'ready';
  } catch (error) {
    try {
      window.__fadblockYoutubeError = String(error && error.stack || error);
      window.__fadblockYoutubeStage = 'failed';
    } catch (e) {}
  }
})();
