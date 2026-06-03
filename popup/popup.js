const PAYPAL_URL = 'https://www.paypal.com/donate/?hosted_button_id=Z79A28XHU8L7S';

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

function animateCount(el, target, duration = 550) {
  if (!target) return;
  const t0 = performance.now();
  const tick = now => {
    const p = Math.min((now - t0) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = formatNumber(Math.round(eased * target));
    if (p < 1) requestAnimationFrame(tick);
    else el.textContent = formatNumber(target);
  };
  requestAnimationFrame(tick);
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
  animateCount($('tabCount'),   tabRes?.count  || 0);
  animateCount($('todayCount'), stats?.today   || 0);
  animateCount($('totalCount'), stats?.total   || 0);

  // Buttons
  $('openOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());
  $('donateBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: PAYPAL_URL });
  });
  $('pickBtn').addEventListener('click', async () => {
    const t = await getActiveTab();
    if (t?.id) {
      chrome.tabs.sendMessage(t.id, { type: 'ACTIVATE_PICKER' }).catch(() => {});
      window.close();
    }
  });
}

init();
