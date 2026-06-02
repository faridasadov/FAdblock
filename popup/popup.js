const PAYPAL_URL = 'PAYPAL_LINK_HERE';

const $ = id => document.getElementById(id);

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
}

function formatNumber(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}

async function init() {
  const tab    = await getActiveTab();
  const domain = getDomain(tab?.url || '');

  // Global toggle
  const { enabled } = await chrome.runtime.sendMessage({ type: 'GET_ENABLED' });
  const globalToggle = $('globalToggle');
  globalToggle.checked = enabled;
  if (!enabled) document.getElementById('app').classList.add('is-off');

  globalToggle.addEventListener('change', async () => {
    await chrome.runtime.sendMessage({ type: 'SET_ENABLED', enabled: globalToggle.checked });
    document.getElementById('app').classList.toggle('is-off', !globalToggle.checked);
  });

  // Site domain
  $('siteDomain').textContent = domain || 'Sistem səhifəsi';

  if (domain) {
    const { whitelisted } = await chrome.runtime.sendMessage({ type: 'IS_WHITELISTED', domain });
    const siteToggle = $('siteToggle');
    siteToggle.checked = !whitelisted;

    siteToggle.addEventListener('change', async () => {
      await chrome.runtime.sendMessage({ type: 'TOGGLE_WHITELIST', domain });
    });
  } else {
    $('siteToggle').disabled = true;
  }

  // Stats
  const [stats, tabRes] = await Promise.all([
    chrome.runtime.sendMessage({ type: 'GET_STATS' }),
    chrome.runtime.sendMessage({ type: 'GET_TAB_COUNT', tabId: tab?.id })
  ]);
  $('tabCount').textContent   = formatNumber(tabRes?.count  || 0);
  $('todayCount').textContent = formatNumber(stats?.today   || 0);
  $('totalCount').textContent = formatNumber(stats?.total   || 0);

  // Buttons
  $('openOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());
  $('donateBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: PAYPAL_URL });
  });
}

init();
