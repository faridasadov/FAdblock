// Enforces SafeSearch on major search engines when adult filter is enabled.
// Runs at document_start — if SafeSearch param is missing it redirects once (no loop).
(async () => {
  try {
    const { adult_filter_enabled } = await chrome.storage.local.get('adult_filter_enabled');
    if (!adult_filter_enabled) return;

    const url = new URL(location.href);
    const host = url.hostname;
    let changed = false;

    if ((host === 'www.google.com' || host === 'google.com') && url.pathname === '/search') {
      if (url.searchParams.get('safe') !== 'active') {
        url.searchParams.set('safe', 'active');
        changed = true;
      }
    } else if ((host === 'www.bing.com' || host === 'bing.com') && url.pathname.startsWith('/search')) {
      if (url.searchParams.get('adlt') !== 'strict') {
        url.searchParams.set('adlt', 'strict');
        changed = true;
      }
    } else if (host === 'duckduckgo.com') {
      if (url.searchParams.get('kp') !== '1') {
        url.searchParams.set('kp', '1');
        changed = true;
      }
    } else if (host.includes('yandex.')) {
      if (url.searchParams.get('family') !== 'yes') {
        url.searchParams.set('family', 'yes');
        changed = true;
      }
    }

    if (changed) location.replace(url.toString());
  } catch {}
})();
