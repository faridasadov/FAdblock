const STATS_KEY   = 'adblock_stats';
const WHITELIST_KEY = 'adblock_whitelist';
const ENABLED_KEY = 'adblock_enabled';
const TAB_PREFIX  = 'tab_';

// In-memory cache for hot-path (webRequest fires on every request)
let _enabled   = true;
let _whitelist = new Set();
const _tabUrls = new Map(); // tabId → hostname

// In-memory stats counters to avoid read-modify-write race conditions
let _pendingTotal = 0;
let _pendingToday = 0;
const _tabCounts  = new Map(); // tabId → count
let _flushTimer   = null;

// --- Domain list (kept in sync with generate-rules.js) ---
const AD_DOMAINS = new Set([
  'doubleclick.net','googlesyndication.com','googleadservices.com',
  'googletagservices.com','adservice.google.com',
  'adnxs.com','rubiconproject.com','pubmatic.com','openx.net','openx.com',
  'casalemedia.com','indexww.com','advertising.com','smartadserver.com',
  'contextweb.com','lijit.com','sovrn.com','spotxchange.com','spotx.tv',
  'mediamath.com','thetradedesk.com','adsrvr.org','turn.com',
  'taboola.com','outbrain.com','mgid.com','revcontent.com','zergnet.com',
  'content.ad','adblade.com',
  'scorecardresearch.com','quantserve.com','omtrdc.net','demdex.net',
  'bluekai.com','krxd.net','exelator.com','lotame.com',
  'addthis.com','sharethis.com','chartbeat.com','chartbeat.net',
  'facebook.net','ads-twitter.com','static.ads-twitter.com',
  'amazon-adsystem.com','criteo.com','criteo.net','hlserve.com',
  'an.yandex.ru','mc.yandex.ru',
  'moatads.com','moatpixel.com',
  'adtech.com','adtechus.com','adroll.com','undertone.com','springserve.com',
  'bidswitch.net','adform.net','adform.com','adcolony.com','mopub.com',
  'smaato.net','inmobi.com','ironsrc.com','vungle.com','chartboost.com',
  'flurry.com','trafficjunky.net','exoclick.com','adsterra.com',
  'propellerads.com','popads.net','adcash.com','zeropark.com',
  'trafficstars.com','applovin.com',
  'hotjar.com','clarity.ms','segment.io','segment.com',
  'mixpanel.com','amplitude.com','heap.io','fullstory.com',
  'logrocket.com','mouseflow.com','crazyegg.com','kissmetrics.com',
  'inspectlet.com','bounceexchange.com',
]);

function isAdHostname(hostname) {
  const h = hostname.toLowerCase();
  for (const d of AD_DOMAINS) {
    if (h === d || h.endsWith('.' + d)) return true;
  }
  return false;
}

// URL filters for webRequest — only fires for known ad domains (efficient)
const AD_URL_FILTERS = [...AD_DOMAINS].flatMap(d => [
  `*://${d}/*`, `*://*.${d}/*`
]);

// --- Init ---
async function loadState() {
  const data = await chrome.storage.local.get([ENABLED_KEY, WHITELIST_KEY]);
  _enabled   = data[ENABLED_KEY] !== false;
  _whitelist = new Set(data[WHITELIST_KEY] || []);
}
loadState();

chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get([STATS_KEY, ENABLED_KEY]);
  if (!data[STATS_KEY]) {
    await chrome.storage.local.set({
      [STATS_KEY]: { total: 0, today: 0, lastReset: new Date().toDateString() }
    });
  }
  if (data[ENABLED_KEY] === undefined) {
    await chrome.storage.local.set({ [ENABLED_KEY]: true });
  }
  updateBadgeState(_enabled);
});

// Keep cache in sync when storage changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes[ENABLED_KEY]) _enabled = changes[ENABLED_KEY].newValue !== false;
  if (changes[WHITELIST_KEY]) _whitelist = new Set(changes[WHITELIST_KEY].newValue || []);
});

// --- Badge ---
function updateBadgeState(enabled) {
  chrome.action.setBadgeBackgroundColor({ color: enabled ? '#e74c3c' : '#888' });
  chrome.action.setTitle({ title: enabled ? 'FAdblock — Aktiv' : 'FAdblock — Söndürülüb' });
  if (!enabled) {
    chrome.tabs.query({}).then(tabs => {
      tabs.forEach(t => chrome.action.setBadgeText({ text: 'OFF', tabId: t.id }).catch(() => {}));
    });
  }
}

// --- Tab URL tracking ---
chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.status === 'loading' && tab.url) {
    try { _tabUrls.set(tabId, new URL(tab.url).hostname.replace(/^www\./, '')); } catch {}
    chrome.storage.session?.set({ [TAB_PREFIX + tabId]: 0 }).catch(() => {});
    if (_enabled) chrome.action.setBadgeText({ text: '', tabId }).catch(() => {});
    else chrome.action.setBadgeText({ text: 'OFF', tabId }).catch(() => {});
  }
});

chrome.tabs.onRemoved.addListener(tabId => {
  _tabUrls.delete(tabId);
  _tabCounts.delete(tabId);
  chrome.storage.session?.remove(TAB_PREFIX + tabId).catch(() => {});
});

// --- Stats via webRequest (works in production, no dev mode needed) ---
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.tabId < 0 || !_enabled) return;
    const tabHost = _tabUrls.get(details.tabId);
    if (tabHost && _whitelist.has(tabHost)) return;
    incrementStats(details.tabId);
  },
  { urls: AD_URL_FILTERS }
);

function incrementStats(tabId) {
  _pendingTotal++;
  _pendingToday++;
  if (tabId > 0) {
    _tabCounts.set(tabId, (_tabCounts.get(tabId) || 0) + 1);
    const count = _tabCounts.get(tabId);
    chrome.action.setBadgeText({
      text: count > 999 ? '1k+' : String(count),
      tabId
    }).catch(() => {});
  }
  scheduleFlush();
}

function scheduleFlush() {
  if (_flushTimer) return;
  _flushTimer = setTimeout(flushStats, 500);
}

async function flushStats() {
  _flushTimer = null;
  if (_pendingTotal === 0) return;
  const delta = _pendingTotal;
  const deltaToday = _pendingToday;
  _pendingTotal = 0;
  _pendingToday = 0;

  const data  = await chrome.storage.local.get(STATS_KEY);
  const stats = data[STATS_KEY] || { total: 0, today: 0, lastReset: new Date().toDateString() };
  if (stats.lastReset !== new Date().toDateString()) {
    stats.today = 0;
    stats.lastReset = new Date().toDateString();
  }
  stats.total += delta;
  stats.today += deltaToday;
  await chrome.storage.local.set({ [STATS_KEY]: stats });

  for (const [tabId, count] of _tabCounts) {
    await chrome.storage.session?.set({ [TAB_PREFIX + tabId]: count }).catch(() => {});
  }
}

// --- Global enable / disable ---
async function setGlobalEnabled(enabled) {
  _enabled = enabled;
  await chrome.storage.local.set({ [ENABLED_KEY]: enabled });
  updateBadgeState(enabled);
  try {
    if (enabled) {
      await chrome.declarativeNetRequest.updateEnabledRulesets({
        enableRulesetIds: ['adblock_main'], disableRulesetIds: []
      });
    } else {
      await chrome.declarativeNetRequest.updateEnabledRulesets({
        enableRulesetIds: [], disableRulesetIds: ['adblock_main']
      });
    }
  } catch {}
}

// --- Whitelist sync to DNR dynamic rules ---
async function syncWhitelistRules(list) {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const allTypes = [
    'main_frame','sub_frame','script','stylesheet',
    'image','font','xmlhttprequest','media','websocket','other'
  ];
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map(r => r.id),
    addRules: list.map((domain, i) => ({
      id: 90000 + i,
      priority: 1000,
      action: { type: 'allow' },
      condition: { requestDomains: [domain], resourceTypes: allTypes }
    }))
  });
}

// --- Message handler ---
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.type) {
    case 'GET_STATS':
      chrome.storage.local.get(STATS_KEY)
        .then(d => sendResponse(d[STATS_KEY] || {}));
      return true;

    case 'GET_TAB_COUNT': {
      const key = TAB_PREFIX + msg.tabId;
      (chrome.storage.session?.get(key) ?? Promise.resolve({}))
        .then(d => sendResponse({ count: d[key] || 0 }));
      return true;
    }

    case 'GET_ENABLED':
      chrome.storage.local.get(ENABLED_KEY)
        .then(d => sendResponse({ enabled: d[ENABLED_KEY] !== false }));
      return true;

    case 'SET_ENABLED':
      setGlobalEnabled(msg.enabled).then(() => sendResponse({ ok: true }));
      return true;

    case 'IS_WHITELISTED':
      chrome.storage.local.get(WHITELIST_KEY)
        .then(d => sendResponse({ whitelisted: (d[WHITELIST_KEY] || []).includes(msg.domain) }));
      return true;

    case 'TOGGLE_WHITELIST':
      handleToggleWhitelist(msg.domain).then(sendResponse);
      return true;

    case 'GET_WHITELIST':
      chrome.storage.local.get(WHITELIST_KEY)
        .then(d => sendResponse({ list: d[WHITELIST_KEY] || [] }));
      return true;

    case 'RESET_STATS':
      chrome.storage.local.set({
        [STATS_KEY]: { total: 0, today: 0, lastReset: new Date().toDateString() }
      }).then(() => sendResponse({ ok: true }));
      return true;
  }
});

async function handleToggleWhitelist(domain) {
  const data = await chrome.storage.local.get(WHITELIST_KEY);
  let list = data[WHITELIST_KEY] || [];
  const wasListed = list.includes(domain);
  list = wasListed ? list.filter(d => d !== domain) : [...list, domain];
  await chrome.storage.local.set({ [WHITELIST_KEY]: list });
  await syncWhitelistRules(list);
  return { whitelisted: !wasListed };
}
