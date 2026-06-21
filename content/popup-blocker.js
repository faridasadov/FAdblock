// MAIN world — intercepts window.open to block popup/popunder ads
// Excluded from *.youtube.com to avoid interfering with player
(function () {
  if (window !== window.top) return;

  const _open = window.open.bind(window);
  let gestureAt = 0;
  let gestureOpens = 0;
  let lastClickTarget = null;

  ['click', 'mousedown', 'touchstart'].forEach(ev => {
    document.addEventListener(ev, e => {
      gestureAt = Date.now();
      gestureOpens = 0;
      lastClickTarget = e.target;
    }, true);
  });

  function getHost(url, base) {
    try { return new URL(url, base).hostname; } catch { return ''; }
  }

  window.open = function (url, target, features) {
    // No recent user gesture → popunder/auto popup
    if (Date.now() - gestureAt > 1200) return null;

    // Blank target = open then redirect trick
    if (!url || url === 'about:blank' || url.trim() === '') return null;

    gestureOpens++;

    // Block every popup after the first per gesture
    if (gestureOpens > 1) return null;

    const anchor = lastClickTarget?.closest('a');
    const href = anchor?.href ?? '';

    // Magnet/torrent link click → any window.open = ad
    if (href.startsWith('magnet:') || href.startsWith('torrent:')) return null;

    if (anchor && !href.startsWith('javascript:')) {
      const clickHost = getHost(href, location.href);
      const popHost  = getHost(url, location.href);
      const pageHost = location.hostname;

      // Same-site anchor → cross-domain popup = ad
      if (clickHost === pageHost && popHost && popHost !== pageHost) return null;

      // Anchor to site A, popup to unrelated site B = ad
      if (clickHost && popHost && clickHost !== pageHost && popHost !== clickHost) return null;
    }

    return _open(url, target, features);
  };
})();
