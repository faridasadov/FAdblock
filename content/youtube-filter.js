(function () {
  'use strict';

  const KEY = 'youtube_filter_enabled';

  const KEYWORDS = [
    // English
    'porn','xxx','nude','naked','nsfw','erotic','hentai','uncensored',
    'milf','anal','blowjob','creampie','cumshot','masturbat','orgasm',
    'threesome','squirt','strip','fetish','sexvid','onlyfans',
    // Russian
    'порно','секс','голая','голый','эротика','хентай','трах','минет',
    // Azerbaijani
    'seks','erotik','sikis','sikish',
    // Turkish
    'sikiş','pornografi','müstehcen',
  ];

  const CARD_SELECTOR = [
    'ytd-video-renderer',
    'ytd-compact-video-renderer',
    'ytd-grid-video-renderer',
    'ytd-rich-item-renderer',
    'yt-lockup-view-model',
    'ytd-search-pyv-renderer',
  ].join(',');

  let enabled = false;
  let observer = null;

  function hasAdultKeyword(text) {
    const lower = text.toLowerCase();
    return KEYWORDS.some(kw => lower.includes(kw));
  }

  function filterCard(el) {
    if (el.__fbAdultFiltered) return;
    const titleEl = el.querySelector('#video-title, .title, h3 a, #video-title-link');
    const title   = titleEl?.textContent || '';
    const chanEl  = el.querySelector('#channel-name a, .channel-name');
    const channel = chanEl?.textContent || '';
    if (hasAdultKeyword(title) || hasAdultKeyword(channel)) {
      el.__fbAdultFiltered = true;
      el.style.setProperty('display', 'none', 'important');
    }
  }

  function filterAll() {
    document.querySelectorAll(CARD_SELECTOR).forEach(filterCard);
  }

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(filterAll);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function stopObserver() {
    observer?.disconnect();
    observer = null;
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
