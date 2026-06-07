#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

VERSION=$(python3 -c "import json; print(json.load(open('manifest.json'))['version'])")
echo "Building FAdblock v$VERSION"

mkdir -p dist

EXCLUDES=(
  --exclude "*.git*"
  --exclude "dist/*"
  --exclude "node_modules/*"
  --exclude "*.test.*"
  --exclude "test-*.js"
  --exclude "playwright.config.*"
  --exclude "build.sh"
  --exclude "manifest.firefox.json"
  --exclude "manifest.chrome.bak"
)

# ── Chrome build (service_worker) ───────────────────────────────
echo "  Chrome..."
zip -qr "dist/fadblock-chrome.zip" . "${EXCLUDES[@]}"
echo "  -> dist/fadblock-chrome.zip"

# ── Firefox manifest: scripts instead of service_worker ─────────
python3 - <<'PY'
import json
with open('manifest.json') as f:
    m = json.load(f)
m['background'] = {'scripts': ['background/service-worker.js']}
with open('manifest.firefox.json', 'w') as f:
    json.dump(m, f, indent=2)
PY

# ── Firefox build (swap manifest temporarily) ────────────────────
echo "  Firefox..."
cp manifest.json manifest.chrome.bak
cp manifest.firefox.json manifest.json
zip -qr "dist/fadblock-firefox-${VERSION}-unsigned.xpi" . "${EXCLUDES[@]}"
cp manifest.chrome.bak manifest.json
rm -f manifest.chrome.bak manifest.firefox.json
echo "  -> dist/fadblock-firefox-${VERSION}-unsigned.xpi"

echo "Done."
ls -lh "dist/fadblock-chrome.zip" "dist/fadblock-firefox-${VERSION}-unsigned.xpi"
