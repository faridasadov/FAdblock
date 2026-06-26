(function () {
  const EMPTY_VAST = '<VAST version="3.0"/>';

  // Patterns indicating a VAST/video ad fetch
  const AD_URL_RE = /(\bvast\b|\/preroll\b|\/getad\b|\/ad\.xml\b|[?&]ad_type=|\/video-?ads?\b)/i;

  function isAdUrl(url) {
    try { return AD_URL_RE.test(String(url)); } catch { return false; }
  }

  // Intercept fetch()
  const _fetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input?.url ?? '');
    if (isAdUrl(url)) {
      return Promise.resolve(new Response(EMPTY_VAST, {
        status: 200,
        headers: { 'Content-Type': 'text/xml' },
      }));
    }
    return _fetch.apply(this, arguments);
  };

  // Intercept XMLHttpRequest
  const _open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    if (isAdUrl(url)) {
      arguments[1] = 'data:text/xml,' + encodeURIComponent(EMPTY_VAST);
    }
    return _open.apply(this, arguments);
  };
})();
