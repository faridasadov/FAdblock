const STATS_KEY          = 'adblock_stats';
const WHITELIST_KEY      = 'adblock_whitelist';
const ENABLED_KEY        = 'adblock_enabled';
const TAB_PREFIX         = 'tab_';
const SITE_STATS_KEY     = 'site_stats';
const CUSTOM_BLOCKED_KEY = 'custom_blocked';
const HISTORY_KEY        = 'block_history';
const FILTERS_META_KEY   = 'filters_meta';
const PAUSE_KEY          = 'adblock_pause_until';
const SITE_PAUSE_KEY     = 'site_pauses';
const NOTIF_ENABLED_KEY  = 'notifications_enabled';
const BADGE_COLOR_KEY    = 'badge_color';
const TYPE_STATS_KEY     = 'type_stats';
const ADULT_FILTER_KEY   = 'adult_filter_enabled';

const FILTER_RULE_BASE   = 10000;
const MAX_FILTER_RULES   = 4000;
const ADULT_RULE_BASE    = 50000;
const MAX_ADULT_RULES    = 200;
const MILESTONES = [100, 500, 1000, 5000, 10000, 50000, 100000];

const BADGE_COLORS = { red: '#e74c3c', blue: '#3498db', green: '#27ae60', purple: '#9b59b6' };

const ADULT_DOMAINS = [
  'pornhub.com','xvideos.com','xnxx.com','xhamster.com','redtube.com',
  'youporn.com','tube8.com','spankbang.com','eporner.com','beeg.com',
  'hclips.com','drtuber.com','tnaflix.com','porn.com','sex.com',
  'brazzers.com','realitykings.com','naughtyamerica.com','bangbros.com',
  'mofos.com','teamskeet.com','nutaku.net','gelbooru.com','e621.net',
  'rule34.xxx','danbooru.donmai.us','furaffinity.net','nhentai.net',
  'porno.ru','sex.ru','pornuha.ru','porno365.video',
  'pornofoto.ru','erofond.com','18plus.com','adult.com',
  'slutload.com','hellporno.com','fuq.com','txxx.com',
  'keezmovies.com','gotporn.com','ashemaletube.com',
];

function t(key, substitutions) {
  return chrome.i18n.getMessage(key, substitutions) || key;
}

function fmtNum(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}

// In-memory cache
let _enabled   = true;
let _whitelist = new Set();
const _tabUrls = new Map();

let _pauseUntil         = 0;
let _sitePauses         = {};
let _notifEnabled       = true;
let _badgeColor         = 'red';
let _adultFilterEnabled = false;

const _typeStats = { script: 0, image: 0, xmlhttprequest: 0, media: 0, sub_frame: 0, stylesheet: 0, other: 0 };

let _pendingTotal = 0;
let _pendingToday = 0;
const _tabCounts        = new Map();
const _pendingSiteStats = new Map();
let _flushTimer   = null;
const _dirtyTabs  = new Set();

// --- Domain list ---
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

const AD_URL_FILTERS = [...AD_DOMAINS].flatMap(d => [
  `*://${d}/*`, `*://*.${d}/*`
]);

// --- Init ---
async function loadState() {
  const data = await chrome.storage.local.get([
    ENABLED_KEY, WHITELIST_KEY, CUSTOM_BLOCKED_KEY, PAUSE_KEY, SITE_PAUSE_KEY,
    NOTIF_ENABLED_KEY, BADGE_COLOR_KEY, ADULT_FILTER_KEY
  ]);
  _enabled            = data[ENABLED_KEY] !== false;
  _whitelist          = new Set(data[WHITELIST_KEY] || []);
  _pauseUntil         = data[PAUSE_KEY] || 0;
  _sitePauses         = data[SITE_PAUSE_KEY] || {};
  _notifEnabled       = data[NOTIF_ENABLED_KEY] !== false;
  _badgeColor         = data[BADGE_COLOR_KEY] || 'red';
  _adultFilterEnabled = data[ADULT_FILTER_KEY] === true;

  // Restore DNR rules after browser restart
  await syncWhitelistRules(data[WHITELIST_KEY] || []);
  await syncCustomBlockedRules(data[CUSTOM_BLOCKED_KEY] || []);

  // Pull preferences from sync storage
  try {
    const sync = await chrome.storage.sync.get([NOTIF_ENABLED_KEY, BADGE_COLOR_KEY, ADULT_FILTER_KEY]);
    if (sync[NOTIF_ENABLED_KEY] !== undefined) _notifEnabled = sync[NOTIF_ENABLED_KEY] !== false;
    if (sync[BADGE_COLOR_KEY])                 _badgeColor   = sync[BADGE_COLOR_KEY];
    if (sync[ADULT_FILTER_KEY] !== undefined)  _adultFilterEnabled = sync[ADULT_FILTER_KEY] === true;
  } catch {}
}
loadState();

chrome.runtime.onStartup.addListener(() => {
  loadState().catch(() => {});
});

chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get([STATS_KEY, ENABLED_KEY, WHITELIST_KEY, CUSTOM_BLOCKED_KEY]);
  if (!data[STATS_KEY]) {
    await chrome.storage.local.set({
      [STATS_KEY]: { total: 0, today: 0, lastReset: new Date().toDateString() }
    });
  }
  if (data[ENABLED_KEY] === undefined) {
    await chrome.storage.local.set({ [ENABLED_KEY]: true });
  }
  await syncWhitelistRules(data[WHITELIST_KEY] || []);
  await syncCustomBlockedRules(data[CUSTOM_BLOCKED_KEY] || []);
  updateBadgeState(_enabled);

  chrome.alarms.get('updateFilters', existing => {
    if (!existing) chrome.alarms.create('updateFilters', { periodInMinutes: 10080 });
  });
  chrome.storage.local.get(FILTERS_META_KEY, d => {
    if (!d[FILTERS_META_KEY]) fetchAndUpdateFilters();
  });

  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'fb_pick',   title: t('contextMenuPick'),   contexts: ['all'] });
    chrome.contextMenus.create({ id: 'fb_domain', title: t('contextMenuDomain'), contexts: ['all'] });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;
  if (info.menuItemId === 'fb_pick') {
    chrome.tabs.sendMessage(tab.id, { type: 'ACTIVATE_PICKER' }).catch(() => {});
  } else if (info.menuItemId === 'fb_domain') {
    const raw = info.linkUrl || info.pageUrl;
    try {
      const domain = new URL(raw).hostname.replace(/^www\./, '');
      await blockCustomDomain(domain);
    } catch {}
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-adblock') await setGlobalEnabled(!_enabled);
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'updateFilters')  fetchAndUpdateFilters();
  if (alarm.name === 'resumeAdblock') {
    _pauseUntil = 0;
    chrome.storage.local.remove(PAUSE_KEY);
    updateBadgeState(_enabled);
    refreshBadgesForAllTabs();
  }
});

async function fetchAndUpdateFilters() {
  try {
    const res = await fetch(
      'https://pgl.yoyo.org/adservers/serverlist.php?hostformat=nohtml&showintro=0&mimetype=plaintext',
      { cache: 'no-store' }
    );
    if (!res.ok) return;
    const text = await res.text();
    const domains = text.split('\n')
      .map(l => l.trim().toLowerCase())
      .filter(l => l && !l.startsWith('#') && l.includes('.') && !l.includes(' '))
      .slice(0, MAX_FILTER_RULES);

    const allTypes = ['main_frame','sub_frame','script','stylesheet','image','font','xmlhttprequest','media','websocket','other'];
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const oldIds = existing.filter(r => r.id >= FILTER_RULE_BASE && r.id < FILTER_RULE_BASE + MAX_FILTER_RULES).map(r => r.id);

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: oldIds,
      addRules: domains.map((domain, i) => ({
        id: FILTER_RULE_BASE + i,
        priority: 1,
        action: { type: 'block' },
        condition: { urlFilter: `||${domain}^`, resourceTypes: allTypes }
      }))
    });

    await chrome.storage.local.set({
      [FILTERS_META_KEY]: { updated: new Date().toISOString(), count: domains.length }
    });
  } catch {}
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes[ENABLED_KEY])     _enabled   = changes[ENABLED_KEY].newValue !== false;
  if (changes[WHITELIST_KEY])   _whitelist = new Set(changes[WHITELIST_KEY].newValue || []);
  if (changes[PAUSE_KEY])       _pauseUntil = changes[PAUSE_KEY].newValue || 0;
  if (changes[SITE_PAUSE_KEY])  _sitePauses = changes[SITE_PAUSE_KEY].newValue || {};
  if (changes[BADGE_COLOR_KEY]) { _badgeColor = changes[BADGE_COLOR_KEY].newValue || 'red'; updateBadgeState(_enabled); }
  if (changes[NOTIF_ENABLED_KEY]) _notifEnabled = changes[NOTIF_ENABLED_KEY].newValue !== false;
});

// --- Badge ---
function updateBadgeState(enabled) {
  const paused = _pauseUntil > Date.now();
  const color  = BADGE_COLORS[_badgeColor] || BADGE_COLORS.red;
  chrome.action.setBadgeBackgroundColor({ color: (enabled && !paused) ? color : '#888' });
  chrome.action.setTitle({ title: enabled ? t('actionTitleActive') : t('actionTitleDisabled') });
  if (!enabled) {
    chrome.tabs.query({}).then(tabs => {
      tabs.forEach(tab => chrome.action.setBadgeText({ text: 'OFF', tabId: tab.id }).catch(() => {}));
    });
  } else if (paused) {
    chrome.tabs.query({}).then(tabs => {
      tabs.forEach(tab => chrome.action.setBadgeText({ text: '||', tabId: tab.id }).catch(() => {}));
    });
  }
}

function refreshBadgesForAllTabs() {
  chrome.tabs.query({}).then(tabs => {
    tabs.forEach(tab => {
      if (!tab.id) return;
      if (!_enabled) {
        chrome.action.setBadgeText({ text: 'OFF', tabId: tab.id }).catch(() => {});
        return;
      }
      if (_pauseUntil > Date.now()) {
        chrome.action.setBadgeText({ text: '||', tabId: tab.id }).catch(() => {});
        return;
      }
      const count = _tabCounts.get(tab.id) || 0;
      chrome.action.setBadgeText({
        text: count > 0 ? (count > 999 ? '1k+' : String(count)) : '',
        tabId: tab.id
      }).catch(() => {});
    });
  });
}

// --- Tab URL tracking ---
chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.status === 'loading' && tab.url) {
    try { _tabUrls.set(tabId, new URL(tab.url).hostname.replace(/^www\./, '')); } catch {}
    chrome.storage.session?.set({ [TAB_PREFIX + tabId]: 0 }).catch(() => {});
    if (_enabled && _pauseUntil <= Date.now()) chrome.action.setBadgeText({ text: '', tabId }).catch(() => {});
    else if (_pauseUntil > Date.now()) chrome.action.setBadgeText({ text: '||', tabId }).catch(() => {});
    else chrome.action.setBadgeText({ text: 'OFF', tabId }).catch(() => {});
  }
});

chrome.tabs.onRemoved.addListener(tabId => {
  _tabUrls.delete(tabId);
  _tabCounts.delete(tabId);
  chrome.storage.session?.remove(TAB_PREFIX + tabId).catch(() => {});
});

// --- Stats via webRequest ---
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.tabId < 0 || !_enabled) return;
    if (_pauseUntil > Date.now()) return;
    const tabHost = _tabUrls.get(details.tabId);
    if (tabHost && _whitelist.has(tabHost)) return;
    if (tabHost && _sitePauses[tabHost] && _sitePauses[tabHost] > Date.now()) return;

    const type = details.type in _typeStats ? details.type : 'other';
    _typeStats[type]++;

    incrementStats(details.tabId);
  },
  { urls: AD_URL_FILTERS }
);

function incrementStats(tabId) {
  _pendingTotal++;
  _pendingToday++;
  if (tabId > 0) {
    _tabCounts.set(tabId, (_tabCounts.get(tabId) || 0) + 1);
    _dirtyTabs.add(tabId);
    const count = _tabCounts.get(tabId);
    chrome.action.setBadgeText({
      text: count > 999 ? '1k+' : String(count),
      tabId
    }).catch(() => {});
    const host = _tabUrls.get(tabId);
    if (host) _pendingSiteStats.set(host, (_pendingSiteStats.get(host) || 0) + 1);
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
  const delta      = _pendingTotal;
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

  for (const tabId of _dirtyTabs) {
    const count = _tabCounts.get(tabId);
    if (count !== undefined) {
      await chrome.storage.session?.set({ [TAB_PREFIX + tabId]: count }).catch(() => {});
    }
  }
  _dirtyTabs.clear();

  if (_pendingSiteStats.size > 0) {
    const sd = await chrome.storage.local.get(SITE_STATS_KEY);
    const siteStats = sd[SITE_STATS_KEY] || {};
    for (const [host, cnt] of _pendingSiteStats) {
      siteStats[host] = (siteStats[host] || 0) + cnt;
    }
    _pendingSiteStats.clear();
    await chrome.storage.local.set({ [SITE_STATS_KEY]: siteStats });
  }

  const today = new Date().toDateString();
  const hd = await chrome.storage.local.get(HISTORY_KEY);
  const history = hd[HISTORY_KEY] || {};
  history[today] = (history[today] || 0) + delta;
  const days = Object.keys(history).sort((a, b) => new Date(a) - new Date(b));
  if (days.length > 7) days.slice(0, days.length - 7).forEach(d => delete history[d]);
  await chrome.storage.local.set({ [HISTORY_KEY]: history });

  if (_notifEnabled) {
    const prevTotal = stats.total - delta;
    for (const m of MILESTONES) {
      if (prevTotal < m && stats.total >= m) {
        chrome.notifications.create(`fb_milestone_${m}`, {
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: t('milestoneTitle'),
          message: t('milestoneMessage', [fmtNum(m)])
        }).catch(() => {});
        break;
      }
    }
  }
}

async function blockCustomDomain(domain) {
  const data = await chrome.storage.local.get(CUSTOM_BLOCKED_KEY);
  const list = data[CUSTOM_BLOCKED_KEY] || [];
  const updated = list.includes(domain) ? list : [...list, domain];
  if (!list.includes(domain)) {
    await chrome.storage.local.set({ [CUSTOM_BLOCKED_KEY]: updated });
    chrome.storage.sync.set({ [CUSTOM_BLOCKED_KEY]: updated }).catch(() => {});
  }
  await syncCustomBlockedRules(updated);
}

async function syncCustomBlockedRules(list) {
  const allTypes = ['main_frame','sub_frame','script','stylesheet','image','font','xmlhttprequest','media','websocket','other'];
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const blockIds = existing.filter(r => r.id >= 70000 && r.id < 80000).map(r => r.id);
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: blockIds,
    addRules: list.map((domain, i) => ({
      id: 70000 + i,
      priority: 999,
      action: { type: 'block' },
      condition: { urlFilter: `||${domain}^`, resourceTypes: allTypes }
    }))
  });
}

async function syncAdultFilterRules() {
  const allTypes = ['main_frame','sub_frame','script','stylesheet','image','font','xmlhttprequest','media','websocket','other'];
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const oldIds   = existing.filter(r => r.id >= ADULT_RULE_BASE && r.id < ADULT_RULE_BASE + MAX_ADULT_RULES).map(r => r.id);
  const addRules = _adultFilterEnabled
    ? ADULT_DOMAINS.slice(0, MAX_ADULT_RULES).map((domain, i) => ({
        id: ADULT_RULE_BASE + i,
        priority: 998,
        action: { type: 'block' },
        condition: { urlFilter: `||${domain}^`, resourceTypes: allTypes }
      }))
    : [];
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: oldIds, addRules });
}

// --- Global enable / disable ---
async function setGlobalEnabled(enabled) {
  _enabled = enabled;
  await chrome.storage.local.set({ [ENABLED_KEY]: enabled });
  updateBadgeState(enabled);
  refreshBadgesForAllTabs();
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

// --- Whitelist sync to DNR ---
async function syncWhitelistRules(list) {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const whitelistIds = existing.filter(r => r.id >= 90000 && r.id < 100000).map(r => r.id);
  const allTypes = ['main_frame','sub_frame','script','stylesheet','image','font','xmlhttprequest','media','websocket','other'];
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: whitelistIds,
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

    case 'SET_WHITELIST':
      chrome.storage.local.set({ [WHITELIST_KEY]: msg.list }).then(async () => {
        _whitelist = new Set(msg.list);
        await syncWhitelistRules(msg.list);
        chrome.storage.sync.set({ [WHITELIST_KEY]: msg.list }).catch(() => {});
        sendResponse({ ok: true });
      });
      return true;

    case 'RESET_STATS':
      _pendingTotal = 0;
      _pendingToday = 0;
      _tabCounts.clear();
      _pendingSiteStats.clear();
      _dirtyTabs.clear();
      Object.keys(_typeStats).forEach(k => _typeStats[k] = 0);
      if (_flushTimer) { clearTimeout(_flushTimer); _flushTimer = null; }
      chrome.storage.local.set({
        [STATS_KEY]: { total: 0, today: 0, lastReset: new Date().toDateString() }
      }).then(() => {
        refreshBadgesForAllTabs();
        sendResponse({ ok: true });
      });
      return true;

    case 'GET_SITE_STATS':
      chrome.storage.local.get(SITE_STATS_KEY)
        .then(d => sendResponse({ stats: d[SITE_STATS_KEY] || {} }));
      return true;

    case 'CLEAR_SITE_STATS':
      chrome.storage.local.set({ [SITE_STATS_KEY]: {} })
        .then(() => sendResponse({ ok: true }));
      return true;

    case 'BLOCK_DOMAIN':
      blockCustomDomain(msg.domain).then(() => sendResponse({ ok: true }));
      return true;

    case 'GET_CUSTOM_BLOCKED':
      chrome.storage.local.get(CUSTOM_BLOCKED_KEY)
        .then(d => sendResponse({ list: d[CUSTOM_BLOCKED_KEY] || [] }));
      return true;

    case 'REMOVE_CUSTOM_BLOCKED':
      chrome.storage.local.get(CUSTOM_BLOCKED_KEY).then(async d => {
        const updated = (d[CUSTOM_BLOCKED_KEY] || []).filter(x => x !== msg.domain);
        await chrome.storage.local.set({ [CUSTOM_BLOCKED_KEY]: updated });
        await syncCustomBlockedRules(updated);
        chrome.storage.sync.set({ [CUSTOM_BLOCKED_KEY]: updated }).catch(() => {});
        sendResponse({ ok: true });
      });
      return true;

    case 'GET_HISTORY':
      chrome.storage.local.get(HISTORY_KEY)
        .then(d => sendResponse({ history: d[HISTORY_KEY] || {} }));
      return true;

    case 'GET_FILTERS_META':
      chrome.storage.local.get(FILTERS_META_KEY)
        .then(d => sendResponse({ meta: d[FILTERS_META_KEY] || null }));
      return true;

    case 'UPDATE_FILTERS':
      fetchAndUpdateFilters().then(() => sendResponse({ ok: true }));
      return true;

    // --- Pause ---
    case 'SET_PAUSE': {
      const ms = (msg.minutes || 0) * 60000;
      if (ms > 0) {
        _pauseUntil = Date.now() + ms;
        chrome.storage.local.set({ [PAUSE_KEY]: _pauseUntil });
        chrome.alarms.create('resumeAdblock', { when: _pauseUntil });
      } else {
        _pauseUntil = 0;
        chrome.storage.local.remove(PAUSE_KEY);
        chrome.alarms.clear('resumeAdblock');
      }
      updateBadgeState(_enabled);
      refreshBadgesForAllTabs();
      sendResponse({ ok: true, until: _pauseUntil });
      return true;
    }

    case 'GET_PAUSE':
      sendResponse({ until: _pauseUntil, remaining: Math.max(0, _pauseUntil - Date.now()) });
      return true;

    // --- Per-site pause ---
    case 'SET_SITE_PAUSE': {
      const ms = (msg.minutes || 0) * 60000;
      if (ms > 0) {
        _sitePauses[msg.domain] = Date.now() + ms;
      } else {
        delete _sitePauses[msg.domain];
      }
      chrome.storage.local.set({ [SITE_PAUSE_KEY]: _sitePauses });
      sendResponse({ ok: true, until: _sitePauses[msg.domain] || 0 });
      return true;
    }

    case 'GET_SITE_PAUSE':
      sendResponse({
        until: _sitePauses[msg.domain] || 0,
        remaining: Math.max(0, (_sitePauses[msg.domain] || 0) - Date.now())
      });
      return true;

    // --- Notifications ---
    case 'SET_NOTIF_ENABLED':
      _notifEnabled = !!msg.enabled;
      chrome.storage.local.set({ [NOTIF_ENABLED_KEY]: _notifEnabled });
      chrome.storage.sync.set({ [NOTIF_ENABLED_KEY]: _notifEnabled }).catch(() => {});
      sendResponse({ ok: true });
      return true;

    case 'GET_NOTIF_ENABLED':
      sendResponse({ enabled: _notifEnabled });
      return true;

    // --- Badge color ---
    case 'SET_BADGE_COLOR':
      _badgeColor = msg.color;
      chrome.storage.local.set({ [BADGE_COLOR_KEY]: _badgeColor });
      chrome.storage.sync.set({ [BADGE_COLOR_KEY]: _badgeColor }).catch(() => {});
      updateBadgeState(_enabled);
      sendResponse({ ok: true });
      return true;

    case 'GET_BADGE_COLOR':
      sendResponse({ color: _badgeColor });
      return true;

    // --- Type stats ---
    case 'GET_TYPE_STATS':
      sendResponse({ stats: { ..._typeStats } });
      return true;

    case 'RESET_TYPE_STATS':
      Object.keys(_typeStats).forEach(k => _typeStats[k] = 0);
      sendResponse({ ok: true });
      return true;

    // --- Adult filter ---
    case 'SET_ADULT_FILTER':
      _adultFilterEnabled = !!msg.enabled;
      chrome.storage.local.set({ [ADULT_FILTER_KEY]: _adultFilterEnabled });
      chrome.storage.sync.set({ [ADULT_FILTER_KEY]: _adultFilterEnabled }).catch(() => {});
      syncAdultFilterRules().then(() => sendResponse({ ok: true }));
      return true;

    case 'GET_ADULT_FILTER':
      sendResponse({ enabled: _adultFilterEnabled });
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
  chrome.storage.sync.set({ [WHITELIST_KEY]: list }).catch(() => {});
  return { whitelisted: !wasListed };
}
