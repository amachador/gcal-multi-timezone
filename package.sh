#!/usr/bin/env bash
# Builds the Chrome Web Store upload: only the files the extension needs at runtime.
set -euo pipefail
cd "$(dirname "$0")"

VERSION=$(python3 -c "import json; print(json.load(open('manifest.json'))['version'])")
OUT="dist/world-time-for-google-calendar-${VERSION}.zip"
FILES=(manifest.json content.js content.css popup.html popup.css popup.js
       icons/icon16.png icons/icon32.png icons/icon48.png icons/icon128.png)

for f in "${FILES[@]}"; do [ -f "$f" ] || { echo "missing: $f" >&2; exit 1; }; done
mkdir -p dist
rm -f "$OUT"
zip -X -q "$OUT" "${FILES[@]}"
echo "Built $OUT ($(du -h "$OUT" | cut -f1))"
unzip -l "$OUT"
