#!/usr/bin/env bash
# usage: new_project.sh <dir>   -> scaffolds a reel project (brand.json, script.json, custom.js, fonts/)
# Files that already exist in <dir> are kept.
set -euo pipefail
D="${1:?usage: new_project.sh <dir>}"; R="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$D/fonts" "$D/assets"
for f in brand.json script.json custom.js; do [ -e "$D/$f" ] || cp "$R/templates/$f" "$D/$f"; done
for f in "$R"/assets/fonts/*; do [ -e "$D/fonts/$(basename "$f")" ] || cp "$f" "$D/fonts/"; done
echo "project ready: $D"
echo "next: edit $D/brand.json and $D/script.json, then"
echo "  $R/reel lint $D && $R/reel audio $D && $R/reel sheet $D"
