#!/bin/sh
# Runs on the router: unpacks a payload into the web root.
#
#   sh install-remote.sh [dest] [payload]
#
# The hashed chunks of the previous release are kept so tabs that were open
# before the update can still load their assets. `assets.manifest` records
# exactly which files belong to the current release, so the kept set stays
# bounded at "current + previous" instead of growing by 1.4 MB per deploy.
set -eu

DEST="${1:-/www/modern}"
PAYLOAD="${2:-/tmp/modern-payload.tgz}"
MANIFEST="$DEST/assets.manifest"

rm -rf "$DEST.new"
mkdir -p "$DEST.new"
tar -xzf "$PAYLOAD" -C "$DEST.new"

# Remember what this release ships before anything else is merged in.
if [ -d "$DEST.new/assets" ]; then
	(cd "$DEST.new/assets" && ls) > "$DEST.new/assets.manifest" 2>/dev/null || true
fi

# Keep the previous release (listed in the old manifest) next to the new one.
if [ -f "$MANIFEST" ]; then
	while read -r name; do
		[ -n "$name" ] || continue
		[ -e "$DEST/assets/$name" ] || continue
		[ -e "$DEST.new/assets/$name" ] && continue
		cp "$DEST/assets/$name" "$DEST.new/assets/$name" 2>/dev/null || true
	done < "$MANIFEST"
fi

# Swap the directory through a rename so the web root is never missing.
mv "$DEST" "$DEST.old" 2>/dev/null || true
mv "$DEST.new" "$DEST"
rm -rf "$DEST.old"

chown -R root:root "$DEST"
chmod -R a+rX "$DEST"
rm -f "$PAYLOAD"
