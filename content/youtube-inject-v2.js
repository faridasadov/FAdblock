// Chrome-only MAIN world YouTube response sanitizer.
(function () {
  'use strict';

  try {
    if (/firefox/i.test(navigator.userAgent)) return;
    if (!location.hostname.endsWith('youtube.com')) return;
    if (window.__fadblockYoutubePruneActive) return;
    window.__fadblockYoutubePruneActive = true;
    window.__fadblockYoutubeStage = 'init';

    var path = location.pathname || '';
    var isWatchPage = /^\/watch/.test(path) || /^\/shorts\//.test(path) || /^\/live\//.test(path);
    if (!isWatchPage) return;

    var PLAYER_RE = /\/youtubei\/v\d+\/(player|next)\b|\/playlist\?list=|\/watch\?[tv]=|\/get_watch\?/i;
    var AD_KEYS = new Set([
      'adPlacements',
      'playerAds',
      'adSlots',
      'adBreakHeartbeatParams',
      'adBreaks',
      'adSafetyReason',
      'adSignalsInfo',
      'adDisplayConfig',
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

    function sanitizeString(text) {
      if (typeof text !== 'string') return text;
      return text
        .replace(/"(adPlacements|adSlots|playerAds)":/g, '"no_ads":')
        .replace(/"youThereRenderer":/g, '"no_youThereRenderer":');
    }

    function sanitize(value, depth) {
      depth = depth || 0;
      if (depth > 16 || value == null || typeof value !== 'object') return value;

      if (Array.isArray(value)) {
        return value
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
        return JSON.stringify(sanitize(JSON.parse(sanitizeString(text))));
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
    }

    try {
      Object.defineProperty(window, 'google_ad_status', {
        configurable: true,
        get: function () { return '1'; },
        set: function () {}
      });
    } catch (e) {}

    var nativeThen = Promise.prototype.then;
    Promise.prototype.then = new Proxy(nativeThen, {
      apply: function (target, thisArg, args) {
        var onFulfilled = args[0];
        var onRejected = args[1];

        if (typeof onFulfilled === 'function') {
          var source = '';
          try { source = Function.prototype.toString.call(onFulfilled); } catch (e) {}

          if (source.includes('onAbnormalityDetected')) {
            args[0] = function () {};
          } else if (source.includes('.next(')) {
            args[0] = function (value) {
              if (typeof value?.value === 'string') value.value = sanitizeString(value.value);
              return onFulfilled.call(this, value);
            };
          } else if (source.includes('jspbResponseCtor')) {
            args[0] = function (value) {
              return onFulfilled.call(this, sanitize(value));
            };
          } else {
            args[0] = function (value) {
              if (value && typeof value === 'object') return onFulfilled.call(this, sanitize(value));
              return onFulfilled.call(this, value);
            };
          }
        }

        if (typeof onRejected === 'function') {
          args[1] = function (error) {
            return onRejected.call(this, error);
          };
        }

        return Reflect.apply(target, thisArg, args);
      }
    });

    var nativeFetch = typeof window.fetch === 'function' ? window.fetch.bind(window) : null;
    if (nativeFetch) {
      window.fetch = function (input, init) {
        var url = getUrl(input);
        return nativeFetch(input, init).then(function (response) {
          if (!PLAYER_RE.test(url)) return response;
          return response.text().then(function (text) {
            return new Response(cleanJson(text), {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers
            });
          }).catch(function () {
            return response;
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
