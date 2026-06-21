#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');

function prepareFirefoxPackage(rootDir = path.resolve(__dirname, '..')) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fadblock-firefox-'));
  const stageDir = path.join(tempDir, 'package');

  fs.mkdirSync(stageDir, { recursive: true });

  // Only copy extension files — exclude dev scripts, build tools, hooks, etc.
  const EXTENSION_ENTRIES = ['manifest.json', 'background', 'content', 'common', 'icons', 'options', 'popup', 'rules', '_locales'];
  for (const entry of EXTENSION_ENTRIES) {
    const src = path.join(rootDir, entry);
    if (fs.existsSync(src)) {
      fs.cpSync(src, path.join(stageDir, entry), { recursive: true });
    }
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
          !entry.js.includes('content/youtube-inject-v2.js') &&
          !entry.js.includes('content/youtube-filter.js');
      })
      .map((entry) => {
        const next = { ...entry };
        delete next.world;
        return next;
      });
  }
  if (!manifest.browser_specific_settings) manifest.browser_specific_settings = {};
  if (!manifest.browser_specific_settings.gecko) manifest.browser_specific_settings.gecko = {};
  // Required by AMO for new Firefox extensions
  manifest.browser_specific_settings.gecko.data_collection_permissions = {
    required: ['none'],
    optional: [],
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  try {
    fs.unlinkSync(path.join(stageDir, 'content', 'youtube-inject.js'));
  } catch {}
  try {
    fs.unlinkSync(path.join(stageDir, 'content', 'youtube-inject-v2.js'));
  } catch {}

  const rulesPath = path.join(stageDir, 'rules', 'rules.json');
  if (fs.existsSync(rulesPath)) {
    const rules = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
    let nextRuleId = Math.max(0, ...rules.map((rule) => Number(rule?.id) || 0)) + 1;
    const allowRules = [
      '^https://googleads\\.g\\.doubleclick\\.net/pagead/id(?:[/?#]|$)',
      '^https://static\\.doubleclick\\.net/instream/ad_status\\.js(?:[?#].*)?$',
      '^https://www\\.google\\.[^/]+/pagead/lvz(?:[/?#]|$)',
    ];
    for (const regexFilter of allowRules) {
      rules.unshift({
        id: nextRuleId++,
        priority: 10000,
        action: { type: 'allow' },
        condition: {
          regexFilter,
          initiatorDomains: ['youtube.com', 'www.youtube.com', 'm.youtube.com'],
          resourceTypes: ['xmlhttprequest', 'script', 'other'],
        },
      });
    }
    fs.writeFileSync(rulesPath, JSON.stringify(rules, null, 2) + '\n');
  }

  if (Array.isArray(manifest.declarative_net_request?.rule_resources)) {
    manifest.declarative_net_request.rule_resources = manifest.declarative_net_request.rule_resources
      .filter((resource) => resource?.id !== 'youtube_ads')
      .map((resource) => ({ ...resource }));
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  }

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
