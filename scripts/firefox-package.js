#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');

function prepareFirefoxPackage(rootDir = path.resolve(__dirname, '..')) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fadblock-firefox-'));
  const stageDir = path.join(tempDir, 'package');

  fs.mkdirSync(stageDir, { recursive: true });

  for (const entry of fs.readdirSync(rootDir)) {
    if (['.git', 'node_modules', 'dist'].includes(entry)) continue;
    fs.cpSync(path.join(rootDir, entry), path.join(stageDir, entry), { recursive: true });
  }

  const manifestPath = path.join(stageDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.background = {
    scripts: ['background/service-worker.js'],
  };
  manifest.content_scripts = [
    {
      matches: ['*://*.youtube.com/*'],
      js: ['content/youtube-firefox-bridge.js'],
      run_at: 'document_start',
      all_frames: false,
    },
    ...(Array.isArray(manifest.content_scripts) ? manifest.content_scripts : []),
  ];
  if (Array.isArray(manifest.content_scripts)) {
    manifest.content_scripts = manifest.content_scripts
      .filter((entry) => {
        if (!Array.isArray(entry.js)) return true;
        return !entry.js.includes('content/youtube-inject.js') &&
          !entry.js.includes('content/youtube-inject-v2.js');
      })
      .map((entry) => {
        const next = { ...entry };
        delete next.world;
        return next;
      });
  }
  if (manifest.browser_specific_settings?.gecko) {
    delete manifest.browser_specific_settings.gecko.data_collection_permissions;
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  try {
    fs.unlinkSync(path.join(stageDir, 'content', 'youtube-inject.js'));
  } catch {}
  try {
    fs.unlinkSync(path.join(stageDir, 'content', 'youtube-inject-v2.js'));
  } catch {}

  const localesDir = path.join(stageDir, '_locales');
  for (const lang of fs.readdirSync(localesDir)) {
    const msgPath = path.join(localesDir, lang, 'messages.json');
    if (!fs.existsSync(msgPath)) continue;
    const msgs = JSON.parse(fs.readFileSync(msgPath, 'utf8'));
    if (msgs.extDescription?.message) {
      msgs.extDescription.message = msgs.extDescription.message.replace(/Chrome/g, 'Firefox');
    }
    fs.writeFileSync(msgPath, JSON.stringify(msgs, null, 2) + '\n');
  }

  return stageDir;
}

if (require.main === module) {
  process.stdout.write(prepareFirefoxPackage() + '\n');
}

module.exports = { prepareFirefoxPackage };
