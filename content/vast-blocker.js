(function () {
  const EMPTY_VAST = '<VAST version="3.0"/>';
  const EMPTY_JSON = '{}';

  // VAST/VPAID ad request patterns
  const VAST_RE = /(\bvast\b|vastroll|\/vastad[v]?\/|\/vastadv\/|\bpreroll\b|\/getad\b|\/ad\.xml\b|[?&]ad_type=|\/video-?ads?\b|[?&]roll=(?:pre|mid|post)|external_subid=)/i;
  // RTB instream endpoints (kodik and similar CIS players)
  const RTB_RE  = /\/rtb\/(kodik_instream|bid|preroll|instream|video_?ad)/i;
  // Generic ad XML loader pattern
  const ADXML_RE = /\/load-xml\/?\?.*[?&]roll=/i;

  function adType(url) {
    const u = String(url);
    if (RTB_RE.test(u) || ADXML_RE.test(u)) return 'rtb';
    if (VAST_RE.test(u))                     return 'vast';
    return null;
  }

  function emptyResponse(type) {
    if (type === 'rtb') {
      return new Response(EMPTY_JSON, { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(EMPTY_VAST, { status: 200, headers: { 'Content-Type': 'text/xml' } });
  }

  // Intercept fetch()
  const _fetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input?.url ?? '');
    const type = adType(url);
    if (type) return Promise.resolve(emptyResponse(type));
    return _fetch.apply(this, arguments);
  };

  // Intercept XMLHttpRequest
  const _open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    const type = adType(url);
    if (type === 'rtb') {
      arguments[1] = 'data:application/json,' + encodeURIComponent(EMPTY_JSON);
    } else if (type === 'vast') {
      arguments[1] = 'data:text/xml,' + encodeURIComponent(EMPTY_VAST);
    }
    return _open.apply(this, arguments);
  };
})();
