(function () {
  'use strict';

  const KEY = 'social_filter_enabled';

  const KEYWORDS = [
    'porn','xxx','nsfw','onlyfans','nude','naked','hentai','erotic',
    'blowjob','creampie','cumshot','masturbat','orgasm','fetish',
    'порно','секс','эротика','трах','минет',
    'seks','sikis','sikish','sikiş','pornografi',
  ];

  const host     = location.hostname;
  const isReddit  = host.includes('reddit.com');
  const isTikTok  = host.includes('tiktok.com');
  const isTwitter = host.includes('twitter.com') || host.includes('x.com');

  let enabled = false;
  let observer = null;
  let debounceTimer = null;

  function hasKeyword(text) {
    if (!text) return false;
    const lower = text.toLowerCase();
    return KEYWORDS.some(kw => lower.includes(kw));
  }

  function hideEl(el) {
    el.__fbFiltered = true;
    el.style.setProperty('display', 'none', 'important');
  }

  // ---- Reddit: NSFW badge + keyword filter ----
  function filterReddit() {
    document.querySelectorAll(
      '[data-testid="post-container"], .Post, shreddit-post, [data-fullname]'
    ).forEach(el => {
      if (el.__fbFiltered) return;
      if (el.querySelector('[data-testid="nsfw-badge"], .nsfw-flair') ||
          el.getAttribute('data-nsfw') === 'true' ||
          el.closest('[data-nsfw="true"]')) {
        hideEl(el); return;
      }
      const title = el.querySelector('h3')?.textContent || '';
      if (hasKeyword(title)) hideEl(el);
    });
  }

  // ---- TikTok: keyword in video description ----
  function filterTikTok() {
    document.querySelectorAll(
      '[class*="DivItemContainerV2"], [class*="VideoFeedItem"], article[data-e2e]'
    ).forEach(el => {
      if (el.__fbFiltered) return;
      const desc = el.querySelector('[data-e2e="video-desc"], [class*="SpanText"]')?.textContent || '';
      if (hasKeyword(desc)) hideEl(el);
    });
  }

  // ---- Twitter / X: keyword in tweet text ----
  function filterTwitter() {
    document.querySelectorAll('article[data-testid="tweet"]').forEach(el => {
      if (el.__fbFiltered) return;
      const text = el.querySelector('[data-testid="tweetText"]')?.textContent || '';
      if (hasKeyword(text)) hideEl(el);
    });
  }

  function filterAll() {
    if (isReddit)  filterReddit();
    if (isTikTok)  filterTikTok();
    if (isTwitter) filterTwitter();
  }

  function scheduleFilter() {
    if (debounceTimer) return;
    debounceTimer = setTimeout(() => { debounceTimer = null; filterAll(); }, 200);
  }

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(scheduleFilter);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function stopObserver() {
    observer?.disconnect();
    observer = null;
    if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
  }

  function restoreAll() {
    document.querySelectorAll('[style*="display: none"]').forEach(el => {
      if (el.__fbFiltered) { el.__fbFiltered = false; el.style.removeProperty('display'); }
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
