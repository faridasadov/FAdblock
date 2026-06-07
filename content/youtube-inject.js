// MAIN world, document_start.
(function () {
  'use strict';

  try {
    if (!location.hostname.endsWith('youtube.com')) return;
    if (window.__fadblockYoutubePruneActive) return;
    window.__fadblockYoutubePruneActive = true;
    window.__fadblockYoutubeStage = 'init';

    var PLAYER_RE = /\/youtubei\/v\d+\/player\b/i;
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

    var ENFORCEMENT_SEL = [
    'ytd-enforcement-message-view-model',
    'yt-playability-error-supported-renderers',
    '#error-screen',
    '#enforcement-message',
    'tp-yt-paper-dialog.ytd-enforcement-message-view-model'
  ].join(',');

    function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

    function isAdObject(value) {
    if (!isObject(value)) return false;
    var keys = Object.keys(value);
    return keys.length > 0 && keys.every(function (key) {
      return AD_KEYS.has(key);
    });
  }

    function fixPlayability(payload) {
    if (!isObject(payload)) return payload;
    var status = payload.playabilityStatus;
    if (!isObject(status)) return payload;

    var reason = String(status.reason || '');
    var errorScreen = status.errorScreen || {};
    var isAdblockEnforcement =
      !!errorScreen.enforcementMessageRenderer ||
      !!errorScreen.adBlockerMessageRenderer ||
      /adblock|ad block|disable.+ad blocker|allow youtube ads/i.test(reason);

    if (!isAdblockEnforcement) return payload;

    payload.playabilityStatus = {
      status: 'OK',
      playableInEmbed: true
    };
    return payload;
  }

    function sanitize(value, depth) {
    depth = depth || 0;
    if (depth > 20 || value === null || typeof value !== 'object') return value;

    if (Array.isArray(value)) {
      var items = [];
      for (var i = 0; i < value.length; i += 1) {
        if (isAdObject(value[i])) continue;
        items.push(sanitize(value[i], depth + 1));
      }
      return items;
    }

    var out = {};
    var keys = Object.keys(value);
    for (var j = 0; j < keys.length; j += 1) {
      var key = keys[j];
      if (AD_KEYS.has(key)) continue;
      out[key] = sanitize(value[key], depth + 1);
    }
    if (Array.isArray(out.messages) && out.messages[0]) {
      try {
        delete out.messages[0].youThereRenderer;
      } catch (e) {}
    }
    return fixPlayability(out);
  }

    function cleanJson(text) {
    try {
      return JSON.stringify(sanitize(JSON.parse(text)));
    } catch (e) {
      return text;
    }
  }

    function cloneHeaders(headers) {
    var out = { 'content-type': 'application/json' };
    try {
      headers.forEach(function (value, key) {
        out[key] = value;
      });
    } catch (e) {}
    return out;
  }

    function makeResponse(text, source) {
    return new Response(text, {
      status: source && source.status ? source.status : 200,
      statusText: source && source.statusText ? source.statusText : '',
      headers: cloneHeaders(source && source.headers)
    });
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

    function cleanupEnforcement() {
    try {
      window.__fadblockCleanupTick = (window.__fadblockCleanupTick || 0) + 1;
      var nodes = document.querySelectorAll(ENFORCEMENT_SEL);
      for (var i = 0; i < nodes.length; i += 1) {
        var node = nodes[i];
        try {
          node.remove();
        } catch (e) {
          node.hidden = true;
          if (node.style) {
            node.style.setProperty('display', 'none', 'important');
            node.style.setProperty('visibility', 'hidden', 'important');
            node.style.setProperty('pointer-events', 'none', 'important');
          }
        }
      }

      var watchFlexy = document.querySelector('ytd-watch-flexy[player-unavailable]');
      if (watchFlexy) watchFlexy.removeAttribute('player-unavailable');

      var player = document.querySelector('#movie_player, .html5-video-player');
      if (player) {
        player.classList.remove('unstarted-mode');
        player.classList.remove('buffering-mode');
        player.classList.remove('ad-interrupting');
        player.removeAttribute('hidden');
      }

      var playerError = document.querySelector('.ytp-error');
      if (playerError && playerError.remove) playerError.remove();

      var docEl = document.documentElement;
      var body = document.body;
      if (docEl) docEl.style.removeProperty('overflow');
      if (body) body.style.removeProperty('overflow');

      var video = document.querySelector('#movie_player video, .html5-video-player video');
      var playButton = document.querySelector('.ytp-play-button');
      if (playButton && video && video.paused) {
        try { playButton.click(); } catch (e) {}
        try { video.play(); } catch (e) {}
      }
    } catch (e) {}
  }

    window.__fadblockYoutubeStage = 'defs-ready';
    var nativeFetch = typeof window.fetch === 'function' ? window.fetch.bind(window) : null;
    if (nativeFetch) {
      window.fetch = function (input, init) {
        var url = getUrl(input);
        if (!PLAYER_RE.test(url)) return nativeFetch(input, init);
        return nativeFetch(input, init).then(function (response) {
          var source = response.clone();
          return source.text().then(function (text) {
            return makeResponse(cleanJson(text), response);
          }).catch(function () {
            return response;
          });
        });
      };
    }

    window.__fadblockYoutubeStage = 'fetch-ready';
    var xhrOpen = XMLHttpRequest.prototype.open;
    var xhrSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
      this.__fadblockYoutubeUrl = typeof url === 'string' ? url : '';
      return xhrOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
      if (PLAYER_RE.test(this.__fadblockYoutubeUrl || '')) {
        this.addEventListener('readystatechange', function () {
          if (this.readyState !== 4) return;
          try {
            var cleaned = cleanJson(this.responseText);
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

    window.__fadblockYoutubeStage = 'xhr-ready';
    patchInitialPlayerResponse();
    window.__fadblockYoutubeStage = 'patched-initial';
    cleanupEnforcement();
    window.__fadblockYoutubeStage = 'cleanup-called';

    var cleanupRuns = 0;
    var cleanupTimer = setInterval(function () {
      cleanupRuns += 1;
      patchInitialPlayerResponse();
      cleanupEnforcement();
      if (cleanupRuns >= 240) clearInterval(cleanupTimer);
    }, 250);

    try {
      new MutationObserver(function () {
        cleanupEnforcement();
      }).observe(document.documentElement || document, {
        childList: true,
        subtree: true
      });
    } catch (e) {}

    setTimeout(cleanupEnforcement, 1000);
    setTimeout(cleanupEnforcement, 2500);
    setTimeout(cleanupEnforcement, 5000);
  } catch (error) {
    try {
      window.__fadblockYoutubeError = String(error && error.stack || error);
      window.__fadblockYoutubeStage = 'failed';
    } catch (e) {}
  }
})();
