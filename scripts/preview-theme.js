#!/usr/bin/env node
const { firefox } = require('playwright');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '../options/options.css'), 'utf8');
const outDir = path.join(__dirname, '../');

function buildHtml(activeTheme) {
  const themes = [
    { id: 'light',    icon: '☀️',  label: 'Light' },
    { id: 'dark',     icon: '🌙',  label: 'Dark' },
    { id: 'midnight', icon: '🌚',  label: 'Midnight' },
    { id: 'system',   icon: '💻',  label: 'System' },
  ];

  const cards = themes.map(t => `
    <button class="theme-card" aria-pressed="${t.id === activeTheme ? 'true' : 'false'}" data-theme-id="${t.id}">
      <div class="theme-preview theme-preview--${t.id}"></div>
      <span class="theme-card-icon">${t.icon}</span>
      <span class="theme-card-name">${t.label}</span>
    </button>`).join('');

  return `<!DOCTYPE html>
<html lang="en" data-theme="${activeTheme}">
<head>
<meta charset="UTF-8"/>
<style>
${css}
body { width: 820px; padding: 28px 24px; }
.card { background:var(--surface); border:1px solid var(--line); border-radius:var(--radius); padding:20px; box-shadow:var(--shadow); }
.card-head { display:flex; align-items:center; gap:8px; margin-bottom:14px; }
.card-icon { font-size:18px; }
h2 { font-size:14px; font-weight:700; color:var(--ink); }
</style>
</head>
<body>
<section class="card">
  <div class="card-head">
    <span class="card-icon">🎨</span>
    <h2>Görünüş (${activeTheme})</h2>
  </div>
  <div class="theme-grid">${cards}</div>
</section>
</body>
</html>`;
}

(async () => {
  const browser = await firefox.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 860, height: 260 });

  for (const theme of ['light', 'dark', 'midnight']) {
    const html = buildHtml(theme);
    const tmpFile = path.join(outDir, `_preview-${theme}.html`);
    fs.writeFileSync(tmpFile, html);
    await page.goto(`file:///${tmpFile.replace(/\\/g, '/')}`);
    await page.waitForTimeout(200);
    const out = path.join(outDir, `_preview-${theme}.png`);
    await page.screenshot({ path: out, fullPage: true });
    fs.unlinkSync(tmpFile);
    console.log('Saved:', out);
  }

  await browser.close();
})();
