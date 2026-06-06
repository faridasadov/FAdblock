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

mkdir -p "$CHROME_DEST" "$FIREFOX_DEST"

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

# Firefox: copy latest signed XPI
XPI=$(ls "$ROOT"/dist/fadblock-*.xpi 2>/dev/null | sort -V | tail -1 || true)
if [[ -n "$XPI" ]]; then
  cp "$XPI" "$FIREFOX_DEST/fadblock-${VERSION}.xpi"
  echo "  ✓ Firefox XPI: $FIREFOX_DEST/fadblock-${VERSION}.xpi"
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
  -> ${FIREFOX_DEST}/fadblock-${VERSION}.xpi
  Qurasdirmadan sonra XPI fayli siline biler
  (Qeyd: about:debugging yox, about:addons istifade et)

MSG
