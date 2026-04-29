#!/bin/sh
# Runs from /docker-entrypoint.d/ in the nginx-unprivileged runtime image.
# Substitutes runtime env vars (BUILD_NUMBER, GIT_COMMIT, BASE_URL, etc.)
# into the React app's index.html and 404.html before nginx starts.

set -e

DIST=/usr/local/src/sepal/modules/gui/dist

template() {
    envsubst < "$1" > "$2"
}

if [ ! -f "${DIST}/index-template.html" ]; then
    mv "${DIST}/index.html" "${DIST}/index-template.html"
fi
if [ ! -f "${DIST}/404-template.html" ]; then
    mv "${DIST}/404.html" "${DIST}/404-template.html"
fi

template "${DIST}/index-template.html" "${DIST}/index.html"
template "${DIST}/404-template.html" "${DIST}/404.html"
