import { applyI18n, t } from '../common/i18n.js';

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

function formatCountdown(ms) {
  if (ms <= 0) return '0:00';
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
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

let _pauseCountdownTimer = null;
let _sitePauseTimer      = null;

function startPauseCountdown(until) {
  if (_pauseCountdownTimer) clearInterval(_pauseCountdownTimer);
  $('pauseBtns').style.display  = 'none';
  $('pauseActive').style.display = 'flex';

  const update = () => {
    const rem = until - Date.now();
    if (rem <= 0) {
      clearInterval(_pauseCountdownTimer);
      $('pauseActive').style.display = 'none';
      $('pauseBtns').style.display   = 'flex';
      $('pauseCountdown').textContent = '';
      return;
    }
    $('pauseCountdown').textContent = formatCountdown(rem);
  };
  update();
  _pauseCountdownTimer = setInterval(update, 1000);
}

function startSitePauseCountdown(until) {
  if (_sitePauseTimer) clearInterval(_sitePauseTimer);
  $('sitePauseCountdown').style.display = '';
  $('siteResumeBtn').style.display      = '';

  const update = () => {
    const rem = until - Date.now();
    if (rem <= 0) {
      clearInterval(_sitePauseTimer);
      $('sitePauseCountdown').style.display = 'none';
      $('siteResumeBtn').style.display      = 'none';
      return;
    }
    $('sitePauseCountdown').textContent = formatCountdown(rem);
  };
  update();
  _sitePauseTimer = setInterval(update, 1000);
}

async function init() {
  applyI18n();
  document.title = 'FAdblock';

  const tab    = await getActiveTab();
  const domain = getDomain(tab?.url || '');

  // Global toggle
  const { enabled } = await chrome.runtime.sendMessage({ type: 'GET_ENABLED' });
  const globalToggle = $('globalToggle');
  globalToggle.checked = enabled;
  if (!enabled) $('app').classList.add('is-off');

  globalToggle.addEventListener('change', async () => {
    await chrome.runtime.sendMessage({ type: 'SET_ENABLED', enabled: globalToggle.checked });
    $('app').classList.toggle('is-off', !globalToggle.checked);
  });

  // Global pause
  const { remaining } = await chrome.runtime.sendMessage({ type: 'GET_PAUSE' });
  if (remaining > 0) {
    startPauseCountdown(Date.now() + remaining);
  }

  document.querySelectorAll('.btn-pause[data-min]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const min = parseInt(btn.dataset.min, 10);
      const res = await chrome.runtime.sendMessage({ type: 'SET_PAUSE', minutes: min });
      startPauseCountdown(res.until);
    });
  });

  $('resumeBtn').addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'SET_PAUSE', minutes: 0 });
    if (_pauseCountdownTimer) clearInterval(_pauseCountdownTimer);
    $('pauseActive').style.display = 'none';
    $('pauseBtns').style.display   = 'flex';
  });

  // Site domain + site toggle
  $('siteDomain').textContent = domain || t('popupSystemPage');

  if (domain) {
    const { whitelisted } = await chrome.runtime.sendMessage({ type: 'IS_WHITELISTED', domain });
    const siteToggle = $('siteToggle');
    siteToggle.checked = !whitelisted;

    siteToggle.addEventListener('change', async () => {
      await chrome.runtime.sendMessage({ type: 'TOGGLE_WHITELIST', domain });
    });

    // Per-site pause
    $('sitePauseRow').style.display = '';
    const { remaining: siteRem } = await chrome.runtime.sendMessage({ type: 'GET_SITE_PAUSE', domain });
    if (siteRem > 0) startSitePauseCountdown(Date.now() + siteRem);

    document.querySelectorAll('.btn-pause[data-site-min]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const min = parseInt(btn.dataset.siteMin, 10);
        const res = await chrome.runtime.sendMessage({ type: 'SET_SITE_PAUSE', domain, minutes: min });
        startSitePauseCountdown(res.until);
      });
    });

    $('siteResumeBtn').addEventListener('click', async () => {
      await chrome.runtime.sendMessage({ type: 'SET_SITE_PAUSE', domain, minutes: 0 });
      if (_sitePauseTimer) clearInterval(_sitePauseTimer);
      $('sitePauseCountdown').style.display = 'none';
      $('siteResumeBtn').style.display      = 'none';
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
  $('donateBtn').addEventListener('click', () => chrome.tabs.create({ url: PAYPAL_URL }));
  $('pickBtn').addEventListener('click', async () => {
    const activeTab = await getActiveTab();
    if (activeTab?.id) {
      chrome.tabs.sendMessage(activeTab.id, { type: 'ACTIVATE_PICKER' }).catch(() => {});
      window.close();
    }
  });
}

init();
