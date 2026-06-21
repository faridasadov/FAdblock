import { applyI18n, t } from '../common/i18n.js';

const PAYPAL_URL = 'https://www.paypal.com/donate/?hosted_button_id=Z79A28XHU8L7S';
const $ = id => document.getElementById(id);

function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
}

function formatNumber(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return String(n || 0);
}

function formatCountdown(ms) {
  if (ms <= 0) return '0:00';
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function animateCount(el, target, duration = 500) {
  if (!target) return;
  const t0 = performance.now();
  const tick = now => {
    const p = Math.min((now - t0) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = formatNumber(Math.round(eased * target));
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

let pauseTimer = null;
let recoveryTimer = null;
let currentDomain = null;

function startPauseCountdown(until) {
  clearInterval(pauseTimer);
  $('pauseBtns').style.display = 'none';
  $('pauseActive').style.display = 'flex';
  const update = () => {
    const remaining = until - Date.now();
    if (remaining <= 0) {
      clearInterval(pauseTimer);
      $('pauseBtns').style.display = 'flex';
      $('pauseActive').style.display = 'none';
      return;
    }
    $('pauseCountdown').textContent = formatCountdown(remaining);
  };
  update();
  pauseTimer = setInterval(update, 1000);
}

function startRecoveryCountdown(until) {
  clearInterval(recoveryTimer);
  $('siteRecoveryMeta').style.display = '';
  const update = () => {
    const remaining = until - Date.now();
    if (remaining <= 0) {
      clearInterval(recoveryTimer);
      $('siteRecoveryMeta').style.display = 'none';
      $('siteRecoveryMeta').textContent = '';
      return;
    }
    $('siteRecoveryMeta').textContent = `Recovery mode active: ${formatCountdown(remaining)} left`;
  };
  update();
  recoveryTimer = setInterval(update, 1000);
}

async function bindSiteRules(domain) {
  if (!domain) {
    $('siteControls').style.display = 'none';
    return;
  }
  $('siteControls').style.display = '';
  const { rule } = await chrome.runtime.sendMessage({ type: 'GET_SITE_RULE', domain });
  $('siteCosmeticToggle').checked = !rule.disableCosmetic;
  $('siteCustomSelectorsToggle').checked = !rule.disableCustomSelectors;
  $('siteSocialToggle').checked = !rule.disableSocialFilter;

  const bindings = [
    ['siteCosmeticToggle', 'disableCosmetic'],
    ['siteCustomSelectorsToggle', 'disableCustomSelectors'],
    ['siteSocialToggle', 'disableSocialFilter'],
  ];

  bindings.forEach(([id, key]) => {
    $(id).onchange = async (e) => {
      await chrome.runtime.sendMessage({
        type: 'SET_SITE_RULE',
        domain,
        key,
        value: !e.target.checked,
      });
    };
  });

  const recovery = await chrome.runtime.sendMessage({ type: 'GET_SITE_RECOVERY', domain });
  if (recovery.remaining > 0) startRecoveryCountdown(Date.now() + recovery.remaining);
  else $('siteRecoveryMeta').style.display = 'none';
}

async function init() {
  applyI18n();
  document.title = 'FAdblock';

  const tab = await getActiveTab();
  currentDomain = getDomain(tab?.url || '');
  $('siteDomain').textContent = currentDomain || t('popupSystemPage');

  const { enabled } = await chrome.runtime.sendMessage({ type: 'GET_ENABLED' });
  $('globalToggle').checked = enabled;
  $('app').classList.toggle('is-off', !enabled);
  $('globalToggle').addEventListener('change', async () => {
    await chrome.runtime.sendMessage({ type: 'SET_ENABLED', enabled: $('globalToggle').checked });
    $('app').classList.toggle('is-off', !$('globalToggle').checked);
  });

  const { remaining } = await chrome.runtime.sendMessage({ type: 'GET_PAUSE' });
  if (remaining > 0) startPauseCountdown(Date.now() + remaining);

  document.querySelectorAll('.btn-pause[data-min]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const minutes = Number(btn.dataset.min);
      const res = await chrome.runtime.sendMessage({ type: 'SET_PAUSE', minutes });
      startPauseCountdown(res.until);
    });
  });

  $('resumeBtn').addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'SET_PAUSE', minutes: 0 });
    clearInterval(pauseTimer);
    $('pauseBtns').style.display = 'flex';
    $('pauseActive').style.display = 'none';
  });

  if (currentDomain) {
    const { whitelisted } = await chrome.runtime.sendMessage({ type: 'IS_WHITELISTED', domain: currentDomain });
    $('siteToggle').checked = !whitelisted;
    $('siteToggle').addEventListener('change', async () => {
      await chrome.runtime.sendMessage({ type: 'TOGGLE_WHITELIST', domain: currentDomain });
    });
    await bindSiteRules(currentDomain);
  } else {
    $('siteToggle').disabled = true;
    $('siteControls').style.display = 'none';
  }

  const [stats, tabRes] = await Promise.all([
    chrome.runtime.sendMessage({ type: 'GET_STATS' }),
    chrome.runtime.sendMessage({ type: 'GET_TAB_COUNT', tabId: tab?.id })
  ]);
  animateCount($('tabCount'), tabRes?.count || 0);
  animateCount($('todayCount'), stats?.today || 0);
  animateCount($('totalCount'), stats?.total || 0);

  // Real-time stats update via storage changes
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes['adblock_stats']) {
      const s = changes['adblock_stats'].newValue || {};
      $('todayCount').textContent = formatNumber(s.today || 0);
      $('totalCount').textContent = formatNumber(s.total || 0);
    }
    if (tab?.id && changes[`tab_${tab.id}`]) {
      $('tabCount').textContent = formatNumber(changes[`tab_${tab.id}`].newValue || 0);
    }
  });

  $('brokenSiteBtn').addEventListener('click', async () => {
    if (!currentDomain) return;
    const res = await chrome.runtime.sendMessage({ type: 'REPORT_BROKEN_SITE', domain: currentDomain, minutes: 60 });
    startRecoveryCountdown(res.until);
  });

  $('undoBtn').addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'UNDO_LAST_ACTION' });
    window.close();
  });

  $('sitePause60Btn').addEventListener('click', async () => {
    if (!currentDomain) return;
    const res = await chrome.runtime.sendMessage({ type: 'SET_SITE_PAUSE', domain: currentDomain, minutes: 60 });
    if (res.until) $('siteRecoveryMeta').style.display = 'none';
  });

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
