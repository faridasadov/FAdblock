const $ = id => document.getElementById(id);

function formatNumber(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}

function renderWhitelist(list) {
  const ul = $('whitelistEl');
  const emptyHint = $('emptyHint');

  Array.from(ul.children).forEach(li => {
    if (li.id !== 'emptyHint') li.remove();
  });

  if (list.length === 0) {
    emptyHint.style.display = '';
    return;
  }

  emptyHint.style.display = 'none';
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
  const raw = input.value.trim().toLowerCase()
    .replace(/^(https?:\/\/)?(www\.)?/, '')
    .replace(/\/.*$/, '');
  if (!raw) return;

  const { list: before } = await chrome.runtime.sendMessage({ type: 'GET_WHITELIST' });
  if (before.includes(raw)) { input.select(); return; }

  await chrome.runtime.sendMessage({ type: 'TOGGLE_WHITELIST', domain: raw });
  const { list } = await chrome.runtime.sendMessage({ type: 'GET_WHITELIST' });
  renderWhitelist(list);
  input.value = '';
}

async function init() {
  const [stats, { list }] = await Promise.all([
    chrome.runtime.sendMessage({ type: 'GET_STATS' }),
    chrome.runtime.sendMessage({ type: 'GET_WHITELIST' })
  ]);

  $('totalBlocked').textContent = formatNumber(stats?.total || 0);
  $('todayBlocked').textContent = formatNumber(stats?.today || 0);
  renderWhitelist(list);

  $('addDomain').addEventListener('click', addDomain);
  $('domainInput').addEventListener('keydown', e => { if (e.key === 'Enter') addDomain(); });
  $('resetStats').addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'RESET_STATS' });
    $('totalBlocked').textContent = '0';
    $('todayBlocked').textContent = '0';
  });
}

init();
