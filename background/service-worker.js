const STATS_KEY = 'adblock_stats';
const WHITELIST_KEY = 'adblock_whitelist';
const TAB_STATS_PREFIX = 'tab_';

chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get(STATS_KEY);
  if (!data[STATS_KEY]) {
    await chrome.storage.local.set({
      [STATS_KEY]: { total: 0, today: 0, lastReset: new Date().toDateString() }
    });
  }
  chrome.action.setBadgeBackgroundColor({ color: '#e74c3c' });
});

// Per-tab blocked count tracking via declarativeNetRequest feedback
chrome.declarativeNetRequest.onRuleMatchedDebug?.addListener(async (info) => {
  const tabId = info.request.tabId;
  if (tabId < 0) return;

  const data = await chrome.storage.local.get(STATS_KEY);
  const stats = data[STATS_KEY] || { total: 0, today: 0, lastReset: new Date().toDateString() };

  if (stats.lastReset !== new Date().toDateString()) {
    stats.today = 0;
    stats.lastReset = new Date().toDateString();
  }
  stats.total++;
  stats.today++;
  await chrome.storage.local.set({ [STATS_KEY]: stats });

  const tabKey = TAB_STATS_PREFIX + tabId;
  const tabData = await (chrome.storage.session?.get(tabKey) ?? Promise.resolve({}));
  const tabCount = (tabData[tabKey] || 0) + 1;
  await chrome.storage.session?.set({ [tabKey]: tabCount });

  const display = tabCount > 999 ? '1k+' : String(tabCount);
  chrome.action.setBadgeText({ text: display, tabId });
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status === 'loading' && changeInfo.url) {
    const tabKey = TAB_STATS_PREFIX + tabId;
    await chrome.storage.session?.set({ [tabKey]: 0 });
    chrome.action.setBadgeText({ text: '', tabId });
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await chrome.storage.session?.remove(TAB_STATS_PREFIX + tabId);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    case 'GET_STATS':
      chrome.storage.local.get(STATS_KEY).then(d => sendResponse(d[STATS_KEY] || {}));
      return true;

    case 'GET_TAB_COUNT': {
      const key = TAB_STATS_PREFIX + msg.tabId;
      (chrome.storage.session?.get(key) ?? Promise.resolve({})).then(d => {
        sendResponse({ count: d[key] || 0 });
      });
      return true;
    }

    case 'IS_WHITELISTED':
      chrome.storage.local.get(WHITELIST_KEY).then(d => {
        sendResponse({ whitelisted: (d[WHITELIST_KEY] || []).includes(msg.domain) });
      });
      return true;

    case 'TOGGLE_WHITELIST':
      handleToggleWhitelist(msg.domain).then(sendResponse);
      return true;

    case 'GET_WHITELIST':
      chrome.storage.local.get(WHITELIST_KEY).then(d => {
        sendResponse({ list: d[WHITELIST_KEY] || [] });
      });
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

async function syncWhitelistRules(whitelist) {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const allTypes = [
    'main_frame', 'sub_frame', 'script', 'stylesheet',
    'image', 'font', 'xmlhttprequest', 'media', 'websocket', 'other'
  ];
  const allowRules = whitelist.map((domain, i) => ({
    id: 90000 + i,
    priority: 1000,
    action: { type: 'allow' },
    condition: { requestDomains: [domain], resourceTypes: allTypes }
  }));
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map(r => r.id),
    addRules: allowRules
  });
}
