(function () {
  'use strict';

  const KEY = 'youtube_filter_enabled';

  // Specific enough to use substring match
  const EXACT_KEYWORDS = [
    'porn','xxx','nsfw','hentai','onlyfans','striptease','stripclub',
    'blowjob','creampie','cumshot','masturbat','orgasm','threesome',
    'squirt','fetish','sexvid','sexvideo','camgirl','camshow',
    // Russian
    'порно','эротика','хентай','трах','минет','голых','секс-',
    // Azerbaijani / Turkish
    'sikis','sikish','sikiş','pornografi','müstehcen',
  ];

  // Need whole-word match to avoid false positives:
  //   anal  → "analytical", "canal", "banal", "penal", "final"
  //   strip → "airstrip", "Sunset Strip" (legitimate)
  //   nude  → "nude makeup palette" (borderline but keep)
  //   naked → "naked eye", "Naked and Afraid" (survival show)
  //   milf  → rare false positive but add boundary anyway
  //   erotic → "erotic" alone is fine as word boundary
  const WORD_KEYWORDS = [
    'anal','strip','nude','naked','milf','erotic',
    'секс','голая','голый',
    'seks','erotik',
  ];

  const WORD_RE = new RegExp(
    '(?:^|[\\s\\-_,.|/#!?])(' +
    WORD_KEYWORDS.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') +
    ')(?:[\\s\\-_,.|/#!?]|$)',
    'i'
  );

  const CARD_SELECTOR = [
    'ytd-video-renderer',
    'ytd-compact-video-renderer',
    'ytd-grid-video-renderer',
    'ytd-rich-item-renderer',
    'yt-lockup-view-model',
    'ytd-search-pyv-renderer',
    'ytd-reel-item-renderer',      // Shorts
    'ytd-movie-renderer',
  ].join(',');

  let enabled = false;
  let observer = null;
  let debounceTimer = null;

  function hasAdultContent(text) {
    if (!text) return false;
    const lower = text.toLowerCase();
    if (EXACT_KEYWORDS.some(kw => lower.includes(kw))) return true;
    if (WORD_RE.test(text)) return true;
    return false;
  }

  function filterCard(el) {
    const titleEl = el.querySelector(
      '#video-title, .title, h3 a, #video-title-link, ' +
      '.yt-lockup-metadata-view-model__title, ' +
      '.ytd-reel-item-renderer #video-title'
    );
    const title = titleEl?.textContent?.trim() || '';
    const chanEl = el.querySelector(
      '#channel-name a, .channel-name, ' +
      '.yt-lockup-metadata-view-model__subtitle'
    );
    const channel = chanEl?.textContent?.trim() || '';

    const shouldHide = title && (hasAdultContent(title) || hasAdultContent(channel));

    if (shouldHide) {
      if (!el.__fbAdultFiltered) {
        el.__fbAdultFiltered = true;
        el.style.setProperty('display', 'none', 'important');
      }
    } else if (el.__fbAdultFiltered) {
      // Element was recycled with new clean content — restore it
      el.__fbAdultFiltered = false;
      el.style.removeProperty('display');
    }
  }

  function filterAll() {
    document.querySelectorAll(CARD_SELECTOR).forEach(filterCard);
  }

  function scheduleFilter() {
    if (debounceTimer) return;
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      filterAll();
    }, 200);
  }

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(scheduleFilter);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener('yt-navigate-finish', filterAll);
  }

  function stopObserver() {
    observer?.disconnect();
    observer = null;
    if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
    document.removeEventListener('yt-navigate-finish', filterAll);
  }

  function restoreAll() {
    document.querySelectorAll(CARD_SELECTOR).forEach(el => {
      if (el.__fbAdultFiltered) {
        el.__fbAdultFiltered = false;
        el.style.removeProperty('display');
      }
    });
  }

  function apply(on) {
    enabled = on;
    if (on) { filterAll(); startObserver(); }
    else    { stopObserver(); restoreAll(); }
  }

  // YouTube Restricted Mode via cookie — no extra permission needed
  // PREF=f4=4000000 activates YouTube's own server-side content restriction
  const YT_RESTRICTED_KEY = 'yt_restricted_mode';

  function getCookie(name) {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : '';
  }

  function setRestrictedMode(on) {
    const current = getCookie('PREF');
    const parts = current
      .split('&')
      .map(part => part.trim())
      .filter(Boolean);

    const values = new Map();
    for (const part of parts) {
      const idx = part.indexOf('=');
      if (idx === -1) values.set(part, '');
      else values.set(part.slice(0, idx), part.slice(idx + 1));
    }

    if (on) values.set('f4', '4000000');
    else values.delete('f4');

    const next = [...values.entries()]
      .map(([key, value]) => value === '' ? key : `${key}=${value}`)
      .join('&');

    if (next) {
      document.cookie = `PREF=${next}; domain=.youtube.com; path=/; max-age=31536000; SameSite=None; Secure`;
    } else {
      document.cookie = 'PREF=; domain=.youtube.com; path=/; max-age=0; SameSite=None; Secure';
    }
  }

  chrome.storage.local.get([KEY, YT_RESTRICTED_KEY], data => {
    apply(data[KEY] === true);
    setRestrictedMode(data[YT_RESTRICTED_KEY] === true);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      if (KEY in changes) apply(changes[KEY].newValue === true);
      if (YT_RESTRICTED_KEY in changes) setRestrictedMode(changes[YT_RESTRICTED_KEY].newValue === true);
    }
  });
})();
