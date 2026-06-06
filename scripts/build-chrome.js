#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fadblock-chrome-'));
const stageDir = path.join(tempDir, 'package');

fs.mkdirSync(stageDir, { recursive: true });

for (const entry of fs.readdirSync(root)) {
  if (['.git', 'node_modules', 'dist'].includes(entry)) continue;
  const src = path.join(root, entry);
  const dest = path.join(stageDir, entry);
  fs.cpSync(src, dest, { recursive: true });
}

const manifestPath = path.join(stageDir, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (manifest.background) {
  delete manifest.background.scripts;
}
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

// Replace "Firefox" with "Chrome" in all locale description fields
const localesDir = path.join(stageDir, '_locales');
for (const lang of fs.readdirSync(localesDir)) {
  const msgPath = path.join(localesDir, lang, 'messages.json');
  if (!fs.existsSync(msgPath)) continue;
  const msgs = JSON.parse(fs.readFileSync(msgPath, 'utf8'));
  if (msgs.extDescription?.message) {
    msgs.extDescription.message = msgs.extDescription.message.replace(/Firefox/g, 'Chrome');
  }
  fs.writeFileSync(msgPath, JSON.stringify(msgs, null, 2) + '\n');
}

fs.mkdirSync(distDir, { recursive: true });
const zipPath = path.join(distDir, 'fadblock-chrome.zip');
try { fs.unlinkSync(zipPath); } catch {}

execFileSync('zip', ['-r', zipPath, '.','-x','*.DS_Store'], {
  cwd: stageDir,
  stdio: 'inherit',
});
