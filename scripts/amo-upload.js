#!/usr/bin/env node
'use strict';
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { prepareFirefoxPackage } = require('./firefox-package');

const API_KEY    = process.env.AMO_API_KEY;
const API_SECRET = process.env.AMO_API_SECRET;
const CHANNEL    = process.env.AMO_CHANNEL    || 'listed';   // or 'unlisted'

function b64url(buf) {
  return (Buffer.isBuffer(buf) ? buf : Buffer.from(buf))
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function makeJwt(key, secret, nowSec) {
  const header  = b64url(JSON.stringify({ typ: 'JWT', alg: 'HS256' }));
  const payload = b64url(JSON.stringify({ iss: key, iat: nowSec, exp: nowSec + 60 }));
  const sig = crypto.createHmac('sha256', secret)
    .update(`${header}.${payload}`).digest();
  return `${header}.${payload}.${b64url(sig)}`;
}

// Get AMO server's current time from a Date response header
async function getAmoTime() {
  return new Promise((resolve, reject) => {
    https.get('https://addons.mozilla.org/api/v5/addons/search/?q=a&page_size=1', (res) => {
      res.resume();
      const date = res.headers['date'];
      if (date) {
        resolve(Math.floor(new Date(date).getTime() / 1000));
      } else {
        reject(new Error('No Date header from AMO'));
      }
    }).on('error', reject);
  });
}

function amoRequest(method, urlPath, jwt, body, contentType) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'addons.mozilla.org',
      port: 443,
      path: urlPath,
      method,
      headers: {
        Authorization: `JWT ${jwt}`,
        'Content-Type': contentType,
      },
    };
    if (body) opts.headers['Content-Length'] = body.length;
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', d => { data += d; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function amoUploadXpi(xpiPath, jwt) {
  return new Promise((resolve, reject) => {
    const boundary = `----FormBoundary${crypto.randomBytes(8).toString('hex')}`;
    const xpiData = fs.readFileSync(xpiPath);
    const fileName = path.basename(xpiPath);
    const pre = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="upload"; filename="${fileName}"\r\nContent-Type: application/zip\r\n\r\n`
    );
    const chanPart = Buffer.from(
      `\r\n--${boundary}\r\nContent-Disposition: form-data; name="channel"\r\n\r\n${CHANNEL}`
    );
    const post = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([pre, xpiData, chanPart, post]);

    const opts = {
      hostname: 'addons.mozilla.org',
      port: 443,
      path: '/api/v5/addons/upload/',
      method: 'POST',
      headers: {
        Authorization: `JWT ${jwt}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', d => { data += d; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

(async () => {
  // 1. Build XPI
  const root = path.resolve(__dirname, '..');
  const stageDir = prepareFirefoxPackage(root);
  const { execFileSync } = require('child_process');
  const artifactsDir = path.join(require('os').tmpdir(), 'fadblock-amo-build');
  fs.mkdirSync(artifactsDir, { recursive: true });
  console.log('[amo] Building XPI from', stageDir);
  const out = execFileSync('npx', [
    'web-ext', 'build',
    '--source-dir', stageDir,
    '--artifacts-dir', artifactsDir,
    '--overwrite-dest',
  ], { encoding: 'utf8', shell: true });
  const m = out.match(/Your web extension is ready: (.+\.(?:zip|xpi))/);
  if (!m) { console.error('XPI build failed:\n', out); process.exit(1); }
  const xpiPath = m[1].trim();
  console.log('[amo] XPI ready:', xpiPath);

  // 2. Get AMO server time and create JWT
  console.log('[amo] Getting AMO server time…');
  const amoNow = await getAmoTime();
  const sysNow  = Math.floor(Date.now() / 1000);
  console.log('[amo] AMO UTC time:', amoNow, '| sys UTC time:', sysNow, '| diff:', amoNow - sysNow, 's');
  const jwt = makeJwt(API_KEY, API_SECRET, amoNow);

  // 3. Upload XPI to AMO
  console.log('[amo] Uploading XPI…');
  const uploadRes = await amoUploadXpi(xpiPath, jwt);
  console.log('[amo] Upload response status:', uploadRes.status);
  console.log('[amo] Upload response body:', uploadRes.body.slice(0, 800));

  let uploadData;
  try { uploadData = JSON.parse(uploadRes.body); } catch (e) {
    console.error('[amo] Could not parse upload response'); process.exit(1);
  }

  if (uploadRes.status >= 400) {
    console.error('[amo] Upload failed'); process.exit(1);
  }

  const uuid = uploadData.uuid;
  if (!uuid) { console.error('[amo] No uuid in upload response'); process.exit(1); }
  console.log('[amo] Upload UUID:', uuid);

  // 4. Poll for validation
  console.log('[amo] Polling validation…');
  let valid = false;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const jwt2 = makeJwt(API_KEY, API_SECRET, Math.floor(await getAmoTime()));
    const pollRes = await amoRequest('GET', `/api/v5/addons/upload/${uuid}/`, jwt2, null, 'application/json');
    let pollData;
    try { pollData = JSON.parse(pollRes.body); } catch (e) { continue; }
    const processed = pollData.processed;
    const valid_flag = pollData.valid;
    console.log(`[amo] [${i+1}/30] processed=${processed} valid=${valid_flag}`);
    if (pollData.validation_results?.messages?.length) {
      console.log('[amo] Validation messages:', JSON.stringify(pollData.validation_results.messages.slice(0,5), null, 2));
    }
    if (processed) {
      valid = valid_flag;
      if (!valid) console.log('[amo] Full validation response:', JSON.stringify(pollData, null, 2).slice(0, 3000));
      break;
    }
  }

  if (!valid) {
    console.error('[amo] Validation failed or timed out'); process.exit(1);
  }

  // 5. Resolve addon id (check if addon exists already)
  const ADDON_ID = process.env.AMO_ADDON_ID || 'adblock-pro@farid.dev';
  const jwt3a = makeJwt(API_KEY, API_SECRET, Math.floor(await getAmoTime()));
  const checkRes = await amoRequest('GET', `/api/v5/addons/addon/${encodeURIComponent(ADDON_ID)}/`, jwt3a, null, 'application/json');
  const addonExists = checkRes.status === 200;
  let addonNumericId = ADDON_ID;
  if (addonExists) {
    try { addonNumericId = JSON.parse(checkRes.body).id || ADDON_ID; } catch(e) {}
    console.log('[amo] Addon exists, id:', addonNumericId, '— submitting new version');
  } else {
    console.log('[amo] Addon not found, creating new listing');
  }

  // 6. Submit version
  const jwt3 = makeJwt(API_KEY, API_SECRET, Math.floor(await getAmoTime()));
  const versionBody = Buffer.from(JSON.stringify({ upload: uuid }));
  const submitPath = addonExists
    ? `/api/v5/addons/addon/${addonNumericId}/versions/`
    : '/api/v5/addons/addon/';
  const submitRes = await amoRequest('POST', submitPath, jwt3, versionBody, 'application/json');
  console.log('[amo] Submit status:', submitRes.status);
  console.log('[amo] Submit response:', submitRes.body.slice(0, 1200));

  if (submitRes.status >= 400) {
    console.error('[amo] Submission failed');
    process.exit(1);
  }

  const resData = JSON.parse(submitRes.body);
  const slug = resData?.addon?.slug || resData?.slug || addonNumericId;
  console.log('[amo] Done! version:', resData?.version, '| id:', resData?.id);
  console.log('[amo] Review URL: https://addons.mozilla.org/en-US/developers/addon/' + slug + '/versions');
})().catch(e => { console.error('[amo] Fatal:', e.message); process.exit(1); });
