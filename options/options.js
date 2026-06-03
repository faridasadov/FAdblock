const PAYPAL_URL = 'https://www.paypal.com/donate/?hosted_button_id=Z79A28XHU8L7S';
const $ = id => document.getElementById(id);

function formatNumber(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}

function parseDomain(raw) {
  return raw.trim().toLowerCase()
    .replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/.*$/, '');
}

// --- Whitelist ---
function renderWhitelist(list) {
  const ul = $('whitelistEl');
  Array.from(ul.children).forEach(li => { if (li.id !== 'emptyHint') li.remove(); });
  $('emptyHint').style.display = list.length ? 'none' : '';
  list.forEach(domain => {
    const li = document.createElement('li');
    li.textContent = domain;
    const btn = document.createElement('button');
    btn.className = 'remove-btn';
    btn.textContent = '×';
    btn.setAttribute('aria-label', `${domain} silinsin`);
    btn.addEventListener('click', () => removeDomain(domain));
    li.appendChild(btn);
    ul.appendChild(li);
  });
}

async function removeDomain(domain) {
  await chrome.runtime.sendMessage({ type: 'TOGGLE_WHITELIST', domain });
  const { list } = await chrome.runtime.sendMessage({ type: 'GET_WHITELIST' });
  renderWhitelist(list);
}

async function addDomain() {
  const input = $('domainInput');
  const raw = parseDomain(input.value);
  if (!raw) return;
  const { list: before } = await chrome.runtime.sendMessage({ type: 'GET_WHITELIST' });
  if (before.includes(raw)) { input.select(); return; }
  await chrome.runtime.sendMessage({ type: 'TOGGLE_WHITELIST', domain: raw });
  const { list } = await chrome.runtime.sendMessage({ type: 'GET_WHITELIST' });
  renderWhitelist(list);
  input.value = '';
}

// --- Per-site stats ---
function renderSiteStats(stats) {
  const ol = $('siteStatsList');
  Array.from(ol.children).forEach(li => { if (li.id !== 'siteStatsEmpty') li.remove(); });
  const entries = Object.entries(stats).sort((a, b) => b[1] - a[1]).slice(0, 10);
  $('siteStatsEmpty').style.display = entries.length ? 'none' : '';
  entries.forEach(([host, count]) => {
    const li = document.createElement('li');
    li.className = 'site-stat-row';
    li.innerHTML = `<span class="site-stat-host">${host}</span><span class="site-stat-count">${formatNumber(count)}</span>`;
    ol.appendChild(li);
  });
}

// --- Custom CSS selectors ---
function renderSelectors(list) {
  const ul = $('selectorList');
  Array.from(ul.children).forEach(li => { if (li.id !== 'selectorEmpty') li.remove(); });
  $('selectorEmpty').style.display = list.length ? 'none' : '';
  list.forEach(sel => {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.className = 'selector-text';
    span.textContent = sel;
    const btn = document.createElement('button');
    btn.className = 'remove-btn';
    btn.textContent = '×';
    btn.setAttribute('aria-label', `${sel} silinsin`);
    btn.addEventListener('click', () => removeSelector(sel));
    li.appendChild(span);
    li.appendChild(btn);
    ul.appendChild(li);
  });
}

async function removeSelector(sel) {
  const { custom_selectors } = await chrome.storage.local.get('custom_selectors');
  const updated = (custom_selectors || []).filter(s => s !== sel);
  await chrome.storage.local.set({ custom_selectors: updated });
  renderSelectors(updated);
}

async function addSelector() {
  const input = $('selectorInput');
  const sel = input.value.trim();
  if (!sel) return;
  const { custom_selectors } = await chrome.storage.local.get('custom_selectors');
  const list = custom_selectors || [];
  if (list.includes(sel)) { input.select(); return; }
  const updated = [...list, sel];
  await chrome.storage.local.set({ custom_selectors: updated });
  renderSelectors(updated);
  input.value = '';
}

// --- Custom blocked domains ---
function renderBlockList(list) {
  const ul = $('blockList');
  Array.from(ul.children).forEach(li => { if (li.id !== 'blockEmpty') li.remove(); });
  $('blockEmpty').style.display = list.length ? 'none' : '';
  list.forEach(domain => {
    const li = document.createElement('li');
    li.textContent = domain;
    const btn = document.createElement('button');
    btn.className = 'remove-btn';
    btn.textContent = '×';
    btn.setAttribute('aria-label', `${domain} silinsin`);
    btn.addEventListener('click', () => removeBlocked(domain));
    li.appendChild(btn);
    ul.appendChild(li);
  });
}

async function removeBlocked(domain) {
  await chrome.runtime.sendMessage({ type: 'REMOVE_CUSTOM_BLOCKED', domain });
  const { list } = await chrome.runtime.sendMessage({ type: 'GET_CUSTOM_BLOCKED' });
  renderBlockList(list);
}

async function addBlocked() {
  const input = $('blockInput');
  const raw = parseDomain(input.value);
  if (!raw) return;
  const { list: before } = await chrome.runtime.sendMessage({ type: 'GET_CUSTOM_BLOCKED' });
  if (before.includes(raw)) { input.select(); return; }
  await chrome.runtime.sendMessage({ type: 'BLOCK_DOMAIN', domain: raw });
  const { list } = await chrome.runtime.sendMessage({ type: 'GET_CUSTOM_BLOCKED' });
  renderBlockList(list);
  input.value = '';
}

// --- Init ---
async function init() {
  const [stats, { list: whitelist }, { stats: siteStats }, { list: blockedList }, csData] =
    await Promise.all([
      chrome.runtime.sendMessage({ type: 'GET_STATS' }),
      chrome.runtime.sendMessage({ type: 'GET_WHITELIST' }),
      chrome.runtime.sendMessage({ type: 'GET_SITE_STATS' }),
      chrome.runtime.sendMessage({ type: 'GET_CUSTOM_BLOCKED' }),
      chrome.storage.local.get('custom_selectors'),
    ]);

  $('totalBlocked').textContent = formatNumber(stats?.total || 0);
  $('todayBlocked').textContent = formatNumber(stats?.today || 0);
  renderWhitelist(whitelist);
  renderSiteStats(siteStats || {});
  renderSelectors(csData.custom_selectors || []);
  renderBlockList(blockedList);

  $('addDomain').addEventListener('click', addDomain);
  $('domainInput').addEventListener('keydown', e => { if (e.key === 'Enter') addDomain(); });
  $('resetStats').addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'RESET_STATS' });
    $('totalBlocked').textContent = '0';
    $('todayBlocked').textContent = '0';
  });

  $('clearSiteStats').addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'CLEAR_SITE_STATS' });
    renderSiteStats({});
  });

  $('addSelector').addEventListener('click', addSelector);
  $('selectorInput').addEventListener('keydown', e => { if (e.key === 'Enter') addSelector(); });

  $('addBlock').addEventListener('click', addBlocked);
  $('blockInput').addEventListener('keydown', e => { if (e.key === 'Enter') addBlocked(); });

  const btn = $('donateBtn');
  btn.href = PAYPAL_URL;
  btn.addEventListener('click', e => {
    e.preventDefault();
    chrome.tabs.create({ url: PAYPAL_URL });
  });
}

init();
