#!/bin/sh
# Deploy the built console to the router. Requires the build to exist and an
# SSH key/password setup that works for root@10.0.0.1 (override ROUTER_HOST).
set -eu

HOST="${ROUTER_HOST:-root@10.0.0.1}"
DEST="${ROUTER_WEB:-/www/modern}"
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"

[ -f "$ROOT/dist/index.html" ] || {
	echo "dist/index.html not found; run: npm run build" >&2
	exit 1
}

tar -czf - -C "$ROOT/dist" . | ssh "$HOST" "cat > /tmp/modern-payload.tgz"
ssh "$HOST" "cat > /tmp/modern-install.sh" < "$ROOT/deploy/install-remote.sh"
ssh "$HOST" "sh /tmp/modern-install.sh '$DEST'"

# The CGI helpers are replaced with a rename: writing them in place can race
# with a request that is already being served.
for file in modern-login modern-data modern-proxy modern-read modern-exec modern-uci\
            modern-pkg modern-sysupgrade modern-shellcrash; do
	ssh "$HOST" "cat > /www/cgi-bin/.$file.new && chmod +x /www/cgi-bin/.$file.new && mv /www/cgi-bin/.$file.new /www/cgi-bin/$file" < "$ROOT/deploy/$file"
done

# The probe helper lives outside /www so it cannot be requested directly; it
# needs nixio, which ships with LuCI (already a console dependency).
ssh "$HOST" "mkdir -p /usr/lib/modern && cat > /usr/lib/modern/.probe.lua.new && chmod +x /usr/lib/modern/.probe.lua.new && mv /usr/lib/modern/.probe.lua.new /usr/lib/modern/probe.lua" < "$ROOT/deploy/modern-probe.lua"

# argon: third-party theme, present in no official feed. Reinstalling luci-base
# recreates /www/luci-static/ and takes the theme static files with it, which
# silently drops the LuCI skin back to bootstrap. Check on every deploy and
# restore from the vault copy when it is gone.
ARGON_TAR="${ARGON_TAR:-$ROOT/../AX3000TOpenwrt/vault/backup/themes/luci-theme-argon-files.tar.gz}"
if ssh "$HOST" "test -f /www/luci-static/argon/css/cascade.css"; then
	echo "argon theme present"
elif [ -f "$ARGON_TAR" ]; then
	tar -czf - -C "$(dirname "$ARGON_TAR")" "$(basename "$ARGON_TAR")" | ssh "$HOST" "cat > /tmp/argon.tar.gz"
	ssh "$HOST" 'tar -xzf /tmp/argon.tar.gz -C / && chmod -R a+rX /www/luci-static/argon && uci set luci.main.mediaurlbase=/luci-static/argon && uci set luci.themes.Argon=/luci-static/argon && uci commit luci'
	echo "argon theme restored from vault"
else
	echo "WARN: argon theme missing and no vault copy at $ARGON_TAR" >&2
fi

# /www/index.html is owned by the luci-base package: reinstalling or upgrading
# luci-base (apk upgrade, or luci->ucode migrations) replaces it with the stock
# "LuCI - Lua Configuration Interface" redirect, and https://<ip>/ silently
# stops landing on /modern/. Rewrite it on every deploy so the entry point
# cannot drift. Source of truth: deploy/landing.html.
ssh "$HOST" "cat > /www/index.html && chmod a+r /www/index.html" < "$ROOT/deploy/landing.html"

echo "deployed to $HOST:$DEST (CGI helpers in /www/cgi-bin; entry /www/index.html)"
echo "open https://${HOST#*@}/modern/"
