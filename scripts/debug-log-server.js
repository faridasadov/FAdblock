#!/usr/bin/env node
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 4317;
const LOG_DIR = path.join(process.env.USERPROFILE || process.env.HOME || '/tmp', 'fadblock-logs');
const LATEST = path.join(LOG_DIR, 'latest.json');
const HISTORY = path.join(LOG_DIR, 'history.jsonl');

fs.mkdirSync(LOG_DIR, { recursive: true });

let _logs = [];

function saveLogs() {
  try {
    fs.writeFileSync(LATEST, JSON.stringify({ exported_at: new Date().toISOString(), count: _logs.length, logs: _logs }, null, 2));
  } catch {}
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'DELETE') {
    _logs = [];
    saveLogs();
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, cleared: true }));
    return;
  }

  if (req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ count: _logs.length, logs: _logs }));
    return;
  }

  if (req.method === 'POST') {
    let body = '';
    req.on('data', d => { body += d; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const entries = Array.isArray(payload.logs) ? payload.logs : [payload];
        for (const entry of entries) {
          entry._server_at = new Date().toISOString();
          _logs.push(entry);
          const line = JSON.stringify(entry);
          process.stdout.write('[LOG] ' + (entry.event || entry.ev || '?') + ' ' + JSON.stringify(entry.data || entry.d || {}).slice(0, 120) + '\n');
          try { fs.appendFileSync(HISTORY, line + '\n'); } catch {}
        }
        if (_logs.length > 2000) _logs = _logs.slice(-2000);
        saveLogs();
      } catch {}
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }

  res.writeHead(404); res.end();
});

server.listen(PORT, '0.0.0.0', () => {
  process.stdout.write('fadblock log server listening on http://localhost:' + PORT + '\n');
  process.stdout.write('Logs: ' + LOG_DIR + '\n');
});
