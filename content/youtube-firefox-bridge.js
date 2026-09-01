(function () {
  'use strict';

  if (!/firefox/i.test(navigator.userAgent)) return;
  if (!location.hostname.endsWith('youtube.com')) return;

  // Access the actual page window (bypasses X-Ray vision)
  const pw = window.wrappedJSObject;
  if (!pw || pw.__fadblockFirefoxBridgeActive) return;
  pw.__fadblockFirefoxBridgeActive = true;

  // Spoof google_ad_status so YouTube thinks ads are enabled.
  // youtube-inject-v2.js (MAIN world) also does this; belt-and-suspenders.
  try {
    Object.defineProperty(pw, 'google_ad_status', {
      configurable: true,
      get: exportFunction(function () { return '1'; }, pw),
      set: exportFunction(function () {}, pw),
    });
  } catch (e) {}

  // Inject a minimal fetch interceptor into MAIN world to fix UNPLAYABLE player responses.
  // When logged in to YouTube, the server sends playabilityStatus:{status:"UNPLAYABLE"} with
  // enforcementMessageRenderer. CSS/DOM removal alone can't fix this — the player's internal
  // state is UNPLAYABLE and playVideo() won't work. We must intercept the response before
  // the player reads it.
  try {
    if (!pw.__fadblockPlayerFixActive && !pw.__fadblockYoutubePruneActive) {
      pw.__fadblockPlayerFixActive = true;
      const script = document.createElement('script');
      script.textContent = `(function(){
        if(window.__fadblockPlayerFix)return;
        window.__fadblockPlayerFix=true;
        var PLAYER_RE=/\\/youtubei\\/v\\d+\\/(player|next)\\b|\\/get_watch\\?/;
        var ENFORCE_RE=/adblock|ad block|disable.{0,30}ad|allow youtube ads|\\u0431\\u043b\\u043e\\u043a\\u0438\\u0440|reklam engelleyici/i;
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
      (document.documentElement || document.head || document.body || document).appendChild(script);
      script.remove();
    }
  } catch (e) {}

  // Stub window.googletag — googletagservices.com/gpt.js is blocked by adblock_main,
  // so we provide a minimal fake to prevent YouTube enforcement detection.
  try {
    if (!pw.googletag) {
      const fakeSlot = cloneInto({}, pw);
      fakeSlot.addService = exportFunction(function () { return fakeSlot; }, pw);
      fakeSlot.setTargeting = exportFunction(function () { return fakeSlot; }, pw);
      fakeSlot.defineSizeMapping = exportFunction(function () { return fakeSlot; }, pw);
      fakeSlot.getSlotElementId = exportFunction(function () { return ''; }, pw);

      const fakePubads = cloneInto({}, pw);
      const noop = exportFunction(function () {}, pw);
      const returnPubads = exportFunction(function () { return fakePubads; }, pw);
      fakePubads.addEventListener = returnPubads;
      fakePubads.removeEventListener = returnPubads;
      fakePubads.setTargeting = returnPubads;
      fakePubads.clearTargeting = returnPubads;
      fakePubads.refresh = noop;
      fakePubads.enableLazyLoad = noop;
      fakePubads.collapseEmptyDivs = noop;
      fakePubads.disableInitialLoad = noop;
      fakePubads.enableSingleRequest = noop;
      fakePubads.setPrivacySettings = noop;
      fakePubads.updateCorrelator = noop;
      fakePubads.getTargeting = exportFunction(function () { return []; }, pw);
      fakePubads.getSlots = exportFunction(function () { return []; }, pw);

      const cmdQueue = cloneInto([], pw);
      cmdQueue.push = exportFunction(function (fn) { try { fn(); } catch (e) {} return 0; }, pw);

      const gt = cloneInto({ apiReady: true, pubadsReady: true }, pw);
      gt.cmd = cmdQueue;
      gt.pubads = exportFunction(function () { return fakePubads; }, pw);
      gt.enableServices = noop;
      gt.defineSlot = exportFunction(function () { return fakeSlot; }, pw);
      gt.defineOutOfPageSlot = exportFunction(function () { return fakeSlot; }, pw);
      gt.display = noop;
      gt.destroySlots = exportFunction(function () { return true; }, pw);
      Object.defineProperty(pw, 'googletag', { configurable: true, value: gt });
    }
  } catch (e) {}

})();
