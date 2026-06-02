#!/usr/bin/env node
const { chromium } = require('playwright');
const path = require('path');

const EXT_PATH = path.resolve(__dirname, '..');

async function main() {
  const ctx = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
    viewport: { width: 1280, height: 800 },
  });

  await new Promise(r => setTimeout(r, 1500));

  // Find extension ID via service worker
  let extId = null;
  for (const sw of ctx.serviceWorkers()) {
    const m = sw.url().match(/chrome-extension:\/\/([^/]+)/);
    if (m) { extId = m[1]; break; }
  }

  if (!extId) {
    const page = await ctx.newPage();
    await page.goto('chrome://extensions/');
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: '/tmp/ext_01_extensions.png', fullPage: true });
    console.log('ext_01_extensions.png');
    await ctx.close();
    return;
  }

  console.log('Extension ID:', extId);

  const popupPage = await ctx.newPage();
  await popupPage.goto(`chrome-extension://${extId}/popup/popup.html`);
  await popupPage.waitForLoadState('networkidle');
  await popupPage.screenshot({ path: '/tmp/ext_02_popup.png' });
  console.log('ext_02_popup.png');

  const optPage = await ctx.newPage();
  await optPage.goto(`chrome-extension://${extId}/options/options.html`);
  await optPage.waitForLoadState('networkidle');
  await optPage.screenshot({ path: '/tmp/ext_03_options.png', fullPage: true });
  console.log('ext_03_options.png');

  await ctx.close();
  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
