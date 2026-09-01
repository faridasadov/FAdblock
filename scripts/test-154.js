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

  // Comprehensive nav debug FIRST
  await context.addInitScript(`(function() {
    var _log = function(msg) { console.log('[NAV] ' + msg); };

    // location.reload
    var _r = Location.prototype.reload;
    Location.prototype.reload = function() { _log('location.reload() CALLED'); return _r.call(this); };

    // location.href setter
    var _hd = Object.getOwnPropertyDescriptor(Location.prototype, 'href');
    if (_hd && _hd.set) {
      Object.defineProperty(Location.prototype, 'href', { configurable:true, get:_hd.get, set:function(v){ _log('location.href=' + v); return _hd.set.call(this, v); } });
    }

    // history.pushState
    var _ps = history.pushState;
    history.pushState = function(s,t,u) { _log('history.pushState ' + u); return _ps.call(this,s,t,u); };
    History.prototype.pushState = function(s,t,u) { _log('History.proto.pushState ' + u); return _ps.call(this,s,t,u); };

    // history.replaceState
    var _rs = history.replaceState;
    history.replaceState = function(s,t,u) { _log('history.replaceState ' + u); return _rs.call(this,s,t,u); };
    History.prototype.replaceState = function(s,t,u) { _log('History.proto.replaceState ' + u); return _rs.call(this,s,t,u); };

    // history.go
    var _hg = History.prototype.go;
    History.prototype.go = function(d) { _log('history.go(' + d + ')'); return _hg.call(this,d); };

    // yt-navigate-start
    document.addEventListener('yt-navigate-start', function(e) {
      var d = e.detail || {};
      _log('yt-navigate-start keys=' + Object.keys(d).join(',') + ' videoId=' + (d.endpoint && d.endpoint.watchEndpoint && d.endpoint.watchEndpoint.videoId || '?') + ' url=' + (d.url||'?') + ' reload=' + d.reload);
    }, true);

    // window.open
    var _wo = window.open;
    window.open = function(u) { _log('window.open ' + u); return _wo.apply(this, arguments); };

    _log('ALL HOOKS READY');
  })()`);

  // Then inject our actual extension
  const injectV2 = fs.readFileSync(path.join(ROOT, 'content', 'youtube-inject-v2.js'), 'utf8');
  await context.addInitScript(injectV2);

  const page = await context.newPage();
  const allEvents = [];
  const startTime = Date.now();

  page.on('console', msg => {
    const t = msg.text();
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    if (t.startsWith('[NAV]') || t.startsWith('[FAD]')) {
      const line = `[${elapsed}s] ${t.slice(0,150)}`;
      allEvents.push(line);
      console.log(line);
    }
    if (msg.type() === 'error') {
      console.log(`[${elapsed}s] ERR: ${t.slice(0,100)}`);
    }
  });

  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[${elapsed}s] FRAME-NAV: ${frame.url().slice(0,80)}`);
      allEvents.push(`[${elapsed}s] FRAME-NAV: ${frame.url().slice(0,80)}`);
    }
  });

  // Use a longer video (~10 min) so it won't end naturally
  const VIDEO = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  console.log('Navigating to:', VIDEO);
  await page.goto(VIDEO, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(2000);
  await page.evaluate(() => { document.querySelector('video')?.play().catch(()=>{}); });

  // Monitor for 140 seconds (past the 1:54 mark)
  console.log('\nMonitoring 140 seconds...\n');
  for (let i = 0; i < 28; i++) {
    await sleep(5000);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const state = await page.evaluate(() => ({
      time: document.querySelector('video')?.currentTime?.toFixed(1),
      paused: document.querySelector('video')?.paused,
      url: location.href.slice(40,80),
    }));
    console.log(`[${elapsed}s] videoTime=${state.time}s paused=${state.paused} url=...${state.url}`);
  }

  await page.screenshot({ path: path.join(ROOT, 'ss-154-final.png') });
  fs.writeFileSync(path.join(ROOT, 'nav-events-154.log'), allEvents.join('\n'));
  console.log('\nLog saved: nav-events-154.log');
  await sleep(2000);
  await browser.close();
})().catch(e => { console.error('[FATAL]', e.message); process.exit(1); });
