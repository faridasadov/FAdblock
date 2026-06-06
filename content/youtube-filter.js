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

  chrome.storage.local.get(KEY, data => apply(data[KEY] === true));

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && KEY in changes) apply(changes[KEY].newValue === true);
  });
})();
