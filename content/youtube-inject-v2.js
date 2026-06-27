// MAIN world YouTube response sanitizer (Chrome + Firefox 128+).
(function () {
  'use strict';

  try {
    if (!location.hostname.endsWith('youtube.com')) return;
    if (window.__fadblockYoutubePruneActive) return;
    window.__fadblockYoutubePruneActive = true;
    window.__fadblockYoutubeStage = 'init';

    function FAD_LOG(event, data) {
      var entry = { t: Date.now(), ev: event, world: 'MAIN', d: data || {} };
      console.log('[FAD]', event, data || '');
      try {
        var logs = JSON.parse(sessionStorage.getItem('fadblock_log') || '[]');
        logs.push(entry);
        if (logs.length > 1000) logs = logs.slice(-1000);
        sessionStorage.setItem('fadblock_log', JSON.stringify(logs));
      } catch (e) {}
    }

    FAD_LOG('inject_start', { url: location.href });

    var PLAYER_RE = /\/youtubei\/v\d+\/(player|next)\b|\/player(?!.*get_drm_license)|\/playlist\?list=|\/watch\?[tv]=|\/get_watch\?/i;
    var AD_CHECK_RE = /googleads\.g\.doubleclick\.net|\/pagead\/(id|aclk|interaction)|\/api\/stats\/ads/i;
    var AD_KEYS = new Set([
      'adClientParams',

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
      return text.replace(/"youThereRenderer":/g, '"no_youThereRenderer":');
    }

    var cachedStreamingData = null;

    function getExpireFromUrl(url) {
      if (typeof url !== 'string') return null;
      var m = url.match(/[?&]expire=(\d+)/);
      return m ? parseInt(m[1], 10) : null;
    }

    function hasValidStreamingUrls(sd) {
      var nowSec = Date.now() / 1000;
      var formats = (sd.formats || []).concat(sd.adaptiveFormats || []);
      for (var i = 0; i < formats.length; i++) {
        var exp = getExpireFromUrl(formats[i].url);
        if (exp !== null && exp > nowSec + 60) return true;
      }
      return false;
    }

    function isStreamingDataExpired(sd) {
      var nowSec = Date.now() / 1000;
      var formats = (sd.formats || []).concat(sd.adaptiveFormats || []);
      for (var i = 0; i < formats.length; i++) {
        var exp = getExpireFromUrl(formats[i].url);
        if (exp !== null && exp < nowSec) return true;
      }
      return false;
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

      var entries = Object.entries(value);
      for (var i = 0; i < entries.length; i += 1) {
        var pair = entries[i];
        var childKey = pair[0];
        var childVal = pair[1];
        if (childKey === 'adBreakHeartbeatParams') {
          try { delete value[childKey]; } catch (e) {}
          continue;
        }
        if (childKey === 'adBreaks' || childKey === 'adPlacements' || childKey === 'playerAds' || childKey === 'adSlots') {
          value[childKey] = [];
          continue;
        }
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
          FAD_LOG('playability_fixed', { reason: reason, had_enforcement_screen: !!errorScreen.enforcementMessageRenderer });
          value.playabilityStatus = {
            status: 'OK',
            playableInEmbed: true
          };
        }
      }

      return value;
    }

    var AD_FAST_KEYS = ['"adPlacements"', '"playerAds"', '"adSlots"', '"adBreaks"',
      '"enforcementMessageRenderer"', '"adBlockerMessageRenderer"', '"adBreakHeartbeatParams"'];

    function cleanJson(text) {
      var hasAds = false;
      for (var fi = 0; fi < AD_FAST_KEYS.length; fi += 1) {
        if (text.indexOf(AD_FAST_KEYS[fi]) !== -1) { hasAds = true; break; }
      }
      var hasStreamingData = text.indexOf('"streamingData"') !== -1;
      if (!hasAds && !hasStreamingData) return text;
      try {
        var parsed = JSON.parse(sanitizeString(text));
        if (parsed.streamingData) {
          if (hasValidStreamingUrls(parsed.streamingData)) {
            try { cachedStreamingData = JSON.parse(JSON.stringify(parsed.streamingData)); } catch (e) {}
          } else if (cachedStreamingData && isStreamingDataExpired(parsed.streamingData)) {
            parsed.streamingData = cachedStreamingData;
          }
        }
        if (!hasAds) return JSON.stringify(parsed);
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
        if (AD_CHECK_RE.test(url)) {
          FAD_LOG('fetch_adcheck_blocked', { url: url });
          return Promise.resolve(new Response('{}', { status: 200 }));
        }
        return nativeFetch(input, init).then(function (response) {
          if (!PLAYER_RE.test(url)) return response;
          FAD_LOG('fetch_player_intercepted', { url: url });
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
      var fbUrl = this.__fbYtUrl || '';
      if (PLAYER_RE.test(fbUrl)) {
        FAD_LOG('xhr_player_intercepted', { url: fbUrl });
        this.addEventListener('readystatechange', function () {
          if (this.readyState !== 4) return;
          try {
            var cleaned = cleanJson(this.responseText);
            Object.defineProperty(this, 'responseText', { configurable: true, value: cleaned });
            Object.defineProperty(this, 'response', { configurable: true, value: cleaned });
          } catch (e) {}
        });
      } else if (AD_CHECK_RE.test(fbUrl)) {
        FAD_LOG('xhr_adcheck_blocked', { url: fbUrl });
        this.addEventListener('readystatechange', function () {
          if (this.readyState !== 4) return;
          try {
            Object.defineProperty(this, 'responseText', { configurable: true, value: '{}' });
            Object.defineProperty(this, 'response', { configurable: true, value: '{}' });
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
    FAD_LOG('inject_ready', { fetch_patched: !!nativeFetch });

    // Block same-video navigations triggered by ad enforcement
    (function () {
      function isSameVideoUrl(url) {
        if (typeof url !== 'string') return false;
        try {
          var cv = new URLSearchParams(location.search).get('v');
          if (!cv) return false;
          var target = new URL(url, location.href);
          return target.pathname === '/watch' && target.searchParams.get('v') === cv;
        } catch (e) { return false; }
      }

      function markBlocked(type) {
        FAD_LOG('nav_blocked', { type: type, url: location.href });
        try { sessionStorage.setItem('fadblock_blocked', type + ':' + Date.now()); } catch (e) {}
      }

      try {
        var locProto = Object.getPrototypeOf(location);
        var hd = Object.getOwnPropertyDescriptor(locProto, 'href');
        if (hd && hd.configurable && hd.set) {
          var origHrefSet = hd.set;
          Object.defineProperty(locProto, 'href', {
            configurable: true,
            get: hd.get,
            set: function (v) {
              if (isSameVideoUrl(v)) { markBlocked('href'); return; }
              return origHrefSet.call(this, v);
            }
          });
        }
      } catch (e) {}

      try {
        var origAssign = Location.prototype.assign;
        Location.prototype.assign = function (url) {
          if (isSameVideoUrl(url)) { markBlocked('assign'); return; }
          return origAssign.call(this, url);
        };
        var origReplace = Location.prototype.replace;
        Location.prototype.replace = function (url) {
          if (isSameVideoUrl(url)) { markBlocked('replace'); return; }
          return origReplace.call(this, url);
        };
      } catch (e) {}

      document.addEventListener('yt-navigate-start', function (e) {
        try {
          var d = e.detail;
          if (d && d.pageData && d.pageData.watchEndpoint) {
            var cv = new URLSearchParams(location.search).get('v');
            if (cv && d.pageData.watchEndpoint.videoId === cv) {
              markBlocked('yt-navigate');
              e.stopImmediatePropagation();
              e.preventDefault();
            }
          }
        } catch (ex) {}
      }, true);

      window.addEventListener('beforeunload', function () {
        try { sessionStorage.setItem('fadblock_unload', Date.now().toString()); } catch (e) {}
      });
    })();
  } catch (error) {
    try {
      window.__fadblockYoutubeError = String(error && error.stack || error);
      window.__fadblockYoutubeStage = 'failed';
    } catch (e) {}
  }
})();
