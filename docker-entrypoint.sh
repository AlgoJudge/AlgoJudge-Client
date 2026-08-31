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

# One value, made safe to sit inside a JSON string inside a <script> element.
#
# Order matters: backslashes first, or the backslashes this adds are escaped a
# second time. `</` becomes `<\/` because the HTML parser ends the element at
# `</script` wherever it appears, string literal or not — `\/` is JSON's own
# escape for a slash and reads back identically. Control characters are dropped
# rather than escaped: JSON forbids them raw in a string and neither of these two
# values has any business holding one.
#
# BusyBox sh has no ${var//x/y} and no printf %q, so this is sed on a pipe.
json_string() {
    printf '%s' "$1" \
        | tr -d '\000-\037' \
        | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's|</|<\\/|g'
}

# **Both stay strings.** `ApiFactory` compares `useFakeApi` to "true" and
# `apiBase` calls .trim() on the URL, so emitting a bare boolean would switch the
# fake off silently and throw on the other.
CONFIG=$(printf '<script>window.__ALGOJUDGE__ = {"apiBaseUrl":"%s","useFakeApi":"%s"};</script>' \
    "$(json_string "$API_BASE_URL")" "$(json_string "$USE_FAKE_API")")

if grep -q '__ALGOJUDGE__' "$INDEX"; then
    # **Through the environment, not `awk -v`.** A `-v` assignment is processed
    # for escape sequences before the program ever runs, so it would decode the
    # backslashes added just above and hand back the string they were escaping.
    # ENVIRON is read verbatim.
    ALGOJUDGE_CONFIG="$CONFIG" awk '
        /__ALGOJUDGE__/ { print ENVIRON["ALGOJUDGE_CONFIG"]; next }
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
