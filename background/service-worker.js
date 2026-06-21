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
const CATEGORY_SETTINGS_KEY = 'category_settings';
const SITE_RULES_KEY        = 'site_rules';
const REQUEST_LOG_KEY       = 'request_log';
const USER_ACTIONS_KEY      = 'user_action_history';
const CUSTOM_SELECTORS_KEY  = 'custom_selectors';

const FILTER_RULE_BASE   = 10000;
const MAX_FILTER_RULES   = 4000;
const ADULT_KW_RULE_BASE = 49000;
const ADULT_KW_PATTERNS  = [
  '^https?://[^/?#]+\\.xxx([/?#]|$)',    // *.xxx TLD
  '^https?://[^/?#]+\\.adult([/?#]|$)', // *.adult TLD
  '^https?://[^/?#]+\\.porn([/?#]|$)',  // *.porn TLD
  '^https?://[^/?#]*porno',             // "porno" anywhere in hostname
  '^https?://[^/?#]*trah',             // "trah*" in hostname (vtrahe, trahnuli, trah.tv)
  '^https?://[^/?#]*trach',            // "trach*" in hostname (trachtube)
  '^https?://[^/?#]*erotik',           // "erotik*" in hostname (erotika.ru — CIS spelling)
  '^https?://[^/?#]*seks[^ei]',        // "seks" in hostname — avoids "seksi" (Indonesian legit)
  '^https?://(www\\.)?sex',             // hostname starts with "sex"
  '^https?://[^/?#]*\\.sex\\.',         // ".sex." label in hostname
  '^https?://(www\\.)?xxx',             // hostname starts with "xxx"
  '^https?://([^./?#:]+\\.)?pornhub\\.[^./?#:]+([:/?#]|$)',
  '^https?://([^./?#:]+\\.)?xhamster\\.[^./?#:]+([:/?#]|$)',
  '^https?://([^./?#:]+\\.)?xnxx\\.[^./?#:]+([:/?#]|$)',
  '^https?://([^./?#:]+\\.)?xvideos\\.[^./?#:]+([:/?#]|$)',
  '^https?://([^./?#:]+\\.)?redtube\\.[^./?#:]+([:/?#]|$)',
  '^https?://([^./?#:]+\\.)?youporn\\.[^./?#:]+([:/?#]|$)',
  '^https?://([^./?#:]+\\.)?tube8\\.[^./?#:]+([:/?#]|$)',
  '^https?://([^./?#:]+\\.)?spankbang\\.[^./?#:]+([:/?#]|$)',
  '^https?://([^./?#:]+\\.)?eporner\\.[^./?#:]+([:/?#]|$)',
  '^https?://([^./?#:]+\\.)?beeg\\.[^./?#:]+([:/?#]|$)',
  '^https?://([^./?#:]+\\.)?toppornsites\\.[^./?#:]+([:/?#]|$)',
  '^https?://([^./?#:]+\\.)?yaeby\\.[^./?#:]+([:/?#]|$)',
  '^https?://([^./?#:]+\\.)?tarfehalshaml\\.[^./?#:]+([:/?#]|$)',
  '^https?://[^/?#]*\\bfap[-.]',
  '^https?://[^/?#]*hentai[^/?#]*',
  '^https?://[^/?#]*rule34[^/?#]*',
  '^https?://[^/?#]*onlyfans[^/?#]*',
  '^https?://[^/?#]*camgirl[^/?#]*',
  '^https?://[^/?#]*fetish[^/?#]*',
  '^https?://[^/?#]*milf[^/?#]*',
  '^https?://[^/?#]*nsfw[^/?#]*',
  '^https?://[^/?#]*nude[^/?#]*',
  '^https?://[^/?#]*erotic[^/?#]*',
  '^https?://[^?#]*/[^?#]*(?:porno|porn|hentai|rule34|nsfw|camgirl|fap|erotic|fetish|milf)[^?#]*([?#/]|$)',
];
const ADULT_RULE_BASE    = 50000;
const MAX_ADULT_RULES    = 50000; // max domains stored in cache
const MAX_ADULT_DOMAIN_RULES = 900; // DNR cap: 5000 total limit − 4000 filter rules − ~100 others
const RECOVERY_RULE_BASE = 85000;
const MAX_RECOVERY_RULES = 500;
const ADULT_META_KEY     = 'adult_filter_meta';
const ADULT_DOMAINS_KEY  = 'adult_filter_domains';
const MILESTONES = [100, 500, 1000, 5000, 10000, 50000, 100000];
const DISABLED_DYNAMIC_STATE_KEY = '_disabled_dynamic_rule_sets';
const MAX_REQUEST_LOG = 250;
const MAX_USER_ACTIONS = 60;

const BADGE_COLORS = { red: '#e74c3c', blue: '#3498db', green: '#27ae60', purple: '#9b59b6' };
const DEFAULT_CATEGORY_SETTINGS = {
  network: true,
  cosmetic: true,
  customSelectors: true,
  youtubeBypass: true,
  youtubeFilter: true,
  restrictedMode: true,
  socialFilter: true,
  adultFilter: false,
};

// Fallback list used until the full list is fetched
const ADULT_DOMAINS_FALLBACK = [
  // Global
  'pornhub.com','xvideos.com','xnxx.com','xhamster.com','redtube.com',
  'pornhub.org','pornhub.net','xhamster.de','xhamster2.com','xhamster18.com',
  'toppornsites.com',
  'yaeby.pro','tarfehalshaml.net',
  'youporn.com','tube8.com','spankbang.com','eporner.com','beeg.com',
  'hclips.com','drtuber.com','tnaflix.com','porn.com','sex.com',
  'brazzers.com','realitykings.com','naughtyamerica.com','bangbros.com',
  'mofos.com','teamskeet.com','nutaku.net','nhentai.net','rule34.xxx',
  'slutload.com','fuq.com','txxx.com','4tube.com','empflix.com',
  'porntrex.com','vporn.com','porndig.com','hdtube.porn','fullporn.tv',
  // Russian / CIS
  'porno.ru','sex.ru','pornuha.ru','porno365.com','pornoro.ru',
  'russkoe-porno.ru','hd-porn.ru','megaporno.ru','porno-video.ru',
  'xxxhd.ru','pornotub.ru','sexvideo.ru','erotika.ru','pornhd.ru',
  'trah.tv','pornomam.com','0porn.ru','xxxcis.com','pornlab.ru',
  'sexpics.ru','pornolab.net','trachtube.com','russkieporno.ru',
  'porno365.ru','sexfilmi.ru','porno-go.ru','pussyspace.com',
  'pussyspace.net','trahnuli.com','nashe-porno.ru','seks-video.ru',
  '2porno365.run','sex-studentki.live','sex-studentki.ru',
  // Additional domains reported by users
  'bysex.net','strip2.co','vtrahe.work',
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
let _categorySettings   = { ...DEFAULT_CATEGORY_SETTINGS };
let _siteRules          = {};

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

self.addEventListener('unhandledrejection', (event) => {
  console.error('FAdblock service worker unhandled rejection:', event.reason);
});

self.addEventListener('error', (event) => {
  console.error('FAdblock service worker error:', event.message, event.filename, event.lineno, event.colno);
});

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function mergeCategorySettings(raw) {
  return { ...DEFAULT_CATEGORY_SETTINGS, ...(raw || {}) };
}

function normalizeDomain(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/^(https?:\/\/)?(www\.)?/, '')
    .replace(/\/.*$/, '');
}

function getSiteRule(domain) {
  return _siteRules[normalizeDomain(domain)] || null;
}

function hasActiveSiteRecovery(domain) {
  const rule = getSiteRule(domain);
  return !!(rule?.recoveryUntil && rule.recoveryUntil > Date.now());
}

function getActiveRecoveryDomains() {
  return Object.entries(_siteRules)
    .filter(([, rule]) => rule?.recoveryUntil && rule.recoveryUntil > Date.now())
    .map(([domain]) => domain)
    .slice(0, MAX_RECOVERY_RULES);
}

function cleanupSiteRulesObject(siteRules) {
  const next = {};
  for (const [domain, rule] of Object.entries(siteRules || {})) {
    const cleanDomain = normalizeDomain(domain);
    if (!cleanDomain || typeof rule !== 'object' || !rule) continue;
    const cleaned = {};
    if (rule.disableCosmetic) cleaned.disableCosmetic = true;
    if (rule.disableCustomSelectors) cleaned.disableCustomSelectors = true;
    if (rule.disableYouTubeFilter) cleaned.disableYouTubeFilter = true;
    if (rule.disableSocialFilter) cleaned.disableSocialFilter = true;
    if (rule.recoveryUntil && rule.recoveryUntil > Date.now()) cleaned.recoveryUntil = rule.recoveryUntil;
    if (Object.keys(cleaned).length) next[cleanDomain] = cleaned;
  }
  return next;
}

function isYouTubeWatchUrl(url) {
  try {
    const parsed = new URL(url);
    if (!/(\.|^)youtube\.com$/i.test(parsed.hostname)) return false;
    return /^\/watch/.test(parsed.pathname) || /^\/shorts\//.test(parsed.pathname) || /^\/live\//.test(parsed.pathname);
  } catch {
    return false;
  }
}

async function rearmYouTubeTabs(options = {}) {
  const { reload = false } = options;
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ url: ['*://*.youtube.com/*'] });
  } catch {
    tabs = await chrome.tabs.query({});
  }
  for (const tab of tabs) {
    if (!tab.id || !tab.url || !isYouTubeWatchUrl(tab.url)) continue;
    if (reload) {
      chrome.tabs.reload(tab.id).catch(() => {});
      continue;
    }
    chrome.tabs.sendMessage(tab.id, { type: 'FADBLOCK_REARM_YOUTUBE' }).catch(() => {});
  }
}

function getRequestLogLabel(ruleId) {
  if (ruleId >= FILTER_RULE_BASE && ruleId < FILTER_RULE_BASE + MAX_FILTER_RULES) return 'dynamic-filter';
  if (ruleId >= ADULT_KW_RULE_BASE && ruleId < ADULT_KW_RULE_BASE + ADULT_KW_PATTERNS.length + 10) return 'adult-keyword';
  if (ruleId >= ADULT_RULE_BASE && ruleId < ADULT_RULE_BASE + MAX_ADULT_DOMAIN_RULES) return 'adult-filter';
  if (ruleId >= 70000 && ruleId < 80000) return 'custom-block';
  if (ruleId >= RECOVERY_RULE_BASE && ruleId < RECOVERY_RULE_BASE + MAX_RECOVERY_RULES) return 'site-recovery';
  if (ruleId >= 90000 && ruleId < 100000) return 'whitelist';
  return 'static-filter';
}

async function appendRequestLog(entry) {
  const data = await chrome.storage.local.get(REQUEST_LOG_KEY);
  const list = data[REQUEST_LOG_KEY] || [];
  list.unshift(entry);
  if (list.length > MAX_REQUEST_LOG) list.length = MAX_REQUEST_LOG;
  await chrome.storage.local.set({ [REQUEST_LOG_KEY]: list });
}

async function pushUserAction(label, previousState) {
  const data = await chrome.storage.local.get(USER_ACTIONS_KEY);
  const list = data[USER_ACTIONS_KEY] || [];
  list.unshift({
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    label,
    at: new Date().toISOString(),
    previousState: clone(previousState || {}),
  });
  if (list.length > MAX_USER_ACTIONS) list.length = MAX_USER_ACTIONS;
  await chrome.storage.local.set({ [USER_ACTIONS_KEY]: list });
}

// --- Init ---
async function loadState() {
  const data = await chrome.storage.local.get([
    ENABLED_KEY, WHITELIST_KEY, CUSTOM_BLOCKED_KEY, PAUSE_KEY, SITE_PAUSE_KEY,
    NOTIF_ENABLED_KEY, BADGE_COLOR_KEY, ADULT_FILTER_KEY,
    CATEGORY_SETTINGS_KEY, SITE_RULES_KEY
  ]);
  _enabled            = data[ENABLED_KEY] !== false;
  _whitelist          = new Set(data[WHITELIST_KEY] || []);
  _pauseUntil         = data[PAUSE_KEY] || 0;
  _sitePauses         = data[SITE_PAUSE_KEY] || {};
  _notifEnabled       = data[NOTIF_ENABLED_KEY] !== false;
  _badgeColor         = data[BADGE_COLOR_KEY] || 'red';
  _adultFilterEnabled = data[ADULT_FILTER_KEY] === true;
  _categorySettings   = mergeCategorySettings(data[CATEGORY_SETTINGS_KEY]);
  _siteRules          = cleanupSiteRulesObject(data[SITE_RULES_KEY] || {});
  _categorySettings.adultFilter = _adultFilterEnabled;

  // Pull preferences from sync storage
  try {
    const sync = await chrome.storage.sync.get([
      NOTIF_ENABLED_KEY, BADGE_COLOR_KEY, ADULT_FILTER_KEY,
      WHITELIST_KEY, CUSTOM_BLOCKED_KEY, CATEGORY_SETTINGS_KEY, SITE_RULES_KEY,
    ]);
    if (sync[NOTIF_ENABLED_KEY] !== undefined) _notifEnabled = sync[NOTIF_ENABLED_KEY] !== false;
    if (sync[BADGE_COLOR_KEY])                 _badgeColor   = sync[BADGE_COLOR_KEY];
    if (sync[ADULT_FILTER_KEY] !== undefined)  _adultFilterEnabled = sync[ADULT_FILTER_KEY] === true;
    if ((!data[WHITELIST_KEY] || data[WHITELIST_KEY].length === 0) && Array.isArray(sync[WHITELIST_KEY])) {
      _whitelist = new Set(sync[WHITELIST_KEY]);
    }
    if ((!data[CUSTOM_BLOCKED_KEY] || data[CUSTOM_BLOCKED_KEY].length === 0) && Array.isArray(sync[CUSTOM_BLOCKED_KEY])) {
      data[CUSTOM_BLOCKED_KEY] = sync[CUSTOM_BLOCKED_KEY];
    }
    if (!data[CATEGORY_SETTINGS_KEY] && sync[CATEGORY_SETTINGS_KEY]) {
      _categorySettings = mergeCategorySettings(sync[CATEGORY_SETTINGS_KEY]);
      _categorySettings.adultFilter = _adultFilterEnabled;
    }
    if ((!data[SITE_RULES_KEY] || Object.keys(data[SITE_RULES_KEY]).length === 0) && sync[SITE_RULES_KEY]) {
      _siteRules = cleanupSiteRulesObject(sync[SITE_RULES_KEY]);
    }
  } catch {}

  await chrome.storage.local.set({
    [NOTIF_ENABLED_KEY]: _notifEnabled,
    [BADGE_COLOR_KEY]: _badgeColor,
    [ADULT_FILTER_KEY]: _adultFilterEnabled,
    [CATEGORY_SETTINGS_KEY]: _categorySettings,
    [WHITELIST_KEY]: [..._whitelist],
    [CUSTOM_BLOCKED_KEY]: data[CUSTOM_BLOCKED_KEY] || [],
    [SITE_RULES_KEY]: _siteRules,
  }).catch(() => {});

  // Restore DNR rules after browser restart using final merged state
  await syncWhitelistRules([..._whitelist]);
  await syncCustomBlockedRules(data[CUSTOM_BLOCKED_KEY] || []);
  await syncAdultFilterRulesSafe();
  await syncSiteRecoveryRules();
  await syncBlockingRulesState();

  // Restore filter list rules if they were lost (browser update / storage wipe)
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const hasFilterRules = existing.some(r => r.id >= FILTER_RULE_BASE && r.id < FILTER_RULE_BASE + MAX_FILTER_RULES);
  if (_categorySettings.network !== false && !hasFilterRules) fetchAndUpdateFilters().catch(() => {});

  rearmYouTubeTabs({ reload: true }).catch(() => {});
}
loadState().catch((error) => {
  console.error('FAdblock loadState failed:', error);
});

chrome.runtime.onStartup.addListener(() => {
  loadState().catch((error) => {
    console.error('FAdblock onStartup loadState failed:', error);
  });
});

chrome.runtime.onInstalled.addListener(async () => {
  try {
    const data = await chrome.storage.local.get([
      STATS_KEY, ENABLED_KEY, WHITELIST_KEY, CUSTOM_BLOCKED_KEY,
      CATEGORY_SETTINGS_KEY, SITE_RULES_KEY
    ]);
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
    _categorySettings = mergeCategorySettings(data[CATEGORY_SETTINGS_KEY]);
    _siteRules = cleanupSiteRulesObject(data[SITE_RULES_KEY] || {});
    await syncSiteRecoveryRules();
    await syncBlockingRulesState();
    updateBadgeState(_enabled);
    rearmYouTubeTabs({ reload: true }).catch(() => {});

    chrome.alarms.get('updateFilters', existing => {
      if (!existing) chrome.alarms.create('updateFilters', { periodInMinutes: 10080 });
    });
    chrome.alarms.get('updateAdultFilter', existing => {
      if (!existing) chrome.alarms.create('updateAdultFilter', { periodInMinutes: 10080 });
    });
    chrome.storage.local.get(FILTERS_META_KEY, d => {
      if (!d[FILTERS_META_KEY]) fetchAndUpdateFilters().catch((error) => {
        console.error('FAdblock initial filter fetch failed:', error);
      });
    });

    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({ id: 'fb_pick',   title: t('contextMenuPick'),   contexts: ['all'] });
      chrome.contextMenus.create({ id: 'fb_domain', title: t('contextMenuDomain'), contexts: ['all'] });
    });
  } catch (error) {
    console.error('FAdblock onInstalled failed:', error);
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
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
  } catch (error) {
    console.error('FAdblock context menu handler failed:', error);
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  try {
    if (command === 'toggle-adblock') await setGlobalEnabled(!_enabled);
  } catch (error) {
    console.error('FAdblock command handler failed:', error);
  }
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'updateFilters')      fetchAndUpdateFilters();
  if (alarm.name === 'updateAdultFilter')  fetchAndUpdateAdultRules();
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
  if (changes[CATEGORY_SETTINGS_KEY]) _categorySettings = mergeCategorySettings(changes[CATEGORY_SETTINGS_KEY].newValue);
  if (changes[SITE_RULES_KEY]) _siteRules = cleanupSiteRulesObject(changes[SITE_RULES_KEY].newValue || {});
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
    if (tabHost && hasActiveSiteRecovery(tabHost)) return;

    const type = details.type in _typeStats ? details.type : 'other';
    _typeStats[type]++;
    let requestHost = '';
    try { requestHost = normalizeDomain(new URL(details.url).hostname); } catch {}
    appendRequestLog({
      at: new Date().toISOString(),
      category: 'network',
      source: 'webRequest',
      tabId: details.tabId,
      initiator: tabHost || '',
      url: details.url,
      host: requestHost,
      requestType: details.type,
    }).catch(() => {});

    incrementStats(details.tabId);
  },
  { urls: AD_URL_FILTERS }
);

const dnrDebugEvent = chrome.declarativeNetRequest?.['onRuleMatchedDebug'];
if (dnrDebugEvent?.addListener) {
  dnrDebugEvent.addListener((info) => {
    const url = info.request?.url || '';
    let host = '';
    try { host = normalizeDomain(new URL(url).hostname); } catch {}
    appendRequestLog({
      at: new Date().toISOString(),
      category: getRequestLogLabel(info.rule?.ruleId),
      source: 'dnr',
      ruleId: info.rule?.ruleId || 0,
      tabId: info.request?.tabId ?? info.tabId ?? -1,
      initiator: normalizeDomain(info.request?.initiator || info.request?.documentUrl || ''),
      url,
      host,
      requestType: info.request?.type || '',
    }).catch(() => {});
  });
}

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
  const cleanDomain = normalizeDomain(domain);
  if (list.includes(cleanDomain)) return;
  await setCustomBlockedList([...list, cleanDomain], {
    label: `Blocked ${cleanDomain}`,
    previousState: list,
  });
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

const BON_APPETIT_META = 'https://raw.githubusercontent.com/Bon-Appetit/porn-domains/main/meta.json';
const BON_APPETIT_BASE = 'https://raw.githubusercontent.com/Bon-Appetit/porn-domains/main/';
const STEVEN_BLACK_URL = 'https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/porn-only/hosts';

function isPriorityAdultDomain(domain) {
  return /\.(ru|ua|by|kz|uz|xxx|adult|porn|sex)$/.test(domain) ||
    /porno|porn|sex|xxx|nude|hentai|erotic|milf|fetish|onlyfan|camgirl|adult/.test(domain);
}

function mergeAdultDomains(...lists) {
  const seen = new Set();
  const priority = [];
  const rest = [];

  for (const domain of ADULT_DOMAINS_FALLBACK) {
    const clean = normalizeDomain(domain);
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    priority.push(clean);
  }

  for (const list of lists) {
    for (const rawDomain of list || []) {
      const clean = normalizeDomain(rawDomain);
      if (!clean || !clean.includes('.') || seen.has(clean)) continue;
      seen.add(clean);
      if (isPriorityAdultDomain(clean)) priority.push(clean);
      else rest.push(clean);
      if (priority.length + rest.length >= MAX_ADULT_RULES) {
        return [...priority, ...rest].slice(0, MAX_ADULT_RULES);
      }
    }
  }

  return [...priority, ...rest].slice(0, MAX_ADULT_RULES);
}

async function fetchAndUpdateAdultRules() {
  try {
    // Combine multiple large sources instead of treating them as mutual fallbacks.
    const [bonAppetit, stevenBlack] = await Promise.all([
      _fetchBonAppetit(),
      _fetchStevenBlack(),
    ]);
    const domains = mergeAdultDomains(bonAppetit, stevenBlack);
    if (!domains.length) return;

    await chrome.storage.local.set({
      [ADULT_DOMAINS_KEY]: domains,
      [ADULT_META_KEY]: { updated: new Date().toISOString(), count: domains.length }
    });
    if (_adultFilterEnabled) await syncAdultFilterRulesSafe();
  } catch {}
}

async function _fetchBonAppetit() {
  try {
    const metaRes = await fetch(BON_APPETIT_META, { cache: 'no-store' });
    if (!metaRes.ok) return [];
    const meta = await metaRes.json();
    const filename = meta?.blocklist?.name;
    if (!filename) return [];

    const res = await fetch(BON_APPETIT_BASE + filename, { cache: 'no-store' });
    if (!res.ok) return [];
    const text = await res.text();

    const domains = [];

    for (const line of text.split('\n')) {
      const domain = line.trim().toLowerCase();
      if (!domain || domain.startsWith('#') || !domain.includes('.')) continue;
      const clean = domain.startsWith('www.') ? domain.slice(4) : domain;
      domains.push(clean);
    }

    return domains;
  } catch { return []; }
}

async function _fetchStevenBlack() {
  try {
    const res = await fetch(STEVEN_BLACK_URL, { cache: 'no-store' });
    if (!res.ok) return [];
    const text = await res.text();
    const domains = [];
    for (const line of text.split('\n')) {
      if (line.startsWith('#') || !line.trim()) continue;
      const parts = line.trim().split(/\s+/);
      if (parts.length < 2) continue;
      let domain = parts[1].toLowerCase();
      if (!domain.includes('.') || domain === '0.0.0.0') continue;
      if (domain.startsWith('www.')) domain = domain.slice(4);
      domains.push(domain);
    }
    return domains;
  } catch { return []; }
}

async function syncAdultKeywordRules() {
  const allTypes = ['main_frame','sub_frame','script','stylesheet','image','font','xmlhttprequest','media','websocket','other'];
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const oldIds   = existing
    .filter(r => r.id >= ADULT_KW_RULE_BASE && r.id < ADULT_KW_RULE_BASE + ADULT_KW_PATTERNS.length + 10)
    .map(r => r.id);

  if (!_adultFilterEnabled) {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: oldIds, addRules: [] });
    return;
  }

  const addRules = ADULT_KW_PATTERNS
    .map((regexFilter, i) => ({
      id: ADULT_KW_RULE_BASE + i,
      priority: 999,
      action: { type: 'block' },
      condition: { regexFilter, isUrlFilterCaseSensitive: false, resourceTypes: allTypes }
    }));

  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: oldIds, addRules });
}

async function syncAdultFilterRules() {
  await syncAdultKeywordRules();

  const allTypes = ['main_frame','sub_frame','script','stylesheet','image','font','xmlhttprequest','media','websocket','other'];
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const oldIds   = existing
    .filter(r => r.id >= ADULT_RULE_BASE && r.id < ADULT_RULE_BASE + MAX_ADULT_DOMAIN_RULES)
    .map(r => r.id);

  if (!_adultFilterEnabled) {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: oldIds, addRules: [] });
    return;
  }

  const data = await chrome.storage.local.get(ADULT_DOMAINS_KEY);
  const list = (data[ADULT_DOMAINS_KEY]?.length ? data[ADULT_DOMAINS_KEY] : ADULT_DOMAINS_FALLBACK)
    .slice(0, MAX_ADULT_DOMAIN_RULES);

  const addRules = [];
  for (let i = 0; i < list.length; i += 1) {
    const domain = normalizeDomain(list[i]);
    if (!domain) continue;
    addRules.push({
      id: ADULT_RULE_BASE + i,
      priority: 998,
      action: { type: 'block' },
      condition: { urlFilter: `||${domain}^`, resourceTypes: allTypes }
    });
  }

  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: oldIds, addRules });
}

async function syncAdultFilterRulesSafe() {
  try {
    await syncAdultFilterRules();
    return;
  } catch (error) {
    console.warn('FAdblock adult filter full sync failed, retrying with fallback list:', error);
  }

  try {
    const current = await chrome.storage.local.get(ADULT_DOMAINS_KEY);
    const previousDomains = current[ADULT_DOMAINS_KEY];
    const fallbackDomains = ADULT_DOMAINS_FALLBACK.slice(0, Math.min(500, MAX_ADULT_DOMAIN_RULES));
    await chrome.storage.local.set({ [ADULT_DOMAINS_KEY]: fallbackDomains });
    try {
      await syncAdultFilterRules();
    } finally {
      if (Array.isArray(previousDomains) && previousDomains.length) {
        await chrome.storage.local.set({ [ADULT_DOMAINS_KEY]: previousDomains });
      } else {
        await chrome.storage.local.remove(ADULT_DOMAINS_KEY);
      }
    }
  } catch (retryError) {
    console.error('FAdblock adult filter fallback sync failed:', retryError);
  }
}

async function syncSiteRecoveryRules() {
  const allTypes = ['main_frame','sub_frame','script','stylesheet','image','font','xmlhttprequest','media','websocket','other'];
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const oldIds = existing
    .filter(r => r.id >= RECOVERY_RULE_BASE && r.id < RECOVERY_RULE_BASE + MAX_RECOVERY_RULES)
    .map(r => r.id);
  const activeDomains = getActiveRecoveryDomains();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: oldIds,
    addRules: activeDomains.map((domain, i) => ({
      id: RECOVERY_RULE_BASE + i,
      priority: 1001,
      action: { type: 'allow' },
      condition: { requestDomains: [domain], resourceTypes: allTypes }
    }))
  });
}

async function syncBlockingRulesState() {
  const shouldEnableNetwork = _enabled && _categorySettings.network !== false;
  const shouldEnableYouTubeRules = shouldEnableNetwork && _categorySettings.youtubeBypass !== false;
  const supportedRulesets = new Set((chrome.runtime.getManifest()?.declarative_net_request?.rule_resources || [])
    .filter((rule) => rule?.enabled !== false)
    .map((rule) => rule.id));
  const canUseYouTubeRules = supportedRulesets.has('youtube_ads');
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const filterIds  = existing.filter(r => r.id >= FILTER_RULE_BASE && r.id < FILTER_RULE_BASE + MAX_FILTER_RULES).map(r => r.id);
  const adultKwIds = existing.filter(r => r.id >= ADULT_KW_RULE_BASE && r.id < ADULT_KW_RULE_BASE + ADULT_KW_PATTERNS.length + 10).map(r => r.id);
  const adultIds   = existing.filter(r => r.id >= ADULT_RULE_BASE && r.id < ADULT_RULE_BASE + MAX_ADULT_DOMAIN_RULES).map(r => r.id);
  const customIds  = existing.filter(r => r.id >= 70000 && r.id < 80000).map(r => r.id);

  await chrome.declarativeNetRequest.updateEnabledRulesets(
    {
      enableRulesetIds: [
        ...(shouldEnableNetwork ? ['adblock_main'] : []),
        ...(shouldEnableYouTubeRules && canUseYouTubeRules ? ['youtube_ads'] : []),
      ],
      disableRulesetIds: [
        ...(shouldEnableNetwork ? [] : ['adblock_main']),
        ...(!shouldEnableYouTubeRules || !canUseYouTubeRules ? ['youtube_ads'] : []),
      ]
    }
  );

  if (!shouldEnableNetwork) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [...filterIds, ...adultKwIds, ...adultIds, ...customIds],
      addRules: []
    });
    return;
  }

  if (!filterIds.length) fetchAndUpdateFilters().catch(() => {});
  syncAdultFilterRulesSafe().catch(() => {});
  chrome.storage.local.get(CUSTOM_BLOCKED_KEY).then(d => {
    syncCustomBlockedRules(d[CUSTOM_BLOCKED_KEY] || []).catch(() => {});
  });
  syncSiteRecoveryRules().catch(() => {});
}

async function setSiteRules(nextRules, options = {}) {
  _siteRules = cleanupSiteRulesObject(nextRules || {});
  await chrome.storage.local.set({ [SITE_RULES_KEY]: _siteRules });
  chrome.storage.sync.set({ [SITE_RULES_KEY]: _siteRules }).catch(() => {});
  await syncSiteRecoveryRules();
  if (!options.skipHistory && options.label) {
    await pushUserAction(options.label, { [SITE_RULES_KEY]: options.previousState || {} });
  }
  return _siteRules;
}

async function setCategorySettings(nextSettings, options = {}) {
  const merged = mergeCategorySettings(nextSettings);
  _categorySettings = merged;
  _adultFilterEnabled = merged.adultFilter === true;
  await chrome.storage.local.set({
    [CATEGORY_SETTINGS_KEY]: merged,
    [ADULT_FILTER_KEY]: _adultFilterEnabled,
    youtube_filter_enabled: merged.youtubeFilter === true,
    yt_restricted_mode: merged.restrictedMode === true,
    social_filter_enabled: merged.socialFilter === true,
  });
  chrome.storage.sync.set({
    [CATEGORY_SETTINGS_KEY]: merged,
    [ADULT_FILTER_KEY]: _adultFilterEnabled,
  }).catch(() => {});
  await syncBlockingRulesState();
  await syncAdultFilterRulesSafe();
  rearmYouTubeTabs({ reload: false }).catch(() => {});
  if (!options.skipHistory && options.label) {
    await pushUserAction(options.label, { [CATEGORY_SETTINGS_KEY]: options.previousState || DEFAULT_CATEGORY_SETTINGS });
  }
  return merged;
}

// --- Global enable / disable ---
async function setGlobalEnabled(enabled, options = {}) {
  _enabled = enabled;
  if (!options.preserveEnabledFlag) {
    await chrome.storage.local.set({ [ENABLED_KEY]: enabled });
  }
  updateBadgeState(enabled);
  refreshBadgesForAllTabs();
  try {
    await syncBlockingRulesState();
  } catch {}
  rearmYouTubeTabs({ reload: false }).catch(() => {});
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

async function setWhitelist(list, options = {}) {
  const normalized = [...new Set((list || []).map(normalizeDomain).filter(Boolean))];
  _whitelist = new Set(normalized);
  await chrome.storage.local.set({ [WHITELIST_KEY]: normalized });
  chrome.storage.sync.set({ [WHITELIST_KEY]: normalized }).catch(() => {});
  await syncWhitelistRules(normalized);
  if (!options.skipHistory && options.label) {
    await pushUserAction(options.label, { [WHITELIST_KEY]: options.previousState || [] });
  }
  return normalized;
}

async function setCustomBlockedList(list, options = {}) {
  const normalized = [...new Set((list || []).map(normalizeDomain).filter(Boolean))];
  await chrome.storage.local.set({ [CUSTOM_BLOCKED_KEY]: normalized });
  chrome.storage.sync.set({ [CUSTOM_BLOCKED_KEY]: normalized }).catch(() => {});
  await syncCustomBlockedRules(normalized);
  if (!options.skipHistory && options.label) {
    await pushUserAction(options.label, { [CUSTOM_BLOCKED_KEY]: options.previousState || [] });
  }
  return normalized;
}

async function setCustomSelectors(list, options = {}) {
  const normalized = [...new Set((list || []).map(s => String(s || '').trim()).filter(Boolean))];
  await chrome.storage.local.set({ [CUSTOM_SELECTORS_KEY]: normalized });
  if (!options.skipHistory && options.label) {
    await pushUserAction(options.label, { [CUSTOM_SELECTORS_KEY]: options.previousState || [] });
  }
  return normalized;
}

async function setSiteRecovery(domain, minutes, options = {}) {
  const cleanDomain = normalizeDomain(domain);
  if (!cleanDomain) return 0;
  const previous = clone(_siteRules);
  const rule = { ...(getSiteRule(cleanDomain) || {}) };
  if (minutes > 0) rule.recoveryUntil = Date.now() + (minutes * 60000);
  else delete rule.recoveryUntil;
  const next = clone(_siteRules);
  if (Object.keys(rule).length) next[cleanDomain] = rule;
  else delete next[cleanDomain];
  await setSiteRules(next, {
    skipHistory: options.skipHistory,
    label: options.label,
    previousState: previous,
  });
  return next[cleanDomain]?.recoveryUntil || 0;
}

async function applyUndoSnapshot(snapshot) {
  if (snapshot[ENABLED_KEY] !== undefined) {
    await setGlobalEnabled(snapshot[ENABLED_KEY], { skipHistory: true });
  }
  if (snapshot[WHITELIST_KEY]) {
    await setWhitelist(snapshot[WHITELIST_KEY], { skipHistory: true });
  }
  if (snapshot[CUSTOM_BLOCKED_KEY]) {
    await setCustomBlockedList(snapshot[CUSTOM_BLOCKED_KEY], { skipHistory: true });
  }
  if (snapshot[CUSTOM_SELECTORS_KEY]) {
    await setCustomSelectors(snapshot[CUSTOM_SELECTORS_KEY], { skipHistory: true });
  }
  if (snapshot[CATEGORY_SETTINGS_KEY]) {
    await setCategorySettings(snapshot[CATEGORY_SETTINGS_KEY], { skipHistory: true });
  }
  if (snapshot[SITE_RULES_KEY]) {
    await setSiteRules(snapshot[SITE_RULES_KEY], { skipHistory: true });
  }
  const plainState = {};
  for (const [key, value] of Object.entries(snapshot || {})) {
    if ([ENABLED_KEY, WHITELIST_KEY, CUSTOM_BLOCKED_KEY, CUSTOM_SELECTORS_KEY, CATEGORY_SETTINGS_KEY, SITE_RULES_KEY].includes(key)) continue;
    plainState[key] = value;
  }
  if (Object.keys(plainState).length) await chrome.storage.local.set(plainState);
}

async function undoLastAction() {
  const data = await chrome.storage.local.get(USER_ACTIONS_KEY);
  const list = data[USER_ACTIONS_KEY] || [];
  const action = list[0];
  if (!action) return null;
  await applyUndoSnapshot(action.previousState || {});
  await chrome.storage.local.set({ [USER_ACTIONS_KEY]: list.slice(1) });
  return action;
}

async function cleanupStaleData() {
  const data = await chrome.storage.local.get([
    CUSTOM_SELECTORS_KEY, CUSTOM_BLOCKED_KEY, WHITELIST_KEY, HISTORY_KEY,
    USER_ACTIONS_KEY, REQUEST_LOG_KEY, SITE_RULES_KEY, SITE_PAUSE_KEY
  ]);
  const cleanedSelectors = [...new Set((data[CUSTOM_SELECTORS_KEY] || []).map(s => String(s || '').trim()).filter(Boolean))]
    .filter(selector => !/^\s*[\],]/.test(selector) && /[#.\[:a-zA-Z]/.test(selector));
  const cleanedBlocked = [...new Set((data[CUSTOM_BLOCKED_KEY] || []).map(normalizeDomain).filter(Boolean))];
  const cleanedWhitelist = [...new Set((data[WHITELIST_KEY] || []).map(normalizeDomain).filter(Boolean))];
  const cleanedSiteRules = cleanupSiteRulesObject(data[SITE_RULES_KEY] || {});
  const cleanedSitePauses = Object.fromEntries(
    Object.entries(data[SITE_PAUSE_KEY] || {}).filter(([, until]) => until > Date.now())
  );
  const cutoff = Date.now() - (14 * 24 * 60 * 60 * 1000);
  const cleanedActions = (data[USER_ACTIONS_KEY] || []).filter(item => new Date(item.at).getTime() >= cutoff).slice(0, MAX_USER_ACTIONS);
  const cleanedLog = (data[REQUEST_LOG_KEY] || []).slice(0, MAX_REQUEST_LOG);
  const history = data[HISTORY_KEY] || {};
  const historyDays = Object.keys(history).sort((a, b) => new Date(a) - new Date(b));
  const trimmedHistory = {};
  historyDays.slice(-14).forEach(day => { trimmedHistory[day] = history[day]; });

  await chrome.storage.local.set({
    [CUSTOM_SELECTORS_KEY]: cleanedSelectors,
    [CUSTOM_BLOCKED_KEY]: cleanedBlocked,
    [WHITELIST_KEY]: cleanedWhitelist,
    [SITE_RULES_KEY]: cleanedSiteRules,
    [SITE_PAUSE_KEY]: cleanedSitePauses,
    [USER_ACTIONS_KEY]: cleanedActions,
    [REQUEST_LOG_KEY]: cleanedLog,
    [HISTORY_KEY]: trimmedHistory,
  });
  await syncWhitelistRules(cleanedWhitelist);
  await syncCustomBlockedRules(cleanedBlocked);
  await syncSiteRecoveryRules();
  return {
    selectorsRemoved: (data[CUSTOM_SELECTORS_KEY] || []).length - cleanedSelectors.length,
    blockedRemoved: (data[CUSTOM_BLOCKED_KEY] || []).length - cleanedBlocked.length,
    whitelistRemoved: (data[WHITELIST_KEY] || []).length - cleanedWhitelist.length,
    siteRulesRemoved: Object.keys(data[SITE_RULES_KEY] || {}).length - Object.keys(cleanedSiteRules).length,
    pausesRemoved: Object.keys(data[SITE_PAUSE_KEY] || {}).length - Object.keys(cleanedSitePauses).length,
  };
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
      pushUserAction('Changed global blocker state', { [ENABLED_KEY]: _enabled }).catch(() => {});
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
      chrome.storage.local.get(WHITELIST_KEY).then(async d => {
        await setWhitelist(msg.list, {
          label: 'Updated whitelist',
          previousState: d[WHITELIST_KEY] || [],
        });
        sendResponse({ ok: true });
      });
      return true;

    case 'GET_CATEGORY_SETTINGS':
      sendResponse({ settings: _categorySettings });
      return true;

    case 'SET_CATEGORY_SETTING':
      setCategorySettings({ ..._categorySettings, [msg.key]: msg.value }, {
        label: `Changed category ${msg.key}`,
        previousState: _categorySettings,
      }).then(settings => sendResponse({ ok: true, settings }));
      return true;

    case 'GET_SITE_RULES':
      sendResponse({ rules: _siteRules });
      return true;

    case 'GET_SITE_RULE':
      sendResponse({ rule: getSiteRule(msg.domain) || {} });
      return true;

    case 'SET_SITE_RULE': {
      const domain = normalizeDomain(msg.domain);
      const previous = clone(_siteRules);
      const rule = { ...(getSiteRule(domain) || {}) };
      if (msg.value) rule[msg.key] = true;
      else delete rule[msg.key];
      const next = clone(_siteRules);
      if (Object.keys(rule).length) next[domain] = rule;
      else delete next[domain];
      setSiteRules(next, {
        label: `Updated site rule for ${domain}`,
        previousState: previous,
      }).then(rules => sendResponse({ ok: true, rules, rule: rules[domain] || {} }));
      return true;
    }

    case 'SET_SITE_RECOVERY':
      setSiteRecovery(msg.domain, msg.minutes || 0, {
        label: msg.minutes > 0 ? `Enabled recovery for ${normalizeDomain(msg.domain)}` : `Disabled recovery for ${normalizeDomain(msg.domain)}`,
        previousState: clone(_siteRules),
      }).then(until => sendResponse({ ok: true, until }));
      return true;

    case 'GET_SITE_RECOVERY':
      sendResponse({
        until: getSiteRule(msg.domain)?.recoveryUntil || 0,
        remaining: Math.max(0, (getSiteRule(msg.domain)?.recoveryUntil || 0) - Date.now()),
      });
      return true;

    case 'REPORT_BROKEN_SITE':
      setSiteRecovery(msg.domain, msg.minutes || 60, {
        label: `Broken-site mode for ${normalizeDomain(msg.domain)}`,
        previousState: clone(_siteRules),
      }).then(until => sendResponse({ ok: true, until }));
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
        [STATS_KEY]:   { total: 0, today: 0, lastReset: new Date().toDateString() },
        [HISTORY_KEY]: {}
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
        await setCustomBlockedList(updated, {
          label: `Unblocked ${msg.domain}`,
          previousState: d[CUSTOM_BLOCKED_KEY] || [],
        });
        sendResponse({ ok: true });
      });
      return true;

    case 'GET_CUSTOM_SELECTORS':
      chrome.storage.local.get(CUSTOM_SELECTORS_KEY)
        .then(d => sendResponse({ list: d[CUSTOM_SELECTORS_KEY] || [] }));
      return true;

    case 'ADD_CUSTOM_SELECTOR':
      chrome.storage.local.get(CUSTOM_SELECTORS_KEY).then(async d => {
        const list = d[CUSTOM_SELECTORS_KEY] || [];
        const selector = String(msg.selector || '').trim();
        if (!selector || list.includes(selector)) return sendResponse({ ok: true, list });
        const updated = await setCustomSelectors([...list, selector], {
          label: `Added selector ${selector}`,
          previousState: list,
        });
        sendResponse({ ok: true, list: updated });
      });
      return true;

    case 'REMOVE_CUSTOM_SELECTOR':
      chrome.storage.local.get(CUSTOM_SELECTORS_KEY).then(async d => {
        const list = d[CUSTOM_SELECTORS_KEY] || [];
        const updated = await setCustomSelectors(list.filter(sel => sel !== msg.selector), {
          label: `Removed selector ${msg.selector}`,
          previousState: list,
        });
        sendResponse({ ok: true, list: updated });
      });
      return true;

    case 'GET_HISTORY':
      chrome.storage.local.get(HISTORY_KEY)
        .then(d => sendResponse({ history: d[HISTORY_KEY] || {} }));
      return true;

    case 'GET_REQUEST_LOG':
      chrome.storage.local.get(REQUEST_LOG_KEY)
        .then(d => sendResponse({ list: d[REQUEST_LOG_KEY] || [] }));
      return true;

    case 'CLEAR_REQUEST_LOG':
      chrome.storage.local.set({ [REQUEST_LOG_KEY]: [] }).then(() => sendResponse({ ok: true }));
      return true;

    case 'GET_USER_ACTIONS':
      chrome.storage.local.get(USER_ACTIONS_KEY)
        .then(d => sendResponse({ list: d[USER_ACTIONS_KEY] || [] }));
      return true;

    case 'UNDO_LAST_ACTION':
      undoLastAction().then(action => sendResponse({ ok: !!action, action }));
      return true;

    case 'GET_FILTERS_META':
      chrome.storage.local.get(FILTERS_META_KEY)
        .then(d => sendResponse({ meta: d[FILTERS_META_KEY] || null }));
      return true;

    case 'GET_FILTER_SOURCES':
      chrome.storage.local.get([FILTERS_META_KEY, ADULT_META_KEY, CUSTOM_BLOCKED_KEY, CUSTOM_SELECTORS_KEY])
        .then(d => sendResponse({
          sources: [
            { id: 'built-in', name: 'Bundled static rules', kind: 'static', status: _categorySettings.network === false ? 'disabled' : 'active', count: 1, updated: null },
            { id: 'yoyo', name: 'YoYo ad servers', kind: 'remote', status: _categorySettings.network === false ? 'paused' : (d[FILTERS_META_KEY] ? 'ready' : 'missing'), count: d[FILTERS_META_KEY]?.count || 0, updated: d[FILTERS_META_KEY]?.updated || null },
            { id: 'adult', name: 'Bon-Appetit porn domains (642K+)', kind: 'remote', status: _categorySettings.adultFilter ? 'ready' : 'standby', count: d[ADULT_META_KEY]?.count || 0, updated: d[ADULT_META_KEY]?.updated || null },
            { id: 'user', name: 'User custom rules', kind: 'local', status: 'ready', count: (d[CUSTOM_BLOCKED_KEY] || []).length + (d[CUSTOM_SELECTORS_KEY] || []).length, updated: null },
          ]
        }));
      return true;

    case 'UPDATE_FILTERS':
      fetchAndUpdateFilters().then(() => sendResponse({ ok: true }));
      return true;

    // --- Pause ---
    case 'SET_PAUSE': {
      pushUserAction('Changed global pause', { [PAUSE_KEY]: _pauseUntil }).catch(() => {});
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
      pushUserAction(`Changed site pause for ${msg.domain}`, { [SITE_PAUSE_KEY]: clone(_sitePauses) }).catch(() => {});
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
      pushUserAction('Changed notifications setting', { [NOTIF_ENABLED_KEY]: _notifEnabled }).catch(() => {});
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
      pushUserAction('Changed badge color', { [BADGE_COLOR_KEY]: _badgeColor }).catch(() => {});
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
      setCategorySettings({ ..._categorySettings, adultFilter: !!msg.enabled }, {
        label: 'Changed adult filter',
        previousState: _categorySettings,
      }).then(() => {
        if (_adultFilterEnabled) {
        // Fetch full list if not yet downloaded
          chrome.storage.local.get(ADULT_META_KEY, d => {
            if (!d[ADULT_META_KEY]) fetchAndUpdateAdultRules().catch(() => {});
          });
        }
        sendResponse({ ok: true });
      });
      return true;

    case 'GET_ADULT_FILTER':
      sendResponse({ enabled: _adultFilterEnabled });
      return true;

    case 'GET_ADULT_META':
      chrome.storage.local.get(ADULT_META_KEY)
        .then(d => sendResponse({ meta: d[ADULT_META_KEY] || null }));
      return true;

    case 'UPDATE_ADULT_FILTER':
      fetchAndUpdateAdultRules().then(() => sendResponse({ ok: true }));
      return true;

    case 'GET_DEBUG_LOG':
      chrome.tabs.query({ active: true, lastFocusedWindow: true }).then(async (tabs) => {
        const tabId = tabs[0]?.id;
        if (!tabId) { sendResponse({ list: [] }); return; }
        try {
          const [result] = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
              try { return JSON.parse(sessionStorage.getItem('fadblock_log') || '[]'); } catch(e) { return []; }
            },
          });
          sendResponse({ list: result?.result || [] });
        } catch(e) { sendResponse({ list: [] }); }
      });
      return true;

    case 'CLEAR_DEBUG_LOG':
      chrome.tabs.query({ active: true, lastFocusedWindow: true }).then(async (tabs) => {
        const tabId = tabs[0]?.id;
        if (!tabId) { sendResponse({}); return; }
        try {
          await chrome.scripting.executeScript({
            target: { tabId },
            func: () => { try { sessionStorage.removeItem('fadblock_log'); } catch(e) {} },
          });
        } catch(e) {}
        sendResponse({});
      });
      return true;

    case 'RUN_CLEANUP':
      cleanupStaleData().then(summary => sendResponse({ ok: true, summary }));
      return true;
  }
});

async function handleToggleWhitelist(domain) {
  const data = await chrome.storage.local.get(WHITELIST_KEY);
  let list = data[WHITELIST_KEY] || [];
  const cleanDomain = normalizeDomain(domain);
  const wasListed = list.includes(cleanDomain);
  list = wasListed ? list.filter(d => d !== cleanDomain) : [...list, cleanDomain];
  await setWhitelist(list, {
    label: wasListed ? `Removed ${cleanDomain} from whitelist` : `Added ${cleanDomain} to whitelist`,
    previousState: data[WHITELIST_KEY] || [],
  });
  return { whitelisted: !wasListed };
}
