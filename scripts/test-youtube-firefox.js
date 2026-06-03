#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { firefox } = require('playwright');

const EXT_ROOT = path.resolve(__dirname, '..');
const CONTENT_JS = fs.readFileSync(path.join(EXT_ROOT, 'content', 'content.js'), 'utf8');

function log(label, ok, detail = '') {
  const mark = ok ? '✓' : '✗';
  console.log(`${mark} ${label}${detail ? ` — ${detail}` : ''}`);
}

async function injectContentScript(context) {
  await context.addInitScript(() => {
    const listeners = [];
    window.chrome = {
      storage: {
        local: {
          get(keys, cb) {
            const data = {
              adblock_enabled: true,
              custom_selectors: [],
            };
            if (typeof keys === 'string') {
              cb({ [keys]: data[keys] });
              return;
            }
            if (Array.isArray(keys)) {
              const out = {};
              keys.forEach((k) => { out[k] = data[k]; });
              cb(out);
              return;
            }
            cb(data);
          },
          set(_value, cb) {
            cb?.();
          },
        },
        onChanged: {
          addListener(fn) {
            listeners.push(fn);
          },
        },
      },
      runtime: {
        onMessage: { addListener() {} },
      },
      i18n: {
        getMessage(key) { return key; },
      },
    };
    window.__fadblockStorageListeners = listeners;
  });

  await context.addInitScript({ content: CONTENT_JS });
}

async function run() {
  const browser = await firefox.launch({
    headless: true,
    executablePath: '/usr/bin/firefox',
  });
  const context = await browser.newContext();
  await injectContentScript(context);

  let ok = true;

  const watch = await context.newPage();
  await watch.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await watch.waitForTimeout(6000);

  const watchState = await watch.evaluate(() => ({
    hasBypassState: !!window.__fadblockYoutubeBypassState,
    hasCosmeticCss: !!document.getElementById('__adblock_pro_css__'),
    playbackRate: document.querySelector('#movie_player video, .html5-video-player video')?.playbackRate ?? null,
    enforcementBefore: !!document.querySelector('ytd-enforcement-message-view-model'),
  }));
  log('Watch page bypass activated', watchState.hasBypassState);
  ok = ok && watchState.hasBypassState;
  log('Watch page cosmetic CSS injected', watchState.hasCosmeticCss);
  ok = ok && watchState.hasCosmeticCss;
  log('Watch page playbackRate normal', watchState.playbackRate === null || watchState.playbackRate <= 1.05, String(watchState.playbackRate));
  ok = ok && (watchState.playbackRate === null || watchState.playbackRate <= 1.05);

  await watch.evaluate(() => {
    const el = document.createElement('ytd-enforcement-message-view-model');
    el.textContent = 'Ad blockers violate YouTube terms of service';
    document.body.appendChild(el);
  });
  await watch.waitForTimeout(1500);
  const removed = await watch.evaluate(() => !document.querySelector('ytd-enforcement-message-view-model'));
  log('Injected enforcement node removed on watch page', removed);
  ok = ok && removed;

  const home = await context.newPage();
  await home.goto('https://www.youtube.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await home.waitForTimeout(5000);
  const homeState = await home.evaluate(() => ({
    hasBypassState: !!window.__fadblockYoutubeBypassState?.timer || !!window.__fadblockYoutubeBypassState?.observer,
    previewPlaybackRates: Array.from(document.querySelectorAll('video')).slice(0, 5).map((v) => v.playbackRate),
  }));
  log('Home/feed page bypass inactive', !homeState.hasBypassState);
  ok = ok && !homeState.hasBypassState;
  log('Home/feed preview videos normal rate', homeState.previewPlaybackRates.every((rate) => rate <= 1.05), homeState.previewPlaybackRates.join(', ') || 'no videos');
  ok = ok && homeState.previewPlaybackRates.every((rate) => rate <= 1.05);

  await browser.close();
  process.exit(ok ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
