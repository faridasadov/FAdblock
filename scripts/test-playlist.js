#!/usr/bin/env node
'use strict';
// Playlist auto-advance ad test — injects MAIN world fix code via addInitScript
const { firefox } = require('playwright');

const PLAYLIST = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLbpi6ZahtOH6Ar_3GPy3workV0OaZ2xNQ';

// The MAIN world script from youtube-firefox-bridge.js (after SW fix)
const INJECT = `(function(){
  if(window.__fadblockPlayerFix)return;
  window.__fadblockPlayerFix=true;
  var PLAYER_RE=/\\/youtubei\\/v\\d+\\/(player|next)\\b|\\/get_watch\\?/;
  var ENFORCE_RE=/adblock|ad block|disable.{0,30}ad|allow youtube ads/i;
  function fixPlayerObj(o){
    if(!o||typeof o!=='object')return o;
    var ps=o.playabilityStatus;
    if(ps&&(ps.status==='UNPLAYABLE'||ps.status==='ERROR')){
      var es=ps.errorScreen||{};
      if(es.enforcementMessageRenderer||es.adBlockerMessageRenderer||ENFORCE_RE.test(ps.reason||'')){
        o.playabilityStatus={status:'OK',playableInEmbed:true};
      }
    }
    if(Array.isArray(o.adPlacements))o.adPlacements=[];
    if(Array.isArray(o.playerAds))o.playerAds=[];
    if(Array.isArray(o.adBreaks))o.adBreaks=[];
    return o;
  }
  function hookProp(name){
    var _val;
    try{
      Object.defineProperty(window,name,{
        configurable:true,
        get:function(){return _val;},
        set:function(v){_val=fixPlayerObj(v);}
      });
    }catch(e){}
  }
  hookProp('ytInitialPlayerResponse');
  hookProp('playerResponse');
  var _fetch=window.fetch;
  window.fetch=function(input,init){
    var url=typeof input==='string'?input:(input&&input.url)||'';
    var p=_fetch.apply(this,arguments);
    if(!PLAYER_RE.test(url))return p;
    return p.then(function(r){
      return r.text().then(function(t){
        try{return new Response(JSON.stringify(fixPlayerObj(JSON.parse(t))),
          {status:r.status,statusText:r.statusText,headers:r.headers});}
        catch(e){return new Response(t,{status:r.status,statusText:r.statusText,headers:r.headers});}
      });
    });
  };
  var _xhrOpen=XMLHttpRequest.prototype.open;
  var _xhrSend=XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open=function(m,u){
    this._fadUrl=typeof u==='string'?u:'';
    return _xhrOpen.apply(this,arguments);
  };
  XMLHttpRequest.prototype.send=function(){
    if(PLAYER_RE.test(this._fadUrl||'')){
      this.addEventListener('readystatechange',function(){
        if(this.readyState!==4)return;
        try{
          var cleaned=JSON.stringify(fixPlayerObj(JSON.parse(this.responseText)));
          Object.defineProperty(this,'responseText',{configurable:true,value:cleaned});
          Object.defineProperty(this,'response',{configurable:true,value:cleaned});
        }catch(e){}
      });
    }
    return _xhrSend.apply(this,arguments);
  };
  function unregisterSW(){
    try{
      if(navigator.serviceWorker){
        navigator.serviceWorker.getRegistrations().then(function(regs){
          regs.forEach(function(r){r.unregister();});
        });
      }
    }catch(e){}
  }
  unregisterSW();
  document.addEventListener('yt-navigate-start',unregisterSW);
  document.addEventListener('yt-navigate-finish',unregisterSW);
})();`;

async function checkAds(page) {
  return page.evaluate(() => {
    const player = document.querySelector('#movie_player, .html5-video-player');
    const adShowing = player?.classList?.contains('ad-showing') || false;
    const skipBtn = !!document.querySelector('.ytp-ad-skip-button, .ytp-skip-ad-button, .ytp-ad-skip-button-modern');
    const enforcement = !!document.querySelector('ytd-enforcement-message-view-model');
    const video = document.querySelector('video');
    return {
      adShowing, skipBtn, enforcement,
      fixActive: !!window.__fadblockPlayerFix,
      playbackRate: video?.playbackRate ?? null,
      url: location.href,
    };
  });
}

(async () => {
  const ctx = await firefox.launch({ headless: false });
  const context = await ctx.newContext();
  await context.addInitScript(INJECT);

  const page = await context.newPage();

  console.log('\n[1] First playlist video...');
  await page.goto(PLAYLIST, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(9000);

  const v1 = await checkAds(page);
  const v1Clean = !v1.adShowing && !v1.skipBtn && !v1.enforcement;
  console.log(`Video 1: ${v1Clean ? '✅ CLEAN' : '❌ ADS'} | fix:${v1.fixActive} | rate:${v1.playbackRate}`);

  console.log('\n[2] Next video in playlist...');
  const nav = await page.evaluate(() => {
    const items = document.querySelectorAll('ytd-playlist-panel-video-renderer');
    if (items.length >= 2) { items[1].querySelector('a')?.click(); return 'playlist-panel'; }
    const nb = document.querySelector('.ytp-next-button');
    if (nb) { nb.click(); return 'next-btn'; }
    return false;
  });
  console.log('  Nav:', nav);
  await page.waitForTimeout(10000);

  const v2 = await checkAds(page);
  const v2Clean = !v2.adShowing && !v2.skipBtn && !v2.enforcement;
  console.log(`Video 2: ${v2Clean ? '✅ CLEAN' : '❌ ADS'} | fix:${v2.fixActive} | rate:${v2.playbackRate}`);
  console.log('  URL:', v2.url);

  console.log('\n=== RESULT ===');
  if (!v1.fixActive && !v2.fixActive) {
    console.log('⚠️  Fix script not active — addInitScript failed');
  } else if (v1Clean && v2Clean) {
    console.log('✅ PLAYLIST FIX WORKS');
  } else {
    if (!v1Clean) console.log('❌ Video 1 had ads');
    if (!v2Clean) console.log('❌ Video 2 (after navigation) had ads');
  }

  await page.waitForTimeout(3000);
  await ctx.close();
})().catch(e => { console.error('Error:', e.message); process.exit(1); });
