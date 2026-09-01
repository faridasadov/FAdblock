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

# ── Firefox build (via firefox-package.js for correct manifest) ──
echo "  Firefox..."
FF_STAGE=$(node scripts/firefox-package.js)
(cd "$FF_STAGE" && zip -qr "$OLDPWD/dist/fadblock-firefox-${VERSION}-unsigned.xpi" . \
  --exclude "*.git*" \
  --exclude "dist/*" \
  --exclude "node_modules/*" \
  --exclude "*.test.*" \
  --exclude "test-*.js" \
  --exclude "playwright.config.*" \
  --exclude "build.sh" \
  --exclude "scripts/*")
rm -rf "$FF_STAGE"
echo "  -> dist/fadblock-firefox-${VERSION}-unsigned.xpi"

echo "Done."
ls -lh "dist/fadblock-chrome.zip" "dist/fadblock-firefox-${VERSION}-unsigned.xpi"
