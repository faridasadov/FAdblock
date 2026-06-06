#!/usr/bin/env bash
# FAdblock install helper — copies extension to a permanent location.
# Chrome loads from ~/.fadblock/chrome/ so the downloaded zip/folder can be deleted.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
VERSION=$(node -p "require('$ROOT/manifest.json').version")

DEST_BASE="${HOME}/.fadblock"
CHROME_DEST="${DEST_BASE}/chrome"
FIREFOX_DEST="${DEST_BASE}/firefox"
FIREFOX_SRC="${DEST_BASE}/firefox-source"

mkdir -p "$CHROME_DEST" "$FIREFOX_DEST" "$FIREFOX_SRC"

# Chrome: stage extension into permanent folder
echo "→ Preparing Chrome folder..."
STAGE=$(mktemp -d)

for entry in "$ROOT"/*/; do
  name=$(basename "$entry")
  [[ "$name" =~ ^(\.git|node_modules|dist|scripts)$ ]] && continue
  cp -r "$entry" "$STAGE/"
done
for f in "$ROOT"/manifest.json "$ROOT"/README.md; do
  [ -f "$f" ] && cp "$f" "$STAGE/"
done

# Remove Firefox-only background.scripts field
node -e "
  const p = '$STAGE/manifest.json';
  const m = JSON.parse(require('fs').readFileSync(p,'utf8'));
  if (m.background) delete m.background.scripts;
  require('fs').writeFileSync(p, JSON.stringify(m,null,2)+'\n');
"

rm -rf "${CHROME_DEST:?}"/*
cp -r "$STAGE/." "$CHROME_DEST/"
rm -rf "$STAGE"
echo "  ✓ Chrome: $CHROME_DEST"

# Firefox: stage unpacked/source folder with background.scripts fallback
echo "→ Preparing Firefox folder..."
FF_STAGE=$(node "$ROOT/scripts/firefox-package.js")
rm -rf "${FIREFOX_SRC:?}"/*
cp -r "$FF_STAGE/." "$FIREFOX_SRC/"
rm -rf "$(dirname "$FF_STAGE")"
echo "  ✓ Firefox folder: $FIREFOX_SRC"

# Firefox: prefer exact-version XPI; otherwise expose current unsigned build honestly
EXACT_XPI="$ROOT/dist/fadblock-firefox-${VERSION}.xpi"
UNSIGNED_XPI="$ROOT/dist/fadblock-firefox-${VERSION}-unsigned.xpi"
BUILD_ZIP="$ROOT/dist/fadblock-${VERSION}.zip"
LATEST_XPI=$(ls "$ROOT"/dist/fadblock-*.xpi 2>/dev/null | sort -V | tail -1 || true)

if [[ -f "$EXACT_XPI" ]]; then
  cp "$EXACT_XPI" "$FIREFOX_DEST/$(basename "$EXACT_XPI")"
  echo "  ✓ Firefox XPI: $FIREFOX_DEST/$(basename "$EXACT_XPI")"
elif [[ -f "$UNSIGNED_XPI" ]]; then
  cp "$UNSIGNED_XPI" "$FIREFOX_DEST/$(basename "$UNSIGNED_XPI")"
  echo "  ✓ Firefox unsigned XPI: $FIREFOX_DEST/$(basename "$UNSIGNED_XPI")"
elif [[ -f "$BUILD_ZIP" ]]; then
  cp "$BUILD_ZIP" "$FIREFOX_DEST/fadblock-firefox-${VERSION}-unsigned.xpi"
  echo "  ✓ Firefox unsigned XPI: $FIREFOX_DEST/fadblock-firefox-${VERSION}-unsigned.xpi"
elif [[ -n "$LATEST_XPI" ]]; then
  cp "$LATEST_XPI" "$FIREFOX_DEST/$(basename "$LATEST_XPI")"
  echo "  ! Latest available Firefox XPI copied: $FIREFOX_DEST/$(basename "$LATEST_XPI")"
else
  echo "  ! Firefox XPI tapilmadi — evvelce 'npm run pack:firefox' isle"
fi

cat << MSG

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  FAdblock v${VERSION} qurasdirmaya hazirdir
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CHROME:
  1. chrome://extensions/ -> Developer mode: ON
  2. "Load unpacked" -> ${CHROME_DEST}
  Qovluq daimi oldugu ucun zip fayli silinebilir

FIREFOX:
  about:addons -> carkh isareti -> "Install Add-on From File"
  -> ${FIREFOX_DEST}/
  Qurasdirmadan sonra XPI fayli siline biler
  (Qeyd: unsigned XPI stable Firefox-da qebul olunmaya biler)

FIREFOX LOCAL TEST:
  about:debugging -> This Firefox -> Load Temporary Add-on
  -> ${FIREFOX_SRC}/manifest.json
  Bu qovluqda Firefox ucun background.scripts fallback hazirdir.

MSG
