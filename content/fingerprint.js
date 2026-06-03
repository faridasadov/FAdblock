(function () {
  'use strict';

  // --- Canvas 2D: getImageData noise (prevents canvas fingerprinting) ---
  const _origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    const ctx = _origGetContext.call(this, type, attrs);
    if (!ctx || type !== '2d' || ctx.__fp_patched) return ctx;
    ctx.__fp_patched = true;
    const _origGetImageData = ctx.getImageData;
    ctx.getImageData = function (x, y, w, h) {
      const d = _origGetImageData.call(this, x, y, w, h);
      if (d.data.length >= 4) {
        // Flip 1 bit in 1 random pixel — visually invisible, hash differs
        const idx = (Math.floor(Math.random() * ((w * h) || 1))) * 4;
        d.data[idx] ^= 1;
      }
      return d;
    };
    return ctx;
  };

  // --- AudioContext: tiny noise in analyser output ---
  try {
    const _origGetFloat = AnalyserNode.prototype.getFloatFrequencyData;
    AnalyserNode.prototype.getFloatFrequencyData = function (arr) {
      _origGetFloat.call(this, arr);
      if (arr.length > 0) arr[0] += (Math.random() - 0.5) * 0.0001;
    };
    const _origGetByte = AnalyserNode.prototype.getByteFrequencyData;
    AnalyserNode.prototype.getByteFrequencyData = function (arr) {
      _origGetByte.call(this, arr);
      if (arr.length > 0) arr[0] = Math.max(0, Math.min(255, arr[0] ^ 1));
    };
  } catch {}

  // --- Navigator normalization ---
  try {
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      get: () => 4, configurable: true,
    });
  } catch {}
  try {
    Object.defineProperty(navigator, 'deviceMemory', {
      get: () => 8, configurable: true,
    });
  } catch {}

  // --- Screen: normalize color depth (common fingerprint vector) ---
  try {
    Object.defineProperty(screen, 'colorDepth',  { get: () => 24, configurable: true });
    Object.defineProperty(screen, 'pixelDepth',  { get: () => 24, configurable: true });
  } catch {}

  // --- WebRTC: force relay-only to prevent local IP leak ---
  try {
    const _OrigRTC = window.RTCPeerConnection;
    if (_OrigRTC) {
      function PatchedRTC(config, constraints) {
        if (config && Array.isArray(config.iceServers)) {
          config = Object.assign({}, config, { iceTransportPolicy: 'relay' });
        }
        return new _OrigRTC(config, constraints);
      }
      PatchedRTC.prototype = _OrigRTC.prototype;
      Object.defineProperty(window, 'RTCPeerConnection', { value: PatchedRTC, writable: true, configurable: true });
    }
  } catch {}

})();
