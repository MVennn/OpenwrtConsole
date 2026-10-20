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

echo "deployed to $HOST:$DEST (CGI helpers in /www/cgi-bin)"
echo "open https://${HOST#*@}/modern/"
