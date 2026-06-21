// Enforces SafeSearch when adult filter is enabled.
// Handles both full navigations (document_start) and SPA pushState navigation.
(async () => {
  try {
    const { adult_filter_enabled } = await chrome.storage.local.get('adult_filter_enabled');
    if (!adult_filter_enabled) return;

    function safeParam(host) {
      if (host.includes('google.'))  return { key: 'safe',   val: 'active'  };
      if (host.includes('bing.com')) return { key: 'adlt',   val: 'strict'  };
      if (host === 'duckduckgo.com') return { key: 'kp',     val: '1'       };
      if (host.includes('yandex.')) return { key: 'family', val: 'yes'    };
      return null;
    }

    function enforce() {
      const url  = new URL(location.href);
      const host = url.hostname;
      const p    = safeParam(host);
      if (!p) return;

      // Only enforce on search-related paths
      const path = url.pathname;
      const isSearchPath =
        path.includes('/search') ||
        path.includes('/images') ||
        path.includes('/video')  ||
        path === '/' ||
        host === 'duckduckgo.com';
      if (!isSearchPath) return;

      if (url.searchParams.get(p.key) !== p.val) {
        url.searchParams.set(p.key, p.val);
        location.replace(url.toString());
      }
    }

    // Initial check on document load
    enforce();

    // Handle SPA navigation — Yandex/Bing use pushState between tabs
    const _push    = history.pushState.bind(history);
    const _replace = history.replaceState.bind(history);

    history.pushState = function (...args) {
      _push(...args);
      setTimeout(enforce, 30);
    };
    history.replaceState = function (...args) {
      _replace(...args);
      setTimeout(enforce, 30);
    };

    window.addEventListener('popstate', enforce);
  } catch {}
})();
