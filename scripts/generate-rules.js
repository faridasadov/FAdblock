#!/usr/bin/env node
// Generates rules/rules.json from the domain lists below.
// Run: node scripts/generate-rules.js

const { writeFileSync } = require('fs');
const { join } = require('path');

const ALL_TYPES = [
  'main_frame', 'sub_frame', 'script', 'stylesheet',
  'image', 'font', 'xmlhttprequest', 'media', 'websocket', 'other'
];

const SCRIPT_TYPES = ['script', 'xmlhttprequest', 'sub_frame', 'websocket', 'other'];

const AD_DOMAINS = [
  // Google advertising
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
  'googletagservices.com', 'adservice.google.com',
  // Ad exchanges / DSPs
  'adnxs.com', 'rubiconproject.com', 'pubmatic.com', 'openx.net', 'openx.com',
  'casalemedia.com', 'indexww.com', 'advertising.com', 'smartadserver.com',
  'contextweb.com', 'lijit.com', 'sovrn.com', 'spotxchange.com', 'spotx.tv',
  'mediamath.com', 'thetradedesk.com', 'adsrvr.org', 'turn.com',
  // Content / native ads
  'taboola.com', 'outbrain.com', 'mgid.com', 'revcontent.com', 'zergnet.com',
  'content.ad', 'adblade.com',
  // Analytics trackers
  'scorecardresearch.com', 'quantserve.com', 'omtrdc.net', 'demdex.net',
  'bluekai.com', 'krxd.net', 'exelator.com', 'lotame.com',
  'addthis.com', 'sharethis.com', 'chartbeat.com', 'chartbeat.net',
  // Social pixel / ads
  'facebook.net', 'ads-twitter.com', 'static.ads-twitter.com',
  // Amazon, Criteo
  'amazon-adsystem.com', 'criteo.com', 'criteo.net', 'hlserve.com',
  // Yandex
  'an.yandex.ru', 'mc.yandex.ru',
  // Moat
  'moatads.com', 'moatpixel.com',
  // Other
  'adtech.com', 'adtechus.com', 'adroll.com', 'undertone.com', 'springserve.com',
  'bidswitch.net', 'adform.net', 'adform.com', 'adcolony.com', 'mopub.com',
  'smaato.net', 'inmobi.com', 'ironsrc.com', 'vungle.com', 'chartboost.com',
  'flurry.com', 'trafficjunky.net', 'exoclick.com', 'adsterra.com',
  'propellerads.com', 'popads.net', 'adcash.com', 'zeropark.com',
  'trafficstars.com', 'applovin.com',
];

const TRACKER_DOMAINS = [
  'hotjar.com', 'clarity.ms', 'segment.io', 'segment.com',
  'mixpanel.com', 'amplitude.com', 'heap.io', 'fullstory.com',
  'logrocket.com', 'mouseflow.com', 'crazyegg.com', 'kissmetrics.com',
  'inspectlet.com', 'bounceexchange.com',
];

let id = 1;
const rules = [];

for (const domain of AD_DOMAINS) {
  rules.push({
    id: id++,
    priority: 1,
    action: { type: 'block' },
    condition: { urlFilter: `||${domain}^`, resourceTypes: ALL_TYPES }
  });
}

for (const domain of TRACKER_DOMAINS) {
  rules.push({
    id: id++,
    priority: 1,
    action: { type: 'block' },
    condition: { urlFilter: `||${domain}^`, resourceTypes: SCRIPT_TYPES }
  });
}

const outPath = join(__dirname, '..', 'rules', 'rules.json');
writeFileSync(outPath, JSON.stringify(rules, null, 2));
console.log(`Generated ${rules.length} rules → ${outPath}`);
