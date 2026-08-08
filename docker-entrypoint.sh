#!/bin/sh
# Writes this installation's configuration into the bundle, then starts nginx.
#
# One image per installation, configured when the container starts (decided
# 2026-08-03). Vite inlines `import.meta.env` at build time, so anything given
# there is baked in and the image is bound to the URL it was built with — which
# is the opposite of one image serving every installation.
#
# Nothing here may hold a secret: it is written into a page every browser reads.
#
# The decision says `envsubst`, and this replaces the whole line instead. Using
# `envsubst` would mean writing `${API_BASE_URL}` inside `index.html`, and that
# file is also what `npm run dev` serves — where nothing substitutes it, so the
# application would read the literal string `${API_BASE_URL}` and take it for an
# origin. Replacing a line whose content is valid JavaScript either way avoids
# that, and is the same idea.
set -eu

INDEX=/usr/share/nginx/html/index.html

: "${API_BASE_URL:=}"
: "${USE_FAKE_API:=false}"

# Rewritten rather than appended, so restarting a container does not leave two
# of these and the second silently winning.
CONFIG=$(printf '<script>window.__ALGOJUDGE__ = {"apiBaseUrl":"%s","useFakeApi":"%s"};</script>' \
    "$API_BASE_URL" "$USE_FAKE_API")

if grep -q '__ALGOJUDGE__' "$INDEX"; then
    # `|` as the delimiter: a URL is full of slashes. The placeholder is one
    # line, written that way in index.html for exactly this reason.
    awk -v line="$CONFIG" '
        /__ALGOJUDGE__/ { print line; next }
        { print }
    ' "$INDEX" > "$INDEX.tmp" && mv "$INDEX.tmp" "$INDEX"
    echo "algojudge: configured with API_BASE_URL='${API_BASE_URL}' USE_FAKE_API='${USE_FAKE_API}'"
else
    # Better to say so than to serve a bundle that quietly falls back to the
    # fake because the placeholder was lost in a build change.
    echo "algojudge: WARNING — no configuration placeholder in ${INDEX}." >&2
    echo "algojudge: the application will use whatever was baked in at build time." >&2
fi

exec "$@"
