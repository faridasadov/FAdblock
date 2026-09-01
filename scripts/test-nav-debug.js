#!/usr/bin/env node
'use strict';
const { firefox } = require('playwright');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await firefox.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });

  // Inject our script PLUS extra navigation debugging
  const injectV2 = fs.readFileSync(path.join(ROOT, 'content', 'youtube-inject-v2.js'), 'utf8');
  const debugScript = `
(function() {
  // Log ALL navigation mechanisms
  var _origPush = history.pushState;
  history.pushState = function(s, t, url) {
    console.log('[NAV-DEBUG] history.pushState url=' + url);
    return _origPush.call(this, s, t, url);
  };

  var _origReplace = history.replaceState;
  history.replaceState = function(s, t, url) {
    console.log('[NAV-DEBUG] history.replaceState url=' + url);
    return _origReplace.call(this, s, t, url);
  };

  // Also override History.prototype (belt+suspenders)
  var _protoOrigPush = History.prototype.pushState;
  History.prototype.pushState = function(s, t, url) {
    console.log('[NAV-DEBUG] History.proto.pushState url=' + url);
    return _protoOrigPush.call(this, s, t, url);
  };

  var _origLocHref = Object.getOwnPropertyDescriptor(Location.prototype, 'href');
  if (_origLocHref && _origLocHref.set) {
    Object.defineProperty(Location.prototype, 'href', {
      configurable: true,
      get: _origLocHref.get,
      set: function(v) {
        console.log('[NAV-DEBUG] location.href set to=' + v);
        return _origLocHref.set.call(this, v);
      }
    });
  }

  var _origReload = Location.prototype.reload;
  Location.prototype.reload = function() {
    console.log('[NAV-DEBUG] location.reload() called!');
    return _origReload.call(this);
  };

  document.addEventListener('yt-navigate-start', function(e) {
    var d = e.detail || {};
    var videoId = d.pageData?.watchEndpoint?.videoId || d.endpoint?.watchEndpoint?.videoId || '?';
    var url = d.pageData?.commandMetadata?.webCommandMetadata?.url || '?';
    console.log('[NAV-DEBUG] yt-navigate-start videoId=' + videoId + ' url=' + url);
    console.log('[NAV-DEBUG] yt-navigate-start detail keys=' + Object.keys(d).join(','));
  }, true);

  document.addEventListener('yt-navigate-finish', function(e) {
    console.log('[NAV-DEBUG] yt-navigate-finish url=' + location.href.slice(0,80));
  });

  console.log('[NAV-DEBUG] All hooks installed');
})();
`;

  await context.addInitScript(debugScript);
  await context.addInitScript(injectV2);

  const page = await context.newPage();
  page.on('console', msg => {
    const t = msg.text();
    if (t.includes('[NAV-DEBUG]') || t.startsWith('[FAD]')) {
      console.log(`[${new Date().toISOString().slice(11,19)}]`, t.slice(0, 150));
    }
  });
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame())
      console.log(`[${new Date().toISOString().slice(11,19)}] FRAME-NAV:`, frame.url().slice(0, 80));
  });

  await page.goto('https://www.youtube.com/watch?v=jNQXAC9IVRw', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(2000);
  await page.evaluate(() => { document.querySelector('video')?.play().catch(()=>{}); });

  console.log('\nWaiting 35 seconds to catch NAV #2...\n');
  await sleep(35000);

  await page.screenshot({ path: path.join(ROOT, 'ss-nav-debug.png') });
  await sleep(2000);
  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });
