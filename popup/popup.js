const $ = id => document.getElementById(id);

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return null; }
}

function formatNumber(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}

function updateStatusBadge(isActive) {
  const badge = $('siteStatus');
  badge.textContent = isActive ? 'Aktiv' : 'Söndürülüb';
  badge.className = isActive ? 'badge badge--on' : 'badge badge--off';
}

async function init() {
  const tab = await getActiveTab();
  const domain = getDomain(tab?.url || '');

  $('siteDomain').textContent = domain || 'Sistem səhifəsi';

  if (!domain) {
    $('siteToggle').disabled = true;
    return;
  }

  const { whitelisted } = await chrome.runtime.sendMessage({ type: 'IS_WHITELISTED', domain });
  const toggle = $('siteToggle');
  toggle.checked = !whitelisted;
  updateStatusBadge(!whitelisted);

  toggle.addEventListener('change', async () => {
    await chrome.runtime.sendMessage({ type: 'TOGGLE_WHITELIST', domain });
    updateStatusBadge(toggle.checked);
  });

  const [stats, tabRes] = await Promise.all([
    chrome.runtime.sendMessage({ type: 'GET_STATS' }),
    chrome.runtime.sendMessage({ type: 'GET_TAB_COUNT', tabId: tab.id })
  ]);

  $('tabCount').textContent = formatNumber(tabRes?.count || 0);
  $('todayCount').textContent = formatNumber(stats?.today || 0);
  $('totalCount').textContent = formatNumber(stats?.total || 0);

  $('openOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());

  $('resetStats').addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'RESET_STATS' });
    $('todayCount').textContent = '0';
    $('totalCount').textContent = '0';
  });
}

init();
