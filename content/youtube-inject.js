(function () {
  'use strict';

  const host = location.hostname.replace(/^www\./, '');
  const path = location.pathname;
  const isWatchPage = host.endsWith('youtube.com') &&
    (/^\/watch/.test(path) || /^\/shorts\//.test(path) || /^\/live\//.test(path));

  if (!isWatchPage) return;

  function shouldInject() {
    return new Promise((resolve) => {
      if (/firefox/i.test(navigator.userAgent)) {
        resolve(false);
        return;
      }
      chrome.storage.local.get(['adblock_enabled', 'category_settings'], (data) => {
        const enabled = data.adblock_enabled !== false;
        const categories = { youtubeBypass: true, ...(data.category_settings || {}) };
        resolve(enabled && categories.youtubeBypass !== false);
      });
    });
  }

  function injectPageScript() {
    const script = document.createElement('script');
    script.textContent = `(() => {
      'use strict';
      if (window.__fadblockYoutubePruneActive) return;
      window.__fadblockYoutubePruneActive = true;

      const IS_FIREFOX = /firefox/i.test(navigator.userAgent);
      const PLAYER_URL_RE = /\\/youtubei\\/v\\d+\\/player\\b|\\/playlist\\?list=|\\/watch\\?[tv]=|\\/get_watch\\?/i;
      const AD_KEYS = new Set(['adPlacements', 'playerAds', 'adSlots']);
      const nativeThen = Promise.prototype.then;

      function sanitizeString(text) {
        if (typeof text !== 'string') return text;
        let next = text;
        if (next.includes('playerResponse')) {
          next = next
            .replace(/"(adPlacements|adSlots|playerAds)":/g, '"no_ads":')
            .replace(/"youThereRenderer":/g, '"no_youThereRenderer":');
          if ((location.href.includes('/watch') || (next.includes('"cards"') && !next.includes('"miniplayer"'))) && next.includes('"muteOnStart":true')) {
            next = next.replace('"muteOnStart":true', '"muteOnStart":false');
          }
        }
        return next;
      }

      function sanitize(value, depth = 0) {
        if (depth > 12 || value == null || typeof value !== 'object') return value;
        if (Array.isArray(value)) {
          return value
            .map((item) => sanitize(item, depth + 1))
            .filter((item) => item !== undefined);
        }

        for (const key of AD_KEYS) {
          if (Object.prototype.hasOwnProperty.call(value, key)) {
            try { delete value[key]; } catch {}
          }
        }

        for (const [key, child] of Object.entries(value)) {
          if (AD_KEYS.has(key)) {
            try { delete value[key]; } catch {}
            continue;
          }
          value[key] = sanitize(child, depth + 1);
        }

        if (Array.isArray(value.entries)) {
          value.entries = value.entries.filter((entry) => {
            return !entry?.command?.reelWatchEndpoint?.adClientParams?.isAd;
          });
        }

        if (value.playerConfig?.audioConfig?.muteOnStart &&
            (location.href.includes('/watch') || (value.cards && !value.playabilityStatus?.miniplayer))) {
          try { delete value.playerConfig.audioConfig.muteOnStart; } catch {}
        }
        if (value.messages?.[0]?.youThereRenderer) {
          try { delete value.messages[0].youThereRenderer; } catch {}
        }

        return value;
      }

      function cleanJson(text) {
        try {
          return JSON.stringify(sanitize(JSON.parse(sanitizeString(text))));
        } catch {
          return sanitizeString(text);
        }
      }

      function getUrl(input) {
        try {
          if (typeof input === 'string') return input;
          if (input instanceof URL) return input.href;
          if (input instanceof Request) return input.url;
        } catch {}
        return '';
      }

      let initial = window.ytInitialPlayerResponse ? sanitize(window.ytInitialPlayerResponse) : undefined;
      try {
        Object.defineProperty(window, 'google_ad_status', {
          configurable: true,
          get() { return '1'; },
          set() {}
        });
      } catch {}
      try {
        Object.defineProperty(window, 'ytInitialPlayerResponse', {
          configurable: true,
          get() { return initial; },
          set(value) { initial = sanitize(value); }
        });
      } catch {}

      if (!IS_FIREFOX) {
        Promise.prototype.then = new Proxy(nativeThen, {
          apply(target, thisArg, args) {
            const [onFulfilled, onRejected] = args;

            if (typeof onFulfilled === 'function') {
              const source = Function.prototype.toString.call(onFulfilled);

              if (source.includes('onAbnormalityDetected')) {
                args[0] = function() {};
              } else if (source.includes('.next(')) {
                args[0] = function(value) {
                  if (typeof value?.value === 'string') value.value = sanitizeString(value.value);
                  return onFulfilled.call(this, value);
                };
              } else if (source.includes('jspbResponseCtor')) {
                args[0] = function(value) {
                  return onFulfilled.call(this, sanitize(value));
                };
              } else {
                args[0] = function(value) {
                  if (value && typeof value === 'object') return onFulfilled.call(this, sanitize(value));
                  return onFulfilled.call(this, value);
                };
              }
            }

            if (typeof onRejected === 'function') {
              args[1] = function(error) {
                return onRejected.call(this, error);
              };
            }

            return Reflect.apply(target, thisArg, args);
          }
        });
      }

      const nativeFetch = window.fetch.bind(window);
      window.fetch = async function(input, init) {
        const url = getUrl(input);
        const response = await nativeFetch(input, init);
        if (!PLAYER_URL_RE.test(url)) return response;
        try {
          const text = await response.text();
          return new Response(cleanJson(text), {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers
          });
        } catch {
          return response;
        }
      };

      const nativeOpen = XMLHttpRequest.prototype.open;
      const nativeSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this.__fbYtUrl = typeof url === 'string' ? url : '';
        return nativeOpen.call(this, method, url, ...rest);
      };
      XMLHttpRequest.prototype.send = function(body) {
        if (PLAYER_URL_RE.test(this.__fbYtUrl || '')) {
          this.addEventListener('readystatechange', function() {
            if (this.readyState !== 4) return;
            try {
              const cleaned = cleanJson(this.responseText);
              Object.defineProperty(this, 'responseText', { configurable: true, value: cleaned });
              Object.defineProperty(this, 'response', { configurable: true, value: cleaned });
            } catch {}
          });
        }
        return nativeSend.call(this, body);
      };
    })();`;
    (document.documentElement || document.head || document.body).appendChild(script);
    script.remove();
  }

  shouldInject().then((ok) => {
    if (ok) injectPageScript();
  });
})();
