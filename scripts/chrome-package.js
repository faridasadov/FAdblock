#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');

function prepareChromePackage(rootDir = path.resolve(__dirname, '..')) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fadblock-chrome-'));
  const stageDir = path.join(tempDir, 'package');

  fs.mkdirSync(stageDir, { recursive: true });

  for (const entry of fs.readdirSync(rootDir)) {
    if (['.git', 'node_modules', 'dist'].includes(entry)) continue;
    fs.cpSync(path.join(rootDir, entry), path.join(stageDir, entry), { recursive: true });
  }

  const manifestPath = path.join(stageDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.background) {
    delete manifest.background.scripts;
  }
  if (Array.isArray(manifest.content_scripts)) {
    manifest.content_scripts = manifest.content_scripts.filter((entry) => {
      if (!Array.isArray(entry.js)) return true;
      return !entry.js.includes('content/youtube-firefox-bridge.js');
    });
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  try {
    fs.unlinkSync(path.join(stageDir, 'content', 'youtube-firefox-bridge.js'));
  } catch {}
  try {
    fs.unlinkSync(path.join(stageDir, 'content', 'youtube-inject.js'));
  } catch {}

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

  return stageDir;
}

if (require.main === module) {
  process.stdout.write(prepareChromePackage() + '\n');
}

module.exports = { prepareChromePackage };
