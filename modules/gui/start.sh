#!/bin/sh
# Used only by the dev (build) stage of the gui Dockerfile.
# Production uses the nginx-unprivileged default CMD plus
# /docker-entrypoint.d/90-template-html.sh for env-var templating.

if [ ! -d "node_modules" ]; then
  echo 'Missing node_modules. Installing...'
  npm install
fi

if [ "${PREVIEW_MODE}" = "true" ]; then
  npm run build
  npm run preview
else
  npm start
fi
